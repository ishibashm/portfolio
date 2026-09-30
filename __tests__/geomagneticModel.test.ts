import { describe, expect, it } from "vitest";
import { geomagneticAt } from "@/utils/geomagneticModel";
import { getGeomagneticData } from "@/utils/geomagnetism";

/**
 * 偏角の計算（WMM）。素の関数に切り出し、server action はそれを呼ぶだけ。
 * 羅盤の立体が画面側で同じ計算を使う。
 *
 * 目安は国土地理院の磁気図（2020.0）の値。WMM とは細部が違うので 0.6 度の
 * 幅で見る。日本は全国で西偏（負）で、北ほど大きい。
 */

const AT = Date.parse("2026-09-30T00:00:00Z");

describe("偏角", () => {
  it.each([
    ["東京", 35.6895, 139.6917, -7.8],
    ["札幌", 43.0621, 141.3544, -9.7],
    ["那覇", 26.2124, 127.6809, -5.6],
  ])("%s は西偏で、磁気図の値に近い", (_name, lat, lon, gsi) => {
    const d = geomagneticAt(lat, lon, AT)!.declination;
    expect(d).toBeLessThan(0);
    expect(Math.abs(d - gsi)).toBeLessThan(0.6);
  });

  it("北ほど西偏が大きい（那覇 < 東京 < 札幌）", () => {
    const d = (lat: number, lon: number) =>
      Math.abs(geomagneticAt(lat, lon, AT)!.declination);
    expect(d(26.2124, 127.6809)).toBeLessThan(d(35.6895, 139.6917));
    expect(d(35.6895, 139.6917)).toBeLessThan(d(43.0621, 141.3544));
  });

  it("server action は同じ値を返す（計算は 1 か所）", async () => {
    const a = geomagneticAt(35.6895, 139.6917, AT);
    const b = await getGeomagneticData(35.6895, 139.6917, AT);
    expect(b).toEqual(a);
  });
});
