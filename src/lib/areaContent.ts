/**
 * 「A市から見て各方位にどんな街があり、相場はいくらか」を組み立てる。
 *
 * 方位は出発地からの向きで決まるので、市区町村どうしの位置関係は固定であり
 * 静的ページとして成立する。ここに載せるのは自前で集計した相場と方位判定だけで、
 * 物件そのものの情報は載せない（掲載元の情報をそのまま転載しないため）。
 */
import raw from "@/data/areaDirections.json";
import type { AreaEntry } from "@/utils/areaDatasetMerge";
import { DIRECTION_UNSTABLE_KM } from "@/lib/directionDistance";
import {
  bearingBetween,
  distanceKmBetween,
  directionFromBearing,
} from "@/utils/directionGeo";
import {
  DIRECTIONS,
  DIRECTION_LABELS,
  type CompassDirection,
} from "@/lib/kigakuContent";

/**
 * JSON の 1 行。書き出し側の型（utils/areaDatasetMerge）をそのまま使う。
 *
 * `asOf` だけ任意にしてある。併合を入れる前に書き出された JSON には
 * 無いため。書き出し側では必ず入るので、あちらは必須のままでよい。
 */
export interface Area extends Omit<AreaEntry, "asOf"> {
  asOf?: string;
}

const dataset = raw as { generatedAt: string; areas: Area[] };

export const AREAS: Area[] = dataset.areas;
export const AREA_GENERATED_AT: string = dataset.generatedAt;

/**
 * その市区町村の数字を集計した日（YYYY-MM-DD）。
 *
 * ファイル全体の `generatedAt` を使ってはいけない。掲載が閾値に満たない
 * 市区町村は前回の数字を引き継いでいる（#533）ので、ファイルの日付を
 * 出すと**更新していない相場に今日の日付が付く。**
 *
 * `asOf` を持たないのは併合を入れる前に書き出された JSON だけなので、
 * そのときだけファイルの日付に落とす。
 *
 * `??` ではなく `||` を使う。空文字は「不明」であって「その日付」では
 * ないのに、`??` だと素通りして `new Date("")` が Invalid Date になる。
 */
export function areaAsOf(area: Area): string {
  return area.asOf || AREA_GENERATED_AT.slice(0, 10);
}

const byCode = new Map(AREAS.map((a) => [a.code, a]));
export function findArea(code: string): Area | undefined {
  return byCode.get(code);
}

export interface NeighbourArea extends Area {
  distanceKm: number;
  bearing: number;
  direction: CompassDirection;
  /** 出発地の相場に対する差（%）。負なら安い */
  rentDiffPct: number;
}

/**
 * 近すぎる相手は方位が定まらないので除く。同一市内の区など。
 *
 * 同じ判断をシミュレータの注意書きでも使うので、数字は
 * lib/directionDistance に置いてある（1km なら 414m ずれるだけで方位が
 * 隣に変わる、という計算が根拠）。2 か所に書くと片方だけ動く。
 */
const MIN_KM = DIRECTION_UNSTABLE_KM;
/** 引越し先として現実的な範囲に絞る */
const MAX_KM = 150;

export function neighboursByDirection(
  origin: Area,
): Record<CompassDirection, NeighbourArea[]> {
  const out = {} as Record<CompassDirection, NeighbourArea[]>;
  for (const d of DIRECTIONS) out[d] = [];

  for (const a of AREAS) {
    if (a.code === origin.code) continue;
    const distanceKm = distanceKmBetween(origin.lat, origin.lon, a.lat, a.lon);
    if (distanceKm < MIN_KM || distanceKm > MAX_KM) continue;
    const bearing = bearingBetween(origin.lat, origin.lon, a.lat, a.lon);
    // エリアページは気学の伝統区分（四正30度・四隅60度）で切る。
    const direction = directionFromBearing(bearing, "traditional");
    if (!out[direction]) continue; // CENTER は返らないが型のため
    out[direction].push({
      ...a,
      distanceKm: Math.round(distanceKm),
      bearing: Math.round(bearing),
      direction,
      rentDiffPct: Math.round(((a.sqmRent - origin.sqmRent) / origin.sqmRent) * 100),
    });
  }

  for (const d of DIRECTIONS) {
    out[d].sort((x, y) => x.distanceKm - y.distanceKm);
  }
  return out;
}

/** 候補が無い方位と、その理由。 */
export interface EmptyDirection {
  direction: CompassDirection;
  /**
   * 一覧の範囲（150km）より遠くには市区町村があるか。
   *
   * **true と false で意味がまったく違う。**true は「近くに無いだけ」で、
   * 範囲を広げれば候補がある（函館市の南西には 677 の市区町村があるが、
   * いちばん近いものでも 150km より先）。false はどの距離にも候補が
   * 無い（長崎市の西・南西・南、浜松市中央区の南東・南）。
   *
   * **false を「行き止まり」と読まないこと。**下の註を見ること。
   */
  hasBeyondRange: boolean;
}

/**
 * 候補が 1 件も無い方位。
 *
 * **ここがこの頁でいちばん効く情報。**候補の入らない方位は、暦の上で
 * 吉方位が出ても、この一覧からは引越し先を出せない。
 *
 * 頁は長らく候補のある方位だけを並べていた。空の方位は**黙って消えて
 * いた**ので、読む側は「その方位に街が無い」のか「頁が出し忘れている」
 * のかを区別できなかった。
 *
 * ## 距離の理由を取り違えないこと
 *
 * 一覧は 5〜150km で切っている。**空の 709 方位のうち 114 は、
 * 150km より先には市区町村がある**（2026-08-31 の実測）。そこを
 * 「無い」と書くと嘘になるので、両者を分けて返す。
 *
 * ## **これは「行き止まりか」を答える関数ではない**
 *
 * 母集団は AREAS＝areaDirections.json に載っている市区町村で、
 * **全国 1,917 のうち 1,119**（scripts/jis_city_codes.json と突き合わせた
 * 2026-08-31 の実測）。掲載を集計できた分だけなので、巡回の届いて
 * いない町村は最初から入っていない。北海道は 57 / 194 しか無い。
 *
 * その結果、**実在する街が「空」に見える**。釧路町の東は
 * `hasBeyondRange: false` を返すが、そこには厚岸町・浜中町・根室市が
 * ある。海や山で本当に行き止まりなのか、掲載が無いだけなのかを、
 * この計算は区別できない。**画面の文言でも区別しないこと。**
 *
 * 区別できるようにするには全 1,917 市区町村の座標が要る
 * （docs/improvement-backlog.md 16 節）。
 */
export function emptyDirections(origin: Area): EmptyDirection[] {
  const withinRange = neighboursByDirection(origin);
  const beyond = new Set<CompassDirection>();

  for (const a of AREAS) {
    if (a.code === origin.code) continue;
    const km = distanceKmBetween(origin.lat, origin.lon, a.lat, a.lon);
    /* 近すぎる相手は方位が定まらないので、遠い側だけを見る */
    if (km <= MAX_KM) continue;
    beyond.add(
      directionFromBearing(
        bearingBetween(origin.lat, origin.lon, a.lat, a.lon),
        "traditional",
      ),
    );
  }

  return DIRECTIONS.filter((d) => withinRange[d].length === 0).map((d) => ({
    direction: d,
    hasBeyondRange: beyond.has(d),
  }));
}

export function directionLabel(d: CompassDirection): string {
  return DIRECTION_LABELS[d];
}

/** 出発地の候補として出すエリア（掲載数が多い順） */
export function topAreas(limit = 60): Area[] {
  return [...AREAS].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** 県ごとにまとめる。県内は掲載数が多い順。 */
export function areasByPref(): Map<string, Area[]> {
  const out = new Map<string, Area[]>();
  for (const a of AREAS) {
    if (!out.has(a.pref)) out.set(a.pref, []);
    out.get(a.pref)!.push(a);
  }
  for (const list of out.values()) list.sort((x, y) => y.count - x.count);
  return out;
}

/**
 * 記事ページに置く出発地の候補。
 *
 * 全 220 件を毎ページに並べるとリンクが薄まるうえ本文が読めなくなるので、
 * 県ごとに掲載数の多い数件だけを出し、残りは一覧ページへ送る。
 * 県を落とさないのは、掲載数順に上から取ると大阪・愛知だけで埋まってしまい、
 * 鳥取や福井から来た人に入口が無くなるため。
 */
export function topAreasByPref(perPref = 3): [string, Area[]][] {
  return [...areasByPref().entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([pref, list]) => [pref, list.slice(0, perPref)] as [string, Area[]]);
}

/**
 * 同じ県内のほかのエリア。
 *
 * 方位別の一覧は 5〜150km の範囲で切っているため、県内でも遠い相手や
 * 近すぎる同一市内の区は載らない。県で辿れる道を別に用意する。
 */
export function siblingAreas(origin: Area, limit = 24): Area[] {
  return AREAS.filter((a) => a.pref === origin.pref && a.code !== origin.code)
    .sort((x, y) => y.count - x.count)
    .slice(0, limit);
}
