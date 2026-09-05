import { describe, it, expect } from "vitest";
import {
  parseUserSpots,
  withUserSpot,
  sameSpot,
  MAX_USER_SPOTS,
  type UserSpot,
} from "@/lib/userSpots";

const mk = (n: number): UserSpot => ({
  id: `id${n}`,
  name: `地点${n}`,
  lat: 35 + n * 0.01,
  lon: 139 + n * 0.01,
  createdAt: "2026-09-05T00:00:00.000Z",
});

describe("parseUserSpots", () => {
  it("壊れた文字列・配列でないもの・形の合わない要素は捨てる", () => {
    expect(parseUserSpots(null)).toEqual([]);
    expect(parseUserSpots("")).toEqual([]);
    expect(parseUserSpots("{")).toEqual([]);
    expect(parseUserSpots('{"a":1}')).toEqual([]);
    const raw = JSON.stringify([
      mk(1),
      { id: "x", name: "緯度が文字列", lat: "35", lon: 139 },
      { id: "y", name: "範囲外", lat: 95, lon: 139 },
      { id: "z", name: "NaN", lat: Number.NaN, lon: 139 },
      null,
      { id: "w", name: "createdAt 無し", lat: 35, lon: 139 },
    ]);
    const out = parseUserSpots(raw);
    expect(out.map((s) => s.id)).toEqual(["id1", "w"]);
    expect(out[1].createdAt).toBe("");
  });

  it("上限を超えたぶんは読まない", () => {
    const many = Array.from({ length: MAX_USER_SPOTS + 5 }, (_, i) => mk(i));
    expect(parseUserSpots(JSON.stringify(many))).toHaveLength(MAX_USER_SPOTS);
  });
});

describe("withUserSpot", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");

  it("新しい座標は末尾に足す。元の配列は触らない", () => {
    const base = [mk(1)];
    const r = withUserSpot(base, { name: " 実家 ", lat: 36, lon: 140 }, now);
    expect(r.added).toBe(true);
    expect(r.list).toHaveLength(2);
    expect(r.list[1].name).toBe("実家");
    expect(r.list[1].createdAt).toBe(now.toISOString());
    expect(base).toHaveLength(1);
  });

  it("同じ座標（5 桁）は重ねず、名前だけ更新する", () => {
    const base = [mk(1)];
    const r = withUserSpot(
      base,
      { name: "改名", lat: base[0].lat + 0.000001, lon: base[0].lon },
      now,
    );
    expect(r.added).toBe(false);
    expect(r.reason).toBe("renamed");
    expect(r.list).toHaveLength(1);
    expect(r.list[0].name).toBe("改名");
    expect(r.list[0].id).toBe("id1");
  });

  it("名前が空なら座標を名前にする", () => {
    const r = withUserSpot(
      [],
      { name: "   ", lat: 35.12345678, lon: 139.1 },
      now,
    );
    expect(r.list[0].name).toBe("35.1235, 139.1000");
  });

  it("上限に達していたら足さない", () => {
    const full = Array.from({ length: MAX_USER_SPOTS }, (_, i) => mk(i));
    const r = withUserSpot(full, { name: "x", lat: 40, lon: 140 }, now);
    expect(r.added).toBe(false);
    expect(r.reason).toBe("full");
    expect(r.list).toHaveLength(MAX_USER_SPOTS);
  });
});

describe("sameSpot", () => {
  it("約 1m 未満の差は同じ地点", () => {
    expect(
      sameSpot({ lat: 35.000001, lon: 139 }, { lat: 35.000004, lon: 139 }),
    ).toBe(true);
    expect(
      sameSpot({ lat: 35.0001, lon: 139 }, { lat: 35.0002, lon: 139 }),
    ).toBe(false);
  });
});
