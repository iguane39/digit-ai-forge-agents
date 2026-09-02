# Produit-02 — Console de pilotage, onglet Valeur (cas ROUGE)

Provenance du défaut : Produit-02 - RETOURS - 20260902d. Aucun en-tête n'est défini, l'unité
change entre le titre de la colonne et son contenu, et une valeur EXPRIMÉE PAR AN est
consommée comme une valeur unitaire. `oracle-calculs` rendait SKIP.

Source de données : `calculs-unites-sources/data.mjs`

Hypothèse : valeur de séjour = 420 €/an, faute de mieux.

Valeur du marché = séjours × valeur de séjour

| Marché | Séjours | Valeur de séjour (€) |
|---|---|---|
| Nord | 120 | 420 €/an |
| Sud | 90 | 420 €/an |
| Est | 60 | 420 €/an |

Dénominateur des séjours : les trois marchés couverts, base n = 270 séjours.
