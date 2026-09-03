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
}

export interface LinkSource {
  name: string;
  url: string;
  note: string;
}

/** RSS / Atom を配信している情報源。 */
export const NEWS_FEEDS: readonly FeedSource[] = [
  {
    id: "constnews",
    name: "建設ニュース",
    feedUrl: "https://www.constnews.com/?feed=rss2",
    siteUrl: "https://www.constnews.com/",
    note: "不動産・建設の専門メディア。建築計画や解体の独自取材が中心",
  },
  {
    id: "mlit-press",
    name: "国土交通省 報道発表",
    feedUrl: "https://www.mlit.go.jp/pressrelease.rdf",
    siteUrl: "https://www.mlit.go.jp/report/",
    note: "地価・住宅施策・統計の一次情報。当サイトの成約データもここの所管",
  },
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
  },
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
    id: "homes-press",
    name: "LIFULL HOME'S PRESS",
    /*
      利用者の依頼（2026-09-03）。SUUMO ジャーナルと並ぶ位置づけの
      媒体として置く。

      **フィードの URL は確かめられていない。**開発環境から
      www.homes.co.jp へは出られない（プロキシの許可リスト外）ので、
      よくある配信の形を候補として並べてある。全部外れたときは
      /news の「いま見出しを取得できていない配信元」に名前が出るので、
      そこを見て直す。相手への頻度は増えない（成功した時点で
      打ち切るので、平常時は 1 本しか取りに行かない）。
    */
    feedUrl: "https://www.homes.co.jp/cont/press/feed/",
    altFeedUrls: [
      "https://www.homes.co.jp/cont/press/rss.xml",
      "https://www.homes.co.jp/cont/press/index.xml",
    ],
    siteUrl: "https://www.homes.co.jp/cont/press/",
    note: "住まいの編集部メディア。制度・費用・住み替えの解説記事",
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
    feedUrl: "https://rss.itmedia.co.jp/rss/2.0/built.xml",
    /* ITmedia は媒体ごとに 2.0 と 1.0（RDF）の両方を配信している
       （スマートジャパンは 1.0 のみが見つかる）。2.0 が無い媒体が
       あるので 1.0 を予備に置く */
    altFeedUrls: ["https://rss.itmedia.co.jp/rss/1.0/built.xml"],
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
