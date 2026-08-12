#!/usr/bin/env bash
# self-test-gate-budget.sh — preuve à double sens du gate G0 (budget, TF-0106).
# Isolé de .queue/ réel : QUEUE_DIR pointe vers un dossier temporaire (aucune écriture dans
# les tickets/état réels du dépôt). Rejoue après toute modification de g0-budget.sh/common.sh.
#
# Deux volets, honnêtes sur ce qui est réellement exécuté sur CE poste :
#  A. Volet SANS jq requis (ticket sans `budget`) — exécutable et exécuté ici à coup sûr.
#  B. Volet AVEC jq requis (ticket avec `budget`, plafond réel) — si jq est absent (constaté sur
#     ce poste au moment d'écrire ce test), le script le détecte et consigne un SKIP motivé
#     PLUTÔT QU'UN FAUX PASS ; s'exécute intégralement (vert + rouge par plafond) sur un poste
#     équipé de jq.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
GATE=".queue/gates/g0-budget.sh"
pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass+1)); }
ko()  { echo "  [FAIL] $1"; fail=$((fail+1)); }
skip(){ echo "  [SKIP] $1"; }

# .queue/ est un espace d'engagement local (.gitignore : « jamais dans le dépôt public »),
# jamais versionné — sur un clone frais du dépôt public, ce dossier n'existe pas du tout et
# G1-G3-G0 n'y sont donc pas déployés. Constat consigné (references/gate-budget.md) : SKIP
# motivé plutôt qu'un échec de script sur un mécanisme absent par construction de ce checkout.
if [ ! -f "$GATE" ]; then
  echo "  [SKIP] $GATE absent de ce checkout (.queue/ est un espace d'engagement local exclu du dépôt public par .gitignore — voir references/gate-budget.md) : rien à rejouer ici."
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export QUEUE_DIR="$TMP/.queue"
mkdir -p "$QUEUE_DIR/tickets" "$QUEUE_DIR/state" "$QUEUE_DIR/receipts"

# --- fixture verte : ticket SANS budget --------------------------------------------------
cat > "$QUEUE_DIR/tickets/T-BUDGET-ABSENT.yaml" <<'EOF'
id: T-BUDGET-ABSENT
type: fixture-selftest
titre: "Fixture self-test G0 — ticket sans budget"
assigne: claude-code
statut: open
resultat_attendu: "aucun effet de G0"
EOF

QUEUE_TICKET=T-BUDGET-ABSENT bash "$GATE" </dev/null; rc=$?
if [ "$rc" -eq 0 ]; then ok "vert : ticket sans budget → G0 exit 0 (inactif, comportement actuel inchangé)"; else ko "vert : ticket sans budget → exit $rc attendu 0"; fi
if [ -f "$QUEUE_DIR/state/T-BUDGET-ABSENT.json" ]; then ko "vert : ticket sans budget → AUCUNE écriture attendue dans .queue/state/, fichier trouvé"; else ok "vert : ticket sans budget → zéro écriture dans .queue/state/ (symétrique de parallel, spec §9)"; fi

# --- fixture rouge : ticket AVEC budget, max_appels non numérique -------------------------
cat > "$QUEUE_DIR/tickets/T-BUDGET-MALFORME.yaml" <<'EOF'
id: T-BUDGET-MALFORME
type: fixture-selftest
titre: "Fixture self-test G0 — max_appels mal formé"
assigne: claude-code
statut: open
resultat_attendu: "G0 ignore le bloc mal formé, ne bloque pas"
budget:
  max_appels: pas-un-nombre
EOF
QUEUE_TICKET=T-BUDGET-MALFORME bash "$GATE" </dev/null; rc=$?
if [ "$rc" -eq 0 ]; then ok "rouge (champ mal formé) : max_appels non numérique → G0 ignore et laisse passer (exit 0), jamais un blocage sur un champ optionnel corrompu"; else ko "rouge (champ mal formé) : exit $rc attendu 0"; fi

# --- volet B : ticket AVEC budget valide, plafond réel -------------------------------------
cat > "$QUEUE_DIR/tickets/T-BUDGET-2.yaml" <<'EOF'
id: T-BUDGET-2
type: fixture-selftest
titre: "Fixture self-test G0 — plafond réel (2 appels max)"
assigne: claude-code
statut: open
resultat_attendu: "G0 bloque au 3e appel"
budget:
  max_appels: 2
EOF

if ! command -v jq >/dev/null 2>&1; then
  skip "plafond réel (jq absent sur ce poste) : G0 doit refuser PAR PRUDENCE (fail-closed renforcé — même discipline appliquée depuis à G1/G2/G3, TF-0118, cf. self-test-gates-jq.sh)"
  QUEUE_TICKET=T-BUDGET-2 bash "$GATE" </dev/null; rc=$?
  if [ "$rc" -eq 2 ]; then ok "rouge (jq absent) : ticket avec budget → G0 refuse (exit 2), jamais fail-open sur un garde-fou de coût"; else ko "rouge (jq absent) : exit $rc attendu 2"; fi
  skip "vert (budget sous le plafond, jq requis) : non rejouable sur ce poste — jq absent (cf. rapport de campagne TF-0106) ; relire g0-budget.sh §3-4 (idiome identique, ligne à ligne, à g1-count-task.sh déjà en production)"
else
  QUEUE_TICKET=T-BUDGET-2 bash "$GATE" </dev/null; rc=$?
  [ "$rc" -eq 0 ] && ok "vert : appel 1/2 → autorisé (exit 0)" || ko "vert : appel 1/2 → exit $rc attendu 0"
  QUEUE_TICKET=T-BUDGET-2 bash "$GATE" </dev/null; rc=$?
  [ "$rc" -eq 0 ] && ok "vert : appel 2/2 → autorisé (exit 0)" || ko "vert : appel 2/2 → exit $rc attendu 0"
  QUEUE_TICKET=T-BUDGET-2 bash "$GATE" </dev/null; rc=$?
  [ "$rc" -eq 2 ] && ok "rouge : appel 3 (plafond 2 dépassé) → G0 bloque (exit 2)" || ko "rouge : appel 3 → exit $rc attendu 2"
  appels="$(jq -r '.appels' "$QUEUE_DIR/state/T-BUDGET-2.json")"
  [ "$appels" = "2" ] && ok "état : compteur figé à 2 (le 3e appel bloqué n'incrémente pas)" || ko "état : appels=$appels attendu 2"
fi

echo
echo "self-test-gate-budget : $pass PASS, $fail FAIL"
[ "$fail" -eq 0 ]
