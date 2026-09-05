/**
 * 国土数値情報 N02（鉄道）の駅を、地図の「🚉 駅」の層が読む
 * `src/data/stations.json` に焼く。
 *
 * ## 出どころ
 *
 * probe（run 33951095464 / 33951226995）で実測した 2025 年版の全国 1 本:
 *   https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip（14.9MB）
 * zip の中の UTF-8/N02-25_Station.geojson（駅 10,234 本。**点ではなく
 * 線分**。座標系 EPSG:6668 = 経緯度）を読む。取り込みは無償。出典の
 * 明示が要る（地図の帰属表示に「国土数値情報（鉄道データ）（国土交通省）」）。
 *
 * ## 形
 *
 * - 駅は**グループコード（N02_005g）で畳む**。同じ駅に複数の事業者・
 *   路線があると 1 本ずつ入っているため（汐留は 005c と 005g が違う）。
 *   点は各線分の中点の平均
 * - 路線名は「事業者 路線」の文字列表を別に持ち、駅は番号で指す。
 *   1 万駅が同じ路線名を持つので、そのまま書くと倍以上に膨らむ
 * - 所在地（市区町村）は書かない。吹き出しを開いたときに座標から引く
 *   （lib/nearestPlace）。1 万件ぶん持つ理由が無い
 * - 並びは id（グループコード）で固定。差分がノイズにならないように
 *
 * ## 走らせ方
 *
 *   npx tsx scripts/import_stations.ts --geojson /tmp/n02/N02-25_GML/UTF-8/N02-25_Station.geojson
 *
 * ワークフロー（import-stations.yml）が zip を取って展開してから呼ぶ。
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "src/data/stations.json";
const SOURCE_URL =
  "https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip";

export interface StationFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}

export interface StationRecord {
  /** グループコード（N02_005g） */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** lineNames の添字 */
  l: number[];
}

export interface StationsFile {
  source: string;
  sourceUrl: string;
  note: string;
  generatedAt: string;
  lineNames: string[];
  stations: StationRecord[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** LineString の中点（座標の平均）。読めなければ null。 */
export function midpointOf(
  geometry: StationFeature["geometry"],
): [number, number] | null {
  if (!geometry || geometry.type !== "LineString") return null;
  const coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  let sLat = 0;
  let sLon = 0;
  let n = 0;
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    sLat += lat;
    sLon += lon;
    n++;
  }
  if (n === 0) return null;
  const lat = sLat / n;
  const lon = sLon / n;
  /* 日本の外は取り違え（経緯度の順など）。捨てる */
  if (lat < 20 || lat > 46 || lon < 122 || lon > 154) return null;
  return [lat, lon];
}

/**
 * 駅の feature の集まりから、畳んだ一覧と路線名の表を作る。純粋関数。
 * 落としたものは `dropped` に理由つきで返す（黙って落とさない）。
 */
export function stationsFromFeatures(features: readonly StationFeature[]): {
  lineNames: string[];
  stations: StationRecord[];
  dropped: { reason: string; count: number }[];
} {
  const lineIndex = new Map<string, number>();
  const lineNames: string[] = [];
  const lineId = (name: string) => {
    let i = lineIndex.get(name);
    if (i === undefined) {
      i = lineNames.length;
      lineNames.push(name);
      lineIndex.set(name, i);
    }
    return i;
  };
  const groups = new Map<
    string,
    { name: string; sLat: number; sLon: number; n: number; lines: Set<number> }
  >();
  const drop = new Map<string, number>();
  const bump = (r: string) => drop.set(r, (drop.get(r) ?? 0) + 1);

  for (const f of features) {
    const p = f.properties ?? {};
    const name = str(p.N02_005);
    const group = str(p.N02_005g) || str(p.N02_005c);
    if (!name || !group) {
      bump("駅名かグループコードが無い");
      continue;
    }
    const mid = midpointOf(f.geometry);
    if (!mid) {
      bump("座標が読めない（LineString でない・日本の外）");
      continue;
    }
    const operator = str(p.N02_004);
    const line = str(p.N02_003);
    const label = [operator, line].filter(Boolean).join(" ");
    const g = groups.get(group) ?? {
      name,
      sLat: 0,
      sLon: 0,
      n: 0,
      lines: new Set<number>(),
    };
    g.sLat += mid[0];
    g.sLon += mid[1];
    g.n++;
    if (label) g.lines.add(lineId(label));
    groups.set(group, g);
  }

  const stations: StationRecord[] = [];
  for (const [id, g] of groups) {
    stations.push({
      id,
      name: g.name,
      lat: Number((g.sLat / g.n).toFixed(5)),
      lon: Number((g.sLon / g.n).toFixed(5)),
      l: [...g.lines].sort((a, b) => a - b),
    });
  }
  stations.sort((a, b) => a.id.localeCompare(b.id));
  return {
    lineNames,
    stations,
    dropped: [...drop.entries()].map(([reason, count]) => ({ reason, count })),
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const path = arg("--geojson");
  if (!path) {
    console.error("--geojson <N02-25_Station.geojson のパス> が要る。");
    process.exitCode = 1;
    return;
  }
  const body = JSON.parse(readFileSync(path, "utf8")) as {
    features?: StationFeature[];
  };
  const features = body.features ?? [];
  console.log(`読んだ feature: ${features.length}`);

  const { lineNames, stations, dropped } = stationsFromFeatures(features);
  for (const d of dropped) console.log(`  落とした: ${d.reason} … ${d.count}`);
  console.log(`駅（グループで畳んだ後）: ${stations.length}`);
  console.log(`路線名（事業者 路線）: ${lineNames.length}`);

  /* 桁の見張り。全国の駅は 9 千台のはず。半分を切ったら入力が違う */
  if (stations.length < 5000) {
    console.error(`::error::駅が ${stations.length} しか無い。入力を疑う`);
    process.exitCode = 1;
    return;
  }

  const out: StationsFile = {
    source: "国土数値情報（鉄道データ）（国土交通省）N02-25",
    sourceUrl: SOURCE_URL,
    note: "駅は線分の中点をグループコードで畳んだ点。所在地は持たない（表示時に座標から引く）。",
    generatedAt: new Date().toISOString().slice(0, 10),
    lineNames,
    stations,
  };
  writeFileSync(OUT, `${JSON.stringify(out)}\n`, "utf8");
  console.log(
    `書き出した: ${OUT}（${JSON.stringify(out).length.toLocaleString()} 文字）`,
  );
}

if (process.argv[1] && /import_stations\.ts$/.test(process.argv[1])) {
  main();
}
