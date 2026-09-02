# Conventions communes Digit-AI · à appliquer sur tous les canevas

Ce document énonce les règles non-négociables. À lire intégralement avant de produire un schéma. Pour les détails par canevas, voir les fichiers `canevas-*.md` séparés.

## 1 · Palette sémantique

La couleur encode le **type fonctionnel** du nœud, pas un choix esthétique arbitraire. À chaque ramp correspond un trio (fond pâle, texte foncé, bordure intermédiaire).

| Sémantique | Ramp | Fond | Texte | Bordure | Usage typique |
|---|---|---|---|---|---|
| Pipelines, automation, Agent IA | purple | `#ede9fe` | `#5b21b6` | `#c4b5fd` | Pipelines Azure DevOps, modules de l'orchestrateur, briques d'outillage |
| Modules centraux, référentiels, environnements DEV | blue | `#dbeafe` | `#1d4ed8` | `#93c5fd` | Repos source, RG DEV POC / DEV MVP, services PaaS standards |
| Pilotage, dashboards, observabilité, STAGING | teal | `#ccfbf1` | `#0f766e` | `#5eead4` | Dashboard portfolio, App Insights, Log Analytics, Elastic, RG STAGING |
| Cartographie, éléments critiques, PROD, sécurité | coral | `#fee2e2` | `#b91c1c` | `#fca5a5` | RG PROD, Sentinel, Defender, alertes critiques |
| Exports externes, synchronisations, intégrations | amber | `#fef3c7` | `#92400e` | `#fcd34d` | Acteurs humains, EasyVista, CMDB, Cosign, Storage da-dossiers |
| Acteurs, données partagées, services transverses | gray | `#f1f3f7` | `#374151` | `#cbd5e1` | Sources git, hub Azure, modules TF, RG Sandbox |

**Règle de cohérence :** ne pas mélanger les ramps pour un même type de nœud. Si un pipeline est purple à un endroit, il est purple partout. Tracer la sémantique avant de commencer à colorier.

## 2 · Typographies obligatoires

Trois familles, jamais plus. **Jamais de Syne.**

| Famille | Usage | Poids typiques |
|---|---|---|
| `Roboto` | Titres H1/H2/H3, titres de nœuds dans le SVG | 700 (titres médians), 800 (H1, titres principaux) |
| `DM Sans` | Corps de texte, sous-titres, légendes, prose | 400 (corps), 500 (emphase légère) |
| `JetBrains Mono` | Code inline (noms de pipelines, paths, identifiants Azure), eyebrows, labels SVG | 400 |

Tailles indicatives dans le SVG :
- Titre de nœud : `font-size: 12-13px; font-weight: 700; font-family: Roboto`
- Sous-titre : `font-size: 10.5-11px; font-family: DM Sans`
- Label monospace (code, eyebrow) : `font-size: 9.5-10px; font-family: JetBrains Mono; letter-spacing: 0.06em`
- Titre de bande : `font-size: 9.5-10.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase`

## 3 · Classes CSS SVG standardisées

Réutiliser ces classes telles quelles, ne pas en inventer d'autres pour la même fonction. À déclarer dans le bloc `<style>` de la page hôte (cf canevas).

### Classes textuelles
```css
.svg-th { font-family: 'Roboto', sans-serif; font-weight: 700; font-size: 12.5px; fill: var(--ink); }
.svg-ts { font-family: 'DM Sans', sans-serif; font-size: 10.5px; fill: var(--ink-soft); }
.svg-tm { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; fill: var(--ink-muted); letter-spacing: 0.06em; }
.svg-tlabel { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; fill: var(--ink-muted); letter-spacing: 0.04em; }
.svg-tband { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; }
```

### Classes de flèches
```css
.svg-arr { fill: none; stroke: #475569; stroke-width: 1.5; }
.svg-arr-strong { fill: none; stroke: var(--ink); stroke-width: 2; }
.svg-arr-dashed { fill: none; stroke: #94a3b8; stroke-width: 1.4; stroke-dasharray: 5 3; }
.svg-arr-ai { fill: none; stroke: #5b21b6; stroke-width: 2; }       /* Chaîne Agent IA */
.svg-arr-auto { fill: none; stroke: #1d4ed8; stroke-width: 1.6; }   /* Provisioning automatique */
.svg-arr-manual { fill: none; stroke: #b45309; stroke-width: 1.8; stroke-dasharray: 5 3; }  /* Action humaine */
.svg-arr-deliv { fill: none; stroke: #64748b; stroke-width: 1.3; stroke-dasharray: 2 3; }   /* Livrable / intégration */
```

### Classes de nœuds par ramp
Une classe par couleur sémantique, à appliquer sur un `<g>` qui contient `<rect>` + `<text>` :
```css
.svg-c-purple rect { fill: #ede9fe; stroke: #c4b5fd; stroke-width: 1.4; }
.svg-c-purple text { fill: #5b21b6; }
.svg-c-blue rect   { fill: #dbeafe; stroke: #93c5fd; stroke-width: 1.4; }
.svg-c-blue text   { fill: #1d4ed8; }
/* ...etc pour teal, coral, amber, gray */
```

### Cadre englobant en pointillé
```css
.svg-frame { fill: none; stroke-width: 1.2; stroke-dasharray: 4 4; }
```
À appliquer sur un `<rect>` qui englobe toute une zone fonctionnelle (ex. : la bande des pipelines, le cadre d'une organisation Azure DevOps). La couleur du stroke encode la nature de la zone (violet pour l'Agent IA, gris pour neutre).

### Superpositions voulues et `data-overlap-ok` (TF-0424, lot Produit-05 20260820a)

`render_page.py` V4 juge les **chevauchements entre nœuds** et entre nœud et flèche. Les formes
internes d'un **groupe titré** (`<g><title>…</title><rect/><text/></g>`) se superposent par
construction — un nœud de schéma est UN objet — et ne sont plus jugées : grouper chaque nœud
dans un `<g>` porteur d'un `<title>` suffit, **sans poser `data-overlap-ok` sur chaque forme**
(l'exemple de référence en portait 581, déduits de l'exemple faute de doc). `data-overlap-ok`
reste la déclaration d'une superposition voulue **entre nœuds** (badge sur un coin de boîte,
étiquette à cheval sur une flèche) : il se pose sur l'un des deux éléments frères concernés,
et il documente un choix, pas une gêne.

## 4 · Markers de flèches

Toujours définir les markers dans `<defs>` au début du SVG, avec `refX=9` (pointe nette qui touche bien le bord du nœud cible) :

```svg
<defs>
  <marker id="arrL" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0,0 L10,5 L0,10 z" fill="#475569"/>
  </marker>
  <marker id="arrAI" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0,0 L10,5 L0,10 z" fill="#5b21b6"/>
  </marker>
  <marker id="arrAuto" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0,0 L10,5 L0,10 z" fill="#1d4ed8"/>
  </marker>
  <marker id="arrMan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0,0 L10,5 L0,10 z" fill="#b45309"/>
  </marker>
</defs>
```

Pour les flèches bidirectionnelles, ajouter un marker `*-Start` avec `refX=1` et l'utiliser via `marker-start="url(#arrNetStart)"`.

## 5 · Règles de routage des flèches (critiques)

### Règle d'or
**Une flèche ne traverse jamais un nœud non concerné.** Avant de tracer, vérifier que la trajectoire est libre. Si elle ne l'est pas, dévier en L.

### Forme des flèches
- **L pur** (un seul coude) : depuis A descend verticalement, puis va horizontalement vers B. Ou inverse. **Jamais en escalier multiple** (plusieurs coudes successifs).
- **Ligne droite** quand A et B sont alignés horizontalement ou verticalement.
- **Pas de courbes de Bézier** sauf cas exceptionnel justifié.

### Couloirs verticaux dédiés
Quand plusieurs flèches descendent en parallèle d'une bande supérieure vers une bande inférieure :
- Chaque flèche a un **x unique** correspondant au centre vertical de son nœud source ET de son nœud cible (alignement vertical strict des nœuds source et cible).
- Si les nœuds source et cible ne sont pas à la même position x, dévier dans un **couloir libre** (zone entre deux bandes sans nœud) avant de rejoindre le x cible.
- Éviter les arrivées multiples au même point : décaler les points d'arrivée latéralement (ex. 580, 660, 740, 820 pour quatre flèches qui convergent vers un même nœud large).

### Marqueurs aux extrémités
- **`refX=9`** pour que la pointe touche le bord du nœud sans le pénétrer (les marqueurs `refX=8` ou moins laissent un espace visible disgracieux).
- Couleur du marker = couleur de la flèche (jamais de mismatch).

## 6 · Titres de bande

**Toujours dans une pastille blanche encadrée**, placée hors du couloir des flèches descendantes. Format type :

```svg
<rect x="20" y="195" width="290" height="22" rx="6" fill="#ffffff" stroke="#5b21b6" stroke-width="0.8"/>
<text x="32" y="211" class="svg-tband" style="fill:#5b21b6;font-size:9.5px">2 · Orchestration · pipelines Azure DevOps</text>
```

La pastille a :
- Une **bordure** dans la couleur sémantique de la bande (purple pour pipelines, slate pour bandes neutres).
- Une **hauteur ~22px** pour englober le texte sans trop charger.
- Une **largeur ajustée au texte** (laisser ~14px de padding interne).
- Un **placement à gauche du SVG** ou dans une zone clairement libre, jamais sous une flèche descendante.

Numérotation préfixée (`1 · `, `2 · `, `3 · `) pour les bandes hiérarchisées.

## 7 · Tooltips structurés

### Convention de formatage du contenu

Le contenu du `<title>` SVG doit suivre le format `Titre | Puce 1 | Puce 2 | ... | Puce N` :
- **Avant le premier `|`** : titre du tooltip (texte court, type nom et nature du nœud)
- **Après chaque `|`** : une puce
- Chaque puce peut commencer par un libellé suivi de `:` qui sera mis en gras (« Trigger : », « Agent pool : », « Rôle : »)
- Les codes inline (paths, identifiants Azure, noms de SP) sont entourés de backticks (\`) qui seront rendus en monospace sur fond gris.

Exemple :
```svg
<title>Pipeline Mission 1 · Récupération du POC | Trigger : webhook tag git `vX.Y.Z-poc` | Agent pool : `digitai-squad-linux` | Service Connection : `sp-azp-squad` via WIF OIDC | Artefact : `poc-context.json` | Aval : enchaîne automatiquement M2</title>
```

### Script de rendu

Le script JavaScript qui transforme ces `<title>` en tooltips HTML stylés est dans `assets/tooltip-script.html`. **Toujours l'inclure** dans la page hôte juste avant `</body>`. Il :
- Intercepte le hover sur tous les éléments porteurs de `<title>` dans les `.diagram-wrap svg`
- Désactive le tooltip natif du navigateur (souvent étalé sur une seule ligne, sans formatage)
- Affiche à la place un tooltip HTML carré, fond slate-800, puces avec marqueur violet, codes en monospace
- Restaure le `<title>` au mouseleave pour conserver l'accessibilité lecteurs d'écran

### Couverture obligatoire

- **100 % des nœuds visibles** doivent porter un `<title>` structuré.
- **100 % des flèches porteuses de sens métier** doivent porter un `<title>` (les flèches purement décoratives en sont exemptées).
- Les acteurs humains, intégrations externes et bandes transverses doivent avoir des tooltips particulièrement détaillés (3-5 puces).

### Style éditorial des puces

- Phrases déclaratives, sans abréviations non explicitées.
- Pas de point final sur une puce courte (style libellé). Point final si la puce contient plusieurs phrases.
- Pas de jargon non défini : le tooltip doit pouvoir être lu par un membre de la Design Authority qui ne connaît pas tous les détails techniques.

## 8 · Page HTML hôte (variables CSS racine)

Toujours déclarer ces variables dans `:root` de la page hôte pour permettre les ajustements globaux :

```css
:root {
  --bg: #ffffff;
  --bg-soft: #f7f8fa;
  --bg-softer: #fbfbfc;
  --ink: #0f172a;
  --ink-soft: #334155;
  --ink-muted: #64748b;
  --line: #e2e8f0;
  --line-soft: #eef1f5;
  --line-strong: #cbd5e1;
  --accent: #2563eb;

  --c-purple-bg: #ede9fe;   --c-purple-fg: #5b21b6;   --c-purple-stroke: #c4b5fd;
  --c-blue-bg:   #dbeafe;   --c-blue-fg:   #1d4ed8;   --c-blue-stroke:   #93c5fd;
  --c-teal-bg:   #ccfbf1;   --c-teal-fg:   #0f766e;   --c-teal-stroke:   #5eead4;
  --c-coral-bg:  #fee2e2;   --c-coral-fg:  #b91c1c;   --c-coral-stroke:  #fca5a5;
  --c-amber-bg:  #fef3c7;   --c-amber-fg:  #92400e;   --c-amber-stroke:  #fcd34d;
  --c-gray-bg:   #f1f3f7;   --c-gray-fg:   #374151;   --c-gray-stroke:   #cbd5e1;
}
```

## 9 · Encapsulation du SVG

Le SVG est toujours dans une `div.diagram-wrap` :

```css
.diagram-wrap {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 28px 20px;
  overflow-x: auto;
  margin: 20px 0 12px;
  position: relative;  /* requis pour ancrage du tooltip custom */
}
.diagram-wrap svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
.caption {
  font-style: italic; font-size: 13px;
  color: var(--ink-muted); text-align: center;
  margin-top: 6px; margin-bottom: 4px;
}
```

Le SVG utilise **toujours `viewBox`**, jamais `width` / `height` fixes en pixels. Cela permet le responsive et l'impression PDF.

## 10 · Accessibilité

- Toujours `role="img"` sur le `<svg>` racine.
- Toujours `aria-labelledby="diag{N}-title diag{N}-desc"` qui pointe vers un `<title id="diag{N}-title">` et un `<desc id="diag{N}-desc">` placés en premiers enfants du SVG.
- Le `<title>` du SVG racine est une phrase courte décrivant ce que montre le schéma (sera lu par les lecteurs d'écran avant le contenu).
- Le `<desc>` est plus long (3-5 phrases) et décrit la structure pour permettre la compréhension sans voir.
- Contraste minimum WCAG AA respecté sur toutes les paires fond/texte (la palette ci-dessus est conçue pour respecter cela).
- Pas de couleur seule comme porteur d'information : doubler avec un libellé ou une forme (ex. les flèches d'action humaine sont à la fois orange ET en pointillé).

## 11 · Responsive et print

```css
@media (max-width: 720px) {
  /* SVG en scroll horizontal sur petit écran via overflow-x du wrapper */
}
@media print {
  .diagram-wrap { background: #fff; break-inside: avoid; }
  body { font-size: 11pt; }
}
```

Le rendu doit être directement utilisable via "Imprimer en PDF" du navigateur sans réglage particulier. Tester systématiquement.

## 12 · Légende

Toujours présente en bas du SVG (ou à la fin de la page si plusieurs schémas), structurée en deux lignes :

- Ligne 1 : pastilles colorées qui rappellent la sémantique (pipelines, environnements, intégrations, etc.)
- Ligne 2 : courtes flèches échantillon avec leur libellé (Chaîne Agent IA, Provisioning, Action humaine, Livrable / intégration, Référence numérotée)

Format des items de légende :
```svg
<g transform="translate(40, 1108)">
  <rect x="0" y="0" width="14" height="14" rx="3" fill="#ede9fe" stroke="#5b21b6"/>
  <text x="22" y="11" class="svg-ts" style="font-size:11px">Pipelines Agent IA</text>
  <!-- ...autres items espacés de ~180px... -->
</g>
```

## 13 · Footer

Toujours en bas de la page hôte, format imposé :

```html
<footer class="footer">
  <div class="brand">DIGIT-AI · CONSEIL ET STRATÉGIE IA</div>
  <div>{Type document} · {Audience} · {Année}</div>
</footer>
```

La marque du footer est **paramétrable**, et c'est le seul point de la charte qui le soit.

- **Défaut, et valeur employée quand rien n'est déclaré** : `DIGIT-AI · CONSEIL ET STRATÉGIE IA · 2026`.
- **Engagement client** : un fichier `charte-livrable.json` à la racine du projet en cours
  (ou sous `$FORGE_ROOT`) porte `{ "marque": "…", "baseline": "…", "annee": "2026" }` ; s'il
  existe, ses valeurs remplacent la marque et la baseline du footer, et le reste de la charte
  — polices, palette, routage des flèches, tooltips — ne bouge PAS.
- **Ce fichier ne se commite jamais dans un dépôt publié** : il porte un nom de client, et un
  nom de client dans un dépôt public est une fuite. C'est une donnée, pas du code (loi n° 4).

*Pourquoi un paramètre et pas un skill par client (27/08/2026).* Un second générateur avait été
forké pour un engagement : même canevas, même palette, même typographie, marque échangée. Le
fork a divergé — il lui manquait une section entière du générateur maison — et son NOM, qui
portait celui du client, fuitait dans un registre publié. Un paramètre ne diverge pas et ne
nomme personne.

Année toujours `2026` jusqu'à modification explicite des instructions.

CSS du footer :
```css
.footer {
  margin-top: 80px; padding-top: 24px;
  border-top: 1px solid var(--line);
  display: flex; justify-content: space-between;
  flex-wrap: wrap; gap: 12px;
  font-size: 12px; color: var(--ink-muted);
}
.footer .brand { font-family: 'Roboto', sans-serif; font-weight: 700; letter-spacing: 0.06em; }
```
