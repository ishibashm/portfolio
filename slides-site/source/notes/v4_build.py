
import pathlib
exec(open("/workspace/slides/self-intro-v3-DKNt2M/notes/v3_lib.py").read())
W = pathlib.Path("/workspace/slides/self-intro-v3-DKNt2M/unpacked-v4/ppt")
Slide = S
ns = {}; exec(open("/workspace/slides/self-intro-v3-DKNt2M/notes/v4_script.py").read(), ns)
SCRIPT, SRC = ns["S"], ns["SRC"]
s=Slide()
chrome(s,"②","Grok Botの使い方","用途ごとにボットを使い分けています",8)
droprels("slide22.xml")
rows=[["SEO","X投稿","YouTube","検索"],["物件情報","Second Brain","スライド作成"]]
gx, gw, gap, th = 0.6, 7.3, 0.15, 2.3
k=0
for r,row in enumerate(rows):
    n=len(row); tw=(gw-gap*(n-1))/n; y=2.05+r*(th+gap)
    for c,b in enumerate(row):
        x=gx+c*(tw+gap); last=(b=="スライド作成")
        shape(s,f"Bot tile {k}",x,y,tw,th,fill=NAVY if last else PANEL)
        shape(s,f"Bot bar {k}",x,y,tw,0.06,fill=ORANGE)
        shape(s,f"Bot icon {k}",x+(tw-0.7)/2,y+0.45,0.7,0.7,fill=ORANGE if last else NAVY,geom="ellipse",paras=[para([run("Bot",12,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
        shape(s,f"Bot name {k}",x+0.05,y+1.3,tw-0.1,0.6,paras=[para([run(b,16,True,WHITE if last else NAVY)],algn="ctr")],anchor="ctr",inset=(0,0))
        shape(s,f"Bot cap {k}",x+0.05,y+1.92,tw-0.1,0.3,paras=[para([run("ボット",11,False,WHITE if last else MUTED)],algn="ctr")],anchor="ctr",inset=(0,0))
        k+=1
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
files=[1,9,2,15,10,3,25,22,7,21,12,23,20,24]
for n,f in enumerate(files,1):
    lines=SCRIPT[n].split("\n") + ([""," "+SRC[n]] if n in SRC else [])
    notes(f"notesSlide{f}.xml",[l.strip() for l in lines])
print("v4 ok")
