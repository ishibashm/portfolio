import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIRECTION_UNSTABLE_KM,
  directionUnstableNote,
  sectorShiftMeters,
} from "@/lib/directionDistance";
import { directionWedgeHalfWidth } from "@/utils/directionGeo";
import { DEFAULT_MIN_KM } from "@/lib/landPriceDirections";

/**
 * 公開記事 how-much-does-distance-matter の数字を実装と照合する。
 *
 * この記事は**画面に出している注記そのもの**を引用し、その裏の計算を
 * 表にしている。`lib/directionDistance` を直すと記事だけが古くなる。
 *
 * **実際に古くなっていた。**記事は 45 度等分（tan 22.5° ≒ 0.414）で
 * 書かれたままで、1km が 414m・5km が 2071m、引用している注記の例も
 * 746m だった。実装は伝統区分（四正 30 度・半幅 15 度）に直してあり、
 * 同じ距離が 268m・1340m・482m。**記事のほうが 1.5 倍ゆるい数字を
 * 読者に見せていた。**2026-09-22 に記事を直し、ここで固定する。
 *
 * 本文の表を**読んで**突き合わせる。記事の数字をこちらに写して固定
 * すると、両方を同時に間違えたときに気付けない。
 */

const SLUG = "how-much-does-distance-matter";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

/** 「1340m」「8.0km」「26.8km」のどれでもメートルで読む。 */
function meters(cell: string): number {
  const m = cell.replace(/\*/g, "").trim();
  const km = m.match(/^([\d.]+)km$/);
  if (km) return Math.round(Number(km[1]) * 1000);
  const mm = m.match(/^([\d.]+)m$/);
  expect(mm, `${cell} を長さとして読めない`).not.toBeNull();
  return Number(mm![1]);
}

/** 記事の表から「移動距離 | 横ずれ」の組を拾う。 */
function shiftRows(): { km: number; written: string }[] {
  const out: { km: number; written: string }[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(
      /^\|\s*\*{0,2}([\d.]+)km\*{0,2}\s*\|\s*([^|]+?)\s*\|\s*$/,
    );
    if (m) out.push({ km: Number(m[1]), written: m[2] });
  }
  return out;
}

describe("記事: 引越しの距離は方位にどれくらい関係するのか", () => {
  it("横ずれの表が sectorShiftMeters と一致する", () => {
    const rows = shiftRows();
    expect(rows.length, "横ずれの表の行数").toBe(9);

    for (const r of rows) {
      const actual = sectorShiftMeters(r.km);
      const written = meters(r.written);
      /* km で丸めて書いてある行（8.0km・26.8km）は 100m の桁まで。 */
      const tolerance = r.written.includes("km") ? 50 : 0;
      expect(
        Math.abs(written - actual),
        `${r.km}km: 記事 ${r.written} / 実装 ${actual}m`,
      ).toBeLessThanOrEqual(tolerance);
    }
  });

  it("半幅と tan の値が実装と一致する（45 度等分に戻っていない）", () => {
    /* 四正 15 度・四隅 30 度。記事の本文がこの 2 つを書いている。 */
    expect(directionWedgeHalfWidth("N")).toBe(15);
    expect(directionWedgeHalfWidth("NE")).toBe(30);
    expect(md).toContain("四正）が 30 度");
    expect(md).toContain("四隅）が 60 度");
    expect(md).toContain("四正 15 度・四隅 30 度");

    const tan = (deg: number) => Math.tan((deg * Math.PI) / 180);
    expect(md).toContain(`tan(15°) はおよそ ${tan(15).toFixed(3)}`);
    expect(md).toContain(`tan(30°) ≒ ${tan(30).toFixed(3)}`);
    expect(md).toContain(`およそ ${Math.round(tan(15) * 100)}%`);
    expect(md).toContain(`およそ ${Math.round(tan(30) * 100)}%`);

    /* 45 度等分の名残が残っていないこと。 */
    for (const stale of ["22.5 度", "0.414", "414m", "2071m", "746m"]) {
      expect(md, `「${stale}」が残っている`).not.toContain(stale);
    }
  });

  it("引用している注記が、実装が出す文と一字一句同じ", () => {
    const note = directionUnstableNote(1.8);
    expect(note).not.toBeNull();
    /* 記事は読みやすさのため「約 1.8km」と空白を入れている。 */
    expect(md).toContain(`> ${note!.replace("約1.8km", "約 1.8km")}`);
  });

  it("5km の線が、実装の 2 つの定数と同じ", () => {
    expect(DIRECTION_UNSTABLE_KM).toBe(5);
    expect(DEFAULT_MIN_KM).toBe(DIRECTION_UNSTABLE_KM);
    expect(md).toContain(`${DIRECTION_UNSTABLE_KM}km 未満`);
    expect(md).toContain(
      `${DIRECTION_UNSTABLE_KM}km なら四正でも境目まで ${sectorShiftMeters(
        DIRECTION_UNSTABLE_KM,
      )}m`,
    );
  });

  it("誤差との比較表も同じ値を使っている", () => {
    /* 4 列の表（移動距離 / 境目までの余裕 / 座標の誤差 / どちらが大きいか）。 */
    const rows = md
      .split("\n")
      .map((l) =>
        l
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim()),
      )
      .filter((r) => r.length === 4 && /^\d+km$/.test(r[0]));
    expect(
      rows.map((r) => r[0]),
      "比較表の行",
    ).toEqual(["1km", "2km", "10km"]);

    for (const r of rows) {
      const km = Number(r[0].replace("km", ""));
      expect(r[1], `${r[0]} の余裕`).toBe(`${sectorShiftMeters(km)}m`);
    }
  });
});
