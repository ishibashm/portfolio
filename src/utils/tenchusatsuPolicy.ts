/**
 * 天中殺（空亡）を移転判定にどう効かせるかの方針。
 *
 * これまでは「年・月・日のいずれかが空亡なら移転不可（スコア 0）」の一択だった。
 * この扱いは以下の理由で、唯一の正解として固定すべきものではない。
 *
 * 1. 天中殺は算命学の用語で、四柱推命では空亡と呼ぶ同じ干支の概念。九星気学に
 *    天中殺という概念は無い（気学が扱うのは五黄殺・暗剣殺・歳破・本命殺・
 *    月命殺・的殺など）。両者を重ねて「天中殺なら方位に関係なく不可」とするのは
 *    このツール独自の合成であって、気学の作法ではない。
 *
 * 2. 中国の四柱推命における空亡の本来の意味は「その時期は吉も凶も力が弱い」で
 *    あり、「2 年間なにも始めるな」という禁止則ではない。年単位で全面禁止する
 *    強い解釈は、日本で広まった天中殺・大殺界の系統に由来する。
 *
 * 3. 流派によって適用範囲（大運・年・月・日のどこまで見るか）が違う。
 *
 * 4. 多くの流派が「自分の意思による移動」と「他動的な移動（転勤など、やむを
 *    得ない移動）」を区別し、後者は天中殺の影響を受けないとする。
 *
 * どれを採るかは利用者の立場によるので、モデルとして選べるようにする。
 * 既定は従来どおり strict（挙動を変えない）。
 */

export type TenchusatsuScope = "year" | "month" | "day";

export type TenchusatsuMode =
  /** 年・月・日のいずれかが空亡なら移転不可。従来の挙動。 */
  | "strict"
  /** 年天中殺は無視し、月・日の空亡だけを不可とする。 */
  | "month_day"
  /** 日の空亡だけを不可とする。 */
  | "day_only"
  /** 禁止しない。空亡のぶん点を弱める（本来の「力が弱まる」解釈）。 */
  | "weaken"
  /** 天中殺を判定に使わない。九星気学の方位だけで見る。 */
  | "off";

export const TENCHUSATSU_MODES: {
  id: TenchusatsuMode;
  label: string;
  description: string;
  /** この扱いを支持する立場の要約。画面で根拠を示すために持つ。 */
  rationale: string;
}[] = [
  {
    id: "strict",
    label: "厳格（年・月・日）",
    description:
      "年・月・日のいずれかが空亡なら移転不可として扱う。日本で広まった天中殺・大殺界に近い、最も慎重な扱い。",
    rationale:
      "算命学・大殺界系の解釈。年天中殺は 2 年続くため、その間はどの方位へも動けない判定になる。",
  },
  {
    id: "month_day",
    label: "年天中殺は除く",
    description:
      "年天中殺は判定から外し、月・日の空亡だけを不可とする。2 年間まるごと塞がるのを避けたい場合。",
    rationale:
      "適用範囲を大運・年・月・日のどこまで見るかは流派によって異なる。年まで見ない流派に相当する。",
  },
  {
    id: "day_only",
    label: "日のみ",
    description: "日の空亡だけを不可とする。最も適用範囲の狭い扱い。",
    rationale: "空亡の判定基準は日柱の干支であり、日単位の影響だけを取る立場。",
  },
  {
    id: "weaken",
    label: "弱める（禁止しない）",
    description:
      "空亡でも移転不可にはせず、その期間の吉凶を弱める。吉方位の効きも凶方位の害も小さく見積もる。",
    rationale:
      "中国の四柱推命における空亡の本来の意味は「その時期は吉も凶も力が弱い」であり、禁止則ではないという立場。",
  },
  {
    id: "off",
    label: "使わない",
    description:
      "天中殺を判定に使わず、九星気学の方位（五黄殺・暗剣殺・歳破・本命殺など）だけで見る。",
    rationale:
      "天中殺は算命学の概念で、九星気学の方位判定には本来含まれない。系統を混ぜない立場。",
  },
];

/**
 * その絞り込みモードが、天中殺（空亡）を判定に含むか。
 *
 * 天中殺には**方位の禁忌**（空亡の支に当たる方位）と**期間の禁忌**
 * （空亡の年・月・日は動かない）の 2 つの効き方がある。方位のほうは
 * `filterCollisionByMode` がモードごとに組み直していて、本命星のみ・
 * 環境要因のみでは最初から出ない。**ところが期間のほうは
 * `tenchusatsuMode` だけを見ていて、絞り込みモードを見ていなかった。**
 *
 * そのため「本命星のみ」を選んでも、月ごとの見通しとヒートマップでは
 * 天中殺の日が除外され続けていた（利用者からの報告）。方位では外して
 * 期間では効かせる、という筋の通らない状態だったので、**同じ設定は
 * 同じ意味になる**ようにここで揃える。
 *
 * - composite … 全部を見るモードなので含む
 * - personal_bazi … 天中殺だけを見るモードなので当然含む
 * - personal_kigaku … 本命星との相生・本命殺・的殺だけ。含まない
 * - environmental … 五黄殺・暗剣殺・破だけ。含まない
 */
export function filterModeUsesTenchusatsu(
  mode: "composite" | "personal_kigaku" | "personal_bazi" | "environmental",
): boolean {
  return mode === "composite" || mode === "personal_bazi";
}

export const DEFAULT_TENCHUSATSU_MODE: TenchusatsuMode = "strict";

export function isTenchusatsuMode(value: string): value is TenchusatsuMode {
  return TENCHUSATSU_MODES.some((m) => m.id === value);
}

export function getTenchusatsuMode(id: string) {
  return (
    TENCHUSATSU_MODES.find((m) => m.id === id) ??
    TENCHUSATSU_MODES.find((m) => m.id === DEFAULT_TENCHUSATSU_MODE)!
  );
}

/** 年・月・日それぞれが空亡に当たっているか。 */
export interface VoidScopes {
  year: boolean;
  month: boolean;
  day: boolean;
}

export interface TenchusatsuVerdict {
  /** 移転不可として扱うか。 */
  blocks: boolean;
  /** 吉凶を弱める倍率（1 なら弱めない）。 */
  attenuation: number;
  /** 判定に使った空亡の範囲。画面で理由を出すために持つ。 */
  activeScopes: TenchusatsuScope[];
  /** 空亡自体には当たっているか（扱わない設定でも事実として持つ）。 */
  inVoidPeriod: boolean;
  /** なぜブロックしなかったのかの説明。 */
  note: string;
}

/**
 * 空亡の当たり具合と設定から、移転判定への効かせ方を決める。
 *
 * involuntary（やむを得ない移動）が立っている場合は禁止しない。多くの流派が
 * 「自分の意思による移動」と「転勤など他動的な移動」を区別し、後者は天中殺の
 * 影響を受けないとするため。判定から消すのではなく、弱める扱いに落とす。
 */
export function evaluateTenchusatsu(
  scopes: VoidScopes,
  mode: TenchusatsuMode,
  involuntary = false,
): TenchusatsuVerdict {
  const inVoidPeriod = scopes.year || scopes.month || scopes.day;

  const activeScopes: TenchusatsuScope[] = [];
  if (scopes.year) activeScopes.push("year");
  if (scopes.month) activeScopes.push("month");
  if (scopes.day) activeScopes.push("day");

  if (mode === "off") {
    return {
      blocks: false,
      attenuation: 1,
      activeScopes,
      inVoidPeriod,
      note: "天中殺を判定に使わない設定です（九星気学の方位のみで評価）。",
    };
  }

  if (mode === "weaken") {
    return {
      blocks: false,
      // 吉も凶も弱まる、という本来の意味に沿って中央（50）へ寄せる。
      attenuation: inVoidPeriod ? 0.6 : 1,
      activeScopes,
      inVoidPeriod,
      note: inVoidPeriod
        ? "空亡期間のため、吉方位の効きも凶方位の害も弱めに見積もっています（禁止はしません）。"
        : "",
    };
  }

  // ここから先は禁止則として扱うモード。どの範囲まで見るかだけが違う。
  let blocking = false;
  if (mode === "strict") blocking = scopes.year || scopes.month || scopes.day;
  else if (mode === "month_day") blocking = scopes.month || scopes.day;
  else if (mode === "day_only") blocking = scopes.day;

  if (blocking && involuntary) {
    return {
      blocks: false,
      attenuation: 0.7,
      activeScopes,
      inVoidPeriod,
      note: "転勤などやむを得ない移動として扱っています。他動的な移動は天中殺の影響を受けないとする流派の考え方に沿い、禁止はせず影響を弱めています。",
    };
  }

  return {
    blocks: blocking,
    attenuation: 1,
    activeScopes,
    inVoidPeriod,
    note: blocking
      ? ""
      : inVoidPeriod
        ? "空亡には当たっていますが、この設定では判定範囲外です。"
        : "",
  };
}

/** 画面に出す空亡範囲の日本語表記。 */
export const SCOPE_LABELS: Record<TenchusatsuScope, string> = {
  year: "年天中殺",
  month: "月天中殺",
  day: "日天中殺",
};
