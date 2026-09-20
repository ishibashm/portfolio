import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  地図に重ねる札の置き場。

  2026-09-16 に、狭い画面で「この範囲の候補 N 件」の札が右下の
  「方位の吉凶」の凡例の裏に隠れていた（400px で 142 × 34px が重なる）。
  そのときの決め「下の段は凡例のもの」の見張りがここにあったが、
  候補数の札は 2026-09-20 に物件の描画ごと消えた。残るのは凡例の
  畳み方だけ。**上の段に新しい札を足すときは、この決めを思い出すこと。**
*/

/*
  右下の凡例は、狭い画面では「凡例 ▾」に畳む（Task #52。2026-09-17）。

  400px では左下の俯瞰の段（198px）と右下の凡例（208px）が両方 bottom-4
  で、368px の幅に収まらず 74px 重なっていた。以前ここにあった「候補数の
  札を下に置かない」見張りは、札ごと消えた（2026-09-20。物件を描かない）
  ので外した。

  決め: sm 未満は押し口だけを出し、開いたときは俯瞰の段の上に重なってよい
  （開いた人は凡例を見たい）。中身の 2 通りは変えない。
*/
describe("狭い画面では、右下の凡例を畳む", () => {
  const SRC = readFileSync(
    join(process.cwd(), "src/components/ArbitrageMapInner.tsx"),
    "utf8",
  );

  it("押し口は sm 未満だけに出て、開閉が読み上げでも分かる", () => {
    expect(SRC).toMatch(/aria-expanded=\{legendOpen\}/);
    const toggle = SRC.match(
      /aria-expanded=\{legendOpen\}\s*className="([^"]*)"/,
    );
    expect(toggle, "押し口の className が見つからない").toBeTruthy();
    expect(toggle![1]).toMatch(/\bsm:hidden\b/);
  });

  it("中身は既定で畳み、sm 以上では常に出る", () => {
    expect(SRC).toContain('legendOpen ? "block" : "hidden sm:block"');
  });

  it("2 通りの中身は、それぞれ absolute で独立に置かれていない（器が 1 つ）", () => {
    const legends = [
      ...SRC.matchAll(/className="(absolute bottom-4 right-4[^"]*)"/g),
    ];
    /* 器の 1 つだけ。以前は 3 通りがそれぞれ absolute だった */
    expect(legends.length).toBe(1);
    expect(legends[0][1]).toMatch(/\bflex-col\b/);
  });
});
