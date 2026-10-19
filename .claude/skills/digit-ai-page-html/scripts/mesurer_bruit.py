#!/usr/bin/env python3
"""mesurer_bruit.py — le taux d'accusation d'une regle du rendu, AVANT et APRES, sur un parc.

LE FAIT PAYE (TF-1225, constat du 14/09/2026). `render_page.py` coute environ 30 s par page. La
mesure de bruit de TF-0847 a porte sur 79 des 471 pages consommatrices, celle de V15 sur 82 : a
ce prix, le parc complet demandait plusieurs heures, et chaque regle neuve du socle se mesurait
sur un echantillon choisi a la main, alors que TF-0965 exige la mesure chez les consommateurs.

CE QUE CE SCRIPT FAIT, en une commande :
  · UN rendu par page et par version de l'outil, PARTAGE entre toutes les familles : le rapport
    JSON de `render_page.py` porte deja toutes les familles, on les compte toutes d'un coup ;
  · un CACHE par empreinte : la cle est sha256(octets de la page + octets de render_page.py et de
    check_html.py de la version jouee + largeurs). Une page inchangee, rejouee avec le meme outil,
    ne se rend pas deux fois — la deuxieme mesure d'une campagne ne coute que les pages modifiees ;
  · les rendus en PARALLELE (`--jobs`, un processus `render_page.py` par page) ;
  · AVANT / APRES : `--avant-ref <ref git>` extrait le socle de cette revision (scripts et
    references) dans un dossier jetable et joue les deux versions sur le meme parc ; la version
    de travail est elle aussi COPIEE au lancement, si bien qu'une edition pendant la mesure ne
    change pas l'outil qui mesure.

Sortie : par famille, le nombre de pages accusees et de constats, avant et apres, le taux
d'accusation (pages accusees / pages mesurees), et la liste des pages NOUVELLEMENT accusees.

CE QU'IL NE JUGE PAS (non_juge, publie a chaque sortie) : l'etat INITIAL de chaque page seulement
(aucun `--etats-ouverts`, aucune matrice), aux seules largeurs demandees ; une page dont le rendu
echoue est comptee a part, jamais comme une page sans constat ; le parc est celui qu'on lui donne
— il ne decouvre pas les consommateurs tout seul.

Usage :
  python mesurer_bruit.py <page|dossier>... [--liste <fichier>] [--familles mot_coupe,v4_overlap] [--widths 1440]
                          [--avant-ref <ref>] [--jobs 4] [--cache <dossier>] [--output json]
Exit : 0 mesure rendue · 2 usage ou aucune page.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Windows : forcer stdout/stderr en UTF-8 pour ne pas planter (cp1252) à l'impression de
# caractères hors Latin-1 (TF-1884 : « → » levait UnicodeEncodeError en console Windows).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

ICI = Path(__file__).resolve().parent
IGNORES = {".git", "node_modules", "__pycache__", ".oracles", "fixtures", "captures"}

NON_JUGE = [
    "seul l'etat INITIAL de chaque page est rendu (aucun --etats-ouverts, aucune matrice) : une "
    "regle qui ne se declenche que dans un etat ouvert n'est pas mesuree ici",
    "seules les largeurs demandees (--widths) sont jouees",
    "une page dont le rendu echoue est comptee dans « echecs », jamais comme une page sans constat",
    "le parc est celui qu'on lui donne : ce script ne decouvre pas les pages consommatrices",
]


def pages_de(entrees: list[str], introuvables: list[str] | None = None) -> list[Path]:
    """Les pages HTML des entrees : un fichier tel quel, un dossier parcouru (hors fixtures).
    Une entree qui n'est ni l'un ni l'autre va dans `introuvables` : elle se DIT, jamais ne
    disparait (mesure du 12/10/2026 : 81 chemins de style /c/... ecartes sans un mot)."""
    vues: dict[str, Path] = {}
    for e in entrees:
        if introuvables is not None and not Path(e).exists():
            introuvables.append(e)
            continue
        p = Path(e)
        if p.is_file() and p.suffix.lower() in (".html", ".htm"):
            vues[str(p.resolve()).lower()] = p.resolve()
        elif p.is_dir():
            for racine, dossiers, fichiers in os.walk(p):
                dossiers[:] = [d for d in dossiers if d not in IGNORES and not d.startswith(".")]
                for f in fichiers:
                    if f.lower().endswith((".html", ".htm")):
                        q = (Path(racine) / f).resolve()
                        vues[str(q).lower()] = q
    return sorted(vues.values())


def empreinte_outil(scripts: Path) -> str:
    h = hashlib.sha256()
    for nom in ("render_page.py", "check_html.py"):
        f = scripts / nom
        h.update(f.read_bytes() if f.exists() else b"")
    return h.hexdigest()


def extraire_ref(ref: str, dest: Path) -> Path:
    """Le socle de la revision `ref` (scripts et references), dans `dest` ; rend son scripts/."""
    skill = ICI.parent
    top = subprocess.run(["git", "-C", str(skill), "rev-parse", "--show-toplevel"],
                         capture_output=True, text=True, check=True).stdout.strip()
    rel = Path(skill).resolve().relative_to(Path(top).resolve()).as_posix()
    archive = dest / "socle.tar"
    subprocess.run(["git", "-C", top, "archive", "--format=tar", "-o", str(archive), ref,
                    f"{rel}/scripts", f"{rel}/references"], check=True, capture_output=True)
    shutil.unpack_archive(str(archive), str(dest))
    return dest / rel / "scripts"


def figer(scripts: Path, dest: Path) -> Path:
    """Une COPIE du socle de travail (scripts et references) : l'outil mesure ce qu'il etait au
    lancement, meme si un fichier est edite pendant la mesure — sinon les pages rendues en fin de
    parc le seraient par une autre version que celle qui a donne sa cle au cache."""
    skill = dest / "socle"
    shutil.copytree(scripts, skill / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(scripts.parent / "references", skill / "references")
    return skill / "scripts"


def rendre(page: Path, scripts: Path, widths: str, cle_outil: str, cache: Path,
           captures: Path) -> dict:
    """Le rapport de `render_page.py` pour cette page, pris au cache s'il y est."""
    cle = hashlib.sha256(page.read_bytes() + cle_outil.encode() + widths.encode()).hexdigest()
    fichier = cache / f"{cle}.json"
    if fichier.exists():
        try:
            return {"cache": True, **json.loads(fichier.read_text(encoding="utf-8"))}
        except Exception:  # noqa: BLE001 — une entree illisible se refait
            pass
    r = subprocess.run([sys.executable, "-X", "utf8", str(scripts / "render_page.py"), str(page),
                        "--widths", widths, "--output", "json", "--out", str(captures)],
                       capture_output=True, text=True, encoding="utf-8")
    try:
        rapport = json.loads(r.stdout)
    except Exception:  # noqa: BLE001
        return {"cache": False, "echec": (r.stderr or r.stdout or "sortie vide")[-300:]}
    resume = {"familles": {}}
    for bp in rapport.get("breakpoints", {}).values():
        for cle_f, val in (bp.get("issues") or {}).items():
            if isinstance(val, list):
                resume["familles"][cle_f] = resume["familles"].get(cle_f, 0) + len(val)
    resume["verdict"] = rapport.get("verdict")
    fichier.write_text(json.dumps(resume, ensure_ascii=False), encoding="utf-8")
    return {"cache": False, **resume}


def mesurer(pages: list[Path], scripts: Path, widths: str, jobs: int, cache: Path) -> dict:
    cle_outil = empreinte_outil(scripts)
    captures = Path(tempfile.mkdtemp(prefix="bruit-captures-"))
    try:
        with ThreadPoolExecutor(max_workers=max(1, jobs)) as ex:
            res = list(ex.map(lambda p: rendre(p, scripts, widths, cle_outil, cache, captures), pages))
    finally:
        shutil.rmtree(captures, ignore_errors=True)
    return {str(p): r for p, r in zip(pages, res)}


def bilan(mesures: dict, familles: list[str] | None) -> dict:
    noms = set()
    for r in mesures.values():
        noms.update((r.get("familles") or {}).keys())
    noms = [f for f in (familles or sorted(noms))]
    mesurees = [p for p, r in mesures.items() if "echec" not in r]
    out = {"pages": len(mesures), "mesurees": len(mesurees),
           "echecs": sorted(p for p, r in mesures.items() if "echec" in r),
           "depuis_cache": sum(1 for r in mesures.values() if r.get("cache")), "familles": {}}
    for f in noms:
        accusees = [p for p in mesurees if (mesures[p].get("familles") or {}).get(f, 0) > 0]
        out["familles"][f] = {
            "pages_accusees": len(accusees),
            "constats": sum((mesures[p].get("familles") or {}).get(f, 0) for p in mesurees),
            "taux": round(len(accusees) / len(mesurees), 4) if mesurees else None,
            "accusees": sorted(accusees),
            "constats_par_page": {p: mesures[p]["familles"][f] for p in sorted(accusees)},
        }
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Taux d'accusation d'une regle du rendu, avant/apres, sur un parc.")
    ap.add_argument("entrees", nargs="*", help="pages HTML ou dossiers (parcourus hors fixtures)")
    ap.add_argument("--liste", type=Path, default=None,
                    help="fichier de chemins, un par ligne (un parc long passe par xargs se decoupe "
                         "en plusieurs appels, donc en plusieurs rapports)")
    ap.add_argument("--familles", default="", help="familles a compter (cles du rapport), toutes par defaut")
    ap.add_argument("--widths", default="1440")
    ap.add_argument("--avant-ref", default=None, dest="avant_ref",
                    help="revision git du socle a jouer AVANT (ex. HEAD~1, un sha)")
    ap.add_argument("--jobs", type=int, default=max(1, min(4, (os.cpu_count() or 2) // 2)))
    ap.add_argument("--cache", type=Path,
                    default=Path(tempfile.gettempdir()) / "digit-ai-page-html-bruit")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    a = ap.parse_args()

    entrees = list(a.entrees)
    if a.liste:
        entrees += [l.strip() for l in a.liste.read_text(encoding="utf-8").splitlines() if l.strip()]
    introuvables: list[str] = []
    pages = pages_de(entrees, introuvables)
    for e in introuvables:
        print(f"entree introuvable, non mesuree : {e}", file=sys.stderr)
    if not pages:
        print("aucune page HTML dans les entrees", file=sys.stderr)
        return 2
    familles = [f.strip() for f in a.familles.split(",") if f.strip()] or None
    a.cache.mkdir(parents=True, exist_ok=True)
    if a.avant_ref:
        # La revision se FIGE au lancement : un `HEAD` lu apres la passe « apres » serait celui d'un
        # commit fait entre-temps (mesure du 12/10/2026 : l'« avant » portait deja la correction).
        a.avant_ref = subprocess.run(["git", "-C", str(ICI), "rev-parse", "--verify", a.avant_ref],
                                     capture_output=True, text=True, check=True).stdout.strip()
    rapport: dict = {"widths": a.widths, "jobs": a.jobs, "cache": str(a.cache), "non_juge": NON_JUGE,
                     "introuvables": introuvables}
    atelier_apres = Path(tempfile.mkdtemp(prefix="bruit-apres-"))
    try:
        rapport["apres"] = bilan(mesurer(pages, figer(ICI, atelier_apres), a.widths, a.jobs, a.cache),
                                 familles)
    finally:
        shutil.rmtree(atelier_apres, ignore_errors=True)
    if a.avant_ref:
        atelier = Path(tempfile.mkdtemp(prefix="bruit-avant-"))
        try:
            scripts_avant = extraire_ref(a.avant_ref, atelier)
            rapport["avant_ref"] = a.avant_ref
            rapport["avant"] = bilan(mesurer(pages, scripts_avant, a.widths, a.jobs, a.cache), familles)
        finally:
            shutil.rmtree(atelier, ignore_errors=True)
        for f, ap_f in rapport["apres"]["familles"].items():
            av_f = rapport["avant"]["familles"].get(f, {"accusees": []})
            ap_f["nouvellement_accusees"] = sorted(set(ap_f["accusees"]) - set(av_f["accusees"]))
            ap_f["plus_accusees"] = sorted(set(av_f["accusees"]) - set(ap_f["accusees"]))

    if a.output == "json":
        print(json.dumps(rapport, ensure_ascii=False, indent=2))
        return 0
    ap_ = rapport["apres"]
    print(f"Parc : {ap_['pages']} page(s), {ap_['mesurees']} mesuree(s), {len(ap_['echecs'])} echec(s) "
          f"de rendu, {ap_['depuis_cache']} reprise(s) du cache — largeurs {a.widths}, {a.jobs} en parallele")
    for f, d in ap_["familles"].items():
        if familles is None and not d["constats"] and not (a.avant_ref and rapport["avant"]["familles"].get(f, {}).get("constats")):
            continue
        ligne = f"  {f:<28} apres : {d['pages_accusees']:>3} page(s) ({d['taux']:.1%}), {d['constats']} constat(s)"
        if a.avant_ref:
            av = rapport["avant"]["familles"].get(f, {"pages_accusees": 0, "constats": 0, "taux": 0.0})
            ligne += (f" · avant : {av['pages_accusees']} page(s) ({(av['taux'] or 0):.1%}), "
                      f"{av['constats']} constat(s) · +{len(d['nouvellement_accusees'])} / "
                      f"-{len(d['plus_accusees'])} page(s)")
        print(ligne)
    for e in ap_["echecs"]:
        print(f"  ECHEC de rendu : {e}")
    print("Non juge :")
    for n in NON_JUGE:
        print(f"  - {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
