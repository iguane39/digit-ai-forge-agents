# digit-ai-forge-agents

Forge Digit-AI : deux ateliers dans un seul repo.

1. **Fabrique d'agents** (`forge-agents`) — découpe un workflow en agents spécialisés
   justifiés, produit leurs définitions au format `agent.def` et les compile en subagents
   Claude Code (`.claude/agents/*.md`), avec ledger de run persisté et recette finale à
   oracles exécutés.
2. **Atelier oracles/experts** — cycle de vie des oracles de qualité (`quality-oracles`,
   `write-an-oracle`) et des fiches d'experts de domaine (`experts-forge`,
   `write-an-expert`), plus les skills de revue qui s'appuient dessus (`ameliore-un-skill`,
   `contre-expertise`, `data-quality-auditor`, `digit-ai-page-html`, `digit-ai-schemas`,
   `prompt-analyzer-l99`).

Les versions réellement montées dans `.claude/skills` (extraites des frontmatters) sont
consignées dans `versions-livrees.json`.

## Catalogue de services

> Section proposée par la campagne « catalogues » du pilot (2026-08-13) — générée depuis
> la source unique `catalogues/catalogue.jsonl` du pilot (v1.6.0, challengée état de
> l'art le 12/08/2026). **prouvé** = preuve exécutée ; *déclaré* = méthode documentée seulement.

| Service | Intention (« je veux… ») | Point d'entrée | Statut |
|---|---|---|---|
| **Fabriquer des agents spécialisés** | découper un workflow en agents outillés et vérifiés | `skill forge-agents (conversationnel) + compile-agent-def.mjs (fail-closed)` | prouvé (experimental) |
| **Ledger de run vérifiable** | journaliser tout run en JSONL auditable et vérifiable machine | `node .claude\skills\forge-agents\scripts\ledger.mjs verify <ledger.jsonl>` | prouvé (production) |
| **Atelier des skills qualité** | héberger et faire évoluer les outils transverses de qualité | `sources vivantes dans le dépôt agents ; chaîne d'admission avec fixture rouge juge` | prouvé (production) |
| **Projection OTLP GenAI du ledger** | rendre mes runs lisibles par tout backend d'observabilité | `node .claude\skills\forge-agents\scripts\otlp-project.mjs <ledger>` | prouvé (experimental) |
| **Oracle agent-evals** | détecter la régression sémantique d'un agent entre versions | `node .claude\skills\forge-agents\scripts\oracle-agent-evals.mjs` | prouvé (experimental) |
| **Gate budget G0** | plafonner les appels modèle d'un ticket avant l'appel, fail-closed | `.queue\gates\g0-budget.sh (hook PreToolUse)` | prouvé (experimental) |

Le catalogue consolidé des dix forges vit chez le pilot :
[digit-ai-factory/catalogues/CATALOGUES.md](https://github.com/iguane39/digit-ai-factory/blob/main/catalogues/CATALOGUES.md).

## Points d'entrée réels

- **Skill méta** : [`.claude/skills/forge-agents/SKILL.md`](.claude/skills/forge-agents/SKILL.md)
  — quick start, phases P0→A0→A→B→C→C2, critère « mérite un agent », règles dures. C'est le
  point d'entrée pour agentifier un workflow.
- **Prompt d'amorçage** : conservé dans l'espace d'engagement local (`input/`, hors dépôt
  public) — prompt à coller dans une session Claude Code neuve pour démarrer un run
  forge-agents. Cet espace local porte aussi les briefs oracles/experts, la spec des gates
  anti-serial-collapse et les skills sources importés dans `.claude/skills/`.

## Scripts (forge-agents) — commandes exactes

Tous dans `.claude/skills/forge-agents/scripts/`, à exécuter depuis la racine du repo.

```bash
# Compiler des agent.def (YAML, cf. references/agent-def.md) en subagents Claude Code.
# Fail-closed : champ obligatoire manquant / champ inconnu / id invalide => refus (exit 1),
# aucune écriture partielle (tout le lot ou rien).
node .claude/skills/forge-agents/scripts/compile-agent-def.mjs defs/*.yaml --out .claude/agents/

# Ajouter une entrée au ledger d'un run (seq + horodatage calculés automatiquement).
node .claude/skills/forge-agents/scripts/ledger.mjs append <ledger.jsonl> '<json>'

# Vérifier l'intégrité append-only d'un ledger. Exit 0 = PASS, 1 = FAIL.
node .claude/skills/forge-agents/scripts/ledger.mjs verify <ledger.jsonl>

# Rejouer les fixtures du compilateur (1 verte, 3 rouges) + le cycle ledger (dont la
# concurrence). À relancer après toute modification du skill. Exit 0 si tout passe.
node .claude/skills/forge-agents/scripts/self-test.mjs
```

## Contrat du ledger

Fichier JSON Lines, append-only, persisté dans le dossier du projet (jamais dans un
répertoire temporaire). Une entrée = une ligne JSON.

- **`seq`** : entier strictement croissant depuis 1, calculé par `ledger.mjs append` — jamais
  fourni par l'appelant.
- **`ts`** : horodatage ISO 8601, non décroissant d'une entrée à l'autre.
- **Première entrée** : toujours de type `run_open`.
- **`verify`** rejoue ces trois contrôles (+ validité JSON de chaque ligne) et sort en
  0 (PASS) ou 1 (FAIL) — à exécuter avant toute restitution d'un run.
- **Écriture concurrente** : `append` prend un verrou de fichier zéro-dépendance
  (`<ledger>.lock`, créé en exclusif) le temps de lire le dernier `seq` et d'écrire la
  nouvelle ligne, avec retry borné + délai et libération garantie (y compris sur refus).
  Deux process qui appendent en même temps au même ledger n'obtiennent jamais le même `seq`.
- **Histoire append-only** : les entrées déjà écrites ne sont **jamais** réécrites, y compris
  celles qui documentent un défaut passé (ex. un ledger de run réel conserve telle quelle une
  collision de `seq` antérieure au verrou — preuve du défaut — et la version consolidée vit
  dans un fichier séparé).

## Structure des dossiers

| Dossier | Contenu |
|---|---|
| `.claude/skills/` | Les skills du repo (forge-agents + atelier oracles/experts), chacun avec son `SKILL.md`, ses `scripts/`, `references/`, `fixtures/`. |
| `.claude/agents/` | Subagents Claude Code compilés (sortie de `compile-agent-def.mjs`). |
| `defs/` | `agent.def` (YAML) d'exemple — collecte, synthèse (le graphe est contrôlé par `oracle-defs.mjs`). |
| `run-admission/` | Admission des fiches expert par `oracle-judge` : profil du juge (`profil-admission.json`), rubrique figée, verdicts par fiche (`verdict-*.json`). |

**Espace d'engagement (local, hors dépôt public)** : les runs réels produisent leurs artefacts
dans `input/`, `p4/`, `defs-p4/`, `output/`, `.queue/` et des `ledger*.jsonl` — ces dossiers
sont ignorés par git (`.gitignore`) car ils portent des documents d'engagement (briefs,
propales, référentiels client). Le dépôt public ne contient que l'outillage générique.

## Prérequis hôte

- **Node.js ≥ 18** — tous les scripts de `forge-agents` sont des modules ES (`.mjs`) sans
  dépendance externe (fs, child_process, Atomics du cœur Node uniquement).
- **bash + jq + git** — requis uniquement pour les gates anti-serial-collapse
  (`.queue/gates/*.sh`), qui n'utilisent que ces trois outils (critère d'acceptation de la
  spec gates, `.queue/gates/common.sh`). Sous Windows, Git Bash/MSYS convient ; `flock` étant
  absent de cet environnement, le verrou d'état des gates retombe sur un spinlock `mkdir`
  (même intention d'exclusion mutuelle, comportement consigné dans `common.sh`).
