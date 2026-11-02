#!/usr/bin/env python3
"""formats.py — ce que Node ne sait pas faire sans dépendance : Word, PDF, texte extrait, images de pages.

Appelé en processus séparé par lancer.mjs, serveur-versions.mjs, bilan.mjs et oracle-faits-sources.mjs.
Une seule commande charge `pymupdf` : `pdf-appliquer`, décision D-124 (a) du 02/11/2026. Ce module, en
AGPL, reste une dépendance du poste : il n'est ni copié dans le dépôt, ni importé par `digit-ai-pdf`.
Le rendu et la lecture du texte passent par `pypdfium2`, de licence permissive.

    python formats.py dependances
    python formats.py texte <fichier.docx|.pdf> [--complet]
    python formats.py depaqueter <document.docx> <dossier>
    python formats.py rempaqueter <dossier> <base.docx> <sortie.docx>
    python formats.py pdf-appliquer <base.pdf> <modifs.json> <sortie.pdf>
    python formats.py pdf-images <document.pdf> <dossier> [--dpi 110]

Exit : 0 fait · 1 refusé, motif dans le JSON · 2 usage · 3 dépendance absente, nommée dans le JSON.
MAKE_IT_BETTER_SANS=pymupdf,pypdfium2 joue l'absence d'un module par le vrai chemin d'ImportError.
"""
import json
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

for _nom in filter(None, os.environ.get("MAKE_IT_BETTER_SANS", "").split(",")):
    sys.modules[_nom.strip()] = None  # type: ignore[assignment]

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def rendre(obj, code=0):
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(obj, ensure_ascii=False))
    return code


def absent(nom):
    return rendre({"ok": False, "absent": nom, "motif": f"module Python absent : {nom}"}, 3)


# ── Word ──────────────────────────────────────────────────────────────────────────────────────────


def texte_partie(xml_octets):
    """Le texte d'une partie WordprocessingML, un paragraphe par ligne, sans codes de champ."""
    racine = ET.fromstring(xml_octets)
    lignes = []

    def paragraphe(p):
        morceaux = []

        def runs(el):
            for c in el:
                if c.tag == W + "p":
                    paragraphe(c)  # zone de texte : son propre paragraphe
                elif c.tag == W + "t":
                    morceaux.append(c.text or "")
                elif c.tag == W + "tab":
                    morceaux.append("\t")
                elif c.tag in (W + "br", W + "cr"):
                    morceaux.append("\n")
                elif c.tag != W + "instrText":
                    runs(c)

        runs(p)
        lignes.append("".join(morceaux))

    def visiter(el):
        for c in el:
            if c.tag == W + "p":
                paragraphe(c)
            else:
                visiter(c)

    visiter(racine)
    return "\n".join(lignes)


def texte_docx(chemin, complet):
    with zipfile.ZipFile(chemin) as z:
        noms = z.namelist()
        parties = ["word/document.xml"]
        parties += [n for n in noms if re.fullmatch(r"word/(footnotes|endnotes)\.xml", n)]
        if complet:
            parties += sorted(n for n in noms if re.fullmatch(r"word/(header|footer)\d*\.xml", n))
        return "\n".join(texte_partie(z.read(n)) for n in parties if n in noms)


def une_ligne_par_paragraphe(xml_octets):
    """Word écrit tout son XML sur une seule ligne, et l'outil Read du modèle se borne par lignes : sur un
    long document, rien ne se lirait. Un saut de ligne entre 2 éléments de bloc ne change rien pour Word."""
    return re.sub(rb"(<w:body>|</w:(?:p|tr|tbl|sectPr)>)(?=<)", rb"\1\n", xml_octets)


def cmd_depaqueter(docx, dossier):
    dest = Path(dossier).resolve()
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(docx) as z:
        for info in z.infolist():
            cible = (dest / info.filename).resolve()
            if dest not in cible.parents and cible != dest:
                return rendre({"ok": False, "motif": f"chemin hors du paquet : {info.filename}"}, 1)
            if info.is_dir():
                cible.mkdir(parents=True, exist_ok=True)
                continue
            cible.parent.mkdir(parents=True, exist_ok=True)
            octets = z.read(info)
            cible.write_bytes(une_ligne_par_paragraphe(octets) if info.filename == "word/document.xml" else octets)
    return rendre({"ok": True, "dossier": str(dest)})


def cmd_rempaqueter(dossier, base, sortie):
    racine = Path(dossier)
    if not (racine / "word" / "document.xml").is_file():
        return rendre({"ok": False, "motif": "paquet/word/document.xml absent"}, 1)
    modifiees, absentes = [], []
    with zipfile.ZipFile(base) as zb, zipfile.ZipFile(sortie, "w", zipfile.ZIP_DEFLATED) as zs:
        connus = set()
        for info in zb.infolist():
            connus.add(info.filename)
            if info.is_dir():
                continue
            fichier = racine / info.filename
            ancien = zb.read(info)
            if not fichier.is_file():
                absentes.append(info.filename)
                continue
            neuf = fichier.read_bytes()
            if neuf != ancien:
                modifiees.append(info.filename)
            zs.writestr(info, neuf, compress_type=zipfile.ZIP_DEFLATED)
        nouvelles = [
            p.relative_to(racine).as_posix()
            for p in sorted(racine.rglob("*"))
            if p.is_file() and p.relative_to(racine).as_posix() not in connus
        ]
        for n in nouvelles:
            zs.write(racine / n, n)
    return rendre({"ok": True, "modifiees": modifiees, "absentes": absentes, "nouvelles": nouvelles})


# ── PDF : texte et images, par pypdfium2 ─────────────────────────────────────────────────────────


def texte_pdf(chemin):
    """Le texte dans l'ordre de la page, de haut en bas : une ligne remplacée s'écrit en fin de flux
    du PDF, et lue dans l'ordre du flux elle compterait pour une ligne déplacée à chaque écart."""
    import pypdfium2

    pdf = pypdfium2.PdfDocument(chemin)
    try:
        pages = []
        for i in range(len(pdf)):
            page = pdf[i]
            tp = page.get_textpage()
            morceaux = []
            for r in range(tp.count_rects()):
                gauche, bas, droite, haut = tp.get_rect(r)
                morceau = tp.get_text_bounded(gauche, bas, droite, haut).replace("\r", " ").replace("\n", " ").strip()
                if morceau:
                    morceaux.append((haut, bas, gauche, morceau))
            morceaux.sort(key=lambda m: (-m[0], m[2]))
            lignes = []
            for haut, bas, gauche, morceau in morceaux:
                if lignes and abs(lignes[-1]["haut"] - haut) < 0.5 * max(haut - bas, 1):
                    lignes[-1]["parts"].append((gauche, morceau))
                else:
                    lignes.append({"haut": haut, "parts": [(gauche, morceau)]})
            pages.append("\n".join(" ".join(m for _, m in sorted(l["parts"])) for l in lignes))
            tp.close()
            page.close()
        return "\n".join(pages)
    finally:
        pdf.close()


def cmd_pdf_images(pdf, dossier, dpi):
    try:
        import pypdfium2
        import PIL  # noqa: F401  (to_pil en a besoin)
    except ImportError as e:
        return absent(getattr(e, "name", None) or "pypdfium2")
    dest = Path(dossier)
    dest.mkdir(parents=True, exist_ok=True)
    doc = pypdfium2.PdfDocument(pdf)
    try:
        n = len(doc)
        for i in range(n):
            page = doc[i]
            page.render(scale=dpi / 72).to_pil().save(dest / f"page-{i + 1:03d}.png", optimize=True)
            page.close()
    finally:
        doc.close()
    return rendre({"ok": True, "pages": n})


# ── PDF : remplacement et retrait de lignes, par pymupdf ─────────────────────────────────────────


def normal(t):
    t = unicodedata.normalize("NFKC", t or "")
    for a, b in (("’", "'"), ("‘", "'"), ("‐", "-"), ("‑", "-"), ("­", "")):
        t = t.replace(a, b)
    return " ".join(t.split())


def lignes_page(page, pymupdf):
    """Les lignes de la page, telles que pymupdf les découpe, puis regroupées par ligne de base."""
    logiques = []
    for bloc in page.get_text("dict", flags=pymupdf.TEXTFLAGS_TEXT)["blocks"]:
        if bloc.get("type") != 0:
            continue
        for ligne in bloc["lines"]:
            spans = [s for s in ligne["spans"] if s["text"].strip()]
            if not spans:
                continue
            logiques.append(
                {
                    "texte": normal("".join(s["text"] for s in ligne["spans"])),
                    "spans": spans,
                    "bbox": list(ligne["bbox"]),
                    "dir": ligne.get("dir", (1, 0)),
                }
            )
    visuelles = []
    for l in sorted(logiques, key=lambda x: (x["spans"][0]["origin"][1], x["bbox"][0])):
        y = l["spans"][0]["origin"][1]
        h = l["bbox"][3] - l["bbox"][1]
        if visuelles and abs(visuelles[-1]["y"] - y) < 0.4 * max(h, 1):
            visuelles[-1]["parts"].append(l)
        else:
            visuelles.append({"y": y, "parts": [l]})
    groupes = []
    for v in visuelles:
        parts = sorted(v["parts"], key=lambda x: x["bbox"][0])
        groupes.append(
            {
                "texte": normal(" ".join(p["texte"] for p in parts)),
                "spans": [s for p in parts for s in p["spans"]],
                "bbox": [
                    min(p["bbox"][0] for p in parts),
                    min(p["bbox"][1] for p in parts),
                    max(p["bbox"][2] for p in parts),
                    max(p["bbox"][3] for p in parts),
                ],
                "dir": parts[0]["dir"],
                "parts": parts,
            }
        )
    return logiques, groupes


def police_pour(doc, page, span, texte, pymupdf):
    """La police de la ligne si elle porte tous les caractères, sinon la base 14 qui lui ressemble."""
    nom = span["font"].split("+")[-1]
    for ref in page.get_fonts(full=True):
        if ref[3].split("+")[-1] != nom:
            continue
        try:
            _, ext, _, tampon = doc.extract_font(ref[0])
            if tampon and ext not in ("n/a", ""):
                f = pymupdf.Font(fontbuffer=tampon)
                if all(c == " " or f.has_glyph(ord(c)) for c in texte):
                    return f, f"embarquée:{nom}"
        except Exception:  # police illisible ou non réutilisable : la base 14 prend le relais
            pass
    drapeaux = span.get("flags", 0)
    gras = bool(drapeaux & 16) or "bold" in nom.lower()
    italique = bool(drapeaux & 2) or "italic" in nom.lower() or "oblique" in nom.lower()
    if drapeaux & 8 or "cour" in nom.lower() or "mono" in nom.lower():
        code = {(0, 0): "cour", (1, 0): "cobo", (0, 1): "coit", (1, 1): "cobi"}[(int(gras), int(italique))]
    elif drapeaux & 4 or "times" in nom.lower() or "serif" in nom.lower():
        code = {(0, 0): "tiro", (1, 0): "tibo", (0, 1): "tiit", (1, 1): "tibi"}[(int(gras), int(italique))]
    else:
        code = {(0, 0): "helv", (1, 0): "hebo", (0, 1): "heit", (1, 1): "hebi"}[(int(gras), int(italique))]
    f = pymupdf.Font(code)
    manquants = sorted({c for c in texte if c != " " and not f.has_glyph(ord(c))})
    if manquants:
        return None, "caractère sans glyphe : " + "".join(manquants)
    return f, f"base14:{code}"


def mots_page(page):
    return Counter(normal(m[4]) for m in page.get_text("words"))


def cmd_pdf_appliquer(base, modifs_chemin, sortie):
    try:
        import pymupdf
    except ImportError:
        return absent("pymupdf")
    try:
        modifs = json.loads(Path(modifs_chemin).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return rendre({"ok": False, "motif": f"modifs.json illisible : {e}"}, 1)
    doc = pymupdf.open(base)
    refus = []
    par_page = {}
    pris = set()
    lignes = [lignes_page(doc[i], pymupdf) for i in range(len(doc))]
    for m in modifs:
        ancien, nouveau = normal(m["ancien"]), m["nouveau"].strip()
        trouves = [(i, l) for i, (logiques, _) in enumerate(lignes) for l in logiques if l["texte"] == ancien]
        if not trouves:
            trouves = [(i, g) for i, (_, groupes) in enumerate(lignes) for g in groupes if g["texte"] == ancien]
        if not trouves:
            refus.append(f"ancien introuvable : « {m['ancien']} »")
            continue
        if len(trouves) > 1:
            refus.append(f"ancien ambigu, trouvé {len(trouves)} fois : « {m['ancien']} »")
            continue
        i, cible = trouves[0]
        cle = (i, tuple(round(v, 1) for v in cible["bbox"]))
        if cle in pris:
            refus.append(f"ligne modifiée deux fois : « {m['ancien']} »")
            continue
        pris.add(cle)
        if doc[i].rotation or tuple(round(v) for v in cible["dir"]) != (1, 0):
            refus.append(f"page ou ligne tournée, non prise en charge : « {m['ancien']} »")
            continue
        travail = {"ancien": ancien, "nouveau": nouveau, "cible": cible, "police": None}
        if nouveau:
            span = cible["spans"][0]
            police, detail = police_pour(doc, doc[i], span, nouveau, pymupdf)
            if police is None:
                refus.append(f"{detail} : « {nouveau} »")
                continue
            x0 = span["origin"][0]
            largeur = police.text_length(nouveau, fontsize=span["size"])
            if x0 + largeur > doc[i].rect.x1:
                refus.append(f"texte qui dépasse le bord de la page : « {nouveau} » finit à {x0 + largeur:.0f} pt pour une page de {doc[i].rect.x1:.0f} pt")
                continue
            y0, y1 = cible["bbox"][1], cible["bbox"][3]
            for autre in lignes[i][0]:
                if autre["bbox"] == cible["bbox"] or autre in cible.get("parts", []):
                    continue
                recouvre_y = min(y1, autre["bbox"][3]) - max(y0, autre["bbox"][1])
                recouvre_x = min(x0 + largeur, autre["bbox"][2]) - max(x0, autre["bbox"][0])
                if recouvre_y > 0.5 * min(y1 - y0, autre["bbox"][3] - autre["bbox"][1]) and recouvre_x > 1:
                    refus.append(f"texte qui recouvre une autre ligne : « {nouveau} » sur « {autre['texte']} »")
                    break
            travail["police"], travail["police_detail"] = police, detail
        par_page.setdefault(i, []).append(travail)
    if refus:
        doc.close()
        return rendre({"ok": False, "motif": " ; ".join(refus), "refus": refus}, 1)

    attendus = {i: mots_page(doc[i]) for i in par_page}
    for i, travaux in par_page.items():
        page = doc[i]
        for t in travaux:
            x0, y0, x1, y1 = t["cible"]["bbox"]
            marge = (y1 - y0) * 0.25  # le cœur de la ligne : les interlignes serrés se recouvrent
            page.add_redact_annot(pymupdf.Rect(x0, y0 + marge, x1, y1 - marge), fill=False)
            attendus[i] -= Counter(t["ancien"].split())
            attendus[i] += Counter(normal(t["nouveau"]).split())
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
        for t in travaux:
            if not t["nouveau"]:
                continue
            span = t["cible"]["spans"][0]
            ecrivain = pymupdf.TextWriter(page.rect)
            ecrivain.append(span["origin"], t["nouveau"], font=t["police"], fontsize=span["size"])
            ecrivain.write_text(page, color=pymupdf.sRGB_to_pdf(span["color"]))
    doc.save(sortie, garbage=3, deflate=True)
    doc.close()

    relu = pymupdf.open(sortie)
    ecarts = []
    for i, attendu in attendus.items():
        lu = mots_page(relu[i])
        if lu != attendu:
            perdus = list((attendu - lu).elements())[:6]
            surplus = list((lu - attendu).elements())[:6]
            ecarts.append(f"page {i + 1} : mots perdus {perdus}, mots en trop {surplus}")
    relu.close()
    if ecarts:
        Path(sortie).unlink(missing_ok=True)
        return rendre({"ok": False, "motif": "contrôle après application : " + " ; ".join(ecarts)}, 1)
    faits = [t for ts in par_page.values() for t in ts]
    return rendre(
        {
            "ok": True,
            "remplaces": sum(1 for t in faits if t["nouveau"]),
            "retires": sum(1 for t in faits if not t["nouveau"]),
            "polices": sorted({t.get("police_detail", "") for t in faits if t["nouveau"]}),
        }
    )


# ── Aiguillage ───────────────────────────────────────────────────────────────────────────────────


def cmd_dependances():
    etat = {}
    for nom in ("pymupdf", "pypdfium2", "PIL"):
        try:
            __import__(nom)
            etat[nom] = True
        except ImportError:
            etat[nom] = False
    return rendre(etat)


def cmd_texte(chemin, complet):
    ext = Path(chemin).suffix.lower()
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        if ext == ".docx":
            sys.stdout.write(texte_docx(chemin, complet))
        elif ext == ".pdf":
            sys.stdout.write(texte_pdf(chemin))
        else:
            return rendre({"ok": False, "motif": f"format non géré ici : {ext or chemin}"}, 2)
    except ImportError as e:
        return absent(getattr(e, "name", None) or "pypdfium2")
    except Exception as e:  # paquet abîmé, XML mal formé, PDF illisible : refus dit, jamais un texte vide
        sys.stdout.write("")
        sys.stderr.write(f"texte illisible : {e}\n")
        return 1
    return 0


def principal(a):
    usage = "usage : formats.py dependances | texte <f> [--complet] | depaqueter <docx> <d> | rempaqueter <d> <base> <sortie> | pdf-appliquer <base> <modifs> <sortie> | pdf-images <pdf> <d> [--dpi n]"
    if not a:
        sys.stderr.write(usage + "\n")
        return 2
    verbe, reste = a[0], a[1:]
    if verbe == "dependances":
        return cmd_dependances()
    if verbe == "texte" and reste:
        return cmd_texte(reste[0], "--complet" in reste)
    if verbe == "depaqueter" and len(reste) == 2:
        return cmd_depaqueter(*reste)
    if verbe == "rempaqueter" and len(reste) == 3:
        return cmd_rempaqueter(*reste)
    if verbe == "pdf-appliquer" and len(reste) == 3:
        return cmd_pdf_appliquer(*reste)
    if verbe == "pdf-images" and len(reste) >= 2:
        dpi = int(reste[reste.index("--dpi") + 1]) if "--dpi" in reste else 110
        return cmd_pdf_images(reste[0], reste[1], dpi)
    sys.stderr.write(usage + "\n")
    return 2


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
