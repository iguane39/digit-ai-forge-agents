#!/usr/bin/env python
# lire-pdf.py — convertit un PDF en texte, couche de texte ou OCR selon la page (TF-2031, lot 2).
#
#   python lire-pdf.py <fichier.pdf> --out texte.md [--moteur auto|windows|tesseract|aucun]
#                      [--pages 1-5,9] [--dpi 200] [--forcer-ocr] [--tableaux] [--images <dossier>]
#                      [--images-ocr]
#
# Chaque page dit sa voie. Une page qu'aucun moteur ne lit se déclare illisible, jamais vide : la
# conversion se déclare en section 2 d'ENTRANT.md (qualifie-l-entrant) par son outil, sa date et ses
# pages illisibles. --images dépose le PNG de ces pages : la session les lit alors comme images.
# --images-ocr y ajoute chaque page passée par l'OCR : un chiffre qui engage s'y relit (banc : 45 à
# 90 % des nombres retrouvés par OCR selon le scan et le moteur, 93 à 95 % par lecture d'image).
#
# Moteur auto : Windows si le français y est installé, sinon `tesseract` s'il est au PATH (langue fra).
# Le choix vient du banc de references/banc-ocr-20261030.md, jamais d'un chiffre de la littérature.
# Exit : 0 tout lu · 1 au moins une page illisible · 2 usage, fichier refusé ou dépendance absente.
import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
from lib_pdf import ecrire_json, exiger, nature_page, plausibilite

SEUIL_PLAUSIBLE = 0.5
MIN_CARACTERES_OCR = 15
ANGLES_OCR = (90, 270, 180)


def refuser(msg):
    print(json.dumps({"verdict": "REFUS", "motif": msg}, ensure_ascii=False))
    sys.exit(2)


def tesseract_binaire():
    t = shutil.which("tesseract")
    if t:
        return t
    for p in (r"C:\Program Files\Tesseract-OCR\tesseract.exe", r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"):
        if os.path.isfile(p):
            return p
    return None


def ocr_windows(images):
    """Rend {chemin: texte}, ou None si le moteur ou la langue manquent sur ce poste."""
    if os.name != "nt":
        return None
    d = tempfile.mkdtemp(prefix="digit-ai-pdf-ocr-")
    try:
        liste = os.path.join(d, "liste.json")
        sortie = os.path.join(d, "sortie.json")
        with open(liste, "w", encoding="utf-8") as f:
            json.dump(images, f)
        r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(ICI, "ocr-windows.ps1"), liste, sortie],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode or not os.path.isfile(sortie):
            return None
        with open(sortie, encoding="utf-8-sig") as f:
            return {x["chemin"]: x["texte"] or "" for x in json.load(f)}
    finally:
        shutil.rmtree(d, ignore_errors=True)


def ocr_tesseract(images):
    binaire = tesseract_binaire()
    if not binaire:
        return None
    res = {}
    for p in images:
        r = subprocess.run([binaire, p, "stdout", "-l", "fra"], capture_output=True)
        if r.returncode:
            return None
        res[p] = r.stdout.decode("utf-8", "replace")
    return res


MOTEURS = {"windows": ocr_windows, "tesseract": ocr_tesseract}


def choisir_moteur(demande, essai):
    """Le premier moteur qui répond sur une vraie image. L'absence se mesure, elle ne se suppose pas."""
    if demande == "aucun":
        return None
    for nom in ([demande] if demande != "auto" else ["windows", "tesseract"]):
        if MOTEURS[nom]([essai]) is not None:
            return nom
    return None


def pages_voulues(spec, total):
    if not spec:
        return list(range(1, total + 1))
    sortie = []
    for bloc in spec.split(","):
        if "-" in bloc:
            a, b = bloc.split("-", 1)
            sortie += list(range(int(a), int(b) + 1))
        else:
            sortie.append(int(bloc))
    return [n for n in sortie if 1 <= n <= total]


def rendre(page, chemin, dpi, rotation=0):
    page.render(scale=dpi / 72, rotation=rotation, may_draw_forms=False, grayscale=True).to_pil().convert("L").save(chemin)


def tableaux_md(chemin, n):
    import pdfplumber
    sortie = []
    with pdfplumber.open(chemin) as pdf:
        for t in pdf.pages[n - 1].extract_tables():
            if not t or len(t) < 2:
                continue
            ligne = lambda r: "| " + " | ".join((c or "").replace("\n", " ").strip() for c in r) + " |"
            sortie.append("\n".join([ligne(t[0]), "|" + "---|" * len(t[0])] + [ligne(r) for r in t[1:]]))
    return sortie


def main():
    ap = argparse.ArgumentParser(description="Convertit un PDF en texte, couche de texte ou OCR selon la page.")
    ap.add_argument("pdf")
    ap.add_argument("--out")
    ap.add_argument("--moteur", choices=["auto", "windows", "tesseract", "aucun"], default="auto")
    ap.add_argument("--pages")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--forcer-ocr", action="store_true")
    ap.add_argument("--tableaux", action="store_true")
    ap.add_argument("--images")
    ap.add_argument("--images-ocr", action="store_true")
    ap.add_argument("--json")
    a = ap.parse_args()
    manque = exiger("pypdfium2", "PIL") + (exiger("pdfplumber") if a.tableaux else [])
    if manque:
        refuser(f"dépendances absentes : {', '.join(manque)}")
    if not os.path.isfile(a.pdf):
        refuser(f"fichier introuvable : {a.pdf}")
    import pypdfium2 as pdfium
    try:
        doc = pdfium.PdfDocument(a.pdf)
    except Exception as e:
        refuser(f"PDF illisible ou protégé par un mot de passe : {e}")
    total = len(doc)
    voulues = pages_voulues(a.pages, total)
    d = tempfile.mkdtemp(prefix="digit-ai-pdf-lire-")
    pages, a_ocr = {}, []
    moteur, moteur_cherche = None, False
    try:
        for n in voulues:
            page = doc[n - 1]
            nature, _, _, douteuse = nature_page(page)
            if nature == "vide":
                pages[n] = {"page": n, "voie": "vide", "texte": ""}
            elif nature in ("natif", "hybride") and not douteuse and not a.forcer_ocr:
                pages[n] = {"page": n, "voie": "couche", "texte": page.get_textpage().get_text_bounded().strip(), "nature": nature}
            else:
                a_ocr.append(n)
                pages[n] = {"page": n, "voie": "ocr", "texte": "", "nature": nature, "couche_douteuse": douteuse}
            page.close()
        if a_ocr:
            images = {}
            for n in a_ocr:
                images[n] = os.path.join(d, f"p{n:05d}.png")
                rendre(doc[n - 1], images[n], a.dpi)
            moteur = choisir_moteur(a.moteur, images[a_ocr[0]])
            moteur_cherche = True
            lus = MOTEURS[moteur](list(images.values())) if moteur else {}
            for n in a_ocr:
                texte = (lus or {}).get(images[n], "").strip()
                # Page de travers : on ne retourne l'image que si la première lecture ne vaut rien.
                if moteur and (plausibilite(texte) < SEUIL_PLAUSIBLE or len(texte) < MIN_CARACTERES_OCR):
                    meilleur = plausibilite(texte) * len(texte)
                    for angle in ANGLES_OCR:
                        essai = os.path.join(d, f"p{n:05d}-{angle}.png")
                        rendre(doc[n - 1], essai, a.dpi, rotation=angle)
                        autre = (MOTEURS[moteur]([essai]) or {}).get(essai, "").strip()
                        if plausibilite(autre) * len(autre) > meilleur:
                            meilleur = plausibilite(autre) * len(autre)
                            texte = autre
                            pages[n]["rotation_appliquee"] = angle
                pages[n]["texte"] = texte
                pages[n]["plausibilite"] = plausibilite(texte)
                if not moteur:
                    pages[n]["voie"] = "illisible"
                    pages[n]["motif"] = "aucun moteur d'OCR sur ce poste"
                elif len(texte) < MIN_CARACTERES_OCR or plausibilite(texte) < SEUIL_PLAUSIBLE:
                    pages[n]["voie"] = "illisible"
                    pages[n]["motif"] = f"lecture {moteur} inexploitable, plausibilité {plausibilite(texte)}"
                else:
                    pages[n]["voie"] = f"ocr-{moteur}"
            illisibles = [n for n in a_ocr if pages[n]["voie"] == "illisible"]
            a_deposer = a_ocr if a.images_ocr else illisibles
            if a.images and a_deposer:
                os.makedirs(a.images, exist_ok=True)
                for n in a_deposer:
                    cible = os.path.join(a.images, f"page-{n:05d}.png")
                    shutil.copyfile(images[n], cible)
                    pages[n]["image"] = cible
        illisibles = [n for n in voulues if pages[n]["voie"] == "illisible"]
        if a.tableaux:
            for n in voulues:
                if pages[n]["voie"] == "couche":
                    t = tableaux_md(a.pdf, n)
                    if t:
                        pages[n]["tableaux"] = t
    finally:
        doc.close()
        shutil.rmtree(d, ignore_errors=True)

    voies = {}
    for n in voulues:
        voies[pages[n]["voie"]] = voies.get(pages[n]["voie"], 0) + 1
    bilan = {"outil": "digit-ai-pdf/lire-pdf.py", "date": datetime.date.today().isoformat(), "fichier": os.path.basename(a.pdf),
             "pages_total": total, "pages_lues": len(voulues), "voies": voies, "moteur": moteur if moteur_cherche else None,
             "pages_illisibles": illisibles}
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        with open(a.out, "w", encoding="utf-8", newline="\n") as f:
            f.write(f"<!-- Conversion : {bilan['outil']}, {bilan['date']}, moteur {bilan['moteur'] or 'aucun appelé'}, pages illisibles : {illisibles or 'aucune'} -->\n\n")
            for n in voulues:
                p = pages[n]
                f.write(f"## Page {n} ({p['voie']})\n\n")
                if p["voie"] == "illisible":
                    f.write(f"[page illisible : {p['motif']}]\n\n")
                    continue
                f.write(p["texte"] + "\n\n")
                for t in p.get("tableaux", []):
                    f.write(t + "\n\n")
        bilan["sortie"] = a.out
    if a.json:
        ecrire_json(a.json, {"bilan": bilan, "pages": [pages[n] for n in voulues]})
    print(json.dumps(bilan, ensure_ascii=False, indent=1))
    sys.exit(1 if illisibles else 0)


if __name__ == "__main__":
    main()
