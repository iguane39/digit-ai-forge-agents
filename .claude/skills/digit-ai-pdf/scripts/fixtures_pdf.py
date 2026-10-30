#!/usr/bin/env python
# fixtures_pdf.py — fabrique les PDF synthétiques du skill : aucun document réel, personnes fictives.
#   python fixtures_pdf.py --ecrire    réécrit fixtures/ (rouge et verte du manifest de quality-oracles)
# Importé par self-test.py, qui en dérive un défaut par règle.
import io
import json
import os
import subprocess
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(os.path.dirname(ICI), "fixtures")
HAUT = 842

VALEURS_CHAMPS = {
    "champs": {
        "nom": "Hélène Dupré-Œuvrard",
        "adresse": "12 rue de l'Église, 39000 Lons-le-Saunier, bâtiment C, 3e étage, porte de gauche",
        "iban": "FR7630006000011234567890189",
        "accepte": True,
        "refuse": False,
        "formule": "/B",
        "ville": "Saint-Étienne",
    }
}

# Boîtes en repère lecteur : origine en haut à gauche, comme l'image de `relever`.
VALEURS_PLAT = {
    "plat": [
        {"page": 1, "boite": [110, 88, 400, 106], "texte": "Hélène Dupré"},
        {"page": 1, "boite": [110, 118, 400, 136], "texte": "Saint-Étienne, le 30/10/2026"},
        {"page": 1, "boite": [50, 150, 62, 162], "coche": True},
        {"page": 1, "boite": [50, 174, 62, 186], "coche": False},
    ]
}


def formulaire_champs(chemin):
    """AcroForm : texte, texte multiligne, peigne, 2 cases, 1 groupe radio, 1 requis, 1 signature."""
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, NumberObject, TextStringObject, ArrayObject, FloatObject
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    brut = chemin + ".brut"
    c = canvas.Canvas(brut, pagesize=A4, invariant=1)
    c.setFont("Helvetica", 11)
    lignes = [("Nom", 780), ("Adresse", 740), ("IBAN", 680), ("Accepte", 640), ("Refuse", 610), ("Formule", 580), ("Ville", 550), ("Signature", 500)]
    for lib, y in lignes:
        c.drawString(50, y, lib + " :")
    f = c.acroForm
    f.textfield(name="nom", x=120, y=775, width=300, height=20, fontSize=0, borderWidth=1, forceBorder=True)
    f.textfield(name="adresse", x=120, y=715, width=300, height=40, fontSize=10, borderWidth=1, fieldFlags="multiline", forceBorder=True)
    f.textfield(name="iban", x=120, y=675, width=340, height=20, fontSize=10, borderWidth=1, maxlen=27, forceBorder=True)
    f.checkbox(name="accepte", x=120, y=635, size=16, buttonStyle="check", checked=False, fieldFlags="")
    f.checkbox(name="refuse", x=120, y=605, size=16, buttonStyle="check", checked=False, fieldFlags="")
    f.radio(name="formule", value="A", x=120, y=575, size=16, selected=False, relative=False, fieldFlags="noToggleToOff radio")
    f.radio(name="formule", value="B", x=150, y=575, size=16, selected=False, relative=False, fieldFlags="noToggleToOff radio")
    f.textfield(name="ville", x=120, y=545, width=200, height=20, fontSize=10, borderWidth=1, fieldFlags="required", forceBorder=True)
    c.save()
    r = PdfReader(brut)
    w = PdfWriter(clone_from=r)
    page = w.pages[0]
    for ref in page["/Annots"]:
        a = ref.get_object()
        nom = str(a.get("/T") or "")
        if nom == "iban":
            a[NameObject("/Ff")] = NumberObject(int(a.get("/Ff", 0)) | (1 << 24))
    sig = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"), NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Sig"), NameObject("/T"): TextStringObject("signature"),
        NameObject("/Rect"): ArrayObject([FloatObject(120), FloatObject(470), FloatObject(320), FloatObject(520)]),
        NameObject("/F"): NumberObject(4),
    })
    ref_sig = w._add_object(sig)
    page["/Annots"].append(ref_sig)
    w._root_object["/AcroForm"].get_object()["/Fields"].append(ref_sig)
    with open(chemin, "wb") as fo:
        w.write(fo)
    os.remove(brut)


def formulaire_plat(chemin):
    """PDF plat : des libellés, des lignes et des carrés dessinés, aucun champ."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(chemin, pagesize=A4, invariant=1)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(50, HAUT - 50, "Mandat de démonstration")
    c.setFont("Helvetica", 11)
    c.drawString(50, HAUT - 102, "Nom :")
    c.line(110, HAUT - 106, 400, HAUT - 106)
    c.drawString(50, HAUT - 132, "Fait à :")
    c.line(110, HAUT - 136, 400, HAUT - 136)
    c.rect(50, HAUT - 162, 12, 12)
    c.drawString(70, HAUT - 160, "J'accepte les conditions")
    c.rect(50, HAUT - 186, 12, 12)
    c.drawString(70, HAUT - 184, "Je refuse")
    c.drawString(50, HAUT - 230, "Signature, précédée de « Lu et approuvé » :")
    c.line(50, HAUT - 290, 300, HAUT - 290)
    c.save()


def ecrire_valeurs(chemin, valeurs):
    with open(chemin, "w", encoding="utf-8", newline="\n") as f:
        json.dump(valeurs, f, ensure_ascii=False, indent=2)
        f.write("\n")


def remplir(source, valeurs, sortie):
    r = subprocess.run([sys.executable, os.path.join(ICI, "formulaire.py"), "remplir", source, "--valeurs", valeurs, "--out", sortie, "--sans-controle"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        raise SystemExit(f"remplissage refusé : {r.stderr}")


def ecrire_fixtures():
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import NameObject
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    os.makedirs(FIXTURES, exist_ok=True)
    p = lambda n: os.path.join(FIXTURES, n)
    formulaire_champs(p("champs-vierge.pdf"))
    formulaire_plat(p("plat-vierge.pdf"))
    ecrire_valeurs(p("valeurs-champs.json"), VALEURS_CHAMPS)
    ecrire_valeurs(p("valeurs-plat.json"), VALEURS_PLAT)
    remplir(p("champs-vierge.pdf"), p("valeurs-champs.json"), p("champs-vert.pdf"))
    remplir(p("plat-vierge.pdf"), p("valeurs-plat.json"), p("plat-vert.pdf"))
    # Rouge du manifest, champs : la valeur est écrite et aucune apparence ne la montre.
    w = PdfWriter(clone_from=PdfReader(p("champs-vert.pdf")))
    for ref in w.pages[0]["/Annots"]:
        a = ref.get_object()
        if str(a.get("/T") or "") == "nom":
            del a[NameObject("/AP")]
    with open(p("champs-rouge.pdf"), "wb") as f:
        w.write(f)
    # Rouge du manifest, plat : un texte écrase le libellé « Nom : » du formulaire.
    tampon = io.BytesIO()
    c = canvas.Canvas(tampon, pagesize=A4, invariant=1)
    c.setFont("Helvetica", 11)
    c.drawString(52, HAUT - 102, "Dupré")
    c.save()
    tampon.seek(0)
    w = PdfWriter(clone_from=PdfReader(p("plat-vert.pdf")))
    w.pages[0].merge_page(PdfReader(tampon).pages[0])
    with open(p("plat-rouge.pdf"), "wb") as f:
        w.write(f)


if __name__ == "__main__":
    if "--ecrire" in sys.argv:
        ecrire_fixtures()
        print("fixtures écrites :", ", ".join(sorted(os.listdir(FIXTURES))))
