#!/usr/bin/env bash
# G3 — hook Stop + arbitre : pas de clôture tant que les critères binaires figés ne sont
# pas tous vrais (spec §6). Appelable manuellement (façade Codex, spec §7) :
#   bash .queue/gates/g3-outcome.sh [TICKET_ID]
#
# Écart CONSIGNÉ : le harness LLM-as-judge du plugin forge v0.4.0 n'existe pas dans ce
# repo → seuls les critères vérifiables mécaniquement sont supportés, via la convention
# documentée « EXISTS:<chemin> » (le fichier existe et est non vide). Tout critère
# non mécanique = FAIL explicite (fail-closed), jamais un PASS de complaisance.
set -u
cd "$(dirname "$0")/../.." || exit 0
source .queue/gates/common.sh

[ $# -ge 1 ] && QUEUE_TICKET="$1"
[ -t 0 ] || INPUT="$(cat 2>/dev/null || true)"

# 1. Ticket sans parallel, ou statut closed/failed → exit 0
resolve_ticket || exit 0
ticket_has_parallel || exit 0
case "$(ticket_statut)" in closed|failed) exit 0 ;; esac

lock_acquire "$TICKET_ID" || exit 0
state_ensure
sf="$(state_file)"

# Garde-fou : maximum 5 passages G3, ensuite ARBITRAGE_HUMAIN_REQUIS consigné, exit 0
PASSES="$(jq '[.gate_log[] | select(.gate == "G3")] | length' "$sf")"
if [ "$PASSES" -ge 5 ]; then
  gate_log_append '{"gate":"G3","decision":"ARBITRAGE_HUMAIN_REQUIS"}'
  lock_release
  echo "GATE G3 — 5 passages atteints : ARBITRAGE_HUMAIN_REQUIS consigné, main rendue." >&2
  exit 0
fi

# 2. Intégrité : critères non modifiés depuis le premier reçu (git log sur le fichier ticket)
FIRST_RECEIPT_TS="$(jq -r '[.gate_log[] | select(.gate == "G2" and .decision == "receipt_ok")][0].ts // empty' "$sf")"
if [ -n "$FIRST_RECEIPT_TS" ]; then
  LAST_COMMIT_EPOCH="$(git log --follow -1 --format=%ct -- "$TICKET_FILE" 2>/dev/null | tr -d '\r')"
  FIRST_RECEIPT_EPOCH="$(date -u -d "$FIRST_RECEIPT_TS" +%s 2>/dev/null)"
  if [ -n "$LAST_COMMIT_EPOCH" ] && [ -n "$FIRST_RECEIPT_EPOCH" ] && [ "$LAST_COMMIT_EPOCH" -gt "$FIRST_RECEIPT_EPOCH" ]; then
    gate_log_append '{"gate":"G3","decision":"invalide_criteres_modifies"}'
    lock_release
    echo "GATE G3 — Ticket $TICKET_ID invalidé : fichier ticket modifié après le premier reçu (critères figés à la création)." >&2
    exit 2
  fi
fi

# 3. Couverture : len(receipts) >= min_agents, aucun reçu d'échec non traité
MIN="$(ticket_min_agents)"
NRECEIPTS="$(jq '.receipts | length' "$sf")"
if [ -n "$MIN" ] && [ "$NRECEIPTS" -lt "$MIN" ]; then
  gate_log_append "$(jq -cn --argjson n "$NRECEIPTS" '{gate:"G3",decision:"fail_couverture",receipts:$n}')"
  lock_release
  echo "GATE G3 — Couverture insuffisante : $NRECEIPTS reçu(s) < min_agents=$MIN." >&2
  exit 2
fi
# reçu d'échec non traité = aucun reçu ok ultérieur du même agent (reprise)
UNTREATED="$(
  for rid in $(jq -r '.receipts[]' "$sf"); do
    rf="$RECEIPTS_DIR/$rid.json"; [ -f "$rf" ] || continue
    jq -r '[.agent, .verdict] | @tsv' "$rf"
  done | jq -Rrs '
    split("\n") | map(select(length > 0) | split("\t") | {agent: .[0], verdict: .[1]})
    | to_entries
    | map(select(.value.verdict == "echec") as $e
        | select([.[] | select(.key > ($e | .key) and .value.agent == $e.value.agent and .value.verdict == "ok")] | length == 0))
    | length' 2>/dev/null
)"
# (jq ci-dessus : nombre de reçus « echec » sans reçu « ok » ultérieur du même agent)
if [ -n "$UNTREATED" ] && [ "$UNTREATED" -gt 0 ]; then
  gate_log_append '{"gate":"G3","decision":"fail_echec_non_traite"}'
  lock_release
  echo "GATE G3 — $UNTREATED reçu(s) d'échec non traité(s) (ni reprise, ni décision explicite)." >&2
  exit 2
fi

# 4./5. Arbitrage : évaluation des critères un par un, arrêt au premier FAIL
while IFS= read -r crit; do
  [ -n "$crit" ] || continue
  case "$crit" in
    EXISTS:*)
      path="${crit#EXISTS:}"
      if [ ! -s "$path" ]; then
        gate_log_append "$(jq -cn --arg c "$crit" '{gate:"G3",decision:"fail_critere",critere:$c}')"
        lock_release
        echo "GATE G3 — Critère non satisfait : $crit. Corrige puis re-clôture." >&2
        exit 2
      fi
      ;;
    *)
      # critère nécessitant jugement : harness LLM-as-judge absent de ce repo → fail-closed
      gate_log_append "$(jq -cn --arg c "$crit" '{gate:"G3",decision:"fail_critere_juge_indisponible",critere:$c}')"
      lock_release
      echo "GATE G3 — Critère non satisfait : $crit (arbitre LLM-as-judge indisponible dans ce repo — critère non mécanique, fail-closed)." >&2
      exit 2
      ;;
  esac
done <<< "$(ticket_criteres)"

# 6. Tous PASS → verdict consigné dans gate_log, exit 0 (la clôture effective reste au protocole)
gate_log_append '{"gate":"G3","decision":"PASS"}'
lock_release
exit 0
