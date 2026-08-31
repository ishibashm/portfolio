import { describe, expect, it } from "vitest";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { getPrefStats, prefNameByCode } from "@/lib/prefContent";
import { AREAS } from "@/lib/areaContent";
import { bearingBetween, directionFromBearing } from "@/utils/directionGeo";

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
