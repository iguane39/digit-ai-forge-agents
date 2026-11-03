# Fixture de valeur A/B — `securite-offensive`

## Demande témoin (rejouable)

Le pilot ouvre l'audit de sécurité offensive d'une application web « agenda-web », avant sa mise en production. C'est une application monopage adossée à une API REST sous /api/ (inscription aux événements, liste des événements, dépôt de pièces jointes), avec une authentification par compte et trois rôles : membre, bureau, administrateur. Elle est hébergée chez un fournisseur cloud tiers, derrière un service de messagerie transactionnelle d'un éditeur tiers. L'équipe produit veut un test d'intrusion de deux jours, mené par un prestataire externe sur la préproduction, et un rapport que la direction puisse lire. Donne le cadre et le plan de l'audit : autorisation et périmètre, méthode et couverture, qualification des vulnérabilités trouvées, suivi des corrections, restitution.

## Baseline (A) — figée le 03/11/2026 à 11:05, AVANT rédaction du corpus et de la fiche

Produite par une session neuve sans outil ni documentation : `claude -p --model sonnet --tools "" --strict-mcp-config` (CLI Claude Code 2.1.299 ; réponse servie par `claude-sonnet-5-5` ; session `36cb58bb-a5ad-4600-9805-6131fba45248`, de 11:05:36 à 11:06:00), lancée depuis un dossier vide, la demande ci-dessus suivie de « Réponds en 5 points numérotés, sans outil, de mémoire, en une vingtaine de lignes au plus. » Sortie reprise sans retouche.

1. **Autorisation et périmètre.** Un contrat et une lettre d'autorisation, signés par le responsable légal de l'application, fixent les dates, les adresses IP sources du prestataire et un contact d'urgence. Il faut vérifier les règles de test du fournisseur cloud et prévenir l'éditeur de messagerie. Le périmètre couvre la préproduction, la SPA, l'API `/api/` et le dépôt de pièces jointes. Sont exclus la production, le déni de service, l'ingénierie sociale et l'infrastructure des tiers : seule l'intégration côté agenda-web est testée. Trois comptes fictifs (membre, bureau, administrateur) et des données de test uniquement.

2. **Méthode et couverture.** Test en boîte grise, selon l'OWASP WSTG, l'ASVS et l'API Security Top 10. Priorité au contrôle d'accès, avec une matrice rôle × endpoint qui prouve la couverture : accès à l'objet d'un autre (IDOR), élévation membre → bureau → administrateur, fonctions réservées. Viennent ensuite l'authentification et les sessions (jetons, réinitialisation, énumération de comptes), l'upload (type réel, taille, stockage, exécution, traversée de chemin), les injections et XSS, CORS et CSP, la limitation de débit, les courses critiques à l'inscription, les secrets dans le bundle JS, les configurations cloud exposées, l'injection d'en-têtes et l'abus d'envoi côté messagerie. Deux jours ne suffisent pas pour tout : le rapport liste ce qui n'a pas été testé.

3. **Qualification.** Chaque constat porte une preuve rejouable, le composant, l'impact métier, un CWE et un score CVSS ajusté au contexte (critique, haute, moyenne, basse, info). Le prestataire sépare le constaté du supposé et écarte les faux positifs. Une faille critique est signalée dans les 24 heures, hors rapport, sans attendre la fin de la mission.

4. **Suivi des corrections.** Un registre unique attribue à chaque constat un propriétaire et une échéance (par exemple 7 jours pour critique, 30 pour haute). Les corrections sont déployées en préproduction, puis le prestataire les recontrôle : le contre-test est inclus au contrat. La mise en production exige zéro constat critique ou haut ouvert. Tout risque résiduel est accepté par écrit par la direction.

5. **Restitution.** Un rapport en deux niveaux. La synthèse de deux pages pour la direction donne un verdict (go, go sous conditions, no-go), les cinq risques principaux en langage métier et les décisions attendues. Le volume technique détaille les constats et les reproductions. Une réunion de restitution suit la livraison chiffrée du rapport. À la clôture, le prestataire détruit les données de test et remet une attestation après contre-test.

## Contribution (B) — par la rubrique de la fiche, produite le 03/11/2026 (jugement différé, session S′)

Contribution expert-securite-offensive :

1. **[Axe 1 · cadre d'autorisation]** La baseline prévoit « une lettre d'autorisation signée par le responsable légal
   de l'application » et un périmètre en prose. Il manque ce que le corpus exige avant la première requête (§1, §2) :
   la liste nominative des actifs (les URL de préproduction, `/api/`, le point de dépôt des pièces jointes), chacun
   couvert par la signature d'une personne qui a le pouvoir sur lui. Le « fournisseur cloud tiers » et l'« éditeur » de
   la messagerie transactionnelle ont leurs propres règles de test : le droit d'agenda-web ne s'étend pas à leur
   infrastructure, et la plupart interdisent le déni de service. Lire leur politique avant la mission est un préalable à
   acter, pas un point « à vérifier ». Les règles d'engagement ne se réduisent pas à « un contact d'urgence » (§3) : y
   écrire la fenêtre, les adresses sources du prestataire, un seuil d'arrêt (des données réelles de membres
   apparaissent en préproduction : arrêt et appel) et le signalement immédiat, hors rapport, d'une faille critique
   (demande : « hébergée chez un fournisseur cloud tiers », « messagerie transactionnelle d'un éditeur tiers »,
   « sur la préproduction »).
2. **[Axe 2 · méthode et couverture]** La baseline cite WSTG, ASVS et l'API Security Top 10 en une liste. Leurs rôles
   diffèrent (§4) : l'ASVS dit ce qu'on exige, le WSTG dit comment on le teste. Fixer AVANT les deux jours le niveau
   ASVS visé (L1 au minimum pour une application à comptes, L2 si les pièces jointes des membres contiennent des données
   sensibles : question à poser au porteur) et exprimer la couverture en exigences vérifiées, pas en jours. Les cas se
   déduisent des fonctions exposées (§11). Comptes et rôles : la baseline prévoit « trois comptes fictifs », il en faut
   DEUX par rôle, sinon ATHZ-04 (un membre qui lit ou modifie l'inscription d'un autre en substituant l'identifiant) ne
   se teste pas entre deux comptes du même rôle ; ATHZ-02 et ATHZ-03 couvrent la montée membre vers bureau vers
   administrateur. Dépôt de pièces jointes : BUSL-08 (type hors liste, type annoncé contredisant le contenu), BUSL-09 (un
   fichier admis qui s'exécute quand il est servi), ATHZ-01 sur le nom du fichier. Inscription en plusieurs étapes :
   BUSL-06. Application monopage : CLNT-01 et CLNT-07. L'API REST est un trou : la famille APIT de la WSTG 4.2 ne porte
   que le test GraphQL, donc « WSTG » ne couvre pas `/api/` ; le cadrage nomme la méthode retenue pour elle (ASVS V4, API
   Security Top 10) et inscrit au non-testé (§5) ce que deux jours ne couvrent pas (demande : « trois rôles : membre,
   bureau, administrateur », « dépôt de pièces jointes », « une API REST sous /api/ », « un test d'intrusion de deux jours »).
3. **[Axe 3 · qualification]** La baseline promet « un score CVSS ajusté au contexte » sans dire lequel. Exiger la
   version et le vecteur complet, et, en v4.0, la nomenclature qui dit ce que le score contient (CVSS-B, BT, BE ou BTE)
   (§6). La baseline ne sépare pas deux familles : l'EPSS ne s'applique qu'à une CVE, donc aux composants tiers
   d'agenda-web (bibliothèques du bundle, client de messagerie) ; un contrôle d'accès cassé sur `/api/` n'a ni CVE ni
   EPSS et se qualifie par un CVSS contextualisé et par l'exploitabilité constatée au test. Pour les CVE de composants,
   croiser l'EPSS avec le catalogue KEV de la CISA avant de fixer l'ordre de correction (§7) (demande :
   « une authentification par compte et trois rôles », « messagerie transactionnelle »).
4. **[Axe 4 · cycle d'un finding]** La baseline prévoit un registre avec propriétaire, échéances de 7 et 30 jours et
   un contre-test. Trois précisions (§8, §9). `corrigé_déclaré` n'est pas `fermé` : seul le retest ferme, et son budget
   se prévoit au contrat du prestataire. Sa règle « zéro constat critique ou haut ouvert » doit dire que
   `corrigé_déclaré` compte comme ouvert, sinon la mise en production se décide sur la parole des développeurs.
   `risque_accepté` est un état à part, signé par le propriétaire du risque avec une échéance de réexamen, non une
   fermeture (demande : « avant sa mise en production », « suivi des corrections »).
5. **[Axe 5 · restitution et données]** La baseline prévoit la destruction des données de test à la clôture. Le rapport
   lui-même est une carte d'attaque : chiffré, diffusion nominative et restreinte, y compris vers la direction (§10). Les
   preuves reproductibles masquent les données de membres qui apparaîtraient dans les pièces jointes. Le rapport dit
   le périmètre testé et le non-testé (§5), faute de quoi la direction lira « aucun constat » comme « sécurisé ». Une
   faille trouvée chez le fournisseur ou l'éditeur tiers se signale à lui et ne se publie pas (demande : « un rapport
   que la direction puisse lire », « dépôt de pièces jointes »).
