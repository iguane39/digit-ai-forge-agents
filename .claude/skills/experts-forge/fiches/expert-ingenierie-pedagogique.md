# Fiche expert — `ingenierie-pedagogique`

Version 1.0.0 — 24/07/2026 — Statut registre : **ok** — admise le 24/07/2026 (verdict MATERIEL, oracle-judge en session S′ ; dossier A/B : `fixtures/fixture-ingenierie-pedagogique.md`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : la formation est une offre récurrente Digit-AI (formation IA en 2 variantes, notaires, un OPCO lot 4) sans skill métier dédié
2. Corpus disponible : checklist propre constituée (Cepeda 2006, Blume 2010, Qualiopi, charge cognitive) + frontière outillée avec oracle-programme-formation
3. Non-recouvrement : la structure quantitative est couverte par oracle-programme-formation, aucun skill ne porte le jugement qualitatif pédagogique

## 1. domaine
`ingenierie-pedagogique` — conception et évaluation qualitative des dispositifs de formation : espacement et consolidation des apprentissages, conditions de transfert en poste, conformité Qualiopi (objectifs évaluables, positionnement, traçabilité), charge cognitive et alternance des modalités, alignement objectifs ↔ activités ↔ évaluations.

## 2. declencheurs
- `content_patterns` : `programme de formation|ingénierie pédagogique|séquence pédagogique|plan de formation|module de formation|parcours de formation|Qualiopi|dispositif de formation`
- Types de demandes : conception ou relecture d'un programme/parcours de formation, choix de modalités, conformité Qualiopi d'un dispositif
- Ne pas router : vérification quantitative d'un programme (sommes de durées, part de pratique, segments, présence d'évaluation → oracle `programme-formation`) ; contenu technique des séquences (relève du skill métier du sujet enseigné) ; production du support de présentation (→ digit-ai-pptx / academic-pptx).

## 3. corpus
Chemins résolus (test d'existence exécuté le 23/07/2026 par scaffold-expert) :
- `.claude/skills/experts-forge/references/corpus-ingenierie-pedagogique.md` — checklist propre en 6 points sourcés (Cepeda 2006, Blume 2010, Qualiopi/RNQ, charge cognitive, équilibre par profil, alignement pédagogique).
- `.claude/skills/quality-oracles/scripts/oracle-programme-formation.mjs` — la frontière outillée : ce que l'oracle juge (C1-C5), la fiche ne le rejuge jamais.

## 4. rubrique (figée — 5 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-ingenierie-pedagogique » ; 1 à 3 annotations actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Espacement et consolidation — le dispositif prévoit-il rappels espacés et consolidation, ou tout est-il massé ? (corpus §1)
2. Transfert en poste — occasions d'application, dispositif post-formation, ancrage sur les cas réels du participant. (corpus §2)
3. Conformité Qualiopi — objectifs évaluables, positionnement d'entrée, traçabilité des acquis. (corpus §3)
4. Charge cognitive et séquencement — alternance des modalités, position de la pratique par rapport aux exposés. (corpus §4)
5. Alignement objectifs ↔ activités ↔ évaluations — l'évaluation mesure-t-elle l'objectif annoncé, la part de pratique est-elle justifiée par le public ? (corpus §5-§6)

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. Ne re-vérifie jamais la structure quantitative (sommes, seuils, segments, présence d'évaluation) : domaine de l'oracle `programme-formation` (C1-C5). Ne se prononce pas sur le contenu technique des séquences (skill métier du sujet) ni sur le rendu des supports (→ digit-ai-pptx). Ne délivre aucun conseil juridique de certification — signale les écarts au référentiel, sans verdict de certificateur.

## 6. fixture_valeur
- Demande témoin : relecture du programme 2 blocs `quality-oracles/fixtures/programme-formation-green.md` — « prêt à proposer à un client PME ? » (rejouable, détail : `fixtures/fixture-ingenierie-pedagogique.md`).
- Baseline : section A de `fixtures/fixture-ingenierie-pedagogique.md`, **baseline reconstituée figée le 23/07/2026 avant rédaction de la présente fiche** (fil d'origine inaccessible depuis le repo — écart documenté du brief §4).
- Contribution attendue : annotations sur les 5 axes de la rubrique, ancrées dans le corpus §1-§6.
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`, en session S′ ≠ S (décision 8 : aucune admission dans ce run).
