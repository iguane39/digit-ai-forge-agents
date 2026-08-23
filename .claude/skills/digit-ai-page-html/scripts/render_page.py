"""Rendu multi-breakpoints + mesures zéro-défaut-visuel d'une page HTML Digit-AI.

Oracle mesuré de la checklist canonique references/zero-defaut-visuel.md :
  - V1  débordement horizontal (bloquant)
  - V2  contraste texte/fond WCAG AA : >= 4.5:1, ou >= 3:1 pour texte large (bloquant)
  - V4  chevauchements significatifs entre éléments frères (bloquant,
        sauf superposition déclarée data-overlap-ok, et sauf formes internes
        d'un même <svg> de petite taille — dessin d'icône, pas mise en page)
  - V3/V7  alignements et espacements irréguliers entre frères (avertissements)

V5 (croisements de flèches) et V6 (images déformées) restent à l'inspection
visuelle des PNG produits — ce script ne les juge pas.

Usage :
    python render_page.py <page.html> [--widths 1280,768,390] [--selector body]
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

# TF-0422 (lot Client-B 20260820a, 21/08) : 1920 entre dans les largeurs par défaut — le défaut de
# colonne étroite (texte à 40 % d'un écran de 1 800 px, livré vert, refusé par le client) ne se
# voit qu'à partir de ~1 600 px ; 1280/768/390 ne le montraient jamais.
DEFAULT_WIDTHS = [1920, 1280, 768, 390]

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
    // TF-0424 (lot Client-B 20260820a) : les formes INTERNES d'un groupe SVG titre (<g><title>…)
    // se superposent par construction — un rect et son text sont un seul noeud de schema, pas
    // deux elements de mise en page. V4 ne juge que les chevauchements ENTRE noeuds et entre
    // noeud et fleche ; data-overlap-ok n'est plus a poser sur chaque forme d'un noeud.
    const groupeTitre = parent.tagName.toLowerCase() === 'g' &&
      [...parent.children].some((c) => c.tagName.toLowerCase() === 'title');
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i], b = kids[j];
        if (svgIcone || groupeTitre) continue;
        if (a.el.hasAttribute('data-overlap-ok') || b.el.hasAttribute('data-overlap-ok')) continue;
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
      // TF-0421 (lot Client-B 20260820a) : la bride se mesure QUELLE QUE SOIT la propriete.
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
          `poser la mesure de lecture sur le conteneur (.chap.lire), pas sur le texte` });
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

  return issues;
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

CAPTURE_TIMEOUT_DEFAUT = 30_000
FAMILLES_SANS_IMAGE = "V1 debordement, V2 contraste, V4 chevauchement, V3, V7, L2"
FAMILLES_AVEC_IMAGE = "V5 croisements et V6 images"


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
    v1 = issues.get("v1_tronque", {}).get("total") or len(issues["v1_overflow"])
    return (v1 + len(issues["v2_contrast"])
            + len(issues["v4_overlap"]) + len(issues["l2_width"])
            + len(issues["l2_gouttiere"]) + len(issues["l2_conteneur"])
            + len(issues["l2_filet"]) + len(issues.get("etat_muet", [])))


def run(html_path: Path, widths: list[int], selector: str, scale: float, as_json: bool,
        out_dir: Path | None = None, etats_ouverts: bool = False,
        capture_timeout: int = CAPTURE_TIMEOUT_DEFAUT, sections: str | None = None,
        matrice_etats: bool = False, matrice_toutes_largeurs: bool = False) -> int:
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
          .replace("__L2_ETIQUETTE_MAX__", str(L2_ETIQUETTE_MAX)))

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
            png = png_dir / f"{html_path.stem}-w{width}.png"
            target = page.query_selector(selector) if selector != "body" else None
            capture: dict = {"faite": True, "motif": ""}
            try:
                if target:
                    target.screenshot(path=str(png), timeout=capture_timeout)
                else:
                    page.screenshot(path=str(png), full_page=True, timeout=capture_timeout)
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

    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for width, data in report["breakpoints"].items():
            iss = data["issues"]
            print(f"\n===== {width}px — {Path(data['png']).name} =====")
            for key, title, kind in [("v1_overflow", "V1 débordement", "BLOQUANT"),
                                     ("v2_contrast", "V2 contraste", "BLOQUANT"),
                                     ("v4_overlap", "V4 chevauchement", "BLOQUANT"),
                                     ("l2_width", "L2 largeur de texte", "BLOQUANT"),
                                     ("l2_gouttiere", "L2 gouttière d'étiquettes", "BLOQUANT"),
                                     ("l2_conteneur", "L2 conteneur calé à gauche", "BLOQUANT"),
                                     ("l2_filet", "L2 texte écrasé en filet", "BLOQUANT"),
                                     ("l2_freres", "L2 alignement entre freres", "avertissement"),
                                     ("v3_align", "V3 alignement", "avertissement"),
                                     ("v7_spacing", "V7 espacement", "avertissement"),
                                     ("unmeasured", "Non mesurable", "à vérifier visuellement")]:
                for item in iss[key]:
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
                for key, title, kind in [("v1_overflow", "V1 débordement", "BLOQUANT"),
                                         ("v2_contrast", "V2 contraste", "BLOQUANT"),
                                         ("v4_overlap", "V4 chevauchement", "BLOQUANT"),
                                         ("l2_width", "L2 largeur de texte", "BLOQUANT"),
                                         ("l2_freres", "L2 alignement entre freres", "avertissement"),
                                         ("etat_muet", "ÉTAT VIDE MUET", "BLOQUANT")]:
                    for item in e["issues"].get(key, []):
                        print(f"      [{kind}] {title} : {item['what']} — {item['detail']}")
        print(f"\nVerdict : {report['verdict']}")
        for note in report["non_juge"]:
            print(f"  non jugé — {note}")
        print(f"PNG : {png_dir}")
    return 0 if report["verdict"] == "PASS" else 1


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
    ap.add_argument("html", type=Path)
    ap.add_argument("--widths", default=",".join(map(str, DEFAULT_WIDTHS)),
                    help="largeurs de viewport, séparées par des virgules")
    ap.add_argument("--selector", default="body", help="ex. .diagram-wrap pour un schéma")
    # TF-0365 — `--scale` en FLOTTANT : `--scale 0.4` sortait « invalid int value », alors que
    # réduire l'échelle est le premier levier sur une page très haute (moins de pixels à
    # encoder). Un entier n'était pas une contrainte de Playwright, c'était un type trop étroit.
    ap.add_argument("--scale", type=float, default=2.0,
                    help="facteur d'échelle du rendu ; accepte un flottant (0.4 sur une page "
                         "très haute — moins de pixels à encoder, capture qui aboutit)")
    ap.add_argument("--timeout", type=int, default=CAPTURE_TIMEOUT_DEFAUT, dest="capture_timeout",
                    help=f"délai de capture en ms (défaut {CAPTURE_TIMEOUT_DEFAUT}). Une capture "
                         "qui échoue n'interrompt plus l'outil : les familles lues dans le DOM "
                         "restent jugées, V5/V6 sont déclarées NON JUGÉES")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    ap.add_argument("--out", type=Path, default=None, dest="out_dir",
                    help="dossier des PNG (défaut : <dossier du HTML>/.oracles/, ou un dossier "
                         "temporaire si la page vit dans un arbre de LIVRAISON — "
                         "output/, old/, dist/… : un livrable ne reçoit jamais de captures)")
    ap.add_argument("--etats-ouverts", action="store_true", dest="etats_ouverts",
                    help="TF-0176 : ouvre details + premier panneau de filtre + remplit la "
                         "première recherche AVANT mesures et captures — l'état fermé cache "
                         "les défauts des composants interactifs")
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
    if not args.html.is_file():
        sys.exit(f"ERREUR : fichier introuvable : {args.html}")
    widths = [int(w) for w in str(args.widths).split(",") if w.strip()]
    raise SystemExit(run(args.html, widths, args.selector, args.scale,
                         args.output == "json", args.out_dir, args.etats_ouverts,
                         args.capture_timeout, args.sections,
                         args.matrice_etats, args.matrice_toutes_largeurs))


if __name__ == "__main__":
    main()
