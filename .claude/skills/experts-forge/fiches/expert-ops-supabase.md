# Fiche expert — `ops-supabase`

Version 1.0.0 — 16/10/2026 — Statut registre : **ok** — admise le 16/10/2026 (verdict MATERIEL 5/5,
oracle-judge session S′ `claude -p` ; dossier A/B : `fixtures/fixture-ops-supabase.md` ; verdict : `run-admission/verdict-ops-supabase.json` ;
contre-épreuve rouge NON_MATERIEL 0/5).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : mandat humain du 16/10/2026 (prompt « Competences Supabase dans les forges », version b) ; toute cible `plan supabase` de forge-ops consommera cette fiche
2. Corpus disponible : checklist propre constituée le 16/10/2026 (`references/corpus-ops-supabase.md`, 9 points, sources officielles datées)
3. Non-recouvrement : data-platform-cloud porte les plateformes DATA (Fabric/Snowflake/Databricks) ; ops-azure, ops-aws, ops-gcp et ops-railway portent le déploiement de conteneurs ; aucune fiche ne couvre l'exploitation d'un back-end Supabase (migrations, RLS, clés, sauvegardes)

## 1. domaine
`ops-supabase` — exploitation d'un back-end **Supabase hébergé** (Postgres, API, auth, stockage,
fonctions Edge), bornée aux 3 verbes de forge-ops : déployer (migrations et fonctions, sans
bascule aveugle), exploiter (healthcheck, RLS, réseau, SSL), restaurer (migration corrective,
sauvegarde, PITR). Jamais le déploiement du front, jamais la modélisation des données.

## 2. declencheurs
- `content_patterns` : `Supabase|supabase (link|db push|functions deploy)|sb_publishable_|sb_secret_`
- Types de demandes : plan de déploiement MEP d'un back-end Supabase, revue d'un plan `ops.mjs plan supabase`, cadrage staging et restauration d'un projet Supabase
- Ne pas router : front applicatif (→ fiche `ops-<cible>` qui l'héberge), plateformes data (→ data-platform-cloud), conformité (→ conformite-rgpd-ia), modélisation et profil-moteur Postgres (→ forge-data, `references/profils-moteur/`).

## 3. corpus
Chemins résolus (test d'existence exécuté le 16/10/2026) :
- `.claude/skills/experts-forge/references/corpus-ops-supabase.md`
- La checklist propre EST le corpus ci-dessus — constituée le 16/10/2026, après la baseline de la fixture.

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-ops-supabase » ;
1 à 3 annotations actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Clés et échéance — publiable ou secrète, clés héritées dépréciées fin 2026, ce qui ne va jamais côté client. (corpus §2)
2. Déploiement sans bascule aveugle — `link`, `db push --dry-run` puis `db push`, fonctions, jeton CI à portée limitée. (corpus §3-§4)
3. Rollback réel — pas de migration « down », `migration repair` ne touche que l'historique, ce que coûtent sauvegarde et PITR selon le plan. (corpus §5-§6)
4. Ce que protègent réseau, SSL et RLS — périmètre exact de chacun, et le redémarrage imposé par le SSL. (corpus §4, §7, §8)
5. Credentials du poste et du dépôt — jeton du CLI, dossiers locaux à exclure. (corpus §9)

## 5. frontiere
N'exécute pas, ne juge pas, ne déploie rien. Le savoir Supabase uniquement — l'exécution
appartient à forge-ops (plans) et au run MEP (gestes, GO humain) ; les verdicts à oracle-ops
(O-1…O-5) et M-1…M-5 ; l'audit du projet à forge-audit (`profiles/supabase/`). Aucune valeur
réelle de projet : placeholders (`<project-ref>`, `<REGION>`). Aucune connexion à un projet vivant.

## 6. fixture_valeur
- Demande témoin : plan MEP staging du back-end Supabase de « carnet-web » (détail : `fixtures/fixture-ops-supabase.md`).
- Baseline : section A de `fixtures/fixture-ops-supabase.md` — **figée le 16/10/2026 à 10:49 par une
  session neuve sans outil, AVANT rédaction du corpus et de la présente fiche** (commit 85d95d7).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge`
  armé de la rubrique d'admission (profil `run-admission/profil-admission.json`).
