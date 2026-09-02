import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Providers } from "@/components/Providers";
import { GlobalUploader } from "@/components/GlobalUploader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Katmer Knowledge Base",
  description: "Your second brain for research, ideas, and documentation.",
  /*
   * 検索結果に出さない。
   *
   * これは個人用の道具で、公開する内容ではない。ログインが要るので中身は
   * 出ないが、URL だけが索引に載ることはある。cloud-palette.com は過去に
   * AdSense へ「有用性の低いコンテンツ」と判定されてサイト全体の配信が
   * 止まっており、同じドメイン配下に中身の無いページが載るのは不利にしか
   * ならない。
   *
   * **robots.txt の Disallow では足りない。**本体サイトのサイドバーから
   * 全ページでここへリンクしているので、クロールを止めると本文を読めない
   * まま URL だけが索引される（noindex を書いても読まれない）。
   * 「クロールは許す + noindex」がこの状況の正しい組み合わせなので、
   * robots.txt は置かずにここで noindex を出す。
   */
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-screen bg-zinc-50 dark:bg-zinc-950 overflow-hidden text-zinc-900 dark:text-zinc-100">
        <Providers>
          <Sidebar />

          <main className="flex-1 overflow-y-auto">{children}</main>

          <GlobalUploader />
        </Providers>
      </body>
    </html>
  );
}
