import type { Metadata } from "next";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
export const metadata: Metadata = {
  alternates: { canonical: "/relocation/dashboard" },
  title: "今日の方位と時刻を確かめる",
  description:
    "生年月日と現在地から、いまの日盤の吉凶・真太陽時・天中殺を 1 画面で確かめるダッシュボード。目的地を地名で指定して、その方位が今日使えるかを見る。",
  openGraph: {
    images: ["/ogp.png"],
    title: "今日の方位と時刻を確かめる",
    description:
      "いまの日盤の吉凶・真太陽時・天中殺を 1 画面で。目的地を地名で指定して、その方位が今日使えるかを見る。",
    url: "/relocation/dashboard",
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
