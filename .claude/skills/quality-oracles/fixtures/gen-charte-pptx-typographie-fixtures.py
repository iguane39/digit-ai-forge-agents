#!/usr/bin/env python3
# Génération scriptée des fixtures S8 (typographie française aux coupures de ligne)
# d'oracle-charte-pptx-semantique (TF-1384, retours Produit-68 du 26/09/2026, RG-16). Tout est FICTIF.
#
# LE FAIT. Sur une présentation, des deux-points ouvraient une ligne, « (point » finissait une ligne et
# « 4) » ouvrait la suivante, un titre se coupait entre « chapitre » et « 4 » : deux remises remplacées
# le même jour pour la typographie seule, et aucune règle ne parlait de l'espace insécable. Les decks :
#   charte-pptx-typographie-red.pptx    espaces ORDINAIRES devant « : » et « ? », dans « », entre
#                                       « chapitre » et « 4 », entre « septembre » et « 2026 » ;
#   charte-pptx-typographie-green.pptx  le même texte, espaces INSÉCABLES (U+00A0) et fine (U+202F).
# S8 est un AVERTISSEMENT : les deux decks rendent PASS, seule la rouge porte le constat S8.
# Rejouable : python -B gen-charte-pptx-typographie-fixtures.py (bibliothèque standard seule).
import os
import zipfile

ICI = os.path.dirname(os.path.abspath(__file__))
DATE_ZIP = (2026, 10, 13, 0, 0, 0)
NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
HAUTEUR = 6858000
NBSP, FINE = " ", " "


def forme(paras, y, ph=None, cx=9000000):
    phx = f'<p:ph type="{ph}"/>' if ph else ''
    corps = "".join(f'<a:p><a:r><a:t>{t}</a:t></a:r></a:p>' for t in paras)
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="Forme"/><p:cNvSpPr/><p:nvPr>{phx}</p:nvPr></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="457200" y="{y}"/><a:ext cx="{cx}" cy="500000"/></a:xfrm></p:spPr>'
            f'<p:txBody><a:bodyPr/>{corps}</p:txBody></p:sp>')


def pieds(n):
    return [forme(["Digit-AI · support fictif"], HAUTEUR - 450000, ph="ftr", cx=6000000),
            forme([str(n)], HAUTEUR - 450000, ph="sldNum", cx=600000)]


def construire(chemin, rouge):
    e, f = (" ", " ") if rouge else (NBSP, FINE)
    diapos = [[forme(["Digit-AI · support fictif"], 2000000, ph="ctrTitle")]]
    corps = [forme([f"Objectif{e}: livrer le chapitre{e}4 en septembre{e}2026"], 1500000),
             forme([f"Validé par le «{e}comité de suivi{e}»"], 2200000),
             forme([f"Pourquoi ce délai{f}? La recette dure trois semaines."], 2900000)]
    diapos.append([forme(["Calendrier du lot"], 400000, ph="title")] + corps + pieds(2))
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        def ecrire(nom, contenu):
            info = zipfile.ZipInfo(nom, date_time=DATE_ZIP)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, contenu)
        ecrire("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
               '<Default Extension="xml" ContentType="application/xml"/></Types>')
        rels = "".join(f'<Relationship Id="rId{i + 1}" Target="slides/slide{i + 1}.xml"/>' for i in range(len(diapos)))
        ecrire("ppt/_rels/presentation.xml.rels", f'<Relationships>{rels}</Relationships>')
        ids = "".join(f'<p:sldId id="{256 + i}" r:id="rId{i + 1}"/>' for i in range(len(diapos)))
        ecrire("ppt/presentation.xml", f'<p:presentation {NS}><p:sldIdLst>{ids}</p:sldIdLst><p:sldSz cx="12192000" cy="{HAUTEUR}"/></p:presentation>')
        for i, formes in enumerate(diapos):
            ecrire(f"ppt/slides/slide{i + 1}.xml", f'<p:sld {NS}><p:cSld><p:spTree>{"".join(formes)}</p:spTree></p:cSld></p:sld>')
    print("écrit :", os.path.basename(chemin))


construire(os.path.join(ICI, "charte-pptx-typographie-red.pptx"), rouge=True)
construire(os.path.join(ICI, "charte-pptx-typographie-green.pptx"), rouge=False)
