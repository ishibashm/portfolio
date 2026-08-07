import type { Metadata } from "next";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
export const metadata: Metadata = {
  alternates: { canonical: "/relocation/arbitrage" },
  title: "物件を方位で探す",
  description:
    "今住んでいる場所から見た方位と、移転に適した時期で賃貸物件を絞り込みます。同じ部屋の重複掲載をまとめ、専有面積あたりの賃料の割安さと吉凶を併せて評価します。",
  openGraph: {
    title: "物件を方位で探す",
    description:
      "今住んでいる場所から見た方位と、移転に適した時期で賃貸物件を絞り込みます。同じ部屋の重複掲載をまとめ、専有面積あたりの賃料の割安さと吉凶を併せて評価します。",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
