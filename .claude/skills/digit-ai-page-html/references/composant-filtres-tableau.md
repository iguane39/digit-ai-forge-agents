# Composant — Filtres de colonne sur les tableaux de données

Composant interactif **obligatoire** du socle pour tout tableau de données parcouru.
Chaque colonne catégorielle reçoit dans son en-tête un déclencheur ouvrant une **listbox de
cases à cocher** : liste des valeurs distinctes, bascules **Tous** / **Aucun**, et **champ de
recherche** qui filtre la liste des valeurs proposées.

Assets : [`assets/table-filters.js`](assets/table-filters.js) **et son CSS jumeau
[`assets/table-filters.css`](assets/table-filters.css)** (TF-0176, 13/08) — les DEUX
s'inlinent ensemble : le composant livré sans son habillage sort en rendu brut navigateur
(constaté et refusé sur livrable réel). L'état OUVERT du panneau se juge par
`render_page.py --etats-ouverts` (V2/V4). Après `initAll()`, appeler-le sur toute page hôte.
Le comportement d'exécution (tri, ordre des valeurs, existence des facettes, état) se juge
par les cas Playwright du banc — `self_test.py`, branche `run_filtres_runtime` : aucun
oracle de marquage ne voit un tri qui range « 1 000 » avant « 250 ».

## Le `<th>` est POSSÉDÉ par le composant après `init()` (RA-6, Produit-10 14/08)

`init()` **injecte** le bouton de facette et son panneau DANS le `<th>`. Toute extension qui
réécrit `th.textContent` ou `th.innerHTML` (armer un tri, renommer une colonne…) **détruit
silencieusement** le filtre de cette colonne — et les oracles statiques rendent PASS sur la
version défectueuse (constaté sur livrable réel, trouvé par un test d'interactions).
Règles d'extension :
- ne modifier que les **nœuds texte** du `th` (`childNodes` de type texte), jamais son contenu
  global ;
- ou poser vos ajouts AVANT `initAll()` ;
- brancher un tri : écouter le clic du `th` en **ignorant** les cibles `.tf-btn`/`.tf-panel`
  (modèle : le dashboard forge-tests), ou passer par le tri opt-in du composant (RA-5,
  ci-dessous).
Preuve attendue de toute extension : un test d'interactions (voir
[`references/tests-interactions.md`](tests-interactions.md)) — l'oracle statique ne voit pas
une facette détruite.

## Tri ARMÉ PAR DÉFAUT, et la valeur prime sur le texte (RA-5, 14/08 — revu TF-0768, 02/09)

La règle L4 exige « filtre, tri et recherche ». Le tri est donc **armé par défaut** :
`DigitAITableFilters.initAll(document)` pose un tri croissant/décroissant au clic d'en-tête
(`aria-sort`, marqueur `.tf-tri`, clics `.tf-btn`/`.tf-panel` ignorés, lignes `[data-detail]`
qui voyagent avec leur ligne mère). Une page qui arme le sien le **déclare** — `{ tri: false }`
ou `data-tf-tri="off"` sur la table ; une colonne se soustrait par `data-sort-col="off"`.

**La clé de tri est une VALEUR, jamais un texte rendu.** Le défaut fondateur (TF-0768, remonté
par un produit) : `parseFloat("1 000")` vaut **1** — l'espace insécable de milliers arrête
l'analyse au premier caractère non chiffre, et « 1 200 000 » vaut 1 lui aussi. Toute page en
français triait faux, **en silence**, et le produit a dû réarmer son propre tri pour s'en sortir.
L'ordre se lit donc dans cet ordre de préférence :

1. `data-v` sur la cellule (ou `data-sort`) — **la seule clé fiable** : c'est elle qui permet
   d'ordonner ce qui n'a pas d'ordre lisible (mois, statuts, paliers) ;
2. à défaut, le texte rendu lu comme un nombre **après** retrait des espaces (ordinaire,
   insécable, insécable étroite, fine), du `%` et des symboles monétaires ;
3. à défaut, comparaison de texte insensible à la casse et aux accents.

```html
<!-- La valeur d'ordre voyage avec la donnée, le libellé reste lisible. -->
<td data-v="1200000">1 200 000</td>
<td data-v="2025-08">août 2025</td>
```

Une date ISO (`2025-08`, `2025-08-14`) se compare comme du texte : **c'est déjà son ordre
chronologique**. C'est la raison pour laquelle le socle ne demande pas d'autre format.
Oracle : `oracle-filtres-tableau.mjs` — checklist **G1–G9** (câblage) ; le comportement est
prouvé par les fixtures `tf-tri-milliers.html`, `tf-facettes-ordre.html`, `tf-etat-rejoue.html`.

## G7 — chaque en-tête porte sa facette ; la cardinalité décide de la FORME (TF-0782, 02/09)

L'ancienne heuristique n'ouvrait une facette que si `1 < valeurs distinctes < nombre de lignes`.
Conséquence mesurée sur un livrable : **huit marchés distincts sur huit lignes, donc aucune
facette « Marché »** — précisément la colonne clé, celle par laquelle le lecteur entre dans le
tableau. Une heuristique de commodité décidait de l'EXISTENCE d'une affordance.

**Règle.** Chaque `<th>` d'un tableau `data-filterable` reçoit sa facette et son tri. La
cardinalité ne décide que de la **forme** du panneau, publiée en `data-tf-forme` :

| Forme | Quand | Ce que voit le lecteur |
|---|---|---|
| `liste` | ≤ 15 valeurs distinctes | la liste de cases, telle quelle |
| `recherche` | > 15 valeurs distinctes | la liste **et** une note « N valeurs distinctes — chercher puis Tous » |
| `unique` | une seule valeur | la case unique **et** la note qui le dit |

**La seule sortie est déclarée** : `data-filter-col="off"` **avec** `data-filter-reason="…"` sur
le `<th>`. Le motif est lisible à l'exécution (`api.exemptions`) et l'oracle refuse une exemption
muette. Exemple admis : une clé technique à valeur unique par ligne, que la recherche de page
couvre déjà.

## G9 — un en-tête DÉFINIT sa colonne (TF-0777, 02/09)

Une facette et un tri ne valent que ce que vaut la colonne qu'ils manipulent. Sur le livrable
fautif, aucun en-tête n'était défini et l'infobulle disait « Trier par » : une hypothèse en
**euros par an** s'est fait multiplier par un nombre de séjours sans que personne puisse le voir.
La définition — ce que la colonne mesure, son **unité**, sa source — vit dans un dictionnaire de
colonnes ([`dictionnaire-de-colonnes.md`](dictionnaire-de-colonnes.md)) dont en-têtes, infobulles
et glossaire **dérivent**. Contrôle statique : `L27` de `check_html.py`.

## G8 — une facette temporelle se lit dans l'ordre du temps (TF-0781, 02/09)

`Object.keys(valeurs).sort()` rangeait les valeurs par ordre **alphabétique** : le panneau
« Mois » d'un livrable affichait « août 2025, avr. 2026, déc. 2025, janv. 2026 » — un ordre qui
n'existe pour personne. Les valeurs d'une facette sont désormais ordonnées **sur leur clé**
(`data-v` d'abord), avec le même comparateur que le tri : nombres en nombres, dates ISO en ordre
chronologique, vides en fin de liste.

Corollaire pour l'émetteur : **une colonne temporelle sans `data-v` n'est pas ordonnable**, ni
pour son tri ni pour sa facette. C'est la règle L28 du socle (« le temps s'affiche comme du
temps »), et `check_html.py` la juge.

## L'état se lit et se rejoue (TF-0769, 02/09)

`data-tf-ready` faisait rendre `null` à tout second `init`, et la sélection vivait dans une
fermeture inaccessible. Une page qui **re-rend ses tableaux** perdait donc ses filtres ; la seule
parade était de relire les cases décochées dans le DOM et de les rejouer par des événements
`change` — code qu'une console livrée a effectivement dû écrire (`relever` / `restaurer`).

L'instance expose désormais :

| Appel | Effet |
|---|---|
| `api.etat()` | `{ version: 1, colonnes: { "<intitulé>": { exclues: [...] } } }` — **les valeurs exclues seulement**, nommées par intitulé de colonne (stable si les colonnes bougent) |
| `api.restaurer(etat)` | rejoue une sélection sur l'instance en place |
| `api.rafraichir()` | relit les lignes et les valeurs après un re-rendu, reconstruit les panneaux **sur la sélection conservée** |
| `api.detruire()` | retire déclencheurs, panneaux, état vide et écouteurs ; la table redevient nue |
| `init(table)` (2ᵉ appel) | rend **l'instance existante**, plus `null` |
| `init(table, { etat })` | reconstruit et rejoue l'état fourni |

```js
var api = DigitAITableFilters.init(t);
var etat = api.etat();          // avant le re-rendu
rendreLesLignes();              // la page recalcule son <tbody>
api.rafraichir();               // les filtres survivent, sans relire le DOM
```

L'intitulé de colonne est **figé au premier passage** dans `data-col` sur le `<th>` : après
`init`, le `textContent` d'un en-tête contient le déclencheur et le panneau, et le relire donnerait
une autre clé (défaut trouvé en écrivant la fixture, pas en la lisant).

## Périmètre — quand la règle s'applique

**Obligatoire** dès que les deux conditions sont réunies :

1. Le tableau porte **≥ 8 lignes de données** (`<tbody> > <tr>`).
2. Il porte un `<thead>` avec au moins un `<th>` — **toutes** ses colonnes reçoivent alors leur
   facette (G7). La répétition des valeurs ne conditionne plus l'existence d'une facette, seulement
   sa forme : c'est le défaut TF-0782, où la colonne clé était la seule à ne pas en avoir.

🟡 **Recommandé** en dessous de 8 lignes si le tableau est amené à croître (résultats de run,
journal, inventaire).
⚪ **Hors périmètre** : tableaux de mise en page et tableaux de 2 lignes descriptives. Un tableau
dont toutes les colonnes sont à valeurs uniques n'est PAS hors périmètre — il se trie, et chaque
colonne qui ne mérite pas sa facette la refuse **avec son motif** (G7).

**Exemption explicite** : un tableau en périmètre qui ne doit pas être filtré porte
`data-filterable="off"` **et** `data-filterable-reason="…"`. Sans motif, c'est un échec — pas
une exemption. L'oracle rend alors `SKIP` sur ce tableau et le motif figure au journal.

## Câblage

Le composant se construit tout seul à partir du tableau : le HTML ne porte que le marquage.

```html
<table id="runs" data-filterable>
  <thead>
    <tr><th>Suite</th><th>Statut</th><th>Durée</th>
        <th data-filter-col="off" data-filter-reason="identifiant unique par ligne : la recherche de page le couvre">Ticket</th></tr>
  </thead>
  <tbody>
    <tr><td>auth</td><td>Échec</td><td data-v="1.2">1,2 s</td><td>T-4412</td></tr>
    <!-- … -->
  </tbody>
</table>
<div class="tf-count" data-tf-count-for="runs" aria-live="polite"></div>

<script src="table-filters.js"></script>
<script>DigitAITableFilters.init(document.getElementById('runs'));</script>
```

`init()` injecte un déclencheur dans CHAQUE `<th>` et construit les panneaux ; il arme aussi le
tri. Pour exclure une colonne : `data-filter-col="off"` **+ `data-filter-reason`** ; pour exclure
son tri seul : `data-sort-col="off"`. `data-v` sur les cellules porte la valeur d'ordre.

CSS : adapter aux tokens du livrable (voir `charte-et-tokens.md`), aucun hex en dur.

```css
.tf-btn    { border:0; background:none; cursor:pointer; font:inherit; color:var(--muted); }
.tf-btn[aria-expanded="true"], .tf-btn.tf-on { color:var(--accent); }
.tf-panel  { position:absolute; z-index:10; background:var(--surface);
             border:1px solid var(--line); border-radius:var(--r-sm); padding:8px; }
.tf-panel[hidden] { display:none; }
.tf-opts   { max-height:220px; overflow-y:auto; }
.tf-count  { margin-top:4px; font-size:.72rem; color:var(--muted); min-height:1em; }
.tf-count.zero { color:var(--red); }
.tf-forme-note { margin:0 0 8px; color:var(--muted); font-size:.78rem; font-style:italic; }
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

## Checklist de l'oracle — G1 à G9

| # | Contrôle | Sévérité |
|---|---|---|
| **G1** | Tout tableau en périmètre porte `data-filterable`, ou une exemption `data-filterable="off"` **avec motif** | bloquant |
| **G2** | L'asset `table-filters.js` est référencé (balise `<script src>` ou code inline exposant `DigitAITableFilters`) | bloquant |
| **G3** | Chaque tableau `data-filterable` est initialisé (appel `init()` le désignant, ou `initAll()`) | bloquant |
| **G4** | Chaque tableau `data-filterable` a un `id` et un `<thead>` porteur de `<th>` — prérequis du composant | bloquant |
| **G5** | Un compteur `data-tf-count-for` avec `aria-live` existe pour chaque tableau `data-filterable` | bloquant |
| **G6** | Une règle `@media print` réaffiche les lignes masquées (`tr[data-tf-hidden]`) | bloquant |
| **G7** | Chaque `<th>` porte sa facette, ou une exemption `data-filter-col="off"` **avec** `data-filter-reason` — la cardinalité ne décide que de la forme (`data-tf-forme`) | bloquant |
| **G8** | Toute colonne ordonnée (temps, paliers, montants formatés) porte une valeur d'ordre `data-v` sur ses cellules — sans elle, ni le tri ni la facette ne peuvent être justes | bloquant |
| **G9** | Sur une page de données, chaque `<th>` porte sa définition (`data-definition`, `title` ou lien de glossaire) — définition, **unité**, source ; source unique : le dictionnaire de colonnes | bloquant |

**Ce que l'oracle de câblage ne juge pas** (`non_juge`, déclaré à chaque exécution) : le
comportement d'exécution réel (ordre rendu par le tri, ordre des valeurs de facette,
construction des panneaux, bascules Tous/Aucun, recherche, combinaison ET, survie de l'état à un
re-rendu). Il exige un navigateur, et c'est là que vivent les quatre défauts du 02/09 : le
marquage était juste, le comportement était faux. Deux voies, cumulatives :
`render_page.py --matrice-etats` pour ce qui se voit (débordement d'un panneau, état vide muet),
et les cas Playwright du banc (`self_test.py`, `run_filtres_runtime`) pour ce qui se mesure — la
fixture calcule elle-même l'ordre qu'aurait rendu l'ancienne lecture et le banc exige qu'il
DIFFÈRE de l'ordre rendu.
