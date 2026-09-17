import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 「今日の方位と時刻を確かめる」で、判定の内部コードをそのまま画面に
 * 出さない。
 *
 * 総合スコアの札・表・詳細・物件の欄・予報の升目と、目的地タブの
 * 判定・予報の升目・吹き出しが `OPTIMAL` `VOID` `SAFE` のような
 * 内部コードを（`NOISE_` だけ剥いで）そのまま出していた（2026-09-13）。
 * サイトの呼び名は `lib/directionLabels` が唯一の対応表で、他の頁は
 * 「大吉」「天中殺方位」「平穏」と出す。同じ判定が頁をまたぐと別の
 * 言葉になっていた（site-spec の「同じものを別の言葉で呼ばない」）。
 *
 * ここでは字面で見る。`.replace("NOISE_", "")` は「コードを剥いで
 * そのまま出す」形の目印なので禁じ、状態を持つ変数を波括弧で直に
 * 出す形も禁じる。
 */
const FILES = [
  "src/components/home/ScorecardPanel.tsx",
  "src/components/home/DestinationMapPanel.tsx",
];

describe("dashboard は判定コードを directionLabels の日本語で出す", () => {
  for (const f of FILES) {
    it(`${f}: NOISE_ を剥いでそのまま出す形が無い`, () => {
      const body = readFileSync(f, "utf8");
      expect(body).not.toMatch(/\.replace\(\s*"NOISE_"/);
    });

    it(`${f}: 状態の変数を波括弧で直に出さない`, () => {
      const body = readFileSync(f, "utf8");
      expect(body).not.toMatch(
        /\{(?:detail|selectedTrendCell|m|item|rental)\.(?:astrology|classical|physicalIndep|physicalCoupled)?[sS]tatus\}/,
      );
      expect(body).not.toMatch(/<span>\{targetVectorStatus\}<\/span>/);
      expect(body).not.toMatch(/\$\{st\}/);
    });

    it(`${f}: directionLabelName を読んでいる`, () => {
      const body = readFileSync(f, "utf8");
      expect(body).toMatch(
        /import \{ directionLabelName \} from "@\/lib\/directionLabels"/,
      );
    });
  }
});

/*
  予報の升目の凡例（2026-09-17）。上の見張りは「変数を直に出す形」を見て
  いて、**凡例に手で書いた英語**は素通りしていた。

      OPTIMAL (大吉) / SAFE (吉) / TYPE I (Gou/Anken/Ha) / TYPE II (Bio) /
      VOID/NODE / WARNING / 天道 (Tendou) 回座

  しかも SAFE を「吉」と書いていた。共有の名前は「平穏」で、同じ画面の
  地図の凡例（MagneticMapInner）と食い違っていた。凡例は地図の凡例と
  同じ言葉にした。

  コメントに経緯として同じ語を書くので、**コメントを落としてから**見る。
*/
describe("目的地タブの予報の凡例は日本語", () => {
  const body = readFileSync(
    "src/components/home/DestinationMapPanel.tsx",
    "utf8",
  )
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it.each([
    "OPTIMAL (",
    "SAFE (",
    "TYPE I",
    "TYPE II",
    "VOID/NODE",
    "(Tendou)",
    "> WARNING",
    "OPTIMAL 以外",
  ])("%s を画面の文言に出していない", (token) => {
    expect(body).not.toContain(token);
  });

  it("凡例は地図の凡例と同じ言葉（平穏・五黄・暗剣・破）", () => {
    expect(body).toContain("平穏");
    expect(body).toContain("五黄・暗剣・破（大凶）");
    expect(body).toContain("本命・的殺（本命星から）");
  });
});
