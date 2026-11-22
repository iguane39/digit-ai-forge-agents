# Corpus propre — exploitation Railway (checklist)

Constitué le 11/08/2026 pour la fiche `expert-ops-railway` (TF-0081, D-P1 : le cas réel ASD
a été déployé sur Railway artisanalement). Borné aux 3 verbes de forge-ops sur le service
canonique **Railway service (conteneur)**.

**Relu le 22/11/2026 (TF-2744, L-02 du plan de mise à jour des compétences du 21/11/2026).** Les adresses des sources
des points 1 à 7 ont été lues ce jour par `curl` (code 200), toutes **redirigées** vers la documentation réorganisée :
l'adresse écrite au point reste valable, l'adresse d'arrivée est donnée dans « Sources lues le 22/11/2026 » en fin de
fichier, avec ce que la page dit. Un fait marqué **non vérifié** n'a pu être confirmé dans aucune page lue ce jour : il
reste un constat de terrain (produit, date), jamais une affirmation de la documentation. Les 23 constats C-066 à C-088
du plan sont intégrés aux points 8 à 14 (déjà versés le 15/08/2026) et aux points 16 à 23 ; la table de passage est en
fin de fichier.

1. **Service canonique & frontière** — un service Railway par produit, build Dockerfile (pas de
   buildpack implicite pour rester reproductible). Hors périmètre : bases managées, cron, volumes
   multi-services. Régions : imposer explicitement une région UE (ex. `europe-west4`) — le défaut
   n'est pas garanti UE. **Correction du 22/11/2026** : l'identifiant de région à écrire en config-as-code est celui de la
   page Regions, `europe-west4-drams3a` (« EU West Metal », Amsterdam), pas `europe-west4`. Source :
   https://docs.railway.com/reference/deployments (lue le 22/11/2026, redirigée vers `/deployments/reference` ;
   identifiants de région : `/deployments/regions`)
2. **Déployer sans bascule aveugle** — `railway up --ci` construit et déploie ; la bascule ne doit
   être considérée saine que si `healthcheckPath` est configuré (railway.json/railway.toml) :
   sans lui, Railway bascule dès le démarrage du conteneur. Source :
   https://docs.railway.com/reference/healthchecks
3. **Healthcheck idiomatique** — `railway.json → deploy.healthcheckPath: "/sante"` +
   `healthcheckTimeout` ; Railway ne route le trafic vers le nouveau déploiement qu'après
   healthcheck vert (aligné avec le contrat `sante.mjs` de forge-ops : la cible expose ce que
   l'oracle O-2 rejoue).
4. **Rollback natif & pièges** — le rollback se fait par redéploiement d'un déploiement
   HISTORIQUE (dashboard : Rollback sur un deployment antérieur ; CLI : `railway redeploy`
   rejoue le déploiement COURANT, pas l'antérieur — piège). La rétention d'historique dépend du
   plan : un rollback n'est prouvable que si le déploiement antérieur existe encore. **Complément du 22/11/2026
   (C-084, contradiction levée)** : le retour arrière existe aussi par commande, mais par l'API, pas par le CLI — la
   mutation GraphQL `deploymentRollback(id)` vers l'identifiant du déploiement visé, seulement pour un déploiement
   `canRollback: true` (voir le point 19). Source : https://docs.railway.com/guides/deployments (lue le 22/11/2026,
   redirigée vers `/deployments`, puis `/deployments/reference`, section Rollback)
5. **Système de fichiers éphémère** — tout état local est perdu à chaque déploiement : le
   journal d'exploitation de forge-ops ne peut PAS vivre dans le conteneur (volume Railway ou
   journal côté pilot). Source : https://docs.railway.com/reference/volumes
6. **Jeton & permissions minimales** — `RAILWAY_TOKEN` de **projet** (jamais de token de compte),
   fourni par l'environnement du run MEP, jamais stocké dans la forge (frontière credentials).
   Précision du 22/11/2026 : le CLI lit `RAILWAY_TOKEN` (jeton de projet) pour les gestes d'un projet et `RAILWAY_API_TOKEN`
   (jeton de compte ou d'espace de travail) pour les gestes de compte ; ce dernier est exclu ici (voir le point 18).
   Source : https://docs.railway.com/guides/public-api#authentication (lue le 22/11/2026, redirigée vers `/integrations/api`)
7. **Coûts d'ordre de grandeur** — facturation à l'usage (vCPU/Go-heure) + minimum mensuel selon
   plan ; un staging laissé actif consomme — l'étape MEP doit prévoir l'extinction du staging.
   Source : https://docs.railway.com/reference/pricing

Items 8-11 ajoutés le 15/08/2026 (TF-0258) : quatre pièges constatés au **premier déploiement
réel** d'un produit sur Railway (source : constat direct du run MEP, pas un doc officiel — à
recouper si Railway republie sa documentation sur ces points).

8. **`startCommand` sans shell : `$PORT` littéral, crash-loop** — un `CMD` en forme EXEC
   (tableau JSON, ex. `CMD ["uvicorn", "app:app", "--port", "$PORT"]`) n'invoque aucun shell : la
   variable `$PORT` n'est jamais substituée, l'appli reçoit la chaîne littérale `"$PORT"` comme
   port et échoue au démarrage — crash-loop silencieux, pas d'erreur explicite côté healthcheck.
   Corrige : soit un `CMD` en forme SHELL (`CMD sh -c "uvicorn app:app --host 0.0.0.0 --port
   $PORT"`) pour que le shell substitue la variable avant l'exec, soit un port fixé en dur dans
   l'image et déclaré côté Railway (`PORT` en variable de service), jamais un `$PORT` non résolu
   passé à une CMD image sans shell.
9. **Edge et healthcheck parlent IPv4 : bind `0.0.0.0`, jamais `::` seul** — le prober de
   healthcheck et le edge/proxy public de Railway joignent le conteneur en IPv4. Un serveur
   applicatif qui bind uniquement en IPv6 (`::`, sans dual-stack) ou en loopback (`127.0.0.1`)
   est injoignable : healthcheck qui timeout, bascule bloquée, sans message d'erreur applicatif
   (le conteneur tourne, il n'est simplement pas atteint). Corrige : binder explicitement
   `0.0.0.0` côté serveur (ex. `uvicorn app:app --host 0.0.0.0 --port $PORT`).
    **Contradiction sur l'adresse d'écoute, mesurée le 22/11/2026 (C-067, C-077).** Le lot et le dossier MEP de SP-1 disaient
    « edge et healthcheck en IPv4, `0.0.0.0` requis, `::` refusé » ; le commentaire du Dockerfile disait l'inverse. Ce que
    la documentation lue ce jour établit, page par page : (a) `/networking/troubleshooting/application-failed-to-respond` :
    « Your web server should bind to the host 0.0.0.0 and listen on the port specified by the PORT environment variable »,
    avec `uvicorn main:app --host 0.0.0.0 --port $PORT` en exemple — c'est la lecture IPv4 du lot, **confirmée** pour le
    chemin public (edge) ; (b) `/networking/private-networking/how-it-works` : dans un environnement créé **après le
    16/10/2025**, les noms DNS privés résolvent en IPv4 **et** IPv6 ; dans un environnement plus ancien (« legacy »), en
    IPv6 seul — un service qui n'écoute qu'en `0.0.0.0` n'y est pas joignable par le réseau privé, d'où un commentaire de
    Dockerfile qui dit `::` : il vaut pour le trafic **privé** d'un environnement legacy, pas pour l'edge. Les deux textes
    parlent de deux chemins. **Non vérifié** : que l'edge ou le healthcheck refuse `::` seul (aucune page lue ne le dit) —
    aucun déploiement n'a été fait pour le mesurer (dépense et geste chez la plateforme, hors mandat). Règle retenue :
    `0.0.0.0` pour tout ce qui vient d'Internet ou du healthcheck ; `::` (dual-stack) en plus seulement si un service
    reçoit du trafic privé dans un environnement legacy. La page `/deployments/healthchecks` ajoute que le healthcheck
    part du nom d'hôte `healthcheck.railway.app` : une application qui filtre les hôtes doit l'autoriser, sinon
    « failed with service unavailable » ou « failed with status 400 » (voir le point 24).
10. **Volume monté root : `RAILWAY_RUN_UID=0` ou aligner l'UID** — un volume Railway est monté
    appartenant à `root`. Un conteneur qui tourne en utilisateur non-root (pratique courante des
    images slim/distroless) ne peut pas écrire dedans (permission refusée à l'écriture, pas au
    montage — l'erreur n'apparaît qu'à l'usage). Corrige : soit `RAILWAY_RUN_UID=0` (le
    conteneur tourne root, aligné avec le volume), soit aligner explicitement l'UID du
    conteneur sur celui du volume (root, uid 0) au build ou au démarrage.
11. **Logs runtime d'un déploiement en échec : API GraphQL, jamais le CLI** — pour un
    déploiement qui crash-loop ou n'atteint jamais l'état actif, `railway logs` (CLI) ne
    remonte pas de façon fiable les logs runtime ni les erreurs de couche edge. Le canal fiable
    est l'API publique Railway (GraphQL, `https://backboard.railway.com/graphql/v2`, jeton de
    projet) : requêtes `deploymentLogs` (logs de build et d'exécution) et `httpLogs` (couche
    edge/proxy, champ `upstreamErrors` pour les connexions refusées vers l'appli) — c'est par
    là qu'un déploiement mort remonte réellement sa cause. Source : https://docs.railway.com/guides/public-api

Items 12-14 ajoutés le 15/08/2026 (TF-0269) : trois constats du **second déploiement réel**
(run de version 20260815b-bdl — l'URL publique livrée portait un doublon
`<service>-recette-production`, et les URLs auto-référentes du produit sortaient sur l'hôte
interne). Source : constat direct du run MEP, pas un doc officiel — à recouper si Railway
republie sa documentation sur ces points.

12. **Le domaine généré concatène service ET environnement — nommer le SERVICE selon R-24**
    — le domaine `.up.railway.app` fabriqué par Railway est `<nom-service>-<nom-environnement>`.
    Un service nommé pour son usage (`<appli>-recette`) déployé dans l'environnement par défaut
    `production` donne `<appli>-recette-production.up.railway.app` : un doublon qui se contredit
    lui-même, et une URL publique livrée fausse. Le nom du service ne porte donc JAMAIS
    l'environnement : c'est l'environnement Railway qui le porte. Corrige : nommer le service
    `<appli>` et l'environnement selon la convention R-24 (`<appli>-{dev|qualif|production}`
    pour l'hôte résultant), ou renommer l'environnement — le renommage fait partie du
    déploiement type, jamais d'un rattrapage après livraison. À décider AVANT le premier
    déploiement : un domaine déjà créé ne se renomme plus par le CLI (§13).
13. **Renommer un domaine existant : mutation GraphQL `serviceDomainUpdate`, jamais le CLI** —
    `railway domain` refuse de renommer un domaine déjà attaché : il répond « Domains already
    exist » et n'offre aucun verbe de renommage. Le seul canal est l'API publique GraphQL
    (`https://backboard.railway.com/graphql/v2`, jeton de projet), mutation
    `serviceDomainUpdate`, dont les **5 champs sont TOUS requis** — `serviceDomainId`,
    `domain`, `environmentId`, `serviceId`, `targetPort` : en omettre un fait échouer la
    mutation (l'ancien domaine reste en place, sans erreur visible côté CLI). Récupérer d'abord
    les identifiants par requête (le `serviceDomainId` n'est pas le nom du domaine), puis muter.
    Source : constat du run 20260815b-bdl + https://docs.railway.com/guides/public-api
14. **Origine publique en variable d'environnement, sinon les URLs auto-référentes mentent** —
    un produit qui fabrique des URLs absolues vers lui-même (canonical, `og:url`, `<loc>` du
    sitemap, `url`/`@id` du JSON-LD, liens d'e-mail) doit lire son origine publique dans une
    variable de service (ex. `<PRODUIT>_URL_BASE=https://<appli>-qualif.up.railway.app`), posée
    au déploiement. Sans elle, l'appli retombe sur son hôte interne (`http://localhost:<PORT>`)
    et sert en production des URLs auto-référentes pointant nulle part — invisible au
    healthcheck (la page répond 200) et invisible aux tests unitaires (hôte de test légitime).
    Poser la variable fait partie du déploiement type, au même titre que `healthcheckPath`.
15. **Réglages de sécurité de la plateforme** — registre du pilot lu le 06/11/2026 (copie de l'étude
   « Sécurité par défaut de bout en bout » 20261106a) : `references/REGLAGES-SURS-PAR-DEFAUT.json` du pilot
   n'inscrit aucun réglage pour Railway. Un réglage inscrit plus tard se classe ici, **défaut** (appliqué à la
   création, relu à chaque livraison) ou **décision** (posé au cadrage, écart accepté consigné) ; sans ce
   classement, `scripts/oracle-reglages-corpus.mjs` rend ce corpus rouge.

Points 16 à 24 ajoutés le 22/11/2026 (TF-2744) : constats C-066 à C-088 du plan de mise à jour des compétences
(6 produits, 15/08 au 15/11/2026) qui ne tenaient pas encore dans les points 8 à 14, croisés avec la documentation lue
ce jour. Chaque point dit ce que la page établit (**documenté**) et ce qui reste un constat de terrain (**non vérifié**).

16. **Le port cible du domaine égale le port d'écoute réel (C-073)** — un domaine peut porter un « target port » : il
    dit à Railway vers quel port interne du conteneur router ce domaine. À la première génération du domaine, Railway le
    détecte si l'application n'écoute que sur un port, et propose une liste sinon ; il se change à tout moment
    (icône d'édition du domaine, ou `input.targetPort` de la création par l'API). Un port cible différent du port
    d'écoute rend un 502 « Application failed to respond » (la page cite 3000 contre 8080). **Documenté** :
    `/networking/domains/working-with-domains` (Target ports) et `/networking/troubleshooting/application-failed-to-respond`.
    Le healthcheck suit `PORT`, pas le port cible : sans `PORT`, un port cible donne « service unavailable »
    (`/deployments/healthchecks`).
17. **Un domaine personnalisé exige le CNAME ET le TXT (C-074)** — Railway rend deux enregistrements : un CNAME vers l'hôte
    du service (de la forme `<code>.up.railway.app`) et un TXT de vérification. Sans le TXT, le domaine reste en attente
    et répond 404 même quand le CNAME résout. Un domaine apex se pointe par CNAME aplati ou ALIAS (pas d'adresse IP
    fixe publiée, donc pas d'enregistrement A) ; derrière Cloudflare, le CNAME d'`authorize.railwaydns.net` ne se proxifie
    pas, et un domaine joker demande son propre CNAME `_acme-challenge` non proxifié. Par l'API : `customDomainCreate`
    rend `status.dnsRecords` et `status.verificationToken` (le TXT), `customDomainUpdate` modifie, `serviceDomainCreate`
    crée le domaine `.up.railway.app`. **Documenté** : `/networking/domains/working-with-domains` et
    `/integrations/api/manage-domains`. **Non vérifié** : la mutation `serviceDomainUpdate` et ses cinq champs requis
    du point 13 (C-070) ne figurent dans aucune page lue ; le constat reste celui du run du 15/08/2026.
18. **API : en-tête selon le jeton, introspection, limites (C-080, C-085)** — point d'accès unique
    `https://backboard.railway.com/graphql/v2` ; un jeton de **projet** passe par l'en-tête `Project-Access-Token`, un
    jeton de compte, d'espace de travail ou OAuth par `Authorization: Bearer` ; l'API accepte l'introspection (lire le
    schéma avant d'écrire une mutation) ; chaque réponse porte `RateLimit-Policy`, `X-RateLimit-Limit`,
    `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Le CLI lit `RAILWAY_TOKEN` (projet) sans `railway login`, et
    `RAILWAY_API_TOKEN` (compte ou espace de travail). **Documenté** : `/integrations/api`, `/cli`. **Non vérifié** :
    le 403 renvoyé à toute requête sans en-tête `User-Agent`, avant l'authentification, et le 400 « Problem processing
    request » d'un champ de schéma refusé sans le nommer (Produit-12, 16/08/2026) ne figurent dans aucune page lue ;
    envoyer un `User-Agent` reste la parade du constat. Le point 6 garde la règle : jeton de projet seulement.
19. **Retour arrière par commande : `deploymentRollback` (C-075, C-084 — contradiction levée)** — les produits
    disaient le retour arrière réservé au tableau de bord (C-075, SP-3), un autre l'a joué par l'API (C-084,
    Produit-61 : testé deux fois, santé 200). La documentation donne raison au second : la mutation
    `deploymentRollback(id: String!)` existe, ainsi que `deploymentRedeploy(id)` ; le retour arrière n'est permis que
    pour un déploiement `canRollback: true`, et un déploiement plus ancien que la rétention du plan n'est plus
    restaurable. Le CLI n'a **pas** de commande de retour arrière : `railway redeploy` rejoue « the most recent
    deployment » sans envoyer de code neuf (C-075 confirmé pour le CLI), et `railway deployment list` liste les
    déploiements. **Documenté** : `/integrations/api/manage-deployments`, `/deployments/reference` (Redeploy et
    Rollback : « the rollback will use the source code from the selected deployment »), `/cli/redeploy`.
20. **« Wait for CI » : une poussée sans exécution de CI attend (C-082)** — avec « Wait for CI », un nouveau
    déploiement reste en état WAITING jusqu'à ce que toutes les suites de contrôles GitHub Actions du commit soient
    finies ; un workflow en échec saute le déploiement tout de suite, un workflow ignoré ou « neutral » ne bloque jamais,
    un workflow annulé ne bloque que si aucun autre n'a réussi, et passé deux heures le déploiement est sauté. Il faut un
    workflow défini dans le dépôt qui s'exécute sur `push` ; les contrôles d'autres applications GitHub sont ignorés.
    **Documenté** : `/deployments/github-autodeploys`. **Non vérifié** : le piège de SP-2 (une poussée sans exécution de
    CI laisse Railway attendre un verdict qui n'arrive pas ; une porte de fraîcheur fondée sur une version constante
    passe sur l'ancien conteneur) — la page borne l'attente à deux heures, elle ne décrit pas ce cas.
21. **Lier le dossier avant `railway up` (C-083)** — `railway link` accepte `-p/--project`, `-e/--environment`,
    `-s/--service` et `--json` : forme non interactive pour la CI ; `railway up` accepte aussi `-p`, `-e`, `-s`, et
    `--ci` (journaux de build seuls, puis sortie). Un script ou une CI « ne crée jamais un projet implicitement » : sans
    projet lié, la commande échoue avec une erreur structurée. **Documenté** : `/cli/link`, `/cli/up`. **Non vérifié** :
    l'échec « prefix not found » de `railway up -p -e -s` dans un dossier non lié (Produit-61, 05/09/2026) n'est décrit
    nulle part et n'a pas été rejoué ; le geste du constat reste `railway link -p -e -s` avant `railway up --ci`.
22. **Stockage éphémère, volumes, variables de référence (C-069, C-078, C-086, C-087)** — le disque d'un service est
    éphémère (1 Go sur le plan gratuit, 100 Go sur un plan payant, au-delà le service peut être arrêté et redéployé) ; un
    état durable va dans un volume. Une image qui tourne en UID non root a des erreurs de permission dans un volume
    attaché : `RAILWAY_RUN_UID=0` (la variable dit « the UID of the user which should run the main process … Set to 0
    to explicitly run as root »). Un volume empêche deux déploiements actifs en même temps : un redéploiement d'un
    service à volume coupe brièvement, healthcheck ou non ; un volume ne s'utilise pas avec des réplicas. Une variable
    de service référence une autre par `${{NAMESPACE.VAR}}` (par exemple `${{Postgres.DATABASE_URL}}`, le préfixe étant
    le nom du service ; `shared` pour une variable partagée). **Documenté** : `/volumes/reference`,
    `/variables/reference`, `/deployments/reference` (Ephemeral storage). **Non vérifié** : que Railway refuse une
    déclaration `VOLUME` du Dockerfile et que le volume soit monté en propriété de `root` (SP-4, 15/11/2026) — la page
    ne parle que des images non root ; ne pas déclarer `VOLUME` reste le geste du constat.
23. **Constructeur : Railpack, plus nixpacks (C-088)** — la documentation lue le 22/11/2026 dit que Railway construit le
    service avec **Railpack**, ou avec un Dockerfile s'il y en a un ; aucune des pages lues (45 réponses de plus de 180 Ko, doublons de redirection compris) ne contient le mot nixpacks.
    La commande de démarrage d'un service Railpack s'exécute dans un shell (pas besoin d'envelopper pour `$PORT`),
    celle d'une image Dockerfile non (voir le point 8, que `/deployments/start-command` confirme mot pour mot : « commands
    ran in exec form do not support variable expansion », exemple `/bin/sh -c "exec python main.py --port $PORT"`).
    **Documenté** : `/builds/railpack`, `/deployments/start-command`. Le constat C-088 (`nixpacks.toml` avec
    `-H 0.0.0.0 -p ${PORT:-3000}`, SP-2, date inconnue) est **dépassé jusqu'à preuve du contraire** : un produit qui
    garde un `nixpacks.toml` ne le voit pas lu ; **non vérifié** sur ce produit.
24. **En-têtes du routeur et hôte du healthcheck (C-072)** — l'edge pose `X-Real-IP`, `X-Forwarded-Host` (hôte
    d'origine) et `X-Forwarded-Proto` qui **vaut toujours `https`** ; `X-Request-Start`, `X-Railway-Request-Id` et
    `X-Railway-Edge` s'y ajoutent. Sans `--proxy-headers` côté serveur et une origine publique déclarée (point 14), les
    URL absolues sortent sur l'hôte interne. Le healthcheck est émis depuis le nom d'hôte `healthcheck.railway.app` :
    une application qui filtre les hôtes doit l'autoriser. **Documenté** : `/networking/public-networking/specs-and-limits`
    (Request Headers), `/deployments/healthchecks` (Healthcheck hostname). Le HTTP en clair sur le port 80 est redirigé
    vers HTTPS (301 pour un GET ; un POST devient un GET) : un appel de webhook en HTTP perd son corps.

## Sources lues le 22/11/2026

Lues par `curl` (code HTTP 200 pour chacune ; l'outil WebFetch n'était pas disponible dans la session de l'agent, écart déclaré
au rapport), texte extrait de la page servie, **à la date du 22/11/2026**. Les adresses `/reference/*` et `/guides/*` écrites
aux points 1 à 14 redirigent toutes vers l'arborescence actuelle.

| Adresse du corpus (points 1 à 14) | Adresse d'arrivée lue le 22/11/2026 | Ce que la page établit pour ce corpus |
|---|---|---|
| https://docs.railway.com/reference/deployments | https://docs.railway.com/deployments/reference | états d'un déploiement, redeploy et rollback (rétention du plan), stockage éphémère, un seul déploiement actif, SIGTERM puis SIGKILL |
| https://docs.railway.com/reference/healthchecks | https://docs.railway.com/deployments/healthchecks | chemin 2xx attendu, délai par défaut 300 s (`RAILWAY_HEALTHCHECK_TIMEOUT_SEC`), `PORT`, hôte `healthcheck.railway.app`, pas de suivi continu après la mise en ligne ; sans healthcheck, déploiement actif au démarrage du conteneur (`/deployments/reference`) |
| https://docs.railway.com/guides/deployments | https://docs.railway.com/deployments | index de la section ; le rollback est décrit dans `/deployments/reference` |
| https://docs.railway.com/reference/volumes | https://docs.railway.com/volumes/reference | volumes, `RAILWAY_RUN_UID=0`, déploiements non simultanés |
| https://docs.railway.com/guides/public-api | https://docs.railway.com/integrations/api | point d'accès, en-têtes par type de jeton, introspection, limites de débit |
| https://docs.railway.com/reference/pricing | https://docs.railway.com/pricing/plans | plans ; **non relu en détail** : les montants du point 7 ne sont pas confirmés ici (non vérifié) |
| https://docs.railway.com/reference/deployments (région, point 1) | https://docs.railway.com/deployments/regions | identifiant `europe-west4-drams3a` (EU West Metal, Amsterdam) |
| — (points 16 à 24) | `/networking/domains/working-with-domains`, `/networking/public-networking/specs-and-limits`, `/networking/troubleshooting/application-failed-to-respond`, `/networking/private-networking/how-it-works`, `/deployments/start-command`, `/deployments/github-autodeploys`, `/builds/railpack`, `/variables/reference`, `/integrations/api/manage-deployments`, `/integrations/api/manage-domains`, `/cli`, `/cli/link`, `/cli/up`, `/cli/redeploy` | voir chaque point |

Le point 3 (le healthcheck rend la bascule saine), le point 5 et la rétention du point 4 sont **confirmés** par
`/deployments/healthchecks` et `/deployments/reference`. Le point 2, « sans healthcheck Railway bascule dès le démarrage du
conteneur », est **confirmé** : « Railway will mark the deployment as Active after starting the container ».

## Passage des 23 constats du plan (C-066 à C-088) aux points du corpus

| Constats | Point | État à la relecture du 22/11/2026 |
|---|---|---|
| C-066, C-076 `startCommand` sans shell | 8, 23 | documenté |
| C-067, C-077 adresse d'écoute | 9 | contradiction expliquée par deux chemins (public / privé) ; l'IPv6 seul à l'edge : non vérifié |
| C-068, C-079 journaux d'un déploiement mort | 11 | requêtes `deploymentLogs` et `httpLogs` documentées ; champ `upstreamErrors` : non vérifié ; « le CLI est muet » : non vérifié |
| C-069, C-078 volume et UID | 10, 22 | documenté |
| C-070 renommer un domaine | 13, 17 | `serviceDomainUpdate` : non vérifié ; `railway domain` ne renomme pas : cohérent avec le CLI lu |
| C-071, C-081 nom du domaine généré | 12 | non vérifié (aucune page lue ne décrit la règle de nommage) |
| C-072 en-têtes du routeur | 14, 24 | documenté |
| C-073 port cible | 16 | documenté |
| C-074 bascule d'un domaine personnalisé | 17 | documenté (CNAME et TXT) |
| C-075, C-084 retour arrière | 4, 19 | documenté, contradiction levée |
| C-080 en-tête User-Agent, 400 sans champ | 18 | non vérifié |
| C-082 « Wait for CI » | 20 | documenté en partie ; le piège du constat : non vérifié |
| C-083 lier avant déployer | 21 | options documentées ; l'échec du constat : non vérifié |
| C-085 CLI sans login, API v2 | 6, 18 | documenté pour les jetons |
| C-086 référence de variable, disque éphémère | 5, 22 | documenté |
| C-087 `VOLUME` refusé, volume en root | 22 | non vérifié |
| C-088 nixpacks | 23 | dépassé jusqu'à preuve du contraire (Railpack) |
