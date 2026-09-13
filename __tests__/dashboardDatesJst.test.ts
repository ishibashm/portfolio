import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 「今日の方位と時刻」の画面に出す日付・時刻は**日本時間**で読む。
 *
 * 部品の `getFullYear()` / `getMonth()` / `getDate()` / `getHours()` は
 * 端末のタイムゾーンで読む。判定と暦は日本時間で揃えてある
 * （CLAUDE.md 3 節）ので、日本より西の端末では、判定は日本時間の日、
 * 画面の札は端末の日、という食い違いになる。時計（ClockDisplay）だけ
 * Asia/Tokyo で描いていて、同じ画面のポータルの「次に動ける時刻」が
 * 端末の時刻だった。日付入力（目的地タブ）は端末の正午どうしで日の差を
 * 数えていたので、選んだ日の 1 日前が評価日になる。
 *
 * ここは字面で固定する。旧挙動（端末の getter）に戻すと落ちる。
 */
const FILES = [
  "src/components/home/HomePortal.tsx",
  "src/components/home/DestinationMapPanel.tsx",
  "src/components/SolarTimeTable.tsx",
  "src/components/PersonalProfileConfig.tsx",
  "src/components/BioMagneticDashboard.tsx",
];

/**
 * 日付の欄を組み立てる部品。日本時間の取り出し（getZonedDateTimeFields）
 * を必ず通っているはず、という向きの検査もこちらだけに掛ける。
 * PersonalProfileConfig と BioMagneticDashboard は日付を組み立てず、
 * 同期日時の 1 行だけなので「端末の getter を使わない」向きだけ見る。
 */
const BUILDS_DATE_FIELDS = new Set([
  "src/components/home/HomePortal.tsx",
  "src/components/home/DestinationMapPanel.tsx",
  "src/components/SolarTimeTable.tsx",
]);

describe("dashboard の日付・時刻は日本時間で読む", () => {
  for (const file of FILES) {
    it(`${file} に端末のタイムゾーンで読む getter が無い`, () => {
      const body = readFileSync(file, "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      expect(body).not.toMatch(
        /\.get(?:FullYear|Month|Date|Day|Hours|Minutes)\(\)/,
      );
      expect(body).not.toMatch(/\.setHours\(/);
      // toLocaleDateString / toLocaleTimeString は timeZone 無しだと端末の日付
      expect(body).not.toMatch(/\.toLocale(?:Date|Time)String\(\)/);
      if (BUILDS_DATE_FIELDS.has(file)) {
        expect(body).toMatch(/getZonedDateTimeFields\(/);
      }
    });
  }
});
