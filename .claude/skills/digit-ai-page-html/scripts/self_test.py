#!/usr/bin/env python3
"""
self_test.py — Preuve que les contrôles de lisibilité peuvent échouer.

Un contrôle qui ne peut pas échouer ne prouve rien. Ce script lance
`check_html.check()` sur les fixtures du skill et vérifie que :

  · la fixture VERTE ne déclenche AUCUN échec de lisibilité ;
  · chaque fixture ROUGE déclenche EXACTEMENT la (les) règle(s) attendue(s) —
    ni moins (le contrôle est aveugle), ni plus (le contrôle est bruyant).

Usage :
    python scripts/self_test.py
    python scripts/self_test.py --output json

Code de sortie : 0 si tous les cas passent, 1 sinon.
"""
import argparse
import json
import re
import shutil
import sys

# Windows : forcer stdout/stderr en UTF-8 pour ne pas planter (cp1252) à l'impression
# de caractères hors Latin-1 (✅, ①-⑤, tirets cadratins…). Garde-fou si non supporté.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_html import check  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

# fichier -> règles attendues (ensemble de codes). Ensemble vide = doit passer.
CAS = {
    "lisibilite-verte.html": set(),
    "l1-texte-coupe.html": {"L1"},
    "l1-ponctuation-orpheline.html": {"L1"},
    "l2-largeur-bridee.html": {"L2"},
    "l3-tooltip-vide.html": {"L3"},
    "l3-bareme-absent.html": {"L3"},
    "l4-table-sans-filtre.html": {"L4"},
    "l5-surlignage-casse-mot.html": {"L5"},
    "l5-collision-de-classe.html": {"L5"},
    # Même page, classes disjointes (convention `find-hit` du socle) : L5 doit se taire.
    "l5-classes-separees.html": set(),
    "l6-ancre-morte.html": {"L6"},
    "l6-entree-sans-annonce.html": {"L6"},
    "l7-chapitre-sans-chapeau.html": {"L7"},
    "l8-lien-muet.html": {"L8"},
    # TF-0174 (13/08) : routage SPA par hash — data-nav + script = exempt ; data-nav sans
    # script = liens morts, L8 se déclenche.
    "l8-spa-cablee.html": set(),
    "l8-spa-morte.html": {"L8"},
    "l9-detail-vide.html": {"L9"},
    "l9-depliant-muet.html": {"L9"},
    "l9-depliant-inutile.html": {"L9"},
    "l12-enumeration-en-prose.html": {"L12"},
    "l10-table-sans-mode-emploi.html": {"L10"},
    # Delta n°6 (14/08) : liste ≥ 8 lignes sans champ de recherche statique — L13 seule
    # (data-filterable pose L4 muette, exemple de lecture pose L10 muette).
    "l13-liste-sans-recherche.html": {"L13"},
    "l11-litteral-null.html": {"L11"},
    # TF-0227 (lot SCC_ALX du 14/08) : 71 marqueurs [c:id] dans un livrable DIFFUSE, PASS
    # a tous les oracles du socle. La rouge porte le defaut reel, mot pour mot.
    "l14-plomberie-affichee.html": {"L14"},
    # Les deux sorties legitimes, chacune sa fixture : citer dans du code, ou s exempter
    # AVEC un motif. Sans elles, la regle passerait pour un simple refus de crochets.
    "l14-jetons-cites-en-code.html": set(),
    "l14-exemption-motivee.html": set(),
    "l3-score-sans-formule.html": {"L3"},
    "l3-valeur-opaque.html": {"L3"},
    # TF-0233 (15/08) : un conteneur-valeur dont un DESCENDANT porte la légende est
    # couvert — plus de double échec L3 pour un seul chiffre.
    "l3-conteneur-couvert.html": set(),
}

RE_CODE = re.compile(r"^(L\d+)\b")

# A1 (autonomie réseau, D-10) vit dans la famille « charte » : ses fixtures se
# jugent avec regles="charte" et on n'extrait que les codes A — les deux pages
# sont charte-conformes par construction, seul A1 les départage.
CAS_AUTONOMIE = {
    "a1-cdn-au-chargement.html": {"A1"},
    "a1-liens-documentaires.html": set(),  # liens <a>, xmlns, data: URI : silence exigé
    # RA-1 (SCC_ALX, 13/08) : un </script> en clair dans le commentaire d'un asset inliné
    # tronque le script hôte — le déséquilibre ouvertures/fermetures le trahit.
    "a1bis-script-tronque.html": {"A1-bis"},
}
RE_CODE_A = re.compile(r"^(A\d+(?:-bis)?)\b")

# G1 (bascule thème sombre câblée, R-30/TF-0134) vit lui aussi dans la famille
# « charte » : mêmes garanties anti-parasite que A1. Ensemble vide de FAILS
# n'exclut pas un WARN (cas sans bouton) — seul check() décide, ici on ne juge
# que les codes G en échec bloquant.
# TF-0241 (15/08) : la langue se DÉCLARE — lang="en" assumé passe (avertissement,
# jamais un échec), lang absent échoue. Jugé en famille charte, anti-parasite : la
# fixture verte doit être charte-verte par ailleurs.
CAS_LANG = {
    "charte-lang-en.html": False,     # aucun échec attendu (warn seulement)
    "charte-lang-absent.html": True,  # un échec « lang » attendu, et lui seul
}

CAS_G1 = {
    "g1-bouton-sans-cablage.html": {"G1"},  # bascule morte : bouton présent, jamais câblé
    "g1-bouton-cable.html": set(),          # bascule câblée : silence exigé
    "g1-sans-bouton.html": set(),           # aucun bouton : WARN seulement, jamais un FAIL
}
RE_CODE_G = re.compile(r"^(G\d+)\b")

# AUTOPORTANCE (TF-0303, décidé par l'étude d'opportunité 20260817b — verdict O3) :
# mécanisation des règles A1 (squelette auto-portant), A2/G2 (favicon data:), A3 (charset
# dans les 1024 premiers octets), A4 (titre marque + objet + version datée) et de la
# branche R-30 « clair par défaut STRICT » de G1 (auto-sombre hérité de l'OS interdit
# depuis TF-0158, tranché RV-9). Codes A et G jugés ENSEMBLE : le cas fondateur les cumule,
# et les séparer aurait fait passer un fragment sans en-tête pour un simple défaut de titre.
#
# Cas fondateur (lot Approval2, 17/08) : un rapport d'audit remis à un client, écrit pour
# une publication hébergée — l'hôte fournissait le squelette, le fichier livré n'en avait
# aucun. Quatre règles écrites du socle violées d'un coup, zéro contrôle pour le dire.
CAS_AUTOPORTANCE = {
    "a1-fragment-sans-head.html": {"A1", "A2", "A3", "A4", "G1"},
    "a1-fragment-corrige.html": set(),      # le MÊME contenu, rendu auto-portant
    # La position se mesure en octets, pas en caractères, et le commentaire n'est pas
    # coupable en soi : les deux jumelles ne diffèrent que par l'ordre de trois lignes.
    "a3-charset-tardif.html": {"A3"},
    "a3-charset-en-tete.html": set(),
    "a4-titre-sans-marque.html": {"A4"},    # « Écarts Approval V1 » verbatim
    "a4-titre-sans-version.html": {"A4"},   # marque et objet présents, révision muette
    "a2-favicon-absent.html": {"A2"},
    "a2-favicon-fichier-externe.html": {"A2"},   # déclaré, mais pas embarqué
    # La verte de l'auto-sombre est g1-bouton-cable.html : elle CITE prefers-color-scheme
    # en commentaire pour dire qu'il est retiré — la règle doit y rester muette.
    "g1-auto-sombre-media.html": {"G1"},
}
RE_CODE_AG = re.compile(r"^(A\d+(?:-bis)?|G\d+)\b")

# Cas mesurés AU RENDU : le contrôle statique de L2 lit le CSS du conteneur et ne
# voit pas un paragraphe bridé à l'intérieur. Ces deux-là ne se jugent qu'en
# ouvrant la page dans un navigateur.
CAS_RENDU = {
    "l2r-texte-a-50-pourcent.html": ("l2_width", 1),   # paragraphe bridé
    "l2r-texte-pleine-largeur.html": ("l2_width", 0),  # colonne de mesure
    "l2g-gouttiere-etiquettes.html": ("l2_gouttiere", 1),   # colonne d'étiquettes
    "l2g-etiquettes-en-tete.html": ("l2_gouttiere", 0),     # étiquette en tête
    # V7 : le rythme vertical se mesure au blanc ENTRE les boîtes, pas au pas d'un
    # haut de boîte au suivant. Les deux pages sont identiques à une chose près —
    # un paragraphe hors de l'échelle d'espacement dans la rouge.
    "v7-prose-en-flux.html": ("v7_spacing", 0),   # hauteurs variables, blanc constant
    "v7-rythme-casse.html": ("v7_spacing", 1),    # un paragraphe hors échelle
}


def codes(messages, motif=RE_CODE):
    out = set()
    for m in messages:
        c = motif.match(m)
        if c:
            out.add(c.group(1))
    return out


def run():
    resultats = []
    for nom, attendu in CAS.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="L")
        obtenu = codes(fails)
        ok = obtenu == attendu
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu),
            "detail": "" if ok else " | ".join(fails)[:400],
        })
    for nom, attendu in CAS_AUTONOMIE.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        obtenu = codes(fails, RE_CODE_A)
        # une fixture A doit aussi être charte-verte : un échec charte parasite
        # rendrait le cas trompeur (on croirait tester A1, on testerait la charte).
        parasites = [f for f in fails if not RE_CODE_A.match(f)]
        ok = obtenu == attendu and not parasites
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu),
            "detail": "" if ok else " | ".join(fails + parasites)[:400],
        })
    for nom, echec_lang_attendu in CAS_LANG.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE",
                              "attendu": ["lang" if echec_lang_attendu else "(aucun)"],
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        fails_lang = [f for f in fails if "lang" in f.lower()]
        parasites = [f for f in fails if f not in fails_lang]
        ok = (bool(fails_lang) == echec_lang_attendu) and not parasites
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": ["lang"] if echec_lang_attendu else [],
            "obtenu": (["lang"] if fails_lang else []) + parasites,
            "detail": "" if ok else " | ".join(fails)[:400],
        })
    for nom, attendu in CAS_AUTOPORTANCE.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        obtenu = codes(fails, RE_CODE_AG)
        # Même garde anti-parasite que A1 et G1 : un échec de charte NON codé (h1 absent,
        # :root manquant, @media print oublié) rendrait le cas trompeur — on croirait
        # mesurer l'autoportance, on mesurerait un oubli de gabarit.
        parasites = [f for f in fails if not RE_CODE_AG.match(f)]
        ok = obtenu == attendu and not parasites
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu),
            "detail": "" if ok else " | ".join(fails + parasites)[:400],
        })
    for nom, attendu in CAS_G1.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        obtenu = codes(fails, RE_CODE_G)
        # même garde anti-parasite que A1 : un échec charte étranger rendrait le
        # cas trompeur (on croirait tester G1, on testerait autre chose).
        parasites = [f for f in fails if not RE_CODE_G.match(f)]
        ok = obtenu == attendu and not parasites
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu),
            "detail": "" if ok else " | ".join(fails + parasites)[:400],
        })
    return resultats


def run_rendu():
    """Rejoue les cas de largeur au rendu. Silencieux si playwright est absent."""
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import json as _json
    import subprocess
    import tempfile
    out = []
    # Les captures partent dans un dossier jetable (--out, TF-0058) : le dossier des
    # fixtures n'a pas à héberger les PNG de son propre auto-test.
    captures = tempfile.mkdtemp(prefix="self-test-render-")
    for nom, (cle, attendu) in CAS_RENDU.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            out.append({"fixture": nom, "verdict": "ABSENTE", "attendu": attendu,
                        "obtenu": 0, "detail": "fixture manquante"})
            continue
        r = subprocess.run(
            [sys.executable, "-X", "utf8",
             str(Path(__file__).resolve().parent / "render_page.py"),
             str(chemin), "--widths", "1440", "--output", "json", "--out", captures],
            capture_output=True, text=True, encoding="utf-8")
        try:
            d = _json.loads(r.stdout)
            n = len(d["breakpoints"]["1440"]["issues"][cle])
        except Exception:
            out.append({"fixture": nom, "verdict": "ECHEC", "attendu": attendu,
                        "obtenu": 0, "detail": "render_page illisible"})
            continue
        ok = (n >= attendu) if attendu else (n == 0)
        out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                    "attendu": attendu, "obtenu": n, "regle": cle,
                    "detail": "" if ok else f"{n} constat(s) {cle} au rendu"})
    shutil.rmtree(captures, ignore_errors=True)
    return out


def main():
    ap = argparse.ArgumentParser(description="Auto-test des règles de lisibilité L1-L10.")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    args = ap.parse_args()

    res = run()
    rendu = run_rendu()
    if rendu:
        res += rendu
    rates = [r for r in res if r["verdict"] != "OK"]

    if args.output == "json":
        print(json.dumps({"total": len(res), "echecs": len(rates), "cas": res},
                         ensure_ascii=False, indent=2))
    else:
        print("self-test — fixtures de lisibilité du skill digit-ai-page-html\n")
        for r in res:
            marque = "OK  " if r["verdict"] == "OK" else "ECHEC"
            att = (",".join(r["attendu"]) if isinstance(r["attendu"], list)
                   else f'{r.get("regle", "rendu")} ×{r["attendu"]}') or "(aucune règle)"
            obt = (",".join(r["obtenu"]) if isinstance(r["obtenu"], list)
                   else f'×{r["obtenu"]}') or "(aucune)"
            print(f"  [{marque}] {r['fixture']:<34} attendu {att:<12} obtenu {obt}")
            if r["detail"]:
                print(f"          {r['detail']}")
        print(f"\n{len(res) - len(rates)}/{len(res)} cas passés")

    sys.exit(1 if rates else 0)


if __name__ == "__main__":
    main()
