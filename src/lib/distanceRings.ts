import { DIRECTION_UNSTABLE_KM } from "@/lib/directionDistance";

/**
 * 出発地からの距離の輪を、どの半径で出すか。
 *
 * ## 何のために出すか
 *
 * **縮尺の目安。**地図は縮尺が変わると距離の感覚が失われる。「この街は
 * 100km なのか 300km なのか」を、目盛りとして読めるようにする。
 *
 * ## 気学的な意味は持たせない
 *
 * **距離で吉凶の強弱を変えない。**流派によって言うことが違い、
 * `docs/improvement-backlog.md` の E で「決まるまで実装しない」と
 * している。ここで帯に色や名前を付けると、決めていないものを決めた
 * ことになる。**輪は距離を示すだけ。**
 *
 * ただし 5km だけは別で、これは既に根拠がある。`directionDistance` の
 * `DIRECTION_UNSTABLE_KM`——この内側では方位がピンの置き方で変わる
 * （1km で 414m ずれれば隣の方位になる）。**判定の強弱ではなく、
 * 判定の当てにならなさ**なので、意味を書いてよい。
 *
 * ## 縮尺で数を変える
 *
 * どの縮尺でも同じ輪を出すと、広いときは全部が中心の点に潰れ、狭い
 * ときは 1 本も見えない。**画面に入る大きさのものだけ**を出す。
 */

/** 1 本ぶん。 */
export interface DistanceRing {
  km: number;
  /** 目盛りではなく意味のある輪か（5km の方位が定まらない範囲）。 */
  meaning: string | null;
}

/** 候補。上に行くほど内側。 */
const CANDIDATES = [
  DIRECTION_UNSTABLE_KM,
  10,
  25,
  50,
  100,
  200,
  300,
  500,
  1000,
] as const;

/**
 * その縮尺で出す輪。
 *
 * `visibleRadiusKm` は画面の中心から端までの距離。輪はその 1.2 倍まで
 * （少しはみ出すぶんには目盛りとして読める）、かつ**3 本まで**。
 * 増やすと地図が輪だらけになって、下の地形も物件も読めなくなる。
 */
export function ringsFor(visibleRadiusKm: number): DistanceRing[] {
  if (!Number.isFinite(visibleRadiusKm) || visibleRadiusKm <= 0) return [];
  const fits = CANDIDATES.filter((km) => km <= visibleRadiusKm * 1.2);
  /* 内側の細かい輪より、いま見えている範囲に近い輪のほうが目盛りに
     なる。大きい順に 3 本取ってから、描く順に戻す。 */
  const picked = fits.slice(-3);
  return picked.map((km) => ({
    km,
    meaning:
      km === DIRECTION_UNSTABLE_KM ? "この内側は方位が定まりません" : null,
  }));
}
