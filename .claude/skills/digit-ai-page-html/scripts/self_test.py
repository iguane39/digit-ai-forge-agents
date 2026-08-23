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
import subprocess
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
    # TF-0488 (22/08) — le SUJET d un selecteur est son DERNIER composant. La verte porte
    # `a.kpi .kpi-label{display:flex}`, `li.item > .badge{display:block}` et
    # `.carte + .carte .titre{display:grid}` : avec la lecture au PREMIER composant, elle
    # rendait 3 faux L1 sur des phrases parfaitement formees (mesure du 22/08). La rouge garde
    # le meme CSS et y ajoute une vraie ponctuation orpheline : la regle doit encore mordre.
    "l1-selecteur-descendant-vert.html": set(),
    "l1-selecteur-descendant-rouge.html": {"L1"},
    # TF-0517 (22/08) — retour DIRECT du client : « je ne sais pas ce qu est E2 ». Un renvoi code
    # porte son sens la ou on le lit. La verte emploie la bonne pratique qui existait DEJA dans le
    # rapport HTML du meme projet : une infobulle qui developpe le code, plus son ancre de
    # definition. Elle ne passait nulle part ailleurs, faute d etre ecrite.
    "l18-identifiant-muet.html": {"L18"},
    "l18-identifiant-glose.html": set(),
    # TF-0492 (22/08) — `overflow-wrap: anywhere` est necessaire sur un chemin, ravageur sur de
    # la prose. La verte le reserve a `code`, `pre` et aux classes qui disent leur usage technique.
    "l19-coupure-en-prose.html": {"L19"},
    "l19-coupure-reservee-au-technique.html": set(),
    # TF-0495 (22/08) — la frontiere entre « le contenu est PRESENT » et « le contenu est
    # EXPLOITABLE ». Un document embarque en texte brut passait TOUS les oracles ; il a fallu que
    # le client le redemande DEUX FOIS pour qu'une vue lisible soit produite. Les trois fixtures
    # portent le MEME bloc de 95 lignes : sans alternative, avec une bascule cablee, et avec le
    # motif declare — parce que ce qui est delibere se declare et ce qui est subi se corrige.
    "l20-brut-sans-alternative.html": {"L20"},
    "l20-brut-avec-bascule.html": set(),
    "l20-brut-declare.html": set(),
    # TF-0521 (23/08) — un composant DECLARE sans style est invisible aux DEUX oracles : celui du
    # MARQUAGE trouve la classe et s'arrete la, celui du RENDU ne voit rien tant que rien ne deborde.
    # Mesure : deux squelettes de la bibliotheque portaient un sommaire annonce et non style, il se
    # rendait en liste numerotee nue — vu seulement en comparant a un livrable REEL. La rouge est la
    # fixture verte AVEC LE SEUL BLOC DE STYLE DU SOMMAIRE RETIRE : une difference, une regle.
    "l21-composant-sans-style.html": {"L21"},
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
    # 22/08 — la MÊME page, sa zone de contenu déclarée citée (data-cite) : L12 se tait.
    # Doctrine TF-0436 étendue : un oracle de forme ne juge pas un texte que la page n'a pas
    # écrit. Cas réel : la page du registre TODO rend le contenu des candidatures.
    "l12-enumeration-citee.html": set(),
    "l10-table-sans-mode-emploi.html": {"L10"},
    # Delta n°6 (14/08) : liste ≥ 8 lignes sans champ de recherche statique — L13 seule
    # (data-filterable pose L4 muette, exemple de lecture pose L10 muette).
    "l13-liste-sans-recherche.html": {"L13"},
    "l11-litteral-null.html": {"L11"},
    # TF-0227 (lot Produit-10 du 14/08) : 71 marqueurs [c:id] dans un livrable DIFFUSE, PASS
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
    # Lot Client-B 20260820a/b (21/08) — TF-0423 : L7 refuse le chapeau répété, le chapeau de
    # remplissage ; L10 refuse l'exemple de lecture en double. TF-0433 : « note » n'est un score
    # que suivi d'un chiffre — la carte-remarque se tait, la note chiffrée échoue. TF-0434 : un
    # libellé-identifiant sans title est elliptique (échec nommé), avec title il passe.
    # TF-0425/TF-0432 : onglets et lignes dépliables — rouge sans câblage, verte conforme.
    "l7-chapeaux-identiques.html": {"L7"},
    "l7-chapeau-remplissage.html": {"L7"},
    "l10-exemple-double.html": {"L10"},
    "l3-note-encadre.html": set(),
    "l3-note-chiffree.html": {"L3"},
    "l8-identifiant-sans-title.html": {"L8"},
    "l8-identifiant-avec-title.html": set(),
    "l16-onglets-sans-controls.html": {"L16"},
    "l16-onglets-conformes.html": set(),
    "l17-depliant-sans-bouton.html": {"L17"},
    "l17-depliant-conforme.html": set(),
}

# TF-0435 : L15 est un AVERTISSEMENT — jugé à part, sur les warns. La verte emploie un chevron
# sûr (U+203A), la rouge le triangle U+25B6 qui sortait en tofu sur mobile.
CAS_AVERT = {
    "l15-glyphe-hors-liste.html": {"L15"},
    "l15-glyphe-sur.html": set(),
}

RE_CODE = re.compile(r"^(L\d+)\b")

# A1 (autonomie réseau, D-10) vit dans la famille « charte » : ses fixtures se
# jugent avec regles="charte" et on n'extrait que les codes A — les deux pages
# sont charte-conformes par construction, seul A1 les départage.
CAS_AUTONOMIE = {
    "a1-cdn-au-chargement.html": {"A1"},
    "a1-liens-documentaires.html": set(),  # liens <a>, xmlns, data: URI : silence exigé
    # RA-1 (Produit-10, 13/08) : un </script> en clair dans le commentaire d'un asset inliné
    # tronque le script hôte — le déséquilibre ouvertures/fermetures le trahit.
    "a1bis-script-tronque.html": {"A1-bis"},
    # TF-0307 : deux jumelles qui ne diffèrent QUE par la place d'une url() — dans un
    # commentaire (rien n'est chargé, silence exigé) ou dans la règle CSS qui suit
    # (requête réelle, A1 doit la nommer). Sans la rouge, retirer les commentaires
    # pourrait avaler le CSS qui les suit sans que rien ne le dise.
    "a1-reseau-cite-en-commentaire.html": set(),
    "a1-reseau-hors-commentaire.html": {"A1"},
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
# TF-0445 : famille S — structure du document (S1 cohérence de tableau). Une famille de plus
# demande son extracteur : `codes()` ne rend que ce que son motif reconnaît, et un code non
# reconnu se lit « aucun défaut » — c'est un faux vert de recette, pas une lacune anodine.
RE_CODE_S = re.compile(r"^(S\d+)\b")

# AUTOPORTANCE (TF-0303, décidé par l'étude d'opportunité 20260817b — verdict O3) :
# mécanisation des règles A1 (squelette auto-portant), A2/G2 (favicon data:), A3 (charset
# dans les 1024 premiers octets), A4 (titre marque + objet + version datée) et de la
# branche R-30 « clair par défaut STRICT » de G1 (auto-sombre hérité de l'OS interdit
# depuis TF-0158, tranché RV-9). Codes A et G jugés ENSEMBLE : le cas fondateur les cumule,
# et les séparer aurait fait passer un fragment sans en-tête pour un simple défaut de titre.
#
# Cas fondateur (lot Produit-01, 17/08) : un rapport d'audit remis à un client, écrit pour
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
    # TF-0421 (lot Client-B 20260820a) : la bride par `width: min(75ch, 100%)` passait L2 (qui ne
    # regardait que max-width) et laissait 60 % de la fenêtre vide à 1 800 px. L2 mesure
    # désormais QUELLE QUE SOIT la propriété ; la mesure de lecture se pose sur le conteneur
    # (.chap.lire), jamais sur le paragraphe.
    "l2r-texte-width-min.html": ("l2_width", 1),       # bride par width:min(ch)
    "l2r-chap-lire.html": ("l2_width", 0),             # conteneur de lecture, texte plein
    # TF-0444 (21/08) : <colgroup>/<col> DÉCLARENT des largeurs, ils ne mettent rien en page —
    # leur boîte englobe celle du tableau, donc tout tableau à colgroup rendait deux faux
    # positifs BLOQUANTS (50 mesurés sur un livrable sain). Les deux sens sont dus : sans la
    # contre-épreuve, corriger le faux positif aurait pu éteindre la règle en silence.
    "v4-colgroup-legitime.html": ("v4_overlap", 0),    # largeurs déclarées, rien ne se recouvre
    "v4-chevauchement-reel.html": ("v4_overlap", 1),   # deux frères qui se recouvrent vraiment
    # TF-0440 (21/08) : L2 mesurait le paragraphe contre son conteneur — déplacer la bride
    # d'un cran la satisfaisait sans rien changer pour le lecteur. Les deux fixtures ne
    # diffèrent que par le CENTRAGE de la colonne : centrée = mesure de lecture (légitime),
    # calée à gauche = gouttière (refusée par le lecteur humain le 21/08).
    "l2c-conteneur-cale-a-gauche.html": ("l2_conteneur", 1),
    "l2c-conteneur-centre.html": ("l2_conteneur", 0),
    # TF-0491 (23/08) — la rupture d'alignement ENTRE FRERES EMPILES. Les trois mesures L2
    # precedentes comparent un bloc a ce que son CONTENEUR lui offre : une prose bornee ET
    # CENTREE au-dessus de cartes pleine largeur les satisfait toutes les trois. Le client l'a
    # pourtant signalee TROIS FOIS en quatre versions, sous trois formulations. Les trois
    # fixtures sont geometriquement liees : la rouge, la meme alignee, et la meme DECLAREE.
    "l2fr-freres-desalignes.html": ("l2_freres", 1),       # prose bornee sur cartes larges
    "l2fr-freres-alignes.html": ("l2_freres", 0),          # le meme, aligne — ce que le client demandait
    "l2fr-freres-declares.html": ("l2_freres", 0),         # le meme, mais data-mesure-lecture
    "l2g-gouttiere-etiquettes.html": ("l2_gouttiere", 1),   # colonne d'étiquettes
    "l2g-etiquettes-en-tete.html": ("l2_gouttiere", 0),     # étiquette en tête
    # TF-0500 (22/08) : L2-largeur ne pouvait STRUCTURELLEMENT pas voir un texte écrasé en
    # colonne d'un mot — caption absente de sa collecte, écartée par closest('table'), et
    # seuil de 1100 px alors que le défaut n'existe que sous 640 px. L2-filet mesure un rapport
    # d'aspect anormal, à toute largeur. Les deux fixtures ne diffèrent QUE par une règle CSS :
    # `table` en display:block (la caption tombe à 70px pour 366px de conteneur, 12 lignes pour
    # 15 mots) ou non (366px, 2 lignes). Mesuré le 22/08 avant et après correction.
    "l2f-caption-ecrasee-en-filet.html": ("l2_filet", 1),
    "l2f-caption-pleine-largeur.html": ("l2_filet", 0),
    # V7 : le rythme vertical se mesure au blanc ENTRE les boîtes, pas au pas d'un
    # haut de boîte au suivant. Les deux pages sont identiques à une chose près —
    # un paragraphe hors de l'échelle d'espacement dans la rouge.
    "v7-prose-en-flux.html": ("v7_spacing", 0),   # hauteurs variables, blanc constant
    "v7-rythme-casse.html": ("v7_spacing", 1),    # un paragraphe hors échelle
}


# EXEMPTIONS DÉCLARÉES (TF-0308) — double sens du registre `EXEMPTIONS_DECLAREES`.
#
# Fixtures EMBARQUÉES ici, et non des fichiers de `fixtures/` : le mécanisme se déclenche
# sur le CHEMIN du fichier jugé (registre nominatif), et une fixture de ce skill ne peut
# pas vivre dans l'arbre d'un autre skill. Même contrainte, même choix que le self-test
# du hook C7. Ce que ces cas prouvent : l'exemption s'applique là où elle est déclarée,
# nulle part ailleurs, et n'écarte QUE ce qu'elle nomme.
FRAGMENT_CANEVAS = "\n".join([
    "<!-- TEMPLATE TOPOLOGIE · canevas Digit-AI",
    "     Utilisation : insérer ce <svg>...</svg> dans une page qui utilise le squelette",
    "     de template-multi-bandes.html. -->",
    '<div class="diagram-wrap">',
    '  <svg viewBox="0 0 1400 720" xmlns="http://www.w3.org/2000/svg" role="img">',
    "    <title>{{TITRE_TOPOLOGIE}} | {{SOUSTITRE}}</title>",
    '    <rect x="60" y="76" width="200" height="114" rx="8" fill="#ede9fe"/>',
    "  </svg>",
    "</div>",
])
CHEMIN_DECLARE = ".claude/skills/digit-ai-schemas/assets/template-topologie.html"
CHEMIN_GABARIT = ".claude/skills/digit-ai-schemas/assets/template-multi-bandes.html"
# Page datée : sous le chemin du gabarit à trous, l'exemption A4-version n'écarte plus
# rien — le contrôle doit le DIRE, sinon une ligne de registre survit à son motif.
PAGE_DATEE = "\n".join([
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>Digit-AI — Canevas multi-bandes · essai — 20260817a</title>",
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg/%3E">',
    "<style>:root { --ink: #0f172a; } @media print { body { background: #fff; } }</style>",
    "</head><body><h1>Essai</h1><p>Contenu.</p></body></html>",
])


def run_exemptions():
    """Cas à double sens du registre d'exemptions déclarées. Même forme que run()."""
    def a_code_autoportance(fails):
        return any(f.startswith(("A1 DOCTYPE", "A1 <head>", "A3 ", "A2 ")) for f in fails)

    cas = []

    fails, warns = check(FRAGMENT_CANEVAS, regles="charte", source=CHEMIN_DECLARE)
    cas.append(("VERTE  fragment déclaré : autoportance écartée",
                not a_code_autoportance(fails)
                and any("SKIP exemption déclarée" in w for w in warns), fails))

    fails, warns = check(FRAGMENT_CANEVAS, regles="charte", source=CHEMIN_DECLARE)
    cas.append(("VERTE  le SKIP NOMME son motif (jamais muet)",
                any("fragment SVG de canevas" in w and "template-multi-bandes" in w
                    for w in warns), warns))

    fails, _ = check(FRAGMENT_CANEVAS, regles="charte",
                     source="output/livrable-client.html")
    cas.append(("ROUGE  même contenu HORS registre : les échecs reviennent",
                a_code_autoportance(fails), fails))

    fails, _ = check(FRAGMENT_CANEVAS, regles="charte")
    cas.append(("ROUGE  sans chemin fourni : aucune exemption possible",
                a_code_autoportance(fails), fails))

    cdn = FRAGMENT_CANEVAS.replace(
        '<div class="diagram-wrap">',
        '<link rel="stylesheet" href="https://cdn.exemple.invalid/t.css">\n'
        '<div class="diagram-wrap">')
    fails, _ = check(cdn, regles="charte", source=CHEMIN_DECLARE)
    cas.append(("ROUGE  fichier exempté qui charge un CDN : A1 réseau reste en échec",
                any("requête(s) réseau" in f for f in fails), fails))

    fails, warns = check(PAGE_DATEE, regles="charte", source=CHEMIN_GABARIT)
    cas.append(("       exemption devenue inutile : annoncée SANS EFFET",
                any("SANS EFFET" in w for w in warns), warns))

    return [{"fixture": nom, "verdict": "OK" if tenu else "ECHEC",
             "attendu": ["exemption"], "obtenu": ["exemption"] if tenu else [],
             "detail": "" if tenu else " | ".join(detail)[:300]}
            for nom, tenu, detail in cas]


def codes(messages, motif=RE_CODE):
    out = set()
    for m in messages:
        c = motif.match(m)
        if c:
            out.add(c.group(1))
    return out


# TF-0445 (21/08) — S1 : cohérence de tableau. Jugée sous `regles="charte"` et non "L" : ce
# n'est pas de la lisibilité, c'est de la structure. Les cas ne comparent QUE les codes S,
# sinon le bruit des règles de charte (favicon, responsive) d'une fixture minimale masquerait
# le seul point qu'elles prouvent.
CAS_STRUCTURE = {
    "s1-tableau-incoherent.html": {"S1"},   # `|` non échappé : 5 cellules pour un en-tête de 4
    "s1-tableau-coherent.html": set(),      # même page, la barre verticale échappée
    "s1-rowspan-non-juge.html": set(),      # rowspan : non comptable, écarté avec son motif
}


def run_structure():
    """Cas à double sens de S1. Ne compare que les codes S — voir le commentaire ci-dessus."""
    resultats = []
    for nom, attendu in CAS_STRUCTURE.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        obtenu = codes(fails, RE_CODE_S)
        ok = obtenu == attendu
        resultats.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                          "attendu": sorted(attendu), "obtenu": sorted(obtenu),
                          "detail": "" if ok else "codes S obtenus != attendus"})
    return resultats


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
    for nom, attendu in CAS_AVERT.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, warns = check(chemin.read_text(encoding="utf-8"), regles="L")
        # Seul L15 est en cause : l'avertissement L6 « aucun sommaire » d'une page minimale
        # n'est pas l'objet de ces deux jumelles, qui ne diffèrent que par le glyphe.
        obtenu = codes(warns) & {"L15"}
        # un avertissement ne doit jamais s'accompagner d'un ÉCHEC L parasite : la fixture est
        # verte par ailleurs, seul le glyphe la distingue de sa jumelle.
        ok = obtenu == attendu and not codes(fails)
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu | codes(fails)),
            "detail": "" if ok else " | ".join(warns + fails)[:400],
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


def run_repli_cartes():
    """TF-0442 — le repli en cartes du socle, mesuré à 390 px (là où il sert).

    Les autres cas de rendu se jouent à 1440 px : le repli ne s'y déclenche pas. Cette branche
    mesure la seule largeur où il compte.

    Ce que la mesure a APPRIS, et qui n'était pas la thèse de départ. La thèse était : « un
    conteneur `overflow-x: auto` ne fait pas passer V1, le repli en cartes le fait ». Mesuré le
    21/08 sur ces deux fixtures, avec le socle À JOUR : les DEUX rendent 0 constat V1 à 390 px.
    La raison est que le socle porte désormais `overflow-wrap: anywhere` sur les cellules — le
    tableau ne déborde plus, il s'ÉCRASE. La capture le montre sans discussion : huit colonnes
    réduites à un ou deux caractères par ligne, « Identifiant » rendu sur cinq lignes, et
    V1 PASS.

    Donc : le repli en cartes n'est PAS un correctif de débordement, c'est un correctif de
    LISIBILITÉ — et V1 est muet sur un tableau écrasé, même famille d'angle mort que TF-0440
    (une règle satisfaite sans être tenue). Le constat est versé au registre en candidat.

    Ce que ces deux cas verrouillent donc, en attendant :
      · le repli du socle ne CASSE rien (0 constat V1, la carte tient dans le viewport) ;
      · le cas sans repli est à 0 AUJOURD'HUI, et ce zéro est le défaut, pas le succès. Le jour
        où une règle saura voir l'écrasement, ce cas devra passer à >= 1 — et c'est ici qu'on
        le lira.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    import json as _json
    import subprocess
    import tempfile
    captures = tempfile.mkdtemp(prefix="self-test-repli-")
    rendu = str(Path(__file__).resolve().parent / "render_page.py")
    cas = {
        "v1-tableau-repli-cartes.html": 0,   # replié : chaque ligne devient une carte
        "v1-tableau-sans-repli.html": 0,     # écrasé : 0 par ÉCRASEMENT, pas par confort
    }
    out = []
    for nom, attendu in cas.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            out.append({"fixture": nom, "verdict": "ABSENTE", "attendu": attendu,
                        "obtenu": 0, "detail": "fixture manquante"})
            continue
        r = subprocess.run([sys.executable, "-X", "utf8", rendu, str(chemin),
                            "--widths", "390", "--output", "json", "--out", captures],
                           capture_output=True, text=True, encoding="utf-8")
        try:
            n = len(_json.loads(r.stdout)["breakpoints"]["390"]["issues"]["v1_overflow"])
        except Exception:
            out.append({"fixture": nom, "verdict": "ECHEC", "attendu": attendu,
                        "obtenu": 0, "detail": "render_page illisible"})
            continue
        ok = n == attendu
        out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC", "attendu": attendu,
                    "obtenu": n, "regle": "v1_overflow (390 px)",
                    "detail": "" if ok else f"{n} constat(s) v1_overflow à 390 px"})
    shutil.rmtree(captures, ignore_errors=True)
    return out


def run_v1_bornes():
    """TF-0382 — les DEUX sens de la borne V1, en comptes EXACTS.

    `CAS_RENDU` teste « au moins n constats » : sur ces deux cas-là, un `>=` ne discriminerait
    rien — 16 entrees passeraient un `>= 4` aussi bien que 4. Or c'est precisement le nombre qui
    est en cause. D'ou une branche a part, a egalite stricte.

    Sens 1 — REGROUPEMENT : trois tableaux de gabarit identique, chacun portant 54 descendants
    debordants. Avant correction : 16 releves, tous dans le PREMIER tableau, les deux suivants
    jamais examines et rien ne le disait. Apres : 4 constats (le document + une cause par
    tableau), chacun annoncant ses descendants.

    Sens 2 — TRONCATURE DECLAREE : dix-neuf blocs FRERES, donc dix-neuf causes qu'aucun
    regroupement ne peut fusionner. Le plafond est alors atteint pour de vraies raisons, et le
    drapeau doit dire le compte exact — 20 defauts pour 17 lignes detaillees.

    Silencieux si playwright est absent : la borne se mesure dans un navigateur, pas en prose.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    import json as _json
    import subprocess
    import tempfile
    captures = tempfile.mkdtemp(prefix="self-test-v1-bornes-")
    rendu = str(Path(__file__).resolve().parent / "render_page.py")

    def mesurer(nom):
        chemin = FIXTURES / nom
        if not chemin.exists():
            return None
        r = subprocess.run([sys.executable, "-X", "utf8", rendu, str(chemin),
                            "--widths", "1440", "--output", "json", "--out", captures],
                           capture_output=True, text=True, encoding="utf-8")
        try:
            return _json.loads(r.stdout)["breakpoints"]["1440"]
        except Exception:
            return None

    out = []
    groupe = mesurer("v1-trois-tableaux-debordants.html")
    if groupe is None:
        out.append({"fixture": "v1-trois-tableaux-debordants.html", "verdict": "ECHEC",
                    "attendu": 4, "obtenu": 0, "detail": "fixture absente ou rendu illisible"})
    else:
        n = len(groupe["issues"]["v1_overflow"])
        avec_descendants = [x for x in groupe["issues"]["v1_overflow"]
                            if "descendant(s) débordent AVEC lui" in x["detail"]]
        # Egalite stricte : 3 tableaux + le document. Et les trois tableaux doivent ANNONCER
        # leurs descendants, sinon le regroupement serait silencieux — on aurait remplace une
        # troncature muette par une fusion muette.
        ok = (n == 4 and len(avec_descendants) == 3
              and groupe["issues"].get("v1_tronque") is None
              and groupe["blocking"] == 4)
        out.append({"fixture": "v1-trois-tableaux-debordants.html",
                    "verdict": "OK" if ok else "ECHEC", "attendu": 4, "obtenu": n,
                    "regle": "v1_overflow (regroupement par sous-arbre)",
                    "detail": "" if ok else (f"{n} constat(s) au lieu de 4, "
                                             f"{len(avec_descendants)} annoncant des descendants "
                                             f"au lieu de 3, blocking {groupe['blocking']}")})

    borne = mesurer("v1-dix-neuf-causes-independantes.html")
    if borne is None:
        out.append({"fixture": "v1-dix-neuf-causes-independantes.html", "verdict": "ECHEC",
                    "attendu": 20, "obtenu": 0, "detail": "fixture absente ou rendu illisible"})
    else:
        t = borne["issues"].get("v1_tronque")
        # Le compte EXACT est ce qui dit l'ampleur ; la liste, elle, est plafonnee. Les deux
        # doivent etre lisibles, et `blocking` doit suivre le compte, pas la liste.
        ok = bool(t) and t["total"] == 20 and t["detaillees"] == 17 and t["plafond"] == 16 \
            and borne["blocking"] == 20 and "TRONQUÉ" in t["motif"]
        out.append({"fixture": "v1-dix-neuf-causes-independantes.html",
                    "verdict": "OK" if ok else "ECHEC", "attendu": 20,
                    "obtenu": (t or {}).get("total", 0),
                    "regle": "v1_tronque (borne declaree)",
                    "detail": "" if ok else f"drapeau {t!r}, blocking {borne['blocking']}"})

    shutil.rmtree(captures, ignore_errors=True)
    return out


def run_glyphes_du_socle():
    """TF-0490 (22/08/2026) — LE SOCLE NE PROPAGE PAS UN GLYPHE QU'IL INTERDIT.

    Le fait fondateur, et c'est une CONFIRMATION : le lot du 20/08 avait signalé un chevron
    absent des piles de repli déclarées (TF-0435), corrigé en passant tout le socle à `›`
    (U+203A). Le 22/08, le même défaut revient — un producteur reprend le composant
    `details`/`summary` du socle, recopie les triangles de l'exemple, et hérite du risque.

    LA CAUSE N'EST PAS LE PRODUCTEUR : c'est que rien ne juge les EXEMPLES du socle. `L15` juge
    les glyphes en `content:` CSS d'une page produite ; personne ne juge ceux que le socle offre
    à la copie. Un exemple est une prescription silencieuse : ce qu'il montre sera repris.

    CE QUI EST JUGÉ, et la borne est délibérée : les BLOCS DE CODE des références (ce qu'on
    recopie) et les FIXTURES (ce qui sert de modèle). PAS la prose des références : les marqueurs
    de gravité de `bonnes-pratiques.md` (🔴 🟡 ⚪) sont la LÉGENDE du document, pas un exemple —
    personne ne les recopie dans un livrable, et les interdire dégraderait la référence sans rien
    gagner. Un contrôle qui déborde de son domaine se fait désactiver.
    """
    from check_html import GLYPHES_SURS
    racine = Path(__file__).resolve().parent.parent
    cibles = sorted((racine / 'references').rglob('*.md')) + sorted((racine / 'fixtures').rglob('*.html'))
    fautifs = {}
    for f in cibles:
        texte = f.read_text(encoding='utf-8')
        dans_code = False
        for i, ligne in enumerate(texte.split('\n'), 1):
            if f.suffix == '.md':
                if ligne.strip().startswith('```'):
                    dans_code = not dans_code
                    continue
                if not dans_code:
                    # On ne lit QUE le contenu des spans de code, jamais la ligne entière : un
                    # marqueur de gravité en tête de puce (« - 🔴 Ouvrir par `<!DOCTYPE html>` »)
                    # n'est pas un exemple recopié, et juger la ligne le condamnait à tort.
                    ligne = ' '.join(re.findall(r'`([^`]+)`', ligne))
                    if not ligne:
                        continue
            for ch in set(ligne):
                if ord(ch) > 0x00FF and ch not in GLYPHES_SURS:
                    fautifs.setdefault(ch, []).append(f'{f.name}:{i}')
    if not fautifs:
        return [{'fixture': 'socle (références + fixtures)', 'verdict': 'OK',
                 'attendu': 'aucun glyphe hors liste blanche dans un exemple',
                 'obtenu': f'{len(cibles)} fichier(s) relus', 'regle': 'TF-0490 glyphes du socle',
                 'detail': ''}]
    detail = ' · '.join(f'U+{ord(c):04X} ({"/".join(o[:2])})' for c, o in sorted(fautifs.items()))
    return [{'fixture': 'socle (références + fixtures)', 'verdict': 'ECHEC',
             'attendu': 'aucun glyphe hors liste blanche dans un exemple',
             'obtenu': f'{len(fautifs)} glyphe(s)', 'regle': 'TF-0490 glyphes du socle',
             'detail': detail}]


def run_markdown():
    """TF-0518 (22/08/2026) — LA PORTE DU MARKDOWN, ouverte et jouée dans les deux sens.

    Le registre compte 48 domaines ; mesuré sur un livrable réel de 85 Ko, le lanceur en jugeait
    QUATRE et aucun de lisibilité. Les règles L1-L19 vivent dans `check_html.py`, qui ne
    s'exécute que sur du HTML — or le Markdown est le format de livraison DOMINANT des runs
    d'architecture et de conseil, et c'est exactement là que le défaut du retour jumeau (un
    identifiant sans son sens) s'est produit. Un humain l'a trouvé, comme pour L14.

    La paire rouge/verte porte le MÊME contenu à trois différences près, pour que ce qui est
    jugé soit isolé : un chapitre qui ouvre sur un tableau nu, un marqueur de balisage interne
    resté dans le texte, et un code employé sans son sens.
    """
    outil = Path(__file__).resolve().parent / 'check_markdown.py'
    fx = Path(__file__).resolve().parent.parent / 'fixtures'
    out = []
    attendus = {'m-lisibilite-rouge.md': {'M7', 'M14', 'M18'}, 'm-lisibilite-vert.md': set()}
    for nom, attendu in attendus.items():
        cible = fx / nom
        if not cible.exists():
            out.append({'fixture': nom, 'verdict': 'ECHEC', 'attendu': 'fixture présente',
                        'obtenu': 'absente', 'regle': 'M (markdown)', 'detail': ''})
            continue
        r = subprocess.run([sys.executable, str(outil), str(cible), '--output', 'json'],
                           capture_output=True, text=True, encoding='utf-8', timeout=60)
        try:
            j = json.loads(r.stdout)
        except Exception:
            out.append({'fixture': nom, 'verdict': 'ECHEC', 'attendu': 'sortie JSON',
                        'obtenu': 'illisible', 'regle': 'M (markdown)', 'detail': (r.stderr or '')[:160]})
            continue
        obtenus = {m.split()[0] for m in j.get('fails', [])}
        ok = obtenus == attendu
        out.append({'fixture': nom, 'verdict': 'OK' if ok else 'ECHEC',
                    'attendu': ','.join(sorted(attendu)) or '(aucune règle)',
                    'obtenu': ','.join(sorted(obtenus)) or '(aucune)',
                    'regle': 'M (markdown)', 'detail': ''})
    return out

def main():
    ap = argparse.ArgumentParser(description="Auto-test des règles de lisibilité L1-L10.")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    args = ap.parse_args()

    res = run() + run_exemptions() + run_structure() + run_glyphes_du_socle() + run_markdown()
    rendu = run_rendu()
    if rendu:
        res += rendu
    # TF-0442 — le repli en cartes se mesure a 390 px, la seule largeur ou il se declenche.
    repli = run_repli_cartes()
    if repli:
        res += repli
    # TF-0382 — les deux sens de la borne V1, en comptes EXACTS (branche a part : CAS_RENDU
    # teste « au moins n », et c est precisement le nombre qui est en cause ici).
    bornes = run_v1_bornes()
    if bornes:
        res += bornes
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
