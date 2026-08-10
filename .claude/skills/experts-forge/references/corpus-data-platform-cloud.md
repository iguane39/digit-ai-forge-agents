# Corpus propre — plateformes data cloud (checklist)

Constitué le 23/07/2026 pour la fiche `expert-data-platform-cloud` (inventaire P2 §5 E4). Ancré dans quatre architectures rencontrées (Databricks, Fabric, Fabric Medallion, Snowflake).

1. **Architecture par couches** — situer la plateforme dans son modèle de référence : médaillon Bronze/Silver/Gold (Fabric/Databricks) ou zones ODS/FACTORY/HUB-MART ; les irritants se localisent souvent à une frontière de couche (Silver mal gouverné, MART foisonnant sans propriétaire).
2. **Sources système à exploiter d'office** — Snowflake : `ACCOUNT_USAGE` et `QUERY_HISTORY` (requêtes coûteuses, entrepôts surdimensionnés, tables jamais lues) ; Fabric : Capacity Metrics App, journaux d'activité. Un audit qui n'exploite pas ces vues système re-découvre à l'entretien ce que la plateforme journalise déjà.
3. **FinOps requêtes** — structure de coûts à instruire : dimensionnement/auto-suspend des warehouses, requêtes full-scan répétées, clustering/partitionnement, matérialisations redondantes ; distinguer coût de stockage vs calcul avant toute recommandation.
4. **Gouvernance et RBAC** — modèle de rôles (fonctionnels vs techniques), propriétaire par domaine de données, processus d'habilitation ; un RBAC plat ou par personne (pas par rôle) est un signal structurel.
5. **Catalogage et contrats de données** — existence d'un catalogue (natif ou tiers), définitions partagées des indicateurs, contrats de schéma entre producteurs et consommateurs ; sans eux, les divergences BI/data science sont structurelles, pas accidentelles.
6. **Spécificités Fabric vs Snowflake** — Fabric : capacités partagées (une charge peut étrangler l'autre), OneLake et raccourcis, gouvernance Power BI intégrée ; Snowflake : séparation stockage/calcul, time-travel et zero-copy clone (leviers d'environnements), marketplace de données.
7. **Angles morts d'une enveloppe courte** — expliciter ce qu'un audit de ~15 jh NE couvre pas (lignée complète, revue exhaustive du code ELT, tests de restauration) et le déclarer dans la proposition — l'angle mort non déclaré devient un litige.

Frontière du corpus : les flux et échanges de données → fiche `data` ; le profilage d'un dataset → skill `data-quality-auditor` ; le dessin d'architecture → `digit-ai-schemas` ; la conformité des traitements → fiche `conformite-rgpd-ia`.
