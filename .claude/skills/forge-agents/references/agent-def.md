# agent.def — schéma neutre des définitions d'agents

Format neutre, indépendant du substrat. Une façade le compile vers sa cible
(`.claude/agents/*.md` pour Claude Code ; tickets pour la façade queue git, ultérieure).
**6 champs obligatoires maximum** — la discipline des schémas ticket/reçu Open Engine.

```yaml
id:        # slug unique dans le run
mandat:    # une phrase : ce que l'agent produit, pour qui, sous quelle forme
outils:    # liste FERMÉE d'outils/permissions accordés
arbitre:   # critères BINAIRES figés avant le run — ✓ avec preuve citable, ✗ avec raison réexploitable
entrees:   # contrat d'entrée : artefacts attendus, format, provenance (agent amont ou entrant humain)
sorties:   # contrat de sortie : artefacts produits, format, destinataires (agent aval ou livrable final)
# --- champs optionnels ---
parallel:     # gates anti-serial-collapse : min_agents + critères binaires figés
skill:        # skill de la forge chargé comme mandat opératoire (ex. digit-ai-pptx)
expert_refs:  # fiches du registre experts-forge consommées par l'agent (statut « ok » uniquement)
provenance:   # capacité importée d'une source externe : { source: …, author: …, confidence: 0-1, date: … }
```

## Règles

- **Arbitre figé avant le premier run** — jamais réajusté pour épouser une sortie produite
  (discipline la-boucle : arbitrage à charge, chercher à faire échouer chaque critère).
- **`outils` est une liste fermée** : un agent sans besoin d'écriture n'a pas Write ; un agent
  de review n'a pas Bash. Une façade ne peut que restreindre, jamais élargir.
- **`entrees`/`sorties` forment le graphe du workflow** : chaque sortie est l'entrée d'exactement
  un agent aval ou un livrable final. Sortie orpheline = erreur de découpage → stop (fail-closed).
- **Frontières** : tout artefact transmis porte un en-tête de provenance — agent émetteur,
  verdict d'arbitre (✓/✗ par critère), hypothèses non résolues. Un ✗ traverse, jamais masqué.
- **Ledger de run** : append-only, persisté dans le dossier du projet — agents instanciés,
  artefacts échangés, verdicts. Équivalent intra-session des reçus Open Engine.
- **`expert_refs`** : seules les fiches en statut « ok » du registre experts-forge sont
  consommables ; une fiche absente ou « todo » = champ ignoré avec mention au ledger.
- **`provenance`** *(capacité importée)* : quand un agent encapsule une capacité venue d'une
  source externe (idée, workflow, skill tiers), déclarer `{ source, author, confidence, date }`.
  `confidence ∈ [0,1]` mesure la fiabilité de la source — une capacité importée reste une
  hypothèse pondérée, jamais une vérité. Fail-closed si le bloc est présent mais mal formé.

## Contrôle de cohérence du lot

Le compilateur valide chaque def **isolément** (fail-closed). La cohérence **transversale** du
graphe — chaque `de:`/`vers:` pointant vers un autre agent du lot correspond bien à un artefact
réellement produit/consommé — est contrôlée par l'oracle `scripts/oracle-defs.mjs` (contrat JSON
standard, exit 0/1/2), rejoué par `self-test.mjs`. Les liens vers un non-agent (entrant humain,
orchestrateur, livrable-final) sont explicitement **non jugés**.

## Exemple complet

```yaml
id: propale-review
mandat: "Audite la propale finale et rend un verdict Envoyer/Retravailler/Refondre argumenté"
outils: [Read]
arbitre:
  - "Chaque dimension de la grille /5 est notée avec citation à l'appui"
  - "Le verdict cite au moins un red flag vérifié ou son absence prouvée"
entrees:
  - { artefact: "propale.pptx", de: "propale-pptx" }
sorties:
  - { artefact: "review.md", vers: "livrable-final" }
skill: digit-ai-propale-review
```
