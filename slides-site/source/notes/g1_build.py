# v3 g1: slides 1-3 (slide1.xml, slide9.xml, slide2.xml) — adapted from v2 g1_build.py
exec(open("/workspace/slides/self-intro-v3-DKNt2M/notes/v3_lib.py").read())
# ---------- Slide 1: cover (slide1.xml)
s=S()
shape(s,"Navy panel",8.6,0,4.733,7.5,fill=NAVY)
shape(s,"Orange edge",8.52,0,0.08,7.5,fill=ORANGE)
shape(s,"Top line",0,0,8.52,0.12,fill=NAVY)
shape(s,"Kicker bar",0.8,1.75,0.9,0.08,fill=ORANGE)
shape(s,"Kicker",0.8,1.2,6,0.45,paras=[para([run("ちょっと雑談",14,True,ORANGE)])],anchor="b",inset=(0,0))
shape(s,"Cover title",0.8,2.1,7.4,1.3,paras=[para([run("最近のあれこれ",56,True,NAVY)],ln=110)],anchor="t",inset=(0,0))
shape(s,"Subtitle",0.8,3.6,7.4,0.6,paras=[para([run("敦賀の話と、Grok Botの話",24,True,MUTED)])],anchor="t",inset=(0,0))
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
 "テーマは2つで、出身地の敦賀の話と、最近使っているGrok Botの話です。",
 "右の図は九星気学の方位盤です。ちょっと変わった趣味なんですが、個人開発のネタにもなっています。"])

# ---------- Slide 2: agenda (slide9.xml) -> two theme cards
s=S()
chrome(s,"","今日話すこと","今日のテーマは2つ。出身地の敦賀と、Grok BotとAIに任せる開発の話です",2)
droprels("slide9.xml")
cards=[("①","出身地・敦賀","福井県・日本海に面した港町","kehi_matsubara_user.jpg","気比の松原",["気比の松原","原発","港・鉄道・名産"]),
       ("②","Grok Botと、AIに任せる開発","チャットで頼めるAIアシスタント","illust_grokbot.jpg","Grok Botのイラスト",["Grok Bot","使い方","開発スタイル","Cloud Palette","second brain"])]
cw, x0, y0, chh = 5.95, 0.6, 2.05, 4.0
for k,(n,t,sub,img,descr,chips) in enumerate(cards):
    x=x0+k*(cw+0.233)
    shape(s,f"Theme card {k}",x,y0,cw,chh,fill=PANEL)
    shape(s,f"Theme top {k}",x,y0,cw,0.08,fill=NAVY)
    photo(s,"slide9.xml",f"rIdAg{k}",img,x+0.3,y0+0.35,2.4,1.6,descr,prefix="g1")
    shape(s,f"Theme num {k}",x+2.95,y0+0.3,1.0,0.62,paras=[para([run(n,36,True,ORANGE)])],anchor="t",inset=(0,0))
    shape(s,f"Theme title {k}",x+2.95,y0+0.95,cw-3.15,0.8,paras=[para([run(t,19,True,NAVY)],ln=100)],anchor="ctr",inset=(0,0))
    shape(s,f"Theme sub {k}",x+2.95,y0+1.78,cw-3.15,0.4,paras=[para([run(sub,12.5,False,TEXT)])],anchor="t",inset=(0,0))
    shape(s,f"Theme rule {k}",x+0.3,y0+2.2,cw-0.6,0.02,fill=ORANGE)
    chw=(cw-0.6-0.2)/2
    for j,c in enumerate(chips):
        cx=x+0.3+(j%2)*(chw+0.2); cy=y0+2.4+(j//2)*0.52
        shape(s,f"Chip {k}-{j}",cx,cy,chw,0.42,fill=WHITE,line=NAVY,geom="roundRect",paras=[para([run(c,14,True,NAVY)],algn="ctr")],anchor="ctr",inset=(0.05,0))
shape(s,"Bookends",0.6,6.25,12.133,0.5,fill=None,line=RULE,paras=[para([run("最初に",12,True,ORANGE),run("  ざっくりプロフィール",13,True,NAVY),run("　　／　　",12,False,MUTED),run("最後に",12,True,ORANGE),run("  これからやりたいこと",13,True,NAVY)],algn="ctr")],anchor="ctr",inset=(0.1,0))
write("slide9.xml",s,"Agenda")
notes("notesSlide9.xml",[
 "今日話すことは、大きく2つです。",
 "1つ目は出身地の福井県敦賀市。気比の松原、原発、港や鉄道、名産の話を少しします。",
 "2つ目はGrok Botと、AIに任せる開発の話です。Grok Botの使い方、開発スタイル、Cloud Palette、second brainを紹介します。",
 "最初にざっくりプロフィール、最後にこれからやりたいことも話します。"])

# ---------- Slide 3: profile (slide2.xml)
s=S()
chrome(s,"","ざっくりプロフィール","仕事はSQLサーバーのデータ業務。好きな九星気学とAIを、個人開発につなげています",3)
rows=[("名前",[[run("石橋 真",18,True,NAVY),run("（いしばし まこと）",13,False,MUTED)]],0.6),
      ("担当業務",[[run("SQLサーバーを使ったデータ業務",16,True,TEXT)]],0.65),
      ("出身",[[run("福井県敦賀市",16,True,TEXT),run("（このあと少しだけ紹介）",12,False,MUTED)]],0.6),
      ("好きなこと",[[run("・九星気学・方位",15,False,TEXT)],[run("・AIエージェント",15,False,TEXT)],[run("・ガジェットやインテリア",15,False,TEXT)]],1.35),
      ("個人開発",[[run("Cloud Palette",16,True,NAVY),run("（cloud-palette.com）",12,False,MUTED)],[run("九星気学・方位・暦をテーマにしたサイト",13,False,TEXT)],[run("独学：Web開発 → AIに聞きながら学ぶ → MCP",12,False,MUTED)]],1.15)]
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
    shape(s,f"Like box {k}",bx,5.35,bw,1.37,fill=None,line=RULE)
    shape(s,f"Like icon {k}",bx+(bw-0.62)/2,5.42,0.62,0.62,fill=ORANGE if k==0 else NAVY,geom="ellipse",paras=[para([run(ic,13,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
    shape(s,f"Like cap {k}",bx+0.05,6.1,bw-0.1,0.55,paras=[para([run(t,12,True,TEXT)],algn="ctr",ln=100) for t in cap],anchor="ctr",inset=(0,0))
write("slide2.xml",s,"Profile")
addrel("slide2.xml","rIdG1Img","../media/"+media("illust_database.jpg","g1"))
notes("notesSlide2.xml",[
 "まずはざっくりプロフィールです。仕事では、SQLサーバーを使ったデータ業務をやっています。",
 "出身は福井県の敦賀市です。どんなところか、このあと少しだけ話します。",
 "好きなことは、九星気学や方位、AIエージェント、あとはガジェットやインテリアです。",
 "Web開発を独学して、AIに聞きながら学び、最近はMCPまで触っています。それがCloud Paletteというサイトにつながっています。"])
print("g1 ok")
