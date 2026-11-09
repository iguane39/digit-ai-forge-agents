# Fixture de valeur A/B — `ops-github`

## Demande témoin (rejouable)

Le pilot ouvre l'étape MEP d'un produit web neuf « carnet-web », dont le code vit dans un dépôt GitHub privé de l'organisation « asso-carnet », en offre GitHub Free. Le front est une application monopage construite par Vite, avec une petite API Node ; les dépendances sont gérées par npm (package-lock.json). La préproduction est déployée par un workflow GitHub Actions déclenché par une poussée sur la branche env/uat, qui reçoit main après chaque fusion ; la production est déployée par un second workflow, déclenché par un tag de version, après GO humain. Le déploiement s'authentifie auprès de l'hébergeur par un jeton d'API stocké comme secret. Deux personnes écrivent dans le dépôt, un prestataire s'y ajoute pour la recette. Donne le plan de mise en service du dépôt GitHub conforme ETAPE-MEP (déployer, vérifier, pouvoir restaurer — M-1…M-5) : configuration du dépôt, protection de la branche principale et des secrets, alertes sur les dépendances, permissions minimales des workflows, et où le retour arrière peut échouer.

## Baseline (A) — figée le 09/11/2026 à 14:32, AVANT rédaction du corpus et de la fiche

Produite par une session neuve sans outil ni documentation : `claude -p --model sonnet --tools "" --strict-mcp-config` (CLI Claude Code 2.1.318 ; réponse servie par `claude-sonnet-5-5`, 2 318 jetons de sortie, plus un appel annexe du CLI à `claude-haiku-5-5`, 23 jetons de sortie ; session `2b11d3a3-f234-41fd-b6eb-d27a98fed33e`, de 14:31:44 à 14:32:23), lancée depuis un dossier vide, la demande ci-dessus suivie de « Réponds en 5 points numérotés, sans outil, de mémoire, en une vingtaine de lignes au plus. » Sortie reprise sans retouche (la réponse déborde la vingtaine de lignes demandée ; elle est gardée telle quelle).

Je n'ai pas le texte d'ETAPE-MEP sous les yeux : le rattachement aux M-1 à M-5 est indicatif, et les plafonds du plan Free sont à vérifier sur la page de tarification GitHub avant de s'y fier.

1. **Dépôt et accès (M-1).** Gardez le dépôt privé, activez la 2FA obligatoire dans l'organisation, et limitez les deux auteurs à deux propriétaires au plus. Le prestataire n'a besoin que du rôle Read (ou d'aucun accès au dépôt, avec seulement l'URL de préproduction), car un accès en écriture lui donnerait la main sur les workflows et donc sur les secrets.

2. **Protection de main : le point bloquant.** Sur le plan Free, les règles de protection de branche, les rulesets et la protection des tags ne s'appliquent pas aux dépôts privés (à vérifier). Les revues obligatoires, les checks requis et le blocage du force-push sont donc inapplicables. Je recommande le plan Team (quelques dollars par utilisateur et par mois, montant à vérifier), ce qui relève d'une dépense à faire décider par le porteur. À défaut, posez un CODEOWNERS et une convention écrite, en actant que ce n'est pas une garde technique.

3. **Secrets et GO humain.** Les environnements avec relecteurs requis ne sont pas disponibles en Free privé (à vérifier). Le GO de production serait alors une convention, pas un verrou. Sous Team, créez les environnements `uat` et `production`, avec un relecteur obligatoire sur `production`, et un jeton d'hébergeur distinct par environnement, au moindre droit et daté pour rotation. En Free, les secrets sont au niveau dépôt : tout auteur peut les exfiltrer via un workflow sur une branche, d'où le point 1.

4. **Dépendances et workflows.** Activez Dependabot alerts et security updates (gratuits en privé), plus un `dependabot.yml` pour `npm` et `github-actions`. En CI, utilisez `npm ci` sur le `package-lock.json` versionné et `npm audit --omit=dev` comme check. Le secret scanning et le code scanning en privé sont payants (à vérifier). Fixez la permission par défaut du `GITHUB_TOKEN` à lecture seule dans l'organisation, déclarez `permissions: contents: read` en tête de chaque workflow et n'élevez que par job. Limitez les actions autorisées à celles de GitHub et à une liste blanche, épinglées par SHA, et exigez l'approbation des PR externes.

5. **Où le retour arrière peut échouer (M-4, M-5).**
   - Un redéploiement de l'ancien tag échoue si le jeton a été tourné, si une dépendance ou un registre a disparu, ou si les artefacts ont expiré (90 jours par défaut, à vérifier).
   - Une migration de données non réversible rend le code ancien incompatible avec la base.
   - Un cache CDN ou un service worker peut servir l'ancien front contre la nouvelle API.
   - Un tag déplacé ou supprimé, ou un `env/uat` réécrit par force-push, détruit la trace de ce qui était déployé.
   - Enfin, un retour arrière jamais rejoué est une hypothèse : rejouez-le une fois en préproduction, en mesurant le code de retour, avant le GO de production.

## Contribution (B) — par la rubrique de la fiche, produite le 09/11/2026 après la baseline (jugement différé, session S′)

Contribution expert-ops-github :

1. **[Axe 1 · offre et gardes disponibles]** La baseline écrit « à vérifier » devant chaque garde que Free
   refuserait, puis propose un repli : « posez un CODEOWNERS et une convention écrite ». Vérifié : sur un
   dépôt privé, les branches protégées, les rulesets et « Code owners » sont des outils de Pro, Team et
   Enterprise, et Free for organizations n'en liste aucun ; l'exigence d'approbation par les propriétaires
   est une option de la règle de protection (corpus §1, §2, §6). Sans règle, un fichier CODEOWNERS ne
   bloque rien : le repli de la baseline est une convention, pas une garde. Le plan MEP de carnet-web pose
   donc, avant le GO, une décision à trois issues que le porteur tranche : passer « asso-carnet » en Team
   (dépense), rendre le dépôt public (à écarter, un code de produit n'a pas à l'être), ou consigner par
   écrit que `main`, `env/uat` et les tags de version ne sont gardés par aucune règle technique (demande :
   « offre GitHub Free », « dépôt GitHub privé »).
2. **[Axe 1 · deux dépenses, pas une]** La baseline écrit « Le secret scanning et le code scanning en privé sont payants »
   et recommande Team pour tout. Passer à Team n'ouvre pas la protection à la poussée : elle
   « requires GitHub Secret Protection », est « disabled by default », et l'achat de Secret Protection n'est
   ouvert qu'aux comptes Team et Enterprise Cloud (corpus §8, §12). Le dossier de GO porte donc deux lignes
   distinctes, l'offre Team puis Secret Protection, et pour le seul secret du dépôt (le jeton d'hébergeur
   de la demande) une seule parade qui ne coûte rien : le lire dans l'historique avant le GO, et le
   révoquer s'il y figure, car un secret exposé « must be revoked » (corpus §8). Les alertes Dependabot, elles,
   ne coûtent rien sur aucune offre (corpus §7, classées **défaut** au corpus §12).
3. **[Axe 2 · la promotion vers env/uat]** La demande dit que `env/uat` « reçoit main après chaque fusion »,
   et la baseline ne dit pas qui pousse. Question bloquante avant M-2 : si c'est un workflow qui pousse avec
   le jeton fourni, « events triggered by the GITHUB_TOKEN will not create a new workflow run » : le workflow
   de préproduction, abonné à `push` sur `env/uat`, ne partira jamais, sans erreur ni avertissement. Les deux
   exceptions écrites sont `workflow_dispatch` et `repository_dispatch` ; un jeton d'App ou personnel est la
   voie que la page nomme pour une demande de fusion, et l'étendre à la poussée est à jouer en préproduction
   (corpus §3). Sous Team, une règle « Restrict updates » sur `env/uat` demande que l'automate soit à la liste
   de contournement, et ne doit pas exiger de demande de fusion : le produit témoin du pilot promeut par
   poussée directe, qu'une demande de fusion exigée refuse (corpus §3, §12 ; demande : « une poussée sur la
   branche env/uat »).
4. **[Axe 2 · le GO de production tenu par un tag]** La baseline écrit « Sous Team, créez les environnements
   `uat` et `production`, avec un relecteur obligatoire sur `production` ». La page des environnements dit
   l'inverse : sur Free, Pro et Team, les relecteurs requis et la minuterie sont « only available for public
   repositories » (corpus §1, §4). Payer Team ne donne donc pas ce verrou. Ce que Team donne en dépôt privé : un
   environnement `production` limité aux tags `v*` (« Selected branches and tags ») et un ruleset de tags
   `v*` dont « Restrict creations » réserve la création au détenteur du GO, seul à la liste de contournement
   (corpus §3, §4 ; montage déduit des pages, à jouer en préproduction). Une poussée de plus de trois tags d'un
   coup ne déclenche aucun workflow : le plan de M-3 note le tag sain et ne pousse qu'un tag à la fois
   (demande : « déclenché par un tag de version, après GO humain »).
5. **[Axe 3 · environnement créé nu et secrets lus par tout rôle Write]** Une faute de frappe dans le nom de
   l'environnement du workflow de production (`producton`) crée un environnement qui « will not have any
   protection rules or secrets configured », et n'importe qui peut éditer un workflow pour en créer (corpus §4).
   M-2 relit donc la liste des environnements et leurs règles dans les réglages du dépôt, pas seulement le
   résultat d'un run. La baseline parle d'« auteur » qui exfiltre : le fait précis est que tout rôle Write lit
   tous les secrets du dépôt, ce qui vaut pour les deux personnes qui écrivent ; seul le prestataire en Read en
   est écarté (corpus §5, §9). Avant de ranger un jeton d'API permanent comme secret, demander à l'hébergeur
   s'il accepte OpenID Connect, que la page recommande pour ne plus stocker de justificatif de longue durée
   (demande : « jeton d'API stocké comme secret »).
6. **[Axe 4 · actions épinglées et alertes Dependabot]** La baseline prescrit des actions « épinglées par SHA »
   et des alertes Dependabot, comme si l'un nourrissait l'autre. La page des alertes dit : « For GitHub
   Actions, alerts are only generated for actions that use semantic versioning, not SHA versioning » (corpus §7).
   Épinglées par SHA, les actions ne lèvent aucune alerte ; seul l'écosystème `github-actions` du fichier
   `dependabot.yml` les tient à jour. Les alertes se lisent sur la branche par défaut, et rien ne part à
   l'activation pour les dépendances déjà vulnérables : M-2 lit la liste une fois à l'écran de sécurité et la
   preuve de l'activation est `GET /repos/<owner>/<repo>/vulnerability-alerts`, qui rend 204 si actif et
   404 sinon (corpus §7, §11 ; demande : « alertes sur les dépendances », « package-lock.json »).
7. **[Axe 5 · le rejeu d'un tag n'est pas un retour arrière sans limite]** La baseline écrit « un redéploiement de
   l'ancien tag échoue si… les artefacts ont expiré ». Le rejeu d'un workflow n'existe que « up to 30 days after
   its initial run », 50 fois au plus, sous les droits de la personne qui l'avait déclenché, avec le même SHA ;
   artefacts et journaux disparaissent à 90 jours par défaut (corpus §10). Le plan M-4 écrit donc deux voies : le
   rejeu du run du tag sain dans les 30 jours, puis, au-delà, une demande de fusion « Revert » et un nouveau tag
   sur le commit obtenu. M-5 rejoue la seconde en préproduction, parce qu'elle seule ne dépend ni du délai ni
   du droit de la personne d'origine (demande : « pouvoir restaurer — M-1…M-5 »).
