/**
 * 外部の不動産サイトへの送客リンク。**規約で許された先だけを持つ台帳。**
 *
 * ## なぜ台帳にするか
 *
 * 2026-09-10 に、nifty の売地を「賃貸と同じホストだから負荷も規約も軽い」
 * という理由で本命に選んだ。**規約はスクレイピングを名指しで禁じていた**
 * （CLAUDE.md 3 節）。出どころごとに「いつ・何を読んで・何が許されたか」を
 * コードの側に置いておかないと、同じ判断をもう一度する。
 *
 * **読んでいない先は、ここに足さない。**足すときは、規約の本文・出典・
 * 読んだ日を一緒に書く。
 *
 * ## 読んだもの（2026-09-13。利用者が本文を貼ってくれた）
 *
 * ### SUUMO「SUUMO(スーモ)へのリンクについて」（https://suumo.jp/help/link.html）
 *
 * > ※本サイトに掲載されている情報を、第三者が無断で営業手段にする行為を
 * > 禁じます。
 * > ※リンク許可については、以下の場合を除き、不動産・住宅サイト
 * > SUUMO（スーモ）トップページ、各地域のトップページのみとなります。
 * > a.現在SUUMO（スーモ）へ物件もしくは、会社情報を掲載をされている不動産会社
 * > b.行政・自治体などの非営利団体
 * > c.個人によるホームページ、およびブログなどのサービス
 *
 * 例外 c（個人のホームページ）に当たるかどうかは**利用者の判断**で、
 * こちらで当てはめない。2026-09-13 に「当たる」と判断をもらったので、
 * `SUUMO_PERSONAL_SITE_EXCEPTION` を立てて市区町村の賃貸一覧まで渡して
 * いる（`suumoCitySearchUrl`）。**旗を false にすれば、許可が明文で
 * ある全国と 8 地域のトップだけに戻る。**
 *
 * ### LIFULL HOME'S「リンクポリシー」（https://www.homes.co.jp/linkpolicy/）
 *
 * > 本サイトにリンクしていること自体や、掲載されている情報を営業の手段に
 * > することを禁じます
 * > リンク先はトップページ（https://www.homes.co.jp/）にお願いいたします
 * > …当サイトと何らかの提携または協力関係にあるものと誤認される、または
 * > 当サイトがリンク元サイトを認知もしくは支持していると誤認されるような
 * > サイト（からのリンクはお断りいたします）
 *
 * **トップページだけ。**地域のトップも無い。誤認させないための一言は
 * 表示側に置く（`PORTAL_LINK_DISCLAIMER`）。
 *
 * ## 表示の決め
 *
 * - 文言は**規約のサンプルにある呼び方をそのまま使う。**縮めない
 * - `rel` は HOME'S のサンプルに合わせて `nofollow noopener`。SUUMO の
 *   サンプルには無いが、付けて困るものではないので揃える
 * - 「探す」「物件を見る」のような、こちらの商いの導線に見える言い方を
 *   しない（両社とも「営業の手段にすることを禁じます」と書いている）
 */

import { SCRAPE_TARGETS } from "@/lib/scrapeTargets";
import { PREF_REGION, prefCodeByName } from "@/lib/prefContent";

export interface PortalLink {
  /** 台帳の鍵。 */
  portal: "suumo" | "homes";
  /** 規約のサンプルにある呼び方。縮めない。 */
  name: string;
  href: string;
  /** リンクの `rel`。両社のサンプルに合わせる。 */
  rel: string;
}

/** 誤認を避けるための一言。リンクを出す画面に必ず添える。 */
export const PORTAL_LINK_DISCLAIMER =
  "外部のサイトです。いずれとも提携・協力関係はありません。";

/**
 * SUUMO の「各地域のトップ」。規約のページに並んでいる 9 つがすべて。
 *
 * 鍵は `PREF_REGION` の呼び名。**同じ地方分けを 2 通り持たない**ため、
 * 県 → 地方は `prefContent` に任せてここでは URL だけを持つ
 * （`__tests__/portalLinks.test.ts` が 47 県ぶん突き合わせる）。
 */
const SUUMO_REGION_URL: Readonly<Record<string, string>> = {
  北海道: "https://suumo.jp/hokkaido/",
  東北: "https://suumo.jp/tohoku/",
  関東: "https://suumo.jp/kanto/",
  "北陸・甲信越": "https://suumo.jp/koshinetsu/",
  東海: "https://suumo.jp/tokai/",
  近畿: "https://suumo.jp/kansai/",
  中国: "https://suumo.jp/chugoku/",
  四国: "https://suumo.jp/shikoku/",
  "九州・沖縄": "https://suumo.jp/kyushu/",
};

const SUUMO_TOP = "https://suumo.jp/";
const HOMES_TOP = "https://www.homes.co.jp/";

/**
 * 市区町村ごとの賃貸一覧へ直接渡してよいか。**利用者の判断**（2026-09-13）。
 *
 * SUUMO の例外 c「個人によるホームページ、およびブログなどのサービス」に
 * 当たるかどうかの話。条文は b で「行政・自治体などの**非営利団体**」と
 * 非営利を明記しているのに、c は「個人による」としか書いていない。組織には
 * 非営利を求め、個人には求めていない書き分けと読んだ。すぐ上の
 * 「掲載されている情報を…営業手段にする行為を禁じます」は**掲載情報**の
 * 話で、リンクそのものの話ではない。
 *
 * **最終的に決めるのは SUUMO。**食い違いが出たら、ここを false にすれば
 * 地方のトップへ落ちる（下の `suumoCitySearchUrl` が null を返す）。
 *
 * **HOME'S には例外が無い。**誰であってもトップページだけなので、こちらの
 * 旗は SUUMO にしか効かない。
 */
export const SUUMO_PERSONAL_SITE_EXCEPTION = true;

/**
 * SUUMO の賃貸一覧の URL は、綴りではなく**数字のコード 3 つ**で決まる
 * （利用者が実物を貼ってくれた。2026-09-13）。
 *
 *     ar  地方        北海道 010 … 九州・沖縄 090（下の表）
 *     ta  都道府県    2 桁。**ゼロ埋めのまま**（北海道 01 / 宮城 04 / 東京 13）
 *     sc  市区町村    港区 13103 / 名古屋市中区 23106
 *
 * `sc` は JIS の 5 桁で、**このサイトが持っている市区町村コードと同じもの**
 * （`areaContent` の `code`）。`ta` はその先頭 2 桁。変換表を持たずに
 * 組み立てられる。
 *
 * 残りの欄（賃料・面積・築年数・敷礼）は「指定なし」の既定値をそのまま
 * 写す。**こちらで条件を足さない。**利用者が向こうの画面で選ぶ。
 *
 * ## 推測しないでよかった例
 *
 * 9 地方ぶん実物を貼ってもらって確定した（2026-09-13）。**並びは素直では
 * ない。**
 *
 *     070  四国    ← 中国だと思い込むところ
 *     080  中国
 *
 * 地方の並び順から埋めていたら、中国と四国が入れ替わったまま気付けない
 * （どちらも 200 を返す実在の頁なので、リンクは壊れず**別の地方が開く**）。
 * `ta` も `1` ではなく `01` で、ここも外していた。**実物を見るまで
 * 組み立てない**という決めが 2 か所で効いた。
 */
const SUUMO_AREA_CODE: Readonly<Record<string, string>> = {
  北海道: "010",
  東北: "020",
  関東: "030",
  "北陸・甲信越": "040",
  東海: "050",
  近畿: "060",
  四国: "070",
  中国: "080",
  "九州・沖縄": "090",
};

/** 「指定なし」の既定値。利用者が貼ってくれた URL の並びをそのまま写す。 */
const SUUMO_DEFAULT_QUERY =
  "cb=0.0&ct=9999999&et=9999999&cn=9999999&mb=0&mt=9999999" +
  "&shkr1=03&shkr2=03&shkr3=03&shkr4=03&fw2=&srch_navi=1";

/**
 * その市区町村の賃貸一覧。渡してよい根拠が無い・コードが壊れているときは
 * null を返す。**呼び出し側で組み立てない。**
 *
 * @param code JIS の市区町村コード 5 桁（`areaContent` の `code` と同じ）
 */
export function suumoCitySearchUrl(code: string): string | null {
  if (!SUUMO_PERSONAL_SITE_EXCEPTION) return null;
  if (!/^\d{5}$/.test(code)) return null;
  const prefCode = code.slice(0, 2);
  const ar = SUUMO_AREA_CODE[PREF_REGION[prefCode]];
  if (!ar) return null;
  return (
    "https://suumo.jp/jj/chintai/ichiran/FR301FC001/" +
    `?ar=${ar}&bs=040&ta=${prefCode}&sc=${code}&${SUUMO_DEFAULT_QUERY}`
  );
}

/**
 * 貼られた URL の**綴りから**市区町村コードを読む。
 *
 * ## これは取得ではない
 *
 * **URL を開きに行かない。**文字列を読むだけ。取りに行けばスクレイピング
 * で、nifty の特約が名指しで禁じている（backlog 29 節。見張りは
 * `__tests__/userSpotUrlNeverFetched.test.ts`）。
 *
 * 綴りを読むこと自体は、貼った本人が既に見ている情報を手で写す代わりに
 * しているだけで、相手のサーバーに 1 回も触らない。
 *
 * ## 読めるのは検索一覧の URL だけ
 *
 * SUUMO の**検索一覧**には `sc=13103` のように JIS の 5 桁が入っている
 * （`suumoCitySearchUrl` が組み立てているのと同じ欄）。ここから市区町村が
 * 決まるので、**貼るだけで方位・距離・相場が出せる。**
 *
 * **物件詳細の URL には入っていない。**`/chintai/jnc_000012345/` のように
 * 物件の id しか持たないので、場所は地図か地名で指してもらう。無理に
 * 当てずっぽうで決めない（違う街の方位を出すほうが害が大きい）。
 *
 * @returns JIS の市区町村コード 5 桁。読めなければ null。
 */
export function municipalityCodeFromPortalUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  /* 綴りを読むだけとはいえ、知らないホストの綴りを推測しない */
  if (u.protocol !== "https:") return null;
  if (u.host !== "suumo.jp" && u.host !== "www.suumo.jp") return null;

  const sc = u.searchParams.get("sc");
  if (!sc || !/^\d{5}$/.test(sc)) return null;
  /* 県のコードとして成り立たない先頭 2 桁は落とす（01〜47） */
  const pref = Number(sc.slice(0, 2));
  if (!Number.isInteger(pref) || pref < 1 || pref > 47) return null;
  return sc;
}

/**
 * 貼られた URL の**綴りから**都道府県コード（JIS 2 桁）を読む。
 *
 * `municipalityCodeFromPortalUrl` が市区町村まで読めないとき用。何も
 * 読めないと「読み取れませんでした」としか言えず、貼った人は何が
 * 足りないのか分からない（実際に HOME'S の県の一覧
 * `https://www.homes.co.jp/chintai/aichi/` を貼って止まった人がいる）。
 * 県まで読めれば「愛知県までしか指していない」と言える。
 *
 * ## 読めるもの
 *
 * - SUUMO の検索一覧の `ta=23`（`suumoCitySearchUrl` が組み立てる欄）
 * - HOME'S の `/chintai/<県のローマ字>/…`。ローマ字は `scrapeTargets` の
 *   47 県の台帳と同じ綴り（HOME'S も nifty も同じ英語の県名を使う）
 *
 * ## 読まないもの
 *
 * HOME'S の**市区町村**の綴り（`nagoya-city` のような）は読まない。
 * 市区町村のローマ字の表を持っておらず、綴りの規則も確かめられない
 * （相手のページを開かずに確かめる手段が無い）。当てずっぽうで別の街を
 * 出すより、県まで読んで「市区町村名で」と頼むほうがよい。
 *
 * **URL を開きに行かない**のは `municipalityCodeFromPortalUrl` と同じ。
 *
 * @returns JIS の都道府県コード 2 桁。読めなければ null。
 */
export function prefCodeFromPortalUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;

  if (u.host === "suumo.jp" || u.host === "www.suumo.jp") {
    const ta = u.searchParams.get("ta");
    if (!ta || !/^\d{2}$/.test(ta)) return null;
    const n = Number(ta);
    return n >= 1 && n <= 47 ? ta : null;
  }

  if (u.host === "www.homes.co.jp" || u.host === "homes.co.jp") {
    const m = u.pathname.match(/^\/chintai\/([a-z]+)\//);
    if (!m) return null;
    const target = SCRAPE_TARGETS.find((t) => t.slug === m[1]);
    if (!target) return null;
    return prefCodeByName(target.name) ?? null;
  }

  return null;
}

/**
 * 規約で名指しされている URL の全体。**ここに無い URL は作らない。**
 * 検査がこの集合の外を弾く。
 */
export const ALLOWED_PORTAL_URLS: readonly string[] = [
  SUUMO_TOP,
  ...Object.values(SUUMO_REGION_URL),
  HOMES_TOP,
];

/**
 * その県から渡してよい外部リンク。
 *
 * 県が分からない（未知のコード）ときは SUUMO も全国のトップにする。
 * 地方を当てずっぽうで決めない。
 */
export function portalLinksForPref(prefCode: string): PortalLink[] {
  const region = PREF_REGION[prefCode];
  const suumo = (region && SUUMO_REGION_URL[region]) || SUUMO_TOP;
  return [
    {
      portal: "suumo",
      name: "リクルートの不動産・住宅サイト SUUMO(スーモ)",
      href: suumo,
      rel: "nofollow noopener",
    },
    {
      portal: "homes",
      name: "不動産・住宅情報サービス【LIFULL HOME'S/ライフルホームズ】",
      href: HOMES_TOP,
      rel: "nofollow noopener",
    },
  ];
}
