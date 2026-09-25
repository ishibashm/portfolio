import { parse, type DefaultTreeAdapterMap } from "parse5";
import {
  extractEmailUrls,
  type EmailPreviewFormat,
  type EmailParseLimits,
  EMAIL_PREVIEW_MAX_URLS,
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
type Node = DefaultTreeAdapterMap["node"];
const attr = (node: Node, name: string) =>
  "attrs" in node ? (node.attrs.find((a) => a.name === name)?.value ?? "") : "";
function nodes(root: Node): Node[] {
  const result: Node[] = [],
    stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (
      "tagName" in node &&
      ["script", "style", "template", "noscript", "head"].includes(node.tagName)
    )
      continue;
    result.push(node);
    if ("childNodes" in node) stack.push(...[...node.childNodes].reverse());
  }
  return result;
}
function nodeText(node: Node, links = false): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  if (
    "tagName" in node &&
    ["script", "style", "template", "noscript", "head"].includes(node.tagName)
  )
    return "";
  const content =
    "childNodes" in node
      ? node.childNodes.map((n) => nodeText(n, links)).join("")
      : "";
  if (!("tagName" in node)) return content;
  if (links && node.tagName === "a") {
    const url = normalizeCandidateUrl(attr(node, "href"));
    return `${content}${url ? `\n${url}\n` : ""}`;
  }
  // Inline tags, especially m<sup>2</sup>, must not insert spaces.
  return /^(?:br|p|div|tr|td|th|li|h[1-6]|table|section|article)$/.test(
    node.tagName,
  )
    ? `\n${content}\n`
    : content;
}
function htmlText(body: string) {
  return nodeText(parse(body), true);
}
const lines = (text: string) =>
  text
    .normalize("NFKC")
    .split(/\r?\n/)
    .map((s) => s.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

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
    managementFeeYen: money("管理費(?:等|・共益費)?|共益費"),
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
/** Known senders do not turn navigation and personalized search links into listings. */
function propertyUrl(
  raw: string,
  portal: ReturnType<typeof listingEmailPortal>,
): string | null {
  const normalized = cleanUrl(raw);
  if (!normalized) return null;
  if (portal === "generic") return normalized;
  const u = new URL(normalized);
  if (
    /unsubscribe|\/request\/|\/newmail\/list\/|\/personal\/|\/inquiry\//i.test(
      u.pathname,
    )
  )
    return null;
  switch (portal) {
    case "athome": {
      const id = u.pathname.match(/^\/chintai\/(\d{10})\/?$/)?.[1];
      return /^(?:www\.)?athome\.co\.jp$/.test(u.hostname) && id
        ? `https://www.athome.co.jp/chintai/${id}/`
        : null;
    }
    case "shamaison":
      return u.hostname === "www.shamaison.com" &&
        /^\/[^/]+\/area\/\d+\/[\d_]+\/\d+\/$/.test(u.pathname)
        ? normalized
        : null;
    case "suumo":
      return (u.hostname === "click.e.suumo.jp" &&
        u.pathname === "/" &&
        u.searchParams.has("qs")) ||
        (/^(?:www\.)?suumo\.jp$/.test(u.hostname) &&
          /^\/chintai\/bc_\d+\/?$/.test(u.pathname))
        ? normalized
        : null;
    case "homes":
      return u.hostname === "click.ma.lifull.com" ||
        (/^(?:www\.)?homes\.co\.jp$/.test(u.hostname) &&
          /^\/chintai\/b-[\w-]+\/?$/.test(u.pathname))
        ? normalized
        : null;
    case "eheya":
      return /(?:^|\.)(?:eheya\.net|kentaku\.co\.jp)$/.test(u.hostname) &&
        /\/(?:building\/[^/]+\/[^/]+|detail\/[^/]+(?:\/[^/]+)*)\/?$/.test(
          u.pathname,
        )
        ? normalized
        : null;
    default:
      return normalized;
  }
}
function cardFields(text: string): ListingDetails {
  const rows = lines(text),
    block = rows.join("\n");
  const result = fields(block);
  const access = rows.find((row) => /駅/.test(row) && /徒歩|バス/.test(row));
  if (access) {
    result.nearestStation = access
      .match(/^(.*?駅)/)?.[1]
      .replace(/[「」]/g, "")
      .replace(/^(?:交通|最寄り駅)[:：]?\s*/, "")
      .trim();
    // Walking from a bus stop must never be presented as walking from the station.
    result.walkMinutes = /バス/.test(access)
      ? undefined
      : Number(access.match(/徒歩\s*(\d+)分/)?.[1]);
    if (!Number.isFinite(result.walkMinutes)) delete result.walkMinutes;
  } else {
    const i = rows.findIndex((row) => /^徒歩\s*\d+分$/.test(row));
    if (i > 0 && !/万円|管理費|LDK|m2/.test(rows[i - 1])) {
      result.nearestStation = rows[i - 1]; // Bare stations stay bare (SUUMO).
      result.walkMinutes = Number(rows[i].match(/\d+/)![0]);
    }
  }
  result.address ??= rows.find(
    (row) =>
      /^(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県|[^\s]{1,12}市)/.test(row) &&
      !/駅|徒歩|バス|所在地[:：]/.test(row),
  );
  // Only an exact age or a standalone listing-local 新築 label is evidence.
  delete result.buildingAgeYears;
  const age = block.match(/築(?:年数)?\s*[:：]?\s*(\d{1,3})年/);
  if (age) result.buildingAgeYears = Number(age[1]);
  else if (rows.includes("新築")) result.buildingAgeYears = 0;
  return listingDetailsSchema.parse(result);
}
function plainCards(
  body: string,
  portal: ReturnType<typeof listingEmailPortal>,
): EmailListing[] {
  if (portal !== "suumo" && portal !== "athome") return [];
  const rows = lines(body),
    cards: EmailListing[] = [];
  let start = 0;
  for (let i = 0; i < rows.length; i++) {
    const url = propertyUrl(rows[i].match(urlPattern)?.[0] ?? "", portal);
    if (!url || !/詳細/.test(`${rows[i - 1] ?? ""} ${rows[i + 1] ?? ""}`))
      continue;
    const section = rows.slice(start, i);
    start = i + 1;
    const price = section.findIndex((row) => /^\d+(?:\.\d+)?万円/.test(row));
    if (price < 0) continue;
    const detail = cardFields(section.slice(price).join("\n"));
    if (detail.rentYen == null || !detail.layout) continue;
    delete detail.propertyName;
    cards.push({ ...detail, url });
  }
  return cards;
}

function htmlCards(
  body: string,
  portal: ReturnType<typeof listingEmailPortal>,
): EmailListing[] {
  // Agency contact blocks are not property facts, even inside table.bkn.
  const propertyBody =
    portal === "athome"
      ? body.replace(
          /<!--\s*start member\s*-->[\s\S]*?<!--\s*end member\s*-->/gi,
          "",
        )
      : body;
  const tree = parse(propertyBody),
    all = nodes(tree),
    cards: EmailListing[] = [];
  if (portal === "athome") {
    for (const table of all.filter(
      (n) =>
        n.nodeName === "table" && attr(n, "class").split(/\s+/).includes("bkn"),
    )) {
      const url = nodes(table)
        .map((n) => propertyUrl(attr(n, "href"), portal))
        .find(Boolean);
      if (url)
        cards.push({
          ...cardFields(nodeText(table)),
          propertyName: undefined,
          url,
        });
    }
    return cards;
  }
  if (portal !== "suumo" && portal !== "homes") return cards;
  for (const link of all.filter(
    (n) =>
      n.nodeName === "a" && /^(?:詳細を見る|詳細へ)$/.test(nodeText(n).trim()),
  )) {
    const url = propertyUrl(attr(link, "href"), portal);
    if (!url) continue;
    let card: Node | undefined =
      "parentNode" in link ? (link.parentNode ?? undefined) : undefined;
    while (card) {
      const text = nodeText(card),
        anchors = nodes(card).filter(
          (n) => n.nodeName === "a" && propertyUrl(attr(n, "href"), portal),
        );
      const rents = text.match(/[\d.]+万円/g) ?? [];
      if (rents.length > 1) break; // Never take the surrounding multi-listing table.
      if (
        rents.length === 1 &&
        anchors.length >= (portal === "homes" ? 4 : 2)
      ) {
        const detail = cardFields(text);
        if (portal === "homes") {
          const title = lines(nodeText(anchors[0])).join(" ");
          if (title && !/駅|徒歩|バス|万円/.test(title))
            detail.propertyName = title;
        }
        cards.push({ ...detail, url });
        break;
      }
      card = "parentNode" in card ? (card.parentNode ?? undefined) : undefined;
    }
  }
  return cards;
}

/** Only decoded inline MIME parts enter here; nothing is fetched, logged or persisted. */
export function extractEmailListings(
  source: string,
  format: EmailPreviewFormat = "mime",
  limits: EmailParseLimits = {},
) {
  let portal: keyof typeof aliases = "generic";
  const listings = new Map<string, EmailListing>();
  const cards = new Map<string, EmailListing>();
  let cardsAreHtml = false;
  const result = extractEmailUrls(
    source,
    format,
    (body, html) => {
      // HOME'S sends HTML table markup in its text/plain alternative too.
      const markup = html || (portal === "homes" && /<table\b/i.test(body));
      const partCards = markup
        ? htmlCards(body, portal)
        : plainCards(body, portal);
      // Prefer the actual HTML alternative; its tracking links may differ from
      // plain text. Do not deduplicate properties by price/address guesses.
      if (partCards.length && (!cards.size || (html && !cardsAreHtml))) {
        cards.clear();
        cardsAreHtml = html;
        for (const card of partCards) {
          if (cards.size <= EMAIL_PREVIEW_MAX_URLS) cards.set(card.url, card);
        }
      }
      let text = (markup ? htmlText(body) : body)
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
          const url = propertyUrl(links[i][0], portal);
          if (
            !url ||
            (listings.size >= EMAIL_PREVIEW_MAX_URLS + 1 && !listings.has(url))
          )
            continue;
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
          const detail =
            portal === "athome"
              ? cardFields(block.replace(urlPattern, ""))
              : fields(block.replace(urlPattern, ""));
          // Opaque links need an identified card, not an arbitrary neighboring paragraph.
          if (
            (portal === "suumo" || portal === "homes") &&
            new URL(url).hostname.startsWith("click.")
          )
            continue;
          if (portal === "athome") delete detail.propertyName;
          // MIME alternatives and repeated photo/detail links are one listing.
          listings.set(url, { ...detail, ...listings.get(url), url });
        }
      }
    },
    (sender) => {
      portal = listingEmailPortal(sender);
    },
    limits,
  );
  if (portal === "generic")
    return {
      ...result,
      listings: result.urls.map((url) => listings.get(url) ?? { url }),
    };
  const selected = [...(cards.size ? cards : listings).values()];
  return {
    urls: selected.slice(0, EMAIL_PREVIEW_MAX_URLS).map((l) => l.url),
    listings: selected.slice(0, EMAIL_PREVIEW_MAX_URLS),
    truncated: selected.length > EMAIL_PREVIEW_MAX_URLS,
  };
}
