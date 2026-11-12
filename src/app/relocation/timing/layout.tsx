import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/siteUrl";
import { ToolPageIntro } from "@/components/relocation/ToolPageIntro";

export const metadata: Metadata = {
  title: "引っ越し時期の全期間分析",
  description:
    "過去から未来まで、日ごと・方位ごとの吉凶を一望する。カレンダーヒートマップ、段階の分布、窓の帯グラフ、平年比で「いつ・どこへ動くか」を決める。",
  // market と同じく canonical と og:image が抜けていた。同格のページに揃える。
  alternates: { canonical: "/relocation/timing" },
  openGraph: pageOpenGraph(
    "/relocation/timing",
    "引っ越し時期の全期間分析",
    "日×方位の吉凶をカレンダーと分布で一望。窓の長さ・間隔・平年比まで。",
  ),
};

export default function TimingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ToolPageIntro
        guideHref="/guide/choose-date"
        guideLabel="日取りの使い方を読む"
      >
        生年月日と出発地から、年・月・日の条件が重なる引越しの時期を見ます。動ける日が先に決まると、探す範囲を絞れます。
      </ToolPageIntro>
      {children}
    </>
  );
}
