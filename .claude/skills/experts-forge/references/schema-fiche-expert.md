# Schéma canonique `fiche-expert` — 6 champs obligatoires

Version 1.0.0 — 21/07/2026. Source : « Digit-AI - Cadrage Forge - Pool Experts - 20260721a.md » §3. Aligné sur la contrainte forge « schémas ≤ 6 champs obligatoires ».

| # | Champ | Contenu | Règle dure |
|---|---|---|---|
| 1 | `domaine` | Nom unique du domaine, clé du registre | Unicité dans `registre-experts.md` ; kebab-case |
| 2 | `declencheurs` | Motifs de routage : `content_patterns` (regex) + types de demandes en clair | Même grammaire que le routage par contenu de `run-oracles` (quality-oracles) |
| 3 | `corpus` | Sources réellement lues : chemins résolubles vers références de skills, checklists, documents | Corpus vide ou chemin non résolu = fiche refusée |
| 4 | `rubrique` | Grille de contribution figée (3 à 7 axes) + format de sortie imposé | Sortie = annotations identifiées par expert ; jamais de réécriture de la réponse de base |
| 5 | `frontiere` | Ce que l'expert ne fait pas | N'exécute pas, ne juge pas, ne réécrit pas — pendant du contrat de frontière `agent.def` |
| 6 | `fixture_valeur` | Demande témoin + baseline + contribution attendue + critère de différence matérielle | Condition d'admission ; rejouable ; verdict humain (2 premières fiches) puis `oracle-judge` |

## Loi fondatrice

> **« Un expert qui ne change pas matériellement une réponse n'est pas un expert. »**

Pendant du critère 6 du standard §3 de quality-oracles. Critère indicatif de « matériel » : la contribution ajoute un élément actionnable absent de la baseline (risque, question, limite structurante), ancré dans le corpus cité. Une contribution transposable telle quelle à n'importe quelle demande est « non matériel ».

## Critère « mérite un expert » (3 conditions cumulatives)

1. **Récurrence** : le domaine revient dans des demandes qui ne déclenchent aucun skill métier directement.
2. **Corpus disponible** : sources exploitables existantes ou constituables à coût borné.
3. **Non-recouvrement** : la contribution n'est pas déjà rendue par le déclenchement naturel d'un skill existant.
