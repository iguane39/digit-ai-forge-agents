#!/usr/bin/env bash
# G2 — hook SubagentStop : un sous-agent sans reçu conforme = non fait (spec §5).
# Appelable manuellement (façade Codex, spec §7) : bash g2-require-receipt.sh [TICKET_ID]
#
# Écart CONSIGNÉ : le validateur de reçus du plan d'implémentation du 12/07 n'existe pas
# dans ce repo → validation minimale inline contre le schéma reçu ≤ 6 champs
# (id, ticket, agent, verdict obligatoires ; artefacts, ts optionnels ; champ inconnu = refus).
set -u
cd "$(dirname "$0")/../.." || exit 0
source .queue/gates/common.sh

[ $# -ge 1 ] && QUEUE_TICKET="$1"
[ -t 0 ] || INPUT="$(cat 2>/dev/null || true)"

# 1. Ticket sans parallel → exit 0
resolve_ticket || exit 0
ticket_has_parallel || exit 0

lock_acquire "$TICKET_ID" || exit 0
state_ensure
sf="$(state_file)"

# 2. Cherche un reçu nouveau (non encore enregistré dans receipts[]) référençant le ticket
NEW_ID=""; NEW_FILE=""
for f in "$RECEIPTS_DIR"/*.json; do
  [ -e "$f" ] || continue
  jq -e --arg t "$TICKET_ID" '.ticket == $t' "$f" >/dev/null 2>&1 || continue
  rid="$(jq -r '.id // empty' "$f" 2>/dev/null)"
  [ -n "$rid" ] || continue
  jq -e --arg r "$rid" '.receipts | index($r)' "$sf" >/dev/null 2>&1 && continue
  NEW_ID="$rid"; NEW_FILE="$f"; break
done

# 3. Validation du reçu (schéma ≤ 6 champs, fail-closed)
valid=0
if [ -n "$NEW_FILE" ]; then
  jq -e '
    (keys | length) <= 6
    and has("id") and has("ticket") and has("agent") and has("verdict")
    and (.verdict | IN("ok","echec"))
    and ((keys - ["id","ticket","agent","verdict","artefacts","ts"]) | length == 0)
  ' "$NEW_FILE" >/dev/null 2>&1 && valid=1
fi

if [ "$valid" -eq 1 ]; then
  # 5. Reçu OK → ajouter l'id à receipts[], exit 0
  jq --arg r "$NEW_ID" '.receipts += [$r]' "$sf" > "$sf.tmp" && mv "$sf.tmp" "$sf"
  gate_log_append "$(jq -cn --arg r "$NEW_ID" '{gate:"G2",decision:"receipt_ok",receipt:$r}')"
  lock_release
  exit 0
fi

# 4. Reçu absent ou invalide → blocage ; garde-fou : 3 blocages consécutifs → reçu échec auto-généré
CONSEC="$(jq -r '
  def lead: if length > 0 and .[0] == "block" then 1 + (.[1:] | lead) else 0 end;
  [.gate_log[] | select(.gate == "G2") | .decision] | reverse | lead
' "$sf")"

if [ "$CONSEC" -ge 3 ]; then
  mkdir -p "$RECEIPTS_DIR"
  AUTO_ID="R-echec-auto-$TICKET_ID-$(date -u +%Y%m%dT%H%M%S)"
  jq -cn --arg id "$AUTO_ID" --arg t "$TICKET_ID" --arg ts "$(now_iso)" \
    '{id:$id, ticket:$t, agent:"auto-g2", verdict:"echec", ts:$ts}' > "$RECEIPTS_DIR/$AUTO_ID.json"
  jq --arg r "$AUTO_ID" '.receipts += [$r]' "$sf" > "$sf.tmp" && mv "$sf.tmp" "$sf"
  gate_log_append "$(jq -cn --arg r "$AUTO_ID" '{gate:"G2",decision:"receipt_echec_auto",receipt:$r}')"
  lock_release
  echo "GATE G2 — 3 blocages consécutifs : reçu d'échec auto-généré ($AUTO_ID), échec visible dans la queue." >&2
  exit 0
fi

gate_log_append '{"gate":"G2","decision":"block"}'
lock_release
echo "GATE G2 — Sous-agent terminé sans reçu conforme pour $TICKET_ID. Dépose un reçu (schéma ≤ 6 champs) avant de conclure." >&2
exit 2
