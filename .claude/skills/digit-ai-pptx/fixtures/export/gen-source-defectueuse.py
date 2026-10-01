#!/usr/bin/env python3
# gen-source-defectueuse.py — fixtures du self-test de l'export (C7, TF-1502, 01/10/2026). Tout est FICTIF.
#
# Deux polices SOURCES fausses, désignées par --polices, chacune avec son défaut dans la police
# elle-même et non dans l'encodage. Sans elles, deux gardes de la chaîne d'export n'avaient aucun
# cas rouge, et leur sabotage laissait le self-test vert (mesuré le 01/10/2026) :
#   source-defectueuse/EssaiFictif-Regular.ttf  « Essai Fictif » telle que l'embarque le deck ROUGE
#       fictif du juge des polices embarquées (quality-oracles, fixtures/polices-embarquees-red.pptx) :
#       5 glyphes sur 17 sortent de la boîte englobante déclarée. Le réencodage réussit, le juge
#       rejoué rend encore FAIL (règle E2) : la chaîne doit REFUSER de livrer ;
#   source-incomplete/EssaiFictif-Regular.ttf   la police saine, privée du contour d'un glyphe (é).
#       Réencoder depuis elle ferait disparaître une lettre, et le juge ne le verrait pas : le glyphe
#       est vide des deux côtés. C'est la garde « glyphe perdu » du réencodage qui doit refuser.
#
# La construction est celle du générateur des fixtures du juge (même texte, mêmes glyphes, même
# ordre, même boîte déclarée) : les indices de glyphes de la copie embarquée et de la source
# coïncident, condition du réencodage. Horodatage fixe : une police rejouée ne change pas d'octets.
# Usage : uv run --with fonttools python -B gen-source-defectueuse.py
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ICI = os.path.dirname(os.path.abspath(__file__))
FAMILLE = "Essai Fictif"
TEXTE = "Essai de polices embarquées"
HORODATAGE = 3842294400  # 2025-10-01 00:00:00, en secondes depuis 1904
GLYPHE_VIDE = "uni00E9"  # « é », présent dans le texte du deck fictif


def construire(altere, boite=None, vide=None):
    chars = sorted(set(TEXTE) - {" "})
    noms = [".notdef", "space"] + [f"uni{ord(c):04X}" for c in chars]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(noms)
    fb.setupCharacterMap({32: "space", **{ord(c): f"uni{ord(c):04X}" for c in chars}})
    glyphes = {}
    for i, nom in enumerate(noms):
        pen = TTGlyphPen(None)
        if nom not in ("space", vide):
            k = i * 13 % 200
            pts = [(50, 0), (550, 0), (550, 600 + k), (300, 700), (50, 600 - k // 2)]
            if altere and i % 3 == 0 and nom != ".notdef":
                pts = [(x, y * 2 + 300) for (x, y) in pts]  # contours sortis de la boîte déclarée
            pen.moveTo(pts[0])
            for p in pts[1:]:
                pen.lineTo(p)
            pen.closePath()
        glyphes[nom] = pen.glyph()
    fb.setupGlyf(glyphes)
    fb.setupHorizontalMetrics({n: (600, 50) for n in noms})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": FAMILLE, "styleName": "Regular", "uniqueFontIdentifier": "EssaiFictif-Regular 1.000",
                       "fullName": FAMILLE + " Regular", "psName": "EssaiFictif-Regular", "version": "Version 1.000"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, fsType=0, usWeightClass=400, fsSelection=0x40)
    fb.setupPost()
    fb.setupHead(unitsPerEm=1000, created=HORODATAGE, modified=HORODATAGE)
    police = fb.font
    police.recalcTimestamp = False
    if boite:
        # la boîte déclarée reste celle de la police saine : c'est elle que les contours déplacés dépassent
        police["head"].xMin, police["head"].yMin, police["head"].xMax, police["head"].yMax = boite
        police.recalcBBoxes = False
    return police


if __name__ == "__main__":
    import io
    from fontTools.ttLib import TTFont
    tampon = io.BytesIO()
    construire(altere=False).save(tampon)  # la police saine, en mémoire : sa boîte est la boîte déclarée
    saine = TTFont(io.BytesIO(tampon.getvalue()))
    boite = (saine["head"].xMin, saine["head"].yMin, saine["head"].xMax, saine["head"].yMax)
    for dossier, police in (("source-defectueuse", construire(altere=True, boite=boite)),
                            ("source-incomplete", construire(altere=False, boite=boite, vide=GLYPHE_VIDE))):
        sortie = os.path.join(ICI, dossier, "EssaiFictif-Regular.ttf")
        os.makedirs(os.path.dirname(sortie), exist_ok=True)
        police.save(sortie)
        print("écrit :", os.path.relpath(sortie, ICI), "| boîte déclarée", boite)
