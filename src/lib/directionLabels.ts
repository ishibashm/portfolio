/**
 * 方位の吉凶ステータスを日本語にする、唯一の対応表。
 *
 * 以前は同じ内容の表が 4 か所にあった（シミュレータ・移動履歴・地図のツールチップ・
 * 時期スコアラー）。文言が少しずつ違ううえ、履歴とスコアラーは未知の値が来ると
 * "NOISE_GETSUMEI" のような内部コードをそのまま画面に出していた。
 *
 * 4 つの形を持つ。**言葉を変えるためではなく、置ける長さが違うために
 * 分けてある。**呼び名の系統は 4 つとも揃える。
 *
 *   name      「五黄殺」        呼び名だけ。重さは別の列や色で出す
 *   badge     「五黄」          地図の扇形に重ねる 1〜3 文字
 *   short     「五黄殺 (大凶)」  文中に埋め込む
 *   detailed  「五黄殺 (大凶 - 自己破壊のエネルギー)」  単独で説明する
 *
 * ステータスの畳み方は @/utils/directionStatus、その日本語表記はここ、と役割を分ける。
 * 段階（S〜X）の見せ方は @/utils/tierDisplay。
 */

interface DirectionLabel {
  /**
   * 判定そのものの呼び名だけ。「(大凶)」のような重さは付けない。
   *
   * 表の升目や「凶の内訳」の並びなど、重さを別の列や色で出している
   * ところで使う。以前はこの形の表が
   * `AuspiciousDayFinder` / `AstroGridCalendar` / `TenChiJinEvaluation` /
   * `api/rentals/arbitrage` の 4 か所にあり、**同じ状態を別の言葉で
   * 呼んでいた**（NOISE_VOID を「空亡」と呼ぶ画面と「天中殺」と呼ぶ
   * 画面、NOISE_NODE を「月交点」と呼ぶ画面と「月交点ノイズ」と呼ぶ
   * 画面）。同じ日の同じ方位が、画面をまたぐと別の名前になっていた。
   */
  name: string;
  /**
   * 地図の扇形に重ねる 1〜3 文字の札。
   *
   * 扇形の上には文字を置く余地がほとんど無い。`name` をそのまま出すと
   * はみ出すので、ここだけ別に持つ。**言葉を変えるためではなく、
   * 長さのために別なので、呼び名の系統は `name` と合わせること。**
   */
  badge: string;
  /** ツールチップや文中に埋め込む短い形。重さを添える。 */
  short: string;
  /** 判定の意味まで説明する形。 */
  detailed: string;
}

const DIRECTION_LABELS: Record<string, DirectionLabel> = {
  NOISE_GOU: {
    name: "五黄殺",
    badge: "五黄",
    short: "五黄殺 (大凶)",
    detailed: "五黄殺 (大凶 - 自己破壊のエネルギー)",
  },
  NOISE_ANKEN: {
    name: "暗剣殺",
    badge: "暗剣",
    short: "暗剣殺 (大凶)",
    detailed: "暗剣殺 (大凶 - 他動的なトラブル)",
  },
  NOISE_HA: {
    name: "歳破/月破/日破",
    badge: "破",
    short: "歳破/月破/日破 (大凶)",
    detailed: "歳破/月破/日破 (大凶 - 破れのエネルギー)",
  },
  NOISE_VOID: {
    name: "天中殺方位",
    badge: "天中殺",
    short: "天中殺方位 (大凶)",
    detailed: "天中殺方位 (大凶 - 土台の崩壊)",
  },
  NOISE_HONMEI: {
    name: "本命殺",
    badge: "本命",
    short: "本命殺 (凶)",
    detailed: "本命殺 (凶 - 健康運の低下)",
  },
  NOISE_TEKI: {
    name: "本命的殺",
    badge: "的殺",
    short: "本命的殺 (凶)",
    detailed: "本命的殺 (凶 - 目的の阻害)",
  },
  NOISE_GETSUMEI: {
    name: "月命殺",
    badge: "月命",
    short: "月命殺 (凶)",
    detailed: "月命殺 (凶 - 精神の疲弊)",
  },
  NOISE_GETSUTEKI: {
    name: "月命的殺",
    badge: "月命的",
    short: "月命的殺 (凶)",
    detailed: "月命的殺 (凶 - 人間関係の停滞)",
  },
  NOISE_NODE: {
    name: "羅睺・計都軸",
    badge: "交点",
    short: "羅睺・計都軸 (凶)",
    detailed: "羅睺・計都軸 (凶 - 宿命的なストレス)",
  },
  WARNING: {
    name: "注意",
    badge: "注意",
    short: "注意 (引越当日)",
    // QA #18。ここが「吉方位／中立平穏」になっており、注意なのに吉と読めていた。
    detailed:
      "注意 (長期の方位は吉ですが、移動当日に干渉があります。時間に余裕を持ってください)",
  },
  OPTIMAL: {
    name: "大吉",
    badge: "大吉",
    short: "大吉方位",
    detailed: "大吉方位 (最適)",
  },
  OPTIMAL_REGULAR: {
    name: "吉",
    badge: "吉",
    short: "吉方位",
    detailed: "吉方位 (良好)",
  },
  OPTIMAL_BOOST: {
    name: "吉",
    badge: "吉",
    short: "吉方位",
    detailed: "吉方位 (追加の吉要素あり)",
  },
  NOISE_TENCHU: {
    // 方位ではなく「期間」。天中殺中はどの方位へも動かない扱い。
    // 表に無かったので、画面ごとに手書きの文言が残っていた。
    name: "天中殺",
    badge: "天中殺",
    short: "天中殺 (移転不可)",
    detailed: "天中殺 (この期間は移転を避ける扱いです)",
  },
  SAFE: {
    name: "平穏",
    badge: "",
    short: "平穏",
    detailed: "平穏 (凶方位ではありません)",
  },
};

/** 未知のステータスでも内部コードを画面に出さない。 */
const UNKNOWN: DirectionLabel = {
  name: "判定なし",
  badge: "",
  short: "判定なし",
  detailed: "判定なし (この方位の吉凶を求められませんでした)",
};

function lookup(status: string): DirectionLabel {
  return DIRECTION_LABELS[status] ?? UNKNOWN;
}

/** 「五黄殺」。呼び名だけ。重さを別の列や色で出しているところで使う。 */
export function directionLabelName(status: string): string {
  return lookup(status).name;
}

/** 「五黄」。地図の扇形に重ねる 1〜3 文字の札。 */
export function directionLabelBadge(status: string): string {
  return lookup(status).badge;
}

/** 「五黄殺 (大凶)」。文中に埋め込むとき用。 */
export function directionLabelShort(status: string): string {
  return lookup(status).short;
}

/** 「五黄殺 (大凶 - 自己破壊のエネルギー)」。判定の説明として単独で出すとき用。 */
export function directionLabelDetailed(status: string): string {
  return lookup(status).detailed;
}

/** 表に載っているステータスかどうか（テストと網羅確認のため）。 */
export function isKnownDirectionStatus(status: string): boolean {
  return status in DIRECTION_LABELS;
}

/** 判定に使った盤。破の呼び名がこれで変わる。 */
export type BoardLayer = "year" | "month" | "day" | "final";

/**
 * 破（NOISE_HA）の呼び名。
 *
 * 破は「その盤の十二支の正反対の方位」で、年盤なら歳破、月盤なら月破、
 * 日盤なら日破を指す。エンジンはどれも同じ NOISE_HA を返すので、
 * 表示側が盤を知らないまま「歳破」と書くと、月盤・日盤で嘘になる。
 *
 * 記事ページは月盤で「月破」に読み替えている（kigakuContent.ts:332-343）。
 * 物件検索はそこが「歳破」固定だったので、ここに寄せて揃える。
 * 盤を合成した結果（final）は、どの盤由来か分からないので併記する。
 */
export function haLabelForLayer(layer: BoardLayer): string {
  switch (layer) {
    case "year":
      return "歳破";
    case "month":
      return "月破";
    case "day":
      return "日破";
    default:
      return "歳破/月破/日破";
  }
}
