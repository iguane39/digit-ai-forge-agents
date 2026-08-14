# -*- coding: utf-8 -*-
"""Preuve que chaque affordance du gabarit est cablee, y compris les trois
importees des barres du 13/08 : tri par colonne, etat dans l'URL, export.

Usage : python scripts/test_interactions_gabarit.py <gabarit.html>
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

page_path = pathlib.Path(sys.argv[1]).resolve().as_uri()
ok, ko = [], []


def att(nom, cond, detail=""):
    (ok if cond else ko).append(("%s %s" % (nom, detail)).strip())


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 1000},
                        permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page()
    pg.goto(page_path)
    pg.wait_for_timeout(400)

    def visibles(tid="t-verdicts"):
        return pg.eval_on_selector_all(
            "#%s tbody tr" % tid,
            "els => els.filter(e => e.offsetParent !== null).length")

    att("Tableau charge", visibles() == 12, "(%d lignes)" % visibles())

    # --- barre C2 : tri par colonne ------------------------------------------
    att("En-tetes transformes en boutons de tri",
        pg.eval_on_selector_all("#t-verdicts thead .th-tri", "e => e.length") == 8)
    pg.click("#t-verdicts thead th:nth-child(6) .th-tri")
    pg.wait_for_timeout(200)
    prem = pg.inner_text("#t-verdicts tbody tr:first-child td:nth-child(6)").strip()
    att("Tri croissant place la plus petite valeur en tete",
        prem.startswith("0,0") or prem.startswith("0,2"), "(%s)" % prem)
    att("aria-sort annonce l etat",
        pg.get_attribute("#t-verdicts thead th:nth-child(6)", "aria-sort") == "ascending")
    pg.click("#t-verdicts thead th:nth-child(6) .th-tri")
    pg.wait_for_timeout(200)
    prem2 = pg.inner_text("#t-verdicts tbody tr:first-child td:nth-child(6)").strip()
    att("Second clic inverse le sens", prem2.startswith("96,4"), "(%s)" % prem2)
    att("aria-sort suit l inversion",
        pg.get_attribute("#t-verdicts thead th:nth-child(6)", "aria-sort") == "descending")
    valeurs = pg.eval_on_selector_all(
        "#t-verdicts tbody tr td:nth-child(6)", "els => els.map(e => e.textContent.trim())")
    att("Les valeurs hors mesure ne sont pas triees comme des zeros",
        valeurs[-1] == "—", "(derniere : %s)" % valeurs[-1])

    # --- barre C2 : facettes -------------------------------------------------
    nb_f = pg.eval_on_selector_all("#t-verdicts thead .tf-btn", "e => e.length")
    att("Facettes injectees", nb_f >= 3, "(%d colonnes)" % nb_f)
    pg.click("#t-verdicts thead th:nth-child(2) .tf-btn")
    pg.wait_for_timeout(150)
    pg.click("#t-verdicts thead th:nth-child(2) .tf-panel button:nth-of-type(2)")
    pg.wait_for_timeout(250)
    att("Facette masque effectivement", visibles() == 0, "(%d)" % visibles())
    pg.click("#t-verdicts thead th:nth-child(2) .tf-panel button:nth-of-type(1)")
    pg.wait_for_timeout(250)
    att("Facette rend la main", visibles() == 12, "(%d)" % visibles())
    pg.keyboard.press("Escape")

    # --- indicateurs cliquables ---------------------------------------------
    pg.click('[data-kpi-filtre="retenu"]')
    pg.wait_for_timeout(250)
    att("Indicateur retenus filtre au bon compte", visibles() == 6, "(%d)" % visibles())
    cpt = pg.inner_text('[data-tab-count-for="t-verdicts"]')
    att("Compteur annonce la vue filtree", "6 lignes sur 12" in cpt, "(%s)" % cpt)
    pg.click('[data-kpi-filtre="retenu"]')
    pg.wait_for_timeout(200)
    att("Second clic retablit tout", visibles() == 12, "(%d)" % visibles())

    # --- barre C2 : etat dans l URL -----------------------------------------
    pg.click('[data-kpi-filtre="ecarte"]')
    pg.wait_for_timeout(200)
    pg.click("#t-verdicts thead th:nth-child(6) .th-tri")
    pg.wait_for_timeout(200)
    url = pg.url
    att("L etat de la vue part dans l URL", "vue=ecarte" in url and "_tri=" in url,
        "(%s)" % url.split("?")[-1][:60])
    pg2 = ctx.new_page()
    pg2.goto(url)
    pg2.wait_for_timeout(500)
    v2 = pg2.eval_on_selector_all("#t-verdicts tbody tr",
                                  "els => els.filter(e => e.offsetParent !== null).length")
    att("Le lien restitue la vue filtree", v2 == 5, "(%d lignes)" % v2)
    att("Le lien restitue le tri",
        pg2.get_attribute("#t-verdicts thead th:nth-child(6)", "aria-sort") is not None)
    pg2.close()

    # --- barre C2 : export du sous-ensemble affiche -------------------------
    pg.click('[data-copier-table="t-verdicts"]')
    pg.wait_for_timeout(400)
    etat = pg.inner_text("#copie-etat")
    att("Export du sous-ensemble affiche", "copi" in etat.lower(), "(%s)" % etat)
    presse = pg.evaluate("navigator.clipboard.readText()")
    att("Le presse-papiers porte l en-tete et les seules lignes affichees",
        presse.count("\n") == 5, "(%d lignes apres l en-tete)" % presse.count("\n"))

    # --- recherche et remise a zero -----------------------------------------
    pg.fill("#find", "identifiant")
    pg.wait_for_timeout(300)
    att("Recherche surligne",
        pg.eval_on_selector_all("mark.find-hit", "e => e.length") >= 2)
    att("Surlignage inline et classe disjointe",
        pg.eval_on_selector("mark.find-hit", "el => el.className") == "find-hit" and
        pg.eval_on_selector("mark.find-hit", "el => getComputedStyle(el).display") == "inline")
    pg.click("#reset")
    pg.wait_for_timeout(400)
    att("Remise a zero : recherche videe", pg.input_value("#find") == "")
    att("Remise a zero : surlignages retires",
        pg.eval_on_selector_all("mark.find-hit", "e => e.length") == 0)
    att("Remise a zero : lignes retablies", visibles() == 12, "(%d)" % visibles())
    att("Remise a zero : tri annule",
        pg.eval_on_selector_all("th[aria-sort]", "e => e.length") == 0)
    att("Remise a zero : URL nettoyee", "?" not in pg.url)

    # --- barre C1 : notes en marge ------------------------------------------
    n = pg.eval_on_selector_all(".note-marge", "e => e.length")
    att("Notes en marge presentes", n >= 2, "(%d)" % n)
    cote = pg.evaluate("""() => {
        const g = document.querySelector('.avec-notes');
        const p = g.querySelector('p'), n = g.querySelector('.note-marge');
        return n.getBoundingClientRect().left > p.getBoundingClientRect().right - 5;
    }""")
    att("La note est en marge, a hauteur du texte (bureau)", cote)

    # --- R-30 : bascule de theme --------------------------------------------
    att("Theme clair par defaut",
        pg.eval_on_selector("html", "el => el.getAttribute('data-theme')") == "light")
    pg.click("#theme-toggle")
    pg.wait_for_timeout(150)
    att("Bascule pose data-theme=dark",
        pg.eval_on_selector("html", "el => el.getAttribute('data-theme')") == "dark")
    att("Choix persiste", pg.evaluate("localStorage.getItem('digitai-theme')") == "dark")
    pg.reload()
    pg.wait_for_timeout(300)
    att("Theme rejoue au rechargement",
        pg.eval_on_selector("html", "el => el.getAttribute('data-theme')") == "dark")

    # --- socle : ancres, zones de gabarit, reseau ---------------------------
    morts = pg.evaluate("""() => Array.from(document.querySelectorAll('nav.toc a'))
        .filter(a => !document.querySelector(a.getAttribute('href'))).length""")
    att("Aucune ancre morte", morts == 0)
    zones = pg.eval_on_selector_all("[data-gabarit]", "e => e.length")
    att("Zones a remplacer reperables par attribut", zones >= 15, "(%d zones)" % zones)

    pg3 = ctx.new_page()
    ext = []
    pg3.on("request", lambda r: ext.append(r.url) if r.url.startswith("http") else None)
    pg3.goto(page_path)
    pg3.wait_for_timeout(500)
    att("Aucune requete reseau au chargement", not ext, "(%d)" % len(ext))

    b.close()

print("PASS : %d" % len(ok))
for x in ok:
    print("  ok  " + x)
if ko:
    print("FAIL : %d" % len(ko))
    for x in ko:
        print("  x   " + x)
sys.exit(1 if ko else 0)
