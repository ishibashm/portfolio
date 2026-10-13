import shutil
src = open("/workspace/slides/self-intro-v2-gNCCvj/notes/g1_build.py").read().split("# ---------- Slide 1")[0]
exec(src)
def bullets(lst, sz=12, c=TEXT):
    return [para([run("・"+b,sz,False,c)],ln=105,spc_after=3) for b in lst]

# ---------- Slide 6 (slide10.xml)
s=S()
chrome(s,"03","独学でやってきたこと","作りながら覚え、わからないことはAIに聞く。その延長でMCPまでたどり着きました",6)
steps=[("01","Web開発","サンプルコードとAIの解説で、Next.js / React を覚えた",["まずはサンプルコードを動かしてみる","わからない箇所はAIに解説してもらう","作りながら少しずつ理解を広げる"]),
       ("02","AIに聞きながら学ぶ","エラーや画面を、そのまま貼って質問する",["エラーメッセージをそのまま貼り付ける","画面のスクリーンショットも見せて相談","その場で詰まりを解消して先へ進む"]),
       ("03","MCP","AIと外部ツールをつなぐ仕組み",["Cursorに検索・GitHubを接続して開始","AIが外部の情報やツールを使えるように","自分のサービスにもMCPを取り入れる"])]
cw, gap = 3.85, 0.29
tops=[2.95,2.5,2.05]; bottom=6.2
for k,(n,t,d,b) in enumerate(steps):
    x=0.6+k*(cw+gap); y=tops[k]; h=bottom-y
    dark = (k==2)
    fg = WHITE if dark else NAVY; tc = WHITE if dark else TEXT
    shape(s,f"Step card {n}",x,y,cw,h,fill=NAVY if dark else PANEL)
    shape(s,f"Step top {n}",x,y,cw,0.06,fill=ORANGE)
    shape(s,f"Step num {n}",x+0.25,y+0.2,1.2,0.6,paras=[para([run(n,32,True,ORANGE)])],anchor="t",inset=(0,0))
    shape(s,f"Step title {n}",x+0.25,y+0.85,cw-0.5,0.45,paras=[para([run(t,19,True,fg)])],anchor="t",inset=(0,0))
    shape(s,f"Step desc {n}",x+0.25,y+1.35,cw-0.5,0.62,paras=[para([run(d,13,True,tc)],ln=105)],anchor="t",inset=(0,0))
    shape(s,f"Step rule {n}",x+0.25,y+2.02,cw-0.5,0.01,fill=ORANGE if dark else RULE)
    shape(s,f"Step body {n}",x+0.25,y+2.1,cw-0.5,h-2.2,paras=bullets(b,12,tc),anchor="t",inset=(0,0))
    if k<2:
        shape(s,f"Step arrow {n}",x+cw+0.02,y+0.35,0.25,0.35,fill=ORANGE,geom="rightArrow")
shape(s,"Summary band",0.6,6.33,12.133,0.5,fill=None,line=RULE)
shape(s,"Summary label",0.6,6.33,1.6,0.5,fill=NAVY,paras=[para([run("学び方の軸",13,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Summary text",2.35,6.33,10.3,0.5,paras=[para([run("手を動かす → 詰まったらAIに聞く → AIとツールをつなぐ。独学のスピードをAIで上げてきました",13,True,NAVY)])],anchor="ctr",inset=(0.05,0))
write("slide10.xml",s,"Self study")
notes("notesSlide10.xml",[
 "ここからは、独学でやってきたことです。",
 "最初はWeb開発で、サンプルコードを動かしながら、わからないところはAIに解説してもらって、Next.jsやReactを覚えました。",
 "次に、AIに聞きながら学ぶやり方です。エラーや画面をそのまま貼って質問すると、その場で詰まりを解消できます。",
 "そして最近はMCPです。AIと外部ツールをつなぐ仕組みで、Cursorに検索やGitHubを接続したところから始めました。",
 "手を動かして、詰まったらAIに聞いて、AIとツールをつなぐ、という流れで学んできました。"])

# ---------- Slide 7 (slide21.xml)
s=S()
chrome(s,"03","個人開発 Cloud Palette","九星気学・方位・暦をWeb技術で。自分の「方位の疑問」から始まったサービスです",7)
shape(s,"Brand",0.6,2.0,6.4,0.65,paras=[para([run("Cloud Palette",32,True,NAVY)])],anchor="ctr",inset=(0,0))
shape(s,"URL",0.6,2.65,6.4,0.38,paras=[para([run("cloud-palette.com",15,True,ORANGE)])],anchor="ctr",inset=(0,0))
rows=[("テーマ","九星気学・方位・暦をWeb技術で","占術の考え方を、調べやすい形でWebに"),
      ("きっかけ","自分が何度も調べていた方位の疑問","同じことを毎回調べる手間を、サービスにした"),
      ("最近の追加","AIから使えるMCPサーバー／ニュースページ","AIエージェントからも方位・暦の情報を使える"),
      ("取り組み中","SEOの強化","検索から見つけてもらえるサイトへ")]
y=3.2
for lab,hd,sub in rows:
    shape(s,f"Row label {lab}",0.6,y,1.45,0.78,fill=NAVY,paras=[para([run(lab,13,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0.03,0))
    shape(s,f"Row value {lab}",2.12,y,4.9,0.78,fill=PANEL,paras=[para([run(hd,14,True,NAVY)],ln=100),para([run(sub,11.5,False,TEXT)],ln=100)],anchor="ctr",inset=(0.15,0.03))
    y+=0.86
ix, iw = 7.35, 5.383
ih = iw*720/1280
pic(s,"Illust compass","rIdG3Img",ix,2.05,iw,ih,"方位・コンパスのイラスト")
shape(s,"Tags heading",ix,5.2,iw,0.35,paras=[para([run("最近のアップデート",13,True,NAVY)])],anchor="ctr",inset=(0,0))
tags=[("NEW","MCPサーバー"),("NEW","ニュースページ"),("強化中","SEO")]
tw=(iw-0.3)/3
for k,(b,t) in enumerate(tags):
    tx=ix+k*(tw+0.15)
    shape(s,f"Tag box {k}",tx,5.6,tw,1.1,fill=None,line=RULE)
    shape(s,f"Tag badge {k}",tx+(tw-1.0)/2,5.72,1.0,0.32,fill=ORANGE if b=="NEW" else NAVY,geom="roundRect",paras=[para([run(b,11,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
    shape(s,f"Tag text {k}",tx+0.05,6.12,tw-0.1,0.45,paras=[para([run(t,14,True,NAVY)],algn="ctr")],anchor="ctr",inset=(0,0))
write("slide21.xml",s,"Cloud Palette")
shutil.copy("/workspace/slides/self-intro-assets/illust_compass.jpg", W/"media/g3_illust_compass.jpeg")
rp=W/"slides/_rels/slide21.xml.rels"; rx=rp.read_text()
if "rIdG3Img" not in rx:
    rp.write_text(rx.replace("</Relationships>",'<Relationship Id="rIdG3Img" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/g3_illust_compass.jpeg"/></Relationships>'))
notes("notesSlide21.xml",[
 "個人開発しているCloud Paletteです。URLは cloud-palette.com です。",
 "九星気学や方位、暦を、Web技術で扱えるようにしたサイトです。",
 "きっかけは、自分が何度も調べていた方位の疑問でした。毎回調べるくらいなら、サービスにしてしまおうと思って作りました。",
 "最近は、AIから使えるMCPサーバーと、ニュースページを追加しました。",
 "いまはSEOの強化に取り組んでいて、検索から見つけてもらえるサイトにしていきたいと考えています。"])

# ---------- Slide 8 (slide22.xml)
s=S()
chrome(s,"03","使っている技術","画面・データ・公開まで、個人でも回せるモダンな構成で開発しています",8)
groups=[("画面・アプリ",[("Next.js","フレームワーク","Reactベースのフレームワーク。ページ構成やルーティング、サーバー側の処理を担う"),
                      ("React","UIライブラリ","画面をコンポーネント単位で組み立てるためのライブラリ")]),
        ("言語・データ",[("TypeScript","言語","型のあるJavaScript。書いている段階でミスに気づきやすい"),
                      ("Supabase","データベース・認証","PostgreSQLベースのデータベースや認証をまとめて使えるサービス")]),
        ("公開・クラウド",[("Vercel","ホスティング","Next.jsアプリのデプロイ・公開。プッシュするだけで反映できる"),
                       ("Google Cloud","クラウド","APIやサーバー処理など、必要な機能を使えるクラウドサービス群")])]
cw, gap = 3.85, 0.29
for k,(gname,items) in enumerate(groups):
    x=0.6+k*(cw+gap)
    shape(s,f"Group head {k}",x,2.0,cw,0.48,fill=NAVY,paras=[para([run(f"{k+1:02d}  ",14,True,ORANGE),run(gname,15,True,WHITE)])],anchor="ctr",inset=(0.2,0))
    y=2.6
    for name,cat,role in items:
        shape(s,f"Tech card {name}",x,y,cw,1.95,fill=PANEL)
        shape(s,f"Tech bar {name}",x,y,0.06,1.95,fill=ORANGE)
        shape(s,f"Tech name {name}",x+0.25,y+0.18,cw-0.4,0.5,paras=[para([run(name,22,True,NAVY)])],anchor="ctr",inset=(0,0))
        shape(s,f"Tech cat {name}",x+0.25,y+0.75,1.9,0.3,fill=WHITE,line=ORANGE,geom="roundRect",paras=[para([run(cat,10.5,True,ORANGE)],algn="ctr")],anchor="ctr",inset=(0.03,0))
        shape(s,f"Tech role {name}",x+0.25,y+1.15,cw-0.45,0.72,paras=[para([run(role,12,False,TEXT)],ln=105)],anchor="t",inset=(0,0))
        y+=2.07
shape(s,"Tech note",0.6,6.72,12.133,0.2,paras=[para([run("※ 役割は各技術の一般的な位置づけ",9,False,MUTED)],algn="r")],anchor="ctr",inset=(0,0))
write("slide22.xml",s,"Tech stack")
notes("notesSlide22.xml",[
 "Cloud Paletteなどで使っている技術です。大きく、画面・アプリ、言語・データ、公開・クラウドの3つに分けています。",
 "画面まわりはNext.jsとReactです。Next.jsはReactベースのフレームワークで、ページ構成やサーバー側の処理を担います。Reactは画面を部品単位で組み立てるライブラリです。",
 "言語はTypeScriptで、型があるので書いている段階でミスに気づきやすいです。データベースや認証はSupabaseを使っています。",
 "公開はVercel、そのほか必要なクラウドの機能はGoogle Cloudを使っています。",
 "ここで紹介している役割は、それぞれの技術の一般的な位置づけです。"])
print("ok")
