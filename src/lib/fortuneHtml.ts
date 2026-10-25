import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";

const tags = new Set(
  "div section h1 h2 h3 h4 p ul ol li strong em span table thead tbody tr th td br hr style script img canvas main article header footer a".split(
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
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";

/** Only use this document in an opaque-origin, allow-scripts-only iframe. */
export function buildFortuneSrcdoc(html: string): string {
  const clean = sanitizeFortuneHtml(html);
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${FORTUNE_CSP}"><style>html{overflow-wrap:anywhere}body{margin:0;padding:16px;box-sizing:border-box;font-family:sans-serif}</style><script>
  (() => {
    let last = 0;
    const report = () => {
      const height = Math.ceil(Math.max(document.body.scrollHeight, document.body.getBoundingClientRect().height));
      if (height !== last) { last = height; parent.postMessage({type:'ai-fortune-height',height}, '*'); }
    };
    addEventListener('DOMContentLoaded', () => { new ResizeObserver(report).observe(document.body); report(); });
    addEventListener('load', report);
  })();
  </script></head><body>${clean}</body></html>`;
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

/** Strip embedding, metadata and URL-bearing attributes before sandboxed rendering.
 * Inline CSS/JS are intentionally retained; CSP and the opaque sandbox isolate them.
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
      .filter(
        (a) =>
          !a.namespace &&
          (attributes.has(a.name) ||
            (node.tagName === "img" &&
              a.name === "src" &&
              /^data:image\/(?:png|gif|jpeg|webp);base64,/i.test(a.value))),
      )
      .map((a) => ` ${a.name}="${escapeHtml(a.value)}"`)
      .join("");
    const start = `<${node.tagName}${attr}>`;
    if (["br", "hr", "img"].includes(node.tagName)) return start;
    const content = ["script", "style"].includes(node.tagName)
      ? node.childNodes
          .map((n) =>
            n.nodeName === "#text"
              ? (n as DefaultTreeAdapterMap["textNode"]).value
              : "",
          )
          .join("")
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

/** Validate static AI text; runtime script/CSS changes stay inside the iframe.
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
    if ("tagName" in node && ["script", "style"].includes(node.tagName)) return;
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
      if ("tagName" in node && ["script", "style"].includes(node.tagName))
        return [node];
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
