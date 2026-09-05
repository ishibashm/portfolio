import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
  DIRECTION_LABELS,
  type CompassDirection,
} from "@/utils/directionGeo";
import { directionUnstableNote } from "@/lib/directionDistance";
import type { DirectionCell } from "@/components/relocation/SpotVerdict";

/**
 * パワースポット（いまは諸国一宮）の一覧と、出発地から見た判定。
 *
 * ## 一覧は Wikidata から取り込んだ静的データ
 *
 * `src/data/powerSpots.json` は `scripts/import_spots.ts`（CC0 の Wikidata、
 * P13723 = 諸国一宮）が書く。ここでは読むだけ。**効果や利益は書かない。**
 * 「一宮である」という事実（Wikidata の指定）だけを出す。
 *
 * ## 判定は新しく作らない
 *
 * 方位は物件・県の塗り分け・`SpotVerdict` とまったく同じ経路
 * （bearingBetween → directionFromBearing）で出し、段階はページが既に
 * 組んだその日の盤（dirKigaku）から引くだけ。ここで別に計算すると、
 * 同じ地点なのに扇形の色と食い違う。
 *
 * ## 読み込みは押されてから
 *
 * 一覧は 13KB だが、地図を開く全員に配る理由は無い（既定は非表示）。
 * `loadPowerSpots` が初回だけ dynamic import して、以後は同じ Promise を
 * 返す。
 */

export interface PowerSpot {
  /** Wikidata の QID。React の key と、重複の突き合わせに使う */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** 座標から引いた最寄りの市区町村。住所ではない */
  pref: string;
  city: string;
  /** どの一覧に載っているか（いまは「諸国一宮」だけ） */
  basis: string;
}

export interface PowerSpotFile {
  source: string;
  note?: string;
  generatedAt: string;
  spots: PowerSpot[];
}

let cache: Promise<PowerSpot[]> | null = null;

export function loadPowerSpots(): Promise<PowerSpot[]> {
  if (!cache) {
    cache = import("@/data/powerSpots.json").then(
      (m) => (m.default as PowerSpotFile).spots,
    );
  }
  return cache;
}

/** 出発地から見た 1 地点の判定。SpotVerdict の中の計算と同じ */
export interface SpotFromBase {
  direction: CompassDirection;
  /** 「北東」のような表示名。盤が無くても出す */
  directionLabel: string;
  distanceKm: number;
  /** その日の盤の 1 セル。盤が無い（生年月日未入力など）なら undefined */
  cell: DirectionCell | undefined;
  /** 5km 未満で方位が定まらないときの注意。無ければ null */
  unstableNote: string | null;
}

export function spotFromBase(
  baseLat: number,
  baseLon: number,
  spot: { lat: number; lon: number },
  useClassical: boolean,
  dirKigaku?: Record<string, DirectionCell>,
): SpotFromBase | null {
  if (!Number.isFinite(baseLat) || !Number.isFinite(baseLon)) return null;
  const bearing = bearingBetween(baseLat, baseLon, spot.lat, spot.lon);
  const direction = directionFromBearing(
    bearing,
    useClassical ? "traditional" : "physical",
  );
  const distanceKm = distanceKmBetween(baseLat, baseLon, spot.lat, spot.lon);
  const cell = dirKigaku?.[direction];
  return {
    direction,
    directionLabel: cell?.directionLabel ?? DIRECTION_LABELS[direction],
    distanceKm,
    cell,
    unstableNote: directionUnstableNote(distanceKm),
  };
}

/**
 * 一覧をまとめて描くズームの上限。これ未満では升目にまとめる。
 *
 * 106 地点を全国俯瞰（zoom 5）に全部置くと、近畿に 20 以上が重なって
 * 名前が読めない。県が見分けられる zoom 8 からは 1 つずつ出す。
 */
export const POWER_SPOT_CLUSTER_BELOW_ZOOM = 8;
