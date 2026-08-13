import type { Metadata } from "next";

/**
 * 管理者専用のアクセス状況。/admin は nonCoreRoutes.json に入っており、
 * middleware がログイン + ADMIN_EMAIL で守り、robots とサイトマップ
 * からも外れる。念のため noindex も宣言しておく。
 */
export const metadata: Metadata = {
  title: "アクセス状況（管理）",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
