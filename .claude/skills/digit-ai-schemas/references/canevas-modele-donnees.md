# Canevas modèle de données (ERD)

Schéma de base de données aux standards Digit-AI : cartes-entités listant les colonnes, relations ancrées colonne-à-colonne, classification des données (PII), dictionnaire de tables compagnon. Dérivé du socle D16 des rapports d'audit POC-to-Prod (projet réel), amélioré.

## Quand utiliser

- Modèle relationnel d'une application (tables, colonnes, clés, relations)
- Audit de schéma de BDD (domaine D16 du référentiel) : intégrité référentielle, indexation, PII
- Dictionnaire de données avec classification de sensibilité
- Signes : « schéma de base de données », « modèle de données », « ERD », « MCD/MLD », « les tables et leurs relations », « où sont les données personnelles »

Ne pas utiliser pour : flux de données entre systèmes (→ canevas multi-bandes), topologie d'infrastructure (→ canevas topologie), ce qui CHANGE entre un existant et une cible (→ `assets/template-schema-differentiel.html`).

## Laquelle fait foi — la question n'est pas rhétorique (TF-0940, 08/09/2026)

**Le fait, et il est vérifiable des deux côtés.** DEUX moteurs de schéma de base de données
coexistent dans le parc, et ils ne rendent pas la même chose :

| | Ce canevas | `digit-ai-forge-audit` · `tools/rapport-engine.mjs`, fonction `renderERD` |
| --- | --- | --- |
| Rendu | cartes HTML positionnées + calque SVG pour les arêtes | SVG pur |
| Colonnes | badges PK / UK / FK / NN | texte « `[PK] nom *` », 🔒 pour les PII |
| Arêtes | ancrées **sur la ligne de la colonne** | de carte à carte |
| Mise à l'échelle | `fitSchema` (tient toujours dans la largeur) | aucune |
| Dictionnaire | dictionnaire compagnon | aucun |

**Celui-ci fait foi**, et la raison est écrite dans sa propre référence : il est *dérivé du socle
D16 des rapports d'audit, amélioré*. Le rapport d'audit rend donc l'ANCIENNE version pendant que
la capture donnée comme modèle est la nouvelle — deux moteurs, deux rendus, **un seul nom**.

**Ce qui reste à faire, et ce n'est pas de ce côté-ci du parc.** Le rapport d'audit doit
consommer ce canevas — import, ou copie conforme déclarée avec son empreinte, comme le socle des
pages HTML l'exige déjà pour toute copie de composant — et `renderERD` disparaître ou devenir un
appel. Tant que ce geste n'est pas fait, une capture de schéma ne dit pas de quel moteur elle
sort : **le lecteur d'un rapport d'audit doit savoir qu'il regarde l'ancien rendu.** Cette
déclaration n'est donc pas la correction, c'est le garde-fou en attendant qu'elle soit faite du
côté propriétaire du rapport.

## Ce que le canevas déclare LUI-MÊME, et pourquoi (TF-0941, 08/09/2026)

**Le fait, et il est mesuré.** Le gabarit est une page complète, mais **aucune recette ne la
rendait** : personne n'avait donc jamais mesuré ce qu'il produit. Mesure du 08/09, aux quatre
largeurs (1920, 1280, 768, 390) : **11, 12, 12 et 18 constats bloquants**. Chaque produit qui
instanciait le canevas les levait *à la main, chez lui, à chaque fois*. Le canevas les déclare
désormais, une fois pour toutes :

| Constat | Ce qui le produit | Déclaration posée |
| --- | --- | --- |
| V4 · une étiquette de cardinalité sur son arête | le dessin lui-même : l'étiquette se pose SUR le trait qu'elle nomme | `data-overlap-ok` sur l'étiquette |
| V4 · deux arêtes qui se croisent | une propriété du GRAPHE, pas du placement : deux liens peuvent devoir passer par le même couloir | `data-overlap-ok` sur les arêtes **seules** |
| « contenu rogné » sur le conteneur du schéma | `fitSchema` met à l'échelle et fixe la hauteur du conteneur à la hauteur mise à l'échelle | `data-rognage-assume` sur le point de montage |
| V1 · le dictionnaire déborde à 390 px | quatre colonnes en `nowrap` ne tiennent pas dans un téléphone | repli en blocs étiquetés sous 900 px |
| L19 · coupure de mot en prose | `anywhere` posé sur des sélecteurs dont le nom ne dit pas l'usage | classe `.dd-mono`, **jamais** sur la colonne de note |

**Les cartes, elles, restent jugées.** `data-overlap-ok` ne vit que sur les arêtes et leurs
étiquettes : deux tables qui se recouvrent restent un défaut, et V4 continue de le mesurer.
Une déclaration qui couvrirait tout le schéma serait un assouplissement déguisé.

**Recette.** Le gabarit livré rend **0 bloquant aux quatre largeurs** ; privé de ses deux
déclarations, il en rend **47**. Les deux sens sont joués par `self_test.py` du socle des pages
HTML — un gabarit que rien ne rend est un gabarit dont personne ne connaît les défauts.

## Deux schémas sur une page : les points de montage sont des paramètres (TF-0941)

Les trois points de montage étaient **figés** (`dbSchemaMount`, `dbLegendMount`, `dbDicoMount`)
et le calque d'échelle portait l'id `dbScaler`. Une page qui devait montrer **deux** schémas —
la source et la cible, l'existant et le projeté — ne le pouvait pas : deux montages auraient
partagé le même id, et `fitSchema` aurait mis à l'échelle le premier venu.

```js
monterSchema();                                             // le gabarit, inchangé
monterSchema({ schema:'srcMount', legende:'srcLegende',     // un second schéma sur la même page
               dico:'srcDico',   data: DB_SOURCE });
```

Les valeurs par défaut sont celles d'avant : **une page déjà écrite ne change pas d'un octet**.
Le calque d'échelle est désormais une **classe** (`.db-scaler`) portée par le point de montage,
donc deux schémas ne se marchent plus dessus.

## L'axe ÉVOLUTION ne vit pas ici, et c'est un arbitrage

La demande d'origine voulait un axe *évolution* (créée / étendue / corrigée / reprise) **dans ce
modèle**, parce qu'un produit avait détourné la classification (`blue` = créée, `teal` =
complétée, `coral` = à corriger…) faute de mieux. Détourner la classification est un vrai défaut :
la couleur y désigne la **sensibilité de la donnée**, et un lecteur qui connaît la convention lit
alors « confidentiel · PII » là où l'auteur voulait dire « à corriger ».

Le remède n'est pas d'ajouter un second sens aux mêmes couleurs, c'est un **canevas dédié** :
`assets/template-schema-differentiel.html` porte trois états de table et trois états de colonne,
chacun avec sa teinte **et** son glyphe. Ce canevas-ci montre un schéma **à un instant**, avec sa
classification ; l'autre montre ce qui **change**. Mélanger les deux axes dans un seul modèle
rendrait chaque schéma ambigu, et aucune légende ne rattraperait cela.

## Architecture technique

Contrairement aux autres canevas (SVG pur), ce canevas est **hybride** : cartes-entités en HTML positionné absolument (texte sélectionnable, ellipsis natif) + calque SVG `.db-edges` superposé pour les arêtes. Le rendu est piloté par un **modèle déclaratif** `DB_SCHEMA_DATA` et un moteur JS embarqué — on n'écrit jamais les coordonnées à la main, on remplit le modèle.

```js
const DB_SCHEMA_DATA = {
  engine: "PostgreSQL + PostGIS · schéma public",
  bandes: [ { id:'ref', title:'Référentiel' }, { id:'metier', title:'Cœur métier' } ],
  tables: [
    { id:'cities', bande:'ref', name:'public.cities', role:'Référentiel communes', style:'gray',
      tip:"public.cities — Référentiel communes | Cible de la FK des annonces | Géométries PostGIS hors ORM",
      columns:[
        { n:'city_id', t:'integer', k:'PK' },
        { n:'insee_code', t:'char(5)', k:'UK', nn:true },
        { n:'contact_mail', t:'varchar', pii:true, note:'donnée personnelle' }
      ]}
  ],
  relations: [
    { from:'adverts', fromCol:'city_insee_code', to:'cities', toCol:'insee_code',
      card:'N–1', enforced:true,
      tip:"FK déclarée | adverts.city_insee_code → cities.insee_code | Jointure de recherche" }
  ]
};
```

## Modèle déclaratif — règles de remplissage

- **bandes** : colonnes verticales = domaines fonctionnels (référentiel, cœur métier, notifications, plateforme…). 3 à 5 bandes maximum. **Ordonner les bandes pour que les relations relient des bandes adjacentes** autant que possible.
- **tables** : `style` porte la classification — `gray` référentiel, `blue` transactionnel/interne, `coral` table contenant des PII, `teal` pilotage, `dashed` table externe / autre schéma référencée sans contrainte. La classification apparaît dans le dictionnaire (`Référentiel`, `Interne`, `Confidentiel · PII`, `Pilotage`, `Externe`).
- **columns** : `k` = `'PK' | 'UK' | 'FK'` (badges noir / violet / bleu), `nn` = NOT NULL (badge gris), `pii` = donnée personnelle (🔒 + nom en corail gras — icône ET couleur, jamais couleur seule), `note` = précision affichée dans le dictionnaire. Colonnes sœurs regroupables sur une ligne (`latitude / longitude`).
- **relations** : `enforced: true` = FK contrainte en base (trait plein bleu), `false` = référence logique sans FK (pointillé ambré) — distinction centrale en audit (risque d'orphelins). `card` = cardinalité (`N–1`, `1–1`…). `fromCol` / `toCol` ancrent l'arête sur la **ligne exacte** de la colonne.

## Routage des arêtes (géré par le moteur)

- Bandes adjacentes : L pur par le couloir vertical entre les bandes (GAPX 58px).
- Même bande : détour par la marge gauche.
- Saut de bande : couloir après la bande source → **voie horizontale sous les cartes intermédiaires** → couloir avant la bande cible. Jamais à travers une carte. Si le schéma devient illisible, préférer réordonner les bandes ou une carte fantôme de la table externe.
- Pointes de flèche colorées comme leur arête (`refX=8`), labels de cardinalité avec halo blanc (`paint-order: stroke`).
- **Mise à l'échelle automatique** (`fitSchema`) : le schéma est réduit pour tenir dans la largeur disponible — jamais de barre de défilement horizontale ou verticale, à l'écran comme à l'impression (refit à 700px sur `beforeprint`). Si l'échelle descend sous ~0,55 (schéma trop large), réduire le nombre de bandes ou tronquer les colonnes plutôt que de laisser le texte devenir illisible.

## Tooltips (couverture 100 %)

Format standard `Titre | Puce 1 | Puce 2` sur chaque table (`tip` : nom — rôle, contenu, particularités) et chaque relation (`tip` : nature [FK déclarée / référence logique], colonnes source → cible, condition ou risque). Rendus par le tooltip HTML carré `#diagTooltip` embarqué dans le template. Fallback automatique si `tip` absent, mais toujours rédiger les tips métier.

## Dictionnaire de données compagnon

Section 02 systématique : une carte par table (liseré couleur = classification) avec tableau Colonne / Type / Clé / Note. C'est là que vivent les `note` détaillées et la classification PII exhaustive — le schéma reste épuré, le dictionnaire est exhaustif.

## Légende et caption

Légende obligatoire doublant chaque code : carrés couleur + libellés pour les classifications, échantillons de trait (plein bleu = FK contrainte, pointillé ambré = référence logique). Caption `Figure N — Description courte.` sous le diagramme.

## Anti-patterns

- Coordonnées manuelles dans le HTML — tout passe par `DB_SCHEMA_DATA`
- Relation traversant une carte — réordonner les bandes ou laisser le moteur router par la voie basse
- PII signalée par la seule couleur — toujours 🔒 + graisse
- Toutes les colonnes d'une table très large — tronquer aux colonnes structurantes (clés, FK, PII, métier) et renvoyer au dictionnaire
- Mélange schéma physique / modèle ORM sans le dire — préciser la source de vérité dans le sous-titre ou les tips

Template prêt à instancier : `../assets/template-modele-donnees.html` (exemple d'instanciation : audit d'un produit réel). Remplacer `DB_SCHEMA_DATA`, le bloc méta, la caption et le footer ; ne pas modifier le moteur de rendu.
