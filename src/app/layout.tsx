import type { Metadata } from "next";
import { Geist, Geist_Mono, Shippori_Mincho } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import prisma from "@/lib/prisma";

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
    default: "Cloud Palette Meta-Hub | 真太陽時クロック",
    template: "%s | Cloud Palette",
  },
  description:
    "正確な吉凶行動をサポートする、極限までシンプルな真太陽時クロックとKatmer Defuddleナレッジエンジン。",
  manifest: "/manifest.json",
  themeColor: "#0a0a0a",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cloud Palette",
  },
  openGraph: {
    title: "Cloud Palette Meta-Hub",
    description:
      "正確な吉凶行動をサポートする、極限までシンプルな真太陽時クロックとKatmer Defuddleナレッジエンジン。",
    url: "https://cloud-palette.com",
    siteName: "Cloud Palette",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cloud Palette Meta-Hub",
    description:
      "正確な吉凶行動をサポートする、極限までシンプルな真太陽時クロックとKatmer Defuddleナレッジエンジン。",
  },
};

import { GlobalSidebar } from "@/components/GlobalSidebar";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Load active agent theme from Supabase via Prisma
  let theme = null;
  try {
    theme = await prisma.agentTheme.findFirst({
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.error("Failed to load active agent theme:", err);
  }

  // Active theme parameters or fallback defaults
  const bg = theme?.background || "#0a0a0a";
  const fg = theme?.foreground || "#ededed";
  const accent = theme?.accent || "#10b981";
  const glowColor = theme?.glowColor || "#10b981";
  const glowIntensity =
    theme?.glowIntensity !== undefined ? theme.glowIntensity : 0.5;
  const animationSpeed = theme?.animationSpeed || "4s";
  const fontTheme = theme?.fontTheme || "sans";
  const noiseOpacity =
    theme?.noiseOpacity !== undefined ? theme.noiseOpacity : 0.05;
  const borderRadius = theme?.borderRadius || "8px";

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
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
        className={`${geistSans.variable} ${geistMono.variable} ${shipporiMincho.variable} ${fontStyleClass} antialiased bg-black text-white`}
      >
        <div className="flex min-h-screen">
          <GlobalSidebar />
          <main className="flex-1 w-full min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
