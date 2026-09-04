import { describe, expect, it } from "vitest";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { getPrefStats, prefNameByCode } from "@/lib/prefContent";
import { AREAS } from "@/lib/areaContent";
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";

/**
 * 都道府県ページの文章が「どの街がどの方位か」と書いたところを、
 * 頁と同じ計算で突き合わせる。
 *
 * 文章は手書きなので、方位を取り違えても誰も気付けない。しかも
 * **方位はページ本体が同じ市区町村を別の方位の欄に並べる**ので、
 * 食い違うと文章と表がその場で矛盾する。市区町村ページでは同じ
 * 突き合わせを areaEditorialDeadEnds.test.ts が既にやっている。
 *
 * 基準は頁と同じ: 県の面積重心からの大圏方位角を、気学の伝統区分
 * （四正 30 度・四隅 60 度）で切る。#552 の教訓どおり、字面で探すのでは
 * なく**計算に当てて**確かめる。
 */

const DIR_JP: Record<string, string> = {
  北: "N",
  北東: "NE",
  東: "E",
  南東: "SE",
  南: "S",
  南西: "SW",
  西: "W",
  北西: "NW",
};
const D = "北東|南東|南西|北西|北|東|南|西";

/** 「地名（…方位…）」を拾う。 */
const PAREN = /([一-龥ヶ]+(?:・[一-龥ヶ]+)*)（([^）]*)）/g;
/**
 * 括弧の中を「、」で割ったときの、方位だけの区切り。
 *
 * **区切りごとに厳密に見る**のが肝。括弧の中から方位の字面を拾うだけだと
 * 「東灘区」の東、「北広島」の北、「泉南」の南を方位と読んでしまい、
 * 正しい文章が 13 件も落ちた（この検査を書く途中で実際に起きた）。
 */
const DIR_SEG = new RegExp(
  `^(?:[県道]の(?:面積)?重心から見て)?(${D})(?:〜(${D}))?$`,
);
/** 括弧の中の、地名だけを並べた区切り（「大津・草津・栗東・野洲」）。 */
const NAME_SEG = /^[一-龥ヶ]+(?:・[一-龥ヶ]+)*$/;

interface Claim {
  pref: string;
  name: string;
  want: Set<string>;
}

function claims(): Claim[] {
  const out: Claim[] = [];
  for (const [code, editorial] of Object.entries(PREF_EDITORIAL)) {
    const pref = prefNameByCode(code);
    if (!pref) continue;
    for (const paragraph of editorial.intro) {
      for (const m of paragraph.matchAll(PAREN)) {
        const want = new Set<string>();
        const names = m[1].split("・");
        for (const seg of m[2].split("、")) {
          const dm = seg.match(DIR_SEG);
          if (dm) {
            want.add(DIR_JP[dm[1]]);
            if (dm[2]) want.add(DIR_JP[dm[2]]);
          } else if (NAME_SEG.test(seg)) {
            names.push(...seg.split("・"));
          }
        }
        if (want.size === 0) continue;
        for (const name of names) out.push({ pref, name, want });
      }
    }
  }
  return out;
}

/** 文章の地名が指す市区町村（「神戸市中央区」も「西宮」も引ける）。 */
function areasNamed(pref: string, name: string) {
  return AREAS.filter(
    (a) => a.pref === pref && (a.city === name || a.city.startsWith(name)),
  );
}

/**
 * 境目までの角度（度）。0 なら境目の真上。
 *
 * 市区町村ページ側（areaEditorialDirections.test.ts）と同じ考え方。
 * あちらは 2 つの代表点が動くが、こちらは**県の重心が静的**
 * （prefectureCenters.json）なので、動くのは市区町村の側だけ。
 */
const SECTOR_EDGES = [15, 75, 105, 165, 195, 255, 285, 345];
function degreesFromNearestEdge(bearing: number): number {
  return Math.min(
    ...SECTOR_EDGES.map(
      (e) => 180 - Math.abs(((bearing - e + 540) % 360) - 180),
    ),
  );
}

/**
 * 県の重心から見た、一晩の方位角の振れ（95 パーセンタイル。度）。
 *
 * **2026-09-04 実測**（前夜との差分、1,125 市区町村）。重心が静的な
 * ぶん市区町村ページより小さいが、**近い相手ほど大きい**という
 * 向きは同じ。
 *
 *     距離帯     n     中央    95%     99.9%
 *      2-20km   290   0.040   0.704   6.019
 *     20-40km   471   0.015   0.305   1.293
 *     40-80km   315   0.007   0.146   0.638
 *      80km+     46   0.005   0.038   0.046
 *
 * **2km より内側は方位を持たない。**佐賀県の多久市は重心から
 * 0.13km しかなく、一晩で 88.249 度動いた。重心のほぼ真上にある
 * 市区町村の「方位」は、その日の掲載が決めているだけで意味が無い。
 *
 * この検査には許容幅を置いていない（厳密一致）。**幅で逃がすより、
 * 境目に近い地名を書かないほうがよい。**市区町村ページ側の 3 度の
 * 許容幅は、実際に誤った文章を 1 件隠していた（#925 の別府市）。
 */
const DRIFT_P95: { maxKm: number; deg: number }[] = [
  { maxKm: 2, deg: Number.POSITIVE_INFINITY },
  { maxKm: 20, deg: 0.704 },
  { maxKm: 40, deg: 0.305 },
  { maxKm: Number.POSITIVE_INFINITY, deg: 0.25 },
];
function unstableToNameDeg(km: number): number {
  return DRIFT_P95.find((b) => km < b.maxKm)!.deg;
}

describe("PREF_EDITORIAL の方位が実データと合っている", () => {
  const all = claims();

  it("突き合わせる材料が集まっている（空回りしていない）", () => {
    expect(all.length).toBeGreaterThan(80);
    expect(
      all.filter((c) => areasNamed(c.pref, c.name).length > 0).length,
    ).toBeGreaterThan(80);
  });

  it("方位の取り違えが無い", () => {
    const bad: string[] = [];
    for (const c of all) {
      const areas = areasNamed(c.pref, c.name);
      if (areas.length === 0) continue; // 地域名（嶺北・幡多など）は引けない
      const stats = getPrefStats(c.pref);
      if (!stats) continue;
      const actual = new Set(
        areas.map((a) =>
          directionFromBearing(
            bearingBetween(stats.center.lat, stats.center.lon, a.lat, a.lon),
            "traditional",
          ),
        ),
      );
      if (![...actual].some((d) => c.want.has(d))) {
        bad.push(
          `${c.pref} ${c.name}: 文章=${[...c.want].join("|")} 実測=${[...actual].join("/")}`,
        );
      }
    }
    expect(bad).toEqual([]);
  });

  it("境目に近すぎる相手を、方位に縛っていない（下限は距離で決まる）", () => {
    /*
      厳密一致の検査なので、境目のすぐ上にある地名は**ふつうの一晩の
      振れで反転して CI を赤くする。**赤くなってから直すのでは、
      その間ずっと頁の一覧と文章が食い違っている。

      実際に 2 件あった（2026-09-04）。愛媛県の今治（重心から 52.8km、
      境目まで 0.168 度）と、広島県の福山（54.7km、0.237 度）。
      どちらも「東〜南東」のように**両隣を書く**形に直した。
      両隣を書いた記述は、どちらに転んでも正しいのでここでは見ない。
    */
    const bad: string[] = [];
    for (const c of all) {
      if (c.want.size > 1) continue; // 「東〜南東」は反転しても正しい
      const stats = getPrefStats(c.pref);
      if (!stats) continue;
      for (const a of areasNamed(c.pref, c.name)) {
        const km = distanceKmBetween(
          stats.center.lat,
          stats.center.lon,
          a.lat,
          a.lon,
        );
        const d = degreesFromNearestEdge(
          bearingBetween(stats.center.lat, stats.center.lon, a.lat, a.lon),
        );
        const floor = unstableToNameDeg(km);
        if (d < floor) {
          bad.push(
            `${c.pref} ${a.city}（${[...c.want].join("")}）: 重心から ${km.toFixed(1)}km 境目まで ${d.toFixed(3)}° 下限 ${floor}°`,
          );
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("その下限の検出が働いている（境目の真上と、重心の真上を拾う）", () => {
    /* 実在の組に固定しない。毎晩動く値に自己検査を縛ると、データが
       動いた晩に検査の側が落ちる（#925 でそれが起きた） */
    for (const edge of SECTOR_EDGES) {
      for (const b of [edge, (edge + 0.1) % 360, (edge - 0.1 + 360) % 360]) {
        expect(degreesFromNearestEdge(b)).toBeLessThan(0.25);
      }
    }
    for (const b of [45, 90, 135, 180, 225, 270, 315, 0]) {
      expect(degreesFromNearestEdge(b)).toBeGreaterThan(0.25);
    }
    /* 重心のほぼ真上は、どれだけ境目から離れていても縛れない */
    expect(unstableToNameDeg(0.13)).toBe(Number.POSITIVE_INFINITY);
    expect(unstableToNameDeg(2)).toBe(0.704);
  });

  it("検出そのものが空回りしていない（わざと間違えた文章を拾う）", () => {
    /* 「大津が北東」という誤りを作って、拾えることを確かめる。
       検査の側が壊れて 0 件マッチのまま緑になるのを防ぐ */
    const stats = getPrefStats("滋賀県")!;
    const otsu = areasNamed("滋賀県", "大津")[0];
    const actual = directionFromBearing(
      bearingBetween(stats.center.lat, stats.center.lon, otsu.lat, otsu.lon),
      "traditional",
    );
    expect(actual).toBe("SW");
    expect(actual).not.toBe("NE");
  });
});
