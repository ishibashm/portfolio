import { parse, type DefaultTreeAdapterMap } from "parse5";
import { classifyCandidateInput } from "@/lib/listingCandidateInput";

export type EmailPreviewFormat = "text" | "html" | "mime";
export const EMAIL_PREVIEW_MAX_BYTES = 12000;
export const GMAIL_MIME_MAX_BYTES = 512 * 1024;
export const GMAIL_MIME_LIMITS = {
  maxBytes: GMAIL_MIME_MAX_BYTES,
  maxHeaderBytes: 64 * 1024,
} as const;
export type EmailParseLimits = { maxBytes?: number; maxHeaderBytes?: number };
export const EMAIL_PREVIEW_MAX_URLS = 20;
export class EmailPreviewError extends Error {
  constructor() {
    super("メール形式または処理上限を確認してください。");
  }
}

/** Bounded, network-free subset. Unsupported/ambiguous MIME fails closed. */
export function extractEmailUrls(
  source: string,
  format: EmailPreviewFormat,
  onPart?: (body: string, html: boolean) => void,
  onSender?: (sender: string) => void,
  limits: EmailParseLimits = {},
) {
  const maxBytes = limits.maxBytes ?? EMAIL_PREVIEW_MAX_BYTES;
  const maxHeaderBytes = limits.maxHeaderBytes ?? 8192;
  if (
    !Number.isInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > GMAIL_MIME_MAX_BYTES ||
    !Number.isInteger(maxHeaderBytes) ||
    maxHeaderBytes < 1 ||
    maxHeaderBytes > 64 * 1024 ||
    Buffer.byteLength(source, "utf8") > maxBytes
  )
    throw new EmailPreviewError();
  const urls = new Set<string>();
  let truncated = false;
  let parts = 0;
  const add = (raw: string) => {
    const input = classifyCandidateInput(raw);
    if (input.kind !== "url") return;
    // No dereference or nested redirect extraction. Unknown tracking links may
    // still need manual replacement; these rules are not a PII detector.
    if (/unsubscribe|opt[-_]?out|配信停止/i.test(decodeURIComponent(input.url)))
      return;
    if (urls.has(input.url)) return;
    if (urls.size >= EMAIL_PREVIEW_MAX_URLS) {
      truncated = true;
      return;
    }
    urls.add(input.url);
  };
  const extract = (body: string, html: boolean) => {
    onPart?.(body, html);
    if (!html) {
      for (const m of body.matchAll(/https:\/\/[^\s<>"'「」]+/gi))
        add(m[0].replace(/[。、,;.!?)\]]+$/, ""));
      return;
    }
    // parse5 creates an inert tree, never a browser DOM or resource loader.
    const stack: DefaultTreeAdapterMap["node"][] = [parse(body)];
    while (stack.length) {
      const node = stack.pop()!;
      if ("tagName" in node) {
        if (["script", "style", "template", "noscript"].includes(node.tagName))
          continue;
        if (node.tagName === "a" || node.tagName === "area") {
          const href = node.attrs.find((a) => a.name === "href")?.value;
          if (href) add(href);
        }
      }
      if ("childNodes" in node) stack.push(...[...node.childNodes].reverse());
    }
  };
  const mime = (raw: string, depth: number) => {
    if (++parts > 40 || depth > 6) throw new EmailPreviewError();
    const split = raw.search(/\r?\n\r?\n/);
    if (
      split < 0 ||
      Buffer.byteLength(raw.slice(0, split), "utf8") > maxHeaderBytes
    )
      throw new EmailPreviewError();
    const headers = new Map<string, string>();
    for (const line of raw
      .slice(0, split)
      .replace(/\r?\n[ \t]+/g, " ")
      .split(/\r?\n/)) {
      const m = line.match(/^([\w-]+):[ \t]*(.*)$/);
      if (!m) throw new EmailPreviewError();
      const key = m[1].toLowerCase();
      if (headers.has(key) && key.startsWith("content-"))
        throw new EmailPreviewError();
      headers.set(key, m[2]);
    }
    if (depth === 0) onSender?.(headers.get("from") ?? "");
    const ct = headers.get("content-type") ?? "text/plain";
    const disposition = headers.get("content-disposition") ?? "";
    if (
      /^attachment\b/i.test(disposition) ||
      /;\s*(?:file)?name(?:\*\d+)?\*?\s*=/i.test(ct + ";" + disposition)
    )
      return;
    const type = ct.split(";")[0].trim().toLowerCase();
    const encoding = (headers.get("content-transfer-encoding") ?? "7bit")
      .toLowerCase()
      .trim();
    let body = raw.slice(split).replace(/^\r?\n\r?\n/, "");
    if (type.startsWith("multipart/")) {
      if (
        ![
          "multipart/mixed",
          "multipart/alternative",
          "multipart/related",
        ].includes(type) ||
        !["7bit", "8bit"].includes(encoding)
      )
        throw new EmailPreviewError();
      const boundary = ct.match(/;\s*boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i);
      const b = boundary?.[1] ?? boundary?.[2];
      if (!b || b.length > 70) throw new EmailPreviewError();
      let current: string[] | null = null;
      let closed = false;
      for (const line of body.split(/\r?\n/)) {
        const marker = line.replace(/[ \t]+$/, "");
        if (marker === `--${b}` || marker === `--${b}--`) {
          if (current) mime(current.join("\n"), depth + 1);
          current = [];
          if (marker === `--${b}--`) {
            closed = true;
            break;
          }
        } else if (current) current.push(line);
      }
      if (!closed) throw new EmailPreviewError();
      return;
    }
    if (type !== "text/plain" && type !== "text/html") return;
    const charset = ct.match(/;\s*charset=(?:"([^"]+)"|([^;\s]+))/i);
    if (charset && !/^(utf-8|us-ascii)$/i.test(charset[1] ?? charset[2]))
      throw new EmailPreviewError();
    if (encoding === "base64") {
      const compact = body.replace(/\s/g, "");
      if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          compact,
        )
      )
        throw new EmailPreviewError();
      body = new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.from(compact, "base64"),
      );
    } else if (encoding === "quoted-printable") {
      const unfolded = body.replace(/=\r?\n/g, "");
      if (/=(?![\da-f]{2})/i.test(unfolded) || /[^\x00-\x7f]/.test(unfolded))
        throw new EmailPreviewError();
      body = new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.from(
          unfolded.replace(/=([\da-f]{2})/gi, (_, h: string) =>
            String.fromCharCode(parseInt(h, 16)),
          ),
          "latin1",
        ),
      );
    } else if (!["7bit", "8bit"].includes(encoding))
      throw new EmailPreviewError();
    extract(body, type === "text/html");
  };
  try {
    if (format === "mime") mime(source, 0);
    else extract(source, format === "html");
  } catch {
    throw new EmailPreviewError();
  }
  return { urls: [...urls], truncated };
}
