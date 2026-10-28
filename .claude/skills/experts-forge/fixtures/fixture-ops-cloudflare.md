# Fixture de valeur A/B — `ops-cloudflare`

## Demande témoin (rejouable)

Le pilot ouvre l'étape MEP d'un produit web neuf « agenda-web », à héberger chez Cloudflare. Le front est une application monopage construite par Vite dans dist/. Une petite API sous /api/ (inscription aux événements, liste des événements) lit une base D1, range les pièces jointes des inscrits dans un bucket R2 et garde un cache de configuration dans KV ; les courriels partent par un fournisseur tiers dont la clé d'API est un secret. Le domaine agenda-web.example est enregistré chez un registrar tiers dont les serveurs de noms portent aussi la messagerie de l'association. La préproduction doit rester réservée aux membres du bureau, et la production suit après GO humain. Donne le plan de déploiement conforme ETAPE-MEP (déployer, vérifier, pouvoir restaurer — M-1…M-5) : plateforme et configuration, commandes, secrets et permissions minimales, en-têtes de sécurité et redirections, et où le retour arrière peut échouer.

## Baseline (A) — figée le 28/10/2026 à 10:41, AVANT rédaction du corpus et de la fiche

Produite par une session neuve sans outil ni documentation : `claude -p --model sonnet --tools "" --strict-mcp-config` (CLI Claude Code 2.1.312, la plus récente du poste ; réponse servie par `claude-sonnet-5-5` ; session `cfc45644-d03b-4570-b6e2-223a762c7a7c`, de 10:40:35 à 10:41:05), lancée depuis un dossier vide, la demande ci-dessus suivie de « Réponds en 5 points numérotés, sans outil, de mémoire, en une vingtaine de lignes au plus. » Sortie reprise sans retouche.

1. **Plateforme et configuration.** Un seul Worker `agenda-web` avec Static Assets (Pages est en retrait, à vérifier). `wrangler.toml` : `assets.directory = "./dist"`, `not_found_handling = "single-page-application"`, `run_worker_first = ["/api/*"]`. Deux environnements `staging` et `production`, chacun avec sa propre D1 (`DB`), son bucket R2 (`PJ`) et son KV (`CONFIG`), jamais partagés. `workers_dev = false` et `preview_urls = false`, sinon l'URL workers.dev contourne Access. Staging sur `staging.agenda-web.example`, derrière Cloudflare Access (politique : courriels du bureau). Les serveurs de noms portent la messagerie : la zone entre chez Cloudflare seulement après import et comparaison (`dig` ancien contre nouveau) de MX, SPF, DKIM, DMARC, ces enregistrements restant en DNS seul (nuage gris).

2. **Commandes (M-1 déployer, M-2 vérifier).** Staging : `npm ci && npm run build`, `wrangler d1 migrations apply DB --env staging --remote`, `wrangler deploy --env staging`. Vérifier : sans jeton, `curl -I` staging doit renvoyer une redirection Access ; avec un jeton de service, `/api/events` répond 200, une inscription avec pièce jointe écrit en D1 et R2, le courriel part. Après GO humain, production : `wrangler d1 export DB --env production --remote --output sauvegarde.sql`, migrations, `wrangler deploy --env production`, mêmes contrôles, puis `wrangler versions list` pour noter la version saine (M-3).

3. **Secrets et permissions minimales.** `wrangler secret put MAIL_API_KEY --env <env>`, une clé distincte par environnement, limitée à l'envoi chez le fournisseur. Les bindings D1/R2/KV n'exigent aucun jeton à l'exécution. Jeton CI par environnement, restreint au compte et à la zone : Workers Scripts Edit, D1 Edit, Workers KV Storage Edit, Workers R2 Storage Edit, Workers Routes Edit. DNS Edit et Access Edit ne servent qu'à la mise en place, sur un jeton séparé révoqué ensuite. Bucket R2 privé, pièces servies par le Worker seul.

4. **En-têtes et redirections.** `public/_headers` (ne couvre que les fichiers statiques) : CSP `default-src 'self'; frame-ancestors 'none'; object-src 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` fermée, HSTS `max-age=31536000` sans `includeSubDomains` (la messagerie vit sous le même domaine). Cache : `/assets/*` immuable, `index.html` en `no-cache`. Les réponses `/api/*` portent leurs en-têtes dans le code du Worker, avec `Cache-Control: no-store`. Staging ajoute `X-Robots-Tag: noindex`. Redirections : « Always Use HTTPS », `www` vers apex par règle de redirection.

5. **Où le retour arrière échoue (M-4, M-5).** `wrangler rollback` restaure le code, ni le schéma D1, ni R2, ni KV : migrations en expand/contract, export avant chaque migration, Time Travel D1 comme second filet (à tester sur staging). Les objets R2 supprimés et les clés KV écrasées ne reviennent pas ; le cache KV met jusqu'à une minute à converger. Une rotation de secret survit au rollback de version. Le changement de serveurs de noms est le geste le plus risqué : propagation lente, courriels perdus si un enregistrement manque ; garder l'export de l'ancienne zone et un TTL bas. HSTS reste actif chez les navigateurs pendant toute sa durée : monter par paliers. Une politique Access mal posée verrouille le bureau ou ouvre la préproduction. Non vérifié ici : limites du plan Cloudflare et noms exacts des permissions de jeton, à contrôler contre l'API.

## Contribution (B) — par la rubrique de la fiche, produite le 28/10/2026 (jugement différé, session S′)

Contribution expert-ops-cloudflare :

1. **[Axe 1 · voie de plateforme]** La baseline choisit Workers avec assets statiques et note
   « Pages est en retrait, à vérifier ». C'est vérifié : la page Pages dit « Start new projects with
   Workers », sans déclarer Pages déprécié (corpus §1). La baseline n'en tire pas la conséquence sur
   le domaine : « Unlike Pages, Workers does not support any domain whose nameservers are not
   managed by Cloudflare » (corpus §11). Avec Workers, faire entrer agenda-web.example chez
   Cloudflare devient un préalable de la MEP, à décider au GO avec la bascule de la messagerie. Dans
   les pages lues, la seule voie qui garde les serveurs de noms du registrar est Pages (« Custom
   domains outside Cloudflare zones »), contre la recommandation de Cloudflare : l'arbitrage se pose
   avant la première commande (demande : « registrar tiers dont les serveurs de noms portent aussi
   la messagerie », « la production suit après GO humain »).
2. **[Axe 2 · configuration par environnement]** La baseline déclare une D1, un R2 et un KV par
   environnement, sans le garde-fou qui va avec. Un binding sans identifiant fait créer la ressource
   au `wrangler deploy` : un `database_id` oublié dans `[env.production]` donnerait une base neuve et
   vide, sans erreur (mécanisme documenté, conséquence déduite). Avant le premier déploiement de
   production, vérifier dans `[env.production]` le `database_id`, l'`id` du KV et le `bucket_name` du
   R2. Appliquer les migrations par le nom de la base, pas par le binding `DB`, comme la page le
   conseille « to avoid accidentally running migrations on the wrong binding » (corpus §5). Enfin,
   `wrangler secret put MAIL_API_KEY --env production` crée une version et la déploie aussitôt : un
   changement de production qui échappe au GO, que la page déconseille pendant un déploiement
   progressif. Poser la clé par `wrangler versions secret put`, la mettre en service par
   `wrangler versions deploy` après le GO. Déclarer `secrets.required = ["MAIL_API_KEY"]` dans chaque
   environnement, puisque la clé `secrets` ne s'hérite pas : le déploiement d'un environnement où la
   clé manque échoue alors (corpus §5-§6 ; demande : « lit une base
   D1, range les pièces jointes […] dans un bucket R2 », « la clé d'API est un secret »).
3. **[Axe 3 · retour arrière réel]** Trois éléments du point 5 de la baseline sont à reprendre.
   D'abord, son filet de production, `wrangler d1 export DB --env production --remote`, bloque la
   base pendant l'export : « A running export will block other database requests ». Noter plutôt le
   signet par `wrangler d1 time-travel info <BASE>` avant les migrations : Time Travel est toujours
   actif, sur 30 jours en offre payante et 7 en gratuite. La restauration par
   `wrangler d1 time-travel restore <BASE> --bookmark=<signet>` écrase la base en place et annule les
   requêtes en vol : c'est un geste à faire valider (corpus §10). Ensuite, `wrangler rollback` sans
   identifiant vise « the version uploaded before the latest version », pas la version saine notée en
   M-3. Passer cet identifiant et nommer le Worker par `--name agenda-web-production` : un
   environnement est un Worker distinct, et la page de la commande liste `--name`, pas `--env`
   (corpus §5, §9). Enfin, la baseline affirme qu'« une rotation de secret survit au rollback de
   version ». Aucune page ne le dit, et une version capture ses bindings, dont les secrets
   (« Secrets are a type of binding ») : tester sur la préproduction avant de révoquer l'ancienne clé
   chez le fournisseur (corpus §9 ; demande :
   « pouvoir restaurer — M-1…M-5 », « une base D1 », « la clé d'API est un secret »).
4. **[Axe 4 · domaines et accès]** La comparaison « `dig` ancien contre nouveau » de la baseline est
   la bonne parade, à jouer avant la bascule. Mesuré au pilot le 25/08/2026 : le scan automatique a
   importé zéro enregistrement sur quatre zones, 47 manquants dont 12 `MX`, sans erreur ni
   avertissement. L'ordre et les contrôles existent chez forge-ops : section G-03 de
   `references/GESTES-EXPLOITATION.md`, et `scripts/verifier-migration-dns.mjs` avec `--diff` pour les
   manques et `--proxifies` pour une messagerie proxifiée (corpus §11).
   La redirection de `www` vers l'apex ne peut pas vivre dans `_redirects`, qui ne fait pas de
   redirection de niveau domaine. Elle exige une règle de zone et un enregistrement proxifié pour
   `www`, `A` vers `192.0.2.0` par exemple ; sans hôte proxifié, Cloudflare ne termine pas le TLS et
   la redirection ne part jamais (corpus §4). Pour la préproduction, protéger par Access le Worker
   `agenda-web-staging` lui-même : cela couvre ses routes, son domaine, son `workers.dev` et ses
   prévisualisations, là où une application par nom d'hôte ne protège que
   `staging.agenda-web.example`. Deux prérequis manquent à la baseline : Zero Trust activé sur le
   compte, et une liste des membres du bureau posée dans l'application Access de Zero Trust, puisque
   l'écran Workers ne propose que les politiques « Cloudflare account » et « Email domain » (corpus §12 ;
   demande : « préproduction réservée aux membres du bureau », « serveurs de noms portent aussi la
   messagerie »).
5. **[Axe 5 · jetons et identifiants]** Le jeton de mise en place de la baseline (« DNS Edit et
   Access Edit ») ne suffit pas à poser la redirection de `www` : une règle de zone relève de
   « Single Redirect Edit ». Mesuré au pilot le 25/08/2026, les Single Redirects ont été refusés avec
   `10000 Authentication error` sous un jeton qui portait « Page Rules: Edit ». Pour la CI, la
   documentation part du modèle « Edit Cloudflare Workers », qui n'accorde rien sur D1 : la « D1 Edit »
   de la baseline s'ajoute au modèle, sinon `d1 migrations apply --remote` échoue en CI ;
   `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` vont dans les secrets de la CI, jamais dans le
   dépôt (corpus §13). Sur le poste, `wrangler login` prend toutes les portées et range le jeton OAuth
   en clair dans `~/.config/.wrangler/config/default.toml`, sauf `--use-keyring`. Dans le dépôt,
   exclure `.dev.vars*`, `.env*` et `.wrangler/state` avant le premier commit : en développement
   local, la clé du fournisseur se pose dans `.dev.vars` ou `.env` (corpus §6, §13 ; demande : « la
   clé d'API est un secret », « construite par Vite dans dist/ »).

## Critère de différence matérielle

Verdict `MATERIEL` exigé : axes 1, 2 et 4 de la rubrique juge à OUI, et au moins un des
axes 3 ou 5 — sinon la fiche reste `todo`/`refuse` et n'est jamais routée.
