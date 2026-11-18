"""ホームの「今日の全国の天気」地図に使う日本の輪郭（SVG パス）を作る。

元データ: Natural Earth 1:10m Cultural Vectors「Admin 0 – Countries」の日本視点版（point of view: JPN。
 北方領土・竹島を日本として含む）
（https://www.naturalearthdata.com/ 、パブリックドメイン。
 https://www.naturalearthdata.com/about/terms-of-use/ ）。
GitHub のミラー nvkelso/natural-earth-vector の geojson を読み、日本（ADM0_A3=JPN）
だけを取り出して、等距円筒図法（経度を cos36° で縮める）で投影し、
Douglas–Peucker で間引いて src/data/japanMapPaths.json に書く。

使い方:
  curl -L -o /tmp/ne_10m_admin_0_countries_jpn.geojson \
    https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_jpn.geojson
  python3 scripts/build_japan_weather_map.py /tmp/ne_10m_admin_0_countries_jpn.geojson

投影の定数は src/lib/todayWeather/mapProjection.ts と同じにしておくこと。
"""
import json
import math
import sys
from pathlib import Path

# --- 投影（mapProjection.ts と同じ値） ---
SCALE = 38.0  # 1 度あたりの px（緯度方向）
KX = math.cos(math.radians(36))
MAIN = {"lon0": 128.4, "lat0": 45.9, "dx": 0.0, "dy": 0.0}
# 南西諸島は左上の囲みに置く（本土と同じ縮尺）
INSET = {"lon0": 122.8, "lat0": 28.7, "dx": 8.0, "dy": 8.0}
INSET_BOUNDS = (122.8, 131.4, 24.0, 28.7)  # lonmin, lonmax, latmin, latmax
TOLERANCE = 0.9  # px
MIN_AREA = 6.0  # px^2 未満の島は省く


def proj(lon, lat, frame):
    x = (lon - frame["lon0"]) * KX * SCALE + frame["dx"]
    y = (frame["lat0"] - lat) * SCALE + frame["dy"]
    return x, y


def rdp(points, tol):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if norm == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def area(points):
    s = 0.0
    for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def to_path(points):
    out = []
    px = py = None
    for i, (x, y) in enumerate(points):
        x, y = round(x), round(y)
        if (x, y) == (px, py):
            continue
        out.append(f"{'M' if i == 0 else 'L'}{x} {y}")
        px, py = x, y
    if len(out) < 3:
        return ""
    return "".join(out) + "Z"


def main(src):
    data = json.loads(Path(src).read_text())
    jp = next(
        f for f in data["features"] if f["properties"].get("ADM0_A3") == "JPN"
    )
    main_paths, inset_paths = [], []
    for poly in jp["geometry"]["coordinates"]:
        ring = poly[0]  # 外周だけ使う（湖の穴は小さいので省く）
        lons = [p[0] for p in ring]
        lats = [p[1] for p in ring]
        cx, cy = sum(lons) / len(lons), sum(lats) / len(lats)
        lonmin, lonmax, latmin, latmax = INSET_BOUNDS
        if lonmin <= cx <= lonmax and latmin <= cy <= latmax and cy < 28.7:
            frame, bucket = INSET, inset_paths
        elif cy < 24.0 or cx > 149.5 or cy < 30.0 and cx > 131.5:
            continue  # 小笠原・沖ノ鳥島・南鳥島などは地図の外
        else:
            frame, bucket = MAIN, main_paths
        pts = [proj(lon, lat, frame) for lon, lat in ring[:-1]]
        if area(pts) < MIN_AREA:
            continue
        simple = rdp(pts + [pts[0]], TOLERANCE)[:-1]
        if len(simple) < 3 or area(simple) < MIN_AREA:
            continue
        d = to_path(simple)
        if d:
            bucket.append(d)
    out = {
        "source": "Natural Earth 1:10m Admin 0 – Countries, point of view JPN (public domain)",
        "main": "".join(main_paths),
        "inset": "".join(inset_paths),
    }
    dest = Path(__file__).resolve().parent.parent / "src/data/japanMapPaths.json"
    dest.write_text(json.dumps(out, ensure_ascii=False) + "\n")
    print(dest, len(main_paths), len(inset_paths), dest.stat().st_size, "bytes")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ne_10m_admin_0_countries_jpn.geojson")
