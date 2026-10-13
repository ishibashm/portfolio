import re, shutil, pathlib
from xml.sax.saxutils import escape
W = pathlib.Path("/workspace/slides/self-intro-v2-gNCCvj/unpacked/ppt")
E = 914400
NAVY, ORANGE, TEXT, MUTED, PANEL, RULE, WHITE = "1F3A5F","F28C28","222222","666666","F3F5F8","D0D7E2","FFFFFF"
FONT = "BIZ UDPGothic"
TOTAL = 13
NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
def e(v): return int(round(v*E))
class S:
    def __init__(s): s.items=[]; s.n=2
    def nid(s):
        s.n+=1; return s.n
def run(t, sz, b=False, c=TEXT):
    return (f'<a:r><a:rPr lang="ja-JP" altLang="en-US" sz="{int(sz*100)}" b="{1 if b else 0}" dirty="0">'
            f'<a:solidFill><a:srgbClr val="{c}"/></a:solidFill><a:latin typeface="{FONT}"/><a:ea typeface="{FONT}"/><a:cs typeface="{FONT}"/></a:rPr>'
            f'<a:t>{escape(t)}</a:t></a:r>')
def para(runs, algn="l", spc_after=0, ln=None):
    sp = f'<a:spcAft><a:spcPts val="{int(spc_after*100)}"/></a:spcAft>' if spc_after else ''
    lns = f'<a:lnSpc><a:spcPct val="{ln*1000}"/></a:lnSpc>' if ln else ''
    sz = re.search(r'sz="(\d+)"', runs[0]).group(1) if runs else "1200"
    return f'<a:p><a:pPr algn="{algn}">{lns}{sp}</a:pPr>{"".join(runs)}<a:endParaRPr lang="ja-JP" sz="{sz}"/></a:p>'
def shape(s, name, x,y,w,h, fill=None, line=None, paras=None, anchor="t", geom="rect", inset=(0.1,0.05), lw=1):
    i=s.nid()
    f = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else '<a:noFill/>'
    l = f'<a:ln w="{int(lw*12700)}"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>' if line else '<a:ln><a:noFill/></a:ln>'
    tx = ''
    if paras is not None:
        tx = (f'<p:txBody><a:bodyPr wrap="square" lIns="{e(inset[0])}" tIns="{e(inset[1])}" rIns="{e(inset[0])}" bIns="{e(inset[1])}" anchor="{anchor}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>'
              + "".join(paras) + '</p:txBody>')
    s.items.append(f'<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="{name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{e(x)}" y="{e(y)}"/><a:ext cx="{e(w)}" cy="{e(h)}"/></a:xfrm><a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>{f}{l}</p:spPr>{tx}</p:sp>')
def pic(s, name, rid, x,y,w,h, descr=""):
    i=s.nid()
    s.items.append(f'<p:pic><p:nvPicPr><p:cNvPr id="{i}" name="{name}" descr="{escape(descr)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
        f'<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        f'<p:spPr><a:xfrm><a:off x="{e(x)}" y="{e(y)}"/><a:ext cx="{e(w)}" cy="{e(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="9525"><a:solidFill><a:srgbClr val="{RULE}"/></a:solidFill></a:ln></p:spPr></p:pic>')
def write(slide, s, name):
    xml = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld {NS}><p:cSld name="{name}"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
           '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
           + "".join(s.items) + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')
    (W/"slides"/slide).write_text(xml, encoding="utf-8")
def notes(nfile, lines):
    p = W/"notesSlides"/nfile
    x = p.read_text(encoding="utf-8")
    body = "".join(f'<a:p><a:r><a:rPr lang="ja-JP"/><a:t>{escape(t)}</a:t></a:r></a:p>' for t in lines)
    x2 = re.sub(r'(<p:ph type="body" idx="1"/>.*?<a:lstStyle/>).*?(</p:txBody>)', lambda m: m.group(1)+body+m.group(2), x, count=1, flags=re.S)
    assert "<p:ph type=\"body\" idx=\"1\"/>" in x
    p.write_text(x2, encoding="utf-8")
def chrome(s, num, title, key, page):
    shape(s,"Title bar",0,0,13.333,0.95,fill=NAVY)
    runs = ([run(num+"  ",28,True,ORANGE)] if num else []) + [run(title,28,True,WHITE)]
    shape(s,"Title",0.6,0,12.1,0.95,paras=[para(runs)],anchor="ctr",inset=(0,0))
    shape(s,"Accent line",0,0.95,13.333,0.06,fill=ORANGE)
    shape(s,"Key bar",0.6,1.22,0.08,0.5,fill=ORANGE)
    shape(s,"Key message",0.8,1.17,11.9,0.6,paras=[para([run(key,18,True,NAVY)])],anchor="ctr",inset=(0.05,0))
    shape(s,"Footer rule",0.6,6.95,12.133,0.01,fill=RULE)
    shape(s,"Footer",0.6,7.0,8,0.35,paras=[para([run("石橋 真｜最近のあれこれ",10,False,MUTED)])],anchor="ctr",inset=(0,0))
    shape(s,"Page number",10.733,7.0,2,0.35,paras=[para([run(f"{page} / {TOTAL}",10,False,MUTED)],algn="r")],anchor="ctr",inset=(0,0))

# ---------- Slide 1: cover (slide1.xml)
s=S()
shape(s,"Navy panel",8.6,0,4.733,7.5,fill=NAVY)
shape(s,"Orange edge",8.52,0,0.08,7.5,fill=ORANGE)
shape(s,"Top line",0,0,8.52,0.12,fill=NAVY)
shape(s,"Kicker bar",0.8,1.75,0.9,0.08,fill=ORANGE)
shape(s,"Kicker",0.8,1.2,6,0.45,paras=[para([run("社内トーク",14,True,ORANGE)])],anchor="b",inset=(0,0))
shape(s,"Cover title",0.8,2.1,7.4,1.3,paras=[para([run("最近のあれこれ",56,True,NAVY)],ln=110)],anchor="t",inset=(0,0))
shape(s,"Subtitle",0.8,3.6,7.4,0.6,paras=[para([run("AI・個人開発・出身地の話など",22,True,MUTED)])],anchor="t",inset=(0,0))
shape(s,"Subtitle note",0.8,4.3,7.4,0.45,paras=[para([run("気楽に聞いてもらえればうれしいです",14,False,MUTED)])],anchor="t",inset=(0,0))
shape(s,"Presenter rule",0.8,5.55,6.8,0.01,fill=RULE)
shape(s,"Presenter label",0.8,5.7,1.1,0.5,paras=[para([run("発表者",14,True,ORANGE)])],anchor="ctr",inset=(0,0))
shape(s,"Presenter",2.0,5.65,5.6,0.6,paras=[para([run("石橋 真",28,True,NAVY),run("（いしばし まこと）",14,False,MUTED)])],anchor="ctr",inset=(0,0))
grid=[["4","9","2"],["3","5","7"],["8","1","6"]]
cx0, cy0, c, g = 9.42, 1.85, 0.95, 0.15
for r,row in enumerate(grid):
    for k,v in enumerate(row):
        center = (r==1 and k==1)
        shape(s,f"Kyusei {v}",cx0+k*(c+g),cy0+r*(c+g),c,c,fill=ORANGE if center else None,line=None if center else WHITE,lw=1.5,
              paras=[para([run(v,26,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Kyusei caption",9.2,5.25,3.6,0.45,paras=[para([run("九星の方位盤",14,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
write("slide1.xml",s,"Cover")
notes("notesSlide1.xml",[
 "石橋です。今日は堅い話ではなく、最近のあれこれをゆるっと話そうと思います。",
 "右の図は九星気学の方位盤です。ちょっと変わった趣味なんですが、個人開発のネタにもなっています。",
 "AIのこと、個人開発のこと、出身地の話なんかを、雑談くらいの感じで聞いてもらえればと思います。"])

# ---------- Slide 2: agenda (slide9.xml)
s=S()
chrome(s,"","今日話すこと","AIのこと、個人開発のこと、出身地のことなど、ゆるく6つ話します",2)
items=[("01","ざっくりプロフィール","仕事と好きなこと"),
       ("02","出身地・敦賀市","福井県嶺南、日本海に面した港町"),
       ("03","独学と個人開発","Web開発・MCP・Cloud Palette"),
       ("04","開発スタイル","AIが実装し、自分はレビューと方向決め"),
       ("05","最近の状況","second brain とAIエージェントの活用"),
       ("06","これから","方位判定の自動化・低予算運営・発信")]
cw, ch, gx, gy, x0, y0 = 3.9, 2.25, 0.217, 0.25, 0.6, 2.05
for idx,(n,t,sub) in enumerate(items):
    col, row = idx%3, idx//3
    x, y = x0+col*(cw+gx), y0+row*(ch+gy)
    shape(s,f"Agenda card {n}",x,y,cw,ch,fill=PANEL)
    shape(s,f"Agenda top {n}",x,y,cw,0.06,fill=NAVY)
    shape(s,f"Agenda num {n}",x+0.3,y+0.3,1.4,0.7,paras=[para([run(n,36,True,ORANGE)])],anchor="t",inset=(0,0))
    shape(s,f"Agenda title {n}",x+0.3,y+1.05,cw-0.6,0.5,paras=[para([run(t,20,True,NAVY)])],anchor="t",inset=(0,0))
    shape(s,f"Agenda rule {n}",x+0.3,y+1.6,0.6,0.03,fill=ORANGE)
    shape(s,f"Agenda sub {n}",x+0.3,y+1.7,cw-0.5,0.45,paras=[para([run(sub,13,False,TEXT)])],anchor="t",inset=(0,0))
write("slide9.xml",s,"Agenda")
notes("notesSlide9.xml",[
 "今日話すことは、だいたいこの6つです。",
 "最初にざっくりプロフィール、それから出身地の福井県敦賀市の話を少しだけします。",
 "そのあと、独学でやってきたことや、作っているCloud Paletteの話をします。",
 "後半は最近の開発スタイルや、最近ハマっていること、これからやってみたいことです。"])

# ---------- Slide 3: profile (slide2.xml)
s=S()
chrome(s,"01","ざっくりプロフィール","仕事はSQLサーバーのデータ業務。好きな九星気学とAIを、個人開発につなげています",3)
rows=[("名前",[[run("石橋 真",18,True,NAVY),run("（いしばし まこと）",13,False,MUTED)]],0.6),
      ("担当業務",[[run("SQLサーバーを使ったデータ業務",16,True,TEXT)]],0.65),
      ("出身",[[run("福井県敦賀市",16,True,TEXT),run("（このあと少しだけ紹介）",12,False,MUTED)]],0.6),
      ("好きなこと",[[run("・九星気学・方位",15,False,TEXT)],[run("・AIエージェント",15,False,TEXT)],[run("・ガジェットやインテリア",15,False,TEXT)]],1.35),
      ("個人開発",[[run("Cloud Palette",16,True,NAVY),run("（cloud-palette.com）",12,False,MUTED)],[run("九星気学・方位・暦をテーマにしたサイト",13,False,TEXT)]],0.95)]
y=2.05; lx, lw_, vx, vw = 0.6, 1.6, 2.28, 5.12
for lab,ps,h in rows:
    shape(s,f"Label {lab}",lx,y,lw_,h,fill=NAVY,paras=[para([run(lab,14,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0.05,0))
    shape(s,f"Value {lab}",vx,y,vw,h,fill=PANEL,paras=[para(p,ln=105) for p in ps],anchor="ctr",inset=(0.2,0.05))
    y+=h+0.08
ix, iw = 7.75, 4.983
ih = iw*720/1280
pic(s,"Illust database","rIdG1Img",ix,2.05,iw,ih,"データベースのイラスト")
shape(s,"Likes heading",ix,4.95,iw,0.35,paras=[para([run("好きなこと 3つ",13,True,NAVY)])],anchor="ctr",inset=(0,0))
likes=[("方位",["九星気学","方位"]),("AI",["AI","エージェント"]),("モノ",["ガジェット","インテリア"])]
bw=(iw-0.3)/3
for k,(ic,cap) in enumerate(likes):
    bx=ix+k*(bw+0.15)
    shape(s,f"Like box {k}",bx,5.35,bw,1.27,fill=None,line=RULE)
    shape(s,f"Like icon {k}",bx+(bw-0.62)/2,5.42,0.62,0.62,fill=ORANGE if k==0 else NAVY,geom="ellipse",paras=[para([run(ic,13,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
    shape(s,f"Like cap {k}",bx+0.05,6.06,bw-0.1,0.52,paras=[para([run(t,12,True,TEXT)],algn="ctr",ln=100) for t in cap],anchor="ctr",inset=(0,0))
write("slide2.xml",s,"Profile")
shutil.copy("/workspace/slides/self-intro-assets/illust_database.jpg", W/"media/g1_illust_database.jpeg")
rp=W/"slides/_rels/slide2.xml.rels"; rx=rp.read_text()
if "rIdG1Img" not in rx:
    rx=rx.replace("</Relationships>",'<Relationship Id="rIdG1Img" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/g1_illust_database.jpeg"/></Relationships>')
    rp.write_text(rx)
notes("notesSlide2.xml",[
 "まずはざっくりプロフィールです。仕事では、SQLサーバーを使ったデータ業務をやっています。",
 "出身は福井県の敦賀市です。どんなところか、このあと少しだけ話します。",
 "好きなことは、九星気学や方位、AIエージェント、あとはガジェットやインテリアです。",
 "九星気学とAIが好きなのがそのまま個人開発につながっていて、Cloud Paletteというサイトを作っています。この話はまた後で。"])
print("ok")
