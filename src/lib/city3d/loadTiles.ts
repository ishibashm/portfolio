import { VectorTile, classifyRings } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { coveringTiles, type Location } from "./geo";
import { convertRings, footprint, type CityData } from "./features";
export async function loadTiles(
  origin: Location,
  radius: number,
  cap: number,
  signal: AbortSignal,
): Promise<CityData> {
  const data: CityData = {
    buildings: [],
    roads: [],
    rails: [],
    water: [],
    failedTiles: 0,
  };
  const results = await Promise.allSettled(
    coveringTiles(origin, radius).map(async (tile) => {
      const response = await fetch(
        `https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/${tile.z}/${tile.x}/${tile.y}.pbf`,
        { signal },
      );
      if (!response.ok) throw new Error("地図タイルを取得できませんでした。");
      const vt = new VectorTile(new Pbf(await response.arrayBuffer()));
      const part: CityData = {
        buildings: [],
        roads: [],
        rails: [],
        water: [],
        failedTiles: 0,
      };
      for (const name of ["BldA", "RdEdg", "RdCL", "RailCL", "WA"]) {
        const layer = vt.layers[name];
        if (!layer) continue;
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          const raw = f.loadGeometry();
          const rings = convertRings(raw, tile, f.extent, origin);
          if (name === "BldA") {
            // 離れた外周を穴と誤認しないよう、タイルの巻き方向で分ける。
            for (const polygon of classifyRings(raw)) {
              const b = footprint(
                convertRings(polygon, tile, f.extent, origin),
                Number(f.properties.vt_code),
              );
              if (b && Math.hypot(b.centroid.x, b.centroid.z) <= radius)
                part.buildings.push(b);
            }
          } else
            part[
              name === "WA" ? "water" : name === "RailCL" ? "rails" : "roads"
            ].push(...rings);
        }
      }
      return part;
    }),
  );
  signal.throwIfAborted();
  for (const result of results) {
    if (result.status === "rejected") {
      data.failedTiles++;
      continue;
    }
    for (const key of ["buildings", "roads", "rails", "water"] as const)
      (data[key] as unknown[]).push(...result.value[key]);
  }
  data.buildings.sort(
    (a, b) =>
      Math.hypot(a.centroid.x, a.centroid.z) -
      Math.hypot(b.centroid.x, b.centroid.z),
  );
  data.buildings = data.buildings.slice(0, cap);
  return data;
}
