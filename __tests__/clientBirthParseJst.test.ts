import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 画面側も生年月日を**日本時間として**読む。
 *
 * 素の `new Date("1990-01-02T05:30")` は時差の指定が無いので**端末の
 * タイムゾーン**で読まれる。日本より西の端末では前の日になり、節月の
 * 境目に生まれた人は本命星が変わる（物件検索の頁が同じ罠を踏んで
 * 直した経緯が `relocation/arbitrage/page.tsx` に書いてある）。
 *
 * サーバ側（/api/nba ほか）は #1092〜#1095 で日本時間として読むように
 * 揃えた。**画面が端末時刻のままだと、同じ人の画面とサーバで答えが
 * 割れる。**
 *
 * ここは字面の見張り。読み方そのものの検査は birthInstantJst.test.ts。
 */

/**
 * 寄せ終わったものから足していく。**まだ端末時刻で読んでいる画面**は
 * ここに載せない（載せると赤いままになり、見張りとして働かなくなる）。
 */
const FILES = [
  "src/components/SolarTimeClock.tsx",
  "src/components/TenchusatsuVisualizer.tsx",
];

describe("画面側も生年月日を日本時間で読む", () => {
  it("生年月日を素の new Date で読んでいない", () => {
    for (const rel of FILES) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code, rel).not.toMatch(/new Date\(birthDate\)/);
      expect(code, rel).not.toMatch(/new Date\(birthDateStr\)/);
    }
  });

  it("共通の読み方を使っている", () => {
    for (const rel of FILES) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src, rel).toContain("parseJapanDateTime");
    }
  });

  it("見張りが空回りしていない（対象を読めている）", () => {
    for (const rel of FILES) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src.length, rel).toBeGreaterThan(500);
      expect(src, rel).toMatch(/birthDate/);
    }
  });
});
