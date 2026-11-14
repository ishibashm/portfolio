/**
 * 計算結果を、利用者が自分の AI に貼って使える文書にする。
 *
 * サイト側の有料 AI は使わない。生年月日と座標は書かない（貼る先に
 * 何を足すかは本人が決める）。判定の式には触らない。
 */
import { SITE_JUDGMENT_POLICY } from "@/lib/siteJudgmentPolicy";
import { SITE_URL } from "@/lib/siteUrl";
import { STAR_NAMES, currentYearInJapan } from "@/lib/kigakuContent";

/** 公開 MCP。timingReport からも再エクスポートする。 */
export const MCP_URL = "https://cloud-palette.com/api/mcp";

export const DEFAULT_AI_FOLLOW_UPS = [
  "同じ本命星で、来月の吉方位と避けたい方位を整理してください。",
  "この結果を前提に、日取りを絞るときの考え方を短くまとめてください。",
  `公開MCP（${MCP_URL}）を登録し、別の出発地で同じ期間を再計算してください。`,
];

/** 貼り付け文書に入れてはいけない個人情報の目安（テストと書き出しの照合用）。 */
export const PERSONAL_DATA_RE =
  /\d{4}-\d{2}-\d{2}T|生年月日\s*[:：]?\s*\d{4}-\d{2}-\d{2}|緯度|経度|\d{2}\.\d{4}/;

export function hasPersonalData(text: string): boolean {
  return PERSONAL_DATA_RE.test(text);
}

export function jstDate(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function starNumberFromName(name?: string): number | undefined {
  if (!name) return undefined;
  const found = Object.entries(STAR_NAMES).find(([, n]) => n === name);
  return found ? Number(found[0]) : undefined;
}

/** 本命星の公開ページ。生年月日は載せない。 */
export function publicHonmeiPageUrl(year: number, star: number): string {
  return `${SITE_URL}/houi/${year}/${star}`;
}

/**
 * 公開ページがある年のうち、走査範囲と重なるもの。
 * contentYears() は「今」に依存するので、作成日を渡して試験を安定させる。
 */
export function publicHonmeiYears(opts: {
  from?: string;
  to?: string;
  generatedAt: Date;
}): number[] {
  // contentYears() と同じ「今年・翌年・翌々年」を、作成日基準で組む。
  const current = currentYearInJapan(opts.generatedAt);
  const available = [current, current + 1, current + 2];
  const startY = yearFromIso(opts.from) ?? current;
  const endY = yearFromIso(opts.to) ?? startY;
  const years = available.filter(
    (y) => y >= Math.min(startY, endY) && y <= Math.max(startY, endY),
  );
  return years.length > 0 ? years : [current];
}

export function yearFromIso(value?: string): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : undefined;
}

export type AiExportSection = {
  heading: string;
  body: string;
};

export type AiExportInput = {
  title: string;
  generatedAt: Date;
  honmeiStar?: number;
  honmeiStarName?: string;
  /** 候補が2つのとき（立春前後が不明な場合）。 */
  honmeiStarCandidates?: number[];
  voidZodiacs?: string[];
  range?: { from: string; to: string };
  conditions?: string[];
  sections: AiExportSection[];
  sourcePath: string;
  followUpQuestions?: string[];
  publicStarYears?: number[];
};

function starName(star: number): string {
  return STAR_NAMES[star] ?? `本命星${star}`;
}

/** 共通の Markdown を組む。生年月日と座標はここでは受け取らない。 */
export function buildAiExportDocument(input: AiExportInput): string {
  const lines: string[] = [];
  const honmeiStar =
    input.honmeiStar ?? starNumberFromName(input.honmeiStarName);
  const honmeiName =
    input.honmeiStarName ?? (honmeiStar ? starName(honmeiStar) : undefined);
  const stars = uniqueStars([
    ...(honmeiStar ? [honmeiStar] : []),
    ...(input.honmeiStarCandidates ?? []),
  ]);
  const years =
    input.publicStarYears ??
    publicHonmeiYears({
      from: input.range?.from,
      to: input.range?.to,
      generatedAt: input.generatedAt,
    });

  lines.push(`# ${input.title}（Cloud Palette）`);
  lines.push("");
  lines.push(`- 作成日: ${jstDate(input.generatedAt)}（日本時間）`);
  if (honmeiName) lines.push(`- 本命星: ${honmeiName}`);
  if (input.honmeiStarCandidates && input.honmeiStarCandidates.length > 0) {
    lines.push(
      `- 本命星の候補: ${input.honmeiStarCandidates.map((s) => starName(s)).join("、")}`,
    );
  }
  if (input.voidZodiacs && input.voidZodiacs.length > 0) {
    lines.push(`- 空亡（天中殺）: ${input.voidZodiacs.join("")}`);
  }
  if (input.range) {
    lines.push(`- 範囲: ${input.range.from} 〜 ${input.range.to}`);
  }
  for (const c of input.conditions ?? []) lines.push(`- ${c}`);
  lines.push("");

  for (const section of input.sections) {
    lines.push(`## ${section.heading}`);
    lines.push("");
    lines.push(section.body.trimEnd());
    lines.push("");
  }

  lines.push("## 判定の方針");
  lines.push("");
  lines.push(SITE_JUDGMENT_POLICY.trim());
  lines.push("");

  const questions = input.followUpQuestions ?? DEFAULT_AI_FOLLOW_UPS;
  if (questions.length > 0) {
    lines.push("## 続けて聞ける問い");
    lines.push("");
    for (const q of questions) lines.push(`- ${q}`);
    lines.push("");
  }

  if (stars.length > 0 && years.length > 0) {
    lines.push("## 本命星の公開ページ");
    lines.push("");
    lines.push(
      "同じ本命星の年盤・月盤は、次の公開ページで確認できます。ページの URL に生年月日は入りません。",
    );
    for (const star of stars) {
      for (const year of years) {
        const name = starName(star);
        lines.push(`- ${year}年 ${name}: ${publicHonmeiPageUrl(year, star)}`);
      }
    }
    lines.push("");
  }

  lines.push("## AI で続きを調べるとき");
  lines.push("");
  lines.push(
    `この文書には生年月日と住所（座標）を入れていません。AI に日付や方位を計算し直させるときは、Cloud Palette の MCP（${MCP_URL}）を AI 側に登録し、生年月日と出発地はご自身で伝えてください。本命星・日取り・方位の吉凶を同じ計算で返します。`,
  );
  lines.push("");
  lines.push(`出典: ${input.sourcePath}`);
  return lines.join("\n");
}

function uniqueStars(stars: number[]): number[] {
  return [...new Set(stars.filter((s) => s >= 1 && s <= 9))].sort(
    (a, b) => a - b,
  );
}

/** 表の 1 セルに入れる文字列から、表を壊す記号を除く。 */
export function markdownCell(v: string): string {
  return v.replace(/\|/g, "／").replace(/\n/g, " ");
}
