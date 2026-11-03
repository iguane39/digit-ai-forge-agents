#!/usr/bin/env python3
# Génération scriptée des fixtures de BONNE FORMATION XML d'oracle-pptx (TF-2064, rejouable).
# Deux .pptx minimaux de deux diapositives, [Content_Types].xml en première entrée (hygiène du paquet tenue),
# sans JPEG ni transition, jugés sous le profil GÉNÉRIQUE (profils/generique.json) :
#   verte = les deux diapositives sont du XML bien formé ;
#   rouge = ppt/slides/slide2.xml ferme <a:t> par </a:x> (le défaut mesuré le 02/11/2026 : exit 0 et PASS
#           sans LibreOffice, parce que l'oracle ne parsait pas les diapositives).
# Un seul défaut, sur une seule partie : la rouge ne peut échouer que par la règle X1.
import zipfile, os

HERE = os.path.dirname(os.path.abspath(__file__))


def diapo(texte, ferme="</a:t>"):
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            '<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:rPr lang="fr-FR"/>'
            f'<a:t>{texte}{ferme}'
            '</a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>')


def build(path, red):
    z = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED)
    z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types/>')
    z.writestr("ppt/presentation.xml",
               '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>'
               '<p:sldSz cx="12192000" cy="6858000"/></p:presentation>')
    z.writestr("ppt/_rels/presentation.xml.rels",
               '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/>'
               '<Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>')
    z.writestr("ppt/slides/slide1.xml", diapo("Objectifs du module"))
    z.writestr("ppt/slides/slide2.xml", diapo("Programme de la journée", "</a:x>" if red else "</a:t>"))
    z.close()
    print("écrit :", path)


build(os.path.join(HERE, "pptx-xml-red.pptx"), red=True)
build(os.path.join(HERE, "pptx-xml-green.pptx"), red=False)
