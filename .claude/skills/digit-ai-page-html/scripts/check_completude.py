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

EXTENSION TF-1436, 28/09/2026 (lot Produit-78 20260928a, RP-2). Le compte de MOTS ne voit pas la
STRUCTURE : une liste numérotée de 8 éléments fondue en un seul paragraphe garde ses mots, perd
ses 8 `<li>` — `check_completude.py` rendait PASS à 100,3 % sur une page qui avait perdu sa liste
et rétrogradé ses titres. La règle s'étend, au même compas :

    pour chaque niveau de titre (1 à 6)     : rendu(niveau) doit être ≥ source(niveau)
    pour les listes NUMÉROTÉES et à PUCES   : rendu(type) doit être ≥ source(type)
    sinon : ÉCART — un titre ou un élément de liste a été PERDU ou DÉPLACÉ vers un autre niveau/type

Un titre ou un élément EN PLUS ne fait jamais échouer (même logique que les mots : un générateur
peut ajouter son propre titre de page ou son sommaire). Ce comptage n'est PAS couvert par
`--seuil` : contrairement aux mots, une dérogation de couverture ne rouvre jamais la structure —
la perdre n'est jamais négociable au même geste qu'une simple pauvreté de contenu.

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

# --- Structure : titres par niveau, éléments de liste par type (TF-1436) --------------------
# Côté Markdown : un titre ATX (pas de Setext ===/---) et un item de liste marqué -, *, + ou
# N. / N) — la même forme que celle déjà reconnue par le générateur d'études (lib-vue-html.mjs).
# Une ligne engagée par « > » (citation) n'ouvre aucune des deux : elle n'a pas d'équivalent
# séparé côté Markdown pour un item imbriqué, le compter brouillerait l'écart plus qu'il ne l'éclaire.
_TITRE_MD = re.compile(r"^[ \t]*(#{1,6})(?=[ \t]|$)", re.M)
_ITEM_NUMEROTE_MD = re.compile(r"^[ \t]*\d+[.)][ \t]+", re.M)
_ITEM_PUCE_MD = re.compile(r"^[ \t]*[-*+][ \t]+", re.M)
# Côté HTML : les six niveaux de titre, et ol/ul/li pour distinguer numéroté de puces — le TYPE
# se lit sur la liste qui ENCLOT le <li>, jamais sur le <li> seul.
_BALISE_STRUCTURE_HTML = re.compile(r"<(h[1-6]|ol|/ol|ul|/ul|li)\b[^>]*>", re.I)


def _corps_visible_html(source: str) -> str:
    """Le corps de la page, commentaires et blocs invisibles retirés — partagé par le compte de
    mots (TF-1174) et le compte de structure (TF-1436) : les deux doivent lire le MÊME corps."""
    texte = _COMMENTAIRE.sub(" ", source)
    texte = _INVISIBLE.sub(" ", texte)
    corps = _CORPS.search(texte)
    return corps.group(1) if corps else texte


def mots_visibles_html(source: str) -> list:
    """Les mots que le lecteur voit dans le corps de la page."""
    texte = _BALISE.sub(" ", _corps_visible_html(source))
    texte = _html.unescape(texte)
    return [m for m in texte.split() if _MOT.search(m)]


def elements_structure_html(source: str) -> dict:
    """Titres par niveau et éléments de liste par type, RENDUS (TF-1436)."""
    texte = _corps_visible_html(source)
    titres = {n: 0 for n in range(1, 7)}
    listes_numerotees = 0
    listes_puces = 0
    pile = []  # empile 'ol'/'ul' à l'ouverture, dépile à la fermeture ; un <li> compte pour le
    # sommet de pile courant — sa liste la plus proche, pas une balise plus loin dans le corps.
    for m in _BALISE_STRUCTURE_HTML.finditer(texte):
        tag = m.group(1).lower()
        if tag in ("ol", "ul"):
            pile.append(tag)
        elif tag in ("/ol", "/ul"):
            if pile:
                pile.pop()
        elif tag == "li":
            if pile and pile[-1] == "ol":
                listes_numerotees += 1
            elif pile:
                listes_puces += 1
            # un <li> hors de tout <ol>/<ul> (HTML mal formé) n'est rattaché à aucun type : rien
            # côté Markdown ne s'y compare, le compter brouillerait l'écart plus qu'il ne l'éclaire.
        else:
            titres[int(tag[1:])] += 1
    return {"titres": titres, "listes_numerotees": listes_numerotees, "listes_puces": listes_puces}


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


def _texte_structure_markdown(source: str) -> str:
    """La source, débarrassée de ce qui pourrait imiter un titre ou une puce sans en être un
    (frontmatter, commentaire, bloc de code, filet, séparateur de tableau) — même ordre de
    retrait que `mots_visibles_markdown`, sans toucher aux marqueurs de titre ou de liste."""
    texte = _FRONTMATTER.sub(" ", source)
    texte = _COMMENTAIRE.sub(" ", texte)
    texte = _CLOTURE.sub(" ", texte)
    texte = _REGLE_HORIZONTALE.sub(" ", texte)
    texte = _SEPARATEUR_TABLE.sub(" ", texte)
    return texte


def elements_structure_markdown(source: str) -> dict:
    """Titres par niveau et éléments de liste par type, DITS par la source (TF-1436)."""
    texte = _texte_structure_markdown(source)
    titres = {n: 0 for n in range(1, 7)}
    for m in _TITRE_MD.finditer(texte):
        titres[len(m.group(1))] += 1
    listes_numerotees = len(_ITEM_NUMEROTE_MD.findall(texte))
    listes_puces = len(_ITEM_PUCE_MD.findall(texte))
    return {"titres": titres, "listes_numerotees": listes_numerotees, "listes_puces": listes_puces}


def structure_agregee(structures: list) -> dict:
    """Somme de plusieurs structures (page multi-sources) — même geste que `total_source` pour
    les mots : chaque source s'additionne, aucune n'efface l'autre."""
    total = {"titres": {n: 0 for n in range(1, 7)}, "listes_numerotees": 0, "listes_puces": 0}
    for s in structures:
        for n in range(1, 7):
            total["titres"][n] += s["titres"][n]
        total["listes_numerotees"] += s["listes_numerotees"]
        total["listes_puces"] += s["listes_puces"]
    return total


_NOM_NIVEAU = {1: "1 (#)", 2: "2 (##)", 3: "3 (###)", 4: "4 (####)", 5: "5 (#####)", 6: "6 (######)"}


def constats_structure(source_agg: dict, rendu: dict) -> list:
    """Un écart par niveau de titre ou par type de liste où le rendu porte MOINS que la source —
    jamais l'inverse : un générateur ajoute normalement son propre titre de page ou son sommaire."""
    constats = []
    for niveau in range(1, 7):
        n_source, n_rendu = source_agg["titres"][niveau], rendu["titres"][niveau]
        if n_rendu < n_source:
            constats.append(
                f"TITRE PERDU OU DÉPLACÉ : la source porte {n_source} titre(s) de niveau "
                f"{_NOM_NIVEAU[niveau]}, la page en rend {n_rendu} à ce niveau — "
                f"{n_source - n_rendu} manquant(s), perdu(s) ou glissé(s) vers un autre niveau. "
                "Remonter au générateur avant toute autre correction")
    for cle, libelle in (("listes_numerotees", "numérotée(s)"), ("listes_puces", "à puces")):
        n_source, n_rendu = source_agg[cle], rendu[cle]
        if n_rendu < n_source:
            constats.append(
                f"ÉLÉMENT DE LISTE PERDU OU DÉPLACÉ : la source porte {n_source} élément(s) de "
                f"liste {libelle}, la page en rend {n_rendu} — {n_source - n_rendu} manquant(s), "
                "perdu(s) ou rendus sous une autre forme (paragraphe, autre type de liste). "
                "Remonter au générateur avant toute autre correction")
    return constats


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
        "LA STRUCTURE COMPTÉE EST GROSSIÈRE ELLE AUSSI (TF-1436) : titres ATX (#, pas de Setext "
        "===/---) et éléments de liste marqués -, *, + ou N. / N) au premier caractère de la "
        "ligne ; un titre ou un item imbriqué dans une citation (>) n'est pas compté séparément. "
        "Un MÊME NOMBRE à un niveau ou un type ne dit rien de l'ORDRE ni du CONTENU, seulement "
        "que rien n'y a disparu ni glissé ailleurs",
        "LA DÉROGATION DE SEUIL NE COUVRE QUE LES MOTS : un titre ou un élément de liste perdu ou "
        "déplacé reste bloquant même sous --seuil abaissé — la structure n'est pas négociable au "
        "même geste qu'une simple pauvreté de contenu",
    ]
    if seuil < SEUIL_DEFAUT:
        notes.append(
            f"DÉROGATION DÉCLARÉE : le seuil joué est {seuil:.3f}, sous le seuil du socle "
            f"({SEUIL_DEFAUT:.3f} — un rendu est normalement PLUS riche que sa source, puisqu'il "
            "porte en plus les libellés du générateur). Ce PASS ne vaut que sous cette dérogation")
    return notes


def verifier_completude(page: str, sources: list, seuil: float = SEUIL_DEFAUT) -> dict:
    """Le verdict : le rendu porte-t-il au moins ce que la source dit — en mots ET en structure ?"""
    rendu = mots_visibles_html(page)
    structure_rendu = elements_structure_html(page)
    par_source = [{"mots": len(mots_visibles_markdown(t)), "source": n} for n, t in sources]
    total_source = sum(s["mots"] for s in par_source)
    structure_source = structure_agregee([elements_structure_markdown(t) for _, t in sources])
    couverture = (len(rendu) / total_source) if total_source else None
    fails = []
    if total_source == 0:
        verdict = "SKIP"
        fails.append("SOURCE VIDE : aucune source ne porte de mot visible — rien à comparer, et "
                     "un PASS ici ne voudrait rien dire")
    else:
        if couverture < seuil:
            manquants = total_source - len(rendu)
            fails.append(
                f"PERTE DE TEXTE : la page rendue porte {len(rendu)} mots visibles pour "
                f"{total_source} mots de source — couverture {couverture:.1%}, sous le seuil "
                f"{seuil:.1%}. Il manque au moins {manquants} mots. Un rendu porte normalement EN "
                "PLUS les libellés du générateur : plus pauvre que sa source, il a PERDU quelque "
                "chose. Remonter au générateur avant toute autre correction")
        fails.extend(constats_structure(structure_source, structure_rendu))
        verdict = "FAIL" if fails else "PASS"
    return {
        "verdict": verdict,
        "mots_rendu": len(rendu),
        "mots_source": total_source,
        "sources": par_source,
        "couverture": round(couverture, 4) if couverture is not None else None,
        "seuil": seuil,
        "structure_rendu": structure_rendu,
        "structure_source": structure_source,
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
        ts, tr = r["structure_source"]["titres"], r["structure_rendu"]["titres"]
        niveaux = ", ".join(f"h{n} {ts[n]}→{tr[n]}" for n in range(1, 7) if ts[n] or tr[n])
        print(f"Titres  : {niveaux or 'aucun titre côté source'}")
        print(f"Listes  : numérotées {r['structure_source']['listes_numerotees']}→"
              f"{r['structure_rendu']['listes_numerotees']} · à puces "
              f"{r['structure_source']['listes_puces']}→{r['structure_rendu']['listes_puces']}")
        for f in r["fails"]:
            print(f"  x {f}")
        print("\nPérimètre de NON-MESURE (ce verdict ne dit rien de ceci) :")
        for note in r["non_juge"]:
            print(f"  non jugé — {note}")

    sys.exit({"PASS": 0, "FAIL": 1}.get(r["verdict"], 2))


if __name__ == "__main__":
    main()
