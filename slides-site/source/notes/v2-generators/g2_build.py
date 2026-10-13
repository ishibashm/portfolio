import shutil
src = open("/workspace/slides/self-intro-v2-gNCCvj/notes/g1_build.py").read().split("# ---------- Slide 1")[0]
exec(src)
from PIL import Image
A = "/workspace/slides/self-intro-assets/"
def photo(s, slide, rid, fname, x,y,w,h, descr):
    iw, ih = Image.open(A+fname).size
    r_img, r_box = iw/ih, w/h
    l=t=0
    if r_img > r_box: l = int((1 - r_box/r_img)/2*100000)
    else: t = int((1 - r_img/r_box)/2*100000)
    i=s.nid()
    s.items.append(f'<p:pic><p:nvPicPr><p:cNvPr id="{i}" name="Photo {fname}" descr="{escape(descr)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
        f'<p:blipFill><a:blip r:embed="{rid}"/><a:srcRect l="{l}" t="{t}" r="{l}" b="{t}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        f'<p:spPr><a:xfrm><a:off x="{e(x)}" y="{e(y)}"/><a:ext cx="{e(w)}" cy="{e(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')
    media = "g2_" + fname.replace(".jpg", ".jpeg")
    shutil.copy(A+fname, W/"media"/media)
    rp=W/"slides/_rels"/f"{slide}.rels"; rx=rp.read_text()
    if f'Id="{rid}"' not in rx:
        rp.write_text(rx.replace("</Relationships>",f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/{media}"/></Relationships>'))
def credit(s, x,y,w,h, subj, author, lic):
    shape(s,"Credit",x,y,w,h,paras=[para([run(f"写真：{subj}｜{author} / {lic} / Wikimedia Commons",9,False,MUTED)],ln=100)],anchor="t",inset=(0,0.02))

# ---------- Slide 4 (slide15.xml)
s=S()
chrome(s,"02","出身地・福井県敦賀市","日本海・敦賀湾に面した嶺南最大のまち。2024年には北陸新幹線がつながりました",4)
lx, lw = 0.6, 6.0
tiles=[("約6万人","人口（嶺南地方で最多）"),("敦賀湾","日本海に面した港町"),("2024.3","北陸新幹線 敦賀開業")]
tw=(lw-0.3)/3
for k,(big,lab) in enumerate(tiles):
    tx=lx+k*(tw+0.15)
    shape(s,f"KPI box {k}",tx,2.05,tw,1.3,fill=PANEL)
    shape(s,f"KPI bar {k}",tx,2.05,0.06,1.3,fill=ORANGE)
    shape(s,f"KPI num {k}",tx+0.15,2.15,tw-0.2,0.65,paras=[para([run(big,26,True,ORANGE)])],anchor="ctr",inset=(0,0))
    shape(s,f"KPI label {k}",tx+0.15,2.82,tw-0.2,0.45,paras=[para([run(lab,12,True,NAVY)])],anchor="t",inset=(0,0))
pts=[("日本海・敦賀湾に面するまち","福井県嶺南地方にあり、嶺南で人口が最も多い市"),
     ("人口 59,913人","推計人口（2026年9月1日）。おおよそ6万人のまち"),
     ("気比の松原（けひのまつばら）","敦賀湾に臨む松原。日本三大松原の一つで、国の名勝"),
     ("北陸新幹線 敦賀開業","2024年3月16日、金沢–敦賀間が延伸開業。敦賀駅が終着駅")]
y=3.6
for k,(hd,sub) in enumerate(pts):
    shape(s,f"Point dot {k}",lx,y+0.08,0.16,0.16,fill=NAVY,geom="ellipse")
    shape(s,f"Point head {k}",lx+0.3,y,lw-0.3,0.34,paras=[para([run(hd,15,True,NAVY)])],anchor="t",inset=(0,0))
    shape(s,f"Point sub {k}",lx+0.3,y+0.36,lw-0.3,0.34,paras=[para([run(sub,12.5,False,TEXT)])],anchor="t",inset=(0,0))
    if k<3: shape(s,f"Point rule {k}",lx+0.3,y+0.76,lw-0.3,0.01,fill=RULE)
    y+=0.82
px, pw = 6.9, 5.833
ph = 3.9
rp=W/"slides/_rels/slide15.xml.rels"; rp.write_text(re.sub(r'<Relationship Id="rIdG2Hero"[^>]*/>',"",rp.read_text()))
(W/"media/g2_tsuruga_kehi_matsubara.jpeg").unlink(missing_ok=True)
photo(s,"slide15.xml","rIdG2Hero2","kehi_matsubara_user.jpg",px,2.05,pw,ph,"気比の松原と日本海")
shape(s,"Photo label",px,2.05+ph-0.45,2.9,0.45,fill=NAVY,paras=[para([run("気比の松原と日本海",13,True,WHITE)])],anchor="ctr",inset=(0.15,0))
shape(s,"Credit",px,2.05+ph+0.05,pw,0.3,paras=[para([run("写真：気比の松原と日本海｜出典：敦賀うまいもん（tsuruga-umaimon.com）",9,False,MUTED)],ln=100)],anchor="t",inset=(0,0.02))
shape(s,"Source note",px,6.5,pw,0.3,paras=[para([run("出典：Wikipedia「敦賀市」（2026年10月13日参照）",9,False,MUTED)],algn="r")],anchor="t",inset=(0,0))
write("slide15.xml",s,"Tsuruga")
notes("notesSlide15.xml",[
 "出身地の話を少しだけ。福井県の敦賀市というところです。",
 "敦賀市は日本海の敦賀湾に面していて、福井県の嶺南地方では人口が一番多い市です。人口は約6万人、2026年9月1日の推計で59,913人です。",
 "写真は気比の松原です。日本三大松原の一つで、国の名勝にもなっているそうです。",
 "2024年3月16日には北陸新幹線が金沢から敦賀まで延伸開業し、敦賀駅が終着駅になりました。",
 "出典：https://ja.wikipedia.org/wiki/敦賀市 ／ 写真：敦賀うまいもん http://tsuruga-umaimon.com/"])

# ---------- Slide 5 (slide3.xml)
s=S()
chrome(s,"02","敦賀のあれこれ","エネルギー、港の歴史、鉄道、そして食。敦賀にはいくつもの顔があります",5)
cols=[("rIdG2P1","tsuruga_nuclear_power_plant.jpg","立石岬と日本原電 敦賀発電所","Alpsdake","CC BY-SA 4.0","エネルギー・原子力",
       ["1970年3月、日本原子力発電 敦賀発電所1号機（沸騰水型軽水炉）が運転開始","大阪万博の会場へ送電","高速増殖炉「もんじゅ」、旧「ふげん」などの施設も市内に"]),
      ("rIdG2P2","tsuruga_red_brick_warehouse.jpg","敦賀赤レンガ倉庫","Asturio Cantabrio","CC BY-SA 4.0","人道の港",
       ["1920–21年、ポーランド孤児が敦賀に上陸","1940年、杉原千畝「命のビザ」のユダヤ難民が敦賀港へ上陸"]),
      ("rIdG2P3","tsuruga_station_shinkansen.jpg","敦賀駅 北陸新幹線ホーム","Suikotei","CC BY 4.0","鉄道の玄関口",
       ["1912年から欧亜国際連絡列車の日本側の玄関口","2024年3月16日、北陸新幹線 金沢–敦賀間が延伸開業","敦賀駅が北陸新幹線の終着駅に"])]
cw=(12.133-0.5)/3
for k,(rid,f,subj,au,lic,hd,bul) in enumerate(cols):
    x=0.6+k*(cw+0.25)
    photo(s,"slide3.xml",rid,f,x,2.0,cw,1.85,subj)
    credit(s,x,3.88,cw,0.36,subj,au,lic)
    shape(s,f"Col num {k}",x,4.28,0.5,0.38,fill=NAVY,paras=[para([run(f"{k+1:02d}",13,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
    shape(s,f"Col head {k}",x+0.6,4.28,cw-0.6,0.38,paras=[para([run(hd,16,True,NAVY)])],anchor="ctr",inset=(0,0))
    shape(s,f"Col rule {k}",x,4.72,cw,0.02,fill=ORANGE)
    shape(s,f"Col body {k}",x,4.8,cw,1.2,paras=[para([run("・"+b,12,False,TEXT)],ln=105,spc_after=2) for b in bul],anchor="t",inset=(0,0))
shape(s,"Food band",0.6,6.08,12.133,0.74,fill=PANEL)
shape(s,"Food label",0.6,6.08,1.5,0.74,fill=ORANGE,paras=[para([run("名産・食",14,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Food text",2.25,6.08,10.4,0.74,paras=[
    para([run("加工昆布",13,True,NAVY),run("　おぼろ昆布・とろろ昆布など、全国の8割超を生産（おぼろ昆布製造技術は2025年 国の登録無形民俗文化財）",12,False,TEXT)],ln=100),
    para([run("へしこ・敦賀ラーメン",13,True,NAVY),run("　へしこ、屋台の「敦賀ラーメン」も敦賀の名物",12,False,TEXT)],ln=100)],anchor="ctr",inset=(0.05,0))
write("slide3.xml",s,"Tsuruga more")
notes("notesSlide3.xml",[
 "敦賀について、ちょっとした豆知識をいくつか。",
 "まずエネルギーの面です。1970年3月に日本原子力発電の敦賀発電所1号機が運転を始め、大阪万博の会場に送電しました。市内には高速増殖炉もんじゅや、旧ふげんなどの施設もあります。",
 "次に人道の港です。1920年から21年にかけてポーランドの孤児が、1940年には杉原千畝の命のビザを持ったユダヤ難民が敦賀港に上陸しました。",
 "鉄道では、1912年から欧亜国際連絡列車の日本側の玄関口で、今は北陸新幹線の終着駅です。",
 "食べ物では、おぼろ昆布やとろろ昆布などの加工昆布が全国の8割以上を占めます。へしこや敦賀ラーメンも名物です。",
 "出典：https://ja.wikipedia.org/wiki/敦賀市",
 "写真：https://commons.wikimedia.org/wiki/File:Tateishi_cape_and_Tsuruga_Nuclear_Power_Plant.jpg（Alpsdake, CC BY-SA 4.0）／https://commons.wikimedia.org/wiki/File:Tsuruga_Red_Brick_Warehouce_ac_(1).jpg（Asturio Cantabrio, CC BY-SA 4.0）／https://commons.wikimedia.org/wiki/File:Tsuruga_Station_Hokuriku_Shinkansen_Platform_01.jpg（Suikotei, CC BY 4.0）"])
print("ok")
