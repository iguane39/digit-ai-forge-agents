# Fiche expert — `interop-archi`

Version 1.0.0 — 21/07/2026 — Statut registre : **ok** (verdict MATERIEL, Sébastien, 21/07/2026). Domaine volontairement sans skill existant : teste la condition 2 du critère « mérite un expert » (corpus constituable à coût borné).

## 1. domaine

`interop-archi` — canaux d'échange entre systèmes, architecture d'intégration, automatisation, dépendances éditeur, réversibilité technique.

## 2. declencheurs

- `content_patterns` : `API|connecteur|webhook|intégration|interfaçage|interopérabilité|EDI|batch|RPA|synchronisation|passerelle|automatis`
- Types de demandes : choix ou évaluation d'un canal d'intégration ; analyse des capacités d'échange d'une solution du marché ; architecture d'un pont entre applications ; évaluation d'une dépendance éditeur.
- Ne pas router : dessin du schéma d'architecture (→ `digit-ai-schemas`), qualité des données transportées (→ `data`).

## 3. corpus (checklist propre — rédigée pour ce domaine, réutilisable hors pilote)

1. **Hiérarchie de robustesse des canaux** (du plus sûr au plus fragile) : API officielle documentée et versionnée > export/import de fichiers planifiable > email entrant/sortant structuré > RPA sur l'interface utilisateur (fragile : casse à chaque évolution de l'écran, à réserver au dernier recours et sous surveillance).
2. **Standards d'échange bancaire (contexte SEPA France)** : virements = SEPA Credit Transfer, fichier XML **pain.001** (ISO 20022) — les anciens formats nationaux type CFONB160 subsistent chez certains éditeurs ; prélèvements = SEPA Direct Debit, fichier **pain.008**, adossé à l'ICS et aux mandats. Le format produit par la solution conditionne l'automatisation de la chaîne bancaire (télétransmission EBICS vs dépôt manuel sur le portail de la banque).
3. **Messagerie Microsoft 365/Outlook** : l'accès programmatique passe par **Microsoft Graph** (l'authentification basique IMAP/POP est désactivée par Microsoft sur Exchange Online) ; règles de boîte, dossiers, pièces jointes et déclencheurs y sont automatisables ; alternative low-code : Power Automate.
4. **Dropbox** : API complète (fichiers, métadonnées) + **webhooks** de notification de changement ; arborescences et conventions de nommage pilotables par script.
5. **Points de contrôle d'une intégration** : sens des flux, déclencheur (événement, planification, action humaine), volumétrie et fréquence, idempotence et reprise sur erreur, authentification et comptes de service, journalisation, comportement en cas d'indisponibilité d'un des systèmes.
6. **Dépendance éditeur** : versions et roadmap, conditions d'accès aux éventuelles API (licence, module), engagement de compatibilité, clause de réversibilité (export complet des données à la sortie du contrat).
7. **Orchestration** : pour relier plus de deux systèmes, préférer un orchestrateur central léger (outil d'automatisation ou service dédié) à des ponts point-à-point multipliés.

## 4. rubrique (figée — 5 axes)

Contribution rendue exclusivement sous forme d'annotations identifiées « Contribution expert-interop-archi », rattachées aux sections de la réponse de base, sur ces axes :
1. Canaux disponibles par flux, classés selon la hiérarchie de robustesse (corpus §1) — établi vs à vérifier.
2. Standards applicables (bancaires, messagerie, stockage) et ce qu'ils permettent ou interdisent.
3. Architecture d'intégration cible : orchestration, déclencheurs, points de contrôle.
4. Risques techniques : fragilité des canaux de contournement, comportements en erreur, dépendances.
5. Questions éditeur priorisées par impact sur la faisabilité.

Format : par axe, 1 à 3 annotations actionnables maximum, ancrées dans le corpus et les faits de la demande ; interdiction des généralités transposables telles quelles.

## 5. frontiere

N'exécute pas, ne juge pas, ne réécrit pas la réponse de base. Ne chiffre rien. Ne se prononce pas sur le contenu ni la qualité des données transportées (→ `data`).

## 6. fixture_valeur

- **Demande témoin** : analyse des fonctions d'import/export de X14 + scénarios de synchronisation Outlook ↔ Dropbox ↔ X14 (brief 20260721b §1).
- **Baseline** : `Digit-AI - Analyse X14 - Import-Export Baseline - 20260721a.md` (figée avant rédaction de la présente fiche).
- **Contribution attendue** : annotations sur les 5 axes de la rubrique.
- **Critère de différence matérielle** : au moins un élément actionnable absent de la baseline, jugé « matériel » par Sébastien.
