"""Rendu multi-breakpoints + mesures zéro-défaut-visuel d'une page HTML Digit-AI.

Oracle mesuré de la checklist canonique references/zero-defaut-visuel.md :
  - V1  débordement horizontal (bloquant)
  - V2  contraste texte/fond WCAG AA : >= 4.5:1, ou >= 3:1 pour texte large (bloquant)
  - V9  actif visuel INDISCERNABLE du fond peint derriere lui (bloquant) —
        mesure au pixel sur une capture de l'element, pas sur son fichier
  - V4  chevauchements significatifs entre éléments frères (bloquant,
        sauf superposition déclarée data-overlap-ok, et sauf formes internes
        d'un même <svg> de petite taille — dessin d'icône, pas mise en page)
  - V3/V7  alignements et espacements irréguliers entre frères (avertissements)
  - contrôles d'une même rangée alignés à 2 px près (bloquant, TF-0773)
  - tableau rogné dans un conteneur défilant à >= 1280 px (bloquant, TF-0771)
  - bloc de texte < 70 % de son conteneur sur une page de données (bloquant, TF-0778)
  - sommaire encore visible après défilement (bloquant, TF-0772)

V5 (croisements de flèches) et V6 (images déformées) restent à l'inspection
visuelle des PNG produits — ce script ne les juge pas.

Usage :
    python render_page.py <page.html> [--widths 3840,2560,1920,1280,768,390] [--selector body]
                          [--scale 2] [--output json] [--out <dossier>]
                          [--timeout 30000]   # TF-0365 : page très haute

Sortie : un PNG par breakpoint (suffixe -w{largeur}) + rapport PASS/FAIL.
Code retour 0 = PASS (aucun bloquant), 1 = FAIL.

Les PNG ne tombent JAMAIS dans un arbre de LIVRAISON. Deux cas :
  - page hors livraison → `<dossier du HTML>/.oracles/`, sous-dossier d'atelier
    que l'orchestrateur quality-oracles ignore déjà à la marche ;
  - page sous `output/`, `old/`, `dist/`… → dossier temporaire nommé, chemin
    imprimé au rapport.

Le premier correctif (TF-0058) n'avait déplacé les captures que d'un cran : un
`.oracles/` DANS `output/` reste dans ce que le client reçoit, et un audit y a
laissé 25 Mo qu'il a fallu déplacer à la main (reconstat TF-0230, 14/08).
`--out <dossier>` fait foi quand il est donné — c'est ainsi qu'un run journalise
ses captures. Le chemin de chaque PNG reste dans le rapport, puisque V5 et V6
s'inspectent dessus.

Fonctionne dans les deux environnements de la forge (généralisé depuis
digit-ai-schemas/scripts/render_schema.py — composition, pas duplication) :
  - Claude Code (réseau ouvert) : `pip install playwright && playwright install chromium`.
  - Sandbox Claude.ai web : Chromium pré-installé auto-détecté (/opt/pw-browsers) ;
    polices WOFF2 de digit-ai-schemas réutilisées si le skill est présent.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Windows : forcer stdout/stderr en UTF-8 pour ne pas planter (cp1252) à l'impression
# des rapports contenant des caractères hors Latin-1 (tirets cadratins, ①-⑤, ✓…).
# reconfigure() : Python 3.7+ ; garde-fou si le flux ne le supporte pas.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRIPT_DIR = Path(__file__).parent
PREINSTALLED_BROWSER_ROOTS = ["/opt/pw-browsers"]
# Polices bundlées : celles de digit-ai-schemas si le skill est installé à côté.
FONT_DIR_CANDIDATES = [
    SCRIPT_DIR / "fonts",
    SCRIPT_DIR.parent.parent / "digit-ai-schemas" / "scripts" / "fonts",
    Path("/mnt/skills/user/digit-ai-schemas/scripts/fonts"),
]

# TF-0422 (lot Produit-05 20260820a, 21/08) : 1920 entre dans les largeurs par défaut — le défaut de
# colonne étroite (texte à 40 % d'un écran de 1 800 px, livré vert, refusé par le client) ne se
# voit qu'à partir de ~1 600 px ; 1280/768/390 ne le montraient jamais.
#
# TF-1066 (12/09/2026, règle E5 du pilot, décision humaine « pour le design, prends à minima par
# défaut FullHD (1920px en largeur) pour les desktops, et du responsive design pour monter jusqu'à
# du 4K »). Une page se CONÇOIT à 1920 px et se VÉRIFIE jusqu'à 3840 : 2560 et 3840 entrent donc
# dans la grille par défaut. Ce qu'elles montrent et que 1920 taisait : une prose qui s'étire sur
# 2 880 px de plancher `75vw` (E4 dit que la mesure de lecture est portée par le CONTENEUR), un
# tableau de données qui laisse la moitié de l'écran vide, une grille qui gagne des marges au lieu
# de gagner des colonnes. 1280 RESTE : les postes de bureau étroits existent encore, et c'est là
# que le repli des tableaux se déclenche (ROGNAGE_DONNEES_MIN_VIEWPORT).
DEFAULT_WIDTHS = [3840, 2560, 1920, 1280, 768, 390]

# L2 au rendu : un bloc de texte doit occuper au moins ce ratio de la largeur que
# son conteneur lui offre. En dessous, la page laisse du vide la ou le lecteur
# attend du texte. Ne s'applique qu'au-dela d'un viewport de bureau : sous cette
# largeur, une bride de lecture est sans effet visible.
L2_MIN_RATIO = 0.85
# TF-0440 — seuil du CONTENEUR de lecture : en deçà de 85 % de ce que son parent lui offre,
# une colonne calée à gauche est une gouttière, pas une mesure de lecture. Même valeur que
# L2_MIN_RATIO, et pour la même raison — ce qui change est ce qu'on mesure, pas le seuil.
L2C_MIN_RATIO = 0.85
L2_MIN_VIEWPORT = 1100
L2_MIN_CHARS = 120

# Gouttiere d'etiquettes : dans une grille a deux pistes dont la seconde porte du
# texte long et la premiere une etiquette courte, la premiere piste ne doit pas
# manger plus que cette part de la largeur. Au-dela, le contenu est tasse sur la
# droite -- et L2 ne le voit pas, puisque chaque colonne remplit bien SA case.
#
# Le seuil est a 20 %, pas a 25 % : le defaut CONSTATE mesurait 22 % (267px sur
# 1215). Un seuil pose au-dessus du defaut qui l'a motive ne prouve rien. 20 % est
# aussi la borne haute de la doctrine ; la grille legitime du meme rapport, qui
# porte les etiquettes Constat / Impact / Action, mesure 10 % et reste hors cause.
# TF-0491 (23/08) — l2_freres : le meme defaut signale TROIS FOIS par un client, sous trois
# formes ("colonne de texte a 40 % de la fenetre", "le texte d'intro devrait etre sur toute la
# ligne", "les lotissements ne prennent qu'une partie de la largeur"), sur quatre versions
# livrees. Cause unique : de la prose bornee a 1 080 px placee AU-DESSUS de cartes occupant
# 1 424 px. Aucune des trois mesures L2 ne peut le voir : elles comparent un bloc a ce que son
# conteneur lui OFFRE, et un conteneur borne offre 1 080 px — le bloc les remplit, donc PASS.
# Ce que voit le lecteur est ailleurs : la rupture d'alignement ENTRE FRERES EMPILES.
# Seuil a 80 % : en dessous, l'oeil accroche le decalage du bord droit.
L2_FRERES_MIN_RATIO = 0.80
# Un frere trop etroit ne fait pas reference : un encart de 300 px a cote d'une prose de 240 px
# n'est pas une rupture d'alignement, c'est une mise en page.
L2_FRERES_MIN_LARGEUR = 500
L2_COL_MAX = 0.20
L2_ETIQUETTE_MAX = 60
ALIGN_TOLERANCE_PX = 2.0
OVERLAP_MIN_RATIO = 0.10  # intersection > 10 % du plus petit élément = significative
# TF-0778 (02/09) — sur une PAGE DE DONNÉES, un bloc de texte qui n'occupe pas au moins ce
# ratio de son conteneur est un défaut. Seuil à 70 % et non 85 % (celui de L2) : L2 mesure une
# BRIDE (elle retire max-width et compare), cette règle-ci mesure ce que le lecteur voit, sur
# n'importe quel élément porteur de texte — `.chapo` n'est ni un `p` ni un `.prose`, et c'est
# exactement ce qui a échappé à L2 sur le livrable fautif.
DONNEES_PROSE_MIN_RATIO = 0.70
# TF-0771 (02/09) — au-delà de cette largeur de fenêtre, un tableau rogné DANS un conteneur
# défilant est un défaut bloquant, pas un « écart acceptable ». En deçà, le défilement
# horizontal est la parade prescrite par le socle (composants.md §6).
ROGNAGE_DONNEES_MIN_VIEWPORT = 1280
# TF-0930 (08/09, retour humain « augmente la largeur complète du document ») — le CONTENEUR
# d'une page de données, et non plus seulement la prose ou le tableau qu'il porte. Le socle
# bridait `.wrap` par `--w: clamp(75vw, 1680px, 92vw)` : 1 260 px dans une fenêtre de 1 370,
# 1 680 dans une fenêtre de 1 920 — alors que I1 et L26 disent « pleine largeur adaptative ».
# Aucun contrôle ne le voyait : L26 de check_html ne juge une bride que sur un conteneur DE
# TABLEAU et ne sait pas résoudre `var(--w)` ; V13 compare un bloc à son parent, et un bloc
# qui remplit un conteneur bridé rend 100 %. Le défaut vit entre le conteneur et la FENÊTRE.
# Seuil à 96 % et non 100 % : la marge absorbe la gouttière de défilement et les arrondis de
# `vw` ; le défaut constaté mesurait 92 % (1 260 / 1 370), largement sous le plancher.
DONNEES_CONTENEUR_MIN_RATIO = 0.96
# TF-0772 (02/09) — un sommaire ne se juge qu'au-delà de trois chapitres ET de deux écrans :
# c'est le seuil de la règle écrite (lisibilite.md L25), et il tient les deux mesures ensemble.
SOMMAIRE_MIN_CHAPITRES = 3
SOMMAIRE_MIN_ECRANS = 2
# Plafond des avertissements V7 détaillés. Au-delà, le reste est agrégé en une ligne :
# un avertissement qui défile enterre les bloquants V1/V2/V4 au lieu de les servir.
V7_MAX_DETAILS = 20


def ensure_browser_path() -> None:
    if os.environ.get("PLAYWRIGHT_BROWSERS_PATH"):
        return
    for root in PREINSTALLED_BROWSER_ROOTS:
        if Path(root).is_dir() and any(Path(root).glob("chromium*")):
            os.environ["PLAYWRIGHT_BROWSERS_PATH"] = root
            return


def ensure_local_fonts() -> None:
    """Installe les WOFF2 disponibles au cache fontconfig local (best-effort, idempotent)."""
    if shutil.which("fc-cache") is None:
        return
    src = next((d for d in FONT_DIR_CANDIDATES if d.is_dir()), None)
    if src is None:
        return
    user_fonts = Path.home() / ".fonts" / "digit-ai-page-html"
    user_fonts.mkdir(parents=True, exist_ok=True)
    copied = False
    for woff2 in src.glob("*.woff2"):
        target = user_fonts / woff2.name
        if not target.exists():
            shutil.copy2(woff2, target)
            copied = True
    if copied:
        subprocess.run(["fc-cache", "-f", str(user_fonts)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


# ---------------------------------------------------------------------------
# Mesures exécutées DANS la page (bounding boxes et styles calculés réels).
# ---------------------------------------------------------------------------
MEASURE_JS = r"""
() => {
  const issues = { v1_overflow: [], v2_contrast: [], v3_align: [], v4_overlap: [], v7_spacing: [],
                   l2_width: [], l2_gouttiere: [], l2_conteneur: [], l2_filet: [], l2_freres: [],
                   contenu_rogne: [], controles_desalignes: [], rognage_donnees: [],
                   prose_etroite: [], sommaire_perdu: [], etats_indiscernables: [],
                   conteneur_bride_donnees: [], overlap_en_bloc: [],
                   unmeasured: [] };
  const doc = document.documentElement;

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const label = (el) => {
    let t = el.tagName.toLowerCase();
    if (el.id) t += '#' + el.id;
    else if (el.classList.length) t += '.' + el.classList[0];
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return txt ? `${t} « ${txt}${txt.length >= 40 ? '…' : ''} »` : t;
  };

  // ---- V1 : débordement horizontal --------------------------------------
  const docDeborde = doc.scrollWidth > doc.clientWidth + 1;
  if (docDeborde) {
    issues.v1_overflow.push({ what: 'document', detail:
      `scrollWidth ${doc.scrollWidth}px > viewport ${doc.clientWidth}px` });
  }
  // TF-0382 (lot Produit-10 20260818b) — trois défauts d'un seul `break`, et le pire n'est pas
  // le plafond.
  //
  // MESURÉ : sur un rapport réel à 1280 px, la sortie portait EXACTEMENT 16 éléments, tous
  // descendants du MÊME tableau (8 colonnes, 77 lignes). Le plafond était donc atteint à
  // l'intérieur d'un seul sous-arbre — table + thead + tr + th + tbody + td d'un même tableau
  // comptaient pour six défauts alors qu'il n'y en a qu'UN. Conséquence : deux autres tableaux
  // de gabarit identique n'ont JAMAIS été examinés, et rien ne le disait. Un lecteur comprenait
  // « 16 défauts » là où il fallait lire « 16 relevés, inventaire interrompu » — un chiffre qui
  // n'est ni un compte ni une borne annoncée. Et `blocking` additionne ce chiffre : la sévérité
  // affichée était elle-même plafonnée.
  //
  // Trois corrections, dans l'ordre où elles comptent :
  //   1. on ne s'arrête PLUS : tout est parcouru, le compte exact est connu ;
  //   2. on regroupe par SOUS-ARBRE responsable — l'ancêtre débordant le plus extérieur est la
  //      cause, ses descendants débordent parce qu'il déborde. Le plafond est alors atteint pour
  //      de vraies raisons ;
  //   3. le détail seul est plafonné, et la troncature est DÉCLARÉE avec son plafond et le total.
  const debordants = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > doc.clientWidth + 1 && getComputedStyle(el).position !== 'fixed') {
      debordants.push({ el, right: r.right });
    }
  }
  const ensemble = new Set(debordants.map(d => d.el));
  // La CAUSE est l'ancêtre débordant le plus extérieur : si le parent déborde, l'enfant déborde
  // avec lui et ne constitue pas un second défaut à corriger.
  const racine = (el) => {
    let cause = el;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (ensemble.has(p)) cause = p;
    }
    return cause;
  };
  const groupes = new Map();
  for (const d of debordants) {
    const cause = racine(d.el);
    const g = groupes.get(cause) || { el: cause, right: 0, descendants: 0 };
    g.right = Math.max(g.right, d.right);
    if (d.el !== cause) g.descendants += 1;
    groupes.set(cause, g);
  }
  const PLAFOND_V1 = 16;
  const causes = [...groupes.values()];
  for (const g of causes.slice(0, PLAFOND_V1)) {
    issues.v1_overflow.push({
      what: label(g.el),
      detail: `bord droit à ${Math.round(g.right)}px pour un viewport de ${doc.clientWidth}px`
        + (g.descendants
          ? ` — ${g.descendants} descendant(s) débordent AVEC lui, comptés dans ce seul défaut`
          : ''),
    });
  }
  // La troncature se DIT, avec son plafond et le compte exact : sans ce drapeau, une liste
  // plafonnée se lit comme un inventaire complet.
  if (causes.length > PLAFOND_V1) {
    // `total` compte TOUS les défauts V1, l'entrée « document » comprise : un total qui oublie
    // une entrée déjà listée n'est ni le compte de la liste ni celui du réel. Défaut mesuré sur
    // ma propre première écriture — blocking valait 19 pour une liste de 17.
    const totalV1 = causes.length + (docDeborde ? 1 : 0);
    issues.v1_tronque = {
      plafond: PLAFOND_V1,
      total: totalV1,
      detaillees: issues.v1_overflow.length,
      causes_regroupees: causes.length,
      elements_debordants: debordants.length,
      motif: `inventaire des débordements TRONQUÉ : ${totalV1} défaut(s) V1 mesuré(s) — `
        + `${causes.length} cause(s) distincte(s) regroupant ${debordants.length} élément(s)`
        + `${docDeborde ? ', plus le document lui-même' : ''} — dont `
        + `${issues.v1_overflow.length} détaillé(s) ci-dessus. Le compte, lui, est exact : `
        + `c'est lui qui dit l'ampleur`,
    };
  }

  // ---- V2 : contraste WCAG ----------------------------------------------
  const parseColor = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (c1, c2) => {
    const [a, b] = [lum(c1), lum(c2)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  // TF-0582 (lot Produit-02 20260824) : ce qui PEINT sans etre un `background-color`.
  //
  // Le fait fondateur, mesure en production : un fond peint par `.color-exp::before` (50 % de la
  // largeur) sous un texte dont l'element porte `background: transparent`. Une mesure qui compare
  // `color` a `background-color` — ce que font la plupart des outils, dont axe-core — remonte
  // alors au conteneur, y lit un fond clair, et CONCLUT QUE TOUT VA BIEN sur un texte a 1,0 de
  // ratio. Le faux PASS est pire que l'absence de controle : il porte une signature.
  //
  // Cette sonde ne mesure pas ces cas — elle les DECLARE non mesurables. C'est le corollaire que
  // l'item demandait d'ecrire : une sonde dit ce qu'elle ne voit pas, sinon son silence se lit
  // comme un verdict.
  const peintHorsFond = (el) => {
    let node = el;
    while (node && node !== document.documentElement.parentElement) {
      const s = getComputedStyle(node);
      if (s.mixBlendMode && s.mixBlendMode !== 'normal') return `mix-blend-mode:${s.mixBlendMode}`;
      if (s.filter && s.filter !== 'none') return `filter:${s.filter}`;
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(node, pseudo);
        if (!ps || ps.content === 'none') continue;
        const fondPseudo = parseColor(ps.backgroundColor);
        const imagePseudo = ps.backgroundImage && ps.backgroundImage !== 'none';
        // Un pseudo-element qui peint ET qui a une surface : un `::before` sans dimension ne
        // couvre rien, et l'accuser ferait crier la sonde sur des puces decoratives.
        const surface = parseFloat(ps.width) > 0 && parseFloat(ps.height) > 0;
        if (surface && ((fondPseudo && fondPseudo.a > 0.05) || imagePseudo))
          return `${pseudo} peint (${imagePseudo ? ps.backgroundImage.slice(0, 40) : ps.backgroundColor})`;
      }
      node = node.parentElement;
    }
    return null;
  };

  const effectiveBg = (el) => {
    let node = el;
    while (node && node !== document.documentElement.parentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') return { image: true };
      const c = parseColor(s.backgroundColor);
      if (c && c.a >= 0.99) return { color: c };
      if (c && c.a > 0) {
        const behind = effectiveBg(node.parentElement || document.documentElement);
        if (behind.image) return behind;
        return { color: blend(c, behind.color || { r: 255, g: 255, b: 255, a: 1 }) };
      }
      node = node.parentElement;
    }
    return { color: { r: 255, g: 255, b: 255, a: 1 } };  // défaut : blanc
  };
  const seenText = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement;
    if (!el || !n.textContent.trim() || !visible(el) || seenText.has(el)) continue;
    seenText.add(el);
    const s = getComputedStyle(el);
    const fg = parseColor(s.color);
    if (!fg) continue;
    const bg = effectiveBg(el);
    if (bg.image) {
      issues.unmeasured.push({ what: label(el), detail: 'texte sur background-image — contraste non mesurable, à vérifier visuellement' });
      continue;
    }
    // TF-0582 : avant de conclure, dire ce qu'on ne voit pas. Un fond peint par un
    // pseudo-élément, un mix-blend-mode ou un filtre échappe à toute mesure par styles calculés.
    const horsFond = peintHorsFond(el);
    if (horsFond) {
      issues.unmeasured.push({ what: label(el), detail:
        `contraste NON MESURABLE par styles calculés — ${horsFond}. Un fond peint hors `
        + `\`background-color\` échappe à cette sonde : mesurer au pixel après rendu, ou vérifier `
        + `visuellement. Le silence d'une sonde n'est pas un verdict (TF-0582)` });
      continue;
    }
    const fgFlat = fg.a < 1 ? blend(fg, bg.color) : fg;
    const r = ratio(fgFlat, bg.color);
    const size = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const threshold = large ? 3.0 : 4.5;
    if (r < threshold) {
      issues.v2_contrast.push({ what: label(el), detail:
        `ratio ${r.toFixed(2)}:1 < ${threshold}:1 (${Math.round(size)}px${bold ? ' gras' : ''}, ` +
        `texte ${s.color} sur fond rgb(${Math.round(bg.color.r)},${Math.round(bg.color.g)},${Math.round(bg.color.b)}))` });
      if (issues.v2_contrast.length > 20) break;
    }
  }

  // ---- V3 / V4 / V7 : frères d'un même parent ---------------------------
  const parents = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (el.children.length >= 2) parents.add(el);
  }
  for (const parent of parents) {
    const kids = [...parent.children].filter(visible)
      .map((k) => ({ el: k, r: k.getBoundingClientRect() }));
    if (kids.length < 2) continue;
    // V4 chevauchements — sauf dessin d'icône : les formes internes d'un même
    // <svg> de petite taille (rect du corps, path du rabat, etc.) se
    // chevauchent par construction du dessin, ce n'est pas de la mise en page.
    const svgIcone = (() => {
      const racine = parent.tagName.toLowerCase() === 'svg' ? parent
        : (parent.closest ? parent.closest('svg') : null);
      if (!racine) return false;
      const rr = racine.getBoundingClientRect();
      return rr.width > 0 && rr.height > 0 && rr.width < 48 && rr.height < 48;
    })();
    // TF-0424 (lot Produit-05 20260820a) : les formes INTERNES d'un groupe SVG titre (<g><title>…)
    // se superposent par construction — un rect et son text sont un seul noeud de schema, pas
    // deux elements de mise en page. V4 ne juge que les chevauchements ENTRE noeuds et entre
    // noeud et fleche ; data-overlap-ok n'est plus a poser sur chaque forme d'un noeud.
    const groupeTitre = parent.tagName.toLowerCase() === 'g' &&
      [...parent.children].some((c) => c.tagName.toLowerCase() === 'title');
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i], b = kids[j];
        if (svgIcone || groupeTitre) continue;
        // TF-1146 (16/09, lot Produit-64 20260916a, retour RD-6) — L EXEMPTION S APPLIQUAIT A L
        // ELEMENT, PAS A LA PAIRE, ET COUVRAIT DONC AUSSI LE RECOUVREMENT NON VOULU. Dans le
        // schema des trois couches, le libelle de fleche « expose ses sorties a » etait imprime
        // A L INTERIEUR de la boite voisine, sous son sous-titre : un lecteur y lisait une
        // troisieme ligne de legende. Le defaut a traverse DEUX livraisons et quatre executions
        // des trois oracles, et a ete trouve en regardant une capture. Aucun controle ne pouvait
        // le voir : V1 ne voit rien (le texte est dans le cadre), V2 ne voit rien (il est
        // lisible — c est sa PLACE qui est fausse), L1 ne voit rien (texte SVG hors modele de
        // prose), et V4 ne voyait rien parce que le <text> portait data-overlap-ok et etait
        // exempte EN BLOC.
        //
        // L exemption reste indispensable — un libelle pose SUR sa boite la recouvre par
        // construction, et sans elle V4 crierait sur chaque boite de chaque schema. Elle devient
        // donc une PAIRE DECLAREE : data-overlap-ok="<id de l element recouvert>", plusieurs ids
        // separes par des espaces. Un recouvrement avec un AUTRE element que ceux declares
        // redevient un constat.
        //
        // La forme NUE (attribut sans valeur) continue d exempter en bloc : 1 716 occurrences
        // mesurees le 16/09 dans dix pages de deux depots du parc, la casser rendrait tout le
        // parc rouge d un coup. Elle n est plus silencieuse pour autant — elle est recensee et
        // publiee, famille `overlap_en_bloc`, avec son geste de migration.
        const _paires = (el) => {
          const v = el.getAttribute('data-overlap-ok');
          return v === null ? null : v.trim().split(/\s+/).filter(Boolean);
        };
        const pa = _paires(a.el), pb = _paires(b.el);
        if ((pa !== null && pa.length === 0) || (pb !== null && pb.length === 0)) continue;
        if (pa !== null || pb !== null) {
          const declare = (pa || []).includes(b.el.id) || (pb || []).includes(a.el.id);
          if (declare) continue;
          // Paire NON declaree : le recouvrement est juge, comme s il n y avait pas d exemption.
        }
        // TF-0444 (21/08) : <colgroup> et <col> sont des elements de DECLARATION, pas de mise
        // en page. Leur boite englobe par construction celle du tableau — donc tout tableau
        // portant un colgroup produisait deux faux positifs BLOQUANTS (« colgroup x thead »,
        // « colgroup x tbody »). Mesure : 50 defauts V4 sur un livrable par ailleurs sain,
        // a 1920 px comme a 1280 px. Consequence : la SEULE construction que HTML prevoit pour
        // declarer des largeurs de colonnes etait interdite par l'oracle, et le run s'en
        // detournait en portant les largeurs sur les <th> — un contournement a refaire a
        // chaque fois. Meme nature d'exclusion que position: fixed ci-dessous.
        const declaratif = (el) => ['colgroup', 'col'].includes(el.tagName.toLowerCase());
        if (declaratif(a.el) || declaratif(b.el)) continue;
        const sa = getComputedStyle(a.el), sb = getComputedStyle(b.el);
        if (sa.position === 'absolute' || sb.position === 'absolute' ||
            sa.position === 'fixed' || sb.position === 'fixed') continue;  // superpositions par construction
        // TF-1061 (11/09) — UNE BARRE QUI SURVOLE N'EST PAS UN CHEVAUCHEMENT. header.doc.colle du
        // boilerplate (sticky, z-index 20, fond opaque) rendait un bloquant V4 sur quatre etats
        // sur cinq de la matrice : recouvrir ce qu'il survole est sa fonction. Les TROIS
        // conditions ensemble : `sticky`, z-index au-dessus de l'autre, fond opaque. Une barre
        // transparente ou sous l'autre reste jugee (fixture v4-sticky-transparent.html).
        const zIndex = (s) => { const z = parseInt(s.zIndex, 10); return isNaN(z) ? 0 : z; };
        const opaque = (s) => {
          const m = (s.backgroundColor || '').match(/rgba?\(([^)]*)\)/);
          if (!m) return false;
          const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
          return p.length < 4 || p[3] >= 1;
        };
        const survole = (s, t) => s.position === 'sticky' && zIndex(s) > zIndex(t) && opaque(s);
        if (survole(sa, sb) || survole(sb, sa)) continue;
        // Un element INLINE reparti sur plusieurs lignes a une boite englobante qui
        // couvre toute la largeur du bloc : elle recouvre mecaniquement ses voisins
        // de la premiere ligne, sans qu'aucun pixel ne se superpose reellement. Trois
        // faux positifs de cette nature ont deja fait deformer une mise en page.
        // getClientRects() rend une boite PAR LIGNE : on mesure celles-la.
        const boites = (el, s, r) => (s.display.startsWith('inline') &&
                                      el.getClientRects().length > 1)
                                     ? Array.from(el.getClientRects()) : [r];
        const ba = boites(a.el, sa, a.r), bb = boites(b.el, sb, b.r);
        let ix = 0, iy = 0, inter = 0;
        for (const ra of ba) for (const rb of bb) {
          const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (x > 1 && y > 1 && x * y > inter) { inter = x * y; ix = x; iy = y; }
        }
        // DEUX INLINE FRERES DE LIGNES CONSECUTIVES NE SE CHEVAUCHENT PAS (TF-0559, 24/08).
        // La boite d'un element inline vaut la HAUTEUR D'EM de la police, pas l'interligne :
        // deux inline sur des lignes voisines se recouvrent donc des que line-height est
        // inferieur a cette hauteur, SANS QU'AUCUN PIXEL PEINT NE SE SUPERPOSE. La parade
        // existante ne couvrait que l'inline reparti sur plusieurs lignes (une boite par
        // ligne) ; deux FRERES restaient juges sur leur boite d'em.
        //
        // Mesure du 19/08 sur 1 246 surlignages d'un livrable reel : a interligne 1,22 le
        // recouvrement vaut 5 px et rend un BLOQUANT a 390 px ; a 1,3 il vaut encore 3 px ;
        // a 1,45 il disparait. Le seuil n'est donc pas arbitraire — c'est exactement l'ecart
        // entre hauteur d'em et interligne, et on l'ignore quand le recouvrement tient dedans.
        //
        // Meme nature d'exclusion que colgroup/col et que le groupe SVG titre : une boite qui
        // ne peint rien n'est pas une collision. Ce qui reste juge : un vrai recouvrement
        // horizontal, et tout chevauchement entre elements de NIVEAU BLOC.
        if (inter > 0 && a.el.parentElement && a.el.parentElement === b.el.parentElement
            && sa.display.startsWith('inline') && sb.display.startsWith('inline')) {
          const marge = (el, s) => {
            const em = parseFloat(s.fontSize) || 0;
            let lh = parseFloat(s.lineHeight);
            if (!isFinite(lh) || lh <= 0) lh = em * 1.2;
            // La boite d'em depasse l'interligne de cette difference : au-dela, c'est un vrai
            // chevauchement ; en dessous, c'est de la geometrie de police.
            return Math.max(0, em * 1.15 - lh);
          };
          const toleree = Math.max(marge(a.el, sa), marge(b.el, sb)) + 1;
          if (iy <= toleree) continue;
        }
        if (inter > 0) {
          const aire = (bs) => bs.reduce((t, r) => t + r.width * r.height, 0);
          const smaller = Math.min(aire(ba), aire(bb));
          if (smaller > 0 && inter / smaller > __OVERLAP_MIN_RATIO__) {
            issues.v4_overlap.push({ what: `${label(a.el)} × ${label(b.el)}`, detail:
              `intersection ${Math.round(ix)}×${Math.round(iy)}px (${Math.round(100 * inter / smaller)} % du plus petit)` });
          }
        }
      }
    }
    // V3 alignement + V7 espacement : uniquement les séries homogènes (≥ 3 frères de même tag)
    const byTag = {};
    for (const k of kids) (byTag[k.el.tagName] ||= []).push(k);
    for (const tag of Object.keys(byTag)) {
      const serie = byTag[tag];
      if (serie.length < 3) continue;
      const lefts = serie.map((k) => k.r.left), tops = serie.map((k) => k.r.top);
      // V3 mesure le MEILLEUR alignement plausible (bord, centre, bord opposé) — même
      // leçon que V7 (TF-0059/TF-0066) : sur une rangée d'éléments de tailles variables,
      // le seul bord haut (ou gauche) diverge mécaniquement alors que la rangée est
      // alignée par le centre ou la base. Juger le pire axe fabriquait des faux positifs.
      const etendue = (vals) => Math.max(...vals) - Math.min(...vals);
      const vSpread = Math.min(etendue(tops),
        etendue(serie.map((k) => k.r.bottom)),
        etendue(serie.map((k) => k.r.top + k.r.height / 2)));
      const hSpread = Math.min(etendue(lefts),
        etendue(serie.map((k) => k.r.right)),
        etendue(serie.map((k) => k.r.left + k.r.width / 2)));
      const sameRow = vSpread <= __ALIGN_TOL__;
      const sameCol = hSpread <= __ALIGN_TOL__;
      // Une « presque-rangée » suppose des membres LATÉRALEMENT SÉQUENTIELS : deux membres
      // qui se recouvrent sur l'axe de la rangée (titre au-dessus de son sous-titre, badge
      // + pile de lignes) forment un COMPOSITE assumé, pas une rangée ratée. Même garde en
      // colonne. Et un groupe déjà aligné sur un axe n'est pas un presque-aligné de l'autre.
      const seChevauchent = (horizontal) => {
        const tri = serie.slice().sort((a, b) => horizontal ? a.r.left - b.r.left : a.r.top - b.r.top);
        for (let i = 1; i < tri.length; i++) {
          const p = tri[i - 1].r, c = tri[i].r;
          const rec = horizontal
            ? Math.min(p.right, c.right) - Math.max(p.left, c.left)
            : Math.min(p.bottom, c.bottom) - Math.max(p.top, c.top);
          const petit = horizontal ? Math.min(p.width, c.width) : Math.min(p.height, c.height);
          if (rec > 0.5 * petit) return true;
        }
        return false;
      };
      const nearlyRow = !sameRow && !sameCol && vSpread <= 12 && !seChevauchent(true);
      const nearlyCol = !sameCol && !sameRow && hSpread <= 12 && !seChevauchent(false);
      if (nearlyRow) issues.v3_align.push({ what: `${serie.length}×${tag.toLowerCase()} dans ${label(parent)}`,
        detail: `rangée presque alignée : ${Math.round(vSpread)}px au meilleur axe (haut/centre/base)` });
      if (nearlyCol) issues.v3_align.push({ what: `${serie.length}×${tag.toLowerCase()} dans ${label(parent)}`,
        detail: `colonne presque alignée : ${Math.round(hSpread)}px au meilleur axe (gauche/centre/droite)` });
      // V7 mesure l'ESPACE ENTRE LES BOITES, jamais le pas d'un bord gauche (ou d'un
      // haut) au suivant. Avec le pas, une colonne de <p> de longueurs differentes
      // affiche mecaniquement des ecarts differents : la variation vient de la hauteur
      // du texte, pas du rythme. Ce sont ces faux positifs qui ont produit 288
      // avertissements sur un document dense et noye le signal V1/V4. L'espace entre
      // boites, lui, vaut la marge reellement appliquee : constant en flux de prose
      // regulier, variable des qu'un element rompt l'echelle d'espacement.
      const horiz = sameRow || nearlyRow;
      const vert = !horiz && (sameCol || nearlyCol);
      if (horiz || vert) {
        const tri = serie.slice().sort((a, b) => horiz ? a.r.left - b.r.left : a.r.top - b.r.top);
        const gaps = [];
        for (let i = 1; i < tri.length; i++) {
          gaps.push(horiz ? tri[i].r.left - tri[i - 1].r.right
                          : tri[i].r.top - tri[i - 1].r.bottom);
        }
        if (gaps.length >= 2 && Math.max(...gaps) - Math.min(...gaps) > __ALIGN_TOL__ * 2 &&
            Math.max(...gaps) - Math.min(...gaps) < 40) {
          issues.v7_spacing.push({ what: `${serie.length}×${tag.toLowerCase()} dans ${label(parent)}`,
            detail: `espaces de ${gaps.map((g) => Math.round(g)).join(' / ')}px` });
        }
      }
    }
  }
  // ---- L2 (rendu) : le texte occupe-t-il la place qu'on lui donne ? ------
  // Le controle statique de L2 lit le CSS du conteneur. Il ne voit pas le cas le
  // plus courant : le conteneur occupe bien la largeur, et c'est le PARAGRAPHE
  // qui est bride par un `max-width` en `ch`. Resultat en 1440 px : une colonne
  // de texte a 50 % et une marge droite vide de la meme taille. Passe au vert
  // pendant deux iterations, releve a l'oeil par l'utilisateur.
  //
  // Mesure exacte plutot qu'heuristique : on retire `max-width` le temps d'une
  // mesure et on compare. Si l'element s'elargit fortement, c'est bien une
  // bride qui laissait du vide -- pas une colonne legitimement etroite (une
  // colonne de grille ne bouge pas quand on retire son max-width).
  // ---- L2-filet (TF-0500, 22/08/2026) : un texte ecrase en colonne d'un mot -----------------
  // L2-largeur ne pouvait STRUCTURELLEMENT pas voir ce defaut, pour trois raisons dont chacune
  // suffisait : sa collecte ignorait `caption` ; la ligne `closest('table')` l'aurait ecartee de
  // toute facon, une legende etant toujours dans un tableau ; et son seuil de 1100 px la rendait
  // muette sous cette largeur, or le defaut n'existe QUE sous 640 px — la ou les mises en page
  // basculent de table a block. Le seuil de 1100 px n'est PAS supprime : il protege d'un faux
  // positif precis (une bride de lecture est sans effet visible sur ecran etroit).
  //
  // Cette regle ne mesure pas une mesure de lecture mais un RAPPORT D'ASPECT ANORMAL : un bloc
  // dont la largeur tombe sous 25 % de celle de son conteneur ALORS QUE son contenu passe a la
  // ligne a presque chaque mot est un defaut a toute largeur. Les deux conditions sont exigees
  // ensemble : une colonne etroite qui respire n'est pas un defaut, un texte long dans une boite
  // large non plus.
  {
    const vusF = new Set();
    for (const el of document.body.querySelectorAll('p, dd, li, blockquote, caption, .va, .prose')) {
      if (!visible(el) || vusF.has(el)) continue;
      vusF.add(el);
      const txt = (el.textContent || '').trim();
      const mots = txt.split(/\s+/).filter(Boolean).length;
      if (mots < 6) continue;                       // trop court pour distinguer un filet d'un titre
      if (el.closest('nav')) continue;
      // `caption` est volontairement admise : l'exclusion `closest('table')` de L2-largeur vise
      // les CELLULES, pas la legende, et c'est elle qui portait le defaut mesure.
      if (el.closest('table') && el.tagName !== 'CAPTION') continue;
      const par = el.parentElement;
      if (!par) continue;
      const w = el.getBoundingClientRect().width;
      const wp = par.getBoundingClientRect().width;
      if (w <= 0 || wp <= 0) continue;
      if (w / wp >= 0.25) continue;                 // il occupe sa place : rien a dire
      const cs2 = getComputedStyle(el);
      let lh = parseFloat(cs2.lineHeight);
      if (!isFinite(lh) || lh <= 0) lh = parseFloat(cs2.fontSize) * 1.2;
      const lignes = Math.round(el.getBoundingClientRect().height / lh);
      if (lignes < mots * 0.8) continue;            // il passe a la ligne normalement
      issues.l2_filet.push({ what: label(el), detail:
        `${Math.round(w)}px de large pour ${Math.round(wp)}px de conteneur (${Math.round(100 * w / wp)}%), `
        + `${lignes} ligne(s) pour ${mots} mot(s) — texte ecrase en filet` });
    }
  }

  if (window.innerWidth >= __L2_MIN_VIEWPORT__) {
    const vus = new Set();
    for (const el of document.body.querySelectorAll('p, dd, li, blockquote, .va, .prose')) {
      if (!visible(el)) continue;
      const txt = (el.textContent || '').trim();
      if (txt.length < __L2_MIN_CHARS__) continue;
      if (el.closest('table') || el.closest('nav')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline') continue;
      // TF-0421 (lot Produit-05 20260820a) : la bride se mesure QUELLE QUE SOIT la propriete.
      // `width: min(75ch, 100%)` passait (maxWidth === 'none') et laissait 60 % de la fenetre
      // vide a 1 800 px — livre vert, refuse par le client. On retire max-width ET width le temps
      // d'une mesure : l'element dit alors la place que son conteneur lui offre. Une colonne de
      // grille ne bouge pas ; un paragraphe bride, si. La mesure de lecture se pose sur le
      // CONTENEUR (.chap.lire), jamais sur le paragraphe (lisibilite.md L2).
      const w1 = el.getBoundingClientRect().width;
      const avantMax = el.style.maxWidth, avantW = el.style.width;
      el.style.maxWidth = 'none'; el.style.width = 'auto';
      const w2 = el.getBoundingClientRect().width;
      el.style.maxWidth = avantMax; el.style.width = avantW;
      if (w2 <= 0) continue;
      const ratio = w1 / w2;
      if (ratio < __L2_MIN_RATIO__) {
        const bride = cs.maxWidth !== 'none' ? `max-width:${cs.maxWidth}` : `width:${cs.width} (conteneur ${Math.round(w2)}px)`;
        const cle = el.tagName + '|' + (el.className || '') + '|' + bride;
        if (vus.has(cle)) continue;
        vus.add(cle);
        issues.l2_width.push({ what: label(el), detail:
          `largeur ${Math.round(w1)}px pour ${Math.round(w2)}px disponibles ` +
          `(ratio ${ratio.toFixed(2)}, seuil __L2_MIN_RATIO__) — bride par ${bride} ; ` +
          `poser la mesure de lecture sur le CONTENEUR (.chap.lire), pas sur le texte, ET la ` +
          `declarer par data-mesure-lecture sur ce conteneur des lors qu'il a des freres plus ` +
          `larges (listes de reperes, tableaux) — sans quoi la correction cree une rupture ` +
          `d'alignement entre freres, mesuree deux fois le 24/08` });
      }
    }
  }

  // ---- L2 (rendu, suite) : le CONTENEUR de lecture calé à gauche ---------
  // TF-0440. L2 ci-dessus mesure le paragraphe contre son conteneur — donc déplacer la bride
  // d'un cran la satisfait sans rien changer pour le lecteur. Mesuré le 21/08 sur la même
  // page : bride sur `p` → BLOQUANT (ratio 0,57) ; MÊME bride portée par un div parent
  // (`width: min(100%, 82ch)`, `p { max-width: none }`) → PASS aux trois breakpoints, alors
  // que le texte occupe TOUJOURS 57 % de la fenêtre. La règle devenait satisfaisable sans être
  // tenue, et un run de bonne foi la satisfaisait en créant la gouttière qu'elle interdisait.
  //
  // Le discriminant n'est pas la largeur — une colonne de lecture étroite est LÉGITIME, c'est
  // même la doctrine (.chap.lire). C'est l'ASYMÉTRIE : une colonne CENTRÉE est une mesure de
  // lecture, le blanc se répartit des deux côtés et l'œil revient au début de ligne sans
  // effort. Une colonne calée à GAUCHE laisse tout le blanc à droite — c'est exactement ce que
  // le lecteur humain a refusé le 21/08 (« la moitié de la page vide à droite »).
  //
  // Trois conditions cumulatives, pour ne rien condamner à tort :
  //   1. le conteneur occupe moins de __L2C_MIN_RATIO__ de la largeur que son parent lui offre ;
  //   2. sa marge droite dépasse le double de sa marge gauche (donc : pas centré) ;
  //   3. AUCUN frère ne porte de contenu à sa droite (sinon ce n'est pas du vide, c'est une
  //      mise en page à deux pistes — déjà couverte par l2_gouttiere).
  // Échappatoire déclarative : `data-colonne-ok` sur le conteneur, pour une colonne étroite
  // voulue et assumée. Déclarée, jamais devinée.
  if (window.innerWidth >= __L2_MIN_VIEWPORT__) {
    const vusC = new Set();
    for (const el of document.body.querySelectorAll('p, li, blockquote, .va, .prose')) {
      if (!visible(el)) continue;
      if ((el.textContent || '').trim().length < __L2_MIN_CHARS__) continue;
      if (el.closest('table') || el.closest('nav')) continue;
      // Le conteneur BRIDEUR : le premier ancêtre notablement plus étroit que son propre parent.
      let boite = null;
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const p = n.parentElement;
        if (!p) break;
        const rn = n.getBoundingClientRect(), rp = p.getBoundingClientRect();
        if (rp.width > 0 && rn.width / rp.width < __L2C_MIN_RATIO__) { boite = { n, rn, rp }; break; }
      }
      if (!boite) continue;
      if (boite.n.closest('[data-colonne-ok]')) continue;
      const gauche = boite.rn.left - boite.rp.left;
      const droite = boite.rp.right - boite.rn.right;
      if (droite <= gauche * 2) continue;          // centré, ou décalé vers la droite : légitime
      if (droite < 40) continue;                   // vide négligeable
      // Un frère occupe-t-il la place à droite ? Alors ce n'est pas une gouttière.
      const voisin = [...(boite.n.parentElement ? boite.n.parentElement.children : [])].some((f) => {
        if (f === boite.n || !visible(f)) return false;
        const rf = f.getBoundingClientRect();
        if (!(f.textContent || '').trim() && !f.querySelector('img, svg, canvas')) return false;
        return rf.left >= boite.rn.right - 4 &&
               Math.min(rf.bottom, boite.rn.bottom) - Math.max(rf.top, boite.rn.top) > 8;
      });
      if (voisin) continue;
      const cle = boite.n.tagName + '|' + (boite.n.className || '');
      if (vusC.has(cle)) continue;
      vusC.add(cle);
      issues.l2_conteneur.push({ what: label(boite.n), detail:
        `conteneur de lecture calé à gauche — ${Math.round(boite.rn.width)}px pour ` +
        `${Math.round(boite.rp.width)}px offerts, ${Math.round(droite)}px de vide à droite ` +
        `contre ${Math.round(gauche)}px à gauche, et aucun contenu voisin. Centrer la colonne ` +
        `(.chap.lire) ou lui donner un voisin utile ; si elle est étroite à dessein, le ` +
        `déclarer par data-colonne-ok` });
    }
  }

  // ---- L2 (rendu, suite) : la gouttiere d'etiquettes --------------------
  // Angle mort de la mesure precedente : une grille `etiquette | contenu` ou la
  // colonne d'etiquettes prend 22 % de la largeur. Chaque colonne remplit bien sa
  // case -- le ratio de L2 vaut 1,00 -- et pourtant le lecteur voit un tiers de
  // page vide et un contenu tasse a droite. C'est la GRILLE qu'il faut mesurer,
  // pas le bloc de texte.
  //
  // Garde-fous contre les faux positifs : il faut que la seconde piste porte du
  // texte LONG et la premiere une etiquette COURTE. Deux colonnes de contenu
  // (cartes, baremes) ont deux textes longs et sortent du perimetre ; un vrai
  // tableau de donnees n'est pas une grille CSS et n'y entre jamais.
  if (window.innerWidth >= __L2_MIN_VIEWPORT__) {
    const vusG = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display !== 'grid' && cs.display !== 'inline-grid') continue;
      const pistes = cs.gridTemplateColumns.split(' ').map(parseFloat).filter((x) => !isNaN(x));
      if (pistes.length !== 2) continue;
      const w = el.getBoundingClientRect().width;
      if (!w) continue;
      const enfants = Array.prototype.filter.call(el.children, visible);
      if (enfants.length < 2) continue;
      const t1 = (enfants[0].textContent || '').trim().length;
      const t2 = (enfants[1].textContent || '').trim().length;
      if (t2 < __L2_MIN_CHARS__ || t1 > __L2_ETIQUETTE_MAX__) continue;
      const part = pistes[0] / w;
      if (part <= __L2_COL_MAX__) continue;
      const cle = (el.className || el.tagName) + '|' + cs.gridTemplateColumns;
      if (vusG.has(cle)) continue;
      vusG.add(cle);
      issues.l2_gouttiere.push({ what: label(el), detail:
        `colonne d'etiquettes ${Math.round(pistes[0])}px sur ${Math.round(w)}px ` +
        `(${Math.round(part * 100)} %, seuil ${Math.round(__L2_COL_MAX__ * 100)} %) — ` +
        `etiquette « ${(enfants[0].textContent || '').trim().slice(0, 30)} » ` +
        `contre ${t2} caracteres de contenu` });
    }
  }

  // ---- L2 (rendu, suite) : la gouttiere d'etiquettes en <table> (TF-0694, 27/08) --------
  //
  // LA REGLE DECRIVAIT EXACTEMENT CE DEFAUT, AU SEUIL EXACT, ET RENDAIT PASS DESSUS. Son
  // commentaire disait notre cas au mot pres — « une grille etiquette | contenu ou la colonne
  // d'etiquettes prend 22 % de la largeur » — et son implementation commencait par
  // `if (cs.display !== 'grid') continue;`, en assumant l'exclusion : « un vrai tableau de
  // donnees n'est pas une grille CSS et n'y entre jamais ».
  //
  // OR UNE MISE EN PAGE `intitule | contenu` EN <table> N'EST PAS UN TABLEAU DE DONNEES : c'est
  // la meme intention, exprimee avec l'autre outil. La regle n'a pas echoue, ELLE N'A PAS ETE
  // APPELEE, et rien ne le disait — le pire des verdicts. Mesure du 27/08 sur la fiche fautive
  // (colonne d'intitules a 32 %) : verdict PASS, `l2_gouttiere` 0 constat, comme les huit autres
  // familles. Le defaut a traverse DEUX fiches livrees et TROIS regenerations avant qu'un humain
  // ne l'ouvre. Gaspillage mesure : 12,6 % a 19,4 % de la largeur de page perdus sur 7 tables/8.
  //
  // CE QUI CHANGE, ET CE QUI NE CHANGE PAS. Les garde-fous anti-faux-positifs sont les MEMES
  // (premiere cellule courte, seconde longue) : ils suffisent a ecarter un vrai tableau de
  // donnees, ou les deux colonnes portent des valeurs comparables. Le seuil de 20 % NE BOUGE
  // PAS — le lot en apporte une confirmation independante. Seule la MESURE change : on prend la
  // largeur RENDUE de la premiere colonne, et non une piste de grille declaree, parce qu'un
  // tableau n'en a pas.
  //
  // BORNE DELIBEREE : il faut que la MAJORITE des lignes a deux cellules soient du type
  // `etiquette | contenu`, et au moins deux. Une seule ligne conforme dans un tableau de vingt
  // ne fait pas une mise en page, et juger sur elle rendrait la regle bruyante.
  if (window.innerWidth >= __L2_MIN_VIEWPORT__) {
    const vusT = new Set();
    for (const t of document.querySelectorAll('table')) {
      if (!visible(t)) continue;
      const w = t.getBoundingClientRect().width;
      if (!w) continue;
      const lignes = [...t.rows].filter((r) => r.cells.length === 2 && visible(r));
      if (lignes.length < 2) continue;
      let etiquettes = 0;
      let large = 0;
      let exemple = '';
      let contenu = 0;
      for (const r of lignes) {
        const t1 = (r.cells[0].textContent || '').trim();
        const t2 = (r.cells[1].textContent || '').trim();
        if (t1.length <= __L2_ETIQUETTE_MAX__ && t2.length >= __L2_MIN_CHARS__) {
          etiquettes += 1;
          const l1 = r.cells[0].getBoundingClientRect().width;
          if (l1 > large) { large = l1; exemple = t1; contenu = t2.length; }
        }
      }
      if (etiquettes < 2 || etiquettes * 2 <= lignes.length) continue;
      const part = large / w;
      if (part <= __L2_COL_MAX__) continue;
      const cle = (t.className || t.tagName) + '|' + Math.round(part * 100);
      if (vusT.has(cle)) continue;
      vusT.add(cle);
      issues.l2_gouttiere.push({ what: label(t), detail:
        `mise en page « intitule | contenu » en <table> : colonne d'intitules ` +
        `${Math.round(large)}px sur ${Math.round(w)}px (${Math.round(part * 100)} %, seuil ` +
        `${Math.round(__L2_COL_MAX__ * 100)} %) sur ${etiquettes} ligne(s) de ${lignes.length} — ` +
        `intitule « ${exemple.slice(0, 30)} » contre ${contenu} caracteres de contenu. Un <table> ` +
        `n'est pas exempte : c'est la meme intention avec l'autre outil, et le lecteur voit le ` +
        `meme tiers de page vide` });
    }
  }

  // ---- L2 (rendu, suite) : la rupture d'alignement ENTRE FRERES (TF-0491) --------------
  // Les trois mesures L2 ci-dessus comparent un bloc a ce que son CONTENEUR lui offre. Elles
  // sont aveugles au cas le plus visible pour un lecteur : deux blocs EMPILES l'un sur l'autre,
  // qui ne commencent pas au meme bord ou ne finissent pas au meme bord. Le client l'a signale
  // trois fois en quatre versions, sous trois formulations differentes, sans que la cause soit
  // vue — parce que chaque bloc, pris seul, remplissait bien sa boite.
  //
  // Ce n'est PAS un bloquant, et c'est délibéré : une mesure de lecture etroite au-dessus d'un
  // tableau large est un choix typographique defendable. Mais alors il se DECLARE
  // (`data-mesure-lecture`) au lieu d'etre subi. Un avertissement qui nomme LES DEUX blocs
  // laisse l'auteur trancher ; un bloquant l'obligerait a mentir pour passer.
  //
  // Trois gardes, pour ne rien condamner a tort :
  //   1. les deux blocs sont EMPILES (aucun recouvrement vertical) — deux colonnes cote a cote
  //      ont des largeurs differentes par construction, c'est une mise en page, pas un defaut ;
  //   2. le frere de reference est LARGE (>= __L2F_MIN_LARGEUR__ px) et porte du contenu ;
  //   3. le bloc etroit porte du TEXTE LONG (>= __L2_MIN_CHARS__) : un titre, une legende ou un
  //      bouton sont courts par nature et n'ont jamais a s'aligner sur un tableau.
  if (window.innerWidth >= __L2_MIN_VIEWPORT__) {
    const vusF = new Set();
    const contenu = (el) => (el.textContent || '').trim().length > 0
      || !!el.querySelector('img, svg, canvas, table, input, button');
    for (const parent of document.body.querySelectorAll('*')) {
      // On ne juge que les FLUX VERTICAUX. Dans une grille ou une boite flexible, la largeur
      // d'un enfant est decidee par sa PISTE, pas par lui : comparer deux enfants de pistes
      // differentes n'a aucun sens. Mesure qui a impose la garde : six constats sur la page du
      // registre du pilot, ou une cellule « Demandeur » de 250 px occupe une colonne de grille
      // pendant que la cellule « Impact » s'etend sur les deux (1 301 px). La page est SAINE ;
      // c'est la mesure qui etait fausse. La grille reste jugeable comme BLOC, en tant que
      // frere d'un autre bloc — c'est le cas de la fixture rouge, ou les cartes sont la
      // reference.
      const dParent = getComputedStyle(parent).display;
      if (!(dParent === 'block' || dParent === 'flow-root' || dParent === 'list-item')) continue;
      const enfants = [...parent.children].filter((c) => visible(c) && contenu(c));
      if (enfants.length < 2) continue;
      const boites = enfants.map((c) => ({ c, r: c.getBoundingClientRect() }));
      for (const petit of boites) {
        const texte = (petit.c.textContent || '').trim();
        if (texte.length < __L2_MIN_CHARS__) continue;
        if (petit.c.closest('table, nav, thead, tbody')) continue;
        if (petit.c.closest('[data-mesure-lecture]')) continue;   // ecart DECLARE : on se tait
        // Un bloc qui PARTAGE SA LIGNE avec un frere fait partie d'une rangee : sa largeur est
        // celle de sa piste, et la comparer a un bloc d'une AUTRE rangee est un faux positif.
        // Mesure : six constats de ce type sur la page du registre du pilot (une cellule
        // « Demandeur » de 250 px face a un bloc « Impact » de 1 301 px, ratio 0,19) — la page
        // est saine, c'est une grille de metadonnees. Meme garde que l2_conteneur avec son
        // « aucun frere a droite », et c'est la seule qui distingue une rangee d'un empilement.
        const enLigne = boites.some((a) => a.c !== petit.c
          && Math.min(a.r.bottom, petit.r.bottom) - Math.max(a.r.top, petit.r.top) > 8);
        if (enLigne) continue;
        // Le frere de reference : le plus large, empile (aucun recouvrement vertical).
        let ref = null;
        for (const autre of boites) {
          if (autre.c === petit.c) continue;
          if (autre.r.width < __L2F_MIN_LARGEUR__) continue;
          // Un TITRE ou un filet occupe toute la largeur par nature : le prendre pour reference
          // rendrait le constat vrai geometriquement et faux pour le lecteur, qui ne compare pas
          // sa prose a un titre. La reference doit etre un BLOC DE CONTENU — plusieurs lignes de
          // haut, pas une ligne unique. Trouve en jouant la fixture : le premier jet nommait h1.
          if (autre.c.matches('h1, h2, h3, h4, h5, h6, hr, header, footer, figcaption')) continue;
          if (autre.r.height < 48) continue;
          const empile = autre.r.top >= petit.r.bottom - 4 || autre.r.bottom <= petit.r.top + 4;
          if (!empile) continue;
          if (!ref || autre.r.width > ref.r.width) ref = autre;
        }
        if (!ref) continue;
        const ratio = petit.r.width / ref.r.width;
        if (ratio >= __L2F_MIN_RATIO__) continue;
        const cle = label(petit.c) + '|' + label(ref.c);
        if (vusF.has(cle)) continue;
        vusF.add(cle);
        issues.l2_freres.push({ what: `${label(petit.c)} sous/sur ${label(ref.c)}`, detail:
          `rupture d'alignement entre freres empiles : ${Math.round(petit.r.width)}px de texte ` +
          `contre ${Math.round(ref.r.width)}px pour le bloc voisin (ratio ${ratio.toFixed(2)}, ` +
          `seuil __L2F_MIN_RATIO__) — le lecteur voit un bord droit qui ne tombe pas au meme ` +
          `endroit. Aligner les deux blocs, ou DECLARER la mesure de lecture par ` +
          `data-mesure-lecture sur le bloc etroit`});
      }
    }
  }

  // ---- CONTENU ROGNE (TF-0551, 24/08) : ce qu'un oracle VISUEL ne peut pas voir --------
  //
  // LE FAIT, ET C'EST LE DEFAUT LE PLUS GRAVE QUE CE SOCLE AIT LAISSE PASSER. Une fiche livree,
  // declaree conforme la veille par les deux controles, avait perdu DEUX SECTIONS ENTIERES et son
  // pied de page. Le gabarit est une feuille A4 a hauteur FIGEE — .page{height:297mm;
  // overflow:hidden} — et le contenu ajoute l'a depassee. Mesure : boite 1123px, contenu 1441px,
  // 318px sous la ligne de flottaison, 41 elements feuilles porteurs de texte devenus invisibles.
  // AUCUN SIGNAL, ni a l'ecran ni a l'impression. Le defaut n'a ete vu que parce qu'on a compare
  // les mots du PDF a ceux de la page : 1132 contre 1313.
  //
  // LA CAUSE EST STRUCTURELLE, et c'est pourquoi cette regle ne pouvait pas exister avant d'etre
  // payee : un controle qui juge l'apparence de ce qui reste VISIBLE ne peut rien dire de ce qui a
  // ete ROGNE. `overflow:hidden` EST le mecanisme qui rend un defaut invisible a un oracle visuel.
  // On ne regarde donc plus l'apparence : on compare la taille du CONTENU a celle de la BOITE.
  //
  // PORTEE VOLONTAIREMENT ETROITE — `hidden` et `clip` seulement. `auto` et `scroll` laissent au
  // lecteur la possibilite de defiler a l'ecran ; les juger ici accuserait des zones de defilement
  // legitimes, dont le socle prescrit lui-meme l'usage pour les tableaux larges.
  {
    const MARGE = 2;                       // 2px : le bruit d'arrondi d'un rendu, pas une perte
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      // TF-0847 (05/09) — UN CHAMP DE SAISIE DEFILE NATIVEMENT. La feuille du navigateur lui pose
      // un rognage, donc une adresse plus longue que le champ entrait ici : « zero element de
      // texte invisible » et BLOQUANT quand meme, aux quatre largeurs, pendant que la zone de
      // texte voisine passait. Le produit avait troque son champ contre une zone de texte.
      if (el.matches('input, select')) continue;
      const cs = getComputedStyle(el);
      const oy = cs.overflowY, ox = cs.overflowX;
      const masqueY = oy === 'hidden' || oy === 'clip';
      const masqueX = ox === 'hidden' || ox === 'clip';
      if (!masqueY && !masqueX) continue;
      const dy = masqueY ? el.scrollHeight - el.clientHeight : 0;
      const dx = masqueX ? el.scrollWidth - el.clientWidth : 0;
      if (dy <= MARGE && dx <= MARGE) continue;
      // TRONCATURE ASSUMEE ET VISIBLE : une seule ligne coupee avec des points de suspension est
      // un choix que le lecteur VOIT. Ce n'est pas du contenu perdu en silence, et l'accuser ferait
      // condamner un usage que la charte prescrit pour les libelles longs.
      if (cs.textOverflow === 'ellipsis' && dy <= MARGE) continue;
      if (el.hasAttribute('data-rognage-assume')) continue;
      // CE QUI EST PERDU, nomme comme L2 le fait pour les largeurs : les elements FEUILLES
      // porteurs de texte dont le haut tombe sous la ligne de flottaison de la boite.
      const boite = el.getBoundingClientRect();
      const perdus = [];
      for (const f of el.querySelectorAll('*')) {
        if (f.children.length) continue;                       // pas une feuille
        const t = (f.textContent || '').trim();
        if (!t) continue;
        const r = f.getBoundingClientRect();
        if (r.top - boite.top >= el.clientHeight - MARGE
            || r.left - boite.left >= el.clientWidth - MARGE) perdus.push(f);
      }
      const cites = perdus.slice(0, 3).map((f) => label(f)).join(' · ');
      issues.contenu_rogne.push({ what: label(el), detail:
        (dy > MARGE ? `contenu ${el.scrollHeight}px pour une boite de ${el.clientHeight}px ` +
                      `(${dy}px sous la ligne de flottaison)` : '') +
        (dy > MARGE && dx > MARGE ? ' et ' : '') +
        (dx > MARGE ? `contenu ${el.scrollWidth}px de large pour ${el.clientWidth}px` : '') +
        ` — overflow:${masqueY ? oy : ox} MASQUE ce debordement : ${perdus.length} element(s) de ` +
        `texte invisible(s)` + (cites ? `, dont ${cites}` : '') + '. Aucun signal n\'est donne au ' +
        `lecteur, ni a l'ecran ni a l'impression. Une hauteur de page est un PLANCHER ` +
        `(min-height), jamais un plafond : remplacer height par min-height, ou declarer la ` +
        `troncature par data-rognage-assume si elle est voulue et visible` });
    }
  }

  // ---- CONTROLES D'UNE MEME RANGEE, alignes a 2 px pres (TF-0773, 02/09) ---------------
  //
  // LE FAIT : sur une capture d'un livrable servi, quatre champs d'hypotheses d'une meme rangee
  // de grille tombaient sur DEUX hauteurs. Retour humain, mot pour mot : « textbox pas
  // alignes ». Aucune famille ne mesurait l'alignement des CONTROLES — V3 juge des series de
  // blocs, L2 des largeurs de texte, et une rangee de formulaire n'est ni l'un ni l'autre.
  //
  // LA CAUSE, et c'est elle qu'il faut nommer dans le message : l'etiquette de l'un des champs
  // portait son etiquette de STATUT dans le libelle, donc passait sur deux lignes, donc
  // poussait son champ vers le bas. La regle de socle qui en decoule : une etiquette de statut
  // se pose SOUS le champ, jamais dans le libelle (lisibilite.md L26 bis).
  //
  // GARDES : on ne juge qu'une rangee reelle (deux enfants d'une meme grille ou boite flexible
  // dont les boites se recouvrent verticalement), et l'ecart declare se tait
  // (`data-alignement-ok`).
  {
    const premierControle = (el) => el.matches('input, select, textarea, button')
      ? el : el.querySelector('input, select, textarea, button');
    for (const boite of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(boite);
      if (cs.display !== 'grid' && cs.display !== 'flex') continue;
      if (boite.closest('table, nav, .tf-panel')) continue;
      const enfants = [...boite.children]
        .filter((c) => visible(c) && premierControle(c) && visible(premierControle(c)));
      if (enfants.length < 2) continue;
      const boites = enfants.map((c) => ({ c, r: c.getBoundingClientRect(),
                                           ctrl: premierControle(c).getBoundingClientRect() }));
      const rangees = [];
      for (const b of boites) {
        const rang = rangees.find((g) => g.some((x) =>
          Math.min(x.r.bottom, b.r.bottom) - Math.max(x.r.top, b.r.top) > 4));
        if (rang) rang.push(b); else rangees.push([b]);
      }
      for (const rang of rangees) {
        if (rang.length < 2) continue;
        if (rang.some((x) => x.c.closest('[data-alignement-ok]'))) continue;
        const hauts = rang.map((x) => x.ctrl.top);
        const ecart = Math.max(...hauts) - Math.min(...hauts);
        if (ecart <= __ALIGN_TOL__) continue;
        const bas = rang.find((x) => x.ctrl.top === Math.max(...hauts));
        issues.controles_desalignes.push({ what: label(boite), detail:
          `${rang.length} controles d'une meme rangee sur ${new Set(hauts.map(Math.round)).size} ` +
          `hauteurs — ecart de ${Math.round(ecart)}px (tolerance __ALIGN_TOL__px), le plus bas ` +
          `etant ${label(bas.c)}. Cause la plus frequente : une etiquette qui passe sur deux ` +
          `lignes parce qu'elle porte son statut dans son libelle — l'etiquette de statut se ` +
          `pose SOUS le champ. Ecart voulu : data-alignement-ok` });
      }
    }
  }

  // ---- ROGNAGE d'un tableau DANS un conteneur defilant (TF-0771, 02/09) -----------------
  //
  // LE FAIT : une console de donnees livree a 1 440 px rendait V1 a 1 301 px pour 1 136
  // disponibles, V3 a 1 256, V7 a 1 376. render_page AVAIT releve le debordement ; la revue l'a
  // classe « acceptable » parce que le conteneur defilait — sans mesurer ce que le lecteur
  // perdait. Retour humain : « les pages doivent profiter de toute la largeur de l'ecran ».
  //
  // CE QUI CHANGE : un conteneur `overflow-x:auto` rend un tableau CONSULTABLE, il ne le rend
  // pas LISIBLE, et sur un grand ecran il n'a aucune excuse — la place est la. Au-dela de
  // __ROGNAGE_MIN_VIEWPORT__ px de fenetre, le rognage d'un TABLEAU dans un conteneur defilant
  // est BLOQUANT. Sous ce seuil, le defilement reste la parade prescrite (composants.md §6).
  if (window.innerWidth >= __ROGNAGE_MIN_VIEWPORT__) {
    for (const boite of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(boite);
      if (!(cs.overflowX === 'auto' || cs.overflowX === 'scroll')) continue;
      const t = boite.querySelector('table');
      if (!t || !visible(t)) continue;
      const perdu = boite.scrollWidth - boite.clientWidth;
      if (perdu <= 1) continue;
      if (boite.closest('[data-rognage-assume]')) {
        issues.unmeasured.push({ what: label(boite), detail:
          `rognage de tableau DECLARE assume (data-rognage-assume) : ${perdu}px hors champ a ` +
          `${window.innerWidth}px de fenetre — non juge, mais compte` });
        continue;
      }
      issues.rognage_donnees.push({ what: label(boite), detail:
        `tableau rogne dans un conteneur defilant : ${boite.scrollWidth}px de contenu pour ` +
        `${boite.clientWidth}px disponibles (${perdu}px hors champ) a ${window.innerWidth}px de ` +
        `fenetre. Un conteneur qui defile rend le tableau CONSULTABLE, pas LISIBLE : au-dela de ` +
        `__ROGNAGE_MIN_VIEWPORT__px la place existe, la page doit la prendre (page de donnees = ` +
        `pleine largeur adaptative). Replier en cartes, reduire les colonnes, ou assumer par ` +
        `data-rognage-assume — un ecart assume se declare, il ne se classe pas « acceptable » ` +
        `en revue` });
    }
  }

  // ---- PROSE ETROITE sur une page de DONNEES (TF-0778, 02/09) --------------------------
  //
  // LE FAIT : `.chapo { max-width: 90ch }` dans une console pleine largeur — « repete des
  // dizaines de fois sans etre definitivement corrige », dit le retour humain. L2 ne l'a jamais
  // vu parce qu'elle ne regarde que `p, dd, li, blockquote, .va, .prose` : un `.chapo` en
  // `<div>` n'est aucun des six. La regle de socle tranche les deux doctrines de largeur : page
  // de donnees = pleine largeur, la colonne de lecture ne vaut que pour la prose — et un bloc
  // de texte y occupe la largeur de son conteneur, ou deux lignes.
  const pageDonnees = !!document.querySelector(
    '[data-page="donnees"], [data-page="données"], [data-page="data"], [data-page="console"]');
  if (pageDonnees && window.innerWidth >= __L2_MIN_VIEWPORT__) {
    const vusP = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      if (el.closest('table, nav, .tf-panel, [data-mesure-lecture]')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline' || cs.display === 'none') continue;
      // Le texte PROPRE de l'element : un conteneur qui herite du texte de ses enfants n'est
      // pas un bloc de texte, et le juger accuserait la page entiere pour un seul paragraphe.
      const propre = [...el.childNodes]
        .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (propre.length < __L2_MIN_CHARS__) continue;
      const par = el.parentElement;
      if (!par) continue;
      const w = el.getBoundingClientRect().width, wp = par.getBoundingClientRect().width;
      if (w <= 0 || wp <= 0) continue;
      const ratio = w / wp;
      if (ratio >= __DONNEES_PROSE_MIN__) continue;
      const cle = el.tagName + '|' + (el.className || '');
      if (vusP.has(cle)) continue;
      vusP.add(cle);
      issues.prose_etroite.push({ what: label(el), detail:
        `page de donnees : bloc de texte a ${Math.round(w)}px pour ${Math.round(wp)}px offerts ` +
        `(${Math.round(ratio * 100)} %, plancher ${Math.round(__DONNEES_PROSE_MIN__ * 100)} %) — ` +
        `sur une page de donnees, un bloc de prose prend la largeur de son conteneur, ou deux ` +
        `lignes. La colonne de lecture reste legitime pour un passage de prose ASSUME : le ` +
        `declarer par data-mesure-lecture` });
    }
  }

  // ---- CONTENEUR BRIDE sur une page de DONNEES (TF-0930, 08/09) -----------------------
  //
  // LE FAIT : retour humain « augmente la largeur complete du document » sur une page de
  // mapping a sept colonnes. Le socle bride `.wrap` par `--w: clamp(75vw, 1680px, 92vw)`,
  // soit 1 260 px dans une fenetre de 1 370 et 1 680 dans une fenetre de 1 920 — pendant que
  // I1 et L26 ecrivent « pleine largeur adaptative ». Personne ne le voyait : L26 ne juge une
  // bride que sur un conteneur DE TABLEAU et ne resout pas `var(--w)` ; la prose etroite
  // compare un bloc a SON PARENT, et un bloc qui remplit un conteneur bride rend 100 %.
  // La mesure qui manque est celle du conteneur contre la FENETRE.
  if (pageDonnees && window.innerWidth >= __DONNEES_CONTENEUR_MIN_VIEWPORT__) {
    const vusC = new Set();
    // Le conteneur principal, et lui seul : un `.wrap` imbrique dans un autre conteneur
    // n'est pas ce que le lecteur voit comme la largeur du document.
    const candidats = [...document.querySelectorAll('.wrap, main, [data-page]')].filter((el) =>
      el !== document.body && el !== doc && visible(el)
      && !(el.parentElement && el.parentElement.closest('.wrap, main')));
    for (const el of candidats) {
      const w = el.getBoundingClientRect().width;
      if (w <= 0) continue;
      const ratio = w / window.innerWidth;
      if (ratio >= __DONNEES_CONTENEUR_MIN__) continue;
      const cle = label(el);
      if (vusC.has(cle)) continue;
      vusC.add(cle);
      const cs = getComputedStyle(el);
      issues.conteneur_bride_donnees.push({ what: cle, detail:
        `page de donnees : conteneur a ${Math.round(w)}px pour ${window.innerWidth}px de ` +
        `fenetre (${Math.round(ratio * 100)} %, plancher ` +
        `${Math.round(__DONNEES_CONTENEUR_MIN__ * 100)} %) — max-width calcule ` +
        `${cs.maxWidth}. Une page qui se DECLARE page de donnees est PLEINE LARGEUR ` +
        `adaptative : la place existe, la page doit la prendre. Retirer le plafond sur ce ` +
        `conteneur ; la colonne de lecture reste legitime CHAPITRE par chapitre (.chap.lire)` });
    }
  }

  // ---- TF-1146 : RECENSEMENT DES EXEMPTIONS V4 EN BLOC ---------------------------------
  //
  // Une exemption qui ne se voit pas est un angle mort qui ne se corrige jamais. L invariant
  // que V4 pretend tenir n est pas « deux rectangles se recouvrent » — c est « un libelle
  // appartient a l element qu il annote ». Tant que les deux sont correles, V4 a raison ; le
  // jour ou un libelle change d element sans changer de geometrie, elle est muette. Le
  // recensement rend ce silence LISIBLE, page par page, avec son geste de migration.
  {
    const enBloc = [...document.querySelectorAll('[data-overlap-ok]')]
      .filter((el) => !(el.getAttribute('data-overlap-ok') || '').trim());
    if (enBloc.length) {
      const echantillon = enBloc.slice(0, 3).map(label).join(' · ');
      issues.overlap_en_bloc.push({
        what: `${enBloc.length} element(s) exemptes EN BLOC — ${echantillon}` +
              (enBloc.length > 3 ? ` … et ${enBloc.length - 3} autre(s)` : ''),
        detail:
          `data-overlap-ok sans valeur exempte l ELEMENT, pas la PAIRE : V4 ne juge AUCUN de ` +
          `leurs recouvrements, voulu ou non. Un libelle de fleche tombe dans la boite VOISINE ` +
          `y est invisible — c est exactement le defaut qui a traverse deux livraisons et quatre ` +
          `executions des trois oracles avant d etre vu sur une capture (TF-1146). Geste : ` +
          `declarer la paire, data-overlap-ok="<id de l element recouvert>" (plusieurs ids ` +
          `separes par des espaces). Un recouvrement avec un autre element que ceux declares ` +
          `redevient alors un constat`,
      });
    }
  }

  // ---- SOMMAIRE PERDU AU DEFILEMENT (TF-0772, 02/09) ----------------------------------
  //
  // La moitie mesurable de L25 : `check_html` exige que le sommaire EXISTE, cette famille exige
  // qu'il reste ATTEIGNABLE. Un sommaire pose en tete d'une page de 4 000 px disparait au
  // premier tiers de la lecture et ne navigue plus rien — c'est le defaut du livrable servi, ou
  // il n'y avait meme pas de sommaire du tout.
  //
  // Mesure : on defile aux 60 % de la page, on regarde si le sommaire est encore dans la
  // fenetre, on revient. Deux seuils, ceux de la regle ecrite : plus de trois chapitres, plus
  // de deux ecrans de haut.
  {
    const chapitres = [...document.querySelectorAll('h2')].filter(visible);
    // TF-1145 (16/09) — TOUS les navs candidats, pas le premier. Cette famille lisait le MEME
    // premier nav que L6 de check_html, avec le MEME selecteur, et lui demandait l'inverse :
    // L6 veut des annonces de douze caracteres, cette famille veut qu'il tienne dans la fenetre.
    // Sur un document long les deux ne tiennent pas ensemble — un sommaire EN CARTES, ou
    // l'annonce se lit, ne peut pas etre collant. La page livree portait TROIS navigations, dont
    // une barre sticky mesuree encore en fenetre apres 20 000 px de defilement, et cette famille
    // rendait BLOQUANT aux six largeurs en designant les cartes. Elle juge desormais LE PLUS
    // PERMANENT : si UNE navigation reste atteignable, le lecteur n'a rien perdu.
    const navs = [...document.querySelectorAll(
      'nav.toc, nav[aria-label^="Sommaire"], nav[aria-label^="sommaire"]')];
    const hauteur = document.documentElement.scrollHeight;
    if (chapitres.length > __SOMMAIRE_MIN_CHAP__ && navs.length
        && hauteur > window.innerHeight * __SOMMAIRE_MIN_ECRANS__) {
      const y0 = window.scrollY;
      window.scrollTo(0, Math.round(hauteur * 0.6));
      const restants = navs.filter((nav) => {
        const r = nav.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight && r.width > 1 && r.height > 1;
      });
      window.scrollTo(0, y0);
      if (!restants.length) {
        issues.sommaire_perdu.push({ what: navs.map(label).join(' + '), detail:
          `AUCUNE des ${navs.length} navigation(s) de la page n'est dans la fenetre apres ` +
          `defilement : ${chapitres.length} chapitres sur ${Math.round(hauteur)}px ` +
          `(${(hauteur / window.innerHeight).toFixed(1)} ecrans), et rien n'est atteignable aux ` +
          `60 % de la page. Au-dela de trois chapitres ou deux ecrans, UNE navigation au moins ` +
          `est VISIBLE EN PERMANENCE : laterale collee sur bureau ` +
          `(position: sticky; top: var(--hh)), bande repliable sur mobile. Il suffit qu'UNE ` +
          `tienne — une barre en titres seuls et un sommaire annote ne s'excluent pas (TF-1145)` });
      }
    }
  }

  // ---- Plafond V7 : au-dela d'un certain nombre, ce n'est plus une liste de cas
  // isoles mais un defaut d'echelle d'espacement. On garde les premiers, on agrege
  // le reste en une ligne : un avertissement qui defile sur 288 lignes ne se lit
  // pas, et il enterre les bloquants V1/V2/V4 qui, eux, doivent sauter aux yeux.
  if (issues.v7_spacing.length > __V7_MAX__) {
    const reste = issues.v7_spacing.length - __V7_MAX__;
    issues.v7_spacing = issues.v7_spacing.slice(0, __V7_MAX__);
    issues.v7_spacing.push({ what: `+ ${reste} autre(s) serie(s) non detaillee(s)`,
      detail: `avertissements V7 plafonnes a __V7_MAX__ — a ce volume, reprendre l'echelle ` +
              `d'espacement du gabarit plutot que les series une a une` });
  }

  // ---- V16 : DEUX ETATS QUI SE RESSEMBLENT NE SONT PAS DEUX ETATS (TF-0910, 08/09/2026) ---
  //
  // LE FAIT PAYE. Les cinq teintes d'etat du socle — --green-fill #DCFCE7, --teal-fill,
  // --amber-fill #FEF3C7, --red-fill #FEE2E2 — et --surface vivent toutes autour de L* 93-97 :
  // des pastels de meme clarte, distingues par une pointe de teinte. Le texte encre dessus tient
  // 4,5:1, donc V2 rendait PASS sur chacun, un par un. Retour humain sur le livrable servi :
  // « les bulles des statuts ne sont pas suffisamment differentes pour etre differenciees ». Le
  // produit a refait la palette hors socle — fonds pleins, encre blanche, un glyphe par palier.
  //
  // POURQUOI V2 NE POUVAIT PAS LE VOIR. V2 mesure un badge CONTRE SON FOND. Le defaut vit ENTRE
  // deux badges : c'est une distance, pas un ratio, et aucune mesure d'un badge seul ne la porte.
  //
  // CE QUI EST MESURE. Pour tout jeu d'au moins trois badges d'une meme classe de base portant au
  // moins trois fonds distincts, la distance de chaque PAIRE de fonds : Delta-E CIE76 (Lab) et
  // ecart de luminance relative WCAG. Une paire sous LES DEUX seuils (dE 20 et dL 0,25) est un
  // constat. Les seuils sont cumulatifs a dessein : deux teintes eloignees en teinte MAIS de meme
  // clarte restent separables, et deux clartes eloignees aussi — il faut les deux pour perdre le
  // lecteur. Le cas paye tenait 0 sur les deux.
  const V16_BASES = ['badge', 'statut', 'etat', 'pill', 'chip', 'tag', 'state'];
  const V16_DE = 20, V16_DL = 0.25;
  {
    const lab = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const [R, G, B] = [f(r), f(g), f(b)];
      // sRGB -> XYZ (D65), puis XYZ -> L*a*b* (blanc de reference D65)
      const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
      const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
      const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
      const g2 = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
      const [fx, fy, fz] = [g2(X), g2(Y), g2(Z)];
      return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
    };
    const deltaE = (c1, c2) => {
      const p = lab(c1), q = lab(c2);
      return Math.sqrt((p.L - q.L) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2);
    };
    const groupes = new Map();
    for (const el of document.querySelectorAll('[class]')) {
      if (!visible(el)) continue;
      const base = [...el.classList].find((c) => V16_BASES.includes(c));
      if (!base) continue;
      const bg = effectiveBg(el);
      if (bg.image) continue;
      const cle = `${Math.round(bg.color.r)},${Math.round(bg.color.g)},${Math.round(bg.color.b)}`;
      if (!groupes.has(base)) groupes.set(base, new Map());
      const variantes = groupes.get(base);
      if (!variantes.has(cle)) {
        variantes.set(cle, { couleur: bg.color, exemple: el,
                             texte: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24),
                             membres: 0 });
      }
      variantes.get(cle).membres += 1;
    }
    for (const [base, variantes] of groupes) {
      // Moins de trois teintes distinctes : ce n'est pas un CODAGE par couleur, c'est un badge
      // et son accent. Accuser ce cas ferait crier la sonde sur toute page a deux badges.
      if (variantes.size < 3) continue;
      const liste = [...variantes.values()];
      const total = liste.reduce((n, v) => n + v.membres, 0);
      if (total < 3) continue;
      for (let i = 0; i < liste.length; i += 1) {
        for (let j = i + 1; j < liste.length; j += 1) {
          const dE = deltaE(liste[i].couleur, liste[j].couleur);
          const dL = Math.abs(lum(liste[i].couleur) - lum(liste[j].couleur));
          if (dE >= V16_DE || dL >= V16_DL) continue;
          const rgb = (c) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
          const memeTexte = liste[i].texte === liste[j].texte;
          issues.etats_indiscernables.push({
            what: `.${base} — « ${liste[i].texte || '(sans libellé)'} » et « ${liste[j].texte || '(sans libellé)'} »`,
            detail: `fonds ${rgb(liste[i].couleur)} et ${rgb(liste[j].couleur)} : `
              + `ecart de couleur (Delta-E CIE76) ${dE.toFixed(1)} < ${V16_DE} ET `
              + `ecart de luminance ${dL.toFixed(3)} < ${V16_DL} — `
              + `${variantes.size} états codés par la couleur, deux d'entre eux indiscernables. `
              + (memeTexte
                  ? `Les deux badges portent le MÊME libellé : la couleur est le SEUL porteur de `
                    + `l'information (WCAG 1.4.1). `
                  : ``)
              + `Les jetons \`*-fill\` du socle sont des fonds de CARTE (L* 93-97, tous voisins) : `
              + `pour un badge d'état, employer un fond PLEIN à encre blanche (\`*-solid\`) et `
              + `ajouter un indice non colorimétrique — un glyphe par palier, et une légende qui `
              + `donne couleur + forme + libellé (charte-et-tokens.md, zero-defaut-visuel.md V16)` });
          if (issues.etats_indiscernables.length >= 12) break;
        }
        if (issues.etats_indiscernables.length >= 12) break;
      }
    }
  }

  // ---- V9 : un ACTIF VISUEL se juge dans le CONTEXTE ou il est servi (TF-0633, 25/08) -----
  //
  // LE FAIT, remonte par un produit et paye en production. Un logo blanc devenu bleu fonce avait
  // ete verifie — le SVG modifie rendu en PNG, le texte parasite disparu. C'etait VRAI, et sans
  // aucun rapport avec le defaut : un logo blanc devenu bleu fonce n'est visible que POSE SUR SON
  // FOND SOMBRE. Le defaut n'existait pas dans le fichier, il existait dans le contexte d'usage.
  // Une capture du bandeau de navigation l'a fait sauter aux yeux immediatement.
  //
  // POURQUOI V2 NE LE VOYAIT PAS : V2 mesure `color` contre le fond effectif, donc du TEXTE. Un
  // actif visuel n'a pas de `color` — il a des pixels. La sonde etait litteralement vraie et sans
  // valeur sur ce cas, exactement le defaut de portee que N-33 decrit.
  //
  // CE QUI EST COLLECTE ICI, et pas plus : les cibles et le fond effectif calcule DANS la page,
  // la ou `effectiveBg` et `peintHorsFond` vivent deja. La mesure des pixels se fait cote Python,
  // sur une capture de l'element — parce que c'est la seule facon de voir ce qui est SERVI plutot
  // que ce qui est DECLARE, et parce qu'un `<img>` charge depuis un fichier ne se lit pas au
  // canvas sans salir le contexte.
  issues.v9_cibles = [];
  {
    let n = 0;
    for (const el of document.querySelectorAll('img, svg')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      // Sous 8 px de cote, ce n'est plus un actif visuel : pastille, filet, pixel de suivi.
      // Les accuser ferait crier la sonde sur du decor, et une sonde qui crie se fait eteindre.
      if (r.width < 8 || r.height < 8) continue;
      const bg = effectiveBg(el);
      const horsFond = peintHorsFond(el);
      n += 1;
      el.setAttribute('data-v9', String(n));
      issues.v9_cibles.push({
        n,
        what: label(el),
        bg: bg.image ? null : bg.color,
        // Le silence d'une sonde n'est pas un verdict (TF-0582) : ce qu'on ne peut pas mesurer
        // se DIT, avec sa raison, au lieu de passer pour un vert.
        nonMesurable: bg.image
          ? "fond peint par une background-image — contraste de l'actif non mesurable par styles calcules"
          : (horsFond ? `fond peint hors background-color (${horsFond})` : null),
      });
    }
  }

  return issues;
}
"""


# ---------------------------------------------------------------------------
# V15 — L'EN-TETE DE TABLEAU, MESURE APRES DEFILEMENT (TF-0901, lot Produit-10 20260907e).
#
# LE TROU, ET IL ETAIT TRIPLE. Une page dont les HUIT en-tetes de tableau etaient poses sur
# leurs propres lignes a ete rendue PASS par trois oracles le 07/09/2026, et vue par l'humain a
# la premiere ouverture. Chacun des trois etait aveugle POUR SA PROPRE RAISON :
#   · `check_html` L29 juge les DECLARATIONS de la feuille — le style en ligne pose par un
#     script est invisible a la lecture du fichier ;
#   · `render_page` V4 compare les enfants d'un MEME parent — le decalage vivait sur les `th`,
#     donc sur des freres decales PAREIL, et `thead`/`tbody` gardaient leurs boites naturelles ;
#   · l'oracle de filtres juge le marquage, qui etait juste.
# Et le seul defilement que cet outil pratiquait servait le sommaire (V14, a 60 % de la page).
#
# CE QUE V15 MESURE, en deux branches :
#   a. AU REPOS (page en haut), tout `th` de `thead` dont la boite recouvre une ligne du corps de
#      plus de 2 px. Un en-tete correct ne recouvre RIEN au repos : il est a sa place naturelle.
#      C'est la signature du `top` applique a un element non collant — decalage PERMANENT, une a
#      deux lignes mangees a chaque instant. BLOQUANT.
#   b. APRES DEFILEMENT, le tableau amene 400 px au-dessus du bord haut de la fenetre et son
#      corps encore a l'ecran : un `th` declare `sticky` doit se tenir EXACTEMENT au `top` qu'il
#      declare (4 px de tolerance, l'arrondi de peinture). S'il n'y est pas, c'est qu'il colle a
#      une AUTRE boite de defilement que la fenetre — un ancetre a `overflow` non `visible`
#      (TF-0900). CONSTAT : la cause est reelle, le geste correctif appartient a la page.
# La mesure n'a besoin d'aucun jeton : elle compare le `top` RENDU au `top` DECLARE.
MESURE_ENTETE_JS = r"""
() => {
  const poses = [], decolles = [], masques = [], brides = [];
  const yInitial = window.scrollY;
  const etiquette = (t, i) => {
    const cap = t.querySelector('caption');
    const txt = ((cap && cap.textContent) || t.id || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return txt ? `table ${i} « ${txt} »` : `table ${i}`;
  };
  const visibleBoite = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const tables = [...document.querySelectorAll('table')].filter(
    (t) => t.tHead && t.tHead.rows.length && t.tBodies.length && visibleBoite(t));

  // ---- a. AU REPOS : un en-tete ne recouvre AUCUNE ligne du corps -----------------------
  window.scrollTo(0, 0);
  tables.forEach((t, i) => {
    const ths = [...t.tHead.rows[0].cells].filter(visibleBoite);
    const lignes = [...t.tBodies[0].rows].filter(visibleBoite);
    if (!ths.length || !lignes.length) return;
    for (const th of ths) {
      const a = th.getBoundingClientRect();
      const manges = lignes.filter((tr) => {
        const b = tr.getBoundingClientRect();
        return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      });
      if (!manges.length) continue;
      const cs = getComputedStyle(th);
      poses.push({
        what: `${etiquette(t, i + 1)} — en-tete « ${(th.textContent || '').trim().slice(0, 24)} »`,
        detail: `AU REPOS, l'en-tete recouvre ${manges.length} ligne(s) du corps `
          + `(bord haut ${Math.round(a.top)} px, premiere ligne recouverte a `
          + `${Math.round(manges[0].getBoundingClientRect().top)} px). `
          + `position: ${cs.position}, top: ${cs.top}. Un \`top\` applique a un element NON `
          + `collant est un decalage PERMANENT : l'en-tete mange ses propres lignes a chaque `
          + `instant. Cause la plus frequente : un script qui pose \`style.position\` en ligne `
          + `sur le \`<th>\` et ecrase le \`sticky\` de la feuille (TF-0899, check_html L29)` });
      break;   // une cause par tableau : huit `th` decales pareil font UN defaut, pas huit
    }
  });

  // ---- b. APRES DEFILEMENT : un en-tete collant se tient a son `top` DECLARE ------------
  tables.forEach((t, i) => {
    const ths = [...t.tHead.rows[0].cells].filter(visibleBoite);
    if (!ths.length) return;
    const th = ths[0];
    const cs = getComputedStyle(th);
    if (cs.position !== 'sticky') return;          // rien a attendre d'un en-tete non collant
    const attendu = parseFloat(cs.top);
    if (!isFinite(attendu)) return;                // `top: auto` : aucun engagement declare
    // 400 px au-dessus du bord haut, MAIS jamais au point de sortir le tableau : un `sticky` est
    // borne par son bloc conteneur, et un en-tete pousse dehors par la FIN de son propre tableau
    // n'est pas un defaut, c'est le comportement prescrit. Mesure du 08/09 : sur un tableau de
    // 515 px, un defilement de 400 laissait 115 px de corps et l'en-tete rendait 77 px pour 104
    // declares — un faux constat sur la fixture VERTE. La borne se lit sur la hauteur du tableau.
    const recul = Math.min(400, Math.max(0, t.offsetHeight - 250));
    window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY + recul);
    const rt = t.getBoundingClientRect();
    const hTh = th.getBoundingClientRect().height;
    // Le tableau doit encore etre a l'ecran : un en-tete d'un tableau parti n'a rien a tenir.
    if (!(rt.bottom > 0 && rt.top < window.innerHeight)) return;
    // ET le `sticky` doit avoir eu a S'ENGAGER : tant que le tableau est plus bas que le `top`
    // declare, l'en-tete est a sa place naturelle et il n'y a RIEN a mesurer. Sans cette
    // condition, toute page trop courte pour defiler jusque-la rendait un faux constat.
    if (rt.top >= attendu - 1) return;
    // ET il doit rester de la place SOUS le seuil : sinon l'en-tete est repousse par la fin de
    // son tableau, ce que la specification prescrit.
    if (rt.bottom < attendu + hTh + 20) return;
    const rendu = th.getBoundingClientRect().top;
    if (Math.abs(rendu - attendu) <= 4) return;
    decolles.push({
      what: `${etiquette(t, i + 1)} — en-tete collant`,
      detail: `APRES DEFILEMENT (tableau amene ${Math.round(recul)} px au-dessus du bord haut, `
        + `corps encore a l'ecran), l'en-tete est a ${Math.round(rendu)} px alors qu'il declare `
        + `top: ${cs.top}. Un \`sticky\` se compte depuis sa BOITE DE DEFILEMENT : s'il n'est `
        + `pas la ou il le dit, un ancetre porte un \`overflow\` autre que \`visible\` et lui `
        + `sert de boite (TF-0900 — le conteneur de tableau du socle ne defile plus qu'en `
        + `dessous de 900 px). Verifier les ancetres du tableau` });
  });

  // ---- c. L'EMPILEMENT DES COLLANTS : `--hh` est un TOKEN, pas une mesure (TF-0929) -----
  //
  // LE FAIT, ET C'EST LA TROISIEME INSTANCE DE LA CLASSE EN DEUX JOURS (TF-0899, TF-0900,
  // celle-ci). Le socle decale le thead collant de `var(--hh)`, une CONSTANTE de 64 px. Des que
  // l'en-tete passe sur deux lignes, ou qu'une bande de sommaire colle SOUS lui, ce qui colle
  // au-dessus du thead est plus haut que le token — et le thead se range exactement a son `top`
  // declare, DERRIERE eux. Capture humaine a ~1 370 px : deux `th` coupes ; mesure Playwright a
  // la meme largeur : `--hh` 104, bas de l'en-tete 107, bas de la bande de sommaire collante
  // 219, `th` colle a 104 — 115 px MASQUES. A 1 600 px, aucun defaut : le defaut depend de la
  // largeur, donc d'une mesure, et aucun token ne peut le porter.
  //
  // POURQUOI PERSONNE NE LE VOYAIT. `L29` de check_html verifie que `top: var(--hh)` existe et
  // que `--hh` est declare — jamais la HAUTEUR REELLE de ce qui colle au-dessus. La branche (b)
  // ci-dessus verifie que le `th` se tient a son `top` DECLARE : ici il s'y tient
  // parfaitement, et c'est precisement le probleme. Le defaut vit entre le token et le rendu.
  //
  // LA MESURE : le `th` colle doit se poser au BAS du dernier collant qui le surplombe, a 4 px
  // pres. Un collant qui le surplombe est un element `sticky` ou `fixed`, visible, qui recouvre
  // horizontalement le `th` et dont le bas depasse le haut du `th`.
  tables.forEach((t, i) => {
    if (!t.tHead || !t.tHead.rows.length) return;
    const ths = [...t.tHead.rows[0].cells].filter(visibleBoite);
    if (!ths.length) return;
    const th = ths[0];
    const cs = getComputedStyle(th);
    if (cs.position !== 'sticky') return;
    const attendu = parseFloat(cs.top);
    if (!isFinite(attendu)) return;
    // TF-0968 / TF-1060 (08/09, 11/09) — le recul place le tableau en position de LECTURE, pas de
    // sortie d'ecran. `min(400, hauteur - 250)` laissait TOUJOURS 250 px de tableau : l'en-tete,
    // bride par la fin de son bloc conteneur a 250 - hauteur du th, ne pouvait plus atteindre un
    // `top` de 219 px, et rendait 9 a 11 px « masques » sur tout tableau de ~291 a ~660 px — les
    // trois plus courts d'une page, jamais les autres. Un tiers de la hauteur, borne pareil.
    const recul = Math.min(400, Math.max(0, Math.min(t.offsetHeight - 250, t.offsetHeight / 3)));
    window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY + recul);
    const rt = t.getBoundingClientRect();
    if (!(rt.bottom > 0 && rt.top < window.innerHeight)) return;
    if (rt.top >= attendu - 1) return;              // le `sticky` ne s'est pas engage
    const rth = th.getBoundingClientRect();
    // TF-0973 (08/09) — DEUX SIGNATURES, DEUX MESSAGES, et la sonde n'est pas desarmee. Quand le
    // bas du tableau moins la hauteur du `th` tombe sous le `top` declare, l'en-tete est tire vers
    // le haut par la fin de son propre tableau : c'est la specification CSS, INFORMATIF. Sauf si
    // le tableau n'a AUCUNE ligne de donnees ni etat vide declare : c'est la signature du tableau
    // vide annonce a 276 lignes, que seule V15 avait vu — BLOQUANT.
    if (rt.bottom - rth.height < attendu - 1) {
      const lignes = [...t.tBodies].flatMap((b) => [...b.rows]).filter(visibleBoite);
      const donnees = lignes.filter((tr) => !tr.hasAttribute('data-tf-empty'));
      if (!donnees.length && lignes.length === donnees.length) {
        masques.push({
          what: `${etiquette(t, i + 1)} — tableau VIDE sous un en-tete collant`,
          detail: `le tableau ne porte AUCUNE ligne de donnees visible, et aucun etat vide declare `
            + `(tr[data-tf-empty]) : son en-tete, bride par la fin d'un tableau de `
            + `${Math.round(t.offsetHeight)} px, disparait sous les collants. Un tableau vide par `
            + `construction se cherche en amont — un filtre qui a reduit la population source, un `
            + `titre qui annonce des lignes qu'il ne porte pas (TF-0973)` });
      } else {
        brides.push({
          what: `${etiquette(t, i + 1)} — en-tete bride par la fin de son tableau`,
          detail: `informatif : a ce defilement, le bas du tableau (${Math.round(rt.bottom)} px) `
            + `moins l'en-tete (${Math.round(rth.height)} px) tombe sous le \`top\` declare `
            + `(${cs.top}) — le \`sticky\` est tire vers le haut par la fin de son bloc conteneur, `
            + `comportement prescrit par CSS. Rien a corriger ; aucun token n'y changerait rien` });
      }
      return;
    }
    // Les collants qui SURPLOMBENT ce `th` : `sticky` ou `fixed`, visibles, en recouvrement
    // horizontal, et dont le bas mord sur le haut du `th`. Le `th` lui-meme et ses ancetres de
    // tableau sont exclus — un `thead` ne se masque pas lui-meme.
    // Reperage LOCAL : `label` vit dans l'autre bloc de mesure, et une sonde qui LEVE rend la
    // famille NON JUGEE — un silence qui se lit comme un vert (mesure du 08/09 sur la fixture
    // rouge : « V15 non jugee (Error) », zero constat, et la paire ne prouvait rien).
    const nomDe = (el) => el.tagName.toLowerCase()
      + (el.id ? '#' + el.id : '')
      + (el.className && typeof el.className === 'string' && el.className.trim()
         ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    let bas = 0, coupable = null;
    for (const el of document.body.querySelectorAll('*')) {
      if (el === th || el.contains(th) || th.contains(el)) continue;
      if (el.closest('table') === t) continue;
      const c = getComputedStyle(el);
      if (c.position !== 'sticky' && c.position !== 'fixed') continue;
      if (!visibleBoite(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= rth.left + 1 || r.left >= rth.right - 1) continue;   // pas au-dessus de lui
      if (r.top > rth.top) continue;                                      // il est SOUS le `th`
      if (r.bottom <= rth.top + 1) continue;                              // il ne le mord pas
      if (r.bottom > bas) { bas = r.bottom; coupable = el; }
    }
    if (!coupable) return;
    const masque = Math.round(bas - rth.top);
    if (masque <= 4) return;
    masques.push({
      what: `${etiquette(t, i + 1)} — en-tete masque par l'empilement des collants`,
      detail: `APRES DEFILEMENT, l'en-tete pouvait atteindre son \`top\` et il est RECOUVERT par un `
        + `collant : il se pose a ${Math.round(rth.top)} px, son `
        + `\`top\` declare (${cs.top}), mais ${nomDe(coupable)} colle au-dessus de lui descend `
        + `jusqu'a ${Math.round(bas)} px : ${masque} px de l'en-tete sont MASQUES. Le decalage `
        + `d'un collant est une MESURE, pas un token : un en-tete qui passe sur deux lignes ou `
        + `une bande de sommaire collante changent la hauteur de ce qui colle au-dessus, et `
        + `aucune constante ne peut la suivre — le defaut apparait a une largeur et pas a une `
        + `autre. Poser les hauteurs au chargement, au redimensionnement et aux polices `
        + `chargees (poserHauteurs() du gabarit) ; le token reste le repli` });
  });

  window.scrollTo(0, yInitial);
  return { poses, decolles, masques, brides };
}
"""


# ---------------------------------------------------------------------------
# V18 — CE QUE LE 4K MONTRE ET QUE 1920 TAISAIT (TF-1066, 12/09/2026).
#
# LA REGLE AMONT. E5 du pilot, decision humaine du 12/09/2026 : une page de bureau se CONCOIT a
# 1920 px et se VERIFIE jusqu'a 3840. Jusqu'ici la grille s'arretait a 1920, donc la borne de ce
# que les produits prouvaient s'y arretait aussi : une page PASS a 1920 pouvait etirer sa prose
# sur 2 880 px ou laisser la moitie de l'ecran vide a 3840 sans qu'aucun controle ne le dise.
#
# DEUX DEFAUTS, ET ILS SONT SYMETRIQUES. Aux tres grandes largeurs, une page se trompe dans un
# sens ou dans l'autre :
#   a. la PROSE prend toute la place qu'on lui donne — mesure du 12/09 sur la sonde : 342
#      caracteres par ligne a 3840 px pour un conteneur non bride ; l'oeil perd la ligne suivante ;
#   b. les DONNEES n'en prennent aucune — un tableau qui reste a sa largeur de contenu pendant
#      que son conteneur en offre le double (L26 : une page de donnees est pleine largeur).
# Les familles existantes ne voient ni l'un ni l'autre : L2 et ses variantes comparent un bloc a
# ce que son CONTENEUR lui offre (une prose qui remplit un conteneur large rend 100 %), et
# `conteneur_bride_donnees` compare le conteneur a la FENETRE (il peut etre plein pendant que le
# tableau dedans est etrique). Ce qui manque est la mesure de LECTURE, en caracteres par ligne.
#
# LA MESURE, ET POURQUOI PAS UNE DIVISION PAR LA TAILLE DE POLICE. `largeur / (0,5 x font-size)`
# est une approximation qui depend de la fonte reellement servie, donc du poste. Un `Range` sur le
# contenu du paragraphe rend une boite PAR LIGNE reellement peinte (`getClientRects`) : le nombre
# de lignes est un FAIT du rendu, et `caracteres / lignes` la mesure de lecture effective. Elle est
# CONSERVATRICE — la derniere ligne est partielle, donc le compte sous-estime la capacite reelle.
#
# LE SEUIL, ET LE CONFLIT QU'IL REVELAIT — TRANCHE, PAS MASQUE (decision humaine du 15/09/2026,
# "13a"). Le seuil pose le 12/09 etait 100 caracteres par ligne. Or le conteneur de lecture que le
# socle PRESCRIT (`.chap.lire`, 1 080 px, regle E4) mesure 134 caracteres par ligne en 16 px (sonde
# du 12/09, valeur identique a 1920, 2560 et 3840) : condamner la forme qu'un gabarit prescrit met
# le gabarit en defaut, jamais l'auteur. L'etude d'opportunite « lots de travaux et style —
# 20260914a » du pilot (TF-1069, section 5 « Verdict ») arbitre entre les deux options mesurees —
# resserrer `.chap.lire` sous 100, ou porter le plafond a
# 135 — et retient la seconde : « option la moins destructrice pour l'existant, la mesure montrant
# 134 cpl a 1 080 px, sous le nouveau plafond ». La decision du 15/09 (13a) suit ce verdict : le
# plafond passe a 135, `.chap.lire` est GARDE a 1 080 px sans y toucher. Consequence mesuree : le
# token du socle (134 cpl) tient desormais SOUS le plafond et rentre directement dans les proses
# jugees — l'exemption de conteneur de lecture declare (`.lire`, `[data-mesure-lecture]`, ci-dessous)
# reste au code pour la forme plus large qu'un chapitre pourrait encore adopter, mais elle ne
# s'applique plus au token `.chap.lire` lui-meme. Ce qui reste bloque est la prose qu'AUCUN
# conteneur ne tient au-dela de 135 : exactement le defaut que E5 decrit.
V18_MIN_VIEWPORT = 2560
V18_MAX_CPL = 135
V18_MIN_CHARS = 160            # sous ce compte, une ligne unique ne mesure aucune capacite
V18_TABLE_MIN_RATIO = 0.85     # L26 — un tableau principal sous ce ratio laisse l'ecran vide
V18_TABLE_MIN_LIGNES = 8       # un tableau principal, pas un encart de trois valeurs
V18_TABLE_MIN_COLONNES = 4

MESURE_LARGE_JS = r"""
() => {
  const MAX_CPL = __V18_MAX_CPL__, MIN_CHARS = __V18_MIN_CHARS__;
  const TABLE_MIN = __V18_TABLE_MIN__, TABLE_LIGNES = __V18_TABLE_LIGNES__,
        TABLE_COLONNES = __V18_TABLE_COLONNES__;
  const proses = [], tableaux = [], notes = [];
  // Reperage LOCAL : ce bloc s'evalue seul, il n'herite d'aucune aide de la passe principale.
  const nomDe = (el) => el.tagName.toLowerCase()
    + (el.id ? '#' + el.id : '')
    + (el.className && typeof el.className === 'string' && el.className.trim()
       ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const visibleBoite = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const largeurOfferte = (el) => {
    const par = el.parentElement;
    if (!par) return 0;
    const cs = getComputedStyle(par);
    return par.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  };

  // ---- a. LA PROSE : caracteres par ligne, mesures sur les boites reellement peintes -------
  const pageDonnees = !!document.querySelector(
    '[data-page="donnees"], [data-page="donn\u00e9es"], [data-page="data"], [data-page="console"], '
    + '[data-restitution="registre"], [data-restitution="suivi"]');
  const vusP = new Set();
  for (const el of document.querySelectorAll('p, li, dd, blockquote, .prose, .chapo, .va')) {
    if (proses.length + notes.length >= 12) break;
    if (el.closest('table, nav, pre, code, figcaption, .tf-panel')) continue;
    if (!visibleBoite(el)) continue;
    const texte = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (texte.length < MIN_CHARS) continue;
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter((x) => x.width > 1 && x.height > 1);
    if (!rects.length) continue;
    const lignes = new Set(rects.map((x) => Math.round(x.top))).size || 1;
    const cpl = Math.round(texte.length / lignes);
    if (cpl <= MAX_CPL) continue;
    const cle = nomDe(el) + '|' + cpl;
    if (vusP.has(cle)) continue;
    vusP.add(cle);
    const tenu = el.closest('.lire, [data-mesure-lecture]');
    const largeur = Math.round(el.getBoundingClientRect().width);
    const socle = `${cpl} caracteres par ligne mesures (${texte.length} caracteres sur ${lignes} `
      + `ligne(s) peintes, bloc de ${largeur}px dans une fenetre de ${window.innerWidth}px ; `
      + `plafond ${MAX_CPL})`;
    if (tenu) {
      notes.push({ what: nomDe(el), detail: `V18 — ${socle}. Ce paragraphe est TENU par un `
        + `conteneur de lecture declare (${nomDe(tenu)}) : il n'est pas compte en defaut. La `
        + `mesure est publiee pour que l'ecart entre le token du socle et le plafond de E5 `
        + `s'arbitre sur un chiffre` });
    } else {
      proses.push({ what: nomDe(el), detail: `${socle} — au-dela de ${MAX_CPL} caracteres, l'oeil `
        + `perd le debut de la ligne suivante. La mesure de lecture se pose sur le CONTENEUR `
        + `(.chap.lire, regle E4), jamais sur le paragraphe : envelopper ce passage dans un `
        + `chapitre de lecture, ou le declarer par data-mesure-lecture s'il est assume` });
    }
  }

  // ---- b. LES DONNEES : le tableau principal contre la largeur qu'on lui offre -------------
  const tables = [...document.querySelectorAll('table')].filter(visibleBoite);
  const dominante = tables.map((t) => {
    const corps = [...t.tBodies].reduce((n, b) => n + b.rows.length, 0);
    const colonnes = t.rows.length ? t.rows[0].cells.length : 0;
    const r = t.getBoundingClientRect();
    return { t, corps, colonnes, aire: r.width * r.height };
  }).sort((a, b) => b.aire - a.aire)[0];
  if (dominante && (pageDonnees
      || (dominante.corps >= TABLE_LIGNES && dominante.colonnes >= TABLE_COLONNES))) {
    const t = dominante.t;
    const offerte = largeurOfferte(t);
    const w = t.getBoundingClientRect().width;
    if (offerte > 0 && w > 0) {
      const ratio = w / offerte;
      if (ratio < TABLE_MIN) {
        const cs = getComputedStyle(t);
        tableaux.push({ what: nomDe(t), detail:
          `tableau principal a ${Math.round(w)}px pour ${Math.round(offerte)}px offerts par son `
          + `conteneur (${Math.round(ratio * 100)} %, plancher ${Math.round(TABLE_MIN * 100)} %) `
          + `dans une fenetre de ${window.innerWidth}px — width calcule ${cs.width}, max-width `
          + `${cs.maxWidth}. Une page de DONNEES prend toute la largeur offerte (L26) : au 4K la `
          + `place existe, et la moitie de l'ecran reste vide. Poser width: 100% sur le tableau, `
          + `ou retirer le plafond de son conteneur ; les colonnes se DEFINISSENT (L27) plutot `
          + `que de se laisser etirer` });
      }
    }
  }

  return { proses, tableaux, notes };
}
"""


# TF-0365 (lot Produit-10 20260818a, 18/08) — une page TRES HAUTE rendait l'outil muet.
# Fait mesure : un livrable CONFORME de 271 Ko et 45 tableaux atteint 151 615 px de haut a
# 390 px de large (135 272 a 768, 43 409 a 1280) — les tableaux passent en cartes sous 768, ce
# que le socle prescrit lui-meme. `Page.screenshot` portait un delai FIXE de 30 s sans option,
# `--scale` n'acceptait qu'un entier, et aucun repli n'existait : l'outil terminait sur une
# trace Playwright brute, pas sur un verdict. Un livrable conforme devenait non jugeable passe
# une certaine longueur, sans que rien ne le dise.
#
# Le point qui rend le correctif simple, et qu'il fallait voir : les mesures V1/V2/V4/V3/V7 et
# L2 sont prises par `page.evaluate(js)` AVANT la capture, dans le DOM. Une capture qui echoue
# ne coute donc RIEN de ce qui est bloquant — elle coute l'inspection humaine de V5
# (croisements) et V6 (images), qui se fait a l'oeil sur le PNG. La reponse n'est pas de reussir
# la capture a tout prix : c'est de NOMMER ce qu'on perd quand elle echoue.
# TF-0493 (23/08) — LA MATRICE D'ETATS. Deux defauts trouves par un client sur un seul
# livrable, tous deux reproductibles en deux clics, tous deux invisibles au rendu par defaut :
#   (1) le panneau de filtre CREE un ascenseur horizontal a l'ouverture ;
#   (2) le bouton « Aucun » DETRUIT l'affichage — le tableau se reduit a quelques pixels, sans
#       un mot pour le lecteur.
# `--etats-ouverts` existait et avait ete utilise. Il ouvre les details et le premier panneau,
# et ne produit AUCUN etat d'echec : filtre sans resultat, recherche sans correspondance, liste
# vide. Or C'EST LA QUE LES COMPOSANTS CASSENT, precisement parce que personne ne les regarde.
#
# Chaque etat dit s'il a pu s'APPLIQUER. Un etat qui ne trouve pas son declencheur n'est pas
# vert : il est declare NON JOUE, avec son motif. Un composant absent est une reponse ; un etat
# muet serait un mensonge.
#
# Les selecteurs sont ceux du socle (references/composant-filtres-tableau.md) : `.tf-btn`
# ouvre un panneau, `.tf-none` decoche tout, `.tf-search` filtre la liste de valeurs.
ETATS_MATRICE = [
    ("tout-deplie", """() => {
        const d = [...document.querySelectorAll('details')];
        d.forEach((x) => { x.open = true; });
        const b = document.querySelector('.tf-btn, .dd-btn');
        if (b) b.click();
        if (!d.length && !b) return { applique: false, motif: 'aucun <details> ni panneau de filtre dans la page' };
        return { applique: true, motif: `${d.length} <details> ouvert(s)${b ? ', premier panneau deplie' : ''}` };
    }"""),
    ("filtre-premiere-colonne", """() => {
        const b = [...document.querySelectorAll('.tf-btn')];
        if (!b.length) return { applique: false, motif: 'aucun declencheur de filtre (.tf-btn) — page sans tableau filtrable' };
        b[0].click();
        return { applique: true, motif: 'panneau de la PREMIERE colonne ouvert' };
    }"""),
    ("filtre-derniere-colonne", """() => {
        const b = [...document.querySelectorAll('.tf-btn')];
        if (!b.length) return { applique: false, motif: 'aucun declencheur de filtre (.tf-btn)' };
        if (b.length < 2) return { applique: false, motif: 'une seule colonne filtrable — meme etat que la premiere, non rejoue' };
        b[b.length - 1].click();
        return { applique: true, motif: `panneau de la DERNIERE colonne ouvert (${b.length} colonnes filtrables) — un panneau ne deborde pas du meme cote a droite qu a gauche` };
    }"""),
    ("filtre-sans-resultat", r"""() => {
        const b = document.querySelector('.tf-btn');
        if (!b) return { applique: false, motif: 'aucun declencheur de filtre (.tf-btn)' };
        b.click();
        const panneau = document.querySelector('.tf-panel:not([hidden])') || document;
        const aucun = panneau.querySelector('.tf-none')
          || [...panneau.querySelectorAll('button, label')].find((e) => /^\s*aucun/i.test(e.textContent || ''));
        if (!aucun) return { applique: false, motif: 'panneau ouvert, mais aucune bascule « Aucun » (.tf-none) a actionner' };
        aucun.click();
        return { applique: true, motif: 'toutes les valeurs decochees — le tableau ne doit plus porter AUCUNE ligne, et le dire' };
    }"""),
    ("recherche-sans-correspondance", """() => {
        const champ = document.querySelector('.tf-search, input[type=search]');
        if (!champ) return { applique: false, motif: 'aucun champ de recherche (.tf-search, input[type=search])' };
        champ.focus();
        champ.value = 'zzzqqqxwv';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        champ.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'v' }));
        return { applique: true, motif: 'recherche sur une chaine improbable — zero correspondance attendue, annoncee' };
    }"""),
]

# Ce que V1/V2/V4 ne verront JAMAIS, et qui est pourtant le defaut le plus grave des deux
# trouves par le client : « le bouton Aucun DETRUIT l'affichage — le tableau se reduit a
# quelques pixels, SANS UN MOT ». Aucune famille de mesure ne parle de ce silence : la page est
# geometriquement irreprochable, elle ne deborde pas, elle ne se chevauche pas, elle ne dit
# simplement plus rien. C'est la loi transverse n° 3 appliquee aux etats vides : l'oubli
# n'existe pas — un etat vide se DECLARE, il ne se devine pas.
#
# Le socle prescrit deja la forme du message (`.tf-count` en zone vivante, classe `zero`,
# `.tf-vide-msg`) : ce controle ne fait qu'exiger qu'elle soit la, VISIBLE et PORTEUSE DE TEXTE.
# Le piege a eviter : le panneau de filtre contient lui-meme un bouton « Aucun ». Le compter
# comme message rendrait la regle verte sur le defaut exact qu'elle traque.
VERIF_ETATS = {
    "filtre-sans-resultat": """() => {
        const lignes = [...document.querySelectorAll('tbody tr')].filter((r) =>
          getComputedStyle(r).display !== 'none' && !r.hasAttribute('data-tf-hidden')
          && r.getBoundingClientRect().height > 1);
        const visible = (el) => {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        };
        const dit = [...document.querySelectorAll('.tf-vide, .tf-vide-msg, .tf-count, [aria-live], .zero, .empty')]
          .filter((el) => !el.closest('.tf-panel, .tf-btn'))
          .some((el) => visible(el) && (el.textContent || '').trim().length > 2);
        return { lignes: lignes.length, dit };
    }""",
    "recherche-sans-correspondance": """() => {
        const opts = [...document.querySelectorAll('.tf-opt, .tf-opts label')].filter((el) =>
          getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 1);
        const visible = (el) => {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        };
        const dit = [...document.querySelectorAll('.tf-vide, .tf-vide-msg, .tf-count, [aria-live], .zero, .empty')]
          .some((el) => visible(el) && (el.textContent || '').trim().length > 2);
        return { lignes: opts.length, dit };
    }""",
}

# ---------------------------------------------------------------------------
# LES FAMILLES DE CONSTATS, ET LEUR POIDS — SOURCE UNIQUE (23/08/2026, choix humain).
#
# POURQUOI CETTE TABLE EXISTE. Le poids d'une famille était écrit à TROIS endroits dans ce fichier
# (la liste d'affichage, le compteur de bloquants, la liste de la matrice d'états) et une
# quatrième fois chez chaque consommateur. Mesure du 23/08 : trois familles nées après la table de
# forge-design n'y figuraient pas, et DEUX d'entre elles — bloquantes ici — y arrivaient en simple
# avertissement. Le constat était là, visible, et ne pesait plus rien. Une double vérité ne se
# corrige pas : elle se supprime.
#
# `--familles` publie cette table : un consommateur la LIT au lieu d'en tenir une copie.
# `v1_tronque` n'y figure pas — ce n'est pas une famille de constats mais une BORNE déclarée.
FAMILLES = [
    ("v1_overflow", "V1 débordement horizontal", "bloquant"),
    ("v2_contrast", "V2 contraste", "bloquant"),
    ("v4_overlap", "V4 chevauchement de blocs", "bloquant"),
    ("l2_width", "L2 largeur de texte bridée", "bloquant"),
    ("l2_gouttiere", "L2 gouttière d'étiquettes", "bloquant"),
    ("l2_conteneur", "L2 conteneur de lecture calé à gauche", "bloquant"),
    ("l2_filet", "L2 texte écrasé en filet", "bloquant"),
    ("etat_muet", "État vide MUET (loi n° 3)", "bloquant"),
    # TF-0551 (24/08) : une fiche livree avait perdu deux sections et son pied de page sous un
    # `overflow:hidden`, avec DEUX oracles verts. Bloquant sans hesitation : c'est la seule
    # famille dont le defaut ne se voit ni a l'ecran ni a l'impression.
    # TF-0633 (25/08, lot Produit-02) : un logo blanc devenu bleu fonce, servi sur un
    # bandeau bleu fonce. Bloquant au meme titre que V2 : c'est le meme defaut — un contenu
    # invisible — sur un objet que V2 ne sait pas voir, faute de `color` a mesurer.
    ("v9_actif_invisible", "V9 actif visuel indiscernable de son fond", "bloquant"),
    ("contenu_rogne", "Contenu ROGNE par un debordement masque", "bloquant"),
    # Lot Produit-02 du 02/09 — quatre familles nees de retours humains directs sur un livrable
    # servi, chacune sur un angle mort DECLARE des familles existantes :
    #   · TF-0773 « textbox pas alignes » — V3 juge des series de blocs, pas des controles ;
    #   · TF-0771 « les pages doivent profiter de toute la largeur » — V1 se tait des qu'un
    #     conteneur defile, et la revue avait classe le rognage « acceptable » SANS mesure ;
    #   · TF-0778 prose bridee — L2 ne regarde que six selecteurs, un `.chapo` n'en est aucun ;
    #   · TF-0772 sommaire — la moitie mesurable de L25.
    ("controles_desalignes", "Controles d'une meme rangee desalignes", "bloquant"),
    ("rognage_donnees", "Tableau ROGNE dans un conteneur defilant (page de donnees)", "bloquant"),
    ("prose_etroite", "Bloc de texte etrique sur une page de donnees", "bloquant"),
    # TF-0930 (lot Produit-10 20260908b) : le CONTENEUR, la ou `prose_etroite` juge le bloc et
    # `rognage_donnees` le tableau. Une page de donnees bridee a 1 260 px dans une fenetre de
    # 1 370 rend PASS aux deux — le bloc remplit bien son conteneur, le tableau ne deborde pas
    # de la boite qu'on lui a donnee. Bloquant : c'est le troisieme angle de la meme regle.
    ("conteneur_bride_donnees", "Conteneur bride sur une page de donnees", "bloquant"),
    ("sommaire_perdu", "Sommaire perdu au defilement", "bloquant"),
    # TF-1146 (16/09, lot Produit-64 20260916a) : l exemption V4 posee EN BLOC. Avertissement et
    # non bloquant — 1 716 occurrences mesurees dans le parc le 16/09, les rendre bloquantes
    # d un coup rougirait tout ce qui existe. Mais le silence, lui, s arrete : un libelle de
    # fleche imprime dans la boite voisine a traverse DEUX livraisons sous cette exemption.
    ("overlap_en_bloc", "V4 exemption posee EN BLOC (data-overlap-ok sans paire declaree)",
     "avertissement"),
    # TF-0910 (lot Produit-10 20260908a) : cinq teintes d'etat pastel du socle, toutes autour de
    # L* 93-97. Chaque badge tenait 4,5:1 contre son fond, donc V2 rendait PASS sur chacun ; le
    # defaut vit ENTRE deux badges — une distance, pas un ratio. Retour humain sur le livrable
    # servi : « les bulles des statuts ne sont pas suffisamment differentes pour etre
    # differenciees ». Bloquant : un etat qu'on ne distingue pas n'est pas un etat.
    ("etats_indiscernables", "V16 etats indiscernables entre eux", "bloquant"),
    # TF-0901 (lot Produit-10 20260907e) : huit en-tetes de tableau poses sur leurs propres
    # lignes, trois oracles PASS, et l'humain seul detecteur a la premiere ouverture. Un `top`
    # applique a un element NON collant mange ses lignes a chaque instant : bloquant.
    ("entete_pose_sur_lignes", "V15 en-tete de tableau pose sur ses lignes", "bloquant"),
    # TF-0901, seconde branche : l'en-tete COLLE, mais pas a la fenetre — un ancetre a
    # `overflow` non `visible` lui sert de boite (TF-0900). Constat et non bloquant : la cause
    # est nommee, le geste correctif appartient a la page qui a choisi ce conteneur.
    ("entete_ne_colle_pas", "V15 en-tete collant hors de son `top` declare", "avertissement"),
    # TF-0929 (lot Produit-10 20260908b) : la TROISIEME branche, et la troisieme instance de la
    # classe en deux jours. L'en-tete se tient EXACTEMENT a son `top` declare — les deux branches
    # ci-dessus rendent PASS — et il est quand meme illisible, parce que `--hh` est un TOKEN et
    # que ce qui colle au-dessus est plus haut que lui. Mesure a 1 370 px : 115 px masques ; a
    # 1 600 px, aucun defaut. Bloquant : un en-tete de colonne coupe rend le tableau indechiffrable.
    ("entete_masque_par_collants", "V15 en-tete masque par l'empilement des collants", "bloquant"),
    # TF-0973 (08/09) : la SECONDE signature, separee de la premiere dans son texte — l'en-tete
    # tire vers le haut par la fin de son propre tableau. Comportement prescrit par CSS : une
    # information, jamais un bloquant. Une regle qui melange ses deux causes s'apprend a ignorer.
    ("entete_bride_par_tableau", "V15 en-tete bride par la fin de son tableau (informatif)", "info"),
    # TF-1066 (12/09/2026, règle E5 du pilot) — V18, et elle ne se joue qu'au-delà de 2560 px :
    # les deux défauts qu'elle mesure n'EXISTENT pas à 1920. La prose non tenue s'étire (342
    # caractères par ligne mesurés à 3840 sur la sonde du 12/09) ; le tableau principal d'une
    # page de données reste à sa largeur de contenu pendant que l'écran en offre le double.
    ("v18_prose_etiree", "V18 mesure de lecture au-dela de 135 caracteres par ligne", "bloquant"),
    ("v18_tableau_etrique", "V18 tableau principal sous 85 % de la largeur offerte", "bloquant"),
    ("l2_freres", "L2 alignement entre frères empilés", "avertissement"),
    ("v3_align", "V3 alignement d'une série", "avertissement"),
    ("v7_spacing", "V7 rythme d'espacement", "avertissement"),
    ("unmeasured", "Non mesurable — à vérifier à l'œil", "info"),
]
BLOQUANTES = [c for c, _l, sev in FAMILLES if sev == "bloquant"]
AVERTIES = [c for c, _l, sev in FAMILLES if sev == "avertissement"]
LIBELLE = {c: l for c, l, _sev in FAMILLES}
SEVERITE = {c: sev for c, _l, sev in FAMILLES}

CAPTURE_TIMEOUT_DEFAUT = 30_000

# TF-1139 (lot Produit-64 20260915a, 15/09/2026) — LE SEUIL AU-DELÀ DUQUEL UNE PAGE N'EST PLUS
# JUGEABLE VISUELLEMENT, ET IL N'ÉTAIT PUBLIÉ NULLE PART.
#
# LE FAIT, MESURÉ. Page de référence de 15 228 mots. Hauteurs relevées par l'oracle lui-même :
# 54 793 px à 2560 px de large, 62 127 px à 1280, 98 079 px à 768, 123 822 px à 390. Quatre
# exécutions successives, échelles 0,4 / 0,35 / 0,3 / 0,25 / 0,2 / 0,12, délais de 45 s à 300 s :
# AUCUNE n'a produit d'image, et DEUX ont tourné plus de trente minutes avant d'être arrêtées.
# L'oracle se comportait honnêtement — familles du DOM jugées, V5/V6 déclarées non jugées avec
# leur motif. Le défaut est ailleurs : un auteur ne savait pas, AVANT d'écrire, à partir de
# quelle hauteur son livrable cesserait d'être jugeable, ni que le temps de le découvrir se
# comptait en dizaines de minutes par tentative.
#
# OÙ LE SEUIL EST POSÉ, ET SUR QUELLES MESURES. Sous le plus bas ÉCHEC mesuré (54 793 px, le
# 15/09) et au-dessus du plus haut SUCCÈS mesuré (22 740 px CSS — la capture 780 × 45 480 de
# TF-1131, à 390 px et échelle 2). Entre 22 740 et 50 000, aucune mesure : la tentative a donc
# bien lieu, et c'est délibéré — un seuil posé trop bas retirerait la capture à des pages qui
# l'obtiennent. `--hauteur-max` déplace la borne quand un auteur veut tenter quand même ; la
# valeur employée est publiée à chaque exécution, seuil par défaut ou seuil forcé.
CAPTURE_HAUTEUR_MAX = 50_000  # px CSS de scrollHeight, au-delà : constat nommé, aucune tentative


class _SautDeCapture(Exception):
    """Sortie propre du bloc de capture quand la page est au-delà du seuil (TF-1139)."""

FAMILLES_SANS_IMAGE = "V1 debordement, V2 contraste, V4 chevauchement, V3, V7, L2"
FAMILLES_AVEC_IMAGE = "V5 croisements et V6 images"


# ---- V9 · la mesure des ACTIFS VISUELS, au pixel et dans leur contexte (TF-0633) -------------
#
# POURQUOI AU PIXEL, ET PAS PAR LES STYLES. Un actif visuel n'a pas de `color` : il a des pixels.
# Un SVG referencé par `<img src>` n'est meme pas dans le DOM de la page, et le lire au canvas
# salirait le contexte sur une page `file://`. La capture de l'element est donc la SEULE lecture
# qui voit ce qui est SERVI plutot que ce qui est DECLARE — et c'est exactement la verification
# qui manquait le 25/08 : « le correctif a capture le bandeau et le defaut a saute aux yeux ».
#
# LE SEUIL, ET POURQUOI IL EST BAS. WCAG 2.2 SC 1.4.11 demande 3:1 pour un objet graphique
# porteur de sens. Ce controle ne juge PAS a 3:1, et c'est delibere : distinguer un actif porteur
# de sens d'un decor demande un jugement, et une sonde qui accuserait tout aplat decoratif se
# ferait eteindre — c'est la lecon de N-33 et celle du resserrage de S26. Il juge l'INDISCERNABLE :
# aucun pixel de l'actif n'atteint 1,2 de contraste contre le fond peint derriere lui. A ce niveau
# il n'y a plus de jugement a rendre, l'actif n'est pas la. Le cas fondateur mesurait 1,0.
# Ce qui vit entre 1,2 et 3,0 est DECLARE non juge plutot que tu.
_V9_SEUIL = 1.2
_V9_MAX_PIXELS = 40_000        # au-dela, l'actif est reechantillonne : la couleur ne change pas


def _v9_luminance(c) -> float:
    def f(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def _v9_ratio(c1, c2) -> float:
    a, b = sorted((_v9_luminance(c1), _v9_luminance(c2)), reverse=True)
    return (a + 0.05) / (b + 0.05)


# TF-1143 (lot Produit-64 20260916a, retour RD-3, 16/09/2026) — LE FACTEUR D ECHELLE, DOCUMENTE
# COMME UNE AIDE A LA CAPTURE, RENDAIT UN VERDICT BLOQUANT SUR UNE PAGE CONFORME.
#
# LE FAIT. Meme fichier, meme largeur de fenetre : `--widths 390 --scale 1` rend PASS,
# `--widths 390 --scale 0.5` rend FAIL avec un bloquant V9 « actif visuel indiscernable de son
# fond », meilleur contraste 1,10:1 (mesure rapportee par le lot ; la contre-mesure Playwright a
# l echelle native du meme SVG donnait 18,1:1). La page n avait pas change : a echelle reduite le
# rasteriseur noie une police de 13 px rendue a moins de deux pixels, et il ne reste que du
# quasi-blanc a mesurer.
#
# CONTRE-MESURE FAITE ICI, sur la fixture `v9-texte-fin-a-echelle-reduite.html`, meme page, meme
# largeur de 1280 px, capture de l actif par Playwright et calcul du meilleur contraste :
#   echelle 2   -> 630 x 42 px, 26 460 pixels opaques, meilleur contraste 17,85:1
#   echelle 1   -> 315 x 21 px,  6 615 pixels opaques, meilleur contraste 17,85:1
#   echelle 0,5 -> 158 x 11 px,  1 738 pixels opaques, meilleur contraste 10,85:1
#   echelle 0,4 -> 126 x  8 px,  1 008 pixels opaques, meilleur contraste  6,39:1
#   echelle 0,25 ->  79 x  5 px,   395 pixels opaques, meilleur contraste  3,66:1
# Le contraste mesure perd un facteur CINQ sans qu un pixel de la page ait bouge : ce que V9 lit
# sous l echelle 1 est une propriete de la rasterisation, pas du livrable.
#
# CE QUE COUTAIT LE SILENCE. Le premier reflexe devant un bloquant V9 est de changer la charte du
# livrable — foncer le remplissage des boites de schema jusqu a passer le seuil. Ce geste aurait
# degrade huit schemas pour satisfaire un artefact.
#
# LA DECISION, ET ELLE N ASSOUPLIT RIEN. A l echelle 1 et au-dessus — dont l echelle 2 par
# defaut — V9 est inchangee, seuil compris. SOUS l echelle 1, elle ne rend plus de BLOQUANT : le
# constat part au non juge avec sa raison, exactement comme le socle le fait deja pour une
# capture impossible ou un actif entierement transparent. Un verdict qu on sait etre un artefact
# n est pas un verdict — le taire aurait ete l assouplissement, le declarer ne l est pas.
V9_ECHELLE_MIN_BLOQUANTE = 1.0


def mesurer_actifs_visuels(page, issues: dict, timeout_ms: int, echelle: float = 1.0) -> None:
    """Juge chaque actif visuel contre le fond REELLEMENT peint derriere lui.

    Ne leve jamais : tout ce qui empeche la mesure est DECLARE au non_juge. Le silence d'une
    sonde n'est pas un verdict (TF-0582), et une sonde qui plante emporterait avec elle les
    familles deja mesurees.
    """
    cibles = issues.pop("v9_cibles", None) or []
    issues.setdefault("v9_actif_invisible", [])
    if not cibles:
        return
    try:
        import io as _io
        from PIL import Image
    except ImportError:
        issues["unmeasured"].append({
            "what": f"{len(cibles)} actif(s) visuel(s)",
            "detail": "V9 non jugee : Pillow absent de l'environnement. `pip install pillow`",
        })
        return
    for c in cibles:
        if c.get("nonMesurable"):
            issues["unmeasured"].append({"what": c["what"], "detail": f"V9 — {c['nonMesurable']}"})
            continue
        bg = c.get("bg") or {}
        fond = (bg.get("r", 255), bg.get("g", 255), bg.get("b", 255))
        el = page.query_selector(f'[data-v9="{c["n"]}"]')
        if el is None:
            issues["unmeasured"].append({"what": c["what"], "detail": "V9 — element introuvable a la capture"})
            continue
        try:
            brut = el.screenshot(timeout=timeout_ms)
            im = Image.open(_io.BytesIO(brut)).convert("RGBA")
        except Exception as erreur:      # noqa: BLE001 — toute panne se declare, aucune n'arrete
            issues["unmeasured"].append({
                "what": c["what"],
                "detail": f"V9 — capture impossible ({type(erreur).__name__}) : contraste de l'actif non juge",
            })
            continue
        if im.width * im.height > _V9_MAX_PIXELS:
            cote = max(1, int((_V9_MAX_PIXELS / max(1, im.width * im.height)) ** 0.5 * min(im.width, im.height)))
            im = im.resize((max(1, im.width * cote // max(1, min(im.width, im.height))),
                            max(1, im.height * cote // max(1, min(im.width, im.height)))))
        couleurs = im.getcolors(maxcolors=1 << 20) or []
        # Les pixels TRANSPARENTS laissent voir le fond : ils ne sont pas l'actif, et les compter
        # ferait passer pour « contrastant » un logo invisible pose sur un fond clair.
        opaques = [(n, px) for n, px in couleurs if px[3] >= 250]
        if not opaques:
            issues["unmeasured"].append({"what": c["what"], "detail": "V9 — actif entierement transparent : rien a mesurer"})
            continue
        total = sum(n for n, _ in opaques)
        meilleur = max(_v9_ratio(px[:3], fond) for _, px in opaques)
        if meilleur < _V9_SEUIL:
            domine = max(opaques)[1]
            if echelle < V9_ECHELLE_MIN_BLOQUANTE:
                # TF-1143 — la capture a ete REDUITE : ce qui est mesure ici est la rasterisation,
                # pas le livrable. Le constat se DIT, il ne bloque pas.
                issues["unmeasured"].append({
                    "what": c["what"],
                    "detail": (
                        f"V9 NON JUGEE a l echelle {echelle:g} : capture REDUITE "
                        f"({im.width}x{im.height} px, {total} pixels opaques), meilleur contraste "
                        f"mesure {meilleur:.2f}:1 — sous le seuil {_V9_SEUIL}, mais la reduction "
                        "seule suffit a l expliquer. Contre-mesure du socle sur un libelle de "
                        "13 px inchange : 17,85:1 a l echelle 1, 6,39:1 a 0,4. Rejouer a "
                        "`--scale 1` avant de toucher a la charte du livrable — foncer un aplat "
                        "pour passer un artefact de rasterisation degrade la page pour rien"),
                })
                continue
            issues["v9_actif_invisible"].append({
                "what": c["what"],
                "detail": (
                    f"actif INDISCERNABLE de son fond — meilleur contraste {meilleur:.2f}:1 sur "
                    f"{total} pixels opaques, contre un fond rgb({fond[0]:.0f}, {fond[1]:.0f}, {fond[2]:.0f}). "
                    f"Couleur dominante de l'actif : rgb({domine[0]}, {domine[1]}, {domine[2]}). "
                    "Un actif visuel se valide dans le contexte OU IL EST SERVI, pas sur son fichier : "
                    "un logo blanc devenu sombre est juste sur son fichier et absent du bandeau (TF-0633)"
                ),
            })


def compter_bloquants(issues: dict) -> int:
    """Les CAUSES bloquantes d'un jeu de mesures.

    TF-0382 — `blocking` comptait les LIGNES d'une liste plafonnee, donc la severite etait
    plafonnee avec elle. Il compte les CAUSES reelles : le total exact quand l'inventaire a ete
    tronque, la longueur de la liste sinon. Ce n'est pas un assouplissement — le compte MONTE des
    qu'il y a plus de causes que de lignes.
    TF-0493 — extrait en fonction pour etre applique a l'identique aux etats de la matrice : un
    etat juge avec un autre bareme que l'etat au repos ne serait pas comparable a lui.
    `l2_freres` (TF-0491) n'y figure pas : c'est un avertissement, et il le reste ici.
    """
    # DÉRIVÉ de la table unique : ajouter une famille bloquante ne demande plus de penser à ce
    # compteur, et en oublier une ici n'est plus possible.
    total = issues.get("v1_tronque", {}).get("total") or len(issues.get("v1_overflow", []))
    for cle in BLOQUANTES:
        if cle == "v1_overflow":
            continue                      # déjà compté ci-dessus, borne comprise
        total += len(issues.get(cle, []) or [])
    return total


def run(html_path: Path, widths: list[int], selector: str, scale: float, as_json: bool,
        out_dir: Path | None = None, etats_ouverts: bool = False,
        capture_timeout: int = CAPTURE_TIMEOUT_DEFAUT, sections: str | None = None,
        matrice_etats: bool = False, matrice_toutes_largeurs: bool = False,
        hauteur_max: int = CAPTURE_HAUTEUR_MAX) -> int:
    ensure_browser_path()
    ensure_local_fonts()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("ERREUR : playwright non installé.\n  pip install playwright && playwright install chromium")

    js = (MEASURE_JS
          .replace("__OVERLAP_MIN_RATIO__", str(OVERLAP_MIN_RATIO))
          .replace("__ALIGN_TOL__", str(ALIGN_TOLERANCE_PX))
          .replace("__V7_MAX__", str(V7_MAX_DETAILS))
          .replace("__L2_MIN_RATIO__", str(L2_MIN_RATIO))
          .replace("__L2C_MIN_RATIO__", str(L2C_MIN_RATIO))
          .replace("__L2_MIN_VIEWPORT__", str(L2_MIN_VIEWPORT))
          .replace("__L2_MIN_CHARS__", str(L2_MIN_CHARS))
          .replace("__L2F_MIN_RATIO__", str(L2_FRERES_MIN_RATIO))
          .replace("__L2F_MIN_LARGEUR__", str(L2_FRERES_MIN_LARGEUR))
          .replace("__L2_COL_MAX__", str(L2_COL_MAX))
          .replace("__L2_ETIQUETTE_MAX__", str(L2_ETIQUETTE_MAX))
          .replace("__DONNEES_PROSE_MIN__", str(DONNEES_PROSE_MIN_RATIO))
          .replace("__ROGNAGE_MIN_VIEWPORT__", str(ROGNAGE_DONNEES_MIN_VIEWPORT))
          .replace("__DONNEES_CONTENEUR_MIN_VIEWPORT__", str(ROGNAGE_DONNEES_MIN_VIEWPORT))
          .replace("__DONNEES_CONTENEUR_MIN__", str(DONNEES_CONTENEUR_MIN_RATIO))
          .replace("__SOMMAIRE_MIN_CHAP__", str(SOMMAIRE_MIN_CHAPITRES))
          .replace("__SOMMAIRE_MIN_ECRANS__", str(SOMMAIRE_MIN_ECRANS)))

    js_large = (MESURE_LARGE_JS
                .replace("__V18_MAX_CPL__", str(V18_MAX_CPL))
                .replace("__V18_MIN_CHARS__", str(V18_MIN_CHARS))
                .replace("__V18_TABLE_MIN__", str(V18_TABLE_MIN_RATIO))
                .replace("__V18_TABLE_LIGNES__", str(V18_TABLE_MIN_LIGNES))
                .replace("__V18_TABLE_COLONNES__", str(V18_TABLE_MIN_COLONNES)))

    png_dir = _dossier_captures(html_path, out_dir)
    png_dir.mkdir(parents=True, exist_ok=True)

    report: dict = {"file": str(html_path), "png_dir": str(png_dir),
                    "breakpoints": {}, "verdict": None, "non_juge": []}
    blocking_total = 0
    captures_manquees: list[int] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in widths:
            page = browser.new_page(viewport={"width": width, "height": 900},
                                    device_scale_factor=scale)
            page.goto(html_path.resolve().as_uri())
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts && document.fonts.ready")
            page.wait_for_timeout(250)

            # TF-0176 (13/08) : --etats-ouverts — l'oracle ne jugeait que l'état FERMÉ ;
            # panneaux de filtres et détails repliés échappaient à V1/V2/V4 et aux captures
            # (un panneau non stylé, illisible, est sorti « tous oracles verts »). Le flag
            # ouvre tout <details>, le premier panneau de filtre/dropdown, et remplit le
            # premier champ de recherche — puis mesure et capture CET état.
            if etats_ouverts:
                page.evaluate("""() => {
                  document.querySelectorAll('details').forEach(d => d.open = true);
                  const btn = document.querySelector('.tf-btn, .dd-btn');
                  if (btn) btn.click();
                }""")
                champ = page.query_selector("input[type='search'], .tf-search")
                if champ:
                    champ.fill("a")
                page.wait_for_timeout(250)

            issues = page.evaluate(js)
            # TF-0901 — V15 se mesure APRES DEFILEMENT, donc apres la passe principale et avant
            # la capture (qui remet la page en haut). Ne leve jamais : une page sans tableau rend
            # une liste vide, et une panne se declare au non_juge plutot que d'emporter le reste.
            try:
                v15 = page.evaluate(MESURE_ENTETE_JS)
                issues["entete_pose_sur_lignes"] = v15.get("poses") or []
                issues["entete_ne_colle_pas"] = v15.get("decolles") or []
                issues["entete_masque_par_collants"] = v15.get("masques") or []
                issues["entete_bride_par_tableau"] = v15.get("brides") or []
            except Exception as erreur:  # noqa: BLE001 — toute panne se declare, aucune n'arrete
                issues["entete_pose_sur_lignes"] = []
                issues["entete_ne_colle_pas"] = []
                issues["entete_masque_par_collants"] = []
                issues["entete_bride_par_tableau"] = []
                issues["unmeasured"].append({
                    "what": "V15 en-tetes de tableau",
                    "detail": f"V15 non jugee ({type(erreur).__name__}) : la mesure apres "
                              "defilement n'a pas pu etre jouee. Ne pas lire ce silence comme un vert",
                })
            # TF-1066 — V18 ne se joue qu'aux GRANDES largeurs : les deux defauts qu'elle mesure
            # n'existent pas en deca (une prose bornee par le viewport ne s'etire pas, un tableau
            # a l'etroit dans 1 280 px n'a pas de place a prendre). Les cles sont posees a toute
            # largeur — vides quand la mesure n'est pas jouee — pour qu'un consommateur ne
            # distingue jamais « pas de defaut » de « cle absente ».
            issues["v18_prose_etiree"] = []
            issues["v18_tableau_etrique"] = []
            if width >= V18_MIN_VIEWPORT:
                try:
                    v18 = page.evaluate(js_large)
                    issues["v18_prose_etiree"] = v18.get("proses") or []
                    issues["v18_tableau_etrique"] = v18.get("tableaux") or []
                    issues["unmeasured"].extend(v18.get("notes") or [])
                except Exception as erreur:  # noqa: BLE001 — toute panne se declare, aucune n'arrete
                    issues["unmeasured"].append({
                        "what": "V18 mesure de lecture et tableau principal",
                        "detail": f"V18 non jugee ({type(erreur).__name__}) a {width} px : ne pas "
                                  "lire ce silence comme un vert",
                    })
            # TF-1143 — V9 doit savoir a quelle echelle elle regarde : sous l echelle 1, ce
            # qu elle lit est la rasterisation et non le livrable.
            mesurer_actifs_visuels(page, issues, capture_timeout, scale)
            png = png_dir / f"{html_path.stem}-w{width}.png"
            target = page.query_selector(selector) if selector != "body" else None
            # TF-1139 — LA HAUTEUR SE MESURE AVANT D'ESSAYER. Elle est publiée dans tous les cas :
            # un auteur doit pouvoir lire la marge qui lui reste avant de perdre le jugement
            # visuel, et non la découvrir en deux tentatives de plus de trente minutes.
            hauteur_css = int(page.evaluate("() => document.documentElement.scrollHeight"))
            capture: dict = {"faite": True, "motif": "", "hauteur_css": hauteur_css,
                             "hauteur_max": hauteur_max}
            if hauteur_css > hauteur_max:
                capture = {
                    "faite": False, "hauteur_px": hauteur_css, "hauteur_css": hauteur_css,
                    "hauteur_max": hauteur_max, "trop_haute": True,
                    "motif": (f"page trop haute pour etre jugee visuellement a {width} px : "
                              f"{hauteur_css} px de haut, seuil {hauteur_max} px. AUCUNE "
                              "tentative de capture n est faite — sur le cas fondateur, quatre "
                              "executions et six echelles (0,4 a 0,12) n ont produit aucune "
                              "image, dont deux arretees a la main apres plus de trente minutes. "
                              f"Les familles lues dans le DOM restent JUGEES ({FAMILLES_SANS_IMAGE}) ; "
                              f"{FAMILLES_AVEC_IMAGE} ne sont PAS jugees faute d image. REMEDE : "
                              "DECOUPER la page (un document par chapitre ou par vue) — c est le "
                              "geste, pas un reglage d echelle. `--hauteur-max` deplace la borne "
                              "pour tenter quand meme, et le seuil employe est publie"),
                }
                captures_manquees.append(width)
            try:
                if capture.get("trop_haute"):
                    raise _SautDeCapture       # aucune tentative : le constat est déjà rendu
                if target:
                    target.screenshot(path=str(png), timeout=capture_timeout)
                else:
                    page.screenshot(path=str(png), full_page=True, timeout=capture_timeout)
                    # TF-1131 : au-delà de 4:1, des tuiles d'un écran, produites d'office.
                    capture.update(produire_tuiles(page, png_dir, html_path.stem, width,
                                                   capture_timeout))
                # TF-0422 : une capture PAR SECTION — un panneau d'onglet masqué est rendu
                # visible le temps de sa capture, puis remis dans son état.
                if sections:
                    for i, handle in enumerate(page.query_selector_all(sections), start=1):
                        etait_cache = handle.evaluate("el => { const h = el.hidden; el.hidden = false; return h; }")
                        try:
                            handle.screenshot(path=str(png_dir / f"{html_path.stem}-w{width}-section{i:02d}.png"),
                                              timeout=capture_timeout)
                        finally:
                            if etait_cache:
                                handle.evaluate("el => { el.hidden = true; }")
                    capture["sections"] = len(page.query_selector_all(sections))
            except _SautDeCapture:
                pass                         # TF-1139 : `capture` porte déjà son motif nommé
            except Exception as erreur:  # noqa: BLE001 — toute panne, pas seulement le delai
                hauteur = page.evaluate("() => document.documentElement.scrollHeight")
                capture = {
                    "faite": False,
                    "hauteur_px": hauteur,
                    "motif": (f"capture impossible a {width} px : {type(erreur).__name__} — "
                              f"page haute de {hauteur} px, delai {capture_timeout} ms. Les "
                              f"familles lues dans le DOM restent JUGEES ({FAMILLES_SANS_IMAGE}) ; "
                              f"{FAMILLES_AVEC_IMAGE} ne sont PAS jugees faute d image. "
                              "Augmenter --timeout, reduire --scale, ou assumer l ecart declare"),
                }
                captures_manquees.append(width)
            # TF-0382 — `blocking` comptait les LIGNES d'une liste plafonnee, donc la severite
            # etait plafonnee avec elle. Il compte desormais les CAUSES reelles : le total exact
            # quand l inventaire a ete tronque, la longueur de la liste sinon. Ce n est pas un
            # assouplissement — le compte MONTE des qu il y a plus de causes que de lignes.
            blocking = compter_bloquants(issues)
            blocking_total += blocking
            report["breakpoints"][width] = {
                "png": str(png) if capture["faite"] else None,
                "capture": capture, "issues": issues, "blocking": blocking,
            }

            # ---- TF-0493 · la matrice d'etats -------------------------------------------
            # Chaque etat REPART d'une page neuve : un etat qui heriterait du precedent ne
            # serait plus l'etat qu'il pretend etre. Cout assume, et c'est pour cela que la
            # matrice ne se joue par defaut qu'a la largeur la plus grande — celle ou les
            # panneaux ont le plus de place et debordent quand meme.
            if matrice_etats and (matrice_toutes_largeurs or width == max(widths)):
                etats: dict = {}
                for nom, action in ETATS_MATRICE:
                    page.goto(html_path.resolve().as_uri())
                    page.wait_for_load_state("networkidle")
                    page.wait_for_timeout(150)
                    try:
                        applique = page.evaluate(action)
                    except Exception as erreur:  # noqa: BLE001
                        applique = {"applique": False,
                                    "motif": f"le declencheur a leve {type(erreur).__name__}"}
                    if not applique.get("applique"):
                        etats[nom] = {"applique": False, "motif": applique.get("motif", "")}
                        report["non_juge"].append(
                            f"etat « {nom} » NON JOUE a {width} px : {applique.get('motif', '')}")
                        continue
                    page.wait_for_timeout(250)
                    iss_e = page.evaluate(js)
                    png_e = png_dir / f"{html_path.stem}-w{width}-etat-{nom}.png"
                    cap_e = {"faite": True, "motif": ""}
                    try:
                        page.screenshot(path=str(png_e), full_page=True, timeout=capture_timeout)
                    except Exception as erreur:  # noqa: BLE001
                        cap_e = {"faite": False,
                                 "motif": f"capture impossible : {type(erreur).__name__} — "
                                          f"les familles du DOM restent jugees"}
                    # UN ETAT VIDE SE DIT. Verification propre a l'etat, la ou une famille
                    # generale n'a rien a mesurer : la geometrie est saine, c'est le SILENCE
                    # qui est le defaut.
                    verif = VERIF_ETATS.get(nom)
                    if verif:
                        try:
                            vu = page.evaluate(verif)
                        except Exception:  # noqa: BLE001
                            vu = None
                        if vu and vu.get("lignes") == 0 and not vu.get("dit"):
                            iss_e.setdefault("etat_muet", []).append({
                                "what": f"état « {nom} »",
                                "detail": "plus AUCUNE ligne visible, et pas un mot pour le "
                                          "dire — le lecteur voit un tableau réduit à quelques "
                                          "pixels et ne sait pas si l'outil a filtré ou cassé. "
                                          "Le socle prescrit la forme du message : .tf-count "
                                          "en zone vivante (aria-live) avec la classe zero, ou "
                                          ".tf-vide-msg. Loi n° 3 : un état vide se déclare"})
                    bloq_e = compter_bloquants(iss_e)
                    blocking_total += bloq_e
                    etats[nom] = {"applique": True, "motif": applique.get("motif", ""),
                                  "png": str(png_e) if cap_e["faite"] else None,
                                  "capture": cap_e, "issues": iss_e, "blocking": bloq_e}
                report["breakpoints"][width]["etats"] = etats
            page.close()
        browser.close()

    report["verdict"] = "PASS" if blocking_total == 0 else "FAIL"

    # TF-0365 — ce qui n a pas pu etre mesure se DIT, dans la sortie machine autant qu au
    # terminal. Un PASS qui tairait l absence des images serait plus faible que celui d hier en
    # ayant l air identique : c est exactement le silence que cet item ferme.
    report["captures_manquees"] = captures_manquees
    if captures_manquees:
        largeurs = ", ".join(f"{w} px" for w in captures_manquees)
        report["non_juge"].append(
            f"{FAMILLES_AVEC_IMAGE} : NON JUGEES a {largeurs} — capture impossible, aucune image "
            f"a inspecter. Les familles du DOM ({FAMILLES_SANS_IMAGE}) sont jugees et comptent "
            "dans le verdict")
        if len(captures_manquees) == len(widths):
            report["non_juge"].append(
                "AUCUNE largeur n a produit d image : le verdict ne porte que sur les mesures du "
                "DOM. Il est valide pour ce qu il dit, et muet sur le rendu — ne pas le lire "
                "comme une inspection visuelle faite")
    else:
        report["non_juge"].append(f"{FAMILLES_AVEC_IMAGE} : a inspecter sur les PNG produits")

    # TF-1139 — LE SEUIL SE PUBLIE, ET LA HAUTEUR MESUREE AVEC LUI. Un auteur doit savoir AVANT
    # d ecrire a partir de quelle hauteur son livrable cesse d etre jugeable visuellement ; le
    # decouvrir coutait quatre executions, six echelles et deux arrets manuels apres plus de
    # trente minutes. La ligne sort a chaque execution, que le seuil soit atteint ou non.
    report["hauteur_max"] = hauteur_max
    hauteurs = {w: (d.get("capture") or {}).get("hauteur_css")
                for w, d in report["breakpoints"].items()}
    releve = ", ".join(f"{h} px a {w} px" for w, h in hauteurs.items() if h is not None)
    trop_hautes = [w for w, d in report["breakpoints"].items()
                   if (d.get("capture") or {}).get("trop_haute")]
    if trop_hautes:
        report["non_juge"].append(
            f"HAUTEUR : seuil de jugement visuel {hauteur_max} px CSS — DEPASSE a "
            f"{', '.join(str(w) + ' px' for w in trop_hautes)} ({releve}). Aucune capture n a ete "
            "TENTEE a ces largeurs : sur le cas fondateur, quatre executions et six echelles "
            "(0,4 a 0,12) n ont produit aucune image, deux arretees a la main apres plus de "
            "trente minutes. Le remede est de DECOUPER la page, pas de baisser l echelle "
            "(zero-defaut-visuel.md, « Seuil de hauteur »)")
    else:
        report["non_juge"].append(
            f"HAUTEUR : seuil de jugement visuel {hauteur_max} px CSS, non atteint ({releve}). "
            "Au-dela, aucune capture n est tentee et le constat est rendu immediatement — le "
            "remede est de decouper la page. `--hauteur-max` deplace la borne")

    # V9 dit ou elle s'arrete. WCAG 2.2 SC 1.4.11 demande 3:1 pour un objet graphique PORTEUR DE
    # SENS ; distinguer le porteur de sens du decor demande un jugement, et une sonde qui
    # accuserait tout aplat decoratif se ferait eteindre. V9 ne juge donc que l'INDISCERNABLE.
    # V18 dit OU elle a regarde. Une grille jouee sans largeur >= 2560 ne prouve rien du 4K, et
    # un verdict vert lu comme « la page tient au 4K » serait faux (regle E5 du pilot).
    larges = [w for w in widths if w >= V18_MIN_VIEWPORT]
    if larges:
        report["non_juge"].append(
            f"V18 : jugee a {', '.join(str(w) + ' px' for w in larges)}. Plafond {V18_MAX_CPL} "
            "caracteres par ligne (decision humaine du 15/09/2026, 13a, TF-1069) : le token du "
            "socle `.chap.lire` (1 080 px, E4) mesure 134 caracteres par ligne en 16 px, sous ce "
            "plafond, et rentre desormais directement dans les proses jugees. Un paragraphe TENU "
            "par un conteneur de lecture declare (.lire, [data-mesure-lecture]) reste, lui, "
            f"jamais bloque meme au-dela de {V18_MAX_CPL} caracteres : sa mesure est publiee en "
            "non mesurable pour un chapitre plus large que le token du socle")
    else:
        report["non_juge"].append(
            f"V18 NON JOUEE : aucune largeur >= {V18_MIN_VIEWPORT} px dans cette grille. La prose "
            "etiree et le tableau principal etrique du 4K ne sont pas juges — ne pas lire ce "
            "silence comme une page verifiee jusqu a 3840 px (regle E5)")

    # TF-1143 — UNE ECHELLE REDUITE SE DECLARE, ET LE VERDICT AVEC. Sous l echelle 1, ce que V9
    # lit est la rasterisation ; elle ne rend donc plus de bloquant, et ce choix se publie —
    # sans quoi un PASS obtenu a `--scale 0.4` se lirait comme un PASS obtenu a l echelle native.
    if scale < V9_ECHELLE_MIN_BLOQUANTE:
        report["non_juge"].append(
            f"ECHELLE {scale:g} : la capture est REDUITE, et V9 ne rend AUCUN bloquant sous "
            f"l echelle {V9_ECHELLE_MIN_BLOQUANTE:g} — ses constats partent au non juge avec leur "
            "raison. Contre-mesure du socle sur un libelle de 13 px inchange, meme page et meme "
            "largeur : 17,85:1 a l echelle 1, 10,85:1 a 0,5, 6,39:1 a 0,4, 3,66:1 a 0,25 ; le "
            "contraste mesure perd un facteur cinq sans qu un pixel de la page ait bouge. Ne pas "
            "lire ce PASS comme un contraste d actif verifie : rejouer a `--scale 1`")

    report["non_juge"].append(
        "V9 : un actif visuel dont le contraste vit ENTRE 1,2 et 3,0 contre son fond n'est PAS "
        "juge — sous 1,2 il est indiscernable et c'est un bloquant, au-dela de 3,0 il tient le "
        "seuil WCAG 1.4.11 ; entre les deux, savoir si l'actif porte du sens ou decore est un "
        "jugement humain. Ne pas lire ce silence comme un vert")

    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for width, data in report["breakpoints"].items():
            iss = data["issues"]
            # TF-0897 (lot Produit-10 20260907c) — UNE CAPTURE QUI ECHOUE N'EST PAS UNE PANNE DE
            # L'OUTIL. La branche d'echec etait ecrite, mesuree et rendue au JSON (`capture.faite`
            # a False, `png` a None, largeur portee a `captures_manquees`), et la sortie TEXTE la
            # traversait quand meme en `Path(None)` : TypeError, exit 1, traceback dans le journal
            # R-32, AUCUN verdict pour la largeur concernee — alors que toutes les familles lues
            # dans le DOM etaient deja mesurees. Mesure du 07/09 : page de 188 Ko (~13 500 px de
            # haut) a 768 px et echelle 2, reproduit deux fois ; le meme appel en echelle 1 rendait
            # PASS. Ce qui n'a pas pu etre capture se DIT, et le reste du verdict se rend.
            nom_png = Path(data["png"]).name if data.get("png") else "capture NON FAITE"
            print(f"\n===== {width}px — {nom_png} =====")
            cap = data.get("capture") or {}
            if cap.get("tuiles"):
                reste = cap.get("tuiles_non_produites")
                print(f"  [capture] pleine page à {cap['ratio']}:1 — ILLISIBLE une fois réduite "
                      f"(au-delà de {TUILES_RATIO:g}:1) : {len(cap['tuiles'])} tuile(s) d'un écran "
                      f"produite(s) pour la revue de lecture, {cap['tuiles'][0]} … {cap['tuiles'][-1]}"
                      + (f" ; {reste} écran(s) au-delà de la borne NON capturé(s)" if reste else ""))
            if not data.get("png"):
                print(f"  [capture] {data['capture'].get('motif', 'capture impossible')}")
            for key, title, sev in FAMILLES:
                kind = {"bloquant": "BLOQUANT", "avertissement": "avertissement"}.get(sev, "à vérifier visuellement")
                for item in iss.get(key, []) or []:
                    print(f"  [{kind}] {title} : {item['what']} — {item['detail']}")
            if iss.get("v1_tronque"):
                print(f"  [BORNE] V1 : {iss['v1_tronque']['motif']}")
            if data["blocking"] == 0 and not any(iss[k] for k in ("l2_freres", "v3_align", "v7_spacing", "unmeasured")):
                print("  aucun défaut mesuré")
            # TF-0493 — la matrice d'etats, etat par etat. Un etat NON JOUE se lit ici aussi :
            # « aucun défaut » sur un etat qui ne s'est jamais applique serait le pire des verdicts.
            for nom, e in (data.get("etats") or {}).items():
                if not e.get("applique"):
                    print(f"  — état « {nom} » NON JOUÉ : {e.get('motif', '')}")
                    continue
                print(f"  — état « {nom} » ({e.get('motif', '')}) : "
                      f"{e['blocking']} bloquant(s)")
                for key, title, sev in FAMILLES:
                    kind = {"bloquant": "BLOQUANT", "avertissement": "avertissement"}.get(sev, "info")
                    for item in e["issues"].get(key, []) or []:
                        print(f"      [{kind}] {title} : {item['what']} — {item['detail']}")
        print(f"\nVerdict : {report['verdict']}")
        for note in report["non_juge"]:
            print(f"  non jugé — {note}")
        print(f"PNG : {png_dir}")
    return 0 if report["verdict"] == "PASS" else 1


# TF-1131 (lot Produit-64 20260913a, 15/09/2026) — UNE CAPTURE QU'ON NE PEUT PAS LIRE N'EST PAS
# UNE PIÈCE DE REVUE. La capture pleine page d'un livrable mesurait 3840 × 19012 px à 1920 et
# 780 × 45480 à 390 : ramenées à l'écran du relecteur, 404 × 2000 et 34 × 2000 — un corps de 16 px
# y tient sur moins de deux pixels. La revue de lecture s'est déclarée faite, cinq défauts sont
# passés. Au-delà d'un rapport hauteur/largeur de 4:1, le script produit D'OFFICE des tuiles d'UN
# ÉCRAN (la hauteur de la fenêtre de rendu, ce qu'un lecteur voit à la fois), numérotées, et le dit
# dans sa sortie. La capture pleine page reste produite, marquée illisible à l'échelle.
TUILES_RATIO = 4.0            # au-delà, la capture pleine page n'est plus lisible une fois réduite
TUILES_HAUTEUR_CSS = 900      # hauteur de la fenêtre de rendu : une tuile = un écran
TUILES_MAX = 60               # borne déclarée : au-delà, la sortie dit combien manquent

def produire_tuiles(page, png_dir: Path, stem: str, width: int, timeout_ms: int) -> dict:
    """TF-1131 — rapport de la capture pleine page, et ses tuiles d'un écran s'il dépasse 4:1."""
    hauteur = int(page.evaluate("() => document.documentElement.scrollHeight"))
    ratio = hauteur / max(1, width)
    info: dict = {"hauteur_css": hauteur, "ratio": round(ratio, 2)}
    if ratio <= TUILES_RATIO:
        return info
    n = -(-hauteur // TUILES_HAUTEUR_CSS)
    tuiles = []
    for i in range(min(n, TUILES_MAX)):
        y = i * TUILES_HAUTEUR_CSS
        nom = png_dir / f"{stem}-w{width}-ecran{i + 1:02d}.png"
        page.screenshot(path=str(nom), full_page=True, timeout=timeout_ms,
                        clip={"x": 0, "y": y, "width": width,
                              "height": min(TUILES_HAUTEUR_CSS, hauteur - y)})
        tuiles.append(nom.name)
    info["tuiles"] = tuiles
    if n > TUILES_MAX:
        info["tuiles_non_produites"] = n - TUILES_MAX
    return info


# TF-0230 (lot Produit-10, 14/08) — reconstat sur TF-0058, archivé « corrigé » et ne l'étant
# qu'à moitié. Le correctif d'origine avait déplacé les PNG d'un cran, dans un sous-dossier
# `.oracles/` du dossier audité. Or le MOTIF de l'item était « 12 PNG dans le dossier même que
# le client reçoit » : auditer un livrable de `output\` y déposait toujours 25 Mo de captures,
# qu'il a fallu déplacer à la main. Un sous-dossier d'un dossier livré reste dans ce qui est
# livré. Corriger « à moitié » puis archiver, c'est fermer un item sans fermer le défaut — et
# le registre ment ensuite sur son propre reste-à-faire.
#
# Règle : les captures ne tombent JAMAIS dans un arbre de livraison. Elles sont un artefact
# d'atelier (V5/V6 s'inspectent à l'œil, puis on n'en fait plus rien) ; leur place par défaut
# est hors du projet, et leur chemin est imprimé pour qu'on les retrouve. `--out` reste le
# moyen de les garder — c'est ce que fait un run qui veut les journaliser.
DOSSIERS_LIVRAISON = {"output", "old", "livrables", "dist", "public"}


def _dossier_captures(html_path: Path, out_dir: Path | None) -> Path:
    """Où déposer les PNG. `--out` explicite fait foi ; sinon, jamais un arbre de livraison."""
    if out_dir is not None:
        return out_dir
    resolu = html_path.resolve()
    parents = {p.name.lower() for p in resolu.parents}
    if parents & DOSSIERS_LIVRAISON:
        import tempfile
        return Path(tempfile.gettempdir()) / "digit-ai-render" / resolu.stem
    return resolu.parent / ".oracles"


def main() -> None:
    ap = argparse.ArgumentParser(description="Rendu + mesures : V1/V2/V4 et L2-largeur bloquants, V3/V7 avertissements")
    # Optionnel : `--familles` publie la table des poids et ne rend aucune page. Sans ce
    # nargs, argparse refusait la commande avant meme d'atteindre le drapeau.
    ap.add_argument("html", type=Path, nargs="?")
    ap.add_argument("--widths", default=",".join(map(str, DEFAULT_WIDTHS)),
                    help="largeurs de viewport, séparées par des virgules")
    ap.add_argument("--selector", default="body", help="ex. .diagram-wrap pour un schéma")
    # TF-0365 — `--scale` en FLOTTANT : `--scale 0.4` sortait « invalid int value », alors que
    # réduire l'échelle est le premier levier sur une page très haute (moins de pixels à
    # encoder). Un entier n'était pas une contrainte de Playwright, c'était un type trop étroit.
    ap.add_argument("--scale", type=float, default=2.0,
                    help="facteur d'échelle du rendu ; accepte un flottant (0.4 sur une page "
                         "très haute — moins de pixels à encoder, capture qui aboutit). "
                         "ATTENTION (TF-1143) : sous l'échelle 1 la capture est RÉDUITE et V9 "
                         "n'y rend plus de bloquant — ce qu'elle lirait serait la rastérisation, "
                         "pas le livrable (contraste mesuré d'un libellé de 13 px inchangé : "
                         "17,85:1 à l'échelle 1, 6,39:1 à 0,4). Le choix est publié au non jugé")
    ap.add_argument("--timeout", type=int, default=CAPTURE_TIMEOUT_DEFAUT, dest="capture_timeout",
                    help=f"délai de capture en ms (défaut {CAPTURE_TIMEOUT_DEFAUT}). Une capture "
                         "qui échoue n'interrompt plus l'outil : les familles lues dans le DOM "
                         "restent jugées, V5/V6 sont déclarées NON JUGÉES")
    # TF-1139 — le seuil de jugement visuel est une DONNEE, pas une constante cachee : il se lit
    # dans la sortie a chaque execution, et il se deplace quand un auteur veut tenter quand meme.
    ap.add_argument("--hauteur-max", type=int, default=CAPTURE_HAUTEUR_MAX, dest="hauteur_max",
                    help=f"hauteur CSS au-dela de laquelle AUCUNE capture n'est tentee (defaut "
                         f"{CAPTURE_HAUTEUR_MAX} px). Le constat est rendu immediatement, nomme "
                         "et chiffre, au lieu d'expirer apres des dizaines de minutes ; le remede "
                         "est de DECOUPER la page, pas de baisser --scale")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    ap.add_argument("--out", type=Path, default=None, dest="out_dir",
                    help="dossier des PNG (défaut : <dossier du HTML>/.oracles/, ou un dossier "
                         "temporaire si la page vit dans un arbre de LIVRAISON — "
                         "output/, old/, dist/… : un livrable ne reçoit jamais de captures)")
    ap.add_argument("--etats-ouverts", action="store_true", dest="etats_ouverts",
                    help="TF-0176 : ouvre details + premier panneau de filtre + remplit la "
                         "première recherche AVANT mesures et captures — l'état fermé cache "
                         "les défauts des composants interactifs")
    ap.add_argument("--familles", action="store_true",
                    help="publie la table des familles de constats et leur POIDS, en JSON : "
                         "un consommateur la LIT au lieu d'en tenir une copie (source unique, "
                         "choix humain du 23/08/2026). `v1_tronque` n'y figure pas — c'est une "
                         "borne déclarée, pas une famille")
    ap.add_argument("--matrice-etats", action="store_true", dest="matrice_etats",
                    help="TF-0493 : joue une MATRICE D'ETATS et mesure chacun — tout déplié, "
                         "filtre ouvert sur la première PUIS la dernière colonne (un panneau ne "
                         "déborde pas du même côté), filtre ne laissant aucune ligne, recherche "
                         "sans correspondance. C'est là que les composants cassent, parce que "
                         "personne ne les regarde. Chaque état repart d'une page NEUVE et rend "
                         "sa capture ; un état qui ne trouve pas son déclencheur est déclaré NON "
                         "JOUÉ, jamais vert. Par défaut à la plus GRANDE largeur demandée")
    ap.add_argument("--matrice-toutes-largeurs", action="store_true", dest="matrice_toutes_largeurs",
                    help="joue la matrice d'états à CHAQUE largeur (coût : autant de "
                         "chargements de page que d'états × largeurs)")
    ap.add_argument("--sections", default=None,
                    help="TF-0422 : sélecteur CSS des sections à capturer UNE PAR UNE en plus "
                         "de la page (ex. [role=tabpanel], section.chap) — un panneau masqué "
                         "est rendu visible le temps de sa capture. C'est la matière de la "
                         "revue de lecture (references/gabarit-revue-de-lecture.md)")
    args = ap.parse_args()
    if args.familles:
        print(json.dumps({"schema": "digit-ai/familles-mesure@1",
                          "familles": {c: {"libelle": l, "severite": sev} for c, l, sev in FAMILLES}},
                         ensure_ascii=False, indent=1))
        return 0
    if args.html is None:
        sys.exit("ERREUR : aucun fichier HTML donne (le positionnel n'est optionnel que pour --familles)")
    if not args.html.is_file():
        sys.exit(f"ERREUR : fichier introuvable : {args.html}")
    widths = [int(w) for w in str(args.widths).split(",") if w.strip()]
    raise SystemExit(run(args.html, widths, args.selector, args.scale,
                         args.output == "json", args.out_dir, args.etats_ouverts,
                         args.capture_timeout, args.sections,
                         args.matrice_etats, args.matrice_toutes_largeurs,
                         args.hauteur_max))


if __name__ == "__main__":
    main()
