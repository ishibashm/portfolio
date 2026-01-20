import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <footer className="py-8 bg-black text-center text-gray-600 text-sm">
          <p>© {new Date().getFullYear()} My Portfolio. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
