import type { Metadata } from "next";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
export const metadata: Metadata = {
  alternates: { canonical: "/relocation/dashboard" },
  title: "今日の方位と時刻を確かめる",
  /* 文言は siteStructure の summary と同じ意味で書く（/about・ホームの
     札・検索結果で同じ頁を別の言葉で説明しない）。 */
  description:
    "生年月日と出発地から、今日の 8 方位の吉凶・いまの時間帯の天中殺・真太陽時を 1 画面で確かめる。目的地を地名で指定して、その方位が今日使えるかを見る。",
  openGraph: {
    images: ["/ogp.png"],
    title: "今日の方位と時刻を確かめる",
    description:
      "今日の 8 方位の吉凶・いまの時間帯の天中殺・真太陽時を 1 画面で。目的地を地名で指定して、その方位が今日使えるかを見る。",
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
