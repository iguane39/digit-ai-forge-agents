#!/usr/bin/env python3
"""check_format_a4.py — une page demandée « sur une page A4 » tient-elle sur UNE feuille chez son lecteur ?

LE FAIT PAYÉ (TF-1882, retour RT-1 du lot Produit-84 20261016a, 16/10/2026). Une fiche demandée « sur une page
A4 » passait check_html.py, render_page.py aux sept largeurs et les quatre oracles de forge-design, et mesurait
374 mm de haut à l'écran, 2 pages à l'impression (marges de 10 mm avec en-têtes du navigateur, ou marges par
défaut de Chrome). Deux causes : aucune feuille bornée à 297 mm à l'écran, et une règle `@media (max-width: 720px)`
sans `screen`, déclenchée aussi à l'impression parce que la largeur imprimable d'un A4 vaut environ 698 px. Le
premier mesurage de la session, fait avec `@page { margin: 0 }`, annonçait « tenue sur 1 page » : une condition
que ni l'écran ni une impression ordinaire ne reproduisent. Aucun oracle du socle ne comptait de pages.

CE QUE CE SCRIPT FAIT. Il COMPTE les pages, dans les conditions du lecteur, avec Chromium en média `print` :
  · à l'écran, aux largeurs de bureau (3840, 1920, 1440 et 1024 px) : la page ne dépasse pas la hauteur de la
    feuille (297 mm pour A4) — `--sans-ecran` pour une demande qui ne vise que l'impression ;
  · à l'impression, une génération de PDF par condition de lecteur, comptée page par page :
      — marges définies par la page (`@page`), le format A4 servant de repli ;
      — marges de 10 mm avec les en-têtes et pieds du navigateur ;
      — marges par défaut de Chrome (0,4 pouce) ;
      — marges de 15 mm.
    Aucune de ces conditions n'est « marges nulles » : c'est la mesure qui avait menti.
Une condition qui dépasse `--pages` (1 par défaut) est un ÉCHEC, nommé avec son nombre de pages. Le format Letter,
marges 0,4 pouce, est mesuré et signalé en AVERTISSEMENT : un lecteur américain imprime sur Letter, la demande
reste A4.

Usage :
  python check_format_a4.py <page.html> [--pages 1] [--sans-ecran] [--output json]
Exit : 0 PASS · 1 FAIL · 2 SKIP (Chromium ou compteur de pages absent, fichier illisible) — jamais un PASS muet.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

# Windows : forcer stdout/stderr en UTF-8 pour ne pas planter (cp1252) à l'impression de caractères hors Latin-1.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

PX_PAR_MM = 96 / 25.4
HAUTEUR_FEUILLE_MM = 297.0
LARGEURS_ECRAN = (3840, 1920, 1440, 1024)
TOLERANCE_PX = 1.0  # un pixel : l'arrondi du moteur, pas un défaut

# Les conditions d'impression d'un LECTEUR. Une DONNÉE : une condition de plus se déclare ici, sans toucher au
# code de mesure. `bloquant` faux = avertissement.
MARGES = lambda v: {k: v for k in ("top", "bottom", "left", "right")}  # noqa: E731
CONDITIONS = [
    {"nom": "A4, marges définies par la page (@page)", "bloquant": True,
     "options": {"format": "A4", "prefer_css_page_size": True}},
    {"nom": "A4, marges 10 mm, avec les en-têtes et pieds du navigateur", "bloquant": True,
     "options": {"format": "A4", "margin": MARGES("10mm"), "display_header_footer": True}},
    {"nom": "A4, marges par défaut de Chrome (0,4 pouce)", "bloquant": True,
     "options": {"format": "A4", "margin": MARGES("0.4in")}},
    {"nom": "A4, marges 15 mm", "bloquant": True,
     "options": {"format": "A4", "margin": MARGES("15mm")}},
    {"nom": "Letter, marges 0,4 pouce (un lecteur américain)", "bloquant": False,
     "options": {"format": "Letter", "margin": MARGES("0.4in")}},
]

NON_JUGE = [
    "SEUL CHROMIUM est joué : Firefox et Safari ont d'autres marges par défaut et d'autres coupures de page ; une page "
    "qui tient ici peut déborder là-bas",
    "LA MISE À L'ÉCHELLE du lecteur (« Ajuster à la page », 80 %) et les réglages du pilote d'impression ne sont pas "
    "rejoués : un lecteur qui réduit fait tenir ce qui déborde, un lecteur qui agrandit l'inverse",
    "LES MARGES sont celles de quatre conditions courantes (page, 10 mm avec en-têtes, 0,4 pouce, 15 mm) ; une marge "
    "plus large que 15 mm n'est pas jouée",
    "LE CONTENU est celui que charge la page ici : un script qui s'exécute plus tard, une police absente du poste ou "
    "un état ouvert n'est pas rejoué ; seul l'état initial est compté",
    "LA LISIBILITÉ d'une page qui tient en réduisant le corps du texte n'est pas jugée : tenir sur une page à 6 pt est "
    "un PASS ici",
]


def compteur_de_pages():
    """(nom, fonction chemin -> nombre de pages) ; None si aucun compteur n'est installé."""
    try:
        import pymupdf  # type: ignore

        return "pymupdf", lambda f: pymupdf.open(str(f)).page_count
    except Exception:  # noqa: BLE001 — ImportError ou binaire cassé : on essaie le suivant
        pass
    try:
        from pypdf import PdfReader  # type: ignore

        return "pypdf", lambda f: len(PdfReader(str(f)).pages)
    except Exception:  # noqa: BLE001
        return None


def mesurer(page: Path, pages_max: int, ecran: bool) -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:  # noqa: BLE001
        return {"verdict": "SKIP", "motif": f"playwright absent ({type(e).__name__}) : aucune page comptée"}
    compteur = compteur_de_pages()
    if compteur is None:
        return {"verdict": "SKIP", "motif": "ni pymupdf ni pypdf : les pages d'un PDF ne se comptent pas"}
    nom_compteur, compter = compteur
    if not page.is_file():
        return {"verdict": "SKIP", "motif": f"fichier illisible : {page}"}
    mesures = {"ecran": [], "impression": []}
    with tempfile.TemporaryDirectory(prefix="format-a4-") as tmp, sync_playwright() as p:
        nav = p.chromium.launch()
        try:
            if ecran:
                for largeur in LARGEURS_ECRAN:
                    pg = nav.new_page(viewport={"width": largeur, "height": 1080})
                    pg.goto(page.resolve().as_uri())
                    pg.wait_for_timeout(800)
                    haut = pg.evaluate("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)")
                    pg.close()
                    mesures["ecran"].append({
                        "nom": f"écran {largeur} px", "hauteur_mm": round(haut / PX_PAR_MM, 1),
                        "limite_mm": HAUTEUR_FEUILLE_MM, "ok": haut <= HAUTEUR_FEUILLE_MM * PX_PAR_MM + TOLERANCE_PX,
                        "bloquant": True})
            pg = nav.new_page(viewport={"width": 1280, "height": 1080})
            pg.goto(page.resolve().as_uri())
            pg.wait_for_timeout(800)
            pg.emulate_media(media="print")  # un navigateur imprime en média print
            for i, cond in enumerate(CONDITIONS):
                f = Path(tmp) / f"cas{i}.pdf"
                pg.pdf(path=str(f), print_background=True, **cond["options"])
                n = compter(f)
                mesures["impression"].append({"nom": cond["nom"], "pages": n, "limite_pages": pages_max,
                                              "ok": n <= pages_max, "bloquant": cond["bloquant"]})
            pg.close()
        finally:
            nav.close()
    tous = mesures["ecran"] + mesures["impression"]
    echecs = [m for m in tous if not m["ok"] and m["bloquant"]]
    avertissements = [m for m in tous if not m["ok"] and not m["bloquant"]]
    return {"verdict": "FAIL" if echecs else "PASS", "compteur": nom_compteur, "mesures": mesures,
            "echecs": [m["nom"] for m in echecs], "avertissements": [m["nom"] for m in avertissements]}


def main() -> int:
    ap = argparse.ArgumentParser(description="Une page demandée « sur une page A4 » tient-elle sur une feuille ?")
    ap.add_argument("page", type=Path, help="fichier HTML à juger")
    ap.add_argument("--pages", type=int, default=1, help="nombre de pages demandé (défaut : 1)")
    ap.add_argument("--sans-ecran", action="store_true", dest="sans_ecran",
                    help="ne pas mesurer la hauteur à l'écran (demande qui ne vise que l'impression)")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    a = ap.parse_args()
    if a.pages < 1:
        print("Erreur : --pages doit valoir 1 au moins.", file=sys.stderr)
        return 2
    r = mesurer(a.page, a.pages, not a.sans_ecran)
    r["page"] = str(a.page)
    r["pages_demandees"] = a.pages
    # Contrat d'entrée des oracles CLI de quality-oracles : oracle, domaine, artefact, verdict, findings[], non_juge[].
    r["oracle"] = "check_format_a4"
    r["domaine"] = "Format imprimé demandé (nombre de pages dans les conditions du lecteur)"
    r["artefact"] = str(a.page)
    if r["verdict"] == "SKIP":
        r["findings"] = [r["motif"]]
    else:
        tous = r["mesures"]["ecran"] + r["mesures"]["impression"]
        r["findings"] = [
            (f"{m['nom']} : {m['hauteur_mm']} mm pour {m['limite_mm']:.0f} mm" if "hauteur_mm" in m
             else f"{m['nom']} : {m['pages']} page(s) pour {m['limite_pages']}")
            for m in tous if not m["ok"]]
    r["non_juge"] = NON_JUGE + ([] if not a.sans_ecran else
                                ["LA HAUTEUR À L'ÉCRAN n'est pas mesurée (--sans-ecran) : la page peut dépasser 297 mm à l'écran"])
    if a.output == "json":
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print(f"Source  : {a.page}")
        print(f"Demande : {a.pages} page(s) A4")
        print(f"Verdict : {r['verdict']}")
        if r["verdict"] == "SKIP":
            print(f"  motif : {r['motif']}")
        else:
            for m in r["mesures"]["ecran"]:
                print(f"  {'PASS' if m['ok'] else 'FAIL'}  {m['nom']:<62} {m['hauteur_mm']} mm / {m['limite_mm']:.0f} mm")
            for m in r["mesures"]["impression"]:
                marque = "PASS" if m["ok"] else ("FAIL" if m["bloquant"] else "avertissement")
                print(f"  {marque:<4}  {m['nom']:<62} {m['pages']} page(s) / {m['limite_pages']}")
            if r["echecs"]:
                print("\nÉchecs bloquants : " + " | ".join(r["echecs"]))
            if r["avertissements"]:
                print("Avertissements : " + " | ".join(r["avertissements"]))
        print("\nPérimètre de NON-MESURE (ce verdict ne dit rien de ceci) :")
        for note in r["non_juge"]:
            print(f"  non jugé — {note}")
    return {"PASS": 0, "FAIL": 1}.get(r["verdict"], 2)


if __name__ == "__main__":
    sys.exit(main())
