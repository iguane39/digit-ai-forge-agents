#!/usr/bin/env bash
# Fixture VERTE de oracle-serveur-de-banc (TF-2414) — le même banc shell : `trap … EXIT` pour le premier serveur, exemption déclarée pour le second.
set -e
npx wrangler pages dev ./dist --port 8788 > /tmp/wrangler.log 2>&1 &
PID=$!
trap 'kill $PID' EXIT
sleep 5
node oracle-a11y.mjs http://localhost:8788/
# serveur-banc-ok: arrêté par le banc suivant qui le reprend dans sa propre commande
python -m http.server 8080 &
echo "banc terminé"
# Un lancement en AVANT-plan (sans & final) bloque le script lui-même : ce n'est pas un serveur orphelin.
