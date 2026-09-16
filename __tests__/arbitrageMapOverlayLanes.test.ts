import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  物件検索の地図に重ねる札の置き場。

  ## 何が起きていたか（2026-09-16。利用者の実機）

  狭い画面で「この範囲の候補 N 件」の札が、右下の「方位の吉凶」の凡例の
  **裏に隠れていた。**400px で実測すると **142 × 34px が重なり**、左の
  31px しか見えていない。

  どちらも `bottom-4` に置いてあり、凡例は狭幅では横に広い（実測 222px）
  ので、**必ずぶつかる**。取り込み中の札（`bottom-14`）も凡例の縦の範囲
  （下から 16〜211px）の中にあり、同じく隠れていた。

  ## 決め — 下の段は凡例のもの

  狭い画面では

      上（top-*）   … 候補数・取り込み中
      下（bottom-*）… 方位の吉凶の凡例

  と段を分ける。**同じ段に 2 つ置かない。**

  上でも置き場は選ぶ。中央のままだと右上の「全画面／設定」に当たり
  （実測 x=233〜348 / y=19〜45）、`top-14` へ下げると設定を開いたときの
  操作の列に当たる（x≥218 で y≈62 から）。**左上なら両方を避けられる。**

  広い画面（lg 以上）は元から上の中央なので変えていない。

  ## 見張り方

  Tailwind の指定を読む。`lg:` の付かない（＝狭い画面に効く）`bottom-*`
  を、凡例以外の重ね札が持っていたら落とす。
*/

const MAP = "src/components/ArbitrageMapInner.tsx";

/** 重ね札を 1 つ取り出す。目印は中の文言。 */
function classOf(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `目印が見つからない: ${marker}`).toBeGreaterThan(-1);
  /* 目印の手前でいちばん近い className を拾う */
  const head = src.slice(0, at);
  const m = [...head.matchAll(/className=\{?`?"?([^"`}]*absolute[^"`}]*)/g)];
  expect(m.length, `className が見つからない: ${marker}`).toBeGreaterThan(0);
  return m[m.length - 1][1];
}

/** 狭い画面に効く bottom-*（`lg:` などが前に付かないもの）。 */
function mobileBottom(cls: string): string[] {
  return cls
    .split(/\s+/)
    .filter((c) => /^bottom-/.test(c) && !/^[a-z]+:/.test(c));
}

describe("狭い画面では、下の段は凡例のものにする", () => {
  const SRC = readFileSync(join(process.cwd(), MAP), "utf8");

  it("見張りが空回りしていない（札を取り出せている）", () => {
    expect(classOf(SRC, "この範囲の候補")).toContain("absolute");
    expect(classOf(SRC, "この範囲の物件を読み込み中")).toContain("absolute");
  });

  it("候補数の札は、狭い画面で下に置かない", () => {
    const cls = classOf(SRC, "この範囲の候補");
    expect(mobileBottom(cls), `凡例と同じ段に戻っている: ${cls}`).toEqual([]);
    expect(cls).toContain("top-4");
  });

  it("取り込み中の札も、狭い画面で下に置かない", () => {
    const cls = classOf(SRC, "この範囲の物件を読み込み中");
    expect(mobileBottom(cls), `凡例と同じ段に戻っている: ${cls}`).toEqual([]);
  });

  it("狭い画面では左に寄せる（中央だと全画面・設定に当たる）", () => {
    const cls = classOf(SRC, "この範囲の候補");
    expect(cls).toContain("left-4");
    /* 広い画面は元どおり中央 */
    expect(cls).toContain("lg:left-1/2");
    expect(cls).toContain("lg:-translate-x-1/2");
  });

  it("狭い画面では幅を抑える（右へ伸びて全画面の札に届く）", () => {
    const cls = classOf(SRC, "この範囲の候補");
    expect(cls).toMatch(/(^|\s)max-w-\[[^\]]+\]/);
    expect(cls).toContain("lg:max-w-[min(90%,22rem)]");
  });

  it("凡例は下のまま（段を明け渡していない）", () => {
    /*
      **目印に「方位の吉凶」を使わない。**同じ語がファイルの上の方の
      コメントにも出てくるので、`classOf` が拾うのは凡例ではなくそちらに
      なる（実際にそれで落ちた）。凡例そのものの指定を直に見る。

      凡例が下から離れたら、候補数を上へ逃がした理由が消える。そのときは
      この検査ごと考え直す（**片方だけ動かさない**）。
    */
    const legends = [
      ...SRC.matchAll(/className="(absolute bottom-4 right-4[^"]*)"/g),
    ].map((m) => m[1]);
    expect(legends.length, "右下の凡例が見つからない").toBeGreaterThan(0);
    for (const cls of legends) {
      expect(mobileBottom(cls), cls).not.toEqual([]);
    }
  });
});
