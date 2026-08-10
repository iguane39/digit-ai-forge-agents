# Fiche expert — `marches-publics-ao`

Version 1.0.0 — 24/07/2026 — Statut registre : **ok** — admise le 24/07/2026 (verdict MATERIEL, oracle-judge en session S′ ; dossier A/B : `fixtures/fixture-marches-publics-ao.md`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : 5 consultations rencontrées (secteurs public et privé) sans expertise achat public outillée
2. Corpus disponible : checklist propre constituée (cadre de réponse, recevabilité, BPU, pondération, cascade, DCE)
3. Non-recouvrement : digit-ai-propale couvre le contenu commercial, pas la mécanique d'achat public

## 1. domaine
`marches-publics-ao` — mécanique des consultations publiques : primauté du cadre de réponse, exigences de recevabilité, BPU et unités d'œuvre, pondération et stratégie de notation, accords-cadres multi-attributaires et remise en concurrence, complétude des pièces du DCE, questions à l'acheteur.

## 2. declencheurs
- `content_patterns` : `appel d'offres|marché public|CCTP|règlement de consultation|DCE|BPU|mémoire technique|consultation publique|acheteur public|accord-cadre|attributaire|DUME`
- Types de demandes : relecture ou cadrage d'une réponse à consultation publique, stratégie de réponse à un accord-cadre, analyse de recevabilité
- Ne pas router : rédaction/chiffrage du contenu commercial (→ digit-ai-propale) ; audit qualité d'une propale finie (→ digit-ai-propale-review) ; traçabilité mécanique exigences→réponse (→ oracle exigences-ao, quality-oracles).

## 3. corpus
Chemins résolus (test d'existence exécuté le 23/07/2026 par scaffold-expert) :
- `.claude/skills/experts-forge/references/corpus-marches-publics-ao.md`
- La checklist propre EST le corpus ci-dessus (7 points, `corpus-marches-publics-ao.md`) — constituée pour ce domaine le 23/07/2026.

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-marches-publics-ao» ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Recevabilité — exigences éliminatoires du RC/CCTP tracées vers la réponse, pièces manquantes. (corpus §2, §6)
2. Cadre de réponse — écart entre la structure imposée et la structure proposée. (corpus §1)
3. Mécanique de prix — conformité BPU, unités d'œuvre, hypothèses bornées quand la volumétrie manque. (corpus §3, §7)
4. Stratégie de notation — alignement de l'effort rédactionnel sur la pondération. (corpus §4)
5. Vie de l'accord-cadre — positionnement pour la remise en concurrence et les marchés subséquents. (corpus §5)

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. Ne rédige pas le mémoire (→ digit-ai-propale), ne note pas la propale (→ digit-ai-propale-review), ne vérifie pas mécaniquement la traçabilité exigences→réponse (→ oracle exigences-ao). Signale les points de droit de la commande publique comme vigilances — jamais un conseil juridique.

## 6. fixture_valeur
- Demande témoin : relecture d'une réponse OPCO type avant dépôt (détail : `fixtures/fixture-marches-publics-ao.md`).
- Baseline : section A de `fixtures/fixture-marches-publics-ao.md` — baseline reconstituée figée le 23/07/2026 AVANT rédaction de la présente fiche (fil OPCO du 07/07 inaccessible depuis le repo, écart documenté du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`.
