import { describe, expect, it } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import {
  degreesFromNearestEdge,
  findEditorialDrift,
  removeNameFromDirection,
  unstableToNameDeg,
} from "@/lib/editorialDrift";
import { AREAS, findArea, neighboursByDirection } from "@/lib/areaContent";
import { directionFromBearing } from "@/utils/directionGeo";

/**
 * 市区町村ページの文章が「この方位には何がある」と書いたところを、
 * 頁が実際に並べる一覧と突き合わせる。
 *
 * 頁は方位ごとに市区町村を並べる。文章が別の方位を書いていると、
 * **同じ画面の中で文章と一覧が矛盾する**。頁が増えるほど手では
 * 確かめられなくなるので、計算に当てて固定する（#552 の教訓。
 * 字面で探すのではなく、型と計算に出させる）。
 *
 * 県ページの同じ検査は prefEditorialDirections.test.ts。
 * 「街が無い方位」の言い切りは areaEditorialDeadEnds.test.ts。
 */

/**
 * 境目からこの角度に入っていたら、**両隣どちらの表記も通す。**
 *
 * ## なぜ要るか（2026-09-01 に実際に落ちた）
 *
 * 頁の一覧が使う代表点は**掲載物件の緯度経度の平均**なので、毎晩の
 * 巡回で掲載の分布が変わると動く。境目のすぐ近くにある相手は、
 * その日の掲載しだいで隣の方位に移る。**文章が間違っているのではなく、
 * データが揺れている。**
 *
 *     長岡市 → 小千谷市    194.951°  境界（195°）まで 0.049°
 *     名古屋市中川区 → 弥富市  254.982°  境界（255°）まで 0.018°
 *     周南市 → 岩国市       75.004°  境界（75°）まで 0.004°
 *
 * 3 件とも境目の真上だった。**落ちるペアが境目に集中するのは偶然では
 * なく、境目付近のペアしか反転しないから。**
 *
 * ## 3 度の根拠
 *
 * 代表点の移動を 5 版ぶん実測した（e7a11c0〜ead8609）。
 *
 *     点の移動      中央 0〜9m   95% 104m   最大 1.81km
 *     方位角の振れ  中央 0.025°  95% 0.220°  99.9% 1.487°  最大 2.975°
 *                   （5〜150km の 33,656 ペア）
 *
 * **3 度を超えた振れは 1 件も無い。**ここを覆う値として 3 度を置く。
 *
 * ## ただし、この 3 度は近い相手には効かない（2026-09-04 に実際に落ちた）
 *
 * 上の実測は 5〜150km のペアをまとめた分布で、**振れ幅は距離に反比例
 * する。**代表点が同じだけ動いても、近い相手ほど方位角は大きく振れる。
 *
 *     別府市 → 由布市（8.84km）  195.996° → 198.675°  一晩で 2.68°
 *
 * 頁の一覧はどちらの晩も南西だったが、文章は南と書いていた。3 度の
 * 許容がそれを隠しており、振れが 3 度を越えた晩に初めて落ちた。
 * **近い相手を方位に縛るときは、許容幅ではなく距離を見ること。**
 *
 * ## 通すのは「両隣」だけ
 *
 * 境目の近くでも、無関係な方位を書いていたら落とす。境目にいる相手は
 * 2 つの方位のどちらとも読めるので、**その 2 つだけ**を許す。
 */
const BOUNDARY_MARGIN_DEG = 3;

/**
 * その方位角で、文章に書いてよい方位。
 *
 * ふつうは 1 つ。境目から `BOUNDARY_MARGIN_DEG` 以内なら、
 * **またいだ先も足して 2 つ**返す。
 */
function acceptableDirections(bearing: number): string[] {
  const here = directionFromBearing(bearing, "traditional");
  if (degreesFromNearestEdge(bearing) > BOUNDARY_MARGIN_DEG) return [here];
  const m = BOUNDARY_MARGIN_DEG;
  return [
    here,
    directionFromBearing((bearing - m + 360) % 360, "traditional"),
    directionFromBearing((bearing + m) % 360, "traditional"),
  ];
}

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
/** 「北東は箕面・茨木・高槻から」「南には江田島・大洲」 */
const SEG = new RegExp(
  `(${D})(?:は|には|も)([一-龥ヶ]+(?:・[一-龥ヶ]+)+)`,
  "g",
);

/**
 * 文章の地名 → 市区町村。**1 つに定まるときだけ照合する。**
 *
 * 「栄」は横浜市栄区とも千葉県印旛郡栄町とも読めるし、「守山」は
 * 名古屋市守山区とも滋賀県守山市とも読める。曖昧なまま近い方に
 * 寄せると、正しい文章を誤りとして落とす（実際に 2 件落ちた）。
 */
const VARIANTS = (city: string) => [
  city,
  city.replace(/^.*郡/, ""),
  city.replace(/^.*市/, ""),
];
const SUFFIXES = ["", "区", "市", "町", "村"];
const matchesName = (city: string, name: string) =>
  VARIANTS(city).some((v) => SUFFIXES.some((s) => v === name + s));

interface Mismatch {
  text: string;
}

function audit(): { claims: number; checked: number; bad: Mismatch[] } {
  let claims = 0;
  let checked = 0;
  const bad: Mismatch[] = [];

  for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
    const origin = findArea(code);
    if (!origin) continue;
    const groups = neighboursByDirection(origin);
    /** 頁が実際に並べた方位。5km 未満と 150km 超はここに入らない。 */
    const listed = new Map<string, string>();
    /* 方位角も持つ。境目のすぐ近くにいる相手は、その日の掲載しだいで
       隣に移るので、両隣どちらの表記も通す（上の註） */
    const bearings = new Map<string, number>();
    for (const [d, list] of Object.entries(groups)) {
      for (const a of list) {
        listed.set(a.code, d);
        bearings.set(a.code, a.bearing);
      }
    }

    for (const paragraph of editorial.intro) {
      for (const m of paragraph.matchAll(SEG)) {
        /* 「西から北西は」「西と南西も」は 2 方位をまとめて指す言い方。
           後ろの方位だけを取ると前半の街を誤りにしてしまうので外す */
        const before = paragraph.slice(Math.max(0, m.index - 2), m.index);
        if (/から$|と$|〜$/.test(before)) continue;

        const want = DIR_JP[m[1]];
        claims++;
        for (const name of m[2].split("・")) {
          const cands = AREAS.filter((a) => matchesName(a.city, name));
          if (cands.length !== 1) continue; // 曖昧な地名は照合しない
          const target = cands[0];
          /* 頁の一覧に出ない相手（隣接する区など 5km 未満、150km 超）は
             文章では触れてよい。決め事にもそう書いてある */
          if (!listed.has(target.code)) continue;
          checked++;
          const ok = acceptableDirections(bearings.get(target.code) ?? 0);
          if (!ok.includes(want)) {
            bad.push({
              text: `${origin.pref}${origin.city} → ${target.pref}${target.city}: 文章=${m[1]} 頁の一覧=${listed.get(target.code)}`,
            });
          }
        }
      }
    }
  }
  return { claims, checked, bad };
}

describe("AREA_EDITORIAL の方位が頁の一覧と合っている", () => {
  const result = audit();

  it("突き合わせる材料が集まっている（空回りしていない）", () => {
    expect(result.claims).toBeGreaterThan(150);
    expect(result.checked).toBeGreaterThan(300);
  });

  it("文章の方位が頁の一覧と食い違っていない", () => {
    expect(result.bad.map((b) => b.text)).toEqual([]);
  });

  it("検出そのものが空回りしていない（わざと間違えた文章を拾う）", () => {
    /* 頁の一覧と 1 つでも食い違えば拾えることを、作った文章で確かめる。
       検査の側が壊れて 0 件マッチのまま緑になるのを防ぐ */
    const origin = findArea("13112")!; // 世田谷区
    const groups = neighboursByDirection(origin);
    const komae = groups.W.find((a) => a.city === "狛江市");
    expect(komae).toBeDefined();
    expect(groups.NW.some((a) => a.city === "狛江市")).toBe(false);
  });
});

describe("境目のすぐ近くにある地名は、毎晩ここで拾って直す", () => {
  /*
    **この規則で CI を落とすのはやめた**（2026-09-10。利用者の判断
    「a ですかね。デプロイとめる必要はない」）。

    ## なぜ

    3 日続けて master を赤くした（9/08・9/09・9/10）。代表点は掲載物件の
    緯度経度の平均なので毎晩動き、境目のすぐ近くにいる相手はその日の
    掲載で隣の方位へ移る。**文章が間違っているのではなく、世界が動いて
    いる。**

    9/10 に落ちた 5 件のうち **4 件は「今日の頁とは一致している」**もの
    だった。明日ずれるかもしれない、というだけ。**脆さで CI を落とすのは
    強すぎる。**

      食い違い（頁の一覧と違う方位を書いている） … 上の describe で落とす
      脆さ（今日は合っているが境目に近い）       … 毎晩の仕事へ回す

    検出と直し方は `src/lib/editorialDrift.ts` に出した。夜間の巡回の
    あとにそれを回して、外した名前を PR にする。

    ## ここに残す不変条件

    件数 0 は**期待しない**（それが赤くなっていた条件そのもの）。
    代わりに「拾ったものを機械で直せるか」を見る。直せないものが出たら
    人が書き直す合図なので、そのときだけ落とす。
  */
  const drift = findEditorialDrift();

  it("拾ったものは機械で直せる（直せなければ人が書き直す）", () => {
    const stuck = drift
      .filter(
        (d) =>
          removeNameFromDirection(
            AREA_EDITORIAL[d.code].intro[d.paragraph],
            d.direction,
            d.name,
          ) === null,
      )
      .map((d) => `${d.full} 「${d.direction}は…${d.name}…」`);
    expect(stuck).toEqual([]);
  });

  it("検出そのものが働いている（境目の真上を拾う）", () => {
    /*
      ここには実在の組（南相馬市 → 本宮市。境目から 0.004 度だった）を
      書いていた。**それが 2026-09-04 に master を赤くした。**夜間の
      巡回で代表点が動き、同じ組が 0.350 度に離れて「0.25 度より近い」が
      成り立たなくなった。**実データで空回りを防ぐと、実データが動いた
      日に落ちる。**作った値で見る。
    */
    expect(degreesFromNearestEdge(345)).toBeCloseTo(0, 6);
    expect(degreesFromNearestEdge(344.9)).toBeLessThan(unstableToNameDeg(100));
    expect(degreesFromNearestEdge(300)).toBeGreaterThan(unstableToNameDeg(5));
  });
});
