"""Self-test du skill digit-ai-cv-review (TF-2366) : la chaine mesurer, juger, prouver le rouge, sur un CV fictif.

Double sens, aucun CV reel (les CV recus sont nominatifs et ne vont jamais dans un depot) :
  VERT   le CV fictif a 2 colonnes donne les 22 mesures attendues (fixtures/attendu.json), aucun terme fictif
         (nom, employeur, ville, coordonnee) ne sort du rapport, la revue modele passe l'oracle (R1 a R9 avec
         lexique, R7 dite non jouee sans lexique) ;
  ROUGE  la comparaison des mesures sait echouer (une valeur attendue faussee est vue) ; un PDF sans texte
         (image seule) est refuse avec exit 2 ; 12 variantes fautives de la revue echouent chacune sur sa regle.
Usage : python self_test.py        Sortie : JSON ; exit 0 PASS, 1 FAIL, 2 SKIP (pymupdf absent).
"""
import json, subprocess, sys, tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ici = Path(__file__).resolve().parent
fx = ici.parent / "fixtures"
cas = []


def verif(nom, ok, detail=""):
    cas.append({"nom": nom, "ok": bool(ok), "detail": str(detail)[:300]})


try:
    import pymupdf
except ImportError as e:
    print(json.dumps({"self_test": "digit-ai-cv-review", "verdict": "SKIP", "motif": f"pymupdf absent ({e}) : un PDF ne se lit pas",
                      "cas": []}, ensure_ascii=False, indent=1))
    sys.exit(2)


def lancer(*args):
    return subprocess.run([sys.executable, "-B", *map(str, args)], capture_output=True, text=True, encoding="utf-8")


def chemin(m, p):
    for morceau in p.split("."):
        m = m[morceau]
    return m


attendu = json.load(open(fx / "attendu.json", encoding="utf-8"))
with tempfile.TemporaryDirectory(prefix="cv-review-") as tmp:
    tmp = Path(tmp)
    cv, mesures_f = tmp / "cv-synthetique.pdf", tmp / "mesures.json"
    lancer(fx / "fabriquer_cv_synthetique.py", cv)
    p = lancer(ici / "analyser_cv.py", cv, "--sortie", mesures_f)
    verif("VERT — l'analyseur rend ses mesures (exit 0)", p.returncode == 0, p.stdout[-200:])
    brut = mesures_f.read_text(encoding="utf-8") if mesures_f.exists() else "{}"
    m = json.loads(brut).get("mesures", {})
    ecarts = []
    for chem, v in attendu["valeurs"].items():
        try:
            if chemin(m, chem) != v:
                ecarts.append((chem, v, chemin(m, chem)))
        except KeyError:
            ecarts.append((chem, v, "absente"))
    verif(f"VERT — les {len(attendu['valeurs'])} mesures attendues sont rendues", not ecarts, ecarts)
    verif("VERT — la redite du resume est vue (1 attendue)", len(m.get("resume", {}).get("redites", [])) == attendu["redites_attendues"])
    fuites = [t for t in attendu["jamais_dans_le_rapport"] if t.lower() in brut.lower()]
    verif("VERT — aucun nom, employeur, ville ni coordonnee fictifs ne sort du rapport", not fuites, fuites)
    faussee = dict(attendu["valeurs"], **{"experiences.nombre": attendu["valeurs"]["experiences.nombre"] + 1})
    ecarts_faux = [c for c, v in faussee.items() if chemin(m, c) != v]
    verif("ROUGE — la comparaison sait echouer (une valeur faussee est vue)", len(ecarts_faux) == 1, ecarts_faux)

    # un PDF sans texte (image seule) est refuse, pas mesure
    scan = tmp / "scan.pdf"
    d = pymupdf.open()
    pg = d.new_page(width=595, height=842)
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 80, 80), False)
    pix.clear_with(180)
    pg.insert_image(pymupdf.Rect(50, 50, 300, 300), pixmap=pix)
    d.save(scan)
    p = lancer(ici / "analyser_cv.py", scan)
    verif("ROUGE — un PDF sans texte exploitable est refuse (exit 2)", p.returncode == 2 and "sans texte exploitable" in p.stdout, p.stdout[-200:])

    revue, lexique = fx / "revue_synthetique.json", fx / "lexique.json"
    p = lancer(ici / "oracle_revue.py", "--revue", revue, "--mesures", mesures_f, "--cv", cv, "--lexique", lexique)
    j = json.loads(p.stdout) if p.stdout.strip().startswith("{") else {}
    verif("VERT — la revue modele passe l'oracle avec lexique (R1 a R9)", p.returncode == 0 and j.get("verdict") == "PASS"
          and sorted(j.get("regles", [])) == ["R%d" % k for k in range(1, 10)], p.stdout[-300:])
    p = lancer(ici / "oracle_revue.py", "--revue", revue, "--mesures", mesures_f, "--cv", cv)
    j = json.loads(p.stdout) if p.stdout.strip().startswith("{") else {}
    verif("VERT — sans lexique, R7 est dite non jouee (jamais un PASS muet)", p.returncode == 0
          and any(n.startswith("R7 non jouee") for n in j.get("non_juge", [])) and "R7" not in j.get("regles", []), p.stdout[-300:])
    p = lancer(ici / "fabriquer_rouges.py", "--revue", revue, "--mesures", mesures_f, "--cv", cv, "--travail", tmp / "rouges",
               "--lexique", lexique)
    r = json.loads(p.stdout) if p.stdout.strip().startswith("{") else {}
    prouvees = [v["variante"] for v in r.get("variantes", []) if v["verdict"] == "rouge prouve"]
    verif("ROUGE — 12 variantes fautives de la revue echouent chacune sur sa regle", p.returncode == 0 and len(prouvees) == 12
          and r.get("non_jouables") == 0, [v for v in r.get("variantes", []) if v["verdict"] != "rouge prouve"])
    regles_vues = sorted({x for v in r.get("variantes", []) for x in v["declenchees"]})
    verif("ROUGE — chaque regle R1 a R9 est declenchee par au moins une variante", regles_vues[:1] == ["R1"]
          and set(regles_vues) >= {"R%d" % k for k in range(1, 10)}, regles_vues)

rates = [c for c in cas if not c["ok"]]
print(json.dumps({"self_test": "digit-ai-cv-review", "verdict": "FAIL" if rates else "PASS", "cas": len(cas),
                  "echecs": rates,
                  "non_juge": ["lisibilite machine : depend des lecteurs de PDF installes",
                               "mises en page autres que 2 colonnes : voir references/chaine.md, limites mesurees",
                               "rendu de la diapositive : oracles de digit-ai-pptx"]}, ensure_ascii=False, indent=1))
sys.exit(1 if rates else 0)
