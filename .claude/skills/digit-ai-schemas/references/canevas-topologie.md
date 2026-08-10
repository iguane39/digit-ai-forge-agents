# Canevas topologie · relations spatiales entre zones réseau

Format pour représenter une topologie où la **structure spatiale** prime : hub-and-spoke, isolation de zones, peering, segmentation réseau, hiérarchie de subscriptions.

## Cas d'usage typiques

- Topologie réseau Azure hub-and-spoke
- Segmentation par environnement (sandbox / dev / prod)
- Cartographie de connectivité (ExpressRoute, VPN, peering inter-régions)
- Hiérarchie de management groups / subscriptions / RG

## Dimensions du viewBox

- **Largeur** : `1400` typique.
- **Hauteur** : `720` typique pour 3 bandes (zones isolées + hub central + spokes).
- Marges 20-30px à chaque bord.

## Anatomie · 3 bandes verticales

### Bande 1 · Zones isolées (y: 8 → 220)

Pour les zones réseau qui **ne sont pas peerées au hub** (Sandbox, DEV POC). Cadre englobant en pointillé gris (`svg-frame stroke #94a3b8`).

À l'intérieur du cadre, les RG isolés en boxes côte à côte (200px × 114px chacun). Couleurs sémantiques : gray pour Sandbox, blue pour DEV POC.

Le cadre porte un titre de bande type `1 · Squad Innovation · isolé (pas de peering hub)` en pastille blanche en haut.

### Bande 2 · Hub central (y: 240 → 360)

Le VNet hub Digit-AI au centre, en boxe large (700px × 74px) couleur `purple`. Contient :
- Titre principal `VNet Hub Digit-AI (/20)` en `svg-th 13px`
- Sous-titre listant les composants : `Azure Firewall Premium · Azure Bastion · ExpressRoute Gateway`
- Note en `svg-tlabel` : `Filtrage sortant · routing est-ouest entre spokes`

À droite du hub, une boxe ExpressRoute (200px × 74px) couleur `amber`. Flèche bidirectionnelle entre les deux (`marker-start` ET `marker-end`).

### Bande 3 · Spokes peerés (y: 380 → 660)

Tous les spokes DSI alignés horizontalement, en boxes de **305px × 240px** chacune. Espacement de 18px entre deux spokes.

Centres aux x 192, 515, 838, 1161 pour quatre spokes (DEV MVP, STAGING, PROD, Platform). Pour trois spokes, espacer davantage. Pour cinq spokes, réduire la largeur des boxes à ~265px.

Chaque spoke contient :
- Titre du RG (ex. `RG DEV MVP`) en `svg-th 13px`
- Sous-titre VNet (ex. `VNet /24 · peering hub`) en `svg-tlabel 10px`
- 3 sub-boxes de subnet (265px × 42px chacune), fond blanc avec bordure de la couleur ramp :
  - Subnet Container Apps (`/27 délégué Microsoft.App`)
  - Subnet Private Endpoints (`/27 · KV + ACR + AI Foundry`)
  - Subnet Management (`/28 · Bastion · monitoring`)
- Note en bas en `svg-tlabel` (ex. `NSG · Defender Containers`)

Couleurs des spokes :
- blue pour DEV MVP
- teal pour STAGING
- coral pour PROD
- purple pour Platform (ressources transverses)

## Flèches de peering · couloirs verticaux dédiés

**Règle critique pour ce canevas** : les quatre flèches de peering qui partent du haut de chaque spoke vers le hub doivent éviter de se croiser. Pour cela, chacune monte verticalement depuis son spoke jusqu'à une hauteur de couloir (y ≈ 370), puis va horizontalement vers un point d'arrivée **dédié et distinct** sous le hub (y = 352).

Points d'arrivée sous le hub (espacés latéralement) :
- DEV MVP arrive à x = 580
- STAGING arrive à x = 660
- PROD arrive à x = 740
- Platform arrive à x = 820

Ces quatre points sont sous la boxe du hub mais à des x différents, ce qui fait qu'il n'y a aucun croisement de flèches.

```svg
<!-- DEV MVP → Hub : couloir gauche -->
<path d="M192,418 L192,370 L580,370 L580,352" fill="none" stroke="#475569" stroke-width="1.5" marker-end="url(#arrNet)">
  <title>Peering VNet bidirectionnel RG DEV MVP ↔ hub | ...</title>
</path>

<!-- PROD → Hub : couloir centre-droit (note : le x du couloir est 378, qui est x_centre_PROD_décalé pour éviter STAGING) -->
<path d="M838,418 L838,378 L740,378 L740,352" fill="none" stroke="#475569" stroke-width="1.5" marker-end="url(#arrNet)">
  <title>Peering VNet bidirectionnel RG PROD ↔ hub | ...</title>
</path>
```

Pour rendre la bidirectionnalité visuellement, soit ajouter un `marker-start` symétrique, soit garder le flèche unidirectionnelle (peering bilatéral mais la convention « ↔ » est dans le tooltip).

## Flèche hub ↔ ExpressRoute

Horizontale, bidirectionnelle. Utiliser `marker-start` ET `marker-end` :
```svg
<line x1="1050" y1="315" x2="1080" y2="315"
      class="svg-arr-strong"
      marker-end="url(#arrNet)"
      marker-start="url(#arrNetStart)">
  <title>Connexion ExpressRoute bidirectionnelle | ...</title>
</line>
```

## Légende

Compacte, sur une ligne :
- Flèche échantillon « Peering VNet bidirectionnel »
- Pastille pointillée « Spoke isolé (sans peering hub) »
- Note textuelle : « Tous les services PaaS (Key Vault, ACR, AI Foundry, Storage) sont exposés via Private Endpoint dans le subnet PE dédié de chaque spoke »

## Variantes de ce canevas

### Variante hiérarchique (management groups)

Pour représenter une hiérarchie Azure (tenant → management groups → subscriptions → RG), utiliser des **cadres imbriqués** en pointillé, avec un titre en haut à gauche de chaque cadre. Le cadre extérieur est gray, les enfants sont colorés selon leur fonction.

### Variante multi-régions

Pour une topologie multi-régions (ex. PROD primaire en West Europe + secondaire en North Europe), dupliquer la bande 3 horizontalement et indiquer la région dans le titre de chaque cadre. Une flèche `svg-arr-strong` traverse les régions pour le DR / réplication.

## Exemple complet

Voir `../assets/template-topologie.html` pour le template prêt à instancier.
