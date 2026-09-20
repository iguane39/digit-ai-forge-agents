# Structures de publication réseau — reprises agnostiques (TF-1157)

Trois structures de publication, reprises d'un skill installé au poste et audité le
17/09/2026 (verdict « Refondre », `ameliore-un-skill`), puis généralisées : aucun nom de
personne, aucun nom de client ou d'entreprise tierce, aucun chiffre non sourcé, aucune règle
d'algorithme (heure de publication, effet des hashtags, emplacement des liens). Ces dernières,
quand une source datée existe, vivent dans `references\PLATEFORME-LINKEDIN.md` du pilot —
jamais ici : un skill n'embarque pas une donnée volatile comme si c'était du code (loi
transverse n° 4).

Chaque structure se décline dans les deux écritures du preset « Publication réseau »
([presets-livrables.md](presets-livrables.md)) : première personne pour le profil d'une
personne, voix de marque pour la page d'une organisation.

## Structure 1 — « Les N points »

```
[Titre accrocheur, avec le nombre si pertinent]

[Contexte en 1-2 phrases : pourquoi ce sujet, maintenant]

1. [Point 1]
   [développement bref]
2. [Point 2]
   [développement bref]
...
N. [Dernier point]
   [développement bref]

[Question ou appel à l'action de clôture]

#Hashtag1 #Hashtag2 #Hashtag3
```

Usage : partager un cadre, une méthode, une liste de principes.

## Structure 2 — « Retour d'expérience »

```
[Titre du sujet ou du projet]

[Contexte en 1-2 phrases, sans nom de client ni de tiers]

Objectifs
• [objectif 1]
• [objectif 2]

Résultats
• [résultat, avec sa source, ou marqué « à sourcer » s'il n'est pas encore vérifié]

Enseignement clé
[un enseignement, en une ou deux phrases]

[Question de clôture]

#Hashtag1 #Hashtag2 #Hashtag3
```

Usage : partager un vécu concret. Tout chiffre entre sourcé (`oracle-claims`,
`registre-oracles.md` du skill `quality-oracles`) ou marqué comme non vérifié — jamais un
chiffre plausible laissé tel quel.

## Structure 3 — « Analyse comparative »

```
[Question ou problématique]

[Introduction du sujet en 1-2 phrases]

Comparaison de [N options] :
• [Option 1] : [caractéristique]
• [Option 2] : [caractéristique]

Ce que j'en tire
[analyse, 2-3 phrases]

[Question de clôture]

#Hashtag1 #Hashtag2 #Hashtag3
```

Usage : partager une comparaison ou une recommandation.

## Communs aux trois structures

- Accroche tenant dans les deux premières lignes (visibles avant un éventuel « voir plus »).
- Paragraphes courts (1 à 3 lignes), listes à puces `•` ou numérotées.
- 3 à 5 hashtags en fin de post — **convention de forme**, jamais une règle d'algorithme
  (voir le preset « Publication réseau » dans [presets-livrables.md](presets-livrables.md)).
- Mise en gras : [scripts/linkedin_unicode_formatting.py](../scripts/linkedin_unicode_formatting.py)
  (LinkedIn ne rend pas le gras Markdown au copier-coller).

## Ce qui n'est PAS repris ici, et pourquoi

- **Toute règle d'algorithme** (heure idéale de publication, effet des hashtags, emplacement
  des liens, délai de réponse aux commentaires) : sans source primaire datée dans le skill
  audité, contredite par la mesure du 2026-08-22 (`PLATEFORME-LINKEDIN.md` §4). Se rejoue
  uniquement sur les exports du run (`RUN-RESEAU.md` du pilot), jamais par doctrine embarquée.
- **Les exemples nominatifs, les chiffres de client non sourcés, le générateur d'image** :
  laissés hors de ce skill — voir `SKILL.md`, section « Reste » de la campagne TF-1157.
