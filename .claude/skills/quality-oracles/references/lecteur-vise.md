# Rubrique « lecteur visé » d'oracle-judge — mode d'emploi (TF-1392, TF-1394, v2.17.0)

Ce que cela change pour une session qui remet un texte : deux relecteurs jouent le lecteur visé et
signalent ce qu'ils ne savent pas lui redire. Un constat n'est retenu que si les deux s'accordent.
Rien ne bloque la remise : c'est un signalement, décidé le 13/10/2026 (D-2 (a) et D-3 (a)), revu
le 2026-11-10.

## D'où vient la règle

Un livrable écrit pour des décideurs a passé tous les juges du parc ; son lecteur en a refusé
3 éléments (lot Produit-68 20260926b, RP-69). Une carte jugée floue 3 fois avec la même question est
partie quand même, sous le motif « changerait un fait », sans fait cité (RP-71). L'étude du
13/10/2026 (pilot, `output/03-etudes/20261013-etude-opportunite-juge-de-comprehension.md`) a mesuré
22 textes réels : un relecteur seul trouve 2 refus humains sur 4 et refuse à tort 3 à 8 textes
acceptés sur 18 ; l'accord de 2 relecteurs garde 2 sur 4 et ramène les faux refus à 2 sur 18.

## Le lecteur

Pris dans cet ordre : `--lecteur "<qui, pour décider quoi>"`, la section « Le lecteur » d'une fiche
de conception (`--fiche <FICHE-CONCEPTION.md>`, gabarit du pilot `gabarits/documents/`), la clé
`lecteur:` ou `destinataire:` du front matter du document. Sans lecteur : SKIP motivé.

## Lancer les 2 relecteurs

Voie recommandée dans une session Claude Code, sans dépense hors du harnais :

1. Préparer la consigne :
   `node <skills>/quality-oracles/scripts/oracle-judge.mjs <doc.md> --lecteur-vise --preparer <dossier>`
   écrit `<dossier>/consigne-relecteur.md` (rubrique figée `references/rubrique-lecteur-vise.md`,
   lecteur, document).
2. Lancer 2 sous-agents isolés (outil Agent), chacun avec cette consigne seule, sans le contexte de
   la session ; enregistrer chaque réponse JSON telle quelle : `<dossier>/lecture-A.json`,
   `<dossier>/lecture-B.json`.
3. Agréger :
   `node … oracle-judge.mjs <doc.md> --lecteur-vise --lectures <dossier>/lecture-A.json,<dossier>/lecture-B.json --revue <REVUE.md> --precedente <revue-lecteur.json précédente> --ecrire <dossier>/revue-lecteur.json`

Voie autonome : `--juge claude` fait les 2 appels par la CLI `claude -p` (environ 3 000 jetons par
unité lue et par relecteur, mesure du 13/10/2026) ; `--model <alias>` comme pour la rubrique de base.
Les lectures sont alors écrites à côté de `--ecrire` (`….lecture-A.json`, `….lecture-B.json`).

Un relecteur unique est refusé (SKIP motivé) : il ne se retient pas.

## Règles mécaniques, sans modèle

| Règle | Rouge | Vert |
|---|---|---|
| R1 refus | FLOU, INCOMPRIS, ou redite vide | COMPRIS avec une redite écrite |
| R2 accord | les 2 relecteurs refusent : CONSTAT RETENU (`warn`) | un seul refuse : DÉSACCORD TRACÉ (`info`), aucun constat |
| R3 question répétée | constat retenu sur une unité déjà refusée à la lecture précédente, avec une question proche (mots pleins communs ≥ 50 %) : QUESTION RÉPÉTÉE (`warn`) | unité comprise avant, ou question sans rapport |
| R4 suites | constat retenu absent de REVUE.md : SUITE ABSENTE ; « changerait un fait » sans fait cité dans sa cellule : MOTIF SANS FAIT CITÉ | « réécrit : … », ou « sans suite : changerait un fait : « le fait » » (guillemets, accents graves ou nombre) |

Verdict toujours PASS, exit 0 : aucun constat n'est `bloquant`. La recette (`scripts/self-test.mjs`,
bloc TF-1392/TF-1394, et la paire `judge-lecteur-vise` du manifeste) joue chaque règle dans ses deux
sens sur des lectures enregistrées, sans appel de modèle.

## Où s'écrivent les traces

- **REVUE.md** : à côté du livrable (ou `forge/etapes/…` pour un run), forme du gabarit
  `digit-ai-page-html/references/gabarit-revue-de-lecture.md`. Une ligne par constat retenu, qui
  nomme l'unité (`u3`) et sa suite : « réécrit : <nouvelle phrase> », ou « sans suite : changerait
  un fait : « <le fait> » ».
- **revue-lecteur.json** (`--ecrire`) : la lecture agrégée, à côté de REVUE.md. Elle sert de
  `--precedente` à la lecture suivante ; son champ `questions_a_remonter` liste les questions
  répétées.
- **La question répétée** se montre à l'humain AVANT la remise : la session la recopie dans
  REVUE.md (section « Questions remontées à l'humain ») et dans le message de remise, au bloc des
  questions posées. Elle ne bloque pas la remise.

## Hors de portée : la périphrase

La périphrase que le relecteur redit sans la voir : à la mesure du 13/10, les 3 relecteurs ont jugé
COMPRIS « un nom de dépôt » qui ne nommait rien. La règle du sujet nommé, côté pilot
(`oracle-ecriture`, EC-11, avertissement), couvre ce cas.

## Avant toute bascule en blocage

Décision humaine, sur une mesure d'au moins 100 unités dont 10 refusées par un humain, faux refus
de 10 % au plus. Revue le 2026-11-10.
