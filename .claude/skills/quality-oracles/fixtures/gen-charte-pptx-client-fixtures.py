#!/usr/bin/env python3
# Génération scriptée des fixtures « format d'un client » d'oracle-charte-pptx-semantique (TF-1490, 01/10/2026).
# Tout est FICTIF : un support au format d'un client inventé, comme celui du lot (petites icônes de
# contenu, pied de page et pagination en zones de texte, aucun espace réservé ftr ni sldNum).
#   charte-pptx-client-green.pptx  le format tenu : vert sous son profil (fixtures/profil-charte-client.json :
#                                  logos admis partout, pied de page en zone de texte), ROUGE sous digit-ai
#                                  (S3 icônes au gabarit logo hors couverture, S4 aucun espace réservé) ;
#   charte-pptx-client-red.pptx    le même support dont la diapositive 3 a perdu pied de page et pagination :
#                                  rouge sous son profil (S4 en zone de texte).
# Rejouable : python -B gen-charte-pptx-client-fixtures.py (aucune dépendance hors de la bibliothèque standard).
import os
import zipfile

ICI = os.path.dirname(os.path.abspath(__file__))
DATE_ZIP = (2026, 10, 1, 0, 0, 0)
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000"
                    "001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd4"
                    "0000000049454e44ae426082")
HAUTEUR = 6858000


def forme(texte, y, ph=None, cx=8000000):
    phx = f'<p:ph type="{ph}"/>' if ph else ''
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="Forme"/><p:cNvSpPr/><p:nvPr>{phx}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="{y}"/>'
            f'<a:ext cx="{cx}" cy="400000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>{texte}</a:t></a:r></a:p></p:txBody></p:sp>')


def image(cx, y=1800000):
    return (f'<p:pic><p:nvPicPr><p:cNvPr id="3" name="Icone"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill>'
            f'<p:spPr><a:xfrm><a:off x="457200" y="{y}"/><a:ext cx="{cx}" cy="{cx}"/></a:xfrm></p:spPr></p:pic>')


NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')


def construire(chemin, rouge):
    diapos = []
    diapos.append([forme("Règles communes — format client", 2000000, ph="ctrTitle"), image(1500000)])  # couverture : logo admis
    for n, sujet in ((2, "Architecture de référence"), (3, "Envoi de messages"), (4, "Journalisation")):
        corps = [forme(sujet, 400000, ph="title"), forme("Principes et exemples", 1200000), image(250000, 1800000), image(274320, 2200000)]
        if not (rouge and n == 3):
            corps += [forme("Client fictif · Règles communes", HAUTEUR - 450000, cx=6000000), forme(str(n), HAUTEUR - 450000, cx=400000)]
        diapos.append(corps)
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        def ecrire(nom, contenu):
            info = zipfile.ZipInfo(nom, date_time=DATE_ZIP)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, contenu)
        ecrire("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
               '<Default Extension="png" ContentType="image/png"/><Default Extension="xml" ContentType="application/xml"/></Types>')
        rels = "".join(f'<Relationship Id="rId{i + 1}" Target="slides/slide{i + 1}.xml"/>' for i in range(len(diapos)))
        ecrire("ppt/_rels/presentation.xml.rels", f'<Relationships>{rels}</Relationships>')
        ids = "".join(f'<p:sldId id="{256 + i}" r:id="rId{i + 1}"/>' for i in range(len(diapos)))
        ecrire("ppt/presentation.xml", f'<p:presentation {NS}><p:sldIdLst>{ids}</p:sldIdLst><p:sldSz cx="12192000" cy="{HAUTEUR}"/></p:presentation>')
        ecrire("ppt/media/image1.png", PNG)
        for i, formes in enumerate(diapos):
            ecrire(f"ppt/slides/slide{i + 1}.xml", f'<p:sld {NS}><p:cSld><p:spTree>{"".join(formes)}</p:spTree></p:cSld></p:sld>')
            ecrire(f"ppt/slides/_rels/slide{i + 1}.xml.rels",
                   '<Relationships><Relationship Id="rId2" Target="../media/image1.png"/></Relationships>')
    print("écrit :", os.path.relpath(chemin, ICI))


construire(os.path.join(ICI, "charte-pptx-client-green.pptx"), rouge=False)
construire(os.path.join(ICI, "charte-pptx-client-red.pptx"), rouge=True)
