# Fiche expert — `ops-github`

Version 1.0.0 — 09/11/2026 — Statut registre : **ok** — admise le 09/11/2026 (verdict MATERIEL 5/5,
oracle-judge session S′ `claude -p` ; dossier A/B : `fixtures/fixture-ops-github.md` ; verdict : `run-admission/verdict-ops-github.json` ;
contre-épreuve rouge NON_MATERIEL 0/5 : `run-admission/verdict-contre-epreuve-ops-github.json`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : TF-2278, décidé le 09/11/2026 sous R-58 (« est-ce qu'il y a d'autres retours et TODOs à traiter ? Si oui, fais les »). Le registre des réglages sûrs du pilot inscrit 3 réglages GitHub (alertes Dependabot, protection à la poussée, protection de la branche principale) et `oracle-reglages-corpus` rend G8 en avertissement tant qu'aucun corpus n'existe pour eux (constat de la campagne du 06/11/2026, reste de TF-2227). Chaque produit du pilot vit dans un dépôt GitHub et passe par une étape MEP.
2. Corpus disponible : checklist propre constituée le 09/11/2026 (`references/corpus-ops-github.md`, 12 points dont le 12e classe les 3 réglages sur le registre du pilot), 25 pages officielles de `docs.github.com` lues le jour même dans la version `free-pro-team@latest`, sans date de mise à jour affichée sur les pages
3. Non-recouvrement : ops-aws, ops-azure, ops-gcp, ops-railway et ops-cloudflare portent l'hébergement d'une application ; ops-supabase porte le back-end Supabase ; securite-offensive (refusée) porte l'attaque ; aucune des 20 fiches existantes ne traite le dépôt GitHub comme plateforme (`grep -il "dependabot\|ruleset\|GITHUB_TOKEN" fiches/*.md`, 09/11/2026 : seule la présente fiche répond)

## 1. domaine
`ops-github` — mise en service et exploitation du dépôt GitHub d'un produit web : protection de la
branche principale et des tags de version (règles de protection, rulesets, liste de contournement),
environnements de déploiement et secrets d'Actions, permissions des workflows et actions tierces,
alertes et mises à jour de Dependabot, protection des secrets à la poussée, accès et double
vérification, rejeu des workflows et retour arrière. Borné par l'offre de l'organisation : ce que
Free, Team et Enterprise permettent sur un dépôt privé fait partie du domaine. Jamais le code
applicatif, jamais l'hébergeur de l'application, jamais l'audit d'un dépôt déjà en service.

## 2. declencheurs
- `content_patterns` : `GitHub Actions|Dependabot|\.github/workflows|GITHUB_TOKEN|ruleset|branch protection|protection de (la )?branche|push protection|protection à la poussée|secret scanning|CODEOWNERS|vulnerability-alerts`
- Types de demandes : plan de mise en service d'un dépôt pour l'étape MEP, revue des protections d'un dépôt et de ses workflows de déploiement, choix de l'offre GitHub d'une organisation au regard des gardes disponibles, cadrage d'un GO humain porté par un tag ou un environnement
- Ne pas router : l'application des réglages et la lecture de leur état sur un produit (→ `scripts\ouvrir-retour-reglage.mjs` et le registre `REGLAGES-SURS-PAR-DEFAUT.json` du pilot), l'audit du dépôt d'un produit (→ forge-audit), le jugement des workflows comme code (→ forge-agents-security), l'hébergeur de l'application (→ ops-cloudflare, ops-railway, ops-aws, ops-azure, ops-gcp, ops-supabase). Le motif ne route pas le mot « GitHub » seul ni « pull request » seul : une demande qui pousse du code ou ouvre une pull request n'appelle pas l'expert (`fixtures/routage/cas-routage.json`, cas R13).

## 3. corpus
Chemins résolus (test d'existence exécuté le 09/11/2026) :
- `.claude/skills/experts-forge/references/corpus-ops-github.md`
- La checklist propre EST le corpus ci-dessus — constituée le 09/11/2026, après la baseline de la fixture (figée à 14:32, le corpus écrit après 14:42).

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-ops-github » ;
1 à 3 annotations actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Offre et gardes disponibles — ce que l'offre de l'organisation rend impossible sur un dépôt privé (protection de branche, environnements protégés, protection à la poussée), et la dépense ou l'écart accepté qui en résulte ; une garde indisponible se pose en décision, jamais en étape du plan. (corpus §1, §4, §8, §12)
2. Branche principale, tags et promotion — règle de protection ou ruleset, liste de contournement et son mode « pull requests only », tags de version réservés, branche de promotion poussée par un automate, jeton du workflow qui ne déclenche pas de nouveau run. (corpus §2, §3)
3. Environnements, secrets et GO humain — relecteur requis indisponible hors public sur Free, Pro et Team, branches et tags de déploiement, environnement créé nu par un nom fautif, lecture des secrets par tout rôle Write, OpenID Connect avant un jeton permanent. (corpus §4, §5)
4. Workflows, actions et dépendances — jeton à lecture seule par défaut et hérité de l'organisation, actions épinglées par SHA et alertes absentes pour elles, Dependabot lu sur la branche par défaut, aucune notification sur l'existant à l'activation. (corpus §6, §7)
5. Accès, rejeu et retour arrière — rôle du prestataire, double vérification et sièges, rejeu limité à 30 jours sous les droits du déclencheur initial, rétention, nouvelle demande de fusion pour annuler, tags poussés par trois au plus. (corpus §9, §10, §11)

## 5. frontiere
N'exécute pas, ne juge pas, ne configure aucun dépôt. Le savoir GitHub uniquement — l'application et
la lecture des réglages appartiennent au registre `REGLAGES-SURS-PAR-DEFAUT.json` et à
`scripts\ouvrir-retour-reglage.mjs` du pilot, le geste de MEP à forge-ops et au GO humain, l'audit du
dépôt à forge-audit. Aucun prix, aucun quota chiffré : la page des offres renvoie à GitHub Pricing et
le corpus n'en recopie pas. Aucune valeur réelle de compte : placeholders (`<owner>`, `<repo>`,
`<ruleset-id>`). Aucune connexion à un dépôt vivant, aucun outil installé.

## 6. fixture_valeur
- Demande témoin : plan de mise en service du dépôt « carnet-web » (organisation en offre Free, dépôt privé), détail : `fixtures/fixture-ops-github.md`.
- Baseline : section A de `fixtures/fixture-ops-github.md` — **figée le 09/11/2026 à 14:32 par une
  session neuve sans outil, AVANT rédaction du corpus et de la présente fiche**.
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge`
  armé de la rubrique d'admission (profil `run-admission/profil-admission.json`).
