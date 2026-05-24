import type { Metadata } from "next";
import { Geist, Geist_Mono, Shippori_Mincho } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const shipporiMincho = Shippori_Mincho({
  weight: ["400", "500", "600", "700", "800"], // Added weights
  variable: "--font-shippori-mincho",
  subsets: ["latin"], // latin is usually enough for basic loading, but google fonts handles the rest
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "真太陽時クロック | 禅モード",
    template: "%s | 真太陽時クロック",
  },
  description: "正確な吉凶行動をサポートする、極限までシンプルな真太陽時クロック。",
  openGraph: {
    title: "真太陽時クロック",
    description: "正確な吉凶行動をサポートする、極限までシンプルな真太陽時クロック。",
    url: "https://example.com", 
    siteName: "真太陽時クロック",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "真太陽時クロック",
    description: "正確な吉凶行動をサポートする、極限までシンプルな真太陽時クロック。",
  },
};

import { GlobalSidebar } from "@/components/GlobalSidebar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${shipporiMincho.variable} antialiased bg-black text-white`}
      >
        <div className="flex min-h-screen">
          <GlobalSidebar />
          <main className="flex-1 w-full min-w-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
