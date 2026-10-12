#!/usr/bin/env python3
# Génération scriptée des fixtures « repère à côté du titre » d'oracle-charte-pptx-semantique
# (TF-1380 et TF-1379, retours Produit-68 du 26/09/2026, RG-12 et RG-11). Tout est FICTIF.
#
# LE FAIT. Une pastille « N / M » posée à gauche d'un titre et recentrée sur sa 1re ligne a son HAUT 2 pt
# plus haut que celui du titre : S2 la prenait pour un sur-titre et la refusait, alors qu'une pastille
# plus basse, mal alignée, passait. Les decks :
#   charte-pptx-repere-green.pptx      pastille à GAUCHE du titre, haut 2 pt au-dessus du sien : S2 ne dit rien ;
#   charte-pptx-repere-red.pptx        la même pastille AU-DESSUS du titre, sur son étendue horizontale : sur-titre, S2 ;
#   charte-pptx-alignement-green.pptx  octet pour octet le deck vert, jugé avec charte-pptx-alignement-green.mesures.json
#   charte-pptx-alignement-red.pptx    octet pour octet le deck vert, jugé avec charte-pptx-alignement-red.mesures.json
# Les deux .mesures.json sont des mesures de RENDU (format de scripts/mesure-rendu-pptx.ps1) CONSTRUITES pour le
# jeu d'essai, non relevées dans PowerPoint : rouge, la pastille est centrée 6,84 pt sous le centre de la 1re
# ligne du titre, comme sur la remise du 24/09 ; vert, elle est à 0,2 pt.
# Rejouable : python -B gen-charte-pptx-repere-fixtures.py (bibliothèque standard seule).
import json
import os
import shutil
import zipfile

ICI = os.path.dirname(os.path.abspath(__file__))
DATE_ZIP = (2026, 10, 12, 0, 0, 0)
NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
HAUTEUR = 6858000
TITRE_X, TITRE_Y, TITRE_CX, TITRE_CY = 1000000, 400000, 9000000, 800000
PT = 12700  # EMU par point


def forme(texte, x, y, cx, cy, ph=None):
    phx = f'<p:ph type="{ph}"/>' if ph else ''
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="Forme"/><p:cNvSpPr/><p:nvPr>{phx}</p:nvPr></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm></p:spPr>'
            f'<p:txBody><a:bodyPr/><a:p><a:r><a:t>{texte}</a:t></a:r></a:p></p:txBody></p:sp>')


def pieds(n):
    return [forme("Digit-AI — support fictif", 100000, HAUTEUR - 450000, 6000000, 300000, ph="ftr"),
            forme(str(n), 11000000, HAUTEUR - 450000, 600000, 300000, ph="sldNum")]


def construire(chemin, repere_au_dessus):
    diapos = [[forme("Support fictif", TITRE_X, 2000000, TITRE_CX, TITRE_CY, ph="ctrTitle")]]
    for n, titre in ((2, "Un titre assez long pour tenir sur deux lignes dans sa zone"), (3, "Un second titre")):
        if repere_au_dessus:
            # bas de la pastille au-dessus du haut du titre, étendue horizontale recouverte : sur-titre
            pastille = forme(f"{n} / 3", TITRE_X, TITRE_Y - 450000, 700000, 400000)
        else:
            # à gauche du titre, sans recouvrement horizontal, haut 2 pt plus haut que celui du titre
            pastille = forme(f"{n} / 3", 100000, TITRE_Y - 2 * PT, 700000, 400000)
        diapos.append([forme(titre, TITRE_X, TITRE_Y, TITRE_CX, TITRE_CY, ph="title"), pastille,
                       forme("Corps de la diapositive", TITRE_X, 2000000, 8000000, 500000)] + pieds(n))
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


def mesures(ecart_pt):
    """Mesures de rendu fictives : titre à deux lignes (1re ligne de 33,0 à 57,0 pt, centre 45,0 pt)."""
    slides = [{"n": 1, "formes": [{"nom": "Titre", "texte": "Support fictif", "titre": True, "haut": 157.0, "hauteur": 63.0,
                                    "gauche": 78.7, "largeur": 708.7, "ligne1": {"haut": 160.0, "hauteur": 24.0}}]}]
    for n, titre in ((2, "Un titre assez long pour tenir sur deux lignes dans sa zone"), (3, "Un second titre")):
        centre_ligne1 = 45.0
        haut_pastille = round(centre_ligne1 + ecart_pt - 15.75, 2)
        slides.append({"n": n, "formes": [
            {"nom": "Titre", "texte": titre, "titre": True, "haut": 31.5, "hauteur": 63.0, "gauche": 78.7, "largeur": 708.7,
             "ligne1": {"haut": 33.0, "hauteur": 24.0}},
            {"nom": "Pastille", "texte": f"{n} / 3", "titre": False, "haut": haut_pastille, "hauteur": 31.5, "gauche": 7.9, "largeur": 55.1,
             "ligne1": None}]})
    return {"outil": "mesure-rendu-pptx", "unite": "pt", "origine": "jeu d'essai fictif, valeurs construites (non relevées dans PowerPoint)", "slides": slides}


vert = os.path.join(ICI, "charte-pptx-repere-green.pptx")
construire(vert, repere_au_dessus=False)
construire(os.path.join(ICI, "charte-pptx-repere-red.pptx"), repere_au_dessus=True)
for nom, ecart in (("green", 0.2), ("red", 6.84)):
    shutil.copyfile(vert, os.path.join(ICI, f"charte-pptx-alignement-{nom}.pptx"))
    with open(os.path.join(ICI, f"charte-pptx-alignement-{nom}.mesures.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(mesures(ecart), f, ensure_ascii=False, indent=1)
        f.write("\n")
print("écrit : alignement-green/red (.pptx et .mesures.json)")
