# Fiche expert — `migration-plateforme-brownfield`

Version 1.0.0 — 02/09/2026 — Statut registre : **ok** (scaffoldée par `write-an-expert`, durcie
le 02/09/2026, **admise le 02/09/2026** — verdict MATERIEL, 5 axes OUI, par `oracle-judge` armé
de `run-admission/rubrique-armee.md` ; verdict JSON :
`run-admission/verdict-migration-plateforme-brownfield.json`).

**Provenance (TF-0717)** : un angle déclaré vide le 20/08/2026 — l'entrée candidate « fiche
expert MIGRATION DE PLATEFORME BROWNFIELD » n'avait jamais été écrite dans la file des
candidats de la forge — a produit **onze jours plus tard** exactement le défaut qu'il aurait
attrapé : un programme de migration qui ne prévoit **nulle part** de prévenir les utilisateurs,
trouvé par le client après qu'une contre-expertise complète et quatre portes automatiques
l'aient laissé passer.

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : programme de migration récurrent chez les produits de la forge (bascule v1 vers
   v2, reprise de l'existant) — angle déclaré vide le 20/08/2026 et payé le 31/08/2026.
2. Corpus disponible : corpus propre rédigé le 02/09/2026
   (`references/corpus-migration-plateforme-brownfield.md`), chemins résolus.
3. Non-recouvrement : aucun skill ni expert du pool ne regarde ce que la bascule **impose à
   l'utilisateur final** — `interop-archi` couvre le canal, `data` la qualité des données,
   `ops-*` l'exploitation de la cible.

## 1. domaine

`migration-plateforme-brownfield` — bascule d'une plateforme **déjà en service** vers une
plateforme cible : ce que la bascule impose aux gens qui l'utilisent, qui doit être prévenu et
quand, ce que coûte la cohabitation, jusqu'où l'on peut revenir en arrière, et ce que devient
l'historique. Domaine **brownfield** au sens strict : il y a des utilisateurs réels, des
données réelles et une exploitation en cours **avant** le premier déploiement de la cible.

## 2. declencheurs

- `content_patterns` :
  `migration (?:de |d.une |d.un )?(?:plateforme|solution|application|syst[èe]me|outil|v1)|migration v\d|bascule|brownfield|reprise de l.existant|coexistence|cohabitation|d[ée]commissionnement|double run|d[ée]commissionner`
  *(Le mot `migration` seul a été écarté après mesure : il fait matcher « qualité de la
  migration des données » — cas R2 du banc de routage, qui relève de `data`. L'exclusion §2
  ci-dessous est ainsi MÉCANIQUE, pas seulement écrite.)*
- Types de demandes : programme de migration ou de bascule d'une plateforme en service ;
  lotissement de bascule ; plan de cohabitation ; décommissionnement d'un système source ;
  machine d'états de bascule ; arbitrage de périmètre entre lot de bascule et lot suivant.
- **Ne pas router** : migration de schéma ou de données pure, sans utilisateurs concernés
  (→ `data`) ; choix du canal technique d'échange entre deux systèmes (→ `interop-archi`) ;
  exploitation de la plateforme cible — déploiement, healthcheck, rollback technique
  (→ `ops-aws` / `ops-azure` / `ops-gcp` / `ops-railway`) ; migration de site web à iso-contenu
  jugée sur la parité des routes (→ oracle `parite-migration` de quality-oracles).

## 3. corpus (checklist propre — rédigée pour ce domaine, réutilisable hors du produit d'origine)

Chemins résolus (test d'existence exécuté le 02/09/2026 par `scaffold-expert`) :
- `.claude/skills/experts-forge/references/corpus-migration-plateforme-brownfield.md`

Cinq points, calibrés sur l'écart réel (les points 3 et 4 étaient déjà couverts par les corpus
voisins, les points 1 et 2 ne l'étaient par **aucun**) :

1. **Ce que la bascule impose à l'utilisateur final — et le préavis correspondant** : fenêtre
   d'indisponibilité, changement de mode de connexion, identifiants à recréer, changement
   d'URL. Test opposable : une machine d'états de bascule **sans état d'annonce** avant la
   bascule est incomplète ; un lot de travaux de bascule **sans travail de préavis** est
   incomplet. (corpus §1)
2. **Qui prévenir** : dénombrement des populations par système d'origine, populations **à
   cheval** sur deux systèmes pendant la cohabitation, canal par population, propriétaire de
   l'annonce. (corpus §2)
3. **Le coût de fonctionnement en double** : durée bornée et datée de la cohabitation, sens de
   la synchronisation, qui paie, qui prononce l'arrêt du double run. (corpus §3)
4. **Réversibilité et point de non-retour** : retour arrière **rejoué** et non seulement écrit,
   point de non-retour nommé et daté, critère observable de déclenchement, sort de ce qui a
   été produit dans la cible entre bascule et retour. (corpus §4)
5. **Le sort de l'historique** : profondeur reprise, consultation dans la source et jusqu'à
   quand, obligations de conservation **citées** et non supposées, stabilité des identifiants.
   (corpus §5)

## 4. rubrique (figée — 5 axes)

Contribution rendue exclusivement sous forme d'annotations identifiées
« Contribution expert-migration-plateforme-brownfield », rattachées aux sections de la réponse
de base ; 1 à 3 annotations actionnables par axe, ancrées dans le corpus **et** dans les faits
de la demande ; généralités transposables telles quelles interdites.

1. **Ce que la bascule impose et le préavis** — nommer chaque changement subi et le préavis
   qui doit exister en face ; signaler explicitement l'**absence** d'état d'annonce dans une
   machine d'états ou de travail de préavis dans un lot. (corpus §1)
2. **Populations à prévenir** — dénombrement manquant, populations à cheval non nommées,
   canal qui suppose déjà connecté au système cible, annonce sans propriétaire. (corpus §2)
3. **Coût et durée de la cohabitation** — ce qui tourne en double, ce qui n'est pas borné dans
   le temps, qui prononce l'arrêt. (corpus §3)
4. **Réversibilité** — retour arrière écrit mais non rejoué, point de non-retour non nommé,
   critère de déclenchement non observable. (corpus §4)
5. **Historique** — profondeur non arrêtée, obligation de conservation supposée, identifiants
   instables entre source et cible. (corpus §5)

**Règle de sortie dure** : quand un axe est **vide faute de matière dans la demande**,
l'annotation le dit (« angle non instruit dans la demande ») plutôt que de rester silencieuse —
c'est précisément le silence d'un angle vide qui a produit le défaut d'origine (§7).

## 5. frontiere

N'exécute pas, ne juge pas, ne réécrit pas la réponse de base. **Ne chiffre rien** : ni charge,
ni délai, ni coût — il nomme ce qui doit être chiffré et par qui. Ne se prononce ni sur la
qualité des données migrées (→ `data`), ni sur le canal technique d'échange (→ `interop-archi`),
ni sur l'exploitation de la cible (→ `ops-*`). **Ne décide pas** : il n'arbitre aucun périmètre
de lot et ne prononce aucun go/no-go — il produit des annotations, le décideur reste le client
(cf. domaine `Autorité d'une décision affirmée` de quality-oracles).

## 6. fixture_valeur

- **Demande témoin** (rejouable) : `fixtures/fixture-migration-plateforme-brownfield.md` §1 —
  revue du lotissement d'un programme de migration v1 → v2 d'une plateforme en service :
  machine d'états de bascule à huit états, quarante travaux au lot 2, plan de cohabitation
  de six mois. Question posée : « Ce lotissement est-il complet pour ouvrir le lot 2 ? »
- **Baseline (A)** : figée dans la fixture **avant** la rédaction du corpus et de la fiche —
  reconstitution de ce que les sept constats de la contre-expertise du 22/08/2026 avaient
  effectivement produit sur cette demande.
- **Contribution (B)** : annotations sur les 5 axes de la rubrique.
- **Critère de différence matérielle** : la contribution doit faire apparaître, absent de la
  baseline, **au moins** (a) l'absence d'état d'annonce dans la machine d'états et (b)
  l'absence de travail de préavis dans les quarante travaux du lot 2 — c'est l'écart réel que
  le client a trouvé le 31/08/2026, et la référence d'arrivée est la version corrigée du
  rapport (écart E9, chapitre 7.5, rapport 20260831b).

## 7. Dette de méthode adossée à cette fiche

Un **angle déclaré vide et non comblé n'est pas neutre**. Cette fiche existe parce qu'un angle
nommé le 20/08/2026 est resté ouvert onze jours sans que rien ne le rappelle. La porte
correspondante est portée par le registre : section « Angles déclarés vides — dettes nommées »
de `references/registre-experts.md`, contrôlée par `scripts/oracle-angles-vides.mjs`
(un angle `ouvert` au-delà de son échéance fait échouer l'oracle).
