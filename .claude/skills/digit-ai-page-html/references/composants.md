# Composants réutilisables — socle page HTML Digit-AI

Composants chartés prêts à coller, **tous en tokens `:root`** (cf. `charte-et-tokens.md`).
Extraits de livrables réels puis filtrés par la charte et **validés par les oracles**
(`check_html.py` PASS + `render_page.py` V1–V7 PASS, 3 breakpoints). N'utiliser que ces
versions : les variantes d'origine violaient souvent la charte (hex en dur, couleur seule,
barre invisible — cf. `anti-patterns.md`).

Chaque composant porte un tier : 🔴 Obligatoire si présent · 🟡 Recommandé · ⚪ Optionnel.

---

## 1 — Grille de KPI 🟡

Chiffres-clés en tête de livrable. Toujours **label + valeur (+ hint)** ; jamais une valeur
nue, jamais le sens porté par la seule couleur.

```html
<div class="kpis">
  <div class="kpi"><span class="kpi-label">Conformité</span>
    <span class="kpi-value">87 %</span><span class="kpi-hint">32 / 37 ADR</span></div>
</div>
```
```css
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.kpi-label { font-family: var(--sans); color: var(--muted); font-size: .8rem; }
.kpi-value { font-family: var(--head); font-weight: 800; font-size: 1.6rem; color: var(--ink); }
.kpi-hint { color: var(--muted); font-size: .75rem; }   /* --muted, pas --faint : contraste AA */
@media (max-width: 1020px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
```

## 2 — Badge de statut 🔴 (dès qu'un état est affiché)

Texte en `--ink` (contraste garanti) ; la couleur sémantique est portée par **la pastille +
la bordure + le libellé**, jamais par le texte coloré seul (échoue le contraste AA sur fond
clair, et « couleur seule » viole WCAG 1.4.1).

```html
<span class="badge ok">Adopter</span>
<span class="badge part">Adapter</span>
<span class="badge info">Info</span>
```
```css
.badge { display: inline-flex; align-items: center; gap: 6px; font-size: .78rem; font-weight: 600;
  color: var(--ink); padding: 2px 10px; border-radius: 999px; border: 1px solid var(--line); }
.badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--_dot, var(--muted)); }
.badge.ok   { --_dot: var(--green); background: var(--green-fill); border-color: var(--green-line); }
.badge.part { --_dot: var(--amber); background: var(--amber-fill); border-color: var(--amber-line); }
.badge.info { --_dot: var(--teal);  background: var(--teal-fill);  border-color: var(--teal-line); }
```

## 3 — Barre de progression 🟡

`display: inline-block` **obligatoire** : une barre sur `<span>` inline ignore `height`/`width`
et devient invisible. Largeur pilotée par un token local `--val`.

```html
<span class="bar" role="img" aria-label="Score 87 %"><span class="fill" style="--val:87%"></span></span>
```
```css
.bar { display: inline-block; vertical-align: middle; background: var(--line); border-radius: 999px; height: 8px; overflow: hidden; min-width: 120px; }
.fill { display: block; height: 100%; width: var(--val); background: var(--blue); border-radius: 999px; }
```

## 4 — Légende 🟡

Accompagne tout code couleur : **swatch + libellé texte** (la couleur ne porte jamais seule).

```html
<ul class="legend">
  <li class="leg-item"><span class="leg-swatch" style="background:var(--green-fill);border-color:var(--green-line)"></span> Conforme</li>
</ul>
```
```css
.legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0; padding: 0; list-style: none; }
.leg-item { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: .85rem; }
.leg-swatch { width: 12px; height: 12px; border-radius: 4px; border: 1px solid var(--line); }
```

## 5 — Barre d'outils avec compteur de résultats ⚪ (catalogues/référentiels)

Le compteur en `aria-live="polite"` annonce le résultat du filtrage aux lecteurs d'écran.
Viewer-only (masqué à l'impression).

```html
<div class="toolbar">
  <label for="q" class="count">Filtrer :</label>
  <input type="search" id="q" aria-label="Filtrer">
  <span class="count" id="count" aria-live="polite" role="status"></span>
</div>
```
```css
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.toolbar input[type="search"] { font-family: var(--sans); padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface); color: var(--ink); }
.toolbar input:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
.count { color: var(--muted); font-size: .85rem; }
@media print { .toolbar { display: none; } }
```
```js
// escapeHtml OBLIGATOIRE avant toute réinjection de la saisie (cf. bonnes-pratiques §7)
const escapeHtml = s => String(s).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
```

## 6 — Tableau de données repliable en cartes 🔴 (dès qu'un `<table>` est consulté sur mobile)

Sous 640 px, un tableau large dépasse le viewport (bloquant V1 de l'oracle, **même dans un
conteneur `overflow-x:auto`**). Le repli en cartes empilées via `data-label` est la parade
robuste. Un `thead` **sticky** ne se justifie que dans un conteneur à hauteur bornée ; hors de
ce cas il se peint par-dessus la première ligne — le laisser statique.

**Le seuil dépend du CONTENU, pas d'un pixel fixe (RA-2 — la deuxième remarque d'un lot de retours, mesurée sur livrable réel le 13/08)** :
un tableau de 9 colonnes portant de la prose déborde encore à 1 200 px (V1 mesuré : bord droit
à 1 173 px pour un viewport de 1 100 px). Règle de calibrage : ~130 px de largeur utile par
colonne de prose — un tableau de N colonnes textuelles se replie sous `N × 130 px` environ, et
640 px n'est le bon seuil que jusqu'à 4-5 colonnes. **Palier intermédiaire obligatoire** entre
le seuil de repli et la largeur où le tableau tient à l'aise : `overflow-wrap: anywhere` sur
les cellules (mot longs cassés, pas de débordement). La preuve reste `render_page.py` aux
largeurs cibles — jamais le seuil sur parole.

**LA RÈGLE EST DÉSORMAIS MÉCANISÉE, PARCE QU'ÉCRITE EN PROSE ELLE ÉTAIT RETRADUITE ET MAL
RETRADUITE (TF-0558, 24/08/2026).** Le calibrage ci-dessus restait à la charge de chaque émetteur,
et l'exemple de code figeait `640 px` — deux textes qui se contredisent dans la même section. Coût
mesuré sur un livrable réel : repli réglé à 900 px alors qu'un tableau de 8 colonnes débordait
jusque vers 1 400 px (bord droit à 1 308 px pour un viewport de 1 280) — **16 débordements
bloquants, invisibles cinq jours**. Le même 900 px était figé en dur dans un gabarit de la factory :
tout projet qui instanciait la famille le reproduisait.

*Trois lignes de CSS remplacent la prose*, et aucun émetteur n'a plus rien à calibrer : le nombre
de colonnes se LIT dans le marquage, et le palier se déclenche seul.

```css
/* Le repli anticipé se déclenche sur le NOMBRE DE COLONNES, lu dans le marquage — jamais sur un
   pixel choisi à la main. Trois paliers, calibrés sur la mesure et non sur la règle du pouce :
   5 colonnes sous 1 020 px, 7 sous 1 400, 9 sous 1 700. Le « ~130 px par colonne » de l'énoncé
   ci-dessus est OPTIMISTE — la mesure du 24/08 donne ~165 px pour des colonnes de prose (huit
   colonnes débordaient encore à 1 308 px), et c'est ce chiffre-là qui fixe les paliers.

   LE PRÉFIXE EST RÉPÉTÉ, ET C'EST VOULU. Un premier jet posait un jeton (`--replier: 1`) en
   espérant qu'il déclenche le bloc : une propriété personnalisée ne déclenche RIEN par elle-même,
   c'est une valeur que quelque chose doit lire. La prescription aurait été une affordance non
   câblée — exactement ce que la première loi transverse interdit, écrite dans le document qui
   l'enseigne. La verbosité est le prix du fait que ça marche.

   `box-sizing: border-box` N'EST PAS DÉCORATIF : une cellule en `width: 100%` avec du
   remplissage déborde de la valeur de ce remplissage. Mesuré en écrivant cette prescription —
   bord droit à 1 300 px pour un viewport de 1 280, soit exactement les 2 × 10 px de padding.
   Le repli s'appliquait, et il débordait quand même : une parade qui reproduit le défaut
   qu'elle corrige. */
@media (max-width: 1020px) {
  .table-wrap:has(th:nth-child(5)) thead { display: none; }
  .table-wrap:has(th:nth-child(5)) tr,
  .table-wrap:has(th:nth-child(5)) td { display: block; width: 100%; box-sizing: border-box; }
  .table-wrap:has(th:nth-child(5)) tbody td { overflow-wrap: anywhere; }
  .table-wrap:has(th:nth-child(5)) tbody td::before { content: attr(data-label); font-weight: 700; }
}
@media (max-width: 1400px) {
  .table-wrap:has(th:nth-child(7)) thead { display: none; }
  .table-wrap:has(th:nth-child(7)) tr,
  .table-wrap:has(th:nth-child(7)) td { display: block; width: 100%; box-sizing: border-box; }
  .table-wrap:has(th:nth-child(7)) tbody td { overflow-wrap: anywhere; }
  .table-wrap:has(th:nth-child(7)) tbody td::before { content: attr(data-label); font-weight: 700; }
}
@media (max-width: 1700px) {
  .table-wrap:has(th:nth-child(9)) thead { display: none; }
  .table-wrap:has(th:nth-child(9)) tr,
  .table-wrap:has(th:nth-child(9)) td { display: block; width: 100%; box-sizing: border-box; }
  .table-wrap:has(th:nth-child(9)) tbody td { overflow-wrap: anywhere; }
  .table-wrap:has(th:nth-child(9)) tbody td::before { content: attr(data-label); font-weight: 700; }
}
```

**Mesure du 24/08** : le livrable qui rendait 16 débordements bloquants repasse à **0 bloquant**
sans qu'aucune classe soit posée à la main. Le tableau doit vivre dans un `.table-wrap` et ses
cellules porter `data-label` — deux exigences que le boilerplate du socle pose déjà. *Une règle de calibrage écrite en prose est une règle que chaque projet retraduit,
et une retraduction sur trois se trompe — ici elle s'est trompée sur celui qui l'avait écrite.*

```html
<table>
  <caption>Inventaire</caption>
  <thead><tr><th scope="col">ID</th><th scope="col">Nom</th><th scope="col">Verdict</th></tr></thead>
  <tbody>
    <tr><td data-label="ID">B2</td><td data-label="Nom">Grille de KPI</td><td data-label="Verdict"><span class="badge ok">Adopter</span></td></tr>
  </tbody>
</table>
```
```css
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
caption { text-align: left; color: var(--muted); font-size: .85rem; padding: 6px 0; }
thead th { background: var(--surface); text-align: left; font-family: var(--head); font-weight: 700; color: var(--ink); border-bottom: 2px solid var(--line); padding: 10px 12px; }
tbody td { padding: 10px 12px; border-bottom: 1px solid var(--line); }
@media (max-width: 640px) {
  /* TF-0499 (22/08/2026) : `table` ne passe JAMAIS en display:block. Une <caption> dont le
     tableau parent est en block recoit une boite de tableau anonyme qui se reduit au contenu :
     mesure a 390 px sur une legende de 108 caracteres, elle rendait 70 x 192 px — une colonne
     d'un mot — contre 366 x 42 px une fois la regle alignee. Le boilerplate du skill ne touchait
     deja que thead/tr/td : c'est LUI qui fait foi, et cet extrait ne le suivait pas. Constate sur
     livrable reel : quinze tableaux touches, jamais vus par aucun oracle. */
  tr, td { display: block; width: 100%; box-sizing: border-box; }
  thead { display: none; }
  tbody tr { border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 10px; margin: 10px 0; }
  tbody td { border: none; padding: 5px 0; display: flex; justify-content: space-between; gap: 12px; }
  tbody td::before { content: attr(data-label); font-weight: 700; color: var(--muted); font-size: .78rem; }
}
```

---

### 6 bis — Largeurs de colonnes : un tableau de données n'est pas une grille régulière 🔴

**Retour humain du 21/08/2026** sur un livrable remis : « des colonnes avec uniquement un ID
n'ont pas besoin d'une largeur aussi importante, et les colonnes avec des textes ont besoin de
plus de largeur ». Mesure sur un tableau d'actions à 4 colonnes en `table-layout: fixed` sans
largeurs déclarées : la colonne `#` — contenu le plus large, **un caractère** — recevait **25 %**
de la largeur. Après dérivation depuis le contenu : 4,1 %, et les colonnes de texte passent de
25 % chacune à 25 / 43 / 27 %.

**La voie standard est `<colgroup>`**, et elle est utilisable depuis TF-0444 : `colgroup` et
`col` étaient comptés par V4 comme des boîtes recouvrant `thead` et `tbody` — deux faux
positifs BLOQUANTS par tableau, 50 sur un livrable réel — ce qui poussait les runs à porter les
largeurs sur les `<th>`, contournement à refaire à chaque fois. L'oracle les exclut désormais.

**Heuristique**, vérifiée sur les 25 tableaux d'une même page :

1. `base` = max(longueur de l'en-tête, **90e centile** des longueurs de cellule de la colonne) —
   le centile plutôt que le maximum, sinon une seule cellule bavarde emporte la colonne ;
2. `poids` = `base ^ 0,6` — le texte se **replie**, il ne s'étale pas linéairement : une colonne
   qui contient trois fois plus de caractères n'a pas besoin de trois fois plus de largeur ;
3. plancher **4 %**, plafond **42 %**, puis renormalisation à 100 % ;
4. une colonne dont le contenu le plus large tient en **12 caractères** passe en
   `white-space: nowrap` — elle ne se repliera jamais, autant lui garantir sa ligne.

```html
<table class="repli-cartes">
  <colgroup>
    <col style="width:4%">    <!-- # : un caractère -->
    <col style="width:25%">   <!-- Constat -->
    <col style="width:43%">   <!-- Remédiation : la plus bavarde -->
    <col style="width:28%">   <!-- Porteur -->
  </colgroup>
  <thead><tr><th scope="col">#</th><th scope="col">Constat</th><th scope="col">Remédiation</th><th scope="col">Porteur</th></tr></thead>
  <tbody>
    <tr><td data-label="#" class="serre">1</td><td data-label="Constat">…</td><td data-label="Remédiation">…</td><td data-label="Porteur">…</td></tr>
  </tbody>
</table>
```
```css
table { table-layout: fixed; }
td.serre, th.serre { white-space: nowrap; }   /* colonnes de ≤ 12 caractères */
```

**Ce que l'heuristique ne remplace pas** : la mesure. Les pourcentages se dérivent du contenu
RÉEL du tableau, pas d'un gabarit — et le résultat se juge par `render_page.py` aux largeurs
cibles, comme le seuil de repli ci-dessus. Un tableau dont une colonne tombe sous le plancher
après renormalisation est un tableau qui a trop de colonnes : le replier, ou en retirer une.

## Note d'usage

- **Recherche in-page** (surlignage insensible aux accents) : composant dédié déjà fourni,
  voir [composant-recherche.md](composant-recherche.md).
- Tous les composants ci-dessus supposent le bloc `:root` du boilerplate. Après intégration,
  **relancer les oracles** (`check_html.py` puis `render_page.py`) : ne jamais juger un rendu
  depuis le seul code (cf. `zero-defaut-visuel.md`).


## 8 — KPI cliquables filtrant une liste 🔴 (standard H3, dès que des KPI comptent des lignes affichées)

Asset : [`assets/kpi-filter.js`](../assets/kpi-filter.js) (delta n°6, 14/08). Un KPI qui
compte des éléments affichés les FILTRE au clic (re-clic = tout) ; un KPI d'éléments hors
page ne se branche pas — il reste un `div` et dit où vivent ses éléments. Contrat de
marquage : `<button data-kpi-filtre data-kpi-table="id" data-kpi-attr="statut"
data-kpi-valeur="candidat">` + `data-<attr>` sur chaque ligne. Masquage par
`data-kpi-cache`, composable avec la recherche et les facettes D-12 (visibilité dérivée).
La règle **L13** de `check_html` exige la recherche statique dès 8 lignes et signale les
KPI non cliquables au-dessus d'une liste. Modèles éprouvés : `todo/TODO.html` (pilot,
oracle 13/13) et le dashboard forge-tests (tuiles).

## 9 — Onglets accessibles 🔴 (dès qu'un rapport se lit par onglets)

Asset : [`assets/tabs.js`](../assets/tabs.js) (TF-0425, lot Produit-05 20260820a). Un rapport à
onglets réécrivait ~50 lignes de JS à chaque livrable ; le composant porte les rôles
WAI-ARIA, les flèches (cycle), Home/End, le `#hash` qui ouvre le bon onglet (cible = panneau
**ou** élément dans un panneau — les liens de sommaire inter-onglets marchent), et
l'impression de **tous** les panneaux. Contrat de marquage :

```html
<div class="tabs" data-tabs>
  <div role="tablist" aria-label="Chapitres">
    <button type="button" role="tab" id="tab-a" aria-controls="pan-a" aria-selected="true">Synthèse</button>
    <button type="button" role="tab" id="tab-b" aria-controls="pan-b" aria-selected="false" tabindex="-1">Constats</button>
  </div>
  <section role="tabpanel" id="pan-a" aria-labelledby="tab-a">…</section>
  <section role="tabpanel" id="pan-b" aria-labelledby="tab-b" hidden>…</section>
</div>
```
```css
[role="tablist"] { display: flex; gap: 4px; border-bottom: 2px solid var(--line); }
[role="tab"] { font: inherit; font-family: var(--head); font-weight: 700; color: var(--muted); background: none; border: none; border-bottom: 3px solid transparent; padding: 10px 14px; cursor: pointer; }
[role="tab"][aria-selected="true"] { color: var(--blue); border-bottom-color: var(--blue); }
[role="tab"]:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
[role="tabpanel"] { padding-top: 16px; }
@media print { [role="tablist"] { display: none; } [role="tabpanel"][hidden] { display: block; } }
```
Initialisation : `DigitAITabs.initAll()`. Règle **L16** de `check_html` : tout `role=tab` vise un
`tabpanel` résolu, tout panneau est étiqueté par son onglet, les panneaux masqués sont
réaffichés sous `@media print`. Revue de lecture : `render_page.py --sections "[role=tabpanel]"`
capture chaque panneau.

## 10 — Ligne de tableau dépliable 🟡 (détail à la demande sans quitter le tableau)

Asset : [`assets/table-detail.js`](../assets/table-detail.js) (TF-0432, lot Produit-05
20260820b). La convention `tr[data-detail]` existait côté **consommateur** (`table-filters.js`
l'exclut du comptage et la fait voyager avec sa ligne mère) sans composant pour la
**produire** — 99 lignes dépliables écrites à la main sur un seul livrable. Contrat :

```html
<tr><td><button type="button" class="td-btn" aria-expanded="false" aria-controls="det-1">›</button> L1</td><td>ko</td><td>délai</td></tr>
<tr data-detail id="det-1" hidden><td colspan="3">Le contrôle a échoué à 1 280 px : délai de 3,2 s mesuré le 20/08.</td></tr>
```
```css
.td-btn { font: inherit; color: var(--blue); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); width: 24px; height: 24px; cursor: pointer; transition: transform .15s; }
.td-btn[aria-expanded="true"] { transform: rotate(90deg); }
tr[data-detail] td { background: var(--bg, #f6f8fc); border-bottom: 1px solid var(--line); padding: 12px 16px 12px 44px; }
@media print { tr[data-detail][hidden] { display: table-row; } .td-btn { display: none; } }
```
Initialisation : `DigitAITableDetail.initAll()` ; un `#hash` qui vise un élément d'une ligne
fermée l'ouvre. Le chevron est `›` (U+203A), présent dans toute pile de repli (TF-0435) — jamais
`\25B6`. Règle **L17** de `check_html` : toute ligne de détail a un `id`, un bouton qui la vise,
un `colspan` égal au nombre de colonnes, et une règle `@media print` qui la déplie. Avec
`table-filters.js` : la ligne de détail suit le filtrage de sa ligne mère.

## 11 — Gabarits de chapitre : `.chap.lire` et `.chap.duo` 🔴 (règle L2 corrigée, TF-0421)

Portés par le boilerplate. La mesure de lecture se règle sur le **conteneur**, jamais sur le
paragraphe (`width: min(75ch, 100%)` sur `.prose` laissait 60 % d'un écran de 1 800 px vide
— vert à L2 tel qu'il était écrit, refusé par le client). `section.chap.lire` : conteneur de
lecture de ~1 080 px centré, le texte le remplit. `section.chap.duo` : grille 7/5 texte +
encart utile (KPI, légende, figure), repli sous 1 100 px. `render_page.py` L2 juge désormais
quelle que soit la propriété CSS qui bride, et 1920 px est dans les largeurs par défaut.

## 12 — Lecteur de source embarquée 🔴 (dès qu'un livrable CITE un document du dépôt)

`assets/source-reader.js` — **le composant que la règle A1 rendait nécessaire, et qui n'existait
pas.** A1 exige un fichier autoportant : un rapport qui renvoie à des fichiers du dépôt **perd ses
sources dès qu'il part par courriel**. La conséquence logique est d'EMBARQUER les documents cités —
et un `<pre>` de 67 Ko de Markdown est illisible. Faute de composant, un livrable a dû écrire à la
main ~130 lignes de convertisseur, une bascule à deux vues, et un rendu différé.

```html
<details class="src" data-src-format="markdown">
  <summary>Note de cadrage — 1,2 Ko</summary>
  <script type="text/plain" class="src-brut">…le document, tel quel…</script>
</details>
<script>/* source-reader.js collé ici : une page autoportante n'a pas de fichier voisin */</script>
<script>DigitAISourceReader.init();</script>
```

**Trois partis pris, tous payés par un défaut réel.**

| Parti pris | Pourquoi | Ce qu'il évite |
|---|---|---|
| **Rendu DIFFÉRÉ** au premier dépliage | douze documents rendus d'avance faisaient passer le DOM de 7 000 à **plus de 25 000 nœuds** | l'échec de l'oracle de performance, découvert par essai sur un livrable |
| **Liens NON cliquables**, cible en infobulle | ils visent le dépôt, donc rien depuis la page | *un lien mort ment davantage qu'une absence de lien* |
| Document dans un `<script type="text/plain">` | le seul emplacement où du Markdown brut n'est ni interprété comme du HTML, ni ré-échappé | un `<pre>` caché compterait dans le DOM dès le chargement — ce que le rendu différé cherche à éviter |

**Sous-ensemble de Markdown volontairement borné** : titres (un `#` embarqué devient `h2`, la page
hôte garde son `h1`), tableaux (dans une zone qui défile horizontalement — un tableau large ne doit
pas faire déborder la page hôte, V1 est bloquant), listes, blocs de code, citations, séparateurs,
gras/italique/code en ligne. **Ce qui n'est pas reconnu sort en paragraphe, jamais en HTML brut** :
un document cité est une DONNÉE, et une donnée ne s'exécute pas.

**Deux pièges d'écriture, notés parce qu'ils se repaient sinon.** (1) Le composant est destiné à
être **collé** dans la page : toute séquence de fermeture de script, *même en commentaire*, fermerait
le bloc de la page hôte — elles sont écrites échappées dans le fichier. (2) Le jeton qui protège le
code en ligne est construit par `String.fromCharCode`, jamais écrit en littéral : un premier jet
employait « espace chiffre espace », et la phrase « il y a 3 cas » devenait un `<code>` vide.

Fixture de référence : `fixtures/src-lecteur-de-source.html` — passe check_html (A1 comprise) et la
matrice d'états de `render_page.py`, qui déplie le document et mesure le rendu obtenu.

## Filtres de colonne — compléments (TF-0429 / TF-0430 / TF-0431)

`table-filters.js` : `init(table, { apresFiltrage(table, visibles, total) })` est appelé à la
fin de **chaque** filtrage (cases, Tous/Aucun, recherche) — et `instance.appliquer` est
enveloppable (les gestionnaires internes passent par l'instance). **État vide** fourni : un
filtre qui ne laisse rien insère une ligne `tr[data-tf-empty]` (libellé `data-tf-vide`
surchargeable) avec le bouton « Tout réafficher », retirée dès qu'une ligne revient. Le
**panneau choisit son côté** selon la place mesurée (`tf-droite`) et neutralise le rognage du
conteneur `overflow-x:auto` tant qu'il est ouvert (`data-tf-ouvert`), rétabli à la fermeture.
