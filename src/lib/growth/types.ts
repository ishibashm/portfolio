export type GrowthProviderName =
  | "heuristic"
  | "openai"
  | "anthropic"
  | "google"
  | "xai";

export type GrowthRole =
  | "auditor"
  | "growth"
  | "planner"
  | "content"
  | "design"
  | "media"
  | "monetization"
  | "builder"
  | "verifier";

export type FindingSeverity = "blocker" | "high" | "medium" | "low" | "ok";

export type BacklogArea =
  | "traffic"
  | "content"
  | "design"
  | "video"
  | "illustration"
  | "feature"
  | "monetization";

export interface GrowthConfig {
  siteUrl: string;
  provider: GrowthProviderName;
  liveFetch: boolean;
  maxLiveRequests: number;
  requestIntervalMs: number;
  outputDir: string;
  /** 所有者が管理画面で確認した審査状態。コードからは推定しない。 */
  adsenseReview: "not-passed" | "passed";
  providers: Record<
    GrowthProviderName,
    {
      kind: "heuristic" | "openai-compatible" | "anthropic" | "google";
      model?: string;
      apiKeyEnv?: string;
      baseUrl?: string;
    }
  >;
}

export interface CanonicalGap {
  file: string;
  indexable: boolean;
}

export interface ShortText {
  id: string;
  chars: number;
}

export interface RepoFacts {
  coreRouteCount: number;
  coreRoutes: { href: string; label: string }[];
  blogCount: number;
  draftCount: number;
  shortPosts: ShortText[];
  blogTitles: string[];
  areaEditorialCount: number;
  indexedAreaCount: number;
  shortAreaLeads: ShortText[];
  canonicalGaps: CanonicalGap[];
  openGraphBypass: string[];
  trust: {
    privacy: boolean;
    about: boolean;
    contact: boolean;
    editorial: boolean;
    privacyMentionsAdsense: boolean;
    privacyMentionsAffiliate: boolean;
    privacyLinksContact: boolean;
    privacyMentionsEea: boolean;
    privacyMentionsExternalSend: boolean;
  };
  ads: {
    adsTxtRejectsPlaceholder: boolean;
    bannerReservesSpace: boolean;
    bannerLazy: boolean;
    /** 自作の同意バーがある（認定されないので、あれば指摘する）。 */
    selfMadeConsentUi: boolean;
    /** 同意モード v2 の既定値（EEA・英国・スイスで denied）を置いている。 */
    consentModeDefault: boolean;
    /** 既定値が adsbygoogle.js より前にあり、スクリプト自体は head に残る。 */
    scriptStaysForReview: boolean;
  };
  mcpToolNames: string[];
  llmsMentionsMcp: boolean;
  indexedRobotsLargePreview: boolean;
  sameAs: string[];
  affiliate: {
    ids: string[];
    hakobuPlacements: number;
    hakobuHasAreaNote: boolean;
    rakutenPlacements: number;
    includesDmm: boolean;
  };
  homeLinksCore: boolean;
}

export interface LiveProbe {
  path: string;
  ok: boolean;
  status: number | null;
  note: string;
}

export interface LiveSnapshot {
  attempted: boolean;
  probes: LiveProbe[];
}

export interface Finding {
  id: string;
  role: GrowthRole;
  severity: FindingSeverity;
  title: string;
  detail: string;
  evidence: string[];
}

export interface BacklogItem {
  id: string;
  title: string;
  area: BacklogArea;
  impact: number;
  effort: number;
  score: number;
  safeToAutoApply: boolean;
  why: string;
}

export interface ContentBrief {
  backlogId: string;
  kind: "page" | "illustration" | "video";
  title: string;
  body: string;
}

export interface BuilderProposal {
  id: string;
  title: string;
  files: string[];
  reason: string;
  /** フレームワークはリポジトリを書き換えない。 */
  applied: false;
}

export interface GrowthReport {
  version: 1;
  generatedAt: string;
  siteUrl: string;
  provider: GrowthProviderName;
  /** この値を true にしたレポートは不正。 */
  merge: false;
  deploy: false;
  facts: RepoFacts;
  live: LiveSnapshot;
  findings: Finding[];
  diff: {
    hasPrevious: boolean;
    added: string[];
    removed: string[];
    unchanged: number;
  };
  backlog: BacklogItem[];
  briefs: ContentBrief[];
  proposals: BuilderProposal[];
  narrative: string;
  llmNote: string;
  verification: { name: string; passed: boolean; detail: string }[];
  roleNotes: { role: GrowthRole; note: string }[];
}
