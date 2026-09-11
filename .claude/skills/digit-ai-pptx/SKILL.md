---
name: digit-ai-pptx
description: >
  Crée tout PowerPoint à la charte Digit-AI (propales, plans de transformation, formations,
  kickoffs, COPIL, restitutions). Ne porte AUCUNE valeur de marque : il charge les jetons du
  support « diapositives » chez l'émetteur et en dérive polices, couleurs et cotes —
  couverture et intercalaires sur le thème sombre, contenu sur le thème clair, filets, logo,
  footer, pagination, nommage ; sans dossier de marque, il rend la main. Construit le slide
  canonique "Vos interlocuteurs chez Digit-AI" avec le deck.
  Use when / déclencher dès que l'utilisateur demande de créer, mettre à jour, refondre,
  charter ou produire un PowerPoint pour Digit-AI ou pour un client de Digit-AI, quel que soit
  son nom (pseudonymisé : Client-A, Client-F…), ou parle de propale, deck, slides,
  présentation en contexte Digit-AI. Ne pas déclencher pour rédiger ou chiffrer une
  proposition commerciale (→ digit-ai-propale), pour l'auditer avant envoi
  (→ digit-ai-propale-review), ni pour un livrable hors charte Digit-AI (→ systeme-de-marque).
metadata:
  version: "2.6.0"
---

# Digit-AI PowerPoint Skill

Encode les **règles de composition** des livrables PPTX Digit-AI (charte v2) et **consomme** les
**valeurs** de marque là où elles vivent : chez l'émetteur.

> **Journal du 2026-09-11 — v2.6.0 (TF-1022 / TF-1023, décision humaine D-4 « 4b pour les
> powerpoints »).** Ce skill ne peint plus depuis des valeurs écrites dans son texte. Il
> **charge** les jetons du support « diapositives » du dossier de marque de l'émetteur
> (source DTCG + dérivé CSS) par `scripts/lire-marque.mjs`, et rend la main si ce dossier
> n'est pas joignable. Les couleurs et polices en dur du corps de ce fichier sont remplacées
> par le **nom du jeton** ; `references/charte.md` devient une table de correspondance
> jeton → usage PowerPoint. Les règles de composition (filets, kicker, logo à deux endroits,
> footer, bijection sommaire ↔ intercalaires) sont inchangées : ce ne sont pas des valeurs.
>
> **Journal du 2026-09-11 — v2.5.1 (TF-1021 / TF-1022).** Ce skill ne vivait qu'en archive.
> À sa mise en source : (a) les noms de clients et de personnes ont été **pseudonymisés** ;
> (b) `references/charte.md`, `references/layouts.md` et `references/assets.md` ont été
> **reconstitués** depuis la description de la v2.5.0 ; (c) les ressources citées par la v2.5.0
> mais **jamais livrées** ont été retirées du corps de ce fichier plutôt que réinventées —
> elles sont listées telles quelles sous « Non livré », section où chaque ligne porte la
> mention pour que le self-test ne la compte pas comme lien mort.

## Langue et année

Toujours produire en **français**. Année de référence : **2026** (sauf instruction contraire).

## D'où viennent les valeurs (et ce qui se passe quand elles manquent)

Une couleur, une police, une cote sont des **données périssables** : elles vivent chez
l'émetteur, datées et sourcées, jamais dans ce skill. Ce skill n'en connaît que les **noms de
jetons** et l'**usage** qu'il en fait sur une diapositive.

- **Dossier de marque** : donné par l'appelant, dans cet ordre — paramètre `--marque <dossier>`,
  puis variable d'environnement `DIGIT_AI_MARQUE`, puis, pour Digit-AI, le chemin par défaut
  `<racine des forges>/digit-ai-marketing/donnees/marque/`.
- **Artefacts lus** : la source DTCG `<marque>/tokens-diapositives.tokens.json` fait foi ; le
  dérivé `<marque>/tokens-diapositives.css` sert de repli. Le dérivé aplatit les alias sur le
  thème clair — préférer la source quand les deux sont là (c'est le défaut du lecteur).
- **Lecture des deux thèmes sur ce support** : le thème **clair** est la diapositive de
  **contenu**, le thème **sombre** est la **couverture** et les **intercalaires**. Ce n'est pas
  une bascule utilisateur, c'est une navigation : le contraste signale le changement de partie.
- **Sans dossier de marque joignable, ou s'il manque un jeton requis : RENDRE LA MAIN.** Le
  skill ne retombe sur aucune valeur en dur, ne devine pas une couleur, ne substitue pas une
  police « proche ». Il dit ce qui manque, où il a cherché, et s'arrête — un deck peint avec
  une charte inventée est un défaut, pas un dépannage.
- **Mentions [à valider]** : le dossier de marque porte sa propre documentation (`<marque>/MARQUE.md`
  chez l'émetteur). Ce qui y est marqué à valider le reste ici : ne pas le figer dans le deck
  sans arbitrage du porteur de la charte.

## Workflow par défaut

1. **Charger le système de marque** — `node scripts/lire-marque.mjs` (options ci-dessus).
   Sortie JSON : les jetons par thème, les polices et les cotes, déjà convertis pour
   pptxgenjs (hexadécimal **sans dièse**, pouces depuis les px à 96 px/pouce, face de police).
   **Exit 2 ⇒ s'arrêter et rendre la main**, en citant le message du lecteur.
2. Charger `references/charte.md` — table de correspondance **jeton → usage PowerPoint**,
   règles de composition, dimensions — **toujours**.
3. Identifier les layouts nécessaires dans `references/layouts.md`.
4. Si slides canoniques demandés (interlocuteurs, réalisations) : consulter `references/assets.md`.
5. **Images** — charger `references/drive-assets.md` : couverture (logo Digit-AI + logo client
   + photo d'habillage), illustrations sur **≈ 1 slide de contenu sur 2** (jamais intercalaire,
   sommaire, prix). Sélection par tags, préparation via `prepare_images.py` (webp→PNG, coins
   arrondis sans cadre), placement **contain-fit** (ratio préservé, jamais d'étirement).
6. Construire le PPTX avec pptxgenjs, **en n'écrivant que des valeurs venues de l'étape 1** :
   aucune couleur ni police littérale dans le script de génération — les lire depuis le JSON.
7. **Passe QA finale (obligatoire)** : rasteriser tout le deck (PDF → PNG) et inspecter
   **chaque** slide — aucune image déformée / hors zone / encadrée, aucun texte qui déborde
   d'un encart ou de la slide, bijection sommaire ↔ intercalaires. Corriger à la source et
   **re-générer** si défaut. Détail : `references/drive-assets.md` §8.
8. Nommer selon la convention ci-dessous, livrer dans `/mnt/user-data/outputs/` via `present_files`.

Le slide canonique « Vos interlocuteurs » se **construit avec le deck** (étape 6), il ne se
greffe pas sur un PPTX existant : l'outil de fusion XML décrit par la v2.5.0 est **non livré**
(cf. « Non livré », note du 2026-09-11). Pour charter un PPTX reçu, le **reconstruire**
(« garder le fond, changer la forme »).

## Correspondance jeton → usage, en un coup d'œil

Les clés `usages_pptx` rendues par l'étape 1, et ce qu'elles peignent. Valeurs : jamais ici.

| Clé rendue | Thème | Jeton | Ce qu'elle peint |
|---|---|---|---|
| `fond_contenu` | clair | `--bg` | fond des slides de contenu |
| `encre_contenu` / `encre_faible_contenu` | clair | `--ink` / `--muted` | titre-message, texte courant / mentions secondaires, footer |
| `surface_carte` | clair | `--card` | fond des cartes et encarts |
| `trait_contenu` | clair | `--line` | séparateurs, contours d'encarts, filets de tableau |
| `accent_filets` | clair | `--blue` | filets haut et bas, accents de titraille, puces |
| `fond_couverture` | sombre | `--bg` | fond de la **couverture** et des **intercalaires** |
| `encre_couverture` / `encre_faible_couverture` | sombre | `--ink` / `--muted` | texte sur fond sombre |
| `accent_couverture` | sombre | `--blue` | accent lisible sur fond sombre |
| `police_titre` / `police_corps` / `police_mono` | — | `--head` / `--sans` / `--mono` | titres / corps et labels / extraits techniques |
| `filet_epaisseur_pouces` | — | `--filet-epaisseur` | épaisseur des filets, déjà en pouces |

Les cotes d'espacement (`dimensions`) arrivent en px **et** en pouces : composer avec l'échelle
de l'émetteur plutôt qu'avec des marges improvisées slide par slide.

## Convention de nommage des livrables

**Format strict** : `Digit-AI - {TypeDoc} {Client} - {Scope} - {YYYYMMDD}{itération}.{ext}`

- Espaces autour des tirets, **pas d'underscores**, pas de caractères spéciaux dans le scope
- `TypeDoc` au singulier : Propal, Plan Transfo, Support, Kickoff, COPIL, Restitution, Note
- `Client` en MAJUSCULES si possible (CLIENT-K, CLIENT-A, CLIENT-F) ou tel que prononcé
- `Scope` court, sans `+` ni `&` (tirets simples) : `L0-L3`, `F1-F2-C1-C2`, `Formation 20-5`
- `itération` = suffixe alphabétique a, b, c… incrémenté à chaque révision du même jour

Exemple : `Digit-AI - Propal Client-F - L0-L3 - 20260422h.pptx`

## Outillage

Création from-scratch : **pptxgenjs (Node.js)**, installé globalement. Aucun outil de
manipulation XML directe n'est livré avec ce skill (cf. « Non livré »).

**Dépendance Python** : les deux scripts d'images (`scripts/fetch_drive_assets.py`,
`scripts/prepare_images.py`) importent **Pillow** (`PIL`) — validation d'image et dimensions
réelles pour le premier, transcodage et masque alpha pour le second. Prérequis :
`pip install Pillow`. Sans Pillow, l'étape 5 (images) échoue ; le reste du workflow tient.
`scripts/lire-marque.mjs` et `scripts/self-test.mjs` sont en Node pur, **sans dépendance**.

## Références chargées à la demande

Aucun de ces fichiers ne se lit d'office, sauf le premier. La colonne de droite dit le
moment exact où le charger — charger tout d'avance coûte du contexte pour rien.

| Fichier | Charger quand |
|---|---|
| `references/charte.md` | **Systématiquement avant toute génération PPTX**, après l'étape 1 : il dit quel jeton joue quel rôle, jamais quelle est sa valeur |
| `references/layouts.md` | Choix des layouts (couverture, sommaire, cartes, roadmap, tableaux) |
| `references/drive-assets.md` | **Toute image du deck** : 3 dépôts Digit-AI (illustrations tagués, logos, profils webp) via canal public curl ; sélection par tags ; préparation `prepare_images.py` (webp→PNG, coins arrondis **sans cadre**) ; placement **contain-fit** (ratio préservé, jamais d'étirement) ; couverture logos + photo ; rythme ~1 contenu/2 ; **passe QA débordements**. Alt. MCP Drive privé |
| `references/layouts.md` §Layouts 9-11 | Gabarits photo (couverture panneau photo, texte+visuel 60/40, visuel+étapes) issus de la propale Client-I |
| `references/assets.md` | Utilisation des slides canoniques (interlocuteurs, réalisations) |

## Scripts livrés

- `scripts/lire-marque.mjs` — **charge le système de marque de l'émetteur** et rend les jetons
  du support « diapositives » en JSON, convertis pour pptxgenjs. Exit 2 avec message nommant le
  dossier exploré ou le jeton manquant. Fixtures : `fixtures/marque-valide` (verte, valeurs
  attendues dans `attendu.json`) et `fixtures/marque-sans-blue` (rouge, exit 2). Node, sans dépendance.
- `scripts/fetch_drive_assets.py` — liste / cherche par tag / télécharge / valide des images d'un dossier Drive public (raccourcis `images`, `logos`, `profils` ; webp reconnu). **Requiert Pillow.**
- `scripts/prepare_images.py` — prépare pour embarquement PPTX : transcodage webp/gif→PNG, coins arrondis (masque alpha, **sans cadre**), calcul contain-fit, manifest JSON. **Requiert Pillow.**
- `scripts/self-test.mjs` — self-test du skill : liens relatifs du SKILL.md (C1), absence de nom
  de client (C2), consommation effective du système de marque sur les deux fixtures (C3),
  absence de valeur de marque en dur dans ce fichier (C4). Node, sans dépendance.

## Non livré (constat daté du 2026-09-11, TF-1022)

Ressources citées par la v2.5.0 et **absentes du paquet**. Elles ne sont **pas** réinventées ici :
le renvoi est retiré du workflow, le manque est déclaré.

- Logo officiel Digit-AI (PNG) — **non livré**. Repli : texte propre dans le panneau blanc.
- Photos N&B carrées des interlocuteurs — **non livré**. Repli : dépôt `profils` (cf. `references/drive-assets.md`).
- Fragment XML du slide « interlocuteurs » — **non livré**. Repli : construire le slide avec pptxgenjs.
- Script de fusion XML d'un slide canonique dans un PPTX existant — **non livré**. Aucun repli : le patch de PPTX n'est pas outillé.
- Squelette pptxgenjs pré-câblé — **non livré**. Repli : partir de l'étape 1 + `references/charte.md` + `references/layouts.md`.
- Snippets pptxgenjs (addBanners / addHeader / addFooter) — **non livré**, non reconstituable sans le code d'origine.
- Recueil des structures récurrentes des livrables passés — **non livré**, non reconstituable sans le corpus.

## Garde-fous

- **Jamais de valeur de marque en dur.** Aucune couleur hexadécimale, aucune famille de police,
  aucune cote de charte écrite dans le script de génération : tout vient de l'étape 1. Une
  valeur qu'on ne sait pas rattacher à un jeton est une question à poser, pas une valeur à
  inventer. Sans dossier de marque : **rendre la main**.
- **Jamais** d'underscore dans les noms de fichiers livrés
- **Jamais** la police "Syne" — les titres prennent le jeton `--head`, le corps le jeton
  `--sans`, point.
- **Jamais** de PPTX sans : filets d'accent (`--blue`) haut/bas, footer avec pagination
  (exception : la couverture n'a pas de footer ; l'intercalaire, si)
- **Jamais de logo en haut à gauche des slides** — le logo Digit-AI ne vit qu'à deux
  endroits : le panneau blanc de la couverture et la slide canonique interlocuteurs.
  Aucune slide de contenu ni intercalaire ne porte de logo (image ou texte).
- **Jamais d'eyebrow / kicker au-dessus du titre d'une slide** (aucun libellé en
  majuscules espacées type « 01 · VOTRE ENJEU » ou « CADRE DE LECTURE · … ») —
  le titre-message ouvre seul la slide. Les étiquettes en majuscules à l'INTÉRIEUR
  des cartes (labels de carte) restent autorisées. Le kicker de la couverture
  (« PROPOSITION COMMERCIALE ») reste autorisé — couverture uniquement.
- **Sommaire ⇒ un intercalaire par partie, sans exception.** Si le deck contient une
  slide sommaire, CHAQUE entrée du sommaire ouvre sa section par un intercalaire sombre
  « {NN} · {Titre} » — numérotation et intitulés strictement identiques au sommaire.
  Interdit d'en poser pour certaines parties seulement : soit toutes, soit aucune
  (deck sans sommaire). Vérifier la bijection sommaire ↔ intercalaires au QA final.
- **Charte v2 par défaut** : couverture et intercalaires sur le fond du thème **sombre**
  (`fond_couverture`), contenu sur le fond du thème **clair** (`fond_contenu`) — le contraste
  signale la navigation. Variante claire de bout en bout (v1) : sur demande explicite, en
  peignant toutes les slides avec le thème clair — jamais en changeant les valeurs.
- **Images : ratio d'origine préservé partout, jamais d'étirement** (contain-fit via
  `containBox`, jamais `w`+`h` figés) et **aucun cadre** (pas de `line` ; arrondi = masque
  alpha via `prepare_images.py`). webp/gif → PNG avant embarquement. Suivre `references/drive-assets.md`.
- **Illustrations : ≈ 1 slide de contenu sur 2**, jamais sur intercalaire, sommaire, ni
  prix/investissement. La couverture porte logo Digit-AI + logo client + une photo d'habillage.
  La slide interlocuteurs porte ses photos de profil (hors de ce rythme).
- **Passe QA finale non négociable** : rasteriser + inspecter chaque slide (image déformée /
  hors zone / encadrée, **texte qui déborde d'un encart ou de la slide**, zones qui se
  chevauchent). Corriger à la source et re-générer — jamais livrer avec un débordement.
- **Toujours** vérifier visuellement le rendu avant de livrer (conversion PDF + lecture des slides)

## Exemple type

- « Crée une propale pour X, périmètre Y » → `scripts/lire-marque.mjs` (étape 1) +
  `references/charte.md` + `references/layouts.md` + `references/drive-assets.md` ; couverture
  (logos + photo) + sommaire + contenu (images ~1/2) + interlocuteurs ; QA ; nommer ; livrer.
- « Mets le slide interlocuteurs à la fin de ce PPTX » → `references/assets.md` ; le slide se
  **reconstruit** avec le deck (l'outil de greffe XML est **non livré**) ; vérifier ; nouveau
  suffixe de date.
- « Reformate ce PPTX à la charte » → étape 1 puis `references/charte.md` ; reconstruire ;
  garder le fond, changer la forme.
- « Le deck est pour un autre émetteur que Digit-AI » → même workflow, `--marque <son dossier>` ;
  si ce dossier n'existe pas encore, le faire produire (skill `systeme-de-marque`) **avant** de
  générer quoi que ce soit.
