import type { Metadata } from "next";

/**
 * ログイン画面を索引から外すためだけのレイアウト。
 *
 * page.tsx は "use client" なので metadata を書けない。索引の指示は
 * サーバ側からしか出せないため、レイアウトを 1 枚挟む。
 *
 * Search Console が
 *
 *   重複しています。ユーザーにより、正規ページとして選択されていません
 *   https://cloud-palette.com/login?next=/rentals
 *
 * を出していた。ログイン後の戻り先を `?next=` で持つので、**戻り先の数だけ
 * URL が増える。**中身はどれも同じログイン画面なので、Google から見れば
 * 重複した URL の群れになる。しかも `/rentals` は削除済みのページで、
 * 索引に載る意味がまったく無い。
 *
 * サイトマップからは既に外していた（next-sitemap.config.js の NOT_A_PAGE）
 * が、**サイトマップに無いことと索引に載らないことは別。**リンクを辿って
 * 拾われる。
 *
 * robots.txt で塞ぐのは選ばない。塞ぐとこの noindex を読めなくなり、
 * 「リンクだけを根拠に索引へ載る」形が残る。**クロールは許して
 * noindex を読ませる。**
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
