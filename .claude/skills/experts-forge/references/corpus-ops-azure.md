# Corpus propre — exploitation Azure Container Apps (checklist)

Constitué le 11/08/2026 pour la fiche `expert-ops-azure` (TF-0081). Borné aux 3 verbes de
forge-ops sur le service canonique **Azure Container Apps** (ACA).

1. **Service canonique & frontière** — ACA pour un web app conteneurisé (pas AKS ni App
   Service pour ce profil) ; environnement ACA + app dans un resource group dédié, région UE
   (`--location westeurope`). Source : https://learn.microsoft.com/azure/container-apps/overview
2. **Le choix qui conditionne tout : le mode de révision** — `single` (défaut) REMPLACE la
   révision à chaque update : pas de retour instantané possible ; `multiple` conserve les
   révisions et permet la répartition de trafic. Pour un staging MEP digne du rollback prouvé :
   `az containerapp revision set-mode --mode multiple`. Source :
   https://learn.microsoft.com/azure/container-apps/revisions
3. **Déployer sans bascule aveugle** — `az containerapp update --image <IMAGE>
   --revision-suffix <suffixe>` crée la nouvelle révision ; smoke test sur l'URL de révision,
   puis bascule : `az containerapp ingress traffic set --revision-weight <nouvelle>=100`.
   Piège : `targetPort` de l'ingress = 8080 (le port de l'app), pas 80.
4. **Healthcheck idiomatique** — probes `startup`/`liveness`/`readiness` HTTP `/sante` dans le
   template de conteneur ; sans readiness, une révision malade reçoit du trafic. Source :
   https://learn.microsoft.com/azure/container-apps/health-probes
5. **Rollback natif & pièges** — en mode multiple :
   `az containerapp ingress traffic set --revision-weight <precedente>=100` (instantané) ;
   une révision désactivée peut être réactivée (`az containerapp revision activate`). Piège :
   en mode single, le « rollback » est un redéploiement complet de l'image antérieure — lent
   et dépendant du registre.
6. **IAM minimal** — identité de déploiement : rôle « Container Apps Contributor » sur le
   resource group + `AcrPull` sur le registre (identité managée pour le pull, jamais de mot de
   passe registre en clair). Source : https://learn.microsoft.com/azure/container-apps/managed-identity
7. **Coûts d'ordre de grandeur** — plan Consumption : vCPU-s + GiB-s avec franchise mensuelle
   gratuite ; scale-to-zero natif (staging économe) ; piège : `minReplicas > 0` = coût fixe.
   Source : https://azure.microsoft.com/pricing/details/container-apps/
