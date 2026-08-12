#!/usr/bin/env bash
# G0 (budget) — hook PreToolUse, matcher Task (extension optionnelle, TF-0106).
# Intention : sur un ticket portant le bloc optionnel `budget: { max_appels: N }`, bloquer
# tout nouvel appel modèle (une instanciation Task = un nouvel agent = un appel modèle) une
# fois le plafond atteint — « budget vérifié avant tout appel modèle », pas seulement à la
# clôture (G3 juge un résultat déjà produit, G0 juge un coût pas encore engagé).
#
# Ticket sans `budget` → inactif, aucune écriture dans .queue/state/ (même règle que `parallel`
# pour G1/G2/G3 — zéro régression, spec §9). `budget` est indépendant de `parallel` : un ticket
# peut plafonner ses appels sans imposer de minimum de sous-agents.
#
# Fail-closed RENFORCÉ : si `jq` est indisponible, l'appel est REFUSÉ par prudence plutôt
# qu'autorisé par défaut — un garde-fou de COÛT ne doit jamais fail-open. Un ticket SANS
# `budget` ne touche jamais jq (ticket_has_budget/ticket_budget_max_appels : grep/sed purs) et
# reste donc totalement insensible à l'absence de jq — seule la présence du plafond active la
# dépendance, jamais l'absence de plafond.
# Historique : à l'écriture de ce gate (TF-0106, 12/08), G1/G2/G3 dégradaient en fail-OPEN sur
# jq absent (constaté, cf. rapport de campagne TF-0106) — corrigé depuis par la même discipline
# (require_jq dans common.sh, TF-0118) : les quatre gates sont maintenant fail-closed sur jq.
set -u
cd "$(dirname "$0")/../.." || exit 0
source .queue/gates/common.sh

# 1. Ticket introuvable ou sans `budget` → exit 0, aucune écriture (symétrique de G1/`parallel`).
resolve_ticket || exit 0
ticket_has_budget || exit 0

MAX="$(ticket_budget_max_appels)"
if ! [[ "$MAX" =~ ^[0-9]+$ ]]; then
  echo "GATE G0 — ticket $TICKET_ID : bloc budget présent mais max_appels absent/non numérique, ignoré (champ optionnel mal formé — corrige le ticket)." >&2
  exit 0
fi

# 2. jq indisponible → le budget ne peut pas être vérifié : refus prudentiel, jamais fail-open.
if ! command -v jq >/dev/null 2>&1; then
  echo "GATE G0 — jq indisponible sur ce poste : budget de $TICKET_ID non vérifiable, appel refusé par prudence (un garde-fou de coût ne doit jamais fail-open)." >&2
  exit 2
fi

lock_acquire "$TICKET_ID" || exit 0
state_ensure
sf="$(state_file)"
APPELS="$(jq -r '.appels // 0' "$sf")"

# 3. Plafond déjà atteint → bloquer, main rendue à l'arbitrage humain (pas de retry automatique
#    caché : contrairement à G1, dépasser un budget n'est pas une erreur qui se corrige seule).
if [ "$APPELS" -ge "$MAX" ]; then
  gate_log_append "$(jq -cn --argjson a "$APPELS" --argjson m "$MAX" '{gate:"G0",decision:"budget_epuise",appels:$a,max_appels:$m}')"
  lock_release
  echo "GATE G0 — Budget épuisé pour $TICKET_ID : $APPELS/$MAX appel(s) modèle déjà instancié(s). Repasse la main (arbitrage humain) avant tout nouvel appel." >&2
  exit 2
fi

# 4. Sous le plafond → incrémenter et laisser passer (comptage AVANT l'appel : cohérent avec le
#    sens de « budget vérifié avant appel », l'appel qui suit ce hook est celui qui est compté).
jq '.appels = ((.appels // 0) + 1)' "$sf" > "$sf.tmp" && mv "$sf.tmp" "$sf"
gate_log_append "$(jq -cn --argjson a "$((APPELS + 1))" --argjson m "$MAX" '{gate:"G0",decision:"appel_autorise",appels:$a,max_appels:$m}')"
lock_release
exit 0
