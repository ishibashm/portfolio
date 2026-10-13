# v3 g3: slides 7-9 (slide25.xml, slide22.xml, slide7.xml) — adapted from v2 g2/g4_build.py
exec(open("/workspace/slides/self-intro-v3-DKNt2M/notes/v3_lib.py").read())
# ---------- Slide 7 (slide25.xml) Grok Botってなに？
s=S()
chrome(s,"②","Grok Botってなに？","チャットで頼むと、調べ物・資料づくり・定期チェックなどを代わりにやってくれるAIアシスタント",7)
droprels("slide25.xml")
lx, lw = 0.6, 6.0
shape(s,"Can head",lx,2.05,lw,0.36,paras=[para([run("頼めること（たとえば）",14,True,NAVY)])],anchor="ctr",inset=(0,0))
tw=(lw-0.3)/3
for k,t in enumerate(["調べ物","資料づくり","定期チェック"]):
    tx=lx+k*(tw+0.15)
    shape(s,f"Can tile {k}",tx,2.5,tw,1.1,fill=NAVY)
    shape(s,f"Can bar {k}",tx,2.5,tw,0.06,fill=ORANGE)
    shape(s,f"Can text {k}",tx,2.56,tw,1.04,paras=[para([run(t,20,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0.05,0))
shape(s,"Feat head",lx,3.85,lw,0.36,paras=[para([run("ここがポイント",14,True,NAVY)])],anchor="ctr",inset=(0,0))
feats=["チャットで頼むだけで、作業を進めてくれる","自分専用のコンピューターとブラウザを持っている","GmailやGitHubなどともつながる"]
y=4.3
for k,t in enumerate(feats):
    shape(s,f"Feat box {k}",lx,y,lw,0.7,fill=PANEL)
    shape(s,f"Feat bar {k}",lx,y,0.06,0.7,fill=ORANGE)
    shape(s,f"Feat text {k}",lx+0.25,y,lw-0.35,0.7,paras=[para([run(t,15,True,TEXT)])],anchor="ctr",inset=(0,0))
    y+=0.82
ix, iw = 6.9, 5.833
ih = iw*720/1280
photo(s,"slide25.xml","rIdG3Bot","illust_grokbot.jpg",ix,2.05,iw,ih,"Grok Botのイラスト",prefix="g3",border=True)
ky=2.05+ih+0.2
shape(s,"KPI box",ix,ky,iw,6.76-ky,fill=PANEL)
shape(s,"KPI bar",ix,ky,0.08,6.76-ky,fill=ORANGE)
shape(s,"KPI num",ix+0.3,ky,3.2,6.76-ky,paras=[para([run("2026年9月",30,True,ORANGE)])],anchor="ctr",inset=(0,0))
shape(s,"KPI label",ix+3.5,ky,iw-3.6,6.76-ky,paras=[para([run("から使い始めました",16,True,NAVY)])],anchor="ctr",inset=(0,0))
write("slide25.xml",s,"Grok Bot")
notes("notesSlide25.xml",[
 "ここから2つ目のテーマ、Grok Botの話です。",
 "Grok Botは、チャットで頼むと、調べ物や資料づくり、定期チェックなどを代わりにやってくれるAIアシスタントです。",
 "自分専用のコンピューターとブラウザを持っていて、GmailやGitHubなどともつながります。",
 "自分は2026年9月から使い始めました。"])

# ---------- Slide 8 (slide22.xml) Grok Botの使い方: bot tile grid
s=S()
chrome(s,"②","Grok Botの使い方","用途ごとにボットを使い分けています",8)
droprels("slide22.xml")
bots=["SEO","X投稿","YouTube","検索","求人探し","物件情報","Second Brain","スライド作成"]
gx, gw = 0.6, 7.3
tw=(gw-0.45)/4; th=2.3
for k,b in enumerate(bots):
    x=gx+(k%4)*(tw+0.15); y=2.05+(k//4)*(th+0.15)
    last = (b=="スライド作成")
    shape(s,f"Bot tile {k}",x,y,tw,th,fill=NAVY if last else PANEL)
    shape(s,f"Bot bar {k}",x,y,tw,0.06,fill=ORANGE)
    shape(s,f"Bot icon {k}",x+(tw-0.7)/2,y+0.45,0.7,0.7,fill=ORANGE if last else NAVY,geom="ellipse",paras=[para([run("Bot",12,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
    shape(s,f"Bot name {k}",x+0.05,y+1.3,tw-0.1,0.6,paras=[para([run(b,16 if len(b)<8 else 14,True,WHITE if last else NAVY)],algn="ctr")],anchor="ctr",inset=(0,0))
    shape(s,f"Bot cap {k}",x+0.05,y+1.92,tw-0.1,0.3,paras=[para([run("ボット",11,False,WHITE if last else MUTED)],algn="ctr")],anchor="ctr",inset=(0,0))
ix, iw = 8.2, 4.533
ih = iw*720/1280
photo(s,"slide22.xml","rIdG3Slides","illust_bot_slides.jpg",ix,2.05,iw,ih,"スライドを作るボットのイラスト",prefix="g3",border=True)
by=2.05+ih+0.2
shape(s,"Slides box",ix,by,iw,6.8-by,fill=NAVY)
shape(s,"Slides lead",ix+0.25,by+0.15,iw-0.5,0.4,paras=[para([run("今日のこのスライドも",14,True,WHITE)])],anchor="ctr",inset=(0,0))
shape(s,"Slides big",ix+0.25,by+0.55,iw-0.5,0.6,paras=[para([run("Grok Botに作ってもらった",22,True,ORANGE)])],anchor="ctr",inset=(0,0))
shape(s,"Slides rule",ix+0.25,by+1.25,iw-0.5,0.01,fill=ORANGE)
cw2=(iw-0.5-0.3)/4
for j,t in enumerate(["構成","写真集め","イラスト","デザイン"]):
    shape(s,f"Slides chip {j}",ix+0.25+j*(cw2+0.1),by+1.42,cw2,0.42,fill=WHITE,geom="roundRect",paras=[para([run(t,12,True,NAVY)],algn="ctr")],anchor="ctr",inset=(0,0))
write("slide22.xml",s,"Bot uses")
notes("notesSlide22.xml",[
 "Grok Botの使い方です。用途ごとにボットを分けて使っています。",
 "SEO、X投稿、YouTube、検索、求人探し、物件情報、Second Brain、スライド作成などです。",
 "実は今日のこのスライドも、Grok Botに作ってもらいました。構成、写真集め、イラスト、デザインまでお願いしています。"])

# ---------- Slide 9 (slide7.xml) 開発スタイル
s=S()
chrome(s,"②","開発スタイル","「学ぶ」から「任せる」へ ― 2026年8月ごろから、実装はAIエージェントに任せています",9)
droprels("slide7.xml")
shape(s,"Role AI",0.6,2.05,2.9,2.35,fill=NAVY)
shape(s,"Role AI tag",0.8,2.2,1.4,0.32,fill=ORANGE,geom="roundRect",paras=[para([run("AIエージェント",11,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Role AI name",0.8,2.6,2.5,0.9,paras=[para([run(n,15,True,WHITE)],ln=100) for n in ["Grok Bot","Claude Code","Codex"]],anchor="t",inset=(0,0))
shape(s,"Role AI rule",0.8,3.55,2.5,0.01,fill=ORANGE)
shape(s,"Role AI job",0.8,3.63,2.5,0.7,paras=[para([run("担当：実装",15,True,WHITE)]),para([run("コードを書く・動かす",12,False,WHITE)])],anchor="t",inset=(0,0))
shape(s,"Arrow to AI",3.6,2.55,1.0,0.4,fill=ORANGE,geom="leftArrow")
shape(s,"Arrow to AI label",3.5,2.15,1.2,0.35,paras=[para([run("短い指示",11,True,NAVY)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Arrow to me",3.6,3.45,1.0,0.4,fill=NAVY,geom="rightArrow")
shape(s,"Arrow to me label",3.5,3.9,1.2,0.35,paras=[para([run("結果・選択肢",11,True,NAVY)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Role me",4.7,2.05,2.6,2.35,fill=PANEL,line=NAVY,lw=1.5)
shape(s,"Role me tag",4.9,2.2,0.9,0.32,fill=NAVY,geom="roundRect",paras=[para([run("自分",11,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Role me name",4.9,2.62,2.3,0.75,paras=[para([run("レビュー",17,True,NAVY)],ln=100),para([run("方向決め",17,True,NAVY)],ln=100)],anchor="t",inset=(0,0))
shape(s,"Role me rule",4.9,3.55,2.2,0.01,fill=ORANGE)
shape(s,"Role me job",4.9,3.63,2.3,0.7,paras=[para([run("担当：判断",15,True,NAVY)]),para([run("何を作るか・OKかを決める",12,False,TEXT)])],anchor="t",inset=(0,0))
shape(s,"Howto head",0.6,4.6,6.7,0.42,fill=NAVY,paras=[para([run("指示の出し方",14,True,WHITE)])],anchor="ctr",inset=(0.2,0))
shape(s,"Howto box",0.6,5.02,6.7,1.8,fill=None,line=RULE)
for k,c in enumerate(["「進めて」","「はい」"]):
    shape(s,f"Chip {k}",0.85+k*1.55,5.2,1.4,0.45,fill=WHITE,line=ORANGE,lw=1.5,geom="roundRect",paras=[para([run(c,15,True,ORANGE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Chip note",4.0,5.2,3.2,0.45,paras=[para([run("指示は短く、ひとことで",13,True,NAVY)])],anchor="ctr",inset=(0,0))
shape(s,"Howto body",0.85,5.8,6.3,0.95,paras=bullets(["AIが出す番号つきの選択肢から選ぶだけで進む","細かい実装はAIに任せ、自分は結果を見て判断する"],12.5),anchor="t",inset=(0,0))
ix, iw = 7.6, 5.133
ih = iw*720/1280
pic(s,"Illust ai dev","rIdG4Img1",ix,2.05,iw,ih,"AIと開発するイラスト")
ty=2.05+ih+0.2
shape(s,"TL before",ix,ty,2.3,1.65,fill=PANEL)
shape(s,"TL before t",ix+0.15,ty+0.12,2.0,1.45,paras=[para([run("これまで",11,True,MUTED)]),para([run("学ぶ",20,True,NAVY)]),para([run("自分で書き、AIに聞く",11.5,False,TEXT)],ln=100)],anchor="t",inset=(0,0))
shape(s,"TL arrow",ix+2.38,ty+0.6,0.38,0.45,fill=ORANGE,geom="rightArrow")
shape(s,"TL after",ix+2.833,ty,2.3,1.65,fill=NAVY)
shape(s,"TL after t",ix+2.983,ty+0.12,2.0,1.45,paras=[para([run("2026年8月ごろから",11,True,ORANGE)]),para([run("任せる",20,True,WHITE)]),para([run("AIが実装、自分はレビュー",11.5,False,WHITE)],ln=100)],anchor="t",inset=(0,0))
write("slide7.xml",s,"Dev style")
addrel("slide7.xml","rIdG4Img1","../media/"+media("illust_ai_dev.jpg","g4"))
notes("notesSlide7.xml",[
 "開発スタイルについてです。キーワードは「学ぶ」から「任せる」へ、です。",
 "2026年8月ごろから、実装はAIエージェントに任せるようになりました。いまはGrok Bot、Claude Code、Codexが実装担当です。",
 "自分の役割はレビューと方向決めです。何を作るか、結果がOKかを判断します。",
 "指示はとても短くて、「進めて」や「はい」くらいです。AIが番号つきの選択肢を出してくれるので、そこから選ぶだけで進みます。"])
print("g3 ok")
