import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { Solar } from "lunar-javascript";
import { directionFromBearing } from "@/utils/directionGeo";
import { geomagneticAt } from "@/utils/geomagneticModel";

/**
 * 公開記事 reality-creation-theory-vs-this-site のうち、計算で確かめられる
 * 数字を照合する（2026-10-02 の監査。どのテストからも参照されていなかった）。
 *
 * 記事の大半は研究史の整理で、計算に当たるのは 3 つだけ。数え直したら
 * 3 つとも一致した。
 *
 * - 恵方: 2025 年（乙巳）は庚 255 度、2026 年（丙午）は丙 165 度
 * - 伝統区分の幅: 四正 30 度・四隅 60 度
 * - 日本の偏角: 真北から西へ 5〜10 度ほど、東京と沖縄で違う
 *
 * 恵方はサイトに実装が無い（判定に使っていない）ので、暦の規則
 * （年の十干 → 歳徳神の方位）をここに書いて、年の十干は lunar-javascript
 * から引く。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/reality-creation-theory-vs-this-site.md"),
  "utf-8",
);

/**
 * 歳徳神の方位（恵方）。年の十干で 4 通りに決まる。
 *   甲・己 → 甲（75 度）  乙・庚 → 庚（255 度）
 *   丙・辛・戊・癸 → 丙（165 度）  丁・壬 → 壬（345 度）
 */
const EHOU: Record<string, { kan: string; deg: number }> = {
  甲: { kan: "甲", deg: 75 },
  己: { kan: "甲", deg: 75 },
  乙: { kan: "庚", deg: 255 },
  庚: { kan: "庚", deg: 255 },
  丙: { kan: "丙", deg: 165 },
  辛: { kan: "丙", deg: 165 },
  戊: { kan: "丙", deg: 165 },
  癸: { kan: "丙", deg: 165 },
  丁: { kan: "壬", deg: 345 },
  壬: { kan: "壬", deg: 345 },
};

/** その年の干支（年の途中の正午で引く。立春前後の境目を避ける） */
const yearGanZhi = (year: number) => {
  const ec = Solar.fromYmdHms(year, 6, 1, 12, 0, 0).getLunar().getEightChar();
  return ec.getYearGan() + ec.getYearZhi();
};

describe("記事: さとうみつろう氏の現実創造論とこのサイト", () => {
  it("恵方: 2025 年（乙巳）は庚 255 度、2026 年（丙午）は丙 165 度", () => {
    expect(yearGanZhi(2025)).toBe("乙巳");
    expect(yearGanZhi(2026)).toBe("丙午");
    expect(EHOU["乙"]).toEqual({ kan: "庚", deg: 255 });
    expect(EHOU["丙"]).toEqual({ kan: "丙", deg: 165 });
    expect(md).toContain(
      "2025 年（乙巳）の恵方は庚の方位で、西南西やや西の 255 度",
    );
    expect(md).toContain(
      "2026 年（丙午）の恵方は丙の方位、南南東やや南の 165 度",
    );
    /* 「西南西やや西」「南南東やや南」: 255 度は西南西（247.5 度）より西、
       165 度は南南東（157.5 度）より南 */
    expect(255).toBeGreaterThan(247.5);
    expect(165).toBeGreaterThan(157.5);
  });

  it("伝統区分は 四正 30 度・四隅 60 度", () => {
    /* 0.5 度刻みで境目を拾い、各方位の幅を出す */
    const width: Record<string, number> = {};
    for (let b = 0; b < 360; b += 0.5) {
      const d = directionFromBearing(b, "traditional");
      width[d] = (width[d] ?? 0) + 0.5;
    }
    for (const d of ["N", "E", "S", "W"]) expect(width[d], d).toBe(30);
    for (const d of ["NE", "SE", "SW", "NW"]) expect(width[d], d).toBe(60);
    expect(md).toContain("伝統区分では四正 30 度・四隅 60 度");
  });

  it("日本の偏角は西へ 5〜10 度ほどで、東京と沖縄で違う", () => {
    const at = (lat: number, lon: number) =>
      geomagneticAt(lat, lon, Date.UTC(2026, 9, 1))!.declination;
    const tokyo = at(35.6895, 139.6917);
    const naha = at(26.2124, 127.6809);
    const sapporo = at(43.0621, 141.3544);
    for (const [name, d] of [
      ["東京", tokyo],
      ["那覇", naha],
      ["札幌", sapporo],
    ] as const) {
      /* 西偏（負）で、5〜10 度「ほど」。最北の稚内は 10.5 度前後なので
         上は 11 度まで許す */
      expect(d, name).toBeLessThan(-5);
      expect(d, name).toBeGreaterThan(-11);
    }
    expect(Math.abs(tokyo - naha)).toBeGreaterThan(1);
    expect(md).toContain("日本では真北から西へ 5〜10 度ほどずれていて");
  });
});
