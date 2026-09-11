#!/usr/bin/env python3
"""Prépare des images pour embarquement PPTX à la charte Digit-AI.

Dépendance NON stdlib : Pillow (`pip install Pillow`) — transcodage et masque alpha.

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
"""
import argparse
import json
import os

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


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
    a = ap.parse_args()

    if a.manifest:
        m = build_manifest(a.manifest)
        dst = a.out or os.path.join(a.manifest, "manifest.json")
        json.dump(m, open(dst, "w"), ensure_ascii=False, indent=2)
        print(f"OK manifest {dst}  ({len(m)} image(s))")
        return

    if a.box and a.of:
        from PIL import Image
        iw, ih = Image.open(a.of).size
        w, h = contain_box(iw, ih, a.box[0], a.box[1])
        print(f"contain-fit {os.path.basename(a.of)} {iw}x{ih} dans {a.box[0]}x{a.box[1]} → w={w} h={h}")
        return

    if not a.src:
        ap.error("source requise (ou --manifest / --box+--of)")

    if a.circle or a.round is not None or a.round_px is not None:
        suffix = "-circle" if a.circle else "-round"
        dst = _out_path(a.src, a.out, suffix)
        round_corners(a.src, dst, radius_frac=a.round or 0.055,
                      radius_px=a.round_px, circle=a.circle)
        from PIL import Image
        w, h = Image.open(dst).size
        print(f"OK {dst}  {w}x{h} ratio={round(w/h,4)}")
        return

    if a.to_png:
        dst = _out_path(a.src, a.out, "")
        to_png(a.src, dst)
        from PIL import Image
        w, h = Image.open(dst).size
        print(f"OK {dst}  {w}x{h} ratio={round(w/h,4)}")
        return

    ap.print_help()


if __name__ == "__main__":
    main()
