// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  extractEmailListings,
  listingEmailPortal,
} from "@/lib/listingEmailDetails";
const block = (name: string, rent: string, url: string) =>
  `物件名: ${name}\n賃料: ${rent}万円\n管理費: ３，０００円\n敷金: 1ヶ月 / 礼金: なし\n間取り: １ＬＤＫ\n専有面積: ４２．５㎡\n交通: 架空線 サンプル駅 徒歩８分\n所在地: 架空県見本市試験町1-2\n築１２年\n${url}`;
afterEach(() => vi.restoreAllMocks());
it.each([
  ["suumo-support@e.suumo.jp", "suumo", "家賃"],
  ["support@ma.lifull.com", "homes", "月額賃料"],
  ["clubshm@sekiwachubu.co.jp", "shamaison", "賃料"],
  ["test-clubshm@sekisuihouse.co.jp", "shamaison", "賃料"],
  ["notice@eheya.net", "eheya", "お家賃"],
  ["notice@kentaku.co.jp", "eheya", "賃料"],
  ["matching@athome.jp", "athome", "賃料等"],
  ["synthetic@example.invalid", "generic", "賃料"],
])(
  "extracts synthetic %s notification without network or logs",
  (sender, portal, label) => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    expect(listingEmailPortal(sender)).toBe(portal);
    const propertyUrls = {
      suumo: [
        "https://suumo.jp/chintai/bc_1000000001/",
        "https://suumo.jp/chintai/bc_1000000002/",
      ],
      homes: [
        "https://www.homes.co.jp/chintai/b-1000000001/",
        "https://www.homes.co.jp/chintai/b-1000000002/",
      ],
      athome: [
        "https://www.athome.co.jp/chintai/1000000001/",
        "https://www.athome.co.jp/chintai/1000000002/",
      ],
      shamaison: [
        "https://www.shamaison.com/kanagawa/area/14117/100_1/1001/",
        "https://www.shamaison.com/kanagawa/area/14117/100_1/1002/",
      ],
      eheya: [
        "https://www.eheya.net/building/100/1/",
        "https://www.eheya.net/building/100/2/",
      ],
      generic: [
        "https://suumo.jp/chintai/test-a/",
        "https://www.homes.co.jp/chintai/test-b/",
      ],
    }[portal as ReturnType<typeof listingEmailPortal>];
    const source = `From: Synthetic <${sender}>\nContent-Type: text/plain; charset=utf-8\n\n${block("試験ハイツA", "７．２", propertyUrls[0]).replace("賃料", label)}\n${block("試験ハイツB", "9", propertyUrls[1])}`;
    const { listings } = extractEmailListings(source);
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      ...(portal === "athome" ? {} : { propertyName: "試験ハイツA" }),
      rentYen: 72000,
      managementFeeYen: 3000,
      deposit: "1ヶ月",
      keyMoney: "なし",
      layout: "1LDK",
      floorAreaM2: 42.5,
      nearestStation: "架空線 サンプル駅",
      walkMinutes: 8,
      address: "架空県見本市試験町1-2",
      buildingAgeYears: 12,
    });
    expect(listings[1]).toMatchObject({
      ...(portal === "athome" ? {} : { propertyName: "試験ハイツB" }),
      rentYen: 90000,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  },
);
it("parses inert HTML tables, ignores scripts/images and deduplicates alternatives", () => {
  const html =
    '<script>賃料: 999万円</script><img src="https://suumo.jp/image"><table><tr><td>物件名:</td><td>合成ハイツ</td></tr><tr><td>賃料:</td><td>6万円</td></tr><tr><td>専有面積:</td><td>33m2</td></tr><tr><td><a href="https://suumo.jp/a">物件へ</a></td></tr></table>';
  const source = `Content-Type: multipart/alternative; boundary=x\n\n--x\nContent-Type: text/plain\n\nhttps://suumo.jp/a\n--x\nContent-Type: text/html\nContent-Transfer-Encoding: base64\n\n${Buffer.from(html).toString("base64")}\n--x--`;
  expect(extractEmailListings(source).listings).toEqual([
    {
      url: "https://suumo.jp/a",
      propertyName: "合成ハイツ",
      rentYen: 60000,
      floorAreaM2: 33,
    },
  ]);
});
it.each([true, false])(
  "keeps unnamed URL blocks separate (URL first=%s)",
  (first) => {
    const chunks = ["https://suumo.jp/a", "https://suumo.jp/b"].map((url, i) =>
      first ? `${url}\n賃料: ${i + 5}万円\n` : `賃料: ${i + 5}万円\n${url}\n`,
    );
    expect(
      extractEmailListings(chunks.join("\n"), "text").listings.map(
        (l) => l.rentYen,
      ),
    ).toEqual([50000, 60000]);
  },
);
it("does not borrow fields across messages or attachments; preserves zero and missing values", () => {
  expect(
    extractEmailListings("https://suumo.jp/a\n共益費: なし\n新築", "text")
      .listings[0],
  ).toEqual({
    url: "https://suumo.jp/a",
    managementFeeYen: 0,
    buildingAgeYears: 0,
  });
  expect(
    extractEmailListings("https://suumo.jp/a", "text").listings[0],
  ).toEqual({ url: "https://suumo.jp/a" });
  expect(
    extractEmailListings(
      "Content-Type: text/plain\nContent-Disposition: attachment\n\nhttps://suumo.jp/a\n賃料: 9万円",
    ).listings,
  ).toEqual([]);
});
it("bounds input and output and ignores unsubscribe URLs", () => {
  expect(() => extractEmailListings("x".repeat(12001), "text")).toThrow();
  const source = Array.from(
    { length: 23 },
    (_, i) => `https://suumo.jp/${i}\n賃料: 5万円`,
  ).join("\n");
  expect(extractEmailListings(source, "text").listings).toHaveLength(20);
  expect(
    extractEmailListings("https://example.com/unsubscribe", "text").listings,
  ).toEqual([]);
});
