#!/usr/bin/env python3
# Génération scriptée des fixtures de FORMAT d'oracle-pptx (TF-1130, rejouable).
# Deux .pptx minimaux, [Content_Types].xml en première entrée (hygiène du paquet tenue) :
#   verte = 16:9, polices du profil (thème Roboto, run DM Sans), couleur de texte de la palette ;
#   rouge = trois défauts volontaires, un par règle : P1 format 4:3, P2 police « Comic Sans MS »
#           hors jeu, P3 couleur de texte #FF00FF hors palette.
# Jouées avec fixtures/profil-pptx-format.json (format 16:9, polices, palette inventés).
import zipfile, os

HERE = os.path.dirname(os.path.abspath(__file__))


def build(path, red):
    cx, cy = (9144000, 6858000) if red else (12192000, 6858000)
    police, couleur = ("Comic Sans MS", "FF00FF") if red else ("DM Sans", "0F172A")
    z = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED)
    z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types/>')
    z.writestr("ppt/presentation.xml",
               f'<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>'
               f'<p:sldSz cx="{cx}" cy="{cy}"/></p:presentation>')
    z.writestr("ppt/_rels/presentation.xml.rels",
               '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>')
    z.writestr("ppt/theme/theme1.xml",
               '<a:theme><a:fontScheme><a:majorFont><a:latin typeface="Roboto"/><a:ea typeface=""/></a:majorFont>'
               '<a:minorFont><a:latin typeface="DM Sans"/></a:minorFont></a:fontScheme></a:theme>')
    z.writestr("ppt/slides/slide1.xml",
               '<p:sld><p:cSpTree><p:sp><p:txBody><a:p><a:r>'
               f'<a:rPr lang="fr-FR"><a:solidFill><a:srgbClr val="{couleur}"/></a:solidFill>'
               f'<a:latin typeface="{police}"/></a:rPr><a:t>Module 1 — objectifs</a:t>'
               '</a:r></a:p></p:txBody></p:sp></p:cSpTree></p:sld>')
    z.close()
    print("écrit :", path)


build(os.path.join(HERE, "pptx-format-red.pptx"), red=True)
build(os.path.join(HERE, "pptx-format-green.pptx"), red=False)
