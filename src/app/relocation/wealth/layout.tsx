import type { Metadata } from "next";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
export const metadata: Metadata = {
  title: "移住先の地域を比べる",
  description:
    "市区町村ごとの所得水準などの経済指標を吉方位マップと重ねて表示します。方位が良くても生活が成り立たなければ意味がないため、判断材料として併置しています。",
  openGraph: {
    title: "移住先の地域を比べる",
    description:
      "市区町村ごとの所得水準などの経済指標を吉方位マップと重ねて表示します。方位が良くても生活が成り立たなければ意味がないため、判断材料として併置しています。",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
