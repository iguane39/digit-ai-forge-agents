#!/usr/bin/env python3
# Génération scriptée des fixtures S7 (E-11, liste en ligne) d'oracle-charte-pptx-semantique
# (TF-1390, retours Produit-68 du 26/09/2026, RG-19). Tout est FICTIF.
#
# LE FAIT. La règle E-11 de ECRITURE.md (une énumération devient une liste) vaut pour les livrables
# PowerPoint, mais son seul juge, L12, ne lisait que les pages HTML : 7 listes en ligne séparées par
# « · » sur une diapositive, oracle-ecriture PASS, vues du seul destinataire. Les decks :
#   charte-pptx-liste-en-ligne-red.pptx    la diapositive de contenu porte une énumération séparée par « · »,
#                                          une autre par « ; », et une troisième à 2 éléments (limite basse) ;
#   charte-pptx-liste-en-ligne-green.pptx  les mêmes éléments, un par paragraphe ; ce qui ressemble à une
#                                          liste en ligne mais n'en est pas reste permis : pied de page
#                                          « Digit-AI · support fictif » (espace réservé et bandeau bas),
#                                          intercalaire « 01 · Contexte », couverture « Digit-AI · mars 2026 ».
# Rejouable : python -B gen-charte-pptx-liste-en-ligne-fixtures.py (bibliothèque standard seule).
import os
import zipfile

ICI = os.path.dirname(os.path.abspath(__file__))
DATE_ZIP = (2026, 10, 12, 0, 0, 0)
NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
HAUTEUR = 6858000


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
    diapos = [[forme(["Digit-AI · mars 2026"], 2000000, ph="ctrTitle")]]
    # 2 — intercalaire : « NN · Titre » n'est pas une énumération
    diapos.append([forme(["01 · Contexte"], 2000000, ph="title")] + pieds(2))
    if rouge:
        corps = [forme(["Pilotage · Données · Qualité · Sécurité"], 1500000),
                 forme(["Lot 1 ; lot 2 ; lot 3"], 2200000),
                 forme(["Cadrage · Réalisation"], 2900000)]
    else:
        corps = [forme(["Pilotage", "Données", "Qualité", "Sécurité"], 1500000),
                 forme(["Lot 1", "Lot 2", "Lot 3"], 2200000),
                 forme(["Cadrage", "Réalisation"], 2900000),
                 forme(["Digit-AI · support fictif"], HAUTEUR - 450000, cx=6000000)]
    diapos.append([forme(["Composants du dispositif"], 400000, ph="title")] + corps + pieds(3))
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


construire(os.path.join(ICI, "charte-pptx-liste-en-ligne-red.pptx"), rouge=True)
construire(os.path.join(ICI, "charte-pptx-liste-en-ligne-green.pptx"), rouge=False)
