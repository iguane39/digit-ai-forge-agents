#!/usr/bin/env python3
"""recette-navigateur.py — le parcours du porteur dans un vrai navigateur, sur des espaces de recette.

    python recette-navigateur.py --racine <dossier des espaces> [--port 4751] [--captures <dossier>]

Le dossier porte au moins un espace par format, chacun avec un essai `opus-1` arrêté (recette-reelle.mjs
ou `lancer.mjs --simuler`). Le parcours écrit des jugements et un classement : il se joue sur une copie.
Exit 0 si tout est tenu, 1 sinon, 2 si Playwright manque.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.stdout.reconfigure(encoding="utf-8")

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("SKIP : playwright absent, le parcours réel n'est pas joué")
    sys.exit(2)

ecarts = []


def verifier(nom, vrai, detail=""):
    print(f"{'OK ' if vrai else 'KO '} {nom}{' — ' + str(detail) if detail else ''}")
    if not vrai:
        ecarts.append(nom)


def winword():
    r = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "(Get-Process WINWORD -ErrorAction SilentlyContinue).Id"],
        capture_output=True, text=True,
    )
    return {int(x) for x in r.stdout.split()}


def choisir_doc(page, motif):
    options = page.locator("#choix-essai option")
    for i in range(options.count()):
        valeur = options.nth(i).get_attribute("value")
        if re.search(motif, valeur):
            page.select_option("#choix-essai", valeur)
            page.wait_for_timeout(300)
            return valeur
    raise SystemExit(f"aucun espace ne répond à {motif} : {[options.nth(i).get_attribute('value') for i in range(options.count())]}")


def cadre(page):
    return page.frame_locator("#cadre")


def attendre_cadre(page, attente_ms=150000):
    page.wait_for_function(
        "() => !/en préparation/.test(document.getElementById('statut').textContent)", timeout=attente_ms
    )
    page.wait_for_timeout(300)


def parcours(page, base, captures):
    externes = []
    page.on("request", lambda r: externes.append(r) if not r.url.startswith(base) and not r.url.startswith(("data:", "about:", "blob:")) else None)
    page.goto(base)
    page.wait_for_selector(".version")
    verifier("la page s'ouvre sur un menu de versions", page.locator(".version").count() >= 1, page.locator(".version").count())
    verifier("le cadre est sandboxé sans allow-same-origin", page.get_attribute("#cadre", "sandbox") == "allow-scripts")

    # Markdown rendu
    choisir_doc(page, r"note-md")
    n_md = page.locator(".version").count()
    verifier("Markdown : le menu liste l'origine et les tours", n_md >= 2 and "Origine" in page.locator(".version").first.inner_text(), n_md)
    page.locator(".version").first.click()
    attendre_cadre(page)
    verifier("Markdown : l'origine est rendue, titre en h1", cadre(page).locator("h1").count() == 1 and "Note de cadrage" in cadre(page).locator("h1").inner_text())
    verifier("Markdown : aucune marque # ne reste", "#" not in cadre(page).locator("h1").inner_text())
    page.screenshot(path=str(captures / "01-markdown.png"))

    # Choisir une version, comparer avec la précédente
    page.locator(".version").nth(1).click()
    attendre_cadre(page)
    verifier("choisir une version : elle devient courante", page.locator(".version").nth(1).get_attribute("aria-current") == "true")
    verifier("choisir une version : le clavier garde sa place", page.evaluate("document.activeElement.getAttribute('data-numero')") == "1", page.evaluate("document.activeElement.tagName"))
    verifier("choisir une version : l'adresse du cadre suit", "/apercu/" in page.get_attribute("#cadre", "src"), page.get_attribute("#cadre", "src"))
    page.click("#onglet-comparer")
    page.wait_for_timeout(500)
    if page.locator("#cote-a-cote").is_visible():
        ajoutes, retires = page.locator("#texte-droite ins").count(), page.locator("#texte-gauche del").count()
        verifier("comparer : 2 colonnes, l'écart surligné", ajoutes + retires > 0, f"{ajoutes} ajouts, {retires} retraits")
        verifier("comparer : le compte de mots est dit", "mots ajoutés" in page.locator("#ecart-comparer").inner_text(), page.locator("#ecart-comparer").inner_text())
    else:
        verifier("comparer : l'état vide dit quoi faire", page.locator("#vide-comparer").is_visible(), page.locator("#vide-comparer").inner_text())
    page.screenshot(path=str(captures / "02-comparer.png"))
    page.locator(".version").first.click()
    page.wait_for_timeout(400)
    verifier("comparer sur l'origine : l'état vide dit quoi faire", "choisis un tour" in page.locator("#vide-comparer").inner_text(), page.locator("#vide-comparer").inner_text())
    page.click("#onglet-apercu")

    # Marquer, recharger, retrouver
    page.locator(".version").nth(1).click()
    page.click("#marque-oui")
    page.wait_for_timeout(300)
    verifier("marquer : le menu le montre", "pertinente" in page.locator(".version").nth(1).inner_text())
    page.reload()
    page.wait_for_selector(".version")
    choisir_doc(page, r"note-md")
    page.locator(".version").nth(1).click()
    page.wait_for_timeout(300)
    verifier("recharger : le marquage est retrouvé", "pertinente" in page.locator(".version").nth(1).inner_text() and page.get_attribute("#marque-oui", "aria-pressed") == "true")

    # Filtrer
    page.click('.filtre[data-filtre="pertinentes"]')
    page.wait_for_timeout(200)
    verifier("filtre Pertinentes : la seule version marquée", page.locator(".version").count() == 1)
    page.click('.filtre[data-filtre="non-jugees"]')
    page.wait_for_timeout(200)
    verifier("filtre Non jugées : les autres", page.locator(".version").count() == n_md - 1, page.locator(".version").count())
    page.click('.filtre[data-filtre="toutes"]')
    page.wait_for_timeout(200)
    verifier("filtre Toutes : tout revient", page.locator(".version").count() == n_md)

    # Aperçu PDF
    choisir_doc(page, r"note-pdf")
    page.locator(".version").first.click()
    attendre_cadre(page)
    cadre(page).locator("img").first.wait_for(timeout=60000)
    largeur = cadre(page).locator("img").first.evaluate("i => i.naturalWidth")
    verifier("PDF : l'aperçu est une image de page chargée dans le cadre", largeur > 100, f"{largeur} px")
    page.screenshot(path=str(captures / "03-pdf.png"))

    # Aperçu Word, par le vrai Word
    avant = winword()
    choisir_doc(page, r"note-docx")
    page.locator(".version").first.click()
    attendre_cadre(page)
    cadre(page).locator("img, pre").first.wait_for(timeout=150000)
    images = cadre(page).locator("img").count()
    verifier("Word : l'aperçu passe en images de pages, par Word", images >= 1, f"{images} image(s)")
    if images:
        verifier("Word : l'image est chargée", cadre(page).locator("img").first.evaluate("i => i.naturalWidth") > 100)
    page.screenshot(path=str(captures / "04-word.png"))
    page.wait_for_timeout(2000)
    verifier("Word : aucun processus lancé ne reste", winword() <= avant, f"avant {avant}, après {winword()}")

    # HTML : le tour 1 de la copie porte une image externe, un fetch et une lecture du parent
    choisir_doc(page, r"note-html")
    page.locator(".version").first.click()
    attendre_cadre(page)
    page.wait_for_timeout(600)
    verifier("HTML : la version s'affiche", cadre(page).locator("h1").count() == 1)
    page.locator(".version").nth(1).click()
    attendre_cadre(page)
    page.wait_for_timeout(1000)
    corps_cadre = cadre(page).locator("body")
    verifier("HTML : le script de la version tourne dans le cadre", corps_cadre.get_attribute("data-isole") is not None)
    verifier("HTML : sans allow-same-origin, le parent reste hors d'atteinte", corps_cadre.get_attribute("data-isole") == "oui", corps_cadre.get_attribute("data-isole"))
    verifier("HTML : la CSP bloque le fetch externe", corps_cadre.get_attribute("data-reseau") == "bloque", corps_cadre.get_attribute("data-reseau"))
    verifier("HTML : le titre du parent n'a pas bougé", "FUITE" not in page.title(), page.title())
    tentees = [r for r in externes if "exemple.org" in r.url]
    verifier("HTML : l'image externe est tentée par la version", len(tentees) >= 1, [r.url for r in tentees])
    verifier("HTML : la CSP les arrête avant le réseau", all("csp" in (r.failure or "").lower() for r in tentees), [r.failure for r in tentees])
    # Le témoin : sans CSP, la même image part pour de bon, et l'échec n'est pas celui de la CSP.
    temoin = page.context.browser.new_page()
    vues = []
    temoin.on("request", lambda r: vues.append(r))
    temoin.route("**/*", lambda r: r.abort())
    temoin.set_content('<img src="https://exemple.org/traceur.png" alt="">')
    temoin.wait_for_timeout(300)
    verifier("témoin : sans CSP, le capteur voit partir l'image, sans blocage CSP", any("exemple.org" in r.url and "csp" not in (r.failure or "").lower() for r in vues), [(r.url, r.failure) for r in vues])
    temoin.close()

    # Revue à l'aveugle, sur le Markdown
    choisir_doc(page, r"note-md")
    page.click("#ouvrir-aveugle")
    page.wait_for_selector(".rang")
    page.wait_for_timeout(400)
    menu = page.locator("#menu").inner_text()
    verifier("aveugle : aucun numéro dans le menu", not re.search(r"\d", menu), menu)
    verifier("aveugle : aucun numéro de version, ni tour, ni mots", not re.search(r"Tour|mots|gardée|rejetée|Origine", menu), menu)
    verifier("aveugle : aucun chiffre dans le titre", not re.search(r"\d", page.title()), page.title())
    verifier("aveugle : aucun chiffre de version dans l'adresse", not re.search(r"\d", page.url.replace(base, "")), page.url)
    src = page.get_attribute("#cadre", "src")
    verifier("aveugle : l'adresse de l'aperçu est neutre", re.fullmatch(r"/aveugle/[A-Z]", src) is not None, src)
    verifier("aveugle : l'onglet Comparer a disparu", not page.locator("#onglet-comparer").is_visible())
    verifier("aveugle : le sélecteur a disparu", not page.locator("#choix-essai").is_visible())
    verifier("aveugle : le marquage par version a disparu", not page.locator("#marque-oui").is_visible())
    corps = page.locator("main").inner_text()
    verifier("aveugle : ni commentaire ni motif à l'écran", "Motif" not in corps and "gardée" not in corps, corps[:200])
    page.screenshot(path=str(captures / "05-aveugle.png"))

    # Classer, lever
    lettres = page.locator(".rang button:has-text('Lettre')").all_inner_texts()
    verifier("aveugle : les lettres se suivent", [x.replace("Lettre ", "") for x in lettres] == sorted(x.replace("Lettre ", "") for x in lettres), lettres)
    verifier("aveugle : au moins 2 lettres, origine comprise", len(lettres) >= 2, lettres)
    verifier("aveugle : lever est impossible avant de classer", not page.locator("#lever-aveugle").is_visible())
    page.locator(".rang").nth(1).locator("button:has-text('Monter')").click()
    page.wait_for_timeout(100)
    ordre = page.locator(".rang button:has-text('Lettre')").all_inner_texts()
    verifier("classer : la lettre monte", ordre[0] == lettres[1], ordre)
    verifier("classer : le clavier garde sa place", page.evaluate("document.activeElement.id").endswith(lettres[1].replace("Lettre ", "")), page.evaluate("document.activeElement.id"))
    page.locator(".rang").first.locator("input").check()
    page.click("#enregistrer-classement")
    page.wait_for_selector("#lever-aveugle:not([hidden])")
    verifier("classer : enregistré, lever devient possible", page.locator("#lever-aveugle").is_visible())
    verifier("classer : toujours aucun numéro avant la levée", not re.search(r"Tour|Origine", page.locator("#menu").inner_text()))
    page.reload()
    page.wait_for_selector(".rang")
    verifier("recharger la revue : toujours à l'aveugle", page.locator("#menu-aveugle").is_visible() and not re.search(r"\d", page.title()), page.title())
    page.click("#lever-aveugle")
    page.wait_for_function("() => /Tour|Origine/.test(document.getElementById('menu').innerText)")
    menu2 = page.locator("#menu").inner_text()
    verifier("lever : chaque lettre dit sa version", "Origine" in menu2, menu2)
    page.screenshot(path=str(captures / "06-levee.png"))
    page.click("#quitter-aveugle")
    page.wait_for_selector(".version")
    page.wait_for_timeout(300)
    versions = page.locator(".version").all_inner_texts()
    verifier("lever : le marquage a rejoint les jugements", any("pertinente" in v for v in versions), versions[:3])
    verifier("quitter : l'onglet Comparer revient", page.locator("#onglet-comparer").is_visible())

    # Aveugle sur Word et PDF : des images, jamais un fichier
    for motif, nom in ((r"note-docx", "Word"), (r"note-pdf", "PDF")):
        choisir_doc(page, motif)
        page.click("#ouvrir-aveugle")
        page.wait_for_selector(".rang", timeout=300000)
        page.wait_for_timeout(600)
        verifier(f"aveugle {nom} : pas de repli sur le texte", "texte extrait" not in page.locator("#statut").inner_text(), page.locator("#statut").inner_text())
        cadre(page).locator("img").first.wait_for(timeout=60000)
        src_image = cadre(page).locator("img").first.get_attribute("src")
        verifier(f"aveugle {nom} : image à l'adresse neutre", re.fullmatch(r"/aveugle/[A-Z]/page/1", src_image) is not None, src_image)
        verifier(f"aveugle {nom} : image chargée", cadre(page).locator("img").first.evaluate("i => i.naturalWidth") > 100)
        verifier(f"aveugle {nom} : aucun lien vers un fichier", cadre(page).locator("a").count() == 0)
        page.click("#quitter-aveugle")
        page.wait_for_selector(".version")
        page.wait_for_timeout(300)
    verifier("Word : aucun processus lancé ne reste après la revue", winword() <= avant, f"avant {avant}, après {winword()}")

    # Thème sombre, sans réseau
    page.click("#theme-toggle")
    verifier("bascule sombre", page.evaluate("document.documentElement.getAttribute('data-theme')") == "dark")
    page.click("#theme-toggle")
    parties = [(r.url, r.failure) for r in externes if "csp" not in (r.failure or "").lower()]
    verifier("aucune requête hors de 127.0.0.1 ne part, parcours entier", not parties, parties[:5])


def petit_ecran(navigateur, base, captures):
    p = navigateur.new_page(viewport={"width": 390, "height": 844})
    p.goto(base)
    p.wait_for_selector(".version")
    deborde = p.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    verifier("390 px : aucun défilement horizontal", deborde <= 0, f"{deborde} px")
    p.locator(".version").nth(1).click()
    p.wait_for_timeout(300)
    p.click("#onglet-comparer")
    p.wait_for_timeout(500)
    verifier("390 px : comparer sans défilement horizontal", p.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0)
    p.screenshot(path=str(captures / "07-390-comparer.png"), full_page=True)
    p.close()


def principal():
    a = argparse.ArgumentParser()
    a.add_argument("--racine", required=True)
    a.add_argument("--port", type=int, default=4751)
    a.add_argument("--captures", default=None)
    o = a.parse_args()
    source = Path(o.racine)
    travail = Path(tempfile.mkdtemp(prefix="mib-nav-"))
    copie = travail / "espaces"
    # La copie du parcours : ni l'aveugle ni les jugements n'y survivent d'un passage à l'autre.
    shutil.copytree(source, copie, ignore=shutil.ignore_patterns("aveugle.json", "classement.json", "jugements.json", "bilan.md"))
    # Le piège du banc CSP : sur la copie seulement, jamais sur l'espace d'origine.
    PIEGE = """<img src="https://exemple.org/traceur.png" alt="piège"><script>
      try { parent.document.title = 'FUITE'; document.body.dataset.isole = 'non'; } catch (e) { document.body.dataset.isole = 'oui'; }
      fetch('https://exemple.org/f').then(function () { document.body.dataset.reseau = 'joint'; }).catch(function () { document.body.dataset.reseau = 'bloque'; });
    </script></body>"""
    for f in copie.glob("*note-html*/essais/opus-1/tours/001/document.html"):
        f.write_text(f.read_text(encoding="utf-8").replace("</body>", PIEGE), encoding="utf-8")
    captures = Path(o.captures) if o.captures else travail / "captures"
    captures.mkdir(parents=True, exist_ok=True)
    serveur = subprocess.Popen(["node", str(ICI / "serveur-versions.mjs"), "--espace", str(copie), "--port", str(o.port)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    base = f"http://127.0.0.1:{o.port}/"
    try:
        print(serveur.stdout.readline().strip())
        with sync_playwright() as p:
            n = p.chromium.launch()
            page = n.new_page(viewport={"width": 1440, "height": 900})
            parcours(page, base, captures)
            petit_ecran(n, base, captures)
            n.close()
    finally:
        serveur.terminate()
        time.sleep(0.5)
        shutil.rmtree(copie, ignore_errors=True)
        if o.captures:
            shutil.rmtree(travail, ignore_errors=True)
    print(f"captures : {captures}")
    print(json.dumps({"ecarts": ecarts}, ensure_ascii=False))
    return 1 if ecarts else 0


if __name__ == "__main__":
    sys.exit(principal())
