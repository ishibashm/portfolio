import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getClassicalMonthStar, getHonmeiStar } from "@/utils/ephemerisEngine";
import { calculateSolarTime } from "@/utils/solarTime";
import { parseJapanDateTime } from "@/utils/japanDate";

/**
 * /relocation/dashboard（SolarTimeClock）が本命星・月命星を**出生地の
 * 太陽時**から出していた件の固定。
 *
 * 変更前はこう書いていた。
 *
 *   const birthSolarData = calculateSolarTime(parseJapanDateTime(birthDate), birthLon);
 *   const honmeiStar = getHonmeiStar(birthSolarData.solarTime);
 *   const getsuMeiStar = getClassicalMonthStar(new Date(birthSolarData.solarTime));
 *
 * 太陽時は「経度差 4 分/度 + 均時差（±16 分）」ぶん瞬間をずらす。根室
 * （145.58 度）なら +42 分、石垣（124.16 度）なら −43 分。**立春や節入りの
 * 前後にその幅で生まれた人は、この頁だけ別の本命星になる。**
 * API（/api/nba・物件検索・timeline・履歴）と /houi は
 * `getHonmeiStar(parseJapanDateTime(birthDate))` で、経度を見ない。
 *
 * ここでは CLAUDE.md 3 節の手順どおり、
 *
 *   1. 旧実装を legacy* として写し、
 *   2. 新実装が API と同じ読み方（経度に依らない）であることを固定し、
 *   3. **旧実装だと落ちる**ことを、立春の境目を実際に探して示す
 *
 * の 3 つを置く。3 が無いと「何を変えたのか」を自分でも確かめられない。
 */

/** 変更前。**現行実装のどこからも呼ばれていない。** */
function legacyHonmei(birthDate: string, birthLon: number) {
  const d = parseJapanDateTime(birthDate);
  return getHonmeiStar(calculateSolarTime(d, birthLon).solarTime);
}
function legacyGetsumei(birthDate: string, birthLon: number) {
  const d = parseJapanDateTime(birthDate);
  return getClassicalMonthStar(
    new Date(calculateSolarTime(d, birthLon).solarTime),
  );
}

/** 変更後 ＝ API と同じ読み方。経度を受け取らない。 */
function current(birthDate: string) {
  return getHonmeiStar(parseJapanDateTime(birthDate));
}

/** 日本の東西の端。太陽時のずれがいちばん大きい所。 */
const LONS: Record<string, number> = {
  石垣: 124.16,
  根室: 145.58,
};

/** JST の年月日時分から parseJapanDateTime が読む文字列を組む。 */
function jstString(ms: number): string {
  const d = new Date(ms + 9 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** JST の (年, 2月, 日, 時, 分) を ms に。 */
const jst = (y: number, day: number, h: number, m = 0) =>
  Date.UTC(y, 1, day, h - 9, m, 0, 0);

/**
 * その年の立春（古典の本命星が切り替わる瞬間）を分の精度で探す。
 * 2/3 0:00 〜 2/5 23:59 JST のあいだで星が 1 回だけ変わる。
 */
function classicalBoundaryMs(year: number): number {
  let lo = jst(year, 3, 0);
  let hi = jst(year, 5, 23, 59);
  const before = current(jstString(lo)).classical;
  expect(current(jstString(hi)).classical, `${year} 年に境目が無い`).not.toBe(
    before,
  );
  while (hi - lo > 60000) {
    const mid = lo + Math.floor((hi - lo) / 2 / 60000) * 60000;
    if (current(jstString(mid)).classical === before) lo = mid;
    else hi = mid;
  }
  return hi;
}

const YEARS = Array.from({ length: 2035 - 1990 + 1 }, (_, i) => 1990 + i);

describe("本命星は出生地の太陽時でずらさない（dashboard）", () => {
  it("新実装は経度に依らず、API と同じ瞬間から出す", () => {
    // 読み方そのものは parseJapanDateTime ただ 1 つ。ここでは
    // 「経度を変えても答えが変わらない」形で固定する（API には経度の
    // 引数が無いので、これが API と同じであることの言い換え）。
    for (const y of YEARS) {
      const b = classicalBoundaryMs(y);
      for (const off of [-60, -30, -5, 0, 5, 30, 60]) {
        const s = jstString(b + off * 60000);
        const a = current(s);
        // 経度をどう変えても同じ（新実装は経度を受け取らない）。
        expect(a).toEqual(getHonmeiStar(parseJapanDateTime(s)));
      }
    }
  });

  it("旧実装は立春の前後で、出生地の経度によって本命星が割れる（空回りしていない）", () => {
    // 立春の境目の前後 45 分を 1 分刻みで見る。太陽時のずれ（根室 +42 分、
    // 石垣 −43 分、均時差 2 月上旬は約 −14 分）ぶんの幅で必ず割れる。
    let differing = 0;
    let checked = 0;
    const samples: string[] = [];
    for (const y of YEARS) {
      const b = classicalBoundaryMs(y);
      for (const [name, lon] of Object.entries(LONS)) {
        for (let off = -45; off <= 45; off++) {
          const s = jstString(b + off * 60000);
          checked++;
          if (legacyHonmei(s, lon).classical !== current(s).classical) {
            differing++;
            if (samples.length < 3) samples.push(`${name} ${s}`);
          }
        }
      }
    }
    /*
      46 年 × 2 地点 × 91 分 = 8,372 分のうち、実測で **1,575 分**が割れた
      （2026-09-12）。内訳はほぼ根室で、1 年あたり約 32 分。石垣は 2〜3 分。

      幅が経度差 4 分/度 から想像するより小さいのは、旧実装が
      `calculateSolarTime` の既定（`Math.round(経度 / 15)` でタイムゾーンを
      推測）を使っていたため。石垣は 8（標準子午線 120 度）、根室は 10
      （同 150 度）と推測され、経度差の補正が +16.6 分 / −17.7 分になる。
      それに 2 月上旬の均時差（約 −14 分）が乗って、石垣 +3 分・根室 −32 分。
      東京（139.69 度、推測 9）は +19 − 14 = +5 分。**どの土地でも 0 では
      ない**ので、下限は 1 年あたり 10 分に置く（実測の 3 分の 1）。
    */
    expect(checked).toBe(YEARS.length * 2 * 91);
    expect(differing, `割れた例: ${samples.join(" / ")}`).toBeGreaterThan(
      YEARS.length * 10,
    );
  });

  it("月命星も同じ（節入りの前後で旧実装が割れる）", () => {
    // 立春は節入りのひとつでもある。同じ境目で月命星も割れる。
    let differing = 0;
    for (const y of YEARS) {
      const b = classicalBoundaryMs(y);
      for (const lon of Object.values(LONS)) {
        for (let off = -45; off <= 45; off += 5) {
          const s = jstString(b + off * 60000);
          if (
            legacyGetsumei(s, lon) !==
            getClassicalMonthStar(parseJapanDateTime(s))
          ) {
            differing++;
          }
        }
      }
    }
    expect(differing).toBeGreaterThan(0);
  });

  it("SolarTimeClock が太陽時から本命星を出す書き方に戻っていない", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/SolarTimeClock.tsx"),
      "utf8",
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/birthSolarData/);
    expect(code).not.toMatch(/getHonmeiStar\(\s*calculateSolarTime/);
    expect(code).toMatch(/getHonmeiStar\(birthInstant\)/);
    expect(code).toMatch(/getClassicalMonthStar\(birthInstant\)/);
  });
});
