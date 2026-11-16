// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "@/app/houi/relocation-calendar/page";
import { resolveRelocationOrigin } from "@/lib/relocationCalendarOrigin";
import { nearestOptionName } from "@/components/houi/RelocationFormEnhancer";

const base = {
  birthDate: "1990-05-15",
  from: "2026-01-01",
  days: "30",
};

async function render(q: Record<string, string>) {
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(q) }));
}

describe("resolveRelocationOrigin", () => {
  it("resolves a unique municipality name to its longitude", () => {
    const r = resolveRelocationOrigin({ place: "名古屋市中川区" });
    expect(r).toMatchObject({ kind: "ok", place: { code: "23110" } });
    if (r.kind === "ok") expect(r.lon).toBeCloseTo(136.86, 1);
  });
  it("returns candidates for an ambiguous name", () => {
    const r = resolveRelocationOrigin({ place: "府中" });
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      expect(r.candidates.map((c) => c.code)).toContain("13206");
      expect(r.candidates.length).toBeGreaterThan(1);
    }
  });
  it("returns a friendly error for an unknown name", () => {
    const r = resolveRelocationOrigin({ place: "存在しない町ほげ" });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toContain("経度で詳しく指定");
  });
  it("prefers code over place, and place over lon", () => {
    expect(
      resolveRelocationOrigin({ code: "13206", place: "府中", lon: "135.5" }),
    ).toMatchObject({ kind: "ok", place: { code: "13206" } });
    const r = resolveRelocationOrigin({
      place: "名古屋市中川区",
      lon: "139.69",
    });
    expect(r).toMatchObject({ kind: "ok", place: { code: "23110" } });
  });
  it("keeps legacy longitude-only queries working", () => {
    expect(resolveRelocationOrigin({ lon: "139.69" })).toEqual({
      kind: "ok",
      lon: 139.69,
    });
    expect(resolveRelocationOrigin({ lon: "200" }).kind).toBe("error");
    expect(resolveRelocationOrigin({}).kind).toBe("error");
  });
});

describe("relocation calendar place input", () => {
  it("asks for a municipality, offers a datalist, and keeps lon optional", async () => {
    const html = await render({});
    expect(html).toContain('name="place"');
    expect(html).toContain('<datalist id="relocation-calendar-places"');
    expect(html).toContain('value="愛知県名古屋市中川区"');
    expect(html).toMatch(/<details[^>]*>[\s\S]*name="lon"/);
    expect(html).not.toMatch(/name="lon"[^>]*required/);
    expect(html).not.toContain("<script");
  });
  it("computes from a municipality name and shows which place was used", async () => {
    const html = await render({ ...base, place: "名古屋市中川区" });
    expect(html).toContain(">期間の一覧<");
    expect(html).toContain("出発地：愛知県名古屋市中川区で計算しました");
    const area = html.match(/<textarea[^>]*>([^<]*)<\/textarea>/);
    expect(area).not.toBeNull();
    expect(area![1]).not.toContain("中川区");
    expect(area![1]).not.toContain("136.86");
    expect(html).not.toContain("1990-05-15");
  });
  it("matches the legacy lon URL result", async () => {
    const byName = await render({ ...base, place: "名古屋市中川区" });
    const byLon = await render({ ...base, lon: "136.86025" });
    const table = (h: string) => h.match(/<table[\s\S]*<\/table>/)?.[0];
    expect(table(byLon)).toBeTruthy();
    expect(table(byName)).toBe(table(byLon));
  });
  it("shows candidate buttons that resubmit the form with a code", async () => {
    const html = await render({ ...base, place: "府中" });
    expect(html).toContain("市区町村を選んでください");
    const button = html.match(/<button[^>]*value="13206"[^>]*>/)?.[0];
    expect(button).toContain('form="relocation-calendar-form"');
    expect(button).toContain('name="code"');
    expect(html).not.toContain(">期間の一覧<");
    const picked = await render({ ...base, place: "府中", code: "13206" });
    expect(picked).toContain("出発地：東京都府中市で計算しました");
  });
  it("shows a friendly alert for an unknown name", async () => {
    const html = await render({ ...base, place: "存在しない町ほげ" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("見つかりませんでした");
    expect(html).not.toContain(">期間の一覧<");
  });
});

describe("nearestOptionName", () => {
  it("picks the closest option", () => {
    expect(
      nearestOptionName(
        [
          { name: "A", lat: 35.68, lon: 139.69 },
          { name: "B", lat: 35.14, lon: 136.86 },
        ],
        35.1,
        136.9,
      ),
    ).toBe("B");
    expect(nearestOptionName([], 35, 139)).toBeNull();
  });
});
