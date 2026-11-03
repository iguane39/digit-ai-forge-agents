# Fiche expert — `securite-offensive`

Version 0.1.0 — 03/11/2026 — Statut registre : **refuse** — deux verdicts NON_MATERIEL le 03/11/2026, tous deux sur l'axe 4 (annotations transposables à une autre application web) ; fiche conservée pour trace, non routée. Dossier A/B : `fixtures/fixture-securite-offensive.md` ; verdicts : `run-admission/verdict-securite-offensive-essai1.json` et `-essai2.json`. Règle du write-an-expert : deux NON_MATERIEL sur un même domaine, ne pas insister, remonter.

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : décision humaine du 03/11/2026 (item TF-2065) sur un constat du 02/11/2026 : `route-experts.mjs` ne rendait, pour un sujet de pentest, que `interop-archi`, sur le mot « automatis », hors sujet ; aucune fiche de cadrage d'une mission de sécurité offensive côté experts-forge
2. Corpus disponible : checklist propre constituée le 03/11/2026 (`references/corpus-securite-offensive.md`, 12 points ; référentiels OWASP relus dans digit-ai-forge-websec le 03/11/2026, autres sources de mémoire et marquées comme telles)
3. Non-recouvrement : forge-websec outille les contrôles du livrable web (oracle-exposition, oracle-sca, oracle-dast) et forge-agents-security contrôle les agents et leurs appels d'outils, mais aucune des 19 fiches existantes ne porte le cadrage d'une mission de test d'intrusion (autorisation, méthode, qualification, suivi, restitution) : `git grep -il "pentest\|CVSS\|WSTG\|OWASP\|intrusion"` sur `fiches/`, `references/` et `fixtures/` ne rendait rien avant cette fiche (03/11/2026)

## 1. domaine
`securite-offensive` — cadrage et conduite d'une mission de sécurité offensive sur un système d'information ou une application
(test d'intrusion, audit de sécurité technique, revue d'un rapport de pentest) : cadre d'autorisation (périmètre écrit, règles
d'engagement), choix de la méthode et de la couverture (OWASP WSTG, ASVS, NIST SP 800-115, PTES), qualification des
vulnérabilités (CVSS, EPSS, KEV), cycle et états d'un finding, restitution et traitement des données rencontrées. Niveau :
vigilances et questions à instruire, jamais un avis juridique ni un résultat de test.

## 2. declencheurs
- `content_patterns` : `pentest|pen-test|tests? d['’]intrusion|sécurité offensive|red team|bug bounty|\bOWASP\b|\bWSTG\b|\bASVS\b|SP 800-115|\bCVSS\b|\bEPSS\b|\bPTES\b|règles d['’]engagement|rules of engagement|audit de sécurité|scan de vulnérabilités`
- Types de demandes : cadrage d'une mission de test d'intrusion, revue d'un plan ou d'un rapport de pentest, choix du niveau ASVS à viser, qualification et priorisation de vulnérabilités, définition du cycle de suivi des findings
- Ne pas router : sécurité du livrable web outillée (en-têtes, CSP, dépendances → forge-websec) ; sécurité d'un système d'agents (→ forge-agents-security) ; conformité RGPD d'un traitement (→ conformite-rgpd-ia) ; durcissement et exploitation d'une plateforme cloud (→ ops-aws, ops-azure, ops-gcp, ops-cloudflare, ops-supabase, ops-railway). Le motif route toute demande qui nomme ces référentiels : l'expert n'y contribue que sur le cadrage d'une mission offensive.
- Mots génériques non routés, preuve mécanique : « sécurité », « vulnérabilité », « attaque » et « audit » seuls ne routent pas cette fiche (`fixtures/routage/cas-routage.json`, cas R10).

## 3. corpus
Chemins résolus (test d'existence exécuté le 03/11/2026) :
- `.claude/skills/experts-forge/references/corpus-securite-offensive.md`
- La checklist propre EST le corpus ci-dessus — constituée le 03/11/2026, après la baseline de la fixture.

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-securite-offensive » ;
1 à 3 annotations actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Cadre d'autorisation — signataire ayant pouvoir sur chaque actif, accord ou politique des tiers (hébergeur, éditeur), périmètre nominatif avec exclusions, règles d'engagement (fenêtre, techniques interdites, seuils d'arrêt, contacts, signalement immédiat). (corpus §1-§3)
2. Méthode et couverture — rôle de chaque cadre (PTES, SP 800-115, WSTG, ASVS), niveau ASVS visé et choisi avant le test, cas WSTG déduits des fonctions exposées (comptes et rôles, téléversement, parcours en étapes, application monopage), trou de la WSTG 4.2 sur les API REST, comptes de test par rôle, matrice rôle × fonction, ce que les outils ne couvrent pas, non-testé déclaré. (corpus §4-§5, §11-§12)
3. Qualification des vulnérabilités — version et vecteur CVSS, nomenclature v4.0, gravité contre risque, EPSS et KEV seulement pour une CVE, défauts propres sans CVE. (corpus §6-§7)
4. Cycle d'un finding — contenu minimal, états, preuve reproductible, propriétaire et échéance, retest indépendant, risque accepté signé. (corpus §8-§9)
5. Restitution et données — rapport à deux niveaux, périmètre testé et non testé, données personnelles rencontrées, chiffrement et diffusion, destruction et attestation, divulgation chez un tiers. (corpus §10)

## 5. frontiere
N'exécute pas, ne juge pas, ne teste rien : aucun scan, aucune connexion à une cible, aucun outil lancé. Ne se substitue ni à
un juriste (articles du Code pénal cités de mémoire, à confirmer) ni au prestataire de test, et ne conclut pas sur la sécurité
d'un système. Le savoir de cadrage uniquement : les contrôles outillés du livrable web restent à forge-websec, la sécurité
agentique à forge-agents-security, la conformité des données à `conformite-rgpd-ia`, le durcissement d'une plateforme aux fiches ops-*.
Aucune valeur réelle de cible : placeholders (`<cible>`, `<compte-membre-1>`).

## 6. fixture_valeur
- Demande témoin : cadrage de l'audit de sécurité offensive de l'application « agenda-web » avant sa mise en production (détail : `fixtures/fixture-securite-offensive.md`).
- Baseline : section A de `fixtures/fixture-securite-offensive.md` — **figée le 03/11/2026 à 11:05 par une
  session neuve sans outil, AVANT rédaction du corpus et de la présente fiche**.
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge`
  armé de la rubrique d'admission (profil `run-admission/profil-admission.json`).
