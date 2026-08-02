/**
 * サイトの公開範囲と導線の唯一の定義元。
 *
 * このサイトは「引越しの方位とタイミングを決める」ためのサービスに統一する。
 * それまでは真太陽時・不動産・株価・技術トレンド・X閲覧・研究レポートなどが
 * 同居しており、17ページ／47APIのうちナビから辿れるのは8件という状態だった。
 *
 * 何のサイトか定まらないと、回遊が起きず、広告のカテゴリ判定も定まらない。
 * ここで中核と非中核を1か所に決め、ナビ（GlobalSidebar）・robots.ts・
 * サイトマップがすべてこの定義を参照する。3か所に散らすと必ずずれる。
 *
 * 非中核は削除しない。動かなくなると困るものがあるため、
 * 導線と検索露出だけを閉じて、URL を知っていれば従来どおり使える状態に保つ。
 */

export interface CoreRoute {
  href: string;
  /** ナビ表示名。引越しの意思決定における役割で名づける */
  label: string;
  /** 何をするページかの一文。メタデータと llms.txt に流用する */
  summary: string;
}

/** 中核。検索に出し、ナビに載せ、広告を出す対象。 */
export const CORE_ROUTES: CoreRoute[] = [
  {
    href: "/relocation/arbitrage",
    label: "物件を方位で探す",
    summary:
      "今住んでいる場所から見た方位と、移転に適した時期で賃貸物件を絞り込むスキャナー。同一部屋の重複掲載をまとめ、㎡単価の割安さと吉凶を併せて評価する。",
  },
  {
    href: "/relocation/simulator",
    label: "引越し先を試算する",
    summary:
      "引越し先の候補地について、出発地からの方位・距離・時期の吉凶を試算する。物件が決まる前の地域選びに使う。",
  },
  {
    href: "/relocation/wealth",
    label: "移住先の地域を比べる",
    summary:
      "市区町村ごとの所得水準などの経済指標を吉方位マップと重ねて表示する。方位が良くても生活が成り立たなければ意味がないため、判断材料として併置する。",
  },
  {
    href: "/calendar",
    label: "引越しの日取りを選ぶ",
    summary:
      "移転や契約に適した日を導出するカレンダー。九星気学の方位盤、六曜、天赦日・一粒万倍日、天中殺の期間を突き合わせる。",
  },
  {
    href: "/metaphysical",
    label: "自分の吉方位を知る",
    summary:
      "生年月日から本命星と天中殺の期間を出し、その時点で使える方位を確認する。他のページの判定はすべてこの計算を共有している。",
  },
];

/**
 * 非中核。ナビから外し、検索エンジンとAIクローラから閉じる。
 * 削除はしない（URL 直打ちでは従来どおり動く）。
 */
export const NON_CORE_ROUTES: string[] = [
  "/dashboard", // 全機能のランチャー。統一後は入口を / に一本化する
  "/trends", // 日経平均・技術トレンド
  "/rentals", // arbitrage と役割が重複する旧・物件一覧
  "/relocation/history", // 過去の判定ログ。導線から外す
  "/visualizer", // 太陽風などの可視化
  "/x-viewer", // X(Twitter) 閲覧
  "/research", // 監査レポート生成
  "/extract", // 抽出ツール
  "/agent-log", // エージェントの実行ログ
  "/ceremonial-sample", // 冠婚葬祭・ブライダルの試作
];

/**
 * robots.ts の Disallow 値。末尾にスラッシュを付けないこと。
 * "/dashboard/" と書くと配下しか塞がず "/dashboard" 本体が素通りする。
 * スラッシュ無しなら前方一致で本体と配下の両方が対象になる。
 */
export const NON_CORE_DISALLOW = [...NON_CORE_ROUTES];

export const SITE_NAME = "Cloud Palette";
export const SITE_TAGLINE = "引越しの方位とタイミングを決める";
export const SITE_DESCRIPTION =
  "今住んでいる場所から見た方位と、移転に適した時期をもとに、引越し先と日取りを決めるためのサービス。九星気学の方位盤と賃貸物件のデータを同じ基準で突き合わせます。";
