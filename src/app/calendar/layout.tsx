import type { Metadata } from "next";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
export const metadata: Metadata = {
  alternates: { canonical: "/calendar" },
  title: "引越しの日取りを選ぶ",
  description:
    "移転や契約に適した日を選ぶためのカレンダー。九星気学の方位盤、六曜、天赦日・一粒万倍日、天中殺の期間を突き合わせて、動くべき日を絞り込みます。",
  openGraph: {
      images: ["/ogp.png"],
    title: "引越しの日取りを選ぶ",
    description:
      "移転や契約に適した日を選ぶためのカレンダー。九星気学の方位盤、六曜、天赦日・一粒万倍日、天中殺の期間を突き合わせて、動くべき日を絞り込みます。",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
