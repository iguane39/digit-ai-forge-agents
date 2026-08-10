# Fiche expert — `acquisition-fonds-immobilier`

Version 1.0.0 — 24/07/2026 — Statut registre : **ok** — admise le 24/07/2026 (verdict MATERIEL, oracle-judge en session S′ ; dossier A/B : `fixtures/fixture-acquisition-fonds-immobilier.md`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : chantier APDLB (ventilation apparemment inversée, ~58 k€ — source : analyse du 16/07/2026, mémoire APDLB —, carve-out Vieux-Viel, plan de financement en blanc)
2. Corpus disponible : checklist propre constituée ancrée BOFiP/service-public (promesses liées, suspensives, ventilation, non-concurrence, substitution, inventaire, financement)
3. Non-recouvrement : aucun skill ne couvre les vigilances d'acquisition — hebergement-touristique porte l'exploitation, jamais l'achat

## 1. domaine
`acquisition-fonds-immobilier` — vigilances d'acquisition d'un ensemble immobilier avec activité : promesses liées, conditions suspensives, ventilation du prix (incorporel/matériel, base amortissable), non-concurrence et carve-out, substitution de structure, inventaire et périmètre de cession, séquencement du financement. Questions et points de vigilance ancrés corpus public — jamais un conseil juridique.

## 2. declencheurs
- `content_patterns` : `promesse de vente|compromis|acquisition.{0,30}fonds|cession de fonds|condition suspensive|ventilation du prix|base amortissable|acte authentique|carve-out|substitution SCI`
- Types de demandes : relecture d'une promesse ou d'un compromis avant signature, vigilances d'une acquisition immo+fonds, questions à préparer pour le notaire
- Ne pas router : exploitation post-acquisition (→ hebergement-touristique), simulateurs chiffrés (→ oracle simulateur-js), rédaction d'actes ou conclusion en droit (→ notaire, hors périmètre absolu).

## 3. corpus
Chemins résolus (test d'existence exécuté le 23/07/2026 par scaffold-expert) :
- `.claude/skills/experts-forge/references/corpus-acquisition-fonds-immobilier.md`
- La checklist propre EST le corpus ci-dessus (7 points, `corpus-acquisition-fonds-immobilier.md`) — constituée pour ce domaine le 23/07/2026, ancrée BOFiP/service-public.

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-acquisition-fonds-immobilier» ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Architecture de l'opération — promesses liées, conditions croisées, calendrier. (corpus §1-§2)
2. Ventilation du prix — cohérence avec l'inventaire réel, conséquences amortissement/droits, à corriger avant signature. (corpus §3)
3. Clauses de protection — non-concurrence, carve-out listé, faculté de substitution. (corpus §4-§5)
4. Périmètre de cession — inventaire contradictoire, contrats repris, actifs numériques. (corpus §6)
5. Financement et séquencement — cohérence plan/conditions/dates, signaux d'alerte. (corpus §7)

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. **Frontière dure (inventaire P2 E7)** : annotations = questions et points de vigilance ancrés dans un corpus public (BOFiP, service-public) — ne se substitue jamais au notaire, ne conclut pas en droit. L'exploitation → `hebergement-touristique`.

## 6. fixture_valeur
- Demande témoin : relecture d'un projet de promesse murs + fonds de meublés avant signature (détail : `fixtures/fixture-acquisition-fonds-immobilier.md`).
- Baseline : section A de `fixtures/fixture-acquisition-fonds-immobilier.md` — baseline reconstituée figée le 23/07/2026 AVANT rédaction de la présente fiche (analyse APDLB du 16/07 inaccessible depuis le repo, écart documenté du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`.
