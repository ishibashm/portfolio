#!/usr/bin/env python3
"""v25 cloud-palette "night compass" slides (v24 layout, square heavy gothic + outlined captions). See docs/blog-slide-design.md (v25).

All drawing is original code: indigo night sky, faint star grid and a line-art
compass rose / 八卦 ring, ivory panels with indigo headers and a vermilion accent,
a translucent indigo glass caption band with a gold rule and vermilion pills,
a rounded tab badge with a compass icon, and the cloud-palette wordmark.
Fonts: Noto Sans CJK JP Black (OFL, ~/.local/share/fonts/ofl/NotoSansCJKjp-Black.otf), Dela Gothic One (OFL). Not bundled.
Usage: python3 scripts/blog/slides_v25.py [slug]
"""
from functools import lru_cache
from math import cos, sin, pi
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
W, H, S = 1800, 945, 2
TOP, BOTTOM = (22, 28, 66), (9, 12, 34)
IVORY, INDIGO, VERM, GOLD, INK = '#FBF7EE', '#2B3480', '#E0533D', '#C9A45C', '#1B1E33'
TEAL = '#2E8C88'


@lru_cache(None)
def font(size, role='gothic'):
    ofl = Path.home()/'.local/share/fonts/ofl'
    if role == 'num':
        return ImageFont.truetype(str(ofl/'DelaGothicOne-Regular.ttf'), size*S)
    return ImageFont.truetype(str(ofl/'NotoSansCJKjp-Black.otf'), size*S)  # square heavy gothic


def background(seed, cx, cy):
    t = np.linspace(0, 1, H*S)[:, None, None]
    g = (np.array(TOP)*(1-t) + np.array(BOTTOM)*t) * np.ones((1, W*S, 1))
    im = Image.fromarray(g.astype('uint8'))
    d = ImageDraw.Draw(im, 'RGBA')
    for x in range(0, W, 60):                       # faint star grid
        d.line((x*S, 0, x*S, H*S), fill=(120, 140, 220, 14), width=S)
    for y in range(0, H, 60):
        d.line((0, y*S, W*S, y*S), fill=(120, 140, 220, 14), width=S)
    rng = np.random.default_rng(seed)
    for _ in range(140):
        x, y, r = rng.random()*W, rng.random()*H, rng.choice([1, 1, 1.5, 2.5])
        d.ellipse(((x-r)*S, (y-r)*S, (x+r)*S, (y+r)*S), fill=(235, 228, 205, int(rng.integers(90, 220))))
    line = (201, 164, 92, 60)                        # compass rose + 八卦 ring
    for r in (420, 360, 250):
        d.ellipse(((cx-r)*S, (cy-r)*S, (cx+r)*S, (cy+r)*S), outline=line, width=2*S)
    for k in range(16):
        a = k*pi/8; r0 = 250 if k % 2 else 0
        d.line(((cx+r0*cos(a))*S, (cy+r0*sin(a))*S, (cx+420*cos(a))*S, (cy+420*sin(a))*S), fill=line, width=S)
    for k in range(4):
        a = k*pi/2
        pts = [(cx+430*cos(a), cy+430*sin(a)), (cx+40*cos(a+pi/2), cy+40*sin(a+pi/2)),
               (cx+40*cos(a-pi/2), cy+40*sin(a-pi/2))]
        d.polygon([(x*S, y*S) for x, y in pts], outline=line)
    bits = ['111', '110', '101', '100', '011', '010', '001', '000']  # 八卦 as line-art bars
    for k, b in enumerate(bits):
        a = k*pi/4 - pi/2
        bx, by = cx+390*cos(a), cy+390*sin(a)
        for j, bit in enumerate(b):
            y = by - 14 + j*14
            if bit == '1':
                d.line(((bx-22)*S, y*S, (bx+22)*S, y*S), fill=(201, 164, 92, 95), width=6*S)
            else:
                for x0 in (bx-22, bx+5):
                    d.line((x0*S, y*S, (x0+17)*S, y*S), fill=(201, 164, 92, 95), width=6*S)
    return im


class Slide:
    def __init__(self, slug, headline, number, total=6, rose=(1500, 300)):
        self.slug = slug
        self.im = background(number+11, *rose).convert('RGBA')
        self.d = ImageDraw.Draw(self.im)
        self.t(headline, 64, 36, 72, 'white', maxw=1300, outline='black')
        self.d.line((66*S, 136*S, 186*S, 136*S), fill=VERM, width=6*S)
        # wordmark top-right: cloud mark + name
        x = W-64-font(28, 'round').getlength('cloud palette')/S - 70
        self.d.ellipse((x*S, 46*S, (x+30)*S, 72*S), fill=IVORY); self.d.ellipse(((x+18)*S, 38*S, (x+52)*S, 72*S), fill=IVORY)
        self.d.rectangle(((x+4)*S, 58*S, (x+50)*S, 72*S), fill=IVORY)
        self.d.ellipse(((x+42)*S, 54*S, (x+52)*S, 64*S), fill=VERM)
        self.t('cloud palette', x+66, 56, 28, IVORY, anchor='lm')
        self.t(f'{number+1:02d} / {total:02d}', W-60, 920, 22, (200, 200, 230, 255), anchor='rm')
        self.t('伝統的な占術の考え方・効果が科学的に確認されたものではありません', 60, 920, 20, (180, 184, 214, 255), anchor='lm')

    def t(self, value, x, y, size, fill=INK, role='gothic', anchor='lt', maxw=None, outline=None):
        while maxw and font(size, role).getlength(value)/S > maxw:
            size -= 1
        f = font(size, role)
        if outline:  # caption treatment: thick stroke (8% of size) + soft dark drop shadow
            sw = max(2, round(size*.08*S))
            off = max(2, round(size*.06*S))
            sh = Image.new('RGBA', self.im.size); sd = ImageDraw.Draw(sh)
            sd.text((x*S+off, y*S+off), value, font=f, anchor=anchor, fill=(0, 0, 0, 200),
                    stroke_width=sw, stroke_fill=(0, 0, 0, 200))
            self.im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(off*.6)))
            self.d = ImageDraw.Draw(self.im)
            self.d.text((x*S, y*S), value, font=f, fill=fill, anchor=anchor, stroke_width=sw, stroke_fill=outline)
        else:
            self.d.text((x*S, y*S), value, font=f, fill=fill, anchor=anchor)

    def panel(self, x, y, w, h, fill=IVORY, r=26, header=None, hfill=INDIGO):
        sh = Image.new('RGBA', self.im.size); sd = ImageDraw.Draw(sh)
        sd.rounded_rectangle(((x+6)*S, (y+12)*S, (x+w+6)*S, (y+h+12)*S), r*S, fill=(0, 0, 0, 110))
        self.im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10*S))); self.d = ImageDraw.Draw(self.im)
        self.d.rounded_rectangle((x*S, y*S, (x+w)*S, (y+h)*S), r*S, fill=fill)
        if header:
            self.d.rounded_rectangle((x*S, y*S, (x+w)*S, (y+78)*S), r*S, fill=hfill)
            self.d.rectangle((x*S, (y+50)*S, (x+w)*S, (y+78)*S), fill=hfill)
            self.t(header, x+w/2, y+40, 38, IVORY, anchor='mm', maxw=w-40)

    def pill(self, text, x, cy, size=40, fill=VERM):
        w = font(size).getlength(text)/S + 48
        self.d.rounded_rectangle((x*S, (cy-34)*S, (x+w)*S, (cy+34)*S), 34*S, fill=fill)
        self.t(text, x+w/2, cy, size, 'white', anchor='mm')
        return w

    def band(self, items):
        y0, y1 = 712, 894
        glass = Image.new('RGBA', self.im.size); gd = ImageDraw.Draw(glass)
        gd.rounded_rectangle((40*S, y0*S, (W-40)*S, y1*S), 22*S, fill=(20, 26, 70, 205))
        self.im.alpha_composite(glass); self.d = ImageDraw.Draw(self.im)
        self.d.line((70*S, (y0+2)*S, (W-70)*S, (y0+2)*S), fill=GOLD, width=3*S)
        step = (y1-y0)/len(items)
        kw_w = max(font(56).getlength(f'【{k}】') for k, _ in items)/S
        for i, (kw, body) in enumerate(items):
            cy = y0 + 6 + step*(i+.5)
            self.t(f'【{kw}】', 70, cy, 56, VERM, anchor='lm', outline='white')
            self.t(body, 70+kw_w+28, cy, 54, 'white', anchor='lm', maxw=W-170-kw_w, outline='black')

    def arrow(self, x0, y, x1, color=GOLD):
        self.d.line((x0*S, y*S, (x1-18)*S, y*S), fill=color, width=6*S)
        self.d.polygon([(x1*S, y*S), ((x1-26)*S, (y-18)*S), ((x1-26)*S, (y+18)*S)], fill=color)

    def icon(self, kind, cx, cy, r=34):
        """Fixed mark per foundation: 陰陽 taiji, 五行 five dots, 干支 12-ring, 暦 moon phases."""
        d = self.d
        if kind == '陰陽':
            d.ellipse(((cx-r)*S, (cy-r)*S, (cx+r)*S, (cy+r)*S), fill=IVORY, outline=INDIGO, width=3*S)
            d.pieslice(((cx-r)*S, (cy-r)*S, (cx+r)*S, (cy+r)*S), 90, 270, fill=INDIGO)
            h = r/2
            d.ellipse(((cx-h)*S, (cy-r)*S, (cx+h)*S, cy*S), fill=INDIGO)
            d.ellipse(((cx-h)*S, cy*S, (cx+h)*S, (cy+r)*S), fill=IVORY)
            for yy, f in ((cy-h, IVORY), (cy+h, INDIGO)):
                d.ellipse(((cx-6)*S, (yy-6)*S, (cx+6)*S, (yy+6)*S), fill=f)
        elif kind == '五行':
            for k, col in enumerate(('#3E9B5B', '#E0533D', '#D9A63A', '#B9B9C4', '#2F5FB0')):
                a = -pi/2 + k*2*pi/5
                x, y = cx+r*.72*cos(a), cy+r*.72*sin(a)
                d.ellipse(((x-11)*S, (y-11)*S, (x+11)*S, (y+11)*S), fill=col)
        elif kind == '干支':
            d.ellipse(((cx-r*.8)*S, (cy-r*.8)*S, (cx+r*.8)*S, (cy+r*.8)*S), outline=TEAL, width=3*S)
            for k in range(12):
                a = k*pi/6
                x, y = cx+r*.8*cos(a), cy+r*.8*sin(a)
                rr = 7 if k == 9 else 5
                d.ellipse(((x-rr)*S, (y-rr)*S, (x+rr)*S, (y+rr)*S), fill=VERM if k == 9 else TEAL)
        elif kind == '暦':
            for k in range(3):
                x = cx + (k-1)*r*.85; rr = r*.36
                d.ellipse(((x-rr)*S, (cy-rr)*S, (x+rr)*S, (cy+rr)*S), fill=GOLD)
                if k == 0:
                    d.ellipse(((x-rr+rr*.9)*S, (cy-rr)*S, (x+rr+rr*.9)*S, (cy+rr)*S), fill=IVORY)
                elif k == 1:
                    d.rectangle(((x)*S, (cy-rr)*S, (x+rr)*S, (cy+rr)*S), fill=IVORY)
                    d.ellipse(((x-rr)*S, (cy-rr)*S, (x+rr)*S, (cy+rr)*S), outline=GOLD, width=2*S)

    def save(self, suffix=''):
        out = ROOT/'public/blog'/f'{self.slug}{suffix}.png'
        im = self.im.convert('RGB').resize((W, H), Image.Resampling.LANCZOS)
        im.quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
        if out.stat().st_size > 300_000:
            raise ValueError(f'PNG exceeds 300KB: {out}')
        print(f'{out.name}: {W}×{H} / {out.stat().st_size/1000:.1f} KB')


# ---- per-article content -------------------------------------------------

def four_foundations():
    slug = 'four-foundations-of-eastern-divination'
    art = (ROOT/'content/blog'/f'{slug}.md').read_text()
    for claim in ('陰陽・五行・干支・暦', '| 四柱推命 ', '| 九星気学・方位 ', '| 風水 ',
                  '2026年は丙午', '丙は火の陽', '午は火', '立春より前は乙巳', '(/houi)', '(/calendar)'):
        assert claim in art, f'Review claim: {claim}'
    F = ['陰陽', '五行', '干支', '暦']

    # cover: 4 foundations quadrant
    s = Slide(slug, '占いの土台は4つ', 0, rose=(900, 420))
    for i, (name, sub) in enumerate(zip(F, ['2つで分ける', '5つで分ける', '60で数える', '時を区切る'])):
        x, y = (300, 930)[i % 2], (170, 435)[i//2]
        s.panel(x, y, 570, 235)
        s.icon(name, x+100, y+117, 48)
        s.t(name, x+190, y+70, 92, INDIGO, anchor='lm')
        s.t(sub, x+194, y+170, 38, VERM, anchor='lm')
    s.band([('ポイント', '占いはどれも、この4つを組み合わせてできている')])
    s.save()

    # slide-1: which divination uses which foundation
    s = Slide(slug, '占術はどの土台を使う？', 1, rose=(200, 650))
    x, y, c0, cw, rh = 170, 165, 520, 230, 104
    s.panel(x, y, c0+cw*4, 92+rh*3, r=22)
    s.d.rounded_rectangle((x*S, y*S, (x+c0+cw*4)*S, (y+92)*S), 22*S, fill=INDIGO)
    s.d.rectangle((x*S, (y+60)*S, (x+c0+cw*4)*S, (y+92)*S), fill=INDIGO)
    for j, f in enumerate(F):
        cx = x+c0+cw*j+cw/2
        s.d.ellipse(((cx-74)*S, (y+10)*S, (cx-2)*S, (y+82)*S), fill=IVORY)
        s.icon(f, cx-38, y+46, 26)
        s.t(f, cx+8, y+46, 40, IVORY, anchor='lm')
    rows = [('四柱推命', [1, 1, 1, 1], ''), ('九星気学・方位', [0, 1, 0, 1], '＋九星'), ('風水', [1, 1, 0, 0], '＋八卦')]
    for i, (name, marks, extra) in enumerate(rows):
        yy = y+92+rh*i
        if i:
            s.d.line(((x+24)*S, yy*S, (x+c0+cw*4-24)*S, yy*S), fill='#E3DCCB', width=2*S)
        s.t(name, x+36, yy+rh/2, 46, INK, anchor='lm')
        if extra:
            s.t(extra, x+c0-28, yy+rh/2, 30, TEAL, anchor='rm')
        for j, m in enumerate(marks):
            cx = x+c0+cw*j+cw/2
            if m:
                s.d.ellipse(((cx-22)*S, (yy+rh/2-22)*S, (cx+22)*S, (yy+rh/2+22)*S), fill=VERM)
            else:
                s.d.line(((cx-16)*S, (yy+rh/2)*S, (cx+16)*S, (yy+rh/2)*S), fill='#B8B0A0', width=4*S)
    s.t('●＝主に使う土台（一般的な説明。流派によって違う）', x, y+92+rh*3+22, 28, (200, 204, 230, 255))
    s.band([('ポイント', '同じ土台でも、組み合わせ方で占いが変わる')])
    s.save('-slide-1')

    # slide-2: 2026 = 丙午
    s = Slide(slug, '例：2026年は「丙午」', 2, rose=(1550, 420))
    s.panel(120, 175, 470, 470)
    s.t('丙午', 355, 360, 150, INDIGO, anchor='mm')
    s.t('ひのえうま', 355, 520, 44, VERM, anchor='mm')
    for i, (f, body) in enumerate([('干支', '丙（十干）＋ 午（十二支）'), ('五行', '丙も午も「火」'),
                                    ('陰陽', '丙は「陽」の火'), ('暦', '立春（2月4日）から丙午')]):
        y = 175 + i*122
        s.panel(650, y, 1030, 104, r=20)
        s.icon(f, 712, y+52, 30)
        s.t(f, 770, y+52, 40, INDIGO, anchor='lm')
        s.t(body, 930, y+52, 44, INK, anchor='lm', maxw=730)
    s.band([('ポイント', '年の名前ひとつに、4つの土台がそろっている')])
    s.save('-slide-2')

    # slide-3: flow chart
    s = Slide(slug, '天中殺はどの土台？', 3, rose=(900, 420))
    for i, (head, ex) in enumerate([('出てくる言葉', '「空亡」'), ('どの土台か', '干支'), ('答えを動かす入力', '生まれた日')]):
        x = 110 + i*560
        s.panel(x, 230, 460, 250, header=head, hfill=(INDIGO, TEAL, VERM)[i])
        if i == 1:
            s.icon('干支', x+120, 395, 40)
            s.t(ex, x+180, 395, 76, INK, anchor='lm')
        else:
            s.t(ex, x+230, 395, 64, INK, anchor='mm', maxw=420)
        if i < 2:
            s.arrow(x+478, 355, x+545)
    s.band([('ポイント', '言葉を見れば、どの土台の話かが分かる')])
    s.save('-slide-3')

    # slide-4: 2-column compare
    s = Slide(slug, '方位と天中殺は土台が違う', 4, rose=(900, 420))
    for i, (head, q, fs, base, col) in enumerate([('方位の吉凶', 'どちらへ', ['五行', '暦'], '九星気学＋暦', INDIGO),
                                                  ('天中殺', 'いつ', ['干支'], '干支（生まれた日）', TEAL)]):
        x = 170 + i*760
        s.panel(x, 180, 700, 420, header=head, hfill=col)
        s.t(f'「{q}」', x+350, 340, 92, col, anchor='mm')
        w = font(50).getlength(base)/S + 90*len(fs)
        xx = x+350-w/2
        for f in fs:
            s.icon(f, xx+36, 500, 30); xx += 90
        s.t(base, xx, 500, 50, INK, anchor='lm')
    s.band([('ポイント', '方位は「どちらへ」、天中殺は「いつ」を見る')])
    s.save('-slide-4')

    # slide-5: summary + CTA
    s = Slide(slug, '自分の場合を調べる', 5, rose=(900, 420))
    for i, (title, url, fs, col) in enumerate([('方位を調べる', 'cloud-palette.com/houi', ['五行', '暦'], INDIGO),
                                               ('天中殺つきで日取りを選ぶ', 'cloud-palette.com/calendar', ['干支', '暦'], TEAL)]):
        x = 170 + i*760
        s.panel(x, 200, 700, 380)
        for k, f in enumerate(fs):
            s.icon(f, x+80+k*90, 270, 34)
        s.t(title, x+50, 360, 54, col, maxw=600)
        s.d.rounded_rectangle(((x+50)*S, 470*S, (x+650)*S, 540*S), 35*S, fill=VERM)
        s.t(url + '  →', x+350, 505, 36, 'white', anchor='mm', maxw=560)
    s.band([('ポイント', '土台が分かったら、自分の生年月日で確かめる')])
    s.save('-slide-5')


ARTICLES = {'four-foundations-of-eastern-divination': four_foundations}

if __name__ == '__main__':
    ARTICLES[sys.argv[1] if len(sys.argv) > 1 else 'four-foundations-of-eastern-divination']()
