> **Reconstitué le 2026-09-11 depuis la description du SKILL.md v2.5.0 (TF-1022) — valeurs de
> marque à remplacer par la consommation du système de marque Digit-AI (tokens.css + MARQUE.md,
> TF-1023) ; à valider**

# Layouts PPTX Digit-AI

## Ce qui est attesté, et ce qui ne l'est pas

La source (`SKILL.md` v2.5.0) ne nomme que **trois** layouts, et par leur **numéro** :

> « `references/layouts.md` §Layouts 9-11 | Gabarits photo (couverture panneau photo,
> texte+visuel 60/40, visuel+étapes) issus de la propale Client-I »

Elle atteste par ailleurs **les familles** attendues dans la table des références :
« Choix des layouts (couverture, sommaire, cartes, roadmap, tableaux) ».

Conséquence : **les layouts 9, 10 et 11 sont attestés (nom + numéro)** ; les layouts **1 à 8
sont reconstitués** à partir des familles citées et de l'ordre de lecture d'un deck Digit-AI —
leur **numérotation est une déduction**, pas une donnée. Chacun porte `[à valider]`.
Aucune géométrie (boîtes, colonnes, tailles) n'est donnée par la source : toute cote ci-dessous
est marquée `[à valider]`.

## Table des layouts

Comment lire ce tableau. Une ligne = un layout. La colonne **Statut** est la seule qui
engage : `attesté` = nom ET numéro donnés par la source ; `numéro [à valider]` = le layout
existe (sa famille est citée) mais sa place dans la numérotation est une déduction de ce
versionnement. Le tri suit l'ordre de lecture d'un deck, pas un ordre d'importance. Aucune
cote n'y figure : la source n'en donne pas.

| N° | Nom | Fond | Footer | Illustration | Statut |
|---:|---|---|---|---|---|
| 1 | **Couverture** — panneau blanc (logo Digit-AI + logo client) + kicker « PROPOSITION COMMERCIALE » + titre-bénéfice + baseline + photo d'habillage | `bgDark` | **non** | oui (photo d'habillage) | numéro `[à valider]`, contenu attesté |
| 2 | **Sommaire** — sections numérotées `01`…`0N` | `bgContent` | oui | **jamais** | numéro `[à valider]` |
| 3 | **Intercalaire** — `{NN} · {Titre}`, un par entrée du sommaire | `bgDark` | oui | **jamais** | numéro `[à valider]` |
| 4 | **Contenu — titre + corps** : titre-message seul en tête, corps en une ou deux colonnes | `bgContent` | oui | ~1 sur 2 | numéro `[à valider]` |
| 5 | **Cartes** — grille de 3, 4 ou 6 cartes à label majuscule interne | `bgContent` | oui | rarement (grille dense) | numéro `[à valider]` |
| 6 | **Roadmap / trajectoire** — lots en bandeau horizontal, durée et promesse par lot | `bgContent` | oui | non | numéro `[à valider]` |
| 7 | **Tableau** — Lot / Durée / Tarif forfait, avec ligne TOTAL | `bgContent` | oui | **jamais** (slide dense) | numéro `[à valider]` |
| 8 | **Investissement / prix** — gros chiffre € HT, décomposition, modalités | `bgContent` | oui | **jamais** (règle absolue) | numéro `[à valider]` |
| **9** | **Couverture panneau photo** — variante de couverture où un panneau plein porte la photo | `bgDark` | non | oui | **attesté** (nom + numéro) |
| **10** | **Texte + visuel 60/40** — colonne de texte 60 %, panneau visuel 40 % | `bgContent` | oui | oui | **attesté** |
| **11** | **Visuel + étapes** — panneau visuel + liste d'étapes numérotées | `bgContent` | oui | oui | **attesté** |
| 12 | **Interlocuteurs** — slide canonique, photos de profil rondes (cf. `references/assets.md`) | `[à valider]` | `[à valider]` | photos fonctionnelles, hors rythme | numéro `[à valider]` |
| 13 | **Réalisations** — slide canonique (cf. `references/assets.md`) | `[à valider]` | `[à valider]` | `[à valider]` | numéro `[à valider]` |

## §Layouts 9-11 — les trois gabarits photo (attestés)

Issus d'une propale du corpus (client pseudonymisé **Client-I**). Ce sont les seuls layouts que
la source désigne nommément ; ils partagent la même mécanique d'image :

- le visuel est posé en **contain-fit** dans son **panneau** (`containBox`,
  `references/drive-assets.md` §5) — jamais `w` **et** `h` figés ;
- **aucun cadre** : les coins arrondis viennent d'un masque alpha (`prepare_images.py`),
  l'espace résiduel du panneau reste le fond de slide ;
- le panneau préfère une image **paysage** (la bibliothèque l'est majoritairement) : elle
  remplit un panneau haut sans micro-format.

**Layout 9 — couverture panneau photo.** Variante de la couverture : un panneau plein porte la
photo d'habillage, le panneau blanc porte les logos et le kicker. Géométrie des panneaux :
`[à valider]`.

**Layout 10 — texte + visuel 60/40.** Titre-message pleine largeur, puis deux zones : texte à
~60 %, panneau visuel à ~40 % (aligné à droite par défaut, `addPhoto(..., "right")`). Les
proportions 60/40 sont attestées par le nom du layout ; les marges, `[à valider]`.

**Layout 11 — visuel + étapes.** Panneau visuel d'un côté, liste d'étapes numérotées de
l'autre. Nombre d'étapes supporté et géométrie : `[à valider]`.

## Règles de layout valables partout (attestées par le SKILL.md)

- **Filets bleus** haut et bas sur toute slide ; footer + pagination partout sauf couverture.
- **Aucun eyebrow / kicker** au-dessus du titre, sauf le kicker de couverture.
- **Aucun logo** sur une slide de contenu ou un intercalaire.
- **Illustration ≈ 1 slide de contenu sur 2**, jamais sur intercalaire, sommaire, ou
  prix/investissement ; sauter une slide déjà dense (tableau, grille 6 cartes) et reporter
  l'image sur la suivante éligible.
- **Bijection sommaire ↔ intercalaires** : soit tous, soit aucun.
- Le **type de chaque slide** (cover / sommaire / intercalaire / contenu / investissement /
  interlocuteurs / annexe) est fourni par `digit-ai-propale` : c'est lui qui rend le rythme
  d'illustration et les exclusions déterministes.

## Non jugé

Grilles de construction, cotes, tailles de police par layout, comportement en débordement,
variantes 4:3. La source n'en dit rien ; les faire trancher avec `tokens.css` (TF-1023).
