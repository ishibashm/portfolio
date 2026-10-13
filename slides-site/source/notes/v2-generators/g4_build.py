import shutil
src = open("/workspace/slides/self-intro-v2-gNCCvj/notes/g1_build.py").read().split("# ---------- Slide 1")[0]
exec(src)
def bullets(lst, sz=12, c=TEXT):
    return [para([run("・"+b,sz,False,c)],ln=105,spc_after=3) for b in lst]
def addimg(slide, rid, fname):
    shutil.copy("/workspace/slides/self-intro-assets/"+fname, W/"media"/("g4_"+fname.replace(".jpg",".jpeg")))
    rp=W/"slides/_rels"/f"{slide}.rels"; rx=rp.read_text()
    if f'Id="{rid}"' not in rx:
        rp.write_text(rx.replace("</Relationships>",f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/g4_{fname.replace(".jpg",".jpeg")}"/></Relationships>'))

# ---------- Slide 9 (slide7.xml)
s=S()
chrome(s,"04","開発スタイル","「学ぶ」から「任せる」へ ― 2026年8月ごろから、実装はAIエージェントに任せています",9)
# role diagram
shape(s,"Role AI",0.6,2.05,2.9,2.35,fill=NAVY)
shape(s,"Role AI tag",0.8,2.2,1.4,0.32,fill=ORANGE,geom="roundRect",paras=[para([run("AIエージェント",11,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Role AI name",0.8,2.62,2.5,0.75,paras=[para([run("Claude Code",17,True,WHITE)],ln=100),para([run("Codex",17,True,WHITE)],ln=100)],anchor="t",inset=(0,0))
shape(s,"Role AI rule",0.8,3.45,2.5,0.01,fill=ORANGE)
shape(s,"Role AI job",0.8,3.55,2.5,0.75,paras=[para([run("担当：実装",15,True,WHITE)]),para([run("コードを書く・動かす",12,False,WHITE)])],anchor="t",inset=(0,0))
shape(s,"Arrow to AI",3.6,2.55,1.0,0.4,fill=ORANGE,geom="leftArrow")
shape(s,"Arrow to AI label",3.5,2.15,1.2,0.35,paras=[para([run("短い指示",11,True,NAVY)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Arrow to me",3.6,3.45,1.0,0.4,fill=NAVY,geom="rightArrow")
shape(s,"Arrow to me label",3.5,3.9,1.2,0.35,paras=[para([run("結果・選択肢",11,True,NAVY)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Role me",4.7,2.05,2.6,2.35,fill=PANEL,line=NAVY,lw=1.5)
shape(s,"Role me tag",4.9,2.2,0.9,0.32,fill=NAVY,geom="roundRect",paras=[para([run("自分",11,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Role me name",4.9,2.62,2.3,0.75,paras=[para([run("レビュー",17,True,NAVY)],ln=100),para([run("方向決め",17,True,NAVY)],ln=100)],anchor="t",inset=(0,0))
shape(s,"Role me rule",4.9,3.45,2.2,0.01,fill=ORANGE)
shape(s,"Role me job",4.9,3.55,2.3,0.75,paras=[para([run("担当：判断",15,True,NAVY)]),para([run("何を作るか・OKかを決める",12,False,TEXT)])],anchor="t",inset=(0,0))
# instruction panel
shape(s,"Howto head",0.6,4.6,6.7,0.42,fill=NAVY,paras=[para([run("指示の出し方",14,True,WHITE)])],anchor="ctr",inset=(0.2,0))
shape(s,"Howto box",0.6,5.02,6.7,1.8,fill=None,line=RULE)
chips=["「進めて」","「はい」"]
for k,c in enumerate(chips):
    shape(s,f"Chip {k}",0.85+k*1.55,5.2,1.4,0.45,fill=WHITE,line=ORANGE,lw=1.5,geom="roundRect",paras=[para([run(c,15,True,ORANGE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Chip note",4.0,5.2,3.2,0.45,paras=[para([run("指示は短く、ひとことで",13,True,NAVY)])],anchor="ctr",inset=(0,0))
shape(s,"Howto body",0.85,5.8,6.3,0.95,paras=bullets(["AIが出す番号つきの選択肢から選ぶだけで進む","細かい実装はAIに任せ、自分は結果を見て判断する"],12.5),anchor="t",inset=(0,0))
# image + timeline
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
addimg("slide7.xml","rIdG4Img1","illust_ai_dev.jpg")
notes("notesSlide7.xml",[
 "開発スタイルについてです。キーワードは「学ぶ」から「任せる」へ、です。",
 "2026年8月ごろから、実装はClaude CodeやCodexといったAIエージェントに任せるようになりました。",
 "自分の役割はレビューと方向決めです。何を作るか、結果がOKかを判断します。",
 "指示はとても短くて、「進めて」や「はい」くらいです。AIが番号つきの選択肢を出してくれるので、そこから選ぶだけで進みます。"])

# ---------- Slide 10 (slide12.xml)
s=S()
chrome(s,"05","最近の状況","AIとの会話を「第二の脳」として資産化し、作業はAIエージェントに丸ごと任せています",10)
lx, lw = 0.6, 7.0
shape(s,"Item1 num",lx,2.05,0.62,0.62,fill=ORANGE,paras=[para([run("1",20,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Item1 head",lx+0.8,2.05,lw-0.8,0.62,paras=[para([run("second brain をつくった",19,True,NAVY)])],anchor="ctr",inset=(0,0))
shape(s,"Item1 box",lx+0.8,2.75,lw-0.8,2.05,fill=PANEL)
rows=[("集約","約800件のAIとの会話をObsidianに集約"),("対象","Grok Bot・Claude・Gemini・AI Studio・ChatGPT"),("整理","トピックを自動で分類し、AIが要約"),("活用","検索用MCPで、AIからも過去の会話を探せる")]
yy=2.85
for lab,txt in rows:
    shape(s,f"I1 lab {lab}",lx+1.0,yy,0.8,0.38,fill=NAVY,paras=[para([run(lab,11.5,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
    shape(s,f"I1 txt {lab}",lx+1.95,yy,lw-2.15,0.38,paras=[para([run(txt,13,False,TEXT)])],anchor="ctr",inset=(0,0))
    yy+=0.48
items=[("2","作業を丸ごと任せるように","Grok Bot・Claude Code・Codexに、作業をまとめて任せる"),
       ("3","Cloud Paletteをアップデート","AIから使えるMCPサーバーと、ニュースページを追加")]
yy=5.0
for n,h,t in items:
    shape(s,f"Item{n} num",lx,yy,0.62,0.62,fill=NAVY,paras=[para([run(n,20,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
    shape(s,f"Item{n} head",lx+0.8,yy-0.02,lw-0.8,0.36,paras=[para([run(h,16,True,NAVY)])],anchor="t",inset=(0,0))
    shape(s,f"Item{n} body",lx+0.8,yy+0.36,lw-0.8,0.38,paras=[para([run(t,12.5,False,TEXT)])],anchor="t",inset=(0,0))
    yy+=0.95
ix, iw = 7.95, 4.783
ih = iw*720/1280
pic(s,"Illust second brain","rIdG4Img2",ix,2.05,iw,ih,"second brainのイラスト")
by=2.05+ih+0.2
shape(s,"Metric box",ix,by,iw,6.82-by,fill=NAVY)
shape(s,"Metric num",ix+0.25,by+0.15,3.0,1.0,paras=[para([run("約800",40,True,ORANGE),run("件",18,True,WHITE)])],anchor="ctr",inset=(0,0))
shape(s,"Metric label",ix+3.3,by+0.15,iw-3.45,1.0,paras=[para([run("AIとの会話を",13,True,WHITE)],ln=100),para([run("ひとつの場所に",13,True,WHITE)],ln=100)],anchor="ctr",inset=(0,0))
shape(s,"Metric rule",ix+0.25,by+1.25,iw-0.5,0.01,fill=ORANGE)
shape(s,"Metric sub",ix+0.25,by+1.32,iw-0.5,0.55,paras=[para([run("Obsidian × 自動分類 × AI要約 × 検索用MCP",11.5,True,WHITE)])],anchor="ctr",inset=(0,0))
write("slide12.xml",s,"Recent")
addimg("slide12.xml","rIdG4Img2","illust_second_brain.jpg")
notes("notesSlide12.xml",[
 "最近の状況です。大きく3つあります。",
 "1つ目はsecond brain、第二の脳づくりです。Grok Bot、Claude、Gemini、AI Studio、ChatGPTなど、AIとの会話が約800件たまっていたので、Obsidianに集約しました。",
 "トピックを自動で分類して、AIが要約し、検索用のMCPでAIからも過去の会話を探せるようにしています。",
 "2つ目は、Grok BotやClaude Code、Codexに、作業を丸ごと任せるようになったことです。",
 "3つ目は、Cloud PaletteにAIから使えるMCPサーバーとニュースページを追加したことです。"])

# ---------- Slide 11 (slide23.xml)
s=S()
chrome(s,"06","これからやりたいこと","自動化と低予算運営でサービスを育て、発信も続けていきます",11)
ix, iw = 0.6, 4.6
ih = iw*720/1280
pic(s,"Illust roadmap","rIdG4Img3",ix,2.05,iw,ih,"ロードマップのイラスト")
ry=2.05+ih+0.25
shape(s,"Rail box",ix,ry,iw,6.82-ry,fill=PANEL)
shape(s,"Rail line",ix+0.6,ry+0.75,iw-1.2,0.05,fill=RULE)
for k in range(4):
    dx=ix+0.4+k*((iw-0.8-0.5)/3)
    shape(s,f"Rail dot {k}",dx,ry+0.52,0.5,0.5,fill=ORANGE if k==3 else NAVY,geom="ellipse",paras=[para([run(str(k+1),14,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Rail cap",ix,ry+1.2,iw,0.45,paras=[para([run("ひとつずつ、少しずつ",14,True,NAVY)],algn="ctr")],anchor="ctr",inset=(0,0))
cards=[("01","方位判定の完全自動化",None,["判定を手作業なしで回す"]),
       ("02","低予算でサイト運営",None,["月1,000円程度で運営を続ける"]),
       ("03","Cloud Paletteを育てる",None,["SEOを強化する","ニュースページを充実させる"]),
       ("04","Xでの発信を続ける",None,["発信をコツコツ続ける"])]
gx, gw, gh = 5.5, (12.733-5.5-0.25)/2, 2.3
for k,(n,t,_,b) in enumerate(cards):
    cx=gx+(k%2)*(gw+0.25); cy=2.05+(k//2)*(gh+0.17)
    shape(s,f"Plan card {n}",cx,cy,gw,gh,fill=WHITE,line=RULE)
    shape(s,f"Plan bar {n}",cx,cy,gw,0.06,fill=NAVY)
    shape(s,f"Plan num {n}",cx+0.2,cy+0.2,0.7,0.55,paras=[para([run(n,26,True,ORANGE)])],anchor="ctr",inset=(0,0))
    shape(s,f"Plan title {n}",cx+0.95,cy+0.2,gw-1.05,0.55,paras=[para([run(t,14.5,True,NAVY)])],anchor="ctr",inset=(0,0))
    shape(s,f"Plan rule {n}",cx+0.2,cy+0.85,gw-0.4,0.01,fill=RULE)
    if k==0:
        flow=["座標","方位","吉凶"]
        fw=0.85
        for j,f in enumerate(flow):
            fx=cx+0.2+j*(fw+0.25)
            shape(s,f"Flow {f}",fx,cy+1.0,fw,0.45,fill=ORANGE if j==2 else NAVY,geom="roundRect",paras=[para([run(f,13,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
            if j<2: shape(s,f"Flow arrow {j}",fx+fw+0.03,cy+1.1,0.19,0.25,fill=MUTED,geom="rightArrow")
        shape(s,f"Plan body {n}",cx+0.2,cy+1.6,gw-0.4,0.6,paras=bullets(b,12.5),anchor="t",inset=(0,0))
    else:
        shape(s,f"Plan body {n}",cx+0.2,cy+1.0,gw-0.4,1.2,paras=bullets(b,12.5),anchor="t",inset=(0,0))
write("slide23.xml",s,"Next")
addimg("slide23.xml","rIdG4Img3","illust_roadmap.jpg")
notes("notesSlide23.xml",[
 "最後に、これからやりたいことです。4つあります。",
 "1つ目は方位判定の完全自動化です。座標から方位を出して、吉凶まで、手作業なしで判定できるようにしたいです。",
 "2つ目は低予算でのサイト運営です。月1,000円程度で続けられる形を目指します。",
 "3つ目はCloud Paletteを育てることで、SEOとニュースを充実させていきます。",
 "4つ目はXでの発信です。これからもコツコツ続けていきます。",
 "ひとつずつ、少しずつ進めていきます。"])
print("ok")
