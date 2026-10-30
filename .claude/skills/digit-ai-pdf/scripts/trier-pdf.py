#!/usr/bin/env python
# trier-pdf.py — dit ce qu'est un PDF, page par page, et quelle voie suivre (TF-2031, lot 2).
#
#   python trier-pdf.py <fichier.pdf> [--max-pages-plat 10]
#
# Rend sur stdout un JSON : nature de chaque page (natif, scan, hybride, vide, vectoriel), couche de
# texte douteuse, chiffrement, signatures, XFA, champs par type, indices d'un formulaire PLAT, voies.
# Le formulaire plat est le piège mesuré : il n'a aucun champ, 2 des 3 PDF réellement demandés
# l'étaient, et un tri naïf le rend « natif » (étude 20261030a, M-05 et risque « formulaire invisible »).
#
# Type TECHNIQUE seulement : facture, bail ou CV relèvent du lot 3, ouvert sur 3 demandes relevées.
# Exit : 0 trié · 2 fichier illisible, protégé par mot de passe ou dépendance absente.
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_pdf import est_xfa, exiger, herite, inventaire_champs, nature_page, widgets

LIBELLES = re.compile(r"\b(nom|prénom|prenom|adresse|date|signature|fait à|fait a|lu et approuvé|iban|bic|"
                      r"n°|téléphone|telephone|courriel|e-mail|code postal|ville|montant|référence)\b", re.I)
GUIDE = re.compile(r"(_{5,}|\.{5,}|…{3,}|\s\.\s\.\s\.\s\.\s)")
CASE = re.compile(r"[☐□❏❑▢]")


def refuser(msg):
    print(json.dumps({"verdict": "REFUS", "motif": msg}, ensure_ascii=False))
    sys.exit(2)


def indices_plat(chemin, max_pages):
    """Signaux d'un formulaire sans champ : libellés, lignes de saisie et petites cases dessinées."""
    import pdfplumber
    guides = libelles = cases = lignes = 0
    with pdfplumber.open(chemin) as pdf:
        for p in pdf.pages[:max_pages]:
            texte = p.extract_text() or ""
            guides += len(GUIDE.findall(texte))
            libelles += len(LIBELLES.findall(texte))
            cases += len(CASE.findall(texte))
            for r in p.rects:
                l_, h_ = r["x1"] - r["x0"], r["bottom"] - r["top"]
                if 5 <= l_ <= 20 and 5 <= h_ <= 20 and abs(l_ - h_) <= 2:
                    cases += 1
            mots = p.extract_words()
            for l in p.lines:
                if abs(l["top"] - l["bottom"]) >= 1.5 or not 40 < l["x1"] - l["x0"] < 450:
                    continue
                # Une ligne à remplir est VIDE au-dessus : le filet d'un tableau porte sa cellule.
                dessus = [m for m in mots if m["x1"] > l["x0"] and m["x0"] < l["x1"] and 0 <= l["top"] - m["bottom"] <= 12]
                if not dessus:
                    lignes += 1
    saisie = guides + lignes
    return {"probable": libelles >= 2 and (saisie >= 2 or cases >= 2), "libelles": libelles,
            "guides": guides, "lignes_vides": lignes, "cases": cases}


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Tri technique d'un PDF, page par page.")
    ap.add_argument("pdf")
    ap.add_argument("--max-pages-plat", type=int, default=10)
    a = ap.parse_args()
    manque = exiger("pypdf", "pypdfium2", "pdfplumber")
    if manque:
        refuser(f"dépendances absentes : {', '.join(manque)} (pip install pypdf pypdfium2 pdfplumber)")
    if not os.path.isfile(a.pdf):
        refuser(f"fichier introuvable : {a.pdf}")
    import pypdfium2 as pdfium
    from pypdf import PdfReader
    try:
        r = PdfReader(a.pdf)
        chiffre = bool(r.is_encrypted)
        if chiffre and not r.decrypt(""):
            print(json.dumps({"fichier": os.path.basename(a.pdf), "chiffre": True, "mot_de_passe": True,
                              "voies": [{"voie": "deverrouiller", "pourquoi": "protégé par un mot de passe : à demander à son détenteur, jamais contourné"}]}, ensure_ascii=False, indent=1))
            sys.exit(2)
        doc = pdfium.PdfDocument(a.pdf)
    except SystemExit:
        raise
    except Exception as e:
        refuser(f"PDF illisible : {e}")
    pages = []
    comptes = {}
    try:
        for i in range(len(doc)):
            page = doc[i]
            nature, n, img, douteuse = nature_page(page)
            pages.append({"page": i + 1, "nature": nature, "caracteres": n, "part_image": img, "couche_douteuse": douteuse})
            comptes[nature] = comptes.get(nature, 0) + 1
            page.close()
    finally:
        doc.close()
    inv = inventaire_champs(r)
    types = {}
    for c in inv.values():
        types[c["type"]] = types.get(c["type"], 0) + 1
    saisie = sum(types.get(t, 0) for t in ("texte", "case", "radio", "liste"))
    signes = sum(1 for _, _, an in widgets(r) if herite(an, "/FT") == "/Sig" and herite(an, "/V") is not None)
    xfa = est_xfa(r)
    plat = indices_plat(a.pdf, a.max_pages_plat) if not saisie else {"probable": False}

    # Document : la nature majoritaire, et « hybride » dès que natif et scan se mêlent.
    utiles = {k: v for k, v in comptes.items() if k != "vide"}
    if not utiles:
        doc_nature = "vide"
    elif len(utiles) == 1:
        doc_nature = next(iter(utiles))
    else:
        doc_nature = "hybride"

    voies = []
    if xfa:
        voies.append({"voie": "xfa", "pourquoi": "formulaire XML : ni rempli ni jugé ici, à ouvrir dans Acrobat ou à demander en AcroForm"})
    if signes:
        voies.append({"voie": "signe", "pourquoi": f"{signes} signature(s) posée(s) : toute écriture la casserait, lire seulement"})
    if saisie and not xfa:
        voies.append({"voie": "remplir_champs", "commande": "formulaire.py relever puis remplir, oracle enchaîné"})
    if plat.get("probable"):
        voies.append({"voie": "remplir_plat", "pourquoi": "aucun champ, mais des libellés et des lignes ou des cases : formulaire plat probable", "commande": "formulaire.py relever --png, poser les boîtes, remplir"})
    a_ocr = [p["page"] for p in pages if p["nature"] in ("scan", "vectoriel") or p["couche_douteuse"]]
    if a_ocr:
        voies.append({"voie": "ocr", "pages": a_ocr, "commande": "lire-pdf.py, moteur auto"})
    if any(p["nature"] in ("natif", "hybride") and not p["couche_douteuse"] for p in pages):
        voies.append({"voie": "lire_texte", "commande": "lire-pdf.py"})
    print(json.dumps({"fichier": os.path.basename(a.pdf), "pages_total": len(pages), "nature": doc_nature,
                      "comptes": comptes, "chiffre": chiffre, "signatures_posees": signes, "xfa": xfa,
                      "champs": types, "formulaire_plat": plat, "voies": voies, "pages": pages}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
