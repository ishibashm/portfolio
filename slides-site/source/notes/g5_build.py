# v3 g5: slides 13-14 (slide20.xml, slide24.xml) — adapted from v2 g5_build.py
exec(open("/workspace/slides/self-intro-v3-DKNt2M/notes/v3_lib.py").read())
# ---------- Slide 13 closing (slide20.xml)
s=S()
shape(s,"Navy panel",0,0,4.733,7.5,fill=NAVY)
shape(s,"Orange edge",4.733,0,0.08,7.5,fill=ORANGE)
shape(s,"Top line",4.813,0,8.52,0.12,fill=NAVY)
grid=[["4","9","2"],["3","5","7"],["8","1","6"]]
c,g=0.8,0.13; cx0=(4.733-(3*c+2*g))/2; cy0=2.2
for r,row in enumerate(grid):
    for k,v in enumerate(row):
        ctr=(r==1 and k==1)
        shape(s,f"Kyusei {v}",cx0+k*(c+g),cy0+r*(c+g),c,c,fill=ORANGE if ctr else None,line=None if ctr else WHITE,lw=1.5,
              paras=[para([run(v,22,True,WHITE)],algn="ctr")],anchor="ctr",inset=(0,0))
shape(s,"Kicker bar",5.6,2.15,0.9,0.08,fill=ORANGE)
shape(s,"Thanks",5.6,2.45,7.2,2.0,paras=[para([run("ご清聴",48,True,NAVY)],ln=110),para([run("ありがとうございました",48,True,NAVY)],ln=110)],anchor="t",inset=(0,0))
shape(s,"Closing rule",5.6,4.75,6.6,0.01,fill=RULE)
shape(s,"Closing name",5.6,4.9,6.6,0.5,paras=[para([run("石橋 真",22,True,NAVY),run("　｜　最近のあれこれ",14,False,MUTED)])],anchor="ctr",inset=(0,0))
shape(s,"Footer rule",5.6,6.95,7.133,0.01,fill=RULE)
shape(s,"Footer",5.6,7.0,5,0.35,paras=[para([run("石橋 真｜最近のあれこれ",10,False,MUTED)])],anchor="ctr",inset=(0,0))
shape(s,"Page number",10.733,7.0,2,0.35,paras=[para([run(f"13 / {TOTAL}",10,False,MUTED)],algn="r")],anchor="ctr",inset=(0,0))
write("slide20.xml",s,"Closing")
notes("notesSlide20.xml",[
 "というわけで、敦賀の話とGrok Botの話でした。",
 "敦賀のことやAIのこと、少しでも面白いと思ってもらえたらうれしいです。",
 "聞いてくださって、ありがとうございました。"])

# ---------- Slide 14 credits (slide24.xml)
s=S()
chrome(s,"","写真クレジット","この資料で使った写真と画面の出典です",14)
cols=[("スライド",1.0),("写真・画面",2.9),("作者・提供元",2.0),("ライセンス",1.75),("出典URL",4.483)]
rows=[("4","気比の松原と日本海","敦賀うまいもん","記載なし","http://tsuruga-umaimon.com/"),
      ("5","立石岬と日本原電 敦賀発電所","Alpsdake","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Tateishi_cape_and_Tsuruga_Nuclear_Power_Plant.jpg"),
      ("6","敦賀赤レンガ倉庫","Asturio Cantabrio","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Tsuruga_Red_Brick_Warehouce_ac_(1).jpg"),
      ("6","敦賀駅 北陸新幹線ホーム","Suikotei","CC BY 4.0","https://commons.wikimedia.org/wiki/File:Tsuruga_Station_Hokuriku_Shinkansen_Platform_01.jpg"),
      ("10","Cloud Palette の画面","自作サイト","—","https://cloud-palette.com/")]
y=2.0; x=0.6
for name,w in cols:
    shape(s,f"Head {name}",x,y,w,0.45,fill=NAVY,line=WHITE,paras=[para([run(name,13,True,WHITE)])],anchor="ctr",inset=(0.12,0))
    x+=w
y+=0.45; rh=0.68
for i,row in enumerate(rows):
    x=0.6
    for j,(val,(name,w)) in enumerate(zip(row,cols)):
        sz = 9.5 if j==4 else 13
        shape(s,f"Cell {i}-{j}",x,y,w,rh,fill=PANEL if i%2==0 else WHITE,line=RULE,
              paras=[para([run(val,sz,j==1,NAVY if j in (0,1) else TEXT)],algn="ctr" if j==0 else "l",ln=100)],anchor="ctr",inset=(0.12,0.04))
        x+=w
    y+=rh
shape(s,"Credit note",0.6,y+0.15,12.133,0.85,paras=[
    para([run("※ Wikimedia Commons の写真は、各ライセンス（CC BY / CC BY-SA）の条件に従って使用しています。",11,False,MUTED)],ln=100,spc_after=3),
    para([run("※ スライド4の写真は敦賀うまいもん（tsuruga-umaimon.com）のものです。出典元にライセンスの記載はありません。",11,False,MUTED)],ln=100,spc_after=3),
    para([run("※ イラスト：AIで生成",11,False,MUTED)],ln=100)],anchor="t",inset=(0,0))
write("slide24.xml",s,"Credits")
notes("notesSlide24.xml",[
 "最後に、資料で使わせてもらった写真と画面の出典です。",
 "Wikimedia Commonsの写真は、それぞれのライセンス条件に従って使っています。気比の松原の写真は敦賀うまいもんさんのものです。",
 "Cloud Paletteの画面は自分のサイトのもので、イラストはAIで生成しました。"])
print("g5 ok")
