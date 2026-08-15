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
