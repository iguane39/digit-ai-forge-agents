#!/usr/bin/env python3
"""controler-grilles.py - une grille par famille de pages soeurs, aucune barre laterale accolee (TF-2374).

LE FAIT (29/09/2026, seq 444). La charte des diapositives ne disait rien des cartes a hauteur fixe, des pages
soeurs ni des barres laterales. Les 5 pages d'evolution d'une propale suivaient 2 grilles (cartes de 1,98 puis
1,62 po, un bandeau qui saute de 0,36 po) et portaient 9 barres laterales, sans qu'aucune regle ni aucun
oracle ne le dise. L'equivalent pour le HTML, S1 d'oracle-slop, ne lit que du HTML.

CE QUE FAIT LE SCRIPT (geometrie du PPTX, en pouces ; 914400 EMU par pouce) :
  B  barre laterale : une forme sans texte et sans espace reserve, haute et fine (largeur <= 0,15 po, hauteur
     >= 0,3 po), dont un cote touche (a 0,05 po pres) un cote vertical d'un bloc plus large, avec au moins 70 %
     de recouvrement vertical. Les filets horizontaux (haut et bas de slide) ne sont pas des barres.
  G  grille d'une famille : pour les diapositives d'une meme famille (--familles), le jeu des hauteurs de
     carte, la largeur des cartes, la position haute de la premiere rangee et la position du bandeau doivent
     etre les memes, a 0,02 po pres. Une carte est une forme d'au moins 1 po de large et 0,8 po de haut qui
     n'est ni un espace reserve ni un bandeau ; un bandeau est une forme d'au moins 80 % de la largeur de la
     diapositive et d'au plus 0,8 po de haut, hors des 0,5 po du haut et du bas.

CE QU'IL NE JUGE PAS. Qu'une famille soit bien declaree : sans --familles, seul B est joue et le dit. La
justesse de la grille choisie (c'est la regle de references/layouts.md qui la fixe), le rendu, l'alignement du texte.

Usage : python controler-grilles.py <deck.pptx> [--familles '{"evolution": [3, 4, 5]}' | --familles <fichier.json>]
  --familles  numeros (a partir de 1) des diapositives de chaque famille de pages soeurs
Sortie : une ligne JSON sur stdout. Exit 0 conforme / 1 constats / 2 usage, deck illisible.
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

EMU = 914400.0
RE_SP = re.compile(r"<p:sp>.*?</p:sp>", re.S)
RE_NOM = re.compile(r'<p:cNvPr\b[^>]*?\bname="([^"]*)"')
RE_OFF = re.compile(r'<a:off x="(-?\d+)" y="(-?\d+)"\s*/>\s*<a:ext cx="(\d+)" cy="(\d+)"\s*/>')
RE_TEXTE = re.compile(r"<a:t(?:\s[^>]*)?>([^<]*)</a:t>")
RE_LETTRE = re.compile(r"[^\W\d_]", re.U)
RE_TAILLE = re.compile(r'<p:sldSz cx="(\d+)" cy="(\d+)"')


def formes(xml):
    out = []
    for m in RE_SP.finditer(xml):
        sp = m.group(0)
        g = RE_OFF.search(sp)
        if not g:
            continue
        x, y, w, h = [int(v) / EMU for v in g.groups()]
        nom = RE_NOM.search(sp)
        out.append({
            "nom": html.unescape(nom.group(1)) if nom else "?",
            "x": x, "y": y, "w": w, "h": h,
            "texte": any(RE_LETTRE.search(html.unescape(t)) for t in RE_TEXTE.findall(sp)),
            "ph": "<p:ph" in sp,
        })
    return out


def barres_laterales(fs):
    constats = []
    blocs = [f for f in fs if f["w"] >= 0.8 and f["h"] >= 0.5 and not f["ph"]]
    for b in fs:
        if b["texte"] or b["ph"] or b["w"] > 0.15 or b["h"] < 0.3:
            continue
        for k in blocs:
            if k is b:
                continue
            recouvre = min(b["y"] + b["h"], k["y"] + k["h"]) - max(b["y"], k["y"])
            if recouvre < 0.7 * min(b["h"], k["h"]):
                continue
            colle_gauche = abs((b["x"] + b["w"]) - k["x"]) <= 0.05 or abs(b["x"] - k["x"]) <= 0.02
            colle_droite = abs(b["x"] - (k["x"] + k["w"])) <= 0.05 or abs((b["x"] + b["w"]) - (k["x"] + k["w"])) <= 0.02
            if colle_gauche or colle_droite:
                constats.append(("B", "barre laterale « %s » (%.2f x %.2f po) accolee a « %s »" % (b["nom"], b["w"], b["h"], k["nom"])))
                break
    return constats


def signature(fs, largeur):
    cartes = [f for f in fs if not f["ph"] and f["w"] >= 1.0 and f["h"] >= 0.8 and f["w"] < 0.8 * largeur]
    bandeaux = [f for f in fs if not f["ph"] and f["w"] >= 0.8 * largeur and f["h"] <= 0.8 and 0.5 < f["y"] < 5.0]
    return {
        "hauteurs": sorted({round(c["h"], 2) for c in cartes}),
        "largeurs": sorted({round(c["w"], 2) for c in cartes}),
        "haut_premiere_rangee": round(min((c["y"] for c in cartes), default=0), 2),
        "bandeau_y": round(min((b["y"] for b in bandeaux), default=0), 2),
        "cartes": len(cartes),
    }


def proche(a, b, tol=0.02):
    return len(a) == len(b) and all(abs(x - y) <= tol for x, y in zip(a, b))


def main():
    ap = argparse.ArgumentParser(description="Controle les grilles de pages soeurs et les barres laterales d'un deck.")
    ap.add_argument("deck")
    ap.add_argument("--familles", help="JSON {famille: [numeros de diapositive]} ou chemin d'un fichier JSON")
    a = ap.parse_args()

    def fin(rapport, code):
        sys.stdout.write(json.dumps(rapport, ensure_ascii=False) + "\n")
        sys.exit(code)

    if not os.path.isfile(a.deck):
        fin({"etat": "non-joue", "motif": "deck absent : " + a.deck}, 2)
    familles = {}
    if a.familles:
        try:
            brut = open(a.familles, encoding="utf-8").read() if os.path.isfile(a.familles) else a.familles
            familles = json.loads(brut)
        except (OSError, ValueError) as e:
            fin({"etat": "non-joue", "motif": "--familles illisible : %s" % e}, 2)
    try:
        z = zipfile.ZipFile(a.deck)
    except zipfile.BadZipFile:
        fin({"etat": "non-joue", "motif": "deck illisible (pas un zip) : " + a.deck}, 2)
    pres = z.read("ppt/presentation.xml").decode("utf-8")
    t = RE_TAILLE.search(pres)
    largeur = int(t.group(1)) / EMU if t else 10.0
    noms = sorted((n for n in z.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)), key=lambda n: int(re.search(r"\d+", os.path.basename(n)).group()))
    diapos = {i + 1: formes(z.read(n).decode("utf-8")) for i, n in enumerate(noms)}

    constats = []
    for num, fs in diapos.items():
        constats += [{"diapositive": num, "regle": r, "constat": c} for r, c in barres_laterales(fs)]
    sigs = {}
    for nom, numeros in familles.items():
        sigs[nom] = {n: signature(diapos[n], largeur) for n in numeros if n in diapos}
        manquantes = [n for n in numeros if n not in diapos]
        if manquantes:
            constats.append({"diapositive": manquantes[0], "regle": "G", "constat": "famille « %s » : diapositive(s) %s absente(s) du deck" % (nom, manquantes)})
        liste = list(sigs[nom].items())
        if len(liste) < 2:
            continue
        ref_n, ref = liste[0]
        for n, s in liste[1:]:
            ecarts = []
            if not proche(s["hauteurs"], ref["hauteurs"]):
                ecarts.append("hauteurs de carte %s au lieu de %s" % (s["hauteurs"], ref["hauteurs"]))
            if not proche(s["largeurs"], ref["largeurs"]):
                ecarts.append("largeurs de carte %s au lieu de %s" % (s["largeurs"], ref["largeurs"]))
            if abs(s["haut_premiere_rangee"] - ref["haut_premiere_rangee"]) > 0.02:
                ecarts.append("premiere rangee a %.2f po au lieu de %.2f" % (s["haut_premiere_rangee"], ref["haut_premiere_rangee"]))
            if abs(s["bandeau_y"] - ref["bandeau_y"]) > 0.02:
                ecarts.append("bandeau a %.2f po au lieu de %.2f (saut de %.2f po)" % (s["bandeau_y"], ref["bandeau_y"], abs(s["bandeau_y"] - ref["bandeau_y"])))
            if ecarts:
                constats.append({"diapositive": n, "regle": "G", "constat": "famille « %s » : la diapositive %d suit une autre grille que la %d : %s" % (nom, n, ref_n, " ; ".join(ecarts))})
    rapport = {"etat": "juge", "diapositives": len(diapos), "familles_jouees": sorted(familles), "constats": constats[:30], "nombre": len(constats),
               "non_juge": ["la justesse de la grille choisie : references/layouts.md la fixe, ce script compare les pages d'une famille entre elles",
                            "une famille non declaree par --familles : seule la regle B (barre laterale) est jouee" if not familles else "une page soeur oubliee dans --familles n'est pas comparee"]}
    rapport["verdict"] = "FAIL" if constats else "PASS"
    fin(rapport, 1 if constats else 0)


if __name__ == "__main__":
    main()
