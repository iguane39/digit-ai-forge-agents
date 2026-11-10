#!/usr/bin/env python3
"""Prépare des images pour embarquement PPTX à la charte Digit-AI.

Dépendance NON stdlib : Pillow (`pip install Pillow`) — transcodage et masque alpha. Pour un SVG seulement :
Playwright (`pip install playwright`) et un navigateur lançable (Chromium de Playwright, Chrome ou Edge).

Garantit : ratio d'origine préservé (jamais d'étirement), aucun cadre, format
PPTX-safe (transcodage webp/gif → PNG), coins arrondis optionnels par masque
alpha (pas de bordure dessinée). Émet un manifest JSON {clé: {path, w, h, ratio}}
que le build pptxgenjs lit pour poser chaque image en contain-fit exact.

Chaîne type :
  1) fetch_drive_assets.py télécharge + valide (magic bytes, dimensions)
  2) prepare_images.py transcode + arrondit + écrit le manifest
  3) build pptxgenjs lit le manifest et pose l'image avec les (w,h) contain-fit

CLI :
  python prepare_images.py --round 0.055 img/illustration.jpg -o out/
  python prepare_images.py --circle img/dirigeant.webp -o out/
  python prepare_images.py --to-png img/photo.webp -o out/        # transcodage seul
  python prepare_images.py --manifest out/ -o out/manifest.json    # (ré)indexe un dossier
  python prepare_images.py --box 4.2 3.1 --of img/illustration.jpg # calcul (w,h) contain
  python prepare_images.py --to-png img/logo.svg -o out/           # SVG : moteur a degrades + rognage (TF-2377)

FORMATS ADMIS (TF-2377). Rasters : jpg, jpeg, png, webp, gif, bmp, tif, tiff (Pillow). Vectoriel : SVG, rendu par
un NAVIGATEUR (Chromium de Playwright, a defaut Chrome ou Edge du poste), fond transparent, facteur 3, puis
rogne a la boite non transparente. Tout autre format (ai, eps, pdf, emf, wmf, cdr, psd, heic…) est REFUSE avec
un message : exit 2, rien d'ecrit. Un SVG n'est jamais rendu par un moteur qui ignore les degrades (PyMuPDF, svglib…) :
le 30/09/2026, le logo d'un client a degrade est sorti noir au lieu de vert, sans erreur, et seul le regard sur
le PNG l'a arrete. Sans navigateur, un SVG est REFUSE (exit 2) au lieu d'etre rendu faux.
"""
import argparse
import json
import os
import re
import sys
import tempfile

# Sortie en UTF-8 quoi que dise la console : en cp1252 (console Windows par defaut), l'aide et les noms
# de fichiers accentues ou fleches levaient UnicodeEncodeError (TF-1386).
for _flux in (sys.stdout, sys.stderr):
    try:
        _flux.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
VECTEUR_EXT = {".svg"}
FACTEUR_SVG = 3


def refuser(message):
    """Refus net : message sur stderr, exit 2, rien d'ecrit par l'appelant."""
    sys.stderr.write("REFUS - " + message + "\n")
    sys.exit(2)


def controler_format(src):
    """Un format que le script ne rend pas fidelement est refuse avec un message, jamais rendu a peu pres."""
    ext = os.path.splitext(src)[1].lower()
    if ext in IMG_EXT or ext in VECTEUR_EXT:
        return ext
    refuser("format « %s » non rendu fidelement par prepare_images.py : %s. Formats admis : %s, et .svg (rendu par navigateur). "
            "Exporter l'image en PNG ou en SVG depuis son outil d'origine, puis relancer."
            % (ext or "sans extension", os.path.basename(src), ", ".join(sorted(e.lstrip(".") for e in IMG_EXT))))


def _dimensions_svg(texte):
    """(largeur, hauteur) en px d'un SVG : attributs width/height en px, sinon viewBox ; None si inconnues."""
    racine = re.search(r"<svg\b[^>]*>", texte, re.S)
    if not racine:
        return None
    balise = racine.group(0)

    def attr(nom):
        m = re.search(r'\b%s\s*=\s*"([^"]*)"' % nom, balise)
        return m.group(1).strip() if m else None

    def px(v):
        m = re.fullmatch(r"([0-9.]+)(px)?", v or "")
        return float(m.group(1)) if m else None

    w, h = px(attr("width")), px(attr("height"))
    if w and h:
        return w, h
    vb = attr("viewBox")
    if vb:
        n = [float(x) for x in re.split(r"[\s,]+", vb.strip())]
        if len(n) == 4 and n[2] > 0 and n[3] > 0:
            return n[2], n[3]
    return None


def _navigateur_playwright(pw):
    """Chromium de Playwright, sinon le Chrome ou l'Edge du poste (Playwright les pilote sans telechargement)."""
    for kw in ({}, {"channel": "chrome"}, {"channel": "msedge"}):
        try:
            return pw.chromium.launch(**kw)
        except Exception:
            continue
    return None


def rendre_svg(src, dst, moteur="auto"):
    """Rend un SVG en PNG transparent par un navigateur (degrades appliques), facteur 3, rogne a la boite non transparente."""
    texte = open(src, encoding="utf-8", errors="replace").read()
    if re.search(r'(?:href|src)\s*=\s*"\s*(?:https?:)?//', texte, re.I) or re.search(r"url\(\s*['\"]?\s*(?:https?:)?//", texte, re.I):
        refuser("le SVG %s reference une ressource externe (adresse http) : le rendu hors ligne serait faux. Integrer la ressource au SVG." % os.path.basename(src))
    dims = _dimensions_svg(texte)
    if not dims:
        refuser("le SVG %s ne donne ni width/height en px ni viewBox : ses dimensions sont inconnues, le rendu serait arbitraire." % os.path.basename(src))
    largeur, hauteur = dims
    if moteur == "aucun":
        refuser("aucun moteur de rendu SVG disponible (--moteur-svg aucun). Un SVG a degrade rendu par un moteur qui ignore les degrades sort faux sans erreur.")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        refuser("aucun moteur de rendu SVG qui applique les degrades : Playwright absent. Remede : pip install playwright (le Chrome ou l'Edge du poste suffit), "
                "ou fournir le logo en PNG transparent. prepare_images.py ne rend pas un SVG par un moteur qui ignore les degrades.")
    from PIL import Image
    brut = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    brut.close()
    try:
        with sync_playwright() as pw:
            nav = _navigateur_playwright(pw)
            if nav is None:
                refuser("aucun navigateur lancable par Playwright (Chromium, Chrome, Edge) : le SVG n'est pas rendu. "
                        "Remede : playwright install chromium, ou fournir le logo en PNG transparent.")
            try:
                page = nav.new_page(viewport={"width": max(1, int(largeur + 0.999)), "height": max(1, int(hauteur + 0.999))},
                                    device_scale_factor=FACTEUR_SVG)
                svg = re.sub(r"^\s*<\?xml[^>]*\?>", "", texte).strip()
                page.set_content('<!doctype html><html><body style="margin:0;background:transparent">'
                                 '<div id="c" style="display:inline-block;line-height:0">%s</div></body></html>' % svg)
                page.locator("#c").screenshot(path=brut.name, omit_background=True)
            finally:
                nav.close()
        im = Image.open(brut.name).convert("RGBA")
        boite = im.getchannel("A").getbbox()
        if boite is None:
            refuser("le SVG %s rend une image entierement transparente : rien a rogner, rendu refuse." % os.path.basename(src))
        im.crop(boite).save(dst, "PNG")
    finally:
        try:
            os.remove(brut.name)
        except OSError:
            pass
    return dst


def raster(src, moteur="auto"):
    """Chemin d'un raster lisible par Pillow : la source elle-meme, ou le rendu PNG temporaire d'un SVG."""
    ext = controler_format(src)
    if ext in VECTEUR_EXT:
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.close()
        return rendre_svg(src, tmp.name, moteur), tmp.name
    return src, None


def contain_box(iw, ih, box_w, box_h):
    """(w, h) maximaux respectant le ratio iw/ih et tenant dans (box_w, box_h).

    Contain, sans crop ni étirement : l'image touche le bord le plus contraignant,
    l'autre dimension est réduite proportionnellement. Le build centre/aligne ensuite
    l'image dans le panneau — l'espace résiduel reste le fond de slide (aucun cadre).
    """
    if iw <= 0 or ih <= 0:
        raise ValueError("dimensions image invalides")
    r = iw / ih
    if box_w / box_h >= r:          # panneau plus large que l'image → hauteur limitante
        h = box_h
        w = box_h * r
    else:                           # panneau plus haut → largeur limitante
        w = box_w
        h = box_w / r
    return round(w, 3), round(h, 3)


def to_png(src, dst):
    """Transcode n'importe quelle image PIL-lisible en PNG (PPTX-safe)."""
    from PIL import Image
    im = Image.open(src).convert("RGBA")
    im.save(dst, "PNG")
    return dst


def _mask_rounded(size, radius):
    from PIL import Image, ImageDraw
    w, h = size
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return m


def _mask_circle(size):
    from PIL import Image, ImageDraw
    w, h = size
    s = min(w, h)
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    off_x, off_y = (w - s) // 2, (h - s) // 2
    d.ellipse([off_x, off_y, off_x + s - 1, off_y + s - 1], fill=255)
    return m


def round_corners(src, dst, radius_frac=0.055, radius_px=None, circle=False):
    """Applique des coins arrondis (ou un cercle) via masque alpha. Aucune bordure.

    radius_px prime sur radius_frac. Sortie PNG à fond transparent hors du masque.
    Le ratio n'est pas modifié (le masque a la taille exacte de l'image).
    """
    from PIL import Image
    im = Image.open(src).convert("RGBA")
    if circle:
        mask = _mask_circle(im.size)
    else:
        r = radius_px if radius_px is not None else max(1, round(radius_frac * min(im.size)))
        mask = _mask_rounded(im.size, r)
    im.putalpha(mask)
    im.save(dst, "PNG")
    return dst


def build_manifest(folder):
    """Indexe un dossier d'images : {nom_sans_ext: {path, w, h, ratio}}."""
    from PIL import Image
    out = {}
    for name in sorted(os.listdir(folder)):
        ext = os.path.splitext(name)[1].lower()
        if ext not in IMG_EXT:
            continue
        p = os.path.join(folder, name)
        try:
            w, h = Image.open(p).size
        except Exception:
            continue
        out[os.path.splitext(name)[0]] = {
            "path": p, "w": w, "h": h, "ratio": round(w / h, 4)}
    return out


def _out_path(src, out, suffix, force_png=True):
    base = os.path.splitext(os.path.basename(src))[0]
    ext = ".png" if force_png else os.path.splitext(src)[1]
    name = f"{base}{suffix}{ext}"
    if out and (os.path.isdir(out) or out.endswith("/")):
        os.makedirs(out, exist_ok=True)
        return os.path.join(out, name)
    return out or name


def main():
    ap = argparse.ArgumentParser(description="Prépare des images pour PPTX Digit-AI.")
    ap.add_argument("src", nargs="?", help="image source")
    ap.add_argument("-o", "--out", help="fichier ou dossier de sortie")
    ap.add_argument("--round", type=float, metavar="FRAC", default=None,
                    help="coins arrondis, rayon = FRAC*min(w,h) (ex. 0.055)")
    ap.add_argument("--round-px", type=int, default=None, help="rayon en pixels (prime sur --round)")
    ap.add_argument("--circle", action="store_true", help="masque circulaire (avatars)")
    ap.add_argument("--to-png", action="store_true", help="transcodage PNG seul")
    ap.add_argument("--manifest", metavar="DIR", help="indexer un dossier → JSON")
    ap.add_argument("--box", nargs=2, type=float, metavar=("W", "H"), help="panneau cible (inches)")
    ap.add_argument("--of", metavar="IMG", help="image pour --box (calcul contain, pas d'écriture)")
    ap.add_argument("--moteur-svg", choices=["auto", "aucun"], default="auto",
                    help="auto : navigateur du poste ; aucun : simule l'absence de moteur (rejeu du refus)")
    a = ap.parse_args()

    if a.manifest:
        m = build_manifest(a.manifest)
        dst = a.out or os.path.join(a.manifest, "manifest.json")
        json.dump(m, open(dst, "w"), ensure_ascii=False, indent=2)
        print(f"OK manifest {dst}  ({len(m)} image(s))")
        return

    if a.box and a.of:
        from PIL import Image
        chemin, tmp = raster(a.of, a.moteur_svg)
        try:
            iw, ih = Image.open(chemin).size
        finally:
            if tmp:
                os.remove(tmp)
        w, h = contain_box(iw, ih, a.box[0], a.box[1])
        print(f"contain-fit {os.path.basename(a.of)} {iw}x{ih} dans {a.box[0]}x{a.box[1]} → w={w} h={h}")
        return

    if not a.src:
        ap.error("source requise (ou --manifest / --box+--of)")
    controler_format(a.src)  # format non rendu fidelement : refus net avant toute ecriture

    if a.circle or a.round is not None or a.round_px is not None:
        suffix = "-circle" if a.circle else "-round"
        dst = _out_path(a.src, a.out, suffix)
        chemin, tmp = raster(a.src, a.moteur_svg)
        try:
            round_corners(chemin, dst, radius_frac=a.round or 0.055,
                          radius_px=a.round_px, circle=a.circle)
        finally:
            if tmp:
                os.remove(tmp)
        from PIL import Image
        w, h = Image.open(dst).size
        print(f"OK {dst}  {w}x{h} ratio={round(w/h,4)}")
        return

    if a.to_png:
        dst = _out_path(a.src, a.out, "")
        if os.path.splitext(a.src)[1].lower() in VECTEUR_EXT:
            rendre_svg(a.src, dst, a.moteur_svg)
        else:
            to_png(a.src, dst)
        from PIL import Image
        w, h = Image.open(dst).size
        print(f"OK {dst}  {w}x{h} ratio={round(w/h,4)}")
        return

    ap.print_help()


if __name__ == "__main__":
    main()
