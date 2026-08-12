import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * ホームと /calendar の日の点数が、何を根拠にしているか。
 *
 * この点数は九星の判定（gradeVerdict / noiseSeverity）とは別体系で、
 * 六曜・暦注・月相・日支から出している。そこに水星・金星・火星の逆行が
 * 混ざっていて、最大 22 点引いていた。逆行は西洋占星術の要素で、
 * docs/site-spec.md が「九星気学で統一する」と書いたテーマとは別の伝統。
 * 運営者に確認して、点数からは外した（表示は参考として残す）。
 *
 * 点数のロジックは非公開関数なので、実装の中身を読んで確かめる。
 * 見た目の話ではなく「何を根拠に点を出すか」の話なので、ここで止める
 * 価値がある。
 */

// 改行は CRLF。正規化しないと本体の切り出しに失敗し、ファイル全体を
// 読んでしまって常に通る（実際にそれで空回りさせかけた）。
const SOURCE = fs
  .readFileSync(
    path.join(process.cwd(), "src/components/widgets/CosmicCalendar.tsx"),
    "utf-8",
  )
  .split("\r\n")
  .join("\n");

/** calculateAlignmentScore の本体だけを切り出す。 */
function scoreBody(): string {
  const start = SOURCE.indexOf("function calculateAlignmentScore(");
  expect(start, "calculateAlignmentScore が見つからない").toBeGreaterThan(-1);
  const rest = SOURCE.slice(start);
  const end = rest.indexOf("\n}\n");
  // 見つからないと slice(0, -1) でファイル全部を読み、常に通ってしまう。
  expect(end, "関数の終わりが見つからない").toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe("日の点数の根拠", () => {
  it("切り出しが関数の本体だけを見ている", () => {
    const body = scoreBody();
    // ファイル全体を読んでいたら空回りする。長さで気付けるようにする。
    expect(body.length).toBeLessThan(SOURCE.length / 4);
    expect(body).toContain("let score = 60");
  });

  it("逆行を点数に使わない", () => {
    expect(scoreBody()).not.toMatch(/retrograde/i);
  });

  it("逆行を根拠にした助言も出さない", () => {
    // 「3つ以上の天体逆行が重なり…警戒期です」は点数と同じく判定。
    expect(SOURCE).not.toContain("3つ以上の天体逆行");
    expect(SOURCE).not.toContain("retrogradeCount");
  });

  it("暦の要素は残っている（点数を空にしたわけではない）", () => {
    const body = scoreBody();
    for (const k of ["大安", "仏滅", "isIchiryumanbai", "isTensho"]) {
      expect(body, k).toContain(k);
    }
  });

  it("逆行の表示は残し、点数に使っていないと書いてある", () => {
    // 消すのではなく、何に効いているかを画面で言う。
    expect(SOURCE).toContain("Planetary Retrogrades");
    expect(SOURCE).toContain("日の点数には使っていません");
  });

  it("この点数は九星の判定とは別物のまま（黙って混ぜない）", () => {
    // 混ぜるなら画面で意味を分けてから。今は分けていないので参照しない。
    for (const k of ["gradeVerdict", "noiseSeverity", "judgeDay"]) {
      expect(SOURCE, k).not.toContain(k);
    }
  });

  it("個人の要素を「誰にでも共通」の点数に混ぜない", () => {
    // 天中殺 −15 / 日破 −10 / 支合 +10 が入っていた。生年月日で変わる
    // ものが入ったままだと、同じ日でも人によって点が違うのに
    // 「暦の日取り（誰にでも共通）」と名乗ることになる。
    const body = scoreBody();
    expect(body).not.toContain("personalFortune");
    expect(body).not.toContain("isVoid");
    expect(body).not.toContain("isClash");
    expect(body).not.toContain("isHarmony");
  });
});

describe("意味の分け方が画面に出ている", () => {
  it("点数は「暦の日取り／誰にでも共通」と名乗る", () => {
    // 「適合度」だけでは何の適合か分からず、個人判定と区別も付かない。
    expect(SOURCE).toContain("暦の日取り");
    expect(SOURCE).toContain("誰にでも共通");
  });

  it("個人の判定を別枠で「生年月日から」と出す", () => {
    expect(SOURCE).toContain("あなたの日");
    expect(SOURCE).toContain("生年月日から");
  });

  it("生年月日が無いときは、無いと言う", () => {
    // 黙って共通の点だけ見せると、それが個人の判定だと読まれる。
    expect(SOURCE).toContain("生年月日を入れると");
  });

  it("方位の吉凶には出発地も要ると書き、時期分析へ送る", () => {
    expect(SOURCE).toContain("出発地も要ります");
    expect(SOURCE).toContain("/relocation/timing");
  });
});
