#!/usr/bin/env python3
"""Deterministic v20 editorial diagrams. See docs/blog-slide-design.md.

Pillow + M PLUS Rounded 1c / Dela Gothic One (SIL OFL 1.1) in ~/.local/share/fonts/ofl,
the same faces and heading treatment as show_v19.py (b9f40b5f); not bundled.
All content comes from the unchanged article. Archive references are read-only.
"""
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SLUG = 'moving-during-tenchusatsu'
ARTICLE = (ROOT / 'content/blog' / f'{SLUG}.md').read_text()
S = 2
BG, ACC, GOLD = '#F7F3EA', '#3A3F94', '#9C7B3A'
INK, MUTE, CARD, LINE, BAND = '#1E1B18', '#5E564C', '#FCFAF5', '#D9CDB0', '#EFE8DA'


@lru_cache(None)
def font(size, role='body'):
    name = {'title': 'MPLUSRounded1c-Black', 'bold': 'MPLUSRounded1c-ExtraBold',
            'number': 'DelaGothicOne-Regular'}.get(role, 'MPLUSRounded1c-Medium')
    return ImageFont.truetype(str(Path.home() / '.local/share/fonts/ofl' / f'{name}.ttf'), size*S)


class Page:
    def __init__(self, label, title, subtitle, number):
        self.im = Image.new('RGB', (1800*S, 945*S), BG)
        self.d = ImageDraw.Draw(self.im)
        self.text_bounds = []
        self.d.rounded_rectangle((64*S, 40*S, 370*S, 92*S), 10*S, fill=ACC)
        self.d.polygon([(82*S,54*S),(82*S,78*S),(102*S,66*S)], fill='white')
        self.text('天中殺と引越し', 112, 50, 30, color='#FFFFFF', role='number')
        bw = font(24, 'bold').getlength(label)/S + 40
        self.d.rounded_rectangle((388*S, 47*S, (388+bw)*S, 85*S), 19*S, fill=GOLD)
        self.text(label, 408, 54, 24, color='#FFFFFF', role='bold')
        self.text('CLOUD PALETTE  /  GUIDE', 1266, 56, 22, color=MUTE, tracking=1.6)
        self.heading(title)
        self.text(subtitle, 70, 214, 27, color=MUTE)
        self.line(64, 258, 1736, 258)
        self.line(64, 887, 1736, 887)
        self.text('cloud-palette.com', 64, 906, 22, color=MUTE)
        self.text('伝統的な占術の考え方・効果が科学的に確認されたものではありません', 560, 906, 22, color=MUTE)
        self.text(f'{number+1:02d} / 06', 1632, 904, 24, color=MUTE)

    def rect(self, x, y, w, h, fill=CARD, outline=None):
        self.d.rectangle((x*S, y*S, (x+w)*S, (y+h)*S), fill=fill, outline=outline, width=2)

    def line(self, x, y, xx, yy, color=LINE, width=1):
        self.d.line((x*S, y*S, xx*S, yy*S), fill=color, width=width*S)

    def text(self, value, x, y, size=30, color=INK, role='body', maxw=None, tracking=0):
        f = font(size, role)
        w = f.getlength(value)/S + tracking*max(0, len(value)-1)
        if maxw is not None and w > maxw:
            raise ValueError(f'Text exceeds width {maxw}: {value} ({w})')
        bbox = self.d.textbbox((x*S, y*S), value, font=f, anchor='lt')
        bounds = (x, y, x+w, bbox[3]/S)
        if bounds[2] > 1740 or bounds[3] > 936 or x < 60:
            raise ValueError(f'Text outside safe area: {value}')
        for old, old_value in self.text_bounds:
            if bounds[0] < old[2] and bounds[2] > old[0] and bounds[1] < old[3] and bounds[3] > old[1]:
                raise ValueError(f'Text overlap: {value} / {old_value}')
        self.text_bounds.append((bounds, value))
        if tracking:
            for c in value:
                self.d.text((x*S, y*S), c, font=f, fill=color, anchor='lt')
                x += f.getlength(c)/S + tracking
        else:
            self.d.text((x*S, y*S), value, font=f, fill=color, anchor='lt')

    def heading(self, title, size=64):
        # show_v19.heading: M PLUS Rounded 1c Black, navy text, thick white rim
        # over a thin ink rim, soft shadow; 【keyword】 in indigo on a light gold marker.
        segs = [(t, i % 2 == 1) for i, t in enumerate(re.split('[【】]', title)) if t]
        f = font(size, 'title')
        while sum(f.getlength(t) for t, _ in segs)/S > 1640:
            size -= 1; f = font(size, 'title')
        x0, y = 70*S, 112*S
        shadow = Image.new('RGBA', self.im.size); sd = ImageDraw.Draw(shadow); x = x0
        for t, _ in segs:
            sd.text((x+3*S, y+4*S), t, font=f, anchor='lt', fill='#1E1B1840',
                    stroke_width=round(size*.16*S), stroke_fill='#1E1B1840')
            x += f.getlength(t)
        base = self.im.convert('RGBA'); base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(3*S)))
        self.im = base.convert('RGB'); self.d = ImageDraw.Draw(self.im); x = x0
        for t, kw in segs:
            w = f.getlength(t)
            if kw:
                self.d.rounded_rectangle((x-4*S, y+size*.68*S, x+w+4*S, y+(size+10)*S), 4*S, fill='#F4ECD6')
            for k, c in ((.16, INK), (.125, '#FFFFFF'), (0, ACC if kw else '#252A60')):
                self.d.text((x, y), t, font=f, anchor='lt', fill=c, stroke_width=round(size*k*S), stroke_fill=c)
            x += w
        self.text_bounds.append(((60, 100, x/S+12, 112+size+14), title))

    def lines(self, lines, x, y, size=30, leading=46, **kwargs):
        for i, value in enumerate(lines):
            self.text(value, x, y+i*leading, size, **kwargs)

    def point(self, value):
        self.rect(64, 809, 1672, 58, BAND)
        self.line(64, 809, 64, 867, GOLD, 3)
        self.text('POINT', 88, 828, 22, color=ACC, role='bold', tracking=2)
        self.text(value, 216, 822, 32, role='bold', maxw=1500)

    def icon(self, kind, x, y, color=ACC):
        def ln(a,b,c,d): self.line(x+a,y+b,x+c,y+d,color,2)
        if kind == 'calendar':
            self.rect(x, y+7, 44, 37, None, color)
            ln(0,18,44,18); ln(12,0,12,12); ln(32,0,32,12)
            ln(10,29,18,29); ln(26,29,34,29)
        elif kind == 'house':
            ln(0,20,22,0); ln(22,0,44,20); ln(6,16,6,44)
            ln(38,16,38,44); ln(6,44,38,44); ln(18,44,18,28); ln(18,28,27,28); ln(27,28,27,44)
        elif kind == 'compass':
            self.d.ellipse((x*S,y*S,(x+44)*S,(y+44)*S), outline=color, width=2*S)
            ln(29,9,16,34); ln(16,34,13,20); ln(13,20,29,9)
        elif kind == 'check':
            ln(2,23,17,37); ln(17,37,43,6)
        elif kind == 'arrow':
            ln(0,22,42,22); ln(30,10,42,22); ln(30,34,42,22)

    def save(self, suffix=''):
        out = ROOT / 'public/blog' / f'{SLUG}{suffix}.png'
        im = self.im.resize((1800,945), Image.Resampling.LANCZOS)
        im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
        if out.stat().st_size > 300_000:
            raise ValueError(f'PNG exceeds 300KB: {out}')
        print(f'{out.name}: 1800×945 / {out.stat().st_size/1000:.1f} KB')


def article_data():
    rows, periods = [], []
    for line in ARTICLE.splitlines():
        if not re.match(r'^\| (子丑|寅卯|辰巳|午未|申酉|戌亥) \|', line):
            continue
        cells = [c.strip() for c in line.split('|')[1:-1]]
        if len(cells) == 7:
            rows.append([cells[0]] + [int(c.removesuffix('日')) for c in cells[1:]])
        else:
            dates = [date(*map(int, d)) for d in re.findall(r'(\d+)年(\d+)月(\d+)日', cells[1])]
            periods.append((cells[0], *dates))
    expected = [
        ['子丑',111,111,62,108,108,60], ['寅卯',112,112,62,110,110,60],
        ['辰巳',140,112,60,114,114,62], ['午未',337,113,60,365,114,62],
        ['申酉',112,112,60,112,112,61], ['戌亥',110,110,61,110,110,60],
    ]
    assert rows == expected, 'Review the 36 day counts against the article'
    assert [(n,a.isoformat(),b.isoformat()) for n,a,b in periods] == [
        ('辰巳','2024-02-05','2026-02-03'), ('午未','2026-02-04','2028-02-04'),
        ('申酉','2028-02-05','2030-02-03'), ('戌亥','2030-02-04','2032-02-04'),
        ('子丑','2032-02-05','2034-02-03'), ('寅卯','2034-02-04','2036-02-04')]
    for claim in ('108〜114日', '最初の34日', '251日の動ける日', '365日から月・日の114日',
                  '12年に一度、2年', '12日ごとに2日', '月天中殺が年に2か月',
                  '期間は3年', '2年ぶん', '2026年9月時点'):
        assert claim in ARTICLE, f'Review numeric claim: {claim}'
    print('Verified: 36 day counts, 12 period endpoints and supporting numeric claims.')
    return rows, periods


def card(p, x, y, w, h, fill=CARD):
    p.d.rounded_rectangle((x*S, y*S, (x+w)*S, (y+h)*S), 18*S, fill=fill, outline=LINE, width=2*S)


def cover(periods):
    # One message: the strict yearly count. Full timeline lives in the article.
    p = Page('特集', '天中殺の引っ越し、【本当に避けるべき？】',
             '不運を招くと確かめた資料はありません。', 0)
    card(p, 64, 290, 1672, 470)
    p.icon('calendar', 120, 340)
    p.text('年天中殺に当たらない人が、厳格に避ける日数', 190, 342, 40, role='bold')
    w = font(190, 'number').getlength('108〜114')/S
    x = (1800 - w - 110)/2
    p.text('108〜114', x, 440, 190, color=ACC, role='number')
    p.text('日 / 年', x+w+16, 590, 50, color=ACC, role='bold')
    p.point('年天中殺の人だけは別：12年に一度、2年間（午未は2026〜2028年）')
    p.save()


def conclusion():
    p = Page('01 / 結論', '先に押さえる、【3つのポイント】', '影響の話と、計算できることを分けて考えます。', 1)
    for i, (title, body) in enumerate([
            ('天中殺だけで取り消す必要はない', '不運を招くと確かめた資料はありません'),
            ('効くのは、期間の長さ', '厳格で年108〜114日。年天中殺なら2年まるごと'),
            ('過去を取り消す計算はない', '次の移動は、新しい住まいを起点に判定')]):
        y = 292 + i*165
        card(p, 64, y, 1672, 145)
        p.text(f'{i+1}', 104, y+38, 64, color=GOLD, role='number')
        p.text(title, 210, y+26, 44, role='bold')
        p.text(body, 212, y+88, 32, color=MUTE)
    p.point('生活の条件を先に確かめ、占術は判断材料の一つに。')
    p.save('-slide-1')


def counts(rows):
    p = Page('02 / データ', '空亡別・【避ける日数】を比べる', '2027年・厳格な設定の場合（全36通りの表は本文に）。', 2)
    others = [r[4] for r in rows if r[0] != '午未']
    lo, hi = min(others), max(others)
    hit = dict((r[0], r) for r in rows)['午未']
    for i, (label, value, n, color) in enumerate([
            ('年天中殺でない空亡', f'{lo}〜{hi}', hi, GOLD),
            ('午未（年天中殺）', f'{hit[4]}', hit[4], ACC)]):
        y = 300 + i*235
        card(p, 64, y, 1672, 210)
        p.text(label, 104, y+30, 40, role='bold', color=color if i else INK)
        p.text(value, 104, y+92, 84, color=color, role='number')
        p.text('日', 110+font(84,'number').getlength(value)/S, y+128, 40, role='bold', color=color)
        p.rect(700, y+120, 990, 26, BAND)
        p.rect(700, y+120, 990*n/365, 26, color)
        p.text('365日', 1610, y+56, 28, color=MUTE)
    p.point('年天中殺の2年間は、ほぼ1年まるごと避ける計算になる。')
    p.save('-slide-2')


def situations():
    p = Page('03 / 状況別', 'あなたの状況から、【次にすること】へ', '4つの状況ごとに、次の一歩だけ。', 3)
    data = [('これから決める', '扱いを選び、候補日を出す', 'calendar'),
            ('日程が決まっている', '生活の条件を先に確かめる', 'check'),
            ('もう引っ越した', '次は新しい住まいから判定', 'house'),
            ('転勤で動く', '「やむを得ない移動」で登録', 'compass')]
    for i, (name, nxt, icon) in enumerate(data):
        x, y = 64 + (i % 2)*852, 292 + (i//2)*250
        card(p, x, y, 820, 225)
        p.icon(icon, x+40, y+44)
        p.text(name, x+110, y+40, 44, role='bold')
        p.icon('arrow', x+44, y+138, GOLD)
        p.text(nxt, x+110, y+136, 36, color=ACC, role='bold')
    p.point('天中殺は「いつ」、方位は「どちらへ」。分けて確認する。')
    p.save('-slide-3')


def steps():
    p = Page('04 / 手順', '自分の動ける日を出す、【3ステップ】', '同じ設定のまま、候補日を比べます。', 4)
    for i, (title, body, icon) in enumerate([
            ('空亡を知る', ['生年月日を入れて', '自分の空亡を確認'], 'house'),
            ('扱いを選ぶ', ['「厳格」「日のみ」など', '流派に合わせる'], 'check'),
            ('候補日を出す', ['「引越しの日取りを', '選ぶ」で月ごとに'], 'calendar')]):
        x = 64 + i*568
        card(p, x, 292, 536, 470)
        p.text(f'{i+1}', x+40, 322, 96, color=GOLD, role='number')
        p.icon(icon, x+446, 340)
        p.text(title, x+40, 470, 48, role='bold')
        p.lines(body, x+40, 568, 34, leading=54, color=MUTE, maxw=470)
    p.point('比べている途中では設定を変えない。')
    p.save('-slide-4')


def comparison():
    p = Page('05 / 比較', '天中殺と大殺界は、【別の計算】', '呼び名は似ていても、同じ年に来るとは限りません。', 5)
    for i, (name, system, basis, years) in enumerate([
            ('天中殺', '算命学', '生まれた日の干支', 2),
            ('大殺界', '六星占術', '運命星と12年周期', 3)]):
        x, c = 64 + i*852, (ACC, GOLD)[i]
        card(p, x, 292, 820, 470)
        p.rect(x+30, 292, 760, 8, c)
        p.text(name, x+44, 330, 60, role='bold', color=c)
        p.text(system, x+330, 346, 40, role='bold')
        p.text('計算のもと', x+44, 450, 30, color=MUTE)
        p.text(basis, x+44, 494, 40, role='bold')
        p.text('12年のうち', x+44, 640, 36)
        p.text(str(years), x+270, 590, 110, color=c, role='number')
        p.text('年', x+270+font(110,'number').getlength(str(years))/S+12, 640, 36)
    p.point('Cloud Palette が扱うのは、空亡に基づく天中殺だけ。')
    p.save('-slide-5')


def main():
    rows, periods = article_data()
    cover(periods)
    conclusion()
    counts(rows)
    situations()
    steps()
    comparison()


if __name__ == '__main__':
    main()
