/** Never trim or accept a URL: only an exact YouTube ID is allowed. */
export function isValidYouTubeId(id: unknown): id is string {
  return (
    typeof id === "string" && id.length === 11 && /^[A-Za-z0-9_-]{11}$/.test(id)
  );
}

/** Frontmatter wins; otherwise recognize explicit embed URLs, not ordinary references. */
export function blogCardVideoId(post: {
  youtubeId?: string;
  body?: string;
}): string | undefined {
  if (isValidYouTubeId(post.youtubeId)) return post.youtubeId;
  const body = (post.body ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "");
  const match = body.match(
    /https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/([A-Za-z0-9_-]{11})(?=[?\s"'<>)/]|$)/,
  );
  return match?.[1];
}

/**
 * VideoObject の uploadDate を、Google が求めるタイムゾーン付き ISO 8601 にする。
 *
 * 記事の frontmatter は日付だけ（例: 2026-10-24）で書いている。
 * そのまま出すと Search Console が「日時値が無効」「タイムゾーンが無い」
 * として検出する（2026-11-10 の通知）。日本時間として補う。
 */
export function normalizeVideoUploadDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00+09:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    return `${s}+09:00`;
  }
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)
  ) {
    return s;
  }
  return undefined;
}
