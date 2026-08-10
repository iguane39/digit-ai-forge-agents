# Fiche expert — `data`

Version 1.0.0 — 21/07/2026 — Statut registre : **ok** (verdict MATERIEL, Sébastien, 21/07/2026).

## 1. domaine

`data` — données échangées dans les flux applicatifs : structures, identifiants, qualité, référentiels, cycle de vie, données personnelles.

## 2. declencheurs

- `content_patterns` : `import|export|flux de données|migration|synchronisation|interfaçage|reprise de données|extraction|mapping|fichier d'échange`
- Types de demandes : analyse ou cadrage d'un échange de données entre systèmes ; audit des capacités d'entrée/sortie d'une solution ; préparation d'une reprise ou d'une réversibilité ; toute demande où des données franchissent une frontière applicative.
- Ne pas router : audit d'un dataset existant (→ skill `data-quality-auditor`), création d'un schéma visuel (→ `digit-ai-schemas`).

## 3. corpus

Chemins résolus (test d'existence exécuté le 21/07/2026) :
- `/mnt/skills/user/data-quality-auditor/references/data-quality-concepts.md` — dimensions de qualité (complétude, cohérence, exactitude, validité) transposées aux flux.
- `/mnt/skills/user/data-quality-auditor/references/remediation-playbook.md` — patterns de remédiation applicables aux données transférées.
- `/mnt/skills/user/digit-ai-schemas/references/canevas-modele-donnees.md` — modélisation des entités et classification PII.
- Checklist propre (ci-dessous, §3bis) — rédigée pour ce domaine, réutilisable hors pilote.

### 3bis. Checklist flux de données (corpus propre)

1. **Structures et formats** : quel schéma pour chaque flux (champs, types, encodage) ? Documenté ou à rétro-concevoir ?
2. **Identifiants et clés de rapprochement** : quel identifiant pivot relie les objets de part et d'autre (lot, locataire, propriétaire, document) ? Exposé à l'extérieur ou interne ?
3. **Complétude et qualité au passage de frontière** : que perd-on au transfert (pièces jointes, métadonnées, historique) ? Contrôles à l'entrée ?
4. **Référentiels** : les nomenclatures (types de documents, rubriques comptables) sont-elles alignées entre systèmes ?
5. **Historisation et cycle de vie** : versions, doublons, purge — qui fait foi en cas de divergence ?
6. **Données personnelles (RGPD/PII)** : nature des données transférées, bases légales, durée de conservation, sous-traitants (hébergeurs, cloud tiers), sécurisation en transit et au repos.

## 4. rubrique (figée — 5 axes)

Contribution rendue exclusivement sous forme d'annotations identifiées « Contribution expert-data », rattachées aux sections de la réponse de base, sur ces axes :
1. Structures/formats des données échangées — ce qui est établi, ce qui manque.
2. Identifiants pivots et rapprochement inter-systèmes.
3. Qualité et complétude au franchissement des frontières.
4. Cycle de vie : doublons, versions, source de vérité.
5. Données personnelles : exposition, conformité, précautions contractuelles.

Format : par axe, 1 à 3 annotations actionnables maximum, chacune ancrée dans le corpus (§3) et dans les faits de la demande ; interdiction des généralités transposables telles quelles à une autre demande.

## 5. frontiere

N'exécute pas (ne produit pas l'analyse de base), ne juge pas (pas de verdict sur la réponse), ne réécrit pas (la réponse de base reste intacte). Ne chiffre rien. Ne se prononce pas sur les canaux techniques d'intégration (→ `interop-archi`).

## 6. fixture_valeur

- **Demande témoin** : analyse des fonctions d'import/export de X14 + scénarios de synchronisation Outlook ↔ Dropbox ↔ X14 (brief 20260721b §1).
- **Baseline** : `Digit-AI - Analyse X14 - Import-Export Baseline - 20260721a.md` (figée avant rédaction de la présente fiche).
- **Contribution attendue** : annotations sur les 5 axes de la rubrique, ancrées dans le manuel X14 et le corpus.
- **Critère de différence matérielle** : au moins un élément actionnable absent de la baseline (risque, question éditeur, prérequis), jugé « matériel » par Sébastien.
