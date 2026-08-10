# Fiche expert — `hebergement-touristique`

Version 1.0.0 — 24/07/2026 — Statut registre : **ok** — admise le 24/07/2026 (verdict MATERIEL, oracle-judge en session S′ ; dossier A/B : `fixtures/fixture-hebergement-touristique.md`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : chantier APDLB multi-sessions (arbitrage fiscal, Beds24, purge Vieux-Viel, politique de remises, transfert Airbnb/Booking incertain)
2. Corpus disponible : checklist propre constituée (régimes fiscaux, classement, channel managers, transfert des avis, obligations, tarification) ancrée BOFiP/service-public
3. Non-recouvrement : aucun skill métier ne couvre l'exploitation touristique — acquisition-fonds-immobilier (V3) portera l'acquisition, pas l'exploitation

## 1. domaine
`hebergement-touristique` — exploitation de meublés de tourisme : régimes d'exploitation (LMNP réel, para-hôtellerie, TVA), classement et taxe de séjour, distribution (channel managers, OTA, commissions, transfert des comptes et avis), obligations d'accueil et de déclaration, politique tarifaire. Vigilances et questions — jamais de conseil fiscal individualisé.

## 2. declencheurs
- `content_patterns` : `meublé de tourisme|gîte|chambre d'hôtes|channel manager|Airbnb|Booking|LMNP|para-hôtellerie|taxe de séjour|location saisonnière|OTA`
- Types de demandes : choix d'outillage de distribution, cadrage d'exploitation ou de reprise de meublés, arbitrages de régime
- Ne pas router : acquisition du bien ou du fonds (promesses, ventilation du prix → acquisition-fonds-immobilier, V3), simulateurs chiffrés (→ oracle simulateur-js), production du site de réservation (→ digit-ai-page-html).

## 3. corpus
Chemins résolus (test d'existence exécuté le 23/07/2026 par scaffold-expert) :
- `.claude/skills/experts-forge/references/corpus-hebergement-touristique.md`
- La checklist propre EST le corpus ci-dessus (6 points, `corpus-hebergement-touristique.md`) — constituée pour ce domaine le 23/07/2026.

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-hebergement-touristique» ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Régime d'exploitation — services rendus, conséquences LMNP/para-hôtellerie/TVA, questions à l'expert-comptable. (corpus §1)
2. Classement, taxes et obligations — étoiles, taxe de séjour par canal, déclarations en reprise. (corpus §2, §5)
3. Distribution — commissions réelles, profondeur de synchronisation, verrouillage de l'outil. (corpus §3)
4. Actifs commerciaux de la reprise — transfert des comptes OTA et des avis, périmètre de cession. (corpus §4)
5. Politique tarifaire — grille par saison, règles de remise bornées et outillées. (corpus §6)

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. Ne se substitue ni à l'expert-comptable ni au notaire (vigilances ancrées BOFiP/service-public, jamais de conclusion fiscale ou juridique). L'acquisition → `acquisition-fonds-immobilier` (V3).

## 6. fixture_valeur
- Demande témoin : choix d'un channel manager + cadrage d'une reprise de meublés (détail : `fixtures/fixture-hebergement-touristique.md`).
- Baseline : section A de `fixtures/fixture-hebergement-touristique.md` — baseline reconstituée figée le 23/07/2026 AVANT rédaction de la présente fiche (fil APDLB du 21/07 inaccessible depuis le repo, écart documenté du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`.
