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
