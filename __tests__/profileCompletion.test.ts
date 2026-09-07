import { describe, expect, it } from "vitest";
import {
  formatCoords,
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

describe("入っている値", () => {
  it("埋まっている項目にだけ値が付く", () => {
    const steps = profileSteps({
      birth_date: "1990-01-02",
      base_lat: 35.6812,
      base_lon: 139.7671,
    });
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));

    expect(byKey.birth_date.value).toBe("1990-01-02");
    expect(byKey.base.value).toBe("北緯 35.681 / 東経 139.767");
    /* 入れていない出生地に値は付かない。「✓ なのに空」「○ なのに値が
       ある」のどちらも起こさない */
    expect(byKey.birth_place.done).toBe(false);
    expect(byKey.birth_place.value).toBeUndefined();
  });

  it("片方だけの座標には値が付かない（done と同じ線引き）", () => {
    const steps = profileSteps({ base_lat: 35.6 });
    const base = steps.find((s) => s.key === "base");
    expect(base?.done).toBe(false);
    expect(base?.value).toBeUndefined();
  });

  it("壊れた保存値にも値が付かない", () => {
    const steps = profileSteps({
      birth_date: "",
      base_lat: "35.6",
      base_lon: 139.7,
    });
    expect(steps.find((s) => s.key === "birth_date")?.value).toBeUndefined();
    expect(steps.find((s) => s.key === "base")?.value).toBeUndefined();
  });
});

describe("座標の書式", () => {
  it("小数 3 桁で切る", () => {
    expect(formatCoords(35.68123456, 139.76712345)).toBe(
      "北緯 35.681 / 東経 139.767",
    );
  });

  it("負の値は南緯・西経にする（絶対値で出す）", () => {
    // 日本の利用者しか想定していないが、設定は -90〜180 を受ける。
    // マイナス記号のまま「北緯 -33.868」と出すと読めない。
    expect(formatCoords(-33.8688, 151.2093)).toBe("南緯 33.869 / 東経 151.209");
    expect(formatCoords(40.7128, -74.006)).toBe("北緯 40.713 / 西経 74.006");
  });

  it("赤道・本初子午線は北緯・東経に倒す", () => {
    expect(formatCoords(0, 0)).toBe("北緯 0.000 / 東経 0.000");
  });
});
