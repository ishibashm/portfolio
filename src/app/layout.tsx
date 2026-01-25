import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GoogleTranslate from "@/components/GoogleTranslate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "My Portfolio | Creative Developer",
    template: "%s | My Portfolio",
  },
  description: "A portfolio site showcasing my work as a creative developer.",
  openGraph: {
    title: "My Portfolio",
    description: "A portfolio site showcasing my work as a creative developer.",
    url: "https://example.com", // 実際のドメインに変更してください
    siteName: "My Portfolio",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "My Portfolio",
    description: "A portfolio site showcasing my work as a creative developer.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white overflow-y-scroll`}
      >
        <Header />
        <main className="min-h-screen pt-16">
          {children}
        </main>
        <Footer />
        <GoogleTranslate />
      </body>
    </html>
  );
}
