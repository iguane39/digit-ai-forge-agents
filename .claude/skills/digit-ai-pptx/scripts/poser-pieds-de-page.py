#!/usr/bin/env python3
"""poser-pieds-de-page.py - pose les espaces reserves de pied de page et de pagination (TF-1382).

LE FAIT (lot Produit-68 - RETOURS - 20260926a, RG-14). Le skill prescrit pptxgenjs, dont la liste des
types d'espaces reserves (title, body, pic, chart, tbl, media) ne porte ni `ftr` ni `sldNum`, et la
regle S4 d'oracle-charte-pptx-semantique exige l'un et l'autre sur chaque diapositive de contenu.
Un deck construit comme le skill le prescrit echouait donc a S4, et le skill ne livrait aucune etape
pour le corriger : le produit en ecrivait une, 23 pieds poses sur une remise.

CE QUE FAIT LE SCRIPT. Le script de generation nomme ses deux formes avec l'option `objectName` de
pptxgenjs : « Pied de page » et « Pagination » (noms par defaut, modifiables). Ici, chaque forme
portant l'un de ces noms devient l'espace reserve correspondant (`ftr`, `sldNum`) : sa position, son
texte et sa mise en forme ne changent pas, seule sa balise `<p:nvPr>` recoit le `<p:ph>`. Une forme
qui porte deja un espace reserve n'est pas touchee. Le deck d'origine n'est jamais modifie : le
resultat part vers `--out`, qui ne doit pas exister.

Sortie : une ligne JSON sur stdout. Codes : 0 au moins un espace reserve pose ou deja present ;
1 aucune forme nommee dans tout le deck (le script de generation ne les nomme pas : le dire, ne rien
inventer) ; 2 usage incorrect, deck illisible ou sortie deja existante.
"""
import argparse
import html
import json
import os
import re
import sys
import zipfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

NOM_PIED = "Pied de page"
NOM_PAGINATION = "Pagination"
# idx conventionnels de PowerPoint pour le pied de page et le numero de diapositive
IDX = {"ftr": 11, "sldNum": 12}
RE_SP = re.compile(r"<p:sp>.*?</p:sp>", re.S)
RE_NOM = re.compile(r'<p:cNvPr\b[^>]*?\bname="([^"]*)"')
RE_NVPR_VIDE = re.compile(r"<p:nvPr\s*(?:/>|>\s*</p:nvPr>)")


def poser(xml, nom_pied, nom_page):
    etat = {"ftr": False, "sldNum": False}

    def une_forme(m):
        sp = m.group(0)
        n = RE_NOM.search(sp)
        if not n:
            return sp
        nom = html.unescape(n.group(1))
        type_ph = "ftr" if nom == nom_pied else "sldNum" if nom == nom_page else None
        if not type_ph:
            return sp
        if "<p:ph" in sp:
            etat[type_ph] = True  # deja un espace reserve : rien a poser
            return sp
        ph = '<p:nvPr><p:ph type="%s" sz="quarter" idx="%d"/></p:nvPr>' % (type_ph, IDX[type_ph])
        neuf, k = RE_NVPR_VIDE.subn(ph, sp, count=1)
        if k:
            etat[type_ph] = True
            return neuf
        return sp  # nvPr non vide et sans espace reserve : forme inattendue, laissee telle quelle

    return RE_SP.sub(une_forme, xml), etat


def main():
    ap = argparse.ArgumentParser(description="Pose les espaces reserves ftr et sldNum d'un deck pptxgenjs.")
    ap.add_argument("deck", help="deck .pptx construit par pptxgenjs")
    ap.add_argument("-o", "--out", required=True, help="deck de sortie (ne doit pas exister)")
    ap.add_argument("--pied", default=NOM_PIED, help="objectName de la forme de pied de page")
    ap.add_argument("--pagination", default=NOM_PAGINATION, help="objectName de la forme de pagination")
    a = ap.parse_args()

    def fin(rapport, code):
        sys.stdout.write(json.dumps(rapport, ensure_ascii=False) + "\n")
        sys.exit(code)

    if not os.path.isfile(a.deck):
        fin({"etat": "non-joue", "motif": "deck absent : " + a.deck}, 2)
    if os.path.exists(a.out):
        fin({"etat": "non-joue", "motif": "la sortie existe deja, rien n'est ecrase : " + a.out}, 2)
    try:
        src = zipfile.ZipFile(a.deck)
    except zipfile.BadZipFile:
        fin({"etat": "non-joue", "motif": "deck illisible (pas un zip) : " + a.deck}, 2)

    diapos = []
    sortie = zipfile.ZipFile(a.out, "w", zipfile.ZIP_DEFLATED)
    try:
        for info in src.infolist():
            donnees = src.read(info.filename)
            if re.fullmatch(r"ppt/slides/slide\d+\.xml", info.filename):
                xml, etat = poser(donnees.decode("utf-8"), a.pied, a.pagination)
                donnees = xml.encode("utf-8")
                diapos.append({"fichier": os.path.basename(info.filename), "pied": etat["ftr"], "pagination": etat["sldNum"]})
            sortie.writestr(info, donnees, compress_type=zipfile.ZIP_DEFLATED)
    finally:
        sortie.close()
        src.close()

    diapos.sort(key=lambda d: int(re.search(r"\d+", d["fichier"]).group()))
    posees = sum(1 for d in diapos if d["pied"]) + sum(1 for d in diapos if d["pagination"])
    sans = [d["fichier"] for d in diapos[1:] if not (d["pied"] and d["pagination"])]
    if not posees:
        os.remove(a.out)
        fin({"etat": "rien-a-poser", "motif": "aucune forme nommee « %s » ou « %s » dans le deck : le script de generation doit les nommer (objectName)" % (a.pied, a.pagination),
             "diapositives": diapos}, 1)
    fin({"etat": "pose", "sortie": a.out, "formes_devenues_espaces_reserves": posees,
         "diapositives_hors_couverture_sans_pied_ou_pagination": sans, "diapositives": diapos}, 0)


if __name__ == "__main__":
    main()
