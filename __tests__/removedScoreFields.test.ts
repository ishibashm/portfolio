import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 廃止したスコアの項目を、画面がまだ読んでいないこと。
 *
 * 本番で実際に起きた事故の再発防止。評価軸の廃止（#304〜#308）で API が
 * arbitrageScore / yieldScore / totalScore を返さなくなったのに、地図の
 * 吹き出しに `prop.yieldScore.toFixed(1)` が残っていた。undefined に
 * .toFixed() を呼ぶので、ピンを描いた瞬間に落ちる。
 *
 * **tsc は止められなかった。**lib/scoredProperty.ts の型にこれらの項目が
 * 残っていたため、型の上では存在することになっていた。型定義から消して
 * 初めて 8 か所の読み手が見つかった、という順序だった。
 *
 * 型を直したので同じ形では再発しないが、`any` 経由（page.tsx の
 * useState<any>、metadata、API の生の行）で読むと型は素通りする。
 * 字面でも止める。
 */

const REMOVED_FIELDS = [
  "arbitrageScore",
  "yieldScore",
  "totalScore",
  "axisCoverage",
  "axisMissing",
  "axisContributions",
  // 相場の統計と一緒に消した項目。?. で守られていると落ちない代わりに、
  // 「永久に出ない枠」として画面に残る。実際 1 か所残っていた。
  "localMedianSqmRent",
  "localSampleCount",
  "municipalityCount",
];

/** 判定と無関係の別機能。NBA は自前の totalScore を持っている。 */
const UNRELATED_DIRS = ["src/components/nba/"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      sourceFiles(p, out);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

describe("廃止したスコアの項目を画面が読んでいない", () => {
  const files = sourceFiles(join(process.cwd(), "src")).filter((f) => {
    const rel = relative(process.cwd(), f).split("\\").join("/");
    return !UNRELATED_DIRS.some((d) => rel.startsWith(d));
  });

  it("走査対象の .ts / .tsx を見つけている（空回りしていない）", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("読み出し（.field）が 1 件も無い", () => {
    const hits: string[] = [];
    for (const f of files) {
      const source = readFileSync(f, "utf8");
      const rel = relative(process.cwd(), f).split("\\").join("/");
      source.split("\n").forEach((line, i) => {
        // コメントは対象外。経緯の説明で名前が出るのは構わない。
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        for (const field of REMOVED_FIELDS) {
          if (code.includes(`.${field}`)) {
            hits.push(`${rel}:${i + 1}  ${line.trim()}`);
          }
        }
      });
    }
    expect(hits, `${hits.length} 件:\n${hits.join("\n")}`).toEqual([]);
  });
});
