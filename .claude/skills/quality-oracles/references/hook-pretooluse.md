# Application forcée de la loi qualité — hook PreToolUse (référence)

Le maillon faible de la loi est son **déclenchement comportemental** : il faut que Claude pense à
invoquer le skill avant de livrer. Ce document fournit le hook qui rend l'exécution **structurelle** :
tout `present_files` (ou équivalent de livraison) est précédé d'un run d'oracles, sinon bloqué.

> **Statut** : référence à installer côté **plugin `digit-ai-forge`** (ou `~/.claude/settings.json`).
> Le hook ne fait pas partie du zip du skill — il vit dans la configuration Claude Code.

## Snippet (Claude Code — `hooks` de settings.json ou du plugin)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "present_files|mcp__.*__upload",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/skills/quality-oracles/scripts/run-oracles.mjs \"$CLAUDE_TOOL_INPUT_FILE\" --json || { echo 'BLOQUÉ : oracles en échec ou inconclusifs — corriger puis relancer (loi qualité §5)' >&2; exit 2; }"
          }
        ]
      }
    ]
  }
}
```

Notes d'implémentation :
- `exit 2` depuis un hook PreToolUse **bloque** l'appel d'outil et renvoie le message à Claude — la
  livraison ne part pas tant que le verdict n'est pas PASS (FAIL **et** INCONCLUSIF bloquent).
- La variable d'entrée exacte (`$CLAUDE_TOOL_INPUT_FILE` ci-dessus) dépend de la version de Claude
  Code : adapter au schéma JSON reçu sur stdin par le hook (parser `tool_input.filepaths`).
- Environnements sans hooks (claude.ai web) : la loi reste comportementale — le workflow du SKILL.md
  fait foi, et le journal `.oracles.json` daté est la preuve d'exécution exigible.

## Alternative légère (sans hook)
Ajouter aux skills producteurs de la forge (pptx, page-html, fiches, schémas) une **étape terminale
obligatoire** : « lancer `run-oracles.mjs` sur le livrable ; joindre le verdict au message de
livraison ». Moins robuste (toujours comportemental), mais sans dépendance à la configuration.
