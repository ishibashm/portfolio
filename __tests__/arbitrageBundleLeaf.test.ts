import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "fs";
import { dirname, join, resolve } from "path";

/**
 * 物件検索（/relocation/arbitrage）の初回読み込みに、暦エンジンを
 * 乗せない。
 *
 * ## なぜ
 *
 * page.tsx が auspiciousDays / ephemerisEngine / kigakuContent を**値で**
 * import すると、lunar-javascript と astronomy-engine（gzip 約 135 KB、
 * 頁の JS の 4 割）が最初の描画に乗る。実際にそうなっていて、初回の
 * 読み込みが遅い、という利用者の報告の主因だった（backlog 17 節）。
 *
 * 判定は lib/dayKigakuClient を `import()` で遅延して呼ぶ形に変えた。
 * ただし**再発が簡単**で、ラベル 1 つを kigakuContent から取っただけで
 * 全部戻る（TransactionsPanel が実際にそうだった）。字面（grep）では
 * 経路を取りこぼすので（#552 の教訓）、import を辿って固定する。
 *
 * ## 何を見るか
 *
 * page.tsx から静的な値 import だけを辿り、lunar-javascript か
 * astronomy-engine に届く経路が無いこと。`import type` と `import()`
 * （動的）は辿らない。届いたら**経路を出して**落とす。
 */

const SRC = resolve(__dirname, "../src");
const HEAVY = ["lunar-javascript", "astronomy-engine"];

function resolveSpec(from: string, spec: string): string | null {
  let p: string;
  if (spec.startsWith("@/")) p = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) p = resolve(dirname(from), spec);
  else return null;
  for (const ext of [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".json",
    "/index.ts",
    "/index.tsx",
  ]) {
    if (existsSync(p + ext) && statSync(p + ext).isFile()) return p + ext;
  }
  return null;
}

/** 静的な値 import の specifier。`import type` と `import()` は除く。 */
function valueImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  const re =
    /^\s*(?:import|export)\s+(?!type\s)[^;]*?\bfrom\s+["']([^"']+)["']/gm;
  for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

function pathTo(
  file: string,
  target: string,
  stack: string[] = [],
  seen = new Set<string>(),
): string[] | null {
  if (seen.has(file)) return null;
  seen.add(file);
  for (const spec of valueImports(file)) {
    if (spec === target || spec.startsWith(`${target}/`))
      return [...stack, file, spec];
    const r = resolveSpec(file, spec);
    if (!r) continue;
    const found = pathTo(r, target, [...stack, file], seen);
    if (found) return found;
  }
  return null;
}

const PAGE = join(SRC, "app/relocation/arbitrage/page.tsx");

describe("物件検索の初回読み込みに暦エンジンが乗らない", () => {
  for (const target of HEAVY) {
    it(`page.tsx の値 import から ${target} に届かない`, () => {
      const found = pathTo(PAGE, target);
      expect(
        found,
        found
          ? `経路:\n  ${found.map((x) => x.replace(SRC, "src")).join("\n  → ")}`
          : "",
      ).toBeNull();
    });
  }

  /*
    静的な経路が無くても、置くだけでエンジンを読む部品がある。
    DirectionTierOverview は行が空なら null を返すが、置いた時点で
    その塊（honmeiYear → AstroEngine → lunar）を取りに行く。設定の無い
    利用者は判定を出せず行が空なので、描かないもののために 100 KB 超を
    読ませない（#883）。字面の検査だが、外れると再び黙って戻る。
  */
  it("DirectionTierOverview は行があるときだけ置く", () => {
    const text = readFileSync(PAGE, "utf8");
    expect(text).toMatch(
      /directionTierRows\.length > 0 && \(\s*<DirectionTierOverview/,
    );
  });

  it("この検査は経路を見つけられる（空回りしていない）", () => {
    /* 判定本体は当然エンジンに届く。ここが null なら辿り方が壊れている */
    const found = pathTo(
      join(SRC, "lib/dayKigakuClient.ts"),
      "lunar-javascript",
    );
    expect(found).not.toBeNull();
  });
});
