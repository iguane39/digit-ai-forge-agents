# lib_pdf.py — lecture commune du skill digit-ai-pdf (TF-2031, D-112 (a) du 30/10/2026).
#
# Écrit à neuf : le skill `pdf` d'Anthropic interdit la copie et l'œuvre dérivée, rien n'en vient.
# Bibliothèques permissives seules : pypdf (BSD), pypdfium2 (BSD et Apache), pdfplumber (MIT),
# reportlab (BSD), Pillow (HPND). pymupdf, en AGPL, n'entre pas dans une forge publique.
#
# Repère de ce skill : les boîtes s'écrivent [x0, haut, x1, bas], en points, origine en haut à
# gauche de la page, comme une image. Le repère du PDF (origine en bas) ne sort jamais d'ici.
import json
import sys
import unicodedata

for _flux in (sys.stdout, sys.stderr):
    try:
        _flux.reconfigure(encoding="utf-8")
    except Exception:
        pass


def exiger(*modules):
    """Importe les dépendances ou sort en SKIP motivé : une dépendance absente ne vaut pas un PASS."""
    manquants = []
    for nom in modules:
        try:
            __import__(nom)
        except Exception:
            manquants.append(nom)
    return manquants


def norm_texte(valeur):
    """Forme de comparaison : Unicode composé, blancs réduits. La casse et les accents comptent."""
    return " ".join(unicodedata.normalize("NFC", str(valeur)).split())


def compact(valeur):
    """Forme sans aucun blanc : une extraction coupe ou colle les mots selon la mise en page."""
    return "".join(unicodedata.normalize("NFC", str(valeur)).split())


def lire_json(chemin):
    with open(chemin, encoding="utf-8-sig") as f:
        return json.load(f)


def ecrire_json(chemin, obj):
    with open(chemin, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


# --- Champs d'un AcroForm -------------------------------------------------------------------

BIT_LECTURE_SEULE = 1 << 0
BIT_REQUIS = 1 << 1
BIT_MULTILIGNE = 1 << 12
BIT_MOT_DE_PASSE = 1 << 13
BIT_RADIO = 1 << 15
BIT_BOUTON = 1 << 16
BIT_PEIGNE = 1 << 24


def lignes_coupees(texte, largeur, taille):
    """Coupe un texte multiligne à la largeur du champ, en métrique Helvetica."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    sortie = []
    for bloc in str(texte).split("\n"):
        cour = ""
        for mot in bloc.split(" "):
            essai = (cour + " " + mot).strip()
            if stringWidth(essai, "Helvetica", taille) > largeur and cour:
                sortie.append(cour)
                cour = mot
            else:
                cour = essai
        sortie.append(cour)
    return sortie


def herite(obj, cle):
    """Une valeur de champ peut vivre sur le widget ou sur l'un de ses parents."""
    vus = 0
    while obj is not None and vus < 32:
        if cle in obj:
            return obj[cle]
        parent = obj.get("/Parent")
        obj = parent.get_object() if parent is not None else None
        vus += 1
    return None


def nom_complet(annot):
    """Nom qualifié du champ, segments des parents joints par un point (PDF 32000-1, 12.7.3.2)."""
    segments = []
    obj = annot
    vus = 0
    while obj is not None and vus < 32:
        t = obj.get("/T")
        if t is not None:
            segments.append(str(t))
        parent = obj.get("/Parent")
        obj = parent.get_object() if parent is not None else None
        vus += 1
    return ".".join(reversed(segments))


def etats_case(annot):
    """États « coché » d'un widget : les clés de /AP /N autres que /Off."""
    ap = annot.get("/AP")
    if ap is None:
        return []
    n = ap.get_object().get("/N")
    if n is None:
        return []
    n = n.get_object()
    if not hasattr(n, "keys"):
        return []
    return [str(k) for k in n.keys() if str(k) != "/Off"]


def type_champ(annot):
    ft = herite(annot, "/FT")
    ff = int(herite(annot, "/Ff") or 0)
    if ft == "/Tx":
        return "texte"
    if ft == "/Ch":
        return "liste"
    if ft == "/Sig":
        return "signature"
    if ft == "/Btn":
        if ff & BIT_BOUTON:
            return "bouton"
        return "radio" if ff & BIT_RADIO else "case"
    return "inconnu"


def boite_lecteur(rect, page_haut, page_gauche=0.0, page_bas=0.0):
    """Du repère du PDF vers [x0, haut, x1, bas] en haut à gauche."""
    x0, y0, x1, y1 = [float(v) for v in rect]
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    return [round(x0 - page_gauche, 2), round(page_haut - y1, 2),
            round(x1 - page_gauche, 2), round(page_haut - y0, 2)]


def repere_page(page):
    """(gauche, bas, droite, haut) de la zone visible, CropBox bornée par MediaBox."""
    b = page.cropbox if page.cropbox is not None else page.mediabox
    return float(b.left), float(b.bottom), float(b.right), float(b.top)


def rotation_page(page):
    try:
        return int(page.get("/Rotate", 0) or 0) % 360
    except (TypeError, ValueError):
        return 0


def valeur_lue(annot):
    v = herite(annot, "/V")
    if v is None:
        return None
    v = v.get_object() if hasattr(v, "get_object") else v
    if isinstance(v, bytes):
        return v.decode("latin-1", "replace")
    return str(v)


def widgets(reader):
    """Tous les widgets du fichier, par page : (n° de page en base 1, page, annotation)."""
    for i, page in enumerate(reader.pages, 1):
        annots = page.get("/Annots")
        if annots is None:
            continue
        for ref in annots.get_object():
            a = ref.get_object()
            if a.get("/Subtype") == "/Widget":
                yield i, page, a


def est_xfa(reader):
    af = reader.trailer["/Root"].get_object().get("/AcroForm")
    return af is not None and "/XFA" in af.get_object()


def inventaire_champs(reader):
    """Inventaire par nom complet : un champ à plusieurs widgets (radio) n'y figure qu'une fois."""
    champs = {}
    for n_page, page, annot in widgets(reader):
        nom = nom_complet(annot) or f"(sans nom, page {n_page})"
        g, b, d, h = repere_page(page)
        ff = int(herite(annot, "/Ff") or 0)
        boite = boite_lecteur(annot.get("/Rect", [0, 0, 0, 0]), h, g, b)
        typ = type_champ(annot)
        c = champs.setdefault(nom, {
            "nom": nom, "type": typ, "page": n_page, "boite": boite, "valeur": valeur_lue(annot),
            "requis": bool(ff & BIT_REQUIS), "lecture_seule": bool(ff & BIT_LECTURE_SEULE),
            "multiligne": bool(ff & BIT_MULTILIGNE), "widgets": 0, "etats": [],
        })
        c["widgets"] += 1
        if typ in ("case", "radio"):
            for e in etats_case(annot):
                if e not in c["etats"]:
                    c["etats"].append(e)
        if typ == "liste":
            opt = herite(annot, "/Opt")
            if opt is not None:
                c["options"] = [str(o[0] if isinstance(o, list) else o) for o in opt.get_object()]
        if typ == "texte":
            max_len = herite(annot, "/MaxLen")
            if max_len is not None:
                c["max_len"] = int(max_len)
            da = herite(annot, "/DA")
            if da is not None:
                c["apparence"] = str(da)
    return champs


# --- Nature d'une page (lot 2) ---------------------------------------------------------------

SEUIL_CARACTERES = 40      # le seuil de la mesure du parc (étude 20261030a, M-03)
SEUIL_IMAGE = 0.5          # part de la page couverte par des images à partir de laquelle c'est un scan


def part_image(page):
    """Part de la page couverte par des images. Les scanners découpent en bandes : on somme."""
    import pypdfium2.raw as raw
    l, h = page.get_size()
    aire = max(l * h, 1.0)
    total = 0.0
    for obj in page.get_objects(filter=[raw.FPDF_PAGEOBJ_IMAGE], max_depth=3):
        g, b, d, t = obj.get_bounds()
        total += max(0.0, d - g) * max(0.0, t - b)
    return min(1.0, total / aire)


def plausibilite(texte):
    """Part des caractères portés par des mots plausibles : près de 1 pour un texte courant, près de
    0 pour du bruit. Sans dictionnaire, indépendante du moteur : celui de Windows ne donne aucune
    confiance par mot. Un jeton isolé d'un ou deux signes ne prouve rien : une page lue de travers
    rend « E 0 O 0 0 0 », et le compter comme un mot la faisait passer pour lue (mesuré au self-test)."""
    jetons = texte.split()
    total = sum(len(j) for j in jetons)
    if not total:
        return 0.0
    bons = 0
    for j in jetons:
        lettres = sum(1 for c in j if c.isalpha())
        chiffres = sum(1 for c in j if c.isdigit())
        if (lettres >= 3 and lettres / len(j) >= 0.6) or (chiffres >= 2 and (lettres + chiffres) / len(j) >= 0.6):
            bons += len(j)
    return round(bons / total, 3)


def couche_douteuse(texte):
    """Couche de texte présente mais inexploitable : encodage perdu, ou suite de symboles."""
    if not texte.strip():
        return False
    if "�" in texte or "(cid:" in texte:
        return True
    prives = sum(1 for c in texte if 0xE000 <= ord(c) <= 0xF8FF)
    return prives / max(len(texte), 1) > 0.05 or plausibilite(texte) < 0.4


def page_blanche(page):
    """Vraie si le rendu à basse résolution n'a presque aucune encre."""
    img = page.render(scale=0.5, may_draw_forms=False, grayscale=True).to_pil().convert("L")
    h = img.point(lambda v: 255 if v < 200 else 0).histogram()[255]
    return h / max(img.width * img.height, 1) < 0.0005


def nature_page(page):
    """(nature, caractères, part d'image, couche douteuse) : natif, scan, hybride, vide ou vectoriel."""
    tp = page.get_textpage()
    texte = tp.get_text_bounded()
    n = len("".join(texte.split()))
    img = part_image(page)
    douteuse = couche_douteuse(texte)
    if n >= SEUIL_CARACTERES:
        nature = "hybride" if img >= SEUIL_IMAGE else "natif"
    elif img >= SEUIL_IMAGE:
        nature = "scan"
    else:
        nature = "vide" if page_blanche(page) else "vectoriel"
    return nature, n, round(img, 3), douteuse
