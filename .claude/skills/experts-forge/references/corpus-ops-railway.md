# Corpus propre — exploitation Railway (checklist)

Constitué le 11/08/2026 pour la fiche `expert-ops-railway` (TF-0081, D-P1 : le cas réel ASD
a été déployé sur Railway artisanalement). Borné aux 3 verbes de forge-ops sur le service
canonique **Railway service (conteneur)**.

1. **Service canonique & frontière** — un service Railway par produit, build Dockerfile (pas de
   buildpack implicite pour rester reproductible). Hors périmètre : bases managées, cron, volumes
   multi-services. Régions : imposer explicitement une région UE (ex. `europe-west4`) — le défaut
   n'est pas garanti UE. Source : https://docs.railway.com/reference/deployments
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
   plan : un rollback n'est prouvable que si le déploiement antérieur existe encore. Source :
   https://docs.railway.com/guides/deployments
5. **Système de fichiers éphémère** — tout état local est perdu à chaque déploiement : le
   journal d'exploitation de forge-ops ne peut PAS vivre dans le conteneur (volume Railway ou
   journal côté pilot). Source : https://docs.railway.com/reference/volumes
6. **Jeton & permissions minimales** — `RAILWAY_TOKEN` de **projet** (jamais de token de compte),
   fourni par l'environnement du run MEP, jamais stocké dans la forge (frontière credentials).
   Source : https://docs.railway.com/guides/public-api#authentication
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
