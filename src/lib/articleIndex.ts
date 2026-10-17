import { createHash } from "node:crypto";
import type { BlogPost } from "./blog";
import { glossaryTerms } from "./guideContent";
import { SITE_JUDGMENT_POLICY } from "./siteJudgmentPolicy";

export function articleSections(body: string) {
  return body
    .split(/(?=^#{1,6} )/m)
    .filter(Boolean)
    .map((part) => {
      const lines = part.split("\n");
      const heading = /^#{1,6} /.test(lines[0])
        ? lines.shift()!.replace(/^#+ /, "")
        : "";
      return { heading, text: lines.join("\n") };
    });
}
const synonyms = [
  [/引っ越し|引っ越す|引越す/g, "引越し"],
  [/天中殺/g, "空亡"],
  [/吉日/g, "日取り"],
  [/何日/g, "日取り"],
  [/方角/g, "方位"],
  [/本命卦/g, "八宅"],
  [/鬼門/g, "北東"],
  [/転居/g, "引越し"],
  [/磁気偏角/g, "偏角"],
  [/科学的根拠/g, "統計"],
] as const;
function tokens(value: string) {
  let text = value.normalize("NFKC").toLowerCase();
  for (const [pattern, replacement] of synonyms)
    text = text.replace(pattern, replacement);
  return text.split(/[\s\p{P}\p{S}]+/u).flatMap((word) => {
    const chars = Array.from(word);
    return chars.length < 2
      ? chars
      : chars.slice(1).map((c, i) => chars[i] + c);
  });
}
export type SearchDocument = {
  title: string;
  slug: string;
  description: string;
  url: string;
  publishedAt: string;
  tags: string[];
  kind: "article" | "glossary" | "spec";
  section: string;
  snippet: string;
};
let cached: ReturnType<typeof buildIndex> | undefined;
function buildIndex(posts: BlogPost[], version: string) {
  const documents: SearchDocument[] = [];
  for (const p of posts.filter((p) => !p.draft)) {
    for (const section of articleSections(p.body)) {
      // Paragraph boundaries preserve meaning; exceptionally long paragraphs are bounded.
      for (const paragraph of section.text.split(/\n\s*\n/).filter(Boolean)) {
        for (let offset = 0; offset < paragraph.length; offset += 400) {
          documents.push({
            title: p.title.slice(0, 200),
            slug: p.slug,
            description: p.description.slice(0, 400),
            url: `https://cloud-palette.com/blog/${encodeURIComponent(p.slug)}`,
            publishedAt: p.publishedAt,
            tags: p.tags.slice(0, 10),
            kind: "article",
            section: section.heading,
            snippet: paragraph.slice(offset, offset + 400),
          });
        }
      }
    }
  }
  for (const term of glossaryTerms())
    documents.push({
      title: term.name,
      slug: "glossary",
      description: term.description,
      url: "https://cloud-palette.com/guide/glossary",
      publishedAt: "",
      tags: [],
      kind: "glossary",
      section: term.section,
      snippet: term.description,
    });
  for (const line of SITE_JUDGMENT_POLICY.split("\n"))
    documents.push({
      title: "サイトの判定方針",
      slug: "llms-txt",
      description: line.replace(/^- /, ""),
      url: "https://cloud-palette.com/llms.txt",
      publishedAt: "",
      tags: [],
      kind: "spec",
      section: "判定の考え方",
      snippet: line.replace(/^- /, ""),
    });
  const frequencies = documents.map((doc) => {
    const terms = tokens(
      `${doc.title} ${doc.title} ${doc.description} ${doc.tags.join(" ")} ${doc.section} ${doc.snippet}`,
    );
    const counts = new Map<string, number>();
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    return { counts, length: terms.length };
  });
  const df = new Map<string, number>();
  for (const { counts } of frequencies)
    for (const term of counts.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  return {
    documents,
    frequencies,
    df,
    version,
    average:
      frequencies.reduce((n, f) => n + f.length, 0) / frequencies.length || 1,
  };
}
export function searchIndex(posts: BlogPost[], query: string, limit: number) {
  // Only public source material is cached, never queries or user data.
  const version = createHash("sha256")
    .update(JSON.stringify(posts.filter((p) => !p.draft)))
    .digest("hex");
  if (cached?.version !== version) cached = buildIndex(posts, version);
  const index = cached;
  const terms = [...new Set(tokens(query))];
  const ranked = index.documents
    .map((doc, i) => {
      const { counts, length } = index.frequencies[i];
      const score = terms.reduce((sum, term) => {
        const tf = counts.get(term) ?? 0;
        const df = index.df.get(term) ?? 0;
        return (
          sum +
          (Math.log(1 + (index.documents.length - df + 0.5) / (df + 0.5)) *
            tf *
            2.2) /
            (tf + 1.2 * (0.25 + (0.75 * length) / index.average))
        );
      }, 0);
      return { ...doc, score };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  const seen = new Set<string>();
  return {
    version,
    articles: ranked
      .filter((doc) => {
        const key =
          doc.kind === "article"
            ? doc.slug
            : `${doc.kind}:${doc.title}:${doc.snippet}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit),
  };
}
