#!/usr/bin/env python3
"""ホームの天気地図用に、地理院タイル「世界衛星モザイク画像」(modis) を
等距円筒図法へ再投影し、静的 WebP にする。ランタイムではタイルを取らない。

元データ:
  https://cyberjapandata.gsi.go.jp/xyz/modis/{z}/{x}/{y}.png  (ズーム 2〜8)
  地理院タイル一覧: https://maps.gsi.go.jp/development/ichiran.html#modis
  利用規約: https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
  追加の出所表示（備考どおり）:
    Images on 世界衛星モザイク画像 obtained from site
    https://lpdaac.usgs.gov/data_access maintained by the NASA Land Processes
    Distributed Active Archive Center (LP DAAC), USGS/Earth Resources
    Observation and Science (EROS) Center, Sioux Falls, South Dakota, (2015).
    Source of image data product: MODIS (NASA).

このスクリプトはビルド時に手動で一度走らせるもの。定期的な自動取得はしない。

使い方:
  python3 scripts/build_weather_map_satellite.py
"""
from __future__ import annotations

import math
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "weather"
CACHE = Path("/tmp/gsi-modis-z7")
TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/modis/{z}/{x}/{y}.png"
UA = "cloud-palette.com weather-map static asset build (one-time; contact via site)"
Z = 7
OCEAN = (11, 22, 34)

# mapProjection.ts / build_japan_weather_map.py と同じ定数
SCALE = 38.0
KX = math.cos(math.radians(36))
MAIN = {"lon0": 128.4, "lat0": 45.9, "dx": 0.0, "dy": 0.0}
INSET = {"lon0": 122.8, "lat0": 28.7, "dx": 8.0, "dy": 8.0}

# 投影座標での出力範囲（本土は輪郭の周囲に海を少し残す）
MAIN_EXTENT = dict(x0=-8, y0=0, x1=640, y1=610)
INSET_EXTENT = dict(x0=4, y0=4, x1=4 + int(8.6 * KX * SCALE + 8), y1=4 + int(4.7 * SCALE + 8))
# 表示の約 2 倍になる程度。scale 0.55 の広い地図で十分に解像する。
MAIN_SCALE = 1.25
INSET_SCALE = 2.0


def lonlat_to_tile_px(lon: float, lat: float, z: int):
    n = 2 ** z
    lat = max(min(lat, 85.05112878), -85.05112878)
    x = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    y = (1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n
    return x * 256.0, y * 256.0


def projected_to_lonlat(x: float, y: float, frame: dict):
    lon = (x - frame["dx"]) / (KX * SCALE) + frame["lon0"]
    lat = frame["lat0"] - (y - frame["dy"]) / SCALE
    return lon, lat


def tile_path(z: int, x: int, y: int) -> Path:
    return CACHE / f"{z}_{x}_{y}.png"


def fetch_tile(z: int, x: int, y: int) -> Path | None:
    dest = tile_path(z, x, y)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    url = TILE_URL.format(z=z, x=x, y=y)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            data = res.read()
        if not data:
            return None
        dest.write_bytes(data)
        return dest
    except Exception as exc:  # noqa: BLE001
        print(f"skip {z}/{x}/{y}: {exc}", file=sys.stderr)
        return None


def needed_tiles(extent: dict, frame: dict, z: int):
    corners = [
        projected_to_lonlat(extent["x0"], extent["y0"], frame),
        projected_to_lonlat(extent["x1"], extent["y0"], frame),
        projected_to_lonlat(extent["x0"], extent["y1"], frame),
        projected_to_lonlat(extent["x1"], extent["y1"], frame),
    ]
    xs, ys = [], []
    n = 2 ** z
    for lon, lat in corners:
        px, py = lonlat_to_tile_px(lon, lat, z)
        xs.append(px / 256.0)
        ys.append(py / 256.0)
    xmin = max(0, int(math.floor(min(xs))))
    xmax = min(n - 1, int(math.floor(max(xs))))
    ymin = max(0, int(math.floor(min(ys))))
    ymax = min(n - 1, int(math.floor(max(ys))))
    return [(z, x, y) for x in range(xmin, xmax + 1) for y in range(ymin, ymax + 1)]


def load_tiles(keys: list[tuple[int, int, int]]):
    CACHE.mkdir(parents=True, exist_ok=True)
    unique = list(dict.fromkeys(keys))
    print(f"fetching {len(unique)} tiles (cached if present)")
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {pool.submit(fetch_tile, z, x, y): (z, x, y) for z, x, y in unique}
        for i, fut in enumerate(as_completed(futs), 1):
            fut.result()
            if i % 20 == 0 or i == len(unique):
                print(f"  {i}/{len(unique)}")
            time.sleep(0.01)


def sample_mosaic(tiles: dict, lon: float, lat: float, z: int):
    px, py = lonlat_to_tile_px(lon, lat, z)
    tx, ty = int(math.floor(px / 256.0)), int(math.floor(py / 256.0))
    im = tiles.get((z, tx, ty))
    if im is None:
        return OCEAN
    ix, iy = int(px - tx * 256), int(py - ty * 256)
    ix = min(max(ix, 0), im.size[0] - 1)
    iy = min(max(iy, 0), im.size[1] - 1)
    pix = im.getpixel((ix, iy))
    r, g, b = pix[:3]
    a = pix[3] if len(pix) > 3 else 255
    # 配信範囲外は無彩色の灰で埋められている。海色に置き換える。
    if a < 200 or (abs(r - g) < 8 and abs(g - b) < 8 and 40 <= r <= 70):
        return OCEAN
    return (r, g, b)


def render(extent: dict, frame: dict, scale: float, tiles: dict) -> Image.Image:
    w = max(1, int(round((extent["x1"] - extent["x0"]) * scale)))
    h = max(1, int(round((extent["y1"] - extent["y0"]) * scale)))
    im = Image.new("RGB", (w, h), (18, 30, 52))
    px = im.load()
    for j in range(h):
        y = extent["y0"] + (j + 0.5) / scale
        for i in range(w):
            x = extent["x0"] + (i + 0.5) / scale
            lon, lat = projected_to_lonlat(x, y, frame)
            px[i, j] = sample_mosaic(tiles, lon, lat, Z)
        if j % 80 == 0:
            print(f"    row {j}/{h}")
    return im


def grade(im: Image.Image) -> Image.Image:
    """紺寄りの落ち着いた色に整える（加工なので出典にその旨を書く）。"""
    im = ImageEnhance.Color(im).enhance(0.82)
    im = ImageEnhance.Contrast(im).enhance(1.08)
    im = ImageEnhance.Brightness(im).enhance(0.92)
    # 影を紺に寄せ、ハイライトは残す
    out = Image.new("RGB", im.size)
    src, dst = im.load(), out.load()
    w, h = im.size
    for j in range(h):
        for i in range(w):
            r, g, b = src[i, j]
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            t = 1 - (lum / 255.0)  # 暗いほど強い
            t = t * t * 0.42
            nr = int(r * (1 - t) + 22 * t)
            ng = int(g * (1 - t) + 36 * t)
            nb = int(b * (1 - t) + 72 * t)
            dst[i, j] = (nr, ng, nb)
    return out.filter(ImageFilter.UnsharpMask(radius=0.8, percent=35, threshold=3))


def save_webp(im: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=82, method=6)
    print(path, path.stat().st_size, "bytes", im.size)


def main():
    keys = needed_tiles(MAIN_EXTENT, MAIN, Z) + needed_tiles(INSET_EXTENT, INSET, Z)
    load_tiles(keys)
    tiles = {}
    for z, x, y in dict.fromkeys(keys):
        p = tile_path(z, x, y)
        if p.exists() and p.stat().st_size > 0:
            try:
                tiles[(z, x, y)] = Image.open(p).convert("RGBA")
            except Exception as exc:  # noqa: BLE001
                print(f"bad tile {p}: {exc}", file=sys.stderr)
    print("rendering main…")
    main_im = grade(render(MAIN_EXTENT, MAIN, MAIN_SCALE, tiles))
    print("rendering inset…")
    inset_im = grade(render(INSET_EXTENT, INSET, INSET_SCALE, tiles))
    save_webp(main_im, OUT_DIR / "japan-satellite-main.webp")
    save_webp(inset_im, OUT_DIR / "japan-satellite-inset.webp")
    meta = OUT_DIR / "README.md"
    meta.write_text(
        "この画像は scripts/build_weather_map_satellite.py で作成した静的素材です。\n\n"
        "地理院タイル（世界衛星モザイク画像）を再投影・色調整して作成。\n"
        "タイル: https://cyberjapandata.gsi.go.jp/xyz/modis/{z}/{x}/{y}.png\n"
        "一覧: https://maps.gsi.go.jp/development/ichiran.html#modis\n"
        "規約: https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html\n"
        "追加出所: Images on 世界衛星モザイク画像 obtained from site "
        "https://lpdaac.usgs.gov/data_access maintained by the NASA Land Processes "
        "Distributed Active Archive Center (LP DAAC), USGS/Earth Resources "
        "Observation and Science (EROS) Center, Sioux Falls, South Dakota, (2015). "
        "Source of image data product: MODIS (NASA).\n",
        encoding="utf-8",
    )
    print("done")


if __name__ == "__main__":
    main()
