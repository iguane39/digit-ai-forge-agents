# Canevas tableau de bord · KPI portfolio et synthèses comparatives

Format pour représenter une **vue synthétique d'un parc** : score de conformité par POC, trajectoire de maturité par environnement, comparatif visuel entre éléments. Optimisé pour la lecture rapide par un comité (Design Authority, COMEX, DSI).

## Cas d'usage typiques

- Dashboard portfolio des POCs (palier de maturité, score conformité, baseline SLI, incidents)
- Vue par environnement (coût mensuel cumulé, taux de conformité moyen, MTTR moyen)
- Vue par chapitre du Standard (% d'applications conformes par chapitre)
- Comparatif Crawl / Walk / Run

## Spécificité de ce canevas

Contrairement aux trois autres canevas qui sont 100% SVG, le canevas tableau de bord **utilise du HTML/CSS classique** pour les blocs structurés (cards KPI, grilles, tableaux), et **insère du SVG uniquement pour les visualisations** (graphes, jauges, micro-charts).

C'est plus économique en place mémoire et plus accessible aux lecteurs d'écran qu'un SVG monolithique.

## Anatomie · grille modulaire

### Bandeau supérieur · KPIs principaux (4 tuiles)

Quatre tuiles horizontales (`grid-template-columns: repeat(4, 1fr)`) pour les KPIs principaux. Chaque tuile :
- Valeur en gros (`font-family: Roboto; font-weight: 800; font-size: 28px`) dans la couleur sémantique
- Libellé en dessous (`font-family: DM Sans; font-size: 13px; color: var(--ink-soft)`)
- Bordure gauche colorée de 3px pour la sémantique (purple pour pipelines, teal pour observabilité, etc.)

Exemple HTML :
```html
<div class="kpi-grid">
  <div class="kpi">
    <div class="kpi-value">23</div>
    <div class="kpi-label">POCs actifs · tous paliers confondus</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">7.8</div>
    <div class="kpi-label">Score conformité moyen · Standard Complet</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">5</div>
    <div class="kpi-label">Applications en PROD</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">3.2j</div>
    <div class="kpi-label">MTTR moyen · 90 derniers jours</div>
  </div>
</div>
```

CSS associé :
```css
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin: 24px 0 8px;
}
.kpi {
  background: #fff;
  border: 1px solid var(--line);
  border-left: 3px solid var(--c-purple-fg);
  border-radius: 8px;
  padding: 18px 20px;
}
.kpi-value {
  font-family: 'Roboto', sans-serif;
  font-weight: 800;
  font-size: 28px;
  color: var(--c-purple-fg);
  line-height: 1;
  margin-bottom: 6px;
}
.kpi-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  color: var(--ink-soft);
  line-height: 1.35;
}
```

### Section · vue par POC (cards en grille)

Une carte par POC du portfolio. Grille responsive avec `minmax(280px, 1fr)`. Chaque carte contient :
- Nom du POC (titre Roboto 700 16px)
- Tag de palier (pilule colorée : gray pour P1, amber pour P2, purple pour P3)
- Petit graphe radar SVG inline pour les 4 axes : conformité, observabilité, sécurité, FinOps
- Score global (Roboto 800 24px)
- Tags supplémentaires (Squad responsable, dernière MEP, etc.)

### Section · trajectoire Crawl / Walk / Run

Trois colonnes côte à côte avec :
- En-tête de palier (numéro en `JetBrains Mono` + nom du palier en Roboto 800)
- Liste des composants attendus à ce palier (puces sobres)
- Barre de progression du palier (% d'éléments effectivement en place)

Réutiliser la structure `.trajectory` du livrable Architecture détaillée (déjà conforme).

### Section · tableau comparatif

Tableau standard Digit-AI :
- En-tête fond `var(--bg-soft)` + texte `--ink-muted` 11px majuscules espacées
- Lignes alternées légères au hover
- Première colonne en `font-weight: 500` couleur ink
- Bordures `border-bottom: 1px solid var(--line-soft)` fines

### Micro-charts SVG inline (optionnel)

Pour visualiser une tendance ou une distribution, insérer un mini-SVG de 200 × 60px max dans une cellule. Conventions :
- Courbe en `stroke-width: 1.5; stroke: var(--c-purple-fg); fill: none`
- Si plusieurs courbes superposées (paliers Crawl/Walk/Run), utiliser amber, teal, purple
- Pas de labels d'axe (le contexte du tableau suffit)
- Pas de zone remplie (line chart pur)

## Anti-patterns

- **Pas de gros camemberts** : peu lisibles. Préférer des barres horizontales ou des KPI chiffrés.
- **Pas de 3D, ombres, dégradés** : flat design strict.
- **Pas de couleurs aléatoires** : la palette sémantique est obligatoire (purple = automatisation, teal = pilotage, coral = critique, etc.).
- **Pas de tooltips JS sur les KPI** : les valeurs doivent être directement compréhensibles. Si une valeur a besoin d'explication, ajouter une icône `(?)` qui ouvre un détail.

## Exemple complet

Voir `../assets/template-tableau-de-bord.html` pour le template prêt à instancier.
