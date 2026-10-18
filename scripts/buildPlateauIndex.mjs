import { readFile, writeFile } from "node:fs/promises";
const source = process.argv[2];
const catalog = source
  ? JSON.parse(await readFile(source, "utf8"))
  : await fetch(
      "https://api.plateau.reearth.io/datacatalog/plateau-datasets",
    ).then((r) => {
      if (!r.ok) throw new Error(`カタログ取得失敗:${r.status}`);
      return r.json();
    });
const selected = new Map();
for (const d of catalog.datasets) {
  if (d.type_en !== "bldg" || d.format !== "3D Tiles" || String(d.lod) !== "1")
    continue;
  const code = d.ward_code || d.city_code;
  if (!/^\d{5}$/.test(code) || !d.url?.startsWith("https://")) continue;
  const prev = selected.get(code);
  if (
    !prev ||
    d.year > prev.year ||
    (d.year === prev.year &&
      (Number(d.texture) < Number(prev.texture) ||
        (d.texture === prev.texture && d.file_size < prev.file_size)))
  )
    selected.set(code, d);
}
// 名称は自治体名。索引には描画に必要な最小限の属性だけ残す。
const index = Object.fromEntries(
  [...selected]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, d]) => [code, { url: d.url, year: d.year, name: d.city }]),
);
await writeFile(
  new URL("../src/data/plateauBldgTilesets.json", import.meta.url),
  JSON.stringify(index) + "\n",
);
console.log(`${selected.size}件の索引を生成しました。`);
