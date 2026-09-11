#!/usr/bin/env python3
"""Récupère des assets images depuis un dossier Google Drive PUBLIC.

Dépendance NON stdlib : Pillow (`pip install Pillow`) — validation d'image et dimensions réelles.

Canal validé, sans MCP ni transit base64 :
  - listing    : https://drive.google.com/embeddedfolderview?id=<ID>#list
  - download   : https://drive.google.com/uc?export=download&id=<ID>  (suivre redirections)
  - validation : magic bytes (PNG/JPEG/WEBP/GIF) + PIL.verify() + dimensions réelles

Dépôts d'assets Digit-AI (raccourcis 'images', 'logos', 'profils') :
  bibliothèque images : 1CszZdULRFiGe6x0TLZyTZS2nH_XCj9_A  (~1000 .jpg tagués en kebab-case)
  logos (sous-dossier): 1DQfv1_Zr6xSVGNrXEXv59NviNIdCvQ_4  (.png transparents, logos clients)
  profils (sous-dossier): 180h2DHTjZUDQp2I9GJvIpmvuG3w-uWGN (.webp, photos de personnes)

Les images sont « taguées » par les tokens de leur nom (equipe-reunion-presentation.jpg) :
--search filtre le dossier sur des mots-clés (ET). credits.json (biblio) fournit une
description + width/height pour ~24 fichiers. Les .webp/.gif sont transcodés en PNG par
prepare_images.py avant embarquement (PowerPoint n'embarque pas le webp de façon fiable).

Exemples :
  python fetch_drive_assets.py --list logos
  python fetch_drive_assets.py --search "equipe reunion" --folder images
  python fetch_drive_assets.py --name Client-O.png --folder logos --out img/
  python fetch_drive_assets.py --name dirigeant.webp --folder profils --out img/
  python fetch_drive_assets.py --get <ID-du-fichier> --out img/logo-client.png
"""
import argparse
import html
import os
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0"}
KNOWN = {
    "images": "1CszZdULRFiGe6x0TLZyTZS2nH_XCj9_A",
    "logos": "1DQfv1_Zr6xSVGNrXEXv59NviNIdCvQ_4",
    "profils": "180h2DHTjZUDQp2I9GJvIpmvuG3w-uWGN",
}
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
# fichiers de service à ne jamais proposer comme illustration
HOUSEKEEPING_EXT = {".txt", ".cmd", ".ps1", ".html", ".json", ".md", ".csv"}


def _fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def _resolve(folder):
    """Traduit un raccourci de dépôt ('images'/'logos') en ID, sinon renvoie tel quel."""
    return KNOWN.get(folder, folder)


def list_folder(folder_id):
    """Retourne {nom_fichier: file_id} pour un dossier Drive public."""
    folder_id = _resolve(folder_id)
    raw = _fetch(f"https://drive.google.com/embeddedfolderview?id={folder_id}#list")
    raw = raw.decode("utf-8", "replace")
    pairs = re.findall(
        r'flip-entry"\s+id="entry-([A-Za-z0-9_-]+)".*?flip-entry-title[^>]*>([^<]+)<',
        raw, re.S,
    )
    return {html.unescape(n.strip()): i for i, n in pairs}


def _is_image_name(name):
    return os.path.splitext(name)[1].lower() in IMG_EXT


def search_folder(folder_id, keywords):
    """Fichiers image d'un dossier dont le nom contient TOUS les mots-clés (ET).

    Les 'tags' sont les tokens du nom (kebab-case). Exclut les fichiers de service.
    Retourne [(nom, file_id)] trié par nom.
    """
    toks = [k.lower() for k in keywords if k.strip()]
    out = []
    for name, fid in list_folder(folder_id).items():
        low = name.lower()
        if _is_image_name(name) and all(t in low for t in toks):
            out.append((name, fid))
    return sorted(out)


def _magic(path):
    with open(path, "rb") as f:
        h = f.read(12)
    if h[:4] == b"\x89PNG":
        return "PNG"
    if h[:3] == b"\xff\xd8\xff":
        return "JPEG"
    if h[:4] == b"RIFF" and h[8:12] == b"WEBP":   # profils = .webp
        return "WEBP"
    if h[:6] in (b"GIF87a", b"GIF89a"):
        return "GIF"
    return "UNKNOWN(" + h[:4].hex() + ")"


def download(file_id, out_path):
    """Télécharge + valide. Retourne {path, magic, width, height, ratio}."""
    data = _fetch(f"https://drive.google.com/uc?export=download&id={file_id}")
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(data)
    magic = _magic(out_path)
    if magic.startswith("UNKNOWN"):
        raise SystemExit(
            f"[ERREUR] {out_path} n'est pas une image ({magic}). "
            "Probable page d'avertissement Drive (gros fichier) : "
            "recuperer le token 'confirm' dans le HTML et relancer."
        )
    from PIL import Image
    Image.open(out_path).verify()          # integrite
    w, h = Image.open(out_path).size        # reouverture pour dimensions
    return {"path": out_path, "magic": magic, "width": w, "height": h,
            "ratio": round(w / h, 3)}


def main():
    ap = argparse.ArgumentParser(
        description="Recupere des assets images d'un dossier Google Drive public.")
    ap.add_argument("--list", metavar="FOLDER", help="lister un dossier (ID ou raccourci images/logos/profils)")
    ap.add_argument("--search", nargs="+", metavar="MOT", help="filtrer --folder par mots-cles (tags, images seules)")
    ap.add_argument("--get", metavar="FILE_ID", help="telecharger un fichier par son ID")
    ap.add_argument("--name", help="nom de fichier a resoudre dans --folder puis telecharger")
    ap.add_argument("--folder", help="dossier pour --name (ID ou raccourci images/logos)")
    ap.add_argument("--out", help="sortie : fichier pour --get, fichier ou dossier pour --name")
    a = ap.parse_args()

    if a.list:
        m = list_folder(a.list)
        print(f"{len(m)} entree(s) dans {_resolve(a.list)}")
        for name, fid in sorted(m.items()):
            print(f"  {name:44s} {fid}")
        return

    if a.search:
        if not a.folder:
            ap.error("--search requiert --folder")
        hits = search_folder(a.folder, a.search)
        print(f"{len(hits)} image(s) pour {a.search} dans {_resolve(a.folder)}")
        for name, fid in hits:
            print(f"  {name:44s} {fid}")
        return

    if a.name:
        if not a.folder:
            ap.error("--name requiert --folder")
        m = list_folder(a.folder)
        if a.name not in m:
            raise SystemExit(f"[ERREUR] '{a.name}' introuvable dans {_resolve(a.folder)}")
        out = a.out or "."
        if os.path.isdir(out) or out.endswith("/"):
            out = os.path.join(out, a.name)
        info = download(m[a.name], out)
        print(f"OK {info['path']}  {info['magic']} {info['width']}x{info['height']} ratio={info['ratio']}")
        return

    if a.get:
        if not a.out:
            ap.error("--get requiert --out")
        info = download(a.get, a.out)
        print(f"OK {info['path']}  {info['magic']} {info['width']}x{info['height']} ratio={info['ratio']}")
        return

    ap.print_help()


if __name__ == "__main__":
    main()
