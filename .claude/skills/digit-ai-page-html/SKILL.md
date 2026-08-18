---
name: digit-ai-page-html
description: >
  Produit des pages HTML autonomes au socle commun Digit-AI et en fait l'audit de conformité : charte (Roboto titres / DM Sans corps, jamais Syne, light theme), tokens :root, sémantique et accessibilité WCAG 2.2 AA, responsive, et robustesse d'export PDF WeasyPrint. Sert de couche de base dont héritent digit-ai-fiches-html et digit-ai-schemas. Use when / déclencher dès qu'il faut créer, charter, refondre, auditer ou corriger une page HTML autonome (fiche, schéma, dashboard, cartographie, livrable HTML) en contexte Digit-AI ou Ceetrus, ou mentionne page HTML, gabarit HTML, boilerplate HTML, charte HTML, ou veut vérifier qu'un fichier HTML respecte les règles maison. Fournit un boilerplate prêt à l'emploi, un script de conformité déterministe (charte + accessibilité + print) et l'oracle zéro défaut visuel render_page.py (multi-breakpoints, contraste, débordements, chevauchements), avec la checklist canonique V1–V7 et les règles de lisibilité L1–L14 à fixtures rouges.
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
- **Light theme par défaut, STRICTEMENT** (G1, décision R-30/TF-0131 amendée TF-0158 le
  13/08) : un livrable circule et s'ouvre identique chez tous ses lecteurs — l'auto-sombre
  hérité de l'OS (`prefers-color-scheme` à la première visite) est retiré, il a produit un
  retour humain réel. **Bascule sombre câblée obligatoire** : bouton `.theme-toggle` en
  en-tête, `data-theme` sur `:root`, tokens sombres dérivés, persistance `localStorage`
  (le sombre est un CHOIX du lecteur), impression toujours claire. Le boilerplate
  l'embarque déjà (snippet S-G1). Un bouton présent sans script qui pose `data-theme` est
  une bascule morte, FAIL bloquant ; son absence totale (rendu figé print/PDF) n'est qu'un
  avertissement. Depuis TF-0303 (17/08), tout `prefers-color-scheme` qui **pilote** le thème
  (bloc `<style>`, attribut `style`, appel `matchMedia`) est un FAIL bloquant : la règle
  était écrite trois fois et jouée zéro fois — elle est revenue dans un livrable client.
  Une **mention** en commentaire reste muette : le socle doit pouvoir documenter son interdit.
- **Auto-portance du fichier livré (A1, TF-0303)** : `<!DOCTYPE html>`, `<html>`, `<head>`
  et `<body>` sont dans le FICHIER. Un HTML écrit pour une publication hébergée n'en a
  aucun — l'hôte les fournit à la publication, et le fichier qui part en pièce jointe reste
  un fragment sans langue, sans encodage et sans viewport. FAIL bloquant par balise manquante.
- **`charset` puis `viewport` en TOUTE PREMIÈRE position du `<head>` (A3)** : la déclaration
  d'encodage doit tomber dans les **1024 premiers octets** (fenêtre de sniffing de la
  spécification) — mesurée en octets de l'encodage réel, pas en caractères. Le boilerplate
  lui-même la déclarait au 1613e (son commentaire S-G1 et son script d'initialisation la
  repoussaient) : corrigé le 17/08. FAIL bloquant.
  **L'ordre du `<head>` est donc prescrit, et le pattern S-G1 le dit maintenant** (TF-0368,
  18/08) : `charset` et `viewport` avant tout SCRIPT — le commentaire S-G1 et son script
  viennent après. Ce qui est mesuré reste la fenêtre de 1024 octets, pas la position littérale :
  un court commentaire d'en-tête avant `charset` est admis (le boilerplate en porte un, et
  déclare `charset` au ~400e octet) ; un script, non — il pèse trop pour tenir dans la fenêtre.
  Reconstat qui a valu cette précision : l'avertissement « script bloquant dans `<head>` »
  avait été dénoncé le 14/08 comme un faux positif permanent (TF-0228) ; le 18/08, il a
  **disparu des cinq livrables** d'un projet réel après le seul correctif A3. Il ne signalait
  pas une fatalité, il signalait un ordre fautif — et le message ne le disait pas, parce qu'il
  ne parlait que de `defer`. Un avertissement qui ne nomme pas sa cause corrigeable se fait
  exempter au lieu de se faire corriger.
- **Titre au motif A4** : `{Marque} — {Objet} · {Client} — {YYYYMMDD}{a,b,c…}`. Deux FAIL
  distincts, parce que les deux manques ne se corrigent pas du même geste : titre d'un seul
  bloc (pas de marque séparée de l'objet), et absence d'indice de version **daté** — « V1 »
  ne distingue pas deux révisions du même jour. Le titre est la seule métadonnée qui suit le
  fichier partout : onglet, favori, pied d'impression, pièce jointe.
- **Favicon-lettre obligatoire** (A2/G2, systématisation du 13/08, loi transverse n°3) : tout
  HTML créé porte un favicon SVG en `data:` URI avec la **première lettre du nom du client ou
  du projet** — le boilerplate l'embarque (remplacer `{L}`). FAIL bloquant depuis TF-0303,
  aux deux branches : aucun `<link rel="icon">`, ou un `rel="icon"` qui pointe un FICHIER
  (le livrable qui voyage seul arrive alors sans son icône).
- Toutes les couleurs, polices et rayons en **variables `:root`** — aucun hex en dur.
- Toujours une **pile de repli système** derrière les web fonts.
- **Autonomie réseau totale (A1, décision D-10)** : aucune requête au chargement — pas de
  CDN, pas de police distante, pas d'image externe. CSS/JS inline, images en `data:` URI,
  polices en repli système. Un lien cliquable `<a href>` reste légitime (rien ne se charge
  sans geste du lecteur). Une URL réseau **citée en commentaire** (HTML `<!-- -->` ou CSS
  `/* */`) reste muette elle aussi — rien n'y est résolu, et le socle doit pouvoir écrire en
  place ce qu'il vient de retirer (TF-0307). Contrôlé par `check_html.py` (FAIL bloquant).
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

Le script signale les **échecs bloquants** (Syne présent, `lang` absent, charset non prioritaire
ou déclaré au-delà du 1024e octet — A3, squelette `html`/`head`/`body` absent — A1, titre hors
motif marque + objet + version datée — A4, favicon absent ou non embarqué — A2,
`<h1>` absent ou multiple, `:root` absent, `<title>` vide, pas de `@media print`, ressource
chargée par le réseau — A1, bouton `.theme-toggle` sans script câblant `data-theme` — G1,
thème piloté par `prefers-color-scheme` — G1) et des
**avertissements** (repli de font manquant, `alt` manquant, saut de niveau de titre, script
bloquant en `<head>`, pas de repère sémantique, aucun bouton de bascule — G1, légitime sur un
rendu figé). Corriger tous les échecs, traiter les avertissements selon le contexte, relancer
jusqu'au PASS.

**Exemptions déclarées (TF-0308, R-30 §3).** Un fichier qui n'est pas une page ne peut pas
tenir les règles d'une page : les fragments de canevas de `digit-ai-schemas` (à insérer dans
un squelette hôte) n'ont ni `<head>`, ni `<title>`, ni favicon par conception. Ces cas sont
nommés un par un dans `EXEMPTIONS_DECLAREES` (`check_html.py`), avec la famille de contrôles
écartée et son motif — registre **nominatif**, jamais un dossier entier, pour qu'un fichier
ajouté demain échoue tant qu'on ne l'a pas déclaré. Le contrôle rend alors un **SKIP annoncé
à chaque exécution** (avertissement citant le motif et le nombre de contrôles écartés), et
juge tout le reste : réseau A1, thème G1, police, lisibilité. Une exemption qui n'écarte plus
rien se signale d'elle-même (« SANS EFFET ») pour qu'on retire sa ligne. Le passage par le
chemin du fichier est la seule porte : sans `source`, aucune exemption ne s'applique — un
livrable ne peut pas s'exempter lui-même.

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
breakpoint **hors de tout arbre de livraison** (TF-0230) : `<dossier du HTML>/.oracles/`
pour une page ordinaire, un dossier temporaire nommé si la page vit sous `output/`, `old/`,
`dist/`… — un `.oracles/` DANS `output/` reste dans ce que le client reçoit, et un audit y
avait laissé 25 Mo à déplacer à la main. `--out <dossier>` fait foi quand il est donné :
c'est ainsi qu'un run journalise ses captures.
**V5** (croisements) et **V6** (images) restent à inspecter sur ces PNG — on ne
juge jamais un rendu depuis le code seul. Corriger à la source (tokens, géométrie), relancer
jusqu'au PASS. Liste canonique et sévérités :
[references/zero-defaut-visuel.md](references/zero-defaut-visuel.md) — **référence unique
pour toute la forge**, les autres skills livrables la citent sans la redéfinir.

Enfin, contrôler la **lisibilité** — ce que le lecteur peut effectivement lire et utiliser :

```bash
python scripts/check_html.py page.html --regles L     # L1-L14 seules
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
- Règles de lisibilité L1–L14 + partage contrôle mécanique / revue de lecture : [references/lisibilite.md](references/lisibilite.md)

## Composants

**Obligatoire** — Filtres de colonne sur les tableaux de données parcourus (≥ 8 lignes et ≥ 1 colonne catégorielle) : [references/composant-filtres-tableau.md](references/composant-filtres-tableau.md) (asset : [assets/table-filters.js](assets/table-filters.js)). Exemption possible via `data-filterable="off"` **et** `data-filterable-reason="…"` — sans motif, c'est un échec.

**Optionnel** —

- Bibliothèque de composants chartés prêts à coller (KPI, badges de statut, barres de progression, légende, barre d'outils + compteur, tableau repliable en cartes), validés par les oracles : [references/composants.md](references/composants.md).
- Recherche dans le document + compteur d'occurrences (pour catalogues/référentiels parcourus,
  insensible aux accents, viewer-only) : [references/composant-recherche.md](references/composant-recherche.md)
  (asset : [assets/find-in-page.js](assets/find-in-page.js)).

## Langue

Tout livrable et toute interaction en **français**.
