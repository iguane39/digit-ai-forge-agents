# Projection OTLP GenAI du ledger (TF-0106, sous-item 1)

`scripts/otlp-project.mjs` projette un `ledger.jsonl` (format `ledger.mjs` **inchangé**, source de
vérité append-only) en spans **OTLP/JSON** (`ExportTraceServiceRequest`) conformes aux
[OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) —
adoptées AWS/Azure/GCP/Datadog et émises nativement par Claude Code (source de la candidature
TF-0106). C'est une **projection dérivée** : le ledger reste l'unique source de vérité, ce script
ne l'écrit ni ne le réinterprète — il produit un **fichier** consommable par un backend
d'observabilité, **aucun exporteur réseau** (zéro appel HTTP/gRPC émis).

```bash
node scripts/otlp-project.mjs <projet>/ledger.jsonl --out spans.json
```

## Contrat

- **Fail-closed sur l'intégrité** : le ledger doit passer `ledger.mjs verify` avant toute
  projection — un ledger corrompu (append-only rompu, horodatage décroissant, première entrée
  ≠ `run_open`) est **refusé** (`[REFUS]`, exit 1), zéro fichier de spans écrit.
- **Un ledger.jsonl = un run = une trace.** `traceId`/`spanId` sont dérivés déterministement
  (sha256 tronqué) de la clé de run (`run` ou `ticket` de la première entrée, sinon le nom de
  fichier) et du `seq` de chaque entrée — reproductible, jamais aléatoire.
- **Modèle plat v0** : toutes les entrées hors `run_open` sont des spans **enfants directs** du
  span racine (pas de sous-portées imbriquées par agent/étape). Limitation assumée, cf. Restes.
- **Durée non fabriquée** : le ledger ne porte qu'un horodatage par entrée (pas de début/fin
  mesurés). Seul le span racine a une durée réelle (`run_open` → `run_close`, ou dernière entrée
  à défaut). Chaque span enfant affiche une durée **conventionnelle de 1 ms**, jamais présentée
  comme une mesure réelle (commentée dans le code, visible dans le champ mais pas maquillée).

## Correspondance ledger → GenAI Semantic Conventions

| Ledger | Span OTLP |
|---|---|
| Entrée avec un champ `agent` (ex. `type: artefact`) | `kind=CLIENT`, `name="invoke_agent <agent>"`, `gen_ai.system`, `gen_ai.operation.name="invoke_agent"`, `gen_ai.agent.name` |
| `run_open` (span racine) | `kind=INTERNAL`, `name="invoke_agent <run>"`, mêmes attributs `gen_ai.*` sur la clé de run |
| Toute autre entrée (`ticket_open`, `gates_verdict`, `orchestrateur_*`…) | `kind=INTERNAL`, `name=<type>`, aucun attribut `gen_ai.*` fabriqué |
| Champ `ticket` présent sur l'entrée | `gen_ai.conversation.id` |
| Tout autre champ de l'entrée (hors `seq`/`ts`/`type`) | `forge.<champ>` — namespace **custom**, jamais mêlé à `gen_ai.*` |
| `verdict`/`decision`/`statut` matchant `FAIL`/`echec`/`block`/`invalide` | `status.code=ERROR` |
| … matchant `PASS`/`ok`/`closed`/`receipt_ok`/… | `status.code=OK` |
| `gen_ai.system` | `"digit-ai-forge-agents"` (valeur maison — le ledger ne modélise pas un appel à un provider LLM listé par la spec, mais une orchestration d'agents ; valeur documentée ici plutôt qu'inventée dans l'enum officiel) |

## Preuve (double sens)

`fixtures/otlp/run-verte.jsonl` (ledger intègre, 4 entrées — nommé `run-*` et non `ledger-*` : le
motif `ledger*.jsonl` du `.gitignore` racine exclut sinon le fichier du dépôt public) → 4 spans
projetés, `traceId`/`spanId` conformes au format hexadécimal OTLP, hiérarchie parent/enfant
correcte, attributs `gen_ai.*` présents sur le span d'agent. `fixtures/otlp/run-rouge.jsonl`
(première entrée `type: artefact`, pas `run_open`) → refusé par `ledger.mjs verify`, projection
**non exécutée**, aucun fichier écrit. Rejoué par `scripts/self-test.mjs`, plus un contrôle bonus
sur le `ledger.jsonl` réel du dépôt (run `P3-jouet`, 14 entrées — celui-ci, lui, reste hors dépôt
public par le même motif, présent seulement localement sur ce checkout d'engagement).

## Restes (hors V0)

- Modèle plat : pas de sous-portées par agent (un run avec 3 agents parallèles produit 3 spans
  frères, pas un arbre reflétant le graphe `entrees`/`sorties` des `agent.def`).
- `gen_ai.usage.input_tokens`/`output_tokens` : absents du ledger actuel (le ledger ne consigne
  pas de compteurs de tokens) — projection possible dès que cette donnée existe côté ledger.
- Pas d'exporteur OTLP/HTTP réel branché sur un collecteur — seul le fichier JSON est produit,
  conformément au mandat (« pas d'exporteur réseau, la projection est un artefact »).
