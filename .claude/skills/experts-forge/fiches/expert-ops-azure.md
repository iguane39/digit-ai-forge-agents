# Fiche expert — `ops-azure`

Version 1.0.0 — 11/08/2026 — Statut registre : **ok** — admise le 11/08/2026 (verdict MATERIEL 5/5,
oracle-judge session S′ `claude -p` ; dossier A/B : `fixtures/fixture-ops-azure.md` ; verdict : `run-admission/verdict-ops-azure.json`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : mandat humain TF-0081 — Azure cité au brief d'extension (continuité avec l'écosystème M365 des missions) ; toute cible `plan azure` de forge-ops consommera cette fiche
2. Corpus disponible : checklist propre constituée (`references/corpus-ops-azure.md`, sources officielles)
3. Non-recouvrement : data-platform-cloud porte les plateformes DATA (Fabric/Snowflake/Databricks), jamais le déploiement applicatif ; aucune fiche ne couvre l'exploitation Azure

## 1. domaine
`ops-azure` — exploitation d'un produit web conteneurisé sur **Azure Container Apps**, bornée aux 3 verbes de
forge-ops : déployer (sans bascule aveugle), exploiter (healthcheck, journal), restaurer
(rollback prouvé). Jamais l'architecture data, jamais le choix multi-cloud lui-même.

## 2. declencheurs
- `content_patterns` : `Container Apps|az containerapp|revision-weight|ACA|AcrPull`
- Types de demandes : plan de déploiement MEP vers Azure, revue d'un plan `ops.mjs plan azure`, cadrage staging/rollback sur Azure Container Apps
- Ne pas router : plateformes data (→ data-platform-cloud), conformité (→ conformite-rgpd-ia), autres cibles cloud (→ fiche ops-<cible> concernée).

## 3. corpus
Chemins résolus (test d'existence exécuté le 11/08/2026) :
- `.claude/skills/experts-forge/references/corpus-ops-azure.md`
- La checklist propre EST le corpus ci-dessus — constituée pour ce domaine le 11/08/2026 (TF-0081).

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-ops-azure » ;
1 à 3 annotations actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Service canonique et frontière — pourquoi Azure Container Apps, quand en sortir. (corpus §1)
2. Déploiement sans bascule aveugle — la mécanique az containerapp qui reproduit « healthcheck avant bascule ». (corpus §2-§3)
3. Rollback natif — mécanique exacte, et ce qui le rend impossible (pièges de rétention/immutabilité). (corpus §4)
4. Permissions minimales — identité de déploiement, jamais de credential dans la forge. (corpus §6)
5. Coûts et hygiène de staging — ce qu'un staging oublié coûte, quoi éteindre. (corpus §7)

## 5. frontiere
N'exécute pas, ne juge pas, ne déploie rien. Le savoir Azure uniquement — l'exécution
appartient à forge-ops (plans) et au run MEP (gestes, GO humain) ; les verdicts à oracle-ops
(O-1…O-5) et M-1…M-5. Aucune valeur réelle de compte : placeholders (`<PROJET>`, `<REGION>`).

## 6. fixture_valeur
- Demande témoin : plan MEP staging « atelier-web » vers Azure (détail : `fixtures/fixture-ops-azure.md`).
- Baseline : section A de `fixtures/fixture-ops-azure.md` — **figée le 11/08/2026 AVANT rédaction
  du corpus et de la présente fiche** (règle du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge`
  armé de la rubrique d'admission (profil `run-admission/profil-admission.json`).
