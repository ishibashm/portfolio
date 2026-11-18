import type { Metadata } from "next";

/**
 * 管理画面は検索に出さない。
 * /admin は robots とサイトマップからも外れている。頁が metadata を
 * 持たないものは、ここで noindex にする。子が robots を書いた場合は
 * その宣言が優先される。
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
