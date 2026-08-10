# Fiche expert — `data-platform-cloud`

Version 1.0.0 — 24/07/2026 — Statut registre : **ok** — admise le 24/07/2026 (verdict MATERIEL, oracle-judge en session S′ ; dossier A/B : `fixtures/fixture-data-platform-cloud.md`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : 4 clients plateformes data (Databricks, Fabric, Fabric Medallion, Snowflake)
2. Corpus disponible : checklist propre constituée (couches, vues système, FinOps, RBAC, catalogage, Fabric vs Snowflake)
3. Non-recouvrement : la fiche data couvre les flux, data-quality-auditor les datasets, digit-ai-schemas le dessin — personne ne porte l'architecture de plateforme

## 1. domaine
`data-platform-cloud` — architecture et exploitation des plateformes data cloud : modèles par couches (médaillon, ODS/FACTORY/HUB-MART), vues système à exploiter (ACCOUNT_USAGE, QUERY_HISTORY, Capacity Metrics), FinOps requêtes, gouvernance RBAC, catalogage et contrats de données, spécificités Fabric vs Snowflake.

## 2. declencheurs
- `content_patterns` : `plateforme data|entrepôt de données|data warehouse|lakehouse|Snowflake|Microsoft Fabric|Databricks|médaillon|Bronze.Silver.Gold|FinOps|pipeline ELT|pipeline ETL`
- Types de demandes : cadrage ou audit d'une plateforme data cloud, arbitrage d'architecture entrepôt/lakehouse, structure de coûts
- Ne pas router : flux et échanges de données (→ data), profilage d'un dataset (→ data-quality-auditor), dessin d'architecture (→ digit-ai-schemas), conformité des traitements (→ conformite-rgpd-ia).

## 3. corpus
Chemins résolus (test d'existence exécuté le 23/07/2026 par scaffold-expert) :
- `.claude/skills/experts-forge/references/corpus-data-platform-cloud.md`
- La checklist propre EST le corpus ci-dessus (7 points, `corpus-data-platform-cloud.md`) — constituée pour ce domaine le 23/07/2026.

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-data-platform-cloud» ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Localisation des irritants dans le modèle en couches — quelle frontière de couche concentre le problème. (corpus §1)
2. Sources système à exploiter d'office — ce que la plateforme journalise déjà et que l'audit doit requêter. (corpus §2)
3. Structure de coûts — stockage vs calcul, requêtes coûteuses, dimensionnement. (corpus §3)
4. Gouvernance — RBAC, propriétaires de domaines, catalogage et contrats de données. (corpus §4-§5)
5. Angles morts de l'enveloppe — ce que la mission NE couvre pas, déclaré dans la proposition. (corpus §7)

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. Les flux → `data` ; les datasets → `data-quality-auditor` ; le dessin → `digit-ai-schemas` ; la conformité → `conformite-rgpd-ia` (frontière stricte de l'inventaire P2 E4).

## 6. fixture_valeur
- Demande témoin : cadrage d'un audit de plateforme Snowflake ~15 jh chez un retailer (détail : `fixtures/fixture-data-platform-cloud.md`).
- Baseline : section A de `fixtures/fixture-data-platform-cloud.md` — baseline reconstituée figée le 23/07/2026 AVANT rédaction de la présente fiche (fil client inaccessible depuis le repo, écart documenté du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`.
