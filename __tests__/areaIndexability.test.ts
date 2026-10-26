import { createRequire } from "module";
import path from "path";
import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/houi/area/[code]/page";
import housingStats from "@/data/housingStats.json";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { AREAS } from "@/lib/areaContent";
import {
  hasAreaHousingData,
  type HousingSnapshotData,
} from "@/lib/housingSnapshot";
import { INDEXED_ROBOTS, NOINDEX_ROBOTS } from "@/lib/siteStructure";

const snapshot = housingStats as unknown as HousingSnapshotData;
const sitemapConfig = createRequire(import.meta.url)(
  path.join(process.cwd(), "next-sitemap.config.js"),
);
const sitemapPaths = new Set<string>(sitemapConfig.additionalPathsSource ?? []);

describe("area ページの robots と sitemap の一致", () => {
  it("undefined の統計値はデータ無しとして扱う", () => {
    const fake = {
      areas: { "99999": { totalDwellings: undefined } },
    } as unknown as HousingSnapshotData;
    expect(hasAreaHousingData(fake, "99999")).toBe(false);
    expect(hasAreaHousingData(fake, "00000")).toBe(false);
  });

  it("全市区町村で index ⇔ 編集文あり かつ 住宅統計あり ⇔ sitemap 掲載", async () => {
    let indexedCount = 0;
    for (const area of AREAS) {
      const shouldIndex =
        Boolean(AREA_EDITORIAL[area.code]) &&
        hasAreaHousingData(snapshot, area.code);
      const meta = await generateMetadata({
        params: Promise.resolve({ code: area.code }),
      });
      expect(meta.robots, area.code).toEqual(
        shouldIndex ? INDEXED_ROBOTS : NOINDEX_ROBOTS,
      );
      expect(sitemapPaths.has(`/houi/area/${area.code}`), area.code).toBe(
        shouldIndex,
      );
      if (shouldIndex) indexedCount++;
    }
    expect(indexedCount).toBe(sitemapPaths.size);
    expect(indexedCount).toBeGreaterThan(0);
  });
});
