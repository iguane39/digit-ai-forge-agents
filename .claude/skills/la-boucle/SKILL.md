---
name: la-boucle
description: >
  Transforme une tâche du quotidien en résultat fini via une boucle auto-arbitrée : Claude
  tient les deux rôles — générateur et arbitre —, applique un test de critères binaires figés
  à l'avance, et ne rend la parole que pour une vraie décision. Use when / déclencher en activation explicite
  dès que l'utilisateur démarre son prompt par le mot-clé « boucle » (« boucle : … »,
  « boucle, … », « /boucle … ») : ce préfixe est un signal d'intention qui prime sur
  l'exclusion sémantique. Déclencher aussi sans mot-clé dès qu'il veut
  un résultat fini plutôt qu'un échange (planning de repas, rédaction d'un message,
  organisation d'un week-end, arbitrage d'une décision, priorisation de tâches, préparation
  de réunion, comparaison d'options), ou qu'il s'apprête à corriger Claude message après
  message (« non, plutôt… », « refais avec… »). Ne pas déclencher pour une réponse factuelle
  simple, une boucle logicielle de code (« boucle for/while », debug), ni une décision à fort
  enjeu ou irréversible (→ handoff direct).
---

# La Boucle

Discipline comportementale, pas mécanisme. Quand elle s'applique, Claude arrête de quémander des corrections : il fixe une **destination**, se donne un **arbitre**, et **boucle** en silence sur son propre travail jusqu'à convergence. Le substrat est la conversation — Claude *applique* cette discipline, il ne la compile pas.

## Activation

Deux portes, même protocole. **Implicite** : l'intention « résultat fini plutôt qu'échange » ressort de la demande (cf. *Périmètre*) — comportement inchangé. **Explicite** : le prompt démarre par le mot-clé `boucle`, qui est un **signal d'intention, pas la tâche** et **prime sur l'exclusion sémantique** (il enclenche même si la tâche seule n'aurait pas déclenché). Formes acceptées :

```text
boucle : refuse cette invitation à la réunion   ·   boucle, planifie mes repas   ·   /boucle compare ces deux offres
```

Retirer le mot-clé, traiter le reste comme la demande, entrer au **Cadrage**. `boucle` seul (sans tâche) → demander la tâche. Garde-fou anti-faux-positif : si « boucle » est l'**objet** de la demande et non un préfixe d'intention (« boucle for/while/infinie », debug d'une boucle de code), c'est une boucle logicielle, hors périmètre (cf. *Exclure*).

## Le protocole (4 temps)

1. **Cadrage** — Nommer la destination (« c'est fini » concret). Proposer l'**arbitre** s'il
   n'est pas donné, le faire valider en **un seul tour, non sautable** (amendement intégré et
   re-figé avant le 1er candidat). Seul garde-fou contre un arbitre auto-complaisant. Chaque critère nomme son **moyen de preuve**. Un critère de fidélité à une référence (« ressemble à X », « suit le format de Y ») est refusé tel quel et **décomposé** en niveaux vérifiables : structure/géométrie, tokens (fontes, couleurs), composants/effets, comportement. Moyen de preuve **indisponible** (référence inaccessible, outil absent) ⇒ escalade immédiate — demander l'artefact de vérité terrain (fichier, export, capture) — jamais de substitution silencieuse par une interprétation.
2. **Boucle silencieuse** — En **profondeur** par défaut : un candidat, noté critère par
   critère, corrigé, recommencé. Espace **divergent** (comparaison, design, message à angles
   multiples) → démarrer en **largeur** : 2-3 candidats *distincts par construction* (pas des
   variantes timides), l'arbitre les classe, on approfondit le meilleur. **Essais non
   affichés**, parole non rendue entre deux. Bornés (~3-5).
3. **Restitution** — Livrer le résultat convergé + un mini-rapport honnête des critères ✓/✗
   (chaque ✓ avec sa preuve **et sa provenance** — oracle exécuté ou revue manuelle —, chaque ✗ restant signalé, jamais masqué) + les éventuelles escalades.
4. **Réutilisation** — Proposer de mémoriser destination + arbitre, pour re-déclencher sans
   refaire le cadrage.

## L'arbitre (pièce maîtresse)

Une liste de critères **binaires** (réussi/raté). Chaque ✗ porte une **raison réexploitable**
(de quoi corriger à la passe suivante). L'arbitre est **figé et validé avant le premier
candidat** — jamais réajusté pour épouser un candidat déjà produit. Sans arbitre testable et
antérieur : pas de boucle, juste un prompt déguisé. On standardise ce contrat, jamais son
contenu : il change à chaque situation.

**Arbitrage à charge** (garde-fou central — Claude est juge et partie). Le risque n°1 d'une
boucle auto-arbitrée n'est pas l'arbitre complaisant *au cadrage*, c'est le **✓ trop généreux
en cours de boucle**. Donc : pour chaque critère, Claude cherche d'abord à le faire échouer,
et n'accorde un **✓ qu'avec sa preuve** (citation, ligne, valeur). Pas de preuve citable ⇒ ✗. Pour un **livrable outillable** (code, page HTML, PPTX, document structuré, données), la preuve d'un ✓ est la **sortie d'un oracle réellement exécuté** — rendu, script de conformité, exécution, mesure — jamais l'auto-citation du candidat ni une relecture « de tête » ; profils par type de livrable : [references/profils-arbitre.md](references/profils-arbitre.md). Oracle outillé indisponible dans la session ⇒ mode dégradé : checklist manuelle, signalée comme telle à la restitution. Les tâches légères (message, planning, arbitrage simple) gardent l'arbitre simple actuel — la proportionnalité prime.

## Améliorer une version d'une sortie automatisée (R-63, point 2)

Quand le candidat est une **nouvelle version** d'une sortie qui trie, classe, range ou rédige à la place d'un humain (règles de classement, gabarit de réponse, script de tri), l'arbitre ne juge pas les règles tenues : il juge les effets de la version. Avant la première version, mesurer l'existant sur un échantillon étiqueté hors du système : tirage par strates avec graine écrite, étiquetage à l'aveugle, désaccords posés au métier en questions fermées, plusieurs justesses et la gravité, jamais la seule couverture. Sans cette mesure de départ, pas de boucle. Cinq critères s'ajoutent alors à l'arbitre, figés au cadrage avec la borne :

1. **Test rouge sur le code précédent** — chaque règle nouvelle porte un test qui échoue sur la version précédente, puis passe sur la nouvelle ; un test déjà vert sur l'ancienne ne prouve rien (preuve : les deux sorties citées).
2. **Règle appliquée à l'existant** — la règle se rejoue sur les lignes déjà traitées, pas seulement sur les nouvelles ; une correction qui ne change aucune ligne existante n'en est pas une (preuve : le nombre de lignes existantes changées).
3. **Tirage des changements** — la version se mesure sur le même échantillon de référence et sur un tirage, avec graine écrite, des changements qu'elle fait dans toute la population ; chaque changement tiré est relu (preuve : tirés, faux).
4. **Rejet tracé** — une version qui fait baisser une justesse, augmente les erreurs graves ou dont le tirage trouve un faux est rejetée ; son numéro et sa raison restent au journal des versions, jamais effacés.
5. **Arrêt borné** — la boucle s'arrête quand deux versions consécutives gagnent moins d'un point, ou à la borne fixée au cadrage ; la restitution dit ce que seul le métier peut lever.

La taille de l'échantillon et le seuil de justesse restent des choix du métier. La chirurgie du code d'une version relève de `karpathy-coding-discipline`.

## Garde-fous

- **Fail-closed** : ambiguïté non résoluble → escalade, jamais de devinette.
- Rien d'irréversible sans validation explicite ; fort enjeu/irréversible → handoff d'emblée, hors boucle.
- À la borne, arbitre toujours en échec : livrer le meilleur candidat avec ✗ signalés, ou
  escalader si seul l'humain tranche. Jamais dépasser la borne en silence ni masquer un ✗.
- Ne remonter à l'humain que pour ce que lui seul tranche.

## Périmètre

| Famille | Exemple d'arbitre |
|---|---|
| Planning de repas | Équilibré · ≤ 30 min/plat · 0 ingrédient à racheter |
| Rédaction / peaufinage d'un message | Intention claire en 1re ligne · ton juste · ≤ N mots |
| Organisation d'un week-end | Tient dans le budget · 0 trou logistique · 1 plan B météo |
| Arbitrage d'une décision | Critères pondérés posés · option qui gagne sur ≥ 2/3 |
| Comparaison d'options | Mêmes critères pour toutes · 1 reco assumée · angles morts dits |

**Exclure — avec la bonne sortie** : réponse factuelle simple → répondre directement ; idée
encore floue à cadrer **en amont** → `clarifie-une-idee` ; boucle **logicielle** (code/API/SDK,
autre substrat) → `audite-et-corrige-l-appli` pour le cycle détecter-corriger-redéployer,
`karpathy-coding-discipline` pour la chirurgie du code ; décision à **fort enjeu ou
irréversible** → handoff direct, hors boucle.

**Limite assumée.** La boucle tourne dans la session ; c'est l'humain qui la déclenche et valide l'arbitre. L'autonomie hors-ligne (« pendant ton sommeil ») est hors périmètre. Le gain : une destination + un test définis une fois → un résultat fini, fin du babysitting.

## Exemple (run complet)

**Demande** : « Aide-moi à refuser cette invitation à une réunion. »

**Cadrage** — Destination : un message prêt à envoyer. Arbitre validé en un tour : (1) refus
clair, pas de « peut-être » ; (2) une seule raison ; (3) une alternative ; (4) ≤ 5 phrases, cordial.
**Boucle silencieuse** (non affichée) — Passe 1 : 2/4 (refus noyé, 3 raisons) → corrigé. Passe 2 : 4/4.

> Merci pour l'invitation. Je ne pourrai pas être présent : ce créneau est déjà pris par un
> engagement que je ne peux pas déplacer. Si l'échange reste utile, je suis dispo jeudi. Bonne réunion.

**Critères** (✓ = preuve citée) : refus clair ✓ (« je ne pourrai pas être présent ») · une raison
✓ (créneau pris) · alternative ✓ (« dispo jeudi ») · ≤ 5 phrases & cordial ✓ (4 phrases).
→ Mémoriser cet arbitre pour les prochains refus ?
