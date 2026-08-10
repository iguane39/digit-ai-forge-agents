# Fiche expert — `conformite-rgpd-ia`

Version 1.0.0 — 24/07/2026 — Statut registre : **ok** — admise le 24/07/2026 (verdict MATERIEL, oracle-judge en session S′ ; dossier A/B : `fixtures/fixture-conformite-rgpd-ia.md`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : 4 chantiers (plateforme mail 7 boîtes, mission RGPD+AI Act+RSSI cadrée au CDC, chantier Mail-CRM mutualiste, champ conformité systématique des fiches prospection)
2. Corpus disponible : checklist propre constituée (CNIL, AI Act 2024/1689, chaîne sous-traitance LLM, PSSI)
3. Non-recouvrement : aucun skill ne porte la conformité des traitements — prospection ne fait que remplir un champ, page-html/a11y couvrent l'accessibilité pas le RGPD

## 1. domaine
`conformite-rgpd-ia` — conformité des traitements IA sur données personnelles : bases légales, DPA et chaîne de sous-traitance LLM, localisation/transferts, minimisation et conservation, qualification AI Act, droits des personnes, points RSSI/PSSI. Niveau : vigilances et questions à instruire — jamais un avis juridique.

## 2. declencheurs
- `content_patterns` : `RGPD|AI Act|données personnelles|DPA|CNIL|sous-traitant ultérieur|hébergement UE|souveraineté|conformité IA|PSSI|RSSI|base légale|DPIA`
- Types de demandes : cadrage conformité d'un traitement IA sur données personnelles, vigilances DPA/localisation/AI Act d'une architecture
- Ne pas router : architecture data/plateforme (→ data-platform-cloud, data) ; gouvernance de l'écosystème Microsoft (→ copilot-m365) ; accessibilité (→ accessibilite) ; contrôle WCAG outillé (→ oracle a11y).

## 3. corpus
Chemins résolus (test d'existence exécuté le 23/07/2026 par scaffold-expert) :
- `.claude/skills/experts-forge/references/corpus-conformite-rgpd-ia.md`
- La checklist propre EST le corpus ci-dessus (7 points, `corpus-conformite-rgpd-ia.md`) — constituée pour ce domaine le 23/07/2026.

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-conformite-rgpd-ia» ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Bases légales par finalité — traitements identifiés, base légale par finalité, mises en balance à documenter. (corpus §1)
2. Chaîne de sous-traitance LLM — DPA, non-réutilisation pour entraînement, sous-traitants ultérieurs. (corpus §2)
3. Localisation et transferts — région d'inférence, transferts hors UE, contraintes de souveraineté du donneur d'ordre. (corpus §3)
4. Minimisation, conservation, droits — ce qui part au modèle, durées par catégorie, information des personnes. (corpus §4, §6)
5. AI Act et cadre sécurité — qualification par risque, obligations applicables, points PSSI/RSSI structurants. (corpus §5, §7)

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. Ne dessine pas l'architecture (→ data-platform-cloud, digit-ai-schemas), ne se substitue ni à un DPO ni à un avocat — signale les vigilances et les questions à instruire, sans conclure en droit.

## 6. fixture_valeur
- Demande témoin : cadrage d'un assistant IA lisant 7 boîtes mail d'un cabinet (détail : `fixtures/fixture-conformite-rgpd-ia.md`).
- Baseline : section A de `fixtures/fixture-conformite-rgpd-ia.md` — baseline reconstituée figée le 23/07/2026 AVANT rédaction de la présente fiche (fil ASD inaccessible depuis le repo, écart documenté du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`.
