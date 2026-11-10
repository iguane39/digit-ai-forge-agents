#!/usr/bin/env python3
"""gen-pdf.py - regenere les deux PDF de jeu de controler-mots-doubles.py (TF-2354). Necessite PyMuPDF.

  export-sain.pdf          : texte francais sans doublon, avec un doublon admis (« nous nous »)
  export-mots-doubles.pdf  : le defaut du 16/09/2026 rejoue : le dernier mot de chaque ligne coupee repete
                             en tete de la suivante, et un mot repete dans une meme ligne

Les PDF sont versionnes (quelques Ko, deterministes au contenu pres) : le self-test ne depend pas de
PyMuPDF pour les LIRE, seulement ce script pour les refaire. Usage : python gen-pdf.py
"""
import os
import sys

import pymupdf as fitz

ICI = os.path.dirname(os.path.abspath(__file__))

SAIN = [
    "Le déploiement se fait en trois étapes validées par le comité",
    "de pilotage, puis nous nous engageons sur le calendrier arrêté",
    "avec chaque équipe concernée avant la mise en service.",
]
DOUBLE = [
    "Le déploiement se fait en trois trois",
    "trois étapes validées par le comité de",
    "de pilotage, puis le calendrier calendrier est arrêté",
    "avec chaque équipe concernée avant la mise en service.",
]


def ecrire(nom, lignes):
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    rect = fitz.Rect(72, 72, 523, 300)
    # un seul bloc : les lignes se suivent comme dans un paragraphe exporte
    page.insert_textbox(rect, "\n".join(lignes), fontsize=12, fontname="helv")
    doc.set_metadata({"title": nom})
    doc.save(os.path.join(ICI, nom), deflate=True, garbage=4)
    doc.close()


if __name__ == "__main__":
    ecrire("export-sain.pdf", SAIN)
    ecrire("export-mots-doubles.pdf", DOUBLE)
    sys.stdout.write("ok\n")
