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
    default: "Solar Time Clock | Zen Mode",
    template: "%s | Solar Time Clock",
  },
  description: "A minimal True Solar Time clock for precise auspicious actions.",
  openGraph: {
    title: "Solar Time Clock",
    description: "A minimal True Solar Time clock for precise auspicious actions.",
    url: "https://example.com", 
    siteName: "Solar Time Clock",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solar Time Clock",
    description: "A minimal True Solar Time clock for precise auspicious actions.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white overflow-hidden`}
      >
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
