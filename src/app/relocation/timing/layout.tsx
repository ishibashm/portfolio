import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "引っ越し時期の全期間分析",
  description:
    "過去から未来まで、日ごと・方位ごとの吉凶を一望する。カレンダーヒートマップ、段階の分布、窓の帯グラフ、平年比で「いつ・どこへ動くか」を決める。",
  openGraph: {
    title: "引っ越し時期の全期間分析",
    description:
      "日×方位の吉凶をカレンダーと分布で一望。窓の長さ・間隔・平年比まで。",
  },
};

export default function TimingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
