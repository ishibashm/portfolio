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
    name: "UR 都市機構",
    url: "https://www.ur-net.go.jp/",
    note: "UR 賃貸と都市再生事業。礼金・仲介手数料・更新料なしの公的賃貸",
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
] as const;
