import { describe, expect, it } from "vitest";
import {
  TIER_FILL,
  TIER_BORDER,
  BLOCKED_FILL,
  TIER_JP,
  tierPinColors,
} from "@/utils/tierDisplay";
import type { DayTier } from "@/utils/auspiciousDays";

/**
 * 段階の色が、順序尺度として読める形を保っていること。
 *
 * 以前は吉の 3 段が S(緑) A(青緑) B(水色) と別々の色相で、順序が色相の
 * 違いに化けていた。しかも S と A が近すぎて、文字ラベルの無い塗り
 * （地図の扇形）では見分けられなかった。dataviz の検証スクリプトで
 * 通常色覚 ΔE 5.4 ／ 色覚多様性下 5.0（下限 15）。
 *
 * 発散型（吉=緑の濃淡 / 平=灰 / 凶=橙→赤）に組み替えて 15.1 ／ 12.2。
 *
 * ここでは検証スクリプトを呼べないので、その形が崩れていないかを見る。
 * 色を変えたら必ずスクリプトにも掛け直すこと。
 *   node scripts/validate_palette.js "<6色>" --mode light
 */

const TIERS: DayTier[] = ["S", "A", "B", "C", "D", "X"];

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`色が 6 桁の16進数ではない: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 相対輝度（WCAG）。順序が濃淡で出ているかを見るのに使う。 */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("段階の色", () => {
  it("6 段すべてに色がある", () => {
    for (const t of TIERS) {
      expect(TIER_FILL[t], t).toMatch(/^#[0-9a-f]{6}$/i);
      expect(TIER_BORDER[t], t).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("同じ色を 2 つの段階に割り当てない", () => {
    const values = TIERS.map((t) => TIER_FILL[t].toLowerCase());
    expect(new Set(values).size).toBe(TIERS.length);
  });

  it("天中殺は段階のどの色とも別", () => {
    const values = TIERS.map((t) => TIER_FILL[t].toLowerCase());
    expect(values).not.toContain(BLOCKED_FILL.toLowerCase());
  });

  it("吉の 3 段は濃い→薄いで並ぶ（順序が濃淡で読める）", () => {
    // 色相で分けると「どれが上か」が色から読めない。順序尺度なので濃淡。
    expect(luminance(TIER_FILL.S)).toBeLessThan(luminance(TIER_FILL.A));
    expect(luminance(TIER_FILL.A)).toBeLessThan(luminance(TIER_FILL.B));
  });

  it("吉の 3 段は同じ色相の側（緑）にいる", () => {
    // R より G が十分大きい＝緑側。青緑・水色に散らさない。
    for (const t of ["S", "A", "B"] as const) {
      const [r, g, b] = rgb(TIER_FILL[t]);
      expect(g, `${t} は緑側であること`).toBeGreaterThan(r + 30);
      expect(g, `${t} が水色に寄っていないこと`).toBeGreaterThan(b);
    }
  });

  it("凶の 2 段は暖色側（橙・赤）にいる", () => {
    for (const t of ["D", "X"] as const) {
      const [r, g, b] = rgb(TIER_FILL[t]);
      expect(r, `${t} は暖色側であること`).toBeGreaterThan(g);
      expect(g, `${t}`).toBeGreaterThanOrEqual(b);
    }
  });

  it("平（C）は中立の灰。発散型の中心", () => {
    const [r, g, b] = rgb(TIER_FILL.C);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    expect(spread, "C に色味が付いていないこと").toBeLessThan(20);
  });

  it("隣り合う段階の明るさが十分離れている", () => {
    // 実測 ΔE の代わり。ここが詰まると、色だけの塗りで見分けられない。
    for (let i = 1; i < TIERS.length; i++) {
      const prev = luminance(TIER_FILL[TIERS[i - 1]]);
      const cur = luminance(TIER_FILL[TIERS[i]]);
      expect(
        Math.abs(cur - prev),
        `${TIERS[i - 1]} と ${TIERS[i]} が近すぎる`,
      ).toBeGreaterThan(0.02);
    }
  });

  it("縁取りは塗りより濃い", () => {
    for (const t of TIERS) {
      expect(luminance(TIER_BORDER[t]), t).toBeLessThan(
        luminance(TIER_FILL[t]),
      );
    }
  });

  it("段階の名前は変えていない", () => {
    // 色を触るときに言葉まで動かさない。言葉は別の 1 か所の役目。
    expect(TIER_JP).toEqual({
      S: "三盤吉",
      A: "吉2盤",
      B: "吉1盤",
      C: "平",
      D: "軽い凶",
      X: "五大凶殺",
    });
  });
});

/**
 * 文字色は塗りと別に持っている（Tailwind のクラス）。塗りだけ検査していた
 * ため、S と B に同じ `dark:text-emerald-300` が入っていることに気付けなかった。
 * ダークでは二つが完全に同色で、しかも A だけ暗く順序が崩れていた。
 * 物件のポップアップの見出しがこの色で出る。
 */
describe("段階の文字色", () => {
  /** "text-emerald-800 dark:text-emerald-300" → { light: 800, dark: 300 } */
  function emeraldSteps(t: DayTier): { light: number; dark: number } {
    const cls = tierPinColors(t)?.textClass ?? "";
    const light = /(?:^|\s)text-emerald-(\d+)/.exec(cls);
    const dark = /dark:text-emerald-(\d+)/.exec(cls);
    if (!light || !dark) throw new Error(`緑の段階が読めない: ${t} → ${cls}`);
    return { light: Number(light[1]), dark: Number(dark[1]) };
  }

  const KICHI: DayTier[] = ["S", "A", "B"];

  it("吉の 3 段は、ライトでもダークでも別々の色", () => {
    for (const mode of ["light", "dark"] as const) {
      const steps = KICHI.map((t) => emeraldSteps(t)[mode]);
      expect(new Set(steps).size, `${mode}: ${steps.join(",")}`).toBe(3);
    }
  });

  it("ライトは暗いほど強い（S が一番濃い）", () => {
    const [s, a, b] = KICHI.map((t) => emeraldSteps(t).light);
    expect(s).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(b);
  });

  it("ダークは明るいほど強い（ライトと逆向きに並ぶ）", () => {
    // 暗い背景では明るい文字ほど目立つので、順序は反転する。
    const [s, a, b] = KICHI.map((t) => emeraldSteps(t).dark);
    expect(s).toBeLessThan(a);
    expect(a).toBeLessThan(b);
  });

  it("天中殺は段階の緑とは別系統（灰）", () => {
    const blocked = tierPinColors("S", true);
    expect(blocked?.textClass).toContain("slate");
    expect(blocked?.textClass).not.toContain("emerald");
    expect(blocked?.label).toBe("天中殺");
  });
});
