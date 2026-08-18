import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * **再輸出だけの入口を復活させない**ための見張り。
 *
 * `src/domains/` に 4 つあった。中身は `export { X } from "@/components/X"`
 * が並ぶだけで、実装は 1 行も無い。
 *
 * これがあると `dynamic(() => import("@/domains/metaphysical"))` のように
 * **入口ごと読み込む形が書けてしまい、束ねられた部品が全部同じチャンクに
 * 入る。**ホームは時計だけを描くのに 8 部品ぶんを配っていた（#392）。
 *
 *   JS 転送（gzip）  386,058 B → 142,951 B
 *   未使用 JS         70,567 B → 0 B
 *
 * 消した理由はもう 1 つある。**入口が死んだ部品を隠していた。**
 * `VolumetricBioMap` / `TacticalActionCommand` / `SubdomainLauncherGrid` は
 * 参照元が入口だけで、入口がある限り grep では「使われている」と見える。
 *
 * 部品をまとめたくなったら、**入口ではなく置き場所（ディレクトリ）で
 * まとめること。**
 */

const SRC = path.join(process.cwd(), "src");

/** そのファイルが「再輸出だけ」でできているか。 */
function isReexportOnly(file: string): boolean {
  const lines = fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));

  if (lines.length === 0) return false;
  return lines.every((l) => /^export\s+(\*|\{)[\s\S]*from\s+["']/.test(l));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("再輸出だけの入口", () => {
  it("src/ に増えていない", () => {
    const offenders = walk(SRC)
      .filter(isReexportOnly)
      .map((f) => path.relative(process.cwd(), f));

    expect(
      offenders,
      "再輸出だけのファイルは dynamic import で束ね読みを招く（#392）。" +
        "まとめたいならディレクトリでまとめること",
    ).toEqual([]);
  });

  it("src/domains は消えている", () => {
    expect(fs.existsSync(path.join(SRC, "domains"))).toBe(false);
  });

  it("この見張り方そのものが効くこと（空回りしていないこと）", () => {
    // 実際に消した入口の中身を渡したら、ちゃんと拾えること。
    const tmp = path.join(process.cwd(), "node_modules", ".barrel-probe.ts");
    fs.writeFileSync(
      tmp,
      [
        "// Metaphysical & Time Dynamics Subdomain Component Exports",
        "",
        `export { SolarTimeClock } from '@/components/SolarTimeClock';`,
        `export { SolarTimeTable } from '@/components/SolarTimeTable';`,
      ].join("\n"),
    );
    try {
      expect(isReexportOnly(tmp)).toBe(true);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("実装のあるファイルは拾わない", () => {
    // 再輸出を含んでいても、実装が 1 行でもあれば入口ではない。
    const tmp = path.join(process.cwd(), "node_modules", ".impl-probe.ts");
    fs.writeFileSync(
      tmp,
      [`export { helper } from "./helper";`, `export const VALUE = 1;`].join(
        "\n",
      ),
    );
    try {
      expect(isReexportOnly(tmp)).toBe(false);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
