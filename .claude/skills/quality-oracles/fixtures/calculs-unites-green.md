# Produit-02 — Console de pilotage, onglet Valeur (cas VERT)

Le même onglet, dont chaque colonne dit son unité et dont aucune grandeur n'est supposée quand
elle est calculable.

Source de données : `calculs-unites-sources/data.mjs`

Valeur de séjour : 110 € par séjour, calculée depuis la grille tarifaire de la source
(2 nuits par séjour moyen × 55 € la nuit en basse saison). Rien n'est supposé.

Valeur du marché = séjours × valeur de séjour

| Marché | Séjours | Valeur de séjour (€) | Valeur du marché (€) |
|---|---|---|---|
| Nord | 120 | 110 | 13 200 |
| Sud | 90 | 110 | 9 900 |
| Est | 60 | 110 | 6 600 |

Dénominateur des séjours : les trois marchés couverts, base n = 270 séjours.
