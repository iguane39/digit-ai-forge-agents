# Composant — Recherche dans le document + compteur d'occurrences

Composant interactif **optionnel** du socle, pour les livrables **parcourus** et longs
(catalogues, référentiels, fiches multi-sections). Il surligne les correspondances et
affiche un **nombre d'occurrences mis à jour à chaque frappe**, insensible aux accents.

Asset : [`assets/find-in-page.js`](../assets/find-in-page.js).

## Quand l'utiliser

- 🟡 Document long ou catalogue qu'on lit à l'écran et qu'on doit fouiller (un référentiel
  d'ADR, une cartographie, une liste de cas d'usage).
- ⚪ Inutile sur une fiche courte tenant en un écran.

## Câblage

Trois éléments — un champ, un compteur (`aria-live="polite"`), un conteneur de contenu :

```html
<div class="find-bar">
  <input id="find" type="text" placeholder="Rechercher dans le document…">
  <div id="findCount" class="find-count" aria-live="polite"></div>
</div>
<div id="content"><!-- contenu à fouiller --></div>

<script src="find-in-page.js"></script>
<script>
  DigitAIFindInPage.init(
    document.getElementById('find'),
    document.getElementById('content'),
    document.getElementById('findCount')
  );
</script>
```

CSS (adapter aux tokens du livrable — voir `charte-et-tokens.md`) :

```css
mark.find-hit { background: var(--amber-fill, #fde9c8); color: inherit; border-radius: 2px;
                display: inline; padding: 0; margin: 0; }
.find-bar     { display: flex; flex-direction: column; gap: 2px; }
.find-count   { margin-top: 4px; font-size: .72rem; color: var(--muted); min-height: 1em; }
.find-count.zero { color: #c0392b; }
```

🔴 **Trois classes disjointes, et c'est le point.** Le surlignage porte `find-hit`, le
compteur `find-count`, le conteneur ce que le livrable veut — jamais la même que le
surlignage. Quand le conteneur et le `<mark>` partagent `find`, la règle de mise en page du
conteneur (`display: flex`) s'applique au surlignage et le transforme en boîte de bloc :
chercher `clic` dans « clics » rend « clic », puis « s » **606 px plus loin** (défaut mesuré
en production). Déclarer `mark.find { … }` ne suffit pas à s'en protéger : une règle ne gagne
que sur les propriétés qu'elle écrit, et `display` n'y était pas. La séparation des noms
supprime la classe de défaut au lieu de la rattraper. Contrôle mécanique : `L5`
(cf. [lisibilite.md](lisibilite.md)).

## Comportement

- Champ vide → compteur vide.
- Correspondances → `« 3 occurrences »` / `« 1 occurrence »` (accord automatique).
- Aucune correspondance → `« Aucune occurrence »` (classe `zero`, rouge sobre).
- Insensible aux accents : `reseau` trouve aussi `réseau` et `RÉSEAU`.
- `min-height: 1em` sur `.find-count` évite le saut de mise en page quand le texte apparaît.

## Contenu qui change (panneau dynamique)

Si le conteneur recharge son contenu (ex. un panneau de lecture qui ouvre un autre
document), passer une fonction `getHTML` qui renvoie le HTML pristine courant, et vider
le champ + le compteur au changement :

```js
var finder = DigitAIFindInPage.init(input, content, counter, function () {
  return renderCourant(); // renvoie le HTML à jour du document affiché
});
// à l'ouverture d'un nouveau document :
input.value = ''; counter.textContent = ''; counter.classList.remove('zero');
```

## Accessibilité & robustesse

- 🔴 Le compteur porte `aria-live="polite"` pour être annoncé aux lecteurs d'écran.
- 🔴 **Viewer-only** : à l'export PDF (WeasyPrint), le JS ne s'exécute pas et le surlignage
  n'apparaît pas. C'est une aide de lecture à l'écran, jamais un porteur de contenu : si la
  même information doit exister en PDF, prévoir un équivalent statique (cf. bonnes-pratiques §6, §7).
- Le surlignage ignore les nœuds `MARK`, `SCRIPT`, `STYLE` (pas de double-surlignage ni de
  corruption de scripts).
