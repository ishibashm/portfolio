import { describe, expect, it } from "vitest";
import { groupListingMap, listingAddressKey } from "@/lib/listingCandidateMap";

describe("imported listing map grouping", () => {
  it("maps every listing sharing an address, keeps absent and failed addresses separate", () => {
    const listings = [
      { url: "https://example.com/1", address: " 架空市１丁目 " },
      { url: "https://example.com/2", address: "架空市1丁目" },
      { url: "https://example.com/3" },
      { url: "https://example.com/4", address: " " },
      { url: "https://example.com/5", address: "架空市2丁目" },
      { url: "https://example.com/6", address: "架空市3丁目" },
    ];
    const groups = groupListingMap(listings, [
      { address: "架空市1丁目", point: { lat: 35, lon: 135 } },
      { address: "架空市2丁目" },
      { address: "架空市3丁目", point: { lat: 0, lon: 0 } },
    ]);
    expect(groups.mapped.map((l) => l.listing)).toEqual(listings.slice(0, 2));
    expect(groups.noAddress).toEqual(listings.slice(2, 4));
    expect(groups.unresolved).toEqual(listings.slice(4));
  });
  it("treats unrequested/capped addresses as unresolved and does not mutate listings", () => {
    const listing = Object.freeze({
      url: "https://example.com/1",
      address: "架空市",
    });
    expect(groupListingMap([listing], []).unresolved).toEqual([listing]);
    expect(listingAddressKey("　架空市　１丁目  ")).toBe("架空市 1丁目");
  });
});
