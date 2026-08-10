# Fiche expert — `copilot-m365`

Version 1.0.0 — 24/07/2026 — Statut registre : **ok** — admise le 24/07/2026 (verdict MATERIEL, oracle-judge en session S′ ; dossier A/B : `fixtures/fixture-copilot-m365.md`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : 3 chantiers (un pilote 330 E3 / ~50 Copilot sous cadre « aucun LLM externe », un agent Teams retail, une plateforme M365)
2. Corpus disponible : checklist propre constituée (licences, Copilot Studio, environnements/DLP, frontière PSSI, permissions sources)
3. Non-recouvrement : aucun skill ne couvre la plateforme d'agents Microsoft — interop-archi porte les canaux d'échange, jamais la gouvernance tenant

## 1. domaine
`copilot-m365` — écosystème d'agents Microsoft : licences (E3/E5 vs M365 Copilot, capacité Copilot Studio), Copilot Studio (topics, connecteurs, publication), gouvernance tenant (environnements Power Platform, DLP), frontière « aucun LLM externe », permissions des sources, limites vs intégrations LLM directes.

## 2. declencheurs
- `content_patterns` : `Copilot|Copilot Studio|agent Teams|Power Platform|Dataverse|tenant M365|Microsoft 365|licence E3|licence E5|agent SharePoint`
- Types de demandes : cadrage d'un pilote Copilot/agents M365, gouvernance tenant Power Platform, arbitrage licences
- Ne pas router : canaux d'échange inter-systèmes (→ interop-archi), conformité RGPD/AI Act (→ conformite-rgpd-ia), plateforme data (→ data-platform-cloud).

## 3. corpus
Chemins résolus (test d'existence exécuté le 23/07/2026 par scaffold-expert) :
- `.claude/skills/experts-forge/references/corpus-copilot-m365.md`
- La checklist propre EST le corpus ci-dessus (6 points, `corpus-copilot-m365.md`) — constituée pour ce domaine le 23/07/2026.

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-copilot-m365» ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Licences et couverture — qui a besoin de quoi, ce que font les non-licenciés. (corpus §1)
2. Anatomie de l'agent — sources, connecteurs, environnement, canal de publication, qui gouverne quoi. (corpus §2)
3. Gouvernance tenant — environnement dédié, DLP, précédent créé par le pilote. (corpus §3)
4. Frontière de conformité locale — traduction opérationnelle du cadre PSSI (« aucun LLM externe »). (corpus §4)
5. Permissions des sources et limites de plateforme — revue d'accès, besoins hors cadre Copilot. (corpus §5-§6)

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. La plateforme d'agents et sa gouvernance uniquement — jamais les canaux d'échange (→ interop-archi, frontière stricte de l'inventaire P2 E5) ni la conformité réglementaire (→ conformite-rgpd-ia).

## 6. fixture_valeur
- Demande témoin : cadrage d'un pilote agent Teams RH, 330 E3 / ~50 Copilot, cadre « aucun LLM externe » (détail : `fixtures/fixture-copilot-m365.md`).
- Baseline : section A de `fixtures/fixture-copilot-m365.md` — baseline reconstituée figée le 23/07/2026 AVANT rédaction de la présente fiche (fil client inaccessible depuis le repo, écart documenté du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`.
