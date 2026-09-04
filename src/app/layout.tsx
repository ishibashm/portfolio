import type { Metadata, Viewport } from "next";
import { getAdsenseIds } from "@/lib/adsense";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import prisma from "@/lib/prisma";
import {
  CORE_ROUTES,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from "@/lib/siteStructure";

/*
  Geist は preload しない。既定では 2 書体ぶん（gzip 52 KB）が
  `<link rel="preload">` で最優先に落ちてきて、描画を止める CSS と
  hydration に要る JS の帯域を先に食う（遅い回線 400 kbps の実測で
  1 秒ぶん）。日本語の本文は端末のフォントで描くので、Geist が要る
  のは英数字だけ。文字が出てから届いても差し支えない（display は
  next/font の既定 swap）。
*/
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

/*
  明朝体（Shippori Mincho）はここで呼ばない。next/font を layout で
  呼ぶと、その @font-face（2 ウェイトで gzip 62 KB）が全頁の描画を
  止める stylesheet に入る。`lib/serifFont` に置いて、hydration 後に
  `SerifFontLoader` が読む。それまでは下の :root の既定（端末の明朝体）。
*/

// サイトの説明は src/lib/siteStructure.ts に集約している。
// 以前は「メタハブ／真太陽時クロック＋Katmerナレッジエンジン」と名乗っており、
// 実際の中身（引越しの方位と物件選び）と一致していなかった。
const TITLE = `${SITE_NAME} | ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  // canonical を相対パスで書けるようにする基準。
  // これが無いと各ページの alternates.canonical が解決されない。
  metadataBase: new URL("https://cloud-palette.com"),
  alternates: { canonical: "/" },
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
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
    // 共有されたときのプレビュー画像。これが無いと SNS やチャットで
    // 画像の無いカードになり、開かれる割合が落ちる。
    images: [
      {
        url: "/ogp.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} - ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    // summary_large_image を名乗る以上、画像が要る。
    card: "summary_large_image",
    title: TITLE,
    description: SITE_DESCRIPTION,
    images: ["/ogp.png"],
  },
  /*
    画像プレビューの上限。**指定が無いときの既定は standard**（小さな
    サムネイル）で、Google Discover は large を条件に挙げている。
    Discover は画像で読ませる面なので、この 1 行が無いと内容と関係なく
    載らない。

    noindex を出している頁（市区町村の未執筆分・ログイン後の画面など）は
    頁側の robots が優先されるので、ここで index を名乗っても戻らない。
  */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

/*
  themeColor は Next 15 で metadata から viewport へ移った。metadata に
  置いたままだと全頁のビルドで警告が出る（1,447 行）。値は変えていない。
*/
export const viewport: Viewport = {
  themeColor: "#faf7f3",
};

import { GlobalSidebar } from "@/components/GlobalSidebar";
import { PageViewBeacon } from "@/components/PageViewBeacon";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { SerifFontLoader } from "@/components/SerifFontLoader";
import { unstable_cache } from "next/cache";

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

  // 見本値のまま広告スクリプトを読み込まない。
  const adsense = getAdsenseIds();

  // サイトの地色と文字色は固定する。
  //
  // ホームの「AI相談」から配色を書き換えられる仕組みがあり、書き込まれた値は
  // 全訪問者の全ページに !important で適用される。実際に本番の body 背景が
  // #020617（ほぼ黒）になっており、明色前提で作られたカードの外側に暗い余白が
  // 出ていた。広告を載せるサイトで、訪問者の操作によって全体の見た目が変わるのは
  // 事故のもとなので、地色と文字色だけは受け付けない。
  //
  // アクセント・光量・角丸・書体は引き続き反映する（壊れようがない範囲）。
  const bg = "#faf7f3";
  const fg = "#292524";
  const accent = theme?.accent || "#f43f5e";
  const glowColor = theme?.glowColor || "#f43f5e";
  const glowIntensity =
    theme?.glowIntensity !== undefined ? theme.glowIntensity : 0.35;
  const animationSpeed = theme?.animationSpeed || "4s";
  const fontTheme = theme?.fontTheme || "sans";
  const noiseOpacity =
    theme?.noiseOpacity !== undefined ? theme.noiseOpacity : 0.03;
  const borderRadius = theme?.borderRadius || "12px";

  // Dynamic font-family binding。セリフ体テーマの変数クラスは
  // SerifFontLoader が届いた時点で body に付ける。
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

        {/*
          AdSense。next/script の afterInteractive は body の末尾へ移されるが、
          サイト確認も自動広告も <head> の素のタグを見るため、ここでは素の
          script を head に置く。管理画面が出す確認用スニペットと同じ形。
        */}
        {adsense && (
          <>
            <meta name="google-adsense-account" content={adsense.client} />
            <script
              async
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense.client}`}
              crossOrigin="anonymous"
            />
          </>
        )}

        {/*
          左上のメニューを、React が繋がる前から開けるようにする。

          ボタンは HTML には最初から出ているのに、onClick が付くのは
          hydration のあと。実測で、押しても何も起きない時間が物件検索で
          4.6 秒（良い回線）・8.7 秒（遅い回線）あった。利用者からの
          「反応が悪い」はこれ。

          開閉は <html data-menu> だけが持ち、見た目は globals.css が
          その属性を見て描く。React（GlobalSidebar）は読むだけで、
          切り替えはここ 1 か所。二重に切り替わらない。

          head に素で置く。next/script の afterInteractive では、
          結局 hydration と同じころまで待たされて意味が無い。
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener('click', function (e) {
                var el = e.target && e.target.closest
                  ? e.target.closest('[data-menu-toggle],[data-menu-close]')
                  : null;
                if (!el) return;
                var root = document.documentElement;
                var open = root.getAttribute('data-menu') === 'open';
                var next = el.hasAttribute('data-menu-close')
                  ? 'closed'
                  : (open ? 'closed' : 'open');
                root.setAttribute('data-menu', next);
                var btn = document.querySelector('[data-menu-toggle]');
                if (btn) btn.setAttribute('aria-expanded', next === 'open');
              });
              document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape') return;
                if (document.documentElement.getAttribute('data-menu') !== 'open') return;
                document.documentElement.setAttribute('data-menu', 'closed');
                var btn = document.querySelector('[data-menu-toggle]');
                if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
              });
            `,
          }}
        />

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
            /* 明朝体が届くまでの既定。届くと next/font の変数クラスが
               body で上書きする（SerifFontLoader）。 */
            --font-shippori-mincho: "Hiragino Mincho ProN", "Yu Mincho", YuMincho, serif;
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SerifFontLoader />
        <ChunkLoadRecovery />
        <PageViewBeacon />
        <div className="flex min-h-screen">
          <GlobalSidebar />
          {/* 投稿欄はここに置かない。記事（/blog/[slug]）だけに出す
              （利用者の指示）。以前は PageComments を置いて中核 9 頁
              すべてに出していた。 */}
          <main className="flex-1 w-full min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
