import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  landPricesByDirection,
  type LandPriceRow,
} from "@/lib/landPriceDirections";
import { directionFromBearing } from "@/utils/directionGeo";

/**
 * 地価公示の方位別集計が、盤の設定と同じ規則で切られること。
 *
 * ## なぜ
 *
 * `landPricesByDirection` は `"traditional"` の決め打ちだった。同じ
 * サイドバーの住宅・土地統計は `nodeMappingForBoard` に従う
 * （#1297・#1298）ので、**独自モデル（45 度等分）を選んでいる利用者は、
 * 同じ「東」の見出しの下で 2 通りの振り分けを見ていた。**四正と四隅の
 * 境目にある地点は、統計では東なのに地価では北東に入る。
 *
 * CLAUDE.md 3 節の「同じ画面で地図は合成、スコアカードは全統合」
 * （#1118〜#1121）と同じ形。#1297・#1298 で統計だけを直したときに
 * 取り残されていた。
 *
 * ## 何を見るか
 *
 * 1. 規則を渡すと、境目の地点が別の方位に入る（決め打ちが残っていない）
 * 2. 渡さないときは traditional のまま（既存の呼び出しの答えを変えない）
 * 3. 画面が実際に渡している（字面。型は任意引数を許すので tsc で出ない）
 */

/** 公開されている市区町村の代表点（福岡市中央区）。 */
const BASE = { lat: 33.5902, lon: 130.4017 };

/** 出発地から方位角 `bearing` 度・`km` 先の点。 */
function pointAt(bearing: number, km: number): { lat: number; lon: number } {
  const R = 6371;
  const d = km / R;
  const b = (bearing * Math.PI) / 180;
  const lat1 = (BASE.lat * Math.PI) / 180;
  const lon1 = (BASE.lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

function rowAt(bearing: number, km: number): LandPriceRow {
  const p = pointAt(bearing, km);
  return {
    point_id: `${bearing}-${km}`,
    year: 2026,
    land_price_type: 0,
    price_per_sqm: 100000,
    lat: p.lat,
    lon: p.lon,
    use_category: "住宅地",
    prefecture: "福岡県",
    municipality: "テスト市",
  };
}

/** その方位に地点が入ったか。 */
function countOf(
  stats: ReturnType<typeof landPricesByDirection>,
  direction: string,
): number {
  return stats.find((s) => s.direction === direction)?.count ?? 0;
}

describe("地価の方位は盤の設定と同じ規則で切る", () => {
  /* 方位角 20 度は、伝統区分では北東（北は 345〜15 度）、45 度等分では
     北（337.5〜22.5 度）。同じ地点が規則で別の方位に入る。 */
  const BEARING = 20;
  const rows = [rowAt(BEARING, 50)];

  it("この地点は規則で方位が変わる（検査が空回りしていない）", () => {
    expect(directionFromBearing(BEARING, "traditional")).toBe("NE");
    expect(directionFromBearing(BEARING, "physical")).toBe("N");
  });

  it("physical を渡すと 45 度等分で切られる", () => {
    const stats = landPricesByDirection(rows, BASE.lat, BASE.lon, {
      nodeMapping: "physical",
    });
    expect(countOf(stats, "N"), "北").toBe(1);
    expect(countOf(stats, "NE"), "北東").toBe(0);
  });

  it("traditional を渡すと伝統区分で切られる", () => {
    const stats = landPricesByDirection(rows, BASE.lat, BASE.lon, {
      nodeMapping: "traditional",
    });
    expect(countOf(stats, "NE"), "北東").toBe(1);
    expect(countOf(stats, "N"), "北").toBe(0);
  });

  it("渡さないときは traditional（既存の呼び出しの答えを変えていない）", () => {
    const stats = landPricesByDirection(rows, BASE.lat, BASE.lon);
    expect(countOf(stats, "NE")).toBe(1);
    expect(countOf(stats, "N")).toBe(0);
  });

  /*
    型は `nodeMapping?` を任意にしているので、渡し忘れても tsc は黙る。
    実際にそれで統計だけが直って地価が取り残された（#1297・#1298）ので、
    画面が渡していることを字面で固定する。#552 の「字面で探すと取りこぼす」
    とは逆向きで、ここは**渡していること**を見ている。
  */
  it("物件検索の画面が、地価の札にも規則を渡している", () => {
    const page = readFileSync(
      join(__dirname, "../src/app/relocation/arbitrage/page.tsx"),
      "utf-8",
    );
    const panel = page.slice(
      page.indexOf("<LandPriceByDirection"),
      page.indexOf(
        "</ArbitrageSidebarSection>",
        page.indexOf("<LandPriceByDirection"),
      ),
    );
    expect(panel, "LandPriceByDirection が見つからない").not.toBe("");
    expect(panel).toContain("nodeMapping={nodeMappingForBoard(useClassical)}");
  });

  it("API の口が規則を読んでいる", () => {
    const route = readFileSync(
      join(__dirname, "../src/app/api/land-prices/by-direction/route.ts"),
      "utf-8",
    );
    /* 綴り違いを黙って physical にしないこと（`as` で押し通さない）。 */
    expect(route).toContain("parseNodeMapping(searchParams.get(");
    expect(route).toContain("nodeMapping,");
  });
});
