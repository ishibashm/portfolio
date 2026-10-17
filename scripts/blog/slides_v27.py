#!/usr/bin/env python3
"""v27 = v26 broadcast-telop slides + one AI-generated original illustration per slide
(scripts/blog/assets/<article>/, provenance in docs/blog-slide-design.md).

See docs/blog-slide-design.md (v26) for the type system. Everything is drawn in code:
nebula (multi-octave noise, indigo/violet/teal clouds, sparkles, lens flare) + gold compass
line-art, bevelled framed panels, brushed-metal caption band, angled series badge, and
telop() — multi-layer outlined, gradient-filled, skewed Japanese captions with
per-character size jumps and halved 約物.
Fonts (OFL, not bundled): ~/.local/share/fonts/ofl/NotoSansCJKjp-Black.otf, DelaGothicOne-Regular.ttf.
Usage: python3 scripts/blog/slides_v27.py [slug]
"""
from functools import lru_cache
from math import cos, sin, pi, tan, radians
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
W, H, S = 1800, 945, 2
IVORY, INDIGO, VERM, GOLD, INK = '#FBF7EE', '#2B3480', '#E0533D', '#C9A45C', '#1B1E33'
TEAL = '#2E8C88'
OFL = Path.home()/'.local/share/fonts/ofl'


@lru_cache(None)
def font(size, role='gothic'):
    if role == 'num':
        return ImageFont.truetype(str(OFL/'DelaGothicOne-Regular.ttf'), max(1, round(size*S)))
    return ImageFont.truetype(str(OFL/'NotoSansCJKjp-Black.otf'), max(1, round(size*S)))


def rgb(c):
    if isinstance(c, tuple):
        return c[:3]
    c = c.lstrip('#'); return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))


def vgrad(w, h, stops):
    """Vertical gradient image from [(pos, color), ...]."""
    ys = np.linspace(0, 1, max(h, 1))
    pos = [p for p, _ in stops]; cols = np.array([rgb(c) for _, c in stops], float)
    arr = np.stack([np.interp(ys, pos, cols[:, k]) for k in range(3)], -1)
    return Image.fromarray(np.repeat(arr[:, None, :], max(w, 1), 1).astype('uint8'))


# ---- telop type system ----------------------------------------------------
SMALL = set('をはのがにでともへやかな')     # particles → 72%
PUNCT = set('「」、。（）・：')                # 約物 → half advance
STYLES = {
    # level: font, fill gradient, strokes inner→outer [(width ratio, color)], shadow, glow, skew°, condense
    'headline': dict(role='gothic', fill=[(0, '#FFFFFF'), (.55, '#FFFFFF'), (1, '#F1D99A')],
                     strokes=[(.07, INDIGO), (.15, '#0A0A14')], shadow=(.06, (0, 0, 0, 230)),
                     glow=(14, (90, 120, 255, 110)), skew=8, condense=.92, track=-.02),
    'caption':  dict(role='gothic', fill=[(0, '#FFFFFF'), (1, '#FFFFFF')],
                     strokes=[(.11, '#0A0A0A')], shadow=(.07, (0, 0, 0, 210)),
                     glow=None, skew=6, condense=.94, track=-.02),
    'label':    dict(role='gothic', fill=[(0, '#FF6B4F'), (.5, '#E3241B'), (1, '#9E1410')],
                     strokes=[(.08, '#FFFFFF'), (.14, '#0A0A0A')], shadow=(.06, (0, 0, 0, 220)),
                     glow=None, skew=6, condense=.94, track=-.02),
    'card':     dict(role='gothic', fill=[(0, '#3D49B0'), (1, '#1E2563')],
                     strokes=[(.05, '#FFFFFF')], shadow=(.03, (20, 20, 40, 90)),
                     glow=None, skew=0, condense=.96, track=-.03),
    'cardred':  dict(role='gothic', fill=[(0, '#F06A50'), (1, '#B8321F')],
                     strokes=[(.05, '#FFFFFF')], shadow=(.03, (20, 20, 40, 80)),
                     glow=None, skew=0, condense=.96, track=-.03),
    'body':     dict(role='gothic', fill=[(0, INK), (1, INK)], strokes=[], shadow=None,
                     glow=None, skew=0, condense=.97, track=-.03),
    'number':   dict(role='num', fill=[(0, '#FFE9A8'), (1, '#C9932F')],
                     strokes=[(.06, '#3A2A0A'), (.12, '#FFFFFF')], shadow=(.05, (0, 0, 0, 160)),
                     glow=None, skew=0, condense=1, track=0),
}


def layout(text, size, style, auto_small=True):
    """Markup: {..} = keyword (x1.18, marker bar). Returns [(ch, size, kw)]."""
    out, kw = [], False
    for ch in text:
        if ch == '{': kw = True; continue
        if ch == '}': kw = False; continue
        k = 1.18 if kw else (.72 if auto_small and ch in SMALL else 1)
        out.append((ch, size*k, kw))
    return out


def render_telop(text, size, style='caption', marker=None, auto_small=True, color=None):
    st = dict(STYLES[style])
    if color:
        st['fill'] = [(0, color), (1, color)]
    toks = layout(text, size, st, auto_small)
    pad = int(size*.5*S)
    # advance widths
    xs, x = [], 0.0
    for ch, sz, _ in toks:
        f = font(sz, st['role'])
        adv = f.getlength(ch)
        if ch in PUNCT:  # 約物 half width: keep the inked half
            off = -adv*.45 if ch in '「（' else (-adv*.22 if ch in '・：' else 0)
            adv *= .55
        else:
            off = 0
        xs.append((x+off, f)); x += adv + st['track']*sz*S
    wpx, hpx = int(x)+2*pad, int(size*1.6*S)+2*pad
    base = pad + int(size*1.18*S)
    fill_m = Image.new('L', (wpx, hpx))
    dm = ImageDraw.Draw(fill_m)
    strokes = [Image.new('L', (wpx, hpx)) for _ in st['strokes']]
    ds = [ImageDraw.Draw(m) for m in strokes]
    for (ch, sz, kw), (cx, f) in zip(toks, xs):
        pos = (pad+cx, base)
        dm.text(pos, ch, font=f, fill=255, anchor='ls')
        for (r, _), d in zip(st['strokes'], ds):
            d.text(pos, ch, font=f, fill=255, anchor='ls', stroke_width=max(1, round(size*r*S)), stroke_fill=255)
    outer = strokes[-1] if strokes else fill_m
    layer = Image.new('RGBA', (wpx, hpx), (0, 0, 0, 0))
    if st['glow']:
        rad, col = st['glow']
        g = Image.new('RGBA', layer.size, col); g.putalpha(outer.filter(ImageFilter.GaussianBlur(rad*S)).point(lambda v: v*col[3]//255))
        layer.alpha_composite(g)
    if st['shadow']:
        o, col = st['shadow']; d = max(2, round(size*o*S))
        sh = Image.new('RGBA', layer.size, col[:3]+(0,))
        m = ImageChops.offset(outer, d, d).filter(ImageFilter.GaussianBlur(1.2*S))
        sh.putalpha(m.point(lambda v: v*col[3]//255)); layer.alpha_composite(sh)
    if marker:  # keyword marker bar under {..} chars
        md = ImageDraw.Draw(layer)
        for (ch, sz, kw), (cx, f) in zip(toks, xs):
            if kw:
                md.rectangle((pad+cx-2*S, base-sz*.30*S, pad+cx+f.getlength(ch)+2*S, base+sz*.08*S), fill=marker)
    for (r, col), m in reversed(list(zip(st['strokes'], strokes))):
        c = Image.new('RGBA', layer.size, rgb(col)+(255,)); c.putalpha(m); layer.alpha_composite(c)
    gr = vgrad(wpx, int(size*1.3*S), st['fill']).convert('RGBA')
    full = Image.new('RGBA', layer.size, rgb(st['fill'][-1][1])+(255,))
    full.paste(gr, (0, base-int(size*1.12*S)))
    full.putalpha(fill_m); layer.alpha_composite(full)
    if st['condense'] != 1:
        layer = layer.resize((int(wpx*st['condense']), hpx), Image.LANCZOS)
    if st['skew']:
        k = tan(radians(st['skew'])); extra = int(hpx*k)
        layer = layer.transform((layer.width+extra, hpx), Image.AFFINE, (1, k, -extra, 0, 1, 0), Image.BICUBIC)
    bbox = layer.getbbox() or (0, 0, 1, 1)
    return layer.crop(bbox), (base - bbox[1])


def nebula(seed, cx, cy):
    rng = np.random.default_rng(seed)
    w, h = W*S//4, H*S//4
    def noise(scale):
        small = rng.random((h//scale+2, w//scale+2))
        return np.asarray(Image.fromarray((small*255).astype('uint8')).resize((w, h), Image.BICUBIC), float)/255
    def fbm():
        return sum(noise(sc)*a for sc, a in ((96, .45), (40, .3), (14, .17), (5, .08)))
    yy, xx = np.mgrid[0:h, 0:w]
    img = np.zeros((h, w, 3))
    img[:] = np.array([8, 10, 30]) * (1 - .4*yy[..., None]/h) + np.array([4, 5, 16]) * (yy[..., None]/h)
    for col, (ox, oy, sx, sy), gain in (((70, 60, 190), (.32, .4, .55, .5), 1.0),   # indigo
                                        ((130, 60, 170), (.72, .3, .35, .4), .8),   # violet
                                        ((30, 150, 160), (.6, .7, .4, .35), .7)):  # teal
        c = np.clip((fbm()-.33)*2.4, 0, 1)
        g = np.exp(-(((xx/w-ox)/sx)**2 + ((yy/h-oy)/sy)**2))
        img += np.array(col)[None, None, :] * (c*g*gain)[..., None]
    img = img.clip(0, 255)
    im = Image.fromarray(img.astype('uint8')).resize((W*S, H*S), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))
    im = im.convert('RGBA'); d = ImageDraw.Draw(im, 'RGBA')
    for _ in range(260):
        x, y = rng.random()*W*S, rng.random()*H*S; r = rng.choice([1, 1, 1.4, 2])*S
        d.ellipse((x-r, y-r, x+r, y+r), fill=(240, 240, 255, int(rng.integers(80, 230))))
    for _ in range(9):  # sparkles
        x, y = rng.random()*W*S, rng.random()*H*.65*S; L = rng.integers(10, 26)*S
        d.line((x-L, y, x+L, y), fill=(255, 250, 230, 170), width=S); d.line((x, y-L, x, y+L), fill=(255, 250, 230, 170), width=S)
        d.ellipse((x-3*S, y-3*S, x+3*S, y+3*S), fill=(255, 255, 255, 255))
    # lens flare
    fl = Image.new('RGBA', im.size); fd = ImageDraw.Draw(fl)
    fx, fy = W*.86*S, H*.12*S
    for r, a in ((150, 18), (70, 50), (26, 150)):
        fd.ellipse((fx-r*S, fy-r*S, fx+r*S, fy+r*S), fill=(255, 230, 190, a))
    for t, r in ((.35, 40), (.55, 22), (.8, 60)):
        px, py = fx + (W*.5*S-fx)*t*2, fy + (H*.5*S-fy)*t*2
        fd.ellipse((px-r*S, py-r*S, px+r*S, py+r*S), outline=(200, 220, 255, 45), width=3*S)
    im.alpha_composite(fl.filter(ImageFilter.GaussianBlur(10*S)))
    # gold compass line-art + 八卦 ring
    d = ImageDraw.Draw(im, 'RGBA'); line = (201, 164, 92, 55)
    for r in (420, 360, 250):
        d.ellipse(((cx-r)*S, (cy-r)*S, (cx+r)*S, (cy+r)*S), outline=line, width=2*S)
    for k in range(16):
        a = k*pi/8; r0 = 250 if k % 2 else 0
        d.line(((cx+r0*cos(a))*S, (cy+r0*sin(a))*S, (cx+420*cos(a))*S, (cy+420*sin(a))*S), fill=line, width=S)
    for k, b in enumerate(['111', '110', '101', '100', '011', '010', '001', '000']):
        a = k*pi/4 - pi/2; bx, by = cx+390*cos(a), cy+390*sin(a)
        for j, bit in enumerate(b):
            y = by - 14 + j*14
            segs = [(bx-22, bx+22)] if bit == '1' else [(bx-22, bx-5), (bx+5, bx+22)]
            for x0, x1 in segs:
                d.line((x0*S, y*S, x1*S, y*S), fill=(201, 164, 92, 90), width=6*S)
    return im


ASSETS = Path(__file__).resolve().parent/'assets'


def load_art(article, name):
    return Image.open(ASSETS/article/f'{name}.jpg').convert('RGB')


def cover_crop(im, w, h, fx=.5, fy=.5):
    """Scale to cover w×h (px at 2x) and crop around focus (fx, fy)."""
    k = max(w/im.width, h/im.height); im = im.resize((int(im.width*k)+1, int(im.height*k)+1), Image.LANCZOS)
    x = int((im.width-w)*fx); y = int((im.height-h)*fy)
    return im.crop((x, y, x+w, y+h))


# ---- guide character cut-out (flat indigo background → alpha) ----
def _f(mask, flt):
    return np.asarray(Image.fromarray((mask*255).astype('uint8')).filter(flt)) > 0
def cutout(im):
    a = np.asarray(im, float)
    border = np.concatenate([a[0], a[:, 0], a[:, -1]])
    bg = np.median(border, 0)
    d = np.sqrt(((a-bg)**2).sum(-1))
    lum = a.mean(-1) - bg.mean()
    h, w = d.shape
    core = Image.fromarray(np.where(d < 30, 255, 0).astype('uint8')).copy()
    seeds = [(x, 0) for x in range(0, w, 12)] + [(0, y) for y in range(0, int(h*.85), 12)] + [(w-1, y) for y in range(0, int(h*.85), 12)]
    for p in seeds:
        if core.getpixel(p) == 255: ImageDraw.floodfill(core, p, 128)
    c = np.asarray(core) == 128
    alpha = np.ones_like(d)
    near_dark = _f(c, ImageFilter.MaxFilter(9))
    alpha[near_dark] = np.clip((d[near_dark]-10)/24, 0, 1)
    alpha[c] = np.clip((d[c]-12)/50, 0, 1)**1.5   # halo inside flood: soft, unmixed
    alpha[c & (d < 12)] = 0
    alpha = np.asarray(Image.fromarray((alpha*255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.0)), float)/255
    al = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - bg*(1-al))/al, 0, 255)
    o = Image.fromarray(np.dstack([rgb, alpha*255]).astype('uint8'), 'RGBA')
    return o.crop(o.getbbox())

@lru_cache(None)
def character(article, name):
    return cutout(load_art(article, name))


class Slide:
    def __init__(self, slug, headline, number, total=6, rose=(1500, 300), topic='全体像'):
        self.slug = slug
        self.im = nebula(number+21, *rose)
        self.d = ImageDraw.Draw(self.im)
        self.telop(headline, 56, 82, 78, 'headline', anchor='lm', maxw=1200, marker=(224, 83, 61, 235))
        # angled series badge (navy, gold edge)
        x0, x1, y0, y1 = 1290, 1764, 26, 88
        pts = [(x0+26, y0), (x1, y0), (x1-26, y1), (x0, y1)]
        self.d.polygon([(a*S, b*S) for a, b in pts], fill=(24, 32, 92, 255))
        self.d.line([(a*S, b*S) for a, b in pts+[pts[0]]], fill=GOLD, width=3*S)
        self.d.line(((x0+30)*S, (y0+5)*S, (x1-6)*S, (y0+5)*S), fill=(120, 140, 220, 160), width=S)
        self.telop('占いの土台', x0+52, 57, 34, 'caption', anchor='lm', auto_small=False)
        self.telop(topic, x0+262, 57, 34, 'label', anchor='lm', auto_small=False)
        self.number, self.total = number, total

    def telop(self, text, x, y, size, style='caption', anchor='lm', marker=None, auto_small=True, maxw=None, color=None):
        layer, base = render_telop(text, size, style, marker, auto_small, color)
        while maxw and layer.width/S > maxw:
            size -= 2; layer, base = render_telop(text, size, style, marker, auto_small, color)
        w, h = layer.width, layer.height
        px = {'l': x*S, 'm': x*S-w/2, 'r': x*S-w}[anchor[0]]
        py = {'t': y*S, 'm': y*S-h/2, 's': y*S-base}[anchor[1]]
        self.im.alpha_composite(layer, (int(px), int(py))); self.d = ImageDraw.Draw(self.im)
        return w/S

    def t(self, value, x, y, size, fill=INK, role='gothic', anchor='lt', maxw=None, outline=None):
        while maxw and font(size, role).getlength(value)/S > maxw:
            size -= 1
        self.d.text((x*S, y*S), value, font=font(size, role), fill=fill, anchor=anchor)

    def panel(self, x, y, w, h, fill=IVORY, r=18, header=None, hfill=INDIGO):
        """Framed panel: soft drop shadow, gold frame, bevel, inner shadow, gradient header."""
        X, Y, X2, Y2 = x*S, y*S, (x+w)*S, (y+h)*S
        sh = Image.new('RGBA', self.im.size); sd = ImageDraw.Draw(sh)
        sd.rounded_rectangle((X+8*S, Y+14*S, X2+8*S, Y2+14*S), r*S, fill=(0, 0, 0, 150))
        self.im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12*S))); self.d = ImageDraw.Draw(self.im)
        fr = vgrad(int(X2-X)+12*S, int(Y2-Y)+12*S, [(0, '#F3DDA0'), (.5, '#B8903F'), (1, '#7A5A22')]).convert('RGBA')
        m = Image.new('L', fr.size); ImageDraw.Draw(m).rounded_rectangle((0, 0, fr.width-1, fr.height-1), (r+6)*S, fill=255)
        self.im.paste(fr, (int(X-6*S), int(Y-6*S)), m)
        self.d = ImageDraw.Draw(self.im)
        self.d.rounded_rectangle((X, Y, X2, Y2), r*S, fill=fill)
        # inner shadow along top/left
        ins = Image.new('RGBA', self.im.size); idr = ImageDraw.Draw(ins)
        idr.rounded_rectangle((X, Y, X2, Y2), r*S, outline=(60, 40, 10, 90), width=8*S)
        ins = ins.filter(ImageFilter.GaussianBlur(5*S))
        clip = Image.new('L', self.im.size); ImageDraw.Draw(clip).rounded_rectangle((X, Y, X2, Y2), r*S, fill=255)
        ins.putalpha(ImageChops.multiply(ins.getchannel('A'), clip)); self.im.alpha_composite(ins); self.d = ImageDraw.Draw(self.im)
        if header:
            c = rgb(hfill); light = tuple(min(255, int(v*1.35+20)) for v in c); dark = tuple(int(v*.7) for v in c)
            hg = vgrad(int(X2-X), 78*S, [(0, light), (.5, c), (1, dark)]).convert('RGBA')
            hm = Image.new('L', hg.size); ImageDraw.Draw(hm).rounded_rectangle((0, 0, hg.width-1, hg.height+r*S), r*S, fill=255)
            self.im.paste(hg, (int(X), int(Y)), hm); self.d = ImageDraw.Draw(self.im)
            self.d.line((X+r*S, Y+2*S, X2-r*S, Y+2*S), fill=(255, 255, 255, 120), width=2*S)
            self.telop(header, x+w/2, y+40, 38, 'caption', anchor='mm', maxw=w-40, auto_small=False)

    def inset(self, art, x, y, w, h, fx=.5, fy=.5, r=18, fade=None):
        """Framed illustration: gold bevel frame, drop shadow, inner vignette; optional bottom fade."""
        X, Y, Wp, Hp = x*S, y*S, w*S, h*S
        sh = Image.new('RGBA', self.im.size); ImageDraw.Draw(sh).rounded_rectangle((X+8*S, Y+14*S, X+Wp+8*S, Y+Hp+14*S), r*S, fill=(0, 0, 0, 160))
        self.im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12*S)))
        fr = vgrad(Wp+12*S, Hp+12*S, [(0, '#F3DDA0'), (.5, '#B8903F'), (1, '#7A5A22')]).convert('RGBA')
        m = Image.new('L', fr.size); ImageDraw.Draw(m).rounded_rectangle((0, 0, fr.width-1, fr.height-1), (r+6)*S, fill=255)
        self.im.paste(fr, (X-6*S, Y-6*S), m)
        pic = cover_crop(art, Wp, Hp, fx, fy).convert('RGBA')
        vig = Image.new('L', pic.size, 0); ImageDraw.Draw(vig).rounded_rectangle((0, 0, Wp, Hp), r*S, outline=255, width=26*S)
        dark = Image.new('RGBA', pic.size, (6, 8, 26, 255)); dark.putalpha(vig.filter(ImageFilter.GaussianBlur(22*S)).point(lambda v: v*150//255))
        pic.alpha_composite(dark)
        if fade:  # darken lower part so overlaid telops read
            g = vgrad(Wp, Hp, [(0, (0, 0, 0)), (1-fade, (0, 0, 0)), (1, (255, 255, 255))]).convert('L')
            d2 = Image.new('RGBA', pic.size, (8, 10, 30, 255)); d2.putalpha(g.point(lambda v: v*210//255)); pic.alpha_composite(d2)
        mm = Image.new('L', pic.size); ImageDraw.Draw(mm).rounded_rectangle((0, 0, Wp-1, Hp-1), r*S, fill=255)
        self.im.paste(pic, (X, Y), mm); self.d = ImageDraw.Draw(self.im)
        self.d.rounded_rectangle((X, Y, X+Wp, Y+Hp), r*S, outline=(255, 240, 200, 120), width=2*S)

    def glow_art(self, art, cx, cy, size, opacity=.75, sharp=.42):
        """Borderless: art fades radially into the nebula; outer ring blurred (decorative parts hidden)."""
        Wp = size*S
        pic = cover_crop(art, Wp, Wp)
        blur = pic.filter(ImageFilter.GaussianBlur(10*S))
        yy, xx = np.mgrid[0:Wp, 0:Wp]; rr = np.hypot(xx-Wp/2, yy-Wp/2)/(Wp/2)
        sharp_m = Image.fromarray((np.clip((sharp+.08-rr)/.16, 0, 1)*255).astype('uint8'))
        pic = Image.composite(pic, blur, sharp_m).convert('RGBA')
        alpha = np.clip((1-rr)/.45, 0, 1)**1.4*255*opacity
        pic.putalpha(Image.fromarray(alpha.astype('uint8')))
        scr = Image.new('RGBA', self.im.size); scr.paste(pic, (int(cx*S-Wp/2), int(cy*S-Wp/2)))
        self.im.alpha_composite(scr); self.d = ImageDraw.Draw(self.im)

    def presenter(self, cut, x, top, height, rim=True):
        """Place the cut-out guide at a slide edge; drawn before band() so the band overlaps it."""
        k = height*S/cut.height
        c = cut.resize((int(cut.width*k), int(cut.height*k)), Image.LANCZOS)
        X, Y = int(x*S), int(top*S)
        if rim:  # soft indigo rim light so the figure separates from the nebula
            a = c.getchannel('A').filter(ImageFilter.GaussianBlur(14*S))
            g = Image.new('RGBA', c.size, (120, 140, 255, 0)); g.putalpha(a.point(lambda v: v*90//255))
            self.im.alpha_composite(g, (X, Y))
        self.im.alpha_composite(c, (X, Y)); self.d = ImageDraw.Draw(self.im)

    def band(self, items):
        """Brushed-metal panel tinted indigo, bevel highlight, gold rule, red label + white caption."""
        y0, y1 = 706, 896; bw, bh = (W-64)*S, (y1-y0)*S
        rng = np.random.default_rng(5)
        streak = rng.normal(0, 1, (1, bw)); streak = np.convolve(streak[0], np.ones(9)/9, 'same')[None, :]
        rows = np.linspace(0, 1, bh)[:, None]
        base = 70 - 34*rows + 9*streak + rng.normal(0, 2.5, (bh, 1))
        arr = np.stack([base*.92+6, base*.95+8, base*1.05+22], -1).clip(0, 255).astype('uint8')
        metal = Image.fromarray(arr).convert('RGBA')
        m = Image.new('L', metal.size); ImageDraw.Draw(m).rounded_rectangle((0, 0, bw-1, bh-1), 14*S, fill=255)
        sh = Image.new('RGBA', self.im.size); ImageDraw.Draw(sh).rounded_rectangle((32*S, (y0+10)*S, (W-24)*S, (y1+12)*S), 14*S, fill=(0, 0, 0, 170))
        self.im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10*S)))
        self.im.paste(metal, (32*S, y0*S), m); self.d = ImageDraw.Draw(self.im)
        self.d.rounded_rectangle((32*S, y0*S, (W-32)*S, y1*S), 14*S, outline=(20, 22, 40, 255), width=3*S)
        self.d.line((46*S, (y0+4)*S, (W-46)*S, (y0+4)*S), fill=(230, 232, 245, 200), width=2*S)   # bevel highlight
        self.d.line((46*S, (y1-4)*S, (W-46)*S, (y1-4)*S), fill=(8, 8, 16, 220), width=3*S)       # bevel shade
        self.d.line((60*S, (y0+12)*S, (W-60)*S, (y0+12)*S), fill=GOLD, width=2*S)                # gold rule
        step = (y1-y0-12)/len(items)
        for i, (kw, body) in enumerate(items):
            cy = y0 + 14 + step*(i+.5)
            w = self.telop(f'【{kw}】', 52, cy, 62, 'label', anchor='lm', auto_small=False)
            self.telop(body, 52+w+18, cy, 64, 'caption', anchor='lm', maxw=W-130-w)

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

    def footer(self):
        number, total = self.number, self.total
        x = W-60-font(22).getlength('cloud palette')/S - 52
        self.d.ellipse((x*S, 912*S, (x+22)*S, 932*S), fill=IVORY); self.d.ellipse(((x+12)*S, 906*S, (x+38)*S, 932*S), fill=IVORY)
        self.d.ellipse(((x+32)*S, 918*S, (x+40)*S, 926*S), fill=VERM)
        self.t('cloud palette', x+48, 920, 22, IVORY, anchor='lm')
        self.t(f'{number+1:02d}/{total:02d}', x-24, 920, 22, (200, 200, 230, 255), anchor='rm')
        self.t('伝統的な占術の考え方・効果が科学的に確認されたものではありません', 60, 920, 20, (180, 184, 214, 255), anchor='lm')


    def save(self, suffix=''):
        self.footer()
        out = ROOT/'public/blog'/f'{self.slug}{suffix}.png'
        im = self.im.convert('RGB').resize((W, H), Image.Resampling.LANCZOS)
        for n in (96, 84, 72):  # fewest steps down until under the size budget
            im.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
            if out.stat().st_size <= 300_000:
                break
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

    A = lambda n: load_art('four-foundations', n)

    C = lambda n: character('four-foundations', n)

    # cover: guide (first generation) on the right, 2×2 foundations on the left
    s = Slide(slug, '占いの{土台}は{4}つ', 0, rose=(1450, 430), topic='全体像')
    s.presenter(C('cover'), 1130, 112, 840)
    gl = Image.new('RGBA', s.im.size); ImageDraw.Draw(gl).ellipse((1150*S, 140*S, 1430*S, 420*S), fill=(255, 196, 120, 70))
    s.im.alpha_composite(gl.filter(ImageFilter.GaussianBlur(40*S))); s.d = ImageDraw.Draw(s.im)
    for i, (name, sub) in enumerate(zip(F, ['2つで分ける', '5つで分ける', '60で数える', '時を区切る'])):
        x, y = (60, 625)[i % 2], (170, 435)[i//2]
        s.panel(x, y, 535, 235)
        s.icon(name, x+92, y+117, 48)
        s.telop(name, x+175, y+80, 96, 'card', anchor='lm', auto_small=False)
        s.telop(sub, x+179, y+178, 42, 'cardred', anchor='lm')
    s.telop('初代 案内役', 1480, 650, 58, 'label', anchor='mm', auto_small=False)
    s.band([('ポイント', '占いはどれも、この4つを組み合わせてできている')])
    s.save()

    # slide-1: guide on the left, table on the right
    s = Slide(slug, '占術は{どの土台}を使う？', 1, rose=(200, 650), topic='対応表')
    s.presenter(C('slide-1'), -150, 130, 800)
    x, y, c0, cw, rh = 520, 165, 400, 205, 104
    s.panel(x, y, c0+cw*4, 92+rh*3, r=22)
    s.d.rounded_rectangle((x*S, y*S, (x+c0+cw*4)*S, (y+92)*S), 22*S, fill=INDIGO)
    s.d.rectangle((x*S, (y+60)*S, (x+c0+cw*4)*S, (y+92)*S), fill=INDIGO)
    for j, f in enumerate(F):
        cx = x+c0+cw*j+cw/2
        s.d.ellipse(((cx-74)*S, (y+10)*S, (cx-2)*S, (y+82)*S), fill=IVORY)
        s.icon(f, cx-38, y+46, 26)
        s.telop(f, cx+6, y+46, 42, 'caption', anchor='lm', auto_small=False)
    rows = [('四柱推命', [1, 1, 1, 1], ''), ('九星気学・方位', [0, 1, 0, 1], '＋九星'), ('風水', [1, 1, 0, 0], '＋八卦')]
    for i, (name, marks, extra) in enumerate(rows):
        yy = y+92+rh*i
        if i % 2:
            s.d.rectangle(((x+6)*S, yy*S, (x+c0+cw*4-6)*S, (yy+rh)*S), fill='#F0E6CC')
        if i:
            s.d.line(((x+24)*S, yy*S, (x+c0+cw*4-24)*S, yy*S), fill='#E3DCCB', width=2*S)
        s.telop(name, x+30, yy+(rh/2 if not extra else rh/2-14), 46, 'body', anchor='lm', auto_small=False)
        if extra:
            s.t(extra, x+32, yy+rh/2+30, 26, TEAL, anchor='lm')
        for j, m in enumerate(marks):
            cx = x+c0+cw*j+cw/2
            if m:
                s.d.ellipse(((cx-22)*S, (yy+rh/2-22)*S, (cx+22)*S, (yy+rh/2+22)*S), fill=VERM)
            else:
                s.d.line(((cx-16)*S, (yy+rh/2)*S, (cx+16)*S, (yy+rh/2)*S), fill='#B8B0A0', width=4*S)
    s.telop('●＝主に使う土台（一般的な説明。流派によって違う）', x, y+92+rh*3+46, 30, 'caption', anchor='lm', auto_small=False)
    s.band([('ポイント', '同じ土台でも、組み合わせ方で占いが変わる')])
    s.save('-slide-1')

    # slide-2: guide + fire horse on the left, 4 rows on the right
    s = Slide(slug, '例：{2026}年は「{丙午}」', 2, rose=(1550, 420), topic='具体例')
    s.presenter(C('slide-2'), -60, 150, 700)
    s.telop('丙午', 470, 205, 100, 'label', anchor='mm', auto_small=False)
    s.telop('ひのえうま', 640, 222, 36, 'caption', anchor='mm', auto_small=False)
    for i, (f, body) in enumerate([('干支', '丙（十干）＋ 午（十二支）'), ('五行', '丙も午も「火」'),
                                    ('陰陽', '丙は「陽」の火'), ('暦', '立春（2月4日）から丙午')]):
        y = 175 + i*122
        s.panel(760, y, 990, 104, r=20)
        s.icon(f, 822, y+52, 30)
        s.telop(f, 880, y+52, 42, 'card', anchor='lm', auto_small=False)
        s.telop(body, 1030, y+52, 48, 'body', anchor='lm', maxw=700)
    s.band([('ポイント', '年の名前ひとつに、4つの土台がそろっている')])
    s.save('-slide-2')

    # slide-3: flow chart on the left, thinking guide on the right
    s = Slide(slug, '{天中殺}はどの土台？', 3, rose=(900, 420), topic='見分け方')
    s.presenter(C('slide-3'), 1350, 120, 820)
    for i, (head, ex) in enumerate([('出てくる言葉', '「空亡」'), ('どの土台か', '干支'), ('答えを動かす入力', '生まれた日')]):
        x = 50 + i*440
        s.panel(x, 235, 365, 260, header=head, hfill=(INDIGO, TEAL, VERM)[i])
        if i == 1:
            s.icon('干支', x+95, 410, 36)
            s.telop(ex, x+150, 410, 80, 'card', anchor='lm', auto_small=False)
        else:
            s.telop(ex, x+182, 410, 64, 'card', anchor='mm', maxw=330, auto_small=False)
        if i < 2:
            s.arrow(x+372, 365, x+432)
    s.band([('ポイント', '言葉を見れば、どの土台の話かが分かる')])
    s.save('-slide-3')

    # slide-4: two columns on the left, guide with compass + calendar on the right
    s = Slide(slug, '方位と天中殺は{土台}が違う', 4, rose=(900, 420), topic='このサイト')
    s.presenter(C('slide-4'), 1230, 120, 820)
    for i, (head, q, fs, base, col) in enumerate([('方位の吉凶', 'どちらへ', ['五行', '暦'], '九星気学＋暦', INDIGO),
                                                  ('天中殺', 'いつ', ['干支'], '干支（生まれた日）', TEAL)]):
        x = 60 + i*620
        s.panel(x, 180, 580, 420, header=head, hfill=col)
        s.telop(f'「{q}」', x+290, 340, 96, ('card', 'cardred')[i], anchor='mm', auto_small=False)
        w = font(48).getlength(base)/S + 84*len(fs)
        xx = x+290-w/2
        for f in fs:
            s.icon(f, xx+34, 500, 28); xx += 84
        s.telop(base, xx, 500, 48, 'body', anchor='lm', auto_small=False, maxw=520-84*len(fs))
    s.band([('ポイント', '方位は「どちらへ」、天中殺は「いつ」を見る')])
    s.save('-slide-4')

    # slide-5: stacked CTA cards on the left, guide with smartphone on the right
    s = Slide(slug, '自分の場合を{調べる}', 5, rose=(900, 420), topic='まとめ')
    s.presenter(C('slide-5'), 1240, 120, 820)
    for i, (title, url, fs, col) in enumerate([('方位を調べる', 'cloud-palette.com/houi', ['五行', '暦'], INDIGO),
                                               ('天中殺つきで日取りを選ぶ', 'cloud-palette.com/calendar', ['干支', '暦'], TEAL)]):
        y = 165 + i*255
        s.panel(60, y, 1160, 225)
        for k, f in enumerate(fs):
            s.icon(f, 110+k*80, y+60, 30)
        s.telop(title, 290, y+62, 56, ('card', 'cardred')[i], anchor='lm', maxw=900)
        s.d.rounded_rectangle((100*S, (y+125)*S, 1180*S, (y+195)*S), 35*S, fill=VERM)
        s.telop(url + ' →', 640, y+160, 40, 'caption', anchor='mm', maxw=1000, auto_small=False)
    s.band([('ポイント', '土台が分かったら、自分の生年月日で確かめる')])
    s.save('-slide-5')


ARTICLES = {'four-foundations-of-eastern-divination': four_foundations}

if __name__ == '__main__':
    ARTICLES[sys.argv[1] if len(sys.argv) > 1 else 'four-foundations-of-eastern-divination']()
