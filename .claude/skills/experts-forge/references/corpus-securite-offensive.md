---
sources:
  - https://owasp.org/www-project-web-security-testing-guide/v42/ (OWASP WSTG 4.2, décembre 2020 ; version et identifiants de familles relus le 2026-11-03 dans digit-ai-forge-websec referentiels/wstg-cas.md, que cette forge a relu le 2026-11-03 contre le dépôt OWASP/wstg au tag v4.2 ; la page officielle n'a pas été rouverte pour cette fiche)
  - https://github.com/OWASP/ASVS/tree/master/5.0 (OWASP ASVS 5.0.0, mai 2025 ; niveaux L1, L2, L3 relus le 2026-11-03 dans digit-ai-forge-websec referentiels/asvs-l1.md ; le texte officiel n'a pas été rouvert pour cette fiche)
  - https://csrc.nist.gov/pubs/sp/800/115/final (NIST SP 800-115, septembre 2008 ; de mémoire, non rouvert le 2026-11-03 ; statut de révision à vérifier sur la page du NIST)
  - https://www.first.org/cvss/ (FIRST, CVSS v4.0 de novembre 2023 et v3.1 ; de mémoire, non rouvert le 2026-11-03)
  - https://www.first.org/epss/ (FIRST, EPSS, version 4 de mars 2025 ; de mémoire, non rouvert le 2026-11-03)
  - https://www.cisa.gov/known-exploited-vulnerabilities-catalog (CISA, catalogue KEV ; de mémoire, non rouvert le 2026-11-03)
  - http://www.pentest-standard.org/ (PTES ; de mémoire, non rouvert le 2026-11-03 ; entretien du standard non établi)
  - Code pénal, articles 323-1 à 323-3 (atteintes aux systèmes de traitement automatisé de données ; de mémoire, à faire confirmer par un juriste avant tout usage contractuel)
---

# Corpus — `securite-offensive`

Constitué le 03/11/2026 (TF-2065), après la baseline de la fixture (`fixtures/fixture-securite-offensive.md`, section A).
Le point 11 (des fonctions de l'application aux cas de test) a été ajouté le même jour, après un premier verdict
NON_MATERIEL de l'admission sur l'axe 4 (annotations transposables à toute application web) : l'essai 1 est conservé dans
`run-admission/verdict-securite-offensive-essai1.json`. Aucune page officielle n'a été rouverte pour cette rédaction : les faits des sources marquées « de mémoire » sont à
confirmer avant d'entrer dans un contrat ou un rapport signé. Les deux référentiels OWASP s'appuient sur la relecture
faite par digit-ai-forge-websec le 03/11/2026. Les points marqués « convention de la fiche » ne sont pas des standards.

## 1. L'autorisation précède toute action
Aucun test n'est lancé sans une autorisation écrite, signée par une personne qui a le pouvoir sur CHAQUE actif testé :
le propriétaire légal, pas le seul chef de projet. L'hébergeur cloud et l'éditeur d'un service tiers ont leurs propres règles
de test, et le droit du client ne s'étend pas à leur infrastructure : lire la politique de chaque fournisseur avant la
mission (certains exigent un préavis, la plupart interdisent le déni de service). Ce qui sépare un test d'un délit
d'accès frauduleux (Code pénal, art. 323-1 à 323-3, à faire confirmer par un juriste) est cette autorisation écrite.

## 2. Le périmètre est écrit, nominatif et borné
Liste nominative des actifs (URL, domaines, plages d'adresses, API, version, environnement), inclusions ET exclusions
(production, tiers, déni de service, ingénierie sociale, accès physique), type de test (boîte noire, grise ou blanche),
période, et comptes de test fournis par rôle : au moins DEUX comptes par rôle, sans quoi l'accès à l'objet d'un autre
utilisateur ne se teste pas. L'environnement testé ressemble à la production et ne contient que des données de test. Un
actif découvert hors de la liste est signalé, jamais testé.

## 3. Les règles d'engagement (rules of engagement) bornent la conduite
Fenêtre horaire ; adresses sources du testeur ; techniques interdites (déni de service, force brute sur des comptes réels,
exfiltration de données réelles, persistance, rebond vers un actif hors périmètre) ; seuils d'arrêt (des données
personnelles réelles apparaissent : arrêt et appel) ; contact d'urgence joignable des deux côtés pendant la fenêtre ;
canal chiffré pour les échanges ; signalement immédiat, hors rapport, d'une faille critique ; sauvegarde et restauration
de l'environnement avant le test ; qui peut interrompre la mission, et à quel signal.

## 4. Cinq cadres, cinq rôles : ils ne s'additionnent pas, ils se répartissent
- **PTES** (Penetration Testing Execution Standard) : le déroulé d'une mission en sept parties, interactions préalables,
  collecte de renseignements, modélisation des menaces, analyse des vulnérabilités, exploitation, post-exploitation,
  rapport. Standard de communauté, son entretien n'est pas établi.
- **NIST SP 800-115** (2008) : le cadre de gouvernance d'une évaluation technique, planification, découverte, attaque (avec
  boucle de retour vers la découverte), rapport ; techniques d'examen, d'identification et d'analyse des cibles, de
  validation des vulnérabilités. Se cite dans un cadre public ou réglementé.
- **OWASP WSTG** : le catalogue des cas de test d'une application web, en douze familles d'identifiants (INFO, CONF, IDNT,
  ATHN, ATHZ, SESS, INPV, ERRH, CRYP, BUSL, CLNT, APIT). Il dit COMMENT tester. Version 4.2 de décembre 2020 au 14/08/2026
  (une 5.0 était en chantier, non publiée).
- **OWASP ASVS** : les exigences de sécurité vérifiables, version 5.0.0 de mai 2025, en trois niveaux (L1 socle de toute
  application, L2 données sensibles, L3 application critique). Il dit CE QU'ON EXIGE. Le niveau visé se choisit AVANT de
  tester ; la couverture s'exprime en exigences vérifiées ou non, jamais en jours passés.
- La correspondance WSTG vers ASVS n'est pas publiée par l'OWASP : toute table de rattachement est un jugement de curation
  (digit-ai-forge-websec en tient une pour L1).

## 5. La couverture se prouve et le non-testé se dit
Une matrice rôle × fonction (ou rôle × endpoint) montre ce qui a été essayé avec chaque compte. Le contrôle d'accès (ATHZ)
et la logique métier (BUSL) échappent aux outils automatiques : ils se testent à la main. Un scanner (DAST, analyse des
composants) alimente le test, ne le remplace pas, et ses constats sont des hypothèses jusqu'à reproduction. Deux jours ne
couvrent pas tout : le rapport liste ce qui n'a pas été testé. « Aucun constat » signifie « rien trouvé dans ce périmètre
et ce temps », jamais « sécurisé ».

## 6. CVSS : une gravité intrinsèque, avec sa version et son vecteur
La v4.0 (novembre 2023) et la v3.1 coexistent : toujours écrire la version et le vecteur complet, jamais le seul nombre.
En v4.0, la nomenclature dit ce qui entre dans le score : CVSS-B (base seule), CVSS-BT (avec la menace), CVSS-BE (avec
l'environnement), CVSS-BTE (les deux). Bandes de sévérité communes aux deux versions : 0.1 à 3.9 faible, 4.0 à 6.9 moyen,
7.0 à 8.9 élevé, 9.0 à 10.0 critique. Le score de base est une gravité, pas un risque : l'exposition de l'actif, la nature des
données et les contrôles compensatoires le déplacent, et l'ajustement se justifie par écrit.

## 7. EPSS et KEV : une probabilité d'exploitation, valable seulement pour une CVE
L'EPSS (FIRST) donne la probabilité, entre 0 et 1, qu'une CVE soit exploitée dans les trente jours, avec son percentile. Il ne
s'applique qu'à une vulnérabilité publiée sous un identifiant CVE, donc à un composant tiers : un défaut propre à
l'application (contrôle d'accès cassé, faille de logique) n'a ni CVE ni EPSS, et se qualifie par CVSS contextualisé et par
l'exploitabilité constatée au test. Le catalogue KEV de la CISA liste les CVE dont l'exploitation est avérée. Priorité =
sévérité (CVSS) + probabilité (EPSS) + exploitation avérée (KEV) + criticité de l'actif : une CVE à EPSS faible reste urgente si
elle figure au KEV ou touche un actif critique.

## 8. Un finding est complet ou n'est pas un finding
Identifiant stable ; titre ; actif et localisation exacte ; description ; preuve reproductible (étapes, requête et réponse avec
secrets masqués) ; impact métier ; sévérité (version et vecteur CVSS, justification) ; références (identifiant WSTG,
exigence ASVS, CWE) ; remédiation précise ; propriétaire ; état ; dates. Le constaté se sépare du supposé.

## 9. Cycle et états d'un finding (convention de la fiche, pas un standard)
`détecté` → `confirmé` (reproduit par un second regard, sinon `faux_positif`) → `communiqué` → `en_correction` (propriétaire et
échéance selon la sévérité, fixées aux règles d'engagement) → `corrigé_déclaré` → `retesté` → `fermé`. Sorties latérales :
`faux_positif`, `doublon`, `risque_accepté` (décision écrite du propriétaire du risque, motif, date, échéance de réexamen),
`rouvert` (le retest échoue). Un finding ne se ferme jamais sur la déclaration de celui qui l'a corrigé, seulement sur retest,
et ce retest se prévoit au contrat. Un `risque_accepté` n'est pas un `fermé`.

## 10. Restitution : deux lecteurs, et des données à protéger
Un rapport à deux niveaux : une synthèse pour la décision (verdict, principaux risques en langage métier, décisions
attendues) et un volume technique reproductible, tous deux disant le périmètre testé et le non-testé. Un rapport de test
d'intrusion est une carte d'attaque : chiffré, diffusion restreinte. Les données personnelles rencontrées sont minimisées
et masquées dans le rapport, non conservées au-delà de la mission ; les données de test sont détruites, avec attestation.
Une faille découverte chez un tiers se signale à ce tiers, ne se publie pas.

## 11. Des fonctions de l'application aux cas de test (identifiants WSTG 4.2, tels que relus par digit-ai-forge-websec le 03/11/2026)
Le cadrage part des fonctions que l'application expose, pas d'une liste générique de familles :
- **Comptes et rôles** : ATHZ-02 (une fonction réservée reste-t-elle accessible sans session ou depuis un autre rôle), ATHZ-03
  (élévation de privilège, verticale ou horizontale), ATHZ-04 (référence d'objet directe, IDOR : deux comptes qui possèdent
  chacun des objets, l'un substitue l'identifiant de l'autre).
- **Téléversement de fichiers** : BUSL-08 (fichier hors liste, selon l'extension, le type annoncé et le contenu), BUSL-09
  (fichier dangereux d'un type admis, rangé et servi de façon à s'exécuter), ATHZ-01 (nom ou chemin de fichier piloté par
  l'utilisateur), INPV-19 (SSRF, si le serveur va chercher une ressource désignée par une valeur fournie). Marqueur neutre,
  jamais une charge réelle.
- **Parcours en plusieurs étapes (inscription, validation)** : BUSL-06 (atteindre l'étape finale en sautant ou rejouant des
  étapes), BUSL-01 à BUSL-03 (le serveur recontrôle ce que l'écran présente comme non modifiable).
- **Application monopage** : CLNT-01 (XSS dans le DOM), CLNT-07 (CORS sur des données authentifiées), CLNT-04 (redirection
  pilotée par un paramètre) ; SESS-02 (attributs des cookies) et SESS-05 (requête d'état forgée depuis un autre site).
- **Authentification** : ATHN-03 (freinage de l'essai en masse), ATHN-09 (ancien mot de passe exigé, jeton de
  réinitialisation à usage unique et expirant).
- **API REST : un trou de la WSTG 4.2.** La famille APIT n'y porte qu'un cas, le test GraphQL. Pour une API REST, la méthode
  vient d'ailleurs (ASVS V4 « API and Web Service », non curé par digit-ai-forge-websec ; OWASP API Security Top 10, de mémoire) et
  le cadrage doit dire laquelle, faute de quoi « WSTG » couvre en apparence ce qu'il ne couvre pas.
- Les familles non curées par digit-ai-forge-websec (par exemple ATHN-04, SESS-01, BUSL-05) existent dans la WSTG : l'absence
  d'un cas de ce corpus n'est pas son inexistence.

## 12. Pièges fréquents
Confondre un audit de configuration (l'examen de la SP 800-115) et un test d'intrusion ; tester en production sans sauvegarde ;
oublier l'API (famille APIT) ou un environnement frère dans le périmètre ; livrer les scores bruts d'un scanner comme des
findings ; fermer sur déclaration ; compter la couverture en jours ; appliquer un EPSS à un défaut sans CVE.
