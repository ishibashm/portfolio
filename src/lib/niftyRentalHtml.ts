import { parse, type DefaultTreeAdapterMap } from "parse5";
import type { NiftyBukken } from "./niftyRentalData";

type Node = DefaultTreeAdapterMap["node"];
function walk(node: Node, visit: (node: Node) => void) {
  visit(node);
  if ("childNodes" in node) node.childNodes.forEach((n) => walk(n, visit));
}
function text(node: Node): string {
  if ("value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(text).join("") : "";
}

export function rentalCityLinks(html: string, base: string) {
  const links: { href: string; text: string }[] = [];
  walk(parse(html), (node) => {
    if (!("tagName" in node) || node.tagName !== "a") return;
    const href = node.attrs.find((a) => a.name === "href")?.value;
    if (!href) return;
    try {
      links.push({ href: new URL(href, base).href, text: text(node).trim() });
    } catch {
      /* Ignore malformed links. */
    }
  });
  return links;
}

/** Read only JSON assignments; never execute remote JavaScript (including in a VM). */
export function rentalPropertiesFromHtml(html: string): NiftyBukken[] | null {
  let result: NiftyBukken[] | null = null;
  walk(parse(html), (node) => {
    if (!("tagName" in node) || node.tagName !== "script") return;
    const script = text(node);
    const assignment =
      /(?:window\.)?Nifty\.Data\.Bukken\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(
        script,
      );
    if (!assignment) return;
    try {
      const data: unknown = JSON.parse(assignment[1]);
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      const values: unknown[] = Object.values(data);
      if (
        !values.every(
          (v) =>
            v &&
            typeof v === "object" &&
            !Array.isArray(v) &&
            Object.entries(v).every(
              ([, value]) => typeof value === "string" || value === null,
            ) &&
            typeof (v as NiftyBukken).id === "string",
        )
      )
        return;
      result = values as NiftyBukken[];
    } catch {
      /* A changed script format falls back to the browser. */
    }
  });
  return result;
}
