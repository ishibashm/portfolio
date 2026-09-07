import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseJapanDateTime } from "@/utils/japanDate";
import { getHonmeiStar } from "@/utils/ephemerisEngine";
import { baziEngine } from "@/utils/baziEngine";

/**
 * 生年月日時は**日本時間として**読む。
 *
 * `new Date("1985-02-04T05:00")` は時差の指定が無いので実行環境の
 * タイムゾーンで読まれる。本番（Cloud Run）は UTC なので、日本時間の
 * つもりで入れた時刻が 9 時間ずれた別人になっていた。
 *
 * ホームの生年月日は `datetime-local`（時刻まで入る）で、その文字列が
 * そのまま /api/nba に届く。同じ文字列を /api/relocation/nba-evaluate は
 * +09:00 を足して読んでいたので、**同じ人でも画面によって本命星と
 * 時柱が違っていた。**
 *
 * このテストは TZ=UTC で走る（vitest も CI も本番も UTC）。下の LEGACY
 * が直す前の読み方で、**戻すと落ちる**。
 */

/** 直す前の読み方。実行環境のタイムゾーンで読んでいた。 */
const legacyParse = (s: string) => new Date(s);

const TOKYO_LON = 139.7671;
const hourPillar = (d: Date) => {
  const p = baziEngine.calculate(d, TOKYO_LON).pillars.hour;
  return `${p?.gan ?? ""}${p?.zhi ?? ""}`;
};

describe("生年月日時を日本時間として読む", () => {
  it("時刻つきの文字列に +09:00 を足す", () => {
    expect(parseJapanDateTime("1985-02-04T05:00").toISOString()).toBe(
      "1985-02-03T20:00:00.000Z",
    );
    /* 直す前は 9 時間ずれていた */
    expect(legacyParse("1985-02-04T05:00").toISOString()).toBe(
      "1985-02-04T05:00:00.000Z",
    );
  });

  it("立春の境目に生まれた人の本命星が変わる（旧実装との差）", () => {
    const s = "1985-02-04T05:00";
    /* 節年の切り替わりをまたぐので、9 時間の差が本命星に出る */
    expect(getHonmeiStar(parseJapanDateTime(s)).classical).toBe(7);
    expect(getHonmeiStar(legacyParse(s)).classical).toBe(6);
  });

  it("時刻を入れた人の時柱が変わる（旧実装との差）", () => {
    const s = "1990-01-02T05:30";
    expect(hourPillar(parseJapanDateTime(s))).toBe("癸卯");
    expect(hourPillar(legacyParse(s))).toBe("丁未");
  });

  it("日付だけの文字列は今までどおり（答えを変えない）", () => {
    /* `YYYY-MM-DD` は仕様上 UTC の 0 時。日本時間では同じ日の 9 時に
       あたるので、年月日は日本時間で読んでも同じ日になる。ここを
       日本時間の 0 時に変えると、時刻を入れていない人の時柱が
       巳から子へ動いてしまう。**変えていないことを固定する。** */
    for (const s of ["1990-01-02", "1985-02-04", "2000-12-31"]) {
      expect(parseJapanDateTime(s).toISOString()).toBe(
        legacyParse(s).toISOString(),
      );
      expect(hourPillar(parseJapanDateTime(s))).toBe(
        hourPillar(legacyParse(s)),
      );
    }
  });

  it("時差の指定がある文字列はそのまま読む", () => {
    expect(parseJapanDateTime("1990-01-02T05:30:00Z").toISOString()).toBe(
      "1990-01-02T05:30:00.000Z",
    );
    expect(parseJapanDateTime("1990-01-02T05:30:00+09:00").toISOString()).toBe(
      "1990-01-01T20:30:00.000Z",
    );
  });
});

describe("読み方を 1 か所に寄せた（写しを増やさない）", () => {
  const ROUTES = [
    "src/app/api/nba/route.ts",
    "src/app/api/relocation/nba-evaluate/route.ts",
    "src/app/api/municipalities-wealth/route.ts",
    "src/app/api/rentals/arbitrage/route.ts",
    "src/app/api/rentals/arbitrage/timeline/route.ts",
    "src/app/api/relocation/history/route.ts",
    "src/app/api/relocation/export/route.ts",
  ];

  it("生年月日を読む API は parseJapanDateTime を使う", () => {
    for (const rel of ROUTES) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src, rel).toContain("parseJapanDateTime");
    }
  });

  it("時差を自分で足している写しが API に残っていない", () => {
    /* 同じ判定が 6 本に写されていて、api/nba だけが素の `new Date` に
       なっていた。**見張るのは名前ではなく規則のほう。**「無ければ
       今日」を兼ねる入口は名前を残してよいが、`+09:00` を自分で
       足しているならそれは写し。 */
    for (const rel of ROUTES) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      /* コメントは外して見る。**経緯を書くのは歓迎したい**ので、
         「なぜ寄せたか」を書いた文章まで禁じてしまわないようにする */
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code, rel).not.toContain("+09:00");
      expect(code, rel).not.toMatch(/new Date\(birthDateStr\)/);
    }
  });
});
