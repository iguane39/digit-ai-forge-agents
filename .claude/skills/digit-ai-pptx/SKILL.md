---
name: digit-ai-pptx
description: >
  Crée tout PowerPoint à la charte Digit-AI (propales commerciales, plans de transformation,
  supports de formation, kickoffs, comités de pilotage, restitutions). Applique automatiquement la
  charte officielle v2 : Montserrat/Inter, #2563EB, couverture et intercalaires sombres, fond
  #FAFBFF sur les slides de contenu, filets bleus, logo, footer, pagination, convention de nommage.
  Construit le slide canonique "Vos interlocuteurs chez Digit-AI" avec le reste du deck.
  Use when / déclencher dès que l'utilisateur demande de créer, mettre à jour, refondre,
  charter ou produire un PowerPoint pour Digit-AI ou pour un client de Digit-AI, quel que soit
  son nom (corpus pseudonymisé : Client-A, Client-F, Client-K…), ou parle de propale, deck, slides, présentation
  en contexte Digit-AI. Ne pas déclencher pour rédiger ou chiffrer le contenu d'une proposition
  commerciale (→ digit-ai-propale), pour l'auditer avant envoi (→ digit-ai-propale-review), ni
  pour un livrable hors charte Digit-AI (→ systeme-de-marque).
metadata:
  version: "2.5.1"
---

# Digit-AI PowerPoint Skill

Encode la charte visuelle officielle Digit-AI (v2) et les patterns récurrents des livrables PPTX.

> **Note de versionnement du 2026-09-11 (TF-1021 / TF-1022).** Ce skill ne vivait qu'en archive.
> À sa mise en source : (a) les noms de clients et de personnes ont été **pseudonymisés** ;
> (b) `references/charte.md`, `references/layouts.md` et `references/assets.md` ont été
> **reconstitués** depuis la description de la v2.5.0 — valeurs de marque **à valider**, à
> remplacer par la consommation du système de marque Digit-AI (TF-1023) ; (c) les ressources
> citées par la v2.5.0 mais **jamais livrées** ont été retirées du corps de ce fichier plutôt
> que réinventées — elles sont listées telles quelles sous « Non livré », section où chaque
> ligne porte la mention pour que le self-test ne la compte pas comme lien mort.

## Langue et année

Toujours produire en **français**. Année de référence : **2026** (sauf instruction contraire).

## Workflow par défaut

1. Charger `references/charte.md` (palette, polices, dimensions, footer/header) — **toujours**.
2. Identifier les layouts nécessaires dans `references/layouts.md`.
3. Si slides canoniques demandés (interlocuteurs, réalisations) : consulter `references/assets.md`.
4. **Images** — charger `references/drive-assets.md` : couverture (logo Digit-AI + logo client
   + photo d'habillage), illustrations sur **≈ 1 slide de contenu sur 2** (jamais intercalaire,
   sommaire, prix). Sélection par tags, préparation via `prepare_images.py` (webp→PNG, coins
   arrondis sans cadre), placement **contain-fit** (ratio préservé, jamais d'étirement).
5. Construire le PPTX avec pptxgenjs en suivant strictement la charte.
6. **Passe QA finale (obligatoire)** : rasteriser tout le deck (PDF → PNG) et inspecter
   **chaque** slide — aucune image déformée / hors zone / encadrée, aucun texte qui déborde
   d'un encart ou de la slide, bijection sommaire ↔ intercalaires. Corriger à la source et
   **re-générer** si défaut. Détail : `references/drive-assets.md` §8.
7. Nommer selon la convention ci-dessous, livrer dans `/mnt/user-data/outputs/` via `present_files`.

Le slide canonique « Vos interlocuteurs » se **construit avec le deck** (étape 5), il ne se
greffe pas sur un PPTX existant : l'outil de fusion XML décrit par la v2.5.0 est **non livré**
(cf. « Non livré », note du 2026-09-11). Pour charter un PPTX reçu, le **reconstruire**
(« garder le fond, changer la forme »).

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

**Dépendance Python** : les deux scripts livrés (`scripts/fetch_drive_assets.py`,
`scripts/prepare_images.py`) importent **Pillow** (`PIL`) — validation d'image et dimensions
réelles pour le premier, transcodage et masque alpha pour le second. Prérequis :
`pip install Pillow`. Sans Pillow, l'étape 4 (images) échoue ; le reste du workflow tient.

## Références chargées à la demande

Aucun de ces fichiers ne se lit d'office, sauf le premier. La colonne de droite dit le
moment exact où le charger — charger tout d'avance coûte du contexte pour rien.

| Fichier | Charger quand |
|---|---|
| `references/charte.md` | **Systématiquement avant toute génération PPTX** |
| `references/layouts.md` | Choix des layouts (couverture, sommaire, cartes, roadmap, tableaux) |
| `references/drive-assets.md` | **Toute image du deck** : 3 dépôts Digit-AI (illustrations tagués, logos, profils webp) via canal public curl ; sélection par tags ; préparation `prepare_images.py` (webp→PNG, coins arrondis **sans cadre**) ; placement **contain-fit** (ratio préservé, jamais d'étirement) ; couverture logos + photo ; rythme ~1 contenu/2 ; **passe QA débordements**. Alt. MCP Drive privé |
| `references/layouts.md` §Layouts 9-11 | Gabarits photo (couverture panneau photo, texte+visuel 60/40, visuel+étapes) issus de la propale Client-I |
| `references/assets.md` | Utilisation des slides canoniques (interlocuteurs, réalisations) |

## Scripts livrés

- `scripts/fetch_drive_assets.py` — liste / cherche par tag / télécharge / valide des images d'un dossier Drive public (raccourcis `images`, `logos`, `profils` ; webp reconnu). **Requiert Pillow.**
- `scripts/prepare_images.py` — prépare pour embarquement PPTX : transcodage webp/gif→PNG, coins arrondis (masque alpha, **sans cadre**), calcul contain-fit, manifest JSON. **Requiert Pillow.**
- `scripts/self-test.mjs` — self-test du skill (liens relatifs du SKILL.md, absence de nom de client) ; Node, sans dépendance.

## Non livré (constat daté du 2026-09-11, TF-1022)

Ressources citées par la v2.5.0 et **absentes du paquet**. Elles ne sont **pas** réinventées ici :
le renvoi est retiré du workflow, le manque est déclaré.

- Logo officiel Digit-AI (PNG) — **non livré**. Repli : texte propre dans le panneau blanc.
- Photos N&B carrées des interlocuteurs — **non livré**. Repli : dépôt `profils` (cf. `references/drive-assets.md`).
- Fragment XML du slide « interlocuteurs » — **non livré**. Repli : construire le slide avec pptxgenjs.
- Script de fusion XML d'un slide canonique dans un PPTX existant — **non livré**. Aucun repli : le patch de PPTX n'est pas outillé.
- Squelette pptxgenjs pré-câblé — **non livré**. Repli : partir de `references/charte.md` + `references/layouts.md`.
- Snippets pptxgenjs (addBanners / addHeader / addFooter) — **non livré**, non reconstituable sans le code d'origine.
- Recueil des structures récurrentes des livrables passés — **non livré**, non reconstituable sans le corpus.

## Garde-fous

- **Jamais** d'underscore dans les noms de fichiers livrés
- **Jamais** la police "Syne" — Montserrat (titres) et Inter (corps), point.
- **Jamais** de PPTX sans : filets bleus haut/bas, footer avec pagination
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
- **Charte v2 par défaut** : couverture et intercalaires sur fond sombre `bgDark`, contenu
  sur `#FAFBFF` — le contraste signale la navigation. V1 claire : sur demande explicite.
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

- « Crée une propale pour X, périmètre Y » → `references/charte.md` + `references/layouts.md`
  + `references/drive-assets.md` ; couverture (logos + photo) + sommaire + contenu (images ~1/2)
  + interlocuteurs ; QA ; nommer ; livrer.
- « Mets le slide interlocuteurs à la fin de ce PPTX » → `references/assets.md` ; le slide se
  **reconstruit** avec le deck (l'outil de greffe XML est **non livré**) ; vérifier ; nouveau
  suffixe de date.
- « Reformate ce PPTX à la charte » → `references/charte.md` ; reconstruire ; garder le fond,
  changer la forme.
