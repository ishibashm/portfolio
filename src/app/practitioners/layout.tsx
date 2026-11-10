import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/siteUrl";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * レイアウト側で持つ。canonical と og:image は同格のページに揃える。
 */
/**
 * **掲載が 1 件も無いあいだは noindex, follow（2026-11-10 にオーナーが決定）。**
 *
 * 一覧は承認済みの鑑定士だけを出す。0 件のときの頁は定型の 2 段落と
 * 「掲載を準備しています」だけで、本文が約 291 文字の薄い頁になる
 * （サイト監査 2026-11-10 P1-5）。索引に載せるのは中身ができてから。
 *
 * **静的に書いている理由。**0 件かどうかで切り替えるには、metadata を
 * 作るときに DB を読むことになる。だがビルドは DB に繋がない決まり
 * （ci.yml の Build の説明）で、next-sitemap の設定も CommonJS で DB を
 * 読めない。サイトマップだけは条件付きにできないので、片方だけ自動に
 * しても食い違いが残る。だから静的にして、戻す条件をここに書く。
 *
 * **戻すとき**（承認済みの鑑定士が 1 人以上になったら。承認は
 * /admin/practitioners）。次の 3 か所を一度に戻す。
 *   1. このファイルの robots の行を外す
 *   2. next-sitemap.config.js の NOT_A_PAGE から "/practitioners" を外す
 *   3. .github/workflows/site-audit.yml の「索引しない頁」2 か所の
 *      `for path in …` から /practitioners を外す（残すと「noindex が
 *      無い」で夜間監査が落ちる）
 * __tests__/practitionersNoindex.test.ts は 3 つの食い違いを見張っている。
 * 戻したらこのテストも消す。
 */
export const metadata: Metadata = {
  // 字面で書く（sitemapNoindexAgreement.test.ts が `index: false` を探して、
  // サイトマップと夜間監査の一覧に載っているかを見る）。
  robots: { index: false, follow: true },
  title: "九星気学の鑑定士",
  description:
    "引越しの方位と日取りを扱う鑑定士の掲載。暦と方位盤から機械的に決まるところから先、住む人の事情や家の間取りまで含めた判断を相談できます。掲載は登録制・無料。",
  alternates: { canonical: "/practitioners" },
  openGraph: pageOpenGraph(
    "/practitioners",
    "九星気学の鑑定士",
    "引越しの方位と日取りを扱う鑑定士の掲載。掲載は登録制・無料。",
  ),
};

export default function PractitionersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
