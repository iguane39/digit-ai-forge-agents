"""Variantes fautives d'une revue de CV, pour prouver que oracle_revue.py sait echouer (au moins une par regle).

Version 1.0.0 du 10/11/2026 (skill digit-ai-cv-review, TF-2366), promue des variantes d'un analyseur ne dans la
boucle interieure d'un produit le 28/09/2026. Les variantes s'ecrivent dans un dossier de travail HORS du depot
(--travail) : l'une d'elles porte le courriel du CV, lu a l'execution et jamais ecrit dans un fichier suivi. Chaque
variante part de la revue donnee et en abime UN point, choisi dans la revue elle-meme (aucune ligne numerotee en dur) :
une revue qui ne porte pas le point a abimer (aucun extrait entre guillemets, aucun nombre) rend la variante
« non jouable » et le dit, jamais un rouge prouve par defaut.

Usage : python fabriquer_rouges.py --revue <revue.json> --mesures <mesures.json> --cv <cv.pdf>
          --travail <dossier hors depot> [--lexique <lexique.json>] [--resume <rapport-rouges.json>]
Exit 0 si chaque variante jouable echoue sur sa regle attendue, 1 sinon (ou si aucune variante n'est jouable).
"""
import argparse, copy, json, re, subprocess, sys
from pathlib import Path
import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
a = argparse.ArgumentParser()
for opt in ("--revue", "--mesures", "--cv", "--travail"):
    a.add_argument(opt, required=True)
a.add_argument("--lexique", default=None, help="lexique de l'emetteur : sans lui, la variante R7 n'est pas jouable")
a.add_argument("--resume")
args = a.parse_args()
travail = Path(args.travail)
travail.mkdir(parents=True, exist_ok=True)
oracle = Path(__file__).with_name("oracle_revue.py")
base = json.load(open(args.revue, encoding="utf-8"))
brut = "\n".join(p.get_text() for p in pymupdf.open(args.cv))
courriel = re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", brut)
age = re.search(r"(?m)^\s*(\d{2}) ans\s*$", brut)
GUILL = re.compile(r"«\s*([^»]+?)\s*»")
NOMBRE = re.compile(r"(?<![\w\[])\d+(?![\w\]])")


def variante(nom, attendues, geste, jouable=True, motif=""):
    if not jouable:
        return {"variante": nom, "attendues": attendues, "declenchees": [], "exit": None, "verdict": "non jouable : " + motif}
    r = copy.deepcopy(base)
    geste(r)
    chemin = travail / f"rouge-{nom}.json"
    chemin.write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    cmd = [sys.executable, "-B", str(oracle), "--revue", str(chemin), "--mesures", args.mesures, "--cv", args.cv]
    if args.lexique:
        cmd += ["--lexique", args.lexique]
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    sortie = json.loads(p.stdout)
    vues = sorted({f["regle"] for f in sortie["findings"]})
    ok = p.returncode == 1 and set(attendues) <= set(vues)
    return {"variante": nom, "attendues": attendues, "declenchees": vues, "exit": p.returncode, "verdict": "rouge prouve" if ok else "ECHEC"}


def ligne_avec(r, champ, motif):
    """La premiere ligne dont le champ contient le motif (regex), ou None."""
    return next((l for l in r["lignes"] if re.search(motif, l.get(champ, ""))), None)


lignes = base.get("lignes", [])
avec_extrait = ligne_avec(base, "quoi", "«")
avec_nombre = next((l for l in lignes if NOMBRE.findall(GUILL.sub(" ", l.get("quoi", "")))), None)
ex = GUILL.search(avec_extrait["quoi"]).group(0) if avec_extrait else ""
nb = NOMBRE.findall(GUILL.sub(" ", avec_nombre["quoi"]))[0] if avec_nombre else ""
proscrit = ""
if args.lexique and Path(args.lexique).is_file():
    termes = json.load(open(args.lexique, encoding="utf-8")).get("termes", [])
    proscrit = termes[0]["proscrit"] if termes else ""

resultats = [
    variante("extrait-invente", ["R2"], lambda r: ligne_avec(r, "quoi", "«").update(quoi=ligne_avec(r, "quoi", "«")["quoi"].replace(ex, "« phrase que le CV ne contient pas »", 1)),
             jouable=bool(avec_extrait), motif="aucun extrait entre guillemets dans la revue"),
    variante("nombre-sans-mesure", ["R3"], lambda r: [l for l in r["lignes"] if l["quoi"] == avec_nombre["quoi"]][0].update(quoi=avec_nombre["quoi"].replace(nb, str(int(nb) + 37), 1)),
             jouable=bool(avec_nombre), motif="aucun nombre hors guillemets dans « quoi »"),
    variante("courriel-en-clair", ["R4"], lambda r: r["lignes"][-1].update(comment=r["lignes"][-1]["comment"] + " " + courriel.group(0)),
             jouable=bool(courriel), motif="aucun courriel dans le CV"),
    variante("age-en-clair", ["R4"], lambda r: r["lignes"][-1].update(quoi=r["lignes"][-1]["quoi"] + " (" + age.group(1) + " ans)"),
             jouable=bool(age), motif="aucun age en ligne seule dans le CV"),
    variante("vouvoiement", ["R5"], lambda r: r.update(appel="Renvoyez-nous votre version corrigée : nous la relirons avant de vous proposer.") if r.get("registre") == "tu"
             else r.update(appel="Renvoie-nous ta version corrigée : nous la relirons avant de te proposer.")),
    variante("verdict-flatteur", ["R6"], lambda r: r.update(verdict="Prêt à proposer" if r["verdict"] != "Prêt à proposer" else "À refondre")),
    variante("terme-proscrit", ["R7"], lambda r: r["lignes"][-1].update(pourquoi=r["lignes"][-1]["pourquoi"] + " " + proscrit),
             jouable=bool(proscrit), motif="aucun lexique donne (--lexique)"),
    variante("pourcentage-invente", ["R8"], lambda r: r["lignes"][0].update(comment=r["lignes"][0]["comment"] + " Gain mesuré : 82 % à 97 %.")),
    variante("cellule-trop-longue", ["R9"], lambda r: r["lignes"][0].update(pourquoi=r["lignes"][0]["pourquoi"] + " " + "Le client relit cette ligne avant tout autre élément du poste. " * 3)),
    variante("huit-lignes", ["R1"], lambda r: [r["lignes"].append(dict(r["lignes"][-1], rang=len(r["lignes"]) + 1)) for _ in range(8 - len(r["lignes"]))]),
    variante("action-hors-liste", ["R1"], lambda r: r["lignes"][0].update(action="Réécrire")),
    variante("priorites-melangees", ["R1"], lambda r: (r["lignes"][0].update(priorite=3)) if len(r["lignes"]) > 1 and r["lignes"][1]["priorite"] < 3 else r["lignes"][1].update(priorite=1),
             jouable=len(lignes) > 1, motif="une seule ligne"),
]
jouees = [x for x in resultats if not x["verdict"].startswith("non jouable")]
resume = {"outil": "fabriquer_rouges.py", "version": "1.0.0", "oracle": "oracle_revue.py", "variantes": resultats,
          "jouees": len(jouees), "non_jouables": len(resultats) - len(jouees),
          "verdict": "PASS" if jouees and all(x["verdict"] == "rouge prouve" for x in jouees) else "FAIL",
          "note": "variantes ecrites hors du depot (dossier de travail de la session) ; la variante courriel-en-clair lit le courriel du CV a l'execution"}
texte = json.dumps(resume, ensure_ascii=False, indent=1)
if args.resume:
    Path(args.resume).write_text(texte + "\n", encoding="utf-8")
print(texte)
sys.exit(0 if resume["verdict"] == "PASS" else 1)
