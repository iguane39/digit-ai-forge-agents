# Mode « L99 boucle » — réécrire jusqu'à ce qu'un relecteur aveugle ne trouve plus de défaut majeur

TF-1831, décidé le 16/10/2026 (D-1 (a)). Étude d'origine : pilot `digit-ai-factory`,
`output/03-etudes/20261016-etude-opportunite-boucle-l99-jusqu-a-un-score.md`.

## Pourquoi ce mode existe

Le score « projeté » du Ch8 est une auto-estimation. Sur 28 analyses publiées au 16/10/2026, il
valait 86 à 94, que le prompt d'origine parte de 20 ou de 79. Renotés à l'aveugle par un agent
neuf, 5 prompts réécrits ont perdu de 6 à 12 points, et le relecteur y a trouvé 2 bloquants et
22 majeurs. Une boucle où L99 se renote lui-même s'arrêterait donc à la première passe sans rien
gagner. Ce mode boucle seulement si le juge n'est pas l'auteur.

## Déclenchement

Le mode s'ouvre quand la demande contient « L99 boucle », « en boucle » ou « jusqu'à un score ».
Il s'ouvre aussi quand l'utilisateur fixe un seuil (« jusqu'à 90 »).

**Ouverture d'office** (TF-2022, autorisation humaine du 29/10/2026 : « Est-ce que tu peux le
lancer si tu estimes que cela est nécessaire et/ou préférable ? »). Sans signal, la session ouvre
le mode quand elle l'estime nécessaire ou préférable, et d'office dans trois cas :

- le prompt réécrit lancera un run, un mandat ou une campagne d'agents qui écrit (prompt de run :
  2 relecteurs, voir « Une passe ») ;
- il sera réutilisé : template, system prompt, consigne d'agent ;
- l'analyse a relevé un défaut bloquant.

Le Ch8 dit en une ligne pourquoi le mode a été ouvert, ou pourquoi il ne l'a pas été. Hors de ces
cas et sans signal, L99 garde son mode simple, et le score du Ch8 s'écrit « projeté (non mesuré) ».

## L'arbitre, figé avant la passe 1

Écrire au journal, avant toute réécriture, `arbitre` :

- `rubrique` : la rubrique du Ch1 (6 dimensions, 100 points, plafond de 40 pour tout bloquant),
  inchangée d'une passe à l'autre ;
- `arret` : « 0 bloquant et 0 majeur » ; seuil de score optionnel, donné par l'utilisateur ;
- `gain_min` : 3 points ;
- `borne` : 3 passes ;
- `garde_longueur` : 15 % ;
- `retenue` : `union_recomptee` ;
- `verification_cloture` : `true` ;
- `rejet_regression` : `true`.

**Les trois dernières clés sont la règle de l'essai D-111 (a)** (décision humaine du 29/10/2026,
réponse « 111a », sujet TF-2026, revue le 16/11/2026). Elles viennent de l'étude
`output/03-etudes/Digit-AI - Étude - Amelioration de la boucle de relecture L99 - 20261029f.md`
du pilot. Sur un même prompt de départ noté 74 par un jury fixe, la retenue à l'union recomptée
(variante B) et sa version vérifiée (variante C) obtiennent 79, la règle « vu par les deux »
(variante A) 77. La variante à quatre relecteurs sans vérification (E) tombe à 40, sur un défaut
bloquant que sa correction a créé et que le vérificateur de C avait attrapé. Un journal sans ces
clés est jugé par les règles d'avant.

**Extension jusqu'à 5 passes** (TF-2024, autorisation humaine du 29/10/2026 : « Adapte pour
aller jusqu'à 5 passes si estimé nécessaire. »). À la borne de base, ou plus tôt, la session
prolonge la boucle quand elle l'estime nécessaire, à deux conditions : la dernière passe a gagné
au moins `gain_min` points, et des défauts graves restent retenus. Elle écrit alors au journal
`arbitre.extension` : `borne` (au plus 5), `motif` et `decidee_apres_passe`. L'oracle refuse une
extension au-delà de 5, sans motif, ou décidée après une passe qui ne gagne plus.

Le seuil de score ne suffit jamais à arrêter : un prompt mesuré 84 avec 3 majeurs ouverts
n'est pas fini (P5 de l'étude).

## Une passe

1. **Réécrire.** À la passe 1, c'est l'analyse L99 complète et son prompt réécrit. Aux passes
   suivantes, la réécriture ne corrige que les défauts retenus à la passe précédente : elle ne
   refait pas l'analyse.
1 bis. **Vérifier la correction** (passes 2 et suivantes, D-111 (a)). Un agent NEUF, AVEC
   contexte, lit les défauts retenus à la passe précédente, le prompt avant correction et le
   prompt corrigé. Il dit pour chaque défaut s'il est fermé, citation à l'appui, et relève les
   défauts que la correction a créés : chiffre faux, renvoi cassé, contradiction, prémisse fausse.
   Il ne note jamais. Ses signalements, recomptés à la source, sont corrigés une fois avant la
   relecture aveugle. Le journal porte `verification_cloture` : `agent`, `note: false`, `clotures`,
   `defauts_crees`. Coût mesuré le 29/10/2026 : environ 81 000 jetons pour le vérificateur et
   73 000 pour la correction de ses signalements.
2. **Faire relire à l'aveugle.** Lancer un agent NEUF (outil Agent, même famille de modèle par
   défaut). Il reçoit uniquement :
   - le chemin du prompt réécrit, extrait seul dans un fichier ;
   - la rubrique du Ch1 et les définitions de sévérité du Ch3 (`references/couches.md`) ;
   - l'autorisation de vérifier les prémisses en lecture seule ;
   - l'INTERDIT d'ouvrir l'analyse, les passes précédentes et leur journal.
   Consigne à charge : un point n'est accordé qu'avec une citation du prompt. Sortie attendue :
   le JSON de l'annexe ci-dessous. Pour un prompt de run, lancer 2 relecteurs. Retenue à
   l'union recomptée (D-111 (a)) : un défaut grave vu par au moins un relecteur est retenu s'il
   tient au recompte de l'étape 3 ; il n'est écarté que si le recompte le dément (`dementi: true`
   au journal). L'ancienne règle, ne retenir qu'un défaut vu par les 2 (celle
   d'`oracle-judge --lecteur-vise`), jetait des défauts réels : 13 des 14 défauts ainsi écartés
   le 29/10/2026 tenaient au recompte.
3. **Recompter avant de retenir.** Chaque défaut bloquant ou majeur du relecteur se vérifie à la
   source, par une commande exécutée (`git grep`, lecture du fichier, comptage). Un défaut que
   le recompte dément est écarté, avec sa commande. Mesuré le 16/10/2026 : 2 chiffres de
   relecteur sur 5 prompts étaient faux, dont un défaut qui n'existait pas.
4. **Mesurer la longueur** du prompt en mots.
5. **Décider la suite.** Une passe dont le prompt grossit de plus de 15 % sans clore un majeur
   est REJETÉE : on repart de la version précédente. Une passe dont le score mesuré baisse sous
   la passe gardée précédente est REJETÉE aussi (D-111 (a)) : la boucle s'arrête sur la passe
   gardée, raison `regression`, et c'est elle qui est livrée. Sinon, on s'arrête au premier cas
   atteint :
   - 0 bloquant et 0 majeur retenus, et seuil de score tenu s'il y en a un ;
   - gain de score mesuré inférieur à 3 points par rapport à la passe retenue précédente ;
   - borne de 3 passes, ou de l'extension déclarée (5 au plus).

## Ce que le Ch8 affiche dans ce mode

- **Score mesuré**, celui du relecteur sur la dernière passe retenue, jamais « projeté ».
- La table des passes : score mesuré, bloquants et majeurs retenus, défauts écartés au recompte,
  mots, décision.
- La raison de l'arrêt, en clair. À la borne, avec des majeurs encore ouverts, les nommer : le
  prompt est livré avec eux, jamais présenté comme fini.
- La péremption : tout prompt réécrit ouvre par une ÉTAPE 0 qui remesure ses prémisses d'état
  (fichiers, comptes, existence de ce qu'il demande de créer) au moment de l'exécution. 3 des 5
  prompts de l'étude ont été plafonnés par une prémisse que leur propre exécution avait rendue fausse.

## Journal et oracle

Le journal de boucle s'écrit en JSON à côté de l'analyse (`<analyse>.boucle.json`). Il se juge par
`node {skilldir}/scripts/oracle-boucle-l99.mjs <journal.json>` (B1 à B10, exit 0/1/2). Un mode
boucle sans journal PASS n'est pas un mode boucle.

```json
{
  "schema": "l99-boucle@1",
  "prompt": "titre du prompt analysé",
  "arbitre": { "rubrique": "couches.md Ch1, 6 dimensions /100", "arret": "0 bloquant et 0 majeur",
               "seuil_score": null, "gain_min": 3, "borne": 3, "garde_longueur": 0.15 },
  "passes": [
    { "n": 1, "fichier": "prompt-p1.md", "mots": 1209,
      "relecteur": { "agent": "id ou nom", "aveugle": true, "interdits": ["analyse", "passes précédentes"] },
      "score_mesure": 84,
      "defauts": [
        { "severite": "majeur", "citation": "…", "recompte": { "commande": "git grep …", "resultat": "…" },
          "statut": "retenu" }
      ],
      "majeurs_clos": 0, "rejetee": false, "decision": "continuer" }
  ],
  "arret": { "passe": 2, "raison": "zero_majeur" },
  "score_affiche": { "valeur": 91, "nature": "mesure" }
}
```

`decision` vaut `continuer`, `arreter` ou `rejeter`. `arret.raison` vaut `zero_majeur`,
`gain_insuffisant`, `borne` ou `regression`. Sous l'essai D-111 (a), l'arbitre porte en plus
`retenue`, `verification_cloture` et `rejet_regression`, et l'oracle joue B8 à B10.

## Annexe — sortie demandée au relecteur

```json
{"score": 0, "dimensions": {"clarte": 0, "specification": 0, "garde_fous": 0, "ancrage": 0,
 "verifiabilite": 0, "robustesse": 0}, "bloquants": [{"citation": "", "defaut": "", "correction": ""}],
 "majeurs": [], "mineurs_nombre": 0, "premisses_verifiees": 0, "premisses_fausses": []}
```

## Ce que le mode rapporte, mesuré

`node {skilldir}/scripts/releve-boucles.mjs <racine> [--json]` relève tous les journaux
`*.boucle.json` sous une racine. Il rend le score de la passe 1 et celui de l'arrêt, les défauts
graves avant et après, puis le gain médian. Règle de l'étude d'origine : si le gain médian reste
sous 3 points, le mode redevient optionnel et le seul score mesuré devient le défaut. La revue
est datée au registre du pilot (TF-1831, `revue_le` 2026-11-16), et le relevé d'ouverture du pilot
la signale à sa date.

## Coût mesuré

Une relecture : de 68 à 432 secondes, de 69 000 à 75 000 jetons (5 relectures du 16/10/2026). Une
boucle complète coûte donc de 1 à 3 relectures en plus de l'analyse.
