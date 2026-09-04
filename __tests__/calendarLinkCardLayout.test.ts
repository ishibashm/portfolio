import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ホームの「引越しの日取りを選ぶ（暦カレンダー）」の札。
 *
 * ## 何が起きていたか（利用者の報告、2026-09-04）
 *
 * 狭い画面で説明が 2 行に折り返すと、右端の「開く →」が上下中央に
 * 来て、**文の途中に差し込まれたように見えていた**。
 *
 *     天赦日・一粒万倍日・天中殺と、方位の吉凶を月ごと  開く →
 *     に見ます。
 *
 * 横並び（flex-row）＋ items-center のまま、説明だけが折り返すため。
 * 幅が足りるときは横並びでよいので、**狭いときだけ縦に積む**。
 *
 * ## min-w-0 が要る理由
 *
 * flex の子は既定で中身より狭くならない（min-width: auto）。説明側に
 * min-w-0 が無いと、折り返す位置が器の幅で決まらず読めなくなる。
 * 同じ罠は他の札でも踏みやすいので、ここで固定しておく。
 */

const SOURCE = readFileSync(
  join(process.cwd(), "src/components/SolarTimeClock.tsx"),
  "utf-8",
);

/** 暦カレンダーの札の className だけを取り出す。 */
function cardClassName(): string {
  const at = SOURCE.indexOf('href="/calendar"');
  expect(at, "/calendar への札が見つからない").toBeGreaterThan(0);
  const rest = SOURCE.slice(at, at + 600);
  const m = /className="([^"]+)"/.exec(rest);
  expect(m, "札の className が読めない").not.toBeNull();
  return m![1];
}

describe("暦カレンダーの札", () => {
  it("狭い画面では縦に積む", () => {
    const cls = cardClassName();
    expect(cls).toContain("flex-col");
    /* 幅があるときは今までどおり横並び */
    expect(cls).toContain("sm:flex-row");
  });

  it("上下中央そろえは広い画面だけに掛ける", () => {
    /*
      素の items-center が残っていると、縦に積んだときも中央そろえに
      なって「開く →」が説明の真ん中に来る。戻すとこの検査が落ちる。
    */
    const cls = cardClassName();
    expect(cls).toContain("sm:items-center");
    expect(cls.split(/\s+/)).not.toContain("items-center");
    expect(cls.split(/\s+/)).not.toContain("justify-between");
    expect(cls).toContain("sm:justify-between");
  });

  it("説明側に min-w-0 が付いている", () => {
    const at = SOURCE.indexOf('href="/calendar"');
    const block = SOURCE.slice(at, at + 900);
    expect(block).toContain("min-w-0");
  });
});
