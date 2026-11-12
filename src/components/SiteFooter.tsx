import Link from "next/link";
import { LineFriendLink } from "@/components/LineFriendLink";
import { YouTubeChannelLinks } from "@/components/YouTubeChannelLinks";
import { currentYearInJapan } from "@/lib/kigakuContent";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/siteStructure";

/**
 * 全ページ共通のフッター。
 *
 * 以前はトップにだけ「このサイトについて」「プライバシーポリシー」
 * 「お問い合わせ」「利用規約」が並び、ほかの頁の共通フッターには
 * LINE と YouTube しか無かった。AdSense の審査と再審査では、広告を
 * 出すどの頁からもプライバシーポリシーと運営者情報へ辿れることが
 * 求められる。導線はここに 1 か所だけ置く。
 *
 * 鑑定士・オーナーの入口も、記事側の導線が無い（鑑定士は掲載 0 件の
 * あいだ PractitionerStrip が何も描かない）ため、ここに置かないと
 * 辿り着けない。
 */
export const SITE_FOOTER_LINKS = [
  { href: "/guide", label: "使い方ガイド" },
  { href: "/practitioners", label: "鑑定士の掲載" },
  { href: "/owners", label: "オーナーの方へ" },
  { href: "/about", label: "このサイトについて" },
  { href: "/editorial", label: "編集方針" },
  { href: "/contact", label: "お問い合わせ" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/terms", label: "利用規約" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-300/80 px-4 py-6 text-sm">
      <p className="text-center text-xs font-semibold text-slate-600">
        © {currentYearInJapan()} {SITE_NAME}. {SITE_TAGLINE}ためのサービスです。
      </p>
      <nav
        aria-label="サイト情報"
        className="mx-auto mt-4 flex max-w-[1700px] flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500"
      >
        {SITE_FOOTER_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="hover:text-rose-600 transition-colors"
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/llms.txt"
          target="_blank"
          className="hover:text-rose-600 transition-colors font-mono text-[11px]"
        >
          AI Agent Spec (/llms.txt)
        </Link>
      </nav>
      <div className="mt-4 text-center">
        <LineFriendLink />
      </div>
      <nav
        aria-label="YouTube チャンネル"
        className="mx-auto mt-4 flex max-w-[1700px] flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-600"
      >
        <span className="font-bold text-slate-500">YouTube</span>
        <YouTubeChannelLinks className="flex flex-wrap gap-x-4 gap-y-2" />
      </nav>
    </footer>
  );
}
