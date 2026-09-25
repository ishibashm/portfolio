import { parse, type DefaultTreeAdapterMap } from "parse5";
import {
  extractEmailUrls,
  type EmailPreviewFormat,
} from "./listingEmailIngest";
import { normalizeCandidateUrl } from "./listingCandidateInput";
import {
  listingDetailsSchema,
  type EmailListing,
  type ListingDetails,
} from "./listingDetails";

// Sender selects vocabulary only; it is not authentication or proof of an address.
export function listingEmailPortal(sender: string) {
  const mailbox = (sender.match(/<([^<>]+)>/)?.[1] ?? sender)
    .trim()
    .toLowerCase();
  if (mailbox === "suumo-support@e.suumo.jp") return "suumo";
  if (mailbox === "support@ma.lifull.com") return "homes";
  if (
    mailbox === "clubshm@sekiwachubu.co.jp" ||
    /^[\w.+-]+-clubshm@sekisuihouse\.co\.jp$/.test(mailbox)
  )
    return "shamaison";
  if (
    /^[\w.+-]+@(?:[\w-]+\.)*(?:eheya\.net|kentaku\.co\.jp|kentaku\.com)$/.test(
      mailbox,
    )
  )
    return "eheya";
  if (mailbox === "matching@athome.jp") return "athome";
  return "generic";
}
const aliases = {
  suumo: [
    ["家賃", "賃料"],
    ["交通アクセス", "交通"],
  ],
  homes: [
    ["月額賃料", "賃料"],
    ["物件所在地", "所在地"],
  ],
  shamaison: [
    ["建物名称", "物件名"],
    ["共益費等", "共益費"],
  ],
  eheya: [
    ["お家賃", "賃料"],
    ["建物名称", "物件名"],
  ],
  athome: [
    ["賃料等", "賃料"],
    ["建物名", "物件名"],
  ],
  generic: [],
} satisfies Record<string, string[][]>;
function htmlText(body: string) {
  const walk = (node: DefaultTreeAdapterMap["node"]): string => {
    if (node.nodeName === "#text" && "value" in node) return node.value;
    if (
      "tagName" in node &&
      ["script", "style", "template", "noscript", "head"].includes(node.tagName)
    )
      return "";
    const content =
      "childNodes" in node ? node.childNodes.map(walk).join("") : "";
    if (!("tagName" in node)) return content;
    if (node.tagName === "a") {
      const url = normalizeCandidateUrl(
        node.attrs.find((a) => a.name === "href")?.value ?? "",
      );
      return `${content}${url ? `\n${url}\n` : ""}`;
    }
    return /^(?:br|p|div|tr|td|th|li|h[1-6]|table|section|article)$/.test(
      node.tagName,
    )
      ? `\n${content}\n`
      : `${content} `;
  };
  return walk(parse(body));
}
const urlPattern = /https:\/\/[^\s<>"'「」]+/gi;
function cleanUrl(raw: string) {
  return normalizeCandidateUrl(raw.replace(/[。、,;.!?)\]]+$/, ""));
}
function fields(block: string): ListingDetails {
  const value = (label: string, max = 120) =>
    block
      .match(
        new RegExp(
          `(?:^|[\\n|／])\\s*(?:${label})\\s*[:：]?\\s*([^\\n|／]+)`,
          "i",
        ),
      )?.[1]
      .trim()
      .slice(0, max);
  const money = (label: string) => {
    const m = block.match(
      new RegExp(`(?:${label})\\s*[:：]?\\s*([\\d,.]+)\\s*(万円|円)`),
    );
    if (!m)
      return /^(?:なし|不要|無料|0円)$/.test(value(label) ?? "")
        ? 0
        : undefined;
    return Math.round(
      Number(m[1].replaceAll(",", "")) * (m[2] === "万円" ? 10000 : 1),
    );
  };
  const station = block.match(
    /([^\n:：|／]{1,100}?駅)[」\s]*徒歩\s*(\d{1,3})\s*分/,
  );
  const rentalTerm = (label: string) =>
    block.match(
      new RegExp(
        `(?:${label})\\s*[:：]?\\s*(なし|不要|[\\d,.]+\\s*(?:万円|円|ヶ?月|か月|カ月))`,
      ),
    )?.[1];
  const result = {
    propertyName: value("物件名|建物名|マンション名|アパート名"),
    rentYen:
      money("賃料|家賃") ??
      (() => {
        const m = block.match(/(?:^|\n)\s*([\d.]+)万円/);
        return m ? Math.round(Number(m[1]) * 10000) : undefined;
      })(),
    managementFeeYen: money("管理費(?:・共益費)?|共益費"),
    deposit: rentalTerm("敷金|敷"),
    keyMoney: rentalTerm("礼金|礼"),
    layout: block
      .match(/\b(\d{1,2}(?:S?LDK|S?DK|LK|K|R))\b/i)?.[1]
      .toUpperCase(),
    floorAreaM2: (() => {
      const m = block.match(/([\d.]+)\s*(?:m2|m²|㎡)/i);
      return m ? Number(m[1]) : undefined;
    })(),
    nearestStation: station?.[1]
      .trim()
      .replace(/^(?:交通|最寄り駅)\s*[:：]?\s*/, ""),
    walkMinutes: station ? Number(station[2]) : undefined,
    address: value("住所|所在地", 256),
    buildingAgeYears: /新築/.test(block)
      ? 0
      : (() => {
          const m = block.match(/築(?:年数)?\s*[:：]?\s*(\d{1,3})\s*年/);
          return m ? Number(m[1]) : undefined;
        })(),
  };
  // Reject malformed individual fields without losing other useful fields.
  const safe: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(result)) {
    if (
      field !== undefined &&
      listingDetailsSchema.safeParse({ [key]: field }).success
    )
      safe[key] = field;
  }
  return listingDetailsSchema.parse(safe);
}
/** Only decoded inline MIME parts enter here; nothing is fetched, logged or persisted. */
export function extractEmailListings(
  source: string,
  format: EmailPreviewFormat = "mime",
) {
  let portal: keyof typeof aliases = "generic";
  const listings = new Map<string, EmailListing>();
  const result = extractEmailUrls(
    source,
    format,
    (body, html) => {
      let text = (html ? htmlText(body) : body)
        .normalize("NFKC")
        .replace(/\r/g, "");
      for (const [from, to] of aliases[portal])
        text = text.replaceAll(from, to);
      // Named blocks work for URL-before/after layouts. Otherwise URLs start blocks.
      const named =
        /(?:^|\n)\s*(?:物件名|建物名|マンション名|アパート名)\s*[:：]/;
      const chunks =
        named.test(text) && text.search(named) < text.search(urlPattern)
          ? text.split(
              /(?=(?:^|\n)\s*(?:物件名|建物名|マンション名|アパート名)\s*[:：])/m,
            )
          : [text];
      for (const chunk of chunks) {
        const links = [...chunk.matchAll(urlPattern)];
        const unique = new Set(
          links.map((m) => cleanUrl(m[0])).filter(Boolean),
        );
        for (let i = 0; i < links.length; i++) {
          const url = cleanUrl(links[i][0]);
          if (!url || (listings.size >= 20 && !listings.has(url))) continue;
          const firstField = chunk.search(
            /物件名|建物名|賃料|家賃|管理費|間取り|所在地/,
          );
          const urlAtEnd = firstField >= 0 && firstField < links[0].index!;
          const block =
            unique.size === 1
              ? chunk
              : urlAtEnd
                ? chunk.slice(
                    i === 0 ? 0 : links[i - 1].index! + links[i - 1][0].length,
                    links[i].index,
                  )
                : chunk.slice(
                    links[i].index! + links[i][0].length,
                    links[i + 1]?.index ?? chunk.length,
                  );
          const detail = fields(block.replace(urlPattern, ""));
          // MIME alternatives and repeated photo/detail links are one listing.
          listings.set(url, { ...detail, ...listings.get(url), url });
        }
      }
    },
    (sender) => {
      portal = listingEmailPortal(sender);
    },
  );
  return {
    ...result,
    listings: result.urls.map((url) => listings.get(url) ?? { url }),
  };
}
