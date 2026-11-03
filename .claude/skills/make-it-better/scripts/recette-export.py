#!/usr/bin/env python3
"""recette-export.py — la page autoportante d'exporter-page.mjs, jouée dans un vrai navigateur.

    python recette-export.py [--captures <dossier>]

Construit un essai Markdown (par `lancer.mjs --simuler`) et, si Pillow est présent, un essai au
format image (aperçus PNG synthétiques), les exporte en pages HTML autonomes, puis ouvre chaque
fichier en `file://` dans Chromium : aperçu, comparaison dans le format (écart de pages encadré) et
en texte marqué (compté en mots), revue à l'aveugle sans enregistrement, aucune requête réseau,
aucune erreur JavaScript. Exit 0 si tout est tenu, 1 sinon, 2 si Playwright manque.
"""
import argparse
import json
import pathlib
import subprocess
import sys
import tempfile

ICI = pathlib.Path(__file__).resolve().parent
sys.stdout.reconfigure(encoding="utf-8")

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("SKIP : playwright absent, la page exportée n'est pas jouée au navigateur")
    sys.exit(2)

ecarts = []


def ok(nom, cond, detail=""):
    print(f"{'OK ' if cond else 'KO '} {nom}{' — ' + str(detail) if not cond else ''}")
    if not cond:
        ecarts.append(nom)


def exporter(espace, sortie):
    r = subprocess.run(["node", str(ICI / "exporter-page.mjs"), "--espace", str(espace),
                        "--sortie", str(sortie), "--jour", "20261103"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"export refusé : {r.stderr or r.stdout}")
    return sortie / (json.loads(r.stdout)["chemin"].replace("\\", "/").split("/")[-1])


def espace_md(base):
    esp = base / "md"
    (esp / "document").mkdir(parents=True)
    import shutil
    shutil.copytree(ICI.parent / "fixtures" / "cadre", esp / "document", dirs_exist_ok=True)
    r = subprocess.run(["node", str(ICI / "lancer.mjs"), "--document",
                        str(ICI.parent / "fixtures" / "documents" / "note.md"),
                        "--espace", str(esp), "--simuler", "rejets-2", "--tours", "4"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"essai md non joué : {r.stderr}")
    return esp


def espace_image(base):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    esp = base / "img"
    (esp / "document").mkdir(parents=True)
    (esp / "document" / "origine.pdf").write_bytes(b"%PDF-1.4 factice\n")
    ess = esp / "essais" / "opus-1"
    (ess / "tours").mkdir(parents=True)
    etat = {"modele": "opus", "effort": "medium", "tours_max": 2, "debut": "2026-11-03T09:00:00.000Z",
            "arret": {"type": "borne", "date": "2026-11-03T09:05:00.000Z"}, "plafond": {"limite": 180}}
    (ess / "etat.json").write_text(json.dumps(etat), encoding="utf-8")
    tours = [{"numero": 0, "statut": "gardee", "type": "origine", "mots": {"ajoutes": 0, "retires": 0, "total": 120}},
             {"numero": 1, "statut": "gardee", "type": "reformulation", "mots": {"ajoutes": 4, "retires": 6, "total": 118}},
             {"numero": 2, "statut": "gardee", "type": "rien", "mots": {"ajoutes": 0, "retires": 0, "total": 118}}]
    for t in tours:
        n = f"{t['numero']:03d}"
        (ess / "tours" / n).mkdir(parents=True, exist_ok=True)
        (ess / "tours" / n / "controle.json").write_text(json.dumps(t), encoding="utf-8")
        (ess / "tours" / n / "document.pdf").write_bytes(b"%PDF-1.4 factice\n")
        img = Image.new("RGB", (800, 600), "white")
        d = ImageDraw.Draw(img)
        d.rectangle([40, 40, 760, 120], fill=(37, 99, 235))
        for i in range(6):
            d.text((60, 160 + i * 50), "Ligne de contenu numero " + str(i + 1), fill=(15, 23, 42))
        if t["numero"] >= 1:  # tours 1 et 2 identiques (un doublon à dédoublonner), distincts de l'origine
            d.rectangle([60, 300, 500, 340], fill=(200, 30, 30))
        ap = esp / "apercus" / "opus-1" / n
        ap.mkdir(parents=True, exist_ok=True)
        img.save(ap / "page-001.png")
    return esp


def parcours_md(pg, erreurs):
    ok("md : ouvre sur la dernière gardée (Tour 003)", "Tour 003" in pg.inner_text("#titre-panneau"), pg.inner_text("#titre-panneau"))
    ok("md : menu de 5 versions", pg.locator("#liste li").count() == 5, pg.locator("#liste li").count())
    pg.click('[data-filtre="rejetees"]')
    ok("md : filtre Rejetées = 3", pg.locator("#liste li").count() == 3, pg.locator("#liste li").count())
    pg.click('[data-filtre="toutes"]')
    ok("md : aperçu en iframe sandbox allow-scripts, en srcdoc", pg.get_attribute("#apercu-hote iframe", "sandbox") == "allow-scripts" and pg.get_attribute("#apercu-hote iframe", "srcdoc") is not None)
    pg.click("#onglet-comparer")
    pg.select_option("#comparer-gauche", "0")
    pg.select_option("#comparer-droite", "3")
    pg.click("#forme-texte")
    pg.wait_for_selector("#cote-a-cote:visible")
    ins, dels = pg.locator("#texte-droite ins").count(), pg.locator("#texte-gauche del").count()
    ok("md : texte marqué, ajouts/retraits surlignés", ins + dels > 0, f"{ins} ins / {dels} del")
    ok("md : le compte de mots est dit", "mots ajoutés" in pg.inner_text("#ecart-comparer"), pg.inner_text("#ecart-comparer"))


def parcours_image(pg):
    ok("img : aperçu en images embarquées (data:)", pg.get_attribute("#apercu-hote img", "src").startswith("data:image/png"))
    pg.click("#onglet-comparer")
    pg.select_option("#comparer-gauche", "0")
    pg.select_option("#comparer-droite", "1")
    pg.wait_for_function("document.getElementById('ecart-comparer').textContent.indexOf('modifiée') >= 0", timeout=15000)
    zones = pg.locator("#pages-comparer .zone").count()
    ok("img : zones d'écart encadrées des 2 côtés", zones >= 2 and zones % 2 == 0, f"{zones} cadres — {pg.inner_text('#ecart-comparer')}")
    ok("img : 2 images face à face", pg.locator("#pages-comparer .page-comparee").first.locator("img").count() == 2)
    pg.select_option("#comparer-gauche", "1")
    pg.select_option("#comparer-droite", "2")
    pg.wait_for_function("document.getElementById('ecart-comparer').textContent.indexOf('Aucune différence') >= 0", timeout=15000)
    ok("img : 2 versions identiques (dédoublonnées) = aucune différence", "Aucune différence" in pg.inner_text("#ecart-comparer"), pg.inner_text("#ecart-comparer"))
    # Revue à l'aveugle sur la page image
    pg.click("#ouvrir-aveugle")
    pg.wait_for_selector(".rang")
    menu = pg.inner_text("#menu")
    ok("aveugle : 2 lettres, aucun numéro de version", pg.locator(".rang").count() == 2 and "Tour" not in menu and "Origine" not in menu, menu.replace("\n", " | ")[:120])
    ok("aveugle : onglet Comparer caché", not pg.locator("#onglet-comparer").is_visible())
    pg.locator(".rang").first.locator("input[type=checkbox]").check()
    pg.get_by_role("button", name="Valider le classement").click()
    ok("aveugle : classement figé, flèches retirées", pg.locator(".rang button[id^=monter]").count() == 0)
    pg.get_by_role("button", name="Lever l'aveugle").click()
    texte = pg.inner_text("#rangs")
    ok("aveugle : la levée dit chaque version et reprend la pertinence", ("Origine" in texte or "Tour" in texte) and "pertinente" in texte, texte.replace("\n", " | ")[:120])


def principal():
    a = argparse.ArgumentParser()
    a.add_argument("--captures", default=None)
    o = a.parse_args()
    travail = pathlib.Path(tempfile.mkdtemp(prefix="mib-export-rec-"))
    captures = pathlib.Path(o.captures) if o.captures else travail / "captures"
    captures.mkdir(parents=True, exist_ok=True)
    md = exporter(espace_md(travail / "espaces"), travail / "out-md")
    espImg = espace_image(travail / "espaces")
    img = exporter(espImg, travail / "out-img") if espImg else None
    if not espImg:
        print("NON JOUÉ : les cas format image (Pillow absent)")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        erreurs = []
        pg.on("pageerror", lambda e: erreurs.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and erreurs.append(m.text))
        externes = []
        pg.on("request", lambda r: externes.append(r.url) if not r.url.startswith(("file:", "data:", "about:", "blob:")) else None)
        pg.goto(md.resolve().as_uri())
        pg.wait_for_load_state("load")
        parcours_md(pg, erreurs)
        pg.screenshot(path=str(captures / "export-md.png"))
        if img:
            pg.goto(img.resolve().as_uri())
            pg.wait_for_load_state("load")
            parcours_image(pg)
            pg.screenshot(path=str(captures / "export-image.png"), full_page=True)
        ok("aucune requête réseau externe", not externes, externes[:4])
        ok("aucune erreur JavaScript", not erreurs, "; ".join(erreurs)[:300])
        b.close()
    print(f"captures : {captures}")
    print(json.dumps({"ecarts": ecarts}, ensure_ascii=False))
    return 1 if ecarts else 0


if __name__ == "__main__":
    sys.exit(principal())
