import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

const tags = new Set(
  "div section h2 h3 h4 p ul ol li strong em span table thead tbody tr th td br hr".split(
    " ",
  ),
);
const classes = new Set([
  "fortune-card",
  "fortune-title",
  "fortune-grid",
  "fortune-fact",
  "fortune-muted",
]);
export const fortuneHeadings = [
  "今日の運勢",
  "方位",
  "刻",
  "計算結果",
  "本命星",
];
export type FortuneFact = { label: string; value: string };
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

/** Parse as HTML, then serialize only our own tags/attributes. Drop foreign subtrees. */
export function sanitizeFortuneHtml(html: string): string {
  if (html.length > 24000) return "";
  function visit(node: DefaultTreeAdapterMap["childNode"]): string {
    if (node.nodeName === "#text")
      return escapeHtml((node as DefaultTreeAdapterMap["textNode"]).value);
    if (
      !("tagName" in node) ||
      node.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
      !tags.has(node.tagName)
    )
      return "";
    const allowed = (node.attrs.find((a) => a.name === "class")?.value ?? "")
      .split(/\s+/)
      .filter((c) => classes.has(c));
    const attr = allowed.length ? ` class="${allowed.join(" ")}"` : "";
    const start = `<${node.tagName}${attr}>`;
    if (node.tagName === "br" || node.tagName === "hr") return start;
    return `${start}${node.childNodes.map(visit).join("")}</${node.tagName}>`;
  }
  return parseFragment(html).childNodes.map(visit).join("");
}

function factHtml(fact: FortuneFact): string {
  return `<strong>${escapeHtml(fact.label)}</strong>：${escapeHtml(fact.value)}`;
}
export function fallbackFortuneHtml(facts: FortuneFact[]): string {
  return sanitizeFortuneHtml(
    `<section class="fortune-card"><h2 class="fortune-title">今日の運勢</h2><div class="fortune-grid">${facts.map((fact) => `<p class="fortune-fact">${factHtml(fact)}</p>`).join("")}</div></section>`,
  );
}

/** AI can arrange atomic facts, but cannot write or relabel their values.
 * Each placeholder must be an entire text node and occur exactly once.
 * This also rejects entity-encoded, split-node and Japanese numeral inventions.
 */
export function decorateFortuneHtml(
  html: string,
  facts: FortuneFact[],
): string | null {
  const clean = sanitizeFortuneHtml(html);
  if (!clean) return null;
  const used = new Set<number>();
  let valid = true;
  function check(node: DefaultTreeAdapterMap["childNode"]) {
    if (node.nodeName === "#text") {
      const text = (node as DefaultTreeAdapterMap["textNode"]).value.trim();
      if (!text || fortuneHeadings.includes(text)) return;
      const match = /^\{\{fact:(\d+)\}\}$/.exec(text);
      const index = match ? Number(match[1]) : -1;
      if (!match || index >= facts.length || used.has(index)) valid = false;
      else used.add(index);
    }
    if ("childNodes" in node) node.childNodes.forEach(check);
  }
  parseFragment(clean).childNodes.forEach(check);
  if (!valid || used.size !== facts.length) return null;
  return sanitizeFortuneHtml(
    clean.replace(/\{\{fact:(\d+)\}\}/g, (_, index: string) =>
      factHtml(facts[Number(index)]),
    ),
  );
}
