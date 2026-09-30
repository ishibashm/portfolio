import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bearingOfPoint,
  buildThreeBoardModel,
  directionOfPoint,
  isBoardResponse,
  sectorKind,
  sectorRange,
  statusLabelFor,
  type BoardResponse,
} from "@/lib/threeBoardModel";
import {
  COMPASS_DIRECTIONS,
  directionFromBearing,
  type NodeMapping,
} from "@/utils/directionGeo";
import { TIER_FILL } from "@/utils/tierDisplay";
import { GET } from "@/app/api/relocation/auspicious-days/route";

/**
 * 三盤の方位盤の中身（利用者の依頼、2026-09-30。精度は「判定と一致」と
 * 「質感」の両方）。ここは前者を固定する。
 *
 * - 扇形の角度は判定の境目（directionFromBearing）とずれない。伝統は
 *   四正 30 度・四隅 60 度、均等は 45 度で、8 つで 360 度を隙間なく覆う
 * - 立体の盤で押した点の方位は、判定と同じ境目で決まる
 * - 盤の九星・吉凶の色分け・呼び名・段階は API の値をそのまま写す
 * - このファイルは判定エンジンを値として読まない（client のバンドルに
 *   エンジン一式が乗る。CLAUDE.md 4 節）
 */

const MAPPINGS: NodeMapping[] = ["traditional", "physical"];

describe("扇形の角度", () => {
  it.each(MAPPINGS)("%s: 8 つで 360 度を隙間なく覆い、幅は区分どおり", (m) => {
    const ranges = COMPASS_DIRECTIONS.map((d) => sectorRange(d, m));
    const total = ranges.reduce((s, [a, b]) => s + (b - a), 0);
    expect(total).toBeCloseTo(360, 10);
    for (const [i, d] of COMPASS_DIRECTIONS.entries()) {
      const [a, b] = ranges[i];
      const width = m === "physical" ? 45 : d.length === 2 ? 60 : 30;
      expect(b - a, d).toBeCloseTo(width, 10);
      // 次の方位の始まりが、この方位の終わり（隙間も重なりも無い）
      const next = ranges[(i + 1) % 8][0];
      expect(((b % 360) + 360) % 360).toBeCloseTo(
        ((next % 360) + 360) % 360,
        10,
      );
    }
  });

  it.each(MAPPINGS)("%s: 扇形の中は判定でもその方位、境目の外は隣", (m) => {
    for (const [i, d] of COMPASS_DIRECTIONS.entries()) {
      const [a, b] = sectorRange(d, m);
      expect(directionFromBearing((a + b) / 2, m)).toBe(d);
      expect(directionFromBearing(a + 0.01, m)).toBe(d);
      expect(directionFromBearing(b - 0.01, m)).toBe(d);
      expect(directionFromBearing(b + 0.01, m)).toBe(
        COMPASS_DIRECTIONS[(i + 1) % 8],
      );
    }
  });
});

describe("盤の上の点の方位", () => {
  it("北が奥（-z）、東が右（+x）", () => {
    expect(bearingOfPoint(0, -1)).toBeCloseTo(0, 10);
    expect(bearingOfPoint(1, 0)).toBeCloseTo(90, 10);
    expect(bearingOfPoint(0, 1)).toBeCloseTo(180, 10);
    expect(bearingOfPoint(-1, 0)).toBeCloseTo(270, 10);
  });

  it.each(MAPPINGS)("%s: 押した点の方位は判定の境目で決まる", (m) => {
    for (let deg = 0; deg < 360; deg += 0.5) {
      const r = (deg * Math.PI) / 180;
      const x = Math.sin(r);
      const z = -Math.cos(r);
      expect(directionOfPoint(x, z, m), `${deg}`).toBe(
        directionFromBearing(deg, m),
      );
    }
  });
});

describe("吉凶の色分けと呼び名", () => {
  it("吉は OPTIMAL と OPTIMAL_REGULAR、凶は NOISE、ほかは平", () => {
    expect(sectorKind("OPTIMAL")).toBe("good");
    expect(sectorKind("OPTIMAL_REGULAR")).toBe("good");
    expect(sectorKind("SAFE")).toBe("neutral");
    expect(sectorKind("NOISE_GOU")).toBe("bad");
    expect(sectorKind("NOISE_VOID")).toBe("bad");
  });

  it("破は盤ごとに歳破・月破・日破", () => {
    expect(statusLabelFor("NOISE_HA", "year")).toBe("歳破");
    expect(statusLabelFor("NOISE_HA", "month")).toBe("月破");
    expect(statusLabelFor("NOISE_HA", "day")).toBe("日破");
    expect(statusLabelFor("NOISE_GOU", "day")).toBe("五黄殺");
  });
});

describe("API の値から組む", () => {
  async function board(date: string): Promise<BoardResponse> {
    const q = new URLSearchParams({
      mode: "board",
      date,
      birthDate: "1990-05-10",
      lon: "139.69",
      tenchusatsuMode: "strict",
    });
    const res = await GET(
      new Request(`http://localhost/api/relocation/auspicious-days?${q}`),
    );
    return res.json();
  }

  it.each(MAPPINGS)("%s: 盤の星・吉凶・段階をそのまま写す", async (m) => {
    const res = await board("2026-09-30");
    const model = buildThreeBoardModel(res, m);
    expect(model.discs.map((d) => d.name)).toEqual(["年盤", "月盤", "日盤"]);
    for (const disc of model.discs) {
      expect(disc.center).toBe(res.boards[disc.layer].CENTER);
      for (const s of disc.sectors) {
        expect(s.star).toBe(res.boards[disc.layer][s.direction]);
        expect(s.kind).toBe(sectorKind(s.status));
        expect([s.startDeg, s.endDeg]).toEqual(sectorRange(s.direction, m));
      }
      // 五黄の入った扇形は凶で、呼び名は五黄殺（中宮に五黄が無いとき）
      if (disc.center !== 5) {
        const gou = disc.sectors.find((s) => s.star === 5)!;
        expect(gou.kind).toBe("bad");
        expect(gou.statusLabel).toBe("五黄殺");
      }
    }
    for (const c of model.columns) {
      const d = res.directions[c.direction];
      expect(c.tier).toBe(d.tier);
      expect(c.color).toBe(TIER_FILL[c.tier!]);
      expect(c.aligned).toBe(d.tier === "S");
      expect(c.blocked).toBe(d.blocked);
    }
  });
});

describe("バンドルの重さ", () => {
  it("判定エンジンを値として import しない", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/threeBoardModel.ts"),
      "utf8",
    );
    const valueImports = src
      .split("\n")
      .filter((l) => /^import (?!type)/.test(l) || /^} from /.test(l));
    const text = src.replace(/import type[^;]+;/g, "");
    expect(text).not.toMatch(/from "@\/utils\/auspiciousDays"/);
    expect(text).not.toMatch(/from "@\/utils\/ephemerisEngine"/);
    expect(valueImports.length).toBeGreaterThan(0);
  });
});

describe("応答の形", () => {
  it("盤の口の応答だけを通し、日の一覧や壊れた値は通さない", async () => {
    const q = new URLSearchParams({
      mode: "board",
      date: "2026-09-30",
      birthDate: "1990-05-10",
      lon: "139.69",
    });
    const res = await GET(
      new Request(`http://localhost/api/relocation/auspicious-days?${q}`),
    );
    expect(isBoardResponse(await res.json())).toBe(true);
    // 盤の口を持たないサーバーは日の一覧を返す
    expect(isBoardResponse({ days: [], summaries: {} })).toBe(false);
    expect(isBoardResponse(null)).toBe(false);
    expect(
      isBoardResponse({ boards: { year: {}, month: {} }, directions: {} }),
    ).toBe(false);
  });
});
