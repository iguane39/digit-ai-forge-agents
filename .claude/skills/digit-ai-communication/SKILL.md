---
name: digit-ai-communication
description: Coach la communication et la prise de parole Digit-AI — analyse l'audience, l'objectif et l'enjeu pour régler le curseur ethos/logos/pathos, choisit la structure (Minto, SCQA, sparkline, AIDA, BLUF…) et 3 patterns rhétoriques, puis produit un plan actionnable (accroche, objection, closing, scripts). Encode un corpus de patterns reconnus et des presets de réglage par type de livrable — propale, conférence, formation, COPIL, pitch, note/email, négociation, publication réseau, légende d'image, texte court, avis client. Use when / déclencher dès que l'utilisateur veut préparer, structurer, muscler ou scénariser une prise de parole, un pitch, une présentation, un argumentaire ou un message à fort enjeu, ou cherche comment dire les choses, dans quel ordre et avec quel dosage pour convaincre. Ne pas déclencher pour le rendu visuel d'un PowerPoint (→ digit-ai-pptx) ni pour rédiger ou chiffrer une proposition commerciale (→ digit-ai-propale) — ce skill travaille le message, pas le fichier ni le prix.
---

# Communication à impact (Digit-AI)

> Régler la bonne **dose** de leviers pour un livrable donné, puis produire un plan actionnable — pas un cours.

## Principe — le dosage

La compétence n'est pas d'appliquer tous les leviers, c'est de **régler le curseur** :

1. Positionner le curseur **ethos / logos / pathos** selon **livrable + audience + objectif + canal**.
2. **Ensuite** seulement, choisir **3 patterns maximum** qui servent ce réglage.
3. Séparer les leviers de **structure** (préparés à froid) des leviers de **live** (joués en direct).
4. Fil rouge, le **principe directeur** : la bonne chose, dans le bon ordre, pour la bonne personne.

## Workflow

1. **Recueillir les entrants** (ci-dessous). Si **livrable**, **audience** ou **objectif** manque, poser la question AVANT de produire.
2. **Identifier le livrable** et charger son preset dans [references/presets-livrables.md](references/presets-livrables.md) : curseur, structure par défaut, patterns prioritaires, piège.
3. **Ajuster le curseur** au cas précis et le justifier.
4. **Choisir 3 patterns** dans [references/corpus-patterns.md](references/corpus-patterns.md), et dire pourquoi les autres sont écartés.
5. **Produire le plan** au format de sortie, avec des scripts appliqués au sujet réel.

## Entrants

Livrable · canal (oral / écrit) · audience (+ pouvoir de décision, disposition, ce qu'ils croient déjà) · objectif (action attendue + émotion visée) · sujet & durée · enjeu · objection attendue · actifs de crédibilité (chiffres, cas, références) · matériau existant.

## Sortie

1. Livrable identifié + preset rappelé, puis ajusté au cas.
2. Réglage final du curseur **ethos / logos / pathos** en %, justifié.
3. Structure retenue (quel standard, pyramide droite ou inversée) et pourquoi.
4. Les **3 patterns** retenus + pourquoi les autres sont écartés.
5. Pour chaque pattern, un **script concret** appliqué au sujet.
6. Moments-clés scénarisés : ouverture · objection · closing / appel à l'action.
7. Garde-fou : principe directeur en une phrase + piège n°1 du livrable.

## Garde-fous

- **3 patterns maximum** : ne jamais dérouler tout le corpus, assumer les arbitrages.
- Le **canal** commande la règle 7-38-55 : plein effet à l'oral, nul à l'écrit.
- Les principes de Cialdini se dosent **éthiquement** : influence, pas manipulation.
- Le preset est un **point de départ**, pas un dogme : l'ajuster au cas réel.
- Rester **actionnable** (scripts, réglages chiffrés), jamais théorique.

## Exemple

```
Entrée : COPIL mensuel, oral en visio, audience = COMEX (décideurs),
         objectif = faire valider le passage L2 en production, enjeu stratégique.
Sortie : preset COPIL -> curseur E 30 / L 60 / P 10, pyramide DROITE.
         Ajusté : audience sceptique -> E 35 / L 55 / P 10.
         Patterns retenus : BLUF (décision en tête), SCQA, So What ?.
         Ecartés : sparkline, 3 actes (tuent une réunion de décision).
         Ouverture : "Je demande la validation de la MEP L2. Trois raisons."
         Objection : recadrage factuel sur le reste-à-faire chiffré.
         Closing : décision demandée + jalon daté.
         Piège évité : raconter le chemin au lieu de demander la décision.
```

## Références

- [references/corpus-patterns.md](references/corpus-patterns.md) — bibliothèque de patterns (les 7 leviers d'origine + standards reconnus, tagués structure / narratif / live / langage).
- [references/presets-livrables.md](references/presets-livrables.md) — presets de réglage par type de livrable (curseur, structure, patterns, piège), et le contrat de sortie binaire de chaque modèle de publication.
- [references/contrats-publication.json](references/contrats-publication.json) — part lisible par machine de ces contrats de sortie ; lue par le contrôle de la semaine du pilot, tenue alignée sur la prose par le self-test (C4).
