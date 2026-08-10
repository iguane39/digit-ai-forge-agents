# Inventaire des scripts — skill forge-agents

## En-tête de provenance
- **Agent émetteur** : `collecte-scripts`
- **Condition justifiante** : condition 3 — parallélisable sans dépendance d'entrée avec `collecte-structure`
- **Verdict d'arbitre (critères binaires, arbitrage à charge)** :
  - [✓] `run/scripts.md` existe et couvre les 3 scripts (self-test, compile-agent-def, ledger) — preuve : glob de `.claude/skills/forge-agents/scripts/` retourne exactement `compile-agent-def.mjs`, `ledger.mjs`, `self-test.mjs`, les 3 sections ci-dessous couvrent chacun d'eux.
  - [✓] Chaque rôle décrit est appuyé par une citation de l'en-tête du script — preuve : chaque section contient un bloc « Citation de l'en-tête » extrait mot pour mot du commentaire de tête (lignes 2–9 de chaque fichier).
- **Hypothèses non résolues** : aucune. Les rôles sont tirés exclusivement des en-têtes de commentaire ; le corps des scripts n'a été lu que pour confirmer, sans extrapolation.

---

## 1. `compile-agent-def.mjs`

- **Nom** : `compile-agent-def.mjs`
- **Usage** : `node compile-agent-def.mjs <def1.yaml> [def2.yaml ...] --out <dir>` (cité de l'en-tête, ligne 8)
- **Rôle** : compilateur fail-closed de définitions `agent.def` (sous-ensemble YAML) vers des subagents Claude Code `.claude/agents/<id>.md` ; toute définition invalide est refusée sans écriture partielle.
- **Citation de l'en-tête** (lignes 3–6) :
  > « compile-agent-def.mjs — façade Claude Code de forge-agents. Compile des définitions agent.def (sous-ensemble YAML documenté dans references/agent-def.md) en subagents `.claude/agents/<id>.md`. Fail-closed : champ obligatoire manquant, champ inconnu, liste d'outils vide ou id invalide => refus (exit 1), aucune écriture partielle. »

## 2. `ledger.mjs`

- **Nom** : `ledger.mjs`
- **Usage** (cité de l'en-tête, lignes 5–6) :
  - `node ledger.mjs append <ledger.jsonl> '<json>'` — « ajoute une entrée (seq + horodatage) »
  - `node ledger.mjs verify <ledger.jsonl>` — « vérifie l'intégrité append-only »
- **Rôle** : journal de run append-only au format JSON Lines, persisté dans le dossier du projet, avec vérification d'intégrité (seq croissant, horodatages non décroissants, ouverture obligatoire par `run_open`).
- **Citation de l'en-tête** (lignes 3, 7–8) :
  > « ledger.mjs — ledger de run append-only (JSON Lines), persisté dans le dossier du projet. […] Vérifications : JSON valide par ligne, seq strictement croissant depuis 1, horodatages non décroissants, première entrée de type run_open. Exit 0 = PASS, 1 = FAIL. »

## 3. `self-test.mjs`

- **Nom** : `self-test.mjs`
- **Usage** : `node self-test.mjs` (aucun argument documenté ; « À rejouer après toute modification du skill », ligne 4)
- **Rôle** : suite d'auto-tests du skill — rejoue les fixtures du compilateur (1 cas vert, 3 cas rouges de refus) et un cycle complet du ledger ; sert de gate de non-régression.
- **Citation de l'en-tête** (lignes 3–4) :
  > « self-test.mjs — rejoue les fixtures du compilateur (1 verte, 3 rouges) et le cycle ledger. Exit 0 si tous les contrôles passent, 1 sinon. À rejouer après toute modification du skill. »
