"""Oracle de la revue d'un CV (skill digit-ai-cv-review, TF-2366).

Version 1.0.0 du 10/11/2026, promu de l'oracle d'un analyseur ne dans la boucle interieure d'un produit (28/09/2026).
Contrat commun des oracles de quality-oracles : JSON sur stdout, verdict PASS ou FAIL, constats localises,
non_juge ; exit 0 PASS, 1 FAIL, 2 erreur d'usage.

Il juge une revue (revue.json) contre le CV source et ses mesures. Il ne reutilise pas le code de analyser_cv.py : il
tire lui-meme du CV les termes sensibles (nom, coordonnees, age, employeurs et villes des lignes d'experience, table
de termes a masquer donnee par l'appelant), pour ne pas partager les erreurs du producteur.

  R1  structure : champs presents, 1 a 7 lignes, rangs 1..n, priorites 1 a 3 non decroissantes,
      action parmi Ajouter, Modifier, Supprimer
  R2  extraits : chaque texte entre guillemets francais de « quoi » ou « pourquoi » existe dans le CV
  R3  nombres : chaque nombre de « quoi » et « pourquoi » (hors guillemets) vaut une valeur des mesures
      citees en preuve par la ligne ; ceux des points solides, une valeur des mesures
  R4  donnees personnelles : ni nom, ni courriel, ni telephone, ni age, ni employeur, ni ville
      d'experience, ni terme de la table des noms interdits, dans aucun texte de la revue
  R5  registre : « tu » ou « vous » declare, et tenu dans tous les textes
  R6  verdict : conforme a la regle de references/grille.md, compte sur les priorites des lignes
  R7  lexique de l'emetteur (--lexique <json>) : aucun terme proscrit ; sans lexique, R7 n'est pas jouee et le dit
  R8  chiffres inventes : dans « comment », aucun pourcentage ni montant hors d'un trou [entre crochets]
  R9  longueurs : titre, points solides, cellules et appel sous leurs plafonds (la diapositive tient)
Le rendu de la diapositive (texte complet, ordre, polices, accessibilite : anciennes R10 a R12) se juge par les
oracles de digit-ai-pptx sur la diapositive que ce skill lui confie ; il n'est pas rejoue ici.

Usage : python oracle_revue.py --revue <revue.json> --mesures <mesures.json> --cv <cv.pdf>
          [--table <termes-a-masquer.json>] [--lexique <lexique.json>]
"""
import argparse, json, re, shutil, subprocess, sys, tempfile, unicodedata
from pathlib import Path
import pymupdf

VERSION = "1.0.0"
sys.stdout.reconfigure(encoding="utf-8")
a = argparse.ArgumentParser()
for opt in ("--revue", "--mesures", "--cv"):
    a.add_argument(opt, required=True)
a.add_argument("--table", default=None, help="JSON de termes a masquer en plus de ceux que le CV porte")
a.add_argument("--lexique", default=None, help='JSON {"termes": [{"proscrit": "..."}]} : termes que le lexique de l\'emetteur proscrit')
args = a.parse_args()
for p in [args.revue, args.mesures, args.cv]:
    if not Path(p).is_file():
        print(json.dumps({"erreur": "fichier absent", "chemin": p}, ensure_ascii=False)); sys.exit(2)

findings = []


def constat(regle, msg, ou):
    findings.append({"sev": "bloquant", "regle": regle, "msg": msg, "where": ou})


def nfkc(t):
    t = unicodedata.normalize("NFKC", t)
    for x, y in (("’", "'"), ("‘", "'"), ("‑", "-"), ("–", "-"), ("—", "-"), (" ", " "), (" ", " ")):
        t = t.replace(x, y)
    return t


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", nfkc(t)) if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().lower()


def compact(t):
    return re.sub(r"[^a-z0-9]", "", norm(t))


revue = json.load(open(args.revue, encoding="utf-8"))
mesures = json.load(open(args.mesures, encoding="utf-8"))
lignes = revue.get("lignes") or []

# --- textes du CV, par trois lecteurs ------------------------------------------------------------
cv = pymupdf.open(args.cv)
lecteurs = {"pymupdf": "\n".join(p.get_text() for p in cv)}
try:
    from pypdf import PdfReader
    lecteurs["pypdf"] = "\n".join((p.extract_text() or "") for p in PdfReader(args.cv).pages)
except Exception:
    pass
if shutil.which("pdftotext"):
    with tempfile.TemporaryDirectory() as tmp:
        s, d = Path(tmp) / "cv.pdf", Path(tmp) / "cv.txt"
        s.write_bytes(Path(args.cv).read_bytes())
        if subprocess.run(["pdftotext", str(s), str(d)], capture_output=True).returncode == 0:
            lecteurs["pdftotext"] = d.read_text(encoding="utf-8", errors="replace")
cv_norm = " ".join(norm(t) for t in lecteurs.values())
cv_compact = "".join(compact(t) for t in lecteurs.values())

# --- R1 structure -----------------------------------------------------------------------------------
ACTIONS = {"Ajouter", "Modifier", "Supprimer"}
for champ in ("registre", "titre", "verdict", "points_solides", "lignes", "appel", "pied"):
    if not revue.get(champ):
        constat("R1", f"champ absent ou vide : {champ}", "revue")
if not 1 <= len(lignes) <= 7:
    constat("R1", f"{len(lignes)} lignes : une revue en porte de 1 a 7", "revue.lignes")
prec = 0
for k, l in enumerate(lignes, start=1):
    ou = f"ligne {k}"
    for champ in ("rang", "priorite", "action", "quoi", "pourquoi", "comment", "preuves"):
        if not l.get(champ):
            constat("R1", f"champ absent ou vide : {champ}", ou)
    if l.get("rang") != k:
        constat("R1", f"rang {l.get('rang')} au lieu de {k}", ou)
    if l.get("priorite") not in (1, 2, 3):
        constat("R1", f"priorite {l.get('priorite')} hors de 1 a 3", ou)
    elif l["priorite"] < prec:
        constat("R1", "lignes non classees par priorite", ou)
    else:
        prec = l["priorite"]
    if l.get("action") not in ACTIONS:
        constat("R1", f"action « {l.get('action')} » hors de Ajouter, Modifier, Supprimer", ou)

# --- R2 extraits ---------------------------------------------------------------------------------------
GUILL = re.compile(r"«\s*([^»]+?)\s*»")
for k, l in enumerate(lignes, start=1):
    for champ in ("quoi", "pourquoi"):
        for ex in GUILL.findall(l.get(champ, "")):
            if norm(ex) not in cv_norm and compact(ex) not in cv_compact:
                constat("R2", f"extrait introuvable dans le CV (longueur {len(ex)}, initiale {ex[:1]})", f"ligne {k}, {champ}")


# --- R3 nombres ---------------------------------------------------------------------------------------
def chemin(m, p):
    for morceau in p.split("."):
        if isinstance(m, dict) and morceau in m:
            m = m[morceau]
        else:
            return None
    return m


def valeurs(v):
    if isinstance(v, bool):
        return set()
    if isinstance(v, (int, float)):
        return {int(v)}
    if isinstance(v, dict):
        return set().union(*[valeurs(x) for x in v.values()]) if v else set()
    if isinstance(v, list):
        return set().union(*[valeurs(x) for x in v]) if v else set()
    return set()


def nombres_hors_guillemets(t):
    return [int(n) for n in re.findall(r"(?<![\w\[])\d+(?![\w\]])", GUILL.sub(" ", t))]


toutes = valeurs(mesures.get("mesures", {}))
for k, l in enumerate(lignes, start=1):
    permis = set()
    for p in l.get("preuves") or []:
        if "mesure" in p:
            v = chemin(mesures.get("mesures", {}), p["mesure"])
            if v is None:
                constat("R3", f"preuve « {p['mesure']} » absente des mesures", f"ligne {k}")
            permis |= valeurs(v)
    for champ in ("quoi", "pourquoi"):
        for n in nombres_hors_guillemets(l.get(champ, "")):
            if n not in permis:
                constat("R3", f"nombre {n} sans mesure citee en preuve qui le porte", f"ligne {k}, {champ}")
for n in nombres_hors_guillemets(revue.get("points_solides", "")):
    if n not in toutes:
        constat("R3", f"nombre {n} absent des mesures", "points_solides")

# --- R4 donnees personnelles : termes tires du CV et de la table, jamais imprimes ------------------
sensibles, compacts = set(), set()
brut = "\n".join(lecteurs.values())
for c in re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", brut):
    sensibles.add(c)
    sensibles |= {x for x in re.split(r"[@._+-]", c) if len(x) >= 4 and norm(x) not in {"gmail", "outlook", "hotmail", "yahoo", "orange"}}
    compacts.add(compact(c.split("@")[0]))
for t in re.findall(r"(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}", brut):
    compacts.add(re.sub(r"\D", "", t))
ages = set(re.findall(r"(?m)^\s*(\d{2}) ans\s*$", brut))
page = cv[0]
haut = []
for b in page.get_text("dict")["blocks"]:
    for li in b.get("lines", []):
        t = nfkc("".join(s["text"] for s in li["spans"])).strip()
        if t and li["bbox"][1] < page.rect.height * 0.45:
            haut.append((max(s["size"] for s in li["spans"]), t))
for taille, t in sorted(haut, key=lambda x: -x[0]):
    mots = t.split()
    if 2 <= len(mots) <= 4 and all(re.fullmatch(r"[^\W\d_]+(?:[-'][^\W\d_]+)*", w) for w in mots):
        sensibles |= {w for w in mots if len(w) >= 3}
        compacts.add(compact(t))
        break
GENERIQUES = {"services", "service", "international", "groupe", "group", "france", "consulting", "conseil", "data", "digital",
              "consultant", "consultante", "chef", "projet", "manager", "leader", "analyst", "business", "pilote", "produit",
              "coordinator", "quality", "governance", "gouvernance", "qualite", "responsable", "directeur", "directrice"}
# lignes « Employeur (Ville) - duree » lues chez PyMuPDF seulement : pypdf et pdftotext recollent parfois
# l'intitule du poste devant l'employeur sur une meme ligne, et l'intitule deviendrait un « employeur »
for l in lecteurs["pymupdf"].splitlines():
    m = re.match(r"^\s*(.+?)\s*\(([^)]+)\)\s*-\s*\d+\s*(ans?|mois)\s*$", nfkc(l))
    if m:
        for terme in (m.group(1), m.group(2)):
            sensibles.add(terme.strip())
            sensibles |= {w for w in re.split(r"[\s/,]+", terme) if len(w) >= 4 and norm(w) not in GENERIQUES}


def cles(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k.startswith("depuis") or k in ("schema", "pourquoi", "date_derniere_extension"):
                continue
            yield from (v.keys() if k == "pseudonymes" and isinstance(v, dict) else cles(v))
    elif isinstance(o, list):
        for x in o:
            yield from cles(x)
    elif isinstance(o, str):
        yield o


table_lue = bool(args.table) and Path(args.table).is_file()
if table_lue:
    sensibles |= {t for t in cles(json.load(open(args.table, encoding="utf-8"))) if len(t) >= 3}


def textes_revue():
    yield "titre", revue.get("titre", "")
    yield "points_solides", revue.get("points_solides", "")
    yield "appel", revue.get("appel", "")
    yield "pied", revue.get("pied", "")
    for k, l in enumerate(lignes, start=1):
        for champ in ("quoi", "pourquoi", "comment"):
            yield f"ligne {k}, {champ}", l.get(champ, "")


for ou, t in textes_revue():
    n = norm(t)
    for s in sensibles:
        if re.search(r"(?<![a-z0-9])" + re.escape(norm(s)) + r"(?![a-z0-9])", n):
            constat("R4", f"terme sensible du CV (longueur {len(s)}, initiale {s[:1]})", ou)
    c = compact(t)
    for s in compacts:
        if len(s) >= 6 and s in c:
            constat("R4", f"coordonnee ou nom recolle (longueur {len(s)})", ou)
    for age in ages:
        if re.search(r"(?<!\d)" + age + r"(?!\d)", t):
            constat("R4", "age de la personne", ou)

# --- R5 registre -----------------------------------------------------------------------------------
TU = r"\b(tu|ton|ta|tes|te|toi|t')"
VOUS = r"\b(vous|votre|vos)\b"
reg = revue.get("registre")
if reg not in ("tu", "vous"):
    constat("R5", f"registre « {reg} » : attendu « tu » ou « vous »", "revue.registre")
else:
    interdit, attendu = (VOUS, TU) if reg == "tu" else (TU + r"\b", VOUS)
    vu = False
    for ou, t in textes_revue():
        if re.search(interdit, norm(t)):
            constat("R5", f"registre « {reg} » rompu", ou)
        vu = vu or bool(re.search(attendu, norm(t)))
    if not vu:
        constat("R5", f"registre « {reg} » jamais employe", "revue")

# --- R6 verdict ------------------------------------------------------------------------------------
p1 = sum(1 for l in lignes if l.get("priorite") == 1)
p2 = sum(1 for l in lignes if l.get("priorite") == 2)
attendu = "Prêt à proposer" if p1 == 0 and p2 <= 2 else ("À refondre" if p1 >= 3 else "À retravailler")
if revue.get("verdict") != attendu:
    constat("R6", f"verdict « {revue.get('verdict')} » ; la grille donne « {attendu} » ({p1} priorite 1, {p2} priorite 2)", "revue.verdict")

# --- R7 lexique de l'emetteur ----------------------------------------------------------------------------
proscrits = []
lexique_lu = bool(args.lexique) and Path(args.lexique).is_file()
if lexique_lu:
    proscrits = [t["proscrit"] for t in json.load(open(args.lexique, encoding="utf-8")).get("termes", [])]
for ou, t in textes_revue():
    for p in proscrits:
        if re.search(r"(?<![a-z])" + re.escape(norm(p)) + (r"(?![a-z])" if not p.endswith("qu") else r"(?=')"), norm(t)):
            constat("R7", f"terme proscrit par le lexique : « {p} »", ou)

# --- R8 chiffres inventes -------------------------------------------------------------------------------
for k, l in enumerate(lignes, start=1):
    hors_trous = re.sub(r"\[[^\]]*\]", " ", l.get("comment", ""))
    if re.search(r"\d+(?:[.,]\d+)?\s*(%|€|k€|m€|euros?\b)", hors_trous, re.I):
        constat("R8", "pourcentage ou montant hors d'un trou entre crochets", f"ligne {k}, comment")

# --- R9 longueurs ---------------------------------------------------------------------------------------
# plafonds d'une revue qui tient sur UNE diapositive : trois lignes de cellule a 8 pt dans les largeurs de colonne
PLAFONDS = {"titre": 75, "points_solides": 230, "appel": 100, "quoi": 120, "pourquoi": 105, "comment": 130}
for champ in ("titre", "points_solides", "appel"):
    if len(revue.get(champ, "")) > PLAFONDS[champ]:
        constat("R9", f"{len(revue[champ])} caracteres pour {PLAFONDS[champ]} au plus", champ)
for k, l in enumerate(lignes, start=1):
    for champ in ("quoi", "pourquoi", "comment"):
        if len(l.get(champ, "")) > PLAFONDS[champ]:
            constat("R9", f"{len(l[champ])} caracteres pour {PLAFONDS[champ]} au plus", f"ligne {k}, {champ}")

rapport = {
    "oracle": "oracle-revue", "version": VERSION, "domaine": "revue de CV (skill digit-ai-cv-review)",
    "artefact": Path(args.revue).name, "verdict": "FAIL" if findings else "PASS",
    "regles": ["R1", "R2", "R3", "R4", "R5", "R6", "R8", "R9"] + (["R7"] if lexique_lu else []),
    "lecteurs_du_cv": sorted(lecteurs), "termes_sensibles_testes": len(sensibles) + len(compacts),
    "table_lue": table_lue, "lexique_lu": lexique_lu,
    "findings": findings,
    "non_juge": ["justesse du diagnostic : une coquille, un conseil ou une priorite peuvent etre discutables et rester conformes",
                 "orthographe de la revue elle-meme",
                 "rendu de la diapositive (texte complet, ordre des blocs, polices, accessibilite) : a juger par les oracles de "
                 "digit-ai-pptx sur la diapositive rendue, ce script ne lit que la revue"]
                + ([] if lexique_lu else ["R7 non jouee : aucun --lexique donne, le lexique de l'emetteur n'est pas connu d'ici"]),
}
print(json.dumps(rapport, ensure_ascii=False, indent=1))
sys.exit(1 if findings else 0)
