# Corpus propre — exploitation AWS App Runner (checklist)

Constitué le 11/08/2026 pour la fiche `expert-ops-aws` (TF-0081). Borné aux 3 verbes de
forge-ops sur le service canonique **AWS App Runner** (conteneur web managé).

1. **Service canonique & frontière** — App Runner pour un web app conteneurisé simple (pas
   ECS/EKS/Lambda pour ce profil) ; région UE explicite (`eu-west-1/3`). Source :
   https://docs.aws.amazon.com/apprunner/latest/dg/what-is-apprunner.html
2. **Déployer** — image poussée sur ECR (tags IMMUABLES exigés — jamais `:latest`, sinon le
   rollback devient indécidable), puis `aws apprunner create-service` /
   `update-service --source-configuration` ; déploiement automatique sur push ECR possible
   mais à ÉVITER pour la MEP (bascule sans gate) : déploiement manuel piloté par le run.
   Source : https://docs.aws.amazon.com/apprunner/latest/dg/manage-deploy.html
3. **Healthcheck idiomatique** — `HealthCheckConfiguration` : `Protocol=HTTP`,
   `Path=/sante`, seuils Healthy/Unhealthy ; App Runner ne bascule le trafic qu'après
   healthcheck vert et **revient seul à la version précédente si le déploiement échoue**
   (rollback automatique d'échec de déploiement). Source :
   https://docs.aws.amazon.com/apprunner/latest/dg/manage-configure-healthcheck.html
4. **Rollback volontaire : le piège majeur** — App Runner n'a NI révisions conservées NI
   répartition de trafic : le rollback volontaire (après bascule réussie mais régression
   constatée) = `update-service` vers le TAG antérieur — d'où l'exigence de tags immuables
   et d'un registre qui conserve les images (équivalent O-4 : image purgée = rollback
   impossible). C'est la différence structurelle avec Cloud Run/ACA à documenter au dossier MEP.
5. **IAM minimal** — rôle d'accès ECR du service : politique managée
   `AWSAppRunnerServicePolicyForECRAccess` + `iam:PassRole` limité à ce rôle pour l'identité
   de déploiement ; pas de politique `apprunner:*` sur `*` — restreindre à l'ARN du service.
   Source : https://docs.aws.amazon.com/apprunner/latest/dg/security_iam_service-with-iam.html
6. **Coûts d'ordre de grandeur** — la mémoire PROVISIONNÉE est facturée même sans trafic
   (instances en pause) ; le vCPU s'ajoute quand le service sert — pas de scale-to-zero
   complet : un staging App Runner oublié coûte. L'étape MEP prévoit pause/suppression.
   Source : https://aws.amazon.com/apprunner/pricing/
