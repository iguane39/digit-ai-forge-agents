#!/usr/bin/env python
# banc-ocr.py — compare les moteurs d'OCR sur des pages françaises, sans publier une seule page.
# Le choix du moteur se fait sur ce banc, jamais sur un chiffre de la littérature : aucune source
# lue ne compare ces moteurs sur des documents français (étude 20261030a, section 3).
#
#   python banc-ocr.py preparer --liste pages.json --dossier <banc>
#   python banc-ocr.py jouer    --dossier <banc> [--claude lectures.json] [--tessdata <dossier>]
#   python banc-ocr.py rapport  --dossier <banc> --sortie resultats.json
#
# pages.json : [{"pdf": "...", "page": 3, "groupe": "natif"|"scan"}]. Cette liste, les images et les
# textes vivent HORS DES DÉPÔTS : ce sont de vrais documents. Le rapport ne porte que des agrégats.
#   - groupe natif : vraie mise en page, numérisation SIMULÉE, vérité = la couche de texte du PDF ;
#   - groupe scan  : vrai scan, pas de vérité, seul l'accord entre moteurs se mesure.
# Moteurs : windows (ocr-windows.ps1), tesseract (tesserocr ou binaire), claude (lectures en aveugle,
# {image: texte}, faites par un agent à qui ni la vérité ni les autres lectures ne sont données).
# Mesures : mots retrouvés (F1 sur le multiensemble, insensible à l'ordre de lecture), taux d'erreur
# de caractères, nombres et mots accentués retrouvés, durée par page.
import argparse
import collections
import io
import json
import os
import random
import re
import subprocess
import sys
import time
import unicodedata

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

VARIANTES = {
    # Numérisation correcte : 200 ppp, léger biais, légère compression.
    "scan_propre": {"dpi": 200, "angle": 0.4, "flou": 0.3, "bruit": 0.0005, "qualite": 80, "voile": 0},
    # Numérisation dégradée : 150 ppp, biais visible, flou, mouchetis, compression forte, fond gris.
    "scan_abime": {"dpi": 150, "angle": 1.5, "flou": 0.7, "bruit": 0.004, "qualite": 45, "voile": 28},
}


def preparer(a):
    import pypdfium2 as pdfium
    from PIL import Image, ImageFilter
    with open(a.liste, encoding="utf-8") as f:
        liste = json.load(f)
    os.makedirs(a.dossier, exist_ok=True)
    random.seed(39)
    corpus = []
    for k, item in enumerate(liste, 1):
        doc = pdfium.PdfDocument(item["pdf"])
        page = doc[int(item["page"]) - 1]
        if item["groupe"] == "scan":
            p = os.path.join(a.dossier, f"s{k:03d}.png")
            page.render(scale=200 / 72, may_draw_forms=False, grayscale=True).to_pil().convert("L").save(p)
            corpus.append({"image": p, "groupe": "scan"})
        else:
            verite = os.path.join(a.dossier, f"n{k:03d}.verite.txt")
            with open(verite, "w", encoding="utf-8") as f:
                f.write(page.get_textpage().get_text_bounded())
            for nom, v in VARIANTES.items():
                img = page.render(scale=v["dpi"] / 72, may_draw_forms=False, grayscale=True).to_pil().convert("L")
                img = img.rotate(v["angle"], fillcolor=255, resample=Image.BICUBIC).filter(ImageFilter.GaussianBlur(v["flou"]))
                if v["voile"]:
                    img = img.point(lambda x: max(0, x - v["voile"]))
                px = img.load()
                for _ in range(int(img.width * img.height * v["bruit"])):
                    px[random.randrange(img.width), random.randrange(img.height)] = random.choice((0, 255))
                tampon = io.BytesIO()
                img.save(tampon, format="JPEG", quality=v["qualite"])
                tampon.seek(0)
                p = os.path.join(a.dossier, f"n{k:03d}-{nom}.png")
                Image.open(tampon).save(p)
                corpus.append({"image": p, "groupe": nom, "verite": verite})
        doc.close()
    with open(os.path.join(a.dossier, "corpus.json"), "w", encoding="utf-8") as f:
        json.dump(corpus, f, ensure_ascii=False, indent=1)
    print(f"{len(corpus)} images préparées")


def jouer(a):
    with open(os.path.join(a.dossier, "corpus.json"), encoding="utf-8") as f:
        corpus = json.load(f)
    images = [c["image"] for c in corpus]
    lectures = {}
    liste = os.path.join(a.dossier, "liste.json")
    sortie = os.path.join(a.dossier, "windows.json")
    with open(liste, "w", encoding="utf-8") as f:
        json.dump(images, f)
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(ICI, "ocr-windows.ps1"), liste, sortie], capture_output=True, text=True, errors="replace")
    if r.returncode == 0:
        with open(sortie, encoding="utf-8-sig") as f:
            lectures["windows"] = {x["chemin"]: {"texte": x["texte"] or "", "ms": x["ms"]} for x in json.load(f)}
    else:
        print("windows indisponible :", r.stderr[-200:], file=sys.stderr)
    try:
        import tesserocr
        from PIL import Image
        res = {}
        with tesserocr.PyTessBaseAPI(path=a.tessdata, lang="fra") as api:
            for p in images:
                t0 = time.time()
                api.SetImage(Image.open(p))
                res[p] = {"texte": api.GetUTF8Text(), "ms": int((time.time() - t0) * 1000)}
        lectures["tesseract"] = res
    except Exception as e:
        print("tesseract indisponible :", e, file=sys.stderr)
    if a.claude:
        with open(a.claude, encoding="utf-8") as f:
            lectures["claude"] = {k: {"texte": v, "ms": None} for k, v in json.load(f).items()}
    with open(os.path.join(a.dossier, "lectures.json"), "w", encoding="utf-8") as f:
        json.dump(lectures, f, ensure_ascii=False)
    print({m: len(v) for m, v in lectures.items()})


def jetons(t):
    return re.findall(r"[^\W_]+(?:['’.,/-][^\W_]+)*", unicodedata.normalize("NFC", t))


def f1(ref, lu):
    a, b = collections.Counter(ref), collections.Counter(lu)
    commun = sum((a & b).values())
    if not ref and not lu:
        return 1.0
    if not commun:
        return 0.0
    p, r = commun / sum(b.values()), commun / sum(a.values())
    return 2 * p * r / (p + r)


def rappel(ref, lu):
    a, b = collections.Counter(ref), collections.Counter(lu)
    return (sum((a & b).values()) / sum(a.values())) if a else None


def a_accent(j):
    return any(unicodedata.combining(c) for c in unicodedata.normalize("NFD", j))


def moyenne(v):
    v = [x for x in v if x is not None]
    return round(sum(v) / len(v), 4) if v else None


def mediane(v):
    v = sorted(x for x in v if x is not None)
    return v[len(v) // 2] if v else None


def rapport(a):
    from rapidfuzz.distance import Levenshtein
    with open(os.path.join(a.dossier, "corpus.json"), encoding="utf-8") as f:
        corpus = json.load(f)
    with open(os.path.join(a.dossier, "lectures.json"), encoding="utf-8") as f:
        lectures = json.load(f)
    lignes = collections.defaultdict(list)
    accord = collections.defaultdict(list)
    for c in corpus:
        p = c["image"]
        if c.get("verite"):
            with open(c["verite"], encoding="utf-8") as f:
                verite = f.read()
            rj = jetons(verite)
            for m, lu in lectures.items():
                if p not in lu:
                    continue
                j = jetons(lu[p]["texte"])
                rapproche = " ".join(lu[p]["texte"].split())
                ref = " ".join(verite.split())
                lignes[(c["groupe"], m)].append({
                    "f1": f1(rj, j),
                    "cer": Levenshtein.distance(ref, rapproche) / max(len(ref), 1),
                    "nombres": rappel([x for x in rj if any(k.isdigit() for k in x)], [x for x in j if any(k.isdigit() for k in x)]),
                    "accents": rappel([x for x in rj if a_accent(x)], [x for x in j if a_accent(x)]),
                    "ms": lu[p]["ms"],
                })
        else:
            moteurs = [m for m in lectures if p in lectures[m]]
            for i, m1 in enumerate(moteurs):
                for m2 in moteurs[i + 1:]:
                    accord[f"{m1}~{m2}"].append(f1(jetons(lectures[m1][p]["texte"]), jetons(lectures[m2][p]["texte"])))
            for m in moteurs:
                lignes[(c["groupe"], m)].append({"ms": lectures[m][p]["ms"], "mots": len(jetons(lectures[m][p]["texte"]))})
    res = {"images": len(corpus), "par_groupe": {}, "accord_scans_reels": {k: {"n": len(v), "f1_moyen": moyenne(v), "f1_min": round(min(v), 4)} for k, v in accord.items()}}
    for (g, m), v in sorted(lignes.items()):
        res["par_groupe"].setdefault(g, {})[m] = {
            "n": len(v), "mots_f1": moyenne([x.get("f1") for x in v]), "cer": moyenne([x.get("cer") for x in v]),
            "nombres": moyenne([x.get("nombres") for x in v]), "accents": moyenne([x.get("accents") for x in v]),
            "ms_median": mediane([x.get("ms") for x in v]), "mots_median": mediane([x.get("mots") for x in v]),
        }
    with open(a.sortie, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False, indent=1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    s = ap.add_subparsers(dest="cmd", required=True)
    p = s.add_parser("preparer")
    p.add_argument("--liste", required=True)
    p.add_argument("--dossier", required=True)
    j = s.add_parser("jouer")
    j.add_argument("--dossier", required=True)
    j.add_argument("--claude")
    j.add_argument("--tessdata")
    r = s.add_parser("rapport")
    r.add_argument("--dossier", required=True)
    r.add_argument("--sortie", required=True)
    a = ap.parse_args()
    {"preparer": preparer, "jouer": jouer, "rapport": rapport}[a.cmd](a)


if __name__ == "__main__":
    main()
