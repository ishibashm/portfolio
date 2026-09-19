/**
 * /relocation/timing の合流先が、同行者の欄の外にも効いていること。
 *
 * 利用者の指摘（2026-09-19）。合流先を神奈川県にしても、方位別サマリー・
 * 帯グラフ・ヒートマップは「最良の方位」を既定にしたままで、合流先は
 * 同行者を足して走査し直すまでページのどこにも効いていなかった。
 *
 * 判定には触らない。見張るのは次の 3 つ。
 * 1. 既定の方位（activeDir）が、表で押した方位 → 合流先への方位 →
 *    最良の方位、の順で決まること
 * 2. 合流先を変えたら、表で押した方位を戻すこと（残っていると既定が動かない）
 * 3. 合流先への方位を同行者と同じ関数（memberDirection）で引き、
 *    それが表の 8 行のどれかに必ず当たること
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { memberDirection } from "@/lib/partyTimeline";
import { PREFECTURE_CENTERS } from "@/lib/prefectureDirection";
import { ALL_DIRECTIONS } from "@/utils/auspiciousDays";

const PAGE = "src/app/relocation/timing/page.tsx";
const src = readFileSync(PAGE, "utf-8");

describe("時期ツールの合流先は同行者の欄の外にも効く", () => {
  it("既定の方位は 表で押した方位 → 合流先への方位 → 最良の方位 の順", () => {
    expect(src).toMatch(
      /const activeDir = focusDir \?\? destDir \?\? perDirection\[0\]\?\.dir \?\? null;/,
    );
  });

  it("合流先を変えたら、表で押した方位を戻す", () => {
    const m = src.match(
      /const changeDest = \(pref: string\) => \{([\s\S]*?)\n  \};/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).toContain("setFocusDir(null)");
  });

  it("合流先への方位は同行者と同じ関数で引く", () => {
    const m = src.match(
      /const destLeg = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).toContain("memberDirection(");
    // 表の行の印・ヒートマップの見出し・合流欄の 1 行。3 か所に出す
    expect(src).toContain("data-dest-row");
    expect(src).toContain("data-dest-direction");
    expect(src).toContain("への方位");
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
