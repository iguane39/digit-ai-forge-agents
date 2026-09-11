> **Reconstitué le 2026-09-11 depuis la description du SKILL.md v2.5.0 (TF-1022) — valeurs de
> marque à remplacer par la consommation du système de marque Digit-AI (tokens.css + MARQUE.md,
> TF-1023) ; à valider**

# Charte PPTX Digit-AI (v2) — palette, polices, dimensions, footer/header

Ce fichier ne contient **que** ce que le `SKILL.md` v2.5.0 et `references/drive-assets.md`
énoncent explicitement, plus les valeurs marquées **à valider** quand la source décrit un
élément sans en donner la valeur. Aucune valeur n'a été inventée en silence : tout ce qui
n'est pas littéralement attesté par la source porte la mention `[à valider]`.

## 1 · Polices

Deux polices seulement, et une interdite. Ce chapitre dit laquelle porte quel rôle,
et ce que la source ne fixe pas.

| Rôle | Police | Attesté par |
|---|---|---|
| Titres | **Montserrat** | `SKILL.md` front-matter + garde-fou « Montserrat (titres) et Inter (corps), point. » |
| Corps, labels, footer | **Inter** | idem |
| Interdite, sans exception | **Syne** | garde-fou « **Jamais** la police "Syne" » |

Graisses, corps et interlignage : **[à valider]** — la source ne les fixe pas. À dériver de
l'échelle typographique de `tokens.css` (TF-1023) plutôt que d'être figés ici.

## 2 · Palette

Les deux couleurs attestées littéralement par la source, le jeton de fond sombre qu'elle
nomme sans le chiffrer, et ce qui manque encore pour peindre une slide complète.

| Jeton | Valeur | Usage attesté |
|---|---|---|
| `accent` | `#2563EB` | filets bleus haut/bas de slide |
| `bgContent` | `#FAFBFF` | fond des slides de **contenu** (charte v2) |
| `bgDark` | **[à valider]** | fond de la **couverture** et des **intercalaires** (« fond sombre `bgDark` ») — la source nomme le jeton mais ne donne pas sa valeur hexadécimale |
| `textOnDark` / `textOnLight` | **[à valider]** | non énoncés par la source |

**Charte v1 (claire)** : existe, n'est servie que **sur demande explicite** — le défaut est la
v2 (« couverture et intercalaires sur fond sombre, contenu sur `#FAFBFF` — le contraste signale
la navigation »). Valeurs de la v1 : **[à valider]**, non décrites par la source.

## 3 · Dimensions

La source ne donne qu'UNE cote. Ce chapitre l'isole, dit l'unité qu'elle implique, et
marque tout le reste comme à valider plutôt que de le déduire en silence.

| Élément | Valeur | Statut |
|---|---|---|
| Format de slide | 16:9 | **[à valider]** — jamais énoncé ; déduit du seul repère dimensionnel de la source (cf. ci-dessous) |
| Unité des coordonnées | **pouce** (convention pptxgenjs) | attesté indirectement : `x=0.35, y=0.22, w=0.78, h=0.26` pour le logo |
| Largeur × hauteur en pouces | `10 × 5.625` (16:9 par défaut de pptxgenjs) | **[à valider]** |
| Marges, gouttières, colonnes | — | **[à valider]**, non décrites |

Le **seul** repère dimensionnel littéral de la source est la boîte du logo officiel :
`x=0.35, y=0.22, w=0.78, h=0.26`.

> **Contradiction relevée le 2026-09-11, non arbitrée ici.** Cette boîte est décrite comme
> « haut gauche de chaque slide » dans la liste des assets du `SKILL.md`, alors que le garde-fou
> du même fichier interdit le logo en haut à gauche des slides (« le logo Digit-AI ne vit qu'à
> deux endroits : le panneau blanc de la couverture et la slide canonique interlocuteurs »).
> **Le garde-fou prime** (il est postérieur et explicitement absolu) ; la boîte reste la
> géométrie du logo **dans le panneau blanc de la couverture**. À trancher par le porteur de la
> charte.

## 4 · Filets, header, footer, pagination

- **Filets bleus** (`#2563EB`) en haut et en bas : sur **toute** slide. Épaisseur et retrait :
  **[à valider]**.
- **Header** : le titre-message **seul** ouvre la slide. **Aucun eyebrow / kicker** au-dessus du
  titre (pas de « 01 · VOTRE ENJEU », pas de « CADRE DE LECTURE · … »). Les étiquettes en
  majuscules **à l'intérieur** des cartes restent autorisées.
- **Exception unique** : le kicker de **couverture** « PROPOSITION COMMERCIALE » est autorisé —
  couverture uniquement.
- **Footer avec pagination** : obligatoire, sauf sur la **couverture** (pas de footer).
  L'**intercalaire**, lui, porte le footer. Contenu exact du footer (mention légale, date,
  nom de client) : **[à valider]**.

## 5 · Logo

Le logo Digit-AI ne vit qu'à **deux** endroits, jamais ailleurs :

1. le **panneau blanc de la couverture** ;
2. la **slide canonique interlocuteurs**.

Aucune slide de contenu ni intercalaire ne porte de logo, image ou texte. Un logo se pose
toujours en `containBox` (ratio préservé), jamais étiré pour remplir un bandeau
(cf. `references/drive-assets.md` §5).

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

Icônes, jeu de puces, style de tableau, couleurs sémantiques (succès / alerte / neutre),
ombres, rayons de coin des cartes, animations, gabarit de notes de présentateur. La source
n'en dit rien ; ne pas les improviser slide par slide — les faire trancher en même temps que
`tokens.css` (TF-1023).
