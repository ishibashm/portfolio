/**
 * 用途地域の**全国の俯瞰**（z5〜z10）の画像タイルを一度だけ焼く。
 *
 * ## なぜ焼くか
 *
 * タイル API（XKT002）は z11 までしか受け付けない（probe run 33946832674。
 * z5〜10 は HTTP 400）。俯瞰の 1 画面は z11 の数千枚になるので、API から
 * 組む道は無い。国土数値情報 A29（用途地域。県ごとの zip。無償・出典の
 * 明示が条件）の GeoJSON を**一度だけ**取って、手元で絵に焼く。
 * 用途地域は年に 1 回も変わらないので、定時で回さない。
 *
 * ## どう焼くか
 *
 * - 塗りは API と同じ `lib/zoningRaster` の `paintZoningInto`。色も境界も
 *   1 か所。A29 の番号（A29_004）は上流の youto_id と同じ体系（probe
 *   run 33948260727 で実測）なので、`youto_id` に渡す。名前（A29_005）は
 *   漢数字で API と綴りが違うため渡さない（番号だけで引ける）
 * - 1,900 前後の市区町村ファイルを順に読み、触るタイルの RGBA を
 *   タイルごとに持って塗り足す。最後に、何か塗られたタイルだけ PNG に
 *   書く。空のタイルは書かない（無ければ透明＝Leaflet の errorTileUrl）
 * - 出力は `public/zoning-overview/{z}/{x}/{y}.png`。静的に配れて CDN が
 *   効く。既定は z5〜z9（z10 は API の画像タイルが受け持つ）。鳥取 1 県の
 *   試運転は 270 区画 → 18 枚 144KB（run 33955644570）
 *
 * ## 走らせ方
 *
 *   npx tsx scripts/bake_zoning_overview.ts --dir /tmp/a29 [--zooms 5-10]
 *
 * `--dir` の下を再帰で探し、`.geojson` を全部読む（ワークフローが
 * 47 県の zip を展開しておく）。
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ZONING_TILE_SIZE,
  encodePng,
  paintZoningInto,
} from "../src/lib/zoningRaster";
import type { RawZoningFeature } from "../src/lib/zoningUpstream";
import { latToTileY, lonToTileX } from "../src/lib/tileCoords";

const OUT_DIR = "public/zoning-overview";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.geojson$/i.test(name)) yield p;
  }
}

/** 経緯度の bbox。座標は [lon, lat] の入れ子。 */
function bboxOf(coords: unknown, b: number[]): void {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === "number") {
    const lon = coords[0] as number;
    const lat = coords[1] as number;
    if (lon < b[0]) b[0] = lon;
    if (lat < b[1]) b[1] = lat;
    if (lon > b[2]) b[2] = lon;
    if (lat > b[3]) b[3] = lat;
    return;
  }
  for (const c of coords) bboxOf(c, b);
}

/** A29 の feature を、塗りが読む形（youto_id）に写す。 */
export function toZoningFeature(f: {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}): RawZoningFeature | null {
  const g = f.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return null;
  const id = Number(f.properties?.A29_004);
  if (!Number.isFinite(id)) return null;
  return {
    type: "Feature",
    geometry: { type: g.type, coordinates: g.coordinates },
    properties: { youto_id: id },
  };
}

/** feature の bbox が触るタイル (x, y) の範囲。 */
export function tileRange(
  bbox: [number, number, number, number],
  z: number,
): { x0: number; x1: number; y0: number; y1: number } {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return {
    x0: lonToTileX(minLon, z),
    x1: lonToTileX(maxLon, z),
    y0: latToTileY(maxLat, z),
    y1: latToTileY(minLat, z),
  };
}

function main() {
  const dir = arg("--dir");
  if (!dir) {
    console.error("--dir <A29 を展開したディレクトリ> が要る。");
    process.exitCode = 1;
    return;
  }
  /* 既定は z5〜z9。z10 は API の画像タイル（z11 を縮めて描く）が既に
     受け持っている。z10 まで焼くと枚数が 4 倍になり repo が重くなる
     （鳥取 1 県の試運転で z10 が 7 枚 / 18 枚。run 33955644570） */
  const zoomsArg = arg("--zooms") ?? "5-9";
  /* 試運転（1 県だけ）では枚数が少なくて当然なので、下限を下げられる */
  const minTiles = Number(arg("--min-tiles") ?? "100");
  const [zLo, zHi] = zoomsArg.split("-").map(Number);
  const zooms: number[] = [];
  for (let z = zLo; z <= zHi; z++) zooms.push(z);

  const files = [...walk(dir)].sort();
  console.log(`GeoJSON: ${files.length} 本、ズーム: ${zooms.join(",")}`);

  /** タイルごとの RGBA。鍵は "z/x/y"。 */
  const tiles = new Map<string, Uint8ClampedArray>();
  let features = 0;
  let skipped = 0;
  const started = Date.now();

  for (const [i, file] of files.entries()) {
    let body: { features?: unknown[] };
    try {
      body = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      console.log(`読めない: ${file}`);
      skipped++;
      continue;
    }
    const list = (body.features ?? []) as {
      geometry?: { type?: string; coordinates?: unknown };
      properties?: Record<string, unknown>;
    }[];
    for (const raw of list) {
      const f = toZoningFeature(raw);
      if (!f) {
        skipped++;
        continue;
      }
      features++;
      const b = [Infinity, Infinity, -Infinity, -Infinity];
      bboxOf(f.geometry?.coordinates, b);
      if (!Number.isFinite(b[0])) continue;
      for (const z of zooms) {
        const r = tileRange(b as [number, number, number, number], z);
        for (let x = r.x0; x <= r.x1; x++) {
          for (let y = r.y0; y <= r.y1; y++) {
            const key = `${z}/${x}/${y}`;
            let rgba = tiles.get(key);
            if (!rgba) {
              rgba = new Uint8ClampedArray(
                ZONING_TILE_SIZE * ZONING_TILE_SIZE * 4,
              );
              tiles.set(key, rgba);
            }
            paintZoningInto(rgba, [f], z, x, y);
          }
        }
      }
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `  ${i + 1}/${files.length} 本、区画 ${features.toLocaleString()}、タイル ${tiles.size}、${Math.round((Date.now() - started) / 1000)} 秒`,
      );
    }
  }

  /* 何か塗られたタイルだけ書く */
  let written = 0;
  let bytes = 0;
  const perZoom = new Map<number, number>();
  for (const [key, rgba] of tiles) {
    let painted = false;
    for (let p = 3; p < rgba.length; p += 4) {
      if (rgba[p] !== 0) {
        painted = true;
        break;
      }
    }
    if (!painted) continue;
    const [z, x, y] = key.split("/").map(Number);
    const png = encodePng(rgba, ZONING_TILE_SIZE, ZONING_TILE_SIZE);
    const outDir = join(OUT_DIR, String(z), String(x));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${y}.png`), png);
    written++;
    bytes += png.length;
    perZoom.set(z, (perZoom.get(z) ?? 0) + 1);
  }

  console.log(
    `\n区画: ${features.toLocaleString()}（読めなかったもの ${skipped}）`,
  );
  console.log(
    `書いたタイル: ${written} 枚、${(bytes / 1024 / 1024).toFixed(1)} MB`,
  );
  for (const z of zooms) console.log(`  z${z}: ${perZoom.get(z) ?? 0} 枚`);
  console.log(`所要: ${Math.round((Date.now() - started) / 1000)} 秒`);
  if (written < minTiles) {
    console.error(
      `::error::タイルが ${written} 枚しか無い（下限 ${minTiles}）。入力を疑う`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && /bake_zoning_overview\.ts$/.test(process.argv[1])) {
  main();
}
