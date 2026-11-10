#!/usr/bin/env python3
"""check_impression.py — la page IMPRIMÉE, mesurée : impression claire après un passage en thème sombre (G1),
et marge basse du dernier bloc de chaque page d'une feuille à @page fixe.

LE FAIT PAYÉ (retours RA-214 et RA-215 du lot du produit marketing, 25 et 28/09/2026, TF-2364 et TF-2365).
  · G1 écrit « impression toujours claire », et aucun contrôle ne l'éprouvait : check_html juge le câblage de la
    bascule, render_page ne rend que le thème par défaut. Un one-pager PASS aux deux, imprimé après un passage en
    thème sombre, sortait en cartes sombres sur papier blanc, logo presque invisible : 706 177 pixels sur 1 169 883
    différaient du PDF clair. Le remède (bloc `[data-theme=dark]` sous `@media screen`) donnait 0 pixel d'écart.
  · Une page A4 à hauteur figée (`height: 210mm`, `overflow: hidden` à l'impression) qui déborde pousse son pied hors
    de la feuille. render_page juge l'écran, check_html la feuille, aucun ne mesurait la page imprimée : le bandeau de
    la page 3 d'un dossier finissait à 0,1 mm du bord, texte complet, verdicts verts ; marges mesurées 0,1 puis 7,5
    puis 11,2 mm par un oracle du produit seul.

CE QUE CE SCRIPT FAIT, avec Chromium en média `print` et pymupdf pour lire le PDF :
  · G1 — imprime la page deux fois, thème par défaut puis `data-theme="dark"` posé sur la racine (ce que fait la
    bascule), rend chaque page en image et compare : une page dont plus de `--ecart-g1` (0,05 %) des pixels diffèrent,
    ou un nombre de pages différent, est un ÉCHEC. Pas de bascule dans la page : le thème sombre n'existe pas, les
    deux impressions sont identiques, PASS ;
  · marge basse — sur une page qui déclare un `@page` de taille fixe (`size:`), mesure pour CHAQUE page du PDF la
    distance entre le bas de la feuille et le bas du dernier bloc (ligne de texte, image, dessin ; le fond pleine page
    n'est pas un bloc). Sous `--marge-mm` (5 mm par défaut : la zone que beaucoup d'imprimantes ne couvrent pas, SEUIL
    CHOISI ici, à régler par le demandeur), la page est un ÉCHEC, nommée avec sa marge. Une page sans `@page` de taille
    fixe n'est pas mesurée : c'est dit, jamais un PASS.

Usage :
  python check_impression.py <page.html> [--marge-mm 5] [--ecart-g1 0.0005] [--output json]
Exit : 0 PASS · 1 FAIL · 2 SKIP (Chromium, pymupdf ou numpy absent, fichier illisible) — jamais un PASS muet.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path

# Windows : forcer stdout/stderr en UTF-8 pour ne pas planter (cp1252) à l'impression de caractères hors Latin-1.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

MM_PAR_POINT = 25.4 / 72
DPI_COMPARAISON = 50          # assez fin pour un logo, assez léger pour une dizaine de pages
ECART_CANAL = 16              # écart d'un canal (sur 255) sous lequel deux pixels sont le même pixel
MARGE_MM_DEFAUT = 5.0
ECART_G1_DEFAUT = 0.0005      # 0,05 % des pixels d'une page ; la fuite mesurée le 25/09/2026 était de 60 %
FOND_PLEINE_PAGE = (0.98, 0.9)  # un dessin couvrant 98 % de la largeur et 90 % de la hauteur est le fond, pas un bloc

RE_PAGE_FIXE = re.compile(r"@page\b[^{}]*\{[^{}]*\bsize\s*:[^{};]+", re.I)

NON_JUGE = [
    "SEUL CHROMIUM est joué, au média print : un autre navigateur coupe et marge autrement",
    "G1 pose `data-theme=\"dark\"` sur la racine, ce que fait la bascule du socle ; un thème sombre porté par une "
    "classe, par `prefers-color-scheme` (système en mode sombre) ou par un état mémorisé que la page relit à "
    "l'ouverture n'est pas rejoué",
    "G1 compare l'état initial de la page ; un état ouvert (panneau déplié, onglet) n'est pas imprimé",
    "LA MARGE BASSE est mesurée sur le PDF de la page à ses propres marges (@page) ; les marges choisies par le "
    "lecteur à l'impression ne sont pas rejouées (check_format_a4.py compte les pages sous quatre d'entre elles)",
    "LE SEUIL de marge (5 mm par défaut) est un choix de ce script : la zone non imprimable d'une imprimante donnée "
    "n'est pas lue",
    "LE DERNIER BLOC est le plus bas des lignes de texte, images et dessins du PDF ; un décor volontairement posé "
    "au bord de la feuille (bandeau pleine largeur) se règle par --marge-mm 0, et la lisibilité du texte coupé n'est "
    "pas jugée",
]


def lecteurs():
    """(pymupdf, numpy) ou None avec le motif du SKIP."""
    try:
        import pymupdf  # type: ignore
    except Exception as e:  # noqa: BLE001 — ImportError ou binaire cassé
        return None, f"pymupdf absent ({type(e).__name__}) : le PDF imprimé ne se lit ni ne se compare"
    try:
        import numpy  # type: ignore
    except Exception as e:  # noqa: BLE001
        return None, f"numpy absent ({type(e).__name__}) : les pages imprimées ne se comparent pas"
    return (pymupdf, numpy), ""


def page_fixe(html: str) -> bool:
    """La page déclare-t-elle un `@page` de taille fixe (`size:`) ?"""
    return bool(RE_PAGE_FIXE.search(html))


def ecart_de_pages(pymupdf, numpy, pdf_a: Path, pdf_b: Path) -> list[dict]:
    """Par page : la part de pixels qui diffèrent entre deux PDF (None si le nombre de pages n'est pas le même)."""
    a, b = pymupdf.open(str(pdf_a)), pymupdf.open(str(pdf_b))
    if a.page_count != b.page_count:
        return [{"page": None, "pages_a": a.page_count, "pages_b": b.page_count}]
    out = []
    for i in range(a.page_count):
        pa = a[i].get_pixmap(dpi=DPI_COMPARAISON, alpha=False)
        pb = b[i].get_pixmap(dpi=DPI_COMPARAISON, alpha=False)
        ia = numpy.frombuffer(pa.samples, dtype=numpy.uint8).reshape(pa.h, pa.w, pa.n).astype(int)
        ib = numpy.frombuffer(pb.samples, dtype=numpy.uint8).reshape(pb.h, pb.w, pb.n).astype(int)
        if ia.shape != ib.shape:
            out.append({"page": i + 1, "pixels": None, "differents": None, "ratio": 1.0, "format_different": True})
            continue
        diff = int((numpy.abs(ia - ib).max(axis=2) > ECART_CANAL).sum())
        total = ia.shape[0] * ia.shape[1]
        out.append({"page": i + 1, "pixels": total, "differents": diff, "ratio": round(diff / total, 6)})
    return out


def marges_basses(pymupdf, pdf: Path) -> list[dict]:
    """Par page : la distance (mm) du bas de la feuille au bas du dernier bloc, et la nature de ce bloc."""
    out = []
    doc = pymupdf.open(str(pdf))
    for i, page in enumerate(doc):
        haut, larg = page.rect.height, page.rect.width
        blocs = []
        for x0, y0, x1, y1, _txt, _no, genre in page.get_text("blocks"):
            if genre == 0 and not str(_txt).strip():
                continue
            blocs.append((y1, "image" if genre == 1 else "texte"))
        for d in page.get_drawings():
            r = d["rect"]
            if r.width >= FOND_PLEINE_PAGE[0] * larg and r.height >= FOND_PLEINE_PAGE[1] * haut:
                continue  # le fond de la feuille
            if r.width == 0 and r.height == 0:
                continue
            blocs.append((r.y1, "dessin"))
        if not blocs:
            out.append({"page": i + 1, "marge_mm": None, "bloc": None})
            continue
        bas, genre = max(blocs)
        out.append({"page": i + 1, "marge_mm": round((haut - bas) * MM_PAR_POINT, 1), "bloc": genre})
    return out


def mesurer(page: Path, marge_mm: float, ecart_g1: float) -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:  # noqa: BLE001
        return {"verdict": "SKIP", "motif": f"playwright absent ({type(e).__name__}) : aucune page imprimée"}
    libs, motif = lecteurs()
    if libs is None:
        return {"verdict": "SKIP", "motif": motif}
    pymupdf, numpy = libs
    if not page.is_file():
        return {"verdict": "SKIP", "motif": f"fichier illisible : {page}"}
    html = page.read_text(encoding="utf-8", errors="replace")
    fixe = page_fixe(html)
    options = {"format": "A4", "prefer_css_page_size": True, "print_background": True}
    with tempfile.TemporaryDirectory(prefix="impression-") as tmp, sync_playwright() as p:
        nav = p.chromium.launch()
        try:
            pdfs = {}
            for nom, sombre in (("defaut", False), ("sombre", True)):
                pg = nav.new_page(viewport={"width": 1280, "height": 1080})
                pg.goto(page.resolve().as_uri())
                pg.wait_for_timeout(800)
                if sombre:
                    pg.evaluate("document.documentElement.setAttribute('data-theme', 'dark')")
                    pg.wait_for_timeout(200)
                pg.emulate_media(media="print")
                f = Path(tmp) / f"{nom}.pdf"
                pg.pdf(path=str(f), **options)
                pg.close()
                pdfs[nom] = f
        finally:
            nav.close()
        g1 = ecart_de_pages(pymupdf, numpy, pdfs["defaut"], pdfs["sombre"])
        marges = marges_basses(pymupdf, pdfs["defaut"]) if fixe else []
    echecs = []
    for m in g1:
        if m.get("page") is None:
            echecs.append(f"G1 : {m['pages_a']} page(s) à l'impression par défaut, {m['pages_b']} après le thème sombre")
        elif m["ratio"] > ecart_g1:
            echecs.append(f"G1 : page {m['page']} imprimée en thème sombre diffère de {m['ratio']:.2%} des pixels "
                          f"de l'impression par défaut (seuil {ecart_g1:.2%})")
    for m in marges:
        if m["marge_mm"] is not None and m["marge_mm"] < marge_mm:
            echecs.append(f"marge basse : page {m['page']}, le dernier bloc ({m['bloc']}) finit à {m['marge_mm']} mm du "
                          f"bord de la feuille (minimum {marge_mm} mm)")
    return {"verdict": "FAIL" if echecs else "PASS", "page_fixe": fixe,
            "mesures": {"g1": g1, "marge_basse": marges, "marge_basse_mesuree": fixe},
            "echecs": echecs}


def main() -> int:
    ap = argparse.ArgumentParser(description="La page imprimée : G1 en thème sombre, marge basse d'une feuille fixe.")
    ap.add_argument("page", type=Path, help="fichier HTML à juger")
    ap.add_argument("--marge-mm", type=float, default=MARGE_MM_DEFAUT, dest="marge_mm",
                    help=f"marge basse minimale du dernier bloc, en mm (défaut {MARGE_MM_DEFAUT})")
    ap.add_argument("--ecart-g1", type=float, default=ECART_G1_DEFAUT, dest="ecart_g1",
                    help="part de pixels d'une page pouvant différer entre l'impression par défaut et l'impression "
                         f"en thème sombre (défaut {ECART_G1_DEFAUT})")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    a = ap.parse_args()
    r = mesurer(a.page, a.marge_mm, a.ecart_g1)
    r["page"] = str(a.page)
    r["oracle"] = "check_impression"
    r["domaine"] = "Page imprimée (G1 impression claire, marge basse d'une feuille fixe)"
    r["artefact"] = str(a.page)
    r["findings"] = [r["motif"]] if r["verdict"] == "SKIP" else r["echecs"]
    r["non_juge"] = list(NON_JUGE)
    if r["verdict"] == "PASS" and not r.get("page_fixe"):
        r["non_juge"].insert(0, "LA MARGE BASSE n'est pas mesurée : la page ne déclare aucun @page de taille fixe (size:)")
    if a.output == "json":
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print(f"Source  : {a.page}")
        print(f"Verdict : {r['verdict']}")
        if r["verdict"] == "SKIP":
            print(f"  motif : {r['motif']}")
        else:
            for m in r["mesures"]["g1"]:
                if m.get("page") is None:
                    print(f"  FAIL  G1 nombre de pages : {m['pages_a']} / {m['pages_b']}")
                else:
                    print(f"  {'FAIL' if m['ratio'] > a.ecart_g1 else 'PASS'}  G1 page {m['page']} : {m['ratio']:.2%} de pixels en écart")
            for m in r["mesures"]["marge_basse"]:
                ok = m["marge_mm"] is None or m["marge_mm"] >= a.marge_mm
                print(f"  {'PASS' if ok else 'FAIL'}  marge basse page {m['page']} : {m['marge_mm']} mm ({m['bloc']})")
            if not r["page_fixe"]:
                print("  marge basse non mesurée : aucun @page de taille fixe")
        print("\nPérimètre de NON-MESURE (ce verdict ne dit rien de ceci) :")
        for note in r["non_juge"]:
            print(f"  non jugé — {note}")
    return {"PASS": 0, "FAIL": 1}.get(r["verdict"], 2)


if __name__ == "__main__":
    sys.exit(main())
