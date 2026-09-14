import {
  PORTAL_LINK_DISCLAIMER,
  portalLinksForPref,
  suumoCitySearchUrl,
} from "@/lib/portalLinks";

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
  const cityUrl = suumoCitySearchUrl(code);
  const prefLinks = portalLinksForPref(code.slice(0, 2));
  const suumo = prefLinks.find((l) => l.portal === "suumo");
  const homes = prefLinks.find((l) => l.portal === "homes");

  return (
    <div
      className={`rounded-2xl border border-slate-300 bg-white/90 p-4 ${className}`}
    >
      <p className="text-xs font-bold text-slate-800">
        {cityName}で募集中の部屋を見る
      </p>
      {/* 文の途中で改行すると、日本語の文中に半角スペースが入る
          （jsxJapaneseLinebreak が拾う）。1 つの式にまとめて渡す。 */}
      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
        {
          "このサイトは方位・暦・公的な統計を扱っていて、募集中の部屋そのものは持っていません。下の各社でご覧ください。"
        }
      </p>
      <ul className="mt-2 space-y-1 text-xs">
        {suumo && (
          <li>
            <a
              href={cityUrl ?? suumo.href}
              rel={suumo.rel}
              target="_blank"
              className="inline-flex min-h-[24px] items-center font-semibold text-indigo-700 underline hover:text-indigo-900"
            >
              {suumo.name}
            </a>
            {cityUrl && (
              <span className="ml-1 text-slate-500">（{cityName}の賃貸）</span>
            )}
          </li>
        )}
        {homes && (
          <li>
            <a
              href={homes.href}
              rel={homes.rel}
              target="_blank"
              className="inline-flex min-h-[24px] items-center font-semibold text-indigo-700 underline hover:text-indigo-900"
            >
              {homes.name}
            </a>
          </li>
        )}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">
        {PORTAL_LINK_DISCLAIMER}
      </p>
    </div>
  );
}

export default CityPortalLinks;
