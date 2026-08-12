#!/usr/bin/env bash
# G1 (comptage) — hook PreToolUse, matcher Task (spec §4).
# Lit le JSON hook sur stdin, résout le ticket courant, incrémente `instantiations`
# sous verrou, exit 0. Ticket absent ou sans `parallel` → exit 0 (aucune écriture).
# jq indisponible sur un ticket `parallel` → refus fail-closed (TF-0118, cf. require_jq) :
# un comptage non fiable romprait l'invariant que G1-block-direct est censé faire respecter.
set -u
cd "$(dirname "$0")/../.." || exit 0
source .queue/gates/common.sh

INPUT="$(cat 2>/dev/null || true)"

resolve_ticket || exit 0
ticket_has_parallel || exit 0
require_jq "G1" "comptage de $TICKET_ID impossible" || exit 2

lock_acquire "$TICKET_ID" || exit 0
state_ensure
sf="$(state_file)"
jq '.instantiations += 1' "$sf" > "$sf.tmp" && mv "$sf.tmp" "$sf"
gate_log_append '{"gate":"G1","decision":"count_task"}'
lock_release
exit 0
