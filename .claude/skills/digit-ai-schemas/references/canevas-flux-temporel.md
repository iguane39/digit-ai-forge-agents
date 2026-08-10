# Canevas flux temporel · séquence chronologique avec swimlanes d'organisation

Format pour représenter une chaîne de pipelines ou d'événements qui se succèdent dans le temps, avec mise en évidence des frontières d'organisations (orgs Azure DevOps, équipes, environnements). C'est le canevas qui montre **le voyage d'un artefact** depuis sa source jusqu'à sa destination.

## Cas d'usage typiques

- Orchestration de pipelines depuis tag git jusqu'à PROD
- Promotion d'image entre environnements avec gates humains
- Cycle de vie d'un livrable (création → review → approbation → déploiement)
- Représentation d'une chaîne CI/CD avec ses artefacts intermédiaires

## Différence avec le canevas multi-bandes

| Multi-bandes | Flux temporel |
|---|---|
| Axe horizontal = sémantique (mission 1 à 7) | Axe vertical = temps (tag → PROD) |
| Pas de notion de durée entre les étapes | La position verticale matérialise l'ordre temporel |
| Frontières par fonction (orchestration / observabilité) | Frontières par organisation (org Squad / org DSI) |
| Tous les pipelines sont actifs en parallèle | Un pipeline déclenche le suivant en chaîne |

Si la question concerne « comment ça s'enchaîne dans le temps » → flux temporel. Si la question concerne « comment c'est structuré » → multi-bandes.

## Dimensions du viewBox

- **Largeur** : `1320` typique (assez pour 2-3 colonnes de swimlanes + colonne intégrations).
- **Hauteur** : `820` typique pour 7 étapes verticales + légende.

## Anatomie · colonnes (swimlanes) + axe temps vertical

### Axe temporel
Ligne horizontale en haut du SVG (y = 50) avec un titre en `svg-tband` à gauche : `Flux temporel · tag git → PROD`. Le temps s'écoule **du haut vers le bas**.

### Swimlane 1 · Org Squad (x: 32 → 412)

Cadre englobant en pointillé gris (`svg-frame stroke #94a3b8`). Titre en `svg-tband` placé en haut à gauche : `Org digitai-squad-innov`. Contient les étapes qui se déroulent côté Squad : tag git, pipeline M1, pipeline M2, gate DA Light.

### Swimlane 2 · Org DSI (x: 438 → 1288)

Cadre englobant en pointillé violet (`svg-frame stroke #5b21b6`). Titre `Org digitai-dsi-lz`. Plus large car contient le gros du parcours : M3, M4, M5, gate DA Finale, M6, triple approbation, M7.

À l'intérieur de cette swimlane, on peut sous-grouper en colonnes :
- Colonne centrale : les pipelines DSI (M3 à M7)
- Colonne droite 1 : les artefacts ACR (image -mvp, image -rc, image finale)
- Colonne droite 2 : les intégrations externes (Storage da-dossiers, API EasyVista, API CMDB)

## Étapes verticales

Chaque étape est une box de **350px × ~80px** (les pipelines) ou **350px × ~48px** (les gates et événements simples). Espacement vertical de 20px entre deux étapes.

Couleurs sémantiques :
- Pipelines en `svg-agent-mission` (variante violet pâle avec titre violet foncé)
- Gates humains en `svg-c-amber`
- Tags / événements en `svg-c-gray`
- Artefacts ACR : blue pour le tag MVP, teal pour le RC, coral pour le tag PROD final

### Format d'un pipeline

```svg
<g class="svg-agent-mission">
  <title>Pipeline M3 · Déploiement DEV MVP | Trigger : Go DA Light cross-org | ...</title>
  <rect x="456" y="184" width="350" height="80" rx="8"/>
  <text x="631" y="206" text-anchor="middle" class="svg-th" style="font-size:11.5px;fill:#4c1d95">Pipeline M3 · Déploiement DEV MVP</text>
  <text x="631" y="223" text-anchor="middle" class="svg-ts" style="fill:#5b21b6">prod-{nom}/azp-m3.yml · agent dsi-linux</text>
  <text x="631" y="240" text-anchor="middle" class="svg-tlabel" style="fill:#7c3aed">→ image vX.Y.Z-mvp (ACR DSI, signée Cosign)</text>
  <text x="631" y="256" text-anchor="middle" class="svg-tlabel" style="fill:#7c3aed">→ RG dmv-{appcode} déployé · baseline SLI 7j</text>
</g>
```

### Format d'un gate humain

```svg
<g class="svg-c-amber">
  <title>Gate humain DA Light | Environment Azure DevOps da-light-approval | Approvers : grp-digitai-da | Délai cible : 1 semaine</title>
  <rect x="50" y="360" width="340" height="56" rx="8"/>
  <text x="220" y="382" text-anchor="middle" class="svg-th" style="font-size:11.5px">Gate humain · DA Light</text>
  <text x="220" y="400" text-anchor="middle" class="svg-ts">Environment da-light-approval · approvers grp-digitai-da</text>
</g>
```

## Flèches temporelles · trois types

### Chaîne automatique (verticale, intra-swimlane)
Flèche `svg-arr-auto` (bleu plein, marker `arrPipe`) qui descend depuis le bas d'une étape vers le haut de la suivante. Très courte (~20px). Tooltip décrit la condition de déclenchement.

### Gate humain (verticale, traversant un gate)
Flèche `svg-arr-manual` (orange pointillé, marker `arrGate`) entre une étape et un gate humain, et entre le gate et l'étape suivante. Indique qu'une approbation humaine est requise pour franchir le gate.

### Artefact / intégration (horizontale, vers colonne droite)
Flèche `svg-arr-deliv` (gris pointillé court, marker `arrArt`) depuis un pipeline vers son artefact ACR ou une intégration externe (Storage, API).

### Transition cross-swimlane (entre org Squad et org DSI)
Flèche `svg-arr-manual` qui traverse la frontière entre les deux cadres. Souvent en L : descend depuis l'étape source, traverse horizontalement la frontière, descend dans la swimlane cible. Tooltip explique le passage de relais (typiquement « Go DA Light déclenche M3 via API cross-org »).

## Artefacts ACR à droite des pipelines

Convention : afficher l'artefact produit **à droite du pipeline qui le produit**, à la même hauteur verticale. Permet de visualiser la chaîne `-mvp → -rc → vX.Y.Z` qui se déroule **sans rebuild** entre M3, M6 et M7.

```svg
<!-- M3 produit l'image -mvp -->
<g class="svg-c-blue">
  <title>Tag image vX.Y.Z-mvp dans ACR DSI | Artefact signé produit par M3 | Origine de la chaîne de promotion sans rebuild</title>
  <rect x="830" y="184" width="220" height="60" rx="8"/>
  ...
</g>
<!-- Flèche M3 → artefact mvp -->
<path d="M806,224 L830,214" class="svg-arr-deliv" marker-end="url(#arrArt)">
  <title>Pipeline M3 pousse l'image signée vX.Y.Z-mvp dans l'ACR DSI.</title>
</path>
```

Les artefacts sont reliés par des flèches très courtes (les pipelines et les artefacts sont quasi-collés horizontalement).

## Intégrations externes à l'extrême droite

EasyVista, CMDB, Storage da-dossiers… Format identique aux artefacts mais une colonne plus à droite. Permet de voir d'un coup d'œil quels pipelines interagissent avec quels services tiers.

## Légende

Quatre items en ligne :
- Flèche bleue : « Chaîne auto pipelines »
- Flèche orange pointillée : « Gate humain · approbation »
- Flèche grise pointillée : « Artefact · intégration »
- Pastille pointillée : « Cadre organisation Azure DevOps »

## Variantes

### Variante simple (1 swimlane)

Pour un flux mono-organisation, supprimer le cadre Squad et garder uniquement le cadre DSI. Le viewBox peut être réduit à ~900px de large.

### Variante avec branches (rollback)

Si le flux comporte des branches (ex. rollback auto sur breach SLI), tracer une flèche `svg-arr-strong` qui remonte depuis l'étape qui échoue vers l'étape de rollback. Marker rouge ou coral pour signaler la nature exceptionnelle du flux.

## Exemple complet

Voir `../assets/template-flux-temporel.html` pour le template prêt à instancier.
