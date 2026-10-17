#!/usr/bin/env python3
"""v22 "lecture board" slides. See docs/blog-slide-design.md (v22).

Deep-space background generated in code (seeded noise, no external image),
a cream-framed table panel with light-blue / gold cells, a dark metallic band
with red 【keyword】 labels, and an angled navy badge top-right.
Fonts: Noto Sans CJK JP Bold (system, OFL) and Dela Gothic One (OFL). Not bundled.
Usage: python3 scripts/blog/slides_v22.py four-foundations-of-eastern-divination
"""
from functools import lru_cache
from pathlib import Path
import re
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
W, H, S = 1800, 945, 2
SKY, CREAM, BLUE, GOLDC = '#BEE3F2', '#F6EFD9', '#A9DCEF', '#F6B81C'
NAVY, RED, INK = '#1F2D6B', '#D7261E', '#111111'


@lru_cache(None)
def font(size, role='gothic'):
    if role == 'heavy':
        return ImageFont.truetype(str(Path.home()/'.local/share/fonts/ofl/DelaGothicOne-Regular.ttf'), size*S)
    return ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', size*S, index=0)


def nebula(seed):
    rng = np.random.default_rng(seed)
    w, h = W*S//4, H*S//4
    def noise(scale):
        small = rng.random((h//scale+2, w//scale+2))
        return np.asarray(Image.fromarray((small*255).astype('uint8')).resize((w, h), Image.BICUBIC), float)/255
    cloud = sum(noise(s)*a for s, a in ((64, .5), (24, .3), (8, .2)))
    yy, xx = np.mgrid[0:h, 0:w]
    glow = np.exp(-(((xx-w*.5)/(w*.45))**2 + ((yy-h*.45)/(h*.5))**2))
    c = np.clip((cloud-.3)*2.6, 0, 1)*glow
    img = np.zeros((h, w, 3))
    img[..., 0] = 8 + 70*c; img[..., 1] = 16 + 135*c; img[..., 2] = 34 + 200*c
    stars = rng.random((h, w)) > .9985
    img[stars] = 235
    im = Image.fromarray(img.clip(0, 255).astype('uint8')).resize((W*S, H*S), Image.BICUBIC)
    return im.filter(ImageFilter.GaussianBlur(1))


class Board:
    def __init__(self, series, topic, number, slug):
        self.slug, self.number = slug, number
        self.im = nebula(number + 7)
        self.d = ImageDraw.Draw(self.im)
        # angled navy badge, top-right
        x0, y0, x1, y1 = 1150, 18, 1760, 84
        self.d.polygon([((x0+22)*S, y0*S), (x1*S, y0*S), ((x1-22)*S, y1*S), (x0*S, y1*S)],
                       fill=NAVY, outline='#C9D2F0', width=3*S)
        f = font(30); sw = f.getlength(series)/S
        tw = font(30).getlength(topic)/S
        x = x0 + (x1-x0-sw-tw-24)/2
        self.txt(series, x, 32, 30, 'white')
        self.txt(topic, x+sw+24, 32, 30, RED, stroke=3, stroke_fill='white')
        self.txt('cloud-palette.com', 40, 34, 24, '#C9D2F0')

    def txt(self, value, x, y, size, fill=INK, role='gothic', stroke=0, stroke_fill=INK, anchor='lt'):
        self.d.text((x*S, y*S), value, font=font(size, role), fill=fill, anchor=anchor,
                    stroke_width=stroke*S, stroke_fill=stroke_fill)

    def table(self, rows, col_w, row_h=None, size=46, x0=None, y0=110, max_h=560):
        """rows: list of lists of str. Cells alternate blue/gold by column."""
        n = len(rows); row_h = row_h or min(150, max_h//n)
        tw = sum(col_w); x0 = x0 if x0 is not None else (W-tw)/2
        th = row_h*n
        self.d.rectangle(((x0-24)*S, (y0-24)*S, (x0+tw+24)*S, (y0+th+24)*S), fill=CREAM,
                         outline='#D8CDA8', width=3*S)
        self.d.rectangle(((x0-14)*S, (y0-14)*S, (x0+tw+14)*S, (y0+th+14)*S), outline='#B9AE8A', width=2*S)
        for r, row in enumerate(rows):
            x = x0
            for c, cell in enumerate(row):
                fill = (BLUE, GOLDC)[c % 2] if isinstance(cell, str) else cell[1]
                value = cell if isinstance(cell, str) else cell[0]
                self.d.rectangle((x*S, (y0+r*row_h)*S, (x+col_w[c])*S, (y0+(r+1)*row_h)*S),
                                 fill=fill, outline='#5A5A5A', width=2*S)
                s = size
                while font(s).getlength(value)/S > col_w[c]-28:
                    s -= 1
                self.txt(value, x+col_w[c]/2, y0+r*row_h+row_h/2, s, anchor='mm')
                x += col_w[c]
        return y0+th+24

    def band(self, items):
        y0, y1 = 712, 930
        grad = Image.new('RGB', (1, 2), )
        grad.putpixel((0, 0), (122, 124, 128)); grad.putpixel((0, 1), (58, 60, 64))
        grad = grad.resize(((W-80)*S, (y1-y0)*S), Image.BILINEAR)
        rng = np.random.default_rng(3)
        g = np.asarray(grad, float) + rng.normal(0, 6, (1, (W-80)*S, 1))  # brushed metal streaks
        self.im.paste(Image.fromarray(g.clip(0, 255).astype('uint8')), (40*S, y0*S))
        self.d = ImageDraw.Draw(self.im)
        self.d.rectangle((40*S, y0*S, (W-40)*S, y1*S), outline='#2A2B2E', width=3*S)
        step = (y1-y0)/len(items)
        kw_w = max(font(64).getlength(f'【{k}】') for k, _ in items)/S
        for i, (kw, body) in enumerate(items):
            cy = y0 + step*(i+.5)
            self.txt(f'【{kw}】', 70, cy, 64, RED, stroke=5, stroke_fill='white', anchor='lm')
            x = 70 + kw_w + 20; s = 58
            while font(s).getlength(body)/S > W-80-x:
                s -= 1
            self.txt(body, x, cy, s, 'white', stroke=6, stroke_fill=INK, anchor='lm')

    def save(self, suffix=''):
        out = ROOT/'public/blog'/f'{self.slug}{suffix}.png'
        im = self.im.resize((W, H), Image.Resampling.LANCZOS)
        im.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
        if out.stat().st_size > 300_000:
            raise ValueError(f'PNG exceeds 300KB: {out}')
        print(f'{out.name}: {W}×{H} / {out.stat().st_size/1000:.1f} KB')


# ---- per-article content -------------------------------------------------

def four_foundations():
    slug = 'four-foundations-of-eastern-divination'
    art = (ROOT/'content/blog'/f'{slug}.md').read_text()
    for claim in ('陰陽・五行・干支・暦', '60通り', '立春', '木・火・土・金・水',
                  '細かいほど当たると確かめた資料はありません'):
        assert claim in art, f'Review claim: {claim}'
    series = '占いの土台'
    b = Board(series, '全体像', 0, slug)
    b.table([['陰陽', '五行'], ['干支', '暦']], [520, 520], row_h=250, size=120, y0=120)
    b.band([('土台', '陰陽・五行・干支・暦の4つ'), ('応用', '四柱推命・九星気学・風水')])
    b.save()

    b = Board(series, '先に結論', 1, slug)
    b.table([['1', '土台は 陰陽・五行・干支・暦 の4つ'], ['2', '四柱推命・九星気学・風水はその応用'],
             ['3', 'どの土台の話かを見分けて読む']], [140, 1100], size=50, y0=120)
    b.band([('結論', '土台と応用を分けて考える'), ('注意', 'どれも効果が確かめられたものではない')])
    b.save('-slide-1')

    b = Board(series, '4つの土台', 2, slug)
    b.table([['陰陽', '対になる2つで分ける'], ['五行', '木・火・土・金・水の5つで分ける'],
             ['干支', '十干×十二支の60通りで数える'], ['暦', '天体の動きで時を区切る']],
            [260, 980], size=48, y0=110)
    b.band([('干支', '年・月・日を60通りで数える仕組み'), ('暦', '年の区切りは1月1日ではなく立春')])
    b.save('-slide-2')

    b = Board(series, '見分け方', 3, slug)
    b.table([['「〜と〜」の対', '陰陽'], ['木・火・土・金・水', '五行'],
             ['甲子・丙午・空亡', '干支'], ['立春から・節入り', '暦']], [820, 420], size=50, y0=110)
    b.band([('見分け方', '出てくる言葉で土台が分かる'), ('効用', '答えを動かす入力が見えてくる')])
    b.save('-slide-3')

    b = Board(series, 'このサイト', 4, slug)
    b.table([['方位の吉凶', '九星気学＋暦（立春）'], ['天中殺', '干支（生まれた日）'],
             ['風水（八宅）', '八卦の方位（別の層）']], [520, 720], size=50, y0=120)
    b.band([('方位', '「どちらへ」を九星気学で'), ('天中殺', '「いつ」を干支で')])
    b.save('-slide-4')


ARTICLES = {'four-foundations-of-eastern-divination': four_foundations}

if __name__ == '__main__':
    ARTICLES[sys.argv[1] if len(sys.argv) > 1 else 'four-foundations-of-eastern-divination']()
