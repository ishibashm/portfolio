import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findArea, neighboursByDirection } from "@/lib/areaContent";
import { housingFiguresFor, rentDiffPct } from "@/lib/housingSnapshot";
import type { HousingSnapshotData } from "@/lib/housingSnapshot";
import housingStats from "@/data/housingStats.json";
import {
  DIRECTION_LABELS,
  STAR_NAMES,
  STARS,
  getMonthDirections,
  getYearDirections,
} from "@/lib/kigakuContent";
import type { CompassDirection } from "@/utils/directionGeo";

/**
 * 公開記事 shinjuku-2027-directions-and-rent の数字を照合する。
 *
 * 方位ごとの表は、新宿区の方位別の頁（/houi/area/13104）と同じ
 * neighboursByDirection と housingFiguresFor（住宅・土地統計調査）を
 * 回した結果を書いている。統計の写しを差し替えたり方位の区切りを
 * 直したりすると記事だけが古くなるので、ここで突き合わせる。
 */

const SLUG = "shinjuku-2027-directions-and-rent";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");
const HOUSING = housingStats as HousingSnapshotData;
const origin = findArea("13104")!;
const originFig = housingFiguresFor(HOUSING, "13104");
const groups = neighboursByDirection(origin);

const OPEN: CompassDirection[] = ["E", "SE", "SW", "W", "NW"];
const CLOSED: CompassDirection[] = ["N", "NE", "S"];

/** 記事の地名（都内は区市名だけ、他県は県名つき）を area.full に戻す */
const full = (name: string) =>
  /^(埼玉|千葉|神奈川)県/.test(name) ? name : `東京都${name}`;
const fmtPct = (n: number) => (n > 0 ? `+${n}%` : `${n}%`);

function section(heading: string): string {
  const start = md.indexOf(heading);
  expect(start, heading).toBeGreaterThan(-1);
  const end = md.indexOf("\n#", start + heading.length);
  return md.slice(start, end === -1 ? undefined : end);
}

function tableRows(text: string): string[][] {
  return text
    .split("\n")
    .filter(
      (l) =>
        l.startsWith("| ") &&
        !l.startsWith("| 市区町村") &&
        !l.startsWith("| ---"),
    )
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((s) => s.trim()),
    );
}

function yearGoodStars(dir: string): string {
  return STARS.filter((s) =>
    getYearDirections(2027, s).verdicts.some(
      (v) => v.kind === "good" && v.jp === dir,
    ),
  )
    .map((s) => STAR_NAMES[s])
    .join("・");
}

describe(`記事 ${SLUG} の数字`, () => {
  it("新宿区の家賃と 1 戸の目安", () => {
    expect(md).toContain(`${originFig!.rentPerSqm!.toLocaleString()} 円/㎡`);
    expect(md).toContain(
      `1 戸の目安 ${originFig!.monthlyRentEstimate!.toLocaleString()} 円`,
    );
    expect(md).toContain(`${originFig!.floorAreaPerRental} ㎡`);
  });

  it.each(OPEN)("%s: 見出しの本命星と表の街・距離・家賃", (d) => {
    const jp = DIRECTION_LABELS[d];
    const t = section(`### ${jp}（`);
    expect(t.split("\n")[0]).toBe(`### ${jp}（${yearGoodStars(jp)}）`);
    const rows = tableRows(t);
    expect(rows.length).toBeGreaterThan(0);
    // 近い順の先頭から、飛ばさずに載せている
    rows.forEach((r, i) => {
      const n = groups[d][i];
      const f = housingFiguresFor(HOUSING, n.code);
      expect(full(r[0])).toBe(n.full);
      expect(r[1]).toBe(`${n.distanceKm}km`);
      expect(r[2]).toBe(f!.rentPerSqm!.toLocaleString());
      expect(r[3]).toBe(f!.monthlyRentEstimate!.toLocaleString());
      expect(r[4]).toBe(fmtPct(rentDiffPct(originFig, f)!));
    });
  });

  it.each(CLOSED)("%s: 2027 年の年盤でどの星にも凶", (d) => {
    for (const s of STARS) {
      const v = getYearDirections(2027, s).verdicts.find(
        (x) => x.direction === d,
      );
      expect(v?.kind, `${STAR_NAMES[s]} ${d}`).toBe("bad");
    }
    const jp = DIRECTION_LABELS[d];
    const t = section("## 2027 年に塞がる 3 方位");
    const r = tableRows(t).find((x) => x[0] === jp)!;
    // 名前は本命殺などが重ならない星（五黄土星）で見る
    const label = getYearDirections(2027, 5).verdicts.find(
      (x) => x.direction === d,
    )!.label;
    expect(r[1]).toBe(label);
    for (const m of r[2].matchAll(/([^・（]+)（(\d+)km）/g)) {
      const n = groups[d].find((x) => x.full === full(m[1]));
      expect(n, m[1]).toBeDefined();
      expect(n!.distanceKm).toBe(Number(m[2]));
    }
  });

  it("2027 年 4 月に両方吉になるのは南西（二黒・五黄・八白）と南東（六白・七赤・九紫）", () => {
    const both = (s: number) => {
      const y = getYearDirections(2027, s)
        .verdicts.filter((v) => v.kind === "good")
        .map((v) => v.jp);
      return getMonthDirections(2027, 4, s)
        .verdicts.filter((v) => v.kind === "good" && y.includes(v.jp))
        .map((v) => v.jp);
    };
    const sw = STARS.filter((s) => both(s).includes("南西"));
    const se = STARS.filter((s) => both(s).includes("南東"));
    expect(sw).toEqual([2, 5, 8]);
    expect(se).toEqual([6, 7, 9]);
    const other = STARS.flatMap(both).filter(
      (d) => d !== "南西" && d !== "南東",
    );
    expect(other).toEqual([]);
  });
});
