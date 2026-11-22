# Corpus propre — exploitation AWS App Runner (checklist) — service DÉPRÉCIÉ le 21/11/2026

> **App Runner fermé aux nouveaux clients — Déprécié le 21/11/2026 — remplacé par Amazon ECS Express Mode** (TF-2745, L-03
> du plan de mise à jour des compétences du 21/11/2026). Source, lue le 22/11/2026 :
> https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html — « AWS App Runner is no longer open
> to new customers. Existing customers can continue to use the service as normal, including creating new resources and
> services. AWS continues to invest in security and availability for AWS App Runner, but we do not plan to introduce new
> features. We recommend that customers explore Amazon Elastic Container Service (Amazon ECS) Express Mode ». La même
> mention ouvre `/apprunner/latest/dg/manage-deploy.html` (page de veille du 21/11/2026, relue le 22/11/2026) et
> `/apprunner/latest/dg/what-is-apprunner.html`. **Conséquence** : un plan de déploiement AWS pour un compte qui n'a pas
> déjà App Runner ne vise plus App Runner ; les points 1 à 6 ci-dessous valent pour un **client existant** et pour lire un
> plan hérité. Le remplaçant est décrit au point 8.

Constitué le 11/08/2026 pour la fiche `expert-ops-aws` (TF-0081). Borné aux 3 verbes de
forge-ops sur le service qui était canonique, **AWS App Runner** (conteneur web managé) ; relu le 22/11/2026.

1. **Service canonique & frontière — DÉPASSÉ le 21/11/2026 pour tout nouveau client** — App Runner pour un web app conteneurisé simple (pas
   ECS/EKS/Lambda pour ce profil) était la règle du 11/08/2026 ; elle ne tient plus : le service est fermé aux nouveaux
   clients et le profil « web app conteneurisé simple » va vers Amazon ECS Express Mode (point 8). Région UE explicite
   (`eu-west-1/3`) reste la règle. Source (lue le 22/11/2026, avec l'avis de fermeture en tête) :
   https://docs.aws.amazon.com/apprunner/latest/dg/what-is-apprunner.html
2. **Déployer** — image poussée sur ECR (tags IMMUABLES exigés — jamais `:latest`, sinon le
   rollback devient indécidable), puis `aws apprunner create-service` /
   `update-service --source-configuration` ; déploiement automatique sur push ECR possible
   mais à ÉVITER pour la MEP (bascule sans gate) : déploiement manuel piloté par le run. **Relu le 22/11/2026** : la page
   confirme les deux modes ; le choix se pose par `AutoDeploymentsEnabled` de `SourceConfiguration` (`False` = manuel, `True`
   = automatique) à `CreateService` ou `UpdateService`, et l'automatique n'existe pas pour une image ECR Public ni pour un
   dépôt ECR d'un autre compte. Source : https://docs.aws.amazon.com/apprunner/latest/dg/manage-deploy.html
3. **Healthcheck idiomatique** — `HealthCheckConfiguration` : `Protocol=HTTP`,
   `Path=/sante`, seuils Healthy/Unhealthy ; App Runner ne bascule le trafic qu'après
   healthcheck vert et **revient seul à la version précédente si le déploiement échoue**
   (rollback automatique d'échec de déploiement). **Relu le 22/11/2026** : la page dit que le protocole par défaut est **TCP**
   (HTTP se choisit, avec un chemin), et décrit délai, seuils sains et non sains ; **non vérifié** : le retour automatique à
   la version précédente après un déploiement échoué n'apparaît dans aucune des pages lues ce jour. Source :
   https://docs.aws.amazon.com/apprunner/latest/dg/manage-configure-healthcheck.html
4. **Rollback volontaire : le piège majeur** — App Runner n'a NI révisions conservées NI
   répartition de trafic : le rollback volontaire (après bascule réussie mais régression
   constatée) = `update-service` vers le TAG antérieur — d'où l'exigence de tags immuables
   et d'un registre qui conserve les images (équivalent O-4 : image purgée = rollback
   impossible). C'est la différence structurelle avec Cloud Run/ACA à documenter au dossier MEP.
5. **IAM minimal** — rôle d'accès ECR du service : politique managée
   `AWSAppRunnerServicePolicyForECRAccess` + `iam:PassRole` limité à ce rôle pour l'identité
   de déploiement ; pas de politique `apprunner:*` sur `*` — restreindre à l'ARN du service.
   Relu le 22/11/2026 : la page cite `AWSAppRunnerServicePolicyForECRAccess` dans le rôle de service passé à `CreateService`
   (`AuthenticationConfiguration`). Source : https://docs.aws.amazon.com/apprunner/latest/dg/security_iam_service-with-iam.html
6. **Coûts d'ordre de grandeur** — la mémoire PROVISIONNÉE est facturée même sans trafic
   (instances en pause) ; le vCPU s'ajoute quand le service sert — pas de scale-to-zero
   complet : un staging App Runner oublié coûte. L'étape MEP prévoit pause/suppression.
   Relu le 22/11/2026 : la page de prix facture la mémoire des instances **provisionnées** même au repos, et le vCPU avec la
   mémoire consommée des instances **actives**, à la seconde (minimum d'une minute de vCPU à chaque reprise de traitement) ;
   les montants ne sont pas reportés ici (non vérifié). Source : https://aws.amazon.com/apprunner/pricing/
7. **Réglages de sécurité de la plateforme** — registre du pilot lu le 06/11/2026 (copie de l'étude
   « Sécurité par défaut de bout en bout » 20261106a) : `references/REGLAGES-SURS-PAR-DEFAUT.json` du pilot
   n'inscrit aucun réglage pour AWS. Un réglage inscrit plus tard se classe ici, **défaut** (appliqué à la
   création, relu à chaque livraison) ou **décision** (posé au cadrage, écart accepté consigné) ; sans ce
   classement, `scripts/oracle-reglages-corpus.mjs` rend ce corpus rouge.
8. **Remplaçant : Amazon ECS Express Mode (TF-2745, relu le 22/11/2026)** — un service Express Mode ne demande que trois
   choses : une **image de conteneur**, un **rôle d'exécution de tâche** (`ecsTaskExecutionRole`) et un **rôle
   d'infrastructure** (`ecsInfrastructureRoleForExpressServices`). Amazon ECS orchestre le reste : service ECS sur
   Fargate avec une URL accessible, répartiteur de charge avec TLS, mise à l'échelle automatique, supervision, réseau ;
   HTTPS public ou privé ; disponible dans toutes les régions où ECS et Fargate le sont ; créé par la console, l'AWS CLI,
   les SDK ou CloudFormation. **Pas de frais propres** : on paie les ressources sous-jacentes (Fargate, répartiteur de
   charge, journaux et métriques CloudWatch, transfert de données) ; les services Express Mode d'une même configuration réseau
   **partagent** un répartiteur de charge. Tout reste visible et gérable dans le compte (« transparent infrastructure »).
   **Migration depuis App Runner** (page de fermeture) : blue/green par **DNS pondéré** — revoir la configuration du
   service App Runner, créer le service Express Mode avec la même image, configurer le même domaine personnalisé, déplacer le
   trafic par Route 53 (ou le DNS du client) à petits pas, puis supprimer le service App Runner ; le retour arrière se fait
   en rééquilibrant les poids. Sources : https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html
   et https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-getting-started.html (lues le 22/11/2026) ;
   guide de migration : https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html.
   **Non vérifié, à lire avant tout plan** : le healthcheck, le retour arrière volontaire (révisions conservées ou non),
   les IAM minimaux détaillés et l'ordre de grandeur des coûts d'un service Express Mode ne sont pas dans les pages lues
   ce jour ; ce corpus n'en dit rien tant qu'une page datée ne les établit pas. Le point 4 (rollback par tag antérieur)
   décrit App Runner et ne se transpose pas sans cette lecture.
