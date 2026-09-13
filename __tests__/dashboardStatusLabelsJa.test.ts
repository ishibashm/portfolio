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
