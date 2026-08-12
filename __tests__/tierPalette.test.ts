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

  /**
   * ライトの 3 段が WCAG AA（本文 4.5:1）を満たすこと。
   *
   * 地色 #f7f4f0 に対する実測値。AA を満たす一番明るい段が 700 で、
   * それより明るい段は届かない。
   *
   *   emerald-500  2.25:1   ✗
   *   emerald-600  3.34:1   ✗
   *   emerald-700  4.90:1   ✓
   *   emerald-800  6.91:1   ✓
   *   emerald-900  8.83:1   ✓
   *
   * 段の番号で見ているのは、Tailwind v4 の色が oklch で書かれていて、
   * ここで実際の RGB に直すと変換の実装まで抱えることになるため。
   * 色を触るときは上の実測をやり直すこと。
   */
  const AA_MIN_STEP = 700;

  it("ライトの 3 段はコントラスト比 4.5:1 を満たす", () => {
    for (const t of KICHI) {
      const step = emeraldSteps(t).light;
      expect(
        step,
        `${t} が明るすぎる（emerald-${step}）`,
      ).toBeGreaterThanOrEqual(AA_MIN_STEP);
    }
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

/**
 * 帯（背景と枠）も文字色と同じ順序で読めること。
 *
 * ライトは色の濃さで強弱を出しているが、ダークではそれが反転する。
 * 不透明度で薄めているので、暗い地の上では明るい色ほど濃く見える。
 * S の bg-emerald-700/15 が一番目立たず、B の bg-emerald-300/15 が
 * 一番目立つ——一番強い段階の帯が一番薄い、という逆の見え方だった。
 */
describe("段階の帯", () => {
  const KICHI: DayTier[] = ["S", "A", "B"];

  /** "dark:bg-emerald-400/25" → { hue: 400, alpha: 25 } */
  function darkBg(t: DayTier): { hue: number; alpha: number } {
    const cls = tierPinColors(t)?.bgClass ?? "";
    const m = /dark:bg-emerald-(\d+)\/(\d+)/.exec(cls);
    if (!m) throw new Error(`ダークの帯が読めない: ${t} → ${cls}`);
    return { hue: Number(m[1]), alpha: Number(m[2]) };
  }

  it("ダークは色相を 1 つに固定する（不透明度だけで強弱を出す）", () => {
    // 色相が混ざると、暗い地では明るい色のほうが濃く見えて順序が壊れる。
    const hues = KICHI.map((t) => darkBg(t).hue);
    expect(new Set(hues).size, `色相: ${hues.join(",")}`).toBe(1);
  });

  it("ダークの帯は S が一番濃い", () => {
    const [s, a, b] = KICHI.map((t) => darkBg(t).alpha);
    expect(s).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(b);
  });

  it("ライトの帯は触っていない（見え方を変えない）", () => {
    // ダークだけ足す変更なので、ライト側のクラスはそのまま残っていること。
    expect(tierPinColors("S")?.bgClass).toContain("bg-emerald-700/15");
    expect(tierPinColors("A")?.bgClass).toContain("bg-emerald-500/10");
    expect(tierPinColors("B")?.bgClass).toContain("bg-emerald-300/15");
  });
});
