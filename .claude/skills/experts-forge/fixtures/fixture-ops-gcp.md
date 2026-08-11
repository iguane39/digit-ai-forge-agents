# Fixture de valeur A/B — `ops-gcp`

## Demande témoin (rejouable)

Le pilot ouvre l'étape MEP d'un produit conteneurisé « atelier-web » : Dockerfile prêt, l'app écoute sur le port 8080, healthcheck HTTP `GET /sante` (200 attendu), image construite par l'étape MEP, **région Europe exigée par le brief**, staging d'abord puis GO humain. Cible du brief : GCP. Donne le plan de déploiement staging conforme ETAPE-MEP (déployer, vérifier, pouvoir restaurer — M-1…M-5) : commandes, permissions minimales, et où le rollback peut échouer.

## Baseline (A) — figée le 11/08/2026, AVANT rédaction du corpus et de la fiche

1. Construire l'image et la pousser sur le registre GCP.
2. Déployer avec `gcloud run deploy` en précisant l'image et la région.
3. Ouvrir l'URL du service et vérifier que l'application répond.
4. En cas de problème, redéployer l'image précédente.
5. Restreindre les droits du compte de service utilisé pour déployer.

## Contribution (B) — par la rubrique de la fiche, produite le 11/08/2026 (jugement différé, session S′)

Contribution expert-ops-gcp :

1. **[Axe 1 · service & frontière]** Cloud Run service en région UE EXPLICITE
   (`--region europe-west1`) — la demande impose l'Europe et une région ne se change pas :
   un service est régional, la « migration » est une re-création (corpus §1 ;
   demande : « région Europe exigée »).
2. **[Axe 2 · bascule]** La baseline (`gcloud run deploy` nu) bascule 100 % du trafic
   immédiatement. Déployer `--no-traffic --tag candidat`, smoke-tester `GET /sante` sur l'URL
   taguée `https://candidat---<service>-<hash>.a.run.app`, PUIS
   `gcloud run services update-traffic --to-latest` — c'est l'exact équivalent du
   « healthcheck avant bascule » de forge-ops (corpus §2 ; demande : « /sante (200) »,
   « staging d'abord »).
3. **[Axe 3 · rollback]** Le rollback est un déplacement de trafic, pas un redéploiement :
   `gcloud run services update-traffic <service> --to-revisions <rev-précédente>=100`
   (instantané). Condition : ne JAMAIS supprimer les révisions saines antérieures — une
   révision purgée rend le retour impossible (corpus §4 ; demande : « pouvoir restaurer »).
4. **[Axe 4 · permissions]** Identité de déploiement minimale : `roles/run.admin` +
   `roles/iam.serviceAccountUser` sur le SA runtime + `roles/artifactregistry.reader` ; le SA
   runtime du service reste distinct et minimal — pas de SA éditeur par défaut (corpus §5).
5. **[Axe 5 · coûts/hygiène]** Facturation à la requête avec palier gratuit : un staging
   Cloud Run à zéro trafic coûte ~0 — SAUF si `--min-instances > 0`, qui crée un coût fixe
   permanent : interdit en staging, à décider explicitement pour la prod au GO (corpus §6 ;
   demande : « staging puis GO humain »).

## Critère de différence matérielle

Verdict `MATERIEL` exigé : axes 1, 2 et 4 de la rubrique juge à OUI, et au moins un des
axes 3 ou 5 — sinon la fiche reste `todo`/`refuse` et n'est jamais routée.
