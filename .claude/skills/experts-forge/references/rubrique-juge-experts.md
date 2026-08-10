# Rubrique juge — admission des experts (différence matérielle)

Version 1.0.0 — 21/07/2026. Créée après les 2 premiers verdicts de Sébastien (pilote X14 : `expert-data` matériel, `expert-interop-archi` matériel). **Provenance** : verdicts rendus sans raisons verbalisées — axes dérivés du critère indicatif figé (brief 20260721b §3) et des caractéristiques communes des 10 écarts validés (D1–D5, I1–I5) ; à affiner si Sébastien verbalise ses raisons. Utilisée par `oracle-judge` (quality-oracles, statut partiel à demeure C8) à partir du 3e expert.

## Verdict

`MATERIEL` ou `NON_MATERIEL` — par expert, sur la comparaison baseline vs contribution.

## Axes de jugement (répondre OUI/NON à chacun, avec citation de la contribution)

1. **Actionnable absent** : la contribution ajoute au moins un élément actionnable absent de la baseline — prérequis, risque nommé, question à poser, décision de cadrage à acter (ex. validé : convention de nommage pivot D2 ; supervision de rupture silencieuse I4).
2. **Ancrage double** : chaque annotation est ancrée à la fois dans le corpus de la fiche (référence citée) et dans les faits de la demande (page, constat) — jamais l'un sans l'autre.
3. **Spécificité** : la contribution nomme des objets précis — standards (pain.001 vs CFONB, I2), champs, pages, seuils, outils — là où la baseline restait au niveau « à vérifier » générique.
4. **Non-transposabilité** : au moins la moitié des annotations deviendraient fausses ou vides si on remplaçait la solution analysée par une autre — sinon, c'est du générique (fixture rouge).
5. **Conséquence sur la décision** : la contribution change ce que le destinataire ferait — ordre des questions éditeur (I5), scénario écarté ou conditionné, prérequis bloquant révélé.

## Règle de décision

`MATERIEL` = axes 1, 2 et 4 à OUI, et au moins un des axes 3 ou 5 à OUI. Tout autre profil = `NON_MATERIEL`. En cas de doute sur l'axe 4, trancher NON (le doute profite à la baseline).

## Fixtures du juge (critère 6 : un juge qui ne sait pas échouer n'est pas un juge)

- **Verte (réelle)** : contributions §7–8 de « Digit-AI - Analyse X14 - Import-Export Enrichie - 20260721a.md » vs baseline 20260721a — verdict attendu : MATERIEL ×2 (verdicts humains du 21/07/2026).
- **Rouge (synthétique, construite pour l'exercice — aucun expert réel ne l'a produite)** :
  > « Contribution expert-data — Il est important de veiller à la qualité des données lors des échanges entre systèmes. Une bonne gouvernance des données est recommandée. Pensez à la sécurité et à la conformité réglementaire. Les sauvegardes régulières sont une bonne pratique. Il conviendra de valider ces points avec les parties prenantes. »
  Verdict attendu : NON_MATERIEL (échoue aux axes 1, 2, 3, 4 et 5 — transposable à toute demande, aucun ancrage, rien d'actionnable).
