import { LineFriendLink } from "@/components/LineFriendLink";
import { YouTubeChannelLinks } from "@/components/YouTubeChannelLinks";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-300/80 px-4 py-6 text-sm">
      <div className="text-center">
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
