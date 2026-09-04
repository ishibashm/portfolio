import type { MergedNewsItem } from "@/lib/fetchNews";

/**
 * /news の見出しを話題で束ねる。
 *
 * 一覧は新着順と発信元ごとの札で並んでいて、**「今日はどの話題が動いたか」
 * が読めない**。1 件ずつ見出しを追うしかないので、件数が増えるほど読み
 * にくくなる。話題の軸を 1 つ足す。
 *
 * ## 見出しの語より先に、構造を見る
 *
 * 配信元の台帳には既に `section`（UR の「入札・発注」など）と発信元の
 * 性格がある。**そこから決まるものは、見出しの語を見ない。**語で当てると、
 * 「入札」を含まない入札公告や、社名に「建設」が入っているだけの記事を
 * 取り違える。
 *
 * 決める順番は
 *
 *   1. 台帳の `section`（区分がある配信元だけ）
 *   2. 見出しの語（下の表。**強い語から順**に当てる）
 *   3. 配信元の性格（建築の業界紙なら「建築」など）
 *
 * ## 外れたときは黙って「その他」にしない
 *
 * 3 まで落ちたものは `null` を返す。画面側は札を出さない。**間違った札を
 * 付けるより、付けないほうが読み手を惑わせない。**
 */

/** 話題の識別子。増やすときは TOPICS にも足す。 */
export type NewsTopic =
  | "rent"
  | "building"
  | "policy"
  | "stats"
  | "bid"
  | "reform";

export interface TopicMeta {
  id: NewsTopic;
  label: string;
  /** 札の色。地色と文字色を対で持つ（サイトの配色に合わせる） */
  className: string;
}

/** 画面に出す順。左から並べる。 */
export const TOPICS: readonly TopicMeta[] = [
  { id: "rent", label: "賃貸・住まい", className: "bg-rose-50 text-rose-700" },
  { id: "building", label: "建築・建設", className: "bg-sky-50 text-sky-700" },
  {
    id: "policy",
    label: "制度・法令",
    className: "bg-indigo-50 text-indigo-700",
  },
  { id: "stats", label: "統計・調査", className: "bg-teal-50 text-teal-700" },
  { id: "bid", label: "入札・発注", className: "bg-amber-50 text-amber-800" },
  {
    id: "reform",
    label: "リフォーム",
    className: "bg-emerald-50 text-emerald-700",
  },
];

export function topicMeta(id: NewsTopic): TopicMeta {
  return TOPICS.find((t) => t.id === id)!;
}

/**
 * 見出しの語。**強い語から順に当てる。**
 *
 * 「改修」は建築にもリフォームにも出るが、住宅の文脈で使われることが
 * 多いのでリフォームを先に置く。順番が意味を持つので、並べ替えない。
 */
const TITLE_RULES: { topic: NewsTopic; words: readonly string[] }[] = [
  {
    topic: "bid",
    words: ["入札", "公告", "落札", "見積", "プロポーザル", "発注"],
  },
  {
    topic: "reform",
    words: [
      "リフォーム",
      "リノベーション",
      "改修",
      "省エネ改修",
      "断熱",
      "耐震補強",
      "修繕",
      "空き家",
    ],
  },
  {
    topic: "stats",
    words: [
      "統計",
      "調査",
      "指数",
      "動向",
      "件数",
      "地価",
      "公示",
      "推計",
      "白書",
    ],
  },
  {
    topic: "policy",
    words: [
      "法",
      "制度",
      "改正",
      "告示",
      "省令",
      "基準",
      "認定",
      "補助",
      "税制",
      "答申",
      "パブリックコメント",
    ],
  },
  {
    topic: "rent",
    words: [
      "賃貸",
      "募集",
      "抽選",
      "入居",
      "家賃",
      "住宅",
      "団地",
      "空室",
      "住まい",
    ],
  },
  {
    topic: "building",
    words: [
      "建築",
      "建設",
      "施工",
      "工事",
      "着工",
      "竣工",
      "設計",
      "再開発",
      "BIM",
      "工法",
    ],
  },
];

/** 台帳の区分から決まるもの。ここに無い区分は語で当てる。 */
export const SECTION_TOPICS: Record<string, NewsTopic> = {
  "入札・発注": "bid",
  "賃貸の募集・抽選": "rent",
};

/**
 * 配信元の性格。語でも当たらなかったときだけ使う。
 *
 * **鍵は台帳（NEWS_FEEDS）の id と一致していないと黙って外れる。**
 * 画面には何も出ないので気付けない。検査で突き合わせている。
 */
export const SOURCE_TOPICS: Record<string, NewsTopic> = {
  "mlit-press": "policy",
  retpc: "policy",
  "suumo-journal": "rent",
  kensetsunews: "building",
  decn: "building",
  "s-housing": "building",
  "itmedia-built": "building",
};

/**
 * その見出しの話題。決められなければ `null`。
 *
 * **語の当たりは「含む」だけで見る。**形態素解析は入れない。見出しは短く、
 * 表記も配信元ごとに揺れるので、辞書を増やすより外れを許すほうが読み手に
 * 優しい（外れたら札が出ないだけ）。
 */
export function topicOf(entry: MergedNewsItem): NewsTopic | null {
  const section = entry.source.section;
  if (section && SECTION_TOPICS[section]) return SECTION_TOPICS[section];

  const title = entry.item.title ?? "";
  for (const rule of TITLE_RULES) {
    if (rule.words.some((w) => title.includes(w))) return rule.topic;
  }

  return SOURCE_TOPICS[entry.source.id] ?? null;
}

/**
 * 話題ごとに数える。画面上部の絞り込みに出す。
 * **0 件の話題は返さない**（押せない札を出さない）。
 */
export function countByTopic(
  entries: readonly MergedNewsItem[],
): { topic: NewsTopic; count: number }[] {
  const counts = new Map<NewsTopic, number>();
  for (const e of entries) {
    const t = topicOf(e);
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return TOPICS.filter((t) => counts.has(t.id)).map((t) => ({
    topic: t.id,
    count: counts.get(t.id)!,
  }));
}
