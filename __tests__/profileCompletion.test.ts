import { describe, expect, it } from "vitest";
import {
  isProfileReady,
  profileCompletion,
  profileSteps,
} from "@/lib/profileCompletion";

describe("項目の並び", () => {
  it("順番は 生年月日 → 現在地 → 出生地", () => {
    expect(profileSteps({}).map((s) => s.key)).toEqual([
      "birth_date",
      "base",
      "birth_place",
    ]);
  });
});

describe("必須の線引き", () => {
  it("何も入っていなければ ready ではない", () => {
    const c = profileCompletion({});
    expect(c.ready).toBe(false);
    expect(c.done).toBe(0);
    expect(c.total).toBe(3);
    expect(c.missing.map((s) => s.key)).toEqual([
      "birth_date",
      "base",
      "birth_place",
    ]);
  });

  it("生年月日と現在地がそろえば ready。出生地は任意", () => {
    const settings = {
      birth_date: "1990-01-02",
      base_lat: 35.6,
      base_lon: 139.7,
    };
    expect(isProfileReady(settings)).toBe(true);
    expect(profileCompletion(settings).missing.map((s) => s.key)).toEqual([
      "birth_place",
    ]);
  });

  it("出生地だけ入っていても ready ではない", () => {
    expect(isProfileReady({ birth_lat: 34.7, birth_lon: 135.5 })).toBe(false);
  });

  it("現在地は緯度と経度の両方がそろって初めて入っていると見る", () => {
    const half = { birth_date: "1990-01-02", base_lat: 35.6 };
    expect(isProfileReady(half)).toBe(false);
  });
});

describe("壊れた保存値", () => {
  it("空文字の生年月日は入っていない扱い", () => {
    expect(
      isProfileReady({ birth_date: "", base_lat: 35.6, base_lon: 139.7 }),
    ).toBe(false);
  });

  it("数値のはずの座標に文字列が入っていたら入っていない扱い", () => {
    const broken = {
      birth_date: "1990-01-02",
      base_lat: "35.6",
      base_lon: "139.7",
    };
    expect(isProfileReady(broken)).toBe(false);
  });

  it("NaN も入っていない扱い", () => {
    const broken = { birth_date: "1990-01-02", base_lat: NaN, base_lon: 139.7 };
    expect(isProfileReady(broken)).toBe(false);
  });
});
