import Link from "next/link";
import { Play } from "lucide-react";
import { isValidYouTubeId } from "@/lib/blogVideo";

export function BlogCardVideo({
  post,
}: {
  post: { slug: string; title: string; youtubeId?: string };
}) {
  if (!isValidYouTubeId(post.youtubeId)) return null;
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="relative mb-4 block w-full overflow-hidden rounded-xl bg-slate-100"
      style={{ aspectRatio: "16 / 9" }}
      aria-label={`記事を読む: ${post.title}`}
    >
      {/* 外部の固定サイズ画像を直接lazy読込。プレーヤーとJSは一覧に含めない。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://i.ytimg.com/vi/${post.youtubeId}/hqdefault.jpg`}
        alt={post.title}
        width={480}
        height={360}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center"
      >
        <span className="rounded-xl bg-red-600 px-5 py-3 text-white shadow">
          <Play className="h-6 w-6 fill-current" />
        </span>
      </span>
      <span className="absolute bottom-2 right-2 rounded bg-black/75 px-2 py-1 text-xs text-white">
        動画
      </span>
    </Link>
  );
}
