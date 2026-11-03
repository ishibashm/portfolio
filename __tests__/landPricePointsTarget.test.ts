import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 地価の地点（land_price_points）は、購入の相場の集計が**読む DB と
 * 同じ DB** へ入れること。
 *
 * ## 何が起きていたか
 *
 * build-purchase-stats.yml は apply-db-override.sh で db.cloud-palette.com
 * を読む。地点を入れた run-seed.yml は上書きを当てないので、地点は
 * ENV_FILE 側の DB に入った。集計からは 1 件も見えず、/relocation/purchase
 * の「地価公示の㎡単価」が 47 県すべて「—」だった（ログ「地価公示と
 * 突き合わせ 0 県」）。
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const IMPORT = ".github/workflows/import-land-prices.yml";
const BUILD = ".github/workflows/build-purchase-stats.yml";

describe("地価の地点の取り込み先", () => {
  it("集計と同じく接続先の上書きを当てる", () => {
    expect(read(BUILD)).toContain("bash scripts/apply-db-override.sh");
    expect(read(IMPORT)).toContain("bash scripts/apply-db-override.sh");
  });

  it("スキーマには触れず、地点だけを書く", () => {
    // 註（# の行）は理由を書くので除いて、実際に走る行だけを見る
    const wf = read(IMPORT)
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");
    expect(wf).not.toMatch(/prisma db push/);
    expect(wf).not.toMatch(/--accept-data-loss/);
    expect(wf).toMatch(/LAND_PRICE_POINTS_ONLY:\s*"1"/);
    expect(wf).toContain("scripts/import_land_prices.ts");
  });

  it("地点だけのモードでは municipality_wealth を更新しない", () => {
    const src = read("scripts/import_land_prices.ts");
    expect(src).toContain('process.env.LAND_PRICE_POINTS_ONLY === "1"');
    // 更新の枝は POINTS_ONLY でないときだけ通る
    const guard = src.indexOf("count > 0 && POINTS_ONLY");
    const update = src.indexOf("prisma.municipalityWealth.update");
    expect(guard).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(guard);
  });
});
