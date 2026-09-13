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
 * **市区町村の検索結果ページには貼らない。**例外 c（個人のホームページ）に
 * 当たるかどうかは利用者の判断で、こちらで当てはめない。許可が明文で
 * ある全国と 8 地域のトップだけを持つ。
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

import { PREF_REGION } from "@/lib/prefContent";

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
