#!/usr/bin/env python3
"""Conversion batch 1: v27 slides (broadcast telops + guide しるべ) for three existing articles.

Shares the v27 engine in slides_v27.py unchanged (type system, nebula, panels, band, footer).
Adds: series badge with any series name, a tighter Pillow-only cut-out (drops stray specks so
the bounding box hugs the figure), and per-article slide functions that assert every number
they draw against the article text.
Usage: python3 scripts/blog/slides_v27_batch1.py [slug ...]   (no args = all three)
"""
from functools import lru_cache
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from slides_v27 import (ROOT, W, H, S, IVORY, INDIGO, VERM, GOLD, INK, TEAL, Slide, nebula,
                        render_telop, load_art, font, rgb)

RED = (224, 83, 61, 235)
BRAND = [VERM, '#F06A50', '#B8321F', '#9E1410', '#E3241B', '#FF6B4F', TEAL, '#3E9E99', '#1F6E6B', INDIGO, '#3D49B0',
         '#1E2563', IVORY, '#F0E6CC', '#FDE7DF', INK, GOLD, '#F3DDA0', '#C9862F', '#5A5F8A', '#FFFFFF', '#0A0A14']


# ---- cut-out: same colour-distance flood as v27, plus speck removal ----
def _f(mask, flt):
    return np.asarray(Image.fromarray((mask*255).astype('uint8')).filter(flt)) > 0


def regions(mask, step=4, min_area=4000):
    """Connected regions (Pillow flood fill) of a boolean mask that are at least min_area px."""
    im = Image.fromarray(np.where(mask, 255, 0).astype('uint8')).copy()
    out, (h, w) = [], mask.shape
    for y in range(0, h, step):
        for x in range(0, w, step):
            if im.getpixel((x, y)) == 255:
                ImageDraw.floodfill(im, (x, y), 77)
                a = np.asarray(im) == 77
                if a.sum() >= min_area:
                    out.append(a)
                im.paste(0, mask=Image.fromarray((a*255).astype('uint8')))
    return out


def cutout(im):
    a = np.asarray(im, float)
    bg = np.median(np.concatenate([a[0], a[:, 0], a[:, -1]]), 0)
    d = np.sqrt(((a-bg)**2).sum(-1))
    h, w = d.shape
    core = Image.fromarray(np.where(d < 30, 255, 0).astype('uint8')).copy()
    seeds = [(x, 0) for x in range(0, w, 12)] + [(0, y) for y in range(0, int(h*.85), 12)] + [(w-1, y) for y in range(0, int(h*.85), 12)]
    for p in seeds:
        if core.getpixel(p) == 255:
            ImageDraw.floodfill(core, p, 128)
    c = np.asarray(core) == 128
    alpha = np.ones_like(d)
    near = _f(c, ImageFilter.MaxFilter(9))
    alpha[near] = np.clip((d[near]-10)/24, 0, 1)
    alpha[c] = np.clip((d[c]-12)/50, 0, 1)**1.5
    alpha[c & (d < 12)] = 0
    alpha = np.asarray(Image.fromarray((alpha*255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.0)), float)/255
    keep = np.zeros_like(c)
    for r in regions(alpha > .5):
        keep |= r
    alpha[~_f(keep, ImageFilter.MaxFilter(15))] = 0   # specks / JPEG noise in the background
    al = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - bg*(1-al))/al, 0, 255)
    o = Image.fromarray(np.dstack([rgb, alpha*255]).astype('uint8'), 'RGBA')
    return o.crop(Image.fromarray(((alpha > .03)*255).astype('uint8')).getbbox())


@lru_cache(None)
def character(slug, name):
    return cutout(load_art(slug, name))


class BSlide(Slide):
    """v27 slide with a free series name in the angled badge and 5 pages."""
    def __init__(self, slug, headline, number, series, topic, rose=(1500, 300), total=5):
        self.slug = slug
        self.im = nebula(number+31+len(slug), *rose)
        self.d = ImageDraw.Draw(self.im)
        self.telop(headline, 56, 82, 78, 'headline', anchor='lm', maxw=1180, marker=RED)
        ws = render_telop(series, 34, 'caption', None, False)[0].width/S
        wt = render_telop(topic, 34, 'label', None, False)[0].width/S
        x1, y0, y1 = 1764, 26, 88
        x0 = x1 - (52 + ws + 22 + wt + 40)
        pts = [(x0+26, y0), (x1, y0), (x1-26, y1), (x0, y1)]
        self.d.polygon([(a*S, b*S) for a, b in pts], fill=(24, 32, 92, 255))
        self.d.line([(a*S, b*S) for a, b in pts+[pts[0]]], fill=GOLD, width=3*S)
        self.d.line(((x0+30)*S, (y0+5)*S, (x1-6)*S, (y0+5)*S), fill=(120, 140, 220, 160), width=S)
        self.telop(series, x0+52, 57, 34, 'caption', anchor='lm', auto_small=False)
        self.telop(topic, x0+52+ws+22, 57, 34, 'label', anchor='lm', auto_small=False)
        self.number, self.total = number, total

    def save(self, suffix=''):
        """Same budget as v27 (≤300KB), but the palette always keeps the brand colours so
        vermilion/teal accents don't get merged into the nebula by median cut."""
        self.footer()
        out = ROOT/'public/blog'/f'{self.slug}{suffix}.png'
        im = self.im.convert('RGB').resize((W, H), Image.Resampling.LANCZOS)
        fixed = [rgb(c) for c in BRAND]
        for n in (96, 84, 72):
            adapt = im.quantize(colors=n-len(fixed), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
            pal = adapt.getpalette()[:3*(n-len(fixed))] + [v for c in fixed for v in c]
            pimg = Image.new('P', (1, 1)); pimg.putpalette(pal + [0]*(768-len(pal)))
            im.quantize(palette=pimg, dither=Image.Dither.NONE).save(out, optimize=True)
            if out.stat().st_size <= 300_000:
                break
        if out.stat().st_size > 300_000:
            raise ValueError(f'PNG exceeds 300KB: {out}')
        print(f'{out.name}: {W}×{H} / {out.stat().st_size/1000:.1f} KB')

    def guide(self, name, side, height=790, top=130, inset=10):
        cut = character(self.slug, name)
        w = cut.width*height/cut.height
        x = W - inset - w if side == 'right' else inset
        self.presenter(cut, x, top, height)
        return x, w

    def glow(self, cx, cy, r, col=(255, 196, 120, 70)):
        g = Image.new('RGBA', self.im.size)
        ImageDraw.Draw(g).ellipse(((cx-r)*S, (cy-r)*S, (cx+r)*S, (cy+r)*S), fill=col)
        self.im.alpha_composite(g.filter(ImageFilter.GaussianBlur(r*.3*S))); self.d = ImageDraw.Draw(self.im)

    def answer_cards(self, rows, x, y, w, h, gap):
        """Question → answer cards: card label on the left, big red answer on the right."""
        for i, (q, a) in enumerate(rows):
            yy = y + i*(h+gap)
            self.panel(x, yy, w, h)
            self.telop(q, x+40, yy+h/2, 52, 'card', anchor='lm', maxw=w*.46)
            self.arrow(x+w*.5, yy+h/2, x+w*.5+70, VERM)
            self.telop(a, x+w*.5+100, yy+h/2, 70, 'cardred', anchor='lm', maxw=w*.5-130, auto_small=False)

    def table(self, x, y, colw, rh, head, rows, hi=(), hh=84, sizes=None):
        """Ivory table with indigo header row; hi = set of (row, col) drawn in vermilion."""
        tw = sum(colw)
        self.panel(x, y, tw, hh+rh*len(rows), r=22)
        self.d.rounded_rectangle((x*S, y*S, (x+tw)*S, (y+hh)*S), 22*S, fill=INDIGO)
        self.d.rectangle((x*S, (y+hh-24)*S, (x+tw)*S, (y+hh)*S), fill=INDIGO)
        sizes = sizes or [52]*len(colw)
        cx = x
        for j, (hd, cw) in enumerate(zip(head, colw)):
            self.telop(hd, cx+cw/2, y+hh/2, 40, 'caption', anchor='mm', maxw=cw-20, auto_small=False)
            cx += cw
        for i, row in enumerate(rows):
            yy = y+hh+rh*i
            if i % 2:
                self.d.rectangle(((x+6)*S, yy*S, (x+tw-6)*S, (yy+rh)*S), fill='#F0E6CC')
            if i:
                self.d.line(((x+24)*S, yy*S, (x+tw-24)*S, yy*S), fill='#E3DCCB', width=2*S)
            cx = x
            for j, (cell, cw) in enumerate(zip(row, colw)):
                st = 'cardred' if (i, j) in hi else ('body' if j == 0 else 'card')
                self.telop(cell, cx+cw/2, yy+rh/2, sizes[j], st, anchor='mm', maxw=cw-30, auto_small=False)
                cx += cw

    def steps(self, items, x, y, w, h, gap):
        for i, (title, sub) in enumerate(items):
            yy = y + i*(h+gap)
            self.panel(x, yy, w, h, r=20)
            self.d.ellipse(((x+22)*S, (yy+h/2-36)*S, (x+94)*S, (yy+h/2+36)*S), fill=VERM)
            self.telop(str(i+1), x+58, yy+h/2, 46, 'caption', anchor='mm', auto_small=False)
            self.telop(title, x+122, yy+h/2, 50, 'card', anchor='lm', maxw=w*.42)
            self.telop(sub, x+w*.5+10, yy+h/2, 38, 'body', anchor='lm', maxw=w*.5-40)


def check(slug, claims):
    art = (ROOT/'content/blog'/f'{slug}.md').read_text()
    for c in claims:
        assert c in art, f'{slug}: claim not in article: {c}'


# ---- A. 本命的殺 ------------------------------------------------------------
def honmei_teki():
    slug, ser = 'can-you-recover-from-honmei-teki', '本命的殺'
    check(slug, ['**過去の移動を取り消す計算はありません。**', '七赤金星なら 2026 年は北東、2027 年は西、2028 年は北西',
                 '七赤金星なら 2029 年', '| 南東 | **本命殺**   |', '| 北西 | **本命的殺** |', '| 南西 | 五黄殺       |',
                 '| 北東 | 暗剣殺       |', '| 西   | 大吉         |', '年星は八白', '常に **X**',
                 '| 2026年 | 南西   | **北東** |', '| 2027年 | 東     | **西**   |', '| 2028年 | 南東   | **北西** |',
                 '| 2029年 | —      | —        |', '9 年に 1 度', '75 日という条件が変えるのは「次の移動をどこから測るか」だけ',
                 '1. **判定を確かめる。**', '2. **距離を確かめる**。5km 未満', '3. **次の窓を出す**', '4. **暦の外のことをする**',
                 '日当たり・騒音・通勤'])

    s = BSlide(slug, '本命的殺は{取り消せる}？', 0, ser, '結論', rose=(1450, 430))
    s.glow(1240, 420, 170)
    s.guide('cover', 'right')
    s.answer_cards([('過去の移動', '取り消せない'), ('的殺の方位', '毎年動く'), ('次の移動で変わる', '起点')], 60, 168, 1110, 150, 26)
    s.telop('初代 案内役', 1560, 650, 50, 'label', anchor='mm', auto_small=False)
    s.band([('ポイント', '前の移動は消せない。次の判定を正しく出す')])
    s.save()

    # slide-1: 2028 year board, 七赤 in 南東
    s = BSlide(slug, '的殺は自分の星の{真向かい}', 1, ser, '定義', rose=(1300, 400))
    s.guide('slide-1', 'left', inset=0)
    bx, by, c = 560, 160, 170
    grid = [['南東', '南', '南西'], ['東', '中宮', '西'], ['北東', '北', '北西']]
    mark = {'南東': ('本命殺', VERM, '七赤'), '北西': ('本命的殺', '#9E1410', ''), '南西': ('五黄殺', '#5A5F8A', ''),
            '北東': ('暗剣殺', '#5A5F8A', ''), '西': ('大吉', TEAL, ''), '中宮': ('', INDIGO, '八')}
    s.panel(bx-14, by-14, c*3+28, c*3+28, r=16)
    for r_, row in enumerate(grid):
        for k, name in enumerate(row):
            x, y = bx+k*c, by+r_*c
            lab, col, star = mark.get(name, ('', None, ''))
            s.d.rectangle(((x+4)*S, (y+4)*S, (x+c-4)*S, (y+c-4)*S), fill=col or '#EFE6CF')
            fg = 'caption' if col else 'body'
            s.telop(name, x+c/2, y+32, 28, fg, anchor='mm', auto_small=False)
            if star and not lab:   # 中宮: year star 八白
                s.telop(star, x+c/2, y+c/2+18, 64, 'number', anchor='mm', auto_small=False)
            elif star:             # 本命星 position
                s.d.rounded_rectangle(((x+30)*S, (y+62)*S, (x+c-30)*S, (y+106)*S), 22*S, fill=IVORY)
                s.telop(star, x+c/2, y+84, 32, 'cardred', anchor='mm', auto_small=False)
            if lab:
                s.telop(lab, x+c/2, y+c-30, 34 if len(lab) > 3 else 38, 'caption', anchor='mm', maxw=c-14, auto_small=False)
    x0 = bx + c*3 + 50
    s.panel(x0, 160, 1760-x0, 510, header='2028年・七赤金星の人')
    for i, (t, st) in enumerate([('七赤は南東にいる', 'card'), ('南東＝本命殺', 'cardred'), ('向かいの北西＝本命的殺', 'cardred'),
                                 ('五大凶殺 → 評価は常にX', 'card')]):
        s.telop(t, x0+36, 300+i*96, 46, st, anchor='lm', maxw=1760-x0-70)
    s.band([('ポイント', '的殺は、自分の星の向かい側に決まる')])
    s.save('-slide-1')

    # slide-2: 七赤 table 2026–2029
    s = BSlide(slug, '的殺の方位は{毎年動く}', 2, ser, '年ごと', rose=(1500, 300))
    s.glow(1330, 230, 150)
    s.guide('slide-2', 'right')
    s.table(60, 160, [300, 390, 390], 96, ['年（七赤金星）', '本命殺', '本命的殺'],
            [['2026年', '南西', '北東'], ['2027年', '東', '西'], ['2028年', '南東', '北西'], ['2029年', '—', '—']],
            hi={(0, 2), (1, 2), (2, 2)})
    s.telop('2029年は七赤が中宮に入り、盤から消える（9年に1度）', 80, 666, 36, 'caption', anchor='lm', maxw=1100)
    s.band([('ポイント', '去年の的殺は、今年はもう的殺ではない')])
    s.save('-slide-2')

    # slide-3: no cancellation
    s = BSlide(slug, '「{相殺}」の計算はない', 3, ser, '相殺', rose=(1200, 420))
    s.guide('slide-3', 'left', inset=0)
    for i, (hd, big, sub, col) in enumerate([('消えない', '前の移動の判定', '後の移動が書き換えることはない', VERM),
                                            ('変わる', '次の移動の起点', 'いま住んでいる場所から測る', TEAL)]):
        x = 640 + i*570
        s.panel(x, 165, 530, 380, header=hd, hfill=col)
        s.telop(big, x+265, 330, 60, ('cardred', 'card')[i], anchor='mm', maxw=480)
        s.telop(sub, x+265, 450, 36, 'body', anchor='mm', maxw=470)
    s.telop('75日の条件も、変えるのは「どこから測るか」だけ', 660, 620, 40, 'caption', anchor='lm', maxw=1090)
    s.band([('ポイント', '吉方位へ動いても、前の判定は消えない')])
    s.save('-slide-3')

    # slide-4: what to do — 4 steps
    s = BSlide(slug, 'やってしまったら{4つ}の手順', 4, ser, '手順', rose=(1500, 300))
    s.guide('slide-4', 'right')
    s.steps([('判定を確かめる', 'どの盤が凶だったか'), ('距離を確かめる', '5km未満は方位が定まらない'),
             ('次の窓を出す', '年盤の期限と三盤の重なる日'), ('暦の外を整える', '日当たり・騒音・通勤')], 60, 160, 1150, 112, 18)
    s.band([('ポイント', 'まず確かめ、次に動ける時期を出す')])
    s.save('-slide-4')


# ---- B. 60年説 --------------------------------------------------------------
def sixty_years():
    slug, ser = 'does-bad-direction-last-60-years', '60年説'
    check(slug, ['**九星気学の年盤は9年で一巡し、60年では元の配置に戻りません。**', '**60年で一巡するのは干支（十干十二支）です。**',
                 '九星と干支が両方そろって同じ組み合わせに戻るのは180年後です',
                 '| 中宮 | 七 | 六 | 五 | 四 | 三 | 二 | 一 | 九 | 八 | **七** |', '60 ÷ 9 = 6 あまり 6',
                 '| 2024 | 甲辰 | — |', '| 2033（+9年） | 癸丑 | 一致しない |', '| 2084（+60年） | 甲辰 | **一致する** |',
                 '10と12の最小公倍数は60', '「三碧・甲辰」', '**2204年**', '**ある日付の吉凶**', '→ **計算していません**',
                 '**どれも検証できる形の主張になっていません**', '周期の話と、効果の有無の話は別です'])

    s = BSlide(slug, '凶方位は{60年}続く？', 0, ser, '結論', rose=(1450, 430))
    s.guide('cover', 'right')
    for i, (n, lab, col) in enumerate([('9年', '年盤（九星）', INDIGO), ('60年', '干支', TEAL), ('180年', '両方そろう', VERM)]):
        x = 60 + i*380
        s.panel(x, 175, 350, 440, header=lab, hfill=col)
        s.telop(n, x+175, 400, 118 if len(n) < 4 else 100, 'number', anchor='mm', auto_small=False, maxw=320)
        s.telop(('で一巡', 'で一巡', 'で同じ組み合わせ')[i], x+175, 545, 36, 'body', anchor='mm', maxw=320)
    s.telop('初代 案内役', 1560, 650, 50, 'label', anchor='mm', auto_small=False)
    s.band([('ポイント', '60年は、九星の年盤から出る数字ではない')])
    s.save()

    s = BSlide(slug, '年盤は{9年}で一巡', 1, ser, '年盤', rose=(1300, 420))
    s.glow(470, 300, 150, (255, 200, 120, 60))
    s.guide('slide-1', 'left', inset=0)
    stars = ['七', '六', '五', '四', '三', '二', '一', '九', '八', '七']
    for i, st in enumerate(stars):
        x, y = 640 + (i % 5)*226, 165 + (i//5)*215
        hi = i in (0, 9)
        s.panel(x, y, 200, 190, r=16, fill='#FDE7DF' if hi else IVORY)
        s.telop(f'{2020+i}年', x+100, y+40, 32, 'body', anchor='mm', auto_small=False)
        s.telop(st, x+100, y+122, 80, 'cardred' if hi else 'card', anchor='mm', auto_small=False)
    s.telop('中宮の星', 640, 630, 34, 'caption', anchor='lm', auto_small=False)
    s.telop('60 ÷ 9 ＝ 6 あまり 6 → 60年後は戻らない', 840, 632, 42, 'caption', anchor='lm', maxw=900)
    s.band([('ポイント', '年盤は9年で同じ並びに戻る')])
    s.save('-slide-1')

    s = BSlide(slug, '60年で戻るのは{干支}', 2, ser, '干支', rose=(1500, 300))
    s.guide('slide-2', 'right')
    s.table(60, 165, [380, 280, 440], 112, ['年', '干支', '2024年と比べると'],
            [['2024年', '甲辰', '—'], ['2033年（+9年）', '癸丑', '一致しない'], ['2084年（+60年）', '甲辰', '一致する']],
            hi={(2, 1), (2, 2)}, sizes=[44, 60, 50])
    s.telop('十干10種 × 十二支12種 → 最小公倍数で60', 80, 640, 40, 'caption', anchor='lm', maxw=1100)
    s.band([('ポイント', '60年で戻るのは、九星ではなく干支')])
    s.save('-slide-2')

    s = BSlide(slug, '両方そろうのは{180年}後', 3, ser, '180年', rose=(1300, 420))
    s.guide('slide-3', 'left', inset=0)
    for i, (lab, n, col) in enumerate([('九星の周期', '9年', 'card'), ('干支の周期', '60年', 'card'), ('両方そろう', '180年', 'cardred')]):
        y = 165 + i*112
        s.panel(640, y, 560, 96, r=18)
        s.telop(lab, 680, y+48, 44, 'body', anchor='lm', auto_small=False)
        s.telop(n, 1170, y+48, 60, col, anchor='rm', auto_small=False)
    s.telop('最小公倍数', 1230, 445, 34, 'label', anchor='lm', auto_small=False)
    s.panel(640, 520, 1110, 150, r=20)
    s.telop('2024年「三碧・甲辰」', 680, 595, 48, 'card', anchor='lm', maxw=520)
    s.arrow(1220, 595, 1300, VERM)
    s.telop('次は2204年', 1330, 595, 62, 'cardred', anchor='lm', maxw=400, auto_small=False)
    s.band([('ポイント', '同じ盤は、生きているあいだに二度は来ない')])
    s.save('-slide-3')

    s = BSlide(slug, '何年続くかは{計算しない}', 4, ser, 'このサイト', rose=(1500, 300))
    s.guide('slide-4', 'right')
    for i, (hd, big, sub, col) in enumerate([('計算する', 'ある日付の吉凶', '年盤・月盤・日盤でどう出るか', TEAL),
                                            ('計算しない', '影響が続く年数', '検証できる形の主張になっていない', VERM)]):
        x = 60 + i*580
        s.panel(x, 170, 540, 480, header=hd, hfill=col)
        s.telop(big, x+270, 370, 62, ('card', 'cardred')[i], anchor='mm', maxw=490)
        s.telop(sub, x+270, 510, 34, 'body', anchor='mm', maxw=480)
    s.band([('ポイント', '周期の話と、効果があるかの話は別')])
    s.save('-slide-4')


# ---- C. 距離と方位 ----------------------------------------------------------
def distance():
    slug, ser = 'how-much-does-distance-matter', '距離と方位'
    check(slug, ['距離そのものは、吉凶の強さを変えません', '**距離で吉凶の強さに重みを付ける処理は入れていません。**', '5km 未満の移動に「方位が定まらない」という注記を出します', '判定は隠しません',
                 '1km の移動なら 268m、5km なら 1340m 横にずれるだけで方位が隣に変わります',
                 '**東西南北（四正）が 30 度、北東・南東・南西・北西（四隅）が 60 度**', '**四正 15 度・四隅 30 度**',
                 '**移動距離のおよそ 27% が境目までの余裕**', '**四隅ならおよそ 58% まで余裕**',
                 '| **1km**  | **268m**                       |', '| **5km**  | **1340m**                      |',
                 '| 10km     | 2679m                          |', '| 100km    | 26.8km                         |',
                 '**町丁目の代表点**', '**数百 m の誤差**', '| 1km      | 268m           | 数百 m     | **誤差のほうが大きい** |',
                 '| 2km      | 536m           | 数百 m     | 同じくらい             |', '| 10km     | 2679m          | 数百 m     | 誤差は無視できる       |',
                 '| 〜1km     | 方位は決まらない。時期だけを見る       |', '| 1〜5km    | 座標を丁寧に。境目なら両方の判定を見る |',
                 '| 5〜30km   | 方位は安定する。通常どおり使える       |', '| 30km 以上 | 誤差は問題にならない                   |'])

    s = BSlide(slug, '距離は{吉凶}を変える？', 0, ser, '結論', rose=(1450, 430))
    s.guide('cover', 'right')
    s.answer_cards([('吉凶の強さ', '変えない'), ('判定の確かさ', '変わる'), ('5km未満', '注記を出す')], 60, 168, 1110, 150, 26)
    s.telop('初代 案内役', 1560, 650, 50, 'label', anchor='mm', auto_small=False)
    s.band([('ポイント', '距離が変えるのは、方位の判定の確かさ')])
    s.save()

    s = BSlide(slug, '方位は{角度}で決まる', 1, ser, '角度', rose=(1300, 420))
    s.guide('slide-1', 'left', inset=0)
    for i, (hd, width, half, pct, col) in enumerate([('四正（東西南北）', 30, 15, '約27%', INDIGO), ('四隅（北東など）', 60, 30, '約58%', TEAL)]):
        x = 640 + i*570
        s.panel(x, 165, 530, 500, header=hd, hfill=col)
        ox, oy, R = x+265, 510, 215
        a0, a1 = -90-width/2, -90+width/2
        s.d.pieslice(((ox-R)*S, (oy-R)*S, (ox+R)*S, (oy+R)*S), a0, a1, fill=col, outline=GOLD, width=3*S)
        s.d.line((ox*S, oy*S, ox*S, (oy-R)*S), fill=(255, 255, 255, 230), width=3*S)
        s.d.ellipse(((ox-10)*S, (oy-10)*S, (ox+10)*S, (oy+10)*S), fill=VERM)
        s.telop(f'幅{width}°', ox, oy-R-16, 34, 'body', anchor='mm', auto_small=False)
        s.telop(f'半幅{half}°', ox, oy+44, 34, 'body', anchor='mm', auto_small=False)
        s.telop(f'余裕＝距離の{pct}', ox, 626, 40, 'cardred', anchor='mm', maxw=480, auto_small=False)
    s.band([('ポイント', '近いほど、少しのずれで隣の方位になる')])
    s.save('-slide-1')

    s = BSlide(slug, '隣の方位に変わる{横ずれ}', 2, ser, '横ずれ', rose=(1500, 300))
    s.guide('slide-2', 'right')
    s.table(60, 160, [440, 640], 106, ['移動距離', '方位が隣に変わる横ずれ（四正）'],
            [['1km', '268m'], ['5km', '1340m'], ['10km', '2679m'], ['100km', '26.8km']], hi={(0, 1), (1, 1)}, sizes=[56, 64])
    s.band([('ポイント', '1kmの引越しは、268mずれると方位が変わる')])
    s.save('-slide-2')

    s = BSlide(slug, '座標には{誤差}がある', 3, ser, '誤差', rose=(1300, 420))
    s.guide('slide-3', 'left', inset=0)
    s.telop('住所の座標は町丁目の代表点 → 数百mの誤差', 680, 180, 40, 'caption', anchor='lm', maxw=1080)
    s.table(680, 230, [250, 340, 490], 112, ['移動距離', '境目までの余裕', '数百mの誤差と比べると'],
            [['1km', '268m', '誤差のほうが大きい'], ['2km', '536m', '同じくらい'], ['10km', '2679m', '誤差は無視できる']],
            hi={(0, 2)}, sizes=[50, 54, 44])
    s.band([('ポイント', '近場では、誤差のほうが方位を決める')])
    s.save('-slide-3')

    s = BSlide(slug, '距離ごとの{使い方}', 4, ser, '使い方', rose=(1500, 300))
    s.guide('slide-4', 'right')
    for i, (dist, how, col) in enumerate([('〜1km', '方位は決まらない。時期だけを見る', VERM), ('1〜5km', '座標を丁寧に。境目は両方の判定を見る', '#C9862F'),
                                         ('5〜30km', '方位は安定する。通常どおり使える', TEAL), ('30km以上', '誤差は問題にならない', INDIGO)]):
        y = 160 + i*128
        s.panel(60, y, 1150, 112, r=20)
        s.d.rounded_rectangle((80*S, (y+14)*S, 330*S, (y+98)*S), 16*S, fill=col)
        s.telop(dist, 205, y+56, 50, 'caption', anchor='mm', maxw=230, auto_small=False)
        s.telop(how, 360, y+56, 44, 'body', anchor='lm', maxw=820)
    s.band([('ポイント', '5km未満は、方位より日取りを見る')])
    s.save('-slide-4')


ARTICLES = {'can-you-recover-from-honmei-teki': honmei_teki, 'does-bad-direction-last-60-years': sixty_years,
            'how-much-does-distance-matter': distance}

if __name__ == '__main__':
    for slug in sys.argv[1:] or ARTICLES:
        ARTICLES[slug]()
