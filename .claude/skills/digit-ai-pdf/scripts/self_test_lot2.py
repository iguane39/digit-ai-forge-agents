# self_test_lot2.py — tri et lecture, sur des PDF synthétiques dont la nature est connue d'avance.
# Appelé par self-test.py. L'OCR n'est joué que là où un moteur répond : son absence est dite, jamais
# comptée comme un succès. Le passage par une vraie image de page protège d'un défaut déjà vécu :
# le 30/10/2026, une exception avalée rendait la part d'image à 0, et plus aucune page n'était « scan ».
import json
import os

TEXTE = ("Contrat de location du 12 mars 2024 entre Madame Hélène Dupré et la société Études et Réalités. "
         "Le loyer mensuel s'élève à 1 245,50 euros, charges comprises, payable le 5 de chaque mois. "
         "Fait à Saint-Étienne, le 18 août 2026, en deux exemplaires originaux, dont un remis au preneur.")


def page_texte(c, texte=TEXTE, y=780):
    c.setFont("Helvetica", 11)
    mots, ligne = texte.split(" "), ""
    for m in mots:
        if len(ligne) + len(m) > 80:
            c.drawString(50, y, ligne)
            y -= 18
            ligne = m
        else:
            ligne = (ligne + " " + m).strip()
    c.drawString(50, y, ligne)


def image_de(pdf_source, dpi=200):
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(pdf_source)
    img = doc[0].render(scale=dpi / 72, may_draw_forms=False, grayscale=True).to_pil().convert("RGB")
    doc.close()
    return img


def fabriquer(d):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas
    p = lambda n: os.path.join(d, n)
    c = canvas.Canvas(p("natif.pdf"), pagesize=A4, invariant=1)
    page_texte(c)
    c.save()
    img = image_de(p("natif.pdf"))
    largeur, hauteur = A4
    # Scan : l'image couvre la page, aucune couche de texte.
    c = canvas.Canvas(p("scan.pdf"), pagesize=A4, invariant=1)
    c.drawImage(ImageReader(img), 0, 0, largeur, hauteur)
    c.save()
    # Hybride de document : 1 page native, 1 page scannée, 1 page blanche.
    c = canvas.Canvas(p("mixte.pdf"), pagesize=A4, invariant=1)
    page_texte(c)
    c.showPage()
    c.drawImage(ImageReader(img), 0, 0, largeur, hauteur)
    c.showPage()
    c.showPage()
    c.save()
    # Scan et couche de texte superposés.
    c = canvas.Canvas(p("couche.pdf"), pagesize=A4, invariant=1)
    c.drawImage(ImageReader(img), 0, 0, largeur, hauteur)
    page_texte(c)
    c.save()
    # Scan posé de travers : la page se lit après un quart de tour.
    c = canvas.Canvas(p("travers.pdf"), pagesize=A4, invariant=1)
    tourne = img.rotate(90, expand=True)
    c.drawImage(ImageReader(tourne), 0, 0, largeur, hauteur)
    c.save()
    # Facture : libellés de formulaire et filets de tableau, tous remplis. Ce n'est pas un formulaire.
    c = canvas.Canvas(p("facture.pdf"), pagesize=A4, invariant=1)
    c.setFont("Helvetica", 10)
    y = 760
    for lib, val in (("Nom", "Société Exemple"), ("Adresse", "1 rue de la Paix"), ("Date", "30/10/2026"), ("Référence", "FA-2026-0817"), ("Montant", "1 245,50 €")):
        c.drawString(50, y, f"{lib} : {val}")
        c.line(50, y - 4, 400, y - 4)
        y -= 20
    c.save()
    # Page sans texte ni image, avec du dessin : ni scan ni vide.
    c = canvas.Canvas(p("dessin.pdf"), pagesize=A4, invariant=1)
    for k in range(20):
        c.circle(150 + k * 15, 400, 30 + k)
    c.save()


def jouer_lot(d, controle, jouer, valeurs):
    from reportlab.pdfgen import canvas
    import fixtures_pdf as fx
    p = lambda n: os.path.join(d, n)
    fabriquer(d)
    tri = lambda n: json.loads(jouer("trier-pdf.py", p(n)).stdout)

    t = tri("natif.pdf")
    controle("tri : natif", t["nature"] == "natif" and t["pages"][0]["part_image"] == 0, str(t["pages"][0]))
    t = tri("scan.pdf")
    controle("tri : scan, image mesurée sur toute la page", t["nature"] == "scan" and t["pages"][0]["part_image"] > 0.9, str(t["pages"][0]))
    controle("tri : scan envoyé à l'OCR", any(v["voie"] == "ocr" for v in t["voies"]), str(t["voies"]))
    t = tri("couche.pdf")
    controle("tri : scan à couche de texte, hybride", t["pages"][0]["nature"] == "hybride", str(t["pages"][0]))
    t = tri("mixte.pdf")
    controle("tri : page par page, document hybride", [x["nature"] for x in t["pages"]] == ["natif", "scan", "vide"] and t["nature"] == "hybride", str(t["pages"]))
    t = tri("dessin.pdf")
    controle("tri : dessin sans texte, ni scan ni vide", t["pages"][0]["nature"] == "vectoriel", str(t["pages"][0]))
    t = tri("plat-vierge.pdf")
    controle("tri : formulaire plat vu malgré zéro champ", t["formulaire_plat"]["probable"] and any(v["voie"] == "remplir_plat" for v in t["voies"]), str(t["formulaire_plat"]))
    t = tri("natif.pdf")
    controle("tri : un texte courant n'est pas un formulaire plat", not t["formulaire_plat"]["probable"], str(t["formulaire_plat"]))
    t = tri("facture.pdf")
    controle("tri : une facture à filets n'est pas un formulaire plat", not t["formulaire_plat"]["probable"], str(t["formulaire_plat"]))
    t = tri("champs-vierge.pdf")
    controle("tri : formulaire à champs", any(v["voie"] == "remplir_champs" for v in t["voies"]) and t["champs"].get("texte") == 4, str(t["champs"]))
    r = jouer("trier-pdf.py", p("absent.pdf"))
    controle("tri : fichier absent refusé", r.returncode == 2, r.stdout[-200:])

    # Lecture sans moteur : une page non lue se déclare, elle ne disparaît pas.
    r = jouer("lire-pdf.py", p("mixte.pdf"), "--moteur", "aucun", "--out", p("m.md"))
    b = json.loads(r.stdout)
    contenu = open(p("m.md"), encoding="utf-8").read()
    controle("lecture sans moteur : page 2 déclarée illisible, exit 1", r.returncode == 1 and b["pages_illisibles"] == [2] and "[page illisible" in contenu and "Hélène Dupré" in contenu, r.stdout[-300:])
    controle("lecture : bilan pour ENTRANT.md (outil, date, pages illisibles)", b["outil"].endswith("lire-pdf.py") and b["date"] and "pages_illisibles" in b, str(b))
    r = jouer("lire-pdf.py", p("mixte.pdf"), "--moteur", "aucun", "--images", p("illisibles"))
    controle("lecture : image déposée pour une page illisible", os.path.isfile(os.path.join(p("illisibles"), "page-00002.png")), r.stdout[-200:])
    r = jouer("lire-pdf.py", p("natif.pdf"), "--pages", "1", "--moteur", "aucun", "--out", p("n.md"))
    controle("lecture : natif sans moteur, exit 0", r.returncode == 0 and "Hélène Dupré" in open(p("n.md"), encoding="utf-8").read(), r.stdout[-200:])

    # Avec moteur, s'il y en a un sur ce poste.
    r = jouer("lire-pdf.py", p("scan.pdf"), "--out", p("s.md"))
    b = json.loads(r.stdout)
    if b.get("moteur"):
        lu = open(p("s.md"), encoding="utf-8").read()
        controle(f"OCR ({b['moteur']}) : le scan se lit, accents compris", r.returncode == 0 and "Hélène" in lu and "1 245,50" in lu, lu[:200])
        r = jouer("lire-pdf.py", p("travers.pdf"), "--json", p("t.json"))
        q = json.load(open(p("t.json"), encoding="utf-8"))
        controle("OCR : page de travers retournée puis lue", r.returncode == 0 and q["pages"][0].get("rotation_appliquee") in (90, 270) and "Hélène" in q["pages"][0]["texte"], str(q["bilan"]))
    else:
        controle("OCR : aucun moteur sur ce poste, déclaré et non compté comme lu", r.returncode == 1 and b["pages_illisibles"] == [1], r.stdout[-200:])
