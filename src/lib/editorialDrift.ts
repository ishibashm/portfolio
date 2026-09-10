import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { AREAS, findArea, neighboursByDirection } from "@/lib/areaContent";
import { bearingBetween, distanceKmBetween } from "@/utils/directionGeo";

/**
 * 手書きの文章が、**境目に近すぎる地名を方位に縛っていないか**を見る。
 *
 * ## なぜ検査から出したか（2026-09-10）
 *
 * この規則は **3 日続けて master を赤くした**（9/08・9/09・9/10）。
 * 代表点は掲載物件の緯度経度の平均なので毎晩動き、境目のすぐ近くに
 * いる相手はその日の掲載で隣の方位へ移る。**文章が間違っているのでは
 * なく、世界が動いている。**
 *
 * 9/10 の 5 件のうち **4 件は「今日の頁とは一致している」**。明日ずれる
 * かもしれない、というだけだった。**脆さで CI を落とすのは強すぎる。**
 *
 *   食い違い（頁の一覧と違う方位を書いている） … 今まで通り落とす
 *   脆さ（今日は合っているが境目に近い）       … 毎晩ここで直す
 *
 * 利用者の判断（2026-09-10）:「a ですかね。デプロイとめる必要はない」。
 *
 * ## 直し方は「消すだけ」にする
 *
 * 並びから名前を外す以上のことをしない。**文章を機械が書かない。**
 * 「◯◯は北と北西の境目にあたります」を自動で足すこともできるが、
 * 置き場所を機械が決めることになり、`editorialDistinctness`（3-gram の
 * Jaccard 0.45）にも当たりやすい。県庁所在地のように読み手が失うものが
 * 大きい相手は、外したことを報告して人が書き足す。
 */

/** 伝統区分の境目。`directionFromBearing` の実装と同じ値。 */
const SECTOR_EDGES = [15, 75, 105, 165, 195, 255, 285, 345];

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
  { maxKm: Infinity, deg: 0.25 },
];

/** その距離では、境目からこれだけ離れていないと方位に縛れない。 */
export function unstableToNameDeg(km: number): number {
  return DRIFT_P95.find((b) => km < b.maxKm)!.deg;
}

/** 境目までの角度（度）。0 なら境目の真上。 */
export function degreesFromNearestEdge(bearing: number): number {
  return Math.min(
    ...SECTOR_EDGES.map((e) => {
      const d = Math.abs(((bearing - e + 540) % 360) - 180);
      return 180 - d;
    }),
  );
}

const D = "北東|南東|南西|北西|北|東|南|西";

/**
 * 「北東は箕面・茨木・高槻から」「南には江田島・大洲」。
 *
 * `g` を付けた正規表現は `lastIndex` を持ち回るので、**使うたびに
 * 作り直す**。使い回すと 2 回目の走査が途中から始まって取りこぼす。
 */
export function segmentPattern(): RegExp {
  return new RegExp(`(${D})(?:は|には|も)([一-龥ヶ]+(?:・[一-龥ヶ]+)+)`, "g");
}

/**
 * 文章の地名 → 市区町村。**1 つに定まるときだけ照合する。**
 *
 * 「栄」は横浜市栄区とも千葉県印旛郡栄町とも読めるし、「守山」は
 * 名古屋市守山区とも滋賀県守山市とも読める。曖昧なまま近い方へ寄せると、
 * 正しい文章を誤りとして落とす（実際に 2 件落ちた）。
 */
const VARIANTS = (city: string) => [
  city,
  city.replace(/^.*郡/, ""),
  city.replace(/^.*市/, ""),
];
const SUFFIXES = ["", "区", "市", "町", "村"];
export const matchesName = (city: string, name: string) =>
  VARIANTS(city).some((v) => SUFFIXES.some((s) => v === name + s));

export interface EditorialDrift {
  /** 市区町村コード。 */
  code: string;
  /** 「茨城県鉾田市」。報告に出す。 */
  full: string;
  /** `AREA_EDITORIAL[code].intro` の何段落目か。 */
  paragraph: number;
  /** 文章に書かれている方位（「北西」）。 */
  direction: string;
  /** 文章に書かれている地名（「水戸」）。並びから外す対象。 */
  name: string;
  /** 境目までの角度。 */
  degrees: number;
  /** その距離での下限。`degrees < floor` なら縛れない。 */
  floor: number;
  /** 相手までの距離（km）。 */
  km: number;
}

/**
 * 境目に近すぎる地名を、方位の並びから拾う。
 *
 * `AREA_EDITORIAL` と `areaDirections.json` をその場で読むので、**呼ぶ
 * たびに今日の答えになる。**巡回で代表点が動けば結果も変わる。
 */
export function findEditorialDrift(): EditorialDrift[] {
  const out: EditorialDrift[] = [];

  for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
    const origin = findArea(code);
    if (!origin) continue;
    const groups = neighboursByDirection(origin);
    /** 頁が実際に並べた相手。5km 未満と 150km 超はここに入らない。 */
    const listed = new Set<string>();
    for (const list of Object.values(groups)) {
      for (const a of list) listed.add(a.code);
    }

    editorial.intro.forEach((paragraph, index) => {
      for (const m of paragraph.matchAll(segmentPattern())) {
        /* 「A から B・C」の B・C は A の続きで、方位の主張ではない。
           後ろの方位だけを取ると前半の街を誤りにしてしまうので外す */
        const before = paragraph.slice(Math.max(0, m.index - 2), m.index);
        if (/から$|と$|〜$/.test(before)) continue;

        for (const name of m[2].split("・")) {
          const cands = AREAS.filter((a) => matchesName(a.city, name));
          if (cands.length !== 1) continue; // 曖昧な地名は照合しない
          const target = cands[0];
          if (!listed.has(target.code)) continue;

          /* 丸めた bearing ではなく実際の方位角で測る。`neighboursByDirection`
             が返す値は整数に丸められていて、境目の真上と 0.5 度離れた相手を
             区別できない（2026-09-10 に実際に取りこぼしかけた）。 */
          const exact = bearingBetween(
            origin.lat,
            origin.lon,
            target.lat,
            target.lon,
          );
          const km = distanceKmBetween(
            origin.lat,
            origin.lon,
            target.lat,
            target.lon,
          );
          const degrees = degreesFromNearestEdge(exact);
          const floor = unstableToNameDeg(km);
          if (degrees < floor) {
            out.push({
              code,
              full: origin.full,
              paragraph: index,
              direction: m[1],
              name,
              degrees,
              floor,
              km,
            });
          }
        }
      }
    });
  }
  return out;
}

/**
 * 方位の並びから 1 つの地名を外した段落を返す。**直せないときは null。**
 *
 * 直せないのは次の 2 つ。どちらも機械が続けると文が壊れるので、外さずに
 * 報告へ回す。
 *
 *   - その方位に名前が 1 つしか無い（外すと「北西はから栃木へ」になる）
 *   - 同じ方位の並びが段落に 2 つ以上あって、どれか決められない
 */
export function removeNameFromDirection(
  paragraph: string,
  direction: string,
  name: string,
): string | null {
  const hits = [...paragraph.matchAll(segmentPattern())].filter((m) => {
    if (m[1] !== direction) return false;
    const before = paragraph.slice(Math.max(0, m.index - 2), m.index);
    if (/から$|と$|〜$/.test(before)) return false;
    return m[2].split("・").includes(name);
  });
  if (hits.length !== 1) return null;

  const m = hits[0];
  const names = m[2].split("・");
  const rest = names.filter((n) => n !== name);
  /* 1 つしか無いものを外すと並びが消えて文が壊れる。2 つ以上残るときだけ
     直す（`SEG` は「・」で繋がった 2 つ以上にしか当たらないため）。 */
  if (rest.length < 2) return null;

  const start = m.index + m[1].length;
  const head = paragraph.slice(m.index, start);
  const particle = m[0].slice(m[1].length, m[0].length - m[2].length);
  const replaced = `${head}${particle}${rest.join("・")}`;
  return (
    paragraph.slice(0, m.index) +
    replaced +
    paragraph.slice(m.index + m[0].length)
  );
}
