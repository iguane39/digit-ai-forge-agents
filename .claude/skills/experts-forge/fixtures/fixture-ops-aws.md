# Fixture de valeur A/B — `ops-aws`

## Demande témoin (rejouable)

Le pilot ouvre l'étape MEP d'un produit conteneurisé « atelier-web » : Dockerfile prêt, l'app écoute sur le port 8080, healthcheck HTTP `GET /sante` (200 attendu), image construite par l'étape MEP, **région Europe exigée par le brief**, staging d'abord puis GO humain. Cible du brief : AWS. Donne le plan de déploiement staging conforme ETAPE-MEP (déployer, vérifier, pouvoir restaurer — M-1…M-5) : commandes, permissions minimales, et où le rollback peut échouer.

## Baseline (A) — figée le 11/08/2026, AVANT rédaction du corpus et de la fiche

1. Pousser l'image sur ECR.
2. Créer le service avec `aws apprunner create-service` (ou update-service pour mettre à jour).
3. Vérifier l'URL du service, configurer les variables d'environnement.
4. En cas de problème, redéployer l'image précédente.
5. Utiliser un rôle IAM dédié au déploiement.

## Contribution (B) — par la rubrique de la fiche, produite le 11/08/2026 (jugement différé, session S′)

Contribution expert-ops-aws :

1. **[Axe 1 · service & frontière]** App Runner en `eu-west-1` explicite (demande : « région
   Europe exigée ») pour un web app simple ; si le produit exige du traffic-splitting ou des
   révisions conservées, App Runner est le MAUVAIS service (→ ECS) — frontière à poser au
   cadrage, pas au premier incident (corpus §1, §4).
2. **[Axe 2 · bascule]** Désactiver le déploiement AUTOMATIQUE sur push ECR pour la MEP : la
   bascule doit rester un geste du run (gate), pas un effet de bord d'un push. Déploiement
   manuel par `update-service` piloté par le pilot (corpus §2 ; demande : « staging d'abord
   puis GO humain »).
3. **[Axe 3 · rollback — le piège structurel]** App Runner n'a ni révisions conservées ni
   répartition de trafic : le rollback VOLONTAIRE = `update-service` vers le tag d'image
   antérieur. Deux conditions que la baseline ignore : tags ECR IMMUABLES (jamais `:latest`,
   sinon « l'image précédente » n'existe pas comme référence stable) et rétention des images
   au registre. À l'inverse, l'échec de déploiement est auto-rollbacké par le service —
   distinguer les deux cas au dossier MEP (corpus §2, §3, §4 ; demande : « où le rollback
   peut échouer »).
4. **[Axe 4 · permissions]** Rôle d'accès ECR = politique managée
   `AWSAppRunnerServicePolicyForECRAccess` + `iam:PassRole` restreint à ce rôle ; pas de
   `apprunner:*` sur `*` — restreindre à l'ARN du service (corpus §5).
5. **[Axe 5 · coûts/hygiène]** La mémoire provisionnée est facturée MÊME SANS TRAFIC (pas de
   scale-to-zero complet) : un staging App Runner oublié coûte chaque heure — pause ou
   suppression du staging après GO, à inscrire dans le plan (corpus §6 ; demande :
   « staging d'abord puis GO humain »).

## Critère de différence matérielle

Verdict `MATERIEL` exigé : axes 1, 2 et 4 de la rubrique juge à OUI, et au moins un des
axes 3 ou 5 — sinon la fiche reste `todo`/`refuse` et n'est jamais routée.
