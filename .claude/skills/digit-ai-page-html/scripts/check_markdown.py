#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_markdown.py — lisibilité d'un document MARKDOWN (TF-0518, 22/08/2026).

POURQUOI CE FICHIER EXISTE. Le registre compte 48 domaines. Mesuré sur un livrable réel
(85 Ko, 297 entrées) : le lanceur juge QUATRE domaines et en écarte deux. Aucun domaine de
lisibilité n'est appliqué, ni ne PEUT l'être : les règles L1-L19 vivent dans `check_html.py`,
qui ne s'exécute que sur du HTML.

Or le Markdown est le format de livraison DOMINANT des runs d'architecture et de conseil : le
projet qui a remonté ce défaut remet dix documents Markdown et un seul HTML. La conséquence est
directe et mesurée — le défaut du retour jumeau (un identifiant sans son sens) s'est produit DANS
LES DOCUMENTS MARKDOWN, c'est-à-dire exactement là où aucun oracle ne regarde, et c'est un humain
qui l'a trouvé. Comme pour le défaut fondateur de L14.

CE QUI EST JUGÉ ICI : le sous-ensemble des règles INDÉPENDANTES DU FORMAT DE RENDU.
  M7  — un chapitre OUVRE par ce qu'il apprend, pas par un tableau nu (L7 transposée) ;
  M10 — un chapitre de DONNÉES porte son mode d'emploi (L10 transposée) ;
  M14 — aucune plomberie interne dans le texte (L14, portée telle quelle) ;
  M18 — un identifiant du vocabulaire du document porte son sens (L18 transposée : hors HTML,
        la glose est forcément EN LIGNE — pas d'infobulle, pas d'ancre à survoler).

CE QUI RESTE HORS PÉRIMÈTRE, ET LE DIT. Les règles qui dépendent du RENDU n'ont pas de sens sur
un Markdown, dont la mise en page appartient au lecteur : L1 (texte tronqué), L2 (largeur),
L5 (surlignage), L15 et L19 (glyphes et coupure de mot). Et deux règles restent une REVUE DE
LECTURE plutôt qu'un contrôle, parce que les mécaniser produirait plus de bruit que de gain :
L3 (une valeur porte sa légende — reconnaître « une valeur mise en avant » dans du Markdown
demande de lire) et L12 (une énumération de données n'est pas une phrase). Le partage
mécanique / revue de lecture écrit dans `lisibilite.md` s'applique tel quel : il n'y avait pas de
doctrine à inventer, seulement une porte à ouvrir.

LE STYLE EST DÉLÉGUÉ, PAS RÉIMPLÉMENTÉ (TF-1064, 12/09/2026). Les deux règles laissées à la revue
de lecture ci-dessus — L3 et L12 — plus la règle « un paragraphe qui ÉNUMÈRE est une liste écrite
en prose » (`bonnes-pratiques.md` §3) relèvent du STYLE, et le style a désormais un oracle
déterministe : `oracle-ecriture.mjs` du PILOT (doctrine `references/ECRITURE.md`, règles E-1 à
E-12 ; données `references/tics-redactionnels.json`, huit familles de tournures à seuils de
densité, datées et sourcées ; règles EC-1 à EC-6). `--style` l'appelle et FUSIONNE son verdict :
FAIL de l'un = FAIL de l'ensemble. Aucun motif n'est recopié ici — les seuils sont une DONNÉE
périssable qui vit chez le pilot (loi transverse n° 4), et une seconde implémentation dériverait
de la première en silence (règle R3 : jamais de réimplémentation). Sans `--style`, ce script juge
exactement ce qu'il jugeait avant : M7, M10, M14, M18, contrat de sortie inchangé.

Usage :
  python check_markdown.py <document.md> [--output json] [--style]
Exit : 0 = PASS · 1 = FAIL · 2 = non jugeable (fichier illisible ou absent).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REGLES = ["M7", "M10", "M14", "M18"]

# --- M14 : la plomberie interne, mêmes motifs que L14 côté HTML -----------------------------
# Une convention de balisage qui traverse le rendu : le lecteur reçoit un rouage.
RE_GABARIT = re.compile(r"(\[c:[a-z0-9_-]+\]|\{\{[^}]{1,40}\}\}|<!--\s*TODO[^>]*-->)", re.I)
RE_MARQUEUR_TRAVAIL = re.compile(r"\b(TODO|FIXME|XXX|TBD|LOREM IPSUM)\b")

# --- M18 : les renvois codés ----------------------------------------------------------------
# Familles SANS homonyme, devinables. Les ambiguës (`E2`, `C1`, `H1`) se DÉCLARENT en frontmatter
# (`codes: E,C,H`) — la même raison que côté HTML : `H1` désigne un titre bien plus souvent qu'une
# question, et `A4` est un format de papier.
RE_RENVOI_SUR = r"Q-[A-Z]{1,3}\d{0,3}|R[AD]-\d{1,3}|ADR\s\d{4}"


def decouper(texte: str) -> tuple[list[str], set[int]]:
    """Les lignes, et l'ensemble des index de lignes qui vivent dans un bloc de code."""
    lignes = texte.split("\n")
    dans_code: set[int] = set()
    ouvert = False
    for i, l in enumerate(lignes):
        if l.strip().startswith("```"):
            ouvert = not ouvert
            dans_code.add(i)
            continue
        if ouvert:
            dans_code.add(i)
    return lignes, dans_code


def sans_code_en_ligne(l: str) -> str:
    """Le texte de prose : les spans de code sont blanchis, la longueur est préservée."""
    return re.sub(r"`[^`\n]+`", lambda m: " " * len(m.group(0)), l)


# --- TF-0720 (31/08/2026) : LE BALISAGE D'EMPHASE N'EST PAS DU TEXTE -------------------------
#
# LE FAIT, constaté QUATRE fois à l'écriture d'un seul lot, dont deux sur du contenu conforme.
# `**RD-23** *(renvoi de design 23 : …)*` était refusé par M18 comme « identifiant muet » : le
# contrôle prenait les quatre caractères suivant le jeton et y trouvait `** (` — les deux
# astérisques de fermeture du gras rompaient l'adjacence, et le verdict tombait. Or mettre un
# identifiant en gras est l'écriture la plus naturelle d'un tableau ou d'une énumération, et
# c'est celle qu'emploient les six lots précédents.
#
# CE N'EST PAS UN CAS ISOLÉ, et c'est ce qui justifie une fonction plutôt qu'un rustine : le lot
# du 22/08 signalait déjà un faux positif de l'oracle Calculs/chiffres — une re-somme à 189 au
# lieu de 99 — parce qu'une cellule `**90**` N'ÉTAIT PAS LUE COMME UN NOMBRE. Deux oracles, deux
# familles de jetons, UNE SEULE CAUSE : le balisage d'emphase traité comme du texte.
#
# LA PARADE, calquée sur `sans_code_en_ligne` : on blanchit les MARQUEURS et on garde le
# contenu, en PRÉSERVANT LES POSITIONS — même longueur, donc lignes et colonnes restent justes,
# et un message d'échec continue de situer le défaut. On ne retire pas l'emphase du document, on
# la rend transparente à l'analyse.
#
# LES BORNES, tenues par les motifs eux-mêmes :
#   · l'emphase ne traverse jamais un saut de ligne (classes `[^\n]`) — une puce `* premier`
#     n'a pas de marqueur fermant sur sa ligne et n'est donc jamais touchée ;
#   · `_` ne se blanchit qu'aux bords de mot, sinon `nom_de_variable` perdrait ses tirets bas ;
#   · le gras se traite AVANT l'italique : l'ordre inverse laisserait `**` en `* … *`.
RE_EMPHASE = (
    re.compile(r"(\*\*|__)(?=\S)([^\n]+?)(?<=\S)\1"),               # gras
    re.compile(r"(?<![\w*])(\*)(?=\S)([^*\n]+?)(?<=\S)\1(?![\w*])"),  # italique par astérisque
    re.compile(r"(?<![\w_])(_)(?=\S)([^_\n]+?)(?<=\S)\1(?![\w_])"),   # italique par tiret bas
)


def neutraliser_emphase(texte: str) -> str:
    """Blanchit les MARQUEURS d'emphase (`**`, `__`, `*`, `_`) en gardant leur contenu.

    La longueur du texte est rigoureusement préservée : `**RD-23**` devient `  RD-23  `, donc
    tout index calculé sur le résultat désigne le même caractère dans le document d'origine.
    C'est la fonction partagée demandée par TF-0720 : le contrôle de jetons (M18) et la lecture
    des nombres (cellule `**90**` d'une re-somme) en dépendent tous deux.
    """
    out = texte
    for rx in RE_EMPHASE:
        out = rx.sub(lambda m: " " * len(m.group(1)) + m.group(2) + " " * len(m.group(1)), out)
    return out


def texte_de_prose(l: str) -> str:
    """La ligne telle qu'un ORACLE doit la lire : sans span de code, sans marqueur d'emphase.

    Deux blanchiments, une seule garantie : les positions ne bougent pas.
    """
    return neutraliser_emphase(sans_code_en_ligne(l))


# Ce que « lire un nombre » veut dire une fois l'emphase neutralisée : le motif est fourni ici
# pour que le contrôle des chiffres et celui des jetons partagent la MÊME lecture du document.
RE_NOMBRE = re.compile(r"(?<![\w.,])-?\d{1,3}(?:[   ]\d{3})*(?:[.,]\d+)?(?![\w])")


def nombres_de(l: str) -> list[str]:
    """Les nombres lisibles d'une ligne, emphase neutralisée (`**90**` vaut 90)."""
    return [m.group(0) for m in RE_NOMBRE.finditer(texte_de_prose(l))]


def suite_du_paragraphe(lignes: list[str], i: int, dans_code: set[int], max_lignes: int = 3) -> str:
    """Le texte du PARAGRAPHE qui continue après la ligne `i`, reflué en une seule chaîne.

    TF-0720, seconde manifestation, trouvée en corrigeant la première : M18 travaillait LIGNE
    PAR LIGNE. Un jeton en fin de ligne dont la glose commence à la ligne suivante n'avait donc
    AUCUNE suite à examiner, et tombait — constaté sur RA-16 dans le même paragraphe, à un
    simple retour à la ligne près. La coupure à 95 colonnes est une commodité d'écriture : elle
    ne porte aucun sens, et un contrôle qui lui en prête un condamne la mise en forme.

    La continuation s'arrête à ce qui ROMPT vraiment le paragraphe : ligne vide, bloc de code,
    titre, ligne de tableau, citation, filet, ou nouvel item de liste. Une ligne simplement
    indentée poursuit son item, elle ne l'interrompt pas.
    """
    out: list[str] = []
    for j in range(i + 1, min(i + 1 + max_lignes, len(lignes))):
        if j in dans_code:
            break
        s = lignes[j].strip()
        if not s or s.startswith(("#", "|", ">", "```", "---", "===")):
            break
        if re.match(r"^\s*(?:[-*+]\s|\d{1,3}[.)]\s)", lignes[j]):
            break
        out.append(s)
    return (" " + " ".join(out)) if out else ""


def frontmatter(lignes: list[str]) -> dict:
    if not lignes or lignes[0].strip() != "---":
        return {}
    out = {}
    for l in lignes[1:]:
        if l.strip() == "---":
            break
        m = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", l)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def chapitres(lignes: list[str], dans_code: set[int]) -> list[tuple[int, str, list[int]]]:
    """(index du titre, texte du titre, index des lignes de son corps jusqu'au titre suivant)."""
    out: list[tuple[int, str, list[int]]] = []
    courant: tuple[int, str, list[int]] | None = None
    for i, l in enumerate(lignes):
        if i in dans_code:
            if courant:
                courant[2].append(i)
            continue
        if re.match(r"^#{2,4}\s+\S", l):
            if courant:
                out.append(courant)
            courant = (i, l.lstrip("#").strip(), [])
            continue
        if courant:
            courant[2].append(i)
    if courant:
        out.append(courant)
    return out


def juger(texte: str) -> tuple[list[str], list[str]]:
    fails: list[str] = []
    warns: list[str] = []
    lignes, dans_code = decouper(texte)
    fm = frontmatter(lignes)
    chaps = chapitres(lignes, dans_code)

    est_donnee = lambda l: l.lstrip().startswith("|") or bool(re.match(r"^\s*[-*+]\s+\S", l))
    est_prose = lambda l: bool(l.strip()) and not est_donnee(l) and not l.lstrip().startswith(("#", ">", "```", "---", "|"))

    # ---- M7 : un chapitre OUVRE par ce qu'il apprend ---------------------------------------
    # Transposition de L7. Un titre suivi DIRECTEMENT d'un TABLEAU livre les données sans dire ce
    # qu'on doit y voir : le lecteur doit deviner la question à laquelle le chapitre répond. Une
    # phrase suffit, et c'est ce qui est exigé — pas un paragraphe.
    #
    # LA LISTE À PUCES EST EXCLUE, et c'est une borne trouvée en jouant la règle. Le premier jet
    # traitait toute « donnée » de la même façon, et il faisait échouer SEPT blocs sur neuf d'une
    # restitution au gabarit — une forme PRESCRITE, où un bloc qui ouvre par ses puces est
    # exactement ce que la consigne demande (`- quoi — …`, `- sur quoi — …`). Une liste de champs
    # n'est pas une donnée brute qui aurait besoin d'être introduite ; un tableau, si. Un contrôle
    # qui condamne la forme qu'un gabarit prescrit met le gabarit en défaut, jamais l'auteur.
    for i, titre, corps in chaps:
        utiles = [j for j in corps if lignes[j].strip()]
        if not utiles:
            continue
        premiere = lignes[utiles[0]]
        if premiere.lstrip().startswith("|"):
            fails.append(
                f"M7 chapitre sans ouverture : « {titre[:60]} » (ligne {i + 1}) commence "
                "directement par des données — une phrase doit dire ce que le lecteur va y "
                "apprendre, sinon il doit deviner la question à laquelle le chapitre répond.")

    # ---- M10 : un chapitre de DONNÉES porte son mode d'emploi ------------------------------
    # Transposition de L10. Au-delà de 12 lignes de tableau, le lecteur a besoin de savoir
    # comment lire : ce que vaut une colonne, ce qui est trié, ce qui est exclu. Le seuil est une
    # donnée, pas une vérité : 12 lignes est la limite au-delà de laquelle un tableau ne se lit
    # plus d'un coup d'œil.
    SEUIL_TABLE = 12
    for i, titre, corps in chaps:
        n = sum(1 for j in corps if lignes[j].lstrip().startswith("|") and j not in dans_code)
        if n <= SEUIL_TABLE:
            continue
        prose = " ".join(texte_de_prose(lignes[j]) for j in corps if est_prose(lignes[j]))
        marqueurs = re.search(r"(comment lire|se lit|trié|trie|classé|classe|colonne|exclu|"
                              r"périmètre|perimetre|source|unité|unite|lecture)", prose, re.I)
        if not marqueurs:
            fails.append(
                f"M10 chapitre de données sans mode d'emploi : « {titre[:60]} » (ligne {i + 1}) "
                f"porte {n} lignes de tableau et aucune phrase ne dit COMMENT le lire — ce que "
                "vaut une colonne, ce qui est trié, ce qui est exclu. Un tableau de plus de "
                f"{SEUIL_TABLE} lignes ne se lit pas d'un coup d'œil.")

    # ---- M14 : la plomberie ne s'affiche pas ----------------------------------------------
    plomberie: list[tuple[str, int]] = []
    travail: list[tuple[str, int]] = []
    for i, l in enumerate(lignes):
        if i in dans_code:
            continue
        t = texte_de_prose(l)
        for m in RE_GABARIT.finditer(t):
            plomberie.append((m.group(1), i + 1))
        for m in RE_MARQUEUR_TRAVAIL.finditer(t):
            travail.append((m.group(1), i + 1))
    for motif, ligne in plomberie[:6]:
        fails.append(f"M14 plomberie affichée : « {motif} » en clair dans le texte (ligne {ligne}) "
                     "— convention de balisage interne qui n'aurait pas dû traverser l'émetteur.")
    if len(plomberie) > 6:
        fails.append(f"M14 plomberie affichée : {len(plomberie) - 6} autre(s) occurrence(s).")
    if travail:
        distincts = sorted({m for m, _ in travail})
        warns.append(f"M14 {len(travail)} marqueur(s) de travail dans le texte "
                     f"({', '.join(distincts)}) — légitime si le document PARLE de tâches, à "
                     "retirer sinon ; jamais un échec.")

    # ---- M18 : un identifiant porte son sens, EN LIGNE ------------------------------------
    # Hors HTML, il n'y a ni infobulle ni ancre à survoler : la glose est forcément dans la
    # phrase. On l'accepte sous trois formes, toutes lisibles à l'œil — une parenthèse qui suit le
    # jeton, un tiret cadratin, ou un deux-points de définition.
    familles = {c.strip().upper() for c in re.split(r"[,\s]+", fm.get("codes", "")) if c.strip()}
    familles = {f for f in familles if f.isalpha() and len(f) <= 2}
    motif = RE_RENVOI_SUR
    if familles:
        motif += "|(?:" + "|".join(sorted(familles)) + r")\d{1,3}"
    re_renvoi = re.compile(r"\b(?:" + motif + r")\b")

    definis: set[str] = set()
    for i, l in enumerate(lignes):
        if i in dans_code or not re.match(r"^#{1,6}\s+\S", l):
            continue
        for m in re_renvoi.finditer(texte_de_prose(l)):
            definis.add(m.group(0))

    # TF-0720 : la FENÊTRE DE GLOSE se prend sur le texte de prose (emphase neutralisée) REFLUÉ
    # avec la suite de son paragraphe — plus sur la ligne physique. Ce qui est exigé n'a pas
    # changé d'un iota : le premier caractère non blanc qui suit le jeton ouvre la glose. Ce qui
    # change, c'est que ni le gras ni un retour à la ligne ne comptent plus comme ce caractère.
    OUVREURS = ("(", "—", "–", ":", "«")
    vus: set[str] = set()
    muets: list[tuple[str, int]] = []
    for i, l in enumerate(lignes):
        if i in dans_code or l.lstrip().startswith(">"):
            continue                                  # une citation ne se glose pas
        t = texte_de_prose(l)
        queue = suite_du_paragraphe(lignes, i, dans_code)
        for m in re_renvoi.finditer(t):
            jeton = m.group(0)
            if jeton in vus or jeton in definis:
                continue
            vus.add(jeton)
            suite = (t[m.end():] + neutraliser_emphase(sans_code_en_ligne(queue))).lstrip()
            if not suite.startswith(OUVREURS):
                muets.append((jeton, i + 1))
    for jeton, ligne in muets[:6]:
        fails.append(
            f"M18 identifiant muet : « {jeton} » employé sans son sens (ligne {ligne}) — première "
            "occurrence dans le document. Hors HTML il n'y a ni infobulle ni ancre : la glose est "
            "EN LIGNE, entre parenthèses, après un tiret, ou après deux-points. Retour client du "
            "22/08 : « je ne sais pas ce qu'est E2 ».")
    if len(muets) > 6:
        fails.append(f"M18 identifiant muet : {len(muets) - 6} autre(s) jeton(s) sans glose.")

    return fails, warns



# ---------------------------------------------------------------------------
# LE STYLE, DÉLÉGUÉ AU PILOT (TF-1064, 12/09/2026)
#
# POURQUOI UNE DÉLÉGATION ET PAS UN CONTRÔLE DE PLUS. Les motifs de style vivent dans une DONNÉE
# datée et sourcée du pilot (`references/tics-redactionnels.json`, huit familles calibrées le
# 12/09 sur 204 textes). Les recopier ici créerait une seconde vérité qui dériverait dès le
# premier recalibrage — la classe de défaut TF-0784, « une copie ne reçoit aucun correctif ».
# Ce module ne connaît donc AUCUN motif : il sait seulement où joindre l'oracle, et quoi faire
# de son verdict.
#
# CE QUE LA FUSION GARANTIT. FAIL de l'un = FAIL de l'ensemble ; et un oracle INJOIGNABLE se dit
# en clair (`verdict: "SKIP"` + motif nommant les pistes essayées), il ne se tait pas. Un silence
# se lirait comme un vert, et c'est exactement le défaut que ce lot corrige ailleurs.

MARQUEURS_PILOT = ("FORGE_ROOT/digit-ai-factory", "dépôt frère ../../../../digit-ai-factory")


def pistes_pilot() -> list[Path]:
    """Les pistes examinées pour trouver le dépôt du pilot, dans l'ordre — même règle que le
    marqueur `{pilot}` de quality-oracles (`scripts/lib/pilot.mjs`) et que `hooks-factory.mjs`."""
    pistes: list[Path] = []
    racine = os.environ.get("FORGE_ROOT")
    if racine:
        pistes.append(Path(racine) / "digit-ai-factory")
    # <parent>/<dépôt>/.claude/skills/<skill>/scripts/ce fichier :
    # parents[1] = le skill, parents[4] = le dépôt de la forge, parents[5] = son parent (`c:\dev`).
    # Même règle que `{pilot}` de quality-oracles : quatre crans au-dessus du dossier du SKILL.
    pistes.append(Path(__file__).resolve().parents[5] / "digit-ai-factory")
    return pistes


def resoudre_oracle_style() -> tuple[Path | None, str]:
    """Le script de l'oracle d'écriture du pilot, ou `None` et le motif qui NOMME les pistes."""
    essayees = []
    for p in pistes_pilot():
        cible = p / "oracles" / "oracle-ecriture.mjs"
        essayees.append(str(cible))
        if cible.exists():
            return cible, ""
    return None, ("oracle de style INJOIGNABLE — pistes essayées : " + " · ".join(essayees)
                  + ". Poser `FORGE_ROOT` ou cloner `digit-ai-factory` à côté du dépôt de la "
                    "forge. Le verdict ci-dessous ne porte QUE sur M7-M18 : ne pas le lire "
                    "comme un texte au style jugé")


def chemin_relatif_pour_anteriorite(fichier: Path, pilot: Path) -> str:
    """Le chemin que l'oracle compare à sa liste d'antériorité (EC-6).

    La liste du pilot est faite de chemins RELATIFS À UNE RACINE DE DÉPÔT (`CLAUDE.md`,
    `gabarits/RESTITUTION.md`, `references/BEST-PRACTICES-HTML.md`…). On lui donne donc le
    chemin relatif à la racine qui contient le fichier : celle du pilot quand le fichier y vit,
    sinon le dépôt git qui le porte. Un produit qui hérite d'un `CLAUDE.md` reçoit ainsi la même
    exemption que l'original — c'est le MÊME texte normatif antérieur à la doctrine.
    """
    fichier = fichier.resolve()
    racines = [pilot]
    for parent in fichier.parents:
        if (parent / ".git").exists():
            racines.append(parent)
            break
    for racine in racines:
        try:
            return fichier.relative_to(racine).as_posix()
        except ValueError:
            continue
    return fichier.name


def juger_style(fichier: Path) -> dict:
    """Joue l'oracle d'écriture du pilot sur `fichier` et rend son bloc de verdict.

    Rend toujours un dictionnaire : `verdict` ∈ PASS | FAIL | SKIP | ERREUR, `fails` (les
    constats bloquants), `warns` (les avertissements, qui n'échouent jamais), `non_juge`.
    """
    oracle, motif = resoudre_oracle_style()
    if oracle is None:
        return {"verdict": "SKIP", "motif": motif, "fails": [], "warns": [], "non_juge": []}
    node = shutil.which("node")
    if not node:
        return {"verdict": "SKIP", "fails": [], "warns": [], "non_juge": [],
                "motif": "oracle de style NON JOUÉ : `node` est absent du PATH de ce poste. Le "
                         "verdict ci-dessous ne porte QUE sur M7-M18"}
    relatif = chemin_relatif_pour_anteriorite(fichier, oracle.parents[1])
    try:
        r = subprocess.run([node, str(oracle), str(fichier), "--chemin-relatif", relatif],
                           capture_output=True, text=True, encoding="utf-8", timeout=180)
    except Exception as e:                                    # noqa: BLE001
        return {"verdict": "ERREUR", "fails": [], "warns": [], "non_juge": [],
                "motif": f"oracle de style NON JOUÉ ({type(e).__name__}) : {e}. Le verdict "
                         "ci-dessous ne porte QUE sur M7-M18"}
    try:
        d = json.loads((r.stdout or "").strip())
    except Exception:                                         # noqa: BLE001
        extrait = (r.stdout or r.stderr or "(sortie vide)").strip()[:200]
        return {"verdict": "ERREUR", "fails": [], "warns": [], "non_juge": [],
                "motif": "oracle de style ILLISIBLE (sortie hors contrat JSON) : " + extrait
                         + ". Le verdict ci-dessous ne porte QUE sur M7-M18"}
    fails, warns = [], []
    for f in d.get("findings", []):
        ligne = f" (ligne {f['ligne']})" if "ligne" in f else ""
        texte = f"{f.get('regle')} {f.get('message')}{ligne}"
        if f.get("statut") == "FAIL":
            fails.append(texte)
        elif f.get("statut") in ("AVERT", "SKIP"):
            warns.append(texte)
    return {"verdict": d.get("verdict", "ERREUR"), "motif": "",
            "oracle": str(oracle), "chemin_relatif": relatif, "mots": d.get("mots"),
            "fails": fails, "warns": warns, "non_juge": d.get("non_juge", [])}



NON_JUGE = [
    "les règles qui dépendent du RENDU — texte tronqué, largeur, surlignage, glyphes, coupure de "
    "mot : la mise en page d'un Markdown appartient au lecteur, pas au document",
    "L3 (une valeur porte sa légende) et L12 (une énumération de données n'est pas une phrase) "
    "restent une REVUE DE LECTURE : reconnaître « une valeur mise en avant » dans du Markdown "
    "demande de lire, et les mécaniser produirait plus de bruit que de gain",
    "M18 ne voit que les familles SANS homonyme (Q-…, RA-…, RD-…, ADR nnnn) plus celles que le "
    "document DÉCLARE en frontmatter (`codes: E,C,H`) — `H1` désigne un titre bien plus souvent "
    "qu'une question, et `A4` est un format de papier",
    "la JUSTESSE d'une glose : la présence d'une explication après le jeton, jamais qu'elle "
    "explique vraiment",
    "le seuil de M10 (12 lignes de tableau) est une donnée, pas une vérité",
    "TF-0720 — la neutralisation d'emphase couvre `**`, `__`, `*` et `_` sur UNE ligne : une "
    "emphase ouverte sur une ligne et fermée sur la suivante n'est pas reconnue, et le jeton "
    "qu'elle encadre reste jugé sur son texte brut",
    "TF-0720 — le reflux du paragraphe s'arrête à 3 lignes : une glose repoussée plus loin que "
    "trois lignes après son jeton n'est plus une glose adjacente, c'est un autre paragraphe",
    "la lecture des nombres (`nombres_de`) est OFFERTE ici pour que le contrôle des chiffres "
    "partage la même normalisation ; sa PORTÉE effective appartient à l'oracle Calculs, qui vit "
    "hors de ce skill",
]


def main() -> None:
    ap = argparse.ArgumentParser(description="Lisibilité d'un document Markdown (M7, M10, M14, M18).")
    ap.add_argument("fichier", type=Path)
    ap.add_argument("--output", choices=["text", "json"], default="text")
    ap.add_argument("--style", action="store_true",
                    help="joint l'oracle de style du pilot (oracle-ecriture.mjs, regles EC-1 a "
                         "EC-6) et FUSIONNE son verdict : FAIL de l'un = FAIL de l'ensemble. "
                         "Oracle injoignable : dit en clair, verdict des seules regles M")
    args = ap.parse_args()

    if not args.fichier.exists():
        print(json.dumps({"source": str(args.fichier), "verdict": "NON_JUGEABLE",
                          "message": "fichier absent"}, ensure_ascii=False))
        sys.exit(2)
    try:
        texte = args.fichier.read_text(encoding="utf-8")
    except Exception as e:                                    # noqa: BLE001
        print(json.dumps({"source": str(args.fichier), "verdict": "NON_JUGEABLE",
                          "message": f"illisible : {e}"}, ensure_ascii=False))
        sys.exit(2)

    fails, warns = juger(texte)
    # TF-1064 — LA FUSION. Les regles M (structure) et les regles EC (style) jugent deux choses
    # differentes du meme texte ; leur verdict est UN. Un FAIL de style echoue l'ensemble, et un
    # oracle de style injoignable ne rend jamais l'ensemble vert en silence : il se declare.
    style = juger_style(args.fichier) if args.style else None
    regles = list(REGLES)
    non_juge = list(NON_JUGE)
    if style is None:
        non_juge.append("le STYLE (tournures creuses, phrases longues en serie, profondeur de "
                        "puces, emphase de structure) : delegue a `oracle-ecriture.mjs` du pilot "
                        "et NON JOUE ici — le rejouer avec `--style`")
    else:
        regles += ["EC-1", "EC-2", "EC-3", "EC-4", "EC-5", "EC-6"]
        non_juge += [f"[style] {n}" for n in style["non_juge"]]
        fails += [f"[style] {f}" for f in style["fails"]]
        warns += [f"[style] {w}" for w in style["warns"]]
        if style["verdict"] in ("SKIP", "ERREUR") and style.get("motif"):
            non_juge.append("[style] " + style["motif"])
            warns.append("[style] " + style["motif"])
    verdict = "FAIL" if fails else "PASS"
    if args.output == "json":
        sortie = {
            "source": str(args.fichier), "regles": regles, "verdict": verdict,
            "fails": fails, "warns": warns, "non_juge": non_juge,
        }
        if style is not None:
            sortie["style"] = style
        print(json.dumps(sortie, ensure_ascii=False, indent=2))
    else:
        print(f"Source  : {args.fichier}")
        print(f"Règles  : {', '.join(regles)}")
        if style is not None:
            detail = style.get("motif") or (f"{style.get('mots')} mots de prose juges "
                                            f"(chemin relatif : {style.get('chemin_relatif')})")
            print(f"Style   : {style['verdict']} — {detail}")
        print(f"Verdict : {verdict}")
        if fails:
            print("\nÉchecs bloquants :")
            for f in fails:
                print(f"  x {f}")
        if warns:
            print("\nAvertissements :")
            for w in warns:
                print(f"  ! {w}")
        if not fails and not warns:
            print("\nAucun défaut de lisibilité mécanisable détecté.")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
