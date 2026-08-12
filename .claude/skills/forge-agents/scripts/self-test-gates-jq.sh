#!/usr/bin/env bash
# self-test-gates-jq.sh — preuve à double sens de la discipline fail-closed sur jq absent,
# pour G1 (g1-block-direct.sh, g1-count-task.sh), G2 (g2-require-receipt.sh) et G3
# (g3-outcome.sh) — TF-0118. Avant correction, ces quatre gates dégradaient en fail-OPEN
# (« jq: command not found » puis exit 0 silencieux, cf. references/gate-budget.md) sur un
# ticket `parallel` quand jq manque. Même discipline que G0 (TF-0106, self-test-gate-budget.sh) :
# refus explicite (exit 2), jamais un passage silencieux.
#
# Isolé de .queue/ réel : QUEUE_DIR pointe vers un dossier temporaire (aucune écriture dans
# les tickets/état réels du dépôt). Simulation « jq absent » par PATH restreint : retire du
# PATH le dossier qui contient jq — rejouable sur tout poste, que jq soit installé ici ou non
# (sur ce poste au 12/08, jq est réellement absent : la simulation est alors un no-op qui
# exerce directement l'absence réelle).
set -u
cd "$(dirname "$0")/../../../.." || exit 1
GATES_DIR=".queue/gates"
pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass+1)); }
ko()  { echo "  [FAIL] $1"; fail=$((fail+1)); }
skip(){ echo "  [SKIP] $1"; }

# .queue/ est un espace d'engagement local (.gitignore), jamais versionné avant TF-0119 —
# sur un clone qui n'a pas encore matérialisé .queue/gates/ (engagement jamais ouvert sur ce
# poste), rien à rejouer : SKIP motivé plutôt qu'un échec sur un mécanisme absent.
if [ ! -d "$GATES_DIR" ]; then
  echo "  [SKIP] $GATES_DIR absent de ce checkout : rien à rejouer ici."
  exit 0
fi
for g in g1-block-direct.sh g1-count-task.sh g2-require-receipt.sh g3-outcome.sh; do
  if [ ! -f "$GATES_DIR/$g" ]; then
    echo "  [SKIP] $GATES_DIR/$g absent de ce checkout : rien à rejouer ici."
    exit 0
  fi
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export QUEUE_DIR="$TMP/.queue"
mkdir -p "$QUEUE_DIR/tickets" "$QUEUE_DIR/state" "$QUEUE_DIR/receipts"

# --- construction du PATH sans jq (simulation, portable) -----------------------------------
JQ_REEL="$(command -v jq 2>/dev/null || true)"
PATH_SANS_JQ="$PATH"
if [ -n "$JQ_REEL" ]; then
  JQ_DIR="$(dirname "$JQ_REEL")"
  NEWPATH=""
  OLD_IFS="$IFS"; IFS=':'
  for p in $PATH; do
    [ "$p" = "$JQ_DIR" ] && continue
    NEWPATH="$NEWPATH:$p"
  done
  IFS="$OLD_IFS"
  PATH_SANS_JQ="${NEWPATH#:}"
fi
if PATH="$PATH_SANS_JQ" command -v jq >/dev/null 2>&1; then
  echo "  [SKIP] jq reste résolu après retrait de son dossier du PATH (plusieurs installations sur ce poste) : simulation impossible, self-test non concluant."
  exit 0
fi

# --- fixtures communes -----------------------------------------------------------------------
# verte : ticket SANS parallel → zéro effet attendu, jq indifférent (non-régression du bypass
# existant : un ticket sans `parallel` ne doit jamais dépendre de jq).
cat > "$QUEUE_DIR/tickets/T-SEQ.yaml" <<'EOF'
id: T-SEQ
type: fixture-selftest
titre: "Fixture self-test gates jq — ticket sans parallel"
assigne: claude-code
statut: open
resultat_attendu: "aucun effet, jq indifferent"
EOF

# rouge : ticket AVEC parallel → jq requis dès que ce gate doit statuer.
cat > "$QUEUE_DIR/tickets/T-PAR.yaml" <<'EOF'
id: T-PAR
type: fixture-selftest
titre: "Fixture self-test gates jq — ticket parallel"
assigne: claude-code
statut: open
parallel: true
min_agents: 2
roles: "a, b"
resultat_attendu: "refus fail-closed si jq absent"
EOF

run_gate() {
  # $1=script $2=ticket $3=PATH à utiliser
  local script="$1" ticket="$2" path="$3"
  echo '{"tool_name":"Edit","tool_input":{}}' | QUEUE_TICKET="$ticket" PATH="$path" bash "$GATES_DIR/$script" 2>"$TMP/stderr.$$"
  local rc=$?
  cat "$TMP/stderr.$$" >&2
  return $rc
}

for g in g1-block-direct.sh g1-count-task.sh g2-require-receipt.sh g3-outcome.sh; do
  # 1. rouge (jq absent) : ticket parallel → refus explicite (exit 2), jamais un passage silencieux
  msg="$(run_gate "$g" T-PAR "$PATH_SANS_JQ" 2>&1 1>/dev/null)"; rc=$?
  if [ "$rc" -eq 2 ]; then ok "$g — rouge (jq absent) : ticket parallel → refus fail-closed (exit 2)"; else ko "$g — rouge (jq absent) : exit $rc attendu 2"; fi
  case "$msg" in
    *"jq indisponible"*"refus par prudence"*) ok "$g — rouge (jq absent) : message explicite (jamais un passage silencieux)" ;;
    *) ko "$g — rouge (jq absent) : message attendu absent (« jq indisponible ... refus par prudence »), reçu : ${msg:0:160}" ;;
  esac
  if [ -f "$QUEUE_DIR/state/T-PAR.json" ]; then
    ko "$g — rouge (jq absent) : AUCUNE écriture d'état attendue avant le refus, fichier trouvé"
  else
    ok "$g — rouge (jq absent) : zéro écriture dans .queue/state/ avant le refus"
  fi

  # 2. verte (jq absent) : ticket SANS parallel → comportement inchangé, exit 0, zéro écriture
  run_gate "$g" T-SEQ "$PATH_SANS_JQ" >/dev/null 2>"$TMP/stderr2.$$"; rc=$?
  if [ "$rc" -eq 0 ]; then ok "$g — vert (jq absent) : ticket sans parallel → exit 0 (bypass inchangé, jq indifférent)"; else ko "$g — vert (jq absent) : exit $rc attendu 0"; fi
  if [ -f "$QUEUE_DIR/state/T-SEQ.json" ]; then ko "$g — vert : AUCUNE écriture attendue dans .queue/state/, fichier trouvé"; else ok "$g — vert : zéro écriture dans .queue/state/"; fi
  rm -f "$QUEUE_DIR/state/T-PAR.json" "$QUEUE_DIR/state/T-SEQ.json"

  # 3. volet jq disponible (exécuté seulement si jq est réellement installé sur ce poste) :
  #    confirme que require_jq n'a rien changé au comportement normal quand jq répond présent.
  if [ -n "$JQ_REEL" ]; then
    run_gate "$g" T-PAR "$PATH" >/dev/null 2>"$TMP/stderr3.$$"; rc=$?
    if [ "$rc" -eq 0 ] || [ "$rc" -eq 2 ]; then ok "$g — jq disponible : ticket parallel traité normalement (exit $rc, pas de refus jq)"; else ko "$g — jq disponible : exit $rc inattendu"; fi
    if grep -q "jq indisponible" "$TMP/stderr3.$$" 2>/dev/null; then ko "$g — jq disponible : refus « jq indisponible » inattendu alors que jq est présent"; else ok "$g — jq disponible : aucun refus « jq indisponible » (comportement normal préservé)"; fi
    rm -f "$QUEUE_DIR/state/T-PAR.json"
  else
    skip "$g — volet jq disponible : non rejouable sur ce poste (jq réellement absent, cf. references/gate-budget.md) — sera exécuté dès qu'un poste équipé de jq relance ce self-test."
  fi
done

echo
echo "self-test-gates-jq : $pass PASS, $fail FAIL"
[ "$fail" -eq 0 ]
