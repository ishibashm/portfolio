import type { Metadata } from "next";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
export const metadata: Metadata = {
  title: "引越し先を試算する",
  description:
    "引越し先の候補地について、出発地からの方位・距離・時期の吉凶を試算します。物件が決まる前の地域選びに使えます。",
  openGraph: {
    title: "引越し先を試算する",
    description:
      "引越し先の候補地について、出発地からの方位・距離・時期の吉凶を試算します。物件が決まる前の地域選びに使えます。",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
