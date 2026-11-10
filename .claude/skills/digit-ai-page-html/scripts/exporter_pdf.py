#!/usr/bin/env python3
"""exporter_pdf.py — l'export PDF d'une page du socle, aux polices de la charte sur n'importe quel poste.

LE FAIT PAYÉ (retour RA-202 du lot du produit marketing, TF-2352, seq 79, 12/09/2026). Les pages du socle déclaraient leurs
polices sans @font-face. Sur un poste qui n'a pas ces polices, l'impression PDF (navigateur ou mode sans tête) retombait
sur Segoe UI et Consolas : premier rendu aux polices embarquées AAAAAA+SegoeUI et DAAAAA+Consolas ; second rendu, depuis
une copie de travail portant des @font-face, DMSans9pt, Roboto, JetBrainsMono. Le PDF sortait de la charte sans que rien le
dise, parce que le poste producteur, lui, a les polices. La page livrée reste inchangée (la règle A1 interdit toute requête
réseau et l'embarquement se fait par la copie de travail) : c'est l'EXPORT qui fournit les polices.

CE QUE CE SCRIPT FAIT, avec Chromium (Playwright) et pymupdf :
  · lit les familles que la page déclare (piles `font-family` et jetons `--…` portant une pile) ;
  · cherche dans un CACHE LOCAL de polices (WOFF2 au nommage `<famille>-latin-<graisse>-normal.woff2`, celui de
    `digit-ai-schemas/scripts/fonts`, ou `--cache`, ou la variable `DIGIT_AI_POLICES`) les familles qu'elle ne
    embarque pas déjà, et les pose en `@font-face` data: dans une COPIE DE TRAVAIL, jamais dans la page ni dans un
    fichier du dépôt (la copie vit dans le dossier temporaire du poste, `<base>` garde les chemins relatifs) ;
  · imprime la copie en PDF (`@page` de la page, A4 en repli, fonds imprimés) ;
  · LIT les polices que le PDF embarque et les classe : de la charte (le nom répond à une famille que la page déclare) ou
    de REPLI. Une police de repli embarquée est un ÉCHEC : le PDF est sorti de la charte, et le script le dit au lieu
    de livrer. `--tolerer-repli "Nom1,Nom2"` déclare une police de repli attendue (glyphe absent des polices de la charte).

Usage :
  python exporter_pdf.py <page.html> --out <fichier.pdf> [--cache <dossier>] [--tolerer-repli "Segoe UI Symbol"] [--output json]
Exit : 0 PDF écrit, polices de la charte seules · 1 PDF écrit mais au moins une police de repli embarquée ·
       2 SKIP (Chromium, pymupdf ou cache de polices absent, page illisible) — jamais un PASS muet.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
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

ICI = Path(__file__).resolve().parent
CACHE_PAR_DEFAUT = ICI.parent.parent / "digit-ai-schemas" / "scripts" / "fonts"
GENERIQUES = {"serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-monospace", "ui-sans-serif",
              "ui-serif", "ui-rounded", "emoji", "math", "fangsong", "inherit", "initial", "unset"}
RE_PILE = re.compile(r"(?:font-family|--[\w-]+)\s*:\s*([^;{}]*[\"'][^;{}]*)", re.I)
RE_NOM_FACE = re.compile(r"^(?P<slug>[a-z0-9-]+?)-latin-(?P<poids>\d{3})-normal\.woff2$")
RE_FONT_FACE = re.compile(r"@font-face\s*\{[^}]*\}", re.I)
RE_FAMILLE_FACE = re.compile(r"font-family\s*:\s*[\"']?([^\"';}]+)", re.I)

NON_JUGE = [
    "SEUL CHROMIUM est joué : un autre navigateur embarque d'autres polices de repli",
    "LES FAMILLES du cache sont celles qu'il contient (graisses 400 à 900, sous-ensemble latin, style normal) : une "
    "famille absente du cache et non embarquée par la page n'est pas fournie, et sa police de repli est un échec",
    "LES GLYPHES hors du sous-ensemble latin (flèches, symboles, caractères d'une autre écriture) tombent sur une police "
    "de repli : le script la nomme, et `--tolerer-repli` la déclare attendue",
    "LA POLICE d'une famille posée par une page qui l'embarque déjà (@font-face data:) n'est pas rejugée ; le script la "
    "tient pour de la charte",
    "LE CLASSEMENT charte / repli se fait sur le NOM de la police dans le PDF (préfixe de sous-ensemble ôté) : une "
    "police embarquée sous un autre nom que sa famille CSS serait classée repli, et une police INSTALLÉE sur le poste "
    "qui répond à une famille déclarée est classée charte (le script ne dit pas d'où elle vient ; une famille posée "
    "depuis le cache l'emporte sur l'installée, car son @font-face prime)",
]


def slug(famille: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", famille.lower()).strip("-")


def nom_normalise(nom: str) -> str:
    """Nom de police d'un PDF, préfixe de sous-ensemble (ABCDEF+) et ponctuation ôtés, en minuscules."""
    return re.sub(r"[^a-z0-9]", "", nom.split("+", 1)[-1].lower())


def familles_declarees(html: str) -> list[str]:
    """Les noms de famille cités entre guillemets dans les piles de la page, génériques exclus."""
    vues: list[str] = []
    for m in RE_PILE.finditer(RE_FONT_FACE.sub("", html)):
        for nom in re.findall(r"[\"']([^\"']+)[\"']", m.group(1)):
            if nom.lower() not in GENERIQUES and nom not in vues:
                vues.append(nom)
    return vues


def familles_embarquees_par_la_page(html: str) -> list[str]:
    return [m.group(1).strip() for f in RE_FONT_FACE.findall(html) for m in [RE_FAMILLE_FACE.search(f)] if m]


def faces_du_cache(cache: Path) -> dict[str, list[tuple[int, Path]]]:
    out: dict[str, list[tuple[int, Path]]] = {}
    for f in sorted(cache.glob("*.woff2")) if cache.is_dir() else []:
        m = RE_NOM_FACE.match(f.name)
        if m:
            out.setdefault(m.group("slug"), []).append((int(m.group("poids")), f))
    return out


def css_faces(familles: list[str], cache: dict[str, list[tuple[int, Path]]]) -> tuple[str, list[str], list[str]]:
    """(css, familles posées, familles non couvertes) : un @font-face data: par graisse du cache."""
    css, posees, absentes = [], [], []
    for fam in familles:
        faces = cache.get(slug(fam))
        if not faces:
            absentes.append(fam)
            continue
        posees.append(fam)
        for poids, fichier in faces:
            b64 = base64.b64encode(fichier.read_bytes()).decode("ascii")
            css.append(f'@font-face{{font-family:"{fam}";font-weight:{poids};font-style:normal;font-display:block;'
                       f'src:url(data:font/woff2;base64,{b64}) format("woff2")}}')
    return "\n".join(css), posees, absentes


def copie_de_travail(html: str, css: str, dossier_source: Path) -> str:
    """La page, plus un bloc @font-face et un <base> qui garde ses chemins relatifs. L'original n'est pas touché."""
    base = f'<base href="{dossier_source.resolve().as_uri().rstrip("/")}/">'
    bloc = f"{base}<style>/* polices posées par exporter_pdf.py (copie de travail) */\n{css}\n</style>"
    if re.search(r"</head\s*>", html, re.I):
        return re.sub(r"</head\s*>", lambda m: bloc + m.group(0), html, count=1, flags=re.I)
    return bloc + html


def polices_du_pdf(pdf: Path) -> list[str]:
    import pymupdf  # type: ignore
    noms: list[str] = []
    with pymupdf.open(str(pdf)) as doc:
        for i in range(doc.page_count):
            for (_xref, _ext, _type, basefont, _name, _enc) in doc.get_page_fonts(i):
                if basefont and basefont not in noms:
                    noms.append(basefont)
    return noms


def exporter(page: Path, sortie: Path, cache_dir: Path | None, tolerer: list[str]) -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:  # noqa: BLE001
        return {"verdict": "SKIP", "motif": f"playwright absent ({type(e).__name__}) : aucun PDF imprimé"}
    try:
        import pymupdf  # noqa: F401  # type: ignore
    except Exception as e:  # noqa: BLE001
        return {"verdict": "SKIP", "motif": f"pymupdf absent ({type(e).__name__}) : les polices du PDF ne se lisent pas"}
    if not page.is_file():
        return {"verdict": "SKIP", "motif": f"fichier illisible : {page}"}
    cache_dir = cache_dir or (Path(os.environ["DIGIT_AI_POLICES"]) if os.environ.get("DIGIT_AI_POLICES") else CACHE_PAR_DEFAUT)
    cache = faces_du_cache(cache_dir)
    if not cache:
        return {"verdict": "SKIP", "motif": f"aucune police dans le cache {cache_dir} (WOFF2 « <famille>-latin-<graisse>-normal.woff2 ») : "
                                            "rien à embarquer"}
    html = page.read_text(encoding="utf-8", errors="replace")
    deja = familles_embarquees_par_la_page(html)
    declarees = familles_declarees(html)
    a_poser = [f for f in declarees if f not in deja]
    css, posees, non_couvertes = css_faces(a_poser, cache)
    sortie.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="exporter-pdf-") as tmp:
        copie = Path(tmp) / "copie-de-travail.html"
        copie.write_text(copie_de_travail(html, css, page.parent), encoding="utf-8")
        with sync_playwright() as p:
            nav = p.chromium.launch()
            try:
                pg = nav.new_page(viewport={"width": 1280, "height": 1080})
                pg.goto(copie.as_uri())
                pg.evaluate("document.fonts && document.fonts.ready")
                pg.wait_for_timeout(500)
                pg.emulate_media(media="print")
                pg.pdf(path=str(sortie), format="A4", prefer_css_page_size=True, print_background=True)
                pg.close()
            finally:
                nav.close()
    embarquees = polices_du_pdf(sortie)
    # La charte, ce sont les familles que la page DÉCLARE : une police qui répond à l'une d'elles (posée depuis le
    # cache, embarquée par la page, ou installée sur le poste) est la bonne ; seule une police qui ne répond à aucune
    # est un repli (le défaut mesuré : Segoe UI et Consolas à la place des polices de la charte).
    charte_noms = [nom_normalise(f) for f in declarees + deja]
    tolerees = [nom_normalise(t) for t in tolerer]
    charte, repli = [], []
    for n in embarquees:
        nn = nom_normalise(n)
        if any(nn.startswith(c) for c in charte_noms if c):
            charte.append(n)
        elif any(nn.startswith(t) for t in tolerees if t):
            charte.append(n)
        else:
            repli.append(n)
    findings = [f"police de repli embarquée : {n} — le PDF est sorti de la charte" for n in repli]
    return {"verdict": "FAIL" if repli else "PASS", "pdf": str(sortie), "cache": str(cache_dir),
            "familles_declarees": declarees, "familles_embarquees_par_la_page": deja, "familles_posees": posees,
            "familles_non_couvertes": non_couvertes, "polices_du_pdf": embarquees, "charte": charte, "repli": repli,
            "findings": findings}


def main() -> int:
    ap = argparse.ArgumentParser(description="Export PDF d'une page du socle, polices de la charte embarquées depuis un cache local.")
    ap.add_argument("page", type=Path, help="fichier HTML à exporter")
    ap.add_argument("--out", type=Path, required=True, help="fichier PDF à écrire")
    ap.add_argument("--cache", type=Path, default=None,
                    help="dossier de WOFF2 « <famille>-latin-<graisse>-normal.woff2 » (défaut : digit-ai-schemas/scripts/fonts, "
                         "ou la variable DIGIT_AI_POLICES)")
    ap.add_argument("--tolerer-repli", default="", dest="tolerer",
                    help="polices de repli attendues, séparées par des virgules (glyphe absent des polices de la charte)")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    a = ap.parse_args()
    r = exporter(a.page, a.out, a.cache, [t.strip() for t in a.tolerer.split(",") if t.strip()])
    r["oracle"] = "exporter_pdf"
    r["domaine"] = "Polices embarquées de l'export PDF d'une page du socle"
    r["artefact"] = str(a.page)
    r["non_juge"] = list(NON_JUGE)
    if r["verdict"] == "SKIP":
        r["findings"] = [r["motif"]]
    if a.output == "json":
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print(f"Source  : {a.page}")
        print(f"Verdict : {r['verdict']}")
        if r["verdict"] == "SKIP":
            print(f"  motif : {r['motif']}")
        else:
            print(f"PDF     : {r['pdf']}")
            print(f"Cache   : {r['cache']}")
            print(f"Familles posées depuis le cache : {', '.join(r['familles_posees']) or 'aucune'}")
            if r["familles_embarquees_par_la_page"]:
                print(f"Familles déjà embarquées par la page : {', '.join(r['familles_embarquees_par_la_page'])}")
            if r["familles_non_couvertes"]:
                print(f"Familles ni dans le cache ni dans la page : {', '.join(r['familles_non_couvertes'])}")
            print(f"Polices du PDF : {', '.join(r['polices_du_pdf']) or 'aucune'}")
            for f in r["findings"]:
                print(f"  FAIL  {f}")
        print("\nPérimètre de NON-MESURE (ce verdict ne dit rien de ceci) :")
        for note in r["non_juge"]:
            print(f"  non jugé — {note}")
    return {"PASS": 0, "FAIL": 1}.get(r["verdict"], 2)


if __name__ == "__main__":
    sys.exit(main())
