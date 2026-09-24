# Registre des notions — lignage

<!-- Fixture ROUGE d'oracle-coherence v2 (TF-1352). Données INVENTÉES. Rejoue le cas réel du
     24/09/2026 : un compte écrit en préambule, figé à une version antérieure de la table. -->

## Registre des notions

Le registre compte 4 notions, chacune avec sa table Gold et sa source Silver :

| Notion | Table Gold | Source Silver | Statut |
|---|---|---|---|
| Encours locataire | `agg_encours_locataire` | `slv_ecritures_client` | tracée |
| Loyer mensuel | `fact_loyer_mensuel` | `slv_quittancement` | tracée |
| Surface louée | `dim_lot_locatif` | `slv_lots` | tracée |
| Indice de révision | `ref_indice_revision` | `slv_indices` | tracée |
| Vacance | `fact_vacance_mensuelle` | `slv_lots` | tracée |
