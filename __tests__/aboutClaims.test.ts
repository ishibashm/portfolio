import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `/about` が書いている「この道具が何をするか」を、実装に突き合わせる。
 *
 * ## なぜ要るか
 *
 * 案内文とコードが食い違う事故が実際に起きている（#137 は、コードが既に
 * 正しいのに案内文だけが古かった例）。散文は tsc も lint も守ってくれない。
 *
 * `/about` に足した節は、次の 2 つを**実装の事実として**主張している。
 *
 *   1. 「各ページの上部に『この設定でこの方位を出しています』と表示します」
 *      → 道具の 5 画面に ActiveProfileBadge が置かれていること
 *   2. 「判定の基準は常に真北」
 *      → 判定を磁北に変えたらこの行は嘘になる
 *
 * どちらも**画面を開いても気付けない**（/about だけ見ても正しそうに読める）。
 *
 * ## 移り変わる数字を書かせない
 *
 * 「掲載を集計できた市区町村は 1,149」のような数は毎晩の巡回で動くので、
 * 静的な案内文に書くと確実に古くなる。CLAUDE.md 4 節の「残数は必ず実測して
 * から言う」と同じ問題で、実際に市区町村ページの残数を 2 回間違えている。
 * ここでは**桁区切りのある数を書けない**ようにしておく。
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ABOUT = "src/app/about/page.tsx";

/** 「使用中のプロフィール」の帯を出す画面。/about がこれを前提に書いている。 */
const TOOL_PAGES = [
  "src/app/relocation/arbitrage/page.tsx",
  "src/app/relocation/simulator/page.tsx",
  "src/app/relocation/timing/page.tsx",
  "src/app/relocation/wealth/page.tsx",
  "src/app/houi/page.tsx",
];

/** 桁区切りのある数（1,022 / 1,149 など）。 */
const GROUPED_NUMBER = /\d{1,3}(?:,\d{3})+/;

/**
 * 帯の JSX タグ。**字面の contains では足りない。**
 * `<ActiveProfileBadge` は `<ActiveProfileBadgeFoo` にも含まれるので、
 * 名前を変えただけの版が素通りした（この検査を書いたときに実際に起きた）。
 * タグの終わりまで見る。
 */
const BADGE_TAG = /<ActiveProfileBadge[\s/>]/;

describe("/about が書いていること", () => {
  it("節そのものがある（この検査が空回りしていない）", () => {
    const src = read(ABOUT);
    expect(src).toContain("決めるために、この道具が何をするか");
    expect(src).toContain("前提を1つに固定する");
  });

  it("「各ページの上部に表示します」の主張どおり、道具の5画面に帯がある", () => {
    const missing = TOOL_PAGES.filter((p) => !BADGE_TAG.test(read(p)));

    expect(missing).toEqual([]);
    // 主張している文言の側も残っていること。片方だけ消えると食い違う。
    expect(read(ABOUT)).toContain("この設定でこの方位を出しています");
  });

  it("「判定の基準は常に真北」と書いてある", () => {
    // 磁北へ変える判断をしたら、この行を直さないとここで落ちる。
    expect(read(ABOUT)).toContain("判定の基準は常に真北");
  });

  it("移り変わる数字（桁区切りのある数）を書いていない", () => {
    const src = read(ABOUT);
    const hit = src.match(GROUPED_NUMBER);

    expect(hit, `/about に ${hit?.[0]} がある`).toBeNull();
  });

  it("桁区切りと帯を見つけられる（検査が効いていることの確認）", () => {
    expect("市区町村は 1,149 件".match(GROUPED_NUMBER)?.[0]).toBe("1,149");
    expect("1022 頁".match(GROUPED_NUMBER)).toBeNull();

    expect(BADGE_TAG.test('<ActiveProfileBadge purpose="x" />')).toBe(true);
    expect(BADGE_TAG.test("<ActiveProfileBadge/>")).toBe(true);
    // 名前を変えただけの版を通さない。
    expect(BADGE_TAG.test("<ActiveProfileBadgeXX />")).toBe(false);
  });
});
