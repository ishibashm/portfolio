import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/siteStructure";
import { pageOpenGraph } from "@/lib/siteUrl";

/**
 * 過去の移動は登録した場所の一覧で、検索結果に出す中身が無い。
 * page.tsx は "use client" なので、noindex と canonical はここへ書く。
 * ルート layout の canonical（/）を継承すると、ホームの重複に見える。
 */

const TITLE = "過去の移動";
const DESCRIPTION =
  "これまでに住んだ場所を記録し、方位の基準になる点を確かめる画面です。登録内容は検索に出しません。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/relocation/history" },
  robots: NOINDEX_ROBOTS,
  openGraph: pageOpenGraph("/relocation/history", TITLE, DESCRIPTION),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
