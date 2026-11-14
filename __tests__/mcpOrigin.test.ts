import { describe, expect, it } from "vitest";
import { findArea } from "@/lib/areaContent";
import { resolveMcpOrigin, searchMunicipalityAreas } from "@/lib/mcpOrigin";

describe("resolveMcpOrigin", () => {
  it("経度があれば市区町村を引かず、その値を使う", () => {
    const r = resolveMcpOrigin({
      lon: 139.69,
      municipalityName: "大阪市",
    });
    expect(r).toEqual({ ok: true, lon: 139.69 });
  });

  it("5桁のコードから経度を決める", () => {
    const shinjuku = findArea("13104");
    expect(shinjuku).toBeTruthy();
    const r = resolveMcpOrigin({ municipalityCode: "13104" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lon).toBe(shinjuku!.lon);
      expect(r.origin?.name).toContain("新宿");
    }
  });

  it("一意な市区町村名（新宿区）から、コード指定と同じ経度になる", () => {
    const byName = resolveMcpOrigin({ municipalityName: "新宿区" });
    const byCode = resolveMcpOrigin({ municipalityCode: "13104" });
    expect(byName.ok).toBe(true);
    expect(byCode.ok).toBe(true);
    if (byName.ok && byCode.ok) {
      expect(byName.lon).toBe(byCode.lon);
      expect(byName.origin?.code).toBe("13104");
    }
  });

  it("同名で複数あるときは候補を返し、判定はしない", () => {
    const hits = searchMunicipalityAreas("名古屋");
    expect(hits.length).toBeGreaterThan(1);
    const r = resolveMcpOrigin({ municipalityName: "名古屋" });
    expect(r.ok).toBe(false);
    if (!r.ok && "needsSelection" in r) {
      expect(r.needsSelection).toBe(true);
      expect(r.candidates.length).toBeGreaterThan(1);
      expect(r.candidates.every((c) => /^\d{5}$/.test(c.code))).toBe(true);
    } else {
      throw new Error("候補の応答ではありません");
    }
  });

  it("見つからない名前と不正なコードはエラーにする", () => {
    expect(resolveMcpOrigin({ municipalityName: "存在しない市XYZ" }).ok).toBe(
      false,
    );
    expect(resolveMcpOrigin({ municipalityCode: "99999" }).ok).toBe(false);
    expect(resolveMcpOrigin({ municipalityCode: "12" }).ok).toBe(false);
    expect(resolveMcpOrigin({}).ok).toBe(false);
  });

  it("範囲外の経度はエラーにする", () => {
    const r = resolveMcpOrigin({ lon: 0 });
    expect(r.ok).toBe(false);
  });
});
