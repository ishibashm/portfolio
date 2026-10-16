#!/usr/bin/env python3
"""Regenerate the moving-during-tenchusatsu cover and five slides.

Design adapted from ishibashm/slides-site v10 tools/news.py (lower_third,
sub_bar, num_block), archive/versions/recent-v10-news-IRItBl and NOTES.md.
The source repository is read-only; this port runs independently of it.
Requires Python 3 + Pillow and the two OFL fonts below (not bundled).
Run from any directory: python3 scripts/blog/news_telop.py
"""
from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops


def hx(value):
    return tuple(bytes.fromhex(value))


NOTO='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
ARCH='/usr/share/fonts/truetype/sand-box/google/Archivo Black/ArchivoBlack-Regular.ttf'
DPIO=2; SS=1; D=2   # work at 2x, downsample
RED=[(0,'F2333A'),(.5,'D7141A'),(1,'9E0A10')]; WHT=[(0,'FFFFFF'),(.48,'F6F7F8'),(.52,'E9EBEE'),(1,'CDD1D7')]; BLK=[(0,'3C3C3C'),(.45,'1C1C1C'),(1,'000000')]
INK=(17,17,17); YEL=(255,208,0); WHITE=(255,255,255)
_f={}
def FT(path,px):
    k=(path,int(px))
    if k not in _f: _f[k]=ImageFont.truetype(path,int(px),index=0)
    return _f[k]
LAT=set('0123456789,.:-/%+² ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')
def grad(w,h,stops):
    col=Image.new('RGB',(1,h)); p=col.load()
    for y in range(h):
        t=y/max(1,h-1)
        for (p0,c0),(p1,c1) in zip(stops,stops[1:]):
            if p0<=t<=p1:
                u=(t-p0)/max(1e-6,p1-p0); a,b=hx(c0),hx(c1); p[0,y]=tuple(int(a[i]+(b[i]-a[i])*u) for i in range(3)); break
    return col.resize((w,h))
def textimg(runs,shear=0.0,bold=0.035):
    """runs: (text, px, rgb, latin_font_ok). Heavy look = Noto Sans CJK JP Bold + same-colour stroke. Returns RGBA cropped."""
    pieces=[]
    for t,px,c,lat in runs:
        for ch in t: pieces.append((ch,ARCH if (lat and ch in LAT) else NOTO,px,c))
    big=max(p[2] for p in pieces); W=int(sum(FT(f,px).getlength(ch) for ch,f,px,c in pieces)+big); H=int(big*1.6); base=int(big*1.2)
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im); x=big*.3
    for ch,f,px,c in pieces:
        ft=FT(f,px); sw=max(1,round(px*bold)) if f==NOTO else 0
        d.text((x,base),ch,font=ft,fill=c+(255,),anchor='ls',stroke_width=sw,stroke_fill=c+(255,)); x+=ft.getlength(ch)+(sw*0.6 if f==NOTO else 0)
    if shear: im=im.transform((W+int(shear*H),H),Image.AFFINE,(1,shear,-shear*H,0,1,0),Image.BICUBIC)
    return im.crop(im.getbbox())
def fillpoly(canvas,pts,stops,y0,y1):
    m=Image.new('L',canvas.size); ImageDraw.Draw(m).polygon(pts,fill=255)
    g=Image.new('RGB',canvas.size); g.paste(grad(canvas.size[0],max(2,int(y1-y0)),stops),(0,int(y0)))
    canvas.paste(g,(0,0),m); return m
def finish(c,masks,shadow=.35):
    if shadow:
        a=Image.new('L',c.size)
        for m in masks: a=ImageChops.lighter(a, m)
        sh=Image.new('RGBA',c.size,(0,0,0,255)); sh.putalpha(a.filter(ImageFilter.GaussianBlur(D*.025)).point(lambda v:int(v*shadow)))
        out=Image.new('RGBA',c.size,(0,0,0,0)); out.alpha_composite(sh,(int(D*.02),int(D*.03))); out.alpha_composite(c); c=out
    c=c.crop(c.getbbox()); return c.resize((max(1,c.width//SS),max(1,c.height//SS)),Image.LANCZOS)
def stripes(c,x,H,sl,n=3,top=0):
    ms=[]; sw,gap=.07*H,.055*H
    for i in range(n):
        x0=x+i*(sw+gap); ms.append(fillpoly(c,[(x0,top+H),(x0+sw,top+H),(x0+sw+sl,top),(x0+sl,top)],RED,top,top+H))
    return x+n*(sw+gap)+.02*H, ms
def chevrons(c,x,yt,yb,stops,n=3):
    h=yb-yt; cw,t=.42*h,.24*h; ym=(yt+yb)/2; ms=[]
    for i in range(n):
        x0=x+i*(t+.16*h); ms.append(fillpoly(c,[(x0,yt),(x0+t,yt),(x0+t+cw,ym),(x0+t,yb),(x0,yb),(x0+cw,ym)],stops,yt,yb))
    return ms
def lower_third(label,segs,H_in,chev=WHT,stripe_only=False,text_scale=.5):
    """label: str or None. segs: (text, scale)."""
    H=H_in*D; sl=.26*H; tw=textimg([(t,text_scale*H*s,INK,False) for t,s in segs],shear=.2,bold=.016)
    # Allow long Japanese labels; the original used circled single digits.
    W=int(H*3+sl*2+tw.width+H*2.5+len(label or "")*H); c=Image.new('RGBA',(W,int(H*1.15)),(0,0,0,0)); ms=[]
    x,m=stripes(c,0,H,sl); ms+=m
    if label:
        lt=textimg([(label,.62*H,WHITE,True)],shear=.12,bold=.03); bw=lt.width+.5*H
        ms.append(fillpoly(c,[(x,H),(x+bw,H),(x+bw+sl,0),(x+sl,0)],RED,0,H))
        c.alpha_composite(lt,(int(x+sl/2+(bw-lt.width)/2),int((H-lt.height)/2))); x=x+bw-.12*H
    yt,yb=.13*H,.87*H; s2=sl*(yb-yt)/H
    xe=x+s2+.3*H+tw.width+.35*H
    ms.append(fillpoly(c,[(x,yb),(xe,yb),(xe+s2,yt),(x+s2,yt)],WHT,yt,yb))
    ImageDraw.Draw(c).line([(x+s2+2,yt+2),(xe+s2-2,yt+2)],fill=(255,255,255,255),width=max(2,int(.02*H)))  # gloss edge
    ms.append(fillpoly(c,[(x+.4*H,yb),(x+.4*H+.55*(xe-x),yb),(x+.4*H+.55*(xe-x)+.06*H,yb+.11*H),(x+.4*H+.06*H,yb+.11*H)],BLK,yb,yb+.11*H))  # thin black under-strip
    c.alpha_composite(tw,(int(x+s2+.3*H),int((yt+yb-tw.height)/2)))
    ms+=chevrons(c,xe+s2+.18*H,yt+.06*H,yb-.06*H,chev)
    return finish(c,ms)
def sub_bar(segs,H_in,px=.56):
    """segs: (text, scale, hilite). black bar, red notch, white text, keywords yellow."""
    H=H_in*D; sl=.22*H; tw=textimg([(t,px*H*s,YEL if h else WHITE,False) for t,s,h in segs],bold=.02)
    W=int(tw.width+H*2); c=Image.new('RGBA',(W,int(H*1.1)),(0,0,0,0)); ms=[]
    ms.append(fillpoly(c,[(0,H),(.18*H,H),(.18*H+sl,0),(sl,0)],RED,0,H)); x=.26*H
    xe=x+sl+.3*H+tw.width+.3*H
    ms.append(fillpoly(c,[(x,H),(xe,H),(xe+sl,0),(x+sl,0)],BLK,0,H))
    ImageDraw.Draw(c).line([(x+sl,1),(xe+sl,1)],fill=(90,90,90,255),width=max(2,int(.03*H)))
    c.alpha_composite(tw,(int(x+sl*.7+.3*H),int((H-tw.height)/2)))
    return finish(c,ms,.3)
def num_block(segs,H_in):
    H=H_in*D; sl=.26*H; tw=textimg([(t,.66*H*s,WHITE,True) for t,s in segs],shear=.12,bold=.03)
    W=int(tw.width+H*2); c=Image.new('RGBA',(W,int(H*1.1)),(0,0,0,0)); ms=[]
    x,m=stripes(c,0,H,sl); ms+=m; bw=tw.width+.45*H
    ms.append(fillpoly(c,[(x,H),(x+bw,H),(x+bw+sl,0),(x+sl,0)],RED,0,H))
    c.alpha_composite(tw,(int(x+sl/2+(bw-tw.width)/2),int((H-tw.height)/2)))
    return finish(c,ms,.3)

# Layout uses a 1200×630 grid at 2×, downsampled to the blog's 1800×945.
ROOT = Path(__file__).resolve().parents[2]
SLUG = 'moving-during-tenchusatsu'
NAVY, BLACK, GRAY, ACCENT = '#0F1F38', '#1A1A1A', '#555B66', '#D7141A'


def rect(im, box, color):
    ImageDraw.Draw(im).rectangle(tuple(round(v * 2) for v in box), fill=color)


def body(im, text, x, y, size=26, color=BLACK):
    ft = FT(NOTO, size * 2)
    d = ImageDraw.Draw(im)
    bounds = d.textbbox((x * 2, y * 2), text, font=ft, anchor='lt')
    if bounds[2] > im.width - 48 or bounds[3] > im.height - 24:
        raise ValueError(f'Text exceeds canvas: {text}')
    d.text((x * 2, y * 2), text, font=ft, fill=color, anchor='lt')


def paste(im, tile, x, y, width=1120, height=110):
    ratio = min(width * 2 / tile.width, height * 2 / tile.height, 1)
    tile = tile.resize((round(tile.width * ratio), round(tile.height * ratio)), Image.Resampling.LANCZOS)
    im.alpha_composite(tile, (round(x * 2), round(y * 2)))


def page(label, title):
    im = Image.new('RGBA', (2400, 1260), '#F6F7F8')
    rect(im, (0, 0, 1200, 150), NAVY)
    paste(im, lower_third(label, [(title, 1)], 90), 28, 29, 1140, 110)
    rect(im, (40, 579, 1160, 580), '#CDD1D7')
    body(im, 'cloud-palette.com', 40, 595, 17, NAVY)
    body(im, '九星気学・算命学は参考情報', 865, 595, 16, GRAY)
    return im


def save(im, suffix=''):
    out = ROOT / 'public/blog' / f'{SLUG}{suffix}.png'
    im = im.convert('RGB').resize((1800, 945), Image.Resampling.LANCZOS)
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                dither=Image.Dither.NONE).save(out, optimize=True)
    if out.stat().st_size > 300_000:
        raise ValueError(f'PNG exceeds 300KB: {out}')
    print(f'{out.name}: 1800×945, {out.stat().st_size / 1000:.1f} KB')


def main():
    article = (ROOT / 'content/blog' / f'{SLUG}.md').read_text()
    rows = [line.split('|')[1:-1] for line in article.splitlines()
            if re.match(r'^\| (子丑|寅卯|辰巳|午未|申酉|戌亥) \|', line)
            and len(line.split('|')) == 9]
    rows = [[cell.strip() for cell in row] for row in rows]
    if len(rows) != 6:
        raise ValueError('Expected the six-row, seven-column article day-count table')

    im = page('【検証】', '天中殺の引っ越し、本当に避けるべき？')
    body(im, '年天中殺でない人が厳格に避ける日数', 70, 196, 28, NAVY)
    paste(im, num_block([('年', .65), ('108', 1), ('〜', .7), ('114', 1), ('日', .65)], 150),
          65, 249, 1060, 170)
    paste(im, sub_bar([('午未の人は ', 1, False), ('2026/2/4〜2028/2/4', 1, True)], 64),
          65, 462, 1080, 80)
    save(im)

    im = page('結論', '先に押さえる、3つのポイント')
    points = [
        ('天中殺だけを理由に取り消す必要はない', '引越しが不運を招くと確かめた資料はありません。'),
        ('日程を絞るうえで効くのは、期間の長さ', '年天中殺でなければ厳格で年108〜114日。午未は2年まるごと。'),
        ('もう引っ越していても、取り消す計算はない', '転勤などは弱めて扱い、次の移動は新居から判定します。'),
    ]
    for i, (title, detail) in enumerate(points):
        y = 184 + i * 126
        paste(im, num_block([(str(i + 1), 1)], 62), 40, y, 100, 70)
        body(im, title, 160, y + 4, 30, NAVY)
        body(im, detail, 160, y + 55, 23, GRAY)
    save(im, '-slide-1')

    im = page('データで見る', '空亡別・避ける日数')
    # Same six rows and all 36 values as the article, with explicit year groups.
    xs = [67, 240, 391, 547, 709, 860, 1016]
    body(im, '空亡', 65, 181, 23, NAVY)
    body(im, '2026年', 371, 169, 25, NAVY)
    body(im, '2027年', 840, 169, 25, NAVY)
    for start in (1, 4):
        for j, label in enumerate(['厳格', '年天中殺は除く', '日のみ']):
            body(im, label, xs[start+j] - (22 if j == 1 else 0), 209, 18, GRAY)
    for i, row in enumerate(rows):
        y = 249 + i * 38
        rect(im, (48, y-5, 1152, y+31), '#FCE9EA' if row[0] == '午未' else ('#FFFFFF' if i % 2 == 0 else '#E9EBEE'))
        for j, cell in enumerate(row):
            body(im, cell, xs[j], y, 23, ACCENT if row[0] == '午未' and j in (1, 4) else NAVY)
    body(im, '午未・厳格', 57, 510, 23, NAVY)
    paste(im, num_block([('337', 1), ('日', .7), (' / ', .7), ('365', 1), ('日', .7)], 62), 220, 493, 510, 72)
    body(im, '2026年 / 2027年', 770, 515, 22, GRAY)
    save(im, '-slide-2')

    im = page('状況別', 'あなたはどれ？ 次にすること')
    situations = [
        ('これから決める', '空亡と期間を確認', '扱いを選び、候補日を出す'),
        ('日程が決まっている', '契約・費用・生活を先に確認', '時期と方位を分けて確認'),
        ('もう引っ越した', '取り消す計算はない', '次の移動は新居を起点に判定'),
        ('転勤で動く', '「やむを得ない移動」で登録', '弱めた判定で確認'),
    ]
    for i, (label, a, b) in enumerate(situations):
        y = 182 + i * 94
        rect(im, (40, y-5, 1160, y+76), '#FFFFFF')
        rect(im, (40, y-5, 46, y+76), ACCENT)
        body(im, label, 64, y+19, 27, NAVY)
        body(im, a, 425, y+2, 25)
        body(im, '→ ' + b, 425, y+41, 24, GRAY)
    save(im, '-slide-3')

    im = page('手順', '自分の動ける日を出す3ステップ')
    steps = [
        ('空亡を知る', '生年月日を入力し、日干支から決まる空亡を確認。'),
        ('扱いの設定を選ぶ', '「厳格」「年天中殺は除く」「日のみ」などを選択。'),
        ('/calendar で候補日を出す', '月ごとに確認。2年ぶんは「引越し時期を分析する」へ。'),
    ]
    for i, (title, detail) in enumerate(steps):
        y = 181 + i * 113
        paste(im, num_block([(str(i+1), 1)], 60), 40, y, 100, 68)
        body(im, title, 165, y+1, 31, NAVY)
        body(im, detail, 165, y+49, 23, GRAY)
    paste(im, sub_bar([('候補を比べている途中では ', 1, False), ('設定を変えない', 1, True)], 40), 165, 521, 960, 48)
    save(im, '-slide-4')

    im = page('比較', '天中殺と大殺界は、別の計算')
    for x, title, system, basis, years in [
        (55, '天中殺', '算命学', '生まれた日の干支（日干支）', '2'),
        (635, '大殺界', '六星占術', '運命星', '3'),
    ]:
        rect(im, (x, 182, x+510, 480), '#FFFFFF')
        body(im, title, x+30, 204, 38, NAVY)
        body(im, system, x+30, 266, 28)
        body(im, basis, x+30, 315, 25, GRAY)
        body(im, '12年のうち', x+30, 390, 27, NAVY)
        paste(im, num_block([(years, 1), ('年', .7)], 78), x+217, 365, 260, 95)
    paste(im, sub_bar([('同じ年に来るとは限らない', 1, True)], 48), 245, 510, 850, 58)
    save(im, '-slide-5')


if __name__ == '__main__':
    main()
