import { NextResponse } from "next/server";
import { toResponseMessage } from "@/lib/errorMessage";
import type { Prisma } from "@prisma/client";
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
  type ActionIntent,
} from "@/utils/ephemerisEngine";
import { getGeomagneticData } from "@/utils/geomagnetism";
import { directionFromBearing } from "@/utils/directionGeo";
import { haLabelForLayer, type BoardLayer } from "@/lib/directionLabels";
import {
  buildDailyAstroStates,
  scoreDateForProperty,
  isAvoidStatus,
} from "@/utils/arbitrageAstro";
import {
  AXIS_ORDER,
  AxisScores,
  CandidateStrategy,
  DEFAULT_CANDIDATE_STRATEGY,
  DEFAULT_PRESET_ID,
  composeScore,
  getPreset,
  isCandidateStrategy,
  scoreBuilding,
  scoreCost,
  scoreLocalValue,
  scoreMarket,
  scoreProximity,
  scoreSpace,
  scoreStationAccess,
  tScore,
} from "@/utils/arbitrageScoring";

import {
  buildWhereSql,
  cleanPropertyName,
  selectSql,
  statsAndMunicipalitySql,
} from "@/utils/arbitrageQuery";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TenchusatsuMode,
  isTenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import {
  DEFAULT_PARTY_POLICY,
  PartyMember,
  PartyPolicy,
  combineOutcomes,
  isPartyPolicy,
  parsePartyParam,
  partyWeights,
  summarizeTiming,
} from "@/utils/arbitrageParty";


/**
 * 生年月日に関係しない印。誰にとっても同じもの。
 *
 * 天道・月相・土用は暦から、偏角は出発地から決まる。生年月日が
 * 入っていないときは、この 5 つだけを残す。空亡（VOID_TIME_HAZARD）と
 * 天体ライン（SUN/VENUS/JUPITER_LINE）は生年月日・出生地から決まる。
 */
const IMPERSONAL_ASTRO_FLAGS = [
  "DECLINATION_WARNING",
  "TENDO",
  "LUNAR_BOOST",
  "LUNAR_PENALTY",
  "DOYOU_HAZARD",
];

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // クエリパラメータのパース
  // 出発地は必須。既定値（東京）を黙って使うと、たとえば愛知県内を探しても
  // 全物件が東京から見て西〜南西の 1〜2 方位に潰れ、方位の点数が全件同じになる。
  // その結果 arbitrageScore は㎡単価だけで決まり、方位評価が事実上無効になる。
  const baseLat = parseFloat(searchParams.get("baseLat") || "");
  const baseLon = parseFloat(searchParams.get("baseLon") || "");
  const birthLat = parseFloat(searchParams.get("birthLat") || "NaN");
  const birthLon = parseFloat(searchParams.get("birthLon") || "NaN");
  const birthDateStr = searchParams.get("birthDate") || "";
  /**
   * 生年月日が入っているか。
   *
   * 本命殺・本命的殺・月命殺・月命的殺・天中殺・空亡は、すべて
   * 生年月日から決まる。空のまま計算すると parseSafeDate が今日を返し、
   * 「今日生まれ」の命式で判定した結果がそのまま物件ごとの吉凶として
   * 出る。本番で実測して見つけた（#202 で画面側の扇形は止めたが、
   * 物件ごとの判定はここで作られ続けていた）。
   *
   *   birthDate=[]  W:OPTIMAL  SW:SAFE  N:NOISE_VOID  NE:NOISE_HA
   *
   * 入っていないときは、個人の判定を**作らない**。値を偽らずに
   * 欠けたまま返す。総合点は composeScore が「その軸はデータ無し」
   * として扱い、axisCoverage が下がる（既にある仕組み）。
   */
  const hasBirthDate = birthDateStr.trim() !== "";
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
  const actionIntent = (searchParams.get("actionIntent") ||
    "MIGRATION") as ActionIntent;
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

  // 候補の切り出し方。既定は従来通り㎡単価の安い順。
  const candidateStrategyRaw =
    searchParams.get("candidateStrategy") || DEFAULT_CANDIDATE_STRATEGY;
  const candidateStrategy: CandidateStrategy = isCandidateStrategy(
    candidateStrategyRaw,
  )
    ? candidateStrategyRaw
    : DEFAULT_CANDIDATE_STRATEGY;

  // 月額予算（円）。cost 軸の基準。未指定なら cost 軸は算出しない。
  const budgetRaw = parseInt(searchParams.get("budget") || "", 10);
  const budgetYen = Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : null;

  // 総合スコアの重み。画面側でも重み替えができるので、ここは
  // 「サーバが返す既定順」を決めるためだけに使う。
  const weightPresetId = searchParams.get("weightPreset") || DEFAULT_PRESET_ID;
  const weights = getPreset(weightPresetId).weights;

  // 同行者。合流する親族のように、別の出発地から同じ移転先へ動く人を足せる。
  // 方位は起点によって変わるので、人ごとに別々に判定してから合成する。
  const partyPolicyRaw = searchParams.get("partyPolicy") || DEFAULT_PARTY_POLICY;
  const partyPolicy: PartyPolicy = isPartyPolicy(partyPolicyRaw)
    ? partyPolicyRaw
    : DEFAULT_PARTY_POLICY;
  // 天中殺（空亡）の効かせ方。流派と移動の性質で変わるので選べるようにする。
  const tenchusatsuRaw =
    searchParams.get("tenchusatsuMode") || DEFAULT_TENCHUSATSU_MODE;
  const tenchusatsuMode: TenchusatsuMode = isTenchusatsuMode(tenchusatsuRaw)
    ? tenchusatsuRaw
    : DEFAULT_TENCHUSATSU_MODE;
  // 転勤などやむを得ない移動か。他動的な移動は天中殺の影響を受けないとする流派に沿う。
  const involuntaryMove = searchParams.get("involuntaryMove") === "true";

  // 「いつなら全員で動けるか」を何日先まで見るか。
  // 対象日 1 日だけを見ていると、2 週間後なら開くという情報が出てこない。
  const horizonRaw = parseInt(searchParams.get("horizonDays") || "30", 10);
  const horizonDays = Number.isFinite(horizonRaw)
    ? Math.max(0, Math.min(90, horizonRaw))
    : 30;

  const minLat = parseFloat(searchParams.get("minLat") || "NaN");
  const maxLat = parseFloat(searchParams.get("maxLat") || "NaN");
  const minLon = parseFloat(searchParams.get("minLon") || "NaN");
  const maxLon = parseFloat(searchParams.get("maxLon") || "NaN");

  if (isNaN(baseLat) || isNaN(baseLon)) {
    return NextResponse.json(
      {
        error: "BASE_LOCATION_REQUIRED",
        message:
          "出発地（現在のお住まい）の座標が必要です。方位はここからの向きで決まるため、既定値では判定できません。",
      },
      { status: 400 },
    );
  }

  const targetDateStr = searchParams.get("targetDate") || "";
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

  // 1. 環境・運気エンジンの初期化
  const env = getSystemEnvironment(targetDate, baseLon, physicalMonthMode);

  const bDate = parseSafeDate(birthDateStr);

  /**
   * 判定に関わる人の一覧。先頭は必ず本人。
   *
   * 同行者は本人と同じ id を名乗れないようにしてある。上書きされると
   * 「あなたの方位」が別人のもので表示され、しかもそれと気付けない。
   */
  const party: PartyMember[] = [
    {
      id: "primary",
      name: (searchParams.get("selfName") || "あなた").slice(0, 40),
      birthDate: birthDateStr,
      birthLat: isNaN(birthLat) ? null : birthLat,
      birthLon: isNaN(birthLon) ? null : birthLon,
      baseLat,
      baseLon,
      weight: 1,
      stationary: false,
    },
    ...parsePartyParam(searchParams.get("party")).filter(
      (m) => m.id !== "primary",
    ),
  ];
  const memberWeights = partyWeights(party);

  // 九星気学のベクトル計算（本人ぶん。盤の表示など既存の応答項目に使う）
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

  // 動的偏角の取得。出発地ごとに違うので人ごとに引く。
  const declinations = await Promise.all(
    party.map(async (m) => {
      try {
        const geoData = await getGeomagneticData(
          m.baseLat,
          m.baseLon,
          targetDate.getTime(),
        );
        if (geoData && typeof geoData.declination === "number") {
          return geoData.declination;
        }
      } catch (err) {
        console.error(
          "Error fetching dynamic declination in rentals arbitrage API:",
          err,
        );
      }
      // 取得できなかったときは 0（＝補正なし）に倒す。以前は東京の -8.2 度を
      // 既定にしていたが、沖縄や北海道の利用者にも東京の偏角で計算した磁北の
      // 方位を見せることになる。判定は真北で行うのでここは注意表示にしか
      // 効かず、分からないときは「ずれない」として注意を出さないほうが正しい。
      return 0;
    }),
  );

  try {
    // 2. DBから物件データを取得 (緯度経度があるもの)
    const whereClause: Prisma.rental_propertiesWhereInput = {
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

    // 相場の基準値を出す集計を、物件の取得より先に走らせる。
    //
    // この問い合わせが見るのは絞り込み条件（whereSql / params）だけで、
    // 取得した物件には依存しない。にもかかわらず物件を待ってから投げて
    // いたので、**同じ 45 万行の DISTINCT ON と regexp_replace が順番に
    // 2 回**走っていた。並べれば待ち時間はおよそ片方ぶんで済む。
    //
    // await はしない。物件が 0 件のときは早期に返すので、そこで拾う。
    const combinedPromise = prisma.$queryRawUnsafe<
      Array<{
        stats: {
          mean: number | null;
          stddev: number | null;
          n: number;
          size_mean: number | null;
          size_stddev: number | null;
          age_mean: number | null;
          age_stddev: number | null;
          station_mean: number | null;
          station_stddev: number | null;
        } | null;
        municipalities: Array<{
          municipality: string;
          n: number;
          median: number | null;
        }>;
      }>
    >(statsAndMunicipalitySql(whereSql, dedupe), ...params);

    const dbStartedAt = Date.now();
    const [rawProperties, totalCount, freshness, beforeFreshnessCount] =
      await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        selectSql(whereSql, dedupe, params.length + 1, candidateStrategy),
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
      // 先に走らせた集計をここで捨てる。拾わないと、失敗したときに
      // unhandled rejection になる（結果はもう使わない）。
      void combinedPromise.catch(() => {});
      return NextResponse.json({
        properties: [],
        stats: {},
        metadata: { totalCount: 0, limit, dataUpdatedAt, staleHidden, maxSeenDays },
      });
    }

    // 相場の基準値は「取得した 500 件」ではなく絞り込み条件に合う全件から出す。
    // 安い順に切り出した集合で平均を取ると基準そのものが下がり、
    // どれも平均並みという評価になって裁定シグナルが消える。
    // 統計と市区町村の中央値を 2 本に分けて投げると、DISTINCT ON のための
    // 45 万行のソートが 2 回走る。ソートキーに名寄せ用の regexp_replace が
    // 入っているので、行ごとの正規表現評価まで丸ごと 2 回になる。
    // 1 回の評価にまとめてあり、投げるのは上（物件の取得と同時）。
    const combined = await combinedPromise;
    const dbElapsedMs = Date.now() - dbStartedAt;

    const statsRow = combined[0]?.stats ? [combined[0].stats] : [];
    const municipalityRows = combined[0]?.municipalities ?? [];
    const meanSqmRent = Number(statsRow[0]?.mean ?? 0);
    const stdDevSqmRent = Number(statsRow[0]?.stddev ?? 0);
    const uniqueCount = Number(statsRow[0]?.n ?? 0);
    const duplicatesHidden = dedupe ? Math.max(0, totalCount - uniqueCount) : 0;

    const meanSizeSqm = Number(statsRow[0]?.size_mean ?? 0);
    const stdDevSizeSqm = Number(statsRow[0]?.size_stddev ?? 0);
    const meanBuildingAge = Number(statsRow[0]?.age_mean ?? 0);
    const meanMinutesToStation = Number(statsRow[0]?.station_mean ?? 0);

    // 市区町村 → { 中央値, サンプル数 }。localValue 軸の参照表。
    const municipalityStats = new Map<
      string,
      { median: number; count: number }
    >();
    for (const row of municipalityRows) {
      const median = Number(row.median);
      if (!row.municipality || !Number.isFinite(median)) continue;
      municipalityStats.set(row.municipality, {
        median,
        count: Number(row.n),
      });
    }

    const scoredAt = new Date();

    // 日付リスト。先頭 7 日（対象日±3）は既存の dateScores 用で、
    // index 3 が対象日。そこから先は「いつなら全員で動けるか」を見るための
    // 走査期間。まとめて 1 回で作るのは、日付ごとの盤の計算が重く、
    // 7 日ぶんと走査期間ぶんを別々に回すと同じ日を二度計算するため。
    const dateList: Date[] = [];
    for (let i = -3; i <= Math.max(3, horizonDays); i++) {
      const d = new Date(targetDate);
      d.setDate(targetDate.getDate() + i);
      dateList.push(d);
    }
    const WINDOW_SIZE = 7;
    const TARGET_INDEX = 3;

    /**
     * 人ごとの前計算。盤・天中殺・八字は生年月日で決まるため、
     * 同行者ぶんはそれぞれ別に組み立てないと本人の運気で他人を判定してしまう。
     */
    const memberContexts = party.map((member, index) => {
      const memberBDate = parseSafeDate(member.birthDate);
      const hasBirthLocation =
        member.birthLat !== null && member.birthLon !== null;
      return {
        member,
        bDate: memberBDate,
        declination: declinations[index],
        hasBirthLocation,
        birthGst: hasBirthLocation
          ? AstroEngine.getGreenwichSiderealTime(memberBDate)
          : 0,
        sunLon: hasBirthLocation
          ? AstroEngine.getSolarLongitude(memberBDate)
          : 0,
        venusLon: hasBirthLocation
          ? AstroEngine.getVenusLongitude(memberBDate)
          : 0,
        jupiterLon: hasBirthLocation
          ? AstroEngine.getJupiterLongitude(memberBDate)
          : 0,
        states: member.stationary
          ? []
          : buildDailyAstroStates(dateList, {
              baseLon: member.baseLon,
              physicalMonthMode,
              useClassical,
              honmeiStar: getHonmeiStar(memberBDate),
              voidZodiacs: getPersonalVoidZodiac(memberBDate),
              actionIntent,
              nodeMapping,
              directionFilterMode,
              layerMode,
              lunarPhaseModifier,
              hasBirthLocation,
              bDate: memberBDate,
            }),
      };
    });

    /**
     * 「その人が、その方位へ、いつ動けるか」の表。
     *
     * 方位は 8 種類しかないので、物件ごとに走査期間ぶんを回すのは無駄になる
     * （500 物件 × 30 日 × 人数）。人 × 方位で一度だけ計算して使い回す。
     *
     * ここでは天体ライン（出生地と物件座標で決まる加点）を含めない。
     * ラインは日付によらず一律に加点されるので「どの日が開くか」は変えず、
     * 含めると方位ごとの共有ができなくなる。点はその分だけ控えめに出る。
     */
    const horizonDates = dateList.slice(TARGET_INDEX);
    const timingCache = new Map<
      string,
      { date: string; score: number; status: string; isAvoid: boolean }[]
    >();
    const timingSeriesFor = (
      memberIndex: number,
      direction: Direction | null,
      magneticDirection: Direction | null,
    ) => {
      const key = `${memberIndex}|${direction ?? "-"}|${magneticDirection ?? "-"}`;
      const cached = timingCache.get(key);
      if (cached) return cached;

      const ctx = memberContexts[memberIndex];
      const series = ctx.states.slice(TARGET_INDEX).map((state, i) => {
        const day = scoreDateForProperty(state, {
          hasCoordinates: direction !== null,
          direction,
          magneticDirection,
          useTrueNorth,
          hasSunLine: false,
          hasVenusLine: false,
          hasJupiterLine: false,
          hasBirthLocation: ctx.hasBirthLocation,
          actionIntent,
          tenchusatsuMode,
          involuntaryMove,
        });
        return {
          date: horizonDates[i]?.toISOString().split("T")[0] ?? day.date,
          score: day.score,
          status: day.status,
          isAvoid: isAvoidStatus(day.status),
        };
      });
      timingCache.set(key, series);
      return series;
    };

    // 3. 物件ごとにスコアリング
    const scoredProperties = properties.map((p) => {
      const hasCoordinates = !!(p.lat && p.lon);

      /**
       * 人ごとの判定。出発地が違えば同じ物件でも方位が違うため、
       * 距離・方位・天体ラインをそれぞれの起点と出生データで計算する。
       */
      const perMember = memberContexts.map((ctx) => {
        if (ctx.member.stationary || !hasCoordinates) {
          return {
            ctx,
            direction: null as Direction | null,
            magneticDirection: null as Direction | null,
            distanceKm: null as number | null,
            hasSunLine: false,
            hasVenusLine: false,
            hasJupiterLine: false,
            days: [] as ReturnType<typeof scoreDateForProperty>[],
          };
        }

        const distanceKm = getDistance(
          ctx.member.baseLat,
          ctx.member.baseLon,
          p.lat,
          p.lon,
        );
        const trueBearing = getBearing(
          ctx.member.baseLat,
          ctx.member.baseLon,
          p.lat,
          p.lon,
        );
        const direction = directionFromBearing(trueBearing, nodeMapping);
        const magneticDirection = directionFromBearing(
          (trueBearing - ctx.declination + 360) % 360,
          nodeMapping,
        );

        // 天体ラインは出生日時・出生地と物件位置で決まり、日付には依存しない
        let hasSunLine = false;
        let hasVenusLine = false;
        let hasJupiterLine = false;
        if (ctx.hasBirthLocation) {
          const relocatedASC = AstroEngine.getAscendant(
            ctx.bDate,
            p.lat,
            p.lon,
            ctx.birthGst,
          );
          const relocatedMC = AstroEngine.getMidheaven(
            ctx.bDate,
            p.lon,
            ctx.birthGst,
          );
          hasSunLine =
            Math.abs(relocatedMC - ctx.sunLon) < 5 ||
            Math.abs(relocatedASC - ctx.sunLon) < 5;
          hasVenusLine =
            Math.abs(relocatedMC - ctx.venusLon) < 5 ||
            Math.abs(relocatedASC - ctx.venusLon) < 5;
          hasJupiterLine =
            Math.abs(relocatedMC - ctx.jupiterLon) < 5 ||
            Math.abs(relocatedASC - ctx.jupiterLon) < 5;
        }

        const days = ctx.states
          .slice(0, WINDOW_SIZE)
          .map((state) =>
            scoreDateForProperty(state, {
              hasCoordinates,
              direction,
              magneticDirection,
              useTrueNorth,
              hasSunLine,
              hasVenusLine,
              hasJupiterLine,
              hasBirthLocation: ctx.hasBirthLocation,
              actionIntent,
              tenchusatsuMode,
              involuntaryMove,
            }),
          );

        return {
          ctx,
          direction,
          magneticDirection,
          distanceKm,
          hasSunLine,
          hasVenusLine,
          hasJupiterLine,
          days,
        };
      });

      const primary = perMember[0];
      const direction = primary.direction;
      const magneticDirection = primary.magneticDirection;
      const distanceKm = primary.distanceKm;
      const hasSunLine = primary.hasSunLine;
      const hasVenusLine = primary.hasVenusLine;
      const hasJupiterLine = primary.hasJupiterLine;

      /** 日付インデックスごとに全員ぶんをまとめる。 */
      const jointAt = (dayIndex: number) =>
        combineOutcomes(
          perMember.map((m) => {
            const day = m.days[dayIndex];
            return {
              memberId: m.ctx.member.id,
              name: m.ctx.member.name,
              direction: m.direction,
              magneticDirection: m.magneticDirection,
              distanceKm: m.distanceKm,
              score: day?.score ?? 0,
              status: day?.status ?? "UNKNOWN",
              isAvoid: day ? isAvoidStatus(day.status) : false,
              maxFactor: day?.status ?? "UNKNOWN",
            };
          }),
          partyPolicy,
          memberWeights,
        );

      /**
       * 画面に返す 7 日ぶんの系列。
       *
       * 中身（六曜・吉日・内訳）は日付で決まるので誰のものでも同じだが、
       * 方位で変わる status とスコアは「一番厳しい人」のものを採り、
       * 点だけ合成値に差し替える。全員で動く前提なので、通れない人が
       * いる日を「行ける日」として見せないため。
       */
      const jointByDay = primary.days.map((_, i) => jointAt(i));
      const dateScores = primary.days.map((day, i) => {
        const joint = jointByDay[i];
        if (party.length === 1 || !joint.bindingMember) return day;
        const binding = perMember.find(
          (m) => m.ctx.member.id === joint.bindingMember!.memberId,
        );
        const bindingDay = binding?.days[i] ?? day;
        return {
          ...bindingDay,
          // 日付そのものに紐づく情報は本人の系列のものを使う（同一のはず）。
          date: day.date,
          rokuyo: day.rokuyo,
          luckyDays: day.luckyDays,
          score: joint.score,
        };
      });

      // 目標日当日(配列のインデックス3)のデータに基づいて物件全体の吉凶ステータスを設定
      const targetJoint = jointByDay[TARGET_INDEX];
      const targetDay = dateScores[TARGET_INDEX];
      const targetDetails = targetDay.scoreDetails;
      const astrologyScore = targetDay.score;
      const astrologyStatus = targetDay.status;
      const isTendo = targetDay.luckyDays.isTendo;

      /**
       * いつなら全員で動けるか。
       *
       * 対象日が凶でも、走査期間の中に全員が動ける日があるなら候補として
       * 残す価値がある。逆に 30 日先まで 1 日も開かないなら、物件条件が
       * どれだけ良くてもその移転計画は成立しない。
       */
      let timing = null as ReturnType<typeof summarizeTiming> | null;
      if (horizonDays > 0 && hasCoordinates && hasBirthDate) {
        const series = perMember.map((m) =>
          m.ctx.member.stationary || m.direction === null
            ? null
            : timingSeriesFor(
                memberContexts.indexOf(m.ctx),
                m.direction,
                m.magneticDirection,
              ),
        );
        const dayCount = series.find((s) => s !== null)?.length ?? 0;
        const daily: { date: string; joint: ReturnType<typeof combineOutcomes> }[] =
          [];
        for (let i = 0; i < dayCount; i++) {
          const outcomes = perMember.map((m, mi) => {
            const entry = series[mi]?.[i];
            return {
              memberId: m.ctx.member.id,
              name: m.ctx.member.name,
              direction: m.direction,
              magneticDirection: m.magneticDirection,
              distanceKm: m.distanceKm,
              score: entry?.score ?? 0,
              status: entry?.status ?? "UNKNOWN",
              isAvoid: entry?.isAvoid ?? false,
              maxFactor: entry?.status ?? "UNKNOWN",
            };
          });
          daily.push({
            date: series.find((s) => s !== null)?.[i]?.date ?? "",
            joint: combineOutcomes(outcomes, partyPolicy, memberWeights),
          });
        }
        timing = summarizeTiming(daily);
      }

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
      else if (astrologyStatus === "NOISE_TENCHU")
        maxAstroFactor = "天中殺期間 (移転NG)";
      else if (astrologyStatus === "NOISE_GOU") maxAstroFactor = "五黄殺";
      else if (astrologyStatus === "NOISE_ANKEN") maxAstroFactor = "暗剣殺";
      // 破は盤で呼び名が変わる。月盤で絞っているのに「歳破」と出していた。
      else if (astrologyStatus === "NOISE_HA")
        maxAstroFactor = haLabelForLayer(layerMode as BoardLayer);
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
      // SAFE は「凶ではない」であって吉ではない。auspiciousDays.isAuspicious は
      // OPTIMAL 系だけを吉とし、記事ページも「平」と書く。ここだけ「吉方位」に
      // していたため、物件検索で吉と出た方位が記事では吉でない、が起きていた。
      else if (astrologyStatus === "SAFE") maxAstroFactor = "平穏";

      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      const sizeSqm = Number(p.size_sqm);
      const propSqmRent = totalRent / sizeSqm;

      // 割安度は「㎡単価が安いほど高得点」なので偏差値を反転させる。
      //
      // 以前は `100 - tScore + 50` としており、相場ちょうどの物件が 100 点に
      // なっていた。総合スコアの 6 割がこの値だったため、ほぼ全件が
      // おすすめ度 5 つ星（80 点以上）で表示され、順位が読めなくなっていた。
      const yieldScore = tScore(propSqmRent, meanSqmRent, stdDevSqmRent, true);

      const municipality: string | null = p.municipality ?? null;
      const localStats = municipality
        ? municipalityStats.get(municipality)
        : undefined;
      const listingCount = Number(p.listing_count ?? 1);

      const axes: AxisScores = {
        value: yieldScore,
        localValue: scoreLocalValue(
          propSqmRent,
          localStats?.median ?? null,
          localStats?.count ?? null,
        ),
        // 生年月日が無いときは欠測。0 でも 50 でもなく「無い」を渡す。
        astrology: hasBirthDate ? astrologyScore : null,
        // 移動する人が 2 人以上いるときだけ意味を持つ軸。
        // 平均だけ見ていると「片方に大吉・片方に大凶」と「全員そこそこ」が
        // 同じ点になるため、割れているかどうかを別に持つ。
        harmony: hasBirthDate ? targetJoint.harmony : null,
        // 走査期間のうち全員が動ける日の割合。対象日 1 日が凶でも、
        // 近い将来に開くなら候補として残すための軸。
        timing:
          timing && timing.scannedDays > 0
            ? (timing.allClearDays / timing.scannedDays) * 100
            : null,
        access: scoreStationAccess(p.minutes_to_station),
        proximity: scoreProximity(distanceKm),
        space: scoreSpace(sizeSqm, p.layout, meanSizeSqm, stdDevSizeSqm),
        building: scoreBuilding(p.building_age, p.floor, p.is_new_build),
        market: scoreMarket(p.first_seen_at, listingCount, scoredAt),
        cost: scoreCost(totalRent, budgetYen),
      };

      const composed = composeScore(axes, weights);

      // 掲載開始からの経過日数。market 軸の内訳として画面に出す。
      const listedDays = p.first_seen_at
        ? Math.max(
            0,
            Math.round(
              (scoredAt.getTime() - new Date(p.first_seen_at).getTime()) /
                (24 * 60 * 60 * 1000),
            ),
          )
        : null;

      return {
        ...p,
        property_name: cleanPropertyName(p.property_name || ""),
        totalRent,
        propSqmRent,
        distanceKm,
        direction,
        magneticDirection,
        astrologyStatus: hasBirthDate ? astrologyStatus : null,
        astrologyScore: hasBirthDate ? astrologyScore : null,
        /*
          印のうち、生年月日に関係しないものだけ残す。天道・六曜・
          土用・月相・偏角は誰にとっても同じ。空亡と天体ラインは
          生年月日／出生地から決まるので落とす。
        */
        astroFlags: hasBirthDate
          ? astroFlags
          : astroFlags.filter((f) => IMPERSONAL_ASTRO_FLAGS.includes(f)),
        yieldScore,
        // 既定の重みでの総合点。画面側で重みを変えたときは再計算される。
        arbitrageScore: composed.score,
        axes,
        /**
         * 同行者ぶんの内訳。誰の方位がどうで、誰が引っかかっているか。
         * 「全員にとってどうか」は 1 つの点に潰れてしまうので、
         * 判断の材料として人ごとの結果をそのまま返す。
         */
        party: !hasBirthDate ? null : {
          policy: partyPolicy,
          score: targetJoint.score,
          everyoneSafe: targetJoint.everyoneSafe,
          blockedBy: targetJoint.blockedBy,
          spread: targetJoint.spread,
          harmony: targetJoint.harmony,
          bindingMember: targetJoint.bindingMember,
          members: targetJoint.members,
        },
        /** いつなら全員で動けるか。horizonDays=0 なら null。 */
        timing: hasBirthDate ? timing : null,
        // どれだけの重みが実データで埋まったか。低いほど根拠が薄い。
        axisCoverage: composed.coverage,
        axisInputs: {
          municipality,
          localMedianSqmRent: localStats?.median ?? null,
          localSampleCount: localStats?.count ?? null,
          listingCount,
          listedDays,
        },
        isTendo,
        maxAstroFactor: hasBirthDate ? maxAstroFactor : null,
        // 日ごとの点は本命星と天中殺で決まる。受け手（AstroGridCalendar）は
        // 空配列なら何も描かないので、無い状態をそのまま渡せる。
        dateScores: hasBirthDate ? dateScores : [],
      };
    });

    // 避けるべき方位・期間のものは、どれだけ安くても上には出さない。
    //
    // arbitrageScore は方位 0.4 : 割安 0.6 の加重なので、五黄殺でも十分安ければ
    // 上位に来ていた。方位とタイミングで意思決定するための道具なので、
    // 安さで凶を挽回できる合成は目的と逆になる。
    // 完全に隠すのではなく順位で下に置き、フィルタで見られる状態は残す。
    scoredProperties.sort((a, b) => {
      // 判定が無いとき（生年月日未入力）は両方 0 になり、割安さだけの
      // 並びになる。凶を下げる仕掛けは、判定が出せるときだけ働く。
      const aAvoid = isAvoidStatus(a.astrologyStatus ?? "") ? 1 : 0;
      const bAvoid = isAvoidStatus(b.astrologyStatus ?? "") ? 1 : 0;
      if (aAvoid !== bAvoid) return aAvoid - bAvoid;
      return b.arbitrageScore - a.arbitrageScore;
    });

    // 遅いという報告に対して、どこが遅いのかを言えるようにする。
    //
    // この応答は「DB の待ち」と「盤の計算」の 2 つでできている。前者は
    // 絞り込みの広さで、後者は走査日数（horizonDays）と同行者の人数で
    // 決まる。片方しか見ずに手を入れても外す。ログに 1 行残し、同じ値を
    // metadata.timing でも返す。Cloud Run のログを開ける人だけが数字を
    // 見られる状態だと、報告と調査のあいだに毎回一往復挟まる。
    const computeMs = Date.now() - dbStartedAt - dbElapsedMs;
    console.log(
      `arbitrage: db ${dbElapsedMs}ms / compute ${computeMs}ms ` +
        `(pref=${prefecture} radius=${radiusKm} rows=${properties.length}/${totalCount} ` +
        `horizon=${horizonDays} party=${party.length})`,
    );

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
        // 各軸が「相対評価」であることを画面で説明するための母集団の姿。
        population: {
          meanSqmRent,
          stdDevSqmRent,
          meanSizeSqm,
          stdDevSizeSqm,
          meanBuildingAge,
          meanMinutesToStation,
          municipalityCount: municipalityStats.size,
        },
        candidateStrategy,
        tenchusatsuMode,
        involuntaryMove,
        weightPreset: weightPresetId,
        budget: budgetYen,
        axisKeys: AXIS_ORDER,
        // 誰を、どうまとめて、何日先まで見たか。画面に前提を出すため。
        party: {
          policy: partyPolicy,
          horizonDays,
          members: party.map((m) => ({
            id: m.id,
            name: m.name,
            baseLat: m.baseLat,
            baseLon: m.baseLon,
            weight: m.weight,
            stationary: m.stationary,
          })),
        },
        totalAnalyzed: properties.length,
        totalCount,
        limit,
        dataUpdatedAt,
        staleHidden,
        maxSeenDays,
        // 走査にかかった時間の内訳。画面が鮮度の隣に出す。
        timing: { dbMs: dbElapsedMs, computeMs },
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
  } catch (error) {
    console.error("Failed to analyze arbitrage rentals:", error);
    return NextResponse.json(
      {
        error: toResponseMessage(error, "Failed to analyze arbitrage rentals"),
      },
      { status: 500 },
    );
  }
}
