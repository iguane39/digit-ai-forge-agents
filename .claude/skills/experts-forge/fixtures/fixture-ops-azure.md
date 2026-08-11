# Fixture de valeur A/B — `ops-azure`

## Demande témoin (rejouable)

Le pilot ouvre l'étape MEP d'un produit conteneurisé « atelier-web » : Dockerfile prêt, l'app écoute sur le port 8080, healthcheck HTTP `GET /sante` (200 attendu), image construite par l'étape MEP, **région Europe exigée par le brief**, staging d'abord puis GO humain. Cible du brief : Azure. Donne le plan de déploiement staging conforme ETAPE-MEP (déployer, vérifier, pouvoir restaurer — M-1…M-5) : commandes, permissions minimales, et où le rollback peut échouer.

## Baseline (A) — figée le 11/08/2026, AVANT rédaction du corpus et de la fiche

1. Pousser l'image sur Azure Container Registry.
2. Créer/mettre à jour l'app avec `az containerapp up --image …`.
3. Vérifier l'URL d'ingress, configurer les variables d'environnement.
4. En cas de problème, redéployer l'image précédente.
5. Utiliser un resource group dédié et limiter les droits au groupe.

## Contribution (B) — par la rubrique de la fiche, produite le 11/08/2026 (jugement différé, session S′)

Contribution expert-ops-azure :

1. **[Axe 1 · service & frontière]** ACA dans un resource group dédié, `--location westeurope`
   explicite (demande : « région Europe exigée ») ; pour ce profil web simple, pas d'AKS —
   la frontière est écrite pour éviter l'escalade d'infra (corpus §1).
2. **[Axe 2 · le choix qui conditionne tout]** Le mode de révision par défaut est `single` :
   chaque update REMPLACE la révision — aucun retour instantané possible. Passer l'app en
   `az containerapp revision set-mode --mode multiple` AVANT le premier déploiement MEP ;
   c'est la décision de cadrage que la baseline ignore et qui rend le rollback prouvable
   (corpus §2 ; demande : « pouvoir restaurer — M-1…M-5 »).
3. **[Axe 3 · bascule & rollback]** Déployer avec `--revision-suffix`, smoke-tester l'URL de
   révision, basculer par `az containerapp ingress traffic set --revision-weight
   <nouvelle>=100` ; rollback = même commande vers la révision précédente (instantané).
   Piège d'ingress : `targetPort` = 8080 (le port réel de l'app), pas 80 (corpus §3, §5 ;
   demande : « l'app écoute sur le port 8080 »).
4. **[Axe 4 · permissions]** Identité de déploiement : rôle « Container Apps Contributor »
   sur le resource group + `AcrPull` via identité managée pour le pull d'image — jamais de
   mot de passe registre en clair dans le run (corpus §6 ; frontière credentials).
5. **[Axe 5 · coûts/hygiène]** Plan Consumption : scale-to-zero natif — un staging ACA à zéro
   trafic ne coûte quasi rien, contrairement à App Runner ; garder `minReplicas=0` en staging,
   la mise à `>0` est une décision de GO, pas un défaut (corpus §7 ; demande : « staging
   d'abord puis GO humain »).

## Critère de différence matérielle

Verdict `MATERIEL` exigé : axes 1, 2 et 4 de la rubrique juge à OUI, et au moins un des
axes 3 ou 5 — sinon la fiche reste `todo`/`refuse` et n'est jamais routée.
