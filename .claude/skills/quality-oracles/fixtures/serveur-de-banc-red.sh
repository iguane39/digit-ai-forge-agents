#!/usr/bin/env bash
# Fixture ROUGE de oracle-serveur-de-banc (TF-2414) — un banc shell qui lance un serveur en arrière-plan et rend la main sans l'arrêter.
set -e
npx wrangler pages dev ./dist --port 8788 > /tmp/wrangler.log 2>&1 &
sleep 5
node oracle-a11y.mjs http://localhost:8788/
python -m http.server 8080 &
echo "banc terminé"
