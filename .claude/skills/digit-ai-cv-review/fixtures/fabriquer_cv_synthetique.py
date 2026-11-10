"""Fabrique un CV synthetique a 2 colonnes, aux proprietes connues d'avance, pour tester analyser_cv.py sans
aucun CV reel (les CV recus sont nominatifs et ne vont jamais dans un depot). 1.0.0 du 10/11/2026, skill digit-ai-cv-review.

Personne fictive, employeurs et villes fictifs. Proprietes posees (les valeurs attendues vivent dans
attendu.json, meme dossier) : 3 experiences en « Employeur (Ville) - duree », dont aucune datee ; 9 lignes
de missions, dont 1 chiffree et 1 repetee 2 fois ; 6 pastilles d'outils ecrites lettre a lettre (dont SAS sous
« Languages »), 1 seule citee dans une mission, et 2 langues ; un resume avec une redite ; 4 atouts ; age, permis
et une photo ; une adresse a 1 lettre doublee par rapport au nom ; les rubriques « Langues » et « Languages ».
Les espaces des pastilles sont de vrais caracteres ; les lecteurs de PDF ne les rendent pas tous de la meme
facon, et le test ne fige donc aucune valeur de lisibilite machine.

Usage : python fabriquer-cv-synthetique.py <sortie.pdf>
"""
import sys
import pymupdf

sortie = sys.argv[1]
doc = pymupdf.open()
p = doc.new_page(width=595, height=842)
G, D = 24, 205          # colonne gauche (portrait) et colonne droite (experiences), comme un CV de cabinet courant


def t(x, y, texte, taille=9, gras=False):
    p.insert_text((x, y), texte, fontsize=taille, fontname="hebo" if gras else "helv")


# colonne gauche : photo, age, nom, resume, atouts, contacts
photo = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 60, 70), False)
photo.clear_with(200)
p.insert_image(pymupdf.Rect(40, 30, 140, 150), pixmap=photo)
t(70, 170, "41 ans", 11, True)
t(G, 200, "JEANNE EXEMPLE", 14, True)
t(G, 220, "CONSULTANTE DATA", 11, True)
for k, ligne in enumerate(["Forte de 6 ans d'experience dans la data,", "j'accompagne des projets de qualite", "a forte valeur ajoutee. Je souhaite",
                           "continuer a accompagner des projets de", "qualite a forte valeur ajoutee."]):
    t(G, 250 + 12 * k, ligne, 8)
t(G, 330, "Mes atouts", 9, True)
t(G, 345, "Rigueur, curiosite, esprit d'equipe et", 8)
t(G, 357, "sens du service.", 8)
t(G, 390, "FORMATION", 9, True)
t(G, 405, "Master data 2016 - 2018", 8)
t(G, 440, "ME CONTACTER", 9, True)
t(G, 455, "06 12 34 56 78", 8)
t(G, 467, "jeanne.exemplle@exemple.fr", 8)
t(G, 479, "Permis B", 8)

# colonne droite : experiences, puis competences en pastilles espacees
t(D, 40, "EXPERIENCES PROFESSIONNELLES", 11, True)
y = 60
for titre, entete, faits in [
    ("CONSULTANTE DATA QUALITY", "Societe Alpha (Lyon) - 8 mois", ["Pilotage des regles de qualite sur SQL", "Animation d'ateliers metiers", "Reduction de 30 % des doublons clients"]),
    ("CHEFFE DE PROJET DATA", "Groupe Beta (Nantes) - 2 ans", ["Cadrage des besoins des metiers", "Animation d'ateliers metiers", "Suivi des indicateurs de qualite"]),
    ("ANALYSTE", "Entreprise Gamma (Rennes) - 1 an", ["Analyse des donnees de vente", "Production de rapports mensuels", "Documentation des flux"]),
]:
    t(D, y, titre, 9, True); y += 12
    t(D, y, entete, 9, True); y += 12
    for f in faits:
        t(D + 10, y, "• " + f, 8); y += 11
    y += 10
t(D, y + 10, "COMPETENCES", 11, True)
t(D, y + 28, "Outils & technologies", 9, True)
x = D
for pastille in ["S Q L", "P Y T H O N", "T A B L E A U", "C O L L I B R A", "J I R A"]:
    t(x, y + 44, pastille, 7, True); x += 70
t(D, y + 64, "Langues", 9, True)
t(D + 200, y + 64, "Languages", 9, True)
t(D, y + 80, "A N G L A I S", 7, True)
t(D + 70, y + 80, "I T A L I E N", 7, True)
t(D + 200, y + 80, "S A S", 7, True)
doc.save(sortie)
print(sortie)
