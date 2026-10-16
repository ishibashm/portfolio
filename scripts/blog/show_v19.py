#!/usr/bin/env python3
"""Article artwork adapted from ishibashm/slides-site v19.

Design credit: tools/v18.py, tools/v18_png.py and tools/v19.py, with the
v16 cream theme and tools/visuals.py. The design archive is read-only.
Python + Pillow; M PLUS Rounded 1c and Dela Gothic One (SIL OFL 1.1),
installed in ~/.local/share/fonts/ofl, are required and are not bundled.
The helper robot is original geometric artwork drawn below, not m05_bot.jpg.
No photos or photo chapter slides: we have no licensed source photographs.
Run: python3 scripts/blog/show_v19.py
"""
from functools import lru_cache
from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SLUG = 'moving-during-tenchusatsu'
FONTS = Path.home() / '.local/share/fonts/ofl'
SCALE = 3
ACC, ACC_T = '#3A3F94', '#E7E8F4'
GOLD, GOLD_L = '#9C7B3A', '#F4ECD6'
INK, MUTE, CARD, LINE = '#1E1B18', '#5E564C', '#FCFAF5', '#D9CDB0'
NAVY, BAND = '#252A60', '#EFE8DA'
BAR_BG, BAR_ALT = '#ECE6DA', '#C9AF78'


@lru_cache(None)
def font(size, weight='Medium'):
    name = 'DelaGothicOne-Regular' if weight == 'Dela' else f'MPLUSRounded1c-{weight}'
    return ImageFont.truetype(str(FONTS / f'{name}.ttf'), round(size * SCALE))


def box(im, bounds, fill=CARD, outline=LINE, radius=12, width=1):
    ImageDraw.Draw(im).rounded_rectangle(
        tuple(round(v * SCALE) for v in bounds), round(radius * SCALE),
        fill=fill, outline=outline, width=round(width * SCALE))


def text(im, value, x, y, size=24, color=INK, weight='Medium', maxw=None):
    d = ImageDraw.Draw(im)
    f = font(size, weight)
    bounds = d.textbbox((x*SCALE, y*SCALE), value, font=f, anchor='lt')
    if bounds[2] > 1165*SCALE or bounds[3] > 617*SCALE:
        raise ValueError(f'Text outside safe canvas: {value}')
    if maxw is not None and bounds[2] > (x+maxw)*SCALE:
        raise ValueError(f'Text outside allocated width: {value}')
    d.text((x*SCALE, y*SCALE), value, font=f, fill=color, anchor='lt')


def heading(im, segments):
    size = 44
    while sum(font(size, 'Black').getlength(t) for t, _ in segments) > 1095*SCALE:
        size -= 1
    x, y = 43*SCALE, 92*SCALE
    f = font(size, 'Black')
    shadow = Image.new('RGBA', im.size)
    sd = ImageDraw.Draw(shadow)
    for value, keyword in segments:
        sd.text((x+2*SCALE, y+3*SCALE), value, font=f, anchor='lt',
                fill='#1E1B1840', stroke_width=round(size*.16*SCALE), stroke_fill='#1E1B1840')
        x += f.getlength(value)
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(2*SCALE)))
    d = ImageDraw.Draw(im)
    x = 43*SCALE
    for value, keyword in segments:
        w = f.getlength(value)
        if keyword:
            d.rounded_rectangle((x-3*SCALE,y+size*.68*SCALE,x+w+3*SCALE,y+(size+8)*SCALE),
                                3*SCALE, fill=GOLD_L)
        for stroke, color in ((.16, INK), (.125, '#FFFFFF'), (0, ACC if keyword else NAVY)):
            d.text((x,y), value, font=f, anchor='lt', fill=color,
                   stroke_width=round(size*stroke*SCALE), stroke_fill=color)
        x += w


def page(label, segments, number):
    # Gentle cream edge shade, following the v16 light theme.
    im = Image.new('RGBA', (1200*SCALE, 630*SCALE), '#F7F3EA')
    box(im, (8,8,1192,622), '#F7F3EA', '#E8DFCE', 3)
    box(im, (40,29,290,70), ACC, ACC, 8)
    ImageDraw.Draw(im).polygon([(53*SCALE,40*SCALE), (53*SCALE,59*SCALE),
                               (69*SCALE,49.5*SCALE)], fill='white')
    text(im, '天中殺と引越し', 77,39,23,'#FFFFFF','Dela',205)
    badge_width = max(76, len(label)*19+24)
    box(im, (282,36,282+badge_width,64), GOLD, GOLD,14)
    text(im,label,294,42,16,'#FFFFFF','ExtraBold',badge_width-20)
    heading(im, segments)
    box(im,(40,584,1160,585),LINE,LINE,0)
    text(im,'cloud-palette.com',40,598,14,MUTE)
    text(im,'九星気学・算命学は参考情報',720,598,14,MUTE)
    text(im,f'{number+1:02d} / 06',1080,597,14,MUTE,'Dela')
    return im


def badge(im, n, x, y):
    # A Dela numeral inside a circle reproduces the v19 ①②③ badges.
    d = ImageDraw.Draw(im)
    d.ellipse((x*SCALE,y*SCALE,(x+40)*SCALE,(y+40)*SCALE),fill=ACC)
    d.text(((x+20)*SCALE,(y+19)*SCALE),str(n),font=font(23,'Dela'),fill='white',anchor='mm')


def host(im, line):
    box(im,(810,523,1040,570),'#FFFFFF',ACC,8,1.5)
    d = ImageDraw.Draw(im)
    d.polygon([(1040*SCALE,540*SCALE),(1054*SCALE,549*SCALE),(1040*SCALE,558*SCALE)],fill='white')
    d.line([(1040*SCALE,540*SCALE),(1054*SCALE,549*SCALE),(1040*SCALE,558*SCALE)],fill=ACC,width=4)
    text(im,line,822,540,15,ACC,'ExtraBold',205)
    # Original helper: single antenna, rounded rectangular head, round eyes,
    # plain indigo torso. No reference character, external image or photo.
    d.ellipse((1064*SCALE,500*SCALE,1154*SCALE,580*SCALE),fill=ACC_T,outline=ACC,width=4)
    box(im,(1086,550,1134,572),ACC,ACC,7)
    d.line((1110*SCALE,515*SCALE,1110*SCALE,505*SCALE),fill=GOLD,width=5)
    d.ellipse((1106*SCALE,501*SCALE,1114*SCALE,509*SCALE),fill=GOLD)
    box(im,(1080,516,1140,553),CARD,ACC,10,2)
    for x in (1097,1123):
        d.ellipse(((x-5)*SCALE,529*SCALE,(x+5)*SCALE,539*SCALE),fill=ACC)
    box(im,(1103,558,1117,563),GOLD_L,GOLD_L,2)


def point(im, takeaway, speech, size=21):
    box(im,(40,520,790,574),GOLD_L,GOLD,9)
    box(im,(52,534,145,560),ACC,ACC,13)
    text(im,'POINT',63,540,15,'white','Dela',74)
    text(im,takeaway,159,538,size,NAVY,'ExtraBold',616)
    host(im,speech)


def save(im, suffix=''):
    out = ROOT / 'public/blog' / f'{SLUG}{suffix}.png'
    im = im.convert('RGB').resize((1800,945),Image.Resampling.LANCZOS)
    im.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).save(out,optimize=True)
    if out.stat().st_size > 300_000:
        raise ValueError(f'PNG exceeds 300KB: {out}')
    print(f'{out.name}: 1800×945, {out.stat().st_size/1000:.1f} KB')


def article_rows():
    article = (ROOT/'content/blog'/f'{SLUG}.md').read_text()
    rows = [[c.strip() for c in line.split('|')[1:-1]] for line in article.splitlines()
            if re.match(r'^\| (子丑|寅卯|辰巳|午未|申酉|戌亥) \|',line) and len(line.split('|')) == 9]
    expected = [
        ['子丑',111,111,62,108,108,60], ['寅卯',112,112,62,110,110,60],
        ['辰巳',140,112,60,114,114,62], ['午未',337,113,60,365,114,62],
        ['申酉',112,112,60,112,112,61], ['戌亥',110,110,61,110,110,60],
    ]
    if rows != [[r[0]]+[f'{n}日' for n in r[1:]] for r in expected]:
        raise ValueError('Article day counts changed; review all six images before updating')
    return rows


def main():
    rows = article_rows()
    im = page('【検証】',[('天中殺の引っ越し、',False),('本当に避けるべき？',True)],0)
    box(im,(40,185,1160,490))
    text(im,'年天中殺でない人が厳格に避ける日数',70,217,30,NAVY,'ExtraBold')
    text(im,'年',76,320,42,NAVY,'Black')
    text(im,'108',146,294,112,ACC,'Dela')
    text(im,'〜',408,326,56,GOLD,'Black')
    text(im,'114',506,294,112,ACC,'Dela')
    text(im,'日',773,320,48,NAVY,'Black')
    box(im,(73,431,1127,451),BAR_BG,BAR_BG,10)
    # Range endpoints are taken from the displayed day-count claim.
    box(im,(73,431,73+1054*114/365,451),BAR_ALT,BAR_ALT,10)
    box(im,(73,431,73+1054*108/365,451),ACC,ACC,10)
    point(im,'午未の人は 2026/2/4〜2028/2/4','期間の長さを確認',24)
    save(im)

    im = page('結論',[('先に押さえる、',False),('3つのポイント',True)],1)
    points = [
        ('天中殺だけを理由に取り消す必要はない','引越しが不運を招くと確かめた資料はありません。'),
        ('日程を絞るうえで効くのは、期間の長さ','年天中殺でなければ厳格で年108〜114日。午未は2年まるごと。'),
        ('もう引っ越していても、取り消す計算はない','転勤などは弱めて扱い、次の移動は新居から判定します。'),
    ]
    for i,(title,detail) in enumerate(points):
        y=181+i*107
        box(im,(40,y,1160,y+94))
        badge(im,i+1,58,y+23)
        text(im,title,117,y+16,28,NAVY,'ExtraBold',1019)
        text(im,detail,117,y+57,22,MUTE,maxw=1019)
    point(im,'天中殺だけを理由に取り消す必要はない','次の移動は新居から',22)
    save(im,'-slide-1')

    im = page('データで見る',[('空亡別・',False),('避ける日数',True)],2)
    box(im,(40,177,1160,504))
    centers=[106,300,469,638,806,975,1100]
    text(im,'空亡',79,205,24,NAVY,'ExtraBold')
    for x,year in ((410,'2026年'),(912,'2027年')):
        text(im,year,x-50,189,24,ACC,'Dela')
    for start in (1,4):
        for j,label in enumerate(['厳格','年天中殺は除く','日のみ']):
            w=font(17,'ExtraBold').getlength(label)/SCALE
            text(im,label,centers[start+j]-w/2,229,17,MUTE,'ExtraBold')
    for i,row in enumerate(rows):
        y=262+i*38
        box(im,(50,y-4,1150,y+32),GOLD_L if row[0]=='午未' else (BAND if i%2 else CARD),None,3)
        for j,cell in enumerate(row):
            w=font(23,'ExtraBold').getlength(cell)/SCALE
            text(im,cell,centers[j]-w/2,y,23,ACC if row[0]=='午未' else NAVY,'ExtraBold')
    point(im,'午未・厳格 337日 / 365日','2026年 / 2027年',25)
    save(im,'-slide-2')

    im = page('状況別',[('あなたはどれ？ ',False),('次にすること',True)],3)
    situations = [
        ('これから決める','空亡と期間を確認','扱いを選び、候補日を出す'),
        ('日程が決まっている','契約・費用・生活を先に確認','時期と方位を分けて確認'),
        ('もう引っ越した','取り消す計算はない','次の移動は新居を起点に判定'),
        ('転勤で動く','「やむを得ない移動」で登録','弱めた判定で確認'),
    ]
    for i,(label,a,b) in enumerate(situations):
        y=178+i*82
        box(im,(40,y,1160,y+73))
        badge(im,i+1,55,y+16)
        text(im,label,111,y+25,25,ACC,'ExtraBold',305)
        text(im,a,439,y+10,24,NAVY,'ExtraBold',690)
        text(im,'→ '+b,439,y+43,22,MUTE,maxw=690)
    point(im,'契約・費用・生活を先に確認','時期と方位を分けて',24)
    save(im,'-slide-3')

    im = page('手順',[('自分の動ける日を出す',False),('3ステップ',True)],4)
    steps = [
        ('空亡を知る','生年月日を入力し、日干支から決まる空亡を確認。'),
        ('扱いの設定を選ぶ','「厳格」「年天中殺は除く」「日のみ」などを選択。'),
        ('/calendar で候補日を出す','月ごとに確認。2年ぶんは「引越し時期を分析する」へ。'),
    ]
    for i,(title,detail) in enumerate(steps):
        y=181+i*107
        box(im,(40,y,1160,y+94))
        badge(im,i+1,58,y+23)
        text(im,title,117,y+16,28,NAVY,'ExtraBold')
        text(im,detail,117,y+57,22,MUTE,maxw=1019)
    point(im,'候補を比べている途中では 設定を変えない','同じ条件で比べよう',21)
    save(im,'-slide-4')

    im = page('比較',[('天中殺と大殺界は、',False),('別の計算',True)],5)
    for i,(title,system,basis,years) in enumerate([
        ('天中殺','算命学','生まれた日の干支（日干支）',2),
        ('大殺界','六星占術','運命星',3),
    ]):
        x=40+i*574
        box(im,(x,182,x+546,500))
        badge(im,i+1,x+20,202)
        text(im,title,x+77,204,34,ACC,'Black')
        text(im,system,x+27,263,27,NAVY,'ExtraBold')
        text(im,basis,x+27,310,25,MUTE)
        text(im,'12年のうち',x+27,391,27,NAVY,'ExtraBold')
        text(im,str(years),x+282,360,72,ACC,'Dela')
        text(im,'年',x+360,393,30,NAVY,'Black')
        for j in range(12):
            box(im,(x+27+j*41,462,x+60+j*41,476),
                (ACC if i==0 else BAR_ALT) if j<years else BAR_BG,None,4)
    point(im,'同じ年に来るとは限らない','天中殺と大殺界は別',25)
    save(im,'-slide-5')


if __name__ == '__main__':
    main()
