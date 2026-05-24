import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSystemEnvironment, getHonmeiStar, generateBoard, calculateVectorCollision } from '@/utils/bioModelingEngine';
import { getDistance, getBearing, getDirectionFromBearing, Direction } from '@/utils/geomagnetism';
import AstroEngine from '@/utils/ephemerisEngine';
import * as solarTime from '@/utils/solarTime';

// 偏差値計算用のヘルパー
function calculateZScore(value: number, mean: number, stdDev: number) {
  if (stdDev === 0) return 50;
  return ((value - mean) / stdDev) * 10 + 50;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // クエリパラメータのパース
  const baseLat = parseFloat(searchParams.get('baseLat') || '35.6895'); // デフォルトは東京
  const baseLon = parseFloat(searchParams.get('baseLon') || '139.6917');
  const birthLat = parseFloat(searchParams.get('birthLat') || 'NaN');
  const birthLon = parseFloat(searchParams.get('birthLon') || 'NaN');
  const birthDateStr = searchParams.get('birthDate') || '';
  const useClassicalStr = searchParams.get('useClassical');
  const layerMode = searchParams.get('layerMode') || 'year';
  const useTrueNorthStr = searchParams.get('useTrueNorth');
  const limit = parseInt(searchParams.get('limit') || '500');

  const useClassical = useClassicalStr === 'true';
  const useTrueNorth = useTrueNorthStr === 'true';

  // 1. 環境・運気エンジンの初期化
  const env = getSystemEnvironment(new Date());
  
  let bDate = new Date();
  if (birthDateStr) {
    bDate = new Date(birthDateStr);
  }

  // アストロデータの計算準備
  let birthGst = 0;
  let sunLon = 0;
  let venusLon = 0;
  let jupiterLon = 0;
  
  if (!isNaN(birthLat) && !isNaN(birthLon)) {
    birthGst = AstroEngine.getGreenwichSiderealTime(bDate);
    const birthJd = AstroEngine.getJulianDay(bDate);
    sunLon = AstroEngine.getSolarLongitude(bDate);
    const planets = AstroEngine.calculatePlanets(bDate);
    venusLon = planets.find(p => p.name === 'Venus')?.lon || 0;
    jupiterLon = planets.find(p => p.name === 'Jupiter')?.lon || 0;
  }

  // 九星気学のベクトル計算
  const honmeiStar = getHonmeiStar(bDate);
  const voidZodiacs = solarTime.getTenchusatsu(bDate).zodiacs;
  
  const yB = generateBoard(useClassical ? env.classicalYearStar : env.yearStar);
  const mB = generateBoard(useClassical ? env.classicalMonthStar : env.monthStar);
  const dB = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);
  
  const vectorData = calculateVectorCollision(
    useClassical ? honmeiStar.classical : honmeiStar.physical,
    yB, mB, dB,
    voidZodiacs,
    env.raw.lunarNode,
    'MIGRATION'
  );
  
  let activeVectors: Record<Direction, string>;
  if (layerMode === 'year') activeVectors = vectorData.yearLayer;
  else if (layerMode === 'month') activeVectors = vectorData.monthLayer;
  else if (layerMode === 'day') activeVectors = vectorData.dayLayer;
  else activeVectors = vectorData.finalVectors;

  try {
    // 2. DBから物件データを取得 (緯度経度があるもの)
    const properties = await prisma.rental_properties.findMany({
      where: {
        lat: { not: null },
        lon: { not: null },
        rent: { not: null },
        size_sqm: { not: null }
      },
      take: limit,
      orderBy: { created_at: 'desc' }
    });

    if (properties.length === 0) {
      return NextResponse.json({ properties: [], stats: {} });
    }

    // --- アービトラージ（割安度）のベース計算 ---
    // 単純化のため、「面積あたりの家賃（平米単価）」の市場平均を計算する
    const sqmRents = properties.map(p => {
      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      return totalRent / Number(p.size_sqm);
    });
    
    const meanSqmRent = sqmRents.reduce((a, b) => a + b, 0) / sqmRents.length;
    const stdDevSqmRent = Math.sqrt(sqmRents.reduce((a, b) => a + Math.pow(b - meanSqmRent, 2), 0) / sqmRents.length);

    // 3. 物件ごとにスコアリング
    const scoredProperties = properties.map(p => {
      // 運勢スコア
      let astrologyScore = 50;
      let astrologyStatus = 'UNKNOWN';
      let direction: Direction | null = null;
      let trueBearing: number | null = null;
      let distanceKm: number | null = null;
      const astroFlags: string[] = [];

      if (p.lat && p.lon) {
        distanceKm = getDistance(baseLat, baseLon, p.lat, p.lon);
        trueBearing = getBearing(baseLat, baseLon, p.lat, p.lon);
        direction = getDirectionFromBearing(trueBearing);
        
        // 偏角の補正 (-8.2度)
        const declination = -8.2;
        const magneticBearing = (trueBearing - declination + 360) % 360;
        const magneticDirection = getDirectionFromBearing(magneticBearing);

        const targetDirection = useTrueNorth ? direction : magneticDirection;
        if (activeVectors && targetDirection) {
          astrologyStatus = activeVectors[targetDirection] || 'UNKNOWN';
          switch (astrologyStatus) {
            case 'OPTIMAL': astrologyScore = 100; break;
            case 'SAFE': astrologyScore = 80; break;
            case 'NOISE_VOID': 
            case 'NOISE_NODE': astrologyScore = 40; break;
            case 'NOISE_HONMEI':
            case 'NOISE_TEKI': astrologyScore = 20; break;
            case 'NOISE_GOU':
            case 'NOISE_ANKEN': astrologyScore = 10; break;
            default: astrologyScore = 50; break;
          }
        }

        // リロケーション占星術（AstroCartoGraphy）
        if (!isNaN(birthLat) && !isNaN(birthLon)) {
          const relocatedASC = AstroEngine.getAscendant(bDate, p.lat, p.lon, birthGst);
          const relocatedMC = AstroEngine.getMidheaven(p.lat, p.lon, birthGst);
          
          const isSunLine = Math.abs(relocatedMC - sunLon) < 5 || Math.abs(relocatedASC - sunLon) < 5;
          const isVenusLine = Math.abs(relocatedMC - venusLon) < 5 || Math.abs(relocatedASC - venusLon) < 5;
          const isJupiterLine = Math.abs(relocatedMC - jupiterLon) < 5 || Math.abs(relocatedASC - jupiterLon) < 5;
          
          if (isSunLine) astroFlags.push("SUN_LINE");
          if (isVenusLine) {
            astroFlags.push("VENUS_LINE");
            if (astrologyScore >= 50) astrologyScore += 15;
          }
          if (isJupiterLine) {
            astroFlags.push("JUPITER_LINE");
            if (astrologyScore >= 50) astrologyScore += 20;
          }
        }
      }

      // --- アービトラージスコア計算 ---
      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      const propSqmRent = totalRent / Number(p.size_sqm);
      
      // 平米単価の偏差値。低い（安い）ほどアービトラージスコアを高くしたいので反転
      const rentZScore = calculateZScore(propSqmRent, meanSqmRent, stdDevSqmRent);
      const yieldScore = 100 - rentZScore + 50; // 安いと高スコア
      
      // 総合おすすめ度 (Arbitrage Score) = (運勢スコア * 0.4) + (利回りスコア * 0.6)
      const arbitrageScore = (astrologyScore * 0.4) + (yieldScore * 0.6);

      return {
        ...p,
        totalRent,
        propSqmRent,
        distanceKm,
        direction,
        astrologyStatus,
        astrologyScore,
        astroFlags,
        yieldScore,
        arbitrageScore
      };
    });

    // スコア順にソート
    scoredProperties.sort((a, b) => b.arbitrageScore - a.arbitrageScore);

    return NextResponse.json({ 
      properties: scoredProperties,
      metadata: {
        baseLat, baseLon, layerMode, useClassical, useTrueNorth,
        meanSqmRent,
        stdDevSqmRent,
        totalAnalyzed: properties.length
      }
    });

  } catch (error: any) {
    console.error("Failed to analyze arbitrage rentals:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
