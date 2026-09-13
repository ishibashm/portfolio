import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCENT_HUE,
  NEUTRAL_HUE,
  RESERVED_JUDGEMENT_HUES,
  SEQUENTIAL_RAMP,
  SYSTEM_HUES,
  UNREADABLE_TEXT_STEPS,
  WARN_HUE,
  rampColor,
  relativeLuminance,
} from "@/lib/panelPalette";

/**
 * 色の決め事が守られているかを検査する。
 *
 * ## 何を守るのか
 *
 * ホームの各タブが 6〜9 色の色相を独立に使っていた。1 画面ずつ塗り直しても、
 * **足すときに気付けなければまた散る。**
 *
 * この検査は 2 段構えにしてある。
 *
 *   1. 決め事そのものの検査   ランプが単調か、役割どうしが重なっていないか
 *   2. **色相の数の歯止め**   いま使っている数を上限として固定する
 *
 * 2 が要点。**「直っている」ことではなく「増えていない」ことを検査する。**
 * 実際にはまだ散らかっているので、直っていると主張する検査は嘘になる。
 * 上限を今の実測値に置いて、揃える作業が進むたびに数を下げていく。
 */

const HUE_PATTERN =
  /(?:bg|text|border|from|to|via|ring|fill|stroke|shadow)-(rose|red|emerald|green|amber|yellow|indigo|purple|sky|blue|cyan|teal|orange|violet|fuchsia|pink|lime)-\d{2,3}/g;

function huesIn(relativePath: string): Set<string> {
  const src = readFileSync(join(process.cwd(), relativePath), "utf8");
  const found = new Set<string>();
  for (const m of src.matchAll(HUE_PATTERN)) found.add(m[1]);
  return found;
}

/**
 * 現状の実測値。**下げることはあっても上げない。**
 *
 * 数え方は上の HUE_PATTERN。bg / text / border だけでなく
 * from / via / ring / fill / stroke / shadow も数える。手で bg / text /
 * border だけ数えたときは ScorecardPanel が 7 に見えたが、実際は
 * **9 だった**（teal と violet を取りこぼしていた）。手で数えない。
 *
 * 上げたくなったときは、色を足す前に「その色は 4 つの役割のどれか」を
 * 考えること。たいていは既存の役割で足りる。
 */
const HUE_BUDGET: Record<string, number> = {
  // yellow を落として 8 → 7（#486）。白地に yellow-400 で 1.53:1 しか
  // 無く、凡例の説明がその色で書かれていて読めなかった。
  "src/components/home/ConsultPanel.tsx": 7,
  // yellow を落として 9 → 8（#486）。
  "src/components/home/ScorecardPanel.tsx": 8,
  // yellow を落として 9 → 8（#486）。
  "src/components/home/DestinationMapPanel.tsx": 8,
  "src/components/home/HomePortal.tsx": 6,
};

describe("色の決め事", () => {
  it("役割どうしの色相が重なっていない", () => {
    // 操作・注意・構造が判定の色を借りると、「色が付いている＝意味がある」
    // が成り立たなくなる。
    const reserved = new Set<string>(RESERVED_JUDGEMENT_HUES);
    expect(reserved.has(ACCENT_HUE)).toBe(false);
    expect(reserved.has(WARN_HUE)).toBe(false);
    expect(reserved.has(NEUTRAL_HUE)).toBe(false);
    expect(new Set([ACCENT_HUE, WARN_HUE, NEUTRAL_HUE]).size).toBe(3);
  });

  it("連続量のランプは単調に暗くなる", () => {
    // 目で見て「だんだん濃い」と判断しない。段を足したり差し替えたりした
    // ときに、順序が崩れたことへ気付けるようにする。
    const lums = SEQUENTIAL_RAMP.map(relativeLuminance);
    for (let i = 1; i < lums.length; i += 1) {
      expect(lums[i], `${SEQUENTIAL_RAMP[i]} が前の段より明るい`).toBeLessThan(
        lums[i - 1],
      );
    }
  });

  it("ランプは端を丸め、値が無いときは薄い側へ倒す", () => {
    expect(rampColor(-1)).toBe(SEQUENTIAL_RAMP[0]);
    expect(rampColor(0)).toBe(SEQUENTIAL_RAMP[0]);
    expect(rampColor(1)).toBe(SEQUENTIAL_RAMP[SEQUENTIAL_RAMP.length - 1]);
    expect(rampColor(2)).toBe(SEQUENTIAL_RAMP[SEQUENTIAL_RAMP.length - 1]);
    // NaN を濃い側へ倒すと「値が無い」が「値が大きい」に見える。
    expect(rampColor(NaN)).toBe(SEQUENTIAL_RAMP[0]);
  });

  it("色は #rrggbb でしか受け取らない", () => {
    expect(() => relativeLuminance("blue")).toThrow();
    expect(() => relativeLuminance("#fff")).toThrow();
  });
});

describe("画面ごとの色相の数", () => {
  it("検査の対象を読めている（空回りしていない）", () => {
    // 対象が読めないと、上限をいくつにしても素通りする。
    for (const path of Object.keys(HUE_BUDGET)) {
      expect(huesIn(path).size, path).toBeGreaterThan(0);
    }
  });

  for (const [path, budget] of Object.entries(HUE_BUDGET)) {
    it(`${path} の色相は ${budget} 色以下`, () => {
      const hues = [...huesIn(path)].sort();
      expect(
        hues.length,
        `${path} の色相: ${hues.join(", ")}\n` +
          "色を足す前に、その色が「判定 / 構造 / 操作 / 注意」のどれかを考えること。" +
          "たいていは既存の役割で足りる。揃える作業で減ったら HUE_BUDGET も下げる。",
      ).toBeLessThanOrEqual(budget);
    });
  }
});

/**
 * 明るい地に読めない文字色を使っていないか。
 *
 * **実際に起きた事故を検知する検査。**「4. 環境データ」の凡例が
 * text-yellow-400 で書かれていて、白地に対して 1.53:1 しか無く読めなかった
 * （本文には 4.5:1 が要る）。しかも読めないその色で「黄色(WARNING) は…」と
 * 説明していたので、何の色の話なのかも伝わらなかった。
 *
 * 目で見て判断しない。明るい黄色や明るい緑は、作っている側の画面では
 * 見えていることがある。数字で決める。
 */
describe("明るい地で読めない文字色を使っていない", () => {
  /**
   * まだ残っているもの。**増やさない。**
   *
   * emerald は**判定の色**（OPTIMAL / OPTIMAL_REGULAR）。白地に対して
   * emerald-500 が 2.54:1、emerald-400 が 1.92:1 しか無いのは事実だが、
   * ここを動かすと**判定の見え方が変わる。**CLAUDE.md 3 節の手順
   * （旧実装をテストに写す・広い入力範囲で固定する・旧挙動に戻すと
   * 落ちることを確認する）を踏まないと触れない。別に扱う。
   *
   * それ以外（yellow / amber）は判定の色ではないので、見つけ次第直して
   * この表から消す。**残っている数は、まだ手を付けていない画面の数。**
   */
  type UnreadableStep = (typeof UNREADABLE_TEXT_STEPS)[number];

  const KNOWN: Record<string, readonly UnreadableStep[]> = {
    // 2026-09-13 の総点検（#1286〜）で、「今日の方位と時刻を確かめる」の
    // 部品は白地で 4.5:1 を割る文字色を全部 1 段濃くした（色相は変えず
    // 段だけ。判定のどの状態がどの色相かはそのまま）。以後は 0 を保つ。
    "src/components/home/ConsultPanel.tsx": [],
    "src/components/home/ScorecardPanel.tsx": [],
    "src/components/home/DestinationMapPanel.tsx": [],
    "src/components/home/HomePortal.tsx": [],
    "src/components/home/QuickProfileBar.tsx": [],
    "src/app/relocation/dashboard/page.tsx": [],
    "src/components/SolarTimeClock.tsx": [],
    "src/components/SolarTimeTable.tsx": [],
    "src/components/ClockDisplay.tsx": [],
    "src/components/TenchusatsuVisualizer.tsx": [],
    "src/components/PersonalProfileConfig.tsx": [],
    "src/components/BioMagneticDashboard.tsx": [],
    "src/components/TacticalMagneticMap.tsx": [],
    "src/components/MagneticMapInner.tsx": [],
    "src/components/MagneticSpatialHUD.tsx": [],
    "src/lib/verdictRating.ts": [],
  };

  it("対象を読めている（空回りしていない）", () => {
    for (const f of Object.keys(KNOWN)) {
      expect(
        readFileSync(join(process.cwd(), f), "utf8").length,
        f,
      ).toBeGreaterThan(500);
    }
  });

  for (const [f, known] of Object.entries(KNOWN)) {
    it(`${f} に新しい読めない文字色が無い`, () => {
      /* コメントは除く（「以前は text-red-400 だった」と書けるように）。
         hover: / group-hover: / dark: の付いたものと、地・枠（bg- /
         border-）は対象にしない。禁じているのは常時見える文字だけ。 */
      const src = readFileSync(join(process.cwd(), f), "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      const hits = UNREADABLE_TEXT_STEPS.filter((step) =>
        new RegExp(`(?<![\\w:/-])text-${step}(?:/\\d+)?(?![\\w-])`).test(src),
      );
      const added = hits.filter((h) => !known.includes(h));
      expect(
        added,
        `${f} で白地に読めない文字色を新しく使っている: ${added.join(", ")}\n` +
          "地色（bg-）としてなら薄い段は正しい。禁じているのは文字だけ。" +
          "濃い段（600〜800）に替えること。",
      ).toEqual([]);

      // 直したのに表から消し忘れる、を防ぐ。**残っていないものが
      // 残っていることになっていると、次に読む人が無駄に探す。**
      const stale = known.filter((k) => !hits.includes(k));
      expect(
        stale,
        `${f} は既に直っている: ${stale.join(", ")}。KNOWN から消すこと。`,
      ).toEqual([]);
    });
  }
});

describe("2 系統の色", () => {
  it("判定・操作・注意と重なっていない", () => {
    // 暦の側と天文の側を色で分けるのは装飾ではなく分類なので残すが、
    // 判定の緑・赤や操作の indigo と重なると意味が濁る。
    const taken = new Set<string>([
      ...RESERVED_JUDGEMENT_HUES,
      ACCENT_HUE,
      WARN_HUE,
      NEUTRAL_HUE,
    ]);
    for (const hue of Object.values(SYSTEM_HUES)) {
      expect(taken.has(hue), `${hue} は他の役割で使われている`).toBe(false);
    }
    expect(new Set(Object.values(SYSTEM_HUES)).size).toBe(
      Object.keys(SYSTEM_HUES).length,
    );
  });
});
