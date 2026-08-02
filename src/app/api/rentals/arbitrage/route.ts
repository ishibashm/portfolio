import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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
  getCurrentZodiac,
} from "@/utils/ephemerisEngine";
import { getGeomagneticData } from "@/utils/geomagnetism";
import { getRokuyo, getLuckyDays, isJapaneseHoliday } from "@/utils/lunar";
import { Solar } from "lunar-javascript";
import {
  buildDailyAstroStates,
  scoreDateForProperty,
} from "@/utils/arbitrageAstro";

// 物件名から不要な階数や築年数表現を除去するクレンジング関数
function cleanPropertyName(name: string): string {
  if (!name) return "";
  return name
    .replace(
      /[\s　]*(?:地下)?\d+階[\s　]+(?:築\d+年(?:[0-9]+ヶ月)?|新築)の賃貸物件$/,
      "",
    )
    .replace(/[\s　]*(?:築\d+年(?:[0-9]+ヶ月)?|新築)の賃貸物件$/, "")
    .trim();
}

/**
 * cleanPropertyName の SQL 版。JS 側と同じ後置きを落として建物名だけにする。
 * 名寄せキーに使うため、両者がずれると重複が残る。
 */
const NAME_KEY_SQL = `regexp_replace(property_name, '[\\s　]*((?:地下)?[0-9]+階)?[\\s　]*(新築|築[0-9]+年([0-9]+ヶ月)?)?の?賃貸物件[\\s　]*$', '')`;

const SQM_RENT_SQL = `((rent + COALESCE(management_fee, 0))::float8 / size_sqm::float8)`;

/**
 * 同じ部屋の重複掲載をまとめるキー。
 *
 * Nifty は HOME'S / SUUMO / at home / いい部屋ネット など複数社の掲載を
 * そのまま並べるため、同一の部屋が別 URL で最大18件重なる。住所の書き方が
 * 会社ごとに違う（「四番町」と「七本松通下長者町上る東入四番町」）ので
 * 住所も座標もキーに使えない。建物名・階・間取り・面積・賃料の一致で
 * 同じ部屋とみなす。
 */
const DEDUPE_KEY_SQL = `${NAME_KEY_SQL}, floor, layout, size_sqm, rent`;

/**
 * 残す1件を選ぶ順序。同じ部屋でも会社によって駅徒歩や管理費が欠けるため、
 * 埋まっているものを優先し、同点なら新しく確認できたほうを取る。
 */
const PICK_ORDER_SQL = `
  ((minutes_to_station IS NOT NULL)::int + (building_age IS NOT NULL)::int
   + (management_fee IS NOT NULL)::int + (expire_date IS NOT NULL)::int) DESC,
  last_seen_at DESC NULLS LAST`;

interface GeoFilters {
  maxSeenDays: number;
  maxBuildingAge: number | null;
  radiusKm: number;
  baseLat: number;
  baseLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  prefecture: string | null;
}

/**
 * findMany に渡している whereClause と同じ条件を SQL 化する。
 * 値は必ずプレースホルダで渡す（prefecture はクエリ文字列由来のため）。
 */
function buildWhereSql(f: GeoFilters): { sql: string; params: any[] } {
  const parts = [
    "lat IS NOT NULL",
    "lon IS NOT NULL",
    "rent IS NOT NULL",
    "size_sqm IS NOT NULL",
    "size_sqm > 0",
    // 掲載期限を過ぎた物件は詳細ページが 404 になる。
    // expire_date が未取得（古い行）のものは判定できないので除外しない。
    "(expire_date IS NULL OR expire_date >= now())",
  ];
  const params: any[] = [];
  const ph = () => `$${params.length}`;

  if (f.maxSeenDays > 0) {
    params.push(new Date(Date.now() - f.maxSeenDays * 24 * 60 * 60 * 1000));
    parts.push(`last_seen_at >= ${ph()}`);
  }
  if (f.maxBuildingAge !== null && !isNaN(f.maxBuildingAge)) {
    params.push(f.maxBuildingAge);
    parts.push(`building_age <= ${ph()}`);
  }

  if (f.radiusKm > 0 && !isNaN(f.baseLat) && !isNaN(f.baseLon)) {
    const deltaLat = f.radiusKm / 111.0;
    const deltaLon =
      f.radiusKm / (111.0 * Math.cos((f.baseLat * Math.PI) / 180.0));
    params.push(f.baseLat - deltaLat);
    parts.push(`lat >= ${ph()}`);
    params.push(f.baseLat + deltaLat);
    parts.push(`lat <= ${ph()}`);
    params.push(f.baseLon - deltaLon);
    parts.push(`lon >= ${ph()}`);
    params.push(f.baseLon + deltaLon);
    parts.push(`lon <= ${ph()}`);
  } else if (
    !isNaN(f.minLat) &&
    !isNaN(f.maxLat) &&
    !isNaN(f.minLon) &&
    !isNaN(f.maxLon)
  ) {
    params.push(f.minLat);
    parts.push(`lat >= ${ph()}`);
    params.push(f.maxLat);
    parts.push(`lat <= ${ph()}`);
    params.push(f.minLon);
    parts.push(`lon >= ${ph()}`);
    params.push(f.maxLon);
    parts.push(`lon <= ${ph()}`);
  }

  if (f.prefecture && f.prefecture !== "all") {
    params.push(f.prefecture);
    parts.push(`address LIKE ${ph()} || '%'`);
  }

  return { sql: parts.join(" AND "), params };
}

/** 名寄せ後、㎡単価の安い順に limit 件。裁定機会は㎡単価の低さに現れる。 */
function selectSql(
  whereSql: string,
  dedupe: boolean,
  limitPlaceholder: number,
): string {
  const inner = dedupe
    ? `SELECT DISTINCT ON (${DEDUPE_KEY_SQL}) *, ${SQM_RENT_SQL} AS sqm_rent
         FROM rental_properties
        WHERE ${whereSql}
        ORDER BY ${DEDUPE_KEY_SQL}, ${PICK_ORDER_SQL}`
    : `SELECT *, ${SQM_RENT_SQL} AS sqm_rent
         FROM rental_properties
        WHERE ${whereSql}`;
  return `SELECT * FROM (${inner}) t ORDER BY sqm_rent ASC LIMIT $${limitPlaceholder}`;
}

/** 相場の基準値。取得した件数ではなく条件に合う全件から出す。 */
function statsSql(whereSql: string, dedupe: boolean): string {
  const inner = dedupe
    ? `SELECT DISTINCT ON (${DEDUPE_KEY_SQL}) ${SQM_RENT_SQL} AS sqm_rent
         FROM rental_properties
        WHERE ${whereSql}
        ORDER BY ${DEDUPE_KEY_SQL}, ${PICK_ORDER_SQL}`
    : `SELECT ${SQM_RENT_SQL} AS sqm_rent
         FROM rental_properties
        WHERE ${whereSql}`;
  return `SELECT avg(sqm_rent) AS mean, coalesce(stddev_pop(sqm_rent), 0) AS stddev,
                 count(*) AS n
            FROM (${inner}) t`;
}

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

// 偏差値計算用のヘルパー

function calculateZScore(value: number, mean: number, stdDev: number) {
  if (stdDev === 0) return 50;
  return ((value - mean) / stdDev) * 10 + 50;
}

function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const l1 = lat1 * (Math.PI / 180);
  const l2 = lat2 * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(l2);
  const x =
    Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
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

function getDirectionFromBearing(
  bearing: number,
  nodeMapping: "traditional" | "physical" = "traditional",
): Direction {
  const b = ((bearing % 360) + 360) % 360;
  if (nodeMapping === "physical") {
    const index = Math.floor(((b + 22.5) % 360) / 45);
    const dirs: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[index];
  } else {
    if (b >= 345 || b < 15) return "N";
    if (b >= 15 && b < 75) return "NE";
    if (b >= 75 && b < 105) return "E";
    if (b >= 105 && b < 165) return "SE";
    if (b >= 165 && b < 195) return "S";
    if (b >= 195 && b < 255) return "SW";
    if (b >= 255 && b < 285) return "W";
    return "NW";
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // クエリパラメータのパース
  const baseLat = parseFloat(searchParams.get("baseLat") || "35.6895"); // デフォルトは東京
  const baseLon = parseFloat(searchParams.get("baseLon") || "139.6917");
  const birthLat = parseFloat(searchParams.get("birthLat") || "NaN");
  const birthLon = parseFloat(searchParams.get("birthLon") || "NaN");
  const birthDateStr = searchParams.get("birthDate") || "";
  const useClassicalStr = searchParams.get("useClassical");
  const layerMode = searchParams.get("layerMode") || "year";
  const useTrueNorthStr = searchParams.get("useTrueNorth");

  const useClassical = useClassicalStr === "true";
  const nodeMapping = (searchParams.get("nodeMapping") ||
    (useClassical ? "traditional" : "physical")) as "traditional" | "physical";
  const limit = parseInt(searchParams.get("limit") || "500");
  // 同一部屋の重複掲載をまとめるか。生データを見たい場合だけ false にする。
  const dedupe = searchParams.get("dedupe") !== "false";
  const lunarPhaseModifier = searchParams.get("lunarPhaseModifier") !== "false";
  const directionFilterMode = (searchParams.get("directionFilterMode") ||
    "composite") as
    | "composite"
    | "personal_kigaku"
    | "personal_bazi"
    | "environmental";
  const actionIntent = (searchParams.get("actionIntent") || "MIGRATION") as any;
  const useTrueNorth = useTrueNorthStr === "true";
  // 掲載終了した物件は一覧から消えるだけなので、DB には残り続ける。
  // 実測では最終確認から 7 日以上経った行の半数が既に 404 だった。
  // 期限(expire_date)を持たない古い行はこれでしか判定できない。0 で無効化。
  const maxSeenDays = parseInt(searchParams.get("maxSeenDays") || "30", 10);
  const physicalMonthMode = (searchParams.get("physicalMonthMode") ||
    "independent") as "coupled" | "independent";
  const radiusKmStr = searchParams.get("radiusKm") || "10";
  const radiusKm = radiusKmStr === "all" ? 0 : parseFloat(radiusKmStr);
  const prefecture = searchParams.get("prefecture") || "all";
  const maxBuildingAgeStr = searchParams.get("maxBuildingAge");
  const maxBuildingAge = maxBuildingAgeStr
    ? parseInt(maxBuildingAgeStr, 10)
    : null;

  const minLat = parseFloat(searchParams.get("minLat") || "NaN");
  const maxLat = parseFloat(searchParams.get("maxLat") || "NaN");
  const minLon = parseFloat(searchParams.get("minLon") || "NaN");
  const maxLon = parseFloat(searchParams.get("maxLon") || "NaN");

  const targetDateStr = searchParams.get("targetDate") || "";
  let targetDate = parseSafeDate(targetDateStr);

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

  // 1. 環境・運気エンジンの初期化
  const env = getSystemEnvironment(targetDate, baseLon, physicalMonthMode);

  let bDate = parseSafeDate(birthDateStr);

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
  const mB = generateBoard(
    useClassical ? env.classicalMonthStar : env.monthStar,
  );
  const dB = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);

  const baseCollision = calculateVectorCollision(
    useClassical ? honmeiStar.classical : honmeiStar.physical,
    yB,
    mB,
    dB,
    voidZodiacs,
    env.raw.lunarNode,
    actionIntent,
    targetDate,
    baseLon,
    undefined,
    nodeMapping,
  );

  const vectorData = filterCollisionByMode(
    baseCollision,
    useClassical ? honmeiStar.classical : honmeiStar.physical,
    null,
    voidZodiacs,
    directionFilterMode,
    yB,
    mB,
    dB,
  );

  let activeVectors: Partial<Record<Direction, string>>;
  if (layerMode === "year") activeVectors = vectorData.yearLayer;
  else if (layerMode === "month") activeVectors = vectorData.monthLayer;
  else if (layerMode === "day") activeVectors = vectorData.dayLayer;
  else activeVectors = vectorData.finalVectors;

  const isDoyouHazard = vectorData.doyouState?.isDoyouHazard || false;

  // 動的偏角の取得
  let declination = -8.2;
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
    console.error(
      "Error fetching dynamic declination in rentals arbitrage API:",
      err,
    );
  }

  try {
    // 2. DBから物件データを取得 (緯度経度があるもの)
    const whereClause: any = {
      lat: { not: null },
      lon: { not: null },
      rent: { not: null },
      size_sqm: { not: null },
      // 掲載期限を過ぎた物件は詳細ページが 404 になる。リンク切れを掴ませない。
      // expire_date が未取得（古い行）のものは判定できないので除外しない。
      OR: [{ expire_date: null }, { expire_date: { gte: new Date() } }],
    };

    if (maxSeenDays > 0) {
      whereClause.last_seen_at = {
        gte: new Date(Date.now() - maxSeenDays * 24 * 60 * 60 * 1000),
      };
    }

    if (maxBuildingAge !== null && !isNaN(maxBuildingAge)) {
      whereClause.building_age = {
        lte: maxBuildingAge,
      };
    }

    if (radiusKm > 0 && !isNaN(baseLat) && !isNaN(baseLon)) {
      const deltaLat = radiusKm / 111.0;
      const deltaLon =
        radiusKm / (111.0 * Math.cos((baseLat * Math.PI) / 180.0));
      whereClause.lat = {
        gte: baseLat - deltaLat,
        lte: baseLat + deltaLat,
      };
      whereClause.lon = {
        gte: baseLon - deltaLon,
        lte: baseLon + deltaLon,
      };
    } else if (
      !isNaN(minLat) &&
      !isNaN(maxLat) &&
      !isNaN(minLon) &&
      !isNaN(maxLon)
    ) {
      whereClause.lat = {
        gte: minLat,
        lte: maxLat,
      };
      whereClause.lon = {
        gte: minLon,
        lte: maxLon,
      };
    }

    if (prefecture && prefecture !== "all") {
      whereClause.address = {
        startsWith: prefecture,
      };
    }

    // 候補の絞り込みは SQL 側で行う。
    //
    // 以前は findMany({ orderBy: { id: "desc" }, take: limit }) だったが、
    // id は uuid なのでこれは事実上のランダム抽出で、愛知 11,611 件のうち
    // ランキングに乗るのは 500 件（4%）だけだった。割安な物件はほとんど
    // 検討対象に入っていない。裁定機会は㎡単価の低さに現れるので、
    // 全件を名寄せしたうえで安い順に取る。
    const { sql: whereSql, params } = buildWhereSql({
      maxSeenDays,
      maxBuildingAge,
      radiusKm,
      baseLat,
      baseLon,
      minLat,
      maxLat,
      minLon,
      maxLon,
      prefecture,
    });

    const [rawProperties, totalCount, freshness, beforeFreshnessCount] =
      await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        selectSql(whereSql, dedupe, params.length + 1),
        ...params,
        limit,
      ),
      prisma.rental_properties.count({
        where: whereClause,
      }),
      // 定期スクレイピング（.github/workflows/scrape-rentals.yml）がいつ回ったかを
      // 画面から確認できるようにする。絞り込み条件に依存しない全体の鮮度。
      prisma.rental_properties.aggregate({
        _max: { last_seen_at: true },
      }),
      // 鮮度で落とした件数。急に件数が減った理由が画面から分かるようにする。
      maxSeenDays > 0
        ? prisma.rental_properties.count({
            where: { ...whereClause, last_seen_at: undefined },
          })
        : Promise.resolve(0),
    ]);

    const staleHidden =
      maxSeenDays > 0 ? Math.max(0, beforeFreshnessCount - totalCount) : 0;

    const dataUpdatedAt = freshness._max.last_seen_at?.toISOString() ?? null;

    const properties = rawProperties;

    if (properties.length === 0) {
      return NextResponse.json({
        properties: [],
        stats: {},
        metadata: { totalCount: 0, limit, dataUpdatedAt, staleHidden, maxSeenDays },
      });
    }

    // 相場の基準値は「取得した 500 件」ではなく絞り込み条件に合う全件から出す。
    // 安い順に切り出した集合で平均を取ると基準そのものが下がり、
    // どれも平均並みという評価になって裁定シグナルが消える。
    const statsRow = await prisma.$queryRawUnsafe<
      Array<{ mean: number | null; stddev: number | null; n: bigint }>
    >(statsSql(whereSql, dedupe), ...params);
    const meanSqmRent = Number(statsRow[0]?.mean ?? 0);
    const stdDevSqmRent = Number(statsRow[0]?.stddev ?? 0);
    const uniqueCount = Number(statsRow[0]?.n ?? 0);
    const duplicatesHidden = dedupe ? Math.max(0, totalCount - uniqueCount) : 0;

    // 前後7日間の日付リストを作成し、それぞれのアストロ状態を事前計算
    const dateList: Date[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(targetDate);
      d.setDate(targetDate.getDate() + i);
      dateList.push(d);
    }

    const astroParams = {
      baseLon,
      physicalMonthMode,
      useClassical,
      honmeiStar,
      voidZodiacs,
      actionIntent,
      nodeMapping,
      directionFilterMode,
      layerMode,
      lunarPhaseModifier,
      hasBirthLocation: !isNaN(birthLat) && !isNaN(birthLon),
      bDate,
    };
    const dailyAstroStates = buildDailyAstroStates(dateList, astroParams);

    // 3. 物件ごとにスコアリング
    const scoredProperties = properties.map((p) => {
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
        hasSunLine =
          Math.abs(relocatedMC - sunLon) < 5 ||
          Math.abs(relocatedASC - sunLon) < 5;
        hasVenusLine =
          Math.abs(relocatedMC - venusLon) < 5 ||
          Math.abs(relocatedASC - venusLon) < 5;
        hasJupiterLine =
          Math.abs(relocatedMC - jupiterLon) < 5 ||
          Math.abs(relocatedASC - jupiterLon) < 5;
      }

      if (p.lat && p.lon) {
        distanceKm = getDistance(baseLat, baseLon, p.lat, p.lon);
        trueBearing = getBearing(baseLat, baseLon, p.lat, p.lon);
        direction = getDirectionFromBearing(trueBearing, nodeMapping);

        const magneticBearing = (trueBearing - declination + 360) % 360;
        magneticDirection = getDirectionFromBearing(
          magneticBearing,
          nodeMapping,
        );
      }

      const dateScores = dailyAstroStates.map((state) =>
        scoreDateForProperty(state, {
          hasCoordinates: !!(p.lat && p.lon),
          direction,
          magneticDirection,
          useTrueNorth,
          hasSunLine,
          hasVenusLine,
          hasJupiterLine,
          hasBirthLocation: !isNaN(birthLat) && !isNaN(birthLon),
          actionIntent,
        }),
      );

      // 目標日当日(配列のインデックス3)のデータに基づいて物件全体の吉凶ステータスを設定
      const targetDay = dateScores[3];
      const targetDetails = targetDay.scoreDetails;
      const astrologyScore = targetDay.score;
      const astrologyStatus = targetDay.status;
      const isTendo = targetDay.luckyDays.isTendo;

      const astroFlags: string[] = [];
      if (
        !useTrueNorth &&
        direction !== magneticDirection &&
        astrologyScore < 80
      ) {
        astroFlags.push("DECLINATION_WARNING");
      }
      if (isTendo) astroFlags.push("TENDO");
      if (hasSunLine) astroFlags.push("SUN_LINE");
      if (hasVenusLine) astroFlags.push("VENUS_LINE");
      if (hasJupiterLine) astroFlags.push("JUPITER_LINE");
      if (targetDetails.lunarPhaseScore > 0) astroFlags.push("LUNAR_BOOST");
      if (targetDetails.lunarPhaseScore < 0) astroFlags.push("LUNAR_PENALTY");
      if (targetDetails.doyouPenalty < 0) astroFlags.push("DOYOU_HAZARD");
      if (targetDetails.voidPenalty < 0 || astrologyStatus === "NOISE_VOID") {
        astroFlags.push("VOID_TIME_HAZARD");
      }

      // 最大吉凶要因（maxAstroFactor）の決定ロジック
      let maxAstroFactor = "通常";
      if (targetDetails.voidPenalty < 0 || astrologyStatus === "NOISE_VOID")
        maxAstroFactor = "天中殺期間 (移転NG)";
      else if (astrologyStatus === "OPTIMAL_BOOST")
        maxAstroFactor = "超大吉 (木星ライン)";
      else if (astrologyStatus === "WARNING") maxAstroFactor = "警告・調整方位";
      else if (astrologyStatus === "NOISE_GOU") maxAstroFactor = "五黄殺";
      else if (astrologyStatus === "NOISE_ANKEN") maxAstroFactor = "暗剣殺";
      else if (astrologyStatus === "NOISE_HA") maxAstroFactor = "歳破";
      else if (astrologyStatus === "NOISE_HONMEI") maxAstroFactor = "本命殺";
      else if (astrologyStatus === "NOISE_TEKI") maxAstroFactor = "本命的殺";
      else if (targetDay.isUltraLucky) maxAstroFactor = "超ウルトラ吉";
      else if (isTendo) maxAstroFactor = "天道方位";
      else if (targetDay.luckyDays.isTensho) maxAstroFactor = "天赦日";
      else if (targetDetails.jupiterLineBonus > 0)
        maxAstroFactor = "木星ライン";
      else if (targetDetails.venusLineBonus > 0) maxAstroFactor = "金星ライン";
      else if (targetDetails.sunLineBonus > 0) maxAstroFactor = "太陽ライン";
      else if (targetDay.rokuyo.includes("大安")) maxAstroFactor = "大安";
      else if (targetDay.luckyDays.isIchiryumanbai)
        maxAstroFactor = "一粒万倍日";
      else if (targetDetails.doyouPenalty < 0) maxAstroFactor = "土用殺";
      else if (astrologyStatus === "NOISE_GETSUMEI") maxAstroFactor = "月命殺";
      else if (astrologyStatus === "NOISE_GETSUTEKI")
        maxAstroFactor = "月命的殺";
      else if (astrologyStatus === "NOISE_NODE")
        maxAstroFactor = "月交点ノイズ";
      else if (astroFlags.includes("DECLINATION_WARNING"))
        maxAstroFactor = "偏角境界";
      else if (astrologyStatus === "SAFE") maxAstroFactor = "吉方位";

      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      const propSqmRent = totalRent / Number(p.size_sqm);

      const rentZScore = calculateZScore(
        propSqmRent,
        meanSqmRent,
        stdDevSqmRent,
      );
      const yieldScore = 100 - rentZScore + 50;

      const arbitrageScore = astrologyScore * 0.4 + yieldScore * 0.6;

      return {
        ...p,
        property_name: cleanPropertyName(p.property_name || ""),
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
        dateScores,
      };
    });

    // スコア順にソート
    scoredProperties.sort((a, b) => b.arbitrageScore - a.arbitrageScore);

    const upcomingDoyou = getUpcomingDoyouPeriod(targetDate);

    return NextResponse.json({
      properties: scoredProperties,
      metadata: {
        baseLat,
        baseLon,
        radiusKm,
        prefecture,
        layerMode,
        useClassical,
        useTrueNorth,
        nodeMapping,
        physicalMonthMode,
        targetDate: targetDate.toISOString().split("T")[0],
        meanSqmRent,
        stdDevSqmRent,
        totalAnalyzed: properties.length,
        totalCount,
        limit,
        dataUpdatedAt,
        staleHidden,
        maxSeenDays,
        // 取得した窓の中でまとめた重複件数。totalCount は生の行数のまま。
        duplicatesHidden,
        dedupe,
        upcomingDoyou,
        lunarPhase: {
          label: lunarPhaseLabel,
          scoreModifier: lunarPhaseScore,
          adviceText: lunarPhaseAdvice,
          lunarPhaseModifier,
        },
      },
    });
  } catch (error: any) {
    console.error("Failed to analyze arbitrage rentals:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
