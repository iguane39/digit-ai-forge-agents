# Proposition Bronze / Silver / Gold

<!-- Fixture ROUGE d'oracle-coherence v2 (TF-1352). Données INVENTÉES. Deux contradictions
     internes : une ligne rangée « à réutiliser » qui dit « pas à réutiliser », et « 0 colonne
     inventée » en tête d'un document dont une colonne a une source introuvable. -->

Colonnes Gold : 0 colonne inventée, chacune tracée jusqu'à sa source Silver.

## Objets existants à réutiliser

| Objet | Couche | Justification |
|---|---|---|
| `dim_lot_locatif` | Gold | déjà publié, alimenté chaque nuit |
| `ref_indice_revision` | Gold | pas à réutiliser : la table est figée depuis 2025, recalculer en DAX |
| `slv_quittancement` | Silver | source unique du quittancement |

## Colonnes Gold

| Colonne Gold | Table | Source Silver |
|---|---|---|
| `montant_loyer_ht` | `fact_loyer_mensuel` | `slv_quittancement.mt_ht` |
| `taux_vacance` | `fact_vacance_mensuelle` | source introuvable |
| `surface_m2` | `dim_lot_locatif` | `slv_lots.surface` |
| `encours_ttc` | `agg_encours_locataire` | `slv_ecritures_client.solde` |
