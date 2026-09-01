#!/usr/bin/env python3
"""
check_html.py — Contrôle de conformité d'une page HTML au socle Digit-AI.

Deux familles de contrôles, déterministes, sans dépendance externe ni appel LLM :

  · CHARTE  — obligatoires de charte, d'accessibilité et d'export print ;
              inclut A1, l'autonomie réseau (D-10 organization) : un livrable
              sortant n'émet aucune requête au chargement. Inclut G1, la bascule
              thème sombre câblée (R-30, TF-0134) : un bouton .theme-toggle qui ne
              pose jamais data-theme est une affordance sans effet (loi transverse
              n°1) — FAIL. L'absence totale de bouton n'est qu'un avertissement :
              un rendu figé (export print/PDF) n'a légitimement aucune bascule.
  · L1-L17  — lisibilité (references/lisibilite.md) : texte tronqué, largeur de
              lecture, valeur sans barème, liste longue non filtrable, surlignage
              qui casse les mots, sommaire muet ou à ancre morte, chapitre sans
              chapeau (ou chapeau répété/de remplissage), lien interne sans
              destination, détail vide, table de données sans mode d'emploi ;
              L15 glyphe CSS hors liste blanche (avertissement), L16 onglets
              accessibles, L17 lignes de tableau dépliables.

Ce qui suppose de LIRE (clarté, pertinence, justesse d'un chapeau) n'est pas ici :
c'est la revue de lecture, déclarée comme telle dans references/lisibilite.md.

Usage :
    python check_html.py page.html
    python check_html.py page.html --regles L        # lisibilité seule
    python check_html.py page.html --regles charte   # charte seule
    python check_html.py page.html --output json
    python check_html.py                             # échantillon intégré

Sortie : liste de FAIL (bloquants) et WARN (à traiter selon contexte).
Code de sortie : 0 si aucun FAIL, 1 sinon.
"""
import argparse
import hashlib
import json
import re
import sys

# Windows : forcer stdout/stderr en UTF-8 pour ne pas planter (cp1252) à l'impression
# de caractères hors Latin-1 (✅, ①-⑤, tirets cadratins…). Garde-fou si non supporté.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

from html.parser import HTMLParser

# ---------------------------------------------------------------------------
# Échantillon intégré (conforme) — permet de lancer le script sans fichier.
# ---------------------------------------------------------------------------
SAMPLE = """<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Digit-AI — Exemple de page conforme · Socle — 20260817a</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext x='32' y='46' font-size='40' text-anchor='middle' fill='%232563EB'%3ED%3C/text%3E%3C/svg%3E">
<style>:root{--head:"Roboto",system-ui,sans-serif;--sans:"DM Sans",system-ui,sans-serif;}
@media (max-width:640px){body{font-size:15px;}}
@media print{body{background:#fff;}}</style></head>
<body><main><h1>Titre</h1><h2>Section</h2><p>Contenu</p></main></body></html>"""

VIDES = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
         "meta", "param", "source", "track", "wbr"}
# L7 (TF-0423) : lexique FERMÉ du remplissage — la phrase qui paraphrase le titre au lieu de
# dire ce que le chapitre apprend ; et plafond de mots au-delà duquel c'est un paragraphe.
RE_CHAPEAU_REMPLISSAGE = re.compile(
    r"ce chapitre (apporte|présente|presente|détaille|detaille|regroupe|contient|expose) "
    r"(les éléments|les elements|les données|les donnees|les informations|le contenu|ce qui est) "
    r"(annonc|attendu|li[ée]|relatif|indiqu)", re.I)
SEUIL_MOTS_CHAPEAU = 60
# L8 (TF-0434) : un libellé-identifiant du document — H5, E2, 1.5, ADR 0022, RD-12.
RE_IDENTIFIANT = re.compile(r"^(?:[A-Z]{1,4}[ -]?\d{1,4}(?:[.\-]\d{1,4})?|\d{1,3}(?:\.\d{1,3})+)$")
# L15 (TF-0435) : glyphes employés en content: CSS — liste blanche de ce qui est réputé présent
# dans toute pile de repli ; tout le reste est signalé (jamais un échec).
RE_CONTENT_CSS = re.compile(r"""content\s*:\s*(["'])((?:\\.|(?!\1).)*)\1""")
# TF-0490 (22/08/2026) — la liste porte AUSSI les lettres latines etendues (oe, ae et leurs
# capitales). Ce ne sont pas des ornements : ce sont des lettres du francais, presentes dans
# toute police qui pretend l'ecrire. Les exclure aurait fait signaler « coeur » et « oeuvre ».
GLYPHES_SURS = set("–—‘’“”•…‹›«»·×→←↑↓↔✓✔✗✘©®°±≥≤≠∞€  ​œŒæÆ")
# L16 / L17 : réaffichage à l'impression (composants tabs.js et table-detail.js).
RE_PRINT_TABPANEL = re.compile(r"@media\s+print[^{]*\{[\s\S]*?tabpanel", re.I)
RE_PRINT_DETAIL = re.compile(r"@media\s+print[^{]*\{[\s\S]*?data-detail", re.I)

# Classes qui désignent une valeur mise en avant.
# TF-0433 (lot Client-B 20260820b) : « note » est AMBIGU — note chiffrée ou remarque (« card note »).
# Il n'entre ici que combiné à un chiffre dans le contenu (voir est_score) ; `.card.note` est
# la classe d'encadré du socle, et le message de L3 nomme désormais ce qui l'a déclenché.
CL_SCORE = {"sc", "score", "jauge"}                  # → barème lié obligatoire
CL_SCORE_AMBIGUE = {"note"}                           # score seulement si un chiffre suit
CL_VALEUR = {"kpi", "badge", "pastille", "pv", "chip-val", "stat"}  # → légende

RE_NM = re.compile(r"^\s*\d+(?:[.,]\d+)?\s*/\s*\d+\s*$")
RE_COUPE = re.compile(r"[\wÀ-ɏ](?:…|\.\.\.)$")
RE_MOT = re.compile(r"[\wÀ-ɏ]")

# L11 — littéraux d'absence d'un langage, rendus tels quels dans du texte destiné
# à un lecteur. « null » n'est pas un mot français : c'est une valeur non
# renseignée que le producteur a laissé fuiter au lieu de la traiter.
RE_LITTERAL = re.compile(
    r"(?:^|[\s(\[«:;,>—–-])"
    r"(null|NULL|None|NONE|undefined|NaN|nil|\[object Object\]|"
    r"\{\{[^}\n]{0,40}\}\}|\$\{[^}\n]{0,40}\})"
    r"(?=$|[\s)\]».;,:!?<—–-])")

# L18 (TF-0517) — les RENVOIS CODÉS du vocabulaire d'un livrable. Motif fermé et volontairement
# étroit : ce sont les familles réellement employées par les livrables de la maison. Un jeton hors
# de cette liste n'est pas détecté, et c'est le prix du zéro faux positif — `E2` est un renvoi,
# `A4` est un format de papier, et seule la liste les sépare.
# `TF-nnnn` est VOLONTAIREMENT hors du motif : un identifiant de notre registre dans un texte
# rendu est de la plomberie interne, donc le domaine de L14 — l'y remettre ferait crier deux
# règles pour un seul défaut, et L18 signalerait les pages qui PARLENT du registre.
#
# ET `H1`, `C1`, `E1` N'Y SONT PAS NON PLUS, pour une raison mesurée : `H1` désigne un TITRE HTML
# bien plus souvent qu'une question numérotée. Le premier jet les devinait, et la règle a
# immédiatement fait échouer la page du registre du pilot sur la phrase « le premier replace ne
# matche rien … LE TITRE RESTE » — où `H1` est l'élément de titre. Un contrôle qui crie sur le
# vocabulaire du langage qu'il juge n'est pas tenable.
#
# Les familles GUESSABLES sont donc celles qui n'ont pas d'homonyme : `Q-…`, `RA-…`, `RD-…`,
# `ADR nnnn`. Les familles AMBIGUËS se DÉCLARENT, par `data-codes="E,C,H"` sur n'importe quel
# ancêtre — la page qui emploie un vocabulaire de renvois sait lequel, et le déclarer coûte un
# attribut. C'est la loi n° 4 : un référentiel qui dépend du document est une donnée du document.
RE_RENVOI = re.compile(r"\b(?:Q-[A-Z]{1,3}\d{0,3}|R[AD]-\d{1,3}|ADR\s\d{4})\b")

# L14 — la PLOMBERIE affichée : une convention de balisage interne qui traverse le rendu.
#
# Né d'un défaut livré (Produit-10, 14/08) : un rapport diffusé portait 71 occurrences de
# marqueurs `[c:ec-sources]` en clair dans ses phrases — « 85 [c:ec-sources] sources ALX ».
# Il était PASS à check_html, PASS à render_page sur cinq largeurs, PASS à 24 contrôles
# d'interactions maison. Aucun oracle ne LISAIT le texte rendu ; l'humain l'a vu au premier
# coup d'œil, capture à l'appui.
#
# L11 couvrait déjà deux des sept motifs cités par le retour (`{{…}}`, `${…}`) — la preuve
# que l'axe était juste et le filet troué. L14 prend les autres, et ne redit pas L11.
#
# Deux niveaux, et la distinction n'est pas cosmétique :
#   FAIL — ce qui n'a JAMAIS de raison d'être lu : marqueur crocheté à préfixe court
#          (`[c:…]`, `[ref:…]`), substitution printf (`%s`, `%(nom)s`), « lorem ipsum » ;
#   WARN — `TODO` / `FIXME` / `XXX` / `HACK` : une page PEUT légitimement parler de tâches
#          (le registre TODO du pilot en est une). En faire un échec forcerait une exemption
#          sur une page honnête, et une exemption de routine ne se lit plus.
RE_GABARIT = re.compile(
    r"(?:^|[\s(«:;,>—–-])"
    r"(\[[a-zA-Z]{1,6}:[^\]\n]{1,48}\]|%\([\w-]{1,24}\)[sdifr]|%[sdifr]\b|lorem ipsum)",
    re.IGNORECASE)
RE_MARQUEUR_TRAVAIL = re.compile(
    r"(?:^|[\s(«:;,>])(TODO|FIXME|XXX|HACK)(?=$|[\s)»:;,.!?—–-])")

# En-têtes de colonne qui annoncent une valeur CALCULÉE : sans formule publiée, le
# lecteur doit croire sur parole la colonne qui classe tout le reste.
RE_TH_SCORE = re.compile(
    r"^\s*(score|note|indice|priorit[ée]|pond[ée]ration|classement|"
    r"criticit[ée]|s[ée]v[ée]rit[ée])\b", re.I)

# Valeurs opaques : empreinte hexadécimale, ou jeton codé en kebab-case à trois
# segments ou plus (`ia-assistee-validation-humaine`). Ni l'une ni l'autre ne se
# lit sans légende.
RE_EMPREINTE = re.compile(r"^[0-9a-f]{8,64}$")
RE_JETON = re.compile(r"^[a-z][a-z0-9]*(?:[-_][a-z0-9]+){2,}$")

# Mots qui ne désignent rien : un <summary> qui n'en contient QUE ceux-là promet une
# information sans dire laquelle. Les mots-outils sont ignorés avant le test — c'est
# le mot plein qui décide. « Afficher la dette » passe (« dette » désigne) ;
# « voir plus » échoue.
STOP_FR = {"le", "la", "les", "un", "une", "des", "de", "du", "d", "l", "au", "aux",
           "en", "et", "ou", "ce", "ces", "cet", "cette", "the", "a", "of", "to"}
MOTS_CREUX = {"détail", "détails", "detail", "details", "plus", "info", "infos",
              "information", "informations", "voir", "savoir", "ouvrir", "afficher",
              "développer", "developper", "déplier", "deplier", "suite", "more",
              "show", "expand", "ici", "cliquer", "clic", "here", "read", "lire",
              "complément", "complements", "compléments", "autres", "etc"}

# L12 — une énumération de données déguisée en phrase. « Informations — pages 7,
# étendue en mots 386-567 ; Inclus — pages 7, … » : trois segments « clé — valeur »
# séparés par des points-virgules ne sont plus de la prose, c'est un tableau qu'on
# refuse d'assumer. Le lecteur ne peut ni comparer, ni trier, ni repérer la valeur
# aberrante — et il ne sait pas ce qu'il devrait en conclure.
RE_SEGMENT = re.compile(r"^[^;]{3,}?\s[—–]\s[^;]{3,}$")

# L9(c) — volume minimal qu'un dépliant doit cacher pour mériter un clic.
SEUIL_DEPLIANT = 200


# ---------------------------------------------------------------------------
# Arbre léger. La conformité de lisibilité se décide sur la structure, pas sur
# des expressions régulières appliquées au texte brut : une ancre morte ou un
# tooltip vide ne se voient pas autrement.
# ---------------------------------------------------------------------------
class Noeud:
    __slots__ = ("tag", "attrs", "enfants", "parent")

    def __init__(self, tag, attrs=None, parent=None):
        self.tag = tag
        self.attrs = attrs or {}
        self.enfants = []      # str (texte) ou Noeud
        self.parent = parent

    # -- accès -------------------------------------------------------------
    def att(self, nom):
        return self.attrs.get(nom)

    def classes(self):
        return set((self.attrs.get("class") or "").split())

    def texte(self):
        out = []
        for e in self.enfants:
            if isinstance(e, str):
                out.append(e)
            elif e.tag not in ("script", "style"):
                out.append(e.texte())
        return "".join(out)

    def texte_propre(self):
        return re.sub(r"\s+", " ", self.texte()).strip()

    def descendants(self):
        for e in self.enfants:
            if isinstance(e, Noeud):
                yield e
                yield from e.descendants()

    def ancetres(self):
        n = self.parent
        while n is not None:
            yield n
            n = n.parent

    def chemin(self):
        """Repère lisible pour le message d'échec."""
        bits = []
        n = self
        while n is not None and n.tag != "[racine]":
            b = n.tag
            if n.attrs.get("id"):
                b += "#" + n.attrs["id"]
            elif n.classes():
                b += "." + sorted(n.classes())[0]
            bits.append(b)
            n = n.parent
        # Les 4 premiers en partant de l'ELEMENT, pas de la racine : `html > body >
        # main > p` ne situe rien, `section#synthese > p > span.bl-n` situe.
        return " > ".join(reversed(bits[:4]))


class Arbre(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.racine = Noeud("[racine]")
        self.courant = self.racine
        self.textes = []        # (texte, noeud porteur)
        self.styles = []

    def handle_starttag(self, tag, attrs):
        n = Noeud(tag, {k: (v if v is not None else "") for k, v in attrs}, self.courant)
        self.courant.enfants.append(n)
        if tag not in VIDES:
            self.courant = n

    def handle_startendtag(self, tag, attrs):
        n = Noeud(tag, {k: (v if v is not None else "") for k, v in attrs}, self.courant)
        self.courant.enfants.append(n)

    def handle_endtag(self, tag):
        n = self.courant
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.courant = n.parent

    def handle_data(self, data):
        self.courant.enfants.append(data)
        if self.courant.tag == "style":
            self.styles.append(data)
        elif self.courant.tag != "script":
            self.textes.append((data, self.courant))


def construire(html: str) -> Arbre:
    a = Arbre()
    a.feed(html)
    a.close()
    return a


def index_ids(a: Arbre) -> dict:
    return {n.attrs["id"]: n for n in a.racine.descendants() if n.attrs.get("id")}


# ---------------------------------------------------------------------------
# CSS — découpage en (sélecteur, déclarations). Suffisant pour L2 et L5 : on ne
# cherche pas à comprendre la cascade, seulement à trouver une déclaration
# fautive là où elle est écrite.
# ---------------------------------------------------------------------------
def regles_css(styles, avec_contexte=False):
    """Aplatit la feuille en couples (selecteur, declarations).

    LE CONTEXTE D'AT-RULE ETAIT PERDU, ET CA A COUTE DOUZE FAUX BLOQUANTS (TF-0554, 24/08). Cette
    fonction jetait toute at-rule : un selecteur ecrit DANS un `@media` se retrouvait juge comme
    s'il s'appliquait partout. Mesure : huit livrables PASS le 19/08 rendaient douze FAIL le 24/08
    sans qu'un octet ait bouge, tous sur des cellules de tableau stylees UNIQUEMENT sous la media
    query du repli en cartes — c'est-a-dire la ou le socle lui-meme l'EXIGE. Un oracle qui juge un
    selecteur sans savoir sous quelle condition il vit condamne ce que la charte prescrit.

    `avec_contexte=True` rend des triplets (selecteur, declarations, contexte), le contexte etant le
    texte des at-rules englobantes ou une chaine vide. La forme a deux elements reste le defaut : les
    autres regles n'en ont pas besoin, et changer leur contrat pour une seule aurait ete un risque
    sans gain.
    """
    css = "\n".join(styles)
    css = re.sub(r"/\*.*?\*/", " ", css, flags=re.S)
    out = []
    pile = []          # at-rules ouvertes, tenues par comptage d'accolades
    i = 0
    while True:
        j = css.find("{", i)
        if j < 0:
            break
        tete = css[i:j].strip()
        if tete.startswith("@"):
            # At-rule A BLOCS : ses enfants sont des regles. On empile son texte et on entre dedans.
            pile.append(tete)
            i = j + 1
            continue
        k = css.find("}", j)
        if k < 0:
            break
        d = {}
        for morceau in css[j + 1:k].split(";"):
            if ":" in morceau:
                cle, val = morceau.split(":", 1)
                d[cle.strip().lower()] = val.strip().lower()
        if tete:
            contexte = " ".join(pile).lower()
            out.append((tete.lower(), d, contexte) if avec_contexte else (tete.lower(), d))
        i = k + 1
        # Une accolade fermante qui suit sans selecteur ferme l'at-rule la plus recente.
        while pile:
            m = re.match(r"\s*\}", css[i:])
            if not m:
                break
            pile.pop()
            i += m.end()
    return out


def _px(v):
    m = re.match(r"^(-?\d+(?:\.\d+)?)px$", (v or "").strip())
    return float(m.group(1)) if m else None


def _horizontaux(shorthand):
    """Composantes gauche/droite d'un raccourci padding/margin."""
    lots = (shorthand or "").split()
    if not lots:
        return []
    if len(lots) == 1:
        return [lots[0]]
    if len(lots) in (2, 3):
        return [lots[1]]
    return [lots[1], lots[3]]


def _non_nul(v):
    v = (v or "").strip()
    if not v or v in ("0", "auto", "inherit", "initial", "unset"):
        return False
    return not re.match(r"^0(?:px|em|rem|%|ch)?$", v)


# ---------------------------------------------------------------------------
# A4 — le titre porte marque, objet et indice de version (BEST-PRACTICES A4, motif
# « {Marque} — {Objet} · {Client} — {version} », repère F2 « Client-A — … — V20260715a »).
#
# Né d'un défaut livré (lot Produit-01, 17/08) : un rapport d'audit remis à un client
# s'intitulait « Écarts Approval V1 » — ni marque, ni indice DATÉ. Le titre est la seule
# métadonnée qui suit le fichier partout (onglet, favori, pied d'impression, pièce jointe
# d'un courriel) : sans marque le lecteur ne sait pas d'où vient le document, sans date
# deux révisions du même jour portent le même nom à l'écran.
#
# Deux conditions mesurables, dans cet ordre de lecture :
#   · la forme SEGMENTÉE du motif (au moins un séparateur entouré d'espaces) — c'est ce
#     qui sépare la marque de l'objet ; la marque elle-même ne se vérifie pas sans
#     registre de marques, et un tel registre serait une fausse précision (écart assumé) ;
#   · un indice de version DATÉ, au nommage du socle (`{YYYYMMDD}{a,b,c…}`), en ISO ou en
#     date longue française. « V1 » n'en est pas un : c'est précisément ce que portait le
#     livrable fautif.
RE_A4_SEGMENTS = re.compile(r"\s[—–·|-]\s")
RE_A4_VERSION = re.compile(
    r"\bv?\d{8}[a-z]?\b"                                  # 20260817a · V20260715a
    r"|\b\d{4}-\d{2}-\d{2}\b"                             # 2026-08-17
    r"|\b\d{1,2}\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|"
    r"septembre|octobre|novembre|d[ée]cembre)\s+\d{4}\b",  # 17 août 2026
    re.I)

# A2/G2 — favicon SVG en `data:` URI (BEST-PRACTICES A2, systématisé G2 le 13/08 au titre
# de la loi transverse n°3). Zéro requête, net en PDF, et un onglet identifiable parmi
# vingt. Le `rel` se lit par JETONS : « apple-touch-icon » contient le mot « icon » sans
# être le favicon du document.
RE_A2_LINK = re.compile(r"<link\b[^>]*>", re.I)
RE_A2_REL = re.compile(r'\brel\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))', re.I)
RE_A2_HREF = re.compile(r'\bhref\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))', re.I)


def _val(m):
    """Valeur d'attribut, quel que soit le guillemetage (ou son absence)."""
    return next((g for g in m.groups() if g is not None), "") if m else ""


RE_COMMENTAIRE_HTML = re.compile(r"<!--.*?-->", re.S)
RE_COMMENTAIRE_CSS = re.compile(r"/\*.*?\*/", re.S)


def _sans_commentaires(html: str) -> str:
    """HTML privé de ses commentaires — un commentaire n'est ni du balisage ni du CSS.

    Pas une précaution de principe : les trois règles ajoutées le 17/08 se sont chacune
    trompée sur un commentaire au premier essai, et toujours sur un texte du socle qui
    DOCUMENTE la règle. Le gabarit écrit « initialisation AVANT le <style> » : l'extraction
    naïve des blocs `<style>` ouvrait son bloc dans le commentaire et y lisait le mot
    « prefers-color-scheme » que le socle cite pour dire qu'il est RETIRÉ. La fixture rouge
    du fragment écrit « le service fournit <html>, … et <body> » : A1 la croyait complète.
    La fixture A2 écrit « la présence d'un <link rel="icon"> ne suffit pas » : A2 y voyait
    un favicon. Un contrôle qui accuse — ou innocente — sur un commentaire condamne le
    socle à ne plus expliquer ses propres règles.
    """
    return RE_COMMENTAIRE_HTML.sub(" ", html)


# ---------------------------------------------------------------------------
# CHARTE — contrôles historiques, inchangés dans leur sévérité.
# ---------------------------------------------------------------------------
def check_charte(html: str):
    fails, warns = [], []
    low = html.lower()
    # Vue « balisage réel » (commentaires retirés) : les contrôles de PRÉSENCE d'une balise
    # s'y jugent, sinon un commentaire qui cite la balise attendue innocente la page.
    low_net = _sans_commentaires(html).lower()
    net = _sans_commentaires(html)

    if "<!doctype html>" not in low:
        fails.append("A1 DOCTYPE html manquant.")

    # A1 (suite) — TF-0303 (lot Produit-01, 17/08) : un HTML écrit pour une publication
    # HÉBERGÉE n'est pas auto-portant. L'hôte fournit <html>, <head> et <body> AU MOMENT
    # de la publication ; le fichier écrit sur disque, celui qui part en pièce jointe et
    # qui reste dans les dossiers, n'en a AUCUN. Constaté sur pièces : un rapport d'audit
    # remis à un client, sans doctype ni head — donc sans langue déclarée, sans encodage
    # et sans viewport d'un seul coup. A1 est la règle qui PORTE les trois autres : les
    # contrôles A3 ne peuvent même pas s'appliquer à un fragment.
    for balise in ("html", "head", "body"):
        if not re.search(rf"<{balise}[\s>]", low_net):
            fails.append(
                f"A1 <{balise}> absent — ce fichier est un FRAGMENT, pas un livrable "
                "auto-portant : si un service d'hébergement fournit le squelette à la "
                "publication, le fichier livré, lui, ne l'a pas (A1, cas Produit-01 du "
                "17/08).")

    # TF-0241 (15/08) : un livrable non francophone ASSUMÉ déclare sa langue — le mur
    # « lang="fr" ou rien » bloquait les kits bilingues (constaté sur AuditCore en).
    # fr reste le défaut Digit-AI : toute autre langue passe en avertissement, jamais
    # en silence ; l'absence de déclaration reste un échec.
    m_lang = re.search(r'<html[^>]*\blang\s*=\s*"([a-z]{2}(?:-[a-z0-9]+)*)"', low)
    if not m_lang:
        fails.append('A3 attribut lang absent ou vide sur <html> '
                     '(défaut Digit-AI : lang="fr").')
    elif m_lang.group(1) != "fr" and not m_lang.group(1).startswith("fr-"):
        warns.append(f'lang="{m_lang.group(1)}" déclaré — accepté (TF-0241, livrable non '
                     'francophone assumé) ; le défaut Digit-AI reste "fr".')

    m_charset = re.search(r'<meta[^>]*charset', low)
    m_title = re.search(r"<title[ >]", low)
    if not m_charset:
        fails.append("A3 <meta charset> absent.")
    elif m_title and m_charset.start() > m_title.start():
        fails.append("A3 <meta charset> doit précéder <title> (priorité d'encodage).")

    # A3 (suite) — TF-0303 : la déclaration d'encodage doit tomber dans les 1024 PREMIERS
    # OCTETS, seuil de la spécification HTML : au-delà, l'analyseur a déjà commencé à
    # deviner. Sur un rapport rédigé en français, deviner signifie « é » rendu « Ã© » —
    # et le lecteur croit à un document abîmé. La mesure est en octets de l'encodage
    # réel, pas en caractères : un long commentaire accentué consomme deux fois plus vite.
    # Le gabarit du socle lui-même tombait à 1613 (le commentaire S-G1 et son script
    # d'initialisation passaient AVANT le charset) — la règle a trouvé son premier défaut
    # dans sa propre référence.
    if m_charset:
        m_charset_h = re.search(r"<meta[^>]*charset", html, re.I)
        debut = m_charset_h.start() if m_charset_h else m_charset.start()
        octets = len(html[:debut].encode("utf-8"))
        if octets >= 1024:
            fails.append(
                f"A3 <meta charset> déclaré au {octets}e octet — la spécification exige "
                "les 1024 premiers : au-delà, le navigateur a déjà commencé à deviner "
                "l'encodage. Placer charset PUIS viewport en toute première position du "
                "<head>, avant tout commentaire et tout script d'initialisation.")

    if not re.search(r'<meta[^>]*name\s*=\s*"viewport"', low):
        fails.append("A3 <meta viewport> absent.")

    # TF-0174 (13/08) : les <h1> des GABARITS JS (template literals dans <script>) ne sont
    # jamais au DOM — le navigateur lit un script comme du texte brut. Les blocs script
    # sont retirés avant comptage (lecture navigateur, même technique qu'A1-bis) ; faux
    # positif constaté : 7 h1 comptés sur une maquette SPA qui n'en affiche qu'un.
    hors_scripts = re.sub(r"<script\b[^>]*>.*?</script", "", low, flags=re.S)
    h1_count = len(re.findall(r"<h1[ >]", hors_scripts))
    if h1_count == 0:
        fails.append("Aucun <h1> (un titre principal unique est requis).")
    elif h1_count > 1:
        fails.append(f"{h1_count} balises <h1> — il en faut exactement une.")

    if ":root" not in low:
        fails.append(":root absent (tokens CSS centralisés requis).")

    title_txt = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    if not title_txt or not title_txt.group(1).strip():
        fails.append("<title> vide ou absent.")
    else:
        # A4 (TF-0303) — le titre PORTE le document hors de son dossier. Jugé sur les deux
        # composantes vérifiables du motif : la segmentation (marque séparée de l'objet) et
        # l'indice de version daté. Les deux messages sont distincts : « sans marque » et
        # « sans version » ne se corrigent pas du même geste.
        titre = re.sub(r"\s+", " ", title_txt.group(1)).strip()
        if not RE_A4_SEGMENTS.search(titre):
            fails.append(
                f"A4 titre sans marque : « {titre[:70]} » — motif attendu "
                "« {Marque} — {Objet} · {Client} — {version} » : un titre d'un seul bloc "
                "ne dit pas d'où vient le document (cas Produit-01 : « Écarts Approval V1 »).")
        if not RE_A4_VERSION.search(titre):
            fails.append(
                f"A4 titre sans indice de version daté : « {titre[:70]} » — reprendre "
                "l'indice du nommage socle ({YYYYMMDD}{a,b,c…}), une date ISO ou une date "
                "longue française ; « V1 » ne distingue pas deux révisions du même jour.")

    # A2/G2 (TF-0303) — favicon SVG en `data:` URI. Absent, l'onglet porte l'icône
    # générique du navigateur et le document se perd parmi vingt autres ; posé en fichier
    # externe, il devient une requête (A1) ou une icône morte dès que le fichier voyage
    # seul. Le gabarit du socle l'embarque : remplacer {L} par l'initiale du client.
    liens_icone = []
    for m in RE_A2_LINK.finditer(net):
        rels = set(_val(RE_A2_REL.search(m.group(0))).lower().split())
        if rels & {"icon", "shortcut"}:
            liens_icone.append(m.group(0))
    if not liens_icone:
        fails.append(
            "A2 favicon absent — tout HTML créé porte son favicon-lettre en `data:` URI "
            "(<link rel=\"icon\" type=\"image/svg+xml\" href=\"data:image/svg+xml,…\">), "
            "initiale du client ou du projet : zéro requête, net en PDF, onglet "
            "identifiable (A2/G2, loi transverse n°3).")
    elif not any(re.match(r"\s*data:", _val(RE_A2_HREF.search(t)), re.I)
                 for t in liens_icone):
        fails.append(
            "A2 favicon non embarqué : le <link rel=\"icon\"> pointe un FICHIER "
            f"({_val(RE_A2_HREF.search(liens_icone[0]))[:60]!r}) — un livrable qui voyage "
            "seul perd son icône ; embarquer le SVG en `data:` URI.")

    if not re.search(r"@media\s+print", low):
        fails.append("@media print absent (robustesse export PDF).")

    if re.search(r"\bsyne\b", low):
        fails.append("Police Syne détectée — interdite par la charte.")

    for decl in re.findall(r"font-family\s*:\s*([^;}{]+)", low):
        if '"' in decl or "'" in decl:
            if not re.search(r"(system-ui|sans-serif|-apple-system|monospace|serif)", decl):
                warns.append(f"font-family sans repli système : {decl.strip()[:60]}")

    levels = [int(x) for x in re.findall(r"<h([1-6])[ >]", low)]
    for a, b in zip(levels, levels[1:]):
        if b > a + 1:
            warns.append(f"Saut de hiérarchie de titre : h{a} suivi de h{b}.")
            break

    # TF-0228 (lot Produit-10, 14/08) — cet avertissement frappait le script que le pattern S-G1
    # du MÊME socle EXIGE en <head>, avant <style>, pour poser data-theme avant la première
    # peinture. `defer` produirait exactement le flash que le pattern évite : la page était
    # donc sommée de violer sa propre charte. Conséquence mesurée : les 4 livrables HTML d'un
    # projet portaient cet avertissement à CHAQUE exécution depuis le 13/08 — et c'est dans ce
    # bruit permanent que TF-0227 (71 marqueurs affichés) est passé inaperçu. Un avertissement
    # inévitable cesse d'être lu, puis couvre les autres.
    #
    # RECONSTAT RA-11 / TF-0368 (lot Produit-10 20260818a, 18/08) — et il INFIRME à moitié ce qui
    # précède. Le 14/08, cet avertissement était dénoncé comme un faux positif permanent, et
    # l'exemption ci-dessous a été posée pour ça. Mesure du 18/08 : après avoir placé `charset`
    # et `viewport` en TOUTE PREMIÈRE position du <head> (correctif A3), l'avertissement a
    # DISPARU des cinq livrables d'un projet réel. Le bruit n'était donc pas inévitable — il
    # signalait un vrai défaut d'ORDRE dans le <head>, que personne ne lisait dans le message
    # parce que le message ne parlait que de `defer`.
    #
    # L'exemption S-G1 reste juste et n'est pas retirée : le script de thème doit bien s'exécuter
    # avant la première peinture. Ce qui change est le MESSAGE — il dit maintenant ce qui doit
    # précéder le script. Un avertissement qui ne nomme pas la cause corrigeable se lit comme
    # une fatalité, et une fatalité, on l'exempte au lieu de la corriger.
    #
    # Reconnaissance par ce que le script FAIT (il pose data-theme), pas par une étiquette :
    # les pages déjà générées n'en portent aucune et un label rétroactif ne serait jamais posé.
    # L'attribut déclaratif `data-theme-init` est accepté aussi, pour les pages à venir. Toute
    # AUTRE balise <script> bloquante en <head> reste signalée — le périmètre bouge, pas la
    # sévérité.
    head = re.search(r"<head[^>]*>(.*?)</head>", html, re.S | re.I)
    if head:
        dedans = head.group(1)
        bloquants = 0
        for m in re.finditer(r"<script([^>]*)>(.*?)</script>", dedans, re.S | re.I):
            attrs, corps = m.group(1), m.group(2)
            if re.search(r"\b(defer|async)\b", attrs, re.I):
                continue
            if "data-theme-init" in attrs.lower() or RE_G1_CABLAGE.search(corps):
                continue
            bloquants += 1
        if bloquants:
            warns.append(
                f"{bloquants} script(s) bloquant(s) dans <head> (utiliser defer ou placer en "
                "fin de body) — l'initialisation de thème S-G1 est exemptée : elle DOIT "
                "s'exécuter avant la première peinture. **Et l'ordre du <head> compte** : "
                "`charset` PUIS `viewport` avant TOUT script et TOUT commentaire (A3) — un "
                "script placé avant eux repousse la déclaration d'encodage hors des 1024 "
                "premiers octets.")

    if "<main" not in low:
        warns.append("Aucun <main> (repère sémantique principal recommandé).")

    imgs = re.findall(r"<img\b[^>]*>", low)
    no_alt = [t for t in imgs if "alt=" not in t]
    if no_alt:
        warns.append(f"{len(no_alt)} balise(s) <img> sans attribut alt.")

    if not re.search(r"@media[^{]*max-width", low):
        warns.append("Aucun @media max-width (responsive écran recommandé).")

    return fails, warns


# ---------------------------------------------------------------------------
# L1-L10 — lisibilité.
# ---------------------------------------------------------------------------
def _lignes_tbody(table: Noeud) -> int:
    corps = [n for n in table.descendants() if n.tag == "tbody"]
    cible = corps[0] if corps else table
    return sum(1 for n in cible.descendants() if n.tag == "tr")


def _sommaire(a: Arbre):
    for n in a.racine.descendants():
        if n.tag == "nav" and ("toc" in n.classes()
                               or (n.att("aria-label") or "").lower().startswith("sommaire")):
            return n
    return None


BALISES_CITATION = ("code", "pre", "kbd", "samp")


def _cite(porteur) -> bool:
    """Le texte est-il DANS une balise de citation ? Alors il est montre, pas fuite.

    Distinction tranchee chez forge-data le 14/08 (TF-0160) et verifiee sur 213 chiffres :
    un marqueur place dans un span de code est une MENTION. La reprendre ici evite qu une
    page qui DOCUMENTE une convention soit accusee de la laisser fuiter — cas reel : la
    carte TF-0227 du registre TODO, qui cite les marqueurs pour decrire le defaut.
    """
    return any(n.tag in BALISES_CITATION for n in [porteur, *porteur.ancetres()])


def _contenu_cite(porteur) -> bool:
    """Le texte vient-il d'une zone déclarée CITÉE (`data-cite`) ?

    Même doctrine que TF-0436 côté oracle-slop (21/08) : un oracle de FORME ne juge pas un
    texte que le livrable n'a pas écrit. Cas réel du 22/08 : la page du registre TODO rend le
    `contenu` des candidatures — écrit par leurs émetteurs, souvent en énumérations — et L12
    l'accusait de « données en prose ». Corriger reviendrait à réécrire le registre, qui est
    append-only. La zone se DÉCLARE (`data-cite`), elle ne se devine pas : c'est une
    convention exigible, pas une exemption tacite, et elle ne couvre que L12 — tout le reste
    (troncature, contraste, largeur, liens) continue de juger le rendu, cité ou non.
    """
    return any("data-cite" in n.attrs for n in [porteur, *porteur.ancetres()])


def check_lisibilite(html: str, a: Arbre):
    fails, warns = [], []
    ids = index_ids(a)
    css = regles_css(a.styles)
    toc = _sommaire(a)

    # --- L1 : zéro texte tronqué -----------------------------------------
    coupes = []
    for txt, porteur in a.textes:
        t = txt.rstrip()
        if not RE_COUPE.search(t):
            continue
        if any("data-ellipse-ok" in n.attrs
               for n in [porteur, *porteur.ancetres()]):
            continue
        coupes.append((t.strip()[-48:], porteur.chemin()))
    for extrait, ou in coupes[:6]:
        fails.append(f'L1 texte tronqué : « …{extrait} » ({ou}).')
    if len(coupes) > 6:
        fails.append(f"L1 texte tronqué : {len(coupes) - 6} autre(s) occurrence(s).")

    # --- L1 (suite) : aucune ligne n'ouvre sur une ponctuation -------------
    # Signature d'un assemblage cassé : un producteur insère un élément AU MILIEU
    # d'une phrase, l'élément est stylé en bloc, et la ponctuation qui suivait se
    # retrouve seule en tête de ligne. Constaté en production : « Le blocage
    # principal — », puis le titre du nœud, puis « . La fusion à opérer… ». Le
    # point est orphelin, la phrase coupée en deux, et rien ne le signalait.
    # TF-0488 (22/08/2026) — LE SUJET D'UN SÉLECTEUR EST SON DERNIER COMPOSANT, PAS LE PREMIER.
    # La collecte lisait `re.match(r"^([a-z]...)", sélecteur)` et ramassait TOUTES les classes du
    # sélecteur. Sur `a.kpi .kpi-label { display: flex }` elle capturait donc « a » et « .kpi »,
    # alors que le display s'applique à `.kpi-label` — le descendant. Conséquence : `a` entrait
    # dans l'ensemble des blocs, et TOUTE ponctuation suivant un lien devenait une faute.
    #
    # MESURÉ chez un produit : six échecs bloquants d'un coup sur des phrases parfaitement formées
    # du type « … voir la <a>matrice 7.2</a>. ». Et le message ne pouvait pas mettre sur la voie :
    # il désignait la PHRASE, jamais le sélecteur qui l'avait rendue fautive. Contournement subi :
    # réécrire huit sélecteurs pour qu'ils commencent par une classe — c'est-à-dire déformer la
    # feuille de style pour plaire au contrôle.
    #
    # On découpe donc sur les combinateurs (espace, `>`, `+`, `~`), on garde le DERNIER compound,
    # et on retient AUSSI quel sélecteur a fait entrer chaque jeton : le message le nomme.
    # LA CONTRAINTE D'ANCÊTRE SE RÉSOUT, ELLE NE SE JETTE PAS (TF-0683, mesure du 26/08/2026).
    #
    # Le correctif précédent (TF-0488) avait raison de retenir le DERNIER compound d'un sélecteur :
    # dans `.kpi-label a`, c'est bien `a` qui reçoit le display. Mais il jetait tout ce qui
    # précédait — et un jeton `a` mis dans un ensemble plat rend BLOC TOUT `<a>` DU DOCUMENT.
    #
    # MESURE SUR PIÈCE : un livrable recevait six constats L1 attribués au sélecteur `.toc a`, sur
    # des liens dont AUCUN n'est descendant du `<nav class="toc">` — celui-ci fermant à l'octet
    # 35102 quand les liens incriminés commencent à 35661. Dans un navigateur, la règle ne
    # s'applique à aucun d'eux.
    #
    # CE QUE COÛTAIT LE FAUX POSITIF, et c'est pire que le bruit : les deux seuls gestes qui
    # rendaient le livrable vert étaient de RETIRER des liens d'une prose où ils ont un sens, ou de
    # RENOMMER une classe de sommaire pour tromper le contrôle. Les deux dégradent le document —
    # or L1 existe précisément pour protéger la prose. Un contrôle dont la seule issue est la
    # dégradation de ce qu'il juge travaille contre son propre objet.
    #
    # LE RISQUE INVERSE EST NOMMÉ ET TRAITÉ : un matcher trop strict laisserait passer une vraie
    # coupure. Les sélecteurs qu'on ne sait pas évaluer — pseudo-classes, attributs, combinateurs
    # de fratrie — restent donc PERMISSIFS (le sujet seul suffit à déclarer le bloc), mais ils ne
    # sont plus NOMMÉS comme cause : dès qu'un contrôle dit POURQUOI, il en répond, et accuser la
    # mauvaise pièce envoie corriger au mauvais endroit avec l'autorité d'un constat mesuré.
    BLOCS_PAR_DEFAUT = {"p", "div", "section", "li", "dd", "dt", "h1", "h2", "h3", "h4",
                        "ul", "ol", "dl", "table", "details", "summary", "nav", "header",
                        "footer", "main", "article", "aside", "blockquote", "figure"}

    def _decouper(sel):
        """`.toc > ul a` -> (['.toc', 'ul', 'a'], ['>', ' ']). Combinateurs conservés."""
        parties, comb, tampon, i = [], [], "", 0
        while i < len(sel):
            c = sel[i]
            if c in ">+~":
                if tampon.strip():
                    parties.append(tampon.strip())
                    comb.append(c)
                tampon, i = "", i + 1
            elif c.isspace():
                j = i
                while j < len(sel) and sel[j].isspace():
                    j += 1
                if j < len(sel) and sel[j] in ">+~":
                    i = j
                    continue
                if tampon.strip():
                    parties.append(tampon.strip())
                    comb.append(" ")
                tampon, i = "", j
            else:
                tampon, i = tampon + c, i + 1
        if tampon.strip():
            parties.append(tampon.strip())
        return parties, comb

    def _compound_matche(n, compound):
        mt = re.match(r"^([a-zA-Z][\w-]*)", compound)
        if mt and n.tag != mt.group(1).lower():
            return False
        for cl in re.findall(r"\.([A-Za-z_][\w-]*)", compound):
            if cl not in n.classes():
                return False
        for idv in re.findall(r"#([A-Za-z_][\w-]*)", compound):
            if n.att("id") != idv:
                return False
        return True

    # Un compound n'est évaluable que s'il ne porte QUE tag, classes et id. Une pseudo-classe ou un
    # sélecteur d'attribut dépend d'un état que ce contrôle ne connaît pas.
    def _evaluable(compound):
        return not re.search(r"[\[\]:()*]", compound)

    regles = []          # (parties, combinateurs, sélecteur source, vérifiable)
    for sel, d in css:
        if d.get("display") in ("block", "flex", "grid", "table", "list-item"):
            for morceau in sel.split(","):
                m = morceau.strip()
                if not m:
                    continue
                parties, comb = _decouper(m)
                if not parties:
                    continue
                verifiable = all(_evaluable(p) for p in parties) and all(c in (" ", ">") for c in comb)
                regles.append((parties, comb, m, verifiable))

    def _chaine_matche(n, parties, comb):
        if not _compound_matche(n, parties[-1]):
            return False
        courant = n
        for k in range(len(parties) - 2, -1, -1):
            if comb[k] == ">":
                courant = courant.parent
                if courant is None or not _compound_matche(courant, parties[k]):
                    return False
            else:
                courant = courant.parent
                while courant is not None and not _compound_matche(courant, parties[k]):
                    courant = courant.parent
                if courant is None:
                    return False
        return True

    def _regle_qui_applique(n):
        """La règle VÉRIFIÉE qui met `n` en bloc, sinon la règle PERMISSIVE, sinon None."""
        for parties, comb, source, verifiable in regles:
            if verifiable and _chaine_matche(n, parties, comb):
                return source, True
        for parties, comb, source, verifiable in regles:
            if not verifiable and _compound_matche(n, parties[-1]):
                return source, False
        return None, False

    def est_bloc(n):
        if n.tag in BLOCS_PAR_DEFAUT:
            return True
        return _regle_qui_applique(n)[0] is not None

    # Le sélecteur fautif, pour que le message mette sur la voie (TF-0488). Une règle qui désigne
    # la phrase oblige à deviner ; une règle qui nomme le sélecteur se corrige en une lecture.
    # Depuis TF-0683, elle ne nomme QUE ce qu'elle a vérifié.
    def pourquoi_bloc(n):
        source, verifie = _regle_qui_applique(n)
        if source and verifie:
            return f" (mis en bloc par le sélecteur « {source} »)"
        if source:
            return (f" (sélecteur « {source} » retenu SANS vérification de sa contrainte "
                    "d'ancêtre : il porte une pseudo-classe, un attribut ou un combinateur "
                    "de fratrie)")
        return " (élément de bloc par défaut du langage)"

    orphelines = []
    for parent in [a.racine, *a.racine.descendants()]:
        if parent.tag in ("script", "style"):
            continue
        prec = None
        for e in parent.enfants:
            if isinstance(e, Noeud):
                prec = e
                continue
            t = e.lstrip()
            if t and t[0] in ".,;:!?…" and prec is not None and est_bloc(prec):
                orphelines.append((t[:44], prec.chemin(), pourquoi_bloc(prec)))
            if e.strip():
                prec = None
    for extrait, ou, cause in orphelines[:6]:
        fails.append(f"L1 ponctuation orpheline : une ligne s'ouvre sur « {extrait} » "
                     f"après l'élément de bloc {ou}{cause} — la phrase a été coupée par "
                     "l'insertion d'un élément en son milieu.")

    # --- L11 : aucun littéral de langage dans le texte visible ------------
    # `null` n'est pas un mot français. Quand il apparaît, une valeur non
    # renseignée a traversé le producteur sans être traitée : le lecteur reçoit
    # l'aveu d'un trou, formulé dans un langage qui n'est pas le sien.
    fuites = []
    for txt, porteur in a.textes:
        for m in RE_LITTERAL.finditer(txt):
            # L'exemption « code » vaut pour le porteur ET ses ancetres : un litteral dans
            # <pre><span>…</span></pre> est cite, pas fuite (l exemption ne regardait que le
            # porteur direct — trouve le 15/08 en instruisant TF-0227).
            if _cite(porteur):
                continue
            if any("data-litteral-ok" in n.attrs
                   for n in [porteur, *porteur.ancetres()]):
                continue
            fuites.append((m.group(1), porteur.chemin()))
    vus_f = {}
    for jeton, ou in fuites:
        vus_f.setdefault(jeton, [0, ou])
        vus_f[jeton][0] += 1
    for jeton, (n, ou) in list(vus_f.items())[:6]:
        # RA-3 (13/08) : un littéral porté par body/html nu est le symptôme classique d'un
        # <script> fermé prématurément (son code devient du texte) — dire où chercher évite
        # l'aller-retour de diagnostic constaté sur le livrable Produit-10.
        indice = (" Porteur « body/html » : symptôme classique d'un <script> fermé "
                  "prématurément (séquence </script> non échappée — voir A1-bis)."
                  if ou.replace("html > ", "").startswith("body") else "")
        fails.append(f"L11 littéral de langage dans le texte visible : « {jeton} » "
                     f"× {n} ({ou}) — une valeur non renseignée doit être traitée "
                     f"par le producteur, pas rendue telle quelle.{indice}")

    # --- L2 : largeur de lecture ------------------------------------------
    porteurs = ("body", "main", ".wrap", ".container", ".page", "#page")
    for sel, d in css:
        if not any(p in sel for p in porteurs):
            continue
        # Un plafond px NU est un échec quel que soit sa valeur : il tombe sous 75 %
        # de la fenêtre sur un écran assez grand (règle 75-100 %, décision 13/08).
        v = _px(d.get("max-width"))
        if v is not None:
            fails.append(
                f"L2 largeur de lecture bridée : `{sel} {{ max-width:{int(v)}px }}` — "
                "le conteneur occupe 75-100 % de la fenêtre : utiliser "
                "clamp(75vw,1680px,92vw) et borner la prose en ch.")

    # --- L3 : toute valeur porte sa légende -------------------------------
    def legende_visible(n):
        for e in n.descendants():
            if e.tag == "small" or e.classes() & {"legende", "kpi-d", "val-d"}:
                if len(e.texte_propre()) >= 12:
                    return True
        return False

    def decrit_par(n):
        cible = ids.get((n.att("aria-describedby") or "").split()[0]
                        if n.att("aria-describedby") else "")
        return cible is not None and len(cible.texte_propre()) >= 20

    def couvert_par_descendant(n):
        # TF-0233 (15/08) : un conteneur-valeur dont un DESCENDANT porte la légende est
        # couvert — le lecteur atteint la légende par le chiffre que le conteneur
        # contient ; exiger une seconde légende sur le conteneur forçait la duplication
        # (deux échecs L3 pour un seul chiffre, dont un insatisfiable sans redite).
        # Arbitrage : la légende est atteignable depuis N'IMPORTE QUEL descendant.
        for e in n.descendants():
            if e is n:
                continue
            if (e.att("title") or "").strip() or (e.att("aria-label") or "").strip() \
                    or decrit_par(e):
                return True
        return False

    def bareme_de_colonne(n):
        """RA-4 (retour Produit-10, 13/08) : quand toute une COLONNE partage le même barème
        (86 cellules N/M sur un mapping), le déclarer une fois sur le <th> suffit — l'exiger
        sur chaque cellule alourdit la page sans rien apprendre de plus au lecteur."""
        td = n if n.tag == "td" else next((a for a in n.ancetres() if a.tag == "td"), None)
        if td is None or td.parent is None:
            return False
        rang = [e for e in td.parent.enfants
                if isinstance(e, Noeud) and e.tag in ("td", "th")]
        idx = rang.index(td)
        table = next((a for a in td.ancetres() if a.tag == "table"), None)
        if table is None:
            return False
        for th in (e for e in table.descendants() if e.tag == "th"):
            freres = [x for x in th.parent.enfants
                      if isinstance(x, Noeud) and x.tag in ("th", "td")]
            if freres.index(th) == idx and decrit_par(th):
                return True
        return False

    def bareme_de_groupe(n):
        """TF-0231 (reconstat de TF-0170, lot Produit-10 du 14/08) — ARBITRAGE.

        La question posée : L3 vaut-elle pour tout `N / M` de la page, ou pour les seules
        cellules de tableau ? Elle s'est posée parce que la règle a exigé un barème sur deux
        valeurs d'INDICATEUR (`9 / 85`, `8 / 12`), pas sur des cellules.

        Décision : **la portée ne se réduit pas**. Un KPI est le chiffre le plus lu d'une
        page — souvent le seul — et c'est là qu'une valeur sans échelle trompe le plus. La
        restreindre aux `td` exempterait précisément les valeurs de première lecture. Le
        contournement retenu par le run (un barème dédié) « a d'ailleurs amélioré le
        document » : la règle avait raison sur le fond.

        Ce qui manquait n'était pas de la portée mais de l'ERGONOMIE : une colonne peut
        déclarer son barème une fois sur le `<th>` (RA-4), un groupe d'indicateurs n'avait
        aucun équivalent et devait le répéter sur chacun. Un barème porté par le conteneur du
        groupe vaut donc pour les valeurs qu'il contient — même raisonnement que la colonne,
        même exigence de fond, un seul endroit où l'écrire.
        """
        return any(decrit_par(anc) for anc in n.ancetres())

    vus = set()
    for n in a.racine.descendants():
        cl = n.classes()
        est_score = bool(cl & CL_SCORE) or (
            bool(cl & CL_SCORE_AMBIGUE) and bool(RE_NM.match(n.texte_propre() or ""))) or (
            RE_NM.match(n.texte_propre() or "") and n.tag in ("span", "b", "strong", "td", "em"))
        est_valeur = bool(cl & CL_VALEUR)
        if not (est_score or est_valeur):
            continue
        if id(n) in vus:
            continue
        vus.add(id(n))
        libelle = (n.texte_propre() or n.tag)[:40]
        if est_score:
            # Un barème n'est pas un tooltip : il doit exister DANS la page, donc
            # survivre au PDF, et être atteignable par aria-describedby — porté par la
            # cellule, OU une fois par le th d'une colonne homogène (RA-4), OU une fois
            # par le conteneur d'un groupe d'indicateurs (TF-0231).
            if not decrit_par(n) and not bareme_de_colonne(n) and not bareme_de_groupe(n):
                if n.att("aria-describedby"):
                    fails.append(f'L3 barème introuvable ou trop court pour « {libelle} » '
                                 f'(aria-describedby="{n.att("aria-describedby")}").')
                else:
                    fails.append(f'L3 valeur sans barème lié : « {libelle} » — '
                                 f'aria-describedby vers la légende attendu ({n.chemin()}).')
        else:
            t, al = n.att("title"), n.att("aria-label")
            if (t is not None and not t.strip()) or (al is not None and not al.strip()):
                fails.append(f'L3 légende VIDE sur « {libelle} » — un title="" annonce une '
                             f"explication et n'en donne aucune ({n.chemin()}).")
            # TF-0231 : la légende de groupe vaut pour les valeurs du groupe, comme le
            # barème de groupe ci-dessus. Sans ce parallèle, l'ergonomie annoncée ne
            # marcherait pour AUCUN indicateur — un KPI est toujours une « valeur », et il
            # aurait fallu répéter la même phrase sur chacun.
            elif not (t and t.strip()) and not (al and al.strip()) \
                    and not decrit_par(n) and not legende_visible(n) \
                    and not bareme_de_groupe(n) and not couvert_par_descendant(n):
                fails.append(f'L3 valeur sans légende : « {libelle} » — title, aria-label, '
                             f"aria-describedby ou légende visible attendus ({n.chemin()}).")

    # --- L3 (suite) : une colonne CALCULÉE publie sa formule ---------------
    # Un score classe tout le reste. Sans sa formule, le lecteur doit croire sur
    # parole la seule colonne qui décide de l'ordre. Le barème d'un score calculé,
    # c'est son mode de calcul — pas la description de ses crans.
    for th in [n for n in a.racine.descendants() if n.tag == "th"]:
        libelle = th.texte_propre()
        if not RE_TH_SCORE.match(libelle):
            continue
        if not decrit_par(th):
            fails.append(f'L3 colonne calculée sans formule : « {libelle} » — la colonne '
                         "qui ordonne le tableau doit publier son calcul et y renvoyer "
                         "par aria-describedby.")

    # --- L3 (suite) : valeurs opaques -------------------------------------
    # Une empreinte (`3d0af44aae9a`) et un jeton codé (`ia-assistee-validation-
    # humaine`) sont écrits pour une machine. Affichés nus, ils demandent au
    # lecteur de deviner ce qu'ils désignent.
    opaques = []
    for n in a.racine.descendants():
        if n.tag not in ("dd", "td", "li", "span", "b", "code"):
            continue
        if any(isinstance(e, Noeud) for e in n.enfants):
            continue                       # feuille de texte seulement
        v = n.texte_propre()
        if not v or " " in v:
            continue
        genre = ("empreinte" if RE_EMPREINTE.match(v)
                 else "jeton codé" if RE_JETON.match(v) else None)
        if not genre:
            continue
        if n.tag == "code" or any("data-opaque-ok" in x.attrs
                                  for x in [n, *n.ancetres()]):
            continue
        aide = (n.att("title") or n.att("aria-label") or "").strip()
        if len(aide) >= 12 or decrit_par(n) or legende_visible(n):
            continue
        # Défini SUR PLACE : le jeton est immédiatement suivi de sa définition dans
        # le même élément parent — c'est exactement ce qu'est un bloc de barème.
        # Sans cette sortie, la règle condamnerait la légende qu'elle réclame.
        if n.parent is not None:
            reste = n.parent.texte_propre().replace(v, "", 1).strip(" —–-:·,;")
            if len(reste) >= 20:
                continue
        opaques.append((genre, v, n.chemin()))
    vus_o = {}
    for genre, v, ou in opaques:
        vus_o.setdefault(v, [genre, 0, ou])
        vus_o[v][1] += 1
    for v, (genre, n, ou) in list(vus_o.items())[:6]:
        fails.append(f"L3 {genre} sans légende : « {v} » × {n} ({ou}) — title, "
                     "aria-label ou barème lié attendus : cette valeur est écrite "
                     "pour une machine, pas pour un lecteur. (Déclenché par une classe "
                     "de score — sc, score, jauge, ou « note » suivie d'un chiffre — ou "
                     "par un motif chiffré « n/m » ; un encadré de remarque s'écrit "
                     ".card.note ou .card.encadre.)")

    # --- L4 : liste longue filtrable --------------------------------------
    for t in [n for n in a.racine.descendants() if n.tag == "table"]:
        nb = _lignes_tbody(t)
        if nb < 8:
            continue
        etat = t.att("data-filterable")
        nom = t.att("id") or t.chemin()
        if etat is None:
            fails.append(f"L4 table « {nom} » : {nb} lignes sans data-filterable "
                         "(filtre, tri et recherche obligatoires dès 8 lignes).")
        elif etat == "off" and not (t.att("data-filterable-reason") or "").strip():
            fails.append(f"L4 table « {nom} » exemptée sans data-filterable-reason — "
                         "sans motif, ce n'est pas une exemption.")

    # --- L13 : page à listes = recherche + KPI câblés (standard H, delta n°6 — 14/08) -----
    # Une page qui montre au moins une table de ≥ 8 lignes se PARCOURT : un champ de
    # recherche statique doit exister dans le balisage (les recherches injectées au runtime
    # par un composant ne comptent pas — la page doit l'offrir d'elle-même). Et des KPI
    # (.kpi/.tuile) posés au-dessus d'une telle liste sont des affordances de filtre (H3) :
    # non cliquables, ils sont signalés — la distinction consultation/livrable interactif
    # restant à trancher, c'est un AVERTISSEMENT, pas un FAIL (écart déclaré vs delta n°6).
    tables_longues = [t for t in a.racine.descendants()
                      if t.tag == "table" and _lignes_tbody(t) >= 8
                      and t.att("data-filterable") != "off"]
    if tables_longues:
        a_recherche = any(
            n.tag == "input" and (n.att("type") or "").lower() == "search"
            for n in a.racine.descendants()
        )
        if not a_recherche:
            fails.append(
                f"L13 {len(tables_longues)} table(s) de ≥ 8 lignes sans AUCUN champ de "
                "recherche statique (input[type=search]) dans la page — une liste longue se "
                "cherche (standard H2) ; l'outillage du socle (barre recherche + "
                "réinitialisation + compteur) est le modèle.")
        # TF-0229 (lot Produit-10, 14/08) — le message PROMETTAIT une porte que le code n'ouvrait
        # pas : « un KPI d'éléments hors page LE DIT », alors que seul `data-kpi-filtre` était
        # testé. Aucun moyen déclaratif de « le dire » n'existait. Six indicateurs d'un rapport
        # réel portaient chacun une légende nommant le chapitre où vivent leurs éléments — les
        # six étaient signalés quand même. Une règle dont le message décrit une échappatoire
        # inexistante est pire qu'une règle sans échappatoire : elle apprend au lecteur que les
        # messages du socle ne sont pas fiables.
        #
        # Deux façons de le dire, aucune n'étant un blanc-seing : l'attribut explicite avec son
        # motif, ou la légende du composant KPI du socle (`.kpi-d` / `.kpi-hint`) si elle porte
        # vraiment un texte. Une légende vide ne déclare rien et ne vaut pas exemption.
        def _declare_hors_page(n) -> bool:
            if (n.att("data-kpi-hors-page") or "").strip():
                return True
            return any((d.classes() & {"kpi-d", "kpi-hint"}) and d.texte_propre()
                       for d in n.descendants())

        kpis_morts = [n for n in a.racine.descendants()
                      if (n.classes() & {"kpi", "tuile"}) and n.tag != "button"
                      and n.att("data-kpi-filtre") is None
                      and not _declare_hors_page(n)]
        if kpis_morts:
            warns.append(
                f"L13 {len(kpis_morts)} KPI (.kpi/.tuile) non cliquable(s) au-dessus d'une "
                "liste de ≥ 8 lignes — un KPI qui compte des éléments affichés les filtre "
                "(H3, composant kpi-filter.js) ; un KPI d'éléments hors page le dit, par "
                'data-kpi-hors-page="<motif>" ou une légende .kpi-d/.kpi-hint non vide.')

    # --- L14 : plomberie affichée (TF-0227, lot Produit-10 du 14/08) ----------
    # Le texte est déjà extrait hors `<script>` et `<style>` par le parseur : le coût est
    # d'une expression par motif, comme le retour l'avait estimé.
    def _exempte(porteur):
        for n in [porteur, *porteur.ancetres()]:
            if (n.att("data-motif-ok") or "").strip():
                return True
        return False

    gabarits, marqueurs = [], []
    for txt, porteur in a.textes:
        t = txt.strip()
        if not t or _cite(porteur) or _exempte(porteur):
            continue
        for m in RE_GABARIT.finditer(t):
            gabarits.append((m.group(1), porteur.chemin()))
        for m in RE_MARQUEUR_TRAVAIL.finditer(t):
            marqueurs.append((m.group(1), porteur.chemin()))
    for motif, ou in gabarits[:6]:
        fails.append(
            f"L14 plomberie affichée : « {motif} » rendu en clair dans le texte ({ou}) — "
            "convention de balisage interne qui n'aurait pas dû traverser l'émetteur ; "
            'exemption possible par data-motif-ok="<raison>".')
    if len(gabarits) > 6:
        fails.append(f"L14 plomberie affichée : {len(gabarits) - 6} autre(s) occurrence(s).")
    if marqueurs:
        distincts = sorted({m for m, _ in marqueurs})
        warns.append(
            f"L14 {len(marqueurs)} marqueur(s) de travail dans le texte visible "
            f"({', '.join(distincts)}) — légitime si la page PARLE de tâches, à retirer "
            "sinon ; jamais un échec, une page honnête ne doit pas s'exempter.")

    # --- L18 : un IDENTIFIANT porte son sens (TF-0517, 22/08/2026) ---------
    # Retour DIRECT du client, en cours de session : « je ne sais pas ce qu'est E2 ». Sa consigne
    # tient en une phrase — garder les codes, ils servent la traçabilité, mais les accompagner de
    # leur SENS à chaque emploi.
    #
    # La référence couvrait deux cas VOISINS et laissait celui-ci entre les deux : L3 exige qu'une
    # VALEUR mise en avant porte sa légende (« Maturité 1/5 sans barème n'informe pas »), L14
    # interdit que la PLOMBERIE interne s'affiche. Un identifiant qui appartient légitimement au
    # vocabulaire du livrable — E2, C1, H3, Q-M8, ADR 0009 — n'est ni l'un ni l'autre : c'est un
    # RENVOI MUET, et rien ne le voyait.
    #
    # LE PLUS INSTRUCTIF, et c'est ce qui rend la règle mécanisable sans invention : le rapport HTML
    # du même projet FAISAIT DÉJÀ LA CHOSE CORRECTEMENT — chaque renvoi portait une infobulle
    # « Question ouverte H3 : … » et un lien vers sa définition. La bonne pratique existait dans le
    # produit ; comme elle n'était écrite nulle part, ELLE S'ARRÊTAIT À LA FRONTIÈRE DU HTML et ne
    # passait ni dans les livrables Markdown ni dans la restitution.
    #
    # CE QUI EST JUGÉ : la PREMIÈRE occurrence de chaque jeton dans la page doit RÉSOUDRE — un
    # `title` non vide, un `aria-label`, un `aria-describedby` qui pointe une cible existante, ou un
    # lien interne vers une ancre présente. Les occurrences suivantes ne sont pas exigées : imposer
    # la glose à chaque ligne produirait du bruit, et le client demandait de comprendre, pas de
    # répéter. Les zones CITÉES (`<code>`, `<pre>`, `<blockquote>`) sont hors jugement, comme
    # ailleurs : une citation ne se glose pas sans falsifier sa source.
    ids_page = {n.attrs["id"] for n in a.racine.descendants() if n.attrs.get("id")}
    # Les familles déclarées par la page s'ajoutent au motif : `data-codes="E,C,H"`.
    familles = set()
    for n in [a.racine, *a.racine.descendants()]:
        for lettre in (n.att("data-codes") or "").replace(" ", "").split(","):
            if lettre and len(lettre) <= 2 and lettre.isalpha():
                familles.add(lettre.upper())
    motif = RE_RENVOI if not familles else re.compile(
        RE_RENVOI.pattern[:-3] + "|(?:" + "|".join(sorted(familles)) + r")\d{1,3})\b")
    vus = set()
    muets = []
    # DEUX BORNES, trouvées en jouant la règle sur les fixtures existantes — trois faux positifs
    # d'un coup, tous légitimes :
    #   · le `<head>` n'est PAS de la prose lue. Un `<title>` qui cite un identifiant décrit la
    #     page, il ne renvoie à rien ; exiger une glose dans un titre de document est absurde ;
    #   · un TITRE qui porte un `id` EST la définition du jeton. `<h2 id="q-h5">Question H5 …</h2>`
    #     n'a pas à renvoyer vers lui-même — c'est la cible des autres renvois. Une règle qui
    #     demande à une définition de se gloser tourne en rond.
    lignee = lambda n: [n, *n.ancetres()]
    dans_tete = lambda n: any(x.tag == "head" for x in lignee(n))
    est_definition = lambda n: any(x.tag in ("h1", "h2", "h3", "h4", "h5", "h6", "dt")
                                   and (x.attrs.get("id") or "").strip() for x in lignee(n))
    for txt, porteur in a.textes:
        t = txt.strip()
        # `data-cite` compte AUSSI (TF-0436, même doctrine que L12) : un renvoi dans un texte que
        # le livrable N'A PAS ÉCRIT n'est pas son défaut. Cas réel du 22/08 : la page du registre
        # rend le `contenu` des candidatures — écrit par leurs émetteurs, qui y citent leurs
        # propres codes (`RD-14`). Exiger la glose reviendrait à réécrire un registre append-only.
        if not t or _cite(porteur) or _contenu_cite(porteur) or dans_tete(porteur) or est_definition(porteur):
            continue
        for m in motif.finditer(t):
            jeton = m.group(0)
            if jeton in vus:
                continue
            vus.add(jeton)
            resout = False
            for n in [porteur, *porteur.ancetres()]:
                if (n.att("title") or "").strip() or (n.att("aria-label") or "").strip():
                    resout = True
                    break
                cible = (n.att("aria-describedby") or "").strip()
                if cible and any(c in ids_page for c in cible.split()):
                    resout = True
                    break
                href = (n.att("href") or "").strip()
                if href.startswith("#") and href[1:] in ids_page:
                    resout = True
                    break
                if (n.att("data-code-glose") or "").strip():
                    resout = True
                    break
            if not resout:
                muets.append((jeton, porteur.chemin()))
    for jeton, ou in muets[:6]:
        fails.append(
            f"L18 identifiant muet : « {jeton} » employé sans son sens ({ou}) — première "
            "occurrence dans la page. Un code sert la traçabilité, il ne se lit pas : joindre "
            "un `title` qui le développe, un `aria-describedby` vers sa définition, ou un lien "
            "interne vers son ancre. Retour client du 22/08 : « je ne sais pas ce qu'est E2 ».")
    if len(muets) > 6:
        fails.append(f"L18 identifiant muet : {len(muets) - 6} autre(s) jeton(s) sans glose.")

    # --- L19 : la coupure de mot au rendu (TF-0492, 22/08/2026) ------------
    # Trois occurrences signalées par le client sur deux versions successives : « Utilisabl/e »,
    # « Plateform/e », « 231 occurrenc/es ». Cause : `overflow-wrap: anywhere`, nécessaire sur les
    # identifiants techniques et les chemins, RAVAGEUR sur du texte courant en colonne étroite.
    #
    # Aucun oracle ne le voyait : le texte n'est ni tronqué (L1), ni en débordement (V1), ni en
    # contraste insuffisant (V2) — il est simplement ILLISIBLE, et c'est la première chose que voit
    # un lecteur. Le contrôle du RENDU (deux fragments sur deux lignes sans césure) demande un
    # navigateur et vit dans `render_page.py` ; ici, le complément STATIQUE, qui suffit à empêcher
    # la cause : `anywhere` posé sur un sélecteur de PROSE.
    #
    # Ce qui reste légitime, et n'est donc pas jugé : `anywhere` sur `code`, `pre`, `kbd`, `samp`,
    # `a[href]`, ou toute classe dont le nom dit l'usage technique (`.chemin`, `.jeton`, `.id`,
    # `.code`, `.uri`, `.url`, `.sha`, `.hash`, `.mono`). L'exemption explicite reste
    # `data-coupure-ok="<raison>"` côté élément, sur le modèle de L14.
    PROSE = {"p", "li", "td", "th", "dd", "dt", "body", "div", "span", "section", "article",
             "main", "blockquote", "figcaption", "caption", "h1", "h2", "h3", "h4", "h5", "h6"}
    TECHNIQUE = re.compile(r"(code|pre|kbd|samp|chemin|jeton|\bid\b|uri|url|sha|hash|mono|"
                           r"path|token|ident|slug|a\[href\]|tabular)", re.I)
    coupeurs = []
    # LE REPLI EN CARTES EST PRESCRIT PAR LE SOCLE, ET L19 LE CONDAMNAIT (TF-0554, 24/08).
    # `composants.md` §6 impose un « palier intermediaire OBLIGATOIRE entre le seuil de repli et la
    # largeur ou le tableau tient a l'aise : overflow-wrap: anywhere sur les cellules ». L19 traitait
    # `td` comme de la prose et rendait FAIL bloquant — l'un obligeait ce que l'autre interdisait.
    # Mesure : huit livrables PASS le 19/08, douze FAIL le 24/08, sans qu'un octet ait bouge.
    #
    # DEUX CONDITIONS CUMULATIVES pour l'exemption, parce qu'une seule ouvrirait une porte trop
    # large : le selecteur vit sous une MEDIA QUERY (donc il ne s'applique pas au rendu courant de
    # la prose), ET ses declarations portent la SIGNATURE du repli en cartes (`display: block` sur
    # une cellule, ou une cellule sous un conteneur de tableau). Un `anywhere` pose sur un `p` sous
    # media query reste donc jugé, et c'est voulu.
    SIGNATURE_CARTES = re.compile(r"(table|cellule|card|carte|repli)", re.I)
    for sel, d, contexte in regles_css(a.styles, avec_contexte=True):
        valeurs = " ".join([(d.get("overflow-wrap") or ""), (d.get("word-break") or ""),
                            (d.get("word-wrap") or "")]).lower()
        if "anywhere" not in valeurs and "break-all" not in valeurs:
            continue
        sous_media = "@media" in (contexte or "")
        cellule = re.search(r"\b(td|th)\b", sel) is not None
        if sous_media and cellule and ((d.get("display") == "block") or SIGNATURE_CARTES.search(sel)):
            continue
        for morceau in sel.split(","):
            m = morceau.strip()
            if not m or TECHNIQUE.search(m):
                continue
            sujet = re.split(r"[\s>+~]+", m)[-1]
            nom = (re.match(r"^([a-z][a-z0-9]*)", sujet) or [None, None])[1]
            classes = re.findall(r"\.([A-Za-z_][\w-]*)", sujet)
            # Un sélecteur de prose : un nom d'élément de prose SANS classe qui le restreigne,
            # ou une classe dont le nom ne dit aucun usage technique.
            if (nom in PROSE and not classes) or (classes and not nom):
                coupeurs.append((m, valeurs.strip()))
    for sel, val in coupeurs[:6]:
        fails.append(
            f"L19 coupure de mot en prose : « {sel} » porte « {val} » — nécessaire sur un "
            "identifiant technique, ravageur sur du texte courant : un mot se casse en deux au "
            "milieu d'une ligne (« Utilisabl/e », « 231 occurrenc/es »), sans césure ni trait "
            "d'union. Réserver `anywhere` à `code`, `pre`, `a[href]` et aux cellules "
            'd\'identifiants ; exemption possible par data-coupure-ok="<raison>".')
    if len(coupeurs) > 6:
        fails.append(f"L19 coupure de mot en prose : {len(coupeurs) - 6} autre(s) sélecteur(s).")

    # --- L20 : un bloc préformaté LOURD offre une alternative de lecture (TF-0495) ----------
    #
    # LE FAIT. Le client a demandé que les documents sources soient inclus dans le livrable
    # autoportant. Ils l'ont été — en blocs de texte brut, dont un de 67 Ko contenant une
    # trentaine de tableaux Markdown. TOUS LES ORACLES PASSAIENT : le contenu est là, la page est
    # conforme, rien ne déborde. Il a fallu que le client écrive « il faut pouvoir formater les
    # MDs, sinon c'est illisible », PUIS le redemande une seconde fois, pour qu'un lecteur à deux
    # vues soit produit.
    #
    # C'est la frontière entre « le contenu est PRÉSENT » et « le contenu est EXPLOITABLE », et
    # aucune règle ne la tenait. Le principe existait pourtant à côté : L10 impose un mode d'emploi
    # aux chapitres de données. Il ne couvrait pas le contenu EMBARQUÉ.
    #
    # CE QUI EST EXIGÉ : au-delà du seuil, un `<pre>` offre une alternative de lecture — une vue
    # mise en forme, un sommaire, ou un repli par sections — OU déclare pourquoi le texte brut fait
    # foi (`data-brut-fait-foi="<raison>"`). Même logique que `data-filterable="off"` avec motif :
    # CE QUI EST DÉLIBÉRÉ SE DÉCLARE, CE QUI EST SUBI SE CORRIGE.
    #
    # L'alternative est reconnue par ce qui la CÂBLE, jamais par une intention : un bouton ou une
    # case qui bascule la vue (`aria-controls` vers le bloc ou son conteneur), ou un sommaire de
    # liens internes dans le même conteneur. Une phrase promettant une vue ne compte pas.
    SEUIL_PRE_OCTETS = 4096
    SEUIL_PRE_LIGNES = 80
    lourds = []
    for n in a.racine.descendants():
        if n.tag != "pre":
            continue
        texte_pre = " ".join(t for t, porteur in a.textes if porteur is n or n in porteur.ancetres())
        lignes_pre = texte_pre.count(chr(10)) + 1
        octets = len(texte_pre.encode("utf-8"))
        if octets < SEUIL_PRE_OCTETS and lignes_pre < SEUIL_PRE_LIGNES:
            continue
        lignee = [n, *n.ancetres()]
        if any((x.att("data-brut-fait-foi") or "").strip() for x in lignee):
            continue
        # Une bascule câblée, ou un sommaire de liens internes : on cherche dans les ANCÊTRES,
        # parce que la commande vit à côté du bloc, pas dedans.
        cible_ids = {x.attrs.get("id") for x in lignee if x.attrs.get("id")}
        alternative = False
        for m in a.racine.descendants():
            controle = (m.att("aria-controls") or "").strip()
            if controle and cible_ids & set(controle.split()):
                alternative = True
                break
        if not alternative:
            for x in lignee:
                liens = [d for d in x.descendants()
                         if d.tag == "a" and (d.att("href") or "").startswith("#")]
                if len(liens) >= 3:
                    alternative = True
                    break
        if not alternative:
            lourds.append((n.chemin(), octets, lignes_pre))
    for ou, octets, nl_ in lourds[:6]:
        fails.append(
            f"L20 bloc préformaté sans alternative de lecture : {ou} porte "
            f"{octets // 1024} Ko / {nl_} ligne(s) de texte brut — au-delà de "
            f"{SEUIL_PRE_OCTETS // 1024} Ko ou {SEUIL_PRE_LIGNES} lignes, « le contenu est là » ne "
            "veut pas dire « le contenu est lisible ». Offrir une vue mise en forme, un sommaire ou "
            'un repli par sections (bascule câblée par aria-controls), ou déclarer '
            'data-brut-fait-foi="<raison>" si le texte brut fait foi.')
    if len(lourds) > 6:
        fails.append(f"L20 bloc préformaté sans alternative : {len(lourds) - 6} autre(s) occurrence(s).")

    # --- L21 : un composant DÉCLARÉ sans style est invisible aux DEUX oracles (TF-0521) ------
    #
    # LE FAIT, mesuré le 23/08. Deux squelettes de la bibliothèque portaient `<nav class="toc">` et
    # des entrées correctement annotées : L6 était satisfaite AU SENS MÉCANIQUE, `check_html` rendait
    # PASS, et le rendu aussi puisqu'il n'y avait ni chevauchement ni troncature. Mais AUCUNE règle
    # CSS ne visait `.toc` : le sommaire se rendait en liste numérotée nue, ce qu'aucun livrable du
    # parc ne fait. Le défaut n'a été vu qu'en comparant à un livrable RÉEL du même produit.
    #
    # C'est une CLASSE ENTIÈRE de défauts que ni l'un ni l'autre oracle ne peut voir : un oracle de
    # MARQUAGE trouve la classe et s'arrête là ; un oracle de RENDU ne voit rien tant que rien ne
    # déborde. Entre les deux, un composant peut être annoncé et n'exister pas.
    #
    # La liste est FERMÉE et connue — ce sont les composants de la charte, ceux dont l'absence de
    # style se voit. Un nom de classe hors liste n'est pas jugé : inventer des composants pour avoir
    # quelque chose à exiger serait pire que ne rien exiger.
    COMPOSANTS_CHARTE = ("toc", "toc-t", "toc-d", "ch-apprend", "table-hote", "repli-cartes",
                         "diagram-wrap")
    # Les sélecteurs présents dans la feuille, tous compounds confondus : c'est la présence d'une
    # règle qui compte, pas où elle vise.
    styles = set()
    for sel, _d in css:
        for cl in re.findall(r"\.([A-Za-z_][\w-]*)", sel):
            styles.add(cl)
    declarees = set()
    for n in a.racine.descendants():
        for c in n.classes():
            if c in COMPOSANTS_CHARTE:
                declarees.add(c)
    orphelins = sorted(declarees - styles)
    for cl in orphelins[:6]:
        fails.append(
            f"L21 composant déclaré sans style : la classe « {cl} » est employée dans le marquage et "
            "AUCUNE règle CSS ne la vise — le composant est annoncé et n'existe pas. Un oracle de "
            "marquage le trouve et s'arrête là ; un oracle de rendu ne voit rien tant que rien ne "
            "déborde. Ajouter le bloc de style du composant, ou retirer la classe.")
    if len(orphelins) > 6:
        fails.append(f"L21 composant déclaré sans style : {len(orphelins) - 6} autre(s) classe(s).")

    # --- L23 : l'attribut `hidden` reste SOUVERAIN face au CSS (TF-0733, 31/08) --------------
    #
    # LE FAIT, mesuré chez un produit avec SEIZE oracles au vert. Un panneau modal masqué par
    # `hidden` était stylé par un `display: flex` explicite : la règle CSS l'emporte sur le
    # `display: none` que l'attribut tient de la feuille de l'agent utilisateur, et un rectangle
    # TRANSPARENT couvrait l'écran entier en interceptant chaque clic — bouton de connexion
    # compris. Invisible en capture (transparent), invisible à la lecture (syntaxiquement
    # correct), trouvé par `document.elementFromPoint` sur le centre du bouton.
    #
    # CE QUE LA RÈGLE JUGE, et sa borne : une page qui EMPLOIE l'attribut `hidden` doit porter
    # la garde `[hidden] { display: none !important }` (boilerplate du socle depuis le 01/09).
    # Une page sans `hidden` n'a rien à garder — l'exiger partout ferait crier sur tout
    # l'existant pour un mécanisme qu'il n'emploie pas. NON JUGÉ, et c'est déclaré : le
    # recouvrement ACCIDENTEL (deux éléments visibles superposés) ne se voit qu'au rendu —
    # c'est la moitié exécutable de TF-0733 (elementFromPoint), qui appartient à render_page.
    porteurs_hidden = [n for n in a.racine.descendants() if "hidden" in n.attrs]
    if porteurs_hidden:
        garde_ok = False
        for sel, d in css:
            valeur = (d.get("display") or "") if isinstance(d, dict) else str(d)
            if "[hidden]" in sel and "none" in valeur and "!important" in valeur:
                garde_ok = True
                break
        if not garde_ok:
            premier = porteurs_hidden[0]
            fails.append(
                f"L23 attribut `hidden` sans garde : {len(porteurs_hidden)} élément(s) masqué(s) par "
                "l'attribut et AUCUNE règle `[hidden] { display: none !important; }` dans la feuille — "
                "tout `display` explicite posé par une classe l'emportera sur le masquage, et le "
                "composant deviendra un voile transparent qui intercepte les clics (mesuré : page "
                "entière inutilisable, seize oracles au vert). Ajouter la garde du boilerplate (TF-0733).")

    # --- L22 : une PROMESSE écrite en commentaire est vérifiée (23/08/2026, choix humain) ----
    #
    # LE FAIT, et il a coûté deux fois. Dans les schémas de la bibliothèque, un commentaire
    # annonçait mot pour mot « un <title> par forme, aucun script ». Aucune forme ne le portait :
    # l'infobulle promise n'existait pas, ET les nœuds non identifiés produisaient QUATRE
    # chevauchements bloquants au contrôle de rendu. Le commentaire a survécu des jours parce que
    # rien ne lit un commentaire — un oracle de marquage lit le marquage, un oracle de rendu lit des
    # pixels, et entre les deux une promesse de prose vaut preuve.
    #
    # CE QUI EST JUGÉ : un commentaire qui NOMME une balise alors que le bloc qui le contient n'en
    # porte aucune. Le bloc est l'élément englobant le plus proche parmi ceux qui font sens
    # (schéma, figure, section, table, détails…), à défaut le document entier.
    #
    # TROIS GARDES, sans quoi la règle serait une nuisance :
    #   · la NÉGATION est respectée — « aucun script », « ne pas mettre de <title> ici », « sans
    #     <caption> » documentent un choix, ils ne promettent rien ;
    #   · l'échappatoire déclarative `promesse-ok`, pour un commentaire qui parle d'ailleurs — une
    #     convention générale, un exemple d'anti-patron ;
    #   · la lecture se fait sur le HTML BRUT. Le premier jet bouclait sur une liste de
    #     commentaires que l'analyseur n'expose pas : la règle aurait été MORTE EN CROYANT VIVRE,
    #     et c'est la classe de défaut que cette journée a payée trois fois.
    #
    # UNE PROMESSE QUANTIFIÉE SE COMPTE (« un <title> par forme ») : c'est la seule forme qui
    # attrape le défaut fondateur, puisque le schéma portait bien UN titre. Le vocabulaire du
    # quantificateur est fermé — forme, groupe, nœud, ligne, colonne, section, figure — et une
    # promesse formulée autrement retombe sur la simple présence. Cette limite est assumée : mieux
    # vaut un contrôle étroit et juste qu'un contrôle large qui devine.
    PROMETTABLES = ("title", "figcaption", "caption", "summary", "legend", "label")
    NEGATIONS = ("aucun", "aucune", "pas de", "ne pas", "jamais", "sans ", "retirer", "supprim",
                 "au lieu de", "plutot que", "plutôt que", "interdit", "non ", "eviter", "éviter")
    ENGLOBANTS = ("svg", "figure", "section", "details", "table", "article", "aside", "nav")

    def _etendue_du_bloc(texte: str, position: int) -> tuple[str, str]:
        """(nom du bloc, son texte) pour le bloc englobant le plus proche de `position`."""
        meilleur = ("document", texte)
        for tag in ENGLOBANTS:
            # La dernière ouverture avant la position, dont la fermeture vient après : c'est
            # l'englobant. Un compteur de profondeur évite de prendre la fermeture d'un frère
            # imbriqué du même nom.
            for m in re.finditer(r"<" + tag + r"[\s>]", texte[:position], re.I):
                depart = m.start()
                prof, i = 0, depart
                fin_bloc = None
                for mm in re.finditer(r"<\s*(/?)" + tag + r"[\s>]", texte[depart:], re.I):
                    prof += -1 if mm.group(1) else 1
                    if prof == 0:
                        fin_bloc = depart + mm.end()
                        break
                if fin_bloc is None or fin_bloc <= position:
                    continue
                # Le bloc le plus PROCHE, donc celui qui commence le plus tard.
                if meilleur[0] == "document" or depart > texte.find(meilleur[1]):
                    meilleur = (tag, texte[depart:fin_bloc])
        return meilleur

    for mc in re.finditer(r"<!--(.*?)-->", html, re.S):
        commentaire = mc.group(1)
        if "promesse-ok" in commentaire:
            continue
        bas = commentaire.lower()
        for tag in PROMETTABLES:
            trouve = None
            for m in re.finditer(r"<\s*" + tag + r"\b", bas):
                avant = bas[max(0, m.start() - 60):m.start()]
                if any(neg in avant for neg in NEGATIONS):
                    continue
                trouve = m
                break
            if trouve is None:
                continue
            nom_bloc, texte_bloc = _etendue_du_bloc(html, mc.start())
            net_bloc = _sans_commentaires(texte_bloc)
            poses = len(re.findall(r"<\s*" + tag + r"\b", net_bloc, re.I))
            # UNE PROMESSE QUANTIFIÉE SE COMPTE. Le commentaire fondateur disait « un <title> par
            # forme » : le schéma portait UN titre — celui du diagramme entier — et aucun sur ses
            # groupes. Une règle de simple présence passait donc, en donnant l'impression de
            # couvrir son cas fondateur. Le vocabulaire du quantificateur est fermé et court :
            # ce qui n'y figure pas retombe sur la présence, et la limite est déclarée.
            # LE PORTEUR D'UN SCHÉMA EST LE GROUPE, comme la doctrine du socle le dit depuis
            # TF-0424 : un `<g>` titré est UN nœud, et les primitives qu'il contient n'en sont pas.
            # Compter les primitives accusait les gabarits (6 formes pour 3 titres, alors que chaque
            # nœud portait le sien) ; compter des TOTAUX laissait passer un groupe sans titre dès
            # que le diagramme entier en avait un. On vérifie donc CHAQUE porteur, ce qui est ce que
            # la promesse dit.
            PORTEURS = {"forme": "g", "groupe": "g", "noeud": "g", "nœud": "g",
                        "ligne": "tr", "colonne": "th", "section": "section", "figure": "figure"}
            quant = re.search(r"\bpar\s+(" + "|".join(PORTEURS) + r")s?\b", bas)
            if quant:
                nom_porteur = PORTEURS[quant.group(1)]
                # L'étendue de chaque porteur, par compteur de profondeur : un groupe imbriqué ne
                # doit pas voler le titre de son parent.
                sans = 0
                total = 0
                for mp in re.finditer(r"<" + nom_porteur + r"[\s>]", net_bloc, re.I):
                    depart = mp.start()
                    prof, fin_p = 0, None
                    for mm in re.finditer(r"<\s*(/?)" + nom_porteur + r"[\s>]", net_bloc[depart:], re.I):
                        prof += -1 if mm.group(1) else 1
                        if prof == 0:
                            fin_p = depart + mm.end()
                            break
                    etendue = net_bloc[depart:fin_p] if fin_p else net_bloc[depart:]
                    total += 1
                    if not re.search(r"<\s*" + tag + r"\b", etendue, re.I):
                        sans += 1
                if not total:
                    continue                     # rien à porter : la promesse est sans objet ici
                if not sans:
                    continue                     # chaque porteur porte l'élément promis
                fails.append(
                    f"L22 promesse en commentaire non tenue : un commentaire annonce « <{tag}> par "
                    f"{quant.group(1)} » et {sans} {quant.group(1)}(s) sur {total} n'en portent "
                    f"aucun, dans le bloc « {nom_bloc} ». C'est le défaut fondateur de cette règle : "
                    "un schéma portait UN titre — celui du diagramme entier — et aucun sur ses "
                    "nœuds, ce qui a coûté l'infobulle promise ET quatre chevauchements bloquants. "
                    "Poser l'élément sur chaque porteur, écrire la négation si le choix est de ne "
                    "pas le faire, ou déclarer par « promesse-ok ».")
                break
            if poses:
                continue
            fails.append(
                f"L22 promesse en commentaire non tenue : un commentaire annonce « <{tag}> » et le "
                f"bloc « {nom_bloc} » qui le contient n'en porte AUCUN. Une promesse de prose vaut "
                "preuve tant que rien ne la lit : c'est ce qui a laissé un schéma sans ses "
                "infobulles, et quatre chevauchements bloquants avec. Poser l'élément, écrire la "
                "négation si le choix est de ne pas le mettre, ou déclarer par « promesse-ok ».")
            break

    # --- L5 : surlignage inline -------------------------------------------
    # Le piege n'est pas seulement une regle `mark { … }` fautive : c'est la
    # COLLISION DE NOM. Un conteneur de recherche `.find` et un surlignage
    # `<mark class="find">` partagent la classe ; `display:flex` destine au
    # conteneur transforme le surlignage en boite de bloc et coupe le mot en deux.
    # Constate en production : « clics » rendu « clic » puis « s » a la ligne.
    cl_marks = set()
    for n in a.racine.descendants():
        if n.tag == "mark":
            cl_marks |= n.classes()
    for sel, d in css:
        vise_mark = bool(re.search(r"\bmark\b", sel)) or any(
            re.search(r"(^|[\s,>+~])\." + re.escape(c) + r"(?![\w-])", sel)
            for c in cl_marks
        )
        if not vise_mark:
            continue
        for prop in ("padding", "margin"):
            for v in _horizontaux(d.get(prop)):
                if _non_nul(v):
                    fails.append(f"L5 surlignage : `{sel} {{ {prop}:{d.get(prop)} }}` — "
                                 "un espacement horizontal détache la partie surlignée "
                                 "du reste du mot.")
            for cote in ("left", "right"):
                if _non_nul(d.get(f"{prop}-{cote}")):
                    fails.append(f"L5 surlignage : `{sel} {{ {prop}-{cote} }}` non nul.")
        disp = d.get("display")
        if disp and disp not in ("inline", "contents"):
            fails.append(f"L5 surlignage : `{sel} {{ display:{disp} }}` — le surlignage "
                         "doit rester inline pour ne pas casser le flux du mot.")

    # --- L6 : sommaire ----------------------------------------------------
    if toc is None:
        warns.append("L6 aucun sommaire détecté (nav.toc ou aria-label=\"Sommaire\").")
    else:
        liens = [n for n in toc.descendants() if n.tag == "a"]
        if not liens:
            fails.append("L6 sommaire sans aucune entrée.")
        for lien in liens:
            href = (lien.att("href") or "").strip()
            if not href.startswith("#") or len(href) < 2:
                fails.append(f"L6 entrée de sommaire sans ancre exploitable : "
                             f"« {lien.texte_propre()[:40]} » (href={href!r}).")
                continue
            if href[1:] not in ids:
                fails.append(f"L6 ancre morte : {href} ne résout vers aucun id "
                             f"(entrée « {lien.texte_propre()[:40]} »).")
            annonce = [e for e in lien.descendants() if "toc-d" in e.classes()]
            if not annonce or max(len(e.texte_propre()) for e in annonce) < 12:
                fails.append(f"L6 entrée sans annonce : « {lien.texte_propre()[:40]} » — "
                             "un élément .toc-d d'au moins 12 caractères est attendu.")

    # --- L7 / L10 : chapitres --------------------------------------------
    cibles = []
    if toc is not None:
        for lien in [n for n in toc.descendants() if n.tag == "a"]:
            href = (lien.att("href") or "")
            if href.startswith("#") and href[1:] in ids:
                cibles.append((href[1:], ids[href[1:]]))

    # TF-0423 (lot Client-B 20260820a) : L7 et L10 se satisfaisaient d'une conformité MÉCANIQUE —
    # 12 chapeaux identiques au mot près posés par un script d'optimisation d'oracle, un
    # « Mode d'emploi » en double. Un chapeau est une phrase ÉCRITE, jamais générée : identique
    # dans deux chapitres, tiré du lexique de remplissage, ou plus long qu'un paragraphe, il
    # échoue. Un exemple de lecture répété mot pour mot dans un même chapitre aussi.
    chapeaux_vus: dict = {}
    for ident, sec in cibles:
        chapeaux = [e for e in sec.descendants()
                    if e.classes() & {"ch-apprend", "ch-st"}]
        if not chapeaux or max(len(e.texte_propre()) for e in chapeaux) < 40:
            fails.append(f"L7 chapitre #{ident} sans chapeau d'ouverture — un élément "
                         ".ch-apprend d'au moins 40 caractères (« ce que ce chapitre "
                         "vous apprend ») est attendu.")
        for e in chapeaux:
            txt = " ".join(e.texte_propre().split())
            cle = txt.lower().rstrip(" .…")
            if len(cle) < 40:
                continue
            if cle in chapeaux_vus and chapeaux_vus[cle] != ident:
                fails.append(f"L7 chapeau IDENTIQUE dans #{chapeaux_vus[cle]} et #{ident} : "
                             f"« {txt[:60]}… » — un chapeau dit ce que CE chapitre apprend ; "
                             "répété, il n'apprend rien (remplissage généré).")
            chapeaux_vus.setdefault(cle, ident)
            if RE_CHAPEAU_REMPLISSAGE.search(cle):
                fails.append(f"L7 chapeau de remplissage dans #{ident} : « {txt[:60]}… » — "
                             "« ce chapitre présente/apporte les éléments annoncés par son "
                             "titre » paraphrase le titre ; écrire ce que le lecteur apprend.")
            if len(txt.split()) > SEUIL_MOTS_CHAPEAU:
                fails.append(f"L7 chapeau de {len(txt.split())} mots dans #{ident} — au-delà de "
                             f"{SEUIL_MOTS_CHAPEAU}, c'est un paragraphe reclassé en chapeau, "
                             "pas une phrase d'ouverture.")
        grosses = [t for t in sec.descendants()
                   if t.tag == "table" and _lignes_tbody(t) >= 8]
        if grosses:
            ex = [e for e in sec.descendants()
                  if "exemple-lecture" in e.classes() or "data-exemple-lecture" in e.attrs]
            if not ex or max(len(e.texte_propre()) for e in ex) < 30:
                fails.append(f"L10 chapitre de données #{ident} sans exemple de lecture — "
                             "un élément .exemple-lecture d'au moins 30 caractères est "
                             "attendu pour une table de ≥ 8 lignes.")
            textes_ex = [" ".join(e.texte_propre().split()).lower() for e in ex]
            doublons = {t for t in textes_ex if textes_ex.count(t) > 1}
            for t in sorted(doublons):
                fails.append(f"L10 exemple de lecture en DOUBLE dans #{ident} : « {t[:60]}… » — "
                             "le second est du remplissage ; un exemple par tableau, "
                             "chacun disant ce qu'il faut voir dans LE sien.")

    # --- L8 : liens internes ---------------------------------------------
    dans_toc = set(id(n) for n in toc.descendants()) if toc is not None else set()
    # TF-0174 (13/08) : un lien de ROUTAGE SPA (data-nav) navigue par hash via JS — il n'a
    # pas d'ancre statique et n'en aura jamais. Il est exempt de L8 si ET SEULEMENT SI un
    # script de la page référence data-nav (routage câblé) ; des data-nav sans script sont
    # des liens morts, jugés comme les autres (fixture double sens l8-spa-*).
    routage_cable = any(
        "data-nav" in "".join(t for t in n.enfants if isinstance(t, str))
        for n in a.racine.descendants() if n.tag == "script"
    )
    for lien in [n for n in a.racine.descendants() if n.tag == "a"]:
        href = (lien.att("href") or "").strip()
        if not href.startswith("#"):
            continue
        if id(lien) in dans_toc:
            continue
        if lien.att("data-nav") is not None and routage_cable:
            continue
        if href == "#":
            fails.append(f"L8 ancre vide href=\"#\" : « {lien.texte_propre()[:40]} » "
                         "ne mène nulle part.")
            continue
        libelle = lien.texte_propre()
        aide = (lien.att("title") or lien.att("aria-label") or "").strip()
        if len(libelle) < 8 and len(aide) < 12:
            # TF-0434 (lot Client-B 20260820b) : un libellé qui est un IDENTIFIANT du document
            # (H5, E2, 1.5, ADR 0022) n'est pas muet pour son lecteur — il est elliptique pour
            # un lecteur d'écran. La sortie la plus simple se dit en premier : un title court.
            if RE_IDENTIFIANT.match(libelle.strip()):
                fails.append(f"L8 lien interne elliptique : « {libelle} » → {href} — le libellé "
                             "est un identifiant du document, il peut rester court : ajoutez "
                             "un title (ou aria-label) d'au moins 12 caractères décrivant la "
                             "cible, ex. title=\"Question H5 — délais de livraison\".")
            else:
                fails.append(f"L8 lien interne muet : « {libelle or '(sans texte)'} » → {href} — "
                             "ajoutez un title décrivant la cible (au moins 12 caractères) : "
                             "le libellé visible peut rester court ; sinon, un libellé d'au "
                             "moins 8 caractères nommant la cible.")
        elif href[1:] not in ids:
            fails.append(f"L8 lien interne vers une ancre inexistante : {href} "
                         f"(« {libelle[:40]} »).")

    # --- L9 : détails dépliables -----------------------------------------
    for det in [n for n in a.racine.descendants() if n.tag == "details"]:
        sums = [e for e in det.enfants if isinstance(e, Noeud) and e.tag == "summary"]
        corps = "".join(
            e if isinstance(e, str) else ("" if e.tag == "summary" else e.texte())
            for e in det.enfants
        ).strip()
        if not corps:
            fails.append("L9 détail vide : un <details> sans contenu déplié promet une "
                         f"explication absente ({det.chemin()}).")
        for s in sums:
            libelle = s.texte_propre()
            if len(libelle) < 3:
                fails.append(f"L9 <summary> illisible : « {libelle} » "
                             f"({det.chemin()}).")
                continue
            # Un dépliant annonce ce qu'il ouvre ET à quoi ça sert. « Détails »,
            # « plus d'infos », « voir plus » ne disent ni l'un ni l'autre : le
            # lecteur n'ouvre pas, ou ouvre et juge inutile ce qu'il trouve.
            mots = [m for m in re.findall(r"[\w’'À-ɏ]+", libelle.lower())
                    if m not in STOP_FR and len(m) > 1]
            if mots and len(mots) <= 3 and all(m in MOTS_CREUX for m in mots):
                fails.append(f"L9 dépliant qui n'annonce rien : « {libelle} » — un "
                             "<summary> dit ce qu'il ouvre et à quoi ça sert "
                             f"({det.chemin()}).")
        # Un dépliant coûte un clic et une décision. Sous ~200 caractères cachés,
        # le contenu tient à l'écran : le replier fabrique un obstacle et donne au
        # lecteur l'impression d'avoir été trompé quand il l'ouvre.
        util = re.sub(r"\s+", " ", corps).strip()
        if 0 < len(util) < SEUIL_DEPLIANT and "data-repli-ok" not in det.attrs:
            fails.append(f"L9 dépliant qui cache trop peu : {len(util)} caractères "
                         f"derrière « {sums[0].texte_propre()[:40] if sums else '?'} » "
                         f"— sous {SEUIL_DEPLIANT}, afficher en place ({det.chemin()}).")

    # --- L12 : une énumération de données n'est pas une phrase ------------
    enums = []
    for txt, porteur in a.textes:
        t = " ".join(txt.split())
        if t.count(";") < 2 or len(t) < 60:
            continue
        if porteur.tag in ("code", "pre", "script", "style"):
            continue
        if _contenu_cite(porteur):     # zone déclarée citée (data-cite) — texte non écrit par la page
            continue
        segments = [s.strip() for s in t.split(";") if s.strip()]
        couples = [s for s in segments if RE_SEGMENT.match(s)]
        if len(couples) >= 3:
            enums.append((len(couples), t[:60], porteur.chemin()))
    for n, extrait, ou in enums[:6]:
        fails.append(f"L12 énumération de données en prose : {n} segments "
                     f"« clé — valeur » enchaînés par des points-virgules "
                     f"(« {extrait}… », {ou}) — au-delà de 3, c'est un tableau ou "
                     "une liste, avec une ligne qui dit ce qu'il faut y voir.")

    # --- L15 : glyphes en content: CSS hors liste blanche (AVERTISSEMENT) ---
    # TF-0435 (lot Client-B 20260820b) : un chevron écrit content: "\25B6" passait tous les
    # oracles et s'affichait en tofu sur mobile — la pile de repli mono n'a pas ce caractère.
    # Contrôle statique bon marché : tout caractère hors Latin-1 et hors liste blanche de
    # glyphes réputés présents est SIGNALÉ, jamais un échec : « vérifiez ce glyphe sur un
    # poste sans vos polices ». Corrigé dans le socle par la même occasion (chevrons U+203A).
    vus_glyphes = set()
    for m in RE_CONTENT_CSS.finditer(_sans_commentaires(html)):
        brut = m.group(2)
        texte_css = re.sub(r"\\([0-9a-fA-F]{1,6})\s?", lambda x: chr(int(x.group(1), 16)), brut)
        for ch in texte_css:
            o = ord(ch)
            if o < 0x0100 or ch in GLYPHES_SURS or ch in vus_glyphes:
                continue
            vus_glyphes.add(ch)
            warns.append(f"L15 glyphe « {ch} » (U+{o:04X}) en content: CSS hors liste blanche — "
                         "vérifiez son rendu sur un poste sans vos polices (pile de repli) ; "
                         "préférez › ‹ • – → ou une icône SVG dessinée.")

    # --- L16 : onglets accessibles (composant tabs.js) ------------------------
    # TF-0425 (lot Client-B 20260820a) : tout role=tab vise un tabpanel résolu, tout tabpanel
    # est étiqueté par son onglet, et les panneaux masqués sont réaffichés à l'impression.
    tabs = [n for n in a.racine.descendants() if n.att("role") == "tab"]
    panels = [n for n in a.racine.descendants() if n.att("role") == "tabpanel"]
    for t in tabs:
        ac = (t.att("aria-controls") or "").strip()
        if not ac or ac not in ids or ids[ac].att("role") != "tabpanel":
            fails.append(f"L16 onglet « {t.texte_propre()[:30]} » sans panneau résolu — "
                         "aria-controls doit viser un élément role=\"tabpanel\" existant "
                         f"({t.chemin()}).")
    for p in panels:
        lb = (p.att("aria-labelledby") or "").strip()
        if not lb or lb not in ids or ids[lb].att("role") != "tab":
            fails.append(f"L16 panneau #{p.att('id') or '?'} sans onglet étiqueteur — "
                         "aria-labelledby doit viser son role=\"tab\".")
    if panels and any("hidden" in p.attrs for p in panels) and not RE_PRINT_TABPANEL.search(html):
        fails.append("L16 panneaux d'onglets masqués et aucune règle @media print ne les "
                     "réaffiche — à l'impression, TOUS les panneaux se lisent "
                     "([role=\"tabpanel\"][hidden] { display: block } sous @media print).")

    # --- L17 : ligne de tableau dépliable (composant table-detail.js) ---------
    # TF-0432 (lot Client-B 20260820b) : toute ligne tr[data-detail] a un id et un bouton qui la
    # vise, sa cellule couvre toutes les colonnes, et elle s'imprime dépliée.
    details = [n for n in a.racine.descendants() if n.tag == "tr" and "data-detail" in n.attrs]
    boutons_controls = {(n.att("aria-controls") or "").strip()
                        for n in a.racine.descendants() if n.tag == "button"}
    for det in details:
        did = (det.att("id") or "").strip()
        if not did:
            fails.append(f"L17 ligne de détail sans id ({det.chemin()}) — aucun bouton ne "
                         "peut la viser.")
            continue
        if did not in boutons_controls:
            fails.append(f"L17 ligne de détail #{did} sans bouton — un <button "
                         f"aria-expanded aria-controls=\"{did}\"> est attendu dans sa ligne mère.")
        tables = [x for x in det.ancetres() if x.tag == "table"]
        if tables:
            theads = [x for x in tables[0].descendants() if x.tag == "thead"]
            n_cols = 0
            if theads:
                premiere = [x for x in theads[0].descendants() if x.tag == "tr"]
                if premiere:
                    n_cols = sum(int(c.att("colspan") or 1) for c in premiere[0].enfants
                                 if isinstance(c, Noeud) and c.tag in ("th", "td"))
            cellules = [c for c in det.enfants if isinstance(c, Noeud) and c.tag == "td"]
            couvert = sum(int(c.att("colspan") or 1) for c in cellules)
            if n_cols and couvert != n_cols:
                fails.append(f"L17 ligne de détail #{did} : colspan {couvert} pour {n_cols} "
                             "colonnes — le détail couvre toute la largeur du tableau.")
    if details and not RE_PRINT_DETAIL.search(html):
        fails.append("L17 lignes de détail présentes et aucune règle @media print ne les "
                     "déplie — à l'impression, le détail se lit "
                     "(tr[data-detail][hidden] { display: table-row } sous @media print).")

    return fails, warns


# ---------------------------------------------------------------------------
# A1 — autonomie réseau (décision D-10 d'organization, 08/08 ; contrôle exécutable
# livré le 11/08, TF-0085). Un livrable HTML sortant est entièrement autonome :
# aucun CDN, aucune police distante, aucune image externe — trois motifs, par ordre
# d'importance : confidentialité (une requête sortante signale l'ouverture du
# document), durabilité (un CDN disparu rend la page illisible dans deux ans),
# contexte de lecture (pièce jointe ouverte hors ligne, proxy d'entreprise).
# Un lien cliquable <a href> reste légitime : il ne charge rien sans geste du
# lecteur. xmlns= est un identifiant de vocabulaire, jamais résolu en requête.
# ---------------------------------------------------------------------------
RE_RESEAU = re.compile(r"^\s*(?:https?:)?//", re.I)
RE_CSS_RESEAU = re.compile(
    r"@import\s+(?:url\(\s*)?[\"']?\s*(?:https?:)?//"
    r"|url\(\s*[\"']?\s*(?:https?:)?//", re.I)
BALISES_CHARGEANTES = {"script", "img", "iframe", "video", "audio", "source",
                       "embed", "object", "track", "input"}
ATTRS_CHARGEANTS = ("src", "srcset", "poster", "data")
LINK_RELS_CHARGEANTS = {"stylesheet", "icon", "shortcut", "preload", "prefetch",
                        "preconnect", "dns-prefetch", "manifest", "modulepreload",
                        "apple-touch-icon", "mask-icon"}
RE_BALISE = re.compile(r"<(\w+)\b([^>]*)>", re.S)
RE_ATTR = re.compile(r"([\w-]+)\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)")


def check_structure(a: Arbre):
    """S1 — cohérence de tableau : chaque ligne du corps porte autant de cellules que l'en-tête.

    Le fait qui la fait naître (TF-0445, 21/08/2026). Cinq lignes du tableau de mesures d'un
    livrable portaient une barre verticale NON ÉCHAPPÉE à l'intérieur d'un `<span>` de code —
    alternatives de regex (`grep -niE "deploy|webapp|acr"`) et opérateur de shell (`||`). Le
    découpage en cellules a rendu 7 à 9 cellules pour un en-tête de 4, et le rendu a produit
    UNE DEMI-PAGE BLANCHE sous la ligne concernée, visible sur la capture 1280 px que l'oracle
    produit lui-même. Sur cette même page : `check_html` PASS « aucun problème détecté » et
    `render_page` PASS, zéro bloquant aux trois breakpoints. Ni l'un ni l'autre ne comptait les
    cellules d'une ligne.

    C'est un défaut de STRUCTURE, pas de style : invisible à la relecture humaine d'un document
    long, invisible à un contrôle de rendu (la page ne déborde pas, elle se troue), et pourtant
    il rend le tableau faux — les valeurs glissent d'une colonne.

    Ce que S1 NE juge PAS, et le déclare : un tableau portant un `rowspan` n'est pas comptable
    ligne à ligne (une cellule d'une ligne occupe la suivante) ; ces tableaux sont écartés avec
    leur motif plutôt que jugés à tort. Un tableau sans en-tête n'a pas de référence : il est
    écarté de même.
    """
    fails, warns = [], []
    tables = [n for n in a.racine.descendants() if n.tag == "table"]
    if not tables:
        return fails, warns

    def _cellules(tr):
        """Largeur d'une ligne, colspan compris. `colspan` illisible compte pour 1."""
        largeur = 0
        for c in tr.descendants():
            if c.tag not in ("td", "th"):
                continue
            # Une cellule d'un tableau IMBRIQUÉ appartient à l'autre tableau, pas à celui-ci.
            parent_tr = next((x for x in c.ancetres() if x.tag == "tr"), None)
            if parent_tr is not tr:
                continue
            try:
                largeur += max(1, int(str(c.att("colspan") or "1").strip()))
            except ValueError:
                largeur += 1
        return largeur

    ecartes = []
    for i, table in enumerate(tables, 1):
        lignes = [n for n in table.descendants() if n.tag == "tr"
                  and next((x for x in n.ancetres() if x.tag == "table"), None) is table]
        if len(lignes) < 2:
            continue
        if any(c.att("rowspan") for l in lignes for c in l.descendants() if c.tag in ("td", "th")):
            ecartes.append(f"tableau {i} (rowspan : la largeur d'une ligne n'est pas comptable seule)")
            continue
        entete = next((l for l in lignes if any(c.tag == "th" for c in l.descendants())), None)
        if entete is None:
            ecartes.append(f"tableau {i} (aucun en-tête : pas de largeur de référence)")
            continue
        attendu = _cellules(entete)
        if attendu == 0:
            continue
        for j, ligne in enumerate(lignes, 1):
            if ligne is entete:
                continue
            large = _cellules(ligne)
            if large == attendu:
                continue
            # Le premier texte de la ligne situe le défaut pour l'auteur, qui ne compte pas
            # les <td> à l'œil dans un document de quarante lignes.
            repere = " ".join(ligne.texte().split())[:48]
            fails.append(
                f"S1 tableau incohérent : tableau {i}, ligne {j} porte {large} cellule(s) pour "
                f"un en-tête de {attendu} — « {repere} ». Cause la plus fréquente : un caractère "
                "`|` non échappé dans une cellule (regex, opérateur de shell) qui a été lu comme "
                "un séparateur. Le tableau rend faux — les valeurs glissent de colonne — et la "
                "page se troue sans jamais déborder, donc aucun contrôle de rendu ne le voit.")
    if ecartes:
        warns.append("S1 non jugé sur " + ", ".join(ecartes[:4])
                     + (f" et {len(ecartes) - 4} autre(s)" if len(ecartes) > 4 else "")
                     + " — un tableau non comptable se déclare, il ne se juge pas à tort.")
    return fails, warns


def check_autonomie(html: str):
    """A1 : aucune ressource chargée par le réseau. Retourne (fails, warns)."""
    constats = []

    # Vue « balisage réel » (TF-0307) : un commentaire ne charge RIEN — le navigateur ne
    # résout ni la balise ni l'`url()` qu'il contient. A1 se juge donc commentaires retirés,
    # comme les contrôles de la charte (cf. `_sans_commentaires`). Défaut latent buté trois
    # fois pendant la campagne du 17/08 sur les règles voisines : un gabarit qui écrit
    # « ne pas charger de police par url(https://…) » se faisait accuser de le faire.
    net = _sans_commentaires(html)

    for m in RE_BALISE.finditer(net):
        balise = m.group(1).lower()
        attrs = {k.lower(): v.strip("\"'") for k, v in RE_ATTR.findall(m.group(2))}
        if balise in BALISES_CHARGEANTES:
            for att in ATTRS_CHARGEANTS:
                val = attrs.get(att, "")
                # srcset : plusieurs URL séparées par des virgules
                candidats = val.split(",") if att == "srcset" else [val]
                if any(RE_RESEAU.match(c.strip()) for c in candidats if c.strip()):
                    constats.append(f"<{balise} {att}=\"{val[:70]}\">")
        elif balise == "link":
            rels = set(attrs.get("rel", "").lower().split())
            if rels & LINK_RELS_CHARGEANTS and RE_RESEAU.match(attrs.get("href", "")):
                constats.append(f"<link rel=\"{attrs.get('rel','')}\" "
                                f"href=\"{attrs.get('href','')[:70]}\">")
        # CSS inline d'un attribut style : url(https://…)
        if "style" in attrs and RE_CSS_RESEAU.search(attrs["style"]):
            constats.append(f"style=\"{attrs['style'][:70]}\" sur <{balise}>")

    for bloc in re.findall(r"<style[^>]*>(.*?)</style>", net, re.S | re.I):
        # Les commentaires CSS aussi, même raison et même geste qu'en G1 : une `url()`
        # commentée en `/* … */` est morte pour le navigateur, l'accuser interdirait au
        # socle d'expliquer en place ce qu'il vient de retirer.
        bloc_net = RE_COMMENTAIRE_CSS.sub(" ", bloc)
        for hit in RE_CSS_RESEAU.finditer(bloc_net):
            extrait = bloc_net[hit.start():hit.start() + 70].strip()
            constats.append(f"CSS : {extrait}")

    fails = []
    if constats:
        exemples = " · ".join(constats[:3])
        suite = f" (+{len(constats) - 3} autre(s))" if len(constats) > 3 else ""
        fails.append(
            f"A1 — {len(constats)} requête(s) réseau au chargement : {exemples}{suite} "
            "— un livrable sortant est autonome (D-10 : confidentialité, durabilité, "
            "lecture hors ligne) ; inliner le CSS/JS, passer les images en data: URI.")

    # A1-bis (RA-1, retour Produit-10 du 13/08) : une séquence </script> écrite en clair dans le
    # CONTENU d'un script inliné (typiquement le commentaire d'usage d'un asset) ferme la
    # balise hôte au milieu du fichier — composant tronqué, son reste devient du texte de
    # body (symptôme : littéraux L11 portés par html > body), et rien ne le dit. Le comptage
    # ne suffit PAS (un commentaire peut porter une paire équilibrée) : on lit comme le
    # navigateur — chaque bloc script s'arrête à la PREMIÈRE fermeture ; tout « </script »
    # survivant hors bloc est la fermeture réelle devenue orpheline, preuve de la troncature.
    #
    # A1-bis se juge sur le texte BRUT, contrairement à A1 ci-dessus (TF-0307) : le défaut
    # qu'il traque est précisément une séquence écrite dans un commentaire, et retirer les
    # commentaires HTML pourrait avaler la fermeture orpheline qui le prouve (une page
    # tronquée n'a plus de balisage cohérent — un `<!--` non refermé y mangerait la suite).
    hors_blocs = re.sub(r"<script\b[^>]*>.*?</script", "", html, flags=re.S | re.I)
    orphelins = len(re.findall(r"</script", hors_blocs, re.I))
    if orphelins:
        fails.append(
            f"A1-bis — script inline tronqué : {orphelins} fermeture(s) </script> orpheline(s) "
            "après lecture navigateur (un bloc script s'arrête à la PREMIÈRE fermeture). Une "
            "séquence « </script » non échappée — souvent dans le commentaire d'usage d'un "
            "asset inliné — a fermé la balise hôte : échapper en « <\\/script » dans le JS.")
    return fails, []


# ---------------------------------------------------------------------------
# G1 — bascule thème sombre câblée (pattern normatif R-30, TF-0131/TF-0134 ; vit
# dans la famille « charte », même statut que A1). Une affordance sans effet
# observable est un défaut (loi transverse n°1 du pilot) : un bouton
# .theme-toggle / [data-theme-toggle] qui n'est jamais suivi d'un script posant
# data-theme sur le document est une bascule morte — FAIL bloquant. L'absence
# totale de bouton n'est qu'un avertissement : le socle sert aussi des rendus
# figés (export print/PDF) où aucune bascule n'a de sens.
# ---------------------------------------------------------------------------
RE_G1_BOUTON = re.compile(
    r'<[a-z][a-z0-9-]*\b[^>]*(?:class\s*=\s*(["\'])[^"\']*\btheme-toggle\b[^"\']*\1'
    r'|\bdata-theme-toggle\b)[^>]*>', re.I)
RE_G1_CABLAGE = re.compile(
    r'\.setAttribute\s*\(\s*[\'"]data-theme[\'"]|\.dataset\.theme\s*=', re.I)

# G1 (suite, TF-0303) — l'AUTO-SOMBRE hérité de l'OS. Retiré le 13/08 (TF-0158) après un
# retour humain réel, contradiction levée par RV-9 le 14/08 : clair par défaut STRICT, le
# sombre est un CHOIX du lecteur (bascule + persistance). Le mécanisme est pourtant revenu
# le 17/08 dans un livrable remis à un client (lot Produit-01) — une règle écrite trois fois
# et jouée zéro fois ne s'oppose à rien (R-35).
#
# Détecté là où il AGIT, jamais là où il est CITÉ : dans le CSS (bloc <style> ou attribut
# style) et dans un appel matchMedia. Une mention en commentaire — le gabarit du socle et la
# fixture verte g1-bouton-cable en portent une, pour expliquer le retrait — reste muette :
# sans cette distinction, la règle condamnerait la documentation de son propre interdit.
RE_G1_AUTO_CSS = re.compile(r"prefers-color-scheme", re.I)
RE_G1_AUTO_JS = re.compile(
    r"matchMedia\s*\(\s*[\"'][^\"']*prefers-color-scheme", re.I)


def check_theme_toggle(html: str):
    """G1 : retourne (fails, warns)."""
    fails, warns = [], []

    # L'auto-sombre se juge AVANT la présence d'un bouton : le cas fondateur (Produit-01)
    # n'avait aucune bascule et suivait quand même l'OS — sortir tôt l'aurait innocenté.
    auto = []
    net = _sans_commentaires(html)
    for bloc in re.findall(r"<style[^>]*>(.*?)</style>", net, re.S | re.I):
        # Les commentaires CSS aussi : la fixture verte du fragment corrigé explique en
        # `/* … */` d'où elle vient (« repassé de prefers-color-scheme à data-theme »).
        if RE_G1_AUTO_CSS.search(RE_COMMENTAIRE_CSS.sub(" ", bloc)):
            auto.append("bloc <style>")
    for m in RE_BALISE.finditer(net):
        attrs = {k.lower(): v.strip("\"'") for k, v in RE_ATTR.findall(m.group(2))}
        if "style" in attrs and RE_G1_AUTO_CSS.search(attrs["style"]):
            auto.append(f"attribut style sur <{m.group(1).lower()}>")
    scripts_js = RE_COMMENTAIRE_CSS.sub(" ", "".join(
        re.findall(r"<script[^>]*>(.*?)</script>", net, re.S | re.I)))
    if RE_G1_AUTO_JS.search(scripts_js):
        auto.append("appel matchMedia")
    if auto:
        fails.append(
            f"G1 auto-sombre hérité de l'OS : prefers-color-scheme pilote le thème "
            f"({', '.join(sorted(set(auto)))}) — retiré le 13/08 (TF-0158), tranché par "
            "RV-9 le 14/08 : clair par défaut STRICT. Un livrable circule et s'ouvre "
            "identique chez tous ses lecteurs ; le sombre se choisit par la bascule "
            "S-G1 (`:root[data-theme=\"dark\"]` + localStorage), jamais par l'OS.")

    if not RE_G1_BOUTON.search(html):
        warns.append(
            "G1 aucun bouton de bascule thème sombre détecté (.theme-toggle ou "
            "[data-theme-toggle]) — avertissement R-30, pas un défaut bloquant : "
            "un rendu figé (export print/PDF) n'a légitimement aucune bascule.")
        return fails, warns
    scripts = "".join(re.findall(r"<script[^>]*>(.*?)</script>", html, re.S | re.I))
    if not RE_G1_CABLAGE.search(scripts):
        fails.append(
            "G1 bascule morte : un bouton .theme-toggle/[data-theme-toggle] existe "
            "mais aucun script ne pose data-theme sur le document — l'affordance "
            "est visible sans effet observable (loi transverse n°1, R-30).")
    return fails, warns


# ---------------------------------------------------------------------------
# EXEMPTIONS DÉCLARÉES (TF-0308) — R-30 §3 : une exemption non consignée n'existe pas.
#
# Le cas : les gabarits du skill `digit-ai-schemas` sont rouges à ce contrôle, et trois
# d'entre eux le resteront quoi qu'on fasse — ce sont des FRAGMENTS par conception, dont
# l'en-tête dit lui-même « insérer ce <svg> dans une page HTML qui utilise le squelette de
# template-multi-bandes.html ». Un fragment n'a ni <head>, ni <title>, ni favicon, ni
# :root : la page HÔTE les porte, et c'est ELLE qui se juge. Un quatrième cas est plus
# étroit : un gabarit à trous ne peut pas porter d'indice de version DATÉ, puisque la
# version appartient à l'instance produite, pas au canevas.
#
# Le geste : jamais un silence, jamais un fichier retiré du contrôle. Le fichier reste
# jugé sur TOUT le reste (réseau A1, thème G1, police Syne, lisibilité L1-L14) et les
# règles écartées sont ANNONCÉES avec leur motif, à chaque exécution.
#
# Le registre est nominatif, pas arborescent : exempter tout `digit-ai-schemas/assets/`
# aurait aussi couvert les trois PAGES du même dossier — dont la fuite Google Fonts que
# la même campagne corrige. Un gabarit ajouté demain échoue donc jusqu'à ce qu'on le
# déclare ici : une exemption se décide, elle ne se devine pas.
FAMILLE_AUTOPORTANCE = (
    "A1 DOCTYPE", "A1 <html>", "A1 <head>", "A1 <body>", "A2 ", "A3 ", "A4 ",
    "<title> vide", "Aucun <h1>", ":root absent", "@media print absent",
)
FAMILLE_A4_VERSION = ("A4 titre sans indice de version",)

# TF-0336 (18/08/2026) — l'arbitrage rendu sur les {{PLACEHOLDER}} des gabarits.
# L11 refuse un littéral de langage rendu dans du texte visible : « une valeur non renseignée
# doit être traitée par le producteur, pas rendue telle quelle ». C'est juste POUR UNE PAGE.
# Appliquée à un GABARIT, la règle refuse au canevas ce qui EST le canevas : les six fichiers
# de `digit-ai-schemas/assets/` sortaient tous FAIL sous `--regles L`, uniquement là-dessus.
# Un contrôle qui refuse par construction tout un dossier ne se joue plus : c'est le bruit de
# fond que TF-0228 a coûté cher à éteindre, et que TF-0308 a déjà tranché pour la charte.
#
# L'exemption est donc NOMINATIVE (six fichiers, jamais un dossier), ÉTROITE (L11 seule — L1
# à L14 restent jugées) et ANNONCÉE à chaque exécution. Et surtout : elle ne peut pas fuir
# vers un livrable, parce qu'elle s'apparie sur le CHEMIN. Une page produite depuis un de ces
# gabarits n'a pas ce chemin : elle est jugée par L11 en entier — ce qui est exactement le
# défaut que L11 existe pour attraper.
FAMILLE_L11_GABARIT = ("L11 ",)

# Même arbitrage, autre règle, même cause : L3 exige qu'une légende fasse au moins 20
# caractères (`decrit_par`) ou 12 (`legende_visible`). Sur un gabarit, la légende est
# `{{KPI1_LABEL}}` — 14 caractères de trou. Le seuil juge la LONGUEUR d'un texte que le
# canevas n'a pas encore. La STRUCTURE, elle, reste exigée et elle est tenue : chaque
# `.kpi-value` du gabarit porte un `aria-describedby` vers l'id de son `.kpi-label`
# (posé le 18/08). Ce qui est écarté est le seuil, jamais la présence — et l'instance
# produite, qui a un vrai libellé, est jugée par L3 en entier.
FAMILLE_L3_GABARIT = ("L3 valeur sans légende",)
_MOTIF_L3_GABARIT = ("gabarit à trous : L3 mesure la LONGUEUR d'une légende, et la légende "
                     "est ici un {{PLACEHOLDER}}. La structure est tenue (aria-describedby "
                     "de chaque valeur vers l'id de son libellé) et reste jugée ; le seuil "
                     "s'appliquera à l'instance, qui porte le vrai libellé")
_MOTIF_GABARIT = ("gabarit à trous : ses {{PLACEHOLDER}} SONT son objet. L11 reste armée "
                  "en entier sur toute page produite depuis lui — l'exemption s'apparie au "
                  "chemin du canevas, jamais au contenu")

_HOTE_SCHEMAS = ("son en-tête le déclare : à insérer dans le squelette "
                 "template-multi-bandes.html, qui porte le <head> et se juge, lui, "
                 "en page autonome")
EXEMPTIONS_DECLAREES = (
    ("digit-ai-schemas/assets/template-topologie.html", FAMILLE_AUTOPORTANCE,
     f"fragment SVG de canevas, pas une page — {_HOTE_SCHEMAS}"),
    ("digit-ai-schemas/assets/template-flux-temporel.html", FAMILLE_AUTOPORTANCE,
     f"fragment SVG de canevas, pas une page — {_HOTE_SCHEMAS}"),
    ("digit-ai-schemas/assets/template-tableau-de-bord.html", FAMILLE_AUTOPORTANCE,
     f"blocs HTML/CSS de canevas, pas une page — {_HOTE_SCHEMAS}"),
    ("digit-ai-schemas/assets/template-multi-bandes.html", FAMILLE_A4_VERSION,
     "gabarit à trous : le titre est « {{TITRE_PAGE}} · Digit-AI » et l'indice de version "
     "daté appartient à l'INSTANCE produite, jamais au canevas — les autres règles A "
     "(squelette, charset, favicon, réseau) sont tenues et restent jugées"),
    ("digit-ai-schemas/assets/template-tableau-de-bord.html", FAMILLE_L3_GABARIT,
     _MOTIF_L3_GABARIT),
    ("digit-ai-schemas/assets/template-flux-temporel.html", FAMILLE_L11_GABARIT, _MOTIF_GABARIT),
    ("digit-ai-schemas/assets/template-modele-donnees.html", FAMILLE_L11_GABARIT, _MOTIF_GABARIT),
    ("digit-ai-schemas/assets/template-multi-bandes.html", FAMILLE_L11_GABARIT, _MOTIF_GABARIT),
    ("digit-ai-schemas/assets/template-tableau-de-bord.html", FAMILLE_L11_GABARIT, _MOTIF_GABARIT),
    ("digit-ai-schemas/assets/template-topologie.html", FAMILLE_L11_GABARIT, _MOTIF_GABARIT),
)


def exemption_declaree(source, hors=()):
    """(familles, motif) déclarés pour ce fichier, ou (None, None) — le cas de tous
    les livrables : sans chemin, ou hors registre, rien n'est écarté.

    TF-0336 : un même fichier peut porter PLUSIEURS lignes au registre (un fragment de
    canevas est à la fois non autoporteur et à trous). Elles se cumulent, et `hors` permet à
    l'appelant de ne retenir que celles qui concernent sa famille de contrôles — sinon
    l'exemption L11 se serait annoncée « sans effet » pendant la passe charte, et
    réciproquement, en accusant une dette qui n'existe pas.
    """
    if not source:
        return None, None
    chemin = str(source).replace("\\", "/")
    familles, motifs = [], []
    for suffixe, fam, motif in EXEMPTIONS_DECLAREES:
        if not chemin.endswith(suffixe):
            continue
        if hors and fam not in hors:
            continue
        familles += list(fam)
        if motif not in motifs:
            motifs.append(motif)
    if not familles:
        return None, None
    return tuple(familles), " · ".join(motifs)


def check(html: str, regles: str = "tout", source=None):
    """Retourne (fails, warns) — deux listes de messages.

    `source` (chemin du fichier) n'est lu que pour confronter le registre
    d'exemptions déclarées ci-dessus : sans lui, aucune exemption ne s'applique.
    """
    fails, warns = [], []
    familles, motif = exemption_declaree(source, hors=(FAMILLE_AUTOPORTANCE, FAMILLE_A4_VERSION))
    if regles in ("tout", "charte"):
        f, w = check_charte(html)
        if familles:
            gardes = [x for x in f if not x.startswith(familles)]
            ecartes = len(f) - len(gardes)
            if ecartes:
                warns.append(
                    f"SKIP exemption déclarée ({ecartes} contrôle(s) écarté(s)) — {motif}. "
                    "Tout le reste est jugé : réseau A1, thème G1, police, lisibilité.")
            else:
                # Une exemption qui n'écarte plus rien est une dette qui dort : le fichier
                # est devenu conforme, la ligne du registre doit partir.
                warns.append(
                    "exemption déclarée SANS EFFET sur ce fichier — plus aucun contrôle "
                    "écarté : retirer sa ligne de EXEMPTIONS_DECLAREES (check_html.py).")
            f = gardes
        fails += f
        warns += w
        f, w = check_autonomie(html)
        fails += f
        warns += w
        f, w = check_theme_toggle(html)
        fails += f
        warns += w
        # S1 (TF-0445) : cohérence de tableau. Défaut de STRUCTURE — invisible à la relecture
        # humaine, invisible au rendu (la page se troue sans déborder), et pourtant le tableau
        # rend faux. Il a fallu qu'un humain le voie sur une capture pendant que les deux
        # oracles rendaient PASS.
        f, w = check_structure(construire(html))
        fails += f
        warns += w
    if regles in ("tout", "L"):
        f, w = check_lisibilite(html, construire(html))
        # TF-0336 — même mécanique que pour la charte, et pour la même raison : ce qui est
        # écarté est NOMMÉ à chaque exécution, et une exemption devenue inutile s'accuse
        # elle-même. Un contrôle écarté en silence est un contrôle perdu.
        fam_l, motif_l = exemption_declaree(source, hors=(FAMILLE_L11_GABARIT, FAMILLE_L3_GABARIT))
        if fam_l:
            gardes = [x for x in f if not x.startswith(fam_l)]
            ecartes = len(f) - len(gardes)
            if ecartes:
                warns.append(
                    f"SKIP exemption déclarée ({ecartes} contrôle(s) L écarté(s)) — {motif_l}. "
                    "Tout le reste de la famille L est jugé.")
            else:
                warns.append(
                    "exemption L déclarée SANS EFFET sur ce fichier — plus aucun contrôle "
                    "écarté : retirer sa ligne de EXEMPTIONS_DECLAREES (check_html.py).")
            f = gardes
        fails += f
        warns += w
    return fails, warns


# TF-0366 (lot Produit-10 20260818a, 18/08) — un verdict archivé ne disait pas sous quel JEU DE
# RÈGLES il avait été rendu. Fait mesuré : la règle A3 (« `<meta charset>` déclaré au 2470e
# octet — la spécification exige les 1024 premiers ») met en échec un livrable DÉCLARÉ PASS le
# 14/08 et rejoué à l'identique le 18 : le fichier n'a pas changé, la règle est POSTÉRIEURE. Un
# journal d'oracles archivé (R-32) affirmait donc un PASS qui n'était plus vrai, et rien dans le
# journal ne permettait de le savoir sans tout rejouer.
#
# La version est DÉRIVÉE, jamais tenue à la main (loi 4) — et elle ne dérive pas du fichier
# entier : l'empreinte du source changerait à chaque virgule d'un commentaire, et tout journal
# paraîtrait périmé pour rien. Ce qui identifie un jeu de règles, c'est la LISTE DES RÈGLES
# qu'il émet. Ajouter A3 la change ; réécrire un commentaire ne la change pas.
_CODE_REGLE = re.compile(r"""["']((?:A\d|G\d|L\d{1,2}|S-G\d|V\d|RA-\d)) """)


def jeu_de_regles(source_py=None) -> dict:
    """Identité du jeu de règles : les codes émis, et leur empreinte. Dérivée du code source.

    Le champ voyage dans la sortie JSON et se recopie au journal d'oracles (R-32). Un journal
    dont l'empreinte diffère de l'empreinte courante n'est pas faux — il est ANTÉRIEUR, et
    c'est tout ce qu'on veut pouvoir dire sans rejouer.
    """
    chemin = source_py or __file__
    with open(chemin, encoding="utf-8", errors="replace") as f:
        texte = f.read()
    codes = sorted({m.group(1) for m in _CODE_REGLE.finditer(texte)})
    empreinte = hashlib.sha256("|".join(codes).encode("utf-8")).hexdigest()[:12]
    return {"regles": codes, "nombre": len(codes), "empreinte": empreinte}


def main():
    ap = argparse.ArgumentParser(description="Conformité HTML au socle Digit-AI.")
    ap.add_argument("path", nargs="?", help="Chemin du fichier HTML (sinon échantillon).")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    ap.add_argument("--regles", choices=["tout", "charte", "L"], default="tout",
                    help="famille de contrôles (défaut : tout)")
    ap.add_argument("--version-regles", action="store_true", dest="version_regles",
                    help="imprimer l'identité du jeu de règles (codes + empreinte) et sortir — "
                         "TF-0366 : c'est ce que R-32 recopie au journal pour qu'un verdict "
                         "archivé dise sous quelles règles il a été rendu")
    args = ap.parse_args()
    if args.version_regles:
        print(json.dumps(jeu_de_regles(), ensure_ascii=False))
        raise SystemExit(0)

    if args.path:
        try:
            with open(args.path, encoding="utf-8") as f:
                html = f.read()
        except OSError as e:
            print(f"Erreur lecture : {e}", file=sys.stderr)
            sys.exit(2)
        source = args.path
    else:
        html, source = SAMPLE, "(échantillon intégré)"

    fails, warns = check(html, args.regles, source=args.path)
    verdict = "PASS" if not fails else "FAIL"

    if args.output == "json":
        print(json.dumps(
            {"source": source, "regles": args.regles, "verdict": verdict,
             "version_regles": jeu_de_regles(), "fails": fails, "warns": warns},
            ensure_ascii=False, indent=2))
    else:
        print(f"Source  : {source}")
        print(f"Règles  : {args.regles}")
        jeu = jeu_de_regles()
        print(f"Verdict : {verdict}")
        print(f"Règles  : {jeu['nombre']} règles, empreinte {jeu['empreinte']} "
              f"(à recopier au journal R-32 — un journal d'une autre empreinte est ANTÉRIEUR)")
        if fails:
            print("\nÉchecs bloquants :")
            for x in fails:
                print(f"  x {x}")
        if warns:
            print("\nAvertissements :")
            for x in warns:
                print(f"  ! {x}")
        if not fails and not warns:
            print("\nAucun problème détecté.")

    sys.exit(0 if not fails else 1)


if __name__ == "__main__":
    main()
