import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  WEALTH_LEGEND_SAMPLES,
  parseWealthStatus,
  resolveWealthMarker,
} from "@/lib/wealthMapPresentation";

/**
 * 偏角の注意（DECLINATION_WARNING）を、真北と磁北がずれれば必ず出すように
 * した件の固定。
 *
 * 条件には余計なものが 2 つ付いていて、**ほぼ出せなかった。**
 *
 *   !useTrueNorth       「真北で見る人には出さない」という扱い。判定を
 *                       真北に固定した（#381・#382）ので、この条件のままだと
 *                       **誰にも出なくなる**
 *   astrologyScore<80   大吉・吉には出さない。ところが
 *                       lib/wealthMapPresentation.ts は凡例に
 *                       「OPTIMAL + DECLINATION_WARNING」を見本として持ち、
 *                       「大吉かつ偏角警告（大きい琥珀の点）」と説明している。
 *                       **API が返せない見本を凡例に載せていた。**
 *
 * 方位磁針で 7 度ずれて隣の凶方位に入るのは、むしろ吉方位を狙っているときに
 * 起きる事故なので、点数で絞る理由が無い。CLAUDE.md 3 節が磁北の唯一の用途と
 * して挙げているのがこの注意。
 *
 * ## ここで何を見張るか
 *
 * 条件はルートの中に直に書かれていて、関数として切り出されていない。
 * 振る舞いで固定できないので、**条件の字面**を見る。戻されたら落ちる。
 * あわせて「凡例の見本が API の返せる形か」を突き合わせる。
 */

const ROOT = process.cwd();

const ROUTES = [
  "src/app/api/municipalities-wealth/route.ts",
  "src/app/api/rentals/arbitrage/route.ts",
];

/**
 * DECLINATION_WARNING を push している if 文を取り出す。
 * コメントは落とす（経緯として旧条件を書いてあるため）。
 */
function warningCondition(source: string): string {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const idx = withoutComments.indexOf('astroFlags.push("DECLINATION_WARNING")');
  expect(idx, "DECLINATION_WARNING を push している箇所が無い").toBeGreaterThan(
    -1,
  );
  // push の直前の if 文（開き括弧まで遡る）
  const before = withoutComments.slice(0, idx);
  const ifIdx = before.lastIndexOf("if (");
  return before.slice(ifIdx);
}

describe("偏角の注意は真北と磁北がずれれば必ず出す", () => {
  for (const route of ROUTES) {
    const source = fs.readFileSync(path.join(ROOT, route), "utf8");
    const condition = warningCondition(source);

    it(`${route}: 真北と磁北の方位を比べている`, () => {
      expect(condition).toContain("direction !== magneticDirection");
    });

    it(`${route}: 表示の基準（useTrueNorth）で絞っていない`, () => {
      // 判定を真北に固定した以上、この条件が残っていると誰にも出ない。
      expect(condition).not.toContain("useTrueNorth");
    });

    it(`${route}: 点数（astrologyScore）で絞っていない`, () => {
      // 絞ると凡例の「大吉かつ偏角警告」を API が返せない。
      expect(condition).not.toContain("astrologyScore");
    });
  }

  it("凡例の見本は、いま API が返せる形になっている", () => {
    /*
      凡例は resolveWealthMarker から作られるので、見本の文字列は
      「API が astrologyStatus として返しうる形」でなければならない。
      大吉に偏角警告が付く組み合わせを、点数の条件で出せなくしていたのが
      今回の食い違い。
    */
    const samples = WEALTH_LEGEND_SAMPLES.map((s) => s.sample);
    expect(samples).toContain("OPTIMAL + DECLINATION_WARNING");

    for (const sample of samples) {
      const { status, flags } = parseWealthStatus(sample);
      // 吉凶の基準値は 1 つ、付帯フラグは 0 個以上。API の合成と同じ形。
      expect(status.length).toBeGreaterThan(0);
      expect(Array.isArray(flags)).toBe(true);
      // 凶方位は地図に出さないので、見本に凶は無い。
      expect(status.startsWith("NOISE")).toBe(false);
      // 見本はすべて点として描ける（描けない見本を凡例に置かない）。
      expect(resolveWealthMarker(sample)).not.toBeNull();
    }
  });

  it("大吉に偏角警告が付くと、琥珀の大きい点になる（凡例の説明どおり）", () => {
    const plain = resolveWealthMarker("OPTIMAL")!;
    const warned = resolveWealthMarker("OPTIMAL + DECLINATION_WARNING")!;

    expect(plain.fill).toBe("income");
    expect(warned.fill).toBe("#fbbf24");
    // 大吉のままなので大きさは変わらない（「大きい琥珀の点」）。
    expect(warned.radius).toBe(plain.radius);
  });
});
