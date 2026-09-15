import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  地図の見出しは、**その地図が実際に出しているもの**を言う。

  ## 何が起きていたか（2026-09-15 の実測）

  ダッシュボードの「2. 目的地と環境」を 400px で描いて見たところ、方位の
  地図の見出しが

      [稼働環境] 地磁気・太陽風ベクター観測

  だった。**地磁気も太陽風も、この地図は表示していない。**出しているのは
  出発地から見た八方位の扇形と、その吉凶。

  実害は 2 つ。

  1. **何ができる地図なのか読んでも分からない。**タブの中でいちばん大きい
     部品なのに、見出しが道案内にならない
  2. **測っていないものを測っているように見せている。**CLAUDE.md 4 節の
     「疑似物理の文言を増やさない」に触れる

  ## 見張ること

  地図の部品が「観測」「ベクター」「稼働環境」のような、**計器の言葉**を
  見出しに使っていないこと。凡例や注記で地磁気に触れるのは構わない
  （偏角の断りなど実際に出しているもの）。見るのは**見出しだけ**。
*/

const MAPS = [
  "src/components/TacticalMagneticMap.tsx",
  "src/components/MagneticMapInner.tsx",
  "src/components/ArbitrageMapInner.tsx",
];

/** 計器めいた言い方。見出しに出たら落とす。 */
const INSTRUMENT_WORDS = [
  "稼働環境",
  "ベクター観測",
  "太陽風ベクター",
  "観測システム",
];

function headings(src: string): string[] {
  const out: string[] = [];
  /* JSX の見出しタグの中身。属性は跨がない */
  for (const m of src.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/g)) {
    const text = m[1]
      /* 中の JSX 式とコメントは落とす。文言だけを見る */
      .replace(/\{[\s\S]*?\}/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push(text);
  }
  return out;
}

describe("地図の見出しが中身と合っている", () => {
  it("見張りが空回りしていない（見出しを拾えている）", () => {
    const hs = headings(readFileSync(join(process.cwd(), MAPS[0]), "utf8"));
    expect(hs.length).toBeGreaterThan(0);
    expect(hs).toContain("目的地の方位");
  });

  it("計器の言葉を見出しに使っていない", () => {
    const offenders: string[] = [];
    for (const rel of MAPS) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      for (const h of headings(src)) {
        for (const w of INSTRUMENT_WORDS) {
          if (h.includes(w)) offenders.push(`${rel}: ${h}（${w}）`);
        }
      }
    }
    expect(
      offenders,
      `地図の見出しに計器の言葉:\n${offenders.join("\n")}\n` +
        "その地図が実際に出しているものを言うこと",
    ).toEqual([]);
  });

  it("見出しに uppercase を掛けていない（日本語に効かず、計器めいて見える）", () => {
    const src = readFileSync(join(process.cwd(), MAPS[0]), "utf8");
    const m = src.match(/<h2[^>]*>[\s\S]*?目的地の方位/);
    expect(m, "見出しが見つからない").not.toBeNull();
    expect(m![0]).not.toContain("uppercase");
  });
});
