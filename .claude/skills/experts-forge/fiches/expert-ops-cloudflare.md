# Fiche expert — `ops-cloudflare`

Version 1.0.0 — 28/10/2026 — Statut registre : **ok** — admise le 28/10/2026 (verdict MATERIEL 5/5,
oracle-judge session S′ `claude -p` ; dossier A/B : `fixtures/fixture-ops-cloudflare.md` ; verdict : `run-admission/verdict-ops-cloudflare.json` ;
contre-épreuve rouge NON_MATERIEL 0/5 : `run-admission/verdict-contre-epreuve-ops-cloudflare.json`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : décision humaine du 28/10/2026 (« Fais P1 & P2 & A1 & A2 », item TF-1994, ligne C1 de l'étude 20261028a) ; la cible de plan `cloudflare-workers` de forge-ops (TF-1995) et le profil d'audit `cloudflare` de forge-audit (TF-1996), en construction le même jour, partent du même vocabulaire
2. Corpus disponible : checklist propre constituée le 28/10/2026 (`references/corpus-ops-cloudflare.md`, 13 points, 36 pages officielles lues et datées le jour même, faits mesurés au pilot marqués comme tels)
3. Non-recouvrement : ops-aws, ops-azure, ops-gcp et ops-railway portent le déploiement de conteneurs ; ops-supabase porte le back-end Supabase et renvoie le front à la fiche de son hébergeur ; seo-web porte le référencement ; aucune des 18 fiches existantes ne citait Cloudflare ni wrangler (`git grep -il`, 28/10/2026)

## 1. domaine
`ops-cloudflare` — exploitation d'un front et de son API sur la plateforme développeur de
**Cloudflare** : Workers avec assets statiques en voie par défaut, Pages en voie existante à
migrer. Bornée aux 3 verbes de forge-ops : déployer (wrangler, environnements, versions et
déploiements progressifs, sans bascule aveugle), exploiter (bindings KV, R2, D1 et Hyperdrive,
secrets, `_headers` et `_redirects`, domaines, routes, Access devant la préproduction), restaurer
(retour arrière de version, Time Travel de D1). Jamais la bascule DNS elle-même, jamais l'audit de
la zone, jamais le jugement des en-têtes, jamais le back-end Supabase.

## 2. declencheurs
- `content_patterns` : `Cloudflare|wrangler|workers\.dev|pages\.dev|\.dev\.vars|Workers (static assets|Sites)`
- Types de demandes : plan de déploiement MEP d'un front sur Workers ou Pages, revue d'un plan `ops.mjs plan cloudflare-workers` (cible en construction, TF-1995), migration d'un projet Pages vers Workers, préproduction derrière Access
- Ne pas router : bascule des serveurs de noms d'un domaine (→ forge-ops, `references/GESTES-EXPLOITATION.md`, G-03), audit TLS, WAF ou jetons d'une zone (→ forge-audit, profil `cloudflare` en construction, TF-1996), jugement des en-têtes d'une réponse ou d'un `_headers` (→ forge-websec), back-end Supabase (→ ops-supabase), référencement (→ seo-web). Le motif route toute demande qui nomme Cloudflare : l'expert n'y contribue que sur son domaine, et ces sujets restent à leurs porteurs.
- Mots génériques non routés, preuve mécanique : « pages », « accès », « D1 » et « R2 » seuls ne routent pas cette fiche (`fixtures/routage/cas-routage.json`, cas R9).

## 3. corpus
Chemins résolus (test d'existence exécuté le 28/10/2026) :
- `.claude/skills/experts-forge/references/corpus-ops-cloudflare.md`
- La checklist propre EST le corpus ci-dessus — constituée le 28/10/2026, après la baseline de la fixture (commit 6740645).

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-ops-cloudflare » ;
1 à 3 annotations actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Voie de plateforme — Workers avec assets statiques pour un projet neuf, Pages à migrer, ce que Pages ne sait pas faire et ce que le choix impose au domaine ; Workers Sites et Firewall Rules jamais prescrits. (corpus §1-§3, §11)
2. Configuration par environnement — un Worker par environnement, bindings et secrets non hérités, identifiant oublié qui crée une ressource vide, `secret put` qui déploie, `secrets.required`. (corpus §5-§6)
3. Mise en service et retour arrière réels — versions téléversées puis déployées, affinité de version des assets à empreinte, `rollback` avec identifiant, ce qu'il ne restaure pas, Time Travel de D1 et export qui bloque. (corpus §7-§10)
4. Domaines, routes et accès — serveurs de noms chez Cloudflare, import DNS silencieux et messagerie non proxifiée, `www` et apex, `workers.dev` et Version URLs, Access au niveau du Worker. (corpus §4, §11-§12)
5. Jetons et identifiants — modèle « Edit Cloudflare Workers » sans D1, Single Redirect, jeton OAuth du poste, exclusions du dépôt. (corpus §13)

## 5. frontiere
N'exécute pas, ne juge pas, ne déploie rien. Le savoir Cloudflare uniquement — l'exécution
appartient à forge-ops (plans, procédure G-03 de bascule DNS) et au run MEP (gestes, GO humain) ;
les verdicts à oracle-ops (O-1…O-5) et M-1…M-5 ; l'audit de la zone à forge-audit, le jugement des
en-têtes à forge-websec. Aucune valeur réelle de compte : placeholders (`<account-id>`,
`<VERSION_ID>`, `<BASE>`). Aucune connexion à un compte vivant, aucun outil installé.

## 6. fixture_valeur
- Demande témoin : plan MEP du front « agenda-web » sur Cloudflare (détail : `fixtures/fixture-ops-cloudflare.md`).
- Baseline : section A de `fixtures/fixture-ops-cloudflare.md` — **figée le 28/10/2026 à 10:41 par une
  session neuve sans outil, AVANT rédaction du corpus et de la présente fiche** (commit 6740645).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge`
  armé de la rubrique d'admission (profil `run-admission/profil-admission.json`).
