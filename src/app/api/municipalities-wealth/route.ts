import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';
import { 
  getHonmeiStar, 
  getCurrentEnvironmentalFrequencies, 
  generateBoard, 
  calculateVectorCollision, 
  getPersonalVoidZodiac,
  Direction,
  AstroEngine
} from '@/utils/ephemerisEngine';

export const dynamic = 'force-dynamic';

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (val: number) => val * Math.PI / 180;
  const toDeg = (val: number) => val * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

function getDirectionFromBearing(brng: number): Direction {
  const b = (brng % 360 + 360) % 360;
  if (b >= 345 || b < 15) return 'N';
  if (b >= 15 && b < 75) return 'NE';
  if (b >= 75 && b < 105) return 'E';
  if (b >= 105 && b < 165) return 'SE';
  if (b >= 165 && b < 195) return 'S';
  if (b >= 195 && b < 255) return 'SW';
  if (b >= 255 && b < 285) return 'W';
  return 'NW';
}

// 角度の差を計算する関数（円弧上の最短距離）
function getAngleDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const sort = searchParams.get('sort') || 'desc';
  
  let baseLat = parseFloat(searchParams.get('baseLat') || 'NaN');
  let baseLon = parseFloat(searchParams.get('baseLon') || 'NaN');
  let birthLat = parseFloat(searchParams.get('birthLat') || 'NaN');
  let birthLon = parseFloat(searchParams.get('birthLon') || 'NaN');
  const targetDateStr = searchParams.get('targetDate');
  let birthDateStr = searchParams.get('birthDate');
  const engineType = searchParams.get('engineType') || 'physical'; // 'physical' or 'classical'
  const layerMode = searchParams.get('layerMode') || 'final'; // 'final', 'year', 'month', 'day'
  const useTrueNorth = searchParams.get('useTrueNorth') === 'true';

  // Fallback to local config if parameters are missing
  try {
    const configPath = path.join(process.cwd(), 'local_tactical_config.json');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    if (isNaN(baseLat) && config.base_lat !== undefined) baseLat = config.base_lat;
    if (isNaN(baseLon) && config.base_lon !== undefined) baseLon = config.base_lon;
    if (isNaN(birthLat) && config.birth_lat !== undefined) birthLat = config.birth_lat;
    if (isNaN(birthLon) && config.birth_lon !== undefined) birthLon = config.birth_lon;
    if (!birthDateStr && config.birth_date) birthDateStr = config.birth_date;
  } catch (e) {
    // Ignore config read error
  }

  // Default to Tokyo if still missing
  if (isNaN(baseLat)) baseLat = 35.6895;
  if (isNaN(baseLon)) baseLon = 139.6917;
  
  // 生年月日が無い場合は安全のためダミー値をセット
  if (!birthDateStr) birthDateStr = '2000-01-01T12:00'; 
  
  // datetime-localが秒を含まない場合があるため、有効なDate形式にする
  const bDate = new Date(birthDateStr);
  if (isNaN(bDate.getTime())) {
    return NextResponse.json({ success: false, error: 'Invalid birthDate' }, { status: 400 });
  }

  const targetDate = targetDateStr ? new Date(targetDateStr) : new Date();

  // AstroCartoGraphy: ネイタルの木星・金星の黄経を取得
  const natalJupiter = AstroEngine.getJupiterLongitude(bDate);
  const natalVenus = AstroEngine.getVenusLongitude(bDate);

  // パフォーマンス最適化：2000件のループ内で天文学計算（JulianDay等）を繰り返さないよう、GSTをキャッシュ
  let birthGst: number | undefined;
  if (!isNaN(birthLat) && !isNaN(birthLon)) {
     birthGst = AstroEngine.getGreenwichSiderealTime(bDate);
  }

  let activeVectors: Partial<Record<Direction, string>> | null = null;
  
  const honmeiStar = getHonmeiStar(bDate);
  const env = getCurrentEnvironmentalFrequencies(targetDate);
  const voidZodiacs = getPersonalVoidZodiac(bDate);
  
  const useClassical = engineType === 'classical';
  
  const yB = generateBoard(useClassical ? env.classicalYearStar : env.yearStar);
  const mB = generateBoard(useClassical ? env.classicalMonthStar : env.monthStar);
  const dB = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);
  
  const vectorData = calculateVectorCollision(
    useClassical ? honmeiStar.classical : honmeiStar.physical,
    yB, mB, dB,
    voidZodiacs,
    env.raw.lunarNode,
    'MIGRATION' // Action intent for relocation
  );
  
  if (layerMode === 'year') activeVectors = vectorData.yearLayer;
  else if (layerMode === 'month') activeVectors = vectorData.monthLayer;
  else if (layerMode === 'day') activeVectors = vectorData.dayLayer;
  else activeVectors = vectorData.finalVectors;

  try {
    const municipalities = await prisma.municipalityWealth.findMany({
      take: limit,
    });

    const scoredData = municipalities.map(m => {
      let astrologyScore = 50; // Neutral default
      let astrologyStatus = 'UNKNOWN';
      let direction: Direction | null = null;
      let trueBearing: number | null = null;
      let magneticBearing: number | null = null;
      let magneticDirection: Direction | null = null;
      const astroFlags: string[] = [];

      if (m.lat && m.lon) {
        trueBearing = getBearing(baseLat, baseLon, m.lat, m.lon);
        direction = getDirectionFromBearing(trueBearing); // True direction (地図上の方位)
        
        // 偏角の補正 (-8.2度)
        const declination = -8.2;
        magneticBearing = (trueBearing - declination + 360) % 360;
        magneticDirection = getDirectionFromBearing(magneticBearing);

        // 1. 九星気学による方位スコア計算
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
          
          // 境界線アラート: 真北のセクターと磁北のセクターが異なる場合 (e.g., 地図では北東だが、磁北では北など)
          if (!useTrueNorth && direction !== magneticDirection && (astrologyScore < 80)) {
             astroFlags.push("DECLINATION_WARNING");
          }
        }

        // 2. AstroCartoGraphy（リロケーション占星術）ボーナス
        if (!isNaN(birthLat) && !isNaN(birthLon)) {
          // ターゲット市区町村における出生時間のASCとMC
          const relocatedASC = AstroEngine.getAscendant(bDate, m.lat, m.lon, birthGst);
          const relocatedMC = AstroEngine.getMidheaven(bDate, m.lon, birthGst);
          
          // オーブ（許容度）はタイトに5度とする
          const ORB = 5;

          // 木星とASC/MCのコンジャンクション（強力な財運・成功ライン）
          if (getAngleDiff(relocatedASC, natalJupiter) <= ORB) {
            astrologyScore += 30;
            astroFlags.push("JUPITER_ASC");
          } else if (getAngleDiff(relocatedMC, natalJupiter) <= ORB) {
            astrologyScore += 30;
            astroFlags.push("JUPITER_MC");
          }

          // 金星とASC/MCのコンジャンクション（豊かさ・愛情ライン）
          if (getAngleDiff(relocatedASC, natalVenus) <= ORB) {
            astrologyScore += 15;
            astroFlags.push("VENUS_ASC");
          } else if (getAngleDiff(relocatedMC, natalVenus) <= ORB) {
            astrologyScore += 15;
            astroFlags.push("VENUS_MC");
          }
          
          // スコアの上限クリッピング（最大100だが、ボーナスで突き抜ける場合は120まで許容するなどしても面白い。ここでは最大100に制限）
          if (astrologyScore > 100) astrologyScore = 100;
        }
      }

      let cospaIndex: number | null = null;
      if (m.landPricePerSqm && m.landPricePerSqm > 0) {
        cospaIndex = m.incomePerCapita / m.landPricePerSqm;
      }

      let distanceKm: number | null = null;
      if (m.lat && m.lon && !isNaN(baseLat) && !isNaN(baseLon)) {
        distanceKm = getDistance(baseLat, baseLon, m.lat, m.lon);
      }

      return {
        ...m,
        astrologyScore,
        astrologyStatus: astroFlags.length > 0 ? `${astrologyStatus} + ${astroFlags.join(',')}` : astrologyStatus,
        direction,
        magneticDirection,
        trueBearing,
        magneticBearing,
        cospaIndex,
        distanceKm
      };
    });

    // ここで動的にソート（ボーナス加算後のスコア考慮）
    scoredData.sort((a, b) => {
      if (sort === 'asc') return a.incomePerCapita - b.incomePerCapita;
      return b.incomePerCapita - a.incomePerCapita;
    });

    return NextResponse.json({
      success: true,
      count: scoredData.length,
      data: scoredData,
      metadata: {
        baseLat,
        baseLon,
        birthLat,
        birthLon,
        targetDate,
        birthDate: bDate.toISOString(),
        engineType,
        layerMode,
        vectors: activeVectors
      }
    });
  } catch (error) {
    console.error('Error fetching municipalities wealth data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch data', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
