import { DIRECTION_LABELS, STAR_NAMES, type CompassDirection } from "./kigakuContent";

/**
 * 九星と方位の象意。
 *
 * `/houi` 配下の記事ページは、本命星 × 年 × 月で 243 ページある。実測したところ
 * ページ同士の文章の類似度が平均 93〜95%（最大 98%）で、ほぼ複製だった。
 * 変わっているのは中宮の星・対象期間・方位の判定だけで、定型文とリンク一覧に
 * 埋もれていた。検索にもそのまま出しづらく、広告審査でも「価値の低いコンテンツ」
 * として扱われる状態。
 *
 * 差を作るのは、方位に回座している星の組み合わせ。8 方位 × 9 星で 72 通りあり、
 * ページごとに実際に違う。ここに象意を持たせて、ページ固有の解説を組み立てる。
 *
 * 内容は九星気学の古典的な教義（後天定位盤における各星の象意）に基づく。
 * 特定の書籍やサイトの文章を引き写したものではない。
 */

export interface StarMeaning {
  /** 後天定位盤での定位。五黄は中宮なので定位方位を持たない。 */
  home: CompassDirection | null;
  /** 象意を短く。 */
  keywords: string;
  /** 吉方位として用いたときに期待される働き。 */
  good: string;
  /** 凶方位として用いたときに現れやすい傾向。 */
  bad: string;
}

export const STAR_MEANINGS: Record<number, StarMeaning> = {
  1: {
    home: "N",
    keywords: "はじまり・交わり・水",
    good: "新しく始めたことが形になり、人との縁が結ばれやすくなります。行き詰まっていた関係が戻ることもあります。",
    bad: "人間関係の行き違いや、思わぬ出費が起こりやすくなります。冷えや水回りの不調にも注意します。",
  },
  2: {
    home: "SW",
    keywords: "土台・勤勉・不動産",
    good: "地道な努力が続けられるようになり、住まいや土地の縁に恵まれます。引越し先探しに向く方位です。",
    bad: "根気が続かず何事も中途半端になりがちです。住まいや土地に関する損失にも注意します。",
  },
  3: {
    home: "E",
    keywords: "発展・音・若さ",
    good: "止まっていたことが動き出し、行動力が戻ります。交渉や発表の場で力を出しやすくなります。",
    bad: "物事が滞り、気力が落ちます。言葉が過ぎて災いを招くことがあります。",
  },
  4: {
    home: "SE",
    keywords: "信用・縁・風",
    good: "続けてきたことが結実し、人からの信用が積み上がります。良縁に恵まれやすい方位です。",
    bad: "信用を損ないやすく、人付き合いで足をすくわれます。関係が続かなくなることがあります。",
  },
  5: {
    home: null,
    keywords: "中心・腐敗・破壊",
    good: "五黄土星に吉方位としての働きはありません。",
    bad: "自ら招く失敗が起こりやすく、健康や立場を損ないます。九星気学で最も重く見る凶です。",
  },
  6: {
    home: "NW",
    keywords: "天・主導・完成",
    good: "立場が上がり、人をまとめる力が働きます。判断が冴え、大きな決断に向きます。",
    bad: "空回りして周囲の反発を招きます。頭部の不調や、独断による失敗に注意します。",
  },
  7: {
    home: "W",
    keywords: "金銭・悦び・言葉",
    good: "金銭の巡りが良くなり、話術や交渉で成果が出ます。人との縁や食の楽しみにも恵まれます。",
    bad: "散財しやすく、金銭を巡る諍いが起こります。口が過ぎて関係を損なうことがあります。",
  },
  8: {
    home: "NE",
    keywords: "変化・相続・山",
    good: "物事が良い方へ変わり、蓄えが増えます。転職や引越しなど、節目の移動に向く方位です。",
    bad: "変わり目でつまずき、引き継ぎや転職に失敗しやすくなります。関節や腰の不調にも注意します。",
  },
  9: {
    home: "S",
    keywords: "名誉・知性・火",
    good: "評価が上がり、学びや研究がはかどります。人前に出る仕事や試験に向く方位です。",
    bad: "評価を落としやすく、集中が続きません。目の不調や、別離が起こることがあります。",
  },
};

/** その方位が、その星の定位（後天定位盤で本来いる場所）かどうか。 */
export function isHomeDirection(
  direction: CompassDirection,
  star: number,
): boolean {
  return STAR_MEANINGS[star]?.home === direction;
}

/**
 * 「この方位に何が期待できるか」の一文。
 * 方位と星の組み合わせで変わるので、ページごとに違う文章になる。
 */
export function directionEffectSentence(
  direction: CompassDirection,
  star: number | null,
  kind: "good" | "bad",
): string | null {
  if (star === null) return null;
  const meaning = STAR_MEANINGS[star];
  if (!meaning) return null;

  const dirJp = DIRECTION_LABELS[direction];
  const starJp = STAR_NAMES[star];
  const body = kind === "good" ? meaning.good : meaning.bad;

  if (kind === "good" && star === 5) {
    // 五黄が吉方位になることはないが、念のため。
    return `${dirJp}には${starJp}が回座しています。${meaning.bad}`;
  }

  const doubled =
    isHomeDirection(direction, star) &&
    (kind === "good"
      ? `${dirJp}は${starJp}の定位でもあるため、同じ象意が重なって働きが強く出ます。`
      : `${dirJp}は${starJp}の定位でもあるため、凶として出たときの影響も強く出ます。`);

  return `${dirJp}に${starJp}（${meaning.keywords}）が回座しています。${body}${doubled || ""}`;
}
