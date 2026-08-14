---
name: la-barre
description: >
  Trouve, qualifie et pérennise la barre de qualité d'un livrable — une référence externe
  concrète et inspectable qui fixe le niveau à atteindre, prouvée par un test d'existence
  exécuté et décomposée en critères vérifiables. Deux modes : pré-vol (injecte la barre dans
  un prompt avant son exécution) et en ligne (alimente l'arbitre d'une boucle). Use when /
  déclencher en activation explicite dès que le prompt démarre par le mot-clé « barre »
  (« barre ce prompt », « barre : … », « /barre … ») : ce préfixe prime sur l'exclusion
  sémantique. Déclencher aussi sans mot-clé quand l'utilisateur cherche une référence, un
  comparatif ou un « à quoi ça doit ressembler » pour un livrable, ou quand un critère de
  fidélité à une référence doit être décomposé avant d'entrer dans un arbitre. Ne pas
  déclencher pour itérer sur le livrable (→ la-boucle), analyser un prompt
  (→ prompt-analyzer-l99), juger un livrable fini (→ quality-oracles), ni orchestrer
  constructeur/critique (→ forge-agents).
---

# La Barre

Trouve la **référence externe** qui fixe le niveau d'un livrable, la prouve atteignable, la décompose en critères vérifiables, la range pour réemploi. Ne boucle pas, ne construit pas, ne juge pas le livrable fini.

Raison d'être : un contrat de sortie dérivé du seul énoncé — celui du Ch8 de `prompt-analyzer-l99` comme celui de l'arbitre de `la-boucle` — rend la spécification plus précise, jamais plus ambitieuse. La barre est la seule pièce qui importe un niveau venu de l'extérieur.

## Activation

Deux portes, même protocole. **Explicite** : le prompt démarre par le mot-clé `barre` — signal d'intention, pas la tâche — qui **prime sur l'exclusion sémantique**.

```text
barre ce prompt   ·   barre : ma maquette de refonte   ·   /barre cette propale
```

Retirer le mot-clé, traiter le reste comme l'entrant. `barre` seul → demander l'entrant. Garde-fou anti-faux-positif : si « barre » est l'**objet** de la demande (barre de navigation, barre d'outils, barre de progression, barre de menu), c'est hors périmètre.

**Implicite** : recherche d'une référence, d'un comparatif ou d'un « à quoi ça doit ressembler » ; ou critère de fidélité à une référence à décomposer avant d'entrer dans un arbitre.

## Le contrat d'une barre

Six champs + statut. Une barre incomplète n'entre pas au registre.

| Champ | Contenu |
|---|---|
| `cible` | le type de livrable concerné — c'est le champ de matching |
| `dimension` | *(optionnel — RB-1, 14/08)* l'axe jugé quand le niveau d'une cible se décompose en dimensions indépendantes (parcours d'une table, clarté pour un profane, densité typographique…). **Un niveau multidimensionnel = plusieurs entrées de même `cible`, une par `dimension`** — c'est la façon normale, pas un contournement ; l'humain du pas 5 peut retenir « les trois, en trois entrées » |
| `reference` | un **artefact nommé** + son localisateur (URL, fichier, capture). Jamais une catégorie |
| `test_existence` | la commande qui prouve la référence atteignable et inspectable, verdict binaire |
| `niveaux` | structure/géométrie · tokens (fontes, couleurs, espacements) · composants/effets · comportement |
| `frontiere` | ce que la barre autorise (le niveau) et ce qu'elle interdit (le gabarit à copier) |
| `justification` | en une phrase, pourquoi cette référence est valide pour cette cible |

Plus `statut: todo | ok`. **Vocabulaire** : « étalon » est réservé à la rubrique /100 du Ch1 de L99 ; ici on dit *barre* et *référence*, jamais *étalon*.

## Le protocole (7 pas)

1. Identifier la `cible`. Une barre en statut `ok` matche → la servir, s'arrêter là.
2. Chercher **2-3 candidats concrets** — recherche web, corpus fourni, dossiers existants. Un artefact nommé, jamais une catégorie.
3. **Exécuter** `scripts/test_existence.py` sur chaque candidat. Un FAIL élimine ; il ne produit pas un « à vérifier ».
4. Filtre de légitimité : écarter ce qui relèverait de la copie, ou pose un problème déontologique sur livrable client.
5. Proposer les survivantes **avec leur justification**, faire valider en **un seul tour, non sautable**. Jamais auto-validée.
6. Décomposer la retenue en `niveaux`.
7. Rendre la main selon le mode, puis proposer l'inscription au registre.

## Deux modes

| | entrant | sortant |
|---|---|---|
| **pré-vol** | un prompt, typiquement la sortie Ch8 de `prompt-analyzer-l99` | le même prompt + une section barre, prêt à exécuter |
| **en ligne** | le livrable en cours, au temps 1 de `la-boucle` | des critères prêts pour l'arbitre |

**Règle dure (pré-vol)** : s'arrêter pour validation **avant injection**. Sans elle le pas 5 saute, et une barre auto-choisie — donc facile — part s'exécuter sans contrôle.

**Signal « écart d'ambition »** : si la barre retenue est matériellement au-dessus du contrat de sortie du prompt, les couches Premortem et Wargame de L99 ont raisonné contre la mauvaise ambition → renvoyer sur une **ré-passe L50** (Ch1 + Ch3 + Ch8) avant exécution.

## Garde-fous

- **Test d'existence bloquant** — une référence non atteignable n'est pas une barre, c'est un vœu.
- **Barre gameable** — le modèle a intérêt à proposer un comparable qu'il bat. D'où la justification explicite et la validation humaine du pas 5.
- **Fail-closed** — aucun candidat ne survit aux pas 3-4 → le dire et escalader, jamais dégrader en critères de prose.
- La barre fixe un **niveau**. Elle n'autorise jamais la reproduction d'un contenu, d'une identité visuelle ou d'une voix d'auteur.

## Frontière

Ne boucle pas (→ `la-boucle`) · n'analyse pas le prompt (→ `prompt-analyzer-l99`) · ne juge pas le livrable fini (→ `quality-oracles`) · n'orchestre pas constructeur/critique (→ `forge-agents`).

## Registre et outillage

Barres pérennisées : [references/registre-barres.md](references/registre-barres.md) — source unique, une entrée par barre, `statut: todo` tant que le pas 5 n'a pas eu lieu.

```bash
python scripts/test_existence.py <ref> [<ref>…]       # PASS/FAIL/SKIP, exit 0/1/2
python scripts/test_existence.py --liste candidats.txt
```

## Exemple (mode pré-vol)

**Entrant** : `barre ce prompt` + le prompt réécrit d'un Ch8 L99 pour une page HTML de restitution client.

Pas 1 — `cible` = page HTML chartée ; aucune barre `ok` au registre. Pas 2 — 3 candidats nommés. Pas 3 — `test_existence.py` : 2 PASS, 1 FAIL (404) → éliminé. Pas 4 — 1 écarté (identité visuelle d'un concurrent direct). Pas 5 — la survivante proposée avec sa justification, validée en un tour. Pas 6 — `niveaux` décomposés. Pas 7 — section barre injectée dans le prompt + entrée registre proposée en `ok`.
