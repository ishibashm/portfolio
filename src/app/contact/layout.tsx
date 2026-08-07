import type { Metadata } from "next";

/**
 * ページ本体がクライアントコンポーネントで metadata を export できないため、
 * ここで宣言する。無いとサイト全体の既定値が使われ、
 * どのページも同じタイトルと説明で検索結果に並んでしまう。
 */
export const metadata: Metadata = {
  alternates: { canonical: "/contact" },
  title: "お問い合わせ",
  description:
    "判定内容の誤り、物件データの不備、掲載の停止依頼などのご連絡はこちらから。運営者のみが確認します。",
  openGraph: {
    title: "お問い合わせ",
    description:
      "判定内容の誤り、物件データの不備、掲載の停止依頼などのご連絡はこちらから。運営者のみが確認します。",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
