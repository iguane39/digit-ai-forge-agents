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
