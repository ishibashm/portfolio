# v3 g4: slides 10-12 (slide21.xml, slide12.xml, slide23.xml) — adapted from v2 g3/g4_build.py
exec(open("/workspace/slides/self-intro-v3-DKNt2M/notes/v3_lib.py").read())
# ---------- Slide 10 (slide21.xml) Cloud Palette: screenshot hero
s=S()
chrome(s,"②","Cloud Palette","引越しの方位とタイミングを決める ― 九星気学・方位・暦をWebで扱う個人開発サイト",10)
droprels("slide21.xml")
addrel("slide21.xml","rIdCPLink","https://cloud-palette.com/",kind="hyperlink",external=True)
lx, lw = 0.6, 4.55
shape(s,"Brand",lx,1.95,lw,0.65,paras=[para([run("Cloud Palette",32,True,NAVY)])],anchor="ctr",inset=(0,0))
shape(s,"URL",lx,2.6,lw,0.4,paras=[para([linkrun("https://cloud-palette.com/",15,"rIdCPLink")])],anchor="ctr",inset=(0,0))
shape(s,"Feat head",lx,3.15,lw,0.36,paras=[para([run("主な機能",14,True,NAVY)])],anchor="ctr",inset=(0,0))
y=3.55
for k,t in enumerate(["方位で街を探す","引越し先を試算","本命星と吉方位","風水（八宅）"]):
    shape(s,f"Feat box {k}",lx,y,lw,0.52,fill=PANEL)
    shape(s,f"Feat mark {k}",lx,y,0.08,0.52,fill=ORANGE)
    shape(s,f"Feat text {k}",lx+0.25,y,lw-0.35,0.52,paras=[para([run(t,15,True,TEXT)])],anchor="ctr",inset=(0,0))
    y+=0.6
shape(s,"Tech label",lx,6.05,0.9,0.7,fill=NAVY,paras=[para([run("技術",12,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Tech text",lx+1.0,6.05,lw-1.0,0.7,paras=[para([run("Next.js・React・TypeScript・",12,False,TEXT)],ln=100),para([run("Supabase・Vercel・Google Cloud",12,False,TEXT)],ln=100)],anchor="ctr",inset=(0,0))
rx0=5.45
mw=4.9; mh=mw*640/1024
photo(s,"slide21.xml","rIdCPTop","cp_top.png",rx0,2.05,mw,mh,"Cloud Palette トップ画面",prefix="g4",border=True)
sw=12.733-(rx0+mw+0.15); sh=sw*640/1024
photo(s,"slide21.xml","rIdCPF1","cp_feature1.png",rx0+mw+0.15,2.05,sw,sh,"Cloud Palette 機能画面1",prefix="g4",border=True)
photo(s,"slide21.xml","rIdCPF2","cp_feature2.png",rx0+mw+0.15,2.05+sh+0.15,sw,sh,"Cloud Palette 機能画面2",prefix="g4",border=True)
shape(s,"Shot credit",rx0,2.05+mh+0.05,7.283,0.28,paras=[para([run("画面：自作サイト（cloud-palette.com）",9,False,MUTED)])],anchor="t",inset=(0,0.02))
ty=5.55
shape(s,"Tags heading",rx0,ty,2.0,0.35,paras=[para([run("最近の追加",13,True,NAVY)])],anchor="ctr",inset=(0,0))
tw=(7.283-0.15)/2
for k,t in enumerate(["MCPサーバー","ニュース"]):
    tx=rx0+k*(tw+0.15)
    shape(s,f"Tag box {k}",tx,ty+0.45,tw,0.75,fill=None,line=RULE)
    shape(s,f"Tag badge {k}",tx+0.2,ty+0.65,0.8,0.35,fill=ORANGE,geom="roundRect",paras=[para([run("NEW",11,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
    shape(s,f"Tag text {k}",tx+1.15,ty+0.45,tw-1.25,0.75,paras=[para([run(t,16,True,NAVY)])],anchor="ctr",inset=(0,0))
write("slide21.xml",s,"Cloud Palette")
notes("notesSlide21.xml",[
 "個人開発しているCloud Paletteです。URLは https://cloud-palette.com/ です。",
 "キャッチコピーは「引越しの方位とタイミングを決める」。九星気学や方位、暦をWebで扱えるサイトです。",
 "主な機能は、方位で街を探す、引越し先を試算する、本命星と吉方位、風水の八宅です。",
 "最近、AIから使えるMCPサーバーとニュースのページを追加しました。",
 "技術はNext.js、React、TypeScript、Supabase、Vercel、Google Cloudです。",
 "画面：自作サイト https://cloud-palette.com/"])

# ---------- Slide 11 (slide12.xml) second brain
s=S()
chrome(s,"②","second brain","約800件のAIとの会話をObsidianに集約し、AIからも探せるようにしました",11)
droprels("slide12.xml")
lx, lw = 0.6, 7.0
steps=[("集約","約800件のAIとの会話をObsidianに集約"),("自動分類","トピックごとに、自動で分類する"),("AI要約","それぞれの会話を、AIが要約する"),("検索用MCP","AIからも、過去の会話を検索できる")]
y=2.05; rh=0.95
for k,(lab,t) in enumerate(steps):
    shape(s,f"Step box {k}",lx,y,lw,rh,fill=PANEL)
    shape(s,f"Step lab {k}",lx,y,1.9,rh,fill=ORANGE if k==0 else NAVY,paras=[para([run(lab,16,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0.05,0))
    shape(s,f"Step text {k}",lx+2.15,y,lw-2.3,rh,paras=[para([run(t,16,True,TEXT)])],anchor="ctr",inset=(0,0))
    if k<3: shape(s,f"Step arrow {k}",lx+0.8,y+rh+0.02,0.3,0.2,fill=MUTED,geom="downArrow")
    y+=rh+0.24
ix, iw = 7.95, 4.783
ih = iw*720/1280
pic(s,"Illust second brain","rIdG4Img2",ix,2.05,iw,ih,"second brainのイラスト")
by=2.05+ih+0.2
shape(s,"Metric box",ix,by,iw,6.82-by,fill=NAVY)
shape(s,"Metric num",ix+0.25,by+0.15,3.0,1.0,paras=[para([run("約800",40,True,ORANGE),run("件",18,True,WHITE)])],anchor="ctr",inset=(0,0))
shape(s,"Metric label",ix+3.3,by+0.15,iw-3.45,1.0,paras=[para([run("AIとの会話を",13,True,WHITE)],ln=100),para([run("ひとつの場所に",13,True,WHITE)],ln=100)],anchor="ctr",inset=(0,0))
shape(s,"Metric rule",ix+0.25,by+1.25,iw-0.5,0.01,fill=ORANGE)
shape(s,"Metric sub",ix+0.25,by+1.32,iw-0.5,0.55,paras=[para([run("Grok Bot・Claude・Gemini・AI Studio・ChatGPT",11.5,True,WHITE)])],anchor="ctr",inset=(0,0))
write("slide12.xml",s,"Second brain")
addrel("slide12.xml","rIdG4Img2","../media/"+media("illust_second_brain.jpg","g4"))
notes("notesSlide12.xml",[
 "最近つくったのが、second brain、第二の脳です。",
 "Grok Bot、Claude、Gemini、AI Studio、ChatGPTなど、AIとの会話が約800件たまっていたので、Obsidianに集約しました。",
 "トピックを自動で分類して、AIが要約し、検索用のMCPでAIからも過去の会話を探せるようにしています。"])

# ---------- Slide 12 (slide23.xml) これからやりたいこと (reuse)
s=S()
chrome(s,"","これからやりたいこと","自動化と低予算運営でサービスを育て、発信も続けていきます",12)
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
cards=[("01","方位判定の完全自動化",["判定を手作業なしで回す"]),
       ("02","低予算でサイト運営",["月1,000円程度で運営を続ける"]),
       ("03","Cloud Paletteを育てる",["SEOを強化する","ニュースページを充実させる"]),
       ("04","Xでの発信を続ける",["発信をコツコツ続ける"])]
gx, gw, gh = 5.5, (12.733-5.5-0.25)/2, 2.3
for k,(n,t,b) in enumerate(cards):
    cx=gx+(k%2)*(gw+0.25); cy=2.05+(k//2)*(gh+0.17)
    shape(s,f"Plan card {n}",cx,cy,gw,gh,fill=WHITE,line=RULE)
    shape(s,f"Plan bar {n}",cx,cy,gw,0.06,fill=NAVY)
    shape(s,f"Plan num {n}",cx+0.2,cy+0.2,0.7,0.55,paras=[para([run(n,26,True,ORANGE)])],anchor="ctr",inset=(0,0))
    shape(s,f"Plan title {n}",cx+0.95,cy+0.2,gw-1.05,0.55,paras=[para([run(t,14.5,True,NAVY)])],anchor="ctr",inset=(0,0))
    shape(s,f"Plan rule {n}",cx+0.2,cy+0.85,gw-0.4,0.01,fill=RULE)
    if k==0:
        fw=0.85
        for j,f in enumerate(["座標","方位","吉凶"]):
            fx=cx+0.2+j*(fw+0.25)
            shape(s,f"Flow {f}",fx,cy+1.0,fw,0.45,fill=ORANGE if j==2 else NAVY,geom="roundRect",paras=[para([run(f,13,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
            if j<2: shape(s,f"Flow arrow {j}",fx+fw+0.03,cy+1.1,0.19,0.25,fill=MUTED,geom="rightArrow")
        shape(s,f"Plan body {n}",cx+0.2,cy+1.6,gw-0.4,0.6,paras=bullets(b,12.5),anchor="t",inset=(0,0))
    else:
        shape(s,f"Plan body {n}",cx+0.2,cy+1.0,gw-0.4,1.2,paras=bullets(b,12.5),anchor="t",inset=(0,0))
write("slide23.xml",s,"Next")
notes("notesSlide23.xml",[
 "最後に、これからやりたいことです。4つあります。",
 "1つ目は方位判定の完全自動化です。座標から方位を出して、吉凶まで、手作業なしで判定できるようにしたいです。",
 "2つ目は低予算でのサイト運営です。月1,000円程度で続けられる形を目指します。",
 "3つ目はCloud Paletteを育てることで、SEOとニュースを充実させていきます。",
 "4つ目はXでの発信です。これからもコツコツ続けていきます。"])
print("g4 ok")
