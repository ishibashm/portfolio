import type { Metadata } from "next";
import { Geist, Geist_Mono, Shippori_Mincho } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import prisma from "@/lib/prisma";
import {
  CORE_ROUTES,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from "@/lib/siteStructure";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const shipporiMincho = Shippori_Mincho({
  // 日本語フォントは 1 ウェイトあたりの実体が大きく、5 種類読むと
  // CSS だけで 464KB になっていた（全ページで転送 156KB）。
  // 実際に font-serif と併用されているのは font-bold(700) と
  // font-extrabold(800) だけで、800 は 2 箇所のみ。
  // 本文にセリフ体を選べるテーマがあるので 400 は残す。
  weight: ["400", "700"],
  variable: "--font-shippori-mincho",
  subsets: ["latin"], // latin is usually enough for basic loading, but google fonts handles the rest
  display: "swap",
});

// サイトの説明は src/lib/siteStructure.ts に集約している。
// 以前は「メタハブ／真太陽時クロック＋Katmerナレッジエンジン」と名乗っており、
// 実際の中身（引越しの方位と物件選び）と一致していなかった。
const TITLE = `${SITE_NAME} | ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  themeColor: "#faf7f3",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE_NAME,
  },
  openGraph: {
    title: TITLE,
    description: SITE_DESCRIPTION,
    url: "https://cloud-palette.com",
    siteName: SITE_NAME,
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

import { GlobalSidebar } from "@/components/GlobalSidebar";
import { unstable_cache } from "next/cache";
import Script from "next/script";

const getActiveTheme = unstable_cache(
  async () => {
    try {
      return await prisma.agentTheme.findFirst({
        orderBy: { createdAt: "desc" },
      });
    } catch (err) {
      console.error("Failed to load active agent theme:", err);
      return null;
    }
  },
  ["active-agent-theme"],
  { revalidate: 60, tags: ["agent-theme"] }
);

const jsonLdSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://cloud-palette.com/#website",
      "url": "https://cloud-palette.com",
      "name": `${SITE_NAME} | ${SITE_TAGLINE}`,
      "description": SITE_DESCRIPTION,
      "publisher": {
        "@id": "https://cloud-palette.com/#organization",
      },
      "inLanguage": "ja",
    },
    {
      "@type": "Organization",
      "@id": "https://cloud-palette.com/#organization",
      "name": "Cloud Palette Core Labs",
      "url": "https://cloud-palette.com",
      "logo": "https://cloud-palette.com/icon-512.png",
    },
    {
      "@type": "WebApplication",
      "name": `${SITE_NAME} ${SITE_TAGLINE}`,
      "operatingSystem": "All",
      // 引越し・住まい探しの道具として申告する。以前は BusinessApplication で、
      // 中身（住居選び）とカテゴリが一致していなかった。
      "applicationCategory": "LifestyleApplication",
      "url": "https://cloud-palette.com",
      "description": SITE_DESCRIPTION,
      "inLanguage": "ja",
      "featureList": CORE_ROUTES.map((r) => r.label),
    },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Load active agent theme from Supabase via Prisma (cached for 60s)
  const theme = await getActiveTheme();

  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID;

  // Active theme parameters or fallback defaults (Warm Glass theme)
  const bg = theme?.background || "#faf7f3";
  const fg = theme?.foreground || "#292524";
  const accent = theme?.accent || "#f43f5e";
  const glowColor = theme?.glowColor || "#f43f5e";
  const glowIntensity =
    theme?.glowIntensity !== undefined ? theme.glowIntensity : 0.35;
  const animationSpeed = theme?.animationSpeed || "4s";
  const fontTheme = theme?.fontTheme || "sans";
  const noiseOpacity =
    theme?.noiseOpacity !== undefined ? theme.noiseOpacity : 0.03;
  const borderRadius = theme?.borderRadius || "12px";

  // Dynamic font-family binding
  const fontStyleClass =
    fontTheme === "serif" ? shipporiMincho.variable : geistSans.variable;
  const fontVarName =
    fontTheme === "serif" ? "var(--font-serif)" : "var(--font-sans)";

  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        
        {/* LLMO / AI Search Agent Citation Links */}
        <link rel="author" href="https://cloud-palette.com" />
        <link rel="help" href="https://cloud-palette.com/llms.txt" />
        <meta name="citation_title" content={`${SITE_NAME} | ${SITE_TAGLINE}`} />
        <meta name="citation_publisher" content={SITE_NAME} />

        {/* Search Console / AdSense の所有権確認。値は環境変数から入れる。
            コードに直書きすると、確認のたびにデプロイが必要になる。 */}
        {process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION && (
          <meta
            name="google-site-verification"
            content={process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION}
          />
        )}
        {process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION && (
          <meta
            name="msvalidate.01"
            content={process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION}
          />
        )}

        {/* Structured Schema.org JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
        />

        {/* Google AdSense Integration (when NEXT_PUBLIC_ADSENSE_ID is defined) */}
        {adsenseId && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}

        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.log('SW registration failed: ', err);
                  });
                });
              }
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
          :root {
            --background: ${bg} !important;
            --foreground: ${fg} !important;
            --color-accent: ${accent} !important;
            --glow-color: ${glowColor} !important;
            --glow-intensity: ${glowIntensity} !important;
            --animation-speed: ${animationSpeed} !important;
            --noise-opacity: ${noiseOpacity} !important;
            --border-radius: ${borderRadius} !important;
            --font-family: ${fontVarName} !important;
          }
          
          body {
            background: var(--background) !important;
            color: var(--foreground) !important;
            font-family: var(--font-family), sans-serif !important;
          }

          /* Global borders and card radius scaling */
          .rounded-xl {
            border-radius: var(--border-radius) !important;
          }
          .rounded-2xl {
            border-radius: calc(var(--border-radius) * 1.5) !important;
          }
          .rounded-lg {
            border-radius: calc(var(--border-radius) * 0.8) !important;
          }

          /* Ambient Glow bindings */
          .text-glow {
            text-shadow: 0 0 10px var(--glow-color), 0 0 20px var(--glow-color) !important;
            opacity: var(--glow-intensity);
          }

          /* Screen grain noise overlay */
          body::before {
            content: "";
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            opacity: var(--noise-opacity);
            pointer-events: none;
            z-index: 9999;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          }
        `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${shipporiMincho.variable} ${fontStyleClass} antialiased`}
      >
        <div className="flex min-h-screen">
          <GlobalSidebar />
          <main className="flex-1 w-full min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
