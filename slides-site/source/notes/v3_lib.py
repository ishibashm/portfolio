import re, shutil, pathlib
from xml.sax.saxutils import escape
W = pathlib.Path("/workspace/slides/self-intro-v3-DKNt2M/unpacked/ppt")
E = 914400
NAVY, ORANGE, TEXT, MUTED, PANEL, RULE, WHITE = "1F3A5F","F28C28","222222","666666","F3F5F8","D0D7E2","FFFFFF"
FONT = "BIZ UDPGothic"
TOTAL = 14
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


from PIL import Image
A = "/workspace/slides/self-intro-assets/"
def bullets(lst, sz=12, c=TEXT):
    return [para([run("・"+b,sz,False,c)],ln=105,spc_after=3) for b in lst]
def addrel(slide, rid, target, kind="image", external=False):
    rp=W/"slides/_rels"/f"{slide}.rels"; rx=rp.read_text()
    rx=re.sub(rf'<Relationship Id="{rid}"[^>]*/>',"",rx)
    tm=' TargetMode="External"' if external else ''
    rp.write_text(rx.replace("</Relationships>",f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}" Target="{target}"{tm}/></Relationships>'))
def droprels(slide, keep=("slideLayout","notesSlide")):
    rp=W/"slides/_rels"/f"{slide}.rels"; rx=rp.read_text()
    rx=re.sub(r'<Relationship [^>]*/>', lambda m: m.group(0) if any(k in m.group(0) for k in keep) else "", rx)
    rp.write_text(rx)
def media(fname, prefix):
    m = prefix + "_" + fname.replace(".jpg",".jpeg")
    shutil.copy(A+fname, W/"media"/m); return m
def photo(s, slide, rid, fname, x,y,w,h, descr, prefix="v3", border=False):
    iw, ih = Image.open(A+fname).size
    r_img, r_box = iw/ih, w/h
    l=t=0
    if r_img > r_box: l = int((1 - r_box/r_img)/2*100000)
    else: t = int((1 - r_img/r_box)/2*100000)
    i=s.nid()
    ln = f'<a:ln w="9525"><a:solidFill><a:srgbClr val="{RULE}"/></a:solidFill></a:ln>' if border else ''
    s.items.append(f'<p:pic><p:nvPicPr><p:cNvPr id="{i}" name="Photo {fname}" descr="{escape(descr)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
        f'<p:blipFill><a:blip r:embed="{rid}"/><a:srcRect l="{l}" t="{t}" r="{l}" b="{t}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        f'<p:spPr><a:xfrm><a:off x="{e(x)}" y="{e(y)}"/><a:ext cx="{e(w)}" cy="{e(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>{ln}</p:spPr></p:pic>')
    addrel(slide, rid, "../media/"+media(fname, prefix))
def credit(s, x,y,w,h, subj, author, lic, algn="l"):
    shape(s,"Credit",x,y,w,h,paras=[para([run(f"写真：{subj}｜{author} / {lic} / Wikimedia Commons",9,False,MUTED)],algn=algn,ln=100)],anchor="t",inset=(0,0.02))
def linkrun(t, sz, rid, b=True, c=ORANGE):
    return (f'<a:r><a:rPr lang="en-US" altLang="ja-JP" sz="{int(sz*100)}" b="{1 if b else 0}" u="sng" dirty="0">'
            f'<a:solidFill><a:srgbClr val="{c}"/></a:solidFill><a:latin typeface="{FONT}"/><a:ea typeface="{FONT}"/><a:cs typeface="{FONT}"/><a:hlinkClick r:id="{rid}"/></a:rPr>'
            f'<a:t>{escape(t)}</a:t></a:r>')
