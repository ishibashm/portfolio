/** Never trim or accept a URL: only an exact YouTube ID is allowed. */
export function isValidYouTubeId(id: unknown): id is string {
  return (
    typeof id === "string" && id.length === 11 && /^[A-Za-z0-9_-]{11}$/.test(id)
  );
}
