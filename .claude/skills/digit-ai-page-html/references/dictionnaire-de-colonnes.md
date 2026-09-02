# Dictionnaire de colonnes — la source unique d'un tableau de données

**TF-0777, 02/09/2026.** Une console livrée ne définissait **aucun** de ses en-têtes, et
l'infobulle du tri disait « Trier par ». Une hypothèse exprimée **en euros par an** y était
consommée par un calcul « séjours × valeur », c'est-à-dire multipliée par un nombre
d'occurrences : personne ne pouvait le voir à la lecture, et l'oracle Calculs rendait `SKIP`
faute de savoir ce que la colonne mesurait — alors que la grille tarifaire du dépôt rendait la
valeur d'une nuit **calculable**.

*Une unité qui n'est écrite nulle part se fait deviner, et une devinette ne se relit pas.*

## La règle

Une colonne se définit **une fois**, dans un fichier de données ; l'en-tête, l'infobulle, le
glossaire et la légende d'export en **dérivent**. Trois écritures d'une même définition
divergent — c'est la loi transverse n° 4 : *une donnée volatile est une donnée, pas du code*.

Contrôle mécanique : `L27` (`check_html.py`) — sur une page `data-page="donnees"`, un `<th>` sans
`data-definition` (ou `title`, ou lien vers son entrée de glossaire) est un **échec**.
Côté composant de filtres, c'est **G9** de
[`composant-filtres-tableau.md`](composant-filtres-tableau.md).

## Le format

Un objet par colonne, dans un fichier `donnees/colonnes.json` (ou la section `colonnes` du
fichier de données qu'il décrit) :

```json
{
  "volume_annuel": {
    "libelle": "Volume annuel",
    "definition": "Nombre de séjours vendus sur l'année de référence.",
    "unite": "séjours/an",
    "source": "mesure 2025, export du 12/08/2026",
    "ordre": "numerique",
    "format": "espace insécable de milliers, 0 décimale"
  },
  "valeur_sejour": {
    "libelle": "Valeur moyenne",
    "definition": "Prix moyen facturé pour UNE NUIT, hors extras.",
    "unite": "EUR/nuit",
    "source": "grille tarifaire build/data.mjs",
    "ordre": "numerique",
    "note": "NE PAS multiplier par un nombre de séjours sans passer par la durée moyenne."
  },
  "fenetre": {
    "libelle": "Fenêtre d'ouverture",
    "definition": "Mois d'ouverture de la fenêtre commerciale.",
    "unite": "mois",
    "source": "calendrier événementiel",
    "ordre": "chronologique",
    "cle_ordre": "mois_debut"
  }
}
```

| Champ | Obligatoire | Ce qu'il porte |
|---|---|---|
| `libelle` | 🔴 | le texte de l'en-tête, tel qu'il s'affiche |
| `definition` | 🔴 | ce que la colonne mesure, en une phrase — pas un synonyme du libellé |
| `unite` | 🔴 | l'unité **et son dénominateur** (« EUR/nuit », « séjours/an », « % du total »). C'est le champ qui manquait, et il a coûté un calcul faux |
| `source` | 🔴 | d'où vient la valeur, avec sa date ou son fichier |
| `ordre` | 🟡 | `numerique`, `chronologique`, `alphabetique`, `palier` — ce qui gouverne le tri et l'ordre de la facette (G8) |
| `cle_ordre` | 🟡 | le champ qui porte la valeur d'ordre quand elle diffère du libellé (`mois_debut`, `rang`) — c'est lui qui alimente `data-v` |
| `format` | ⚪ | la mise en forme d'affichage, pour que deux vues d'une même colonne ne divergent pas |
| `note` | ⚪ | un piège d'usage connu ; celui de l'exemple ci-dessus est le défaut réel qui a motivé la règle |

## Ce que le rendu en tire

```html
<th data-definition="Prix moyen facturé pour UNE NUIT, hors extras. Unité : EUR/nuit.
                     Source : grille tarifaire.">Valeur moyenne</th>
<td data-v="2025-08">août 2025</td>   <!-- cle_ordre → data-v, cf. G8 et L28 -->
```

- **En-tête** : `libelle`.
- **Infobulle / `data-definition`** : `definition` + `unite` + `source`. Une infobulle qui dit
  « Trier par » décrit l'outil, pas la donnée : ce n'est pas une définition.
- **Valeur d'ordre** : `cle_ordre` → `data-v` sur chaque cellule, ce que consomment le tri et la
  facette du composant de filtres.
- **Glossaire de fin de page** : une entrée par colonne, ancrée, pour les définitions longues.

## Ce que ce format ne fait pas

Il ne **vérifie** pas les unités entre elles : dire qu'une colonne est en `EUR/nuit` et qu'une
autre est en `séjours/an` ne dit pas que leur produit a un sens. C'est le travail de
l'oracle Calculs, qui peut désormais **lire** ces unités — et signaler qu'une hypothèse est
calculable depuis les données du dépôt au lieu d'être saisie à la main. Cette limite est écrite
ici plutôt que devinée.
