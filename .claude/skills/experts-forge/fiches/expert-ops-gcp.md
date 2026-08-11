# Fiche expert — `ops-gcp`

Version 1.0.0 — 11/08/2026 — Statut registre : **ok** — admise le 11/08/2026 (verdict MATERIEL 5/5,
oracle-judge session S′ `claude -p` ; dossier A/B : `fixtures/fixture-ops-gcp.md` ; verdict : `run-admission/verdict-ops-gcp.json`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : mandat humain TF-0081 (extension hyperscalers) — GCP cité au brief d'extension ; toute cible `plan gcp` de forge-ops consommera cette fiche
2. Corpus disponible : checklist propre constituée (`references/corpus-ops-gcp.md`, sources officielles)
3. Non-recouvrement : data-platform-cloud porte les plateformes DATA (Fabric/Snowflake/Databricks), jamais le déploiement applicatif ; aucune fiche ne couvre l'exploitation GCP

## 1. domaine
`ops-gcp` — exploitation d'un produit web conteneurisé sur **Cloud Run — service conteneur managé**, bornée aux 3 verbes de
forge-ops : déployer (sans bascule aveugle), exploiter (healthcheck, journal), restaurer
(rollback prouvé). Jamais l'architecture data, jamais le choix multi-cloud lui-même.

## 2. declencheurs
- `content_patterns` : `Cloud Run|gcloud run|révision Cloud Run|update-traffic|Artifact Registry`
- Types de demandes : plan de déploiement MEP vers GCP, revue d'un plan `ops.mjs plan gcp`, cadrage staging/rollback sur Cloud Run — service conteneur managé
- Ne pas router : plateformes data (→ data-platform-cloud), conformité (→ conformite-rgpd-ia), autres cibles cloud (→ fiche ops-<cible> concernée).

## 3. corpus
Chemins résolus (test d'existence exécuté le 11/08/2026) :
- `.claude/skills/experts-forge/references/corpus-ops-gcp.md`
- La checklist propre EST le corpus ci-dessus — constituée pour ce domaine le 11/08/2026 (TF-0081).

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-ops-gcp » ;
1 à 3 annotations actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Service canonique et frontière — pourquoi Cloud Run — service conteneur managé, quand en sortir. (corpus §1)
2. Déploiement sans bascule aveugle — la mécanique gcloud run qui reproduit « healthcheck avant bascule ». (corpus §2-§3)
3. Rollback natif — mécanique exacte, et ce qui le rend impossible (pièges de rétention/immutabilité). (corpus §4)
4. Permissions minimales — identité de déploiement, jamais de credential dans la forge. (corpus §5)
5. Coûts et hygiène de staging — ce qu'un staging oublié coûte, quoi éteindre. (corpus §6)

## 5. frontiere
N'exécute pas, ne juge pas, ne déploie rien. Le savoir GCP uniquement — l'exécution
appartient à forge-ops (plans) et au run MEP (gestes, GO humain) ; les verdicts à oracle-ops
(O-1…O-5) et M-1…M-5. Aucune valeur réelle de compte : placeholders (`<PROJET>`, `<REGION>`).

## 6. fixture_valeur
- Demande témoin : plan MEP staging « atelier-web » vers GCP (détail : `fixtures/fixture-ops-gcp.md`).
- Baseline : section A de `fixtures/fixture-ops-gcp.md` — **figée le 11/08/2026 AVANT rédaction
  du corpus et de la présente fiche** (règle du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge`
  armé de la rubrique d'admission (profil `run-admission/profil-admission.json`).
