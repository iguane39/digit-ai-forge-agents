# Fiche expert — `photovoltaique-residentiel`

Version 1.0.0 — 24/07/2026 — Statut registre : **ok** — admise le 24/07/2026 (verdict MATERIEL, oracle-judge en session S′ ; dossier A/B : `fixtures/fixture-photovoltaique-residentiel.md`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : chantier solaire Vessey (3 devis comparés, 8 scénarios VAN/TRI) + lien APDLB (57 500 kWh/an relevés, bien sans PV — source mémoire APDLB)
2. Corpus disponible : checklist propre constituée (dimensionnement vs profil, autoconsommation vs surplus, mécanismes de soutien, lecture de devis, batterie, scénarios)
3. Non-recouvrement : remplace le candidat oracle comparatif-devis écarté (R9) — aucun skill ne couvre le domaine, les simulateurs chiffrés restant à l'oracle simulateur-js

## 1. domaine
`photovoltaique-residentiel` — installations photovoltaïques résidentielles : dimensionnement kWc vs profil de consommation réel, autoconsommation vs vente de surplus, mécanismes de soutien en vigueur, lecture critique des devis (€/Wc, onduleurs, garanties), batterie, scénarios VAN/TRI. Vigilances et questions — jamais de conseil d'investissement individualisé.

## 2. declencheurs
- `content_patterns` : `photovoltaïque|panneaux solaires|kWc|autoconsommation|onduleur|micro-onduleur|obligation d'achat|prime à l'autoconsommation|devis solaire`
- Types de demandes : comparaison de devis photovoltaïques, dimensionnement d'une installation résidentielle, lecture critique d'une offre
- Ne pas router : simulateurs chiffrés (→ oracle simulateur-js), lien avec un bien locatif exploité (→ hebergement-touristique).

## 3. corpus
Chemins résolus (test d'existence exécuté le 23/07/2026 par scaffold-expert) :
- `.claude/skills/experts-forge/references/corpus-photovoltaique-residentiel.md`
- La checklist propre EST le corpus ci-dessus (6 points, `corpus-photovoltaique-residentiel.md`) — constituée pour ce domaine le 23/07/2026 ; barèmes à revérifier à chaque usage (évolution trimestrielle).

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-photovoltaique-residentiel» ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Dimensionnement — puissance justifiée par les relevés réels, pas par la surface de toit. (corpus §1)
2. Hypothèses de valorisation — taux d'autoconsommation challengé, surplus au barème en vigueur. (corpus §2-§3)
3. Lecture des devis — €/Wc, onduleurs, garanties séparées, périmètre de pose. (corpus §4)
4. Batterie — rentabilité propre chiffrée à part, jamais dans un forfait opaque. (corpus §5)
5. Scénarios — comparaison multi-scénarios VAN/TRI, outillée par simulateur-js. (corpus §6)

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. Les simulateurs → oracle `simulateur-js` ; l'exploitation locative → `hebergement-touristique` ; jamais de conseil d'investissement individualisé — vigilances et questions aux installateurs.

## 6. fixture_valeur
- Demande témoin : comparaison de trois devis PV pour une maison à forte consommation (détail : `fixtures/fixture-photovoltaique-residentiel.md`).
- Baseline : section A de `fixtures/fixture-photovoltaique-residentiel.md` — baseline reconstituée figée le 23/07/2026 AVANT rédaction de la présente fiche (comparatif Vessey de juillet inaccessible depuis le repo, écart documenté du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`.
