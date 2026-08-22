import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 引越し先を試算する画面に、暗い地色を前提にした色が残っていないこと。
 *
 * この頁は明るい背景（`from-rose-50/80 via-stone-50 to-amber-50/50`）なのに、
 * 文字と塗りが暗い地色向けの段（`-400` や `-950/…`）のままだった。
 * 利用者から「配色が変」と指摘を受けている。実測（sRGB のコントラスト比、
 * 本文の下限は 4.5:1）:
 *
 * | どこ | 直す前 | 実測 | 直した先 | 実測 |
 * |---|---|---|---|---|
 * | 迂回ルートのボタン | `bg-indigo-950/80` + `text-indigo-700` | **1.10:1** | 白地 + `text-indigo-700` | 7.71:1 |
 * | 選択中の札 | `from-indigo-950/20 to-purple-950/20` | 地色 #cecbd3。`text-stone-500` が 2.99:1 | `bg-indigo-50/70` | 同 4.37:1 |
 * | 方位角の値 | `text-indigo-400` | 2.47:1 | `text-indigo-700` | 6.55:1 |
 * | Q値・滞在期間（吉） | `text-emerald-400` | **1.65:1** | `text-emerald-700` | 4.71:1 |
 * | 凶の表示 | `text-red-400` | 2.28:1 | `text-red-700` | 5.34:1 |
 * | 注意の表示 | `text-amber-400` | **1.46:1** | `text-amber-800` | 6.20:1 |
 *
 * いちばん悪い地色（それぞれの色の `-500/10` の帯）で測っている。
 *
 * `-400` は暗い地の上でこそ読める段で、明るい地では必ず落ちる。
 * 同じ事故は配色を直した過去の PR（#165・#168・#169）でも起きていて、
 * 「`dark:` 用の色が地色抜きで発火していた」と記録がある。ここで
 * 0 件を要求して、また混ざるのを止める。
 *
 * **他の頁にはまだ残っている**（`src/` 全体で 33 か所／10 ファイル。
 * `components/widgets/` は暗い地の画面なので数に入れていない）。
 * この頁だけ先に直したので、対象を広げるときはこの一覧も広げること。
 */

const PAGE = "src/app/relocation/simulator/page.tsx";
const SOURCE = readFileSync(join(process.cwd(), PAGE), "utf8");

/**
 * コメントを外した中身。直した経緯の説明に旧クラス名が出てくるので、
 * それを検出してしまわないようにする。
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** 明るい地の上で本文の下限を割る段。 */
const TOO_LIGHT = [
  "text-indigo-400",
  "text-emerald-400",
  "text-red-400",
  "text-amber-400",
  "text-rose-400",
];

/** 暗い地を前提にした塗り。明るい頁に載せるとくすんだ色になる。 */
const DARK_FILLS = ["indigo-950", "purple-950", "slate-950"];

describe("引越し先を試算する画面の配色", () => {
  it("走査対象を読めている（空回りしていない）", () => {
    expect(SOURCE.length).toBeGreaterThan(50_000);
  });

  it("明るい地に読めない文字色が無い", () => {
    /*
      素の includes で見る。前に空白か引用符が来る形だけを見ていたら、
      `selection:text-indigo-400` のような接頭辞つきを取りこぼした
      （わざと壊して確かめたときに通ってしまった）。
    */
    const hits = TOO_LIGHT.filter((c) => CODE.includes(c));
    expect(hits, `${hits.length} 件: ${hits.join(", ")}`).toEqual([]);
  });

  it("暗い地を前提にした塗りが無い", () => {
    const hits = DARK_FILLS.filter((c) => CODE.includes(c));
    expect(hits, `${hits.length} 件: ${hits.join(", ")}`).toEqual([]);
  });
});
