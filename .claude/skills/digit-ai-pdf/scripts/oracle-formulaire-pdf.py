#!/usr/bin/env python
"""oracle-formulaire-pdf — Domaine « Formulaire PDF rempli ».

LE FAIT (étude 20261030a, M-05 et M-10, TF-2031) : un contrat et un mandat de prélèvement remplis
le 30/10/2026 sont sortis sans contrôle sur le fichier rendu, et aucun oracle du registre ne jugeait
un champ rempli : les polices et le format imprimé seulement.

    python oracle-formulaire-pdf.py <rempli.pdf> --attendu valeurs.json [--source vierge.pdf]
                                    [--rendu <dossier>] [--taille-min 6]

valeurs.json : le fichier de `formulaire.py remplir`. --source est exigée dès qu'il porte `plat`.
L'oracle ne relit jamais le remplissage par la voie qui l'a écrit : les valeurs par pypdf (lecture
seule), ce que voit le lecteur par PDFium (qui aplatit les apparences), le plat par pdfplumber.

  F1 fichier lisible, même nombre de pages que la source, pas de XFA.
  F2 chaque champ attendu existe.
  F3 la valeur relue égale la valeur attendue ; pour une case, /V et /AS concordent.
  F4 ce que voit le lecteur : un champ à valeur s'affiche (apparence présente, encre au rendu), et
     le texte affiché est bien la valeur. /V sans apparence est invisible hors d'Acrobat.
  F5 le texte tient dans son champ, à la largeur de la police déclarée ; MaxLen respecté.
  F6 aucun champ requis ne reste vide.
  F7 avec --source : aucun champ non déclaré n'a changé. Sans elle : ceux qui portent une valeur
     sont signalés, sans bloquer.
  F8 avec --source : le contenu des pages ne change qu'aux boîtes déclarées (rendu pixel, champs
     masqués) ; hors zone, c'est une écriture non demandée.
  P1 plat : le texte voulu est dans sa boîte, et il se voit au rendu.
  P2 plat : aucun caractère ajouté ne sort de sa boîte ni de la page.
  P3 plat : aucun caractère ajouté n'écrit par-dessus un caractère de la source ; sur un scan sans
     couche de texte, de l'encre sous le texte ajouté se signale en avertissement.
  P4 plat : une case demandée cochée porte de l'encre, une case demandée vide n'en reçoit pas.
  P5 plat, avertissement : corps du texte ajouté sous --taille-min.

Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[],mesure}.
Exit 0=PASS, 1=FAIL, 2=SKIP (dépendance absente, usage, fichier chiffré, --source manquante).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_pdf import (BIT_PEIGNE, boite_lecteur, compact, est_xfa, etats_case, exiger, herite,
                     inventaire_champs, lignes_coupees, lire_json, nom_complet, norm_texte,
                     repere_page, rotation_page, valeur_lue, widgets)

DOM = "Formulaire PDF rempli"
ECHELLE = 2.0
TOLERANCE_PT = 1.5
SEUIL_ENCRE = 40          # écart sur 255 à partir duquel un pixel compte comme changé
PART_COCHE_MIN = 0.01     # part de pixels changés qui fait une coche
PART_ENCRE_SOUS_TEXTE = 0.15  # un filet sous le texte en couvre moins ; une ligne imprimée, plus
GUIDES = set("_.…·-–—")    # écrire sur une ligne de soulignés ou de points, c'est la remplir
NON_JUGE = [
    "LA CONFORMITÉ JURIDIQUE ou l'exactitude métier des valeurs : l'oracle compare à valeurs.json, il ne dit pas si valeurs.json est juste",
    "LA SIGNATURE : un champ de signature se compte, sa validité cryptographique n'est pas vérifiée, et remplir un PDF déjà signé casse cette signature",
    "LE GLYPHE RÉELLEMENT DESSINÉ : l'extraction lit le code du caractère ; une police embarquée fausse se juge par oracle-polices-embarquees, une image du rendu par l'œil (--rendu)",
    "XFA n'est pas jugé (F1 le refuse)",
    "LA LARGEUR F5 d'une police non standard est estimée sur Helvetica",
    "L'ALIGNEMENT VISUEL dans une boîte d'un formulaire plat : l'oracle borne le texte à la boîte que déclare valeurs.json, il ne dit pas si la boîte est la bonne",
]


class Etat:
    def __init__(self, artefact):
        self.artefact = artefact
        self.findings = []
        self.non_juge = list(NON_JUGE)
        self.mesure = {"champs_attendus": 0, "champs_ok": 0, "zones_plates": 0, "zones_ok": 0}

    def faute(self, regle, ou, msg):
        self.findings.append({"sev": "bloquant", "where": ou, "msg": f"{regle} — {msg}"})

    def avert(self, regle, ou, msg):
        self.findings.append({"sev": "avert", "where": ou, "msg": f"{regle} — {msg}"})

    def info(self, ou, msg):
        self.findings.append({"sev": "info", "where": ou, "msg": msg})


def emettre(etat, verdict, motif=None):
    import json
    sortie = {"oracle": "oracle-formulaire-pdf", "domaine": DOM, "artefact": etat.artefact,
              "verdict": verdict, "findings": etat.findings, "non_juge": etat.non_juge, "mesure": etat.mesure}
    if verdict == "SKIP":
        sortie["motif"] = motif or ""
    sys.stdout.write(json.dumps(sortie, ensure_ascii=False))
    sys.exit(1 if verdict == "FAIL" else 2 if verdict == "SKIP" else 0)


def rendre_pil(doc, i, annots):
    return doc[i].render(scale=ECHELLE, may_draw_forms=False, draw_annots=annots, grayscale=True).to_pil().convert("L")


def boite_px(boite, largeur, hauteur):
    x0, h, x1, b = boite
    return (max(0, int(x0 * ECHELLE)), max(0, int(h * ECHELLE)),
            min(largeur, int(round(x1 * ECHELLE)) + 1), min(hauteur, int(round(b * ECHELLE)) + 1))


def pixels_changes(img_a, img_b, zone=None):
    """Nombre de pixels qui diffèrent nettement, dans la zone ou sur toute l'image."""
    from PIL import ImageChops
    a = img_a.crop(zone) if zone else img_a
    b = img_b.crop(zone) if zone else img_b
    if a.size != b.size:
        return -1, a.size[0] * a.size[1]
    d = ImageChops.difference(a, b).point(lambda v: 255 if v >= SEUIL_ENCRE else 0)
    return d.histogram()[255], a.size[0] * a.size[1]


class VueImprimee:
    """Ce qui sort à l'impression et dans un portail de signature : les apparences aplaties dans la
    page par PDFium, qui ne les recalcule jamais. Sans environnement de formulaire, PDFium ne dessine
    pas les widgets ; avec lui, il régénère une apparence manquante et cacherait le défaut."""

    def __init__(self, chemin):
        import pypdfium2 as pdfium
        self.doc = pdfium.PdfDocument(chemin)
        self.nu = pdfium.PdfDocument(chemin)
        self.images = {}

    def page(self, n):
        """(image aplatie, image sans widget, page de texte aplatie) de la page n, base 1."""
        import pypdfium2.raw as raw
        if n not in self.images:
            p = self.doc[n - 1]
            raw.FPDFPage_Flatten(p.raw, raw.FLAT_PRINT)
            p.close()
            p = self.doc[n - 1]
            self.images[n] = (rendre_pil(self.doc, n - 1, False), rendre_pil(self.nu, n - 1, False), p.get_textpage())
        return self.images[n]

    def texte(self, n, rect):
        """Ce que le champ ajoute dans son rectangle : une ligne de soulignés imprimée sous le champ
        est du contenu de page, pas sa valeur (faux positif mesuré sur un formulaire à 35 champs)."""
        x0, y0, x1, y1 = [float(v) for v in rect]
        x0, x1 = sorted((x0, x1))
        y0, y1 = sorted((y0, y1))
        borne = {"left": x0, "bottom": y0, "right": x1, "top": y1}
        vu = compact(self.page(n)[2].get_text_bounded(**borne))
        fond = compact(self.nu[n - 1].get_textpage().get_text_bounded(**borne))
        return vu.replace(fond, "", 1) if fond else vu

    def fermer(self):
        self.images.clear()
        self.doc.close()
        self.nu.close()


def attendu_bouton(voulu, etats):
    if voulu is True:
        return etats[0] if etats else "/Yes"
    if voulu is False or voulu in ("", None):
        return "/Off"
    v = str(voulu)
    return v if v.startswith("/") else "/" + v


def juger_champs(etat, chemin, reader, attendu, source_champs):
    from reportlab.pdfbase.pdfmetrics import stringWidth
    vue = VueImprimee(chemin)

    def encre(n_page, page, annot):
        g, b, d, h = repere_page(page)
        a, s, _ = vue.page(n_page)
        return pixels_changes(a, s, boite_px(boite_lecteur(annot["/Rect"], h, g, b), a.width, a.height))[0]

    inv = inventaire_champs(reader)
    etat.mesure["champs_fichier"] = len(inv)
    etat.mesure["champs_attendus"] = len(attendu)
    for nom in attendu:
        if nom not in inv:
            etat.faute("F2", nom, "champ attendu absent du fichier")
    wid = {}
    for n_page, page, annot in widgets(reader):
        wid.setdefault(nom_complet(annot), []).append((n_page, page, annot))
    pages_tournees = set()

    for nom, voulu in attendu.items():
        if nom not in inv:
            continue
        info = inv[nom]
        typ = info["type"]
        ok = True
        if typ in ("case", "radio"):
            attendu_etat = None
            for n_page, page, annot in wid[nom]:
                etats = etats_case(annot)
                cible = attendu_bouton(voulu, etats)
                as_ = str(annot.get("/AS", "/Off"))
                lu = str(herite(annot, "/V") or "/Off")
                if typ == "radio":
                    attendu_etat = cible
                    if lu != cible:
                        etat.faute("F3", nom, f"valeur relue {lu}, attendue {cible}")
                        ok = False
                        break
                    if cible != "/Off" and as_ == cible and not rotation_page(page) and encre(n_page, page, annot) <= 0:
                        etat.faute("F4", nom, "bouton choisi sans apparence : rien ne se voit à l'impression")
                        ok = False
                    continue
                if lu != cible:
                    etat.faute("F3", nom, f"valeur relue {lu}, attendue {cible}")
                    ok = False
                if as_ != lu:
                    etat.faute("F3", nom, f"/V dit {lu}, l'apparence active /AS dit {as_} : le lecteur verra {as_}")
                    ok = False
                if cible != "/Off" and not rotation_page(page) and encre(n_page, page, annot) <= 0:
                    etat.faute("F4", nom, "case cochée sans apparence : rien ne se voit à l'impression")
                    ok = False
            if typ == "radio" and ok and attendu_etat not in (None, "/Off"):
                if not any(str(a.get("/AS", "/Off")) == attendu_etat for _, _, a in wid[nom]):
                    etat.faute("F3", nom, f"aucun bouton du groupe n'active l'état {attendu_etat}")
                    ok = False
        elif typ in ("texte", "liste"):
            n_page, page, annot = wid[nom][0]
            lu = valeur_lue(annot) or ""
            if norm_texte(lu) != norm_texte(voulu if voulu is not None else ""):
                etat.faute("F3", nom, f"valeur relue « {lu[:60]} », attendue « {str(voulu)[:60]} »")
                ok = False
            texte_voulu = str(voulu if voulu is not None else "")
            if info.get("max_len") and len(texte_voulu) > info["max_len"]:
                etat.faute("F5", nom, f"{len(texte_voulu)} caractères pour {info['max_len']} autorisés")
                ok = False
            if rotation_page(page):
                pages_tournees.add(n_page)
            elif not texte_voulu.strip():
                vu = vue.texte(n_page, annot["/Rect"])
                if vu.strip():
                    etat.faute("F4", nom, f"champ attendu vide, l'impression montre encore « {vu.strip()[:60]} »")
                    ok = False
            else:
                if "/AP" not in annot:
                    etat.faute("F4", nom, "valeur sans apparence : elle ne s'affiche que dans un lecteur qui la recalcule, jamais à l'impression ni dans un portail de signature")
                    ok = False
                elif encre(n_page, page, annot) <= 0:
                    etat.faute("F4", nom, "aucune encre à l'impression : la valeur existe dans le fichier et ne se voit pas (apparence vide, ou champ non imprimable)")
                    ok = False
                else:
                    vu = vue.texte(n_page, annot["/Rect"])
                    if vu.strip() and compact(vu) != compact(texte_voulu):
                        etat.faute("F4", nom, f"le lecteur affiche « {vu.strip()[:60]} », la valeur est « {texte_voulu[:60]} »")
                        ok = False
                    elif not vu.strip():
                        etat.avert("F4", nom, "de l'encre au rendu, mais le texte affiché ne se lit pas par extraction : vérifier à l'œil (--rendu)")
                x0, y0, x1, y1 = [float(v) for v in annot["/Rect"]]
                l, ha = abs(x1 - x0), abs(y1 - y0)
                da = str(herite(annot, "/DA") or "")
                jetons = da.split()
                taille = 0.0
                if "Tf" in jetons:
                    try:
                        taille = float(jetons[jetons.index("Tf") - 1])
                    except (ValueError, IndexError):
                        taille = 0.0
                peigne = int(herite(annot, "/Ff") or 0) & BIT_PEIGNE
                if info.get("multiligne"):
                    calc = taille or 11.0
                    n_lignes = len(lignes_coupees(texte_voulu, l - 4, calc))
                    if n_lignes * calc * 1.15 > ha:
                        etat.faute("F5", nom, f"{n_lignes} lignes de {calc:.0f} points pour un champ de {ha:.0f} points de haut : le bas sera coupé")
                        ok = False
                elif not peigne:
                    # Taille automatique : le texte a le droit de réduire jusqu'au plancher lisible.
                    calc = taille or 6.0
                    mesure = stringWidth(texte_voulu.encode("cp1252", "replace").decode("cp1252"), "Helvetica", calc)
                    if mesure > l - 1:
                        etat.faute("F5", nom, f"le texte mesure {mesure:.0f} points à {calc:.0f} points de corps pour un champ de {l:.0f} : il sera coupé")
                        ok = False
        elif typ == "signature":
            etat.faute("F3", nom, "un champ de signature ne se déclare pas dans valeurs.json")
            ok = False
        if ok:
            etat.mesure["champs_ok"] += 1

    for nom, c in inv.items():
        vide = (c.get("valeur") or "").strip() in ("", "/Off")
        if c["type"] in ("texte", "liste", "case", "radio") and c.get("requis") and vide:
            etat.faute("F6", nom, "champ requis laissé vide")
        if c["type"] == "signature":
            etat.info(nom, f"champ de signature page {c['page']} : {'signé' if c.get('valeur') else 'à signer'}")
    if source_champs is not None:
        for nom, c in inv.items():
            if nom in attendu or c["type"] == "signature":
                continue
            avant = (source_champs.get(nom) or {}).get("valeur")
            if (avant or None) != (c.get("valeur") or None):
                etat.faute("F7", nom, f"champ non déclaré modifié : « {str(avant)[:40]} » → « {str(c.get('valeur'))[:40]} »")
    else:
        hors = [n for n, c in inv.items() if n not in attendu and c["type"] in ("texte", "liste", "case", "radio") and (c.get("valeur") or "").strip("/ ") not in ("", "Off")]
        if hors:
            etat.avert("F7", ", ".join(hors[:6]), f"{len(hors)} champ(s) hors valeurs.json portent une valeur, sans source pour dire s'ils ont changé")
        etat.non_juge.append("F7 et F8 NON JOUÉES : --source absente")
    if pages_tournees:
        etat.non_juge.append(f"F4 et F5 NON JOUÉES sur les pages tournées : {sorted(pages_tournees)}")
    vue.fermer()


def caracteres(chemin):
    import pdfplumber
    pages = []
    with pdfplumber.open(chemin) as pdf:
        for p in pdf.pages:
            pages.append([{"t": c["text"], "x0": c["x0"], "x1": c["x1"], "h": c["top"], "b": c["bottom"], "taille": c.get("size", 0)} for c in p.chars])
    return pages


def cle(c):
    return (c["t"], round(c["x0"], 1), round(c["h"], 1))


def dans(c, boite, marge=TOLERANCE_PT):
    x0, h, x1, b = boite
    return c["x0"] >= x0 - marge and c["x1"] <= x1 + marge and c["h"] >= h - marge and c["b"] <= b + marge


def centre_dans(c, boite):
    x0, h, x1, b = boite
    return x0 <= (c["x0"] + c["x1"]) / 2 <= x1 and h <= (c["h"] + c["b"]) / 2 <= b


def recouvre(a, b):
    l = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
    h = min(a["b"], b["b"]) - max(a["h"], b["h"])
    if l <= 0 or h <= 0:
        return 0.0
    aire = max((a["x1"] - a["x0"]) * (a["b"] - a["h"]), 0.01)
    return l * h / aire


def juger_plat(etat, chemin, source, plat, taille_min):
    import pypdfium2 as pdfium
    ajoutes_par_page, source_par_page = {}, {}
    rempli_c = caracteres(chemin)
    source_c = caracteres(source)
    for i, chars in enumerate(rempli_c, 1):
        base = source_c[i - 1] if i <= len(source_c) else []
        cles = {}
        for c in base:
            cles[cle(c)] = cles.get(cle(c), 0) + 1
        ajouts = []
        for c in chars:
            k = cle(c)
            if cles.get(k, 0) > 0:
                cles[k] -= 1
            else:
                ajouts.append(c)
        ajoutes_par_page[i] = ajouts
        source_par_page[i] = base
    doc_r, doc_s = pdfium.PdfDocument(chemin), pdfium.PdfDocument(source)
    etat.mesure["zones_plates"] = len(plat)
    zones_par_page = {}
    for e in plat:
        zones_par_page.setdefault(int(e["page"]), []).append(e)
    for n, zones in sorted(zones_par_page.items()):
        if n > len(doc_r):
            etat.faute("P1", f"page {n}", "page absente du fichier")
            continue
        a, s = rendre_pil(doc_r, n - 1, True), rendre_pil(doc_s, n - 1, True)
        ajouts = ajoutes_par_page.get(n, [])
        for e in zones:
            boite = [float(v) for v in e["boite"]]
            ou = f"page {n}, boîte {boite}"
            zone = boite_px(boite, a.width, a.height)
            ch, aire = pixels_changes(a, s, zone)
            if "coche" in e:
                if e["coche"] and ch < max(4, aire * PART_COCHE_MIN):
                    etat.faute("P4", ou, f"case attendue cochée : {ch} pixels marqués sur {aire}")
                elif not e["coche"] and ch > aire * PART_COCHE_MIN:
                    etat.faute("P4", ou, f"case attendue vide : {ch} pixels marqués sur {aire}")
                else:
                    etat.mesure["zones_ok"] += 1
                continue
            voulu = str(e.get("texte", ""))
            lus = sorted([c for c in ajouts if centre_dans(c, boite)], key=lambda c: (round(c["h"]), c["x0"]))
            lu = "".join(c["t"] for c in lus)
            ok = True
            if compact(lu) != compact(voulu):
                etat.faute("P1", ou, f"texte lu « {lu[:60]} », attendu « {voulu[:60]} »")
                ok = False
            if voulu.strip() and ch == 0:
                etat.faute("P1", ou, f"« {voulu[:40]} » est dans le fichier et ne se voit pas au rendu")
                ok = False
            if ok:
                etat.mesure["zones_ok"] += 1
            # Formulaire scanné : aucun caractère source à comparer, mais de l'encre sous le texte.
            if lus:
                x0, x1 = min(c["x0"] for c in lus), max(c["x1"] for c in lus)
                h, b = min(c["h"] for c in lus), max(c["b"] for c in lus)
                sous = s.crop(boite_px([x0, h, x1, b], s.width, s.height)).point(lambda v: 255 if v < 110 else 0)
                part = sous.histogram()[255] / max(sous.width * sous.height, 1)
                if part > PART_ENCRE_SOUS_TEXTE:
                    etat.avert("P3", ou, f"{part:.0%} d'encre de la source sous le texte ajouté : collision probable avec une image ou un scan, à regarder (--rendu)")
            petits = [c for c in lus if c["taille"] and c["taille"] < taille_min]
            if petits:
                etat.avert("P5", ou, f"corps de {min(c['taille'] for c in petits):.1f} points, sous le plancher de {taille_min}")
        boites = [[float(v) for v in e["boite"]] for e in zones]
        hors = [c for c in ajouts if not any(dans(c, b) for b in boites)]
        if hors:
            extrait = "".join(c["t"] for c in hors)[:50]
            etat.faute("P2", f"page {n}", f"{len(hors)} caractère(s) ajouté(s) hors de leur boîte : « {extrait} »")
        collisions = [c for c in ajouts for o in source_par_page.get(n, []) if o["t"].strip() and o["t"] not in GUIDES and c["t"].strip() and recouvre(c, o) > 0.2]
        if collisions:
            extrait = "".join(c["t"] for c in collisions)[:50]
            etat.faute("P3", f"page {n}", f"{len(collisions)} caractère(s) écrit(s) par-dessus le texte du formulaire : « {extrait} »")
    doc_r.close()
    doc_s.close()


def juger_pixels_hors_zones(etat, chemin, source, plat, attendu_champs):
    """F8 : champs masqués, seules les boîtes plates déclarées peuvent changer."""
    import pypdfium2 as pdfium
    from PIL import ImageDraw
    doc_r, doc_s = pdfium.PdfDocument(chemin), pdfium.PdfDocument(source)
    try:
        for i in range(min(len(doc_r), len(doc_s))):
            a, s = rendre_pil(doc_r, i, False), rendre_pil(doc_s, i, False)
            if a.size != s.size:
                etat.faute("F8", f"page {i + 1}", f"format de page changé : {s.size} → {a.size}")
                continue
            m = max(1, int(TOLERANCE_PT * ECHELLE))
            masque_a, masque_s = a.copy(), s.copy()
            for e in plat:
                if int(e["page"]) == i + 1:
                    z = boite_px([float(v) for v in e["boite"]], a.width, a.height)
                    for im in (masque_a, masque_s):
                        ImageDraw.Draw(im).rectangle([z[0] - m, z[1] - m, z[2] + m, z[3] + m], fill=255)
            ch, _ = pixels_changes(masque_a, masque_s)
            if ch > 0:
                etat.faute("F8", f"page {i + 1}", f"{ch} pixel(s) changé(s) hors des zones déclarées : écriture non demandée")
    finally:
        doc_r.close()
        doc_s.close()


def rendus(chemin, dossier, n_pages):
    """Une image de chaque page telle qu'elle s'imprime, pour l'œil : c'est le contrôle du glyphe."""
    os.makedirs(dossier, exist_ok=True)
    vue = VueImprimee(chemin)
    sorties = []
    try:
        for n in range(1, n_pages + 1):
            p = os.path.join(dossier, f"rendu-{n:03d}.png")
            vue.page(n)[0].save(p)
            sorties.append(p)
    finally:
        vue.fermer()
    return sorties


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--attendu")
    ap.add_argument("--source")
    ap.add_argument("--rendu")
    ap.add_argument("--taille-min", type=float, default=6.0)
    a = ap.parse_args()
    etat = Etat(a.pdf)
    if not os.path.isfile(a.pdf):
        emettre(etat, "SKIP", "fichier absent")
    if not a.attendu:
        emettre(etat, "SKIP", "--attendu exigé : sans valeurs déclarées, rien à comparer")
    manque = exiger("pypdf", "pypdfium2", "pdfplumber", "reportlab", "PIL")
    if manque:
        emettre(etat, "SKIP", f"dépendances absentes : {', '.join(manque)}")
    from pypdf import PdfReader
    try:
        r = PdfReader(a.pdf)
        if r.is_encrypted and not r.decrypt(""):
            emettre(etat, "SKIP", "PDF protégé par un mot de passe, rien n'est jugé")
        n_pages = len(r.pages)
    except SystemExit:
        raise
    except Exception as e:
        etat.faute("F1", a.pdf, f"fichier illisible : {e}")
        emettre(etat, "FAIL")
    if est_xfa(r):
        etat.faute("F1", a.pdf, "formulaire XFA : ni rempli ni jugé par cette voie")
        emettre(etat, "FAIL")
    attendu = lire_json(a.attendu)
    champs = attendu.get("champs") or {}
    plat = attendu.get("plat") or []
    if not champs and not plat:
        emettre(etat, "SKIP", "valeurs.json ne déclare ni champ ni zone plate")
    if plat and not a.source:
        emettre(etat, "SKIP", "--source exigée pour un formulaire plat : sans le vierge, ni écriture hors zone ni collision ne se jugent")
    source_champs = None
    if a.source:
        if not os.path.isfile(a.source):
            emettre(etat, "SKIP", f"source absente : {a.source}")
        rs = PdfReader(a.source)
        if rs.is_encrypted:
            rs.decrypt("")
        if len(rs.pages) != n_pages:
            etat.faute("F1", a.pdf, f"{n_pages} pages pour {len(rs.pages)} dans la source")
        source_champs = inventaire_champs(rs)
    etat.mesure["pages"] = n_pages
    # Un champ vide n'est jugé que s'il est requis ; la liste des pages tournées dit le reste.
    juger_champs(etat, a.pdf, r, champs, source_champs)
    tournees = [i for i, p in enumerate(r.pages, 1) if rotation_page(p)]
    if plat:
        if any(int(e["page"]) in tournees for e in plat):
            etat.faute("P1", "pages tournées", "zone plate déclarée sur une page tournée : non jugeable")
        else:
            juger_plat(etat, a.pdf, a.source, plat, a.taille_min)
    if a.source:
        juger_pixels_hors_zones(etat, a.pdf, a.source, plat, champs)
    if a.rendu:
        etat.mesure["rendus"] = rendus(a.pdf, a.rendu, n_pages)
    fautes = [f for f in etat.findings if f["sev"] == "bloquant"]
    emettre(etat, "FAIL" if fautes else "PASS")


if __name__ == "__main__":
    main()
