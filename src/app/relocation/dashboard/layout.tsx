import { Suspense } from "react";
import { FortuneReport } from "@/components/fortune/FortuneReport";
import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/siteUrl";
import { ToolPageIntro } from "@/components/relocation/ToolPageIntro";

// Evaluate the server flag and authenticated report on each page request.
export const dynamic = "force-dynamic";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
export const metadata: Metadata = {
  alternates: { canonical: "/relocation/dashboard" },
  title: "今日の吉方位と時間帯を生年月日で確認｜目的地の方位と真太陽時",
  /* 文言は siteStructure の summary と同じ意味で書く（/about・ホームの
     札・検索結果で同じ頁を別の言葉で説明しない）。 */
  description:
    "生年月日と出発地から、今日の 8 方位の吉凶・時間帯の吉凶・真太陽時を 1 画面で確かめる。目的地を地名で指定して、その方位が今日使えるかを見る。",
  openGraph: pageOpenGraph(
    "/relocation/dashboard",
    "今日の吉方位と時間帯を生年月日で確認｜目的地の方位と真太陽時",
    "今日の 8 方位の吉凶・時間帯の吉凶・真太陽時を 1 画面で。目的地を地名で指定して、その方位が今日使えるかを見る。",
  ),
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ToolPageIntro
        guideHref="/guide/honmei"
        guideLabel="本命星と吉方位の使い方を読む"
      >
        生年月日と出発地を入れると、今日の八方位の吉凶、時間帯の吉凶、真太陽時を
        1
        画面で確かめられます。目的地を地名で指定すると、その方位が今日使えるかを見られます。ログインは不要です。
      </ToolPageIntro>
      <Suspense fallback={null}>
        <FortuneReport />
      </Suspense>
      {children}
    </>
  );
}
