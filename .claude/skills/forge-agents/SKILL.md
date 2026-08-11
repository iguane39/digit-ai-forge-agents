---
name: forge-agents
description: Skill méta multi-agents — découpe un workflow en étapes, dérive les agents spécialisés justifiés (outils, arbitre ou parallélisme distincts), produit leurs définitions au format agent.def et les compile en subagents Claude Code ; référentiel d'exigences A0 en amont, recette C2 à oracles exécutés en aval, ledger de run persisté. Exécution : run parallèle sous Claude Code, ou run-sequentiel dégradé assumé dans claude.ai (artefacts et oracles réels, isolation comportementale, limites consignées au ledger). Use when / déclencher dès que l'utilisateur veut agentifier un workflow, créer des agents spécialisés pour un chantier, découper une mission en agents, orchestrer plusieurs agents sur des livrables, ou qu'un skill pair escalade une tâche justifiant plusieurs agents. Ne pas déclencher pour une boucle mono-agent auto-arbitrée (→ la-boucle) ni pour le brief de handoff d'un chantier (→ forge-brief).
metadata:
  version: 1.0.0
---

# forge-agents — skill méta multi-agents

> **Statut : DORMANCE ASSUMÉE (décision TF-0025, 11/08/2026).** Dernier run réel : T-0100
> (workflow jouet, 24/07) — aucun chantier n'a réclamé de compilation d'agents depuis :
> l'orchestration réelle passe par l'Agent tool et les campagnes mandatées, qui suffisent
> aux besoins constatés. Le skill reste installé, testé par le self-test du poste et
> réactivable tel quel ; toute reprise commence par rejouer un run jouet (mode `run`,
> gates G1-G3) avant un chantier réel. Ni maintenance active, ni évolutions planifiées.

Le nombre d'agents n'est jamais fixé a priori : il sort du découpage. Une étape ne devient un
agent que si elle le mérite (critère à 3 conditions) ; sinon elle reste dans l'orchestrateur.

## Quick start

1. Identifier le mode : `decoupage` (défaut), `definitions`, `run` (Claude Code, parallèle),
   `run-sequentiel` (claude.ai, dégradé assumé — [references/run-sequentiel.md](references/run-sequentiel.md)).
   Ne **jamais** prétendre à un run Claude Code hors de ce substrat.
2. Dérouler les phases P0 → A0 → A → B → C → C2, dans l'ordre — seule P0 est sautable, par
   bypass explicite (workflow déjà fourni) ; les cinq suivantes jamais —
   détail : [references/phases.md](references/phases.md) :
   **P0** imagination du workflow : 2-5 candidats orthogonaux, divergence déléguée au module
   axes-de-divergence.md de challenge-un-prompt, main rendue avant découpage ·
   **A0** référentiel d'exigences du livrable final (binaires/mesurables, figé, validé par
   l'humain) · **A** découpage : critère « mérite un agent » par étape, validation humaine en un
   tour · **B** génération des `agent.def` ([references/agent-def.md](references/agent-def.md)) ·
   **C** orchestration + ledger · **C2** recette contre A0, oracles exécutés.
3. Sous Claude Code, compiler les définitions en subagents :

```bash
node scripts/compile-agent-def.mjs defs/*.yaml --out .claude/agents/
node scripts/ledger.mjs verify <dossier-projet>/ledger.jsonl
node scripts/self-test.mjs   # fixtures verte/rouges — à rejouer après toute modification
```

4. Invocation par un skill pair (dont l'escalade la-boucle) :
   [references/contrat-invocation.md](references/contrat-invocation.md).

## Critère « mérite un agent » (porte d'entrée unique)

Une étape devient un agent **si et seulement si** au moins une condition est vraie :
1. **outils/permissions distincts** du reste du workflow ;
2. **arbitre distinct** — son « fini » est testable indépendamment ;
3. **parallélisable** sans dépendance d'entrée.

Sans condition : étape d'orchestrateur. Chaque agent proposé en phase A affiche sa condition —
garde-fou contre la spécialisation fantôme.

## Règles dures

- `agent.def` : **6 champs obligatoires maximum** ; optionnels : `parallel`, `skill`, `expert_refs` ;
  champ inconnu = refus (fail-closed, appliqué par le compilateur).
- Arbitres **figés avant le premier run**, arbitrage à charge : ✓ seulement avec preuve citable.
- Tout ce qui traverse une frontière entre agents est un **artefact nommé** avec en-tête de
  provenance — jamais un état conversationnel implicite. Un ✗ traverse, jamais masqué.
- Une façade ne peut que **restreindre** les permissions d'un agent, jamais les élargir.
- Ledger **append-only persisté dans le dossier du projet** ; `ledger.mjs verify` avant restitution.
- Proportionnalité : workflow simple à livrable unique → A0 ≤ 5 exigences, C2 en une passe.
- Fail-closed sur toute ambiguïté du graphe (sortie orpheline, dépendance circulaire → stop).

## Frontières

- **la-boucle** : mono-agent ; escalade vers forge-agents une seule fois, au cadrage — les agents
  instanciés n'héritent jamais de la clause d'escalade (anti-circularité, sens unique).
- **forge-brief** : handoff d'un chantier ; consommable en entrée de A0, jamais l'inverse en run.
- **quality-oracles** : consommé par la recette C2 (oracles par type de livrable).
- **experts-forge** : consommé via `expert_refs` (fiches en statut « ok » uniquement).
