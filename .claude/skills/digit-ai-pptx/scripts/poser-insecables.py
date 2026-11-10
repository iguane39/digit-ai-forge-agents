#!/usr/bin/env python3
"""poser-insecables.py - pose les espaces insecables (U+00A0) que la typographie francaise exige (TF-2328).

LE FAIT (retour du 09/11/2026). Le texte source porte U+00A0 ; le PPTX brut releve octet a octet porte une
espace ordinaire ; la regle S8 d'oracle-charte-pptx-semantique avertit sur chaque diapositive. Mesure du
10/11/2026 : pptxgenjs 3.12.0 et 4.0.1 CONSERVENT U+00A0 dans un texte simple, des passages, un tableau, une
forme, des notes et un masque ; la perte vient donc d'un traitement qui precede l'ecriture du fichier (un
`\\s` de JavaScript, `trim`, une normalisation NFKC, une lecture non UTF-8 du texte source). Plutot que de
chasser la cause dans chaque script de generation, le skill pose l'espace insecable sur le FICHIER produit.

CE QUE FAIT LE SCRIPT. Il applique la table de S8 (la meme que L35 du socle HTML) a chaque paragraphe des
diapositives et des notes : espace ordinaire devant : ; ! ? , a l'interieur de « », entre un nom et son
numero (chapitre 4, lot 2, etape 3…), entre un mois et son annee. Chaque espace trouvee devient U+00A0. Le
traitement est idempotent : un second passage ne change rien. La mise en forme, la position et les passages
ne changent pas ; seule la valeur d'une espace dans un `<a:t>` change. Le deck d'entree n'est jamais modifie ;
le resultat part vers `--out`, qui ne doit pas exister.

CE QU'IL NE FAIT PAS. Il ne juge pas la typographie d'un texte hors de la table de S8 (pas de guillemets
droits corriges, pas de trait d'union). Une espace ordinaire que la table ne couvre pas reste ordinaire.

Sortie : une ligne JSON sur stdout. Codes : 0 traite (meme sans rien a poser) ; 2 usage incorrect, deck
illisible ou sortie deja existante.
"""
import argparse
import html
import json
import os
import re
import sys
import zipfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

NBSP = " "
NOMS = "chapitres?|points?|étapes?|lots?|phases?|parties?|annexes?|sections?|versions?|articles?|pages?|tomes?|niveaux?|paliers?|vagues?|sprints?|semaines?"
MOIS = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre"
# (motif, index du groupe qui porte l'espace a remplacer) : la table de S8, une espace par correspondance
MOTIFS = [
    (re.compile(r"(?<=[^\s  ]) (?=[:;!?](?:[\s  ]|$))"), None),
    (re.compile(r"« "), None),
    (re.compile(r" »"), None),
    (re.compile(r"\b(?:%s) (?=\d+\b)" % NOMS, re.I), None),
    (re.compile(r"\b(?:%s) (?=\d{4}\b)" % MOIS, re.I), None),
]
RE_PARAGRAPHE = re.compile(r"<a:p\b[^>]*>.*?</a:p>", re.S)
RE_TEXTE = re.compile(r"(<a:t(?:\s[^>]*)?>)([^<]*)(</a:t>)")
PARTIES = re.compile(r"ppt/(?:slides/slide|notesSlides/notesSlide)\d+\.xml")


def espaces_a_poser(texte):
    """Positions (dans `texte`) des espaces ordinaires que la table de S8 veut insecables."""
    positions = set()
    for motif, _ in MOTIFS:
        for m in motif.finditer(texte):
            segment = m.group(0)
            # chaque motif ne contient qu'une espace, en tete du segment ou en queue
            positions.add(m.start() if segment.startswith(" ") else m.end() - 1)
    return sorted(positions)


def traiter_paragraphe(xml_p):
    noeuds = list(RE_TEXTE.finditer(xml_p))
    if not noeuds:
        return xml_p, 0
    textes = [html.unescape(n.group(2)) for n in noeuds]
    complet = "".join(textes)
    posees = [i for i in espaces_a_poser(complet) if complet[i] == " "]
    if not posees:
        return xml_p, 0
    # redistribue : position globale -> (noeud, decalage local)
    bornes, debut = [], 0
    for t in textes:
        bornes.append((debut, debut + len(t)))
        debut += len(t)
    nouveaux = list(textes)
    for i in posees:
        for k, (a, b) in enumerate(bornes):
            if a <= i < b:
                t = nouveaux[k]
                nouveaux[k] = t[: i - a] + NBSP + t[i - a + 1:]
                break
    sortie, curseur = [], 0
    for n, ancien, neuf in zip(noeuds, textes, nouveaux):
        sortie.append(xml_p[curseur:n.start()])
        corps = n.group(2) if ancien == neuf else html.escape(neuf, quote=False)
        sortie.append(n.group(1) + corps + n.group(3))
        curseur = n.end()
    sortie.append(xml_p[curseur:])
    return "".join(sortie), len(posees)


def traiter_partie(xml):
    total = [0]

    def sub(m):
        neuf, k = traiter_paragraphe(m.group(0))
        total[0] += k
        return neuf

    return RE_PARAGRAPHE.sub(sub, xml), total[0]


def main():
    ap = argparse.ArgumentParser(description="Pose les espaces insecables de la typographie francaise sur un deck.")
    ap.add_argument("deck", help="deck .pptx")
    ap.add_argument("-o", "--out", required=True, help="deck de sortie (ne doit pas exister)")
    a = ap.parse_args()

    def fin(rapport, code):
        sys.stdout.write(json.dumps(rapport, ensure_ascii=False) + "\n")
        sys.exit(code)

    if not os.path.isfile(a.deck):
        fin({"etat": "non-joue", "motif": "deck absent : " + a.deck}, 2)
    if os.path.exists(a.out):
        fin({"etat": "non-joue", "motif": "la sortie existe deja, rien n'est ecrase : " + a.out}, 2)
    try:
        src = zipfile.ZipFile(a.deck)
    except zipfile.BadZipFile:
        fin({"etat": "non-joue", "motif": "deck illisible (pas un zip) : " + a.deck}, 2)

    parties, total = [], 0
    sortie = zipfile.ZipFile(a.out, "w", zipfile.ZIP_DEFLATED)
    try:
        for info in src.infolist():
            donnees = src.read(info.filename)
            if PARTIES.fullmatch(info.filename):
                xml, k = traiter_partie(donnees.decode("utf-8"))
                if k:
                    donnees = xml.encode("utf-8")
                    parties.append({"partie": info.filename, "espaces_posees": k})
                    total += k
            sortie.writestr(info, donnees, compress_type=zipfile.ZIP_DEFLATED)
    finally:
        sortie.close()
        src.close()
    fin({"etat": "traite", "sortie": a.out, "espaces_insecables_posees": total, "parties": parties}, 0)


if __name__ == "__main__":
    main()
