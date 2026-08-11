# Fixture de valeur A/B — `ops-railway`

## Demande témoin (rejouable)

Le pilot ouvre l'étape MEP d'un produit conteneurisé « atelier-web » : Dockerfile prêt, l'app écoute sur le port 8080, healthcheck HTTP `GET /sante` (200 attendu), image construite par l'étape MEP, **région Europe exigée par le brief**, staging d'abord puis GO humain. Cible du brief : Railway. Donne le plan de déploiement staging conforme ETAPE-MEP (déployer, vérifier, pouvoir restaurer — M-1…M-5) : commandes, permissions minimales, et où le rollback peut échouer.

## Baseline (A) — figée le 11/08/2026, AVANT rédaction du corpus et de la fiche

1. Installer la CLI Railway et se connecter au projet.
2. Lancer `railway up` depuis la racine du produit pour construire et déployer.
3. Vérifier que le service répond, configurer les variables d'environnement au dashboard.
4. En cas de problème, redéployer la version précédente depuis le dashboard.
5. Prévoir une URL de staging et tester avant d'annoncer le GO.

## Contribution (B) — par la rubrique de la fiche, produite le 11/08/2026 (jugement différé, session S′)

Contribution expert-ops-railway :

1. **[Axe 1 · service & frontière]** Fixer la région AVANT le premier `railway up` : la demande
   exige l'Europe et le défaut Railway n'est pas garanti UE — créer le service avec la région
   `europe-west4` explicite, sinon la migration ultérieure est un redéploiement complet
   (corpus §1 ; demande : « région Europe exigée par le brief »).
2. **[Axe 2 · bascule]** La baseline bascule à l'aveugle : sans `deploy.healthcheckPath` dans
   `railway.json`, Railway route le trafic dès le démarrage du conteneur. Poser
   `healthcheckPath: "/sante"` + `healthcheckTimeout` — c'est la condition pour que la bascule
   n'ait lieu qu'après 200 sur /sante (corpus §2-§3 ; demande : « GET /sante (200 attendu) »).
3. **[Axe 3 · rollback]** Piège CLI : `railway redeploy` rejoue le déploiement COURANT, pas le
   précédent — le rollback volontaire passe par le dashboard (Rollback sur un deployment
   antérieur) et n'est prouvable que si l'historique est encore retenu par le plan. À tester
   UNE fois en staging avant le GO humain, et à consigner au dossier MEP (corpus §4 ;
   demande : « pouvoir restaurer — M-1…M-5 »).
4. **[Axe 4 · permissions]** Utiliser un `RAILWAY_TOKEN` de PROJET fourni par l'environnement
   du run — jamais un token de compte, jamais stocké dans la forge ni dans le produit
   (corpus §6 ; frontière credentials de forge-ops).
5. **[Axe 5 · coûts/hygiène]** Le système de fichiers est éphémère : le journal d'exploitation
   de forge-ops ne peut pas vivre dans le conteneur (volume ou journal côté pilot), et un
   staging laissé actif est facturé à l'usage — prévoir l'extinction du staging après GO
   (corpus §5, §7 ; demande : « staging d'abord puis GO humain »).

## Critère de différence matérielle

Verdict `MATERIEL` exigé : axes 1, 2 et 4 de la rubrique juge à OUI, et au moins un des
axes 3 ou 5 — sinon la fiche reste `todo`/`refuse` et n'est jamais routée.
