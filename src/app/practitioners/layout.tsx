import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageOpenGraph } from "@/lib/siteUrl";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * レイアウト側で持つ。canonical と og:image は同格のページに揃える。
 */
export const metadata: Metadata = {
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
  return (
    <>
      {/* 画面のパンくず（page.tsx）と同じ 2 段。/houi/area と同じ構造化データ */}
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", path: "/" },
          { name: "九星気学の鑑定士", path: "/practitioners" },
        ]}
      />
      {children}
    </>
  );
}
