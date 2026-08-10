# Canevas modèle de données (ERD)

Schéma de base de données aux standards Digit-AI : cartes-entités listant les colonnes, relations ancrées colonne-à-colonne, classification des données (PII), dictionnaire de tables compagnon. Dérivé du socle D16 des rapports d'audit POC-to-Prod (projet réel), amélioré.

## Quand utiliser

- Modèle relationnel d'une application (tables, colonnes, clés, relations)
- Audit de schéma de BDD (domaine D16 du référentiel) : intégrité référentielle, indexation, PII
- Dictionnaire de données avec classification de sensibilité
- Signes : « schéma de base de données », « modèle de données », « ERD », « MCD/MLD », « les tables et leurs relations », « où sont les données personnelles »

Ne pas utiliser pour : flux de données entre systèmes (→ canevas multi-bandes), topologie d'infrastructure (→ canevas topologie).

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
