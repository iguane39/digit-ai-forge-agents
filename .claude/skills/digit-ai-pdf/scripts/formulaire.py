#!/usr/bin/env python
# formulaire.py — relève et remplit un formulaire PDF, à champs ou plat (TF-2031, lot 1).
#
# Le fait (étude 20261030a, M-05) : 2 demandes de formulaire en 49 jours, 1 à 35 champs, 1 sur des
# PDF plats sans aucun champ, chacune servie par un script de session sans contrôle sur le fichier
# rendu, dont un contrat à signer. Cette voie remplit, puis passe la main à l'oracle.
#
#   python formulaire.py relever <vierge.pdf> [--modele valeurs.json] [--png <dossier>]
#   python formulaire.py remplir <vierge.pdf> --valeurs valeurs.json --out rempli.pdf
#                                [--police arial.ttf] [--sans-controle]
#
# valeurs.json (le même fichier sert de --attendu à l'oracle) :
#   { "champs": { "nom": "Hélène Dupré", "accepte": true, "formule": "/B" },
#     "plat":   [ { "page": 1, "boite": [120, 200, 400, 218], "texte": "Hélène Dupré" },
#                 { "page": 1, "boite": [50, 300, 62, 312], "coche": true } ] }
#
# `relever` montre AVANT d'écrire : champs, mots, lignes de saisie et petites cases, plus une image
# quadrillée tous les 50 points pour poser les boîtes d'un formulaire plat.
# Exit : 0 fait et contrôlé · 1 contrôle FAIL · 2 usage, dépendance ou fichier refusé.
import argparse
import io
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_pdf import (BIT_LECTURE_SEULE, BIT_MULTILIGNE, BIT_PEIGNE, ecrire_json, est_xfa, etats_case,
                     exiger, herite, inventaire_champs, lignes_coupees, lire_json, nom_complet,
                     repere_page, rotation_page, type_champ, widgets)

TAILLE_DEFAUT = 11.0
TAILLE_MIN = 6.0
ICI = os.path.dirname(os.path.abspath(__file__))


def refuser(msg):
    print(f"REFUS — {msg}", file=sys.stderr)
    sys.exit(2)


def ouvrir(chemin):
    from pypdf import PdfReader
    if not os.path.isfile(chemin):
        refuser(f"fichier introuvable : {chemin}")
    r = PdfReader(chemin)
    if r.is_encrypted and not r.decrypt(""):
        refuser("PDF protégé par un mot de passe : à déverrouiller par son détenteur, jamais contourné")
    return r


# --- relever ---------------------------------------------------------------------------------

def indices_plats(chemin):
    """Mots, lignes de saisie et petites cases de chaque page, en repère lecteur."""
    import pdfplumber
    pages = []
    with pdfplumber.open(chemin) as pdf:
        for i, p in enumerate(pdf.pages, 1):
            mots = [{"texte": m["text"], "boite": [round(m["x0"], 1), round(m["top"], 1),
                                                   round(m["x1"], 1), round(m["bottom"], 1)]}
                    for m in p.extract_words(use_text_flow=False, keep_blank_chars=False)]
            lignes = []
            for l in p.lines:
                if abs(l["top"] - l["bottom"]) < 1.5 and l["x1"] - l["x0"] > 40:
                    lignes.append([round(l["x0"], 1), round(l["top"], 1), round(l["x1"], 1)])
            for m in mots:
                t = m["texte"]
                if len(t) >= 5 and (set(t) <= {"_"} or set(t) <= {"."} or set(t) <= {"…"}):
                    lignes.append([m["boite"][0], m["boite"][3], m["boite"][2]])
            cases = []
            for r in p.rects:
                l_, h_ = r["x1"] - r["x0"], r["bottom"] - r["top"]
                if 5 <= l_ <= 20 and 5 <= h_ <= 20 and abs(l_ - h_) <= 2:
                    cases.append([round(r["x0"], 1), round(r["top"], 1), round(r["x1"], 1), round(r["bottom"], 1)])
            for m in mots:
                if m["texte"] in ("☐", "□", "❏", "❑", "▢"):
                    cases.append(m["boite"])
            pages.append({"page": i, "largeur": round(float(p.width), 1), "hauteur": round(float(p.height), 1),
                          "rotation": p.rotation or 0, "mots": mots, "lignes_saisie": lignes, "cases": cases})
    return pages


def png_quadrille(chemin, dossier, pas=50, echelle=2):
    """Une image par page, quadrillée en points : poser une boîte se lit sur l'image."""
    import pypdfium2 as pdfium
    from PIL import ImageDraw
    os.makedirs(dossier, exist_ok=True)
    sorties = []
    doc = pdfium.PdfDocument(chemin)
    try:
        for i in range(len(doc)):
            page = doc[i]
            img = page.render(scale=echelle, may_draw_forms=False).to_pil().convert("RGB")
            d = ImageDraw.Draw(img)
            for x in range(0, int(img.width / echelle) + 1, pas):
                d.line([(x * echelle, 0), (x * echelle, img.height)], fill=(255, 120, 120), width=1)
                d.text((x * echelle + 2, 2), str(x), fill=(200, 0, 0))
            for y in range(0, int(img.height / echelle) + 1, pas):
                d.line([(0, y * echelle), (img.width, y * echelle)], fill=(120, 120, 255), width=1)
                d.text((2, y * echelle + 2), str(y), fill=(0, 0, 200))
            p = os.path.join(dossier, f"page-{i + 1:03d}.png")
            img.save(p)
            sorties.append(p)
    finally:
        doc.close()
    return sorties


def relever(a):
    manque = exiger("pypdf", "pdfplumber", "pypdfium2", "PIL")
    if manque:
        refuser(f"dépendances absentes : {', '.join(manque)} (pip install pypdf pdfplumber pypdfium2 pillow)")
    r = ouvrir(a.pdf)
    champs = inventaire_champs(r)
    sortie = {"fichier": os.path.basename(a.pdf), "pages": len(r.pages), "xfa": est_xfa(r),
              "champs": list(champs.values())}
    if not any(c["type"] in ("texte", "case", "radio", "liste") for c in champs.values()):
        sortie["plat"] = indices_plats(a.pdf)
    if a.png:
        sortie["images"] = png_quadrille(a.pdf, a.png)
    if a.modele:
        modele = {"champs": {}, "plat": []}
        for c in champs.values():
            if c["type"] in ("case",):
                modele["champs"][c["nom"]] = False
            elif c["type"] in ("texte", "liste", "radio"):
                modele["champs"][c["nom"]] = ""
        ecrire_json(a.modele, modele)
    print(__import__("json").dumps(sortie, ensure_ascii=False, indent=1))
    return 0


# --- remplir : champs ------------------------------------------------------------------------

def valeur_bouton(voulu, etats):
    """Traduit true, false ou un nom d'état en l'état réel du widget."""
    if voulu is True:
        return etats[0] if etats else "/Yes"
    if voulu is False or voulu in ("", None):
        return "/Off"
    v = str(voulu)
    return v if v.startswith("/") else "/" + v


def echappe_pdf(octets):
    sortie = bytearray()
    for b in octets:
        if b in (0x28, 0x29, 0x5C):
            sortie += b"\\" + bytes([b])
        elif b < 0x20 or b > 0x7E:
            sortie += b"\\%03o" % b
        else:
            sortie.append(b)
    return bytes(sortie)


def police_da(annot, acroform):
    """(nom de ressource, taille) lus dans /DA, jamais supposés."""
    da = herite(annot, "/DA") or (acroform.get("/DA") if acroform is not None else None) or "/Helv 0 Tf 0 g"
    jetons = str(da).split()
    nom, taille = "/Helv", 0.0
    for i, j in enumerate(jetons):
        if j == "Tf" and i >= 2:
            nom = jetons[i - 2]
            try:
                taille = float(jetons[i - 1])
            except ValueError:
                taille = 0.0
    return nom, taille, str(da)


def largeur_helvetica(texte, taille):
    from reportlab.pdfbase.pdfmetrics import stringWidth
    return stringWidth(texte, "Helvetica", taille)


def apparence_texte(writer, annot, texte, acroform, multiligne):
    """Écrit le flux d'apparence : c'est lui qu'un lecteur, un portail de signature ou l'impression
    affichent. Sans lui, /V seul reste invisible hors d'Acrobat. Police Helvetica en WinAnsi, déclarée
    dans le flux : les accents s'y encodent en cp1252, et ce qui n'y entre pas est refusé."""
    from pypdf.generic import (ArrayObject, DecodedStreamObject, DictionaryObject, FloatObject,
                               NameObject)
    x0, y0, x1, y1 = [float(v) for v in annot["/Rect"]]
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    l, h = x1 - x0, y1 - y0
    _, taille, da = police_da(annot, acroform)
    jetons = da.split()
    couleur = "0 g"
    for i, j in enumerate(jetons):
        if j in ("g", "rg", "k"):
            n = {"g": 1, "rg": 3, "k": 4}[j]
            couleur = " ".join(jetons[i - n:i + 1])
    peigne = int(herite(annot, "/Ff") or 0) & BIT_PEIGNE
    max_len = int(herite(annot, "/MaxLen") or 0)
    if taille <= 0:
        if multiligne:
            taille = TAILLE_DEFAUT
        else:
            taille = min(TAILLE_DEFAUT, max(TAILLE_MIN, h - 4))
            while not peigne and taille > TAILLE_MIN and largeur_helvetica(texte, taille) > l - 4:
                taille -= 0.5

    def encoder(li):
        try:
            return "(" + echappe_pdf(li.encode("cp1252")).decode("latin-1") + ") Tj"
        except UnicodeEncodeError as e:
            refuser(f"caractère hors de l'encodage du champ : {e.object[e.start:e.end]!r}")

    corps = [f"/Tx BMC q 1 1 {l - 2:.2f} {h - 2:.2f} re W n BT /DigitPdfHelv {taille:.2f} Tf {couleur}"]
    y = (h - taille) / 2 + taille * 0.15
    if peigne and max_len:
        # Peigne : une case par caractère (IBAN, SIRET) ; le texte brut s'y écraserait à gauche.
        cellule = l / max_len
        for k, car in enumerate(texte[:max_len]):
            x = cellule * k + (cellule - largeur_helvetica(car, taille)) / 2
            corps.append(f"1 0 0 1 {x:.2f} {y:.2f} Tm " + encoder(car))
    elif multiligne:
        interligne = taille * 1.15
        corps.append(f"2 {h - taille - 2:.2f} Td")
        for k, li in enumerate(lignes_coupees(texte, l - 4, taille)):
            if k:
                corps.append(f"0 {-interligne:.2f} Td")
            corps.append(encoder(li))
    else:
        q = int(herite(annot, "/Q") or 0)
        largeur = largeur_helvetica(texte, taille)
        x = 2 if q == 0 else (l - largeur) / 2 if q == 1 else l - largeur - 2
        corps.append(f"{x:.2f} {y:.2f} Td " + encoder(texte))
    corps.append("ET Q EMC")
    flux = DecodedStreamObject()
    flux.set_data("\n".join(corps).encode("latin-1"))
    police = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"), NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
    })
    flux.update({
        NameObject("/Type"): NameObject("/XObject"), NameObject("/Subtype"): NameObject("/Form"),
        NameObject("/BBox"): ArrayObject([FloatObject(0), FloatObject(0), FloatObject(l), FloatObject(h)]),
        NameObject("/Resources"): DictionaryObject({NameObject("/Font"): DictionaryObject({
            NameObject("/DigitPdfHelv"): writer._add_object(police)})}),
    })
    annot[NameObject("/AP")] = DictionaryObject({NameObject("/N"): writer._add_object(flux)})


def remplir_champs(writer, valeurs):
    from pypdf.generic import BooleanObject, NameObject, NumberObject, TextStringObject
    if not valeurs:
        return []
    racine = writer._root_object
    af = racine.get("/AcroForm")
    acroform = af.get_object() if af is not None else None
    vus, ecarts = set(), []
    for _, _, annot in widgets(writer):
        nom = nom_complet(annot)
        if nom not in valeurs:
            continue
        vus.add(nom)
        typ = type_champ(annot)
        voulu = valeurs[nom]
        ff = int(herite(annot, "/Ff") or 0)
        if ff & BIT_LECTURE_SEULE:
            ecarts.append(f"{nom} : champ en lecture seule, écrit quand même sur demande explicite")
        # Un champ rempli doit sortir à l'impression : bit Print levé, sinon il reste à l'écran.
        annot[NameObject("/F")] = NumberObject(int(annot.get("/F", 0)) | 4)
        cible = annot
        if "/T" not in annot and "/Parent" in annot:
            cible = annot["/Parent"].get_object()
        if typ in ("case", "radio"):
            etats = etats_case(annot)
            etat = valeur_bouton(voulu, etats)
            if etat != "/Off" and typ == "radio" and etat not in etats:
                annot[NameObject("/AS")] = NameObject("/Off")
                continue
            if etat != "/Off" and typ == "case" and etat not in etats:
                refuser(f"{nom} : état {etat} inconnu de cette case (états : {etats})")
            cible[NameObject("/V")] = NameObject(etat)
            annot[NameObject("/AS")] = NameObject(etat)
        elif typ in ("texte", "liste"):
            texte = "" if voulu is None else str(voulu)
            cible[NameObject("/V")] = TextStringObject(texte)
            if typ == "liste" and "/I" in cible:
                del cible["/I"]
            apparence_texte(writer, annot, texte, acroform, bool(ff & BIT_MULTILIGNE))
        elif typ == "signature":
            refuser(f"{nom} : un champ de signature ne se remplit pas ici, il se signe")
        else:
            refuser(f"{nom} : type de champ {typ} non remplissable")
    absents = sorted(set(valeurs) - vus)
    if absents:
        refuser(f"champ(s) demandé(s) absents du fichier : {', '.join(absents)} (voir `relever`)")
    if acroform is not None:
        # Les apparences sont écrites : plus rien à faire recalculer par le lecteur.
        acroform[NameObject("/NeedAppearances")] = BooleanObject(False)
    return ecarts


# --- remplir : plat --------------------------------------------------------------------------

def police_plate(canvas, chemin):
    if chemin:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        if not os.path.isfile(chemin):
            refuser(f"police introuvable : {chemin}")
        pdfmetrics.registerFont(TTFont("DigitPdfPolice", chemin))
        return "DigitPdfPolice", True
    return "Helvetica", False


def remplir_plat(writer, entrees, police):
    from pypdf import PdfReader
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas as rl
    ecarts = []
    par_page = {}
    for e in entrees:
        par_page.setdefault(int(e["page"]), []).append(e)
    for n, liste in sorted(par_page.items()):
        if n < 1 or n > len(writer.pages):
            refuser(f"page {n} absente du fichier ({len(writer.pages)} pages)")
        page = writer.pages[n - 1]
        if rotation_page(page):
            refuser(f"page {n} tournée de {rotation_page(page)}° : le remplissage plat ne la prend pas en charge")
        g, b, d, h = repere_page(page)
        tampon = io.BytesIO()
        c = rl.Canvas(tampon, pagesize=(float(page.mediabox.right), float(page.mediabox.top)))
        nom_police, integree = police_plate(c, police)
        for e in liste:
            x0, haut, x1, bas = [float(v) for v in e["boite"]]
            X0, X1, Y_bas, Y_haut = g + x0, g + x1, h - bas, h - haut
            if "coche" in e:
                if e["coche"]:
                    c.setLineWidth(1.2)
                    m = 1.5
                    c.line(X0 + m, Y_bas + m, X1 - m, Y_haut - m)
                    c.line(X0 + m, Y_haut - m, X1 - m, Y_bas + m)
                continue
            texte = str(e.get("texte", ""))
            if not integree:
                try:
                    texte.encode("cp1252")
                except UnicodeEncodeError:
                    refuser(f"« {texte} » sort de l'encodage de Helvetica : passer --police <fichier.ttf>")
            taille = float(e.get("taille", min(TAILLE_DEFAUT, max(TAILLE_MIN, (bas - haut) * 0.75))))
            while taille > TAILLE_MIN and stringWidth(texte, nom_police, taille) > (x1 - x0):
                taille -= 0.25
            if stringWidth(texte, nom_police, taille) > (x1 - x0):
                ecarts.append(f"page {n} : « {texte[:40]} » ne tient pas dans sa boîte, même à {TAILLE_MIN} points")
            c.setFont(nom_police, taille)
            c.drawString(X0 + 0.5, Y_bas + ((bas - haut) - taille) / 2 + taille * 0.18, texte)
        c.save()
        tampon.seek(0)
        page.merge_page(PdfReader(tampon).pages[0])
    return ecarts


def remplir(a):
    manque = exiger("pypdf", "reportlab")
    if manque:
        refuser(f"dépendances absentes : {', '.join(manque)} (pip install pypdf reportlab)")
    from pypdf import PdfWriter
    r = ouvrir(a.pdf)
    if est_xfa(r):
        refuser("formulaire XFA : ni pypdf ni l'oracle ne le jugent ; à ouvrir dans Acrobat, ou à demander en AcroForm")
    valeurs = lire_json(a.valeurs)
    w = PdfWriter(clone_from=r)
    ecarts = remplir_champs(w, valeurs.get("champs") or {})
    ecarts += remplir_plat(w, valeurs.get("plat") or [], a.police)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "wb") as f:
        w.write(f)
    for e in ecarts:
        print(f"ÉCART — {e}", file=sys.stderr)
    if a.sans_controle:
        print(f"écrit : {a.out} — NON CONTRÔLÉ (--sans-controle) : rien ne part sans oracle-formulaire-pdf.py")
        return 0
    # Le contrôle n'est pas une étape à se rappeler : remplir sans lui reste un geste explicite.
    oracle = [sys.executable, os.path.join(ICI, "oracle-formulaire-pdf.py"), a.out, "--attendu", a.valeurs, "--source", a.pdf]
    res = subprocess.run(oracle, capture_output=True, text=True, encoding="utf-8", errors="replace")
    sys.stdout.write(res.stdout)
    if res.returncode:
        sys.stderr.write(res.stderr)
    return res.returncode


def main():
    ap = argparse.ArgumentParser(description="Relève et remplit un formulaire PDF, à champs ou plat.")
    sous = ap.add_subparsers(dest="cmd", required=True)
    p = sous.add_parser("relever")
    p.add_argument("pdf")
    p.add_argument("--modele")
    p.add_argument("--png")
    q = sous.add_parser("remplir")
    q.add_argument("pdf")
    q.add_argument("--valeurs", required=True)
    q.add_argument("--out", required=True)
    q.add_argument("--police")
    q.add_argument("--sans-controle", action="store_true")
    a = ap.parse_args()
    sys.exit(relever(a) if a.cmd == "relever" else remplir(a))


if __name__ == "__main__":
    main()
