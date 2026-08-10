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
@media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
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
  table, tbody, tr, td { display: block; width: 100%; }
  thead { display: none; }
  tbody tr { border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 10px; margin: 10px 0; }
  tbody td { border: none; padding: 5px 0; display: flex; justify-content: space-between; gap: 12px; }
  tbody td::before { content: attr(data-label); font-weight: 700; color: var(--muted); font-size: .78rem; }
}
```

---

## Note d'usage

- **Recherche in-page** (surlignage insensible aux accents) : composant dédié déjà fourni,
  voir [composant-recherche.md](composant-recherche.md).
- Tous les composants ci-dessus supposent le bloc `:root` du boilerplate. Après intégration,
  **relancer les oracles** (`check_html.py` puis `render_page.py`) : ne jamais juger un rendu
  depuis le seul code (cf. `zero-defaut-visuel.md`).
