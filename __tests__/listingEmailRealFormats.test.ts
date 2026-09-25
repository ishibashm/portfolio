// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { extractEmailListings } from "@/lib/listingEmailDetails";
import {
  GMAIL_MIME_LIMITS,
  GMAIL_MIME_MAX_BYTES,
  extractEmailUrls,
} from "@/lib/listingEmailIngest";
const fixture = (name: string) =>
  readFileSync(
    resolve(`__tests__/fixtures/listing-emails/${name}.eml`),
    "utf8",
  );
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("NETWORK_FORBIDDEN"),
  );
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
it("at home: canonical property IDs, never agency details or recipient tokens", () => {
  const { listings } = extractEmailListings(
    fixture("athome"),
    "mime",
    GMAIL_MIME_LIMITS,
  );
  expect(listings).toHaveLength(2);
  listings.forEach((l, i) => {
    expect(l).toMatchObject({
      url: `https://www.athome.co.jp/chintai/100000000${i + 1}/`,
      rentYen: 90000,
      managementFeeYen: 5000,
      floorAreaM2: 50.2,
      layout: "2LDK",
      nearestStation: "若葉台駅",
      walkMinutes: 3,
      address: "横浜市都筑区さくら台4丁目",
    });
    expect(l.propertyName).toBeUndefined();
    expect(l.buildingAgeYears).toBeUndefined();
  });
});
it("SUUMO: one detail link per card; bare station names remain bare; 築浅 is not an age", () => {
  const { listings } = extractEmailListings(
    fixture("suumo"),
    "mime",
    GMAIL_MIME_LIMITS,
  );
  expect(listings).toHaveLength(2);
  expect(listings[0]).toMatchObject({
    rentYen: 85500,
    managementFeeYen: 4100,
    layout: "2LDK",
    floorAreaM2: 56.44,
    nearestStation: "桜ケ丘",
    walkMinutes: 15,
    deposit: "なし",
  });
  expect(listings[1]).toMatchObject({
    rentYen: 94000,
    managementFeeYen: 5000,
    layout: "2LDK",
    floorAreaM2: 58.23,
    nearestStation: "若葉台",
    walkMinutes: 5,
  });
  expect(listings[1].deposit).toBeUndefined();
  listings.forEach((l) => {
    expect(new URL(l.url).hostname).toBe("click.e.suumo.jp");
    expect(l.buildingAgeYears).toBeUndefined();
    expect(l.propertyName).toBeUndefined();
    expect(l.address).toBeUndefined();
  });
});
it("HOME'S: four cards including broadened conditions; plain HTML and HTML deduplicate", () => {
  const { listings } = extractEmailListings(
    fixture("homes"),
    "mime",
    GMAIL_MIME_LIMITS,
  );
  expect(listings).toHaveLength(4);
  const expected = [
    {
      propertyName: "サンプルメゾン桜ケ丘 0302",
      rentYen: 68000,
      managementFeeYen: 5000,
      nearestStation: "サンプル本線 桜ケ丘駅",
      walkMinutes: 14,
      address: "神奈川県横浜市青葉区桜ケ丘7丁目23番14号",
      layout: "1LDK",
      floorAreaM2: 30.78,
    },
    {
      propertyName: "SAMPLE COURT 301",
      rentYen: 61000,
      managementFeeYen: 5000,
      nearestStation: "サンプル線 緑町駅",
      walkMinutes: 4,
      address: "神奈川県横浜市緑区緑町1丁目",
      layout: "1K",
      floorAreaM2: 25.06,
    },
    {
      rentYen: 77000,
      managementFeeYen: 6000,
      address: "神奈川県横浜市緑区東町",
      layout: "1LDK",
      floorAreaM2: 46.67,
    },
    {
      propertyName: "カームヒルズ 203",
      rentYen: 79000,
      managementFeeYen: 4100,
      address: "神奈川県横浜市都筑区中央台1丁目",
      layout: "2LDK",
      floorAreaM2: 56.08,
    },
  ];
  listings.forEach((l, i) => {
    expect(l).toMatchObject(expected[i]);
    expect(new URL(l.url).hostname).toBe("click.ma.lifull.com");
    expect(l.buildingAgeYears).toBeUndefined();
  });
  expect(listings[2].propertyName).toBeUndefined();
  expect(listings[2].nearestStation).toContain("桜ケ丘駅");
  expect(listings[3].nearestStation).toContain("中央台駅");
  expect(listings[2].walkMinutes).toBeUndefined();
  expect(listings[3].walkMinutes).toBeUndefined();
});
it("Shamaison: only three area listing paths, with no invented fields", () => {
  const { listings } = extractEmailListings(
    fixture("shamaison"),
    "mime",
    GMAIL_MIME_LIMITS,
  );
  expect(listings).toHaveLength(3);
  listings.forEach((l, i) => {
    expect(Object.keys(l)).toEqual(["url"]);
    expect(l.url).toMatch(
      new RegExp(
        `^https://www.shamaison.com/kanagawa/area/14117/[\\d_]+/0000000114000010001000${i + 1}/$`,
      ),
    );
  });
});
it.each(["athome", "suumo", "homes", "shamaison"])(
  "%s has no duplicate tracking/photo/navigation listings",
  (name) => {
    const { listings, urls, truncated } = extractEmailListings(
      fixture(name),
      "mime",
      GMAIL_MIME_LIMITS,
    );
    expect(new Set(urls).size).toBe(listings.length);
    expect(urls).toEqual(listings.map((l) => l.url));
    expect(truncated).toBe(false);
    urls.forEach((url) =>
      expect(url).not.toMatch(
        /unsubscribe|\/request\/|\/newmail\/list\/|\/personal\/|\/inquiry\//,
      ),
    );
    // Opaque tokens cannot be removed without losing the destination. Exactly one
    // retained detail token per SUUMO/HOME'S card; at home tokens are all removed.
    if (name === "athome")
      urls.forEach((url) => expect(url).not.toContain("SANITIZED"));
  },
);
it("Gmail accepts a 60KB MIME with Received/ARC headers; preview stays at 12KB", () => {
  const headers = `Received: ${"x".repeat(3000)}\r\nARC-Seal: ${"y".repeat(3000)}\r\nContent-Type: text/plain\r\n\r\n`;
  const raw = headers + "x".repeat(54000) + "\nhttps://example.com/listing";
  expect(
    extractEmailListings(raw, "mime", GMAIL_MIME_LIMITS).listings,
  ).toHaveLength(1);
  expect(() => extractEmailListings(raw, "mime")).toThrow();
  expect(() =>
    extractEmailListings(
      "x".repeat(GMAIL_MIME_MAX_BYTES + 1),
      "mime",
      GMAIL_MIME_LIMITS,
    ),
  ).toThrow();
  const bigHeaders = `Received: ${"x".repeat(16000)}\nContent-Type: text/plain\n\nhttps://example.com/listing`;
  expect(
    extractEmailListings(bigHeaders, "mime", GMAIL_MIME_LIMITS).listings,
  ).toHaveLength(1);
  expect(() =>
    extractEmailListings(
      bigHeaders.replace("x".repeat(16000), "x".repeat(65536)),
      "mime",
      GMAIL_MIME_LIMITS,
    ),
  ).toThrow();
});

it("unknown senders retain reference URL fallback, including non-property paths", () => {
  const raw =
    "From: test@example.invalid\nContent-Type: text/plain\n\nhttps://example.com/request/help\nhttps://example.com/personal/about";
  expect(extractEmailListings(raw).urls).toEqual([
    "https://example.com/request/help",
    "https://example.com/personal/about",
  ]);
});

it.each(["athome", "suumo", "homes"])(
  "%s plain alternative alone still contains the listing cards",
  (name) => {
    let plain = "",
      sender = "";
    extractEmailUrls(
      fixture(name),
      "mime",
      (body, html) => {
        if (!html) plain = body;
      },
      (value) => {
        sender = value;
      },
      GMAIL_MIME_LIMITS,
    );
    const raw = `From: ${sender}\nContent-Type: text/plain; charset=utf-8\n\n${plain}`;
    const result = extractEmailListings(raw, "mime", GMAIL_MIME_LIMITS);
    expect(result.listings).toHaveLength(name === "homes" ? 4 : 2);
    expect(result.listings[0].rentYen).toBe(
      name === "athome" ? 90000 : name === "suumo" ? 85500 : 68000,
    );
  },
);
it("Gmail limits do not relax charset, encoding, part or depth validation", () => {
  for (const raw of [
    "Content-Type: text/plain; charset=iso-2022-jp\n\nhello",
    "Content-Type: text/plain\nContent-Transfer-Encoding: yenc\n\nhello",
    "Content-Type: multipart/mixed; boundary=x\n\n" +
      Array.from(
        { length: 41 },
        () => "--x\nContent-Type: text/plain\n\nhello\n",
      ).join("") +
      "--x--",
  ])
    expect(() =>
      extractEmailListings(raw, "mime", GMAIL_MIME_LIMITS),
    ).toThrow();
  let nested = "Content-Type: text/plain\n\nhello";
  for (let i = 0; i < 8; i++)
    nested = `Content-Type: multipart/mixed; boundary=b${i}\n\n--b${i}\n${nested}\n--b${i}--`;
  expect(() =>
    extractEmailListings(nested, "mime", GMAIL_MIME_LIMITS),
  ).toThrow();
});
