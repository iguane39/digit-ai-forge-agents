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
mark.find-hit { background: var(--amber-fill, #fde9c8); color: var(--ink, #1a1a1a);
                border-radius: 2px; display: inline; padding: 0; margin: 0; }
tspan.find-hit { fill: var(--amber-ink, #9a3412); text-decoration: underline; } /* texte d'un schéma SVG */
.find-bar     { display: flex; flex-direction: column; gap: 4px; }
.find-count   { margin-top: 4px; font-size: .72rem; color: var(--muted); min-height: 1em; }
.find-count.zero { color: #c0392b; }
```

🔴 **L'ENCRE SE POSE, ELLE NE S'HÉRITE PAS (TF-0557, 24/08/2026).** Cette prescription portait
`color: inherit`, et c'était un défaut latent que seul le croisement de deux composants du MÊME socle
révélait. Sur un badge à texte clair — le motif de pastille de ce socle, blanc sur bleu —, le
surlignage repeint le **fond** en ambre sans toucher au texte : blanc sur presque blanc, **ratio
mesuré 1,04:1**. Mesure du 19/08 sur un livrable réel : **21 constats de contraste BLOQUANTS** aux
quatre largeurs, et **uniquement en état de recherche active**.

*Pourquoi il a survécu si longtemps* : il faut une page qui porte les deux composants **et** une
recherche en cours pour qu'il apparaisse. Aucun des deux composants, jugé seul, n'est fautif — c'est
leur rencontre qui l'est, et une bibliothèque qui décrit ses pièces une par une ne voit jamais ces
défauts-là. L'encre est donc posée EXPLICITEMENT, avec un jeton qui bascule avec le fond en thème
sombre : le contraste tient des deux côtés.

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

🔴 **Le conteneur n'est jamais réécrit (TF-1340, 23/09/2026).** La recherche réaffectait
`container.innerHTML` à chaque frappe : les attributs survivaient, les écouteurs des autres
composants du socle (filtres de tableau, lignes dépliables, infobulles) non — mesuré au
navigateur, un bouton de filtre n'ouvrait plus son panneau après une recherche puis son
effacement. Sur l'exemple de référence de `digit-ai-schemas`, dont le champ de recherche vit
DANS la zone fouillée, la première frappe remplaçait le champ lui-même : la recherche ne
marchait qu'une fois. Le surlignage enveloppe désormais les nœuds texte trouvés, et la frappe
suivante les désenveloppe : la recherche lit le contenu **vivant** du conteneur.

Un conteneur qui recharge son contenu (ex. un panneau de lecture qui ouvre un autre document)
n'a donc plus rien à déclarer : remplacer le contenu, puis vider le champ et le compteur.
`getHTML` et `refresh()` restent acceptés pour les pages déjà câblées, sans effet :

```js
var finder = DigitAIFindInPage.init(input, content, counter);
// à l'ouverture d'un nouveau document :
input.value = ''; counter.textContent = ''; counter.classList.remove('zero');
```

## Accessibilité & robustesse

- 🔴 Le compteur porte `aria-live="polite"` pour être annoncé aux lecteurs d'écran.
- 🔴 **Viewer-only** : à l'export PDF (WeasyPrint), le JS ne s'exécute pas et le surlignage
  n'apparaît pas. C'est une aide de lecture à l'écran, jamais un porteur de contenu : si la
  même information doit exister en PDF, prévoir un équivalent statique (cf. bonnes-pratiques §6, §7).
- 🔴 **Dans un schéma SVG, le surlignage est un `<tspan>` (TF-1353, 24/09/2026)** : SVG ne peint
  pas un `<mark>` HTML, et le mot trouvé DISPARAISSAIT du schéma pendant la recherche (mesuré sur
  l'exemple de référence des schémas : 7 931 caractères peints, 7 844 pendant la recherche de
  « pipeline »). Le style du surlignage SVG passe par `fill`, pas par `background`.
- Le surlignage ignore les nœuds `MARK`, `SCRIPT`, `STYLE`, noms comparés sans casse — le
  `<style>` d'un schéma SVG compris (pas de double-surlignage ni de
  corruption de scripts).
