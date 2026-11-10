#!/usr/bin/env python3
"""accessibilite-deck.py - langue declaree, en-tete de tableau, formes decoratives d'un deck (TF-2368).

LE FAIT (critique d'implementation du 2026-09-2x, seq 393). La charte dit « Toujours francais »
(references/charte.md § 7) et aucun controle ne la jouait sur la langue DECLAREE : pptxgenjs ecrit
lang="en-US" sur chaque passage par defaut, et le workflow de digit-ai-pptx ne disait pas de poser la langue.
Un lecteur d'ecran lit le francais avec une voix anglaise. oracle-pptx et oracle-charte-pptx-semantique ont
rendu PASS sur une diapositive a 154 passages en anglais, sans en-tete de tableau (firstRow) et a trois formes
decoratives non marquees. Le produit a ecrit son propre post-traitement ; le skill le porte desormais.

CE QUE LE SCRIPT CONTROLE (sans --out), sur les diapositives :
  L  chaque passage de texte (`<a:r>`) qui porte une lettre declare une langue francaise (lang="fr-…") ;
  T  chaque tableau (`<a:tbl>`) declare sa premiere ligne comme en-tete (firstRow="1") ;
  D  chaque forme sans texte et sans espace reserve (rectangle, trait, connecteur) est marquee decorative
     (extension decorative de Microsoft, val="1") ou porte un texte alternatif (`descr`) ; chaque image
     porte un texte alternatif ou la marque decorative.

CE QU'IL CORRIGE (avec --out, jamais sur le deck d'entree) :
  L  toute langue non francaise ou absente devient fr-FR, sur les passages, les fins de paragraphe et les champs ;
  T  firstRow="1" sur chaque tableau ;
  D  la marque decorative sur chaque forme sans texte ni espace reserve.
Il NE marque PAS une image decorative de sa propre autorite : un texte alternatif est un choix de l'auteur.
Une image sans texte alternatif reste un constat, avec ou sans --out.

CE QU'IL NE JUGE PAS. La justesse d'un texte alternatif, l'ordre de lecture, le contraste, la langue d'un
passage volontairement etranger (une citation en anglais se corrige a la main apres le post-traitement).

Usage : python accessibilite-deck.py <deck.pptx> [--out <deck corrige.pptx>]
Sortie : une ligne JSON sur stdout. Codes : 0 conforme (avec --out : le deck ecrit est conforme) ; 1 constats
restants ; 2 usage incorrect, deck illisible ou sortie deja existante.
"""
import argparse
import html
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

DECORATIF = ('<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}">'
             '<adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>')
RE_DIAPO = re.compile(r"ppt/slides/slide\d+\.xml")
RE_PASSAGE = re.compile(r"<a:r>.*?</a:r>", re.S)
RE_TEXTE = re.compile(r"<a:t(?:\s[^>]*)?>([^<]*)</a:t>")
RE_RPR = re.compile(r"<a:(rPr|endParaRPr)\b([^>]*?)(/?)>")
RE_LANG = re.compile(r'\blang="([^"]*)"')
RE_TBLPR = re.compile(r"<a:tblPr\b([^>]*?)(/?)>")
RE_FORME = re.compile(r"<p:(sp|cxnSp|pic)>.*?</p:\1>", re.S)
RE_CNVPR = re.compile(r"<p:cNvPr\b([^>]*?)(/>|>.*?</p:cNvPr>)", re.S)
RE_LETTRE = re.compile(r"[^\W\d_]", re.U)


def francais(lang):
    return bool(lang) and lang.lower().startswith("fr")


def constats_diapo(xml):
    """Liste (code, detail) des constats d'une diapositive."""
    c = []
    for p in RE_PASSAGE.finditer(xml):
        passage = p.group(0)
        texte = html.unescape("".join(RE_TEXTE.findall(passage)))
        if not RE_LETTRE.search(texte):
            continue  # numero, symbole : pas de langue a declarer
        m = RE_RPR.search(passage)
        lang = RE_LANG.search(m.group(2)).group(1) if m and RE_LANG.search(m.group(2)) else ""
        if not francais(lang):
            c.append(("L", "passage « %s » : langue %s" % (texte[:40], lang or "non declaree")))
    for t in RE_TBLPR.finditer(xml):
        if 'firstRow="1"' not in t.group(1):
            c.append(("T", "tableau sans premiere ligne declaree en-tete (firstRow)"))
    if "<a:tbl>" in xml and not RE_TBLPR.search(xml):
        c.append(("T", "tableau sans <a:tblPr> : premiere ligne non declaree en-tete"))
    for f in RE_FORME.finditer(xml):
        forme = f.group(0)
        genre = f.group(1)
        n = RE_CNVPR.search(forme)
        if not n:
            continue
        attrs = n.group(1)
        nom = re.search(r'\bname="([^"]*)"', attrs)
        nom = html.unescape(nom.group(1)) if nom else "?"
        descr = re.search(r'\bdescr="([^"]*)"', attrs)
        marque = "adec:decorative" in n.group(0) and 'val="1"' in n.group(0)
        if marque or (descr and descr.group(1).strip()):
            continue
        if genre == "pic":
            c.append(("D", "image « %s » sans texte alternatif ni marque decorative" % nom))
            continue
        if "<p:ph" in forme:
            continue
        a_texte = any(RE_LETTRE.search(html.unescape(t)) for t in RE_TEXTE.findall(forme))
        if not a_texte:
            c.append(("D", "forme « %s » sans texte ni marque decorative" % nom))
    return c


def corriger_diapo(xml):
    # L : langue
    def rpr(m):
        attrs = m.group(2)
        lang = RE_LANG.search(attrs)
        if lang:
            if francais(lang.group(1)):
                return m.group(0)
            attrs = RE_LANG.sub('lang="fr-FR"', attrs, count=1)
        else:
            attrs = ' lang="fr-FR"' + attrs
        return "<a:%s%s%s>" % (m.group(1), attrs, m.group(3))
    xml = RE_RPR.sub(rpr, xml)
    # passage sans <a:rPr> du tout : en poser un
    xml = re.sub(r"(<a:r>)(?!<a:rPr)(<a:t)", r'\1<a:rPr lang="fr-FR"/>\2', xml)

    # T : en-tete de tableau
    def tblpr(m):
        attrs = m.group(1)
        if "firstRow=" in attrs:
            attrs = re.sub(r'firstRow="[^"]*"', 'firstRow="1"', attrs)
        else:
            attrs = attrs + ' firstRow="1"'
        return "<a:tblPr%s%s>" % (attrs, m.group(2))
    xml = RE_TBLPR.sub(tblpr, xml)
    xml = re.sub(r"<a:tbl>(?!<a:tblPr)", '<a:tbl><a:tblPr firstRow="1"/>', xml)

    # D : formes decoratives
    def forme(f):
        txt = f.group(0)
        if f.group(1) == "pic" or "<p:ph" in txt:
            return txt
        n = RE_CNVPR.search(txt)
        if not n:
            return txt
        attrs = n.group(1)
        descr = re.search(r'\bdescr="([^"]*)"', attrs)
        if "adec:decorative" in n.group(0) or (descr and descr.group(1).strip()):
            return txt
        if any(RE_LETTRE.search(html.unescape(t)) for t in RE_TEXTE.findall(txt)):
            return txt
        if n.group(2) == "/>":
            neuf = "<p:cNvPr%s>%s</p:cNvPr>" % (attrs, DECORATIF)
        else:
            neuf = n.group(0).replace("</p:cNvPr>", DECORATIF + "</p:cNvPr>", 1)
        return txt[:n.start()] + neuf + txt[n.end():]
    return RE_FORME.sub(forme, xml)


def main():
    ap = argparse.ArgumentParser(description="Controle (et corrige avec --out) langue, en-tete de tableau et formes decoratives.")
    ap.add_argument("deck", help="deck .pptx")
    ap.add_argument("-o", "--out", help="deck corrige (ne doit pas exister) ; sans lui, controle seul")
    a = ap.parse_args()

    def fin(rapport, code):
        sys.stdout.write(json.dumps(rapport, ensure_ascii=False) + "\n")
        sys.exit(code)

    if not os.path.isfile(a.deck):
        fin({"etat": "non-joue", "motif": "deck absent : " + a.deck}, 2)
    if a.out and os.path.exists(a.out):
        fin({"etat": "non-joue", "motif": "la sortie existe deja, rien n'est ecrase : " + a.out}, 2)
    try:
        src = zipfile.ZipFile(a.deck)
    except zipfile.BadZipFile:
        fin({"etat": "non-joue", "motif": "deck illisible (pas un zip) : " + a.deck}, 2)

    avant, apres = [], []
    sortie = zipfile.ZipFile(a.out, "w", zipfile.ZIP_DEFLATED) if a.out else None
    try:
        for info in src.infolist():
            donnees = src.read(info.filename)
            if RE_DIAPO.fullmatch(info.filename):
                xml = donnees.decode("utf-8")
                nom = os.path.basename(info.filename)
                avant += [(nom,) + c for c in constats_diapo(xml)]
                if sortie is not None:
                    xml = corriger_diapo(xml)
                    try:
                        ET.fromstring(xml.encode("utf-8"))
                    except ET.ParseError as e:  # une correction qui casse le XML ne se livre pas
                        sortie.close()
                        os.remove(a.out)
                        fin({"etat": "non-joue", "motif": "la correction de %s produit un XML invalide, rien n'est ecrit : %s" % (nom, e)}, 2)
                    apres += [(nom,) + c for c in constats_diapo(xml)]
                    donnees = xml.encode("utf-8")
            if sortie is not None:
                sortie.writestr(info, donnees, compress_type=zipfile.ZIP_DEFLATED)
    finally:
        if sortie is not None:
            sortie.close()
        src.close()

    def resume(liste):
        par = {}
        for _, code, _ in liste:
            par[code] = par.get(code, 0) + 1
        return par

    def exemples(liste):
        return [{"diapositive": n, "regle": c, "constat": d} for n, c, d in liste[:12]]

    rapport = {"etat": "controle" if not a.out else "corrige", "constats_avant": resume(avant),
               "non_juge": ["la justesse d'un texte alternatif, l'ordre de lecture, le contraste",
                            "la langue d'un passage volontairement etranger : il passe en fr-FR avec --out, a reprendre a la main"]}
    if not a.out:
        rapport.update({"constats": exemples(avant), "nombre": len(avant), "verdict": "FAIL" if avant else "PASS"})
        fin(rapport, 1 if avant else 0)
    rapport.update({"sortie": a.out, "constats_restants": resume(apres), "restants": exemples(apres), "verdict": "FAIL" if apres else "PASS"})
    fin(rapport, 1 if apres else 0)


if __name__ == "__main__":
    main()
