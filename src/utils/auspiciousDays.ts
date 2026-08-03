/**
 * 「年盤・月盤・日盤がすべて吉になる日」を列挙する。
 *
 * 方位の良し悪しは、年・月・日それぞれの盤で別々に決まる。年盤で大吉でも
 * 月盤で歳破なら動けない、ということが普通に起きるため、実際に動ける日を
 * 知るには三つを重ねて数えるしかない。これまでこの重ね合わせは画面の
 * ヒートマップを目で追って読み取るしかなく、「今日から立春までに何日ある
 * のか」「その中でどれが天赦日か」を出す手段が無かった。
 *
 * 年盤は立春で切り替わる。ある方位が年盤で吉である期間には必ず終わりが
 * あり、そこを過ぎると同じ方位が平凡や凶に変わる。期限を知らずに検討して
 * いると、窓が閉じてから気付くことになるため、窓の終わりも併せて返す。
 */
import {
  getCurrentEnvironmentalFrequencies,
  generateBoard,
  calculateVectorCollision,
  filterCollisionByMode,
  getCurrentZodiac,
  Direction,
} from "@/utils/ephemerisEngine";
import { getRokuyo, getLuckyDays } from "@/utils/lunar";
import { directionBoardInstant } from "@/utils/boardInstant";
import {
  TenchusatsuMode,
  VoidScopes,
  evaluateTenchusatsu,
} from "@/utils/tenchusatsuPolicy";

export const ALL_DIRECTIONS: Direction[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

// Direction には CENTER（中宮）も含まれるが、移転の方位としては使わない。
export const DIRECTION_LABELS: Record<string, string> = {
  N: "北",
  NE: "北東",
  E: "東",
  SE: "南東",
  S: "南",
  SW: "南西",
  W: "西",
  NW: "北西",
};

/** 吉と見なす判定。OPTIMAL 系のみを吉とし、SAFE（平）は含めない。 */
export function isAuspicious(status: string | undefined): boolean {
  return status === "OPTIMAL" || status === "OPTIMAL_REGULAR";
}

/** 凶。移転を避けるべき判定。 */
export function isInauspicious(status: string | undefined): boolean {
  return !!status && status.startsWith("NOISE");
}

export interface AuspiciousDayParams {
  /** 気学の本命星（classical）。 */
  honmeiStar: number;
  /** 天中殺（空亡）の支。 */
  voidZodiacs: string[];
  /** 現住地の経度。太陽時と盤の基準になる。 */
  lon: number;
  /** 判定する方位。 */
  direction: Direction;
  /** 天中殺の効かせ方。 */
  tenchusatsuMode: TenchusatsuMode;
  /** 自発的な移動か（吉方位取りは自発なので、通常 false のまま）。 */
  involuntaryMove?: boolean;
  /** 方位の絞り込みモード。既定は composite。 */
  directionFilterMode?: string;
}

export interface DayVerdict {
  /** YYYY-MM-DD */
  date: string;
  /** 0=日曜 */
  weekday: number;
  yearLayer: string;
  monthLayer: string;
  dayLayer: string;
  /** 三盤を合成した最終判定。 */
  finalStatus: string;
  /** 年・月・日すべてが凶でなく、かつ最終が吉か。 */
  isTripleAuspicious: boolean;
  /** 天中殺の当たり具合。 */
  voidScopes: VoidScopes;
  /** 設定に従って移転不可とされるか。 */
  blockedByTenchusatsu: boolean;
  /** 天道がこの方位に回座しているか。 */
  hasTendo: boolean;
  rokuyo: string;
  isTensho: boolean;
  isIchiryumanbai: boolean;
  /** 画面に出す暦注などの札。 */
  tags: string[];
}

/**
 * 1 日ぶんの盤を組み立て、全方位の判定をまとめて返す。
 *
 * 盤の計算（天体位置・干支・衝突判定）は方位に依存しない。方位ごとに
 * 呼び直すと同じ計算を 8 回繰り返すことになり、全方位 × 半年で
 * 実測 13 秒かかっていた。日ごとに 1 回だけ計算して切り出す。
 */
export function judgeDayAllDirections(
  date: Date,
  p: Omit<AuspiciousDayParams, "direction">,
): Record<string, DayVerdict> {
  const result: Record<string, DayVerdict> = {};
  const shared = computeDayLayers(date, p);
  for (const dir of ALL_DIRECTIONS) {
    result[dir] = buildVerdict(date, dir, shared);
  }
  return result;
}

/** 1 日ぶんの判定。 */
export function judgeDay(date: Date, p: AuspiciousDayParams): DayVerdict {
  return buildVerdict(date, p.direction, computeDayLayers(date, p));
}

interface DayLayers {
  layers: ReturnType<typeof filterCollisionByMode>;
  voidScopes: VoidScopes;
  blocked: boolean;
  rokuyo: string;
  isTensho: boolean;
  isIchiryumanbai: boolean;
}

function computeDayLayers(
  date: Date,
  p: Omit<AuspiciousDayParams, "direction">,
): DayLayers {
  const instant = directionBoardInstant(date, 0, p.lon);
  const env = getCurrentEnvironmentalFrequencies(instant, p.lon, "independent");

  const yB = generateBoard(env.classicalYearStar);
  const mB = generateBoard(env.classicalMonthStar);
  const dB = generateBoard(env.classicalDayStar);

  const raw = calculateVectorCollision(
    p.honmeiStar as any,
    yB,
    mB,
    dB,
    p.voidZodiacs,
    env.raw.lunarNode,
    "MIGRATION",
    instant,
    p.lon,
    undefined,
    "traditional",
  );
  const layers = filterCollisionByMode(
    raw,
    p.honmeiStar as any,
    null,
    p.voidZodiacs,
    (p.directionFilterMode ?? "composite") as any,
    yB,
    mB,
    dB,
  );

  const zodiacs = getCurrentZodiac(
    new Date(instant.toISOString().split("T")[0]),
    p.lon,
  );
  const voidScopes: VoidScopes = {
    year: p.voidZodiacs.includes(zodiacs.yearZodiac),
    month: p.voidZodiacs.includes(zodiacs.monthZodiac),
    day: p.voidZodiacs.includes(zodiacs.dayZodiac),
  };
  const verdict = evaluateTenchusatsu(
    voidScopes,
    p.tenchusatsuMode,
    p.involuntaryMove ?? false,
  );

  const lucky = getLuckyDays(date);
  const rokuyo = getRokuyo(date) ?? "";

  return {
    layers,
    voidScopes,
    blocked: verdict.blocks,
    rokuyo,
    isTensho: !!lucky?.isTensho,
    isIchiryumanbai: !!lucky?.isIchiryumanbai,
  };
}

/** 共有した盤から、ある方位ぶんの判定を切り出す。 */
function buildVerdict(
  date: Date,
  dir: Direction,
  shared: DayLayers,
): DayVerdict {
  const { layers, voidScopes, blocked, rokuyo } = shared;
  const yearLayer = (layers.yearLayer[dir] ?? "SAFE") as string;
  const monthLayer = (layers.monthLayer[dir] ?? "SAFE") as string;
  const dayLayer = (layers.dayLayer[dir] ?? "SAFE") as string;
  const finalStatus = (layers.finalVectors[dir] ?? "SAFE") as string;
  const hasTendo = layers.tendoDirection === dir;

  const tags: string[] = [];
  if (shared.isTensho) tags.push("天赦日");
  if (shared.isIchiryumanbai) tags.push("一粒万倍日");
  if (rokuyo.includes("大安")) tags.push("大安");
  if (hasTendo) tags.push("天道");

  // 三盤吉の条件。最終判定が吉であることに加えて、どの盤にも凶が
  // 混ざっていないことを求める。最終だけ見ると、天道の補正で凶が
  // 打ち消された日まで「三盤とも吉」として数えてしまう。
  const isTripleAuspicious =
    isAuspicious(finalStatus) &&
    !isInauspicious(yearLayer) &&
    !isInauspicious(monthLayer) &&
    !isInauspicious(dayLayer);

  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    weekday: date.getDay(),
    yearLayer,
    monthLayer,
    dayLayer,
    finalStatus,
    isTripleAuspicious,
    voidScopes,
    blockedByTenchusatsu: blocked,
    hasTendo,
    rokuyo,
    isTensho: shared.isTensho,
    isIchiryumanbai: shared.isIchiryumanbai,
    tags,
  };
}

export interface AuspiciousWindow {
  /** 年盤がこの方位を吉としている期間の最終日（YYYY-MM-DD）。無ければ null。 */
  yearBoardValidUntil: string | null;
  /** その翌日から年盤で何になるか。期限を過ぎたらどうなるかを示す。 */
  afterYearBoardStatus: string | null;
}

/**
 * 年盤が切り替わる日を探す。
 *
 * 立春の日付を暦から引くのではなく、盤そのものが変わる日を走査して求める。
 * 暦の計算とエンジンの内部でずれが出ると、画面の期限と実際の判定が
 * 食い違うため、エンジンの出す年星の変わり目を正とする。
 */
export function findYearBoardWindow(
  from: Date,
  p: AuspiciousDayParams,
  maxDays = 400,
): AuspiciousWindow {
  const boundary = findYearBoardBoundary(from, p.lon, maxDays);
  if (!boundary) return { yearBoardValidUntil: null, afterYearBoardStatus: null };
  return {
    yearBoardValidUntil: formatDate(boundary.lastDay),
    afterYearBoardStatus: judgeDay(boundary.nextDay, p).yearLayer,
  };
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 年盤が切り替わる境目そのものを探す。方位には依存しない。
 *
 * 全方位を出すときにここを方位ごとに走らせると、400 日ぶんの走査が
 * 8 回になる。境目は 1 回求めれば足りる。
 */
function findYearBoardBoundary(
  from: Date,
  lon: number,
  maxDays: number,
): { lastDay: Date; nextDay: Date } | null {
  const yearStarAt = (d: Date) =>
    getCurrentEnvironmentalFrequencies(
      directionBoardInstant(d, 0, lon),
      lon,
      "independent",
    ).classicalYearStar;

  const startStar = yearStarAt(from);
  const cursor = new Date(from);
  for (let i = 0; i < maxDays; i++) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);
    if (yearStarAt(next) !== startStar) {
      return { lastDay: new Date(cursor), nextDay: next };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

export interface AuspiciousSummary {
  direction: Direction;
  directionLabel: string;
  /** 走査した日数。 */
  scannedDays: number;
  /** 三盤吉の日（天中殺を考慮しない素の数）。 */
  tripleAuspiciousDays: number;
  /** そのうち、天中殺の設定で移転不可とされない日。 */
  availableDays: number;
  /** 天中殺で落ちた日数。判断の材料として、両方の数を持つ。 */
  blockedByTenchusatsuDays: number;
  window: AuspiciousWindow;
  days: DayVerdict[];
}

/**
 * 期間内の三盤吉日を列挙する。
 *
 * 天中殺で落ちる日も days には残し、印を付けて返す。落とした結果だけを
 * 見せると「天中殺を勘定に入れるかどうかで何日変わるのか」が分からず、
 * その判断自体ができなくなる。
 */
export function findAuspiciousDays(
  from: Date,
  to: Date,
  p: AuspiciousDayParams,
): AuspiciousSummary {
  const days: DayVerdict[] = [];
  let scanned = 0;
  const cursor = new Date(from);
  cursor.setHours(12, 0, 0, 0);
  const end = new Date(to);
  end.setHours(12, 0, 0, 0);

  // 走査上限。範囲指定を誤っても止まらなくならないようにする。
  const MAX = 800;
  while (cursor <= end && scanned < MAX) {
    const verdict = judgeDay(new Date(cursor), p);
    scanned++;
    if (verdict.isTripleAuspicious) days.push(verdict);
    cursor.setDate(cursor.getDate() + 1);
  }

  const blocked = days.filter((d) => d.blockedByTenchusatsu).length;

  return {
    direction: p.direction,
    directionLabel: DIRECTION_LABELS[p.direction],
    scannedDays: scanned,
    tripleAuspiciousDays: days.length,
    availableDays: days.length - blocked,
    blockedByTenchusatsuDays: blocked,
    window: findYearBoardWindow(from, p),
    days,
  };
}

/**
 * 8 方位すべてを走査して、吉日が多い順に返す。どこへ動くべきかの一覧。
 *
 * 日ごとに盤を 1 回だけ組み、そこから 8 方位を切り出す。方位ごとに
 * findAuspiciousDays を呼ぶと同じ盤を 8 回計算することになる。
 * 年盤の窓も方位に依存しない部分が大半なので、走査は 1 回で済ませる。
 */
export function findAuspiciousDaysAllDirections(
  from: Date,
  to: Date,
  p: Omit<AuspiciousDayParams, "direction">,
): AuspiciousSummary[] {
  const perDirection: Record<string, DayVerdict[]> = {};
  for (const dir of ALL_DIRECTIONS) perDirection[dir] = [];

  let scanned = 0;
  const cursor = new Date(from);
  cursor.setHours(12, 0, 0, 0);
  const end = new Date(to);
  end.setHours(12, 0, 0, 0);

  const MAX = 800;
  while (cursor <= end && scanned < MAX) {
    const all = judgeDayAllDirections(new Date(cursor), p);
    scanned++;
    for (const dir of ALL_DIRECTIONS) {
      if (all[dir].isTripleAuspicious) perDirection[dir].push(all[dir]);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // 年盤の境目は方位に依存しないので 1 回だけ求め、
  // 境目翌日の盤も 1 回だけ組んで 8 方位ぶんを切り出す。
  const boundary = findYearBoardBoundary(from, p.lon, 400);
  const afterLayers = boundary
    ? judgeDayAllDirections(boundary.nextDay, p)
    : null;

  return ALL_DIRECTIONS.map((direction) => {
    const days = perDirection[direction];
    const blocked = days.filter((d) => d.blockedByTenchusatsu).length;
    return {
      direction,
      directionLabel: DIRECTION_LABELS[direction],
      scannedDays: scanned,
      tripleAuspiciousDays: days.length,
      availableDays: days.length - blocked,
      blockedByTenchusatsuDays: blocked,
      window: {
        yearBoardValidUntil: boundary ? formatDate(boundary.lastDay) : null,
        afterYearBoardStatus: afterLayers
          ? afterLayers[direction].yearLayer
          : null,
      },
      days,
    };
  }).sort((a, b) => b.availableDays - a.availableDays);
}
