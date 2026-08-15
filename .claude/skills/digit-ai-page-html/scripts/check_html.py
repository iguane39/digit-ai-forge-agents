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
  · L1-L10  — lisibilité (references/lisibilite.md) : texte tronqué, largeur de
              lecture, valeur sans barème, liste longue non filtrable, surlignage
              qui casse les mots, sommaire muet ou à ancre morte, chapitre sans
              chapeau, lien interne sans destination, détail vide, table de données
              sans mode d'emploi.

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
<title>Digit-AI — Exemple</title>
<style>:root{--head:"Roboto",system-ui,sans-serif;--sans:"DM Sans",system-ui,sans-serif;}
@media (max-width:640px){body{font-size:15px;}}
@media print{body{background:#fff;}}</style></head>
<body><main><h1>Titre</h1><h2>Section</h2><p>Contenu</p></main></body></html>"""

VIDES = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
         "meta", "param", "source", "track", "wbr"}

# Classes qui désignent une valeur mise en avant.
CL_SCORE = {"sc", "score", "note", "jauge"}          # → barème lié obligatoire
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
def regles_css(styles):
    css = "\n".join(styles)
    css = re.sub(r"/\*.*?\*/", " ", css, flags=re.S)
    out = []
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        sel, decls = m.group(1).strip(), m.group(2)
        if sel.startswith("@"):
            continue
        d = {}
        for morceau in decls.split(";"):
            if ":" in morceau:
                k, v = morceau.split(":", 1)
                d[k.strip().lower()] = v.strip().lower()
        out.append((sel.lower(), d))
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
# CHARTE — contrôles historiques, inchangés dans leur sévérité.
# ---------------------------------------------------------------------------
def check_charte(html: str):
    fails, warns = [], []
    low = html.lower()

    if "<!doctype html>" not in low:
        fails.append("DOCTYPE html manquant.")

    if not re.search(r'<html[^>]*\blang\s*=\s*"fr"', low):
        fails.append('Attribut lang="fr" absent sur <html>.')

    m_charset = re.search(r'<meta[^>]*charset', low)
    m_title = re.search(r"<title[ >]", low)
    if not m_charset:
        fails.append("<meta charset> absent.")
    elif m_title and m_charset.start() > m_title.start():
        fails.append("<meta charset> doit précéder <title> (priorité d'encodage).")

    if not re.search(r'<meta[^>]*name\s*=\s*"viewport"', low):
        fails.append("<meta viewport> absent.")

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

    head = re.search(r"<head[^>]*>(.*?)</head>", html, re.S | re.I)
    if head and re.search(r"<script(?![^>]*\bdefer\b)(?![^>]*\basync\b)[^>]*>",
                          head.group(1), re.I):
        warns.append("Script bloquant dans <head> (utiliser defer ou placer en fin de body).")

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
    blocs = set()
    for sel, d in css:
        if d.get("display") in ("block", "flex", "grid", "table", "list-item"):
            for morceau in sel.split(","):
                m = morceau.strip()
                for cl in re.findall(r"\.([A-Za-z_][\w-]*)", m):
                    blocs.add("." + cl)
                mt = re.match(r"^([a-z][a-z0-9]*)", m)
                if mt:
                    blocs.add(mt.group(1))
    blocs |= {"p", "div", "section", "li", "dd", "dt", "h1", "h2", "h3", "h4",
              "ul", "ol", "dl", "table", "details", "summary", "nav", "header",
              "footer", "main", "article", "aside", "blockquote", "figure"}

    def est_bloc(n):
        return n.tag in blocs or any(("." + c) in blocs for c in n.classes())

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
                orphelines.append((t[:44], prec.chemin()))
            if e.strip():
                prec = None
    for extrait, ou in orphelines[:6]:
        fails.append(f"L1 ponctuation orpheline : une ligne s'ouvre sur « {extrait} » "
                     f"après l'élément de bloc {ou} — la phrase a été coupée par "
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

    vus = set()
    for n in a.racine.descendants():
        cl = n.classes()
        est_score = bool(cl & CL_SCORE) or (
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
            # cellule OU, pour une colonne homogène, une fois par le th (RA-4).
            if not decrit_par(n) and not bareme_de_colonne(n):
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
            elif not (t and t.strip()) and not (al and al.strip()) \
                    and not decrit_par(n) and not legende_visible(n):
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
                     "pour une machine, pas pour un lecteur.")

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
        kpis_morts = [n for n in a.racine.descendants()
                      if (n.classes() & {"kpi", "tuile"}) and n.tag != "button"
                      and n.att("data-kpi-filtre") is None]
        if kpis_morts:
            warns.append(
                f"L13 {len(kpis_morts)} KPI (.kpi/.tuile) non cliquable(s) au-dessus d'une "
                "liste de ≥ 8 lignes — un KPI qui compte des éléments affichés les filtre "
                "(H3, composant kpi-filter.js) ; un KPI d'éléments hors page le dit.")

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

    for ident, sec in cibles:
        chapeaux = [e for e in sec.descendants()
                    if e.classes() & {"ch-apprend", "ch-st"}]
        if not chapeaux or max(len(e.texte_propre()) for e in chapeaux) < 40:
            fails.append(f"L7 chapitre #{ident} sans chapeau d'ouverture — un élément "
                         ".ch-apprend d'au moins 40 caractères (« ce que ce chapitre "
                         "vous apprend ») est attendu.")
        grosses = [t for t in sec.descendants()
                   if t.tag == "table" and _lignes_tbody(t) >= 8]
        if grosses:
            ex = [e for e in sec.descendants()
                  if "exemple-lecture" in e.classes() or "data-exemple-lecture" in e.attrs]
            if not ex or max(len(e.texte_propre()) for e in ex) < 30:
                fails.append(f"L10 chapitre de données #{ident} sans exemple de lecture — "
                             "un élément .exemple-lecture d'au moins 30 caractères est "
                             "attendu pour une table de ≥ 8 lignes.")

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
            fails.append(f"L8 lien interne muet : « {libelle or '(sans texte)'} » → {href} — "
                         "libellé de 8 caractères nommant la cible, ou title/aria-label "
                         "de 12 caractères.")
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
        segments = [s.strip() for s in t.split(";") if s.strip()]
        couples = [s for s in segments if RE_SEGMENT.match(s)]
        if len(couples) >= 3:
            enums.append((len(couples), t[:60], porteur.chemin()))
    for n, extrait, ou in enums[:6]:
        fails.append(f"L12 énumération de données en prose : {n} segments "
                     f"« clé — valeur » enchaînés par des points-virgules "
                     f"(« {extrait}… », {ou}) — au-delà de 3, c'est un tableau ou "
                     "une liste, avec une ligne qui dit ce qu'il faut y voir.")

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


def check_autonomie(html: str):
    """A1 : aucune ressource chargée par le réseau. Retourne (fails, warns)."""
    constats = []

    for m in RE_BALISE.finditer(html):
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

    for bloc in re.findall(r"<style[^>]*>(.*?)</style>", html, re.S | re.I):
        for hit in RE_CSS_RESEAU.finditer(bloc):
            extrait = bloc[hit.start():hit.start() + 70].strip()
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


def check_theme_toggle(html: str):
    """G1 : retourne (fails, warns)."""
    fails, warns = [], []
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
def check(html: str, regles: str = "tout"):
    """Retourne (fails, warns) — deux listes de messages."""
    fails, warns = [], []
    if regles in ("tout", "charte"):
        f, w = check_charte(html)
        fails += f
        warns += w
        f, w = check_autonomie(html)
        fails += f
        warns += w
        f, w = check_theme_toggle(html)
        fails += f
        warns += w
    if regles in ("tout", "L"):
        f, w = check_lisibilite(html, construire(html))
        fails += f
        warns += w
    return fails, warns


def main():
    ap = argparse.ArgumentParser(description="Conformité HTML au socle Digit-AI.")
    ap.add_argument("path", nargs="?", help="Chemin du fichier HTML (sinon échantillon).")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    ap.add_argument("--regles", choices=["tout", "charte", "L"], default="tout",
                    help="famille de contrôles (défaut : tout)")
    args = ap.parse_args()

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

    fails, warns = check(html, args.regles)
    verdict = "PASS" if not fails else "FAIL"

    if args.output == "json":
        print(json.dumps(
            {"source": source, "regles": args.regles, "verdict": verdict,
             "fails": fails, "warns": warns},
            ensure_ascii=False, indent=2))
    else:
        print(f"Source  : {source}")
        print(f"Règles  : {args.regles}")
        print(f"Verdict : {verdict}")
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
