# v3 g2: slides 4-6 (slide15.xml, slide10.xml, slide3.xml) — adapted from v2 g2/g3_build.py
exec(open("/workspace/slides/self-intro-v3-DKNt2M/notes/v3_lib.py").read())
WP="https://ja.wikipedia.org/wiki/敦賀市"
# ---------- Slide 4 (slide15.xml)
s=S()
chrome(s,"①","出身地・福井県敦賀市","日本海・敦賀湾に面した嶺南最大のまち。2024年には北陸新幹線がつながりました",4)
droprels("slide15.xml")
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
px, pw, ph = 6.9, 5.833, 3.9
photo(s,"slide15.xml","rIdG2Hero2","kehi_matsubara_user.jpg",px,2.05,pw,ph,"気比の松原と日本海",prefix="g2")
shape(s,"Photo label",px,2.05+ph-0.45,2.9,0.45,fill=NAVY,paras=[para([run("気比の松原と日本海",13,True,WHITE)])],anchor="ctr",inset=(0.15,0))
shape(s,"Credit",px,2.05+ph+0.05,pw,0.3,paras=[para([run("写真：気比の松原と日本海｜出典：敦賀うまいもん（tsuruga-umaimon.com）",9,False,MUTED)],ln=100)],anchor="t",inset=(0,0.02))
shape(s,"Source note",px,6.5,pw,0.3,paras=[para([run("出典：Wikipedia「敦賀市」（2026年10月13日参照）",9,False,MUTED)],algn="r")],anchor="t",inset=(0,0))
write("slide15.xml",s,"Tsuruga")
notes("notesSlide15.xml",[
 "ここから1つ目のテーマ、出身地の福井県敦賀市です。",
 "敦賀市は日本海の敦賀湾に面していて、福井県の嶺南地方では人口が一番多い市です。人口は約6万人、2026年9月1日の推計で59,913人です。",
 "写真は気比の松原です。日本三大松原の一つで、国の名勝にもなっています。",
 "2024年3月16日には北陸新幹線が金沢から敦賀まで延伸開業し、敦賀駅が終着駅になりました。",
 "出典："+WP+" ／ 写真：敦賀うまいもん http://tsuruga-umaimon.com/"])

# ---------- Slide 5 (slide10.xml) 敦賀と原発: big photo + 3-point timeline
s=S()
chrome(s,"①","敦賀と原発","1970年に敦賀発電所1号機が運転開始。市内には「もんじゅ」や旧「ふげん」などの施設もあります",5)
droprels("slide10.xml")
px, py, pw, ph = 0.6, 2.05, 7.3, 4.45
photo(s,"slide10.xml","rIdG2NP","tsuruga_nuclear_power_plant.jpg",px,py,pw,ph,"立石岬と日本原電 敦賀発電所",prefix="g2")
shape(s,"Photo label",px,py+ph-0.45,3.6,0.45,fill=NAVY,paras=[para([run("立石岬と日本原電 敦賀発電所",13,True,WHITE)])],anchor="ctr",inset=(0.15,0))
credit(s,px,py+ph+0.05,pw,0.3,"立石岬と日本原電 敦賀発電所","Alpsdake","CC BY-SA 4.0")
tx, tw = 8.3, 4.433
shape(s,"TL head",tx,2.05,tw,0.42,fill=NAVY,paras=[para([run("敦賀と原子力のあゆみ",14,True,WHITE)])],anchor="ctr",inset=(0.2,0))
shape(s,"TL line",tx+0.27,2.85,0.04,3.1,fill=RULE)
tl=[("1970年3月","敦賀発電所1号機 運転開始",["日本原子力発電／沸騰水型軽水炉","大阪万博の会場へ送電"]),
    ("1994年","高速増殖炉「もんじゅ」初臨界",["敦賀市内にある施設"]),
    ("ほかにも","旧「ふげん」などの施設も",[])]
y=2.7
for k,(when,hd,sub) in enumerate(tl):
    shape(s,f"TL dot {k}",tx+0.14,y+0.08,0.3,0.3,fill=ORANGE if k==0 else NAVY,geom="ellipse")
    shape(s,f"TL when {k}",tx+0.6,y,tw-0.6,0.42,paras=[para([run(when,18,True,ORANGE)])],anchor="ctr",inset=(0,0))
    shape(s,f"TL title {k}",tx+0.6,y+0.45,tw-0.6,0.38,paras=[para([run(hd,15,True,NAVY)])],anchor="t",inset=(0,0))
    if sub: shape(s,f"TL sub {k}",tx+0.6,y+0.83,tw-0.6,0.5,paras=[para([run(b,12,False,TEXT)],ln=100) for b in sub],anchor="t",inset=(0,0))
    y+=1.32
shape(s,"Source note",tx,6.6,tw,0.25,paras=[para([run("出典：Wikipedia「敦賀市」（2026年10月13日参照）",9,False,MUTED)],algn="r")],anchor="t",inset=(0,0))
write("slide10.xml",s,"Tsuruga nuclear")
notes("notesSlide10.xml",[
 "敦賀と原発について、事実だけ簡単に紹介します。",
 "1970年3月に、日本原子力発電の敦賀発電所1号機が運転を始めました。沸騰水型軽水炉で、大阪万博の会場に送電したそうです。",
 "市内には高速増殖炉の「もんじゅ」があり、1994年に初臨界を迎えています。旧「ふげん」などの施設もあります。",
 "出典："+WP,
 "写真：https://commons.wikimedia.org/wiki/File:Tateishi_cape_and_Tsuruga_Nuclear_Power_Plant.jpg（Alpsdake, CC BY-SA 4.0）"])

# ---------- Slide 6 (slide3.xml) 敦賀のあれこれ: 3 columns, no nuclear
s=S()
chrome(s,"①","敦賀のあれこれ","港の歴史、鉄道、そして名産。敦賀にはいくつもの顔があります",6)
droprels("slide3.xml")
cols=[("rIdG2P2","tsuruga_red_brick_warehouse.jpg","敦賀赤レンガ倉庫","Asturio Cantabrio","CC BY-SA 4.0","人道の港",
       ["1920–21年、ポーランド孤児が敦賀に上陸","1940年、杉原千畝「命のビザ」のユダヤ難民が敦賀港へ上陸"]),
      ("rIdG2P3","tsuruga_station_shinkansen.jpg","敦賀駅 北陸新幹線ホーム","Suikotei","CC BY 4.0","鉄道と新幹線",
       ["1912年から欧亜国際連絡列車の日本側の玄関口","2024年3月16日、北陸新幹線 金沢–敦賀間が延伸開業。敦賀駅が終着駅に"]),
      (None,None,None,None,None,"名産",
       ["おぼろ昆布・とろろ昆布など、昆布加工で全国の80%以上を生産","おぼろ昆布製造技術は2025年3月28日、国の登録無形民俗文化財に","へしこ、屋台の「敦賀ラーメン」も"])]
cw=(12.133-0.5)/3
for k,(rid,f,subj,au,lic,hd,bul) in enumerate(cols):
    x=0.6+k*(cw+0.25)
    if f:
        photo(s,"slide3.xml",rid,f,x,2.0,cw,2.2,subj,prefix="g2")
        credit(s,x,4.23,cw,0.36,subj,au,lic)
    else:
        shape(s,"Kombu tile",x,2.0,cw,2.2,fill=NAVY)
        shape(s,"Kombu big",x+0.3,2.2,cw-0.6,1.1,paras=[para([run("80",60,True,ORANGE),run("%以上",28,True,ORANGE)])],anchor="ctr",inset=(0,0))
        shape(s,"Kombu rule",x+0.3,3.35,cw-0.6,0.02,fill=ORANGE)
        shape(s,"Kombu label",x+0.3,3.45,cw-0.6,0.6,paras=[para([run("昆布加工の全国生産シェア",15,True,WHITE)])],anchor="ctr",inset=(0,0))
        shape(s,"Kombu src",x,4.23,cw,0.36,paras=[para([run("出典：Wikipedia「敦賀市」（2026年10月13日参照）",9,False,MUTED)],ln=100)],anchor="t",inset=(0,0.02))
    shape(s,f"Col bar {k}",x,4.65,0.08,0.42,fill=ORANGE)
    shape(s,f"Col head {k}",x+0.2,4.65,cw-0.2,0.42,paras=[para([run(hd,17,True,NAVY)])],anchor="ctr",inset=(0,0))
    shape(s,f"Col rule {k}",x,5.15,cw,0.01,fill=RULE)
    shape(s,f"Col body {k}",x,5.25,cw,1.6,paras=[para([run("・"+b,13,False,TEXT)],ln=105,spc_after=3) for b in bul],anchor="t",inset=(0,0))
write("slide3.xml",s,"Tsuruga more")
notes("notesSlide3.xml",[
 "敦賀について、ちょっとした豆知識をいくつか。",
 "まず人道の港です。1920年から21年にかけてポーランドの孤児が、1940年には杉原千畝の命のビザを持ったユダヤ難民が敦賀港に上陸しました。",
 "鉄道では、1912年から欧亜国際連絡列車の日本側の玄関口でした。いまは北陸新幹線の終着駅です。",
 "名産では、おぼろ昆布やとろろ昆布などの加工昆布が全国の8割以上を占めます。おぼろ昆布の製造技術は2025年に国の登録無形民俗文化財になりました。へしこや屋台の敦賀ラーメンも名物です。",
 "出典："+WP,
 "写真：https://commons.wikimedia.org/wiki/File:Tsuruga_Red_Brick_Warehouce_ac_(1).jpg（Asturio Cantabrio, CC BY-SA 4.0）／https://commons.wikimedia.org/wiki/File:Tsuruga_Station_Hokuriku_Shinkansen_Platform_01.jpg（Suikotei, CC BY 4.0）"])
print("g2 ok")
