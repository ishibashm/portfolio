import { PORTAL_LINK_DISCLAIMER, portalLinksForCity } from "@/lib/portalLinks";
import { PortalLinkList } from "./PortalLinkList";

/**
 * その市区町村の募集を、外部のサイトで見るための入口。
 *
 * ## なぜ要るか
 *
 * 賃貸の巡回は 2026-09-13 に止めた（規約。`docs/improvement-backlog.md`
 * 29 節）。掲載の条件は「30 日見かけていない行は掲載終了」なので、
 * **10 月中旬には自前の掲載が 0 件になる。**
 *
 * このサイトが持っているのは**方位・暦・公的な統計**で、そちらは何も
 * 変わらない。**足りなくなるのは「いま募集中の部屋」だけ**なので、
 * そこは持たずに渡す。コピーも転載もしない。
 *
 * ## 置き方の決め
 *
 * - **1 頁につき数本まで。**方位ごとの表（最大 8 方位 × 12 市区町村）の
 *   各行に貼ると 1 頁 96 本の外部リンクになる。読む側にも索引にも良くない
 * - **文言は台帳のものをそのまま使う**（`portalLinksForPref` の `name`）。
 *   規約のサンプルにある呼び方で、縮めない
 * - **こちらの商いの導線に見える言い方をしない。**両社とも「掲載されて
 *   いる情報を営業の手段にすることを禁じます」と書いている
 * - `PORTAL_LINK_DISCLAIMER` を必ず添える。HOME'S の規約が「提携または
 *   協力関係にあるものと誤認される」リンクを断っているため
 *
 * ## SUUMO だけ市区町村まで行ける
 *
 * SUUMO の例外 c「個人によるホームページ、およびブログなどのサービス」に
 * 当たるという利用者の判断（2026-09-13）。`SUUMO_PERSONAL_SITE_EXCEPTION`
 * を false にすれば `suumoCitySearchUrl` が null を返し、この部品は
 * 自動的に地方のトップだけに戻る。**HOME'S には例外が無い**ので、
 * どの県でもトップページだけ。
 *
 * ## 「この地点を調べる」と同じ仕組み（2026-09-23）
 *
 * 組み立ては `portalLinksForCity`、描くのは `PortalLinkList`。どちらも
 * 物件検索の「この地点を調べる」（`SpotVerdict`）と共有している。
 */
export function CityPortalLinks({
  /** JIS の市区町村コード 5 桁。 */
  code,
  /** 表示名（例: 愛知県名古屋市東区）。 */
  cityName,
  className = "",
}: {
  code: string;
  cityName: string;
  className?: string;
}) {
  /* 組み立ては台帳の 1 つ（「この地点を調べる」と同じ）、描くのも 1 つ */
  return (
    <PortalLinkList
      cityName={cityName}
      links={portalLinksForCity(code)}
      disclaimer={PORTAL_LINK_DISCLAIMER}
      className={className}
    />
  );
}

export default CityPortalLinks;
