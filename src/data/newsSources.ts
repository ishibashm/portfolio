/**
 * /news の情報源の台帳。
 *
 * ## 載せ方の決まり
 *
 * - フィードは**見出し・リンク・日付・出典だけ**を読む。本文は転載しない
 * - 取得は本番サーバ側で 6 時間キャッシュ（fetchNews）。相手には
 *   1 フィードあたり 1 日 4 回しか行かない。**頻度を上げないこと**
 * - RSS の無い媒体は links（リンク集）に置く。勝手にスクレイプして
 *   フィード化しない（3 節「相手サーバーの負荷」と同じ考え方）
 * - **評価やスコアは付けない。**どれを読むかは利用者が選ぶ。
 *   サイトの判定（段階評価）とは別物なので、混ぜない
 *
 * ## URL の検証について
 *
 * 開発環境から外部へは出られない（プロキシの許可リスト外）ので、
 * ここの URL は**本番でしか生存確認できない**。fetchNews は落ちた
 * フィードを黙って飛ばすので、死んだ URL があってもページは出る。
 * 直すときはこの台帳だけを直せばよい。
 */

export interface FeedSource {
  /** 集計キー。変えると取得キャッシュのキーも変わる。 */
  id: string;
  name: string;
  /** フィードの URL。 */
  feedUrl: string;
  /**
   * 予備のフィード URL。**feedUrl が失敗したときだけ**順に試す。
   *
   * 台帳の URL は本番でしか生存確認できない（開発環境は外に出られない）
   * ので、配信の形が複数あり得る媒体では候補を書いておく。成功した
   * ときは 1 本しか取りに行かないので、平常時の負荷は増えない。
   */
  altFeedUrls?: readonly string[];
  /** 出典として貼る、人が読む側の URL。 */
  siteUrl: string;
  /** 何の情報源か。1 行で。 */
  note: string;
  /**
   * 束（FeedGroup）の id。同じ発信元が配信を複数に分けているとき、
   * 画面で 1 枚の札にまとめるために付ける。
   *
   * 新着一覧の取り分も**束ごと**に数える（`lib/fetchNews` の
   * PER_GROUP_LIMIT）。付けないと、配信の多い発信元が一覧を占める。
   */
  group?: string;
  /**
   * 束の札の中の見出し。同じ区分のフィードは 1 本に混ぜて日付順に
   * 並べる（`lib/newsGrouping`）。
   *
   * UR の入札は本部ごとに 10 本あるが、本部ごとに見出しを 10 個
   * 立てても読めない。**「入札・発注」1 つにまとめ、どの本部から
   * 来たかは行の末尾に添える。**束を持たない配信元では使わない。
   */
  section?: string;
}

export interface LinkSource {
  name: string;
  url: string;
  note: string;
}

/**
 * 1 つの発信元が配信を複数に分けているときの束。
 *
 * UR 都市機構がそうで、報道発表・賃貸の募集・入札の公示が別々の
 * フィードに分かれている（実測で 12 本。`scripts/probe_news_feeds.ts`
 * の `--list`、run 33816205060）。台帳へはフィード 1 本ずつ載せるが、
 * **画面では 1 つの発信元としてまとめる**。12 枚の札が並ぶと、他の
 * 8 媒体が押し出されて読めなくなるため。
 */
export interface FeedGroup {
  /** FeedSource.group から参照する鍵。 */
  id: string;
  /** 束の名前。札の見出しになる。 */
  name: string;
  /** 発信元の入口。 */
  siteUrl: string;
  /** 何の発信元か。1 行で。 */
  note: string;
}

/**
 * 束の一覧。ここに無い id を FeedSource.group に書くと検査で落ちる。
 */
export const FEED_GROUPS: readonly FeedGroup[] = [
  {
    id: "ur",
    name: "UR 都市機構",
    siteUrl: "https://www.ur-net.go.jp/",
    note: "礼金・仲介手数料・更新料なしの公的賃貸と、都市再生事業の発注。報道発表・賃貸の募集・入札の公示が別々に配信されている",
  },
] as const;

/** 束を id で引く。無ければ null。 */
export function feedGroupOf(id: string | undefined): FeedGroup | null {
  if (!id) return null;
  return FEED_GROUPS.find((g) => g.id === id) ?? null;
}

/** RSS / Atom を配信している情報源。 */
export const NEWS_FEEDS: readonly FeedSource[] = [
  {
    id: "mlit-press",
    name: "国土交通省 報道発表",
    feedUrl: "https://www.mlit.go.jp/pressrelease.rdf",
    siteUrl: "https://www.mlit.go.jp/report/",
    note: "地価・住宅施策・統計の一次情報。当サイトの成約データもここの所管",
  },
  /*
    UR 都市機構は配信を 12 本に分けている。利用者が示した一覧
    （https://www.ur-net.go.jp/site/rss.html）を probe-news-feeds の
    --list に当てた実測（run 33816205060）で、13 本の候補のうち
    12 本に中身があった。

    **地方名は各フィードの URL のまま**にしてある（/orders/east/、
    /orders/chiba/ など）。見出しの本文から確かめられた組織名は
    本社・東北本部・東日本賃貸住宅本部・中部支社・西日本支社の
    5 つだけで、残りは URL の綴りしか根拠が無い。組織の呼び方を
    推測で書くより、配信の出どころをそのまま名乗るほうが正しい。
  */
  {
    id: "ur-release",
    name: "UR 都市機構 報道発表",
    /* 利用者から URL の指定があった（2026-09-03）。UR が自前で
       配信しているフィードで、賃貸の募集開始や団地の建替え、
       都市再生事業の発表が流れる。リンク集にだけ置いていたのを
       フィードに上げた */
    feedUrl: "https://www.ur-net.go.jp/news/ur_release.xml",
    siteUrl: "https://www.ur-net.go.jp/news/",
    note: "UR 賃貸と都市再生事業の発表。礼金・仲介手数料・更新料なしの公的賃貸",
    group: "ur",
    section: "報道発表",
  },
  {
    id: "ur-chintai",
    name: "UR 賃貸住宅",
    feedUrl: "https://www.ur-net.go.jp/chintai/rss.xml",
    siteUrl: "https://www.ur-net.go.jp/chintai/",
    note: "団地ごとの募集開始と抽選結果。空室の出方が地域ごとに分かる",
    group: "ur",
    section: "賃貸の募集・抽選",
  },
  {
    id: "ur-orders-honsha",
    name: "UR 本社",
    feedUrl: "https://www.ur-net.go.jp/orders/honsha/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "本社の建設コンサルタント業務・物品役務の公示",
    group: "ur",
    section: "入札・発注",
  },
  {
    id: "ur-orders-tohoku",
    name: "UR 東北本部",
    feedUrl: "https://www.ur-net.go.jp/orders/f-reconstruction/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "東北本部の発注案件。震災復興の事業がここに出る",
    group: "ur",
    section: "入札・発注",
  },
  {
    id: "ur-orders-toshin",
    name: "UR 都心",
    feedUrl: "https://www.ur-net.go.jp/orders/toshin/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "都心の発注案件。工事・物品役務の公示",
    group: "ur",
    section: "入札・発注",
  },
  {
    id: "ur-orders-east",
    name: "UR 東日本",
    feedUrl: "https://www.ur-net.go.jp/orders/east/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "東日本賃貸住宅本部の工事発注。団地の改修が読める",
    group: "ur",
    section: "入札・発注",
  },
  {
    id: "ur-orders-chiba",
    name: "UR 千葉",
    feedUrl: "https://www.ur-net.go.jp/orders/chiba/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "千葉の発注案件と、年度の工事発注見通し",
    group: "ur",
    section: "入札・発注",
  },
  {
    id: "ur-orders-kanagawa",
    name: "UR 神奈川",
    feedUrl: "https://www.ur-net.go.jp/orders/kanagawa/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "神奈川の発注案件と、年度の工事発注見通し",
    group: "ur",
    section: "入札・発注",
  },
  {
    id: "ur-orders-saitama",
    name: "UR 埼玉",
    feedUrl: "https://www.ur-net.go.jp/orders/saitama/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "埼玉の発注案件。物品・役務の公示",
    group: "ur",
    section: "入札・発注",
  },
  {
    id: "ur-orders-central",
    name: "UR 中部支社",
    feedUrl: "https://www.ur-net.go.jp/orders/central/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "中部支社の建設コンサルタント業務・工事の発注案件",
    group: "ur",
    section: "入札・発注",
  },
  {
    id: "ur-orders-west",
    name: "UR 西日本支社",
    feedUrl: "https://www.ur-net.go.jp/orders/west/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "西日本支社の発注予定情報・入札公告",
    group: "ur",
    section: "入札・発注",
  },
  {
    id: "ur-orders-kyushu",
    name: "UR 九州",
    feedUrl: "https://www.ur-net.go.jp/orders/kyushu/order.xml",
    siteUrl: "https://www.ur-net.go.jp/orders/",
    note: "九州の発注案件。団地の活用（キッチンカーなど）の募集も流れる",
    group: "ur",
    section: "入札・発注",
  },
  /*
    載せていない 13 本目: /orders/im-reconstruction/order.xml。
    200 で返るが**中身が 0 件**（844 バイト）。fetchNews は 0 件を
    取得失敗として扱うので、載せると「取得できていない配信元」に
    毎日出続けて、本当に落ちたフィードと見分けが付かなくなる。
    案件が載った時点で足す。
  */
  {
    id: "retpc",
    name: "不動産流通推進センター",
    feedUrl: "https://www.retpc.jp/feed/",
    siteUrl: "https://www.retpc.jp/",
    note: "宅建実務・流通統計。不動産業の制度側の動き",
  },
  {
    id: "suumo-journal",
    name: "SUUMO ジャーナル",
    feedUrl: "https://suumo.jp/journal/feed/",
    siteUrl: "https://suumo.jp/journal/",
    note: "住まいと暮らしの編集部メディア。市場調査や住み替えの読み物",
  },
  {
    id: "kensetsunews",
    name: "建設通信新聞Digital（web刊）",
    feedUrl: "https://www.kensetsunews.com/web-kan/feed",
    siteUrl: "https://www.kensetsunews.com/web-kan",
    note: "業界三大紙の一つ。大型開発・受注・入札など建設業界の実務ニュース",
  },
  {
    id: "decn",
    name: "日刊建設工業新聞",
    feedUrl: "https://www.decn.co.jp/?feed=rss2",
    siteUrl: "https://www.decn.co.jp/",
    note: "業界三大紙の一つ。公共事業・技術開発・災害復旧の動き",
  },
  {
    id: "s-housing",
    name: "新建ハウジング",
    feedUrl: "https://www.s-housing.jp/feed",
    siteUrl: "https://www.s-housing.jp/",
    note: "工務店・住宅実務者向けの業界メディア。制度改正や工法の動き",
  },
  {
    id: "itmedia-built",
    name: "BUILT（ITmedia）",
    /*
      2026-09-03、`built.xml` が落ちた（1.0 の予備も一緒に）。**推測で
      もう 1 つ足さず**、サイトの HTML が宣言しているフィードを読んだら
      `sj_built.xml` に変わっていた（probe_news_feeds、run 33812067626。
      200 / 20 件 / 17.8KB）。落ちた URL は残さない——生き返る見込みが
      無いものを毎回 1 回叩くだけになる。
    */
    feedUrl: "https://rss.itmedia.co.jp/rss/2.0/sj_built.xml",
    siteUrl: "https://built.itmedia.co.jp/",
    note: "建設 DX・BIM・建設テックの専門メディア",
  },
] as const;

/** フィードの無い媒体・データベース。リンク集として載せる。 */
export const NEWS_LINKS: readonly LinkSource[] = [
  {
    name: "不動産情報ライブラリ（国土交通省）",
    url: "https://www.reinfolib.mlit.go.jp/",
    note: "成約価格・地価公示の公式データベース。当サイトの集計の出典",
  },
  {
    name: "BIT 不動産競売物件情報",
    url: "https://www.bit.courts.go.jp/",
    note: "裁判所の競売物件。入札期間・物件明細書・評価書が読める",
  },
  {
    name: "建設ニュース",
    url: "https://www.constnews.com/",
    note: "不動産・建設の専門メディア。建築計画や解体の独自取材が中心",
  },
  {
    name: "LIFULL HOME'S PRESS",
    url: "https://www.homes.co.jp/cont/press/",
    note: "住まいの編集部メディア。制度・費用・住み替えの解説記事",
  },
  {
    name: "新建築",
    url: "https://shinkenchiku.online/",
    note: "建築専門誌。作品としての建築を追うならここから",
  },
  {
    name: "新建築 住宅特集",
    url: "https://shinkenchiku.online/service/jt/",
    note: "住宅作品専門の月刊誌。住宅の設計事例を数多く見られる",
  },
  {
    name: "住宅建築",
    url: "https://www.kskpub.com/",
    note: "隔月刊の住宅専門誌。木造・和の住まいの実例に強い",
  },
  {
    name: "Casa BRUTUS",
    url: "https://casabrutus.com/",
    note: "デザインと暮らしの雑誌。建築の入り口として読みやすい",
  },
  {
    name: "住宅金融支援機構",
    url: "https://www.jhf.go.jp/",
    note: "フラット35 の金利動向と住宅ローンの統計",
  },
  {
    name: "建通新聞 電子版",
    url: "https://digital.kentsu.co.jp/",
    note: "公共工事の入札・発注情報に強い専門紙。詳細は会員向け",
  },
  {
    name: "日本建設業連合会",
    url: "https://www.nikkenren.com/",
    note: "ゼネコン業界団体。受注実績の統計と業界の提言・トピックス",
  },
] as const;
