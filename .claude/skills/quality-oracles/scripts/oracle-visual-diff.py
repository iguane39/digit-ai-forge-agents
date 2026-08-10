#!/usr/bin/env python3
# oracle-visual-diff — Domaine « Régression visuelle (golden diff) » (v1).
# Compare le rendu d'une page HTML à des captures de référence (« goldens ») versionnées :
# capture Playwright/Chromium pleine page aux breakpoints du profil, diff par tolérance de
# canal (PIL — pixelmatch npm non installé : repli déclaré en non_juge, jamais silencieux),
# ratio de pixels divergents jugé contre visual_diff.seuil_ratio du profil.
# Gouvernance des goldens (R5 — anti-gaming) :
#   · golden absent → SKIP motivé, JAMAIS de création automatique pendant un run ;
#   · création/mise à jour uniquement via --accepter, hors boucle : refusée si le dernier
#     verdict de l'historique du fichier est un FAIL de ce domaine (on n'entérine pas un
#     rendu qui vient d'échouer sans re-run) ; journalisée (golden_maj: true) ;
#   · zones dynamiques : masques rectangulaires déclarés dans
#     .oracles-goldens/<fichier>.masques.json ([{x,y,w,h}]), listés en non_juge à chaque run.
# Verdicts : FAIL = divergence > seuil ou dimensions différentes · PASS = goldens concordants
# · SKIP = golden absent / outil de rendu absent. Contrat JSON commun · exit 0/1/2.
import json, os, sys, datetime

# Windows : forcer stdout/stderr en UTF-8 pour ne pas planter (cp1252) à l'impression
# de caractères hors Latin-1 (✅, ①-⑤, tirets cadratins…). Garde-fou si non supporté.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

from pathlib import Path

DOM = "Régression visuelle (golden diff)"
NJ_BASE = [
    "diff PIL par tolérance de canal (pixelmatch non installé — sensibilité anti-aliasing moindre, repli déclaré)",
    "V5/V6 (croisements de flèches, images déformées) couverts seulement en présence d'un golden",
    "sémantique du changement (un diff dit qu'il y a changement, pas s'il est voulu)",
]
args = [a for a in sys.argv[1:]]
file = next((a for a in args if not a.startswith("--")), None)
ACCEPT = "--accepter" in args
prof_path = args[args.index("--profil") + 1] if "--profil" in args else None

def out(verdict, findings, non_juge, code):
    print(json.dumps({"oracle": "oracle-visual-diff", "domaine": DOM, "artefact": file,
                      "verdict": verdict, "findings": findings, "non_juge": non_juge}, ensure_ascii=False))
    sys.exit(code)

if not file or not os.path.isfile(file):
    out("SKIP", [], ["fichier absent"], 2)
if Path(file).suffix.lower() not in (".html", ".htm"):
    out("SKIP", [], ["extension non gérée"], 2)

conf = {"seuil_ratio": 0.001, "breakpoints": [1280, 380], "tolerance_pixel": 24}
if prof_path and os.path.isfile(prof_path):
    try:
        conf = {**conf, **(json.load(open(prof_path)).get("visual_diff") or {})}
    except Exception:
        pass

if not os.environ.get("PLAYWRIGHT_BROWSERS_PATH") and os.path.isdir("/opt/pw-browsers"):
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/opt/pw-browsers"
try:
    from playwright.sync_api import sync_playwright
    from PIL import Image, ImageChops
except Exception as e:
    out("SKIP", [], NJ_BASE + [f"outil de rendu absent ({e.__class__.__name__}) — installer playwright + chromium + pillow"], 2)

fpath = Path(file).resolve()
gdir = fpath.parent / ".oracles-goldens"
mask_path = gdir / (fpath.name + ".masques.json")
masks = []
nj = list(NJ_BASE)
if mask_path.is_file():
    try:
        masks = json.load(open(mask_path))
        nj.append(f"zones masquées ({len(masks)} rect) : {mask_path.name}")
    except Exception:
        nj.append(f"masques illisibles ignorés : {mask_path.name}")

_shots = None
def capture(width):
    global _shots
    if _shots is None:                                   # un seul lancement navigateur par run
        _shots = {}
        with sync_playwright() as p:
            b = p.chromium.launch()
            for w in conf["breakpoints"]:
                pg = b.new_page(viewport={"width": int(w), "height": 800})
                pg.goto(fpath.as_uri())
                pg.wait_for_timeout(150)
                _shots[int(w)] = pg.screenshot(full_page=True)
                pg.close()
            b.close()
    return _shots[int(width)]

def apply_masks(img):
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    for m in masks:
        try:
            d.rectangle([m["x"], m["y"], m["x"] + m["w"], m["y"] + m["h"]], fill=(0, 0, 0))
        except Exception:
            pass
    return img

# ---- --accepter : gouvernance hors boucle (R5) ------------------------------------------------
if ACCEPT:
    histo = fpath.parent / (fpath.name + ".oracles-historique.jsonl")
    if histo.is_file():
        try:
            last = json.loads(histo.read_text().strip().splitlines()[-1])
            if any(str(f).startswith(DOM) for f in last.get("fails", [])):
                out("FAIL", [{"sev": "bloquant", "msg": "--accepter refusé : le dernier run journalisé est un FAIL de ce domaine — corriger puis re-runner avant d'entériner un golden", "where": histo.name}], nj, 1)
        except Exception:
            pass
    gdir.mkdir(exist_ok=True)
    made = []
    for w in conf["breakpoints"]:
        gp = gdir / f"{fpath.name}-w{w}.png"
        gp.write_bytes(capture(w))
        made.append(gp.name)
    with open(fpath.parent / (fpath.name + ".oracles-historique.jsonl"), "a") as h:
        h.write(json.dumps({"date_iso": datetime.datetime.now().isoformat(), "golden_maj": True, "goldens": made}) + "\n")
    out("PASS", [{"sev": "info", "msg": "goldens entérinés (hors boucle) : " + " · ".join(made), "where": str(gdir.name)}], nj, 0)

# ---- run de jugement --------------------------------------------------------------------------
import io
findings, judged, missing = [], 0, []
tol = int(conf["tolerance_pixel"])
for w in conf["breakpoints"]:
    gp = gdir / f"{fpath.name}-w{w}.png"
    if not gp.is_file():
        missing.append(gp.name)
        continue
    cur = apply_masks(Image.open(io.BytesIO(capture(w))).convert("RGB"))
    ref = apply_masks(Image.open(gp).convert("RGB"))
    if cur.size != ref.size:
        findings.append({"sev": "bloquant", "msg": f"dimensions divergentes au breakpoint {w} : rendu {cur.size[0]}x{cur.size[1]} ≠ golden {ref.size[0]}x{ref.size[1]}", "where": gp.name})
        continue
    diff = ImageChops.difference(cur, ref)
    px = diff.load()
    W, H = diff.size
    divergent = sum(1 for y in range(H) for x in range(W) if max(px[x, y]) > tol)
    ratio = divergent / (W * H)
    judged += 1
    if ratio > float(conf["seuil_ratio"]):
        dp = gdir / f"{fpath.name}-w{w}-diff.png"
        diff.point(lambda v: 255 if v > tol else 0).save(dp)
        findings.append({"sev": "bloquant", "msg": f"régression visuelle au breakpoint {w} : {ratio:.4%} de pixels divergents > seuil {float(conf['seuil_ratio']):.4%}", "where": dp.name})
    else:
        findings.append({"sev": "info", "msg": f"breakpoint {w} conforme au golden ({ratio:.4%} ≤ seuil)", "where": gp.name})

if missing:
    nj.append("goldens absents (initialiser hors boucle via --accepter) : " + " · ".join(missing))
bloq = [f for f in findings if f["sev"] == "bloquant"]
if bloq:
    out("FAIL", findings, nj, 1)
if not judged:
    out("SKIP", [], nj, 2)
out("PASS", findings, nj, 0)
