# CDC de cadrage — fixture rouge

Cas rouge dérivé d'un CDC réel avant corrections : sections manquantes, inventaire non exécuté,
verdict de frontière absent, seuils insuffisants, bloc de code, questions non indicées.

## SECTION 0 — Autopsie des échecs constatés

Une suite d'interface restait sur les premières pages. **[FAIT]**
Le même mécanisme vaut pour les autres pans, c'est établi.

## SECTION 1 — Inventaire du projet cible

Le projet est une application web Python avec une base PostgreSQL et une interface React.
L'arborescence est classique et la couverture actuelle semble faible.
Rien n'a été inspecté : la description ci-dessus vient du brief.

## SECTION 2 — Frontière avec l'existant

| Capacité | Verdict | Composant examiné |
|---|---|---|
| Inventaire de surface | CRÉÉ | rien d'existant ne couvre |
| Génération de cas | à instruire plus tard | — |
| Reporting | ÉTENDU | registre de findings existant |

## SECTION 3 — Modèle de risque et critères d'arrêt

Objectif de volume : 500 tests sur le périmètre critique.
Le critère de succès est une suite robuste et une couverture complète des parcours.

La couverture de surface est mesurée par pan.

| Id | Seuil | Valeur |
|---|---|---|
| S-01 | Détection du corpus | 100 % |
| S-02 | Durée de suite | ≤ 20 min |
| S-03 | Tests instables | ≤ 2 % |

## SECTION 4 — Architecture

Un socle commun et des modules par technologie. Le découpage sera précisé plus tard.
Le rapport agrège les résultats en un indicateur global vert ou rouge.

Exemple d'invocation prévue :

```bash
forge-tests run --tout
```

## Questions ouvertes

- Quel projet pour la phase 2 ?
- Quels accès seront disponibles ?
- Quel budget en intégration continue ?
