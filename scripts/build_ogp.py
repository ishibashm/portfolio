#!/usr/bin/env python3
"""public/ogp.png（サイト共通の共有カード 1200x630）を作り直す。

文言は src/lib/siteUrl.ts の SITE_TAGLINE と揃える。タグラインを変えたら
HEADLINE を直してこのスクリプトを流し直す:

    python3 scripts/build_ogp.py

必要なもの: Pillow, numpy, Noto Serif/Sans CJK JP（fonts-noto-cjk）。
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = Path(__file__).resolve().parent.parent / "public" / "ogp.png"

KICKER = "CLOUD PALETTE"
# SITE_TAGLINE「引越し先を方位と家賃相場で比較して決める」を 2 行に割る
HEADLINE = ["引越し先を方位と", "家賃相場で比較して決める"]
SUB = "九星気学の方位盤と賃貸物件のデータを、同じ基準で突き合わせます。"

RED = (197, 49, 79)
INK = (28, 25, 23)
GRAY = (84, 88, 84)

FONT_DIR = Path("/usr/share/fonts/opentype/noto")
SERIF_BOLD = (FONT_DIR / "NotoSerifCJK-Bold.ttc", 0)
SANS_REG = (FONT_DIR / "NotoSansCJK-Regular.ttc", 0)
SANS_BOLD = (FONT_DIR / "NotoSansCJK-Bold.ttc", 0)


def font(spec, size):
    path, _ = spec
    # ttc の中から JP の面を選ぶ
    for idx in range(10):
        try:
            f = ImageFont.truetype(str(path), size, index=idx)
        except OSError:
            break
        if "JP" in f.getname()[0]:
            return f
    return ImageFont.truetype(str(path), size)


def background():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    t = (x / W * 0.6 + y / H * 0.4)[..., None]
    top_left = np.array([253, 243, 245], np.float32)
    bottom_right = np.array([252, 246, 237], np.float32)
    img = top_left * (1 - t) + bottom_right * t

    def blob(cx, cy, r, color, strength):
        d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r
        a = (np.exp(-(d**2) * 2.2) * strength)[..., None]
        return a, np.array(color, np.float32)

    for cx, cy, r, color, s in [
        (1170, 90, 430, (247, 208, 210), 0.95),  # 右上の淡い紅
        (20, 630, 330, (212, 235, 224), 0.95),  # 左下の淡い若草
    ]:
        a, c = blob(cx, cy, r, color, s)
        img = img * (1 - a) + c * a
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def draw_tracked(draw, xy, text, fnt, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + tracking


def main():
    img = background()
    d = ImageDraw.Draw(img)
    left = 90

    draw_tracked(d, (left, 126), KICKER, font(SANS_BOLD, 22), RED, 7)

    head = font(SERIF_BOLD, 76)
    for i, line in enumerate(HEADLINE):
        draw_tracked(d, (left, 182 + i * 98), line, head, INK, 2)

    d.text((left, 418), SUB, font=font(SANS_REG, 26), fill=GRAY)
    d.rectangle([left, 503, left + 103, 507], fill=RED)

    img = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).convert("RGB")
    img.save(OUT, optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
