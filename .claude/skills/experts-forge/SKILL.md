---
name: experts-forge
description: Analyse la demande et complète la réponse en cours par des contributions d'experts de domaine (data, interop-archi…) — annotations ancrées dans un corpus résolu, pool symétrique amont du pool de juges quality-oracles. Chaque expert est un artefact déclaratif (fiche 6 champs : domaine, déclencheurs, corpus, rubrique, frontière, fixture), admis au registre seulement si sa contribution a été jugée matériellement différente d'une baseline (loi : « un expert qui ne change pas matériellement une réponse n'est pas un expert »). Use when / déclencher quand une demande matche les declencheurs d'une fiche en statut ok du registre (analyse de flux de données, import/export, intégration, synchronisation entre systèmes, interopérabilité, dépendance éditeur), ou pour consulter, rejouer ou faire admettre une fiche expert. Ne pas déclencher pour juger un livrable fini (→ quality-oracles), exécuter un workflow multi-agents (→ skill méta), dessiner un schéma (→ digit-ai-schemas), ou auditer un dataset (→ data-quality-auditor).
metadata:
  version: "1.5.0"
---

# experts-forge — pool de contributeurs par domaine

Symétrique amont de `quality-oracles` : les oracles **jugent** un livrable fini,
les experts **contribuent** pendant la production. Un expert n'est pas un rôle ni
un runtime : c'est une **fiche déclarative** (corpus + rubrique + fixture)
consommée par les mécanismes existants de la forge.

## Loi fondatrice

> « Un expert qui ne change pas matériellement une réponse n'est pas un expert. »

Admission au registre conditionnée à une fixture de valeur A/B : contribution
jugée matériellement différente d'une baseline produite sans l'expert. Juge :
Sébastien pour les 2 premières fiches (ses raisons deviennent
`references/rubrique-juge-experts.md`), puis `oracle-judge` de quality-oracles.

## Procédure d'application (demande courante)

1. Matcher la demande via l'oracle de routage `scripts/route-experts.mjs`
   (patterns lus depuis les fiches, statuts depuis le registre — source unique).
   Seules les fiches **ok** sont routées ; `todo`/`refuse` matchent sans router.
   Fixtures R1–R7 rejouables : `scripts/self-test-routage.mjs` (R6 route
   `migration-plateforme-brownfield`, R7 prouve qu'une migration de **données**
   seule ne le route pas — l'exclusion de la fiche est mécanique, pas seulement écrite).
2. Produire d'abord la réponse de base normalement (skills métier compris).
3. Pour chaque fiche matchée : **lire réellement le corpus** (chemins du champ 3),
   puis dérouler la `rubrique` — 1 à 3 annotations actionnables par axe, ancrées
   dans le corpus et les faits de la demande.
4. Restituer les contributions en sections identifiées (« Contribution
   expert-<domaine> ») rattachées aux sections de la réponse — **jamais** en
   réécriture de celle-ci.
5. Frontières absolues : un expert n'exécute pas, ne juge pas, ne réécrit pas,
   ne chiffre rien. Généralité transposable telle quelle à une autre demande =
   annotation à supprimer avant restitution.

## Procédure d'admission (nouvelle fiche)

1. Vérifier le critère « mérite un expert » (3 conditions cumulatives —
   `references/schema-fiche-expert.md`) : récurrence, corpus disponible,
   non-recouvrement par un skill existant.
2. Rédiger la fiche aux 6 champs du schéma ; chemins de corpus **résolus par
   exécution** (test d'existence), jamais déclarés.
3. Entrer la fiche au registre en statut `todo`.
4. Rejouer la fixture : baseline sans la fiche (anti-contamination : baseline
   figée avant toute lecture de la fiche), puis contribution par la rubrique.
5. Verdict du juge → `ok` (daté) ou `refuse` (fiche conservée pour trace).
   Deux « non matériel » consécutifs sur un même domaine : ne pas insister,
   remonter à Sébastien.

## Porte des angles déclarés vides (TF-0717, 02/09/2026)

> **Un angle vide déclaré et non comblé n'est pas neutre.**

Un angle d'expertise nommé le 20/08/2026 — « fiche expert migration de plateforme
brownfield » — est resté ouvert **onze jours** sans que rien ne le rappelle, et a
produit exactement le défaut qu'il aurait attrapé : un programme de migration qui ne
prévoit nulle part de prévenir les utilisateurs, trouvé par le client après qu'une
contre-expertise complète et **quatre portes automatiques** l'aient laissé passer.
Le trou n'était pas une inattention de rédaction : c'était **un angle qu'aucun juge
du dispositif ne regardait, et il était nommé d'avance**.

**Règle** : tout angle rendu vide (contre-expertise, revue, audit) s'écrit **dans le
tour même** à la table « Angles déclarés vides — dettes nommées » de
`references/registre-experts.md`, avec une **échéance**. Statuts : `ouvert` ·
`comblé` (artefact cité, existence vérifiée par exécution) · `écarté` (raison écrite).

**Porte câblée** — une dette `ouvert` au-delà de son échéance fait **échouer** :

```bash
node scripts/oracle-angles-vides.mjs references/registre-experts.md
```

Enregistré au registre de `quality-oracles` (domaine « Angle d'expertise déclaré vide
(dette de couverture) »), déclenché par contenu, fixtures rouge/verte rejouées par le
self-test de `quality-oracles`.

## Exemple en action

```
Demande : « analyser les capacités d'export de l'outil Y pour alimenter Z »
1. Match registre : `data` (ok) via content_pattern « export » → fiche lue,
   corpus lu ; `interop-archi` (ok) via « intégration » → idem.
2. Réponse de base produite normalement, puis figée.
3. Ajout : « Contribution expert-data — Axe 2 (identifiants pivots) : le
   manuel de Y n'expose aucun identifiant stable des dossiers ; sans clé
   pivot, le rapprochement Y↔Z sera nominatif et fragile — question
   éditeur n°1. » (ancrée corpus §3bis.2 + fait de la demande)
4. Aucune réécriture de la réponse de base ; oracles passés sur l'ensemble.
```

## Références

- `references/schema-fiche-expert.md` — schéma 6 champs, loi fondatrice,
  critère « mérite un expert ».
- `references/registre-experts.md` — registre versionné, statuts, règles, et table
  des **angles déclarés vides** (dettes nommées, contrôlée par `oracle-angles-vides`).
- `references/rubrique-juge-experts.md` — rubrique du juge (5 axes, règle de
  décision, fixtures verte réelle et rouge synthétique) — active dès le 3e expert.
- `fiches/` — une fiche par domaine.

## Articulation forge

- `quality-oracles` : aval (verdict) ; experts-forge : amont (contribution).
  Une rubrique d'expert peut être compilée en rubrique d'`oracle-judge`.
- Skill méta multi-agents : au découpage d'un workflow, une étape matchant un
  `domaine` en statut ok peut référencer la fiche via `expert_refs`
  (champ optionnel d'`agent.def` — phase E4, se caler sur le cadrage courant
  du méta-skill).
- Livrables produits avec contributions : passent les oracles comme tout
  livrable (la contribution n'exempte de rien).
