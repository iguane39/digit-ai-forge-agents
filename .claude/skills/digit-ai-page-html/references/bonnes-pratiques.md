# Bonnes pratiques HTML par axe — socle Digit-AI

Chaque pratique porte un tier : 🔴 **Obligatoire** (sans ça, livrable cassé ou hors charte) ·
🟡 **Recommandé** (gain fort) · ⚪ **Optionnel** (selon contexte).
Cibles : **Viewer** (navigateur) et **PDF** (WeasyPrint) ; les divergences sont notées.

## 1 — Structure & `<head>`

- 🔴 Ouvrir par `<!DOCTYPE html>` puis `<html lang="fr">` (lecteurs d'écran, césure, indexation).
- 🔴 `<meta charset="UTF-8">` **puis** `<meta name="viewport">` **en tout premier** dans le `<head>` (le charset doit tomber dans les 1024 premiers octets).
- 🔴 `<title>` descriptif et porteur de marque : `Digit-AI — {Objet} · {Client}`.
- 🟡 `<meta name="description">` : résumé clair du livrable.
- 🟡 `<head>` = couche de coordination : supprimer le legacy mort (`meta keywords`, `X-UA-Compatible`).
- ⚪ `<meta name="theme-color">` + `<meta name="color-scheme" content="light">`.
- ⚪ Favicon SVG inline (peut porter le logo).
- ⚪ `og:*` si la page est partagée (LinkedIn, mail HTML).
- ⚪ `<link rel="canonical">` uniquement si la page est servie sur une URL — inutile pour un livrable en pièce jointe.

## 2 — Sémantique

- 🔴 Structurer avec `<header> <main> <section> <footer>` (et `<nav>`/`<article>` si pertinent), pas un empilement de `<div>`.
- 🔴 **Un seul `<h1>`**, puis `<h2>…<h6>` **sans saut de niveau**.
- 🔴 Ne jamais simuler un titre avec du gras : si ça ressemble à un titre, c'est un `<hN>`.
- 🟡 Vraies listes (`<ul>`/`<ol>`/`<dl>`) ; `<table>` réservé aux **données** (avec `<th>`, `<caption>`).
- 🟡 Bouton = `<button>`, lien = `<a>` ; pas de `<div>` cliquable.
- 🟡 Texte de lien explicite (« Télécharger le rapport (PDF) », pas « cliquez ici »).

## 3 — Typographie & charte visuelle

- 🔴 Appliquer la charte (voir `charte-et-tokens.md` : Roboto / DM Sans / jamais Syne / light).
- 🔴 Centraliser **toutes** couleurs, polices, rayons en `:root` ; aucun hex ni famille en dur.
- 🔴 **Pile de repli système** derrière chaque web font (`system-ui, -apple-system, "Segoe UI", sans-serif`).
- 🟡 Charger Roboto + DM Sans (+ JetBrains Mono si code) en une requête Google Fonts groupée, `display=swap`.
- 🟡 Précéder le `<link>` fonts de `preconnect` vers `fonts.googleapis.com` et `fonts.gstatic.com` (`crossorigin`).
- ⚪ `line-height` corps ~1.5, lignes ≤ ~80 caractères.

### Structurer un raisonnement long — les puces sont une affordance de lecture 🔴

**Retour humain du 21/08/2026** : « pour les textes longs, favorise les puces et sous-puces pour
organiser les idées, sujets ou actions / décisions à afficher ou traiter ; cela facilite la
lecture et la compréhension ». Le constat instruit derrière : aucune des règles de lisibilité
L1-L17 ne porte sur la mise en forme d'un raisonnement. Elles couvrent la troncature, les
légendes, le barème, le sommaire, les chapeaux, la plomberie — **pas la structure du propos**.

**Le repère.** Un paragraphe qui ÉNUMÈRE est une liste écrite en prose. Les marqueurs qui le
trahissent, et qui sont le signal de conversion :

- des repères ordonnés dans le texte — « (a) … (b) … (c) », « premièrement … ensuite … enfin » ;
- une annonce chiffrée — « trois conséquences », « deux risques », « quatre conditions » ;
- une série de propositions séparées par des points-virgules sur plus de trois lignes ;
- une suite de couples *cause → effet* ou *option → conséquence*.

**La conversion.** Une liste par niveau de raisonnement, jamais plus de deux niveaux :
l'énumération d'idées en premier niveau, ce qui les qualifie (preuve, conséquence, borne) en
second. Une puce porte **une** idée ; si elle porte une phrase et sa justification, la
justification devient une sous-puce ou reste en prose sous la liste.

**Ce que ça ne remplace pas.** Un raisonnement qui ENCHAÎNE — où chaque proposition dépend de la
précédente — se lit mieux en prose : le découper en puces casse le lien logique et laisse le
lecteur reconstruire l'ordre. La liste sert l'énumération, pas la démonstration.

**Mesuré** sur la reprise d'un livrable réel le 21/08 : les blocs « Risque » et « Impacts du
changement » convertis donnent 71 listes de lecture et 243 puces, **les deux oracles restant
PASS** — la conversion ne coûte rien aux contrôles existants et change la lisibilité du
document. Une règle L en AVERTISSEMENT (un paragraphe au-delà de N lignes portant des marqueurs
d'énumération) reste à instruire : elle ne serait jamais un échec, un auteur ayant toujours
raison contre une heuristique de mise en forme.

## 4 — Accessibilité (WCAG 2.2 AA)

- 🔴 Contraste texte ≥ **4.5:1** (≥ 3:1 si large ≥ 24px ou 19px bold).
- 🔴 `alt` descriptif sur image porteuse de sens ; `alt=""` si décorative.
- 🔴 La **couleur n'est jamais le seul vecteur** d'information (libellé/icône en plus).
- 🟡 États de focus visibles et contrastés (≥ 3:1) sur tout interactif.
- 🟡 Repères ARIA (`role`/`aria-label`) sur régions et composants riches (tooltips, schémas), en complément de la sémantique.
- 🟡 Valider le HTML (balises fermées, attributs valides) : base de l'a11y et de l'export.
- ⚪ `lang` sur tout segment dans une autre langue.

## 5 — Responsive & adaptation PDF

- 🔴 Au moins un `@media (max-width: …)` pour le confort écran.
- 🟡 Lisible jusqu'à ~320px sans scroll horizontal (sauf objets 2D : grands tableaux, schémas).
- 🟡 **PDF** : unités absolues (`pt`, `cm`, `mm`) pour la mise en page imprimée.
- 🟡 Flexbox/Grid pour des mises en page fluides ; éviter les hauteurs fixes qui cassent en multi-page.
- 🟡 Respecter `@media (prefers-reduced-motion: reduce)` : neutraliser animations/transitions (déjà dans le boilerplate). L'a11y du mouvement, pas seulement du contraste.
- 🟡 Tableau consulté sur mobile : le replier en cartes empilées (`data-label`) plutôt que forcer un défilement horizontal — un `<table>` large déborde le viewport même en `overflow-x:auto` (bloquant V1). Voir [composants.md](composants.md) §6.

## 6 — Export PDF / WeasyPrint (`@media print` + `@page`)

- 🔴 Fournir un `@media print` : neutraliser fonds lourds, forcer l'encre, masquer l'écran-only.
- 🔴 Contrôler les coupures : `page-break-inside: avoid` (ou `break-inside`) sur cartes/tableaux solidaires.
- 🔴 **Embarquer/sous-ensembler les fonts** : les Google Fonts CDN ne s'embarquent pas en PDF → repli système (cf. §3) ou `@font-face` côté système.
- 🔴 **Piège** : en PDF, `:hover`/`:focus`/`:target` n'agissent pas et le JS ne tourne pas. Tout tooltip JS doit avoir un **équivalent statique** si la page vise le PDF.
- 🟡 `@page { size: A4; margin: … }` + `@page :first` pour la page de garde.
- 🟡 En-têtes/pieds via margin at-rules : `@bottom-right { content: "Page " counter(page) " / " counter(pages) }`.
- 🟡 SVG pour logos et schémas (net en PDF, contrairement au raster).
- ⚪ Expansion des liens : `@media print { a[href^="http"]::after { content: " (" attr(href) ")" } }`.
- ⚪ `base_url` absolu au rendu pour les images en chemin relatif.

## 7 — Interactivité & JavaScript

- 🔴 La page reste **lisible sans JS** (dégradation gracieuse) ; le JS enrichit, il ne porte pas le contenu essentiel.
- 🟡 Scripts en fin de `<body>` ou avec `defer` ; jamais de script bloquant dans le `<head>`.
- 🟡 JS data-driven : **échapper le HTML** des données injectées (`escapeHtml`).
- 🟡 Tooltips/composants : exposer `role`/`aria` + fallback (cf. §4, §6).
- ⚪ Recherche dans le document + compteur d'occurrences (catalogues/référentiels parcourus) : composant prêt à l'emploi, insensible aux accents, `aria-live` sur le compteur, viewer-only. Voir [composant-recherche.md](composant-recherche.md).

## 8 — Maintenabilité & livrable autonome

- 🔴 **Fichier unique auto-portant** : CSS et JS inline, aucune dépendance externe hormis web fonts (avec repli système).
- 🔴 Tout le design pilotable depuis `:root`.
- 🟡 Footer normalisé : marque, année de référence (token `--annee-ref`), indice de version (cf. nommage C7).
- 🟡 Figer la convention de tokens `--head`/`--sans`/`--mono` (résorbe la dette de cohérence).
