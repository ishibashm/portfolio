import type { PortalLink } from "@/lib/portalLinks";

/**
 * 外部の不動産サイトへの入口を描く**だけ**の部品。リンクは受け取る。
 *
 * ## なぜ分けたか（2026-09-23）
 *
 * 同じ札が 2 か所にあった。市区町村ページ（`CityPortalLinks`）と、
 * 物件検索の「この地点を調べる」（`SpotVerdict`、#1504）。組み立ては
 * どちらも台帳の `portalLinksForCity` だが、**描き方を 2 通り持つと、
 * 断り書きや rel の決めが片方だけ変わる。**
 *
 * **台帳を値で import しない**（`import type` だけ）。`portalLinks` は
 * `prefContent` を引き、その先で方位の JSON と暦エンジンまで連れてくる。
 * 物件検索の頁は画面側で組めない（`arbitrageBundleLeaf`）ので、リンクと
 * 断り書きはサーバ（`/api/geocode/reverse`）から受け取って渡す。
 *
 * ## 決め（lib/portalLinks の台帳のまま）
 *
 * - 文言は台帳の `name` をそのまま使う。縮めない
 * - `rel` も台帳の値。新しいタブで開く
 * - 断り書きを必ず出す（HOME'S の規約が「提携または協力関係にあると
 *   誤認される」リンクを断っている）
 * - こちらの商いの導線に見える言い方をしない
 */
export function PortalLinkList({
  cityName,
  links,
  disclaimer,
  note,
  className = "",
}: {
  /** 表示名（例: 広島県広島市中区）。 */
  cityName: string;
  links: readonly PortalLink[];
  /** `PORTAL_LINK_DISCLAIMER`。値の import を避けるため受け取る。 */
  disclaimer: string;
  /** 断り書きの後ろに添える 1 文（任意）。 */
  note?: string;
  className?: string;
}) {
  if (links.length === 0) return null;
  return (
    <div
      className={`rounded-2xl border border-slate-300 bg-white/90 p-4 ${className}`}
    >
      <p className="text-xs font-bold text-slate-800">
        {cityName}で募集中の部屋を見る
      </p>
      {/* 文の途中で改行すると、日本語の文中に半角スペースが入る
          （jsxJapaneseLinebreak が拾う）。1 つの式にまとめて渡す。 */}
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        {
          "このサイトは方位・暦・公的な統計を扱っていて、募集中の部屋そのものは持っていません。下の各社でご覧ください。"
        }
      </p>
      <ul className="mt-2 space-y-1 text-xs">
        {links.map((link) => (
          <li key={link.portal}>
            <a
              href={link.href}
              rel={link.rel}
              target="_blank"
              className="inline-flex min-h-[24px] items-center font-semibold text-indigo-700 underline hover:text-indigo-900"
            >
              {link.name}
            </a>
            {link.city && (
              <span className="ml-1 text-slate-500">（{cityName}の賃貸）</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {note ? `${disclaimer}${note}` : disclaimer}
      </p>
    </div>
  );
}

export default PortalLinkList;
