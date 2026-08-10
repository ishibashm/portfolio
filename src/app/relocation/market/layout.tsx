import type { Metadata } from "next";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * レイアウト側で持つ。
 */
export const metadata: Metadata = {
  title: "家賃市場の計量分析",
  description:
    "全国の賃貸掲載データを、株式の定量分析と同じ道具（ヘドニック回帰・分布分析・生存分析）で毎晩分析します。",
  openGraph: {
    title: "家賃市場の計量分析",
    description:
      "ヘドニック回帰による適正家賃、割安・割高の分布、掲載の消化速度（流動性）を毎晩更新。",
  },
};

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
