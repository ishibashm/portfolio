import { LINE_OFFICIAL_URL } from "@/lib/lineOfficial";

export function LineFriendLink() {
  return (
    <a
      href={LINE_OFFICIAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-slate-600 underline underline-offset-4 hover:text-slate-900"
    >
      更新のお知らせをLINEで受け取る
    </a>
  );
}
