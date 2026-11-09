---
sources:
  - https://docs.github.com/en/get-started/learning-about-github/githubs-plans (lu le 2026-11-09 à 14:36, version de la documentation free-pro-team@latest, aucune date de mise à jour affichée sur la page)
  - https://docs.github.com/en/code-security/getting-started/github-security-features (lu le 2026-11-09 à 14:34, même version, même absence de date)
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/actions/reference/security/secure-use (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/actions/concepts/security/github_token (lu le 2026-11-09 à 14:36)
  - https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository (lu le 2026-11-09 à 14:36)
  - https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows (lu le 2026-11-09 à 14:36)
  - https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs (lu le 2026-11-09 à 14:36)
  - https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates (lu le 2026-11-09 à 14:36)
  - https://docs.github.com/en/code-security/concepts/secret-security/push-protection (lu le 2026-11-09 à 14:34)
  - https://docs.github.com/en/code-security/how-tos/secure-your-secrets/prevent-future-leaks/enable-push-protection (lu le 2026-11-09 à 14:39)
  - https://docs.github.com/en/code-security/concepts/secret-security/command-line-push-protection (lu le 2026-11-09 à 14:39)
  - https://docs.github.com/en/code-security/concepts/secret-security/push-protection-from-the-rest-api (lu le 2026-11-09 à 14:39)
  - https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization (lu le 2026-11-09 à 14:36)
  - https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization (lu le 2026-11-09 à 14:36)
  - https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/reverting-a-pull-request (lu le 2026-11-09 à 14:36)
  - https://docs.github.com/en/rest/repos/repos (lu le 2026-11-09 à 14:39, points « vulnerability alerts » et « security_and_analysis »)
  - https://docs.github.com/en/rest/repos/rules (lu le 2026-11-09 à 14:39)
  - digit-ai-factory references/REGLAGES-SURS-PAR-DEFAUT.json, entrées GitHub (3 réglages, source_lue_le 2026-11-06 par le registre ; classements repris, lus dans le fichier du pilot le 2026-11-09)
---

# Corpus ops-github — checklist propre (09/11/2026)

Constitué le 09/11/2026, APRÈS la baseline de la fixture `fixtures/fixture-ops-github.md` (figée à
14:32, avant toute rédaction du présent fichier). Chaque fait vient d'une page de `docs.github.com`
lue ce jour-là dans la version `free-pro-team@latest` (GitHub.com). Ces pages n'affichent aucune date
de mise à jour : la date de lecture fait foi, et la plateforme change vite. Les prix et les quotas
n'y figurent pas, par choix (donnée volatile, loi n° 4) : la page des offres renvoie elle-même à
« GitHub Pricing ». Les phrases entre guillemets sont des citations de la page. Périmètre : GitHub.com,
dépôts d'une organisation ; GitHub Enterprise Server et Pages ne sont pas traités.

1. **L'offre de l'organisation décide de ce qui existe sur un dépôt privé.**
   - Free for organizations : « unlimited private repositories with a limited feature set ». Elle inclut
     les alertes Dependabot et l'obligation de double vérification (page des offres ; page de
     l'obligation : « available to organizations on a GitHub Free or GitHub Team plan »).
   - Team ajoute, en dépôt privé : « Required pull request reviewers », « Protected branches »,
     « Code owners », et « the option to purchase » GitHub Code Security et GitHub Secret Protection.
     Free for organizations ne liste aucun de ces outils.
   - Rulesets : « available in public repositories with GitHub Free and GitHub Free for organizations,
     and in public and private repositories with GitHub Pro, GitHub Team, and GitHub Enterprise
     Cloud » ; les règles de poussée (push rulesets) sont réservées à Team en dépôt privé.
   - Environnements : « For access to environments, environment secrets, and deployment branches in
     private or internal repositories, you must use GitHub Pro, GitHub Team, or GitHub Enterprise ».
     Relecteurs requis et minuterie : « only available for public repositories » sur Free, Pro et Team.
   - Conséquence de méthode : avant tout plan, nommer l'offre, la visibilité du dépôt et ce que chaque
     garde exige. Une garde indisponible se rend comme une DÉCISION de dépense ou d'écart accepté,
     jamais comme une étape du plan. Sources : pages des offres et des fonctions de sécurité (14:36,
     14:34) ; page des rulesets (14:34) ; page des environnements (14:34).
2. **Protection de la branche principale : règle de protection ou ruleset.**
   - Les deux coexistent et s'appliquent ensemble ; quand une même règle est définie de plusieurs
     façons, la version la plus restrictive s'applique. « Only a single branch protection rule can apply
     at a time » ; plusieurs rulesets peuvent viser la même branche. Un ruleset est Active ou Disabled
     (la page de création cite aussi « Evaluate », pour les restrictions de métadonnées) ; tout lecteur
     du dépôt peut lire ses rulesets actifs.
   - Par défaut, la poussée forcée est bloquée (« enabled by default ») et la suppression refusée
     (« selected by default »). Poussée forcée bloquée : « organization owners or repository
     administrators will be unable to change or rename the default branch unless they are authorized to
     bypass the ruleset ».
   - Contournement. Règle de protection : les administrateurs y échappent par défaut, sauf « Do not
     allow bypassing the above settings ». Ruleset : liste explicite (administrateurs, rôle maintain ou
     write, équipes, GitHub Apps, Dependabot) ; le mode « For pull requests only » oblige l'acteur à
     ouvrir une demande de fusion et laisse une trace.
   - « Require a pull request before merging » : la demande « doesn't necessarily have to be approved,
     but it must be opened » tant qu'aucun nombre d'approbations n'est fixé. Option « approval of the
     most recent reviewable push » : une approbation d'une autre personne que celle qui a poussé en
     dernier. Inférence de ce corpus, non écrite par la page : avec deux personnes en écriture et cette
     option, l'absence de l'une bloque la fusion de l'autre tant que personne n'est à la liste de
     contournement.
   - Contrôles requis : un contrôle « successful, skipped, or neutral » satisfait l'exigence, un job
     ignoré par un filtre de chemins la satisfait donc aussi ; « make sure that job names are unique
     across all workflows », sinon le résultat est ambigu et la fusion peut se bloquer.
   - Lecture de l'état réel : `GET /repos/{owner}/{repo}/rules/branches/{branch}` rend les règles
     ACTIVES qui s'appliquent ; les rulesets en « evaluate » ou « disabled » n'y figurent pas.
   - Sources : pages des règles protégées, des rulesets, des règles disponibles, de la création d'un
     ruleset (14:34) ; page REST des règles (14:39).
3. **Tags de version et branche de promotion.**
   - Un ruleset vise des branches OU des tags. « Restrict creations », « Restrict updates » et
     « Restrict deletions » réservent la création, la mise à jour et la suppression d'une référence
     qui correspond au motif aux seuls acteurs de la liste de contournement ; « Block force pushes »
     vaut pour « the targeted branches or tags ».
   - Déclencher un workflow sur un tag : `on: push: tags: [ 'v1.**' ]`. « Events will not be created for
     tags when more than three tags are pushed at once » : trois tags poussés d'un coup ne
     déclenchent rien.
   - **Piège du jeton.** « events triggered by the GITHUB_TOKEN will not create a new workflow run »,
     sauf `workflow_dispatch` et `repository_dispatch`. Un workflow qui pousse `env/uat` avec le jeton
     fourni ne déclenche donc pas le workflow de déploiement abonné à `push` sur cette branche. Pour une
     demande de fusion créée par un workflow, la page nomme un jeton d'installation de GitHub App ou un
     jeton d'accès personnel ; l'étendre à la poussée est une inférence de ce corpus, à jouer en
     préproduction. Les deux exceptions écrites sont `workflow_dispatch` et `repository_dispatch`.
   - Une branche de promotion que seul un automate pousse se protège par « Restrict updates » avec cet
     automate (GitHub App) à la liste de contournement ; exiger une demande de fusion sur elle refuse
     la poussée directe : c'est le cas mesuré au pilot (point 12).
   - Sources : pages des règles disponibles et de la création d'un ruleset (14:34) ; page des
     événements (14:36) ; pages du jeton (14:34, 14:36).
4. **Environnements et GO humain.**
   - « A job that references an environment must follow any protection rules for the environment before
     running or accessing the environment's secrets. » Relecteurs requis : jusqu'à 6 personnes ou
     équipes, un seul suffit, option « Prevent self-review ». La page les exclut des dépôts privés de
     Free, Pro et Team (point 1) : sur Team, un relecteur requis n'est PAS disponible.
   - Disponibles sur Team en dépôt privé : l'environnement, ses secrets et les branches de déploiement
     (option « Selected branches and tags », motif par type de référence). Montage proposé par ce
     corpus, déduit des pages et non décrit comme tel par GitHub : un environnement de production limité
     aux tags `v*`, plus un tag `v*` que seul le détenteur du GO peut créer (point 3), tiennent lieu de
     GO humain à la place du relecteur requis.
   - **Création silencieuse.** « Running a workflow that references an environment that does not exist
     will create an environment with the referenced name » ; sauf cas des pages de build, il « will not
     have any protection rules or secrets configured ». Un nom fautif dans un workflow crée un environnement nu. « Anyone that can edit workflows
     in the repository can create environments via a workflow file, but only repository admins can
     configure the environment. »
   - Offre Free : les protections et les secrets d'environnement sont « ignored » si un dépôt public
     devient privé. Ne pas créer le dépôt public pour le rendre privé ensuite.
   - Sources : page de gestion des environnements (14:34) ; page des offres (14:36).
5. **Secrets d'Actions.**
   - Trois niveaux : dépôt, environnement, organisation. « Any user with write access to your repository
     has read access to all secrets configured in your repository. » Le rôle write donne donc accès à
     tous les secrets du dépôt. Un secret d'environnement ne se libère qu'au job qui passe les protections
     de son environnement.
   - Bonnes pratiques de la page : moindre privilège du justificatif lui-même, ne pas stocker de donnée
     structurée (JSON, YAML) comme secret car « automatic redaction is not guaranteed », rotation
     périodique, suppression du journal et rotation d'un secret exposé dans un journal.
   - Quand le fournisseur cible accepte OpenID Connect, la page recommande de « stop storing these
     credentials as long-lived secrets » : question à poser à l'hébergeur avant de stocker un jeton
     d'API permanent.
   - Sources : pages de l'usage sûr et des secrets (14:34).
6. **Permissions des workflows et actions tierces.**
   - Jeton du workflow : réglage par défaut au niveau du dépôt ou de l'organisation. Dépôt d'un compte
     personnel : lecture seule de `contents` et `packages` ; dépôt d'organisation : réglage hérité de
     l'organisation, et un choix plus restrictif de l'organisation désactive l'option permissive du dépôt.
     La clé `permissions` d'un workflow ou d'un job réduit ou élève par job. Une action lit le jeton
     par `github.token` même si le workflow ne le lui passe pas.
   - « Allow GitHub Actions to create and approve pull requests » : désactivé par défaut pour un
     dépôt personnel, hérité de l'organisation sinon.
   - Demandes venues de forks : le workflow tourne « using a GITHUB_TOKEN with read-only permission, and
     with no access to secrets » ; les contributeurs de première fois attendent une approbation par
     défaut. `pull_request_target` et `workflow_run` sont privilégiés : ne jamais y extraire du code
     non fiable.
   - Actions tierces : épingler à un SHA complet, ou à un tag seulement si l'on fait confiance à
     l'auteur ; un tag « can be moved or deleted ». Contrôler le code de l'action. Les verrous de
     dépendances de workflows sont présentés comme la mesure la plus forte.
   - Surveiller `.github/workflows` par un fichier CODEOWNERS ; l'exigence d'approbation par les
     propriétaires est une option de la règle de protection (point 2) : sans règle, le fichier ne
     bloque rien.
   - Injection de script : passer par une variable d'environnement intermédiaire plutôt que par
     l'interpolation `${{ }}` dans un `run`.
   - Sources : pages du jeton (14:34, 14:36), de l'usage sûr (14:34), des réglages Actions du dépôt (14:36).
7. **Alertes Dependabot, mises à jour de sécurité, mises à jour de version.**
   - Alertes : « available for organization-owned and user-owned repositories », sans achat, sur tous les
     plans. Elles lisent la branche PAR DÉFAUT. Elles se déclenchent à l'ajout d'un avis ou à un
     changement du graphe de dépendances.
   - À l'activation, aucune notification ne part pour les dépendances déjà vulnérables : « you will
     receive notifications for new vulnerable dependencies identified after Dependabot is enabled ». La
     liste initiale se lit à l'écran de sécurité, une fois, au moment de la vérification. Les
     notifications vont aux personnes en écriture, maintainers ou administrateurs qui surveillent le dépôt.
   - Limites écrites : « Only advisories reviewed by GitHub trigger alerts » ; dépôts archivés non
     scannés ; « For GitHub Actions, alerts are only generated for actions that use semantic versioning,
     not SHA versioning ». Une action épinglée par SHA (point 6) ne lève donc aucune alerte : les mises à
     jour de version de Dependabot, écosystème `github-actions`, tiennent le rôle.
   - Mises à jour de sécurité : pull requests automatiques ouvertes pour chaque alerte qui a un correctif
     « when Dependabot security updates are enabled » ; le fichier `dependabot.yml` ne change pas les
     alertes. Elles marchent sur « all repositories ».
   - Activation par un administrateur du dépôt ou un propriétaire de l'organisation ; l'alerte ne
     bloque ni la poussée ni la fusion (registre du pilot, critère c3 de l'entrée).
   - Sources : pages des alertes, des mises à jour de sécurité, des fonctions de sécurité (14:34, 14:36).
8. **Secret scanning et protection à la poussée.**
   - Fonction de GitHub Secret Protection. « Requires GitHub Secret Protection to be enabled »,
     « Is disabled by default », activable par un administrateur du dépôt, un propriétaire de
     l'organisation ou un gestionnaire de sécurité. L'achat n'est ouvert qu'aux comptes Team et
     Enterprise Cloud. Pour une organisation Free, la page ne prévoit aucune voie d'achat : lecture à
     confirmer auprès de GitHub avant d'écrire « impossible » dans un plan.
   - La protection « for users » est activée par défaut mais ne couvre que les dépôts publics.
   - Contournement : par défaut, toute personne en écriture peut contourner un blocage en indiquant une
     raison ; GitHub crée une alerte (fermée pour « used in tests » et « false positive », ouverte pour
     « I'll fix it later »), journalise l'événement et écrit aux administrateurs. Le contournement délégué
     restreint qui peut contourner et qui est exempté.
   - Surfaces : ligne de commande, interface web, API REST (« Create a blob » et « Create or update file
     contents » rendent 409 devant un secret). Cinq secrets au plus sont affichés à la fois en ligne de
     commande ; un secret déjà alerté dans le dépôt n'est plus bloqué.
   - Un secret exposé doit être révoqué : le retirer de l'historique ne suffit pas.
   - Sources : pages de la protection à la poussée, de son activation, de la ligne de commande et de
     l'API REST (14:34, 14:39).
9. **Accès au dépôt et double vérification.**
   - Rôles d'un dépôt d'organisation, du moindre au plus large : Read, Triage, Write, Maintain, Admin.
     Read : « non-code contributors who want to view or discuss your project » ; Write : « contributors
     who actively push ». Via le point 5, Write lit tous les secrets du dépôt. Relancer un workflow exige
     aussi Write.
   - L'obligation de double vérification vise membres, collaborateurs extérieurs et gestionnaires de
     facturation ; un membre sans elle perd l'accès aux ressources de l'organisation mais « will retain
     membership », sièges comptés.
   - Pour un prestataire de recette, Read suffit à consulter et commenter ; un accès Write lui donnerait
     la lecture des secrets (point 5). Sans accès au dépôt, la recette peut porter sur la seule URL de
     préproduction.
   - Sources : pages des rôles et de l'obligation de double vérification (14:36).
10. **Rejouer et revenir en arrière.**
    - Rejeu d'un workflow : jusqu'à 30 jours après le premier run, 50 fois au plus ; il « use[s] the
      privileges of the actor who initially triggered the workflow » et les mêmes `GITHUB_SHA` et
      `GITHUB_REF`. Un workflow désactivé ne se rejoue pas.
    - Rétention : par défaut 90 jours pour les contrôles, les runs, les statuts, les artefacts et les
      journaux ; jusqu'à 400 jours en dépôt privé. La page annonce qu'à partir du 1er octobre 2026 la
      politique s'applique aussi aux contrôles, runs et statuts (date passée au jour de la lecture). Passé le délai, il n'existe plus de run à rejouer : un retour arrière
      par rejeu d'un ancien tag n'a de sens que dans cette fenêtre.
    - Annulation d'une fusion : « Revert » crée une NOUVELLE demande de fusion qui annule le commit de
      fusion ; elle exige l'écriture, doit elle-même être fusionnée, et se résout à la main en cas de
      conflit (revert des commits un à un).
    - Conclusion de ce corpus : une référence déplacée ou supprimée perd la trace de ce qui était déployé,
      et la parade est le ruleset des points 2 et 3, pas une convention.
    - Sources : pages du rejeu, des réglages Actions (rétention), du revert d'une demande (14:36).
11. **Gestes et lectures par l'API.**
    - Alertes : `PUT`, `GET` et `DELETE /repos/{owner}/{repo}/vulnerability-alerts` ; `PUT` « enables
      dependency alerts and the dependency graph » ; `GET` rend 204 si actif, 404 sinon ; l'administrateur
      du dépôt, ou un jeton à granularité fine avec la permission « Administration » en lecture.
    - Protection à la poussée : `PATCH /repos/{owner}/{repo}` avec
      `security_and_analysis.secret_scanning_push_protection.status` à `enabled` ou `disabled`.
    - Rulesets : création, lecture, mise à jour et suppression sous `/repos/{owner}/{repo}/rulesets` ;
      règles effectives d'une branche par le point 2.
    - Les commandes complètes et les valeurs attendues vivent au registre du pilot (point 12) : un plan
      renvoie au registre, il ne les recopie pas.
    - Sources : pages REST des dépôts et des règles (14:39).
12. **Réglages de sécurité de la plateforme** — registre du pilot lu le 09/11/2026 (fichier
    `references/REGLAGES-SURS-PAR-DEFAUT.json`, entrées lues dans le fichier du pilot ; sources des entrées
    relues par le registre le 06/11/2026, pages ci-dessus relues ici le 09/11/2026). Chaque réglage est
    classé **défaut** (appliqué à la création, relu à chaque livraison) ou **décision** (option posée au
    cadrage avec son coût, écart accepté consigné). La source est `references/REGLAGES-SURS-PAR-DEFAUT.json`
    du pilot, qui porte les commandes d'application et de lecture et les attendus : un plan renvoie au
    registre, il ne les redit pas.
    - Alertes Dependabot sur les dépendances vulnérables (vulnerability-alerts) — **défaut** : sans achat sur
      tous les plans (point 7), l'alerte ne bloque aucun flux ; à poser à la création du dépôt, relue à chaque
      livraison.
    - Protection des secrets à la poussée d'un dépôt privé (secret_scanning_push_protection) — **décision** :
      elle exige GitHub Secret Protection, donc une offre Team et un achat (point 8) ; dépense posée au cadrage
      avec son coût, choix du porteur consigné. Sur une organisation Free, la décision est l'écart accepté ou
      le changement d'offre.
    - Protection de la branche principale par ruleset (demande de fusion exigée, suppression et poussée forcée refusées) — **décision** :
      indisponible en dépôt privé d'une organisation Free (point 1), et une demande de fusion exigée refuse la
      promotion par poussée directe du produit témoin (`.github/workflows/qualif.yml:2`, registre du pilot) ;
      posée au cadrage avec la liste de contournement de la branche de promotion (point 3).
