"""初代 案内役「しるべ」の画像を作る（docs/guide-character.md）。

使い方:
  python3 scripts/guide/make_guide_assets.py cut  <pose>=<source.jpg> ...
      無地の藍色背景の元絵から背景を抜き、public/guide/shirube-<pose>-master.png を作る。
  python3 scripts/guide/make_guide_assets.py derive
      master.png から 96/240/480 幅の AVIF・WebP を作り直す。

背景抜きはスライド（scripts/blog/slides_v27.py の cutout）と同じ方式。
**上辺と左右の辺からだけ**塗りつぶしで背景をたどるので、紺の羽織のように
背景に近い暗い色でも、縁と繋がっていなければ透けない。
目安: 96 幅 15KB 以下、240 幅 40KB 以下、480 幅 80KB 以下。
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "guide")
WIDTHS = (96, 240, 480)
LIMITS = {96: 15_000, 240: 40_000, 480: 80_000}


def _f(mask, flt):
    return np.asarray(Image.fromarray((mask * 255).astype("uint8")).filter(flt)) > 0


def cutout(im):
    a = np.asarray(im, float)
    border = np.concatenate([a[0], a[:, 0], a[:, -1]])
    bg = np.median(border, 0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    h, w = d.shape
    core = Image.fromarray(np.where(d < 30, 255, 0).astype("uint8")).copy()
    seeds = (
        [(x, 0) for x in range(0, w, 12)]
        + [(0, y) for y in range(0, int(h * 0.85), 12)]
        + [(w - 1, y) for y in range(0, int(h * 0.85), 12)]
    )
    for p in seeds:
        if core.getpixel(p) == 255:
            ImageDraw.floodfill(core, p, 128)
    c = np.asarray(core) == 128
    alpha = np.ones_like(d)
    near = _f(c, ImageFilter.MaxFilter(9))
    alpha[near] = np.clip((d[near] - 10) / 24, 0, 1)
    alpha[c] = np.clip((d[c] - 12) / 50, 0, 1) ** 1.5
    alpha[c & (d < 12)] = 0
    alpha = np.asarray(
        Image.fromarray((alpha * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(1.0)),
        float,
    ) / 255
    al = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - bg * (1 - al)) / al, 0, 255)
    o = Image.fromarray(np.dstack([rgb, alpha * 255]).astype("uint8"), "RGBA")
    # ほぼ透明な画素で枠が広がらないよう、はっきり見える所で切り詰める
    solid = o.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    return o.crop(solid.getbbox())


def derive(pose):
    m = Image.open(os.path.join(OUT, f"shirube-{pose}-master.png"))
    for w in WIDTHS:
        r = m.resize((w, round(m.height * w / m.width)), Image.LANCZOS)
        for ext, kw in (("webp", dict(quality=82, method=6)), ("avif", dict(quality=60, speed=4))):
            path = os.path.join(OUT, f"shirube-{pose}-{w}.{ext}")
            r.save(path, **kw)
            size = os.path.getsize(path)
            assert size <= LIMITS[w], (path, size)
            print(path, r.size, size)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    if sys.argv[1] == "cut":
        for arg in sys.argv[2:]:
            pose, src = arg.split("=", 1)
            cutout(Image.open(src).convert("RGB")).save(
                os.path.join(OUT, f"shirube-{pose}-master.png"), optimize=True
            )
            derive(pose)
    else:
        for f in sorted(os.listdir(OUT)):
            if f.endswith("-master.png"):
                derive(f[len("shirube-") : -len("-master.png")])
