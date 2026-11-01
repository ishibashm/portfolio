/**
 * 自律エージェントが書いた作業ログ。
 *
 * `scripts/site_guardian_daemon.ts` の write_blog_post が
 * `agent-${題}-${時刻}` の slug で BlogPost を作る。公開記事ではない。
 * 既存の行は消さない（本番 DB には触らない）。公開側が slug で落とす。
 */
export const AGENT_LOG_SLUG_PREFIX = "agent-";

export function isAgentLogSlug(slug: string): boolean {
  return slug.startsWith(AGENT_LOG_SLUG_PREFIX);
}
