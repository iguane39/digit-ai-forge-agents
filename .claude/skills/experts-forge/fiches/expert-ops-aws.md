# Fiche expert — `ops-aws`

Version 1.0.0 — 11/08/2026 — Statut registre : **ok** — admise le 11/08/2026 (verdict MATERIEL 5/5,
oracle-judge session S′ `claude -p` ; dossier A/B : `fixtures/fixture-ops-aws.md` ; verdict : `run-admission/verdict-ops-aws.json`).

**Service déprécié le 21/11/2026 (TF-2745, L-03)** : AWS App Runner est fermé aux nouveaux clients et AWS recommande Amazon ECS
Express Mode (pages lues le 22/11/2026, `references/corpus-ops-aws.md`, en-tête et point 8). Mise à jour du corpus source
uniquement : le domaine ci-dessous (§1), les déclencheurs (§2), la rubrique et le verdict d'admission du 11/08/2026 restent
tels qu'ils ont été jugés, **non rejugés** — une fiche qui annote un plan AWS pour un nouveau client doit dire que le service
visé n'est plus ouvert et renvoyer au point 8 du corpus ; la fiche d'un service de remplacement (rubrique, fixture, admission)
reste à écrire, et la cible `plan aws` de forge-ops est à revoir (reste au rapport du lot fag du 22/11/2026).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : mandat humain TF-0081 — AWS cité au brief d'extension ; toute cible `plan aws` de forge-ops consommera cette fiche
2. Corpus disponible : checklist propre constituée (`references/corpus-ops-aws.md`, sources officielles)
3. Non-recouvrement : data-platform-cloud porte les plateformes DATA (Fabric/Snowflake/Databricks), jamais le déploiement applicatif ; aucune fiche ne couvre l'exploitation AWS

## 1. domaine
`ops-aws` — exploitation d'un produit web conteneurisé sur **AWS App Runner**, bornée aux 3 verbes de
forge-ops : déployer (sans bascule aveugle), exploiter (healthcheck, journal), restaurer
(rollback prouvé). Jamais l'architecture data, jamais le choix multi-cloud lui-même.

## 2. declencheurs
- `content_patterns` : `App Runner|apprunner|\bECR\b|update-service|AWSAppRunnerServicePolicy`
- Types de demandes : plan de déploiement MEP vers AWS, revue d'un plan `ops.mjs plan aws`, cadrage staging/rollback sur AWS App Runner
- Ne pas router : plateformes data (→ data-platform-cloud), conformité (→ conformite-rgpd-ia), autres cibles cloud (→ fiche ops-<cible> concernée).

## 3. corpus
Chemins résolus (test d'existence exécuté le 11/08/2026) :
- `.claude/skills/experts-forge/references/corpus-ops-aws.md`
- La checklist propre EST le corpus ci-dessus — constituée pour ce domaine le 11/08/2026 (TF-0081).

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-ops-aws » ;
1 à 3 annotations actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Service canonique et frontière — pourquoi AWS App Runner, quand en sortir. (corpus §1)
2. Déploiement sans bascule aveugle — la mécanique aws apprunner qui reproduit « healthcheck avant bascule ». (corpus §2-§3)
3. Rollback natif — mécanique exacte, et ce qui le rend impossible (pièges de rétention/immutabilité). (corpus §4)
4. Permissions minimales — identité de déploiement, jamais de credential dans la forge. (corpus §5)
5. Coûts et hygiène de staging — ce qu'un staging oublié coûte, quoi éteindre. (corpus §6)

## 5. frontiere
N'exécute pas, ne juge pas, ne déploie rien. Le savoir AWS uniquement — l'exécution
appartient à forge-ops (plans) et au run MEP (gestes, GO humain) ; les verdicts à oracle-ops
(O-1…O-5) et M-1…M-5. Aucune valeur réelle de compte : placeholders (`<PROJET>`, `<REGION>`).

## 6. fixture_valeur
- Demande témoin : plan MEP staging « atelier-web » vers AWS (détail : `fixtures/fixture-ops-aws.md`).
- Baseline : section A de `fixtures/fixture-ops-aws.md` — **figée le 11/08/2026 AVANT rédaction
  du corpus et de la présente fiche** (règle du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge`
  armé de la rubrique d'admission (profil `run-admission/profil-admission.json`).
