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

DEFAULT_WIDTHS = [1280, 768, 390]

# L2 au rendu : un bloc de texte doit occuper au moins ce ratio de la largeur que
# son conteneur lui offre. En dessous, la page laisse du vide la ou le lecteur
# attend du texte. Ne s'applique qu'au-dela d'un viewport de bureau : sous cette
# largeur, une bride de lecture est sans effet visible.
L2_MIN_RATIO = 0.85
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
                   l2_width: [], l2_gouttiere: [], unmeasured: [] };
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
  if (doc.scrollWidth > doc.clientWidth + 1) {
    issues.v1_overflow.push({ what: 'document', detail:
      `scrollWidth ${doc.scrollWidth}px > viewport ${doc.clientWidth}px` });
  }
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > doc.clientWidth + 1 && getComputedStyle(el).position !== 'fixed') {
      issues.v1_overflow.push({ what: label(el), detail:
        `bord droit à ${Math.round(r.right)}px pour un viewport de ${doc.clientWidth}px` });
      if (issues.v1_overflow.length > 15) break;
    }
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
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i], b = kids[j];
        if (svgIcone) continue;
        if (a.el.hasAttribute('data-overlap-ok') || b.el.hasAttribute('data-overlap-ok')) continue;
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
  if (window.innerWidth >= __L2_MIN_VIEWPORT__) {
    const vus = new Set();
    for (const el of document.body.querySelectorAll('p, dd, li, blockquote, .va, .prose')) {
      if (!visible(el)) continue;
      const txt = (el.textContent || '').trim();
      if (txt.length < __L2_MIN_CHARS__) continue;
      if (el.closest('table') || el.closest('nav')) continue;
      const cs = getComputedStyle(el);
      if (cs.maxWidth === 'none' || cs.display === 'inline') continue;
      const w1 = el.getBoundingClientRect().width;
      const avant = el.style.maxWidth;
      el.style.maxWidth = 'none';
      const w2 = el.getBoundingClientRect().width;
      el.style.maxWidth = avant;
      if (w2 <= 0) continue;
      const ratio = w1 / w2;
      if (ratio < __L2_MIN_RATIO__) {
        const cle = el.tagName + '|' + (el.className || '') + '|' + cs.maxWidth;
        if (vus.has(cle)) continue;
        vus.add(cle);
        issues.l2_width.push({ what: label(el), detail:
          `largeur ${Math.round(w1)}px pour ${Math.round(w2)}px disponibles ` +
          `(ratio ${ratio.toFixed(2)}, seuil __L2_MIN_RATIO__) — bride par max-width:${cs.maxWidth}` });
      }
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


def run(html_path: Path, widths: list[int], selector: str, scale: int, as_json: bool,
        out_dir: Path | None = None, etats_ouverts: bool = False) -> int:
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
          .replace("__L2_MIN_VIEWPORT__", str(L2_MIN_VIEWPORT))
          .replace("__L2_MIN_CHARS__", str(L2_MIN_CHARS))
          .replace("__L2_COL_MAX__", str(L2_COL_MAX))
          .replace("__L2_ETIQUETTE_MAX__", str(L2_ETIQUETTE_MAX)))

    png_dir = _dossier_captures(html_path, out_dir)
    png_dir.mkdir(parents=True, exist_ok=True)

    report: dict = {"file": str(html_path), "png_dir": str(png_dir),
                    "breakpoints": {}, "verdict": None}
    blocking_total = 0

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
            if target:
                target.screenshot(path=str(png))
            else:
                page.screenshot(path=str(png), full_page=True)

            blocking = (len(issues["v1_overflow"]) + len(issues["v2_contrast"])
                        + len(issues["v4_overlap"]) + len(issues["l2_width"])
                        + len(issues["l2_gouttiere"]))
            blocking_total += blocking
            report["breakpoints"][width] = {"png": str(png), "issues": issues, "blocking": blocking}
            page.close()
        browser.close()

    report["verdict"] = "PASS" if blocking_total == 0 else "FAIL"

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
                                     ("v3_align", "V3 alignement", "avertissement"),
                                     ("v7_spacing", "V7 espacement", "avertissement"),
                                     ("unmeasured", "Non mesurable", "à vérifier visuellement")]:
                for item in iss[key]:
                    print(f"  [{kind}] {title} : {item['what']} — {item['detail']}")
            if data["blocking"] == 0 and not any(iss[k] for k in ("v3_align", "v7_spacing", "unmeasured")):
                print("  aucun défaut mesuré")
        print(f"\nVerdict : {report['verdict']}  "
              f"(V5 croisements et V6 images restent à inspecter sur les PNG produits)")
        print(f"PNG : {png_dir}")
    return 0 if report["verdict"] == "PASS" else 1


# TF-0230 (lot SCC_ALX, 14/08) — reconstat sur TF-0058, archivé « corrigé » et ne l'étant
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
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--output", choices=["text", "json"], default="text")
    ap.add_argument("--out", type=Path, default=None, dest="out_dir",
                    help="dossier des PNG (défaut : <dossier du HTML>/.oracles/, ou un dossier "
                         "temporaire si la page vit dans un arbre de LIVRAISON — "
                         "output/, old/, dist/… : un livrable ne reçoit jamais de captures)")
    ap.add_argument("--etats-ouverts", action="store_true", dest="etats_ouverts",
                    help="TF-0176 : ouvre details + premier panneau de filtre + remplit la "
                         "première recherche AVANT mesures et captures — l'état fermé cache "
                         "les défauts des composants interactifs")
    args = ap.parse_args()
    if not args.html.is_file():
        sys.exit(f"ERREUR : fichier introuvable : {args.html}")
    widths = [int(w) for w in str(args.widths).split(",") if w.strip()]
    raise SystemExit(run(args.html, widths, args.selector, args.scale,
                         args.output == "json", args.out_dir, args.etats_ouverts))


if __name__ == "__main__":
    main()
