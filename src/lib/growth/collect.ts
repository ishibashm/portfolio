import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { isIndexedArea } from "@/lib/areaAffiliate";
import { AFFILIATE_OFFERS } from "@/lib/affiliateOffers";
import { SITE_SAME_AS } from "@/lib/siteChannels";
import { CORE_ROUTES } from "@/lib/siteStructure";
import type { CanonicalGap, RepoFacts, ShortText } from "./types";

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function exists(root: string, path: string): boolean {
  return existsSync(join(root, path));
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function countable(text: string): number {
  return (
    text.match(/[0-9A-Za-z\u3040-\u30ff\u4e00-\u9faf々ー・]/g)?.length ?? 0
  );
}

function walkPages(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "api") continue;
      walkPages(path, out);
    } else if (name === "page.tsx") {
      out.push(path);
    }
  }
}

function ancestorRobotSources(page: string, appRoot: string): string[] {
  const out: string[] = [];
  let dir = join(page, "..");
  while (dir === appRoot || dir.startsWith(`${appRoot}/`)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout))
      out.push(stripComments(readFileSync(layout, "utf8")));
    if (dir === appRoot) break;
    dir = join(dir, "..");
  }
  return out;
}

function sameDirSources(page: string): string[] {
  const dir = join(page, "..");
  return ["page.tsx", "layout.tsx"]
    .map((name) => join(dir, name))
    .filter((file) => existsSync(file))
    .map((file) => stripComments(readFileSync(file, "utf8")));
}

/** metadata を隣のファイルへ出している頁（記事一覧など）を、直接の import まで見る。 */
function importSources(page: string, root: string): string[] {
  const raw = readFileSync(page, "utf8");
  if (
    !raw.includes("generateMetadata") &&
    !raw.includes("export const metadata")
  )
    return [];
  const out: string[] = [];
  for (const match of raw.matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
    const base = join(root, match[1].replace(/^@\//, "src/"));
    for (const ext of [".tsx", ".ts"]) {
      if (!existsSync(base + ext)) continue;
      out.push(stripComments(readFileSync(base + ext, "utf8")));
      break;
    }
  }
  return out;
}

/**
 * ルート layout の canonical: "/" は子へ継承されるので、子の穴は
 * 同じディレクトリの page か layout、またはその頁が直接 import した
 * ファイルだけを見る。親 layout は数えない。
 */
function canonicalGaps(root: string): CanonicalGap[] {
  const app = join(root, "src/app");
  const pages: string[] = [];
  walkPages(app, pages);
  const gaps: CanonicalGap[] = [];
  for (const page of pages) {
    if (relative(app, page) === "page.tsx") continue;
    const local = sameDirSources(page);
    const sources = [...local, ...importSources(page, root)];
    if (sources.some((src) => /\bcanonical\b/.test(src))) continue;
    const inherited = ancestorRobotSources(page, app);
    const indexable = [...local, ...inherited].every(
      (src) => !/index:\s*false/.test(src) && !src.includes("NOINDEX_ROBOTS"),
    );
    gaps.push({ file: relative(root, page), indexable });
  }
  return gaps;
}

function openGraphBypass(root: string): string[] {
  const app = join(root, "src/app");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== "api") walk(path);
        continue;
      }
      if (name !== "page.tsx" && name !== "layout.tsx") continue;
      if (relative(app, path) === "layout.tsx") continue;
      const src = stripComments(readFileSync(path, "utf8"));
      if (src.includes("openGraph:") && !src.includes("pageOpenGraph"))
        hits.push(relative(root, path));
    }
  };
  walk(app);
  return hits;
}

function splitFrontmatter(raw: string): { meta: string; body: string } {
  if (!raw.startsWith("---")) return { meta: "", body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { meta: "", body: raw };
  return { meta: raw.slice(3, end), body: raw.slice(end + 4) };
}

function metaField(meta: string, key: string): string {
  const match = meta.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function blogStats(root: string): {
  blogCount: number;
  draftCount: number;
  shortPosts: ShortText[];
  blogTitles: string[];
} {
  const dir = join(root, "content/blog");
  const titles: string[] = [];
  const shortPosts: ShortText[] = [];
  let blogCount = 0;
  let draftCount = 0;
  if (!existsSync(dir)) {
    return { blogCount, draftCount, shortPosts, blogTitles: titles };
  }
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    blogCount += 1;
    const { meta, body } = splitFrontmatter(
      readFileSync(join(dir, name), "utf8"),
    );
    const title = metaField(meta, "title");
    if (title) titles.push(title);
    if (metaField(meta, "draft") === "true") {
      draftCount += 1;
      continue;
    }
    const chars = countable(body);
    if (chars < 2000) {
      shortPosts.push({ id: name.replace(/\.md$/, ""), chars });
    }
  }
  shortPosts.sort((a, b) => a.chars - b.chars);
  return { blogCount, draftCount, shortPosts, blogTitles: titles };
}

function mcpToolNames(source: string): string[] {
  const block = source.match(
    /export const MCP_PUBLIC_TOOLS = \{([\s\S]*?)\} as const/,
  );
  if (!block) return [];
  return [...block[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(
    (match) => match[1],
  );
}

function areaStats(): {
  areaEditorialCount: number;
  indexedAreaCount: number;
  shortAreaLeads: ShortText[];
} {
  const shortAreaLeads: ShortText[] = [];
  let indexedAreaCount = 0;
  for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
    if (isIndexedArea(code)) indexedAreaCount += 1;
    const chars = countable(editorial.intro.join("\n"));
    if (chars < 200) shortAreaLeads.push({ id: code, chars });
  }
  shortAreaLeads.sort((a, b) => a.chars - b.chars);
  return {
    areaEditorialCount: Object.keys(AREA_EDITORIAL).length,
    indexedAreaCount,
    shortAreaLeads,
  };
}

/** リポジトリの公開面だけを数える。生年月日・座標・広告 ID は拾わない。 */
export function collectRepo(root: string): RepoFacts {
  const privacy = exists(root, "src/app/privacy/page.tsx")
    ? read(root, "src/app/privacy/page.tsx")
    : "";
  const adsTxt = exists(root, "src/app/ads.txt/route.ts")
    ? read(root, "src/app/ads.txt/route.ts")
    : "";
  const banner = exists(root, "src/components/ads/AdBanner.tsx")
    ? read(root, "src/components/ads/AdBanner.tsx")
    : "";
  const adsense = exists(root, "src/lib/adsense.ts")
    ? read(root, "src/lib/adsense.ts")
    : "";
  const layout = exists(root, "src/app/layout.tsx")
    ? read(root, "src/app/layout.tsx")
    : "";
  const llms = exists(root, "src/app/llms.txt/route.ts")
    ? read(root, "src/app/llms.txt/route.ts")
    : "";
  const robots = exists(root, "src/lib/siteStructure.ts")
    ? read(root, "src/lib/siteStructure.ts")
    : "";
  const home = exists(root, "src/app/page.tsx")
    ? read(root, "src/app/page.tsx")
    : "";
  const mcp = exists(root, "src/lib/mcpServer.ts")
    ? read(root, "src/lib/mcpServer.ts")
    : "";
  const blog = blogStats(root);
  const areas = areaStats();
  const hakobu = AFFILIATE_OFFERS.find((offer) => offer.id === "hakobu-moving");
  const rakuten = AFFILIATE_OFFERS.find(
    (offer) => offer.id === "rakuten-market",
  );

  return {
    coreRouteCount: CORE_ROUTES.length,
    coreRoutes: CORE_ROUTES.map((route) => ({
      href: route.href,
      label: route.label,
    })),
    ...blog,
    ...areas,
    canonicalGaps: canonicalGaps(root),
    openGraphBypass: openGraphBypass(root),
    trust: {
      privacy: privacy.length > 0,
      about: exists(root, "src/app/about/page.tsx"),
      contact: exists(root, "src/app/contact/page.tsx"),
      editorial: exists(root, "src/app/editorial/page.tsx"),
      privacyMentionsAdsense: privacy.includes("AdSense"),
      privacyMentionsAffiliate: privacy.includes("アフィリエイト"),
      privacyLinksContact: privacy.includes('href="/contact"'),
      privacyMentionsEea: privacy.includes("欧州経済領域"),
      privacyMentionsExternalSend: privacy.includes("外部送信"),
    },
    ads: {
      adsTxtRejectsPlaceholder:
        adsTxt.includes("getAdsenseIds") && adsTxt.includes("404"),
      bannerReservesSpace: banner.includes("AD_MIN_HEIGHT"),
      bannerLazy: banner.includes("IntersectionObserver"),
      selfMadeConsentUi: exists(root, "src/components/ads/AdConsentBar.tsx"),
      consentModeDefault:
        adsense.includes("gtag('consent','default'") &&
        adsense.includes('ad_storage: "denied"'),
      scriptStaysForReview:
        layout.includes("adsbygoogle.js") &&
        layout.includes("consentDefaultScript()") &&
        layout.indexOf("consentDefaultScript()") <
          layout.indexOf("adsbygoogle.js"),
    },
    mcpToolNames: mcpToolNames(mcp),
    llmsMentionsMcp: llms.includes("/api/mcp"),
    indexedRobotsLargePreview: robots.includes('"max-image-preview": "large"'),
    sameAs: [...SITE_SAME_AS],
    affiliate: {
      ids: AFFILIATE_OFFERS.map((offer) => offer.id),
      hakobuPlacements: hakobu?.placements?.length ?? 0,
      hakobuHasAreaNote: Boolean(hakobu?.note),
      rakutenPlacements: rakuten?.placements?.length ?? 0,
      includesDmm: AFFILIATE_OFFERS.some((offer) =>
        offer.id.toLowerCase().includes("dmm"),
      ),
    },
    homeLinksCore: home.includes("CORE_ROUTES"),
  };
}
