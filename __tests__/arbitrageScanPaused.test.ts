import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * 「検索を止めている」ことを画面に出す。
 *
 * ## なぜ
 *
 * 県も半径も未指定でズーム 10 未満のとき、fetchData は要求を投げずに
 * 戻る。全国 45 万行の名寄せ（実測 18.4 秒）を避けるための意図した
 * 打ち切りだが、**その事実が画面のどこにも出ていなかった。**
 *
 * 利用者の報告：「俯瞰からズームしていくのですが、物件が表示されず
 * 0 のままのことが多々ある」。俯瞰（ズーム 5）から段階的に拡大すると、
 * ズーム 10 を越えるまでは検索が走らないので、0 件に見える。**0 件
 * なのではなく、検索していない。**
 *
 * 直したのは伝え方と逃げ道だけで、**判定も検索の条件も変えていない。**
 *
 * - 止めているあいだは理由を出す
 * - それでも検索したい人のために、打ち切りを飛ばす口（force）を置く
 *
 * ## 何を見るか
 *
 * 画面の文言そのものではなく、**壊れると黙って戻る 3 点**を見る。
 * 打ち切りの条件と表示の条件が食い違うと、また「理由の無い 0 件」に
 * 戻るので、両方が同じ 4 つの条件で書かれていることも見る。
 */
const PAGE = readFileSync(
  join(__dirname, "../src/app/relocation/arbitrage/page.tsx"),
  "utf8",
);

describe("俯瞰で検索を止めているとき、その理由を出す", () => {
  it("fetchData は force で打ち切りを飛ばせる", () => {
    /* 2026-09-11 から、走査の本体は runScan で、fetchData は 1 本ずつ
       走らせる列（lib/latestWinsQueue）へ渡す口。下の describe を見ること */
    expect(PAGE).toMatch(
      /const runScan = async \(isDateChange = false, force = false\)/,
    );
    /* 打ち切りの入口に !force が無いと、押しても何も起きない */
    expect(PAGE).toMatch(
      /if \(!force && shouldPauseScan\(\{ prefecture, radiusKm \}, mapBounds\)\)/,
    );
  });

  it("止めている状態を画面へ出す派生値がある", () => {
    expect(PAGE).toMatch(/const scanPaused =/);
    /* **打ち切りと同じ関数から引く。**以前は同じ 4 条件が 2 か所に
       並んでいて、片方だけ変えると「理由の無い 0 件」へ戻る作りだった。
       条件そのものは `shouldPauseScan` に 1 つだけ置く。 */
    /* 2026-09-11 から、API 側の止め（行数の上限）も同じ派生値に合流する。
       面積の条件そのものは今までどおり shouldPauseScan に 1 つだけ。 */
    expect(PAGE).toMatch(
      /const scanPaused =\s*serverPaused \|\| shouldPauseScan\(\{ prefecture, radiusKm \}, mapBounds\);/,
    );
  });

  it("止めているあいだ、理由と検索の口を描く", () => {
    expect(PAGE).toMatch(/\{scanPaused && !loading && \(/);
    expect(PAGE).toContain("この倍率では物件を検索していません");
    /* 逃げ道。force を渡していないと打ち切られて何も起きない */
    expect(PAGE).toMatch(/onClick=\{\(\) => fetchData\(false, true\)\}/);
  });

  it("広すぎる範囲は今までどおり止める（負荷を上げない）", () => {
    /* **ズームではなく面積で切る**ようにした（2026-09-10）。ズームは
       広さの代わりにならない——同じ zoom でも画面の縦横で写る範囲が
       何倍も違う。重さを決めるのは写っている面積（＝走査する行数）。

       上限 10,000 km² は db-explain の実測から置いた（名古屋・半径
       50km・愛知県の 126,800 行が 880ms）。関東全域のような範囲は
       今までどおり止めて、押した人だけが待つ。 */
    expect(PAGE).toMatch(
      /shouldPauseScan\([^)]*\)\)\s*\{\s*setLoading\(false\)/,
    );
    /* force を渡している呼び出し（第 2 引数がある形）は 1 か所だけ。
       fetchData(true) は日付変更の呼び出しなので数えない */
    const forced = PAGE.match(/fetchData\([^)]*,\s*true\)/g) ?? [];
    expect(forced).toEqual(["fetchData(false, true)"]);
  });

  it("API が行数の上限で止めたときも、同じ札と同じ口で出す（2026-09-11）", () => {
    /* 本番の実測で、面積の規則をすり抜けた radius=50 の走査が 25〜41 秒
       かかっていた（30 万行超）。#1178 で API が行数を数えてから走らせる
       ようにした。画面は force を送り、止めた応答（metadata.paused）を
       面積の止めと同じ札に合流させる。前の一覧は消さない（面積で止めた
       ときと同じ振る舞い）。 */
    expect(PAGE).toMatch(/if \(force\) params\.append\("force", "true"\)/);
    expect(PAGE).toMatch(/const serverPaused = metadata\?\.paused === true/);
    expect(PAGE).toMatch(/serverPaused \|\| shouldPauseScan\(/);
    expect(PAGE).toMatch(
      /if \(json\.metadata\?\.paused !== true\) setData\(json\.properties \|\| \[\]\)/,
    );
  });
});

describe("走査は 1 本ずつ（2026-09-11）", () => {
  /* 本番の実測で、遅い走査は全部が 1〜2 秒差の対だった（同じ走査が
     2 本、DB で同時に走っていた）。fetchData は列へ渡す口だけにして、
     本体（runScan）は列からしか呼ばれない形を見張る。 */
  it("fetchData は列に渡し、走らせる時点の runScan を呼ぶ", () => {
    expect(PAGE).toMatch(
      /const \[scanQueue\] = useState\(\(\) => createLatestWinsQueue\(\)\)/,
    );
    expect(PAGE).toMatch(
      /const fetchData = \(isDateChange = false, force = false\) =>\s*scanQueue\.request\(\(\) => runScanRef\.current\(isDateChange, force\)\)/,
    );
  });

  it("runScan を直接呼ぶ所が無い（列を飛ばすと 2 本同時に走る）", () => {
    const direct = PAGE.match(/[^.\w]runScan\(/g) ?? [];
    expect(direct).toEqual([]);
    /* ref への代入は render 中ではなく effect の中 */
    expect(PAGE).toMatch(
      /useEffect\(\(\) => \{\s*runScanRef\.current = runScan;\s*\}\);/,
    );
  });
});
