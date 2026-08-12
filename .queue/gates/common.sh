#!/usr/bin/env bash
# common.sh — fonctions partagées des gates anti-serial-collapse.
# Spec de référence : « Digit-AI - Spec Forge - Gates anti-serial-collapse - 20260719a.md ».
# Dépendances : bash + jq + git uniquement (critère d'acceptation spec §9).
#
# Écarts plateforme/contexte CONSIGNÉS (jamais silencieux) :
#  - flock absent de Git Bash/MSYS (Windows) → verrou par mkdir en fallback (même intention :
#    exclusion mutuelle sur le fichier d'état).
#  - le « script d'ouverture de ticket » du protocole queue n'est pas fourni dans ce repo →
#    création paresseuse du fichier d'état, UNIQUEMENT pour les tickets `parallel`
#    (critère spec §9 : un ticket sans parallel n'écrit jamais dans .queue/state/).

QUEUE_DIR="${QUEUE_DIR:-.queue}"
TICKETS_DIR="$QUEUE_DIR/tickets"
STATE_DIR="$QUEUE_DIR/state"
RECEIPTS_DIR="$QUEUE_DIR/receipts"

now_iso() { date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"; }

# Verrou : flock si disponible, sinon spinlock mkdir (fallback plateforme consigné ci-dessus)
lock_acquire() {
  local target="$1" i=0
  mkdir -p "$STATE_DIR"
  LOCK_DIR="$STATE_DIR/.lock-$target"
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    i=$((i+1))
    [ "$i" -gt 200 ] && { echo "verrou : timeout sur $target" >&2; return 1; }
    sleep 0.05
  done
}
lock_release() { rmdir "$LOCK_DIR" 2>/dev/null || true; }

# Résolution du ticket courant : $QUEUE_TICKET, fallback = dernier ticket `open`
# assigné à claude-code (spec §4, g1-count-task.sh)
resolve_ticket() {
  TICKET_ID=""
  if [ -n "${QUEUE_TICKET:-}" ]; then
    TICKET_ID="$QUEUE_TICKET"
  else
    local newest="" f
    for f in "$TICKETS_DIR"/*.yaml; do
      [ -e "$f" ] || continue
      grep -q '^statut: *open' "$f" || continue
      grep -q '^assigne: *claude-code' "$f" || continue
      if [ -z "$newest" ] || [ "$f" -nt "$newest" ]; then newest="$f"; fi
    done
    [ -n "$newest" ] && TICKET_ID="$(sed -n 's/^id: *//p' "$newest" | head -1 | tr -d '\r')"
  fi
  [ -n "$TICKET_ID" ] || return 1
  TICKET_FILE="$TICKETS_DIR/$TICKET_ID.yaml"
  [ -f "$TICKET_FILE" ]
}

ticket_has_parallel() { grep -q '^parallel:' "$TICKET_FILE"; }
ticket_statut()       { sed -n 's/^statut: *//p' "$TICKET_FILE" | head -1 | tr -d '\r'; }
ticket_min_agents()   { sed -n 's/^ *min_agents: *//p' "$TICKET_FILE" | head -1 | tr -d '\r' | sed 's/ *#.*//'; }
ticket_roles()        { sed -n 's/^ *roles: *//p' "$TICKET_FILE" | head -1 | tr -d '\r' | sed 's/ *#.*//'; }
# critères : lignes « - "…" » du bloc `criteres:` (schéma plat de la spec §2)
ticket_criteres()     { sed -n '/^ *criteres:/,/^[^ ]/p' "$TICKET_FILE" | sed -n 's/^ *- *//p' | sed 's/\r$//;s/^"//;s/"$//'; }

# Extension optionnelle « budget » (TF-0106, gate G0) — même discipline que `parallel` :
# champ absent = gate inactive, zéro écriture, comportement actuel inchangé (non-régression).
ticket_has_budget()        { grep -q '^budget:' "$TICKET_FILE"; }
ticket_budget_max_appels() { sed -n 's/^ *max_appels: *//p' "$TICKET_FILE" | head -1 | tr -d '\r' | sed 's/ *#.*//'; }

state_file() { echo "$STATE_DIR/$TICKET_ID.json"; }

state_ensure() {
  mkdir -p "$STATE_DIR"
  local sf; sf="$(state_file)"
  # "appels" (G0, TF-0106) : compteur d'appels modèle autorisés, distinct de "instantiations"
  # (G1, plancher de parallélisme) — un ticket peut porter `budget` sans porter `parallel`.
  # Les fichiers d'état antérieurs à TF-0106 n'ont pas ce champ : lu partout via `.appels // 0`.
  [ -f "$sf" ] || printf '{\n  "instantiations": 0,\n  "appels": 0,\n  "receipts": [],\n  "gate_log": []\n}\n' > "$sf"
}

# Trace toute décision de gate dans gate_log avec horodatage (critère spec §9)
gate_log_append() {
  local sf; sf="$(state_file)"
  local entry; entry="$(jq -cn --arg ts "$(now_iso)" --argjson e "$1" '$e + {ts:$ts}')"
  jq --argjson e "$entry" '.gate_log += [$e]' "$sf" > "$sf.tmp" && mv "$sf.tmp" "$sf"
}

# jq requis par tout le reste d'un gate au-delà de resolve_ticket/ticket_has_parallel (grep/sed
# purs, insensibles à jq) : sans jq, ni l'état ni la décision ne peuvent être vérifiés (TF-0118).
# Avant correction, l'absence de jq produisait des erreurs "jq: command not found" en cascade
# puis un exit 0 silencieux (fail-OPEN constaté sur G1/G2/G3, cf. references/gate-budget.md) —
# même discipline que G0 (TF-0106) : refus explicite (fail-closed), jamais un passage silencieux.
# À appeler juste avant le premier usage de jq d'un gate, jamais avant (un ticket sans `parallel`
# doit rester insensible à l'absence de jq, comme aujourd'hui).
require_jq() {
  local gate="$1" detail="$2"
  command -v jq >/dev/null 2>&1 && return 0
  echo "GATE $gate — jq indisponible sur ce poste : $detail, refus par prudence (jamais un passage silencieux)." >&2
  return 1
}
