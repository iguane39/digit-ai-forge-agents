# Contre-épreuve rouge de l'admission — `ops-github`

Dossier A/B′ : même demande et même baseline A que `.claude/skills/experts-forge/fixtures/fixture-ops-github.md` (copiées de ce fichier), contribution générique à la place de la contribution B.

## Demande témoin (rejouable)

Le pilot ouvre l'étape MEP d'un produit web neuf « carnet-web », dont le code vit dans un dépôt GitHub privé de l'organisation « asso-carnet », en offre GitHub Free. Le front est une application monopage construite par Vite, avec une petite API Node ; les dépendances sont gérées par npm (package-lock.json). La préproduction est déployée par un workflow GitHub Actions déclenché par une poussée sur la branche env/uat, qui reçoit main après chaque fusion ; la production est déployée par un second workflow, déclenché par un tag de version, après GO humain. Le déploiement s'authentifie auprès de l'hébergeur par un jeton d'API stocké comme secret. Deux personnes écrivent dans le dépôt, un prestataire s'y ajoute pour la recette. Donne le plan de mise en service du dépôt GitHub conforme ETAPE-MEP (déployer, vérifier, pouvoir restaurer — M-1…M-5) : configuration du dépôt, protection de la branche principale et des secrets, alertes sur les dépendances, permissions minimales des workflows, et où le retour arrière peut échouer.

## Baseline (A) — figée le 09/11/2026 à 14:32, AVANT rédaction du corpus et de la fiche

Produite par une session neuve sans outil ni documentation : `claude -p --model sonnet --tools "" --strict-mcp-config` (CLI Claude Code 2.1.318 ; réponse servie par `claude-sonnet-5-5`, 2 318 jetons de sortie, plus un appel annexe du CLI à `claude-haiku-5-5`, 23 jetons de sortie ; session `2b11d3a3-f234-41fd-b6eb-d27a98fed33e`, de 14:31:44 à 14:32:23), lancée depuis un dossier vide, la demande ci-dessus suivie de « Réponds en 5 points numérotés, sans outil, de mémoire, en une vingtaine de lignes au plus. » Sortie reprise sans retouche (la réponse déborde la vingtaine de lignes demandée ; elle est gardée telle quelle).

Je n'ai pas le texte d'ETAPE-MEP sous les yeux : le rattachement aux M-1 à M-5 est indicatif, et les plafonds du plan Free sont à vérifier sur la page de tarification GitHub avant de s'y fier.

1. **Dépôt et accès (M-1).** Gardez le dépôt privé, activez la 2FA obligatoire dans l'organisation, et limitez les deux auteurs à deux propriétaires au plus. Le prestataire n'a besoin que du rôle Read (ou d'aucun accès au dépôt, avec seulement l'URL de préproduction), car un accès en écriture lui donnerait la main sur les workflows et donc sur les secrets.

2. **Protection de main : le point bloquant.** Sur le plan Free, les règles de protection de branche, les rulesets et la protection des tags ne s'appliquent pas aux dépôts privés (à vérifier). Les revues obligatoires, les checks requis et le blocage du force-push sont donc inapplicables. Je recommande le plan Team (quelques dollars par utilisateur et par mois, montant à vérifier), ce qui relève d'une dépense à faire décider par le porteur. À défaut, posez un CODEOWNERS et une convention écrite, en actant que ce n'est pas une garde technique.

3. **Secrets et GO humain.** Les environnements avec relecteurs requis ne sont pas disponibles en Free privé (à vérifier). Le GO de production serait alors une convention, pas un verrou. Sous Team, créez les environnements `uat` et `production`, avec un relecteur obligatoire sur `production`, et un jeton d'hébergeur distinct par environnement, au moindre droit et daté pour rotation. En Free, les secrets sont au niveau dépôt : tout auteur peut les exfiltrer via un workflow sur une branche, d'où le point 1.

4. **Dépendances et workflows.** Activez Dependabot alerts et security updates (gratuits en privé), plus un `dependabot.yml` pour `npm` et `github-actions`. En CI, utilisez `npm ci` sur le `package-lock.json` versionné et `npm audit --omit=dev` comme check. Le secret scanning et le code scanning en privé sont payants (à vérifier). Fixez la permission par défaut du `GITHUB_TOKEN` à lecture seule dans l'organisation, déclarez `permissions: contents: read` en tête de chaque workflow et n'élevez que par job. Limitez les actions autorisées à celles de GitHub et à une liste blanche, épinglées par SHA, et exigez l'approbation des PR externes.

5. **Où le retour arrière peut échouer (M-4, M-5).**
   - Un redéploiement de l'ancien tag échoue si le jeton a été tourné, si une dépendance ou un registre a disparu, ou si les artefacts ont expiré (90 jours par défaut, à vérifier).
   - Une migration de données non réversible rend le code ancien incompatible avec la base.
   - Un cache CDN ou un service worker peut servir l'ancien front contre la nouvelle API.
   - Un tag déplacé ou supprimé, ou un `env/uat` réécrit par force-push, détruit la trace de ce qui était déployé.
   - Enfin, un retour arrière jamais rejoué est une hypothèse : rejouez-le une fois en préproduction, en mesurant le code de retour, avant le GO de production.

## Contribution (B′) — contre-épreuve rouge, synthétique, construite pour l'exercice

Aucun expert ne l'a produite : elle reprend la forme de la fixture rouge du juge
(`run-admission/fixture-rouge-juge.md`), transposée au domaine. Verdict attendu : `NON_MATERIEL`.

Contribution expert-ops-github :

Il est important de bien préparer la mise en service du dépôt. Pensez à protéger la branche principale, à
sécuriser vos secrets et à activer les alertes de sécurité. Limitez les droits des workflows au strict
nécessaire et tenez vos dépendances à jour. Prévoyez un plan de retour arrière et documentez la procédure.
Il conviendra de valider ces points avec les parties prenantes.
