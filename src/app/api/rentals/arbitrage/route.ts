import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { 
  getHonmeiStar, 
  getCurrentEnvironmentalFrequencies as getSystemEnvironment, 
  generateBoard, 
  calculateVectorCollision,
  getPersonalVoidZodiac,
  Direction,
  AstroEngine,
  getUpcomingDoyouPeriod,
  calculateLunarPhaseCondition,
  filterCollisionByMode,
  getCurrentZodiac
} from '@/utils/ephemerisEngine';
import { getGeomagneticData } from '@/utils/geomagnetism';
import { getRokuyo, getLuckyDays, isJapaneseHoliday } from '@/utils/lunar';
import { Solar } from 'lunar-javascript';


// 物件名から不要な階数や築年数表現を除去するクレンジング関数
function cleanPropertyName(name: string): string {
  if (!name) return '';
  return name
    .replace(/[\s　]*(?:地下)?\d+階[\s　]+(?:築\d+年(?:[0-9]+ヶ月)?|新築)の賃貸物件$/, '')
    .replace(/[\s　]*(?:築\d+年(?:[0-9]+ヶ月)?|新築)の賃貸物件$/, '')
    .trim();
}

function isNoiseStatus(status: string): boolean {
  if (!status) return false;
  return status.startsWith('NOISE') && status !== 'NOISE_VOID' && status !== 'NOISE_NODE';
}

function blendStatus(physical: string, classical: string): string {
  const isPhysNoise = isNoiseStatus(physical);
  const isClassNoise = isNoiseStatus(classical);
  const isPhysOptimal = physical === 'OPTIMAL' || physical === 'OPTIMAL_REGULAR';
  const isClassOptimal = classical === 'OPTIMAL' || classical === 'OPTIMAL_REGULAR';

  // 1. NOISE (Physical) + OPTIMAL (Classical) ➔ WARNING
  if (isPhysNoise && isClassOptimal) {
    return 'WARNING';
  }
  // 2. SAFE (Physical) + OPTIMAL (Classical) ➔ OPTIMAL
  if (physical === 'SAFE' && isClassOptimal) {
    return classical;
  }
  // 3. NOISE (either) + SAFE (either) ➔ NOISE
  if (isPhysNoise && classical === 'SAFE') {
    return physical;
  }
  if (isClassNoise && physical === 'SAFE') {
    return classical;
  }
  // 4. Both are noise: return the physical noise
  if (isPhysNoise && isClassNoise) {
    return physical;
  }
  return physical === 'SAFE' ? classical : physical;
}

function calculateBaziCompatibility(bDate: Date, targetDate: Date): number {
  try {
    const birthSolar = Solar.fromDate(bDate);
    const birthEightChar = birthSolar.getLunar().getEightChar();
    const userDayGan = birthEightChar.getDayGan();
    
    const targetSolar = Solar.fromDate(targetDate);
    const targetEightChar = targetSolar.getLunar().getEightChar();
    const targetDayGan = targetEightChar.getDayGan();

    const GAN_WUXING: Record<string, string> = {
      '甲': '木', '乙': '木',
      '丙': '火', '丁': '火',
      '戊': '土', '己': '土',
      '庚': '金', '辛': '金',
      '壬': '水', '癸': '水'
    };

    const userWuxing = GAN_WUXING[userDayGan];
    const targetWuxing = GAN_WUXING[targetDayGan];

    if (!userWuxing || !targetWuxing) return 50;

    const shengCycle: Record<string, string> = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };
    const keCycle: Record<string, string> = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };

    if (userWuxing === targetWuxing) {
      return 60;
    } else if (shengCycle[userWuxing] === targetWuxing) {
      return 70;
    } else if (shengCycle[targetWuxing] === userWuxing) {
      return 90;
    } else if (keCycle[userWuxing] === targetWuxing) {
      return 65;
    } else if (keCycle[targetWuxing] === userWuxing) {
      return 30;
    }
    return 50;
  } catch (e) {
    return 50;
  }
}

// 偏差値計算用のヘルパー


function calculateZScore(value: number, mean: number, stdDev: number) {
  if (stdDev === 0) return 50;
  return ((value - mean) / stdDev) * 10 + 50;
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const l1 = lat1 * (Math.PI / 180);
  const l2 = lat2 * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
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

function getDirectionFromBearing(bearing: number, nodeMapping: 'traditional' | 'physical' = 'traditional'): Direction {
  const b = (bearing % 360 + 360) % 360;
  if (nodeMapping === 'physical') {
    const index = Math.floor(((b + 22.5) % 360) / 45);
    const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[index];
  } else {
    if (b >= 345 || b < 15) return 'N';
    if (b >= 15 && b < 75) return 'NE';
    if (b >= 75 && b < 105) return 'E';
    if (b >= 105 && b < 165) return 'SE';
    if (b >= 165 && b < 195) return 'S';
    if (b >= 195 && b < 255) return 'SW';
    if (b >= 255 && b < 285) return 'W';
    return 'NW';
  }
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
  
  const useClassical = useClassicalStr === 'true';
  const nodeMapping = (searchParams.get('nodeMapping') || (useClassical ? 'traditional' : 'physical')) as 'traditional' | 'physical';
  const limit = parseInt(searchParams.get('limit') || '500');
  const lunarPhaseModifier = searchParams.get('lunarPhaseModifier') !== 'false';
  const directionFilterMode = (searchParams.get('directionFilterMode') || 'composite') as 'composite' | 'personal_kigaku' | 'personal_bazi' | 'environmental';
  const actionIntent = (searchParams.get('actionIntent') || 'MIGRATION') as any;
  const useTrueNorth = useTrueNorthStr === 'true';
  const radiusKmStr = searchParams.get('radiusKm') || '10';
  const radiusKm = radiusKmStr === 'all' ? 0 : parseFloat(radiusKmStr);
  const prefecture = searchParams.get('prefecture') || 'all';

  const minLat = parseFloat(searchParams.get('minLat') || 'NaN');
  const maxLat = parseFloat(searchParams.get('maxLat') || 'NaN');
  const minLon = parseFloat(searchParams.get('minLon') || 'NaN');
  const maxLon = parseFloat(searchParams.get('maxLon') || 'NaN');

  const targetDateStr = searchParams.get('targetDate') || '';
  let targetDate = new Date();
  if (targetDateStr) {
    const parsedDate = new Date(targetDateStr);
    if (!isNaN(parsedDate.getTime())) {
      targetDate = parsedDate;
    }
  }

  // 月相コンディションの計算
  let lunarPhaseScore = 0;
  let lunarPhaseAdvice = '';
  let lunarPhaseLabel = '';
  if (lunarPhaseModifier) {
    const lpCond = calculateLunarPhaseCondition(targetDate, 'MIGRATION');
    lunarPhaseScore = lpCond.scoreModifier;
    lunarPhaseAdvice = lpCond.adviceText;
    lunarPhaseLabel = lpCond.phaseLabel;
  }

  // 1. 環境・運気エンジンの初期化
  const env = getSystemEnvironment(targetDate);
  
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
    sunLon = AstroEngine.getSolarLongitude(bDate);
    venusLon = AstroEngine.getVenusLongitude(bDate);
    jupiterLon = AstroEngine.getJupiterLongitude(bDate);
  }

  // 九星気学のベクトル計算
  const honmeiStar = getHonmeiStar(bDate);
  const voidZodiacs = getPersonalVoidZodiac(bDate);
  
  const yB = generateBoard(useClassical ? env.classicalYearStar : env.yearStar);
  const mB = generateBoard(useClassical ? env.classicalMonthStar : env.monthStar);
  const dB = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);
  
  const baseCollision = calculateVectorCollision(
    useClassical ? honmeiStar.classical : honmeiStar.physical,
    yB, mB, dB,
    voidZodiacs,
    env.raw.lunarNode,
    actionIntent,
    targetDate,
    baseLon,
    undefined,
    nodeMapping
  );

  const vectorData = filterCollisionByMode(
    baseCollision,
    useClassical ? honmeiStar.classical : honmeiStar.physical,
    null,
    voidZodiacs,
    directionFilterMode,
    yB, mB, dB
  );
  
  let activeVectors: Partial<Record<Direction, string>>;
  if (layerMode === 'year') activeVectors = vectorData.yearLayer;
  else if (layerMode === 'month') activeVectors = vectorData.monthLayer;
  else if (layerMode === 'day') activeVectors = vectorData.dayLayer;
  else activeVectors = vectorData.finalVectors;

  const isDoyouHazard = vectorData.doyouState?.isDoyouHazard || false;

  // 動的偏角の取得
  let declination = -8.2;
  try {
    const geoData = await getGeomagneticData(baseLat, baseLon, targetDate.getTime());
    if (geoData && typeof geoData.declination === 'number') {
      declination = geoData.declination;
    }
  } catch (err) {
    console.error('Error fetching dynamic declination in rentals arbitrage API:', err);
  }

  try {
    // 2. DBから物件データを取得 (緯度経度があるもの)
    const whereClause: any = {
      lat: { not: null },
      lon: { not: null },
      rent: { not: null },
      size_sqm: { not: null }
    };

    if (radiusKm > 0 && !isNaN(baseLat) && !isNaN(baseLon)) {
      const deltaLat = radiusKm / 111.0;
      const deltaLon = radiusKm / (111.0 * Math.cos(baseLat * Math.PI / 180.0));
      whereClause.lat = {
        gte: baseLat - deltaLat,
        lte: baseLat + deltaLat
      };
      whereClause.lon = {
        gte: baseLon - deltaLon,
        lte: baseLon + deltaLon
      };
    } else if (!isNaN(minLat) && !isNaN(maxLat) && !isNaN(minLon) && !isNaN(maxLon)) {
      whereClause.lat = {
        gte: minLat,
        lte: maxLat
      };
      whereClause.lon = {
        gte: minLon,
        lte: maxLon
      };
    }

    if (prefecture && prefecture !== 'all') {
      whereClause.address = {
        startsWith: prefecture
      };
    }

    const [properties, totalCount] = await Promise.all([
      prisma.rental_properties.findMany({
        where: whereClause,
        take: limit,
        orderBy: { id: 'desc' }
      }),
      prisma.rental_properties.count({
        where: whereClause
      })
    ]);

    if (properties.length === 0) {
      return NextResponse.json({ properties: [], stats: {}, metadata: { totalCount: 0, limit } });
    }

    const sqmRents = properties.map(p => {
      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      return totalRent / Number(p.size_sqm);
    });
    
    const meanSqmRent = sqmRents.reduce((a, b) => a + b, 0) / sqmRents.length;
    const stdDevSqmRent = Math.sqrt(sqmRents.reduce((a, b) => a + Math.pow(b - meanSqmRent, 2), 0) / sqmRents.length);

    // 前後7日間の日付リストを作成し、それぞれのアストロ状態を事前計算
    const dateList: Date[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(targetDate);
      d.setDate(targetDate.getDate() + i);
      dateList.push(d);
    }

    const dailyAstroStates = dateList.map(d => {
      const env_d = getSystemEnvironment(d);
      
      let activeVectors_d: Partial<Record<Direction, string>>;
      let tendoDir_d: Direction | undefined;
      let isDoyouHazard_d = false;

      if (useClassical) {
        // Compute Classical Board
        const yB_class = generateBoard(env_d.classicalYearStar);
        const mB_class = generateBoard(env_d.classicalMonthStar);
        const dB_class = generateBoard(env_d.classicalDayStar);
        
        const baseCollision_class = calculateVectorCollision(
          honmeiStar.classical,
          yB_class, mB_class, dB_class,
          voidZodiacs,
          env_d.raw.lunarNode,
          actionIntent,
          d,
          baseLon,
          undefined,
          nodeMapping
        );

        const vectorData_class = filterCollisionByMode(
          baseCollision_class,
          honmeiStar.classical,
          null,
          voidZodiacs,
          directionFilterMode,
          yB_class, mB_class, dB_class
        );

        let activeClass: Partial<Record<Direction, string>>;
        if (layerMode === 'year') activeClass = vectorData_class.yearLayer;
        else if (layerMode === 'month') activeClass = vectorData_class.monthLayer;
        else if (layerMode === 'day') activeClass = vectorData_class.dayLayer;
        else activeClass = vectorData_class.finalVectors;

        tendoDir_d = vectorData_class.tendoDirection;
        isDoyouHazard_d = vectorData_class.doyouState?.isDoyouHazard || false;

        // Compute Physical Board for blending
        const yB_phys = generateBoard(env_d.yearStar);
        const mB_phys = generateBoard(env_d.monthStar);
        const dB_phys = generateBoard(env_d.dayStar);

        const baseCollision_phys = calculateVectorCollision(
          honmeiStar.physical,
          yB_phys, mB_phys, dB_phys,
          voidZodiacs,
          env_d.raw.lunarNode,
          actionIntent,
          d,
          baseLon,
          undefined,
          nodeMapping
        );

        const vectorData_phys = filterCollisionByMode(
          baseCollision_phys,
          honmeiStar.physical,
          null,
          voidZodiacs,
          directionFilterMode,
          yB_phys, mB_phys, dB_phys
        );

        let activePhys: Partial<Record<Direction, string>>;
        if (layerMode === 'year') activePhys = vectorData_phys.yearLayer;
        else if (layerMode === 'month') activePhys = vectorData_phys.monthLayer;
        else if (layerMode === 'day') activePhys = vectorData_phys.dayLayer;
        else activePhys = vectorData_phys.finalVectors;

        // Blend physical and classical
        const blended: Partial<Record<Direction, string>> = {};
        const directions: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        for (const dir of directions) {
          blended[dir] = blendStatus(activePhys[dir] || 'SAFE', activeClass[dir] || 'SAFE');
        }
        activeVectors_d = blended;
      } else {
        // Pure Physical Board
        const yB_phys = generateBoard(env_d.yearStar);
        const mB_phys = generateBoard(env_d.monthStar);
        const dB_phys = generateBoard(env_d.dayStar);

        const baseCollision_phys = calculateVectorCollision(
          honmeiStar.physical,
          yB_phys, mB_phys, dB_phys,
          voidZodiacs,
          env_d.raw.lunarNode,
          actionIntent,
          d,
          baseLon,
          undefined,
          nodeMapping
        );

        const vectorData_phys = filterCollisionByMode(
          baseCollision_phys,
          honmeiStar.physical,
          null,
          voidZodiacs,
          directionFilterMode,
          yB_phys, mB_phys, dB_phys
        );

        if (layerMode === 'year') activeVectors_d = vectorData_phys.yearLayer;
        else if (layerMode === 'month') activeVectors_d = vectorData_phys.monthLayer;
        else if (layerMode === 'day') activeVectors_d = vectorData_phys.dayLayer;
        else activeVectors_d = vectorData_phys.finalVectors;

        tendoDir_d = vectorData_phys.tendoDirection;
        isDoyouHazard_d = vectorData_phys.doyouState?.isDoyouHazard || false;
      }

      let lunarPhaseScore_d = 0;
      if (lunarPhaseModifier) {
        const lpCond_d = calculateLunarPhaseCondition(d, 'MIGRATION');
        lunarPhaseScore_d = lpCond_d.scoreModifier;
      }

      const rokuyo_d = getRokuyo(d);
      const luckyDays_d = getLuckyDays(d);
      const holiday_d = isJapaneseHoliday(d);

      const dateStr = d.toISOString().split('T')[0];
      const zodiacs_d = getCurrentZodiac(new Date(dateStr), baseLon);
      const isVoidTime_d = voidZodiacs.includes(zodiacs_d.yearZodiac) ||
                           voidZodiacs.includes(zodiacs_d.monthZodiac) ||
                           voidZodiacs.includes(zodiacs_d.dayZodiac);
      const baziScore_d = !isNaN(birthLat) && !isNaN(birthLon) ? calculateBaziCompatibility(bDate, new Date(dateStr)) : 50;

      return {
        date: d,
        dateStr,
        activeVectors: activeVectors_d,
        isDoyouHazard: isDoyouHazard_d,
        lunarPhaseScore: lunarPhaseScore_d,
        tendoDir: tendoDir_d,
        rokuyo: rokuyo_d,
        luckyDays: luckyDays_d,
        holiday: holiday_d,
        weekday: d.getDay(),
        isVoidTime: isVoidTime_d,
        baziScore: baziScore_d
      };
    });

    // 3. 物件ごとにスコアリング
    const scoredProperties = properties.map(p => {
      let direction: Direction | null = null;
      let magneticDirection: Direction | null = null;
      let trueBearing: number | null = null;
      let distanceKm: number | null = null;

      let relocatedASC = 0;
      let relocatedMC = 0;
      if (p.lat && p.lon && !isNaN(birthLat) && !isNaN(birthLon)) {
        relocatedASC = AstroEngine.getAscendant(bDate, p.lat, p.lon, birthGst);
        relocatedMC = AstroEngine.getMidheaven(bDate, p.lon, birthGst);
      }

      // 天体ラインの判定 (誕生日・出生地依存のため日付共通)
      let hasSunLine = false;
      let hasVenusLine = false;
      let hasJupiterLine = false;
      if (p.lat && p.lon && !isNaN(birthLat) && !isNaN(birthLon)) {
        hasSunLine = Math.abs(relocatedMC - sunLon) < 5 || Math.abs(relocatedASC - sunLon) < 5;
        hasVenusLine = Math.abs(relocatedMC - venusLon) < 5 || Math.abs(relocatedASC - venusLon) < 5;
        hasJupiterLine = Math.abs(relocatedMC - jupiterLon) < 5 || Math.abs(relocatedASC - jupiterLon) < 5;
      }

      if (p.lat && p.lon) {
        distanceKm = getDistance(baseLat, baseLon, p.lat, p.lon);
        trueBearing = getBearing(baseLat, baseLon, p.lat, p.lon);
        direction = getDirectionFromBearing(trueBearing, nodeMapping);
        
        const magneticBearing = (trueBearing - declination + 360) % 360;
        magneticDirection = getDirectionFromBearing(magneticBearing, nodeMapping);
      }

      const dateScores = dailyAstroStates.map((state, stateIdx) => {
        let baseAstrologyScore = 50;
        let dailyStatus = 'UNKNOWN';
        let dailyIsTendo = false;
        
        let tendoBonus = 0;
        let sunLineBonus = 0;
        let venusLineBonus = 0;
        let jupiterLineBonus = 0;
        let lunarPhaseScore = state.lunarPhaseScore;
        let doyouPenalty = 0;
        let voidPenalty = 0;

        if (p.lat && p.lon) {
          const targetDirection = useTrueNorth ? direction : magneticDirection;
          
          if (state.activeVectors && targetDirection) {
            dailyStatus = state.activeVectors[targetDirection] || 'UNKNOWN';

            // 1. Tendo (天道) override/shift rules
            const isTendo = state.tendoDir && targetDirection === state.tendoDir;
            if (isTendo) {
              dailyIsTendo = true;
              tendoBonus = 20;
              
              if (isNoiseStatus(dailyStatus)) {
                // Shift NOISE to WARNING
                dailyStatus = 'WARNING';
              } else if (dailyStatus === 'WARNING') {
                // Shift WARNING to SAFE
                dailyStatus = 'SAFE';
              }
            }

            // 2. Jupiter Line (木星ライン) boost
            const isOptimal = dailyStatus === 'OPTIMAL' || dailyStatus === 'OPTIMAL_REGULAR';
            if (isOptimal && hasJupiterLine) {
              dailyStatus = 'OPTIMAL_BOOST';
            }

            switch (dailyStatus) {
              case 'OPTIMAL_BOOST': baseAstrologyScore = 110; break;
              case 'OPTIMAL': baseAstrologyScore = 100; break;
              case 'SAFE': baseAstrologyScore = 80; break;
              case 'WARNING': baseAstrologyScore = 60; break;
              case 'NOISE_VOID': 
                baseAstrologyScore = 40;
                voidPenalty = -40;
                break;
              case 'NOISE_NODE': baseAstrologyScore = 40; break;
              case 'NOISE_HONMEI':
              case 'NOISE_TEKI':
              case 'NOISE_GETSUMEI':
              case 'NOISE_GETSUTEKI': baseAstrologyScore = 20; break;
              case 'NOISE_GOU':
              case 'NOISE_ANKEN':
              case 'NOISE_HA': baseAstrologyScore = 10; break;
              default: baseAstrologyScore = 50; break;
            }
          }

          if (!isNaN(birthLat) && !isNaN(birthLon)) {
            if (hasSunLine) sunLineBonus = 15;
            if (hasVenusLine && baseAstrologyScore >= 50) venusLineBonus = 15;
            if (hasJupiterLine && baseAstrologyScore >= 50) jupiterLineBonus = 20;
          }

          if (state.isDoyouHazard) {
            doyouPenalty = -30;
          }

          // 3. Time-Gate (天中殺) check
          if (state.isVoidTime && actionIntent === 'MIGRATION') {
            voidPenalty = -100; // Time-Gate blocker!
          }
        }

        // 4. Bazi vs Kigaku Intent-based dynamic weighting
        let blendedAstroScore = baseAstrologyScore;
        if (!isNaN(birthLat) && !isNaN(birthLon)) {
          const baziScore = state.baziScore;
          if (actionIntent === 'MIGRATION' || actionIntent === 'BUSINESS') {
            blendedAstroScore = (baseAstrologyScore * 0.7) + (baziScore * 0.3);
          } else {
            blendedAstroScore = (baseAstrologyScore * 0.2) + (baziScore * 0.8);
          }
        }

        // クリップ前の生合計値
        const rawTotalScore = blendedAstroScore + tendoBonus + sunLineBonus + venusLineBonus + jupiterLineBonus + lunarPhaseScore + doyouPenalty + voidPenalty;
        const dailyScore = Math.max(0, Math.min(100, rawTotalScore));

        const isTaian = state.rokuyo.includes("大安");
        const isTensho = state.luckyDays.isTensho;
        const isIchiryumanbai = state.luckyDays.isIchiryumanbai;
        
        let luckyCount = 0;
        if (dailyIsTendo) luckyCount++;
        if (isTaian) luckyCount++;
        if (isTensho) luckyCount++;
        if (isIchiryumanbai) luckyCount++;

        const isUltraLucky = (isTensho && dailyIsTendo) || luckyCount >= 3;

        return {
          date: state.dateStr,
          score: dailyScore,
          status: dailyStatus,
          rokuyo: state.rokuyo,
          luckyDays: {
            isIchiryumanbai,
            isTensho,
            isTendo: dailyIsTendo,
            labels: [
              ...(isIchiryumanbai ? ["一粒万倍日"] : []),
              ...(isTensho ? ["天赦日"] : []),
              ...(dailyIsTendo ? ["天道"] : [])
            ]
          },
          isUltraLucky,
          weekday: state.weekday,
          holiday: state.holiday,
          scoreDetails: {
            baseAstrologyScore,
            tendoBonus,
            sunLineBonus,
            venusLineBonus,
            jupiterLineBonus,
            lunarPhaseScore,
            doyouPenalty,
            voidPenalty,
            rawTotalScore
          }
        };
      });

      // 目標日当日(配列のインデックス3)のデータに基づいて物件全体の吉凶ステータスを設定
      const targetDay = dateScores[3];
      const targetDetails = targetDay.scoreDetails;
      const astrologyScore = targetDay.score;
      const astrologyStatus = targetDay.status;
      const isTendo = targetDay.luckyDays.isTendo;

      const astroFlags: string[] = [];
      if (!useTrueNorth && direction !== magneticDirection && (astrologyScore < 80)) {
        astroFlags.push("DECLINATION_WARNING");
      }
      if (isTendo) astroFlags.push("TENDO");
      if (hasSunLine) astroFlags.push("SUN_LINE");
      if (hasVenusLine) astroFlags.push("VENUS_LINE");
      if (hasJupiterLine) astroFlags.push("JUPITER_LINE");
      if (targetDetails.lunarPhaseScore > 0) astroFlags.push("LUNAR_BOOST");
      if (targetDetails.lunarPhaseScore < 0) astroFlags.push("LUNAR_PENALTY");
      if (targetDetails.doyouPenalty < 0) astroFlags.push("DOYOU_HAZARD");
      if (targetDetails.voidPenalty < 0 || astrologyStatus === 'NOISE_VOID') {
        astroFlags.push("VOID_TIME_HAZARD");
      }

      // 最大吉凶要因（maxAstroFactor）の決定ロジック
      let maxAstroFactor = "通常";
      if (targetDetails.voidPenalty < 0 || astrologyStatus === 'NOISE_VOID') maxAstroFactor = "天中殺期間 (移転NG)";
      else if (astrologyStatus === 'OPTIMAL_BOOST') maxAstroFactor = "超大吉 (木星ライン)";
      else if (astrologyStatus === 'WARNING') maxAstroFactor = "警告・調整方位";
      else if (astrologyStatus === 'NOISE_GOU') maxAstroFactor = "五黄殺";
      else if (astrologyStatus === 'NOISE_ANKEN') maxAstroFactor = "暗剣殺";
      else if (astrologyStatus === 'NOISE_HA') maxAstroFactor = "歳破";
      else if (astrologyStatus === 'NOISE_HONMEI') maxAstroFactor = "本命殺";
      else if (astrologyStatus === 'NOISE_TEKI') maxAstroFactor = "本命的殺";
      else if (targetDay.isUltraLucky) maxAstroFactor = "超ウルトラ吉";
      else if (isTendo) maxAstroFactor = "天道方位";
      else if (targetDay.luckyDays.isTensho) maxAstroFactor = "天赦日";
      else if (targetDetails.jupiterLineBonus > 0) maxAstroFactor = "木星ライン";
      else if (targetDetails.venusLineBonus > 0) maxAstroFactor = "金星ライン";
      else if (targetDetails.sunLineBonus > 0) maxAstroFactor = "太陽ライン";
      else if (targetDay.rokuyo.includes("大安")) maxAstroFactor = "大安";
      else if (targetDay.luckyDays.isIchiryumanbai) maxAstroFactor = "一粒万倍日";
      else if (targetDetails.doyouPenalty < 0) maxAstroFactor = "土用殺";
      else if (astrologyStatus === 'NOISE_GETSUMEI') maxAstroFactor = "月命殺";
      else if (astrologyStatus === 'NOISE_GETSUTEKI') maxAstroFactor = "月命的殺";
      else if (astrologyStatus === 'NOISE_NODE') maxAstroFactor = "月交点ノイズ";
      else if (astroFlags.includes("DECLINATION_WARNING")) maxAstroFactor = "偏角境界";
      else if (astrologyStatus === 'SAFE') maxAstroFactor = "吉方位";

      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      const propSqmRent = totalRent / Number(p.size_sqm);
      
      const rentZScore = calculateZScore(propSqmRent, meanSqmRent, stdDevSqmRent);
      const yieldScore = 100 - rentZScore + 50; 
      
      const arbitrageScore = (astrologyScore * 0.4) + (yieldScore * 0.6);

      return {
        ...p,
        property_name: cleanPropertyName(p.property_name || ''),
        totalRent,
        propSqmRent,
        distanceKm,
        direction,
        magneticDirection,
        astrologyStatus,
        astrologyScore,
        astroFlags,
        yieldScore,
        arbitrageScore,
        isTendo,
        maxAstroFactor,
        dateScores
      };
    });

    // スコア順にソート
    scoredProperties.sort((a, b) => b.arbitrageScore - a.arbitrageScore);

    const upcomingDoyou = getUpcomingDoyouPeriod(targetDate);

    return NextResponse.json({ 
      properties: scoredProperties,
      metadata: {
        baseLat, baseLon, radiusKm, prefecture, layerMode, useClassical, useTrueNorth, nodeMapping,
        targetDate: targetDate.toISOString().split('T')[0],
        meanSqmRent,
        stdDevSqmRent,
        totalAnalyzed: properties.length,
        totalCount,
        limit,
        upcomingDoyou,
        lunarPhase: {
          label: lunarPhaseLabel,
          scoreModifier: lunarPhaseScore,
          adviceText: lunarPhaseAdvice,
          lunarPhaseModifier
        }
      }
    });

  } catch (error: any) {
    console.error("Failed to analyze arbitrage rentals:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
