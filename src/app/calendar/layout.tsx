import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteStructure";
import { pageOpenGraph } from "@/lib/siteUrl";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 *
 * title を文字列にすると、解決後の template が null になる。月ページ
 * （/calendar/[month]）が子なので、「 | Cloud Palette」が付かない。
 * default はこの頁、template は月ページ用。
 */
const TITLE = "引越しの日取りを選ぶ";
const DESCRIPTION =
  "移転や契約に適した日を選ぶためのカレンダー。九星気学の方位盤、六曜、天赦日・一粒万倍日、天中殺の期間を突き合わせて、動くべき日を絞り込みます。";

export const metadata: Metadata = {
  alternates: { canonical: "/calendar" },
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  openGraph: pageOpenGraph("/calendar", TITLE, DESCRIPTION),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
