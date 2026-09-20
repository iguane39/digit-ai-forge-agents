# Chapitre 4 — Factcheck · Audit des prémisses

Fixture ROUGE (TF-1185, 17/09/2026) : la forme qu'avait l'analyse AVANT la règle du Ch4. Le prompt
analysé désigne deux rapports par leur URL et affirme de l'un qu'il est « accessible ici ». Cette
affirmation porte toute la comparaison : sans ancre ouverte, il n'y a rien à comparer. Aucune des
deux prémisses n'a été mesurée, et aucune ne dit quel test manquait.

| Prémisse | Verdict | Motif |
|---|---|---|
| « l'ancien rapport est accessible ici » (URL de l'espace a590428a) | invérifiable | l'accès dépend des droits de l'exécutant, hors de portée de l'analyse |
| « le nouveau rapport est publié dans l'espace de travail 7c5ac50b » | invérifiable | même motif : l'accès ne se vérifie pas depuis cette session |

L'ancien rapport (URL de l'espace a590428a) est donc inaccessible pour l'exécutant : la comparaison
se fera contre l'instantané du 2025-12-08, et la prémisse est remontée au Chapitre 3 taguée
majeure.
