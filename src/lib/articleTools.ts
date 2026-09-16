import {
  CORE_ROUTES,
  ROUTE_GROUPS,
  type CoreRoute,
  type RouteGroup,
} from "@/lib/siteStructure";

/**
 * 記事の末尾に置く「同じ条件でツールを開く」導線の選び方。
 *
 * 記事は「北東が吉」「天中殺の期間は動かない」までは言えるが、読み手が
 * 次に知りたいのは**自分の場合はどうか**で、それは生年月日と出発地を
 * 入れた道具にしか答えられない。競合（記事と一覧表だけのサイト）に
 * 対してこのサイトが持っている差は「計算できる」ことなので、記事を
 * 読み終えた場所にその入口を置く。
 *
 * 2026-09-16 時点で、記事 31 本の末尾には「記事一覧へ戻る」しか無く、
 * 道具への導線は 1 本も無かった。年別の早見表（/houi/{年}/{星}）には
 * 物件検索への導線があるのに、記事だけ行き止まりだった。
 *
 * **どの道具を出すかは記事のタグで決める。**タグは frontmatter と DB の
 * 両方にある項目なので、Markdown の記事にも管理画面から書いた記事にも
 * 同じように効く。新しい項目（"tool:" のような）を足すと、片方の経路に
 * だけ付いて扱いが割れる（lib/blogImage と同じ理由）。
 *
 * 道具の名前と説明は CORE_ROUTES から引く。ここに文言を持つと、ナビ・
 * ホーム・llms.txt と 4 通りになる。
 */

/**
 * タグの一部が含まれていたら、その群の道具を出す。
 *
 * 完全一致にしない。「吉方位」「凶方位」「方位術」「方位除け」は全部
 * 「方位」で拾える。逆に「統計」を相場の群に入れない
 * （「方位や九星に統計的な裏づけはあるのか」は方位の記事）。
 */
const GROUP_TAG_HINTS: Record<RouteGroup, readonly string[]> = {
  timing: [
    "天中殺",
    "空亡",
    "六曜",
    "仏滅",
    "暦注",
    "天赦",
    "万倍",
    "日取り",
    "時期",
    "土用",
    "引き渡し",
    "75日",
  ],
  direction: [
    "方位",
    "本命",
    "九星",
    "気学",
    "五黄",
    "暗剣",
    "太極",
    "仮吉方",
    "方違え",
    "風水",
    "八宅",
    "距離",
  ],
  market: [
    "家賃",
    "賃貸",
    "成約",
    "土地",
    "不動産",
    "地価",
    "用途地域",
    "建物比率",
    "予算",
  ],
};

/**
 * 群ごとの代表の道具。先頭が最初に出る。
 *
 * 方位の群は、操作せずに読める早見表（/houi）ではなく、生年月日と
 * 出発地を入れて答えが出る物件検索（CORE_ROUTES の先頭）を先に置く。
 * 早見表は記事と同じ「読むもの」で、記事の末尾から読むものへ送っても
 * 答えに近づかない。
 */
const GROUP_REPRESENTATIVES: Record<RouteGroup, readonly string[]> = {
  timing: ["/calendar", "/relocation/timing"],
  direction: ["/relocation/arbitrage", "/houi"],
  market: ["/relocation/market", "/houi/area"],
};

/** 何にも当たらない記事の既定。サイトの主題は方位なので方位の群。 */
const FALLBACK_GROUP: RouteGroup = "direction";

/** 出す道具の上限。4 つ以上並べるとホームの札と同じで選べなくなる。 */
export const MAX_ARTICLE_TOOLS = 3;

function routeOf(href: string): CoreRoute {
  const route = CORE_ROUTES.find((r) => r.href === href);
  if (!route) {
    // 代表に挙げた href が CORE_ROUTES から消えたら、ここで気付く
    throw new Error(`articleTools: ${href} は CORE_ROUTES にありません`);
  }
  return route;
}

/** 記事のタグから、当たる群を ROUTE_GROUPS の順に返す。 */
export function groupsForTags(tags: readonly string[]): RouteGroup[] {
  const hit = ROUTE_GROUPS.map((g) => g.key).filter((key) =>
    tags.some((tag) => GROUP_TAG_HINTS[key].some((hint) => tag.includes(hint))),
  );
  return hit.length > 0 ? hit : [FALLBACK_GROUP];
}

/**
 * 記事の末尾に出す道具。1〜MAX_ARTICLE_TOOLS 件。
 *
 * まず当たった群それぞれの先頭の道具、次に 2 番目の道具、の順に詰める。
 * 群が 1 つの記事なら同じ群から 2 つ、群が 3 つなら各群から 1 つずつ。
 */
export function toolsForArticle(tags: readonly string[]): CoreRoute[] {
  const groups = groupsForTags(tags);
  const picked: string[] = [];
  const depth = Math.max(...groups.map((g) => GROUP_REPRESENTATIVES[g].length));
  for (let i = 0; i < depth; i++) {
    for (const g of groups) {
      const href = GROUP_REPRESENTATIVES[g][i];
      if (href && !picked.includes(href)) picked.push(href);
    }
  }
  return picked.slice(0, MAX_ARTICLE_TOOLS).map(routeOf);
}
