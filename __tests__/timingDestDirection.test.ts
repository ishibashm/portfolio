/**
 * /relocation/timing の合流先は、**既定の方位を決めない。**
 *
 * 利用者の指摘（2026-09-20）。方角が凶でない日付を選んでから移動する
 * 方角を決めるのであって、合流先を先に決めるのは順序が逆。それまでは
 * 合流先への方位を既定にしていた（2026-09-19 の指摘「合流先が頁の
 * どこにも効いていない」への手当て）。合流先は**表の行の印**として
 * だけ残し、日付の一覧（data-party-dates / data-solo-dates）を先に置く。
 *
 * 判定には触らない。見張るのは次の 4 つ。
 * 1. 既定の方位（activeDir）が 表で押した方位 → 最良の方位 の順で、
 *    合流先への方位（destDir）を**含まない**こと
 * 2. 合流先を変えても、表で押した方位を戻さないこと（既定を動かさない
 *    ので戻す理由が無い）
 * 3. 合流先への方位を同行者と同じ関数（memberDirection）で引き、
 *    それが表の 8 行のどれかに必ず当たること（印の側は残る）
 * 4. 頁の並びが日付優先であること。全員ぶんの日付一覧が合流先の欄より
 *    先に、1 人ぶんの日付一覧が方位別サマリーより先にある
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { memberDirection } from "@/lib/partyTimeline";
import { PREFECTURE_CENTERS } from "@/lib/prefectureDirection";
import { ALL_DIRECTIONS } from "@/utils/auspiciousDays";

const PAGE = "src/app/relocation/timing/page.tsx";
const src = readFileSync(PAGE, "utf-8");

describe("時期ツールの合流先は既定の方位を決めない（日付が先）", () => {
  it("既定の方位は 表で押した方位 → 最良の方位 の順。合流先は入らない", () => {
    expect(src).toMatch(
      /const activeDir = focusDir \?\? perDirection\[0\]\?\.dir \?\? null;/,
    );
    expect(src).not.toMatch(/focusDir \?\? destDir/);
  });

  it("合流先を変えても、表で押した方位は戻さない", () => {
    const m = src.match(
      /const changeDest = \(pref: string\) => \{([\s\S]*?)\n  \};/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).not.toContain("setFocusDir");
  });

  it("日付の一覧が先、合流先の欄が後", () => {
    const partyDates = src.indexOf("data-party-dates");
    const destBlock = src.indexOf("data-party-destination");
    expect(partyDates).toBeGreaterThan(-1);
    expect(destBlock).toBeGreaterThan(partyDates);
    /* 1 人ぶんも同じ。日付の一覧が方位別サマリーより先 */
    const soloDates = src.indexOf("data-solo-dates");
    const perDirection = src.indexOf("方位別サマリー（未来の候補）");
    expect(soloDates).toBeGreaterThan(-1);
    expect(perDirection).toBeGreaterThan(soloDates);
  });

  it("合流先への方位は同行者と同じ関数で引く", () => {
    const m = src.match(
      /const destLeg = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).toContain("memberDirection(");
    // 表の行の印と合流欄の 1 行は残す（既定にはしないが、印としては出す）
    expect(src).toContain("data-dest-row");
    expect(src).toContain("data-dest-direction");
    expect(src).toContain("への方位");
    expect(src).not.toContain("この方位を既定にします");
  });

  it("どの出発地・どの合流先でも、方位は表の 8 行のどれかに当たる", () => {
    const rows = new Set<string>(ALL_DIRECTIONS);
    const bases = [
      { baseLat: 35.6895, baseLon: 139.6917 }, // 東京駅
      { baseLat: 43.0642, baseLon: 141.3469 }, // 札幌
      { baseLat: 26.2124, baseLon: 127.6809 }, // 那覇
      { baseLat: 34.6937, baseLon: 135.5023 }, // 大阪
    ];
    for (const base of bases) {
      for (const center of Object.values(PREFECTURE_CENTERS)) {
        expect(rows.has(memberDirection(base, center))).toBe(true);
      }
    }
  });
});
