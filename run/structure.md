# run/structure.md

## En-tête de provenance
- **Agent émetteur** : `collecte-structure`
- **Ticket** : T-0100
- **Condition justifiante** : condition 3 — parallélisable sans dépendance d'entrée avec `collecte-scripts`
- **Verdict d'arbitre** :
  - [✓] `run/structure.md` existe et liste au moins `.claude/`, `.queue/`, `defs/` et `input/` — preuve : les quatre dossiers figurent dans les sections d'inventaire ci-dessous, chacune peuplée par un listing Glob réel exécuté le 2026-07-23 (ex. `.claude\settings.json`, `.queue\tickets\T-0100.yaml`, `defs\collecte-structure.yaml`, `input\Digit-AI - Spec Forge - Gates anti-serial-collapse - 20260719a.md`)
  - [✓] Aucun chemin inventé — chaque entrée listée existe réellement sur disque — preuve : toutes les entrées proviennent exclusivement des résultats bruts de l'outil Glob (motifs `*`, `.claude/**/*`, `.queue/**/*`, `defs/**/*`, `input/**/*`, `run/*`, `ledger.jsonl`) ; aucune entrée ajoutée hors résultats d'outil
- **Hypothèses non résolues** :
  - Le contenu de `.git/` est délibérément omis du détail (métadonnées Git, hors périmètre d'inventaire utile)
  - `run/structure.md` (le présent fichier) et `.queue/receipts/R-t0100-structure.json` sont créés par ce run et inclus dans l'inventaire

## Racine du projet (premier niveau)

| Entrée | Type |
|---|---|
| `.claude/` | dossier |
| `.git/` | dossier (métadonnées Git, non détaillé) |
| `.gitignore` | fichier |
| `.queue/` | dossier |
| `defs/` | dossier |
| `input/` | dossier |
| `ledger.jsonl` | fichier |
| `run/` | dossier |

## Contenu de `.claude/`

- `.claude/settings.json`
- `.claude/agents/collecte-scripts.md`
- `.claude/agents/collecte-structure.md`
- `.claude/agents/synthese-rapport.md`
- `.claude/skills/forge-agents/SKILL.md`
- `.claude/skills/forge-agents/fixtures/rouge-champ-inconnu.yaml`
- `.claude/skills/forge-agents/fixtures/rouge-sans-arbitre.yaml`
- `.claude/skills/forge-agents/fixtures/verte-review.yaml`
- `.claude/skills/forge-agents/references/agent-def.md`
- `.claude/skills/forge-agents/references/contrat-invocation.md`
- `.claude/skills/forge-agents/references/phases.md`
- `.claude/skills/forge-agents/references/run-sequentiel.md`
- `.claude/skills/forge-agents/scripts/compile-agent-def.mjs`
- `.claude/skills/forge-agents/scripts/ledger.mjs`
- `.claude/skills/forge-agents/scripts/self-test.mjs`

## Contenu de `.queue/`

- `.queue/gates/common.sh`
- `.queue/gates/g1-block-direct.sh`
- `.queue/gates/g1-count-task.sh`
- `.queue/gates/g2-require-receipt.sh`
- `.queue/gates/g3-outcome.sh`
- `.queue/receipts/R-t0000-a.json`
- `.queue/receipts/R-t0000-b.json`
- `.queue/receipts/R-t0100-structure.json` (déposé par ce run)
- `.queue/state/T-0000.json`
- `.queue/state/T-0100.json`
- `.queue/tickets/T-0000.yaml`
- `.queue/tickets/T-0100.yaml`

## Contenu de `defs/`

- `defs/collecte-scripts.yaml`
- `defs/collecte-structure.yaml`
- `defs/synthese-rapport.yaml`

## Contenu de `input/`

- `input/Digit-AI - Cadrage Forge - Skill Meta Multi-Agents - 20260721d.md`
- `input/Digit-AI - Prompt Forge - Amorcage Claude Code forge-agents Phase 0 et P3 - 20260723a.md`
- `input/Digit-AI - Skill Forge - forge-agents v0.9.1 - 20260721b.zip`
- `input/Digit-AI - Spec Forge - Gates anti-serial-collapse - 20260719a.md`

## Contenu de `run/`

- `run/orchestrateur-stderr.log`
- `run/prompt-orchestrateur.md`
- `run/structure.md` (le présent fichier)
