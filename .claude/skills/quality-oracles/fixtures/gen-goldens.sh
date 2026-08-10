#!/bin/sh
# Régénération scriptée des goldens des fixtures visuelles (rejouable, hors boucle).
# Référence = rendu de visual-green.html ; la rouge est jugée contre le MÊME golden.
cd "$(dirname "$0")/.." || exit 1
python3 scripts/oracle-visual-diff.py fixtures/visual-green.html --profil profils/digit-ai.json --accepter || exit 1
for w in 1280 380; do cp "fixtures/.oracles-goldens/visual-green.html-w$w.png" "fixtures/.oracles-goldens/visual-red.html-w$w.png"; done
rm -f fixtures/visual-green.html.oracles-historique.jsonl
echo "goldens régénérés."
