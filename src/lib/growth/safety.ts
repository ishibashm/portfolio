import type { GrowthReport } from "./types";

const PUBLISHER_ID = /(?:ca-)?pub-\d{16}/g;
const A8_MAT = /a8mat=[A-Za-z0-9+]+/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** レポートに残してはいけないものを潰す。ID の有無だけを残す。 */
export function redactText(input: string): string {
  return input
    .replace(PUBLISHER_ID, "pub-[redacted]")
    .replace(A8_MAT, "a8mat=[redacted]")
    .replace(EMAIL, "[email]");
}

export function redactValue<T>(value: T): T {
  return JSON.parse(redactText(JSON.stringify(value))) as T;
}

export class GrowthSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrowthSafetyError";
  }
}

/**
 * 自分のサイト以外へは出ない。スキームは https だけ。
 * 第三者の探索や攻撃には使わない。
 */
export function assertOwnSiteUrl(siteUrl: string, target: string): void {
  const site = new URL(siteUrl);
  const url = new URL(target);
  if (url.protocol !== "https:") {
    throw new GrowthSafetyError("https 以外は取りに行かない");
  }
  if (url.hostname !== site.hostname) {
    throw new GrowthSafetyError("自サイト以外へは出ない");
  }
  if (url.username || url.password) {
    throw new GrowthSafetyError("URL に認証情報を載せない");
  }
}

export function assertReportSafe(report: GrowthReport): void {
  if (report.merge !== false || report.deploy !== false) {
    throw new GrowthSafetyError("マージとデプロイはできない");
  }
  if (report.proposals.some((item) => item.applied !== false)) {
    throw new GrowthSafetyError("Builder はファイルを適用しない");
  }
  const blob = JSON.stringify(report);
  if (PUBLISHER_ID.test(blob) || A8_MAT.test(blob)) {
    throw new GrowthSafetyError("識別子がレポートに残っている");
  }
  PUBLISHER_ID.lastIndex = 0;
  A8_MAT.lastIndex = 0;
}

export function priorityScore(impact: number, effort: number): number {
  return impact * 10 - effort;
}
