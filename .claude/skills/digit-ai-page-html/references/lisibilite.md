# Lisibilité — règles L1 à L12

Une page peut être **exacte, chartée, accessible et illisible**. La charte règle la forme,
`zero-defaut-visuel.md` règle le rendu ; ce document règle ce que le lecteur peut
effectivement *lire, comprendre et utiliser*.

Origine : dix défauts relevés par un lecteur humain sur un livrable réel le 09/08/2026 —
textes coupés en plein milieu, scores sans barème, tableaux non filtrables, sommaire muet,
liens sans destination annoncée, chapitres de données sans mode d'emploi. Aucun de ces
défauts n'était détecté par les oracles en place : tous étaient au vert.

Second apport, même jour : une **revue de lecture naïve** sur le livrable corrigé, qui a
rendu « oui, mais ». Elle a produit L11 (`null` affiché 22 fois), L3(c) (la colonne qui
classe les actions n'exposait pas sa formule — « je dois vous croire sur parole ») et L3(d)
(empreinte de grille et jetons de régime affichés nus). Enseignement à retenir : **le
premier tour de règles ne trouve que ce qu'il sait chercher.** Ce sont des lecteurs, pas des
règles, qui trouvent les règles suivantes.

## Deux régimes, jamais confondus

| Régime | Qui juge | Ce qu'il couvre |
|---|---|---|
| **Contrôle mécanique** | `scripts/check_html.py` | Ce qui se décide sans lire : présence, longueur, résolution d'ancre, seuil de lignes, valeur d'attribut. |
| **Revue de lecture** | un humain, ou l'orchestrateur d'un run | Ce qui suppose de comprendre : clarté du propos, pertinence, justesse du chapeau, qualité de l'exemple. |

**Règle absolue** : ce qui relève de la revue n'est jamais maquillé en contrôle. Un contrôle
qui prétendrait juger « la synthèse est-elle claire ? » rendrait un vert sans valeur et
éteindrait la vigilance. Chaque règle ci-dessous déclare explicitement ce qui est mécanisé
et ce qui ne l'est pas.

---

## L1 — Zéro texte tronqué

**Règle.** Aucun texte de la page ne se termine par une coupure. Un `…` en fin de segment
précédé d'un mot est une amputation : le lecteur voit qu'on lui cache la suite et n'a aucun
moyen de l'obtenir.

**Ce qui est autorisé.** Une ellipse *volontaire* — abréviation d'une énumération, citation
tronquée en connaissance de cause — portée par un élément marqué `data-ellipse-ok`. Le
marquage est la déclaration d'intention : sans lui, c'est un défaut.

**Le bon dispositif** n'est pas de couper mais de **stratifier** : une ligne courte visible,
le texte **intégral** dans le détail déplié (cf. L9). Couper le niveau 1 ET le niveau 2 est
le pire des cas — la page paraît courte et ne contient plus rien.

**Deuxième forme, plus sournoise : la ponctuation orpheline.** Un producteur insère un
élément **au milieu d'une phrase** — le nom d'un nœud, un badge, une valeur — cet élément est
stylé en bloc, et la ponctuation qui suivait se retrouve **seule en tête de ligne** :

```
Le blocage principal —
Optimisation / Pages À Fusionner (nœud 74)
. La fusion à opérer n'est pas un nettoyage marginal…
```

Le point est orphelin, la phrase est coupée en deux, et aucun contrôle de troncature ne le
voit : rien n'est tronqué, tout est là — mal assemblé. Le remède n'est pas typographique : il
faut **rendre la phrase entière** et articuler l'élément proprement (une phrase pour le
titre, une phrase pour le propos), pas déplacer un point.

**Contrôle mécanique.** `L1` — (a) tout `…` ou `...` terminant un nœud de texte, précédé d'un
caractère de mot, hors élément `data-ellipse-ok`, hors valeur d'attribut (les `placeholder`
de champ ne sont pas du contenu) ; (b) tout nœud de texte commençant par `. , ; : ! ?` quand
l'élément qui le précède est **de niveau bloc** selon le CSS de la page. Un élément inline
suivi d'une virgule est légitime, un élément en bloc ne l'est jamais.

**Revue de lecture.** Qu'un texte non tronqué soit pour autant compréhensible.

## L2 — Largeur de lecture pleine

**Règle.** La page occupe la largeur qu'on lui donne — et le **texte** occupe la largeur que
la page lui donne. Un livrable dense affiché dans 1 080 px sur un écran 1 920 abandonne 44 %
de la surface ; ses tableaux se replient, ses synthèses s'étranglent.

**La mesure de lecture est portée par le CONTENEUR, jamais par le paragraphe.** C'est la
correction d'une doctrine antérieure qui disait l'inverse (« deux largeurs : le conteneur
relatif, la prose bornée en `ch` ») et qui a produit exactement le défaut qu'elle prétendait
éviter : conteneur à 1 245 px, paragraphes bridés à 75 `ch` soit 606 px, **une moitié droite
vide** sur toute la synthèse et toutes les fiches de constat. Le contrôle statique passait au
vert, puisqu'il lisait le CSS du conteneur.

Si les lignes doivent être courtes, **rétrécir la colonne** — une grille, un `<div>` de
mesure — et laisser le texte la remplir. Ne jamais laisser un paragraphe flotter dans une
boîte deux fois plus large que lui.

**Quelle que soit la propriété (TF-0421, lot Produit-05 20260820a).** `width: min(75ch, 100%)`
contournait la mesure (qui ne regardait que `max-width`) et produisait exactement le défaut :
texte à 40 % d'un écran de 1 800 px, livré vert, refusé par le client. `render_page.py` L2
retire `max-width` **et** `width` le temps d'une mesure : toute bride du texte en deçà de
85 % de la place offerte échoue. La bonne forme est nommée et portée par le boilerplate :
`section.chap.lire` (conteneur de lecture ~1 080 px) et `section.chap.duo` (grille 7/5 texte +
encart utile) — composants.md §11.

**Troisième forme : la gouttière d'étiquettes.** Une grille `étiquette | contenu` dont la
colonne d'étiquettes prend 22 % de la largeur utile. Chaque colonne remplit sa case — la
mesure de largeur ci-dessus rend 1,00 — et pourtant le lecteur voit un tiers de page vide et
un contenu tassé à droite. **L'angle mort est la grille elle-même** : on mesurait le bloc de
texte, pas la répartition qui le contraint.

Doctrine : **une étiquette de champ s'écrit en tête de ligne**, pas dans une colonne —
« **Question d'audit** — … ». Si une colonne d'étiquettes est vraiment voulue, elle ne
dépasse jamais **15 à 20 %** de la largeur utile.

**Contrôle mécanique — trois niveaux.**
- `L2` **statique** (`check_html.py`) : aucun `max-width` en pixels durs inférieur à 1 100 px
  sur `body`, `main`, `.wrap`, `.container` ou `.page`.
- `L2` **au rendu** (`render_page.py`, bloquant) : pour tout bloc de texte d'au moins
  120 caractères, hors tableau et hors navigation, la largeur rendue rapportée à la largeur
  **réellement disponible** doit être ≥ **0,85** aux viewports de bureau (≥ 1 100 px). La
  mesure est exacte, pas heuristique : on retire `max-width` le temps d'une mesure et on
  compare. Une colonne légitimement étroite ne bouge pas ; un paragraphe bridé se révèle.
- `L2` **gouttière** (`render_page.py`, bloquant) : dans une grille CSS à **deux pistes**
  dont la seconde porte ≥ 120 caractères et la première une étiquette de ≤ 60 caractères, la
  première piste ne dépasse pas **20 %** de la largeur. Le seuil est à 20 % et non 25 %
  parce que le défaut constaté mesurait **22 %** : un seuil posé au-dessus du défaut qui l'a
  motivé ne prouve rien. Deux colonnes de contenu (cartes, barèmes) portent deux textes
  longs et sortent du périmètre.
  **Les mises en page `intitulé | contenu` en `<table>` y entrent aussi** (TF-0694,
  27/08/2026) : la règle décrivait exactement ce défaut, au seuil exact, et rendait PASS
  dessus — son implémentation commençait par `if (cs.display !== 'grid') continue` et
  assumait l'exclusion (« un vrai tableau de données n'est pas une grille CSS »). Or *une
  mise en page en `<table>` n'est pas un tableau de données : c'est la même intention avec
  l'autre outil*. La règle n'avait pas échoué, **elle n'avait pas été appelée**, et rien ne
  le disait — mesuré sur une fiche à 32 % : verdict PASS et zéro constat sur les treize
  familles, après deux fiches livrées et trois régénérations. On mesure alors la largeur
  **rendue** de la première colonne (un `<table>` n'a pas de piste déclarée), avec les
  **mêmes** garde-fous : première cellule courte, seconde longue, et la majorité des lignes
  à deux cellules de ce type (au moins deux). Le seuil de 20 % **ne bouge pas** — le lot en
  apporte une confirmation indépendante. Un vrai tableau de données à deux colonnes de
  valeurs comparables reste PASS, et une fixture verte le prouve à chaque recette.

**Revue de lecture.** Que les blocs qui doivent occuper la pleine largeur (synthèse, verdict,
blocage principal) l'occupent réellement — et que la mesure de lecture retenue serve le
propos plutôt que l'habitude.

## L3 — Toute valeur porte sa légende

**Règle.** Aucun score, badge, pastille ou valeur mise en avant n'apparaît sans que le
lecteur puisse savoir **ce qu'il signifie**. « Maturité 1/5 » sans barème n'informe pas : il
faut dire ce que valent 1, 2, 3, 4 et 5.

**Deux catégories, deux exigences.**

**(a) Les scores** — classe `sc` / `score` / `note` / `jauge`, ou texte de la forme `N/M`.
Exigence : **`aria-describedby` résolvant vers un élément de la page d'au moins
20 caractères** — le barème. Un `title` ne suffit pas pour un score, et ce n'est pas une
formalité : un tooltip ne survit pas à l'export WeasyPrint, ne s'atteint pas au doigt sur
mobile, et n'a jamais la place d'énoncer cinq crans. Le barème doit **exister dans le
document**. C'est la mécanisation de « 1/5 sans barème = défaut ».

**(b) Les autres valeurs mises en avant** — `kpi`, `badge`, `pastille`, `pv`, `stat`.
Exigence : `title` non vide, **ou** `aria-label` non vide, **ou** `aria-describedby` résolu,
**ou** une légende visible (`<small>`, `.legende`, `.kpi-d`) d'au moins 12 caractères.

Un `title=""` vide est **pire** que pas de tooltip : il annonce une explication et n'en
donne aucune. C'est un échec, pas un avertissement.

**(c) Les colonnes calculées.** Un en-tête de tableau nommé `Score`, `Note`, `Indice`,
`Priorité`, `Pondération`, `Classement`, `Criticité` ou `Sévérité` annonce une valeur
**calculée** — et c'est en général celle qui **ordonne le tableau**. Sans sa formule, on
demande au lecteur de croire sur parole la seule colonne qui décide de tout l'ordre.
Exigence : `aria-describedby` sur le `<th>`, vers un élément qui **publie le calcul** —
formule, amplitude, et seuil de décision s'il y en a un. Le barème d'un score calculé, c'est
son mode de calcul, pas la description de ses crans.

Corollaire de nommage : si une colonne s'appelle `Note` mais contient une remarque en prose,
c'est le **libellé** qu'il faut corriger, pas le contrôle. Un lecteur commet exactement la
même erreur que la règle.

**(d) Les valeurs opaques.** Une empreinte (`3d0af44aae9a`) et un jeton codé
(`ia-assistee-validation-humaine`, `manuel-strict`) sont écrits pour une machine. Affichés
nus, ils demandent au lecteur de deviner ce qu'ils désignent — et il ne devine pas.
Exigence : `title` / `aria-label` d'au moins 12 caractères, `aria-describedby` résolu, ou
légende visible. Échappatoire pour un identifiant volontairement brut : `data-opaque-ok`. Le
contenu d'un `<code>` est hors périmètre — il annonce déjà qu'il s'adresse à la machine.

**Contrôle mécanique.** `L3` — les quatre exigences ci-dessus, plus l'échec explicite sur
légende vide et sur `aria-describedby` pointant dans le vide.

**Revue de lecture.** Que le barème soit juste, que ses crans soient discriminants, et que
la formule publiée soit bien celle qui a servi.

## L4 — Une liste longue se filtre, se trie, se cherche

**Règle.** Dès **8 lignes**, une table ou une liste de données n'est plus lue : elle est
parcourue. Elle doit offrir au minimum **filtre**, **tri** et **recherche**.

Le seuil et le périmètre exact (colonne catégorielle, exemption motivée) sont ceux du
composant : voir [composant-filtres-tableau.md](composant-filtres-tableau.md).

**Exemption.** `data-filterable="off"` **et** `data-filterable-reason="…"`. Sans motif, échec.

**Contrôle mécanique.** `L4` — toute `<table>` de ≥ 8 lignes de `<tbody>` sans
`data-filterable`, ou exemptée sans motif.

**Revue de lecture.** Que les colonnes filtrables soient celles qu'on veut réellement
filtrer, et que le tri par défaut serve la question posée.

## L5 — Le surlignage de recherche ne casse ni les mots ni le flux

**Règle.** Le surlignage d'une occurrence est **inline et transparent au flux**. Chercher
`clic` dans « clics » doit surligner `clic` **sans détacher** le `s` : pas de `padding`
horizontal, pas de `margin`, pas de passage en `inline-block`, pas de changement de police.

**Cause typique — et elle n'est pas où on la cherche.** Le surligneur découpe un nœud de
texte en `texte + <mark> + texte`. C'est correct. Ce qui casse le mot, c'est le CSS :

1. **Un padding horizontal** sur le `<mark>` — 1 px suffit à créer une césure visible.
2. **Une collision de nom de classe**, bien plus grave et invisible à la relecture du CSS.
   Constaté en production : le conteneur du champ de recherche portait `class="find"` et
   était stylé `display:flex; flex-direction:column`. Le surligneur produisait
   `<mark class="find">`. La règle `.find { display:flex }` s'appliquait donc **aussi au
   surlignage**, qui devenait une boîte de bloc : « clics » se rendait « clic », puis « s »
   à la ligne suivante — la partie non surlignée éjectée 600 px plus loin. La règle
   `mark.find` existait bien, avec une spécificité supérieure, mais **ne déclarait pas
   `display`** : elle ne pouvait donc pas gagner sur une propriété qu'elle n'écrivait pas.
   Depuis, l'asset du socle ne peut plus produire cette collision : il surligne en
   `<mark class="find-hit">`, classe disjointe de tout nom que prendra le conteneur
   (cf. [composant-recherche.md](composant-recherche.md)). Le contrôle L5 reste inchangé —
   un livrable qui recode son surligneur peut toujours retomber dans le piège.

Le troisième piège est la **réécriture d'`innerHTML`** pour nettoyer les surlignages : elle
détruit les écouteurs des filtres et du tri. Nettoyer en remplaçant chaque `<mark>` par son
texte, puis `normalize()`.

**Contrôle mécanique.** `L5` — aucune règle CSS **visant un `<mark>` de la page**, que ce
soit par son élément (`mark`, `mark.find`) **ou par une classe que ce `<mark>` porte**
(`.find`), ne déclare de `padding` horizontal non nul, de `margin` non nul, ni de `display`
autre que `inline`. C'est le second volet qui attrape la collision : un contrôle limité aux
sélecteurs contenant `mark` serait passé au vert sur le défaut réel.

**Revue de lecture.** Que le contraste du surlignage reste conforme (couvert par V2) et que
le compteur d'occurrences soit juste.

## L6 — Un sommaire qui annonce, avec des ancres qui résolvent

**Règle.** Chaque entrée du sommaire : un numéro, un titre, **une ligne d'annonce** qui dit
ce que le chapitre apporte, et une ancre qui **existe réellement** dans le document.

Un sommaire réduit à des titres nus oblige à ouvrir chaque chapitre pour savoir s'il
intéresse : il coûte plus qu'il ne rapporte.

**Convention de marquage.** Le sommaire est un `<nav>` portant `class="toc"` ou
`aria-label="Sommaire"`. Chaque entrée est un `<a href="#id">` contenant un élément de
classe `toc-d` (l'annonce), de **12 caractères au moins**.

**Contrôle mécanique.** `L6` — (a) toute ancre `#id` du sommaire dont l'`id` n'existe pas ;
(b) toute entrée sans élément `.toc-d` d'au moins 12 caractères.

**Revue de lecture.** Que l'annonce dise le contenu et non le titre reformulé.

## L7 — Chaque chapitre ouvre par ce qu'il apprend

**Règle.** Un chapitre commence par une phrase qui répond à « **ce que ce chapitre vous
apprend** » — pas par un tableau, pas par une liste, pas par un titre de niveau 3.

**Périmètre mécanique.** Les sections **cibles du sommaire** : ce sont les chapitres, par
définition. Une page sans sommaire n'est pas concernée par le contrôle.

**Convention de marquage.** Un élément de classe `ch-apprend` (ou `ch-st`) en tête de
section, d'au moins 40 caractères.

**Contrôle mécanique.** `L7` — toute section cible du sommaire sans chapeau d'ouverture
d'au moins 40 caractères.

**Un chapeau est une phrase ÉCRITE, jamais générée (TF-0423, lot Produit-05 20260820a).** Douze
chapeaux identiques au mot près, posés par un script qui optimisait l'oracle, ont passé L7 sur
un livrable refusé par le client. Trois formes mécaniques de ce défaut échouent désormais :
chapeau **identique** dans deux chapitres ; chapeau tiré du **lexique de remplissage** (« ce
chapitre apporte/présente les éléments annoncés par son titre ») ; chapeau de plus de 60 mots
(un paragraphe reclassé). Corriger en **écrivant** — jamais en reformulant pour passer.

**Revue de lecture.** Que le chapeau annonce le bon apport — un chapeau générique
(« ce chapitre présente les données ») passe le contrôle et rate la règle.

## L8 — Tout lien interne annonce sa destination

**Règle.** Un lien interne (`href="#…"`) dit **où il mène**. « ici », « voir », « détail »,
« → » ne sont pas des destinations. Le lecteur doit pouvoir décider de cliquer sans cliquer.

**Deux formes acceptées.** Un libellé visible d'au moins **8 caractères** nommant la cible ;
ou un libellé court accompagné d'un `title` / `aria-label` d'au moins 12 caractères qui la
nomme. **La sortie la plus simple se dit en premier (TF-0434)** : un libellé qui est un
**identifiant du document** (H5, E2, 1.5, ADR 0022) n'est pas muet pour son lecteur — il est
elliptique pour un lecteur d'écran ; il reste court et prend un `title` de 12 caractères.
L'allonger nuirait à la lecture.

**Contrôle mécanique.** `L8` — tout `<a href="#…">` hors sommaire dont le texte visible fait
moins de 8 caractères et qui ne porte ni `title` ni `aria-label` d'au moins 12 caractères.
Les ancres vides (`href="#"`) sont un échec inconditionnel.

**Revue de lecture.** Que le libellé corresponde au titre réel de la cible.

## L9 — Listes d'actions : ligne lisible, détail complet

**Règle.** Une action se présente sur **une ligne lisible** (l'énoncé, pas son début) et son
détail se déplie **intégralement**. Jamais de libellé coupé au niveau 1 sans le texte entier
au niveau 2 (c'est L1 appliqué aux listes).

**Le dispositif.** `<details>` en place, sans insérer de `<tr>` supplémentaire — une ligne
de tableau injectée casse l'itération des composants de filtre et de tri.

**Un dépliant annonce ce qu'il ouvre ET à quoi ça sert.** « Détails », « plus d'infos »,
« voir plus » ne disent ni l'un ni l'autre. Pire : un libellé qui décrit son *contenu* sans
dire son *usage* — « question d'audit, critère et preuves » — se lit comme une table des
matières, et le lecteur qui l'ouvre juge inutile ce qu'il y trouve. Le libellé porte le
**verbe du lecteur** : « vérifier ce constat — question d'audit, critère, preuves ».

Corollaire : ce qui identifie l'élément (numéro, référence) **remonte dans le `<summary>`**
plutôt que d'occuper une ligne à lui seul.

**Un dépliant coûte un clic et une décision.** Sous ~200 caractères cachés, le contenu tient
à l'écran : le replier fabrique un obstacle, et le lecteur qui l'ouvre se sent trompé —
« à qui sert ce bouton ? ». Le `<details>` ne se justifie que pour du contenu long ; en
dessous, on affiche en place, en pied de bloc et en style discret. Échappatoire motivée :
`data-repli-ok`.

**Contrôle mécanique.** `L9` — tout `<details>` au corps vide (rien hors le `<summary>`) ;
tout `<details>` cachant moins de 200 caractères utiles hors `data-repli-ok` ;
tout `<summary>` de moins de 3 caractères ; et tout `<summary>` d'au plus trois mots pleins
dont **aucun ne désigne** (mots-outils ignorés, liste de mots creux dans le script). « Voir
plus » échoue, « Afficher la dette » passe — « dette » désigne. Ce qui n'est pas mécanisable,
c'est qu'un libellé qui désigne dise aussi un **usage** : cela reste à la revue de lecture.
Le complément de L9 (« le niveau 2 contient le texte intégral ») est couvert par L1.

**Revue de lecture.** Que la ligne de niveau 1 soit une phrase autonome et non un fragment
grammatical.

## L10 — Les chapitres de données ont un mode d'emploi

**Règle.** Un chapitre dont le corps est une table de données porte, avant la table, un
**chapeau d'usage** (à quoi sert cette table, comment s'en servir) et **un exemple de
lecture** (« la ligne X se lit : … »).

Sans cela le lecteur reçoit un vidage de données filtrable — exact, inutilisable.

**Convention de marquage.** L'exemple de lecture est un élément de classe `exemple-lecture`
(ou `data-exemple-lecture`), d'au moins 30 caractères, situé dans la section.

**Contrôle mécanique.** `L10` — toute section cible du sommaire contenant une table de
≥ 8 lignes et dépourvue d'élément `.exemple-lecture` d'au moins 30 caractères.

**Revue de lecture.** Que l'exemple porte sur une ligne réellement présente et qu'il
apprenne à lire une colonne non évidente.

## L11 — Aucun littéral de langage dans le texte visible

**Règle.** `null`, `None`, `undefined`, `NaN`, `nil`, `[object Object]`, `{{variable}}`,
`${expr}` : aucun de ces jetons n'appartient à la langue du lecteur. Quand l'un apparaît,
une valeur non renseignée a traversé le producteur **sans être traitée**. Le lecteur reçoit
l'aveu d'un trou, formulé dans un langage qui n'est pas le sien — et il ne peut pas savoir si
la donnée est absente, nulle, ou perdue en route.

**Le bon dispositif.** Le producteur normalise à la source : une valeur absente fait
disparaître son champ, ou devient une **absence déclarée** en français (« non renseigné »,
« hors périmètre — motif : … »). Jamais le littéral du langage. C'est ce que L11 sépare : ce
n'est pas un défaut de mise en forme, c'est un défaut de traitement.

**Piège fréquent.** Un front-matter ou un JSON portant `champ: null`, lu comme du texte,
produit la **chaîne** `"null"` — non vide, donc vraie, donc rendue. Un test `if valeur:` ne
l'attrape pas ; il faut normaliser explicitement.

**Exemptions.** Le contenu de `<code>`, `<pre>`, `<kbd>`, `<samp>` — on y documente du code —
et tout élément marqué `data-litteral-ok` : une page qui parle *de* `null` a le droit de
l'écrire.

**Contrôle mécanique.** `L11` — occurrence de l'un de ces littéraux, délimitée par des
frontières de mot, dans un nœud de texte visible hors exemptions.

**Revue de lecture.** Qu'une absence déclarée en français dise aussi **pourquoi** la valeur
manque et **ce qu'il faudrait fournir** pour la lever.


## L12 — Une énumération de données n'est pas une phrase

**Règle.** Au-delà de trois éléments, une énumération `clé — valeur` enchaînée par des
points-virgules cesse d'être de la prose : c'est un tableau qu'on refuse d'assumer.

```
Informations — pages 7, étendue en mots 386–567 ; Inclus — pages 7, étendue en mots
341–354 ; Options — pages 7, étendue en mots 259–283 ; Tarifs — pages 7, étendue en
mots 328–340 ; Réservation — pages 7, étendue en mots 475–478 ; Gîtes — pages 2…
```

Le lecteur ne peut ni comparer, ni trier, ni repérer la valeur aberrante. Et il ne sait pas
ce qu'il devrait en conclure — verdict du lecteur qui l'a signalé : « on ne sait ni à quoi ça
correspond, ni ce qui est bien ou pas bien, ni pourquoi ».

**Le bon dispositif.** Un tableau ou une liste, **surmontés d'une ligne qui dit ce qu'il faut
y voir**. Le tableau donne les faits ; la ligne donne la lecture. Sans elle, on a déplacé le
problème sans le résoudre.

**Contrôle mécanique.** `L12` — trois segments ou plus de forme `clé — valeur`, séparés par
des points-virgules, dans un même nœud de texte.

**Revue de lecture.** Que la ligne de lecture dise quelque chose qui ne se déduit pas de la
simple observation du tableau.

---

## Ce qui n'est PAS mécanisable — revue de lecture

À traiter par l'orchestrateur du run, jamais par un contrôle automatique :

| Objet | Question posée à la revue |
|---|---|
| Clarté du propos | La synthèse permet-elle de décider sans lire le reste ? |
| Pertinence du blocage principal | Le blocage affiché est-il le plus grave, ou le premier dans l'ordre de la grille ? |
| Justesse des chapeaux | Le chapeau apprend-il quelque chose, ou paraphrase-t-il le titre ? |
| Qualité des exemples de lecture | L'exemple lève-t-il l'ambiguïté d'une colonne, ou décrit-il l'évidence ? |
| Fil narratif | Une lecture linéaire des chapitres tient-elle debout ? |
| Usage d'un dépliant | Le libellé dit-il ce que le lecteur y GAGNE, ou seulement ce qu'il contient ? |
| Ligne de lecture d'un tableau | Dit-elle ce qu'il faut y voir, ou paraphrase-t-elle les colonnes ? |
| Langue du lecteur | Le constat est-il écrit comme le lecteur le reformulerait, ou comme l'auteur l'a mesuré ? |
| Fidélité des libellés de lien | Le libellé nomme-t-il la cible ou un synonyme approximatif ? |
| Barème | Les crans sont-ils discriminants et vérifiables ? |

**Trace attendue — OBLIGATOIRE (TF-0422, lot Produit-05 20260820a)** : la revue de lecture se
consigne dans `REVUE.md` à côté du livrable, au gabarit
[gabarit-revue-de-lecture.md](gabarit-revue-de-lecture.md) — captures lues (1920, 1280, 768,
390 et une par section via `render_page.py --sections`), une ligne par constat (largeur ·
section · constat · suite · preuve), ou la mention « aucun constat » datée. Un run qui
déclare « lisibilité OK » sans `REVUE.md` n'a pas fait de revue : une page verte à tous les
oracles a été refusée par son client à l'ouverture — les oracles mesurent des propriétés
locales, personne ne regardait la page comme un lecteur.

## L13 — Une page à listes s'offre une recherche et des KPI vivants

**Règle.** Une page qui montre au moins une table de ≥ 8 lignes **se parcourt** : elle doit
porter d'elle-même un champ de recherche statique (`input[type=search]`) — une recherche
injectée au runtime par un composant ne compte pas, la page doit l'offrir sans dépendance.
Les KPI posés au-dessus d'une telle liste sont des affordances de filtre.

**Contrôle mécanique.** `L13` — échec sur l'absence de champ de recherche ; **avertissement**
(pas échec) sur les KPI non cliquables, la distinction consultation / livrable interactif
restant à trancher.

**Dire qu'un KPI compte des éléments hors page** (TF-0229) : `data-kpi-hors-page="<motif>"`,
ou une légende `.kpi-d` / `.kpi-hint` **non vide**. Le message de la règle promettait cette
porte depuis le début (« un KPI d'éléments hors page le dit ») alors qu'aucun moyen de le dire
n'existait : six indicateurs qui nommaient chacun leur chapitre étaient signalés quand même.
Une règle dont le message décrit une échappatoire inexistante apprend au lecteur que les
messages du socle ne sont pas fiables — c'est plus coûteux que la règle elle-même.

## L14 — La plomberie ne s'affiche pas

**Règle.** Une convention de balisage interne n'a **rien à faire dans le texte rendu**. Le
défaut fondateur (14/08, rapport Produit-10) : un livrable **diffusé** portait 71 occurrences de
marqueurs `[c:ec-sources]` en clair dans ses phrases — « 85 [c:ec-sources] sources Veltis »,
« 258 [c:ec-claims] lignes de tableau ». Il était PASS à `check_html.py`, PASS à
`render_page.py` sur cinq largeurs, PASS à 24 contrôles d'interactions maison. **Aucun oracle
ne lisait le texte rendu.** C'est l'humain qui l'a vu, au premier coup d'œil, capture à
l'appui.

Deux niveaux, et la distinction porte une décision :

- **échec** — ce qui n'a jamais de raison d'être lu : marqueur crocheté à préfixe court
  (`[c:…]`, `[ref:…]`), substitution `printf` (`%s`, `%(nom)s`), « lorem ipsum » ;
- **avertissement** — `TODO` / `FIXME` / `XXX` / `HACK` : une page peut légitimement **parler
  de tâches** (le registre TODO du pilot en est une). En faire un échec forcerait une
  exemption sur une page honnête, et une exemption de routine ne se lit plus.

**Deux sorties légitimes, et ce ne sont pas des échappatoires.**

1. **Citer dans du code.** Un jeton placé dans `<code>`, `<pre>`, `<kbd>` ou `<samp>` — ou
   dans l'un de leurs descendants — est une **mention**, pas une fuite. C'est la distinction
   que `oracle-restituer` de forge-data a tranchée le 14/08 (vérifiée sur 213 chiffres) ;
   elle vaut ici à l'identique, et elle est typographiquement juste avant d'être commode.
2. **S'exempter avec un motif** : `data-motif-ok="<raison>"`, sur le nœud ou un ancêtre. Sans
   raison, l'attribut ne compte pas — même convention que `data-filterable-reason`.

**Corriger l'émetteur, pas la page.** Le registre TODO du pilot citait les marqueurs pour
*décrire* ce défaut et se retrouvait accusé de le commettre. La correction n'a pas été
d'exempter la page — une exemption globale aurait couvert une vraie fuite le jour venu — mais
d'apprendre au générateur à rendre un jeton technique en `<code>`, ce qu'il faisait déjà pour
les littéraux de L11.

**Revue de lecture.** Qu'un motif exempté le soit pour une raison qui tient à la page, et non
parce qu'on n'a pas voulu corriger l'émetteur.

## L15 — Un glyphe en `content:` CSS existe dans la pile de repli (avertissement)

**Règle.** Un caractère posé par `content:` s'affiche avec les polices du lecteur, pas les
vôtres. Un chevron écrit `"\25B6"` passait tous les oracles et sortait en **tofu** sur mobile
(TF-0435, lot Produit-05 20260820b) : la pile de repli mono n'a pas ce caractère ; seul l'œil
humain l'a vu sur les captures.

**Contrôle mécanique.** `L15` — tout caractère hors Latin-1 et hors liste blanche (chevrons
simples `› ‹`, guillemets, tirets, puces, flèches, coches) employé en `content:` est
**signalé**, jamais un échec : « vérifiez ce glyphe sur un poste sans vos polices ». Préférer
`›`, `•`, `–`, `→`, ou une icône SVG dessinée. Le socle emploie `›` (U+203A) partout.

### L15 bis — et le SOCLE ne propage pas un glyphe qu'il interdit (TF-0490, 22/08/2026)

**Le même défaut, deux fois, et c'est ce qui le rend intéressant.** Le lot du 20/08 avait
signalé un chevron absent des piles de repli déclarées ; tout le socle est passé à `›` (U+203A).
Le 22/08, il revient : un producteur reprend le composant `details`/`summary`, recopie les
triangles de l'exemple (U+25B8, U+25BE), et hérite du risque.

**La cause n'est pas le producteur.** `L15` juge les glyphes en `content:` CSS d'une page
PRODUITE ; personne ne jugeait ceux que le socle offre à la copie. **Un exemple est une
prescription silencieuse : ce qu'il montre sera repris.**

**Contrôle.** Il ne vit pas dans `check_html.py` — il ne juge pas une page, il juge le socle
lui-même : `self_test.py`, contrôle « glyphes du socle ». Il relit les BLOCS DE CODE des
références et les FIXTURES, et échoue sur tout glyphe hors liste blanche.

**La borne est délibérée** : la PROSE des références n'est pas jugée. Les marqueurs de gravité
de `bonnes-pratiques.md` sont la LÉGENDE du document, pas un exemple — personne ne les recopie
dans un livrable, et les interdire dégraderait la référence sans rien gagner. Le premier jet du
contrôle lisait la ligne entière dès qu'elle portait du code, et condamnait donc « - 🔴 Ouvrir
par `<!DOCTYPE html>` » : un contrôle qui déborde de son domaine se fait désactiver.

**La liste blanche s'est élargie du même geste** : `œ Œ æ Æ` y entrent. Ce ne sont pas des
ornements mais des lettres du français, et les exclure faisait signaler « cœur » et « œuvre ».

## L16 — Des onglets accessibles, et tous imprimés

**Règle.** Un rapport à onglets se lit au clavier, s'ouvre au bon onglet depuis un lien, et
s'imprime en entier. Composant : `assets/tabs.js` (composants.md §9, TF-0425).

**Contrôle mécanique.** `L16` — tout `role="tab"` vise par `aria-controls` un `role="tabpanel"`
existant ; tout panneau porte `aria-labelledby` vers son onglet ; des panneaux `hidden` sans
règle `@media print` qui les réaffiche échouent.

**Revue de lecture.** `render_page.py --sections "[role=tabpanel]"` : une capture par onglet,
lue comme un lecteur qui n'en verrait qu'un.

## L17 — Une ligne de tableau dépliable se déplie, se vise et s'imprime

**Règle.** Le détail à la demande vit dans le tableau (`tr[data-detail]`), s'ouvre par un
bouton, se déplie à l'impression, et suit sa ligne mère au filtrage. Composant :
`assets/table-detail.js` (composants.md §10, TF-0432).

**Contrôle mécanique.** `L17` — toute ligne `tr[data-detail]` a un `id`, un `<button
aria-controls>` qui la vise, une cellule dont le `colspan` couvre toutes les colonnes, et une
règle `@media print` qui la déplie.

**Revue de lecture.** Que le détail dise plus que la ligne — sinon c'est un dépliant qui cache
trop peu (L9).

## L18 — Un identifiant porte son SENS, là où on le lit

*Retour DIRECT du client, en cours de session, le 22/08/2026* : **« je ne sais pas ce qu'est
E2 »**. Sa consigne tient en une phrase — **garder les codes, ils servent la traçabilité, mais
les accompagner de leur sens à chaque emploi**.

Cette référence couvrait deux cas VOISINS et laissait celui-ci entre les deux : **L3** exige
qu'une *valeur* mise en avant porte sa légende, **L14** interdit que la *plomberie* interne
s'affiche. Un identifiant qui appartient légitimement au vocabulaire du livrable — `E2`, `C1`,
`H3`, `Q-M8`, `ADR 0009` — n'est ni l'un ni l'autre : c'est un **renvoi muet**.

**Le plus instructif, et c'est ce qui a rendu la règle écrivable sans rien inventer** : le
rapport HTML du même projet **faisait déjà la chose correctement** — chaque renvoi portait une
infobulle « Question ouverte H3 : … » et un lien vers sa définition. La bonne pratique existait
dans le produit ; comme elle n'était écrite nulle part, **elle s'arrêtait à la frontière du
HTML** et ne passait ni dans les livrables Markdown ni dans la restitution. Quatre documents et
une restitution entière ont employé une trentaine de codes sans glose, jusqu'à l'interruption.

**Contrôle mécanique.** `L18` — la **première** occurrence de chaque jeton dans la page doit
RÉSOUDRE : un `title` non vide, un `aria-label`, un `aria-describedby` qui pointe une cible
existante, un lien interne vers une ancre présente, ou `data-code-glose="<raison>"`. Les
occurrences suivantes ne sont pas exigées — imposer la glose à chaque ligne produirait du bruit,
et le client demandait à comprendre, pas à relire.

**Trois bornes, toutes déclarées.** Le motif des jetons est **fermé** — `[ECH]\d+`,
`Q-[A-Z]+\d*`, `RA-\d+`, `RD-\d+`, `ADR \d{4}` — parce que `E2` est un renvoi quand `A4` est un
format de papier, et que seule une liste les sépare ; `TF-nnnn` en est **volontairement absent**,
un identifiant de notre registre relevant de L14 et pas d'ici. Le `<head>` n'est pas jugé : un
`<title>` qui cite un code décrit la page, il ne renvoie à rien. Et **un titre portant un `id`
EST la définition** du jeton : elle ne se renvoie pas à elle-même.

**Hors HTML, la glose doit être EN LIGNE** — point de revue de lecture, pas contrôle mécanique.
C'est précisément ce que le retour jumeau (aucun contrôle de lisibilité sur un Markdown) rend
impossible à attraper aujourd'hui.

## L19 — La coupure de mot est réservée à ce qui en a besoin

*Trois occurrences signalées par le client sur deux versions successives* : « Utilisabl/e »,
« Plateform/e », « 231 occurrenc/es ». Cause unique : `overflow-wrap: anywhere` — **nécessaire**
sur les identifiants techniques et les chemins, **ravageur** sur du texte courant en colonne
étroite.

Aucun contrôle ne le voyait, et c'est ce qui rend le cas intéressant : le texte n'est ni tronqué
(L1), ni en débordement (V1), ni en contraste insuffisant (V2). Il est **simplement illisible**,
et c'est la première chose que voit un lecteur.

**Contrôle mécanique.** `L19` — `overflow-wrap: anywhere` ou `word-break: break-all` posé sur un
sélecteur de PROSE (un élément de prose sans classe qui le restreigne, ou une classe dont le nom
ne dit aucun usage technique) est un échec. Restent légitimes et non jugés : `code`, `pre`,
`kbd`, `samp`, `a[href]`, et toute classe qui nomme son usage (`.chemin`, `.jeton`, `.uri`,
`.sha`, `.mono`, `.identifiant`…). Exemption explicite : `data-coupure-ok="<raison>"`.

**Ce que L19 ne fait PAS, et c'est déclaré** : elle empêche la CAUSE, elle ne mesure pas l'EFFET.
Détecter au rendu qu'un mot est effectivement tombé sur deux lignes sans césure demande un
navigateur et vit dans `render_page.py` ; ce contrôle-là n'existe pas encore. Une feuille de style
qui casse la prose est refusée en amont, ce qui suffit à empêcher le défaut d'entrer — mais une
page héritée qui le porte déjà autrement n'est pas vue.

## L20 — « le contenu est là » ne veut pas dire « le contenu est lisible » (TF-0495, 22/08/2026)

*Le fait.* Le client a demandé que les documents sources soient inclus dans le livrable
autoportant. Ils l'ont été — en blocs de texte brut, dont un de **67 Ko contenant une trentaine
de tableaux Markdown**. **Tous les oracles passaient** : le contenu est là, la page est
conforme, rien ne déborde. Il a fallu que le client écrive « il faut pouvoir formater les MDs,
sinon c'est illisible », **puis le redemande une seconde fois**, pour qu'un lecteur à deux vues
soit produit.

C'est la frontière entre **le contenu PRÉSENT** et **le contenu EXPLOITABLE**, et aucune règle
ne la tenait. Le principe existait pourtant juste à côté : **L10** impose un mode d'emploi aux
chapitres de données. Il ne couvrait pas le contenu **embarqué**.

**Contrôle mécanique.** `L20` — au-delà de **4 Ko ou 80 lignes**, un `<pre>` offre une
alternative de lecture (vue mise en forme, sommaire, repli par sections) **ou** déclare
`data-brut-fait-foi="<raison>"`. Même logique que `data-filterable="off"` avec motif : **ce qui
est délibéré se déclare, ce qui est subi se corrige.**

L'alternative est reconnue par ce qui la **câble**, jamais par une intention : un contrôle
portant `aria-controls` vers le bloc ou son conteneur, ou un sommaire d'au moins trois liens
internes dans le même conteneur. *Une phrase qui promet une vue ne compte pas.*

## Hors HTML — la porte du Markdown (TF-0518, 22/08/2026)

*La mesure qui a ouvert cette porte.* Le registre compte 49 domaines. Sur un livrable réel de
85 Ko et 297 entrées, le lanceur en jugeait **quatre**, et **aucun de lisibilité** : les règles
L1-L22 vivent dans `check_html.py`, qui ne s'exécute que sur du HTML. Or le **Markdown est le
format de livraison dominant** des runs d'architecture et de conseil — le projet concerné remet
dix documents Markdown et un seul HTML. Conséquence directe : le défaut de L18 (un identifiant
sans son sens) s'est produit **dans les documents Markdown**, là où rien ne regardait, et c'est
un humain qui l'a trouvé. Exactement comme le défaut fondateur de L14.

`scripts/check_markdown.py` porte le **sous-ensemble indépendant du format de rendu**, sous des
noms qui disent leur origine :

| règle | ce qu'elle tient | transposée de |
|---|---|---|
| `M7` | un chapitre ouvre par ce qu'il apprend, pas par un tableau nu | L7 |
| `M10` | au-delà de 12 lignes de tableau, une phrase dit COMMENT lire | L10 |
| `M14` | aucune plomberie interne dans le texte | L14 |
| `M18` | un identifiant porte son sens, **en ligne** | L18 |

**Hors HTML, la glose est forcément EN LIGNE** : il n'y a ni infobulle ni ancre à survoler. `M18`
l'accepte entre parenthèses, après un tiret, ou après deux-points — les trois formes qu'un œil
lit sans cliquer.

**Ce qui reste dehors, et le dit.** Les règles qui dépendent du RENDU n'ont pas de sens sur un
Markdown, dont la mise en page appartient au lecteur : L1, L2, L5, L15, L19. Et **L3** (une
valeur porte sa légende) comme **L12** (une énumération n'est pas une phrase) restent une **revue
de lecture** : reconnaître « une valeur mise en avant » dans du Markdown demande de lire, et les
mécaniser produirait plus de bruit que de gain. Le partage mécanique / revue écrit plus haut
s'applique tel quel — *il n'y avait pas de doctrine à inventer, seulement une porte à ouvrir*.

**Une borne trouvée en jouant la règle**, qui vaut d'être dite : `M7` condamnait d'abord tout
chapitre ouvrant sur des « données », listes à puces comprises. Elle faisait échouer **sept blocs
sur neuf** d'une restitution au gabarit — une forme PRESCRITE, où un bloc qui ouvre par ses puces
est exactement ce que la consigne demande. Elle ne juge donc que les **tableaux**. *Un contrôle
qui condamne la forme qu'un gabarit prescrit met le gabarit en défaut, jamais l'auteur.*

**Le balisage d'emphase n'est pas du texte** (TF-0720, 31/08/2026). Deuxième fois qu'il casse
une adjacence, et c'est ce qui en fait une doctrine plutôt qu'un correctif. `**RD-23**
*(renvoi de design 23 : …)*` était refusé comme identifiant muet : le contrôle prenait les
quatre caractères suivant le jeton, y trouvait les deux astérisques de fermeture du gras, et
l'adjacence tombait — alors que mettre un identifiant en gras est l'écriture la plus naturelle
d'un tableau ou d'une énumération. Seconde manifestation, trouvée en corrigeant la première :
le contrôle travaillait **ligne par ligne**, donc un jeton en fin de ligne dont la glose
commence à la ligne suivante n'avait aucune suite à examiner. Et le lot du 22/08 avait déjà
signalé la même cause sur un **autre oracle** : une cellule `**90**` n'était pas lue comme un
nombre, et la re-somme sortait à 189 au lieu de 99.

*Une seule cause, une seule parade.* `check_markdown.py` expose `neutraliser_emphase()`, sur le
modèle du blanchiment des spans de code : les **marqueurs** (`**`, `__`, `*`, `_`) deviennent
des espaces, le contenu reste, et **la longueur est rigoureusement préservée** — donc lignes et
colonnes d'un message d'échec restent justes. La fenêtre de glose se prend ensuite sur le texte
**reflué du paragraphe** (jusqu'à trois lignes), et non sur la ligne physique : *la coupure à
95 colonnes est une commodité d'écriture, elle ne porte aucun sens*. `nombres_de()` offre la
même lecture aux contrôles de chiffres. Bornes déclarées : une emphase ouverte sur une ligne et
fermée sur la suivante n'est pas reconnue ; une puce `* premier` et un `nom_de_variable` ne
sont pas de l'emphase, et les fixtures rouges de `self_test.py` le vérifient — *une
neutralisation trop large mangerait le document au lieu de son balisage*.

## L21 — Un composant DÉCLARÉ porte son style (TF-0521, 23/08/2026)

*Le fait.* Deux squelettes de la bibliothèque portaient `<nav class="toc">` et des entrées
correctement annotées. **L6 était satisfaite au sens mécanique**, `check_html` rendait PASS, et le
rendu aussi — il n'y avait ni chevauchement ni troncature. Mais **aucune règle CSS ne visait
`.toc`** : le sommaire se rendait en liste numérotée nue, ce qu'aucun livrable du parc ne fait. Le
défaut n'a été vu qu'en comparant à un livrable RÉEL du même produit.

**C'est une classe entière de défauts que ni l'un ni l'autre oracle ne peut voir.** Un oracle de
MARQUAGE trouve la classe et s'arrête là ; un oracle de RENDU ne voit rien tant que rien ne
déborde. Entre les deux, *un composant peut être annoncé et n'exister pas*.

**Contrôle mécanique.** `L21` — toute classe de composant de la charte présente dans le marquage
est visée par au moins une règle CSS de la page. Liste **fermée** : `toc`, `toc-t`, `toc-d`,
`ch-apprend`, `table-hote`, `repli-cartes`, `diagram-wrap`. Un nom hors liste n'est pas jugé —
inventer des composants pour avoir quelque chose à exiger serait pire que ne rien exiger.

**Ce que la règle a trouvé en entrant** : huit fixtures du socle déclaraient `.toc` ou
`.ch-apprend` sans les styler. Ce n'était pas un faux positif — c'était **le même défaut**, dans
les fixtures. Elles ont été complétées plutôt que la règle affaiblie : *une fixture qui ne
ressemble pas à une vraie page mesure autre chose que ce qu'on croit.*

## L22 — Une promesse écrite en commentaire est TENUE (TF-0532, 23/08/2026)

*Le fait, et il a coûté quatre défauts bloquants.* Un schéma d'une page livrée portait ce
commentaire : `<!-- un <title> par forme, pour l'infobulle au survol -->`. Le diagramme entier avait
UN titre ; **aucun de ses nœuds n'en avait**. L'infobulle promise n'existait pas, et les nœuds sans
titre se chevauchaient — **quatre chevauchements V4, tous bloquants**. Le commentaire, lui, a
traversé quatre versions et trois relectures sans être contredit : *il se lisait comme une preuve*.

**C'est la loi n° 1 appliquée à la prose.** « Toute affordance est câblée ou n'existe pas » vaut pour
un bouton ; un commentaire qui annonce un élément est une affordance de LECTURE — il dispense le
relecteur de vérifier. Une promesse de commentaire non tenue est donc pire qu'un silence : elle
consomme l'attention qui aurait trouvé le défaut.

**Contrôle mécanique.** `L22` — un commentaire HTML qui annonce un élément portable (`<title>`,
`<figcaption>`, `<caption>`, `<summary>`, `<legend>`, `<label>`) le fait exister dans son bloc. Deux
formes jugées : l'annonce simple (l'élément existe quelque part dans le bloc englobant) et
l'annonce **quantifiée** — « un `<title>` par forme », « une `<caption>` par tableau » — où **CHAQUE
porteur** est vérifié, un par un.

**Ce que la règle a appris en se trompant, et c'est le cœur de l'affaire.** Le premier jet comptait
des TOTAUX : « 6 formes, 3 titres, défaut ». Il se trompait *dans les deux sens* — il accusait les
gabarits du socle, où chaque nœud portait bien son titre à l'intérieur de son groupe, et il laissait
passer la fixture rouge, où le titre du diagramme entier suffisait au total. *Un contrôle qui se
trompe dans les deux sens ne mesure pas ce qu'il prétend mesurer* : il compte, là où la promesse
parle de chacun. Le porteur d'un schéma est le **groupe** (`<g>`), comme la doctrine du socle le dit
depuis TF-0424 — un groupe titré est UN nœud, ses primitives n'en sont pas.

**Négations et échappatoire.** Un commentaire qui dit ne PAS poser l'élément (« aucun title : le
libellé est déjà dans la forme ») ne promet rien et n'est pas jugé. Le choix assumé se déclare par
`promesse-ok`.

**La même loi côté CODE.** Un commentaire de code qui nomme une classe ou un attribut promet
exactement de la même façon — et le pilot le vérifie par `oracle-promesses`, sur les fichiers qui
ont **signé** (`promesses-verifiees` en tête). Cette adhésion n'est pas de la timidité : le balayage
sans signature rendait **un constat vrai sur huit**, et un contrôle bruyant s'apprend à être ignoré.
Il a trouvé sa première vraie promesse chez `source-reader.js` du socle lui-même — `data-src-format`
était documenté dans son exemple d'usage et **lu par personne** ; il est désormais lu.

## L24 — Un badge de statut ENGAGEANT est résolvant (TF-0719, 31/08/2026)

*Le fait, payé par un client.* Le socle fournit un vocabulaire de statut juste — `acte`,
`propose`, `hypothese`, `information` — et les livrables en publient la légende : « acté =
décision en vigueur ». Un `<span class="badge acte">`, de titre « Décision prise le 22 août 2026
par la direction… » et de libellé « décidé le 22 août 2026 », a été posé sur une décision **qui
n'a jamais été prise**, dont la source n'est pas un ADR — sur **cinq emplacements** d'un livrable
diffusé. Et il est **passé** : L3 exige qu'un badge porte une légende, et elle était là. *Le
vocabulaire était bon, la discipline absente.* Corrigé seulement après intervention du client.

*Pourquoi celui-là.* Un badge de statut est une **affirmation de rang**, et la plus visible de la
page : c'est le seul élément qu'un dirigeant lit avant le texte. Il coûtait trois mots à écrire et
n'engageait à rien. Même doctrine que les renvois d'identifiant : **ce qui affirme se résout**.

**Règle.** Un élément qui cumule une classe de badge (`badge`, `pastille`, `statut`, `status`,
`chip-val`, `etiquette-statut`) et un statut **engageant** (`acte`, `decide`, `tranche` et leurs
variantes accentuées) porte la **trace** de sa décision. Trois formes acceptées :

- l'élément **est** un `<a href>`, en contient un, ou est enveloppé par un — une ancre interne
  doit **exister** et sa cible se **déclarer décision** ;
- `aria-describedby` résout vers un élément de la page **qui se déclare décision** (≥ 20
  caractères et un mot de trace : décision, ADR, arbitrage, délibération, tranché) ;
- `data-decision` porte une référence non vide, quand la trace vit hors de la page.

**Règle de dégradation, à sens unique.** Sans cible, le badge se dégrade en `propose`
(« recommandation, non tranchée »), **jamais l'inverse**. *Dégrader coûte une nuance, promouvoir
coûte un mensonge de rang.*

**Contrôle mécanique.** `L24` — FAIL sur tout badge de statut engageant sans trace résolue.

**Bornes déclarées.** La règle ne mord **que** sur la liste fermée des statuts engageants, et
seulement combinée à une classe de badge : `.badge.propose`, `.badge.hypothese`,
`.badge.information` n'affirment aucun rang et ne sont jamais jugés. L'**existence** d'une cible
externe (`href` documentaire, `data-decision`) n'est pas vérifiée — la page ne peut pas ouvrir un
ADR du dépôt ; seule la **déclaration** est jugée, et cette limite est écrite plutôt que devinée.
Une description **résolue** n'est pas une trace : la fixture rouge porte exprès un badge dont
l'`aria-describedby` pointe vers une note qui explique sans rien trancher.

**À rapprocher** du retour jumeau sur `quality-oracles`, qui porte la même doctrine pour les
livrables non-HTML : *une seule doctrine, deux portes*.

**Revue de lecture.** Que la trace citée soit bien celle de la décision affirmée, et que la
décision ait réellement été prise — un contrôle vérifie qu'une cible existe, jamais qu'elle dit
vrai.

## L25 — Au-delà de trois chapitres, un sommaire VISIBLE EN PERMANENCE (TF-0772, 02/09/2026)

**Deux exclusions, payées le soir même sur les gabarits de la bibliothèque du pilot** : le `h2` qui titre le sommaire lui-même (à l'intérieur du `nav`) n'est pas un chapitre à lister — un sommaire qui devrait se citer est un faux positif ; et un `h2` marqué `data-toc="hors"` est un chapitre de SERVICE du gabarit (en-tête à renseigner, sections optionnelles, contrat de personnalisation) que le document rendu ne porte pas : le gabarit le déclare, il ne l'oublie pas.

**Le fait payé.** Un livrable servi portait un onglet « Volumes » à cinq vues et un onglet
« Stratégie » à six blocs sur **4 000 px** de haut. Aucune navigation intra-page, et **aucun
oracle ne l'avait demandée** — L6 ne se déclenche que si un sommaire est *déjà* là, et se
contente d'un avertissement quand il manque. Retour humain, mot pour mot : « fournis un menu sur
la gauche pour les différents chapitres de chaque page ». *Un contrôle qui n'exige jamais rien ne
fait pas exister ce qu'il décrit* — c'est la loi transverse n° 3 appliquée à la navigation : la
surface implicite se propose d'office, elle ne s'oublie pas.

**Règle.** Au-delà de **trois chapitres** de premier niveau **ou de deux écrans** de hauteur, la
page porte un sommaire **visible en permanence** : latéral collant sur bureau, bande repliable
sur mobile. Il liste **chaque** `h2` — un sommaire partiel est pire qu'aucun sommaire, le lecteur
croit tenir le plan de la page.

**Contrôle mécanique, en deux moitiés qui ne se remplacent pas.**
- `L25` (`check_html.py`) — plus de trois `h2` sans `nav.toc` / `nav[aria-label="Sommaire"]`, ou
  un sommaire qui n'atteint pas tous les chapitres. Le message nomme le **geste complet** : une
  entrée `<a href="#id">` par chapitre **avec** son annonce `.toc-d` d'au moins 12 caractères
  (L6), et la position collante.
- `sommaire_perdu` (`render_page.py`, bloquant) — le sommaire existe, la page fait plus de deux
  écrans, et il n'est **plus dans la fenêtre** aux 60 % de la page. Un sommaire qui défile avec
  le texte ne navigue plus rien, et aucun contrôle statique ne peut le voir.

**Le geste, une fois pour toutes** — il consomme le même token que le thead collant (L29) :

```css
.toc { position: sticky; top: var(--hh); }        /* --hh = hauteur de l'en-tête collant */
@media (max-width: 900px) { .toc { position: static; } }   /* bande repliable sur mobile */
```

## L26 — Une page de DONNÉES prend toute la largeur ; la colonne de lecture est pour la prose (TF-0771 + TF-0778, 02/09/2026)

**Le fait payé, deux fois.** Une console de données a été livrée dans une colonne de lecture de
**1 180 px** : à 1 440 px de fenêtre, ses tableaux mesuraient 1 301, 1 256 et 1 376 px pour
1 136 disponibles. `render_page` **avait relevé** le débordement ; la revue l'a classé
« acceptable » parce qu'un conteneur défilait — sans mesurer ce que le lecteur perdait. Retour
humain : « les pages doivent profiter de toute la largeur de l'écran », et sur le chapô bridé à
90ch : « répété des dizaines de fois sans être définitivement corrigé ».

**La cause n'est pas un réglage, c'est une contradiction non arbitrée.** Le socle portait deux
règles de largeur — mesure de lecture pour la prose (L2), pleine largeur pour le conteneur — sans
dire laquelle s'applique ni où. Chaque auteur tranchait, et retranchait au livrable suivant.

**Règle — l'arbitre est la page elle-même.** Une page de données se **déclare**
(`data-page="donnees"` sur `<html>`, `<body>` ou le conteneur principal) et vaut alors :

1. **pleine largeur adaptative** — aucune bride de lecture (`max-width` en `ch`, ou < 1 280 px)
   sur un conteneur qui porte un **tableau** ;
2. **un bloc de prose occupe la largeur de son conteneur**, ou deux lignes — sous **70 %**, c'est
   un défaut. Un passage de lecture voulu se **déclare** (`data-mesure-lecture`, plus
   `data-colonne-ok` s'il est calé à gauche) : c'est le geste complet, pas la moitié ;
3. **un tableau rogné dans un conteneur défilant** au-delà de 1 280 px de fenêtre est
   **bloquant**. Un conteneur `overflow-x: auto` rend un tableau *consultable*, il ne le rend pas
   *lisible*, et sur un grand écran il n'a pas d'excuse : la place existe. Écart voulu →
   `data-rognage-assume`, **déclaré**, jamais classé « acceptable » en revue.

**Contrôles mécaniques.** `L26` (`check_html.py`, bride autour d'un tableau) ·
`prose_etroite` et `rognage_donnees` (`render_page.py`, bloquants).

**Corollaire d'écriture — l'étiquette de statut se pose SOUS le champ, jamais dans le libellé
(TF-0773).** Sur le même livrable, quatre champs d'une même rangée tombaient sur deux hauteurs :
deux libellés portaient leur statut (« hypothèse à confirmer par le comité du 15/09 ») et
passaient sur deux lignes. Retour humain : « textbox pas alignés ». `render_page.py` mesure
désormais l'alignement des **contrôles** d'une même rangée à **2 px près**
(`controles_desalignes`, bloquant) — V3 juge des séries de blocs, L2 des largeurs de texte, et
une rangée de formulaire n'est ni l'un ni l'autre.

## L27 — Sur une page de données, une colonne se DÉFINIT (TF-0777, 02/09/2026)

**Le fait payé.** Aucun en-tête de la console livrée n'était défini, et l'infobulle du tri disait
« Trier par ». Une hypothèse exprimée **en euros par an** était consommée par un calcul
« séjours × valeur », c'est-à-dire **multipliée par un nombre d'occurrences** : personne ne
pouvait le voir, et l'oracle Calculs rendait `SKIP` faute de savoir ce que la colonne mesurait.
*Une unité qui n'est écrite nulle part se fait deviner, et une devinette ne se relit pas.*

**Règle.** Sur une page de données, tout `<th>` porte sa définition : `data-definition` (ou
`title`, ou un lien vers son entrée de glossaire), et cette définition dit **ce que la colonne
mesure, dans quelle UNITÉ, et d'où elle vient**. La source unique est un **dictionnaire de
colonnes** ([`dictionnaire-de-colonnes.md`](dictionnaire-de-colonnes.md)) : en-têtes, infobulles
et glossaire en **dérivent**, au lieu d'être réécrits trois fois.

**Contrôle mécanique.** `L27` — un `<th>` muet sur une page de données. La règle ne juge que les
pages déclarées : exiger une définition sur le tableau à deux colonnes d'une note de synthèse
ferait crier le contrôle là où il n'apprend rien.

## L28 — Le temps s'affiche comme du temps (TF-0783, 02/09/2026)

**Le fait payé.** Une vue de fenêtres rendait ses périodes **par libellé**, sans mois — le
fichier de données lui-même n'en portait pas, « par principe ». Conséquence mécanique : le tri et
la facette rangent la colonne par ordre **alphabétique**, et le lecteur lit « août 2025,
avr. 2026, déc. 2025 ». Aucune frise ne peut sortir de là.

**Règle.** Une colonne temporelle porte une **valeur d'ordre** sur chacune de ses cellules :
`data-v` en ISO (`2025-08`, `2025-08-14`) ou une balise `<time datetime>`. Le libellé reste
lisible par un humain, la valeur reste ordonnable par la machine — et une date ISO se compare
**comme du texte**, ce qui *est* déjà son ordre chronologique.

**Corollaire de forme.** Une vue de **fenêtres** (périodes d'ouverture, jalons, saisons) se rend
en **frise mensuelle** plutôt qu'en liste : la dimension temporelle est un axe, pas une colonne
de texte. Le schéma des données porte alors `mois_debut` / `mois_fin` et non un libellé unique.

**Contrôle mécanique.** `L28` — plus de la moitié des cellules d'une colonne temporelle sans
valeur d'ordre, sur une page de données. C'est le pendant de **G8** du composant de filtres
([`composant-filtres-tableau.md`](composant-filtres-tableau.md)) : la même valeur sert au tri et
à l'ordre de la facette.

## L29 — En-tête collant contre thead collant : le socle tranche (TF-0754, 02/09/2026)

**Le fait payé.** B1 (« header sticky », verdict *adapter*) et B6 (« tableau triable, thead
sticky », verdict *adopter*) se superposent dès qu'une page longue porte un tableau : le thead se
colle au bord haut **derrière** l'en-tête de document et devient illisible ; on lui donne un
décalage, et il flotte au-dessus des premières lignes de son propre tableau. **Aucun des deux
textes ne disait lequel cède**, ni ne fournissait le décalage. Coût mesuré : deux cycles de rendu
pour découvrir la collision, puis un arbitrage **de socle pris par un produit** — ce qu'un
produit ne devrait jamais avoir à trancher seul.

**Arbitrage, écrit ici une fois pour toutes.** **B1 l'emporte** : l'en-tête de document garde le
bord haut, c'est lui qui porte l'identité du livrable. **B6 reçoit son décalage sous forme de
token** — `--hh`, la hauteur de l'en-tête, posée dans `:root` par le gabarit :

```css
:root { --hh: 64px; }                     /* hauteur de l'en-tête collant, posée par le gabarit */
header.doc.colle { position: sticky; top: 0; z-index: 20; background: var(--bg); }
thead.colle th   { position: sticky; top: var(--hh); z-index: 10; background: var(--surface); }
```

Le même token décale le sommaire collant (L25) : un seul repère, trois consommateurs.

**Contrôle mécanique.** `L29` — un `thead`/`th` collant à `top: 0` alors qu'un en-tête est
lui-même collant ; **et** `top: var(--hh)` consommé sans que `--hh` soit déclaré, car un décalage
qui vaut 0 par défaut ramène exactement la collision qu'il devait éviter (loi transverse n° 1 :
une affordance est câblée ou n'existe pas).

## Lancer le contrôle

```bash
python scripts/check_html.py page.html                 # charte + a11y + print + L1-L29
python scripts/check_html.py page.html --regles L      # lisibilité seule (L1-L29)
python scripts/check_html.py page.html --output json
python scripts/render_page.py page.html                # V1-V14 + L2 mesuré au rendu
python scripts/self_test.py                            # fixtures rouges et vertes du skill
```

Les fixtures de `fixtures/` prouvent que chaque règle **peut échouer** : une par défaut —
texte coupé, largeur bridée, tooltip vide, barème absent, colonne calculée sans formule,
valeur opaque, table non filtrable, surlignage à padding, collision de nom de classe,
ancre morte, entrée de sommaire muette, chapitre sans chapeau, lien muet, détail vide,
table sans mode d'emploi, littéral `null`, promesse de commentaire non tenue — plus une fixture verte qui les passe toutes.
Une règle sans fixture rouge n'est pas un contrôle. **70 cas de lisibilité, 50 rouges** (comptés sur `fixtures/` le 23/08 — le chiffre précédent, « 26 cas », datait de dix règles plus tôt) — dont quatre
mesurés au rendu (`l2r-*`, `l2g-*`), rejoués par `self_test.py` quand playwright est
disponible.
