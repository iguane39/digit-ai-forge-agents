#!/usr/bin/env python3
"""fabriquer-fixtures.py — écrit les fixtures fictives du skill, une note par format, et son cadre.

Tout est inventé : la coopérative, les personnes, les chiffres. Le Word s'écrit à la bibliothèque
standard, le PDF par reportlab, en mode invariant : deux exécutions rendent les mêmes octets.

    python scripts/fabriquer-fixtures.py --ecrire
"""
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
    pdf(docs / "note.pdf")
    print("fixtures écrites :", RACINE)


if __name__ == "__main__":
    if "--ecrire" not in sys.argv:
        print(__doc__)
        sys.exit(2)
    ecrire()
