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
  type DirectionFilterMode,
  type StarFrequency,
} from "@/utils/ephemerisEngine";
import { getRokuyo, getLuckyDays } from "@/utils/lunar";
import { DIRECTION_LABELS as GEO_DIRECTION_LABELS } from "@/utils/directionGeo";
import { directionBoardInstant, forecastAnchorMs } from "@/utils/boardInstant";
import { getZonedDateTimeFields } from "@/utils/solarTime";
import { isFatalNoise, isNoise } from "@/utils/noiseSeverity";
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

/*
  ラベルの表は `utils/directionGeo` が正（#610 で 1 か所に寄せた）。
  ここでは `Direction`（CENTER を含む型）で索引する箇所があるため、
  緩い索引型に写して再輸出する。CENTER を引くと undefined になるのは
  元の表と同じ挙動（移転の方位としては使わないので引かれない）。
*/
export const DIRECTION_LABELS: Record<string, string> = {
  ...GEO_DIRECTION_LABELS,
};

/** 吉と見なす判定。OPTIMAL 系のみを吉とし、SAFE（平）は含めない。 */
export function isAuspicious(status: string | undefined): boolean {
  return status === "OPTIMAL" || status === "OPTIMAL_REGULAR";
}

/**
 * 凶。移転を避けるべき判定。
 *
 * 定義そのものは noiseSeverity が持つ。このファイルは判定エンジンを
 * 値として import しているので、画面から直に呼ぶとエンジンがバンドルに
 * 乗る。軽いほうを呼びたい画面は `isNoise` を直接使うこと。
 */
export function isInauspicious(status: string | undefined): boolean {
  return isNoise(status);
}

export interface AuspiciousDayParams {
  /** 気学の本命星（classical）。1〜9 の九星。 */
  honmeiStar: StarFrequency;
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
  directionFilterMode?: DirectionFilterMode;
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
  /**
   * この方位に土用殺が当たっているか。
   *
   * 土用殺は年盤・月盤・日盤のどの層にも出ず、**最終だけを NOISE_GOU
   * （＝画面のどこでも「五黄殺」）に上書きする。**そのため、三盤とも
   * 大吉なのに段階が X（五大凶殺あり）になり、画面から理由が分からない
   * 日ができる。実測で本命七赤・子丑空亡の 400 日 × 8 方位のうち 8 通りが
   * 「三盤とも OPTIMAL なのに最終が NOISE_GOU」だった（秋土用の北西・
   * 春土用の南東など）。
   *
   * 状態そのものを NOISE_GOU から分けると配色と札の対応が全画面に
   * 波及するので、まずは**理由を持ち回れるようにする**。この値を
   * 読まなければ従来どおりで、判定は一切変わらない。
   *
   * **既定（composite）以外では常に false。**`filterCollisionByMode` は
   * 絞り込みモードごとに最終を組み直すが、そこで土用殺を当て直して
   * いないため、environmental などでは土用殺が判定から消える。
   * ここはその実態に合わせてある（画面が「土用殺なのに印が無い」と
   * 食い違わないようにするため）。
   */
  isDoyouSatsu: boolean;
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
    p.honmeiStar,
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
    p.honmeiStar,
    null,
    p.voidZodiacs,
    p.directionFilterMode ?? "composite",
    yB,
    mB,
    dB,
  );

  // 天中殺に使う干支は、**盤と同じ時刻**で引く。
  //
  // 以前はここだけ `new Date(instant.toISOString().split("T")[0])` と
  // 日付だけを切り出して渡していた。日付文字列は UTC の 0 時として
  // 解釈されるので、実際には**日本時間の 9 時**の干支を引いていた。
  // 盤（`calculateVectorCollision`）は `instant`（日本時間の正午を
  // 太陽時に直した時刻）の干支を使うので、同じ日の同じ判定の中で
  // 干支を 2 か所・別々の時刻で計算していたことになる。
  //
  // 節入りが 9 時〜正午の間に来る日にずれが出る。1460 日（2026〜
  // 2029 年）を走査して 8 日が該当し、いずれも月支が 1 つ手前の月の
  // ままだった（2026-07-07 小暑・2026-12-07 大雪・2027-02-04 立春・
  // 2027-04-05 清明・2028-03-05 啓蟄・2028-09-07 白露・2029-01-05
  // 小寒・2029-11-07 立冬）。月天中殺の当たり外れがその日だけ
  // 前月の支で決まっていた。
  //
  // 「その日の代表点は正午」が全体の方針（`boardInstant.ts`）なので、
  // 9 時側が誤り。`instant` をそのまま渡して 1 か所に寄せる。
  // getCurrentZodiac の呼び出しが 1 日 2 回から 1 回に減る副次効果もある。
  const zodiacs = getCurrentZodiac(instant, p.lon);
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
  // 最終に実際に当たっているときだけ真にする。絞り込みモードによっては
  // 最終が組み直されて土用殺が消えるので、方位の一致だけでは足りない。
  const isDoyouSatsu =
    layers.doyouSatsuDirection === dir && finalStatus === "NOISE_GOU";

  const tags: string[] = [];
  if (shared.isTensho) tags.push("天赦日");
  if (shared.isIchiryumanbai) tags.push("一粒万倍日");
  if (rokuyo.includes("大安")) tags.push("大安");
  if (hasTendo) tags.push("天道");

  // 三盤吉の条件。**三つとも吉であること**を求める。
  //
  // 以前は「最終が吉」＋「どの盤にも凶が無い」だけだった。移転の最終判定
  // （`calculateVectorCollision` の MIGRATION）は `criticalLayers = [年, 月]`
  // だけを見るので、**年か月のどちらか 1 枚が吉なら最終は吉になる。**
  // つまり旧条件は「年か月が吉で、どの盤にも凶が無い」と同じ意味で、
  // 日盤どころか 3 枚のうち 1 枚しか吉でない日まで「三盤吉」と数えていた。
  //
  // 本命星 9 × 400 日 × 8 方位で実測すると、S（三盤吉）と出た 2,072 通りの
  // 内訳は 吉1盤 894 / 吉2盤 900 / **吉3盤 278**。名乗りどおりだったのは
  // 13.4% しかない。ファイル冒頭の「年盤・月盤・日盤がすべて吉になる日を
  // 列挙する」という趣旨とも食い違っていた。
  //
  // 段階 A（吉2盤・凶なし）が 1 件も出なかったのも同じ原因。吉が 2 枚あれば
  // 年か月が必ず含まれるので、A に落ちる前に S を取ってしまう。
  // `__tests__/auspiciousRanking.test.ts` は前から
  // `gradeVerdict(verdict("OPTIMAL", "OPTIMAL", "SAFE", "SAFE")) === "A"` を
  // 期待していて、実在しない組み合わせを手で作っていたから通っていた。
  //
  // `isAuspicious` は `isInauspicious` を必ず外すので、凶なしの条件は含む。
  // 最終の判定も残す。土用殺は層に出ず最終だけを NOISE_GOU にするため、
  // これを外すと土用殺の日が三盤吉に混ざる。
  const isTripleAuspicious =
    isAuspicious(finalStatus) &&
    isAuspicious(yearLayer) &&
    isAuspicious(monthLayer) &&
    isAuspicious(dayLayer);

  return {
    date: formatDate(date),
    weekday: weekdayOf(date),
    yearLayer,
    monthLayer,
    dayLayer,
    finalStatus,
    isTripleAuspicious,
    voidScopes,
    blockedByTenchusatsu: blocked,
    hasTendo,
    isDoyouSatsu,
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
  if (!boundary)
    return { yearBoardValidUntil: null, afterYearBoardStatus: null };
  return {
    yearBoardValidUntil: formatDate(boundary.lastDay),
    afterYearBoardStatus: judgeDay(boundary.nextDay, p).yearLayer,
  };
}

/**
 * 日付の組み立てを実行環境のタイムゾーンから切り離す。
 *
 * ここは全部 `Date` の**ローカル**のゲッター／セッターで書かれていた。
 * `getFullYear` も `setHours` も実行環境のタイムゾーンで動くので、
 * 本番（Cloud Run＝UTC）とブラウザ（日本＝JST）で意味が変わる。
 *
 * 判定そのものは `forecastAnchorMs` が日本時間の正午に寄せているので
 * （#563）、**ラベルと走査もそこに合わせる**。同じ日を指す 3 つの表現
 * （評価する時刻・YYYY-MM-DD・曜日）が 1 か所から出るようにする。
 *
 * 実害が出ていたのは `findYearBoardWindow` だった。走査ループは
 * `setHours(12)` を通していたのに、年盤の窓を探すところだけ生の `from`
 * を使っていて、`from` が時刻を持つと立春の期限が 1 日早く出た。
 * 実測で、正しくは 2027-02-03 のところ `from` を JST 深夜にすると
 * 2027-02-02 になった。いまの画面はどれも `from` を YYYY-MM-DD で
 * 送るので表には出ていないが、`from` を省いたときのサーバ既定は
 * `new Date()` なので、日本時間の 0〜9 時に該当する。
 */

/** その Date が指す「日本時間の日」の正午。盤の代表点そのもの。 */
function jstNoonOf(d: Date): Date {
  return new Date(forecastAnchorMs(d));
}

/** 日本時間基準の YYYY-MM-DD。 */
function formatDate(d: Date): string {
  const f = getZonedDateTimeFields(d, 9);
  return `${f.year}-${String(f.month).padStart(2, "0")}-${String(f.day).padStart(2, "0")}`;
}

/** 日本時間基準の曜日（0=日曜）。 */
function weekdayOf(d: Date): number {
  return new Date(d.getTime() + 9 * 3600000).getUTCDay();
}

/** 1 日進める。正午に寄せてあるので、ミリ秒を足すだけで日をまたげる。 */
const nextDayOf = (d: Date) => new Date(d.getTime() + 86400000);

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

  // ここだけ走査ループの正規化を通していなかった。生の `from` から
  // 1 日ずつ進めて `formatDate` に渡すので、`from` が時刻を持つと
  // 期限が 1 日ずれる。走査と同じ「日本時間の正午」から始める。
  let cursor = jstNoonOf(from);
  const startStar = yearStarAt(cursor);
  for (let i = 0; i < maxDays; i++) {
    const next = nextDayOf(cursor);
    if (yearStarAt(next) !== startStar) {
      return { lastDay: cursor, nextDay: next };
    }
    cursor = next;
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
  let cursor = jstNoonOf(from);
  const end = jstNoonOf(to);

  // 走査上限。範囲指定を誤っても止まらなくならないようにする。
  const MAX = 800;
  while (cursor <= end && scanned < MAX) {
    const verdict = judgeDay(new Date(cursor), p);
    scanned++;
    if (verdict.isTripleAuspicious) days.push(verdict);
    cursor = nextDayOf(cursor);
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
  let cursor = jstNoonOf(from);
  const end = jstNoonOf(to);

  const MAX = 800;
  while (cursor <= end && scanned < MAX) {
    const all = judgeDayAllDirections(new Date(cursor), p);
    scanned++;
    for (const dir of ALL_DIRECTIONS) {
      if (all[dir].isTripleAuspicious) perDirection[dir].push(all[dir]);
    }
    cursor = nextDayOf(cursor);
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

/**
 * 日の段階評価。
 *
 * 「三盤がすべて吉」だけを合格にすると、年天中殺や八方塞がりの年は
 * 1 年走査しても 0 件になり、利用者は行き止まりに落ちる。完璧な日が
 * 無い期間でも「統計的にマシな日」を段階付きで示せるように、
 * 全か無かではなく 6 段階に割る。
 *
 *   S 三盤吉（従来の合格基準そのもの）
 *   A 凶なし・吉が2盤
 *   B 凶なし・吉が1盤
 *   C 凶なし（すべて平）
 *   D 軽い凶のみ（天中殺方位・月命殺・月的殺・ノードなど）
 *   X 五大凶殺あり（五黄殺・暗剣殺・破・本命殺・的殺）
 *
 * X は「マシな日」としても決して勧めない。五大凶殺は移転で妥協の
 * 対象にならない扱いなので、候補から常に除外する。集合の定義は
 * noiseSeverity.ts が唯一の情報源で、地図の「大凶」の色分けと同じ。
 */
export type DayTier = "S" | "A" | "B" | "C" | "D" | "X";

export const TIER_ORDER: readonly DayTier[] = ["S", "A", "B", "C", "D", "X"];

export const TIER_LABELS: Record<DayTier, string> = {
  S: "三盤吉",
  A: "吉2盤・凶なし",
  B: "吉1盤・凶なし",
  C: "凶なし（平）",
  D: "軽い凶のみ",
  X: "五大凶殺あり",
};

export function gradeVerdict(v: DayVerdict): DayTier {
  const layers = [v.yearLayer, v.monthLayer, v.dayLayer];
  const noises = layers.filter(isInauspicious);
  if (noises.some(isFatalNoise) || isFatalNoise(v.finalStatus)) {
    return "X";
  }
  if (noises.length > 0 || isInauspicious(v.finalStatus)) return "D";
  if (v.isTripleAuspicious) return "S";
  const auspiciousLayers = layers.filter(isAuspicious).length;
  if (auspiciousLayers >= 2) return "A";
  if (auspiciousLayers === 1) return "B";
  return "C";
}

export interface RankedDay {
  date: string;
  weekday: number;
  tier: DayTier;
  blockedByTenchusatsu: boolean;
  rokuyo: string;
  tags: string[];
}

export interface MonthTierSummary {
  /** YYYY-MM */
  month: string;
  /** その月で（天中殺・X を除いて）最も良い段階。無ければ null。 */
  bestTier: DayTier | null;
  /** bestTier の日数。 */
  bestTierDays: number;
  /** bestTier の最初の日（クリックで飛ぶ先）。 */
  firstDate: string | null;
}

/**
 * 「窓」の統計。候補日（同じ段階の日）が連続しているかたまりを窓と
 * 呼ぶ。引っ越しの実務は 1 日では済まないので、窓が何日続くか・
 * 逃したら次までどれだけ空くかが、急ぐべきかどうかの判断材料になる。
 */
export interface WindowSummary {
  /** 窓の数 */
  count: number;
  /** 窓の平均の長さ（日） */
  avgLen: number;
  maxLen: number;
  /** 窓と窓の間隔の平均（日）。窓が 1 つ以下なら null */
  avgGapDays: number | null;
}

/** YYYY-MM-DD の昇順リストから連続日のかたまりを数える */
export function summarizeWindows(sortedDates: string[]): WindowSummary | null {
  if (sortedDates.length === 0) return null;
  const toDay = (d: string) =>
    Math.floor(Date.parse(`${d}T12:00:00Z`) / 86_400_000);
  const runs: number[] = [];
  const gaps: number[] = [];
  let runStart = toDay(sortedDates[0]);
  let prev = runStart;
  for (let i = 1; i < sortedDates.length; i++) {
    const cur = toDay(sortedDates[i]);
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    runs.push(prev - runStart + 1);
    gaps.push(cur - prev - 1);
    runStart = cur;
    prev = cur;
  }
  runs.push(prev - runStart + 1);
  return {
    count: runs.length,
    avgLen: Number((runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(1)),
    maxLen: Math.max(...runs),
    avgGapDays:
      gaps.length > 0
        ? Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1))
        : null,
  };
}

export interface RankedDirectionSummary {
  direction: Direction;
  directionLabel: string;
  scannedDays: number;
  /** 段階ごとの日数（天中殺除外前）。X も含めて全日がどこかに入る。 */
  tierCounts: Record<DayTier, number>;
  /** 天中殺で塞がれた日と X を除いた、この方位の最良の段階。 */
  bestAvailableTier: DayTier | null;
  /**
   * bestAvailableTier の日を「日付の早い順」に。直近の候補。
   *
   * 以前はここを天赦日・一粒万倍日の優先順に並べ替えてから切っていた。
   * 意思決定サマリーは firstDate（純粋な日付順の先頭）を使うため、
   * 「最速の候補: 8/10」と出ているのにチップには 8/10 が無い、という
   * 食い違いが起きていた（縁起日が上位を占めて押し出される）。
   * 並び順は 1 つにし、縁起日は luckyDays へ分けて両方見せる。
   */
  topDays: RankedDay[];
  /** うち天赦日・一粒万倍日が当たる日。縁起を優先したいとき用 */
  luckyDays: RankedDay[];
  /** 月ごとの最良段階。走査範囲の月がすべて並ぶ。 */
  months: MonthTierSummary[];
  /** X 以外なのに天中殺で候補から外れた日数。設定を変えれば戻る。 */
  blockedByTenchusatsuDays: number;
  /** bestAvailableTier の最初の日。意思決定サマリーが使う */
  firstDate: string | null;
  /** bestAvailableTier の窓（連続日）の統計 */
  windows: WindowSummary | null;
}

/**
 * 期間内の全日を段階評価して、方位ごとにまとめる。
 *
 * findAuspiciousDaysAllDirections が S だけを拾うのに対し、こちらは
 * 全日を格付けして持ち帰る。完璧な日が無い期間の「次善はどこか」と、
 * 月単位の見取り図（どの月に窓が開くか）を一度の走査で出す。
 */
export function rankRelocationDays(
  from: Date,
  to: Date,
  p: Omit<AuspiciousDayParams, "direction">,
  opts: { topN?: number } = {},
): RankedDirectionSummary[] {
  const topN = opts.topN ?? 12;
  const perDirection: Record<string, RankedDay[]> = {};
  for (const dir of ALL_DIRECTIONS) perDirection[dir] = [];

  let scanned = 0;
  let cursor = jstNoonOf(from);
  const end = jstNoonOf(to);

  // 2 年（730 日）を上限に走査する。日ごとに盤 1 回なので走査コストは
  // 線形で、これ以上先は年盤が二度替わって精度より不確かさが勝つ。
  const MAX = 800;
  while (cursor <= end && scanned < MAX) {
    const all = judgeDayAllDirections(new Date(cursor), p);
    scanned++;
    for (const dir of ALL_DIRECTIONS) {
      const v = all[dir];
      perDirection[dir].push({
        date: v.date,
        weekday: v.weekday,
        tier: gradeVerdict(v),
        blockedByTenchusatsu: v.blockedByTenchusatsu,
        rokuyo: v.rokuyo,
        tags: v.tags,
      });
    }
    cursor = nextDayOf(cursor);
  }

  const tierRank = (t: DayTier) => TIER_ORDER.indexOf(t);

  return ALL_DIRECTIONS.map((direction) => {
    const days = perDirection[direction];

    const tierCounts: Record<DayTier, number> = {
      S: 0,
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      X: 0,
    };
    for (const d of days) tierCounts[d.tier]++;

    // 候補になり得る日: X でなく、天中殺でも塞がれていない日。
    const candidates = days.filter(
      (d) => d.tier !== "X" && !d.blockedByTenchusatsu,
    );
    const blockedByTenchusatsuDays = days.filter(
      (d) => d.tier !== "X" && d.blockedByTenchusatsu,
    ).length;

    let bestAvailableTier: DayTier | null = null;
    for (const d of candidates) {
      if (
        bestAvailableTier === null ||
        tierRank(d.tier) < tierRank(bestAvailableTier)
      ) {
        bestAvailableTier = d.tier;
      }
    }

    const bestDays =
      bestAvailableTier === null
        ? []
        : candidates.filter((d) => d.tier === bestAvailableTier);
    const bestDatesSorted = bestDays.map((d) => d.date).sort();
    const byDate = [...bestDays].sort((a, b) => a.date.localeCompare(b.date));
    const topDays = byDate.slice(0, topN);
    // 縁起日は別立て。日付順の直近リストから押し出されないようにする。
    const luckyDays = byDate
      .filter((d) => d.tags.includes("天赦日") || d.tags.includes("一粒万倍日"))
      .sort((a, b) => {
        const rank = (x: RankedDay) =>
          (x.tags.includes("天赦日") ? 2 : 0) +
          (x.tags.includes("一粒万倍日") ? 1 : 0);
        const diff = rank(b) - rank(a);
        return diff !== 0 ? diff : a.date.localeCompare(b.date);
      })
      .slice(0, topN);

    // 月ごとの見取り図。走査した月をすべて並べ、月内の最良段階を出す。
    const byMonth = new Map<string, RankedDay[]>();
    for (const d of days) {
      const m = d.date.slice(0, 7);
      const list = byMonth.get(m);
      if (list) list.push(d);
      else byMonth.set(m, [d]);
    }
    const months: MonthTierSummary[] = [...byMonth.entries()].map(
      ([month, list]) => {
        const open = list.filter(
          (d) => d.tier !== "X" && !d.blockedByTenchusatsu,
        );
        let best: DayTier | null = null;
        for (const d of open) {
          if (best === null || tierRank(d.tier) < tierRank(best)) best = d.tier;
        }
        const bestDays = open
          .filter((d) => d.tier === best)
          .sort((a, b) => a.date.localeCompare(b.date));
        return {
          month,
          bestTier: best,
          bestTierDays: bestDays.length,
          firstDate: bestDays[0]?.date ?? null,
        };
      },
    );

    return {
      direction,
      directionLabel: DIRECTION_LABELS[direction],
      scannedDays: scanned,
      tierCounts,
      bestAvailableTier,
      topDays,
      luckyDays,
      months,
      blockedByTenchusatsuDays,
      firstDate: bestDatesSorted[0] ?? null,
      windows: summarizeWindows(bestDatesSorted),
    };
  }).sort((a, b) => {
    const ar = a.bestAvailableTier ? tierRank(a.bestAvailableTier) : 99;
    const br = b.bestAvailableTier ? tierRank(b.bestAvailableTier) : 99;
    if (ar !== br) return ar - br;
    return (
      (b.bestAvailableTier ? b.tierCounts[b.bestAvailableTier] : 0) -
      (a.bestAvailableTier ? a.tierCounts[a.bestAvailableTier] : 0)
    );
  });
}
