# Analyse L99 — Prompt Console (cas VERT)

La même analyse, écrite une seule fois. Les quatre règles de forme de `couches.md` sont
appliquées à l'écriture plutôt que rattrapées en quatre itérations.

## Chapitre 1 — OODA · Cadrage stratégique + Étalon noté

Le prompt perd 59 points sur 100, et les trois quarts de cette perte tiennent à un seul silence :
il ne dit ni pour qui, ni sous quelle forme, ni comment on saura que c'est réussi.

Le tableau ci-dessous se lit ligne par ligne, chaque ligne étant une dimension de la rubrique
d'étalon : la colonne **Pts** est le maximum atteignable, la colonne **Note** ce que le prompt
obtient, et les lignes sont classées par perte décroissante. Ce sont les deux premières lignes
qui décident du score, les quatre suivantes ne font que le nuancer.

| Dimension | Pts | Note | Perte | Justification |
|---|---|---|---|---|
| Spécification | 20 | 6 | 14 | ni audience, ni longueur, ni format attendu |
| Vérifiabilité de la sortie | 15 | 3 | 12 | aucun critère observable n'est posé |
| Garde-fous & contraintes | 15 | 4 | 11 | rien n'est écrit sur ce qu'il ne faut pas faire |
| Robustesse | 15 | 5 | 10 | deux lectures divergentes restent possibles |
| Ancrage / contexte | 15 | 9 | 6 | le contexte est supposé connu du modèle |
| Clarté de l'intention | 20 | 14 | 6 | la tâche est dite, le résultat attendu non |

Le prompt annonce **8 vues** et **22 critères** de sortie (source : prompt analysé, section
« Contrat de sortie », lignes 40 à 62). Ces deux chiffres sont repris tels quels du prompt ; ils
ne sont pas recalculés ici.

## Chapitre 3 — Blindspots · Inventaire maître

Trois défauts seulement, mais le premier suffit à plafonner le score : sans audience, tout le
reste du prompt est interprétable dans les deux sens.

Le tableau se lit par sévérité décroissante ; un **bloquant** plafonne le score à 40/100 quel que
soit le reste, un **majeur** ne retire des points que dans sa dimension.

| # | Défaut | Sévérité | Dimension touchée |
|---|---|---|---|
| 1 | l'audience de la page n'est jamais dite | bloquant | Spécification |
| 2 | le format de sortie n'est pas posé | majeur | Spécification |
| 3 | **RD-23** *(renvoi de design 23 : la règle de repli des tableaux longs)* est cité sans être tracé à sa source | majeur | Ancrage / contexte |

Les défauts 1 et 2 sont clôturés au Chapitre 8 ; le défaut 3 remonte au producteur du livrable,
qui seul détient la source.
