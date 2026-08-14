# -*- coding: utf-8 -*-
"""Preuve que chaque affordance de la page est cablee (loi transverse 1)."""
import pathlib, sys
from playwright.sync_api import sync_playwright

page_path = pathlib.Path(sys.argv[1]).resolve().as_uri()
ok, ko = [], []

def att(nom, cond, detail=""):
    (ok if cond else ko).append(f"{nom} {detail}".strip())

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 1000})
    pg.goto(page_path)
    pg.wait_for_timeout(400)

    total = pg.eval_on_selector_all("#t-verdicts tbody tr", "els => els.length")
    att("Tableau des verdicts chargé", total == 86, f"({total} lignes)")

    def visibles():
        return pg.eval_on_selector_all(
            "#t-verdicts tbody tr",
            "els => els.filter(e => e.offsetParent !== null).length")

    att("Toutes les lignes visibles à l'ouverture", visibles() == 86, f"({visibles()})")

    # H3 — KPI cliquable qui filtre
    pg.click('[data-kpi-filtre="mapper reserve"]')
    pg.wait_for_timeout(200)
    v1 = visibles()
    att("KPI « à mapper » filtre la liste", v1 == 35, f"({v1} lignes visibles)")
    att("KPI porte aria-pressed=true",
        pg.get_attribute('[data-kpi-filtre="mapper reserve"]', "aria-pressed") == "true")
    cpt = pg.inner_text('[data-tf-count-for="t-verdicts"]')
    att("Compteur annonce la vue filtrée", "35" in cpt and "indicateur" in cpt, f"« {cpt} »")

    pg.click('[data-kpi-filtre="non"]')
    pg.wait_for_timeout(200)
    v2 = visibles()
    att("KPI « non alimentables » filtre la liste", v2 == 51, f"({v2} lignes)")

    pg.click('[data-kpi-filtre="non"]')
    pg.wait_for_timeout(200)
    att("Second clic rétablit la liste complète", visibles() == 86, f"({visibles()})")

    # H1 — filtres de colonne injectes par le composant
    nb_btn = pg.eval_on_selector_all("#t-verdicts thead .tf-btn", "els => els.length")
    att("Filtres de colonne injectés", nb_btn >= 3, f"({nb_btn} colonnes filtrables)")
    pg.click("#t-verdicts thead .tf-btn")
    pg.wait_for_timeout(150)
    att("Panneau de filtre s'ouvre",
        pg.eval_on_selector("#t-verdicts thead .tf-panel", "el => !el.hidden"))
    pg.click("#t-verdicts thead .tf-panel button:nth-of-type(2)")   # « Aucun »
    pg.wait_for_timeout(250)
    att("Filtre de colonne masque effectivement des lignes", visibles() == 0, f"({visibles()})")

    # H2 — recherche
    pg.fill("#find", "site_code_alx")
    pg.wait_for_timeout(300)
    nb_marks = pg.eval_on_selector_all("mark.find-hit", "els => els.length")
    att("Recherche surligne les occurrences", nb_marks >= 2, f"({nb_marks} surlignages)")
    att("Compteur d'occurrences renseigné",
        "occurrence" in pg.inner_text("#findCount"), f"« {pg.inner_text('#findCount')} »")
    att("Surlignage en classe find-hit, jamais find",
        pg.eval_on_selector("mark.find-hit", "el => el.className") == "find-hit")
    att("Surlignage rendu inline (L5)",
        pg.eval_on_selector("mark.find-hit",
                            "el => getComputedStyle(el).display") == "inline")

    # H2 — remise a zero
    pg.click("#reset")
    pg.wait_for_timeout(350)
    att("Réinitialisation vide la recherche", pg.input_value("#find") == "")
    att("Réinitialisation retire les surlignages",
        pg.eval_on_selector_all("mark.find-hit", "els => els.length") == 0)
    att("Réinitialisation rétablit toutes les lignes", visibles() == 86, f"({visibles()})")

    # R-30 — bascule sombre cablee et persistee
    att("Thème clair par défaut",
        pg.eval_on_selector("html", "el => el.getAttribute('data-theme')") == "light")
    pg.click("#theme-toggle")
    pg.wait_for_timeout(150)
    att("Bascule pose data-theme=dark",
        pg.eval_on_selector("html", "el => el.getAttribute('data-theme')") == "dark")
    att("Bascule met aria-pressed à jour",
        pg.get_attribute("#theme-toggle", "aria-pressed") == "true")
    att("Choix persisté en localStorage",
        pg.evaluate("localStorage.getItem('digitai-theme')") == "dark")
    pg.reload()
    pg.wait_for_timeout(300)
    att("Thème sombre rejoué au rechargement",
        pg.eval_on_selector("html", "el => el.getAttribute('data-theme')") == "dark")

    # L6 — les ancres du sommaire resolvent
    morts = pg.evaluate("""() => Array.from(document.querySelectorAll('nav.toc a'))
        .filter(a => !document.querySelector(a.getAttribute('href'))).length""")
    att("Aucune ancre morte au sommaire", morts == 0)

    # A1 — aucune requete reseau sortante
    pg2 = b.new_page()
    externes = []
    pg2.on("request", lambda r: externes.append(r.url)
           if r.url.startswith("http") else None)
    pg2.goto(page_path)
    pg2.wait_for_timeout(500)
    att("Aucune requête réseau au chargement", not externes, f"({len(externes)})")

    b.close()

print("PASS : %d" % len(ok))
for x in ok:
    print("  ok  " + x)
if ko:
    print("FAIL : %d" % len(ko))
    for x in ko:
        print("  x   " + x)
sys.exit(1 if ko else 0)
