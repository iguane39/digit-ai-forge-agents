#!/usr/bin/env python3
"""skill_audit_baseline.py — Baseline de non-régression + délégation conformité.

Générique : fonctionne sur N'IMPORTE QUEL dossier de skill (argument positionnel ;
défaut = le skill parent de ce script).

Orchestre, SANS les recoder, les trois validators canoniques de `write-a-skill`
(source unique de vérité, anti-drift) :

  1. skill_description_validator.py   — description <= 1024 + trigger explicite
  2. skill_structure_validator.py     — SKILL.md < 100 lignes, refs one-level-deep
  3. skill_review_checklist_runner.py — checklist 6/6 de Matt Pocock

Ajoute deux contrôles que ces validators ne couvrent PAS :

  - LINK INTEGRITY : tout fichier cité dans SKILL.md (liens markdown `references/…`
    ET chemins `scripts/…` mentionnés dans le texte/les blocs) doit exister.
    C'est le garde-fou qui attrape une méthodo référencée mais manquante.
  - BASELINE SNAPSHOT : empreinte déterministe (déclencheurs, exclusions, sections,
    ressources) à comparer avant/après la passe — filet anti-régression.

Stdlib uniquement. Déterministe. Aucun appel LLM.

Usage :
    python skill_audit_baseline.py <dossier-skill>
    python skill_audit_baseline.py <dossier-skill> --output json
    python skill_audit_baseline.py <dossier-skill> --baseline before.json   # compare
"""

import argparse
import json
import os
import re
import subprocess
import sys
from typing import Any, Dict, List

# Les validators canoniques vivent dans write-a-skill. On les localise sans les copier.
WRITE_A_SKILL_CANDIDATES = [
    "/mnt/skills/user/write-a-skill/scripts",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "write-a-skill", "scripts"),
]


def find_validators_dir() -> str:
    for cand in WRITE_A_SKILL_CANDIDATES:
        if os.path.isfile(os.path.join(cand, "skill_review_checklist_runner.py")):
            return os.path.abspath(cand)
    return ""


def run_validator(script: str, target: str) -> Dict[str, Any]:
    """Appelle un validator en sous-processus et récupère son verdict JSON + exit code."""
    try:
        proc = subprocess.run(
            [sys.executable, script, target, "--output", "json"],
            capture_output=True, text=True, timeout=60,
        )
    except Exception as exc:  # noqa: BLE001
        return {"ran": False, "error": str(exc), "exit": None}
    try:
        payload = json.loads(proc.stdout) if proc.stdout.strip() else None
    except json.JSONDecodeError:
        payload = None
    return {"ran": True, "exit": proc.returncode, "passed": proc.returncode == 0, "report": payload}


def read_skill_md(folder: str) -> str:
    path = os.path.join(folder, "SKILL.md")
    if not os.path.isfile(path):
        return ""
    with open(path, encoding="utf-8") as fh:
        return fh.read()


# ---- LINK INTEGRITY ---------------------------------------------------------

MD_LINK = re.compile(r"\]\(([^)]+)\)")
BARE_PATH = re.compile(r"\b((?:scripts|references|templates|assets)/[\w./-]+\.\w+)")


def cited_resources(text: str) -> List[str]:
    found = set()
    for m in MD_LINK.finditer(text):
        link = m.group(1).strip()
        if link.startswith(("http://", "https://", "#", "mailto:")):
            continue
        found.add(link.split("#", 1)[0])
    for m in BARE_PATH.finditer(text):
        found.add(m.group(1))
    return sorted(p for p in found if p)


def check_link_integrity(folder: str, text: str) -> Dict[str, Any]:
    missing, present = [], []
    for rel in cited_resources(text):
        (present if os.path.isfile(os.path.join(folder, rel)) else missing).append(rel)
    return {"present": present, "missing": missing, "passed": not missing}


# ---- BASELINE SNAPSHOT ------------------------------------------------------

def extract_triggers(text: str) -> List[str]:
    hits = []
    for m in re.finditer(r"(?:use when|déclench\w+|trigger)", text, re.IGNORECASE):
        hits.append(text[m.start():m.start() + 80].replace("\n", " ").strip())
    return hits


def snapshot(folder: str, text: str) -> Dict[str, Any]:
    sections = re.findall(r"^#{1,3}\s+(.+)$", text, re.MULTILINE)
    resources = sorted(
        os.path.relpath(os.path.join(r, f), folder)
        for r, _d, fs in os.walk(folder) for f in fs
    )
    return {
        "sections": sections,
        "triggers_count": len(extract_triggers(text)),
        "exclusions_present": bool(re.search(r"ne pas déclencher|not (?:trigger|use)", text, re.IGNORECASE)),
        "resources": resources,
    }


def diff_baseline(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    lost_sections = [s for s in before.get("sections", []) if s not in after.get("sections", [])]
    lost_resources = [r for r in before.get("resources", []) if r not in after.get("resources", [])]
    trigger_drop = before.get("triggers_count", 0) - after.get("triggers_count", 0)
    return {
        "regressed": bool(lost_sections or lost_resources or trigger_drop > 0),
        "lost_sections": lost_sections,
        "lost_resources": lost_resources,
        "trigger_count_delta": after.get("triggers_count", 0) - before.get("triggers_count", 0),
    }


# ---- ORCHESTRATION ----------------------------------------------------------

def audit(folder: str, baseline_path: str = "") -> Dict[str, Any]:
    folder = os.path.abspath(folder)
    text = read_skill_md(folder)
    skill_md = os.path.join(folder, "SKILL.md")
    vdir = find_validators_dir()

    validators: Dict[str, Any] = {}
    if vdir:
        validators["description"] = run_validator(os.path.join(vdir, "skill_description_validator.py"), skill_md)
        validators["structure"] = run_validator(os.path.join(vdir, "skill_structure_validator.py"), folder)
        validators["checklist_6_6"] = run_validator(os.path.join(vdir, "skill_review_checklist_runner.py"), folder)
    else:
        validators["error"] = "write-a-skill validators introuvables — conformité non déléguable"

    links = check_link_integrity(folder, text)
    snap = snapshot(folder, text)

    regression = None
    if baseline_path and os.path.isfile(baseline_path):
        with open(baseline_path, encoding="utf-8") as fh:
            before = json.load(fh).get("snapshot", {})
        regression = diff_baseline(before, snap)

    delegated_ok = (
        all(validators.get(k, {}).get("passed") for k in ("description", "structure", "checklist_6_6"))
        if vdir else False
    )
    overall = bool(delegated_ok and links["passed"] and (regression is None or not regression["regressed"]))

    return {
        "folder": folder,
        "validators": validators,
        "link_integrity": links,
        "snapshot": snap,
        "regression": regression,
        "overall": "PASS" if overall else "FAIL",
    }


def render_text(result: Dict[str, Any]) -> str:
    lines = ["=" * 72, "SKILL AUDIT BASELINE", f"Folder: {result['folder']}", "=" * 72, ""]
    v = result["validators"]
    lines.append("Conformité déléguée (write-a-skill — source unique de vérité) :")
    for key in ("description", "structure", "checklist_6_6"):
        if key in v:
            lines.append(f"  [{'PASS' if v[key].get('passed') else 'FAIL'}] {key}")
    if "error" in v:
        lines.append(f"  [WARN] {v['error']}")
    li = result["link_integrity"]
    lines += ["", f"[{'PASS' if li['passed'] else 'FAIL'}] link_integrity — "
              f"{len(li['present'])} présentes, {len(li['missing'])} manquantes"]
    for m in li["missing"]:
        lines.append(f"        ✗ MANQUANT (load-bearing ?) : {m}")
    reg = result["regression"]
    if reg is not None:
        lines.append(f"[{'FAIL' if reg['regressed'] else 'PASS'}] non_regression — "
                     f"delta triggers={reg['trigger_count_delta']}")
        for s in reg["lost_sections"]:
            lines.append(f"        ✗ section perdue : {s}")
        for r in reg["lost_resources"]:
            lines.append(f"        ✗ ressource perdue : {r}")
    lines += ["", "-" * 72, f"Verdict baseline : {result['overall']}"]
    return "\n".join(lines)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("folder", nargs="?",
                   default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."),
                   help="Dossier du skill à auditer (défaut : skill parent de ce script)")
    p.add_argument("--output", choices=("text", "json"), default="text")
    p.add_argument("--baseline", default="", help="Snapshot JSON antérieur à comparer (anti-régression)")
    args = p.parse_args()

    result = audit(args.folder, args.baseline)
    print(json.dumps(result, ensure_ascii=False, indent=2) if args.output == "json" else render_text(result))
    return 0 if result["overall"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
