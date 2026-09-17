import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 六曜を画面に出す所が、ローマ字の併記を落としてから描いていること。
 *
 * `getRokuyo` は `"大安 (Taian)"` の形で返す（内部表現。#1335）。API の
 * `DayVerdict.rokuyo` もこの形で届く。実際に叩いて確かめた:
 *
 *     rokuyo = "大安 (Taian)"   tags = ["大安"]
 *
 * `DayCellPopover` は `day.rokuyo` と `day.tags` を並べて出すので、
 * 「大安 (Taian) / 大安」と**二重**に見えていた。`TargetDateAdvice` も
 * 「2026-09-20・大安 (Taian)」。日本語の画面にローマ字が出る。
 *
 * 落とす口は `lib/rokuyoLabel` の `plainRokuyo` 1 つ（#1335。utils/lunar
 * からは再輸出。暦エンジンを画面に乗せないため葉に置いた）。ここでは
 * **描く側がそれを通しているか**を見る。`.rokuyo` を JSX の式として
 * 素のまま置いたら落ちる。
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** JSX の中で `{…rokuyo}` を素のまま描いている形。 */
const RAW_RENDER = /\{[a-zA-Z.]*\.rokuyo\}/;
/** テンプレート文字列に素のまま入れている形。 */
const RAW_TEMPLATE = /\$\{[a-zA-Z.]*\.rokuyo\}/;

describe.each([
  "src/components/relocation/DayCellPopover.tsx",
  "src/components/relocation/TargetDateAdvice.tsx",
  /* 物件検索の暦。初回読み込みに乗るので、葉（lib/rokuyoLabel）から引く */
  "src/components/realestate/AstroGridCalendar.tsx",
])("%s", (file) => {
  const src = read(file);

  it("六曜は plainRokuyo を通してから描く", () => {
    expect(src).toContain('import { plainRokuyo } from "@/lib/rokuyoLabel"');
    expect(src).toMatch(/plainRokuyo\([a-zA-Z.]*\.rokuyo\)/);
  });

  it("素のまま描いていない", () => {
    expect(src).not.toMatch(RAW_RENDER);
    expect(src).not.toMatch(RAW_TEMPLATE);
  });
});
