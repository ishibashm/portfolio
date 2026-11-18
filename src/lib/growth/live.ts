import { assertOwnSiteUrl } from "./safety";
import type { GrowthConfig, LiveProbe, LiveSnapshot } from "./types";

const PATHS = [
  "/robots.txt",
  "/llms.txt",
  "/llms-full.txt",
  "/ads.txt",
  "/privacy",
  "/sitemap.xml",
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function noteFor(path: string, status: number, body: string): string {
  if (path === "/ads.txt") {
    if (status === 404) return "プレースホルダ ID は出していない";
    if (status === 200 && /google\.com,\s*pub-\d{16},\s*DIRECT/.test(body)) {
      return "google.com の DIRECT 行がある。ID は記録しない";
    }
    return "DIRECT 行は確認できなかった";
  }
  if (path === "/robots.txt") {
    return body.includes("Sitemap:")
      ? "Sitemap を宣言している"
      : "Sitemap 行が無い";
  }
  if (path === "/llms.txt" || path === "/llms-full.txt") {
    return body.includes("/api/mcp")
      ? "MCP の入口に触れている"
      : "MCP の入口が見当たらない";
  }
  if (path === "/privacy") {
    const hasPolicy = body.includes("プライバシー") || body.includes("Cookie");
    return hasPolicy
      ? "プライバシーの文言がある"
      : "プライバシーの文言が見当たらない";
  }
  if (path === "/sitemap.xml") {
    const count = body.match(/<loc>/g)?.length ?? 0;
    return `loc ${count} 件（索引か子サイトマップ）`;
  }
  return `${status}`;
}

/**
 * 自サイトの公開 URL だけを、間隔を空けて少数見る。
 * 本文はレポートに残さない（広告 ID や計測パラメータが混ざるため）。
 */
export async function fetchOwnSite(
  config: GrowthConfig,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<LiveSnapshot> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const probes: LiveProbe[] = [];
  const limit = Math.max(0, config.maxLiveRequests);
  for (const path of PATHS.slice(0, limit)) {
    const target = new URL(path, config.siteUrl).toString();
    assertOwnSiteUrl(config.siteUrl, target);
    try {
      const res = await fetchImpl(target, {
        headers: { "user-agent": "cloud-palette-growth-framework" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      if (res.url) assertOwnSiteUrl(config.siteUrl, res.url);
      const body = (await res.text()).slice(0, 200_000);
      const ok =
        path === "/ads.txt"
          ? res.status === 200 || res.status === 404
          : res.status === 200;
      probes.push({
        path,
        ok,
        status: res.status,
        note: noteFor(path, res.status, body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "取得に失敗";
      probes.push({
        path,
        ok: false,
        status: null,
        note: message.slice(0, 180),
      });
    }
    if (config.requestIntervalMs > 0) await sleep(config.requestIntervalMs);
  }
  return { attempted: true, probes };
}
