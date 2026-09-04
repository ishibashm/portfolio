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
 * 当初は「非中核は削除せず、導線と検索露出だけ閉じる」方針だったが、
 * 引越しと無関係なページを抱えたままでは保守が重いため、実際に削除した。
 * 削除したのは、他から参照されておらず引き継ぎにも関わらない9ページ
 * （trends / visualizer / x-viewer / research / extract / agent-log /
 * ceremonial-sample / metaphysical / rentals）と、それ専用の API 6本。
 *
 * その後 /dashboard（全機能ランチャー）と AI コンシェルジュも削除した。
 * 前者はログイン後の行き先だったが、ログインした人しか見られない画面を
 * 抱える理由が無い。後者は引越しと無関係なうえ、利用者の指示でサイト全体の
 * 配色を書き換えられる唯一の経路だった。
 *
 * 残したものには理由がある。
 *   /relocation/history … 過去の移動から太極を出すため、引越しの判断に効く
 *   src/components/nba  … ホーム(SolarTimeClock)とシミュレータが使っている
 */

import type { Metadata } from "next";

/**
 * 中核ルートの群。引越しの意思決定は「どこへ・いつ・いくら」の 3 つの
 * 問いでできているので、ナビもホームもこの 3 群で見せる。
 *
 * 以前は 10 本の道具をフラットに並べていた。似た名前（「引越し時期を
 * 分析する」と「引越しの日取りを選ぶ」など）が同列に見え、初見では
 * どれを開けばいいか分からない、という導線の問題が AdSense の
 * 「優れたユーザーエクスペリエンス」要件にも響いていた（2026-08-28 の
 * 棚卸し）。群はここが唯一の定義元で、サイドバー・ホームが参照する。
 */
export type RouteGroup = "direction" | "timing" | "market";

export const ROUTE_GROUPS: {
  key: RouteGroup;
  label: string;
  note: string;
}[] = [
  {
    key: "direction",
    label: "どこへ — 方位で選ぶ",
    note: "今住んでいる場所から見た方位で、物件・候補地・地域を選ぶ",
  },
  {
    key: "timing",
    label: "いつ — 時期を選ぶ",
    note: "動くのに適した日を、段階評価と暦で選ぶ",
  },
  {
    key: "market",
    label: "いくら — 相場を知る",
    note: "賃貸・購入の実データで、価格の妥当性を確かめる",
  },
];

export interface CoreRoute {
  href: string;
  /** ナビ表示名。引越しの意思決定における役割で名づける */
  label: string;
  /** 何をするページかの一文。メタデータと llms.txt に流用する */
  summary: string;
  /** どの問いに答える道具か。ナビ・ホームの群分けに使う */
  group: RouteGroup;
}

/** 中核。検索に出し、ナビに載せ、広告を出す対象。群ごとに並べる。 */
export const CORE_ROUTES: CoreRoute[] = [
  // ── どこへ（方位で選ぶ）─────────────────────────────
  {
    href: "/relocation/arbitrage",
    label: "物件を方位で探す",
    summary:
      "今住んでいる場所から見た方位と、移転に適した時期で賃貸物件を絞り込むスキャナー。同一部屋の重複掲載をまとめ、㎡単価の割安さと吉凶を併せて評価する。",
    group: "direction",
  },
  {
    href: "/relocation/simulator",
    label: "引越し先を試算する",
    summary:
      "引越し先の候補地について、出発地からの方位・距離・時期の吉凶を試算する。物件が決まる前の地域選びに使う。",
    group: "direction",
  },
  {
    href: "/relocation/wealth",
    label: "移住先の地域を比べる",
    summary:
      "市区町村ごとの所得水準などの経済指標を吉方位マップと重ねて表示する。方位が良くても生活が成り立たなければ意味がないため、判断材料として併置する。",
    group: "direction",
  },
  {
    href: "/houi",
    label: "本命星と吉方位を調べる",
    summary:
      "生まれ年から本命星を引き、その年の吉方位・五黄殺・暗剣殺・歳破・本命殺がどの方位に当たるかを一覧で確認する。操作せずに読める早見表。",
    group: "direction",
  },
  {
    /*
      風水（八宅）。実装は前からあったが、**置き場所が /houi の 4 番目の
      節だけ**で、専用の URL もナビの行も無かった。ナビの見出しは
      「本命星と吉方位を調べる」なので、サイトのどこにも「風水」の語が
      出ない。利用者から「風水の要素が見れるものがまだサイトに見つから
      ない」と報告があった（2026-09-04）。

      /houi/area で踏んだのと同じ失敗（下のコメント）。**作った機能に
      URL とナビの行を与えないと、検索から来た人にしか届かない。**
    */
    href: "/houi/fengshui",
    label: "風水（八宅）で吉方位を調べる",
    summary:
      "生まれ年と性別から本命卦を引き、八宅風水の四吉方（生気・天医・延年・伏位）と四凶方（絶命・五鬼・六殺・禍害）がどの方位に当たるかを一覧で確認する。九星気学とは別の流派で、当サイトの判定には使っていない。",
    group: "direction",
  },
  {
    /*
      吉方位が分かったあと「その方位に何があるか」を引く頁。#750 から
      固有の文章を書いた市区町村を索引に戻しているが、**サイトの中から
      辿る入口が /houi の中ほどのボタン 1 つしか無かった。**検索から
      来ない利用者には実質たどり着けず、県 → 市区町村の階層も見えて
      いなかったので、中核として群に入れる。
    */
    href: "/houi/area",
    label: "吉方位にある街を調べる",
    summary:
      "いま住んでいる市区町村を選ぶと、そこから見た八方位それぞれにどの街があり、家賃相場がいくらかを一覧できる。候補の無い方位は、行き止まりなのか掲載が無いだけなのかを分けて示す。",
    group: "direction",
  },
  // ── いつ（時期を選ぶ）───────────────────────────────
  {
    href: "/relocation/timing",
    label: "引越し時期を分析する",
    summary:
      "過去から未来までの全日を、方位ごとに 6 段階で格付けして一望する。カレンダーヒートマップ・段階の構成比・窓の長さと間隔・平年比から、いつ動くのが最善かを決める。",
    group: "timing",
  },
  {
    href: "/calendar",
    label: "引越しの日取りを選ぶ",
    summary:
      "移転や契約に適した日を導出するカレンダー。九星気学の方位盤、六曜、天赦日・一粒万倍日、天中殺の期間を突き合わせる。",
    group: "timing",
  },
  // ── いくら（相場を知る）─────────────────────────────
  {
    href: "/relocation/market",
    label: "家賃相場を分析する",
    summary:
      "全国の賃貸掲載を、ヘドニック回帰・分布分析・生存分析で毎晩集計する。条件相応の家賃、割安・割高の分布、掲載の消化速度、市区町村ごとの価格のばらつきを見る。",
    group: "market",
  },
  {
    href: "/relocation/purchase",
    label: "購入の相場を分析する",
    summary:
      "国交省の成約価格をもとに、㎡単価・土地代と建物代の比率・築年数・構造・都道府県別の相場を毎晩集計する。地価公示との対比も出す。売り出し価格ではなく実際に取引が成立した額を扱う。",
    group: "market",
  },
  {
    /*
      購入の相場（/relocation/purchase）が全国の傾向を出すのに対し、
      こちらは**利用者が検討している 1 件**を成約の分布に当てる。
      同じ成約データを使うが、問いが違う（相場はどうか／この物件はどうか）。
    */
    href: "/relocation/appraisal",
    label: "検討中の物件を査定する",
    summary:
      "検討中のマンションの場所・専有面積・築年・売出価格を入力すると、近所の成約価格の分布のどこに位置するかを出す。分母は売り出し価格ではなく実際に成立した額。使った成約の件数と、どこまで条件を緩めたかも併せて示す。",
    group: "market",
  },
];

/**
 * 非中核。ナビから外し、検索エンジンとAIクローラから閉じ、ログイン必須にする。
 * 残っているのは /relocation/history だけ（他は削除済み）。
 *
 * 実体は nonCoreRoutes.json に置いてある。next-sitemap.config.js が
 * CommonJS で TypeScript を読めないため、以前は同じ一覧を2か所で持ち
 * 「片方を変えたらもう片方も直すこと」と書いてあった。実際には食い違い、
 * 削除済みの9ページが next-sitemap 側に残っていた。JSON ならどちらからも
 * 読めるので、持ち場を1つにする。
 */
import nonCore from "./nonCoreRoutes.json";

export const NON_CORE_ROUTES: string[] = nonCore.routes;

/**
 * テーマ外だが道具として残すルート。ナビ・sitemap・robots から外す。
 * NON_CORE と違い**ログインは要らない**（routeAccess はこちらを読まない）。
 * /relocation/yield（投資家向けの利回り地図）が該当。引越しの意思決定
 * ではなく投資の道具で、「何のサイトか」の一点集中を薄めるため露出だけ
 * 絞った（2026-08-28。AdSense の有用性指摘への対応の一環）。URL を知って
 * いれば従来どおり使える。
 */
export const OFF_THEME_ROUTES: string[] = nonCore.offTheme;

/**
 * robots.ts の Disallow 値。末尾にスラッシュを付けないこと。
 * "/foo/" と書くと配下しか塞がず "/foo" 本体が素通りする。
 * スラッシュ無しなら前方一致で本体と配下の両方が対象になる。
 */
export const NON_CORE_DISALLOW = [...NON_CORE_ROUTES, ...OFF_THEME_ROUTES];

export const SITE_NAME = "Cloud Palette";
export const SITE_TAGLINE = "引越しの方位とタイミングを決める";
export const SITE_DESCRIPTION =
  "今住んでいる場所から見た方位と、移転に適した時期をもとに、引越し先と日取りを決めるためのサービス。九星気学の方位盤と賃貸物件のデータを同じ基準で突き合わせます。";

/**
 * いま開いている頁に対して、ナビで点灯させる 1 つを選ぶ。
 *
 * ## なぜ要るか（利用者の報告、2026-09-04）
 *
 * 「タブが 2 つ選ばれてるのはバグ？」。サイドバーで
 *
 *     本命星と吉方位を調べる    /houi
 *     風水（八宅）で吉方位を調べる  /houi/fengshui
 *
 * の両方が赤く点灯していた。判定が素の前方一致だったため。
 *
 *     pathname === item.href || pathname.startsWith(item.href)
 *
 * `/houi/fengshui` は `/houi` で始まるので、両方が真になる。`/houi` の
 * 下に別の項目が無かったあいだは表に出ず、`/houi/fengshui` を足した
 * ときに現れた。**同じことが `/houi/area/13101`（市区町村ページ
 * 1,022 枚）でも起きていた**（`/houi` と `/houi/area` が点灯）。
 *
 * ## どう決めるか
 *
 * **いちばん長く一致したものだけ**を点ける。`/houi/area/13101` なら
 * `/houi/area`、`/houi` そのものなら `/houi`。どこにいても点くのは 1 つ。
 *
 * 前方一致は**区切りで見る。**`pathname.startsWith(href)` だけだと
 * `/houika` が `/houi` に一致してしまう。`href + "/"` で始まるか、
 * まるごと同じか、のどちらかにする。
 *
 * ホーム（`/`）は例外で、まるごと同じときだけ。前方一致を許すと
 * すべての頁で点く。
 */
export function activeNavHref(
  pathname: string | null | undefined,
  hrefs: readonly string[],
): string | null {
  if (!pathname) return null;
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname === href) return href; // 完全一致がいちばん強い
    if (href === "/") continue;
    if (!pathname.startsWith(`${href}/`)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}

/**
 * 索引に載せる頁の robots。
 *
 * **頁側で robots を宣言すると、layout.tsx の設定は丸ごと上書きされる。**
 * `max-image-preview: large` もそこで消える。実際に、市区町村ページのうち
 * 文章を書いて索引に戻した 225 頁が、頁側の
 * `robots: { index: ..., follow: true }` によって large を落としていた
 * （生成した HTML で確認。/blog は large が付き、/houi/area/47362 は
 * `index, follow` だけだった）。
 *
 * Search Console の実測ではクリックが付いた頁の半分が市区町村頁なので、
 * いちばん効く場所が抜けていたことになる。index を名乗る頁は必ずこれを使う。
 *
 * 索引に載せない頁は preview の指定に意味が無いので、follow だけを持たせる。
 */
export const INDEXED_ROBOTS: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

/** 索引に載せない頁の robots。リンクは辿らせる。 */
export const NOINDEX_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: true,
};
