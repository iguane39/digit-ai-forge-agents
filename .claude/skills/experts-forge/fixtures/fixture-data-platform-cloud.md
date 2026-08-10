# Fixture de valeur A/B — `data-platform-cloud`

## Demande témoin (rejouable)

« Cadrer un audit de plateforme data d'environ 15 jours-homme chez un retailer : entrepôt Snowflake alimenté par des pipelines ELT, consommation BI et data science, plaintes récurrentes sur les coûts et les temps de requête. Proposer le périmètre et la démarche d'audit. »

## Baseline (A) — figée le 23/07/2026, AVANT rédaction de la fiche et de sa checklist

> **Baseline reconstituée (fil d'origine inaccessible)** — la baseline citée par l'inventaire P2 §5 (propale data platform : « audit générique ») vit dans un fil claude.ai non accessible depuis le repo ; produite à neuf sans lecture de la fiche ni du corpus (règle transverse du brief §4).

Cadrage sans expertise plateforme outillée :

Démarche en 4 volets : (1) inventaire de l'existant — sources, pipelines, modèles de données, consommateurs ; (2) entretiens avec les équipes data et métier pour cerner les irritants ; (3) revue technique — qualité du code ELT, documentation, tests, sécurité des accès ; (4) restitution — cartographie, forces/faiblesses, feuille de route priorisée. Répartition indicative : 3 j inventaire, 4 j entretiens, 5 j revue, 3 j restitution. Livrables : rapport d'audit, cartographie des flux, backlog de recommandations priorisées.

## Contribution (B) — par la rubrique de la fiche, produite le 23/07/2026 (session S ; jugement différé en S′)

**Contribution expert-data-platform-cloud** (annotations rattachées au cadrage de base) :

- **Axe 1 · Modèle en couches** — cartographier l'existant contre son modèle de référence (médaillon ou ODS/FACTORY/MART) dès le volet 1 : « plaintes coûts + temps de requête » se localisent presque toujours à une frontière de couche (MART foisonnant, Silver sans propriétaire) — l'inventaire à plat de la baseline ne le fera pas apparaître (corpus §1).
- **Axe 2 · Vues système** — remplacer une partie des entretiens par l'exploitation d'`ACCOUNT_USAGE` et `QUERY_HISTORY` : requêtes les plus coûteuses, warehouses surdimensionnés, tables jamais lues — la plateforme journalise déjà ce que la baseline prévoit d'aller demander aux équipes (corpus §2).
- **Axe 3 · Structure de coûts** — séparer stockage/calcul et instruire auto-suspend, clustering et matérialisations redondantes AVANT toute recommandation d'architecture ; sinon la feuille de route traite les symptômes (corpus §3).
- **Axe 4 · Gouvernance** — ajouter au volet revue : modèle RBAC (par rôle ou par personne ?), propriétaires par domaine, catalogue et contrats de schéma — les divergences BI/DS sont structurelles sans eux (corpus §4-§5).
- **Axe 5 · Angles morts** — déclarer dans la proposition ce que 15 jh ne couvrent PAS (lignée complète, revue exhaustive ELT, tests de restauration) : l'angle mort non déclaré devient un litige de recette (corpus §7).

Chaque annotation ajoute un élément actionnable absent de la baseline (démarche générique inventaire/entretiens/revue/restitution).

## Critère de différence matérielle

Au moins un élément actionnable absent de la baseline (source système à exploiter, angle mort de l'enveloppe, structure de coûts), ancré dans le corpus cité — verdict par `oracle-judge` en session S′ ≠ S.
