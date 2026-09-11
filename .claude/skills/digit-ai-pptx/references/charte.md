> **Reconstitué le 2026-09-11 depuis la description du SKILL.md v2.5.0 (TF-1022) ; réécrit le
> même jour en TABLE DE CORRESPONDANCE (TF-1023) — le skill consomme désormais
> `<marque>/tokens-diapositives.css` et sa source DTCG au lieu de valeurs en dur (décision
> humaine D-4 b, 11/09/2026, « 4b pour les powerpoints »). Les valeurs affichées ici sont une
> PHOTO datée du 11/09, dérivée du dossier de marque : elles ne font pas foi. La valeur qui
> fait foi est celle que `scripts/lire-marque.mjs` lit au moment de la génération.**

# Charte PPTX Digit-AI (v2) — quel jeton joue quel rôle sur une diapositive

Ce fichier ne dit plus *quelle couleur* ni *quelle police* : il dit **quel jeton** du système de
marque de l'émetteur peint **quoi**, sur **quel thème**. Les valeurs vivent chez l'émetteur
(`<marque>/tokens-diapositives.tokens.json`, source DTCG, et son dérivé CSS) ; le skill les
charge à l'étape 1 de son workflow. Ce qui n'est ni attesté par la charte v2 ni porté par un
jeton garde la mention `[à valider]` : aucune valeur n'est inventée en silence.

**Lecture des deux thèmes sur ce support.** Le thème **clair** est la diapositive de **contenu** ;
le thème **sombre** est la **couverture** et les **intercalaires**. Ce n'est pas une bascule
utilisateur, c'est une **navigation** : le contraste signale le changement de partie.

## 1 · Polices — correspondance jeton → usage

| Jeton | Clé rendue par `lire-marque.mjs` | Rôle sur la slide | Valeur au 11/09 (dérivée, ne fait pas foi) |
|---|---|---|---|
| `--head` | `police_titre` | titres-messages, titres de couverture et d'intercalaire, titres de carte | Montserrat (repli Roboto, system-ui) |
| `--sans` | `police_corps` | corps de texte, puces, labels, footer, pagination, notes | Inter (repli DM Sans, system-ui) |
| `--mono` | `police_mono` | extraits techniques, identifiants, codes de lot | JetBrains Mono (repli ui-monospace, Consolas) |
| — | — | **interdite, sans exception** : Syne | — |

`lire-marque.mjs` rend la **première** famille de la pile pour pptxgenjs (une face de police, pas
une pile CSS) : la police doit être installée sur le poste de rendu, sinon PowerPoint substitue
en silence. **Graisses, corps et interlignage : [à valider]** — ni la charte v2 ni les jetons du
support « diapositives » ne portent d'échelle typographique. Ne pas les figer slide par slide.

## 2 · Palette — correspondance jeton → usage

Les valeurs de la colonne de droite sont celles **lues le 11/09/2026** dans
`donnees/marque/tokens-diapositives.tokens.json` du produit `digit-ai-marketing`. Elles sont
là pour qu'un relecteur reconnaisse la charte, **pas** pour être recopiées dans un script.

| Thème | Jeton | Clé rendue | Rôle sur la slide | Valeur au 11/09 (dérivée, ne fait pas foi) |
|---|---|---|---|---|
| clair (contenu) | `--bg` | `fond_contenu` | fond de **toute slide de contenu** | `#FAFBFF` — **attesté** par la charte v2 |
| clair | `--card` | `surface_carte` | fond des cartes et encarts | `#FFFFFF` — **[à valider]** |
| clair | `--ink` | `encre_contenu` | titre-message et texte courant sur fond clair | `#0F172A` — **[à valider]** |
| clair | `--muted` | `encre_faible_contenu` | mentions secondaires, footer, pagination | `#64748B` — **[à valider]** |
| clair | `--line` | `trait_contenu` | séparateurs, contours d'encart, filets de tableau | `#E6EAF2` — **[à valider]** |
| clair | `--blue` | `accent_filets` | **filets haut et bas de slide**, accents de titraille, puces | `#2563EB` — **attesté** par la charte v2 |
| sombre (couverture, intercalaires) | `--bg` | `fond_couverture` | fond de la **couverture** et de **chaque intercalaire** | `#0F172A` — **[à valider]** : la charte v2 nomme le fond sombre sans le chiffrer ; valeur reprise de l'encre du socle HTML |
| sombre | `--card` | — | panneau sur fond sombre (hors panneau **blanc** de couverture) | `#172033` — **[à valider]** |
| sombre | `--ink` | `encre_couverture` | titre et texte sur fond sombre | `#EEF2F8` — **[à valider]** |
| sombre | `--muted` | `encre_faible_couverture` | sous-titre, kicker de couverture, footer d'intercalaire | `#A9B4C4` — **[à valider]** |
| sombre | `--line` | `trait_couverture` | séparateurs sur fond sombre | `#263248` — **[à valider]** |
| sombre | `--blue` | `accent_couverture` | accent lisible sur fond sombre (jamais l'accent du thème clair) | `#7DA2F5` — **[à valider]** |

**Couleurs sémantiques** (`--green`, `--amber`, `--teal`, `--red` et leurs `-fill` / `-line`,
dans les deux thèmes) : portées par le dossier de marque, **[à valider]** pour ce support — la
charte v2 ne dit pas si un statut se peint sur une diapositive ni comment. Ne pas s'en servir
sans arbitrage ; si arbitrage il y a, passer par le jeton, jamais par une valeur écrite.

**Charte v1 (claire)** : existe, n'est servie que **sur demande explicite** — le défaut est la
v2 (« couverture et intercalaires sur fond sombre, contenu sur le fond clair — le contraste
signale la navigation »). Elle se sert en peignant **toutes** les slides avec le thème clair,
**jamais** en changeant les valeurs des jetons.

## 3 · Dimensions

| Élément | Valeur | Statut |
|---|---|---|
| Format de slide | 16:9 | **[à valider]** — jamais énoncé ; déduit du seul repère dimensionnel de la source (cf. ci-dessous) |
| Unité des coordonnées | **pouce** (convention pptxgenjs) | attesté indirectement : `x=0.35, y=0.22, w=0.78, h=0.26` pour le logo |
| Largeur × hauteur en pouces | `10 × 5.625` (16:9 par défaut de pptxgenjs) | **[à valider]** |
| Épaisseur des filets | jeton `--filet-epaisseur`, clé `filet_epaisseur_pouces` | porté par le dossier de marque — `4px` au 11/09, soit `0.0417` pouce (96 px/pouce) — **[à valider]** pour ce support |
| Échelle d'espacement (marges, gouttières, gaps) | jetons `--espace-xs` … `--espace-2xl`, rendus en px **et** en pouces | portés par le dossier de marque (échelle 4pt) ; leur **emploi** sur une diapositive est **[à valider]** |
| Rayons de coin des cartes | jetons `--r`, `--r-sm` | portés par le dossier de marque ; emploi **[à valider]** |
| Marges de slide, colonnes, retrait des filets | — | **[à valider]**, non décrits par la charte v2 |

Le **seul** repère dimensionnel littéral de la charte v2 est la boîte du logo officiel :
`x=0.35, y=0.22, w=0.78, h=0.26`.

> **Contradiction relevée le 2026-09-11, non arbitrée ici.** Cette boîte est décrite comme
> « haut gauche de chaque slide » dans la liste des assets du `SKILL.md` v2.5.0, alors que le
> garde-fou du même fichier interdit le logo en haut à gauche des slides (« le logo Digit-AI ne
> vit qu'à deux endroits : le panneau blanc de la couverture et la slide canonique
> interlocuteurs »). **Le garde-fou prime** (il est postérieur et explicitement absolu) ; la
> boîte reste la géométrie du logo **dans le panneau blanc de la couverture**. À trancher par le
> porteur de la charte — la réécriture du 11/09 (TF-1023) ne l'a pas arbitrée.

## 4 · Filets, header, footer, pagination

- **Filets d'accent** (`--blue` du thème clair, clé `accent_filets`) en haut et en bas : sur
  **toute** slide. Épaisseur : jeton `--filet-epaisseur`. Retrait : **[à valider]**.
- **Header** : le titre-message **seul** ouvre la slide. **Aucun eyebrow / kicker** au-dessus du
  titre (pas de « 01 · VOTRE ENJEU », pas de « CADRE DE LECTURE · … »). Les étiquettes en
  majuscules **à l'intérieur** des cartes restent autorisées.
- **Exception unique** : le kicker de **couverture** « PROPOSITION COMMERCIALE » est autorisé —
  couverture uniquement.
- **Footer avec pagination** : obligatoire, sauf sur la **couverture** (pas de footer).
  L'**intercalaire**, lui, porte le footer. Encre du footer : `--muted` du thème du fond.
  Contenu exact du footer (mention légale, date, nom de client) : **[à valider]**.

## 5 · Logo

Le logo Digit-AI ne vit qu'à **deux** endroits, jamais ailleurs :

1. le **panneau blanc de la couverture** ;
2. la **slide canonique interlocuteurs**.

Aucune slide de contenu ni intercalaire ne porte de logo, image ou texte. Un logo se pose
toujours en `containBox` (ratio préservé), jamais étiré pour remplir un bandeau
(cf. `references/drive-assets.md` §5). Le fichier du logo officiel est **non livré** avec le
skill (cf. `SKILL.md`, section « Non livré ») : repli texte dans le panneau blanc.

## 6 · Navigation — sommaire et intercalaires

Règle de **bijection**, sans exception : si le deck contient une slide sommaire, **chaque**
entrée du sommaire ouvre sa section par un intercalaire sombre `{NN} · {Titre}`, numérotation
et intitulés **strictement identiques** au sommaire. Soit tous, soit aucun (deck sans sommaire).
La bijection se vérifie à la passe QA finale.

## 7 · Langue et année

Toujours **français**. Année de référence : **2026**, sauf instruction contraire.

## 8 · Baseline

« L'IA à taille humaine » — baseline de couverture attestée par le gabarit B de
`digit-ai-propale`. Toute autre formulation de marque : **[à valider]**.

## 9 · Ce que cette charte ne fixe pas (non jugé)

Icônes, jeu de puces, style de tableau, emploi des couleurs sémantiques sur une diapositive,
ombres, animations, gabarit de notes de présentateur, échelle typographique (graisses, corps,
interlignage). Le dossier de marque porte des jetons pour une partie d'entre eux (sémantiques,
rayons, espacements) mais **pas** leur usage sur ce support : ne pas les improviser slide par
slide — les faire trancher par le porteur de la charte, puis les écrire **ici, comme usage**, et
chez l'émetteur, **comme valeur**.
