# Détail des 8 couches d'analyse L99

Spécification complète de chaque chapitre. Charger ce fichier avant toute analyse.

## Principe directeur — double ancrage (à appliquer à TOUTES les couches)

Les 8 couches ne sont ni des silos indépendants (→ redondance) ni une chaîne linéaire
(→ propagation d'erreur par ancrage). Elles fonctionnent en **double ancrage** :

1. **Ancre fixe = le prompt d'origine.** Chaque couche relit le prompt original, à chaque
   fois, sans filtre. Aucune couche ne travaille en aveugle sur la seule synthèse de la
   précédente. C'est ce qui préserve les « yeux neufs » : un défaut raté par une couche
   reste rattrapable par une autre.
2. **Registre = les sorties des couches précédentes.** Sert à UNE chose : interdire de
   redire. Si un point est déjà couvert, la couche doit l'**escalader** (le pousser plus
   loin) ou apporter du **neuf** — jamais le restater. Le registre ne restreint jamais le
   périmètre d'analyse.
3. **Boucle de correction ascendante.** Une couche aval qui repère un défaut manqué en
   amont le **remonte** à l'inventaire maître (Chapitre 3) au lieu de le garder pour elle.
   La chaîne est corrective, pas cumulative-aveugle.

Conséquence pratique : on relit toujours la source, on ne répète jamais, on remonte
toujours les trous découverts tard.

## Sévérité — tag obligatoire dès le Chapitre 3

Chaque défaut identifié porte un tag :
- **bloquant** : le prompt échouera ou produira un résultat inexploitable.
- **majeur** : dégrade fortement la qualité, mais le prompt « marche ».
- **mineur** : cosmétique ou marginal.

Les bloquants et majeurs traversent tout le pipeline jusqu'à correction au Chapitre 8.
Les mineurs sont listés une fois, sans suivi.

---

### Chapitre 1 — OODA · Cadrage stratégique + Étalon noté

Structurer en 4 sous-sections + 1 étalon noté :

- **Observe** : Que dit réellement ce prompt ? Faits, intentions et contraintes explicites. Citer les passages clés.
- **Orient** : Dans quel contexte s'inscrit-il ? Objectif profond derrière la demande ? Persona implicite de l'auteur et du destinataire (le LLM).
- **Decide** : 2-3 stratégies alternatives pour y répondre de manière optimale.
- **Act** : Approche concrète recommandée, justifiée.
- **Étalon** : Avant toute critique, poser à quoi ressemble le **prompt idéal** pour cette intention — les **critères de réussite** explicites (format, audience, contraintes, garde-fous attendus). C'est le mètre-étalon que les couches suivantes utilisent pour mesurer l'écart. On ne critique pas un écart sans avoir posé la cible.

**Rubrique de notation (le score, pas un mot).** L'étalon est noté sur 100, réparti en 6 dimensions. C'est le chiffre de référence du Chapitre 8 (score avant → après).

| Dimension | Pts | Ce qu'on mesure |
|---|---|---|
| Clarté de l'intention | 20 | La tâche et le résultat attendu sont-ils non ambigus ? |
| Spécification | 20 | Format, longueur, audience, ton sont-ils posés ? |
| Garde-fous & contraintes | 15 | Ce qu'il ne faut PAS faire, limites, exclusions |
| Ancrage / contexte | 15 | Le prompt fournit-il (ou fait-il chercher) le contexte nécessaire ? |
| Vérifiabilité de la sortie | 15 | Peut-on juger si la réponse est bonne ? (préfigure le contrat Ch8) |
| Robustesse | 15 | Résistance aux interprétations divergentes et au détournement |

Règle d'arrimage à la sévérité : **tout défaut bloquant plafonne le score à 40/100** (zone échec), quel que soit le reste. Chaque défaut majeur retire des points dans sa dimension. Donner le score chiffré ici, dimension par dimension, avec une ligne de justification.

---

### Chapitre 2 — Chainlogic · Raisonnement en chaîne (conditionnelle)

**Condition d'application** : seulement si le prompt contient une vraie chaîne d'instructions ou un raisonnement multi-étapes.

Si oui :
- Formaliser sous forme Si A → alors B → donc C.
- Signaler toute rupture logique, saut non justifié ou présupposé non étayé.
- Vérifier que l'enchaînement des instructions est cohérent et sans contradiction.

Si non (prompt simple, mono-instruction) : une ligne « pas de chaîne logique interne ». Puis analyser à la place les **collisions et dépendances entre instructions** : deux consignes qui se contredisent, un ordre implicite non dit, une instruction qui en désactive une autre.

---

### Chapitre 3 — Blindspots · Inventaire maître

Couche pivot : c'est **l'unique liste de référence** des trous. Tout défaut identifié ici — ou remonté depuis une couche aval via la boucle de correction (y compris les faussetés du Chapitre 4) — y figure, tagué en sévérité.

Identifier ce que le prompt **ne dit pas** :

- Hypothèses implicites non formulées
- Ambiguïtés qui pourraient mener à des interprétations divergentes
- Cas limites non couverts (edge cases)
- Contraintes oubliées (format, longueur, ton, audience, etc.)
- Biais cognitifs probables de l'auteur (ancrage, confirmation, curse of knowledge…)

Chaque entrée : description + tag **bloquant / majeur / mineur**.

---

### Chapitre 4 — Factcheck · Audit des prémisses (conditionnelle)

**Condition d'application** : seulement si le prompt contient des affirmations factuelles, des entités nommées, des dates, des chiffres, de l'actualité, ou demande au modèle de traiter quelque chose comme vrai.

Ch3 traque les **omissions** (ce que le prompt ne dit pas). Ce chapitre traque les **erreurs de commission** : ce que le prompt affirme et qui est faux — et que le LLM amplifierait docilement.

Si la condition est remplie :
- Lister chaque affirmation vérifiable du prompt.
- Marquer chacune : **vrai / faux / périmé / invérifiable**.
- Pour chaque prémisse **fausse ou périmée** : la **remonter au Chapitre 3** taguée **bloquant** (le résultat sera construit sur du faux).
- Pour chaque prémisse **invérifiable** : la remonter au Chapitre 3 taguée **majeur** + recommander une vérification (source à exiger, recherche à lancer).
- Ne pas trancher au doigt mouillé : si la véracité dépend d'un fait hors de portée, le dire et le classer invérifiable plutôt que d'inventer un verdict.

Si non (aucune prémisse factuelle) : une ligne « aucune affirmation factuelle vérifiable, couche non déclenchée ».

---

### Chapitre 5 — Premortem · Anticipation d'échec

Relire l'origine (ancre fixe), puis se projeter dans le futur : ce prompt a été utilisé et le résultat a été décevant ou contre-productif.

Lister les **5 causes les plus probables** de cet échec, classées par probabilité décroissante. Pour chacune :
- Décrire le scénario d'échec
- Expliquer le mécanisme (pourquoi ça échoue)
- Proposer une mitigation

**Discipline build-on** : chaque cause doit soit **escalader** un défaut de l'inventaire (Ch3) en le projetant concrètement en échec, soit être un défaut **neuf** — auquel cas elle est **remontée au Chapitre 3** (boucle de correction). Interdiction de simplement restater un blindspot sans le transformer en scénario.

---

### Chapitre 6 — Wargame · Stress-test adversarial (+ lentille robustesse)

Relire l'origine, puis attaquer **l'étalon (Ch1) et la direction de réécriture** — pas seulement re-lister les trous. Jouer successivement 3 rôles :

1. **L'utilisateur exigeant** : Qu'est-ce qui manque pour que ce prompt donne un résultat professionnel et exploitable ?
2. **L'expert du domaine** : Quelles erreurs de fond ou approximations un spécialiste relèverait-il ?
3. **Le contradicteur** : Comment un LLM pourrait-il mal interpréter, contourner l'intention, ou produire une réponse techniquement conforme mais inutile (conformité littérale paresseuse) ?

**Lentille robustesse — obligatoire si le prompt est un system prompt, une instruction d'agent ou un template réutilisable** : surface d'injection, collision avec d'autres instructions, mauvais usage d'outil, contournement de la hiérarchie d'instructions. Inclure ici la question du **calibrage** : le prompt suppose-t-il des capacités que le modèle ou le runtime cible n'a pas (fenêtre de contexte, outils, taille de modèle, modèle local vs frontier) ? Tout défaut neuf trouvé ici remonte au Chapitre 3.

---

### Chapitre 7 — Deepthink · Implications profondes (conditionnelle)

**Condition d'application** : seulement si le prompt est un template réutilisable, un system/agent prompt, ou un prompt à haute fréquence d'usage.

Si oui — analyser les conséquences de 2e et 3e ordre :
- Que se passe-t-il à grande échelle ou en répétition fréquente ?
- Comment se comporte-t-il s'il est adapté à d'autres contextes ou domaines ?
- Quels effets émergents (positifs ou négatifs) personne ne voit venir ?
- Le prompt crée-t-il des dépendances, des habitudes ou des biais systémiques ?

Si non (prompt one-shot) : une ligne « prompt one-shot, effets d'échelle non pertinents ». Ne pas forcer d'analyse hors-sol.

---

### Chapitre 8 — Synthèse & Prompt amélioré (traçable)

Ce chapitre est le livrable principal. Il contient :

1. **Score /100 (avant → après)** : reprendre la rubrique du Ch1. Donner le score du prompt original, puis le score projeté du prompt réécrit, dimension par dimension si l'écart le justifie. C'est la mesure du gain — sans elle, « améliorer » reste invérifiable.
2. **Diagnostic en 3 lignes** : résumé des forces et faiblesses majeures du prompt original.
3. **Prompt réécrit** : version optimisée, prête à copier-coller. Il doit :
   - Conserver l'intention originale.
   - **Clôturer explicitement chaque défaut bloquant et majeur** de l'inventaire (Ch3), faussetés du Ch4 et mitigations du Ch5 incluses.
   - Atteindre l'étalon posé au Ch1.
   - Être directement utilisable (pas de placeholder sauf si le prompt original en contenait).
4. **Contrat de sortie** : critères d'acceptation **vérifiables** que la réponse produite par le prompt réécrit devra satisfaire (ex. « doit contenir X », « ≤ N mots », « cite ses sources », « pas de Y »). L'étalon Ch1 cadre le *prompt* ; le contrat cadre la *sortie*. Embarquer ce contrat dans le prompt réécrit chaque fois que c'est possible, et le rappeler ici en clair.
5. **Changelog tracé** : chaque modification est rattachée au défaut qu'elle corrige (ex. « +audience → bloquant Ch3 #2 / cause d'échec Ch5 #1 »). Aucune correction ne sort du chapeau : tout se rattache à un défaut nommé.

---

## Note sur le mode L50

L50 = Chapitres 1, 3, 8. Avec cette architecture, L50 devient une boucle serrée et cohérente :
**étalon noté (Ch1) → inventaire taggé (Ch3) → prompt réécrit + score + contrat (Ch8)**. C'est le
minimum viable qui conserve l'ancrage sur l'origine, la mesure chiffrée et la traçabilité des
corrections. Le Factcheck (Ch4) reste hors L50 : conditionnel et orthogonal au minimum structurel.
