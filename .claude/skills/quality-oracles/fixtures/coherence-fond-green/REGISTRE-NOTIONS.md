# Registre des notions — lignage

<!-- Fixture VERTE d'oracle-coherence v2 (TF-1352). Données INVENTÉES. Le compte suit la table,
     et la préséance entre les trois documents est écrite. -->

En cas de désaccord avec `MAPPING.html` ou `PROPOSITION.md`, ce registre fait foi pour la
définition d'une notion, et le mapping fait foi pour une colonne.

## Registre des notions

Le registre compte 5 notions, chacune avec sa table Gold et sa source Silver :

| Notion | Table Gold | Source Silver | Statut |
|---|---|---|---|
| Encours locataire | `agg_encours_locataire` | `slv_ecritures_client` | tracée |
| Loyer mensuel | `fact_loyer_mensuel` | `slv_quittancement` | tracée |
| Surface louée | `dim_lot_locatif` | `slv_lots` | tracée |
| Indice de révision | `ref_indice_revision` | `slv_indices` | tracée |
| Vacance | `fact_vacance_mensuelle` | `slv_lots` | tracée |
