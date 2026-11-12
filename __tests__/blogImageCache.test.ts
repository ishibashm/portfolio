import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const CACHE = "public, max-age=86400, stale-while-revalidate=604800";

describe("記事画像の Cache-Control", () => {
  it("blog と guide の画像だけ、県境と同じ 1 日にする", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toEqual(
      expect.arrayContaining([
        {
          source: "/:dir(blog|guide)/:file(.*\\.(?:png|webp|jpe?g|avif))",
          headers: [{ key: "Cache-Control", value: CACHE }],
        },
        {
          source: "/prefectures.geojson",
          headers: [{ key: "Cache-Control", value: CACHE }],
        },
      ]),
    );
  });
});
