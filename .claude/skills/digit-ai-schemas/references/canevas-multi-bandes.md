# Canevas multi-bandes · architecture par couches fonctionnelles

Format de référence pour représenter une architecture complexe organisée en couches hiérarchisées : entrées humaines, orchestration, composants applicatifs, observabilité, intégrations externes. C'est le canevas le plus expressif et le plus utilisé dans les livrables Digit-AI.

## Cas d'usage typiques

- Vue d'ensemble d'une architecture cible
- Détail des composants techniques d'un orchestrateur (avec attributs Azure DevOps : agent pool, service connection, branch policy, artefact)
- Architecture applicative avec ses dépendances vers des services tiers
- Tout schéma où la **logique en couches** prime sur la **séquence temporelle**

## Dimensions du viewBox

- **Largeur** : `1500` (extensible à 1600 si plus de 7 pipelines à afficher).
- **Hauteur** : `1180` typique (5 bandes + légende). À ajuster selon le nombre de bandes.
- Toujours laisser une marge de 30-40px en bas pour la légende.

## Anatomie · 5 bandes typiques

Une architecture multi-bandes complète comporte généralement cinq bandes horizontales empilées, séparées par des couloirs libres de 50-80px de hauteur pour le routage des flèches descendantes.

### Bande 1 · Entrées source et acteurs humains (y: 8 → 130)

Contient :
- Sources de données ou de code (repos git, référentiels) à gauche (couleur `gray`)
- Acteurs humains à droite (couleur `amber`)

Chaque nœud fait 195px de large × ~84px de haut. Espacement horizontal de 15px entre deux nœuds adjacents.

**Important** : positionner chaque acteur humain au-dessus du pipeline qu'il pilote, pour permettre des flèches descendantes droites sans détour. Si la grille des pipelines est aux x 127, 337, 547, 757, 967, 1177, 1387 (espacement 210px), alors les acteurs humains s'y alignent.

### Couloir 1 → 2 (y: 120 → 195)

Zone libre traversée par les flèches d'action humaine (`svg-arr-manual` orange pointillé). Aucun nœud ici. Le titre de bande 2 est placé dans une pastille blanche en **haut à gauche** de la bande 2, hors couloir.

### Bande 2 · Orchestration / pipelines (y: 195 → 560)

Le cœur du schéma. Cadre englobant en pointillé violet (`svg-frame`).

Chaque pipeline est une box de **195px × 320px** avec son détail technique exhaustif :
- Titre (M1, M2, …) en `svg-th 13px fill #4c1d95`
- Identifiant pipeline (`prod-{nom}/azp-m3.yml`) en `svg-tlabel` 10px
- Séparateur horizontal `<line>` léger
- Attributs Azure DevOps détaillés : Trigger, Agent pool, Service Connection, Managed Identity, Branch policy, Étapes, Artefact, Aval
- Chaque attribut a un libellé en `svg-tlabel font-weight:700 9.5px` puis sa valeur en `svg-ts 10px`
- Pastille jaune en bas pour `Référence intégrations N · M · P` ou `Gate DA Light · environment`

Espacement de 15px entre deux pipelines. Centres aux x 127, 337, 547, 757, 967, 1177, 1387 pour sept pipelines.

Flèches d'enchaînement courtes et horizontales entre pipelines, en `svg-arr-ai` (chaîne Agent IA, violet).

### Couloir 2 → 3 (y: 540 → 605)

Zone libre traversée par les flèches de provisioning (`svg-arr-auto` bleu plein). Le titre de bande 3 est en pastille blanche.

### Bande 3 · Composants applicatifs / environnements (y: 605 → 720)

Les environnements (RG Sandbox, RG DEV POC, RG DEV MVP, etc.) en boxes de 195px × 98px. Chaque RG porte sa convention de nommage en `svg-tlabel` (ex. `rg-dmv-{appcode}`) et sa subscription Azure.

Couleurs sémantiques :
- gray pour Sandbox
- blue pour DEV POC et DEV MVP
- teal pour STAGING
- coral pour PROD
- purple pour ressources transverses (ACR, Key Vault)

### Couloir 3 → 4 (y: 716 → 788)

Flèches grises pointillées (`svg-arr-dashed`) qui descendent vers l'observabilité.

### Bande 4 · Observabilité / monitoring / sécurité (y: 788 → 880)

Application Insights, Log Analytics, Elastic Cloud (teal), Sentinel, Defender (coral), Dashboard portfolio (teal), Action Groups (coral). Boxes 195px × 86px.

### Bande 5 · Intégrations externes numérotées (y: 900 → 1010)

Convention clé du canevas multi-bandes : **les intégrations externes sont référencées par numéro** plutôt que par flèches longues qui traverseraient plusieurs bandes.

Format de chaque intégration :
- Un **cercle numéroté** de rayon 14, fond pâle de la ramp, bordure 1.5px
- Une **box** à droite du cercle (170px × 54px) avec le nom, sa fonction courte, et un libellé `Réf. M3 · M7` indiquant quels pipelines la référent

```svg
<g class="svg-c-amber">
  <title>Intégration 1 · Cosign / sigstore | ...</title>
  <circle cx="50" cy="945" r="14" fill="#fef3c7" stroke="#92400e" stroke-width="1.5"/>
  <text x="50" y="950" text-anchor="middle" class="svg-th" style="font-size:13px;fill:#92400e">1</text>
  <rect x="74" y="918" width="170" height="54" rx="8"/>
  <text x="159" y="938" text-anchor="middle" class="svg-th" style="font-size:11.5px">Cosign / sigstore</text>
  <text x="159" y="954" text-anchor="middle" class="svg-ts">Signature OIDC · WIF</text>
  <text x="159" y="968" text-anchor="middle" class="svg-tlabel">Réf. M3 · M7</text>
</g>
```

En face, **dans chaque pipeline concerné**, une pastille jaune en bas affiche `Réf. intégrations 1 · 3 · 6` qui reprend les numéros. C'est ce système de référence numérique qui élimine les flèches diagonales longues.

Sous la bande 5, une rangée de services transverses (Hub Azure, Modules TF inner-source, Tenant Entra ID, Event Hub ingestion) en boxes plus larges (350px × 48px). Ce sont les services partagés qui n'appartiennent à aucune mission spécifique.

### Légende (y: 1090 → 1170)

Deux lignes :
- Ligne 1 : pastilles colorées avec libellés des sémantiques (Pipelines Agent IA, Environnements DEV, STAGING · observabilité, PROD · sécurité, Acteurs · intégrations, Sources · services transverses)
- Ligne 2 : flèches échantillon (Chaîne Agent IA, Provisioning / déploiement, Action humaine, Télémétrie, Référence intégration externe N)

## Règles de routage spécifiques à ce canevas

### Flèches descendantes acteur → pipeline (couloir 1→2)
Chaque acteur a un x identique à celui du pipeline qu'il pilote, donc la flèche est verticale droite. Si un acteur pilote plusieurs pipelines, choisir le pipeline principal pour le positionnement, et laisser les autres relations dans le contenu du tooltip.

### Flèches d'enchaînement entre pipelines (intra-bande 2)
Très courtes (15px), horizontales, en `svg-arr-ai`. Marker `arrAI` à droite uniquement.

### Flèches descendantes pipeline → environnement (couloir 2→3)
Verticales droites depuis le centre du pipeline jusqu'au centre de l'environnement, en `svg-arr-auto`. Si le pipeline et l'environnement ne sont pas alignés, dévier en L dans le couloir libre (y: 540-605).

### Flèches télémétrie environnement → observabilité (couloir 3→4)
Pointillées grises (`svg-arr-dashed`), sans marker (la télémétrie est un flux continu pas un appel discret).

### Pas de flèches longues vers la bande 5
**Utiliser le système de référence numérotée**. Aucune flèche ne traverse la bande 4 pour aller jusqu'aux intégrations.

## Exemple complet

Voir `../assets/template-multi-bandes.html` pour le template prêt à instancier.
Voir `../assets/exemple-reference.html` pour un cas réel complet (architecture POC-to-Prod Digit-AI).
