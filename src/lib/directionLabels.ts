/**
 * 方位の吉凶ステータスを日本語にする、唯一の対応表。
 *
 * 以前は同じ内容の表が 4 か所にあった（シミュレータ・移動履歴・地図のツールチップ・
 * 時期スコアラー）。文言が少しずつ違ううえ、履歴とスコアラーは未知の値が来ると
 * "NOISE_GETSUMEI" のような内部コードをそのまま画面に出していた。
 *
 * ステータスの畳み方は @/utils/directionStatus、その日本語表記はここ、と役割を分ける。
 */

interface DirectionLabel {
  /** ツールチップや文中に埋め込む短い形。 */
  short: string;
  /** 判定の意味まで説明する形。 */
  detailed: string;
}

const DIRECTION_LABELS: Record<string, DirectionLabel> = {
  NOISE_GOU: {
    short: "五黄殺 (大凶)",
    detailed: "五黄殺 (大凶 - 自己破壊のエネルギー)",
  },
  NOISE_ANKEN: {
    short: "暗剣殺 (大凶)",
    detailed: "暗剣殺 (大凶 - 他動的なトラブル)",
  },
  NOISE_HA: {
    short: "歳破/月破/日破 (大凶)",
    detailed: "歳破/月破/日破 (大凶 - 破れのエネルギー)",
  },
  NOISE_VOID: {
    short: "天中殺方位 (大凶)",
    detailed: "天中殺方位 (大凶 - 土台の崩壊)",
  },
  NOISE_HONMEI: {
    short: "本命殺 (凶)",
    detailed: "本命殺 (凶 - 健康運の低下)",
  },
  NOISE_TEKI: {
    short: "本命的殺 (凶)",
    detailed: "本命的殺 (凶 - 目的の阻害)",
  },
  NOISE_GETSUMEI: {
    short: "月命殺 (凶)",
    detailed: "月命殺 (凶 - 精神の疲弊)",
  },
  NOISE_GETSUTEKI: {
    short: "月命的殺 (凶)",
    detailed: "月命的殺 (凶 - 人間関係の停滞)",
  },
  NOISE_NODE: {
    short: "羅睺・計都軸 (凶)",
    detailed: "羅睺・計都軸 (凶 - 宿命的なストレス)",
  },
  WARNING: {
    short: "注意 (引越当日)",
    // QA #18。ここが「吉方位／中立平穏」になっており、注意なのに吉と読めていた。
    detailed:
      "注意 (長期の方位は吉ですが、移動当日に干渉があります。時間に余裕を持ってください)",
  },
  OPTIMAL: {
    short: "大吉方位",
    detailed: "大吉方位 (最適)",
  },
  OPTIMAL_REGULAR: {
    short: "吉方位",
    detailed: "吉方位 (良好)",
  },
  OPTIMAL_BOOST: {
    short: "吉方位",
    detailed: "吉方位 (追加の吉要素あり)",
  },
  SAFE: {
    short: "平穏",
    detailed: "平穏 (凶方位ではありません)",
  },
};

/** 未知のステータスでも内部コードを画面に出さない。 */
const UNKNOWN: DirectionLabel = {
  short: "判定なし",
  detailed: "判定なし (この方位の吉凶を求められませんでした)",
};

function lookup(status: string): DirectionLabel {
  return DIRECTION_LABELS[status] ?? UNKNOWN;
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
