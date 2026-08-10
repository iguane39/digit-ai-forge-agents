# Composant — Filtres de colonne sur les tableaux de données

Composant interactif **obligatoire** du socle pour tout tableau de données parcouru.
Chaque colonne catégorielle reçoit dans son en-tête un déclencheur ouvrant une **listbox de
cases à cocher** : liste des valeurs distinctes, bascules **Tous** / **Aucun**, et **champ de
recherche** qui filtre la liste des valeurs proposées.

Asset : [`assets/table-filters.js`](assets/table-filters.js).
Oracle : `oracle-filtres-tableau.mjs` — checklist **G1–G6**.

## Périmètre — quand la règle s'applique

**Obligatoire** dès que les deux conditions sont réunies :

1. Le tableau porte **≥ 8 lignes de données** (`<tbody> > <tr>`).
2. Il possède **au moins une colonne catégorielle** — une colonne dont le nombre de valeurs
   distinctes est strictement inférieur au nombre de lignes (donc des valeurs qui se répètent).

🟡 **Recommandé** en dessous de 8 lignes si le tableau est amené à croître (résultats de run,
journal, inventaire).
⚪ **Hors périmètre** : tableaux de mise en page, tableaux de 2 lignes descriptives, tableaux
dont toutes les colonnes sont à valeurs uniques (identifiants, horodatages).

**Exemption explicite** : un tableau en périmètre qui ne doit pas être filtré porte
`data-filterable="off"` **et** `data-filterable-reason="…"`. Sans motif, c'est un échec — pas
une exemption. L'oracle rend alors `SKIP` sur ce tableau et le motif figure au journal.

## Câblage

Le composant se construit tout seul à partir du tableau : le HTML ne porte que le marquage.

```html
<table id="runs" data-filterable>
  <thead>
    <tr><th>Suite</th><th>Statut</th><th>Durée</th></tr>
  </thead>
  <tbody>
    <tr><td>auth</td><td>Échec</td><td>1,2 s</td></tr>
    <!-- … -->
  </tbody>
</table>
<div class="tf-count" data-tf-count-for="runs" aria-live="polite"></div>

<script src="table-filters.js"></script>
<script>DigitAITableFilters.init(document.getElementById('runs'));</script>
```

`init()` détecte les colonnes catégorielles, injecte les déclencheurs dans les `<th>` et
construit les panneaux. Pour forcer ou exclure une colonne : `data-filter-col` /
`data-filter-col="off"` sur le `<th>`.

CSS : adapter aux tokens du livrable (voir `charte-et-tokens.md`), aucun hex en dur.

```css
.tf-btn    { border:0; background:none; cursor:pointer; font:inherit; color:var(--muted); }
.tf-btn[aria-expanded="true"], .tf-btn.tf-on { color:var(--accent); }
.tf-panel  { position:absolute; z-index:10; background:var(--surface);
             border:1px solid var(--line); border-radius:var(--r-sm); padding:8px; }
.tf-panel[hidden] { display:none; }
.tf-opts   { max-height:220px; overflow-y:auto; }
.tf-count  { margin-top:4px; font-size:.72rem; color:var(--muted); min-height:1em; }
.tf-count.zero { color:var(--danger); }
@media print { .tf-btn, .tf-panel { display:none !important; }
               tr[data-tf-hidden] { display:table-row !important; } }
```

## Comportement — non négociable

- **État initial : toutes les valeurs cochées.** Aucun filtre actif à l'ouverture, le tableau
  est complet. Un composant qui masque des lignes au chargement est un défaut.
- **Tous / Aucun** agissent sur les valeurs **actuellement visibles dans la liste** (donc
  après recherche), pas sur l'ensemble — c'est ce qui rend « rechercher puis Tous » utile.
- **Champ de recherche** : filtre la liste des valeurs proposées, insensible à la casse et aux
  accents. Il ne filtre pas le tableau directement.
- **Combinaison ET entre colonnes** : une ligne est visible si elle satisfait chaque colonne
  filtrée. OU à l'intérieur d'une même colonne.
- **Indicateur d'état** : le déclencheur d'une colonne filtrée porte la classe `tf-on`. Sans
  cet indicateur, l'utilisateur oublie qu'un filtre est actif et lit un tableau tronqué en
  croyant le lire entier.
- **Compteur** : « 12 lignes sur 47 » mis à jour à chaque changement, `aria-live="polite"`.
- **Masquage** : les lignes filtrées portent `data-tf-hidden` en plus de leur masquage CSS —
  c'est ce qui rend l'état inspectable et réversible à l'impression.

## Accessibilité & robustesse

- 🔴 Déclencheur = `<button>` avec `aria-expanded` et `aria-controls` vers le panneau.
- 🔴 Panneau `role="group"` avec `aria-label` nommant la colonne.
- 🔴 Compteur en `aria-live="polite"`.
- 🔴 Fermeture au clavier (`Échap`) et au clic extérieur ; focus rendu au déclencheur.
- 🔴 **Viewer-only** : à l'export PDF (WeasyPrint), le JS ne s'exécute pas. La règle `@media
  print` ci-dessus **réaffiche toutes les lignes** : le PDF porte toujours le tableau complet.
  Un filtre n'est jamais un porteur d'information, seulement une aide de lecture à l'écran.

## Checklist de l'oracle — G1 à G6

| # | Contrôle | Sévérité |
|---|---|---|
| **G1** | Tout tableau en périmètre porte `data-filterable`, ou une exemption `data-filterable="off"` **avec motif** | bloquant |
| **G2** | L'asset `table-filters.js` est référencé (balise `<script src>` ou code inline exposant `DigitAITableFilters`) | bloquant |
| **G3** | Chaque tableau `data-filterable` est initialisé (appel `init()` le désignant, ou `initAll()`) | bloquant |
| **G4** | Chaque tableau `data-filterable` a un `id` et un `<thead>` porteur de `<th>` — prérequis du composant | bloquant |
| **G5** | Un compteur `data-tf-count-for` avec `aria-live` existe pour chaque tableau `data-filterable` | bloquant |
| **G6** | Une règle `@media print` réaffiche les lignes masquées (`tr[data-tf-hidden]`) | bloquant |

**Ce que l'oracle ne juge pas** (`non_juge`, déclaré à chaque exécution) : le comportement
d'exécution réel (construction des panneaux, bascules Tous/Aucun, recherche, combinaison ET),
qui exige un rendu navigateur. Le contrôle porte sur le **câblage**, pas sur le runtime. Pour
le runtime, passer la page à `render_page.py` (V1–V7) et inspecter les PNG produits.
