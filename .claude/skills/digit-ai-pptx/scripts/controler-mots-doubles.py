#!/usr/bin/env python3
"""controler-mots-doubles.py - un mot repete dans le texte d'un PDF exporte (TF-2354).

LE FAIT (retour du 16/09/2026). Sans la police exigee sur le poste de rendu, PowerPoint substitue une autre
face, et l'export PDF repete le dernier mot de chaque ligne coupee. Le defaut est invisible a oracle-pptx et
a oracle-charte-pptx-semantique, qui lisent le PPTX, pas le PDF : il n'a ete vu qu'a l'oeil, sur une planche.

CE QUE FAIT LE SCRIPT. Il lit le texte du PDF page par page, ligne par ligne, et releve deux choses :
  - un mot repete dans la meme ligne (« le delai delai est tenu ») ;
  - le dernier mot d'une ligne repete en tete de la ligne suivante du meme bloc (« … en trois » / « trois etapes »).
Les doublons que le francais admet (« nous nous », « vous vous », « tres tres », « peu peu ») et les nombres
ne comptent pas. Un mot d'une seule lettre ne compte pas non plus.

CE QU'IL NE FAIT PAS. Il ne dit pas que la police est substituee : il dit que le texte du PDF porte des
doublons, et renvoie a la verification des polices (lire-marque.mjs, champ polices_poste). Un doublon que
le texte source porte vraiment (une coquille de l'auteur) sort aussi : il se corrige a la source.

LECTEUR DE PDF. PyMuPDF si present, sinon pypdf, sinon `pdftotext`. Aucun : exit 2, sans conclure.

Usage : python controler-mots-doubles.py <deck.pdf> [--tolerance N]
  --tolerance N   nombre de doublons admis avant FAIL (defaut 0)
Sortie : une ligne JSON sur stdout. Exit 0 (aucun doublon) / 1 (doublons) / 2 (PDF absent, illisible, ou aucun lecteur).
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

ADMIS = {"nous", "vous", "tres", "très", "bien", "ça"}
RE_MOT = re.compile(r"[^\W\d_]+(?:['’-][^\W\d_]+)*", re.UNICODE)


def pages_pymupdf(chemin):
    try:
        import pymupdf as fitz  # type: ignore
    except ImportError:
        try:
            import fitz  # type: ignore
        except ImportError:
            return None
    doc = fitz.open(chemin)
    try:
        # un « bloc » de PyMuPDF est un paragraphe de la page : les lignes y sont ordonnees
        return [[[ligne for ligne in bloc[4].split("\n") if ligne.strip()] for bloc in page.get_text("blocks") if bloc[6] == 0] for page in doc]
    finally:
        doc.close()


def pages_pypdf(chemin):
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError:
        return None
    return [[[ligne for ligne in (page.extract_text() or "").split("\n") if ligne.strip()]] for page in PdfReader(chemin).pages]


def pages_pdftotext(chemin):
    exe = shutil.which("pdftotext")
    if not exe:
        return None
    r = subprocess.run([exe, "-layout", chemin, "-"], capture_output=True, timeout=120)
    if r.returncode != 0:
        return None
    return [[[ligne for ligne in page.decode("utf-8", "replace").split("\n") if ligne.strip()]] for page in r.stdout.split(b"\f") if page.strip()]


def mots(ligne):
    return [m.group(0) for m in RE_MOT.finditer(ligne)]


def doublon(a, b):
    a, b = a.lower(), b.lower()
    return a == b and len(a) > 1 and a not in ADMIS


def releve(pages):
    trouves = []
    for num, blocs in enumerate(pages, 1):
        for lignes in blocs:
            precedente = None
            for ligne in lignes:
                m = mots(ligne)
                for i in range(1, len(m)):
                    if doublon(m[i - 1], m[i]):
                        trouves.append({"page": num, "type": "meme ligne", "mot": m[i], "ligne": ligne.strip()[:100]})
                if precedente and m and precedente and doublon(precedente[-1], m[0]):
                    trouves.append({"page": num, "type": "fin de ligne repetee en tete de la suivante", "mot": m[0], "ligne": ligne.strip()[:100]})
                precedente = m or precedente
    return trouves


def main():
    ap = argparse.ArgumentParser(description="Releve les mots doubles du texte d'un PDF exporte.")
    ap.add_argument("pdf", help="PDF exporte du deck")
    ap.add_argument("--tolerance", type=int, default=0, help="doublons admis avant FAIL")
    a = ap.parse_args()

    def fin(rapport, code):
        sys.stdout.write(json.dumps(rapport, ensure_ascii=False) + "\n")
        sys.exit(code)

    if not os.path.isfile(a.pdf):
        fin({"etat": "non-joue", "motif": "PDF absent : " + a.pdf}, 2)
    pages, lecteur = None, None
    for nom, lire in (("PyMuPDF", pages_pymupdf), ("pypdf", pages_pypdf), ("pdftotext", pages_pdftotext)):
        try:
            pages = lire(a.pdf)
        except Exception as e:  # PDF illisible par ce lecteur : le suivant essaie
            pages = None
            derniere = str(e)[:120]
        if pages is not None:
            lecteur = nom
            break
    if pages is None:
        fin({"etat": "non-joue", "motif": "aucun lecteur de PDF n'a pu lire " + a.pdf + " (PyMuPDF, pypdf, pdftotext) : pip install pymupdf"}, 2)
    trouves = releve(pages)
    texte = sum(len(l) for p in pages for b in p for l in b)
    if not texte:
        fin({"etat": "non-joue", "motif": "le PDF ne porte aucune ligne de texte extractible (images seules ?) : rien n'est juge", "lecteur": lecteur}, 2)
    rapport = {"etat": "juge", "lecteur": lecteur, "pages": len(pages), "doublons": len(trouves), "constats": trouves[:20],
               "constats_non_listes": max(0, len(trouves) - 20),
               "non_juge": ["la cause : un doublon est un symptome de police substituee, pas une preuve (verifier polices_poste de lire-marque.mjs)",
                            "un mot repete qui n'est ni en fin ni en tete de ligne, ou separe par une ponctuation, n'est pas releve"]}
    if len(trouves) > a.tolerance:
        rapport["verdict"] = "FAIL"
        rapport["remede"] = "verifier que les polices exigees sont installees au poste de rendu (node scripts/lire-marque.mjs, champ polices_poste), puis re-exporter"
        fin(rapport, 1)
    rapport["verdict"] = "PASS"
    fin(rapport, 0)


if __name__ == "__main__":
    main()
