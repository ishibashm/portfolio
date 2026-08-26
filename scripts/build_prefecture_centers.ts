/**
 * 県の「地理的な代表点」（面積重心）を public/prefectures.geojson から
 * 計算して src/data/prefectureCenters.json に書き出す。
 *
 * ## なぜ要るか
 *
 * 俯瞰の県塗り（arbitrage・timing の「どの県へ動けるか」）は、出発地から
 * 県の代表点への方位で県全体を 1 つの方位に割り当てる。この代表点に
 * SCRAPE_TARGETS の座標（スクレイパーの巡回起点＝概ね県庁所在地）を
 * 流用していたが、県庁は県の端にあることが多い。実害が出たのが兵庫で、
 * 代表点の神戸は県の南東端。京都からだと神戸へは 236°（南西）だが、
 * 県の北半分（丹波・豊岡）は北西にあり、「自分の北西の県」が南西の
 * 判定色で塗られていた（利用者報告 2026-08-27）。
 *
 * 面積重心なら県の広がりの真ん中を指す（兵庫: 134.83, 35.09 ≒ 中央部。
 * 京都からは 276°=西）。塗っているポリゴンと同じ geojson から計算する
 * ので、見えている形と割り当てが食い違わない。
 *
 * ## 実行
 *
 *   npx tsx scripts/build_prefecture_centers.ts
 *
 * geojson を差し替えたら再実行してコミットする。値は決定的。
 */
import * as fs from "fs";
import * as path from "path";

type Ring = [number, number][];

/** 多角形 1 環の符号付き面積と重心（shoelace）。経緯度の平面近似。 */
function ringCentroid(ring: Ring): { cx: number; cy: number; area: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (a === 0) return { cx: 0, cy: 0, area: 0 };
  return { cx: cx / (3 * a), cy: cy / (3 * a), area: Math.abs(a / 2) };
}

const geoPath = path.join(process.cwd(), "public", "prefectures.geojson");
const outPath = path.join(
  process.cwd(),
  "src",
  "data",
  "prefectureCenters.json",
);

const geo = JSON.parse(fs.readFileSync(geoPath, "utf8")) as {
  features: {
    properties: { name: string };
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: Ring[] | Ring[][];
    };
  }[];
};

const out: Record<string, { lat: number; lon: number }> = {};
for (const f of geo.features) {
  const polys = (
    f.geometry.type === "MultiPolygon"
      ? f.geometry.coordinates
      : [f.geometry.coordinates]
  ) as Ring[][];
  // 島は外環だけ足す（穴は無視。県レベルの代表点には効かない）
  let sx = 0;
  let sy = 0;
  let sa = 0;
  for (const p of polys) {
    const { cx, cy, area } = ringCentroid(p[0]);
    sx += cx * area;
    sy += cy * area;
    sa += area;
  }
  if (sa === 0) continue;
  out[f.properties.name] = {
    lon: Number((sx / sa).toFixed(4)),
    lat: Number((sy / sa).toFixed(4)),
  };
}

const names = Object.keys(out);
if (names.length !== 47) {
  throw new Error(`47 都道府県が揃っていない: ${names.length} 件`);
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`${names.length} 件を書き出した: ${outPath}`);
console.log("例: 兵庫県 =", out["兵庫県"]);
