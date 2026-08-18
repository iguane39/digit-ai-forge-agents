---
name: pilote-de-mission
description: >
  Pilote une mission datée de bout en bout, pour tous types de missions (projet perso, mission client, réponse à AO, projet forge) : construit le plan (workstreams, étapes typées, communications, hypothèses, chemin critique), anime la co-exécution par sessions sur un état de mission unique, et adapte le plan au changement par un cycle borné en 6 pas (nouvelle information → impacts balayés → re-planification → décisions → journal → diff). Use when / déclencher dès que l'utilisateur donne un objectif daté à mener jusqu'au bout (« pilote la mission », « fais le plan de », « où en est-on », « nouvelle info : … », « adapte le plan »), veut créer, afficher, mettre à jour ou faire évoluer un plan de mission, ou reprend une session de pilotage d'une mission existante. Ne pas déclencher pour imaginer des candidats de workflow (→ forge-agents P0), itérer sur un livrable unique (→ la-boucle), ni cadrer une idée encore floue (→ clarifie-une-idee).
metadata:
  version: "1.0.0"
---

# Pilote de mission

Conduite d'une mission datée : définition du plan, co-exécution, adaptation au changement.
La méthode est **agnostique au domaine** — ce qui varie entre missions vit dans l'instance,
jamais dans le schéma.

## Quick start

1. **Créer** : objectif daté fourni → instancier le plan depuis
   [references/schema-de-plan.md](references/schema-de-plan.md) (7 blocs, étapes typées,
   chemin critique nommé). Toute donnée non sourcée est marquée « à vérifier ».
2. **Exécuter** : chaque session suit le rituel ouverture → exécution → clôture de
   [references/protocole-adaptation.md](references/protocole-adaptation.md) ; les livrables
   d'étapes sont délégués à `la-boucle` et vérifiés par `quality-oracles`.
3. **Adapter** : toute nouvelle information déclenche le cycle en 6 pas du protocole —
   jamais d'adaptation silencieuse, restitution en **diff**, trace au journal.

Format canonique d'une étape (exemple) :

```text
- **F2** · Dossier bancaire — *préparer* — dép. F1 · éch. 29/07 ·
  statut : à faire · fait si : dossier prêt à envoyer
```

4. **Tenir la cadence** : les cinq artefacts qui reviennent — revue RAID, rapport
   d'avancement, compte rendu, REX de fin, suivi des bénéfices — se **dérivent** de l'état de
   mission, sans jamais en tenir un second. Table normative, régime de preuve et juge de
   chacun : [references/artefacts-de-cadence.md](references/artefacts-de-cadence.md). La
   cadence de chacun est une **donnée de l'instance**, déclarée dans l'état, jugée par
   `quality-oracles/scripts/oracle-cadence-de-mission.mjs` (C1-C5).

## Règles dures

- L'**état de mission** est la source de vérité unique (fichier mémoire `/areas` en chat,
  `MISSION.md` en repo) : relu en ouverture, réécrit en clôture de chaque session.
- Typologie des tâches contractuelle : *produire · préparer · rappeler · tiers ·
  hors périmètre* (signature, engagement juridique ou financier, présence physique — jamais promis).
- Toute échéance dépendant d'une condition est marquée *hypothèse* ; un changement
  d'hypothèse sur le chemin critique re-date la mission et le dit explicitement.
- Décisions attendues de l'utilisateur : toujours en liste indicée (a, b, c…).
- Aucun montant inventé ; chiffres sourcés ou « à vérifier ».
- Les cinq **artefacts de cadence** sont tous rendus dans l'état de mission : chacun déclaré
  avec sa cadence, sa dernière occurrence et sa source, **ou** déclaré `non-applicable` avec
  son motif. Écarter est légitime, omettre ne l'est pas (TF-0324, mesuré : 0 occurrence de
  « RAID », « compte rendu » ou « rapport d'avancement » dans la forge au 16/08).

## Environnements

Chat claude.ai : état en mémoire, recherche de conversations disponible.
Claude Code / repo : état dans `MISSION.md`, mêmes règles ; orchestration multi-agents
d'un chantier → escalader à `forge-agents`, jamais dupliquer.

## Preuves de généricité

Deux familles instanciées sur missions réelles (cf.
[references/instanciations-types.md](references/instanciations-types.md)) :
acquisition/projet perso (APDLB, avec premier cycle d'adaptation réel) et réponse à AO
(OPCO EP lot 4, absorption d'une mission déjà en cours).
