#!/usr/bin/env python3
"""Deterministic v20 editorial diagrams. See docs/blog-slide-design.md.

Pillow + system Noto CJK (SIL OFL); no downloaded or committed font assets.
All content comes from the unchanged article. Archive references are read-only.
"""
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SLUG = 'moving-during-tenchusatsu'
ARTICLE = (ROOT / 'content/blog' / f'{SLUG}.md').read_text()
S = 2
BG, ACC, GOLD = '#F7F3EA', '#3A3F94', '#9C7B3A'
INK, MUTE, CARD, LINE, BAND = '#1E1B18', '#5E564C', '#FCFAF5', '#D9CDB0', '#EFE8DA'


@lru_cache(None)
def font(size, role='body'):
    family = 'Serif' if role == 'title' else 'Sans'
    weight = 'Bold' if role in ('bold', 'number') else 'Regular'
    return ImageFont.truetype(f'/usr/share/fonts/opentype/noto/Noto{family}CJK-{weight}.ttc', size*S, index=0)


class Page:
    def __init__(self, label, title, subtitle, number):
        self.im = Image.new('RGB', (1800*S, 945*S), BG)
        self.d = ImageDraw.Draw(self.im)
        self.text_bounds = []
        self.rect(64, 43, 290, 43, ACC)
        self.text('天中殺と引越し', 84, 51, 27, color=CARD, role='bold')
        self.rect(371, 43, max(212, font(26).getlength(label)/S+36), 43, None, GOLD)
        self.text(label, 389, 52, 26, color=MUTE)
        self.text('CLOUD PALETTE  /  GUIDE', 1266, 56, 22, color=MUTE, tracking=1.6)
        self.text(title, 64, 120, 62, role='title')
        self.text(subtitle, 68, 209, 28, color=MUTE)
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

    def lines(self, lines, x, y, size=30, leading=46, **kwargs):
        for i, value in enumerate(lines):
            self.text(value, x, y+i*leading, size, **kwargs)

    def point(self, value):
        self.rect(64, 809, 1672, 58, BAND)
        self.line(64, 809, 64, 867, GOLD, 3)
        self.text('POINT', 88, 828, 22, color=ACC, role='bold', tracking=2)
        self.text(value, 216, 824, 30, role='bold', maxw=1490)

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


def cover(periods):
    p = Page('特集 / OVERVIEW', '天中殺の引っ越し、本当に避けるべき？',
             '不運を招くと確かめた資料はありません。日程を絞るなら、期間の長さを確認します。', 0)
    p.text('年天中殺に当たらない人', 68, 290, 32, role='bold')
    p.text('厳格に避ける日数 / 年', 68, 342, 28, color=MUTE)
    p.text('108–114', 64, 391, 110, color=ACC, role='number', maxw=660)
    p.text('日', 604, 456, 38, color=ACC)
    p.line(68, 535, 714, 535)
    p.icon('calendar', 70, 568)
    p.lines(['月天中殺は年に2か月', '日天中殺は12日ごとに2日'], 140, 565, 30)
    p.text('重なりを除いた日数が、上の範囲です。', 70, 679, 28, color=MUTE)
    p.text('年天中殺なら、12年に一度・2年間。', 70, 732, 30, role='bold')
    p.line(766, 289, 766, 780)
    p.text('年天中殺の期間', 806, 289, 34, role='bold')
    p.text('サイトの判定・日本時間正午', 1158, 296, 26, color=MUTE)
    # Exact daily endpoints plotted on one shared continuous time axis.
    start, end = periods[0][1], periods[-1][2] + timedelta(days=1)
    def tx(d): return 820 + (d-start).days/(end-start).days*882
    for year in range(2024,2037,2):
        x = 820 + (year-2024)/12*882
        p.text(str(year), x-25, 348, 26, color=MUTE)
    for i,(name,a,b) in enumerate(periods):
        y = 395+i*60
        p.line(820,y+45,1702,y+45)
        p.rect(tx(a),y+39,tx(b+timedelta(days=1))-tx(a),7, ACC if name=='午未' else GOLD)
        p.text(name, 820, y, 28, color=ACC if name=='午未' else INK, role='bold')
        p.text(f'{a.year}.{a.month:02d}.{a.day:02d} — {b.year}.{b.month:02d}.{b.day:02d}', 932, y, 28)
    p.text('年の区切りは立春。午後に立春が来る年は翌日から。', 806, 770, 26, color=MUTE)
    p.point('午未の年天中殺：2026年2月4日〜2028年2月4日（サイトの判定）')
    p.save()


def conclusion():
    p = Page('01 / 結論', '先に押さえる、3つのポイント', '天中殺の影響と、サイトで計算できることを分けて考えます。', 1)
    items = [
        ('01', '天中殺だけで取り消す必要はない', ['天中殺の引越しが不運を招くと', '確かめた資料はありません。'], ['先に確かめること', '住まいの安全・費用・通勤・転勤の日程']),
        ('02', '効くのは、期間の長さ', ['年天中殺でなければ厳格で年108〜114日。', '年天中殺に当たる人は2年まるごと。'], ['午未の人の期間', '2026年2月4日〜2028年2月4日']),
        ('03', '過去を取り消す計算はない', ['次の移動は、新しい住まいを起点に判定。', '転勤などは「やむを得ない移動」で登録。'], ['サイトでの転勤の扱い', '移転不可にせず、その期間の吉凶を弱める']),
    ]
    for i,(n,title,left,right) in enumerate(items):
        y = 285+i*163
        p.rect(64,y,1672,149,CARD)
        p.text(n,87,y+23,38,color=GOLD,role='number')
        p.text(title,176,y+17,36,role='bold')
        p.lines(left,176,y+70,28,leading=40)
        p.line(965,y+22,965,y+126)
        p.text(right[0],1002,y+26,27,color=ACC,role='bold')
        p.text(right[1],1002,y+82,28,maxw=709)
    p.text('出典：本文「先に結論」「天中殺に引っ越ししても大丈夫ですか？」ほか', 68, 780, 24, color=MUTE)
    p.point('生活の条件を先に確かめ、占術は判断材料の一つとして扱う。')
    p.save('-slide-1')


def counts(rows):
    p = Page('02 / データ', '空亡別・避ける日数を比べる', '設定名は Cloud Palette の表記。棒の長さは、すべて共通の尺度です（0〜365日）。', 2)
    for k,year in enumerate((2026,2027)):
        x=64+k*852
        p.rect(x,282,820,413,CARD)
        p.text(f'{year}年',x+24,297,38,color=ACC,role='number')
        for j,label in enumerate(('厳格','年天中殺は除く','日のみ')):
            p.text(label,x+150+j*217,359,26,color=MUTE)
        for i,row in enumerate(rows):
            y=403+i*47
            if row[0]=='午未': p.rect(x+8,y-5,804,46,BAND)
            p.text(row[0],x+24,y,30,role='bold',color=ACC if row[0]=='午未' else INK)
            for j,n in enumerate(row[1+k*3:4+k*3]):
                xx=x+150+j*217
                p.text(f'{n}日',xx,y,30,role='number',color=ACC if row[0]=='午未' else INK)
                p.rect(xx,y+36,183,4,LINE)
                p.rect(xx,y+36,183*n/365,4,ACC if j==0 else GOLD)
    p.text('午未：2026年は立春から。2027年は365日すべて。',68,716,28,role='bold')
    p.text('辰巳：2026年の最初の34日が年天中殺の残り。',916,716,28,role='bold')
    p.text('出典：本文の日数表｜サイトの判定・日本時間正午・東京の経度｜2026年9月時点の判定エンジン',68,770,26,color=MUTE)
    p.point('どの設定が正しいかを決める、上位の基準はありません。')
    p.save('-slide-2')


def situations():
    p = Page('03 / 状況別', 'あなたの状況から、次にすることへ', '引越し前・引越し後・転勤で、確認する点は変わります。', 3)
    p.text('状況',100,284,26,color=MUTE)
    p.text('何を見るか',565,284,26,color=MUTE)
    p.text('次に何をするか',1130,284,26,color=MUTE)
    data=[('これから決める',['自分の空亡と','避ける期間の長さ'],['天中殺の扱いを選び','候補日を出す']),
          ('日程が決まっている',['契約・費用・生活の条件と','採用する設定'],['生活の条件を先に確かめ','時期と方位を分けて確認']),
          ('もう引っ越した',['過去の移動を取り消す','計算はない'],['次の移動は、新しい住まいを','起点に判定する']),
          ('転勤で動く',['自分で決められない','移動の扱い'],['「やむを得ない移動」で登録し','弱めた判定で確認'])]
    for i,(name,a,b) in enumerate(data):
        y=328+i*99
        p.rect(64,y,1672,92,CARD if i%2==0 else BAND)
        p.text(f'{i+1:02d}',88,y+28,30,color=GOLD,role='number')
        p.text(name,165,y+28,32,role='bold')
        p.lines(a,565,y+12,28,leading=39)
        p.icon('arrow',1043,y+23,GOLD)
        p.lines(b,1130,y+12,28,leading=39)
    p.icon('calendar',83,747)
    p.text('天中殺＝「いつ」動くか',149,754,30,color=ACC,role='bold')
    p.icon('compass',848,747)
    p.text('方位＝「どちらへ」動くか。別に確認する。',913,754,30,role='bold')
    p.point('天中殺は時期の話。方位の凶を重ねて気にする場合は、分けて確認する。')
    p.save('-slide-3')


def steps():
    p = Page('04 / 手順', '自分の動ける日を出す、3ステップ', '空亡を確認し、扱いを決めて、同じ条件で候補日を比べます。', 4)
    cards=[('空亡を知る','house',['生年月日を入力する。','生まれた日の干支（日柱）から','決まる、自分の空亡を確認。'],['入力 → 日柱 → 空亡']),
           ('扱いの設定を選ぶ','check',['「厳格」「年天中殺は除く」','「日のみ」などから、','自分の拠る流派に合わせる。'],['転勤などは','「やむを得ない移動」で登録。']),
           ('候補日を出す','calendar',['「引越しの日取りを選ぶ」で','月ごとの候補日を確認。','時期と方位を分けて見る。'],['2年ぶんを並べるときは','「引越し時期を分析する」へ。'])]
    for i,(title,icon,body,note) in enumerate(cards):
        x=64+i*568
        p.rect(x,283,536,357,CARD,LINE)
        p.text(f'0{i+1}',x+25,303,43,color=GOLD,role='number')
        p.icon(icon,x+459,306)
        p.text(title,x+25,371,36,role='bold')
        p.lines(body,x+25,420,28,leading=42,maxw=486)
        p.line(x+25,548,x+511,548)
        p.lines(note,x+25,564,26,leading=34,color=ACC)
    p.rect(64,650,1672,132,BAND)
    p.text('候補日の見方',87,672,28,role='bold')
    p.text('月ごとに確認',431,670,30,role='bold')
    p.text('引越しの日取りを選ぶ  /calendar',431,722,28)
    p.line(1017,670,1017,760)
    p.text('2年ぶんを並べて確認',1050,670,30,role='bold')
    p.text('引越し時期を分析する  /relocation/timing',1050,722,28,maxw=665)
    p.point('候補を比べている途中では設定を変えず、同じ条件で比べる。')
    p.save('-slide-4')


def comparison():
    p = Page('05 / 比較', '天中殺と大殺界は、別の計算', '呼び名が似ていても、計算のもとと期間が違います。同じ年に来るとは限りません。', 5)
    for i,(name,system,basis,years) in enumerate([
        ('天中殺','算命学','生まれた日の干支（日干支）',2),
        ('大殺界','六星占術','運命星と12年周期',3)]):
        x=64+i*852
        p.rect(x,282,820,420,CARD,LINE)
        p.line(x,282,x+820,282,ACC if i==0 else GOLD,3)
        p.text(name,x+28,305,46,role='title',color=ACC if i==0 else INK)
        for y,label,value in [(380,'体系',system),(438,'計算のもと',basis)]:
            p.text(label,x+28,y,26,color=MUTE)
            p.text(value,x+220,y,30,role='bold',maxw=580)
        p.line(x+28,491,x+792,491)
        p.text('12年のうち',x+28,536,32)
        p.text(str(years),x+232,509,80,color=ACC if i==0 else GOLD,role='number')
        p.text('年',x+294,550,32)
        for j in range(12):
            p.rect(x+28+j*64,612,54,23,(ACC if i==0 else GOLD) if j<years else BAND)
        p.text('期間の長さの模式図（実際の開始年を示すものではありません）',x+28,660,24,color=MUTE,maxw=770)
    p.icon('check',84,735)
    p.text('Cloud Palette が扱うのは、空亡に基づく天中殺だけです。',154,742,32,role='bold')
    p.point('天中殺・空亡は、九星気学とは別の体系。サイト独自のモデルで重ねて扱う。')
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
