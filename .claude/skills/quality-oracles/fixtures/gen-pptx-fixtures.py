#!/usr/bin/env python3
# Génération scriptée des fixtures charte-pptx-semantique (rejouable).
# Construit deux .pptx minimaux (structures XML lues par l'oracle : presentation.xml + rels,
# slides avec placeholders/positions/paragraphes, images avec a:ext, rels media).
# Rouge = 4 défauts volontaires : S1 entrée « 03 Chiffrage » sans intercalaire ; S2 kicker
# au-dessus du titre ; S3 logo sur slide de contenu ; S4 footer/pagination absents (slide 4).
# Verte = deck conforme S1-S4.
import zipfile, os, io

HERE = os.path.dirname(os.path.abspath(__file__))
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000"
                    "001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd4"
                    "0000000049454e44ae426082")

def sp(text, y, ph=None, paras=None):
    phx = f'<p:ph type="{ph}"/>' if ph else ''
    body = "".join(f"<a:p><a:r><a:t>{p}</a:t></a:r></a:p>" for p in (paras if paras is not None else [text]))
    return (f'<p:sp><p:nvSpPr>{phx}</p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="{y}"/>'
            f'<a:ext cx="8000000" cy="500000"/></a:xfrm></p:spPr><p:txBody>{body}</p:txBody></p:sp>')

def pic(cx):
    return (f'<p:pic><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="{cx}" cy="500000"/>'
            f'</a:xfrm></p:spPr></p:pic>')

def slide(shapes, imgs=0):
    return '<p:sld><p:cSpTree>' + "".join(shapes) + '</p:cSpTree></p:sld>', imgs

FTR = [lambda: sp("Digit-AI — propale", 6500000, ph="ftr"), lambda: sp("4", 6500000, ph="sldNum")]
def ftr(): return [f() for f in FTR]

def build(path, red):
    slides = []
    # 1 — couverture (logo autorisé)
    slides.append(slide([sp("Propale Digit-AI", 2000000, ph="ctrTitle")], imgs=1))
    # 2 — sommaire
    entries = ["01 Contexte", "02 Proposition"] + (["03 Chiffrage"] if red else [])
    slides.append(slide([sp("Sommaire", 500000, ph="title"), sp("", 1500000, paras=entries)] + ftr()))
    # 3 — intercalaire 01
    slides.append(slide([sp("", 2000000, paras=["01"]), sp("Contexte", 3000000)] + ftr()))
    # 4 — contenu (défauts rouges : kicker, logo, pas de footer)
    s4 = [sp("Contexte détaillé", 1000000, ph="title"), sp("Corps du slide", 2000000)]
    if red:
        s4.insert(0, sp("NOTRE CONVICTION", 400000))          # kicker au-dessus du titre
        slides.append(slide(s4, imgs=1))                      # logo sur contenu, sans footer
    else:
        slides.append(slide(s4 + ftr()))
    # 5 — intercalaire 02
    slides.append(slide([sp("", 2000000, paras=["02"]), sp("Proposition", 3000000)] + ftr()))
    # 6 — interlocuteurs (logo autorisé)
    slides.append(slide([sp("Vos interlocuteurs chez Digit-AI", 500000, ph="title")] + ftr(), imgs=1))

    z = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED)
    z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types/>')
    n = len(slides)
    rels = "".join(f'<Relationship Id="rId{i+1}" Target="slides/slide{i+1}.xml"/>' for i in range(n))
    z.writestr("ppt/_rels/presentation.xml.rels", f'<Relationships>{rels}</Relationships>')
    ids = "".join(f'<p:sldId id="{256+i}" r:id="rId{i+1}"/>' for i in range(n))
    z.writestr("ppt/presentation.xml", f'<p:presentation><p:sldIdLst>{ids}</p:sldIdLst></p:presentation>')
    z.writestr("ppt/media/image1.png", PNG)
    for i, (xml, imgs) in enumerate(slides):
        if imgs:
            xml = xml.replace("</p:cSpTree>", pic(1500000) + "</p:cSpTree>")
            z.writestr(f"ppt/slides/_rels/slide{i+1}.xml.rels",
                       '<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>')
        z.writestr(f"ppt/slides/slide{i+1}.xml", xml)
    z.close()
    print("écrit :", path)

build(os.path.join(HERE, "charte-pptx-semantique-red.pptx"), red=True)
build(os.path.join(HERE, "charte-pptx-semantique-green.pptx"), red=False)
