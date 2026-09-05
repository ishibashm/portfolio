import type {
  StationRecord,
  StationsFile,
} from "../../scripts/import_stations";

/**
 * 駅（国土数値情報 N02。`scripts/import_stations.ts` が焼く）の一覧。
 *
 * 一覧は押されてから dynamic import する（名所と同じ）。1 万駅で
 * 数百 KB あるので、地図を開く全員に配らない。
 *
 * 出典の明示が条件のデータ。層を出すときは帰属表示に
 * `STATIONS_ATTRIBUTION` を足す（`map/StationLayer`）。
 */
export type { StationRecord, StationsFile };

export const STATIONS_ATTRIBUTION =
  '<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noopener">国土数値情報（鉄道データ）（国土交通省）</a>';

/** 1 駅ずつ出すズームの下限。これ未満は升目にまとめる。 */
export const STATION_CLUSTER_BELOW_ZOOM = 11;

export interface StationView {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** 「事業者 路線」。表を引いた後の文字列 */
  lines: string[];
}

let cache: Promise<StationView[]> | null = null;

export function loadStations(): Promise<StationView[]> {
  if (!cache) {
    cache = import("@/data/stations.json").then((m) =>
      stationViews(m.default as unknown as StationsFile),
    );
  }
  return cache;
}

/** 表を引いて、駅ごとに路線名の配列を持つ形にする。純粋関数 */
export function stationViews(file: StationsFile): StationView[] {
  const names = file.lineNames;
  return file.stations.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    lines: s.l
      .map((i) => names[i])
      .filter((n): n is string => typeof n === "string"),
  }));
}
