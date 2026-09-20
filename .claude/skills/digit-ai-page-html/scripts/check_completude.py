#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Complétude RENDU vs SOURCE — la page porte-t-elle ce que sa source dit ? (TF-1174)

LE FAIT PAYÉ, 16/09/2026 (lot Produit-64 20260916b, retour RD-10). Une édition d'un générateur a
sorti un `append` de sa boucle de regroupement de prose : toute la prose sauf le dernier fragment
de chaque chapitre a disparu de la page rendue. Le livrable est passé de 11 996 à environ
3 000 mots visibles, et les neuf encadrés « Exemple de lecture » sont tombés à ZÉRO.

LES SIX ORACLES JOUÉS SUR CETTE PAGE AMPUTÉE : `render_page.py` (7 largeurs) PASS ·
`check_markdown.py --style` PASS — il juge la SOURCE, qui n'a pas bougé · `oracle-slop` PASS ·
`oracle-tokens` PASS · `oracle-mobile` PASS · `check_html.py` FAIL, mais sur L7 et L10 SEULEMENT,
c'est-à-dire sur l'ABSENCE d'un chapeau et d'un exemple de lecture — jamais sur la disparition du
texte. Une page amputée n'a en effet ni débordement, ni contraste faible, ni marqueur de page
générée, ni couleur en dur : elle est PARFAITEMENT CONFORME ET PRESQUE VIDE.

CE QUE L'ÉCART RÉVÈLE — classe `controle-vrai-sur-le-mauvais-invariant`. Les six oracles mesurent
la FORME. Aucun ne mesure la COMPLÉTUDE. C'est une grandeur corrélée prise pour l'invariant : tant
qu'un générateur ne perd rien, forme et contenu vont ensemble et personne ne voit la substitution ;
le jour où la corrélation se rompt, six verdicts verts couvrent une page vide.

LA RÈGLE, ET ELLE NE DEMANDE AUCUNE FINESSE — elle demande de COMPTER :

    rendu  = mots visibles du corps HTML (balises, commentaires, scripts et styles retirés)
    source = mots visibles du ou des Markdown dont il sort
    si rendu < source : ARRÊT — la page porte moins de texte que sa source

Le seuil est volontairement grossier, et c'est ce qui le rend sûr : un rendu porte EN PLUS les
libellés du générateur (menus, inventaires, légendes de schéma), il est donc normalement PLUS
riche que sa source. Un rendu plus pauvre est une PERTE, sans jugement à rendre — aucune
pertinence, aucune lisibilité, aucun chapeau n'est jugé ici.

Usage :
    python check_completude.py page.html --source source.md [--source autre.md ...]
    python check_completude.py page.html --source source.md --output json
    python check_completude.py page.html --source source.md --seuil 0.9   # DÉROGATION, déclarée

Verdict machine : exit 0 = PASS · 1 = FAIL (perte de texte) · 2 = indéterminé (SKIP motivé —
fichier illisible, source absente). Un fichier qu'on ne peut pas lire ne rend JAMAIS un PASS.
"""
from __future__ import annotations

import argparse
import html as _html
import json
import re
import sys
from pathlib import Path

SEUIL_DEFAUT = 1.0

# --- HTML : ce qui ne se voit pas à l'écran -------------------------------------------------
_COMMENTAIRE = re.compile(r"<!--.*?-->", re.S)
_INVISIBLE = re.compile(r"<(script|style|template|noscript)\b[^>]*>.*?</\1\s*>", re.S | re.I)
_CORPS = re.compile(r"<body\b[^>]*>(.*)</body\s*>", re.S | re.I)
_BALISE = re.compile(r"<[^>]+>", re.S)

# --- Markdown : la syntaxe n'est pas du texte ------------------------------------------------
_FRONTMATTER = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.S)
_CLOTURE = re.compile(r"^[ \t]*(```|~~~).*?^[ \t]*\1[ \t]*$", re.S | re.M)
_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_LIEN = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_LIEN_REF = re.compile(r"^\[[^\]]+\]:\s*\S+.*$", re.M)
_CODE_EN_LIGNE = re.compile(r"`([^`]*)`")
_MARQUEUR_LIGNE = re.compile(r"^[ \t]*(#{1,6}|>|[-*+]|\d+\.)[ \t]+", re.M)
_SEPARATEUR_TABLE = re.compile(r"^[ \t]*\|?[ \t:\-|]+\|[ \t:\-|]*$", re.M)
_REGLE_HORIZONTALE = re.compile(r"^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$", re.M)

# Un « mot » porte au moins un caractère alphanumérique : une puce, un filet ou un tuyau de
# tableau n'est pas du texte, et les compter des deux côtés ne ferait que brouiller l'écart.
_MOT = re.compile(r"[^\W_]", re.U)


def mots_visibles_html(source: str) -> list:
    """Les mots que le lecteur voit dans le corps de la page."""
    texte = _COMMENTAIRE.sub(" ", source)
    texte = _INVISIBLE.sub(" ", texte)
    corps = _CORPS.search(texte)
    if corps:
        texte = corps.group(1)
    texte = _BALISE.sub(" ", texte)
    texte = _html.unescape(texte)
    return [m for m in texte.split() if _MOT.search(m)]


def mots_visibles_markdown(source: str) -> list:
    """Les mots que la source DIT — sa syntaxe retirée, son texte gardé."""
    texte = _FRONTMATTER.sub(" ", source)
    texte = _COMMENTAIRE.sub(" ", texte)
    texte = _CLOTURE.sub(" ", texte)
    texte = _LIEN_REF.sub(" ", texte)
    texte = _IMAGE.sub(r"\1", texte)
    texte = _LIEN.sub(r"\1", texte)
    texte = _CODE_EN_LIGNE.sub(r"\1", texte)
    texte = _REGLE_HORIZONTALE.sub(" ", texte)
    texte = _SEPARATEUR_TABLE.sub(" ", texte)
    texte = _MARQUEUR_LIGNE.sub(" ", texte)
    texte = texte.replace("|", " ")
    # Le balisage HTML toléré dans un Markdown ne compte pas non plus.
    texte = _BALISE.sub(" ", texte)
    texte = _html.unescape(texte)
    return [m for m in texte.split() if _MOT.search(m)]


def non_juge(seuil: float) -> list:
    """Ce que ce contrôle NE regarde pas — publié à chaque exécution, PASS ou FAIL."""
    notes = [
        "LA COMPLÉTUDE N'EST PAS LA FIDÉLITÉ. Ce contrôle COMPTE des mots ; il ne dit pas que ce "
        "sont LES MÊMES mots, ni qu'ils sont au bon endroit, ni dans le bon ordre. Une page qui "
        "remplacerait chaque paragraphe par un autre de longueur égale passerait",
        "LA FORME N'EST PAS JUGÉE ICI : débordement, contraste, chevauchement, jetons, marqueurs "
        "de page générée relèvent de `check_html.py`, `render_page.py` et des oracles de "
        "`digit-ai-forge-design`. Les six ont rendu PASS sur la page amputée du 16/09",
        "LE TEXTE PRODUIT PAR LE JAVASCRIPT à l'ouverture n'est pas compté : ce script lit le "
        "fichier, il ne l'exécute pas. Une page dont la prose est injectée au runtime sera "
        "comptée trop pauvre — c'est un FAUX POSITIF assumé, et il se lève en fournissant le "
        "rendu après exécution",
        "LA SOURCE EST CRUE SUR PAROLE : que le ou les Markdown fournis soient bien ceux dont la "
        "page sort est une déclaration de l'appelant, jamais une mesure",
    ]
    if seuil < SEUIL_DEFAUT:
        notes.append(
            f"DÉROGATION DÉCLARÉE : le seuil joué est {seuil:.3f}, sous le seuil du socle "
            f"({SEUIL_DEFAUT:.3f} — un rendu est normalement PLUS riche que sa source, puisqu'il "
            "porte en plus les libellés du générateur). Ce PASS ne vaut que sous cette dérogation")
    return notes


def verifier_completude(page: str, sources: list, seuil: float = SEUIL_DEFAUT) -> dict:
    """Le verdict : le rendu porte-t-il au moins ce que la source dit ?"""
    rendu = mots_visibles_html(page)
    par_source = [{"mots": len(mots_visibles_markdown(t)), "source": n} for n, t in sources]
    total_source = sum(s["mots"] for s in par_source)
    couverture = (len(rendu) / total_source) if total_source else None
    fails = []
    if total_source == 0:
        verdict = "SKIP"
        fails.append("SOURCE VIDE : aucune source ne porte de mot visible — rien à comparer, et "
                     "un PASS ici ne voudrait rien dire")
    elif couverture < seuil:
        verdict = "FAIL"
        manquants = total_source - len(rendu)
        fails.append(
            f"PERTE DE TEXTE : la page rendue porte {len(rendu)} mots visibles pour "
            f"{total_source} mots de source — couverture {couverture:.1%}, sous le seuil "
            f"{seuil:.1%}. Il manque au moins {manquants} mots. Un rendu porte normalement EN "
            "PLUS les libellés du générateur : plus pauvre que sa source, il a PERDU quelque "
            "chose. Remonter au générateur avant toute autre correction")
    else:
        verdict = "PASS"
    return {
        "verdict": verdict,
        "mots_rendu": len(rendu),
        "mots_source": total_source,
        "sources": par_source,
        "couverture": round(couverture, 4) if couverture is not None else None,
        "seuil": seuil,
        "fails": fails,
        "non_juge": non_juge(seuil),
    }


def main():
    ap = argparse.ArgumentParser(
        description="Complétude : la page rendue porte-t-elle ce que sa source dit ? (TF-1174)")
    ap.add_argument("page", help="Chemin de la page HTML rendue.")
    ap.add_argument("--source", action="append", default=[], metavar="FICHIER.md",
                    help="Markdown dont la page sort ; répétable pour une page multi-sources.")
    ap.add_argument("--seuil", type=float, default=SEUIL_DEFAUT,
                    help=f"couverture minimale rendu/source (défaut {SEUIL_DEFAUT:g} — sous ce "
                         "seuil, la dérogation est DÉCLARÉE au verdict)")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    args = ap.parse_args()

    if args.seuil <= 0:
        print("Erreur : --seuil doit être strictement positif.", file=sys.stderr)
        sys.exit(2)
    if not args.source:
        print("Erreur : au moins une --source est requise — ce contrôle COMPARE, il ne juge pas "
              "une page seule.", file=sys.stderr)
        sys.exit(2)

    try:
        page = Path(args.page).read_text(encoding="utf-8")
    except OSError as e:
        print(f"Erreur lecture de la page : {e}", file=sys.stderr)
        sys.exit(2)
    sources = []
    for chemin in args.source:
        try:
            sources.append((chemin, Path(chemin).read_text(encoding="utf-8")))
        except OSError as e:
            print(f"Erreur lecture de la source : {e}", file=sys.stderr)
            sys.exit(2)

    r = verifier_completude(page, sources, args.seuil)
    r["page"] = args.page

    if args.output == "json":
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print(f"Page    : {args.page}")
        for s in r["sources"]:
            print(f"Source  : {s['source']} — {s['mots']} mots visibles")
        print(f"Verdict : {r['verdict']}")
        couv = f"{r['couverture']:.1%}" if r["couverture"] is not None else "—"
        print(f"Rendu   : {r['mots_rendu']} mots visibles pour {r['mots_source']} de source "
              f"(couverture {couv}, seuil {r['seuil']:.1%})")
        for f in r["fails"]:
            print(f"  x {f}")
        print("\nPérimètre de NON-MESURE (ce verdict ne dit rien de ceci) :")
        for note in r["non_juge"]:
            print(f"  non jugé — {note}")

    sys.exit({"PASS": 0, "FAIL": 1}.get(r["verdict"], 2))


if __name__ == "__main__":
    main()
