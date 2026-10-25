import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";

const tags = new Set(
  "div section h1 h2 h3 h4 p ul ol li strong em span table thead tbody tr th td br hr style img main article header footer a".split(
    " ",
  ),
);
const attributes = new Set([
  "class",
  "id",
  "style",
  "width",
  "height",
  "alt",
  "colspan",
  "rowspan",
]);
export const FORTUNE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";

/** Only use this document in an iframe with an empty sandbox attribute. */
export function buildFortuneSrcdoc(html: string): string {
  const clean = sanitizeFortuneHtml(html);
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${FORTUNE_CSP}"><style>html{overflow:auto;overflow-wrap:anywhere}body{margin:0;padding:16px;box-sizing:border-box;font-family:sans-serif}</style></head><body>${clean}</body></html>`;
}

/** Fail closed for the entire style block/attribute, including obfuscated CSS.
 * Escapes are unnecessary for this presentation subset; rejecting them avoids
 * escaped identifiers bypassing the checks. Comments are removed before checking.
 * Reject less-than signs so comment removal cannot manufacture HTML closing tags.
 */
function sanitizeFortuneCss(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "");
  if (/[<\\\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(clean)) return "";
  if (/@import|url\s*\(|expression\s*\(|behavior\s*:/i.test(clean)) return "";
  return clean;
}
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

/** Allow only presentation HTML and filtered CSS; drop all URL attributes,
 * scripts, handlers, embedding, forms, metadata and foreign namespaces.
 */
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
    const attr = node.attrs
      .filter((a) => !a.namespace && attributes.has(a.name))
      .map((a) => {
        const value =
          a.name === "style" ? sanitizeFortuneCss(a.value) : a.value;
        return value ? ` ${a.name}="${escapeHtml(value)}"` : "";
      })
      .join("");
    const start = `<${node.tagName}${attr}>`;
    if (["br", "hr", "img"].includes(node.tagName)) return start;
    const content =
      node.tagName === "style"
        ? sanitizeFortuneCss(
            node.childNodes
              .map((n) =>
                n.nodeName === "#text"
                  ? (n as DefaultTreeAdapterMap["textNode"]).value
                  : "",
              )
              .join(""),
          )
        : node.childNodes.map(visit).join("");
    return `${start}${content}</${node.tagName}>`;
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

/** Validate static AI text; CSS presentation stays inside the iframe.
 * AI can arrange atomic facts, but cannot write or relabel their static values.
 * Each placeholder must be an entire text node and occur exactly once.
 * This also rejects entity-encoded, split-node and Japanese numeral inventions.
 */
export function decorateFortuneHtml(
  html: string,
  facts: FortuneFact[],
): string | null {
  const clean = sanitizeFortuneHtml(html);
  if (!clean) return null;
  const fragment = parseFragment(clean);
  const used = new Set<number>();
  let valid = true;
  function check(node: DefaultTreeAdapterMap["childNode"]) {
    if ("tagName" in node && node.tagName === "style") return;
    if (node.nodeName === "#text") {
      const text = (node as DefaultTreeAdapterMap["textNode"]).value.trim();
      if (!text || fortuneHeadings.includes(text)) return;
      const match = /^\{\{fact:(\d+)\}\}$/.exec(text);
      const index = match ? Number(match[1]) : -1;
      if (!match || index >= facts.length || used.has(index)) valid = false;
      else {
        used.add(index);
        (node as DefaultTreeAdapterMap["textNode"]).value = `{{fact:${index}}}`;
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(check);
  }
  fragment.childNodes.forEach(check);
  if (!valid || used.size !== facts.length) return null;
  function inject(parent: DefaultTreeAdapterMap["parentNode"]) {
    parent.childNodes = parent.childNodes.flatMap((node) => {
      if ("tagName" in node && node.tagName === "style") return [node];
      if (node.nodeName === "#text") {
        const match = /^\{\{fact:(\d+)\}\}$/.exec(
          (node as DefaultTreeAdapterMap["textNode"]).value,
        );
        if (match) {
          const nodes = parseFragment(
            factHtml(facts[Number(match[1])]),
          ).childNodes;
          nodes.forEach((child) => {
            child.parentNode = parent;
          });
          return nodes;
        }
      }
      if ("childNodes" in node) inject(node);
      return [node];
    });
  }
  inject(fragment);
  return sanitizeFortuneHtml(serialize(fragment));
}
