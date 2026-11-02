#!/usr/bin/env python3
"""fabriquer-fixtures.py — écrit les fixtures fictives du skill, une note par format, et son cadre.

Tout est inventé : la coopérative, les personnes, les chiffres. Word et PowerPoint s'écrivent à la
bibliothèque standard, le PDF par reportlab, en mode invariant : deux exécutions rendent les mêmes octets.
Le deck porte un JPEG et une transition, que la charte Digit-AI refuse et que le deck d'un client peut avoir,
et ses diapositives s'appellent slide1, slide2 et slide10, pour éprouver l'ordre par numéro.

    python scripts/fabriquer-fixtures.py --ecrire
"""
import base64
import sys
import zipfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent / "fixtures"

TITRE = "Note de cadrage : atelier de tri des archives"
PARAGRAPHES = [
    "La Coopérative du Val Fictif conserve ses archives dans la salle des Tilleuls depuis 2009.",
    "Camille Exemple pilote un atelier de tri prévu sur 3 samedis, avec 12 bénévoles.",
    "Le tri sépare les pièces à garder, les pièces à numériser et les pièces à détruire.",
    "Il est important de noter que chaque carton reçoit une étiquette avant de quitter la salle.",
    "Les pièces à détruire attendent la signature du bureau de la coopérative.",
    "Un inventaire de 240 cartons a été dressé au printemps, et il reste à vérifier sur place.",
    "À la fin de l'atelier, la coopérative saura quels cartons quittent la salle des Tilleuls.",
]

BRIEF = """# Brief

- Lecteur : les bénévoles de l'atelier, qui ne connaissent pas encore les archives.
- Objectif : qu'un bénévole sache, avant le premier samedi, ce qu'il trie et comment.
- Plafond de mots : 180
- Référence : reference/modele-de-note.md, une note courte dont on veut la clarté.
"""

SOURCE = """# Faits relevés par le bureau de la coopérative

- L'atelier commence le samedi 14 mars, à 9 heures.
- Dominique Fictif tient le registre des cartons.
- Chaque bénévole reçoit 4 étiquettes par heure de tri.
- Le bureau de la coopérative signe les destructions le dernier mardi du mois.
"""

REFERENCE = """# Modèle de note : consigne d'évacuation d'un gymnase fictif

Une note courte dit d'abord ce que le lecteur fait, puis pourquoi. La salle Sirius compte 300 places.
Cette référence montre un ton et une forme : ses faits ne valent pas pour une autre note.
"""


def markdown():
    corps = "\n\n".join(PARAGRAPHES[i] for i in range(len(PARAGRAPHES)))
    return f"# {TITRE}\n\n{corps}\n"


def html():
    corps = "\n".join(f"    <p>{p}</p>" for p in PARAGRAPHES)
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{TITRE}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 42rem; line-height: 1.5; color: #1f2933; }}
    h1 {{ font-size: 1.6rem; }}
  </style>
</head>
<body>
  <main>
    <h1>{TITRE}</h1>
{corps}
  </main>
</body>
</html>
"""


def docx(chemin):
    ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    def para(texte, style=None):
        ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        return f'<w:p>{ppr}<w:r><w:t xml:space="preserve">{texte}</w:t></w:r></w:p>'
    corps = para(TITRE, "Titre1") + "".join(para(p) for p in PARAGRAPHES)
    parties = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/_rels/document.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        "word/styles.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles {ns}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>',
        "word/document.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document {ns}><w:body>{corps}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>',
    }
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        for nom, contenu in parties.items():
            info = zipfile.ZipInfo(nom, date_time=(2026, 11, 2, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, contenu.encode("utf-8"))


NS_PPTX = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PH_TITRE = 'type="title"'
ARBRE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
# Une image de 8 pixels sur 8, écrite ici pour que la fixture ne dépende d'aucun module d'image.
JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCtRRRXWcp//9k="
THEME = (
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Fictif"><a:themeElements>'
    '<a:clrScheme name="Fictif"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2>'
    '<a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>'
    '<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme>'
    '<a:fontScheme name="Fictif"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    '<a:fmtScheme name="Fictif"><a:fillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' * 3 + "</a:fillStyleLst><a:lnStyleLst>"
    + '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' * 3 + "</a:lnStyleLst><a:effectStyleLst>"
    + "<a:effectStyle><a:effectLst/></a:effectStyle>" * 3 + "</a:effectStyleLst><a:bgFillStyleLst>"
    + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' * 3 + "</a:bgFillStyleLst></a:fmtScheme>"
    "</a:themeElements></a:theme>"
)


def forme(ident, nom, paragraphes, x, y, cx, cy, espace=None, taille=None):
    ph = f"<p:ph {espace}/>" if espace else ""
    corps_taille = f' sz="{taille}"' if taille else ""
    rpr = f'<a:rPr lang="fr-FR"{corps_taille}/>'
    corps = "".join(f"<a:p><a:r>{rpr}<a:t>{t}</a:t></a:r></a:p>" for t in paragraphes)
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{ident}" name="{nom}"/><p:cNvSpPr/><p:nvPr>{ph}</p:nvPr></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>'
        f'<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>{corps}</p:txBody></p:sp>'
    )


def diapo(contenu, suite=""):
    return f'{XML}<p:sld {NS_PPTX}><p:cSld><p:spTree>{ARBRE}{contenu}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>{suite}</p:sld>'


def rels(*liens):
    corps = "".join(f'<Relationship Id="rId{i + 1}" Type="{t}" Target="{c}"/>' for i, (t, c) in enumerate(liens))
    return f'{XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{corps}</Relationships>'


def pptx(chemin):
    numeros = (1, 2, 10)
    types = {"presentation": "presentationml.presentation.main", "slideMasters/slideMaster1": "presentationml.slideMaster", "slideLayouts/slideLayout1": "presentationml.slideLayout", "notesMasters/notesMaster1": "presentationml.notesMaster", "notesSlides/notesSlide2": "presentationml.notesSlide", "theme/theme1": "theme", "theme/theme2": "theme", "presProps": "presentationml.presProps", "viewProps": "presentationml.viewProps", "tableStyles": "presentationml.tableStyles"}
    types |= {f"slides/slide{n}": "presentationml.slide" for n in numeros}
    surcharges = "".join(f'<Override PartName="/ppt/{p}.xml" ContentType="application/vnd.openxmlformats-officedocument.{t}+xml"/>' for p, t in types.items())
    image = (
        '<p:pic><p:nvPicPr><p:cNvPr id="4" name="Vignette" descr="Un carré uni"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
        '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        '<p:spPr><a:xfrm><a:off x="10000000" y="5000000"/><a:ext cx="900000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
    )
    tableau = (
        '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Tableau"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>'
        '<p:xfrm><a:off x="700000" y="3200000"/><a:ext cx="10800000" cy="800000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="10800000"/></a:tblGrid>'
        f'<a:tr h="800000"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>{PARAGRAPHES[5]}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>'
    )
    titre = lambda t: forme(2, "Titre", [t], 700000, 400000, 10800000, 900000, PH_TITRE, 2800)
    titre_masque = forme(2, "Titre du masque", ["Titre du masque"], 700000, 400000, 10800000, 900000, PH_TITRE, 2800)
    pied_masque = forme(3, "Pied du masque", ["Archives de la salle Mimosas, fonds de 1987"], 700000, 6300000, 10800000, 400000, None, 1000)
    titre_disposition = forme(2, "Titre de la disposition", ["Disposition du bureau Glycines"], 700000, 400000, 10800000, 900000, PH_TITRE, 2800)
    parties = {
        "[Content_Types].xml": f'{XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/>{surcharges}</Types>',
        "_rels/.rels": rels((f"{REL}/officeDocument", "ppt/presentation.xml")),
        "ppt/presentation.xml": f'{XML}<p:presentation {NS_PPTX} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId4"/><p:sldId id="258" r:id="rId5"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
        "ppt/_rels/presentation.xml.rels": rels((f"{REL}/slideMaster", "slideMasters/slideMaster1.xml"), (f"{REL}/notesMaster", "notesMasters/notesMaster1.xml"), *((f"{REL}/slide", f"slides/slide{n}.xml") for n in numeros), (f"{REL}/presProps", "presProps.xml"), (f"{REL}/viewProps", "viewProps.xml"), (f"{REL}/theme", "theme/theme1.xml"), (f"{REL}/tableStyles", "tableStyles.xml")),
        "ppt/presProps.xml": f"{XML}<p:presentationPr {NS_PPTX}/>",
        "ppt/viewProps.xml": f"{XML}<p:viewPr {NS_PPTX}/>",
        "ppt/tableStyles.xml": f'{XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}}"/>',
        "ppt/theme/theme1.xml": XML + THEME,
        "ppt/theme/theme2.xml": XML + THEME,
        # Un mot du masque, un mot de la disposition, un mot des notes : faits connus, jamais comptés au plafond.
        "ppt/slideMasters/slideMaster1.xml": f'{XML}<p:sldMaster {NS_PPTX}><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>{ARBRE}{titre_masque}{pied_masque}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>',
        "ppt/slideMasters/_rels/slideMaster1.xml.rels": rels((f"{REL}/slideLayout", "../slideLayouts/slideLayout1.xml"), (f"{REL}/theme", "../theme/theme1.xml")),
        "ppt/slideLayouts/slideLayout1.xml": f'{XML}<p:sldLayout {NS_PPTX} preserve="1"><p:cSld name="Fictive"><p:spTree>{ARBRE}{titre_disposition}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels": rels((f"{REL}/slideMaster", "../slideMasters/slideMaster1.xml")),
        "ppt/notesMasters/notesMaster1.xml": f'{XML}<p:notesMaster {NS_PPTX}><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>{ARBRE}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>',
        "ppt/notesMasters/_rels/notesMaster1.xml.rels": rels((f"{REL}/theme", "../theme/theme2.xml")),
        "ppt/notesSlides/notesSlide2.xml": f'{XML}<p:notes {NS_PPTX}><p:cSld><p:spTree>{ARBRE}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>{" ".join(["Le samedi, Ariane Glossaire ouvre la salle et rappelle le tri."] * 12)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>',
        "ppt/notesSlides/_rels/notesSlide2.xml.rels": rels((f"{REL}/notesMaster", "../notesMasters/notesMaster1.xml"), (f"{REL}/slide", "../slides/slide2.xml")),
        "ppt/slides/slide1.xml": diapo(titre(TITRE) + forme(3, "Chapeau", [PARAGRAPHES[0]], 700000, 1500000, 9000000, 900000, None, 1800) + image),
        "ppt/slides/_rels/slide1.xml.rels": rels((f"{REL}/slideLayout", "../slideLayouts/slideLayout1.xml"), (f"{REL}/image", "../media/image1.jpg")),
        "ppt/slides/slide2.xml": diapo(titre("Ce que fait chaque bénévole") + forme(3, "Corps", PARAGRAPHES[1:5], 700000, 1500000, 10800000, 4400000, None, 1800), '<p:transition spd="med"><p:fade/></p:transition>'),
        "ppt/slides/_rels/slide2.xml.rels": rels((f"{REL}/slideLayout", "../slideLayouts/slideLayout1.xml"), (f"{REL}/notesSlide", "../notesSlides/notesSlide2.xml")),
        "ppt/slides/slide10.xml": diapo(titre("La fin de l'atelier") + forme(3, "Conclusion", [PARAGRAPHES[6]], 700000, 1500000, 10800000, 1200000, None, 1800) + tableau),
        "ppt/slides/_rels/slide10.xml.rels": rels((f"{REL}/slideLayout", "../slideLayouts/slideLayout1.xml")),
    }
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        for nom, contenu in parties.items():
            info = zipfile.ZipInfo(nom, date_time=(2026, 11, 2, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, contenu.encode("utf-8"))
        info = zipfile.ZipInfo("ppt/media/image1.jpg", date_time=(2026, 11, 2, 0, 0, 0))
        z.writestr(info, base64.b64decode(JPEG))


def pdf(chemin):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(str(chemin), pagesize=A4, invariant=1)
    c.setTitle("Note fictive")
    largeur, hauteur = A4
    y = hauteur - 72
    c.setFont("Helvetica-Bold", 16)
    c.drawString(60, y, TITRE)
    y -= 30
    c.setFont("Helvetica", 10.5)
    for p in PARAGRAPHES:
        c.drawString(60, y, p)
        y -= 20
    c.save()


def ecrire():
    cadre = RACINE / "cadre"
    (cadre / "sources").mkdir(parents=True, exist_ok=True)
    (cadre / "reference").mkdir(parents=True, exist_ok=True)
    (cadre / "brief.md").write_text(BRIEF, encoding="utf-8", newline="\n")
    (cadre / "sources" / "faits-du-bureau.md").write_text(SOURCE, encoding="utf-8", newline="\n")
    (cadre / "reference" / "modele-de-note.md").write_text(REFERENCE, encoding="utf-8", newline="\n")
    docs = RACINE / "documents"
    docs.mkdir(parents=True, exist_ok=True)
    (docs / "note.md").write_text(markdown(), encoding="utf-8", newline="\n")
    (docs / "note.html").write_text(html(), encoding="utf-8", newline="\n")
    docx(docs / "note.docx")
    pptx(docs / "note.pptx")
    pdf(docs / "note.pdf")
    print("fixtures écrites :", RACINE)


if __name__ == "__main__":
    if "--ecrire" not in sys.argv:
        print(__doc__)
        sys.exit(2)
    ecrire()
