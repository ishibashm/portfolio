import type { Metadata } from "next";
import { contentYears } from "@/lib/kigakuContent";
import { SITE_NAME } from "@/lib/siteStructure";
import { pageOpenGraph } from "@/lib/siteUrl";

/**
 * ページ本体とは分けてここで metadata を宣言する。
 *
 * title を文字列にすると、解決後の template が null になる。月ページ
 * （/calendar/[month]）が子なので、「 | Cloud Palette」が付かない。
 * default はこの頁、template は月ページ用。
 */
const TITLE = "引越し吉日カレンダー｜引越しの日取りを選ぶ";
const YEAR_LIST = contentYears()
  .map((year) => `${year}年`)
  .join("・");
const DESCRIPTION = `引越し吉日を、六曜・天赦日・一粒万倍日・天中殺の期間と九星気学の方位盤で突き合わせて絞り込むカレンダー。${YEAR_LIST}の吉日一覧は入力なしで見られます。`;

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
