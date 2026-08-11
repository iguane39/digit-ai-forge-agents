# Corpus propre — exploitation GCP Cloud Run (checklist)

Constitué le 11/08/2026 pour la fiche `expert-ops-gcp` (TF-0081). Borné aux 3 verbes de
forge-ops sur le service canonique **Cloud Run (service, conteneur managé)**.

1. **Service canonique & frontière** — Cloud Run service pour un web app conteneurisé ;
   hors périmètre : jobs, GKE, App Engine. Région UE explicite (`--region europe-west1/9`).
   Source : https://cloud.google.com/run/docs/deploying
2. **Déployer sans bascule aveugle** — chaque déploiement crée une RÉVISION immuable ;
   `gcloud run deploy <SERVICE> --image <IMAGE> --region <REGION> --no-traffic --tag candidat`
   déploie SANS router le trafic : le smoke test se fait sur l'URL taguée
   (https://candidat---<service>-<hash>.a.run.app), puis
   `gcloud run services update-traffic <SERVICE> --to-latest` bascule. C'est l'équivalent
   cloud du « healthcheck avant bascule » de forge-ops. Source :
   https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration
3. **Healthcheck idiomatique** — startup probe + liveness probe HTTP sur `/sante`
   (spec du service) ; sans startup probe, une app lente au démarrage est tuée en boucle.
   Source : https://cloud.google.com/run/docs/configuring/healthchecks
4. **Rollback natif & pièges** — `gcloud run services update-traffic <SERVICE>
   --to-revisions <REV_PRECEDENTE>=100` : instantané, sans rebuild — le rollback est un
   déplacement de trafic entre révisions conservées. Piège : ne jamais supprimer les
   révisions saines antérieures (c'est l'équivalent du O-4 de forge-ops : histoire purgée =
   rollback impossible).
5. **IAM minimal** — identité de déploiement : `roles/run.admin` +
   `roles/iam.serviceAccountUser` (sur le SA runtime) + `roles/artifactregistry.reader` ;
   le SA runtime du service reste distinct et minimal (jamais le SA par défaut de l'éditeur).
   Source : https://cloud.google.com/run/docs/reference/iam/roles
6. **Coûts d'ordre de grandeur** — facturation à la requête (vCPU-s + GiB-s) avec palier
   gratuit ; piège : `--min-instances > 0` transforme le service en coût FIXE permanent —
   à réserver à la prod, jamais au staging. Source : https://cloud.google.com/run/pricing
