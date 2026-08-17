import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * **判定に磁北を選ぶ分岐が残っていないこと**を見張る。
 *
 * CLAUDE.md 3 節は「判定は必ず真北で行う。磁北は『方位磁針で測るとずれる』
 * 注意としてのみ使う」と決めている。ところが実装には
 *
 *   useTrueNorth ? 真北の方位 : 磁北の方位
 *
 * という分岐が**7 か所**あり、`useTrueNorth` の既定は偽だったので、
 * 既定では磁北基準で吉凶を出していた。潰した順に
 *
 *   #381  SolarTimeClock  targetDirection / 自動探索 / 目的地の状態表示
 *   #382  arbitrageAstro  物件検索の日別採点
 *   #382  municipalities-wealth  移住先マップの方位スコア
 *   この PR  SolarTimeClock  時期の最適化に渡す方位、
 *            wealthData / propertiesData の突き合わせ（4 か所）
 *
 * 1 か所ずつ潰したので、**次に足されたときに気付ける仕掛けが要る。**
 * 分岐は関数として切り出されておらず振る舞いで固定できないため、
 * 字面で見張る。
 *
 * 磁北そのものを禁じるものではない。`magneticDirection` を作ること・
 * 応答に載せること・画面に出すこと・DECLINATION_WARNING に使うことは
 * 今までどおり。**禁じるのは「どちらで判定するか」を選ぶ分岐だけ。**
 */

const ROOT = process.cwd();

/** 判定に関わるファイル。ここに足すときは、その理由も一緒に書くこと。 */
const WATCHED = [
  "src/components/SolarTimeClock.tsx",
  "src/components/home/DestinationMapPanel.tsx",
  "src/utils/arbitrageAstro.ts",
  "src/app/api/municipalities-wealth/route.ts",
  "src/app/api/rentals/arbitrage/route.ts",
  "src/app/api/rentals/arbitrage/timeline/route.ts",
];

/**
 * 「真北か磁北かを選ぶ三項演算子」を探す。
 *
 * コメントは落とす。経緯として旧実装を書き残してあるので、
 * 字面だけ見ると誤検知する。
 */
function magneticBranches(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  // 例: useTrueNorth ? w.direction : w.magneticDirection
  //     ctx.useTrueNorth ? ctx.direction : ctx.magneticDirection
  const pattern =
    /useTrueNorth[\s\S]{0,120}?\?[\s\S]{0,120}?:[\s\S]{0,120}?magneticDirection/g;
  return code.match(pattern) ?? [];
}

describe("判定に磁北を選ぶ分岐", () => {
  for (const file of WATCHED) {
    it(`${file}: 残っていない`, () => {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      const found = magneticBranches(source);
      expect(
        found,
        `判定の基準を選ぶ分岐が残っている。判定は真北で固定すること（CLAUDE.md 3 節）`,
      ).toEqual([]);
    });
  }

  it("この見張り方そのものが効くこと（空回りしていないこと）", () => {
    // 旧実装の字面を渡したら、ちゃんと拾えること。
    const legacy = `
      const targetDirection = useTrueNorth ? info.trueDirection : info.magneticDirection;
    `;
    expect(magneticBranches(legacy)).toHaveLength(1);

    // コメントの中の旧実装は拾わないこと。
    const inComment = `
      /*
        以前は useTrueNorth ? info.trueDirection : info.magneticDirection だった。
      */
      const targetDirection = info.trueDirection;
    `;
    expect(magneticBranches(inComment)).toEqual([]);
  });

  it("磁北そのものは禁じていない（注意と表示には使う）", () => {
    // DECLINATION_WARNING は真北と磁北を比べて出す。比較は残っていること。
    const wealth = fs.readFileSync(
      path.join(ROOT, "src/app/api/municipalities-wealth/route.ts"),
      "utf8",
    );
    expect(wealth).toContain("direction !== magneticDirection");
    expect(wealth).toContain("DECLINATION_WARNING");
  });
});
