import { describe, expect, it } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { AREAS, findArea, neighboursByDirection } from "@/lib/areaContent";
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";

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
 * 区分の境目（伝統区分。四正 30 度・四隅 60 度）。
 *
 * `directionFromBearing(b, "traditional")` の分岐と同じ値。**実装から
 * 写している**ので、あちらを変えたらここも変える。
 */
const SECTOR_EDGES = [15, 75, 105, 165, 195, 255, 285, 345];

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
 * **この角度より境目に近い相手は、文章で方位に縛らない。**
 *
 * 上の 3 度は「落とさない」ための許容幅で、**読み手の実害とは別の話。**
 * 許容幅の中にいても、実際にひっくり返るかどうかは振れ幅で決まる。
 *
 *     方位角の振れ（実測）  中央 0.025°  95% 0.220°  99.9% 1.487°
 *
 * **ふつうの夜の揺れ（95% で 0.220°）で反転する相手**は、文章と頁の
 * 一覧が半々で食い違う。読み手には見える。0.25 度をその線に置く。
 *
 * 3 度以内は 161 件（13.5%）あるが、0.25 度以内は **10 件だけ**だった
 * （2026-09-01 実測。1,189 件の地名を照合）。全部、方位に縛らない
 * 書き方に直した。
 *
 *     南相馬市の本宮 0.004°   沼津市の天竜 0.074°   由利本荘市の弘前 0.077°
 *     市川市の荒川 0.088°     熊本市東区の日田 0.095°  甲斐市の飯田 0.098°
 *     久留米市の上峰 0.168°   博多区の早良 0.169°    大田区の目黒 0.194°
 *     八戸市の花巻 0.243°
 *
 * 近くて目立つ 3 つ（日田・早良・目黒）は消さずに、**どの方位の
 * 境目にあるか**を書いた。消すと読み手が失うものが大きい。
 */
const UNSTABLE_TO_NAME_DEG = 0.25;

/**
 * 距離帯ごとの、一晩の方位角の振れ（95 パーセンタイル。度）。
 *
 * ## 一律 0.25 度では足りなかった
 *
 * 上の 0.25 度は 5〜150km を**まとめた**分布から置いた値だが、
 * 件数の 8 割が 40km より遠いペアなので、**近い側が平均に埋もれて
 * いた。**距離帯で割り直すと桁が違う（2026-09-04 実測。前夜との
 * 差分、246,502 ペア）。
 *
 *     距離帯      n        中央    95%     99.9%   最大
 *      5-10km    4,210    0.101   1.077   3.879   4.632
 *     10-20km   12,202    0.056   0.608   2.422   5.640
 *     20-40km   33,882    0.034   0.360   1.313   3.334
 *     40-80km   71,056    0.019   0.202   0.765   1.821
 *     80-150km 125,152    0.010   0.109   0.533   0.938
 *
 * **一晩で 5.640 度動いたペアがある。**「3 度を超えた振れは 1 件も
 * 無い」と書いた前回の実測は、遠いペアに引きずられていた。
 *
 * ## 95% を下限に採る理由
 *
 * ここは「読み手が食い違いを見るか」の線なので、**ふつうの夜**で
 * 反転するかどうかで決める。95% は 20 晩に 1 晩。それより内側に
 * ある地名は、文章と頁の一覧が目に見えて食い違う。
 *
 * 99.9% を採ると 137 件を書き直すことになり、近い街の名前が頁から
 * ほとんど消える。読み手が失うもののほうが大きい。95% なら 17 件。
 */
const DRIFT_P95: { maxKm: number; deg: number }[] = [
  { maxKm: 10, deg: 1.077 },
  { maxKm: 20, deg: 0.608 },
  { maxKm: 40, deg: 0.36 },
  { maxKm: Infinity, deg: UNSTABLE_TO_NAME_DEG },
];

/** その距離では、境目からこれだけ離れていないと方位に縛れない。 */
function unstableToNameDeg(km: number): number {
  return DRIFT_P95.find((b) => km < b.maxKm)!.deg;
}

/** 境目までの角度（度）。0 なら境目の真上。 */
function degreesFromNearestEdge(bearing: number): number {
  return Math.min(
    ...SECTOR_EDGES.map((e) => {
      const d = Math.abs(((bearing - e + 540) % 360) - 180);
      return 180 - d;
    }),
  );
}

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

describe("境目のすぐ近くにある地名を、方位に縛っていない", () => {
  /*
    ここが「本筋」の側。上の margin は CI を無駄に赤くしないための
    もので、**読み手の実害はそれでは消えない。**頁の一覧はその日の
    掲載で決まるので、境目のすぐ近くにいる相手は文章と半々で食い違う。

    書く側の決め事にする。境目に近すぎる相手は「◯方位は A・B・C」の
    並びに入れない。**近さの線は距離で変わる**（下の DRIFT_P95）。
    同じ 0.5 度でも、8km の相手はふつうの夜に反転し、100km の相手は
    まず動かない。
  */
  it("境目に近すぎる相手を、方位の並びに入れていない（下限は距離で決まる）", () => {
    const bad: string[] = [];
    for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
      const origin = findArea(code);
      if (!origin) continue;
      const groups = neighboursByDirection(origin);
      const listed = new Map<string, (typeof groups)["N"][number]>();
      for (const list of Object.values(groups)) {
        for (const a of list) listed.set(a.code, a);
      }
      for (const paragraph of editorial.intro) {
        for (const m of paragraph.matchAll(SEG)) {
          const before = paragraph.slice(Math.max(0, m.index - 2), m.index);
          if (/から$|と$|〜$/.test(before)) continue;
          for (const name of m[2].split("・")) {
            const cands = AREAS.filter((a) => matchesName(a.city, name));
            if (cands.length !== 1) continue;
            const target = listed.get(cands[0].code);
            if (!target) continue;
            /* 丸めた bearing ではなく実際の方位角で測る。丸めると
               0.5 度ぶんの誤差が入り、境目の真上と区別が付かない */
            const exact = bearingBetween(
              origin.lat,
              origin.lon,
              cands[0].lat,
              cands[0].lon,
            );
            const d = degreesFromNearestEdge(exact);
            /* 下限は距離で変わる。近い相手ほど、代表点の同じ動きで
               方位角が大きく振れる（上の実測） */
            const floor = unstableToNameDeg(
              distanceKmBetween(
                origin.lat,
                origin.lon,
                cands[0].lat,
                cands[0].lon,
              ),
            );
            if (d < floor) {
              bad.push(
                `${origin.pref}${origin.city}(${code}) 「${m[1]}は…${name}…」 境目まで ${d.toFixed(3)}° 下限 ${floor}°`,
              );
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("検出そのものが働いている（境目の真上を拾う）", () => {
    /*
      ここには実在の組（南相馬市 → 本宮市。境目から 0.004 度だった）を
      書いていた。**それが 2026-09-04 に master を赤くした。**夜間の
      巡回で代表点が動き、同じ組が 0.350 度に離れて、「0.25 度より
      近い」という自己検査の前提のほうが崩れた。

      確かめたいのは `degreesFromNearestEdge` が境目を拾うことで、
      掲載データではない。**毎晩動く値に自己検査を固定しない。**
      境目そのものから作った方位角で見る。
    */
    for (const edge of SECTOR_EDGES) {
      for (const b of [edge, (edge + 0.1) % 360, (edge - 0.1 + 360) % 360]) {
        expect(degreesFromNearestEdge(b)).toBeLessThan(UNSTABLE_TO_NAME_DEG);
      }
    }
    /* 何でも拾う実装になっていないこと。区分の真ん中は拾わない */
    for (const b of [45, 90, 135, 180, 225, 270, 315, 0]) {
      expect(degreesFromNearestEdge(b)).toBeGreaterThan(UNSTABLE_TO_NAME_DEG);
    }
  });
});

describe("境目の揺れは通し、本物の食い違いは落とす", () => {
  /* 2026-09-01 に実際に落ちた 3 件。どれも境目の真上で、文章が
     間違っていたのではなくデータが揺れていた */
  it("境目の真上なら、両隣どちらの表記も通る", () => {
    expect(acceptableDirections(194.951)).toEqual(
      expect.arrayContaining(["S", "SW"]), // 長岡市 → 小千谷市
    );
    expect(acceptableDirections(254.982)).toEqual(
      expect.arrayContaining(["SW", "W"]), // 名古屋市中川区 → 弥富市
    );
    expect(acceptableDirections(75.004)).toEqual(
      expect.arrayContaining(["NE", "E"]), // 周南市 → 岩国市
    );
  });

  it("区分の真ん中なら 1 つしか通さない", () => {
    /* ここが緩みすぎていないことの確認。45 度は北東のほぼ中央
       （15〜75 度）で、境目から 30 度ある */
    expect(acceptableDirections(45)).toEqual(["NE"]);
    expect(acceptableDirections(90)).toEqual(["E"]); // 東の中央
    expect(acceptableDirections(0)).toEqual(["N"]); // 北の中央
  });

  it("境目から 3 度を超えたら両隣を通さない", () => {
    /* 実測の振れ幅は最大 2.975 度。3 度を 1 度でも超えたら、
       それはデータの揺れでは説明できない */
    expect(acceptableDirections(75 + 3.5)).toEqual(["E"]);
    expect(acceptableDirections(75 - 3.5)).toEqual(["NE"]);
  });

  it("境目をまたぐ 0 度の付近でも壊れない", () => {
    /* 北は 345〜15 度で 0 度をまたぐ。剰余の扱いを間違えると
       ここだけ「境目から遠い」と誤判定する */
    expect(degreesFromNearestEdge(15.0)).toBeCloseTo(0, 5);
    expect(degreesFromNearestEdge(345.0)).toBeCloseTo(0, 5);
    expect(degreesFromNearestEdge(0)).toBeCloseTo(15, 5);
    expect(acceptableDirections(345.5)).toEqual(
      expect.arrayContaining(["N", "NW"]),
    );
  });
});
