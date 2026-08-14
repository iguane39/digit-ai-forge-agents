#!/usr/bin/env python
"""test_existence — pas 3 du protocole la-barre.

Prouve qu'une reference candidate est ATTEIGNABLE et INSPECTABLE maintenant :
URL -> requete HTTP (statut < 400, corps non vide) ; chemin local -> fichier
existant, lisible, non vide. Un candidat en FAIL est elimine du jeu de barres :
il ne produit pas un « a verifier ».

NE JUGE PAS la legitimite, la pertinence ni la qualite de la reference
-> declares en non_juge.

Contrat de sortie : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]}.
Exit 0=PASS, 1=FAIL, 2=SKIP.

Usage :
  python test_existence.py <ref> [<ref>...]
  python test_existence.py --liste <fichier>   # une reference par ligne, # = commentaire
"""
import sys, os, json

DOM = "Existence et inspectabilite d'une reference (barre)"
NON_JUGE = [
    "la legitimite de la reference (etalonnage de niveau vs copie) — pas 4 du protocole",
    "la pertinence de la reference pour la cible — pas 5, validation humaine",
    "la qualite intrinseque de la reference",
    "le rendu visuel de la reference (voir render_page.py de digit-ai-page-html)",
]
TIMEOUT = 15
UA = "Mozilla/5.0 (compatible; la-barre/1.0; +test_existence)"


def emit(verdict, findings=None, artefact=None):
    sys.stdout.write(json.dumps({
        "oracle": "test_existence", "domaine": DOM, "artefact": artefact or [],
        "verdict": verdict, "findings": findings or [], "non_juge": NON_JUGE,
    }, ensure_ascii=False, indent=2))
    sys.stdout.write("\n")
    sys.exit(1 if verdict == "FAIL" else 2 if verdict == "SKIP" else 0)


def check_url(ref):
    import urllib.request, urllib.error
    req = urllib.request.Request(ref, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read(65536)
            status, ctype = r.status, (r.headers.get("Content-Type") or "?").split(";")[0]
    except urllib.error.HTTPError as e:
        return False, {"sev": "bloquant", "ref": ref, "msg": "HTTP %s" % e.code}
    except Exception as e:
        return False, {"sev": "bloquant", "ref": ref, "msg": "injoignable : %s" % type(e).__name__}
    if status >= 400:
        return False, {"sev": "bloquant", "ref": ref, "msg": "HTTP %s" % status}
    if not body.strip():
        return False, {"sev": "bloquant", "ref": ref, "msg": "corps vide"}
    return True, {"sev": "info", "ref": ref, "msg": "HTTP %s · %s · %s+ octets" % (status, ctype, len(body))}


def check_path(ref):
    if not os.path.exists(ref):
        return False, {"sev": "bloquant", "ref": ref, "msg": "chemin inexistant"}
    if not os.path.isfile(ref):
        return False, {"sev": "bloquant", "ref": ref, "msg": "n'est pas un fichier"}
    size = os.path.getsize(ref)
    if size == 0:
        return False, {"sev": "bloquant", "ref": ref, "msg": "fichier vide"}
    if not os.access(ref, os.R_OK):
        return False, {"sev": "bloquant", "ref": ref, "msg": "fichier illisible"}
    return True, {"sev": "info", "ref": ref, "msg": "fichier local · %s octets" % size}


def main():
    args = sys.argv[1:]
    if args and args[0] == "--liste":
        if len(args) < 2 or not os.path.isfile(args[1]):
            emit("SKIP", [{"sev": "info", "msg": "fichier de liste absent"}])
        with open(args[1], encoding="utf-8") as f:
            refs = [l.strip() for l in f if l.strip() and not l.lstrip().startswith("#")]
    else:
        refs = [a for a in args if a.strip()]
    if not refs:
        emit("SKIP", [{"sev": "info", "msg": "aucune reference fournie"}])

    findings, ok = [], 0
    for ref in refs:
        passed, f = (check_url if ref.lower().startswith(("http://", "https://")) else check_path)(ref)
        findings.append(f)
        ok += 1 if passed else 0
    verdict = "PASS" if ok == len(refs) else "FAIL"
    findings.insert(0, {"sev": "info", "msg": "%s/%s reference(s) atteignable(s)" % (ok, len(refs))})
    emit(verdict, findings, refs)


if __name__ == "__main__":
    main()
