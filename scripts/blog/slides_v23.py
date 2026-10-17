#!/usr/bin/env python3
"""v23 cloud-palette "night compass" slides. See docs/blog-slide-design.md (v23).

All drawing is original code: indigo night sky, faint star grid and a line-art
compass rose / 八卦 ring, ivory panels with indigo headers and a vermilion accent,
a translucent indigo glass caption band with a gold rule and vermilion pills,
a rounded tab badge with a compass icon, and the cloud-palette wordmark.
Fonts: Noto Sans CJK JP Bold (system), M PLUS Rounded 1c Black / Dela Gothic One (OFL). Not bundled.
Usage: python3 scripts/blog/slides_v23.py [slug]
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
    if role == 'round':
        return ImageFont.truetype(str(ofl/'MPLUSRounded1c-Black.ttf'), size*S)
    if role == 'num':
        return ImageFont.truetype(str(ofl/'DelaGothicOne-Regular.ttf'), size*S)
    return ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', size*S, index=0)


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
    def __init__(self, slug, series, topic, number, total=5, rose=(1500, 300)):
        self.slug = slug
        self.im = background(number+11, *rose).convert('RGBA')
        self.d = ImageDraw.Draw(self.im)
        # wordmark top-left: cloud mark + name
        self.d.ellipse((44*S, 34*S, 78*S, 62*S), fill=IVORY); self.d.ellipse((64*S, 26*S, 102*S, 62*S), fill=IVORY)
        self.d.rectangle((48*S, 48*S, 100*S, 62*S), fill=IVORY)
        self.d.ellipse((90*S, 44*S, 100*S, 54*S), fill=VERM)
        self.t('cloud palette', 114, 44, 30, IVORY, 'round', anchor='lm')
        # rounded tab badge top-right with compass icon
        tw = font(26).getlength(series)/S + font(26).getlength(topic)/S + 120
        x0 = W-48-tw
        self.d.rounded_rectangle((x0*S, 22*S, (W-48)*S, 70*S), 24*S, fill=IVORY)
        cx, cy = x0+32, 46
        self.d.ellipse(((cx-14)*S, (cy-14)*S, (cx+14)*S, (cy+14)*S), outline=INDIGO, width=3*S)
        self.d.polygon([(cx*S, (cy-11)*S), ((cx+5)*S, cy*S), ((cx-5)*S, cy*S)], fill=VERM)
        self.d.polygon([(cx*S, (cy+11)*S), ((cx+5)*S, cy*S), ((cx-5)*S, cy*S)], fill=INDIGO)
        self.t(series, x0+60, 46, 26, INDIGO, anchor='lm')
        self.t(topic, x0+60+font(26).getlength(series)/S+20, 46, 26, VERM, anchor='lm')
        self.t(f'{number+1:02d} / {total:02d}', W-60, 920, 22, (200, 200, 230, 255), anchor='rm')
        self.t('伝統的な占術の考え方・効果が科学的に確認されたものではありません', 60, 920, 20, (180, 184, 214, 255), anchor='lm')

    def t(self, value, x, y, size, fill=INK, role='gothic', anchor='lt', maxw=None):
        while maxw and font(size, role).getlength(value)/S > maxw:
            size -= 1
        self.d.text((x*S, y*S), value, font=font(size, role), fill=fill, anchor=anchor)

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
        pw = max(font(36).getlength(k)/S for k, _ in items) + 48
        for i, (kw, body) in enumerate(items):
            cy = y0 + 6 + step*(i+.5)
            w = font(36).getlength(kw)/S + 48
            self.pill(kw, 70+(pw-w)/2, cy, 36)
            self.t(body, 70+pw+32, cy, 50, IVORY, anchor='lm', maxw=W-200-pw)

    def arrow(self, x0, y, x1, color=GOLD):
        self.d.line((x0*S, y*S, (x1-18)*S, y*S), fill=color, width=6*S)
        self.d.polygon([(x1*S, y*S), ((x1-26)*S, (y-18)*S), ((x1-26)*S, (y+18)*S)], fill=color)

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
    for claim in ('陰陽・五行・干支・暦', '60通り', '立春', '木・火・土・金・水',
                  '細かいほど当たると確かめた資料はありません'):
        assert claim in art, f'Review claim: {claim}'
    se = '占いの土台'

    # cover: 4-quadrant diagram around a compass hub
    s = Slide(slug, se, '全体像', 0, rose=(900, 390))
    for i, (name, sub) in enumerate([('陰陽', '2つで分ける'), ('五行', '5つで分ける'),
                                     ('干支', '60で数える'), ('暦', '時を区切る')]):
        x, y = (330, 1000)[i % 2], (110, 400)[i//2]
        s.panel(x, y, 470, 250)
        s.t(name, x+235, y+105, 104, INDIGO, 'round', anchor='mm')
        s.t(sub, x+235, y+200, 36, VERM, anchor='mm')
    s.d.ellipse((840*S, 320*S, 960*S, 440*S), fill=VERM)
    s.t('土台', 900, 380, 40, 'white', anchor='mm')
    s.band([('土台', '陰陽・五行・干支・暦の4つ'), ('応用', '四柱推命・九星気学・風水')])
    s.save()

    # slide-1: numbered list
    s = Slide(slug, se, '先に結論', 1)
    for i, line in enumerate(['土台は4つ', '占術はその応用', 'どの土台の話かを見分ける']):
        y = 120 + i*190
        s.panel(200, y, 1400, 160)
        s.d.ellipse((240*S, (y+30)*S, 340*S, (y+130)*S), fill=VERM)
        s.t(str(i+1), 290, y+80, 56, 'white', 'num', anchor='mm')
        s.t(line, 390, y+80, 64, INK, anchor='lm')
    s.band([('注意', 'どれも効果が確かめられたものではない')])
    s.save('-slide-1')

    # slide-2: table with indigo header
    s = Slide(slug, se, '4つの土台', 2, rose=(200, 650))
    x, y, c1, c2, rh = 260, 100, 300, 980, 116
    s.panel(x, y, c1+c2, 78+rh*4, header='土台　／　何を扱うか')
    for i, (a, b) in enumerate([('陰陽', '対になる2つで分ける'), ('五行', '木・火・土・金・水の5つ'),
                                ('干支', '十干×十二支の60通り'), ('暦', '天体の動きで時を区切る')]):
        yy = y+78+rh*i
        if i:
            s.d.line(((x+30)*S, yy*S, (x+c1+c2-30)*S, yy*S), fill='#E3DCCB', width=2*S)
        s.t(a, x+c1/2, yy+rh/2, 56, INDIGO, 'round', anchor='mm')
        s.t(b, x+c1+40, yy+rh/2, 48, INK, anchor='lm')
    s.band([('暦', '年の区切りは1月1日ではなく立春')])
    s.save('-slide-2')

    # slide-3: flow chart
    s = Slide(slug, se, '見分け方', 3, rose=(900, 400))
    for i, (head, ex) in enumerate([('出てくる言葉', '「甲子」「空亡」'), ('どの土台か', '干支'),
                                    ('答えを動かす入力', '生まれた日')]):
        x = 110 + i*560
        s.panel(x, 200, 460, 330, header=head, hfill=(INDIGO, TEAL, VERM)[i])
        s.t(ex, x+230, 390, 60, INK, 'round', anchor='mm', maxw=420)
        if i < 2:
            s.arrow(x+478, 365, x+545)
    s.t('例：天中殺の話を聞いたとき', 900, 140, 40, IVORY, anchor='mm')
    s.band([('見分け方', '言葉から土台、土台から入力が分かる')])
    s.save('-slide-3')

    # slide-4: 2-column compare
    s = Slide(slug, se, 'このサイト', 4, rose=(900, 380))
    for i, (head, q, base, col) in enumerate([('方位の吉凶', 'どちらへ', '九星気学＋暦', INDIGO),
                                              ('天中殺', 'いつ', '干支（生まれた日）', TEAL)]):
        x = 170 + i*760
        s.panel(x, 110, 700, 470, header=head, hfill=col)
        s.t(f'「{q}」', x+350, 290, 84, col, 'round', anchor='mm')
        s.t(base, x+350, 460, 52, INK, anchor='mm', maxw=640)
    s.band([('風水', '八宅は別の層として並べて表示')])
    s.save('-slide-4')


ARTICLES = {'four-foundations-of-eastern-divination': four_foundations}

if __name__ == '__main__':
    ARTICLES[sys.argv[1] if len(sys.argv) > 1 else 'four-foundations-of-eastern-divination']()
