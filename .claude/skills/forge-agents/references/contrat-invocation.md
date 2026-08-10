# Contrat d'invocation par un skill pair

Modèle de composition de la forge : **pas d'appel inter-skill technique** — Claude charge ce
SKILL.md et enchaîne dans le même fil (pattern challenge-un-prompt → prompt-analyzer-l99).

## Entrée

Description du workflow (prose, liste d'étapes ou skill à agentifier) + **contraintes héritées du
skill appelant** : règles dures du dossier, charte, exigences à verser telles quelles au
référentiel A0.

## Modes

| Mode | Couverture | Substrat | Sortie |
|---|---|---|---|
| `decoupage` | P0 → A | tous | Imagination du workflow (ou bypass si workflow fourni), graphe d'étapes, agents proposés avec leur condition, référentiel A0 |
| `definitions` | → B | tous | agent.def compilables + arbitres |
| `run` | → C2 | Claude Code | Livrable + PV de recette ✓/✗ + ledger (parallélisme + gates) |
| `run-sequentiel` | → C2 | claude.ai | Livrable + PV de recette ✓/✗ + ledger, limites du substrat consignées (references/run-sequentiel.md) |

Toute sortie est un ensemble d'**artefacts nommés accompagnés du ledger** — jamais un état
conversationnel implicite (même règle que le contrat de frontière).

## Dégradation par substrat

Le mode `run` exige Claude Code (subagents/Task). Hors de ce substrat, deux issues honnêtes et
aucune autre : rendre les définitions + une **consigne d'exécution** (quoi remettre à Claude
Code, dans quel ordre), ou basculer explicitement en `run-sequentiel` — dégradé **assumé et
étiqueté**, jamais présenté comme un run Claude Code. **Jamais de run simulé.**

## Règle anti-circularité (sens unique)

L'escalade **la-boucle → forge-agents** est autorisée **une seule fois, au cadrage la-boucle**,
quand le critère « mérite un agent » justifie ≥ 2 agents. Les agents instanciés héritent de la
discipline d'arbitrage la-boucle (critères figés, arbitrage à charge, preuves) mais **jamais de
sa clause d'escalade** ; aucun agent instancié ne réinvoque forge-agents.
