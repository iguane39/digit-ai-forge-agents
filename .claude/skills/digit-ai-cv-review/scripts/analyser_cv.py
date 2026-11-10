"""Analyseur de CV : mesures deterministes d'un CV recu en PDF (skill digit-ai-cv-review, TF-2366).

Version 1.0.0 du 10/11/2026, promue d'un analyseur apparu dans la boucle interieure d'un produit le 28/09/2026. La grille
qui dit quoi faire de chaque mesure : references/grille.md, dans le skill.

L'outil mesure : experiences datees ou non, statut, faits d'action (chiffres, repetitions),
revendication d'IA et sa preuve, outils rattaches ou non a une mission, redites et atouts du resume,
donnees personnelles superflues, coordonnees, rubriques en deux langues, et, a titre informatif,
la lisibilite du PDF par trois lecteurs de texte (PyMuPDF, pypdf, pdftotext).

Il n'imprime JAMAIS : le nom, les coordonnees, l'age, les employeurs, les villes des
experiences, ni un terme de la table de termes a masquer que l'appelant lui donne (--table). Un extrait qui en
contient un est masque (« [...] »). Le rapport ne porte aucune donnee personnelle.

Usage : python analyser_cv.py <cv.pdf> [--table <termes-a-masquer.json>] [--sortie <mesures.json>]
Sortie : JSON ; exit 0 mesures rendues, 2 erreur d'usage ou PDF sans texte exploitable.
"""
import argparse, hashlib, json, re, shutil, subprocess, sys, tempfile, unicodedata
from collections import Counter
from pathlib import Path
import pymupdf

VERSION = "1.0.0"
sys.stdout.reconfigure(encoding="utf-8")
a = argparse.ArgumentParser()
a.add_argument("cv")
a.add_argument("--table", default=None,
               help="JSON de termes a masquer en plus de ceux que le CV porte (noms de clients ou d'employeurs)")
a.add_argument("--sortie")
args = a.parse_args()
if not Path(args.cv).is_file():
    print(json.dumps({"erreur": "fichier absent", "chemin": args.cv}, ensure_ascii=False)); sys.exit(2)


# --- normalisation ------------------------------------------------------------------------------
def nfkc(t):
    t = unicodedata.normalize("NFKC", t)
    for x, y in (("’", "'"), ("‘", "'"), ("‑", "-"), ("–", "-"), ("—", "-"), (" ", " "), (" ", " ")):
        t = t.replace(x, y)
    return t


def sans_accent(t):
    return "".join(c for c in unicodedata.normalize("NFD", t) if not unicodedata.combining(c))


def norm(t):
    return re.sub(r"\s+", " ", sans_accent(nfkc(t))).strip().lower()


def compact(t):
    return re.sub(r"[^a-z0-9]", "", norm(t))


# --- lecture par la geometrie -------------------------------------------------------------------
doc = pymupdf.open(args.cv)
octets = Path(args.cv).read_bytes()
lignes = []
for ip, page in enumerate(doc):
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for li in b["lines"]:
            t = nfkc("".join(s["text"] for s in li["spans"])).strip()
            if t:
                gras = any("bold" in s["font"].lower() or s["flags"] & 16 for s in li["spans"])
                lignes.append({"p": ip, "x": li["bbox"][0], "x1": li["bbox"][2], "y": li["bbox"][1], "y1": li["bbox"][3],
                               "taille": round(max(s["size"] for s in li["spans"]), 1), "gras": gras, "t": t})
if sum(len(l["t"]) for l in lignes) < 200:
    print(json.dumps({"erreur": "PDF sans texte exploitable (image scannee ?)", "caracteres": sum(len(l["t"]) for l in lignes)},
                     ensure_ascii=False)); sys.exit(2)
largeur = doc[0].rect.width
hauteur = doc[0].rect.height


def colonnes(lignes_page):
    """Abscisse d'une frontiere de colonnes : aucune ligne (ou presque) ne la traverse, et chaque cote
    porte au moins 15 % des lignes. On garde le milieu de la plus longue bande de frontieres valides."""
    n = len(lignes_page)
    valides = []
    for cx in range(int(largeur * 0.2), int(largeur * 0.6)):
        traverse = sum(1 for l in lignes_page if l["x"] < cx < l["x1"])
        g = sum(1 for l in lignes_page if l["x1"] <= cx)
        d = sum(1 for l in lignes_page if l["x"] >= cx)
        if traverse <= max(1, 0.02 * n) and g >= 0.15 * n and d >= 0.15 * n:
            valides.append(cx)
    if not valides:
        return None
    bandes, debut = [], valides[0]
    for a_, b_ in zip(valides, valides[1:] + [None]):
        if b_ is None or b_ != a_ + 1:
            bandes.append((debut, a_))
            debut = b_
    d0, d1 = max(bandes, key=lambda b: b[1] - b[0])
    return (d0 + d1) / 2 if d1 - d0 >= 4 else None


def rangees(ls):
    """Lignes visuelles d'une colonne, de haut en bas : les morceaux d'une meme ligne (texte justifie que
    PyMuPDF coupe aux grands espaces) sont recolles quand l'ecart qui les separe reste sous 60 pt."""
    rangs = []
    for l in sorted(ls, key=lambda l: l["y"]):
        if rangs and abs(l["y"] - rangs[-1][0]["y"]) <= 2:
            rangs[-1].append(l)
        else:
            rangs.append([l])
    sortie = []
    for r in rangs:
        r.sort(key=lambda l: l["x"])
        courant = dict(r[0])
        for l in r[1:]:
            if 0 <= l["x"] - courant["x1"] <= 60:
                courant.update(t=courant["t"] + " " + l["t"], x1=l["x1"], y1=max(courant["y1"], l["y1"]),
                               taille=max(courant["taille"], l["taille"]), gras=courant["gras"] or l["gras"])
            else:
                sortie.append(courant)
                courant = dict(l)
        sortie.append(courant)
    return sortie


ordre = []
coupures = {}
for ip in range(len(doc)):
    lp = [l for l in lignes if l["p"] == ip]
    cx = colonnes(lp)
    coupures[ip] = cx
    if cx is None:
        ordre += rangees(lp)
    else:
        ordre += rangees([l for l in lp if l["x"] < cx])
        ordre += rangees([l for l in lp if l["x"] >= cx])
for i, l in enumerate(ordre):
    l["i"] = i
texte = "\n".join(l["t"] for l in ordre)

# --- termes sensibles : jamais imprimes --------------------------------------------------------
sensibles = set()


def cles(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k.startswith("depuis") or k in ("schema", "pourquoi", "date_derniere_extension"):
                continue
            if k == "pseudonymes" and isinstance(v, dict):
                yield from v.keys()          # les CLES sont les noms reels ; les valeurs, des pseudonymes
            else:
                yield from cles(v)
    elif isinstance(o, list):
        for x in o:
            yield from cles(x)
    elif isinstance(o, str):
        yield o


table_lue = bool(args.table) and Path(args.table).is_file()
if table_lue:
    sensibles |= {t for t in cles(json.load(open(args.table, encoding="utf-8"))) if len(t) >= 3}

COURRIEL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
TELEPHONE = re.compile(r"(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}")
courriels = COURRIEL.findall(texte)
telephones = TELEPHONE.findall(texte)
compacts_sensibles = set()   # formes sans espace ni ponctuation : un numero ou une adresse recolles
for c in courriels:
    sensibles.add(c)
    sensibles |= {p for p in re.split(r"[@._+-]", c) if len(p) >= 3}
    compacts_sensibles.add(compact(c.split("@")[0]))
for t in telephones:
    sensibles.add(t)
    compacts_sensibles.add(re.sub(r"\D", "", t))

# nom : la ligne de plus grand corps du haut de la premiere page, de deux a quatre mots alphabetiques
haut = [l for l in lignes if l["p"] == 0 and l["y"] < hauteur * 0.45]
candidats = sorted(haut, key=lambda l: -l["taille"])
nom = next((l for l in candidats if 2 <= len(l["t"].split()) <= 4
            and all(re.fullmatch(r"[^\W\d_]+(?:[-'][^\W\d_]+)*", w) for w in l["t"].split())), None)
if nom:
    sensibles |= {w for w in nom["t"].split() if len(w) >= 3}
    compacts_sensibles.add(compact(nom["t"]))
# le nom du fichier source porte souvent le prenom de la personne ou la marque du cabinet emetteur
GENERIQUES_FICHIER = {"cv", "curriculum", "vitae", "resume", "profil", "profile", "senior", "junior", "consulting",
                      "consultant", "consultante", "dossier", "pdf", "final", "version", "fr", "en"}
sensibles |= {w for w in re.split(r"[\s_.\-()]+", Path(args.cv).stem) if len(w) >= 3 and norm(w) not in GENERIQUES_FICHIER}

# --- rubriques ---------------------------------------------------------------------------------
RUBRIQUES = {
    "experiences": r"experiences?( professionnelles?)?|parcours( professionnel)?|work experience|professional experience",
    "competences": r"(principales )?competences( techniques| cles)?|(top )?skills|savoir-faire",
    "formation": r"formations?|diplomes?|education|etudes",
    "langues": r"langues|languages",
    "atouts": r"(mes )?atouts|qualites|soft skills|savoir-etre",
    "contact": r"(me )?contacter|contact|coordonnees",
    "mobilite": r"mobilite",
    "resume": r"profil|resume|a propos|about",
    "outils": r"outils( (&|et) technologies)?|technologies|environnement technique|stack",
}


def rubrique(l):
    n = norm(l["t"]).strip(" :")
    if len(n.split()) > 4:
        return None
    brut = l["t"].strip()
    # un titre de rubrique est en capitales, en gras ou ouvre par une capitale ; un mot du corps
    # de texte coupe en fin de ligne (« competences en ») ne l'est pas
    if not (brut.isupper() or l["gras"] or brut[:1].isupper()):
        return None
    for nomr, motif in RUBRIQUES.items():
        if re.fullmatch(motif, n):
            return nomr
    return None


titres_rubriques = [(l, rubrique(l)) for l in ordre if rubrique(l)]
libelles_rubriques = [l["t"] for l, _ in titres_rubriques]

# --- experiences --------------------------------------------------------------------------------
MOIS = r"(janv(ier)?|fevr(ier)?|mars|avr(il)?|mai|juin|juil(let)?|aout|sept(embre)?|oct(obre)?|nov(embre)?|dec(embre)?|january|february|march|april|may|june|july|august|september|october|november|december)"
PERIODE = re.compile(r"\b(19|20)\d{2}\b|\b\d{1,2}/(19|20)?\d{2}\b|\b" + MOIS + r"\.? (19|20)\d{2}\b")
DUREE = re.compile(r"\b\d+\s*(ans?|mois|years?|months?|yrs?)\b")
debut_exp = next((l["i"] for l, r in titres_rubriques if r == "experiences"), None)
# une rubrique ne clot les experiences que si son titre n'apparait qu'UNE fois : un CV de cabinet repete
# ses sous-titres de mission (« MISSIONS », « Environnement technique ») dans chaque experience
repetes_titres = {norm(l["t"]) for l, _ in titres_rubriques if sum(norm(x["t"]) == norm(l["t"]) for x, _ in titres_rubriques) > 1}
fins = sorted(l["i"] for l, r in titres_rubriques
              if r in ("competences", "formation", "langues", "atouts", "contact") and norm(l["t"]) not in repetes_titres)
if debut_exp is not None:
    fin_exp = next((i for i in fins if i > debut_exp), len(ordre))
    t0 = ordre[debut_exp]
    cote0 = None if coupures.get(t0["p"]) is None else t0["x"] >= coupures[t0["p"]]

    def meme_colonne(l):
        """Colonne de la rubrique sur sa page ; les pages suivantes se jugent chacune a leur coupure."""
        cx = coupures.get(l["p"])
        if cx is None or cote0 is None:
            return True
        return (l["x"] >= cx) == cote0
    zone = [l for l in ordre[debut_exp + 1:fin_exp] if meme_colonne(l)]
else:
    zone = [l for l in ordre if not rubrique(l)]


def est_entete(l):
    n = norm(l["t"])
    if len(n) > 90:
        return False
    return bool(DUREE.search(n) and not re.search(r"d'experience|experience", n)) or bool(re.search(
        r"(" + PERIODE.pattern + r").{0,12}(-|a|au|→|>).{0,12}((" + PERIODE.pattern + r")|aujourd'hui|present|actuel|en cours)", n)) \
        or bool(re.search(r"\b(depuis|since)\b.{0,6}(" + PERIODE.pattern + r")", n) and len(n.split()) <= 5)


# des lignes d'en-tete consecutives forment UN debut d'experience : un CV de cabinet imprime la duree
# (« 1 an et 7 mois ») sous la periode (« Depuis mars 2025 »)
def datee(i):
    return bool(PERIODE.search(norm(zone[i]["t"])))


groupes = []
for k in (k for k, l in enumerate(zone) if est_entete(l)):
    # une duree seule, a deux lignes au plus d'une periode, appartient a la meme experience
    # (une ligne de client ou de role peut s'intercaler entre les deux)
    if groupes and (k == groupes[-1][-1] + 1 or (k - groupes[-1][-1] <= 2 and not datee(k) and any(datee(i) for i in groupes[-1]))):
        groupes[-1].extend(range(groupes[-1][-1] + 1, k + 1))
    else:
        groupes.append([k])
experiences = []
for j, g in enumerate(groupes):
    k, dernier = g[0], g[-1]
    n = norm(" ".join(zone[i]["t"] for i in g))
    precedent = zone[k - 1]["t"] if k > 0 and (j == 0 or k - 1 > groupes[j - 1][-1]) else ""
    m = next((mm for mm in (re.match(r"^(.+?)\s*\(([^)]+)\)\s*-\s*\d+\s*(ans?|mois)\s*$", zone[i]["t"]) for i in g) if mm), None)
    if m:  # « Employeur (Ville) - duree » : l'intitule est la ligne d'avant
        titre, employeur, ville = precedent, m.group(1), m.group(2)
    else:
        titre, employeur, ville = precedent, "", ""
    fin = groupes[j + 1][0] - 1 if j + 1 < len(groupes) else len(zone)
    faits = []
    for r in zone[dernier + 1:fin]:
        t = r["t"].lstrip("•·-–▪◦● ").strip()
        if not t:
            continue
        if faits and t[:1].islower():
            faits[-1] += " " + t
        else:
            faits.append(t)
    duree = DUREE.search(n)
    mois = None
    if duree and not PERIODE.search(n):
        v = int(re.match(r"\d+", duree.group(0)).group(0))
        mois = v * 12 if re.search(r"an|year|yr", duree.group(1)) else v
    experiences.append({"titre": titre, "employeur": employeur, "ville": ville, "datee": bool(PERIODE.search(n)),
                        "duree_seule": bool(duree) and not PERIODE.search(n), "mois": mois, "faits": faits})
    for terme in (employeur, ville):
        if terme:
            sensibles.add(terme)
            sensibles |= {w for w in re.split(r"[\s/,]+", terme) if len(w) >= 4
                          and norm(w) not in {"services", "international", "groupe", "group", "france", "consulting", "conseil"}}


COURANTS = {"ia", "sql", "rh", "kpi", "it", "data", "bi", "erp", "crm", "api", "etl", "rgpd", "agile", "scrum", "cloud", "power", "excel"}


URL_OU_COURRIEL = re.compile(r"(https?://\S+|www\.\S+|\S+@\S+|\b[\w-]+\.(?:fr|com|io|net|org|eu|be|ch|co)\b\S*)", re.I)


def masque(t, noms_propres=True):
    """Retire les termes sensibles connus, toute adresse web ou electronique (le site d'un cabinet emetteur
    porte sa marque) ; avec noms_propres, aussi tout mot a capitale (hors premier mot et sigles courants du
    metier) : un nom de client ou d'employeur absent de toute table ne sort pas davantage."""
    t = URL_OU_COURRIEL.sub("[...]", t)
    for s in sorted(sensibles, key=len, reverse=True):
        t = re.sub(r"(?<![\w])" + re.escape(s) + r"(?![\w])", "[...]", t, flags=re.I)
    if noms_propres:
        mots = t.split(" ")
        for k in range(1, len(mots)):
            brut_m = mots[k].strip(".,;:()«»\"'")
            if len(brut_m) >= 3 and brut_m[:1].isupper() and norm(brut_m) not in COURANTS:
                mots[k] = mots[k].replace(brut_m, "[...]")
        t = " ".join(mots)
    return t


tous_faits = [(n + 1, f) for n, e in enumerate(experiences) for f in e["faits"]]
CHIFFRE = re.compile(r"\d")
avec_chiffre = [f for _, f in tous_faits if CHIFFRE.search(re.sub(PERIODE, "", norm(f)))]
repetes = Counter(re.sub(r"s\b", "", norm(f)) for _, f in tous_faits)
repetes = sorted(((t, n) for t, n in repetes.items() if n > 1), key=lambda x: -x[1])
premiere_forme = {}
for _, f in tous_faits:
    premiere_forme.setdefault(re.sub(r"s\b", "", norm(f)), f)

# --- statut ---------------------------------------------------------------------------------------
STATUT = r"independant|independante|freelance|free-lance|portage|salarie|salariee|auto-entrepreneur|micro-entreprise|en cdi|en cdd|pour le compte de|via le cabinet|interim"
statut_dit = bool(re.search(r"\b(" + STATUT + r")\b", norm(texte)))
postes_conseil = sum(1 for e in experiences if re.search(r"\bconsultant", norm(e["titre"])))

# --- IA : revendication et preuve -----------------------------------------------------------------
# « ai » n'y est pas : en francais, c'est le verbe avoir (« j'ai developpe »)
IA = r"\b(ia|intelligence artificielle|llm|gpt|chatgpt|chat gpt|claude|mistral|copilot|machine learning|genai)\b"
revendique_titre = bool(nom) and any(re.search(IA, norm(l["t"])) for l in lignes
                                     if l["p"] == 0 and l["taille"] >= (nom["taille"] if nom else 99) - 3 and l["y"] < hauteur * 0.45)
revendique_resume = bool(re.search(r"\b(j'utilise|utilisation de) l'ia\b|\bl'ia comme\b|\boriente(e)? ia\b", norm(texte)))
faits_ia = [f for _, f in tous_faits if re.search(IA, norm(f))]

# --- outils : pastilles ou lignes de la rubrique competences --------------------------------------
LANGUES_PARLEES = {"anglais", "espagnol", "allemand", "italien", "francais", "portugais", "chinois", "arabe",
                   "neerlandais", "russe", "japonais", "english", "spanish", "german", "french"}
ALIAS = {"pbi": "power bi", "gcp": "google cloud", "chatgpt": "chat gpt"}
DEVELOPPER = {"pbi": "Power BI"}


def lettres_espacees(t):
    """Libelle ecrit lettre a lettre (« S N O W F L A K E ») ; un numero de telephone n'en est pas un."""
    jetons = t.split()
    if re.search(r"\d", t):
        return False
    return len(jetons) >= 2 and sum(1 for j in jetons if len(j) <= 2) / len(jetons) > 0.5


debut_comp = next((l["i"] for l, r in titres_rubriques if r == "competences"), None)
elements = []
if debut_comp is not None:
    colonne = coupures.get(ordre[debut_comp]["p"])
    for l in ordre[debut_comp + 1:]:
        if colonne is not None and (l["x"] >= colonne) != (ordre[debut_comp]["x"] >= colonne):
            continue
        if rubrique(l) in ("formation", "contact", "mobilite", "experiences"):
            break
        elements.append(l)
spans_espaces = []
for page in doc:
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for li in b["lines"]:
            for s in li["spans"]:
                t = nfkc(s["text"]).strip()
                if t and lettres_espacees(t):
                    spans_espaces.append({"x": s["bbox"][0], "y": s["bbox"][1], "t": t})
sous_rubriques = [l for l in elements if not lettres_espacees(l["t"]) and len(l["t"].split()) <= 4]
outils, langues = [], []
for s in spans_espaces:
    if debut_comp is None or s["y"] < ordre[debut_comp]["y"]:
        continue
    nomc = re.sub(r"\s+", "", s["t"])
    au_dessus = [r for r in sous_rubriques if r["y"] < s["y"] and r["x"] <= s["x"] + 5]
    rub = max(au_dessus, key=lambda r: (r["y"], r["x"]))["t"] if au_dessus else ""
    base = re.sub(r"\(.*\)", "", nomc).strip()
    (langues if norm(base) in LANGUES_PARLEES or norm(rub) == "langues" else outils).append({"nom": nomc, "rubrique": rub})
if not spans_espaces and elements:   # repli : une ligne courte par outil
    for l in elements:
        if rubrique(l) or len(l["t"].split()) > 4:
            continue
        for x in re.split(r"[,;|•·]", l["t"]):
            x = x.strip()
            if x:
                (langues if norm(x) in LANGUES_PARLEES else outils).append({"nom": x, "rubrique": ""})
texte_missions = " ".join(f for _, f in tous_faits) + " " + " ".join(e["titre"] for e in experiences)


def cite(nomo, t):
    """Outil cite dans un texte de missions : mot entier, alias, ou nom compose recolle (« POWERBI »
    retrouve « Power BI ») ; ce n'est pas un test de lisibilite machine."""
    n = norm(nomo)
    formes = {n, n.replace(" ", ""), ALIAS.get(n.replace(" ", ""), "")} - {""}
    for f in formes:
        if re.search(r"(?<![a-z0-9])" + re.escape(f) + r"(?![a-z0-9])", norm(t)):
            return True
    mots_t = norm(t).split()
    cible = n.replace(" ", "")
    for i in range(len(mots_t)):
        for k in (2, 3):
            if "".join(re.sub(r"[^a-z0-9]", "", w) for w in mots_t[i:i + k]) == cible:
                return True
    return False


for o in outils:
    o["cite_en_mission"] = cite(o["nom"], texte_missions)
    o["a_developper"] = DEVELOPPER.get(norm(o["nom"]).replace(" ", ""))

# --- resume : redites et atouts -------------------------------------------------------------------
def redites(t, n_min=6):
    mots = norm(t).replace(",", " ").replace(".", " ").split()
    trouvees = []
    for n in range(12, n_min - 1, -1):
        vus = Counter(tuple(mots[i:i + n]) for i in range(len(mots) - n + 1))
        for g, c in vus.items():
            if c > 1 and not any(" ".join(g) in x for x, _ in trouvees):
                trouvees.append((" ".join(g), c))
    return trouvees


atouts = []
i_atouts = next((l["i"] for l, r in titres_rubriques if r == "atouts"), None)
if i_atouts is not None:
    bloc = []
    for l in ordre[i_atouts + 1:]:
        if rubrique(l) or abs(l["x"] - ordre[i_atouts + 1]["x"]) > 40:
            break
        bloc.append(l["t"])
    atouts = [x.strip() for x in re.split(r"[,.;]| et ", " ".join(bloc)) if len(x.strip()) > 2]
mots_resume, redites_resume = 0, []
p_resume = next((l for l in ordre if re.search(r"ans d'experience|years of experience|\bje\b|\bj'", norm(l["t"]))), None)
if p_resume:
    bloc = [p_resume]
    for l in ordre[p_resume["i"] + 1:]:
        if rubrique(l) or l["y"] - bloc[-1]["y1"] > 1.6 * (bloc[-1]["y1"] - bloc[-1]["y"]) or abs(l["x"] - p_resume["x"]) > 40:
            break
        bloc.append(l)
    mots_resume = len(" ".join(b["t"] for b in bloc).split())
    redites_resume = redites(" ".join(b["t"] for b in bloc))

# --- donnees personnelles ---------------------------------------------------------------------------
age = any(re.fullmatch(r"\d{2} ans", norm(l["t"])) or re.search(r"\bage\s*:?\s*\d{2}\b", norm(l["t"])) for l in lignes)
permis = bool(re.search(r"\bpermis\b", norm(texte)))
naissance = bool(re.search(r"\bnee? le\b|date de naissance|\bnee? en (19|20)\d{2}", norm(texte)))
famille = bool(re.search(r"\b(marie|mariee|celibataire|pacse|pacsee|divorce|divorcee|enfants?)\b", norm(texte)))
nationalite = bool(re.search(r"\bnationalite\b", norm(texte)))
photos = []
for ip, page in enumerate(doc):
    for im in page.get_image_info():
        x0, y0, x1, y1 = im["bbox"]
        w, h = x1 - x0, y1 - y0
        if w > 40 and h > 40 and 0.6 < w / h < 1.6 and y0 < page.rect.height * 0.35:
            photos.append({"page": ip + 1, "largeur_pt": round(w), "hauteur_pt": round(h)})

# --- courriel et nom : comparaison sans impression -------------------------------------------------
def doublees(local, nom_c):
    """Lettres en plus du nom dans la partie locale, et combien doublent la lettre voisine."""
    if not nom_c or not local:
        return None
    i = 0
    for ch in local:
        if i < len(nom_c) and ch == nom_c[i]:
            i += 1
    if i < len(nom_c):
        return None
    en_plus, dbl = len(local) - len(nom_c), 0
    k = 0
    for idx, ch in enumerate(local):
        if k < len(nom_c) and ch == nom_c[k]:
            k += 1
        elif idx > 0 and ch == local[idx - 1]:
            dbl += 1
    return {"lettres_en_plus": en_plus, "lettres_doublees": dbl}


courriel_nom = None
if courriels and nom:
    local = compact(courriels[0].split("@")[0])
    nom_c = compact(nom["t"])
    courriel_nom = doublees(local, nom_c)

# --- rubriques en deux langues ---------------------------------------------------------------------
PAIRES = [("langues", "languages"), ("competences", "skills"), ("experiences professionnelles", "experience"),
          ("formation", "education")]
doublons = [[x, y] for x, y in PAIRES if any(norm(t) == x for t in libelles_rubriques) and any(norm(t) == y for t in libelles_rubriques)]

# --- lisibilite machine (informative : depend du lecteur) -----------------------------------------
lecteurs = {"pymupdf": "\n".join(p.get_text() for p in doc)}
try:
    from pypdf import PdfReader
    lecteurs["pypdf"] = "\n".join((p.extract_text() or "") for p in PdfReader(args.cv).pages)
except Exception:
    pass
if shutil.which("pdftotext"):
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "cv.pdf", Path(tmp) / "cv.txt"
        src.write_bytes(octets)
        if subprocess.run(["pdftotext", str(src), str(dst)], capture_output=True).returncode == 0:
            lecteurs["pdftotext"] = dst.read_text(encoding="utf-8", errors="replace")
# un lecteur peut rendre un libelle espace en lettres isolees (« d ata b r i c k s ») que ni une
# recherche ni un logiciel de tri ne recollent ; compte des suites d'au moins 4 jetons courts
ESPACEES = re.compile(r"(?:(?<=\s)|^)(?:[^\W\d_]{1,3} ){3,}[^\W\d_]{1,3}(?=\s|$)", re.M)
espacees_par_lecteur = {nl: len(ESPACEES.findall(nfkc(t))) for nl, t in lecteurs.items()}
ordre_lecteurs = {}
for nl, t in lecteurs.items():
    ls = [norm(x) for x in t.splitlines() if x.strip()]
    bons = 0
    for e in experiences:
        if not e["titre"] or not e["faits"]:
            continue
        it = next((i for i, x in enumerate(ls) if norm(e["titre"]) in x), None)
        ifa = next((i for i, x in enumerate(ls) if norm(e["faits"][0])[:25] in x), None)
        if it is not None and ifa is not None and 0 < ifa - it <= 6:
            bons += 1
    ordre_lecteurs[nl] = bons

# --- rapport --------------------------------------------------------------------------------------
mesures = {
    "document": {"pages": len(doc), "lignes": len(ordre), "mots": len(texte.split()), "images": sum(len(p.get_images()) for p in doc),
                 "colonnes_page_1": 1 if coupures.get(0) is None else 2},
    "experiences": {"nombre": len(experiences), "datees": sum(e["datee"] for e in experiences),
                    "duree_seule": sum(e["duree_seule"] for e in experiences),
                    "sans_repere": sum(1 for e in experiences if not e["datee"] and not e["duree_seule"]),
                    "postes_conseil": postes_conseil,
                    "cumul_mois_des_durees": sum(e["mois"] or 0 for e in experiences) or None,
                    "titres_reconnus": sum(1 for e in experiences if e["titre"]),   # jamais imprimes : un intitule de cabinet porte souvent le client
                    "faits_par_experience": [len(e["faits"]) for e in experiences]},
    "statut": {"dit": statut_dit},
    "faits": {"nombre": len(tous_faits), "avec_chiffre": len(avec_chiffre),
              "repetes": [{"texte": masque(premiere_forme[t]), "fois": n} for t, n in repetes],
              "repetition_max": max((n for _, n in repetes), default=0)},
    "ia": {"revendiquee_au_titre": revendique_titre, "revendiquee_au_resume": revendique_resume,
           "faits_citant_ia": len(faits_ia), "extraits": [masque(f) for f in faits_ia]},
    "outils": {"rubrique_trouvee": debut_comp is not None, "nombre": len(outils), "langues_parlees": len(langues),
               "cites_en_mission": sum(o["cite_en_mission"] for o in outils),
               "non_cites": sum(not o["cite_en_mission"] for o in outils),
               "liste": [{"nom": masque(o["nom"], noms_propres=False), "rubrique": masque(o["rubrique"], noms_propres=False), "cite_en_mission": o["cite_en_mission"],
                          "a_developper": o["a_developper"]} for o in outils]},
    "resume": {"mots": mots_resume, "redites": [{"texte": masque(t), "fois": n} for t, n in redites_resume],
               "atouts": len(atouts)},
    "donnees_personnelles": {"age": age, "permis": permis, "date_de_naissance": naissance, "situation_familiale": famille,
                             "nationalite": nationalite, "photo_probable": len(photos) > 0, "photos": photos},
    "contacts": {"courriel": len(courriels) > 0, "telephone": len(telephones) > 0,
                 "profil_en_ligne": bool(re.search(r"linkedin\.com|github\.com|malt\.fr|https?://", texte, re.I)),
                 "courriel_comparable_au_nom": courriel_nom is not None,
                 "courriel_lettres_en_plus": courriel_nom["lettres_en_plus"] if courriel_nom else None,
                 "courriel_lettres_doublees": courriel_nom["lettres_doublees"] if courriel_nom else None},
    "rubriques": {"trouvees": [masque(t, noms_propres=False) for t in libelles_rubriques], "doublons_bilingues": doublons},
    "lisibilite_machine": {"informatif": "depend du lecteur : ne va dans une revue que si TOUS les lecteurs echouent",
                           "lecteurs": sorted(lecteurs), "pastilles_lettres_espacees": len(spans_espaces),
                           "suites_de_lettres_isolees_par_lecteur": espacees_par_lecteur,
                           "intitules_suivis_de_leurs_faits": ordre_lecteurs,
                           "tous_lecteurs_echouent_lettres": bool(spans_espaces) and min(espacees_par_lecteur.values(), default=0) > 0,
                           "tous_lecteurs_echouent_ordre": bool(experiences) and max(ordre_lecteurs.values(), default=0) == 0},
}
non_mesure = []
dates_orphelines = sum(1 for l in zone if PERIODE.search(norm(l["t"])) and not est_entete(l) and len(norm(l["t"]).split()) <= 8)
if dates_orphelines:
    non_mesure.append(f"{dates_orphelines} ligne(s) courte(s) datee(s) non reconnue(s) comme debut d'experience : chronologie a relire a l'oeil")
if debut_exp is None:
    non_mesure.append("rubrique Experiences introuvable : experiences cherchees dans tout le document")
if not experiences:
    non_mesure.append("aucune experience reconnue (ni periode ni duree) : chronologie a lire a l'oeil")
if debut_comp is None:
    non_mesure.append("rubrique Competences introuvable : outils non mesures")
if nom is None:
    non_mesure.append("nom non reconnu : comparaison courriel/nom impossible, masquage du nom non garanti")
if not table_lue:
    non_mesure.append("aucune table de termes a masquer donnee (--table) : masquage limite aux termes tires du CV")
rapport = {
    "outil": "analyser_cv.py", "version": VERSION, "grille": "references/grille.md 1.0.0",
    "cv": {"sha256": hashlib.sha256(octets).hexdigest(), "octets": len(octets)},
    "mesures": mesures, "non_mesure": non_mesure,
    "non_juge": ["orthographe et grammaire : aucun dictionnaire ; les coquilles relevees par la lecture experte sont prouvees par oracle_revue.py (extrait present dans le CV)",
                 "veracite du parcours et des outils declares",
                 "pertinence pour une mission precise",
                 "qualite graphique de la mise en page",
                 "ordre antichronologique : non verifiable sans periodes"],
    "masquage": {"termes_sensibles": len(sensibles), "table_lue": table_lue},
}
sortie = json.dumps(rapport, ensure_ascii=False, indent=1)
# garde-fou : aucun terme sensible ne sort, meme par un champ oublie, ni sous sa forme recollee
# (un numero sans espaces, une adresse sans ponctuation, le nom en un seul mot)
fuite = next((s for s in sensibles if len(s) >= 4 and re.search(r"(?<![\w])" + re.escape(s) + r"(?![\w])", sortie, flags=re.I)), None)
if fuite is None:
    sortie_compacte = compact(sortie)
    fuite = next((c for c in compacts_sensibles if len(c) >= 6 and c in sortie_compacte), None)
if fuite is not None:
    print(json.dumps({"erreur": "terme sensible dans le rapport : sortie refusee", "longueur": len(fuite)}, ensure_ascii=False))
    sys.exit(2)
if args.sortie:
    Path(args.sortie).write_text(sortie + "\n", encoding="utf-8")
print(sortie)
