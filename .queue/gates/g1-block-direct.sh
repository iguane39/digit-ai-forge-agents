#!/usr/bin/env bash
# G1 (blocage) — hook PreToolUse, matcher Edit|Write|MultiEdit|Bash (spec §4).
# Sur un ticket `parallel` : bloque (exit 2) toute exécution directe tant que
# instantiations < min_agents. Exception : Bash en lecture pure (liste blanche courte).
# jq indisponible sur un ticket `parallel` → refus fail-closed (TF-0118, cf. require_jq).
set -u
cd "$(dirname "$0")/../.." || exit 0
source .queue/gates/common.sh

INPUT="$(cat 2>/dev/null || true)"

# 1. QUEUE_TICKET absent ou ticket sans parallel → laisser passer
resolve_ticket || exit 0
ticket_has_parallel || exit 0

# 1 bis. jq requis pour tout le reste (lecture tool_name/instantiations, TF-0118) → fail-closed
require_jq "G1" "ticket $TICKET_ID non vérifiable (min_agents/instantiations)" || exit 2

# 2. Exception outillage : Bash en lecture pure — liste blanche courte, pas de regex ambitieuse
TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)"
if [ "$TOOL" = "Bash" ]; then
  CMDLINE="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"
  case "$CMDLINE" in
    "git status"*|"git log"*|"git diff"*|"ls"*|"cat .queue/"*) exit 0 ;;
  esac
fi

MIN="$(ticket_min_agents)"
[ -n "$MIN" ] || exit 0

lock_acquire "$TICKET_ID" || exit 0
state_ensure
INST="$(jq -r '.instantiations' "$(state_file)")"

# 3. instantiations < min_agents → bloquer
if [ "$INST" -lt "$MIN" ]; then
  RESTANT=$((MIN - INST))
  ROLES="$(ticket_roles)"
  gate_log_append "$(jq -cn --arg t "${TOOL:-inconnu}" '{gate:"G1",decision:"block_direct",tool:$t}')"
  lock_release
  echo "GATE G1 — Ticket $TICKET_ID est marqué parallel (min_agents=$MIN)." >&2
  echo "Instancie d'abord $RESTANT sous-agent(s) via Task avant toute exécution directe." >&2
  echo "Rôles suggérés : $ROLES" >&2
  exit 2
fi

gate_log_append "$(jq -cn --arg t "${TOOL:-inconnu}" '{gate:"G1",decision:"pass_direct",tool:$t}')"
lock_release
exit 0
