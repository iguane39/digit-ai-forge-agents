# Proposition Bronze / Silver / Gold

<!-- Fixture VERTE d'oracle-coherence v2 (TF-1352). Données INVENTÉES. La ligne à recalculer
     est rangée sous son vrai statut, et chaque colonne Gold a sa source. -->

Colonnes Gold : 0 colonne inventée, chacune tracée jusqu'à sa source Silver.

## Objets existants à réutiliser

| Objet | Couche | Justification |
|---|---|---|
| `dim_lot_locatif` | Gold | déjà publié, alimenté chaque nuit, réutilisé sans le recalculer |
| `slv_quittancement` | Silver | source unique du quittancement |

## Objets à recalculer

| Objet | Couche | Justification |
|---|---|---|
| `ref_indice_revision` | Gold | table figée depuis 2025 : recalculer en DAX |

## Colonnes Gold

| Colonne Gold | Table | Source Silver |
|---|---|---|
| `montant_loyer_ht` | `fact_loyer_mensuel` | `slv_quittancement.mt_ht` |
| `taux_vacance` | `fact_vacance_mensuelle` | `slv_lots.jours_vacants` |
| `surface_m2` | `dim_lot_locatif` | `slv_lots.surface` |
| `encours_ttc` | `agg_encours_locataire` | `slv_ecritures_client.solde` |
