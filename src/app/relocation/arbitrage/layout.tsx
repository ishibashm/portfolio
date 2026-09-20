import type { Metadata } from "next";
import { coreRouteLabel } from "@/lib/siteStructure";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
/* 名前は siteStructure が正（2026-09-20 に「物件を方位で探す」から改名）。
   文言は siteStructure の summary と同じ意味で書く。 */
const TITLE = coreRouteLabel("/relocation/arbitrage") ?? "";
const DESCRIPTION =
  "今住んでいる場所から見た八方位の吉凶と、それぞれの方位にある市区町村の家賃の水準・空き家率（e-Stat）を並べます。物件の掲載は出しません。";

export const metadata: Metadata = {
  alternates: { canonical: "/relocation/arbitrage" },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    images: ["/ogp.png"],
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
