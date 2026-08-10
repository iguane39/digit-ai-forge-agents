---
name: digit-ai-page-html
description: >
  Produit des pages HTML autonomes au socle commun Digit-AI et en fait l'audit de conformité : charte (Roboto titres / DM Sans corps, jamais Syne, light theme), tokens :root, sémantique et accessibilité WCAG 2.2 AA, responsive, et robustesse d'export PDF WeasyPrint. Sert de couche de base dont héritent digit-ai-fiches-html et digit-ai-schemas. Use when / déclencher dès qu'il faut créer, charter, refondre, auditer ou corriger une page HTML autonome (fiche, schéma, dashboard, cartographie, livrable HTML) en contexte Digit-AI ou Ceetrus, ou mentionne page HTML, gabarit HTML, boilerplate HTML, charte HTML, ou veut vérifier qu'un fichier HTML respecte les règles maison. Fournit un boilerplate prêt à l'emploi, un script de conformité déterministe (charte + accessibilité + print) et l'oracle zéro défaut visuel render_page.py (multi-breakpoints, contraste, débordements, chevauchements), avec la checklist canonique V1–V7 et les règles de lisibilité L1–L12 à fixtures rouges.
metadata:
  version: "1.6.0"
---

# Page HTML — Socle commun Digit-AI

Couche de base pour toute page HTML autonome chartée. Les skills `digit-ai-fiches-html`
et `digit-ai-schemas` n'ajoutent que leurs gabarits par-dessus ce socle.

## Cibles de rendu

Deux cibles, à arbitrer dès le départ car certaines règles diffèrent :

- **Viewer** : navigateur / viewer Claude Web (le JS et le `:hover` fonctionnent).
- **PDF** : export WeasyPrint (pas de JS, `:hover`/`:focus` inactifs, fonts à embarquer).

Toute information portée par un tooltip ou un effet JS doit avoir un **équivalent statique**
si la page vise aussi le PDF.

## Règles non négociables (charte)

- **Roboto** (700/800) pour titres et sections · **DM Sans** pour le corps · **jamais Syne**.
- **Light theme** systématique.
- Toutes les couleurs, polices et rayons en **variables `:root`** — aucun hex en dur.
- Toujours une **pile de repli système** derrière les web fonts.
- Nommage fichier : `Digit-AI - {TypeDoc} {Client} - {Scope} - {YYYYMMDD}{a,b,c…}.{ext}`.

Détail complet + tokens (palette, rayons, familles, année de référence) :
voir [references/charte-et-tokens.md](references/charte-et-tokens.md).

## Quick start

Partir du boilerplate, ne jamais d'une page vierge : [assets/boilerplate.html](assets/boilerplate.html).
Il embarque déjà tous les obligatoires (charset en tête, `lang="fr"`, tokens `:root`,
repli système, `@media print` + `@page`, responsive, structure sémantique, un seul `<h1>`).

## Workflow — créer une page

1. Copier `assets/boilerplate.html` sous le nom normalisé.
2. Renseigner `<title>`, `<meta name="description">` et le `<h1>` unique.
3. Construire le contenu en **balises sémantiques** (`<section>`, listes, `<table>` pour les données),
   hiérarchie de titres sans saut de niveau.
4. Décliner via les **tokens `:root`** uniquement ; ne pas écrire de couleur en dur.
5. Vérifier la cible PDF si concernée (cf. règles print de la référence).
6. Auditer (workflow ci-dessous) avant livraison.

## Workflow — auditer / corriger une page

Lancer le contrôle de conformité déterministe (charte + accessibilité + print) :

```bash
python scripts/check_html.py chemin/vers/page.html
# JSON pour intégration : python scripts/check_html.py page.html --output json
```

Le script signale les **échecs bloquants** (Syne présent, `lang` absent, charset non prioritaire,
`<h1>` absent ou multiple, `:root` absent, `<title>` vide, pas de `@media print`) et des
**avertissements** (repli de font manquant, `alt` manquant, saut de niveau de titre, script
bloquant en `<head>`, pas de repère sémantique). Corriger tous les échecs, traiter les
avertissements selon le contexte, relancer jusqu'au PASS.

Puis lancer l'**oracle zéro défaut visuel** (rendu multi-breakpoints + mesures) :

```bash
python scripts/render_page.py page.html            # défaut : 1280, 768, 390 px
# schéma : --selector .diagram-wrap · JSON : --output json
```

Il mesure les bloquants **L2-rendu** (un bloc de texte occupe au moins 85 % de la largeur
qui lui est offerte, et une colonne d'étiquettes ne mange pas plus de 20 % d'une grille —
la mesure de lecture se règle sur le conteneur, pas sur le paragraphe),
**V1** (débordement horizontal), **V2** (contraste WCAG AA : ≥ 4.5:1,
≥ 3:1 en texte large) et **V4** (chevauchements — superposition voulue = `data-overlap-ok`),
signale **V3/V7** (alignements, espacements) en avertissements, et produit un PNG par
breakpoint **dans `<dossier du HTML>/.oracles/`** — jamais à côté du fichier audité, sans
quoi auditer un dossier de livrables y sème autant de PNG que de pages × breakpoints
(`--out <dossier>` pour les envoyer ailleurs).
**V5** (croisements) et **V6** (images) restent à inspecter sur ces PNG — on ne
juge jamais un rendu depuis le code seul. Corriger à la source (tokens, géométrie), relancer
jusqu'au PASS. Liste canonique et sévérités :
[references/zero-defaut-visuel.md](references/zero-defaut-visuel.md) — **référence unique
pour toute la forge**, les autres skills livrables la citent sans la redéfinir.

Enfin, contrôler la **lisibilité** — ce que le lecteur peut effectivement lire et utiliser :

```bash
python scripts/check_html.py page.html --regles L     # L1-L12 seules
python scripts/self_test.py                           # prouve que chaque règle échoue
```

Une page exacte, chartée et sans défaut visuel peut rester **illisible** : textes coupés,
scores sans barème ni formule, valeurs opaques, tableaux longs non filtrables, sommaire muet,
liens sans destination, chapitres de données sans mode d'emploi, `null` rendu tel quel. Ces
règles sont nées de défauts relevés par des lecteurs humains sur un livrable réel que les
trois oracles précédents validaient — chacune a sa fixture rouge.

Ce qui suppose de LIRE (clarté du propos, pertinence, justesse d'un chapeau) n'est pas
mécanisé : c'est la **revue de lecture**, déclarée comme telle et à la charge de
l'orchestrateur du run. Règles, conventions de marquage et partage mécanique / revue :
[references/lisibilite.md](references/lisibilite.md).

## Référentiel détaillé

- Charte & tokens : [references/charte-et-tokens.md](references/charte-et-tokens.md)
- Bonnes pratiques par axe (structure, sémantique, typo, a11y, responsive, print, JS, maintenabilité) :
  [references/bonnes-pratiques.md](references/bonnes-pratiques.md)
- Contournements à ne pas généraliser : [references/anti-patterns.md](references/anti-patterns.md)
- Checklist canonique zéro défaut visuel V1–V7 (transversale forge) : [references/zero-defaut-visuel.md](references/zero-defaut-visuel.md)
- Règles de lisibilité L1–L12 + partage contrôle mécanique / revue de lecture : [references/lisibilite.md](references/lisibilite.md)

## Composants

**Obligatoire** — Filtres de colonne sur les tableaux de données parcourus (≥ 8 lignes et ≥ 1 colonne catégorielle) : [references/composant-filtres-tableau.md](references/composant-filtres-tableau.md) (asset : [assets/table-filters.js](assets/table-filters.js)). Exemption possible via `data-filterable="off"` **et** `data-filterable-reason="…"` — sans motif, c'est un échec.

**Optionnel** —

- Bibliothèque de composants chartés prêts à coller (KPI, badges de statut, barres de progression, légende, barre d'outils + compteur, tableau repliable en cartes), validés par les oracles : [references/composants.md](references/composants.md).
- Recherche dans le document + compteur d'occurrences (pour catalogues/référentiels parcourus,
  insensible aux accents, viewer-only) : [references/composant-recherche.md](references/composant-recherche.md)
  (asset : [assets/find-in-page.js](assets/find-in-page.js)).

## Langue

Tout livrable et toute interaction en **français**.
