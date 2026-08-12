import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";
import {
  getHonmeiStar,
  getCurrentEnvironmentalFrequencies,
  generateBoard,
  calculateVectorCollision,
  filterCollisionByMode,
  getPersonalVoidZodiac,
  Direction,
  AstroEngine,
  getUpcomingDoyouPeriod,
  calculateLunarPhaseCondition,
} from "@/utils/ephemerisEngine";
import { getGeomagneticData } from "@/utils/geomagnetism";
import { directionFromBearing } from "@/utils/directionGeo";

export const dynamic = "force-dynamic";

function parseSafeDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  if (
    dateStr.includes("T") &&
    !dateStr.endsWith("Z") &&
    !/[+-]\d{2}:?\d{2}$/.test(dateStr)
  ) {
    return new Date(dateStr + "+09:00");
  }
  return new Date(dateStr);
}

function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (val: number) => (val * Math.PI) / 180;
  const toDeg = (val: number) => (val * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

// 角度の差を計算する関数（円弧上の最短距離）
function getAngleDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Radius of the earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const sort = searchParams.get("sort") || "desc";

  let baseLat = parseFloat(searchParams.get("baseLat") || "NaN");
  let baseLon = parseFloat(searchParams.get("baseLon") || "NaN");
  let birthLat = parseFloat(searchParams.get("birthLat") || "NaN");
  let birthLon = parseFloat(searchParams.get("birthLon") || "NaN");
  const targetDateStr = searchParams.get("targetDate");
  let birthDateStr = searchParams.get("birthDate");
  const engineType = searchParams.get("engineType") || "physical"; // 'physical' or 'classical'
  const layerMode = searchParams.get("layerMode") || "final"; // 'final', 'year', 'month', 'day'
  const directionFilterMode = (searchParams.get("directionFilterMode") ||
    "composite") as
    | "composite"
    | "personal_kigaku"
    | "personal_bazi"
    | "environmental";
  const useTrueNorth = searchParams.get("useTrueNorth") === "true";
  const useClassical = engineType === "classical";
  const nodeMapping = (searchParams.get("nodeMapping") ||
    (useClassical ? "traditional" : "physical")) as "traditional" | "physical";
  const lunarPhaseModifier = searchParams.get("lunarPhaseModifier") !== "false";
  const physicalMonthMode = (searchParams.get("physicalMonthMode") ||
    "independent") as "coupled" | "independent";
  const prefecture = searchParams.get("prefecture") || "all";

  // Fallback to local config if parameters are missing
  try {
    const configPath = path.join(process.cwd(), "local_tactical_config.json");
    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    if (isNaN(baseLat) && config.base_lat !== undefined)
      baseLat = config.base_lat;
    if (isNaN(baseLon) && config.base_lon !== undefined)
      baseLon = config.base_lon;
    if (isNaN(birthLat) && config.birth_lat !== undefined)
      birthLat = config.birth_lat;
    if (isNaN(birthLon) && config.birth_lon !== undefined)
      birthLon = config.birth_lon;
    if (!birthDateStr && config.birth_date) birthDateStr = config.birth_date;
  } catch (e) {
    // Ignore config read error
  }

  // Default to Tokyo if still missing
  if (isNaN(baseLat)) baseLat = 35.6895;
  if (isNaN(baseLon)) baseLon = 139.6917;

  // 生年月日が無い場合は安全のためダミー値をセット
  if (!birthDateStr) birthDateStr = "2000-01-01T12:00";

  // datetime-localが秒を含まない場合があるため、有効なDate形式にする
  const bDate = parseSafeDate(birthDateStr);
  if (isNaN(bDate.getTime())) {
    return NextResponse.json(
      { success: false, error: "Invalid birthDate" },
      { status: 400 },
    );
  }

  const targetDate = parseSafeDate(targetDateStr);

  // 月相コンディションの計算
  let lunarPhaseScore = 0;
  let lunarPhaseAdvice = "";
  let lunarPhaseLabel = "";
  if (lunarPhaseModifier) {
    const lpCond = calculateLunarPhaseCondition(targetDate, "MIGRATION");
    lunarPhaseScore = lpCond.scoreModifier;
    lunarPhaseAdvice = lpCond.adviceText;
    lunarPhaseLabel = lpCond.phaseLabel;
  }

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
  const env = getCurrentEnvironmentalFrequencies(
    targetDate,
    isNaN(baseLon) ? 139.6917 : baseLon,
    physicalMonthMode,
  );
  const voidZodiacs = getPersonalVoidZodiac(bDate);

  const yB = generateBoard(useClassical ? env.classicalYearStar : env.yearStar);
  const mB = generateBoard(
    useClassical ? env.classicalMonthStar : env.monthStar,
  );
  const dB = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);

  const rawCollision = calculateVectorCollision(
    useClassical ? honmeiStar.classical : honmeiStar.physical,
    yB,
    mB,
    dB,
    voidZodiacs,
    env.raw.lunarNode,
    "MIGRATION", // Action intent for relocation
    targetDate,
    baseLon,
    undefined,
    nodeMapping,
  );

  // 利用者が選んだ絞り込み（本命星のみ／環境要因のみ など）を通す。
  //
  // ここだけ filterCollisionByMode を呼んでおらず、設定を変えても
  // 資産マップの色だけ変わらなかった。ほかの API（arbitrage / history /
  // export / simulator）はすべて通している。
  //
  // 既定の "composite" は素通し（ephemerisEngine.ts:1429）なので、
  // 指定が無いときの判定はこれまでと変わらない。
  const vectorData = filterCollisionByMode(
    rawCollision,
    useClassical ? honmeiStar.classical : honmeiStar.physical,
    null,
    voidZodiacs,
    directionFilterMode,
    yB,
    mB,
    dB,
  );

  if (layerMode === "year") activeVectors = vectorData.yearLayer;
  else if (layerMode === "month") activeVectors = vectorData.monthLayer;
  else if (layerMode === "day") activeVectors = vectorData.dayLayer;
  else activeVectors = vectorData.finalVectors;

  const isDoyouHazard = vectorData.doyouState?.isDoyouHazard || false;

  // 動的偏角の取得
  // 取得できなかったときは 0（＝補正なし）に倒す。以前は東京の -8.2 度を
  // 既定にしていたが、沖縄や北海道の利用者にも東京の偏角で計算した磁北の
  // 方位を見せることになる。判定は真北で行うのでここは注意表示にしか
  // 効かず、分からないときは「ずれない」として注意を出さないほうが正しい。
  let declination = 0;
  try {
    const geoData = await getGeomagneticData(
      baseLat,
      baseLon,
      targetDate.getTime(),
    );
    if (geoData && typeof geoData.declination === "number") {
      declination = geoData.declination;
    }
  } catch (err) {
    console.error("Error fetching dynamic declination in API:", err);
  }

  try {
    const whereClause: any = {};
    if (prefecture && prefecture !== "all") {
      if (/^\d+$/.test(prefecture)) {
        whereClause.areaCode = { startsWith: prefecture };
      } else {
        whereClause.areaName = { startsWith: prefecture };
      }
    }

    const municipalities = await prisma.municipalityWealth.findMany({
      where: whereClause,
      take: limit,
    });

    const scoredData = municipalities.map((m) => {
      let astrologyScore = 50; // Neutral default
      let astrologyStatus = "UNKNOWN";
      let direction: Direction | null = null;
      let trueBearing: number | null = null;
      let magneticBearing: number | null = null;
      let magneticDirection: Direction | null = null;
      const astroFlags: string[] = [];

      if (m.lat && m.lon) {
        trueBearing = getBearing(baseLat, baseLon, m.lat, m.lon);
        direction = directionFromBearing(trueBearing, nodeMapping); // True direction (地図上の方位)

        // 偏角の補正 (動的に取得した値を使用)
        magneticBearing = (trueBearing - declination + 360) % 360;
        magneticDirection = directionFromBearing(magneticBearing, nodeMapping);

        // 1. 九星気学による方位スコア計算
        const targetDirection = useTrueNorth ? direction : magneticDirection;
        if (activeVectors && targetDirection) {
          astrologyStatus = activeVectors[targetDirection] || "UNKNOWN";
          switch (astrologyStatus) {
            case "OPTIMAL":
              astrologyScore = 100;
              break;
            case "SAFE":
              astrologyScore = 80;
              break;
            case "WARNING":
              astrologyScore = 60;
              break;
            case "NOISE_VOID":
            case "NOISE_NODE":
              astrologyScore = 40;
              break;
            case "NOISE_HONMEI":
            case "NOISE_TEKI":
            case "NOISE_GETSUMEI":
            case "NOISE_GETSUTEKI":
              astrologyScore = 20;
              break;
            case "NOISE_GOU":
            case "NOISE_ANKEN":
            case "NOISE_HA":
              astrologyScore = 10;
              break;
            default:
              astrologyScore = 50;
              break;
          }

          // 境界線アラート: 真北のセクターと磁北のセクターが異なる場合 (e.g., 地図では北東だが、磁北では北など)
          if (
            !useTrueNorth &&
            direction !== magneticDirection &&
            astrologyScore < 80
          ) {
            astroFlags.push("DECLINATION_WARNING");
          }
        }

        // 2. AstroCartoGraphy（リロケーション占星術）ボーナス
        if (!isNaN(birthLat) && !isNaN(birthLon)) {
          // ターゲット市区町村における出生時間のASCとMC
          const relocatedASC = AstroEngine.getAscendant(
            bDate,
            m.lat,
            m.lon,
            birthGst,
          );
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

        // 2.5. 月相コンディション（日単位補正）
        if (lunarPhaseModifier) {
          astrologyScore += lunarPhaseScore;
          if (lunarPhaseScore > 0) {
            astroFlags.push("LUNAR_BOOST");
          } else if (lunarPhaseScore < 0) {
            astroFlags.push("LUNAR_PENALTY");
          }
        }

        // 2.6. 土用期間のペナルティ
        if (isDoyouHazard) {
          astrologyScore -= 30;
          astroFlags.push("DOYOU_HAZARD");
        }

        // Clip final score to [0, 100]
        astrologyScore = Math.max(0, Math.min(100, astrologyScore));
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
        astrologyStatus:
          astroFlags.length > 0
            ? `${astrologyStatus} + ${astroFlags.join(",")}`
            : astrologyStatus,
        direction,
        magneticDirection,
        trueBearing,
        magneticBearing,
        cospaIndex,
        distanceKm,
      };
    });

    // ここで動的にソート（ボーナス加算後のスコア考慮）
    scoredData.sort((a, b) => {
      if (sort === "asc") return a.incomePerCapita - b.incomePerCapita;
      return b.incomePerCapita - a.incomePerCapita;
    });

    const upcomingDoyou = getUpcomingDoyouPeriod(targetDate);

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
        nodeMapping,
        upcomingDoyou,
        physicalMonthMode,
        lunarPhase: {
          label: lunarPhaseLabel,
          scoreModifier: lunarPhaseScore,
          adviceText: lunarPhaseAdvice,
          lunarPhaseModifier,
        },
        vectors: activeVectors,
      },
    });
  } catch (error) {
    console.error("Error fetching municipalities wealth data:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch data",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
