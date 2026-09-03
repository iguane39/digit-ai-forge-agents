---
name: digit-ai-page-html
description: >
  Produit des pages HTML autonomes au socle commun Digit-AI et en fait l'audit de conformité : charte (Roboto titres / DM Sans corps, jamais Syne, light theme), tokens :root, sémantique et accessibilité WCAG 2.2 AA, responsive, et robustesse d'export PDF WeasyPrint. Sert de couche de base dont héritent digit-ai-fiches-html et digit-ai-schemas. Use when / déclencher dès qu'il faut créer, charter, refondre, auditer ou corriger une page HTML autonome (fiche, schéma, dashboard, cartographie, livrable HTML) en contexte Digit-AI ou Enseigne-A, ou mentionne page HTML, gabarit HTML, boilerplate HTML, charte HTML, ou veut vérifier qu'un fichier HTML respecte les règles maison. Fournit un boilerplate prêt à l'emploi, un script de conformité déterministe (charte + accessibilité + print) et l'oracle zéro défaut visuel render_page.py (multi-breakpoints, contraste, débordements, chevauchements), avec la checklist canonique V1–V14 et les règles de lisibilité L1–L29 à fixtures rouges.
# TF-0475 (23/08/2026) : declenchement CADRE par motif de chemin. Verifie contre la
# reference de frontmatter de Claude Code — `paths` limite l'activation AUTOMATIQUE, et
# n'empeche jamais l'appel direct par `/digit-ai-page-html`.
paths: "**/*.html, **/*.md"
metadata:
  version: "1.18.0"
---

# Page HTML — Socle commun Digit-AI

Couche de base pour toute page HTML autonome chartée. Les skills `digit-ai-fiches-html`
et `digit-ai-schemas` n'ajoutent que leurs gabarits par-dessus ce socle.

**1.17.0 (02/09/2026)** — **huit retours d'un lot produit, et une seule famille de cause : le
socle DÉCRIVAIT sans EXIGER, ou mesurait à côté du défaut.** · **Le composant de filtres lisait un
TEXTE là où il fallait lire une VALEUR** (TF-0768/0769/0781/0782) : `parseFloat("1 000")` vaut
**1** — l'espace insécable de milliers arrête l'analyse — donc *toute page en français triait
faux, en silence*, et le produit a dû réarmer son propre tri. Même lecture naïve pour les
facettes, rangées par ordre alphabétique (« août 2025, avr. 2026, déc. 2025 »), et une heuristique
`1 < n < lignes` qui **privait de facette la colonne clé** — huit marchés distincts sur huit
lignes. Tri et facettes lisent désormais `data-v`/`data-sort`, sinon un nombre **après** retrait
des espaces ; un même comparateur sert aux deux, donc une date ISO se range chronologiquement
(G8) ; **chaque** en-tête porte sa facette, la cardinalité ne décide que de la FORME
(`data-tf-forme`), et la seule sortie est une exemption **déclarée avec motif** (G7). L'état se
lit et se rejoue — `api.etat()`, `api.rafraichir()`, `init(table, { etat })` — au lieu d'être
relu dans le DOM par la page hôte. Trois fixtures jouées **dans Chromium** sur l'asset réel : deux
calculent dans la page l'ordre qu'aurait rendu l'ancienne lecture et exigent qu'il DIFFÈRE.
· **Cinq règles de lisibilité neuves**, chacune née d'un retour humain direct : **L25** un
sommaire visible en permanence au-delà de trois chapitres (« fournis un menu sur la gauche ») ;
**L26** une page de données se DÉCLARE et prend toute la largeur, la colonne de lecture reste pour
la prose — l'arbitrage manquait, et le même défaut a été signalé « des dizaines de fois » ;
**L27** un `<th>` définit sa colonne, avec son **unité** (une hypothèse en euros/an était
multipliée par un nombre de séjours) ; **L28** le temps s'affiche comme du temps, valeur d'ordre
obligatoire ; **L29** l'arbitrage `header` collant / `thead` collant, tranché au socle par le
token `--hh` — un **produit** avait dû le trancher seul. · **Quatre familles de rendu**
(V11–V14) : contrôles d'une même rangée alignés à 2 px (« textbox pas alignés »), tableau rogné
dans un conteneur défilant **bloquant** au-delà de 1 280 px (le débordement était relevé, puis
classé « acceptable » sans mesure), bloc de texte sous 70 % de son conteneur, sommaire perdu au
défilement. **Bruit mesuré avant mise en bloquant : 0 constat sur les 153 documents HTML du
dépôt.** · **`--red` / `--red-fill` / `--red-line`** entrent à la palette (TF-0755) : le livrable
conforme de la maison les employait déjà, la documentation ne les portait pas — *une palette dont
un registre entier n'est écrit nulle part se fait réinventer*. Recette 141 → 171 cas.

**1.16.0 (02/09/2026)** — **trois défauts d'une seule famille : un contrôle qui décrit son cas
et ne le voit pas.** · **Le balisage d'emphase cesse d'être du texte** (TF-0720) :
`**RD-23** *(glose)*` était refusé par M18 comme identifiant muet — le contrôle prenait les
quatre caractères suivant le jeton et y trouvait les astérisques de fermeture du gras. Quatre
refus à l'écriture d'un seul lot, dont deux sur du contenu conforme ; et la MÊME cause avait
déjà été signalée le 22/08 sur un autre oracle, une cellule `**90**` non lue comme un nombre
(re-somme à 189 au lieu de 99). `check_markdown.py` expose désormais `neutraliser_emphase()`,
qui blanchit les marqueurs **en préservant les positions**, et la fenêtre de glose se prend sur
le **paragraphe reflué**, plus sur la ligne physique — la coupure à 95 colonnes ne porte aucun
sens. Mesure : la fixture verte rendait FAIL sur deux faux positifs, elle rend PASS ; la rouge
mord toujours sur les deux jetons vraiment muets. · **L24** (neuve, BLOQUANTE) : un badge de
statut engageant est **résolvant** (TF-0719). Un `span.badge.acte` de titre « Décision prise le
22 août 2026 par la direction… » a été posé sur une décision **jamais prise**, sur cinq
emplacements d'un livrable client — et il est passé, parce que L3 n'exige d'un badge qu'une
légende, et elle était là. *Le vocabulaire était bon, la discipline absente.* Un badge de statut
est l'affirmation de rang la plus visible de la page : il porte désormais un lien, un
`aria-describedby` ou un `data-decision` vers une trace **qui se déclare décision**. Règle de
dégradation à sens unique, écrite dans `lisibilite.md` : sans cible, `propose` — jamais
l'inverse. · **`l2_gouttiere` regarde enfin les `<table>`** (TF-0694) : la règle décrivait ce
défaut au mot près et au seuil exact, et rendait PASS dessus — elle commençait par
`if (cs.display !== 'grid') continue`. *Une mise en page `intitulé | contenu` en `<table>` n'est
pas un tableau de données : c'est la même intention avec l'autre outil.* Elle n'avait pas
échoué, **elle n'avait pas été appelée**, et rien ne le disait : sur la fiche fautive (intitulés
à 32 %), verdict PASS et zéro constat sur les treize familles, après deux fiches livrées et
trois régénérations. On mesure la largeur **rendue** de la première colonne, avec les mêmes
garde-fous ; seuil 20 % inchangé, et une fixture verte garantit qu'un vrai tableau de données à
deux colonnes comparables reste PASS. Recette 127 → 141 cas.

**1.15.0 (24/08/2026)** — **quatre frictions d'un lot client, dont deux contradictions du socle avec
lui-même.** · **L19 n'accuse plus le repli en cartes** : `composants.md` §6 impose
`overflow-wrap: anywhere` sur les cellules comme palier OBLIGATOIRE, et L19 traitait `td` comme de la
prose — huit livrables PASS le 19/08 rendaient douze FAIL le 24/08 sans qu'un octet ait bougé. La
cause profonde était que `regles_css` APLATISSAIT la feuille sans garder le contexte d'at-rule : un
sélecteur écrit sous `@media` était jugé comme s'il s'appliquait partout. Le contexte est désormais
porté, et l'exemption exige DEUX conditions cumulatives (sous media query ET signature de repli) —
un `anywhere` sur un `p` sous media query reste jugé. · **Le calibrage du repli est MÉCANISÉ** : il
était écrit en prose, donc retraduit par chaque émetteur, et mal — repli réglé à 900 px quand un
tableau de huit colonnes débordait jusque vers 1 400 (16 débordements bloquants, invisibles cinq
jours). Trois paliers lisent le nombre de colonnes dans le marquage ; plus rien à calibrer. Deux
défauts trouvés en l'écrivant : un jeton `--replier` qui ne déclenchait RIEN (une propriété
personnalisée n'active aucune règle — une affordance non câblée dans le document qui l'enseigne), et
`width: 100%` sans `box-sizing` qui débordait de son propre remplissage. · **V4 tolère la géométrie
de police entre inline frères** : la boîte d'un inline vaut la hauteur d'em, pas l'interligne, donc
deux surlignages de lignes voisines se recouvrent sans qu'un pixel peint ne se superpose — mesuré sur
1 246 surlignages : 5 px à interligne 1,22, rien à 1,45. · **L'encre du surlignage se POSE** :
`composant-recherche.md` prescrivait `color: inherit`, ce qui rendait un badge à texte clair
illisible en recherche active — 21 constats de contraste bloquants, ratio 1,04:1. Recette 116 → 119.

**1.14.0 (24/08/2026)** — **V8 « contenu rogné »** (neuve, BLOQUANTE) : le seul défaut qu'un oracle
VISUEL ne peut pas voir. Une fiche livrée, déclarée conforme la veille par les DEUX contrôles, avait
perdu deux sections entières et son pied de page — feuille A4 à hauteur FIGÉE, contenu 1441 px pour
une boîte de 1123 px, 41 éléments de texte invisibles, aucun signal ni à l'écran ni à l'impression.
Découvert par comparaison des mots d'un PDF (1132) à ceux de la page (1313). `overflow: hidden` EST
le mécanisme qui rend un défaut invisible à un contrôle d'apparence : V8 compare donc la taille du
CONTENU à celle de la BOÎTE, nomme le nombre d'éléments invisibles et cite les trois premiers.
Portée étroite — `hidden` et `clip` seulement ; `auto`/`scroll` laissent le lecteur défiler, et le
socle prescrit leur usage. Échappatoires : troncature d'une ligne à points de suspension (admise
d'office, le lecteur la voit) ou `data-rognage-assume`. *Corollaire pour la bibliothèque : une
hauteur de page est un PLANCHER (`min-height`), jamais un plafond — sinon tout ajout futur devient
une perte silencieuse.* · **Message de remédiation de L2-largeur complété** : il prescrivait la
moitié du geste, et la correction prescrite créait une seconde violation. Mesuré deux fois le même
jour — premier passage « poser la mesure sur le conteneur », second passage « rupture d'alignement
entre frères », dont la levée exige `data-mesure-lecture` que le premier message ne nommait pas. Le
geste complet est désormais nommé en une fois. Recette 114 → 116 cas.

**1.13.0 (23/08/2026)** — **L22** (neuve, bloquante) : une promesse écrite en COMMENTAIRE est
tenue. Un schéma livré annonçait « un `<title>` par forme » et n'en portait qu'un, celui du
diagramme entier : l'infobulle promise n'existait pas et quatre chevauchements V4 bloquants en
découlaient, après quatre versions et trois relectures qu'un commentaire avait dispensées de
vérifier. Les annonces QUANTIFIÉES sont jugées porteur par porteur — le premier jet comptait des
totaux et se trompait dans les deux sens, accusant les gabarits du socle et laissant passer sa
propre fixture rouge. Échappatoire : `promesse-ok`, ou la négation écrite. Recette 112 → 114 cas.
· **`render_page.py --familles`** : les familles de mesure, leur libellé et leur sévérité sont
désormais PUBLIÉES par le socle sous `digit-ai/familles-mesure@1`, et ses trois consommateurs
(plancher de forge-tests, rendu comparatif de forge-design, vérificateur d'instances du pilot) les
LISENT au lieu d'en tenir chacun une copie. Une table recopiée trois fois divergeait déjà.

**1.12.0 (23/08/2026)** — **lecteur de source embarquee** (composant 12) : le composant que la
regle A1 rendait necessaire et qui n'existait pas. Une page autoportante ne peut pas renvoyer a des
fichiers du depot — elle EMBARQUE les documents cites, et un bloc brut de 67 Ko est illisible. Rendu
DIFFERE au premier depliage (douze documents rendus d'avance : DOM de 7 000 a plus de 25 000
noeuds), liens NON cliquables avec leur cible en infobulle (un lien mort ment davantage qu'une
absence de lien), et sous-ensemble de Markdown borne — ce qui n'est pas reconnu sort en paragraphe,
jamais en HTML brut.

**1.11.0 (23/08/2026)** — **`--matrice-etats`** (neuve) : cinq états mesurés et capturés, et le
bloquant **`etat_muet`** — un état vide qui ne se déclare pas. Deux défauts qu'un client avait
trouvés en deux clics sur un livrable « tous oracles verts ».

**1.10.0 (23/08/2026)** — **L2-frères** (neuve, avertissement) : la rupture d'alignement entre
frères EMPILÉS, invisible aux trois mesures L2 existantes qui comparent chaque bloc à son propre
conteneur. Mesuré : un même défaut signalé TROIS FOIS par un client en quatre versions, sous
trois formulations. Écart légitime → `data-mesure-lecture`. Trouvé en la jouant sur nos propres
pages : deux instances de gabarit passaient l'audit statique et échouaient au rendu (contraste
2,48:1 sur la ligne pédagogique, bride de lecture posée sur le paragraphe, quatre chevauchements
V4 dans un schéma dont les nœuds n'avaient pas le `<title>` que son propre commentaire
promettait). Trois causes, un même aveuglement : le contrôle statique ne rend pas la page.

**1.9.0 (23/08/2026)** — **L21** (neuve) : une classe de composant de la charte présente dans le
marquage est visée par au moins une règle CSS. Deux squelettes portaient un sommaire annoncé et
non stylé : L6 passait, le rendu passait, et le sommaire se rendait en liste nue. Un oracle de
marquage trouve la classe et s'arrête là ; un oracle de rendu ne voit rien tant que rien ne
déborde. En entrant, la règle a trouvé le même défaut dans HUIT fixtures du socle — complétées.
Recette 101/101 → 102/102.

**1.8.0 (22/08/2026)** — deux retours clients de plus, et une PORTE ouverte.
**L20** (neuve) : au-dela de 4 Ko ou 80 lignes, un bloc de texte brut offre une alternative de
lecture ou declare `data-brut-fait-foi`. Un document de 67 Ko embarque en brut passait TOUS les
oracles ; le client a du le redemander deux fois. « Le contenu est la » ne veut pas dire « le
contenu est lisible ».
**`scripts/check_markdown.py`** (neuf) : les regles independantes du rendu s'appliquent enfin aux
`.md` — `M7`, `M10`, `M14`, `M18`. Le Markdown est le format de livraison dominant des runs de
conseil, et aucun controle de lisibilite ne l'atteignait. Domaine enregistre au registre des
oracles. Recette 96/96 -> 101/101.

**1.7.0 (22/08/2026)** — trois retours clients fermés.
**L1** : le SUJET d'un sélecteur est son DERNIER composant, plus son premier —
`a.kpi .kpi-label{display:flex}` faisait de tout lien un élément de bloc, et six phrases
correctes échouaient d'un coup ; le message nomme désormais le sélecteur fautif.
**L18** (neuve) : un identifiant du vocabulaire du livrable — `E2`, `H3`, `ADR 0009` — RÉSOUT à
sa première occurrence (`title`, `aria-describedby`, ancre interne). Retour direct du client :
« je ne sais pas ce qu'est E2 ».
**L19** (neuve) : `overflow-wrap: anywhere` sur un sélecteur de PROSE est refusé — nécessaire sur
un chemin, ravageur sur du texte courant (« Utilisabl/e », « 231 occurrenc/es »).
Recette 91/91 → 95/95.

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
python scripts/render_page.py page.html            # défaut : 1920, 1280, 768, 390 px (TF-0422)
# schéma : --selector .diagram-wrap · JSON : --output json
# revue de lecture : --sections "[role=tabpanel]"  → une capture par section, par largeur
# composants interactifs : --matrice-etats         → cinq états mesurés ET capturés (TF-0493)
```

**La matrice d'états (`--matrice-etats`, TF-0493) — les composants cassent là où personne ne
regarde.** Cinq états, chacun repartant d'une **page neuve**, chacun mesuré et capturé : tout
déplié · filtre ouvert sur la **première** puis sur la **dernière** colonne · filtre ne laissant
aucune ligne · recherche sans correspondance. Deux défauts trouvés par un client sur un seul
livrable, tous deux reproductibles en deux clics, tous deux invisibles au rendu par défaut : un
panneau de filtre qui **crée un ascenseur horizontal** à l'ouverture, et un bouton « Aucun » qui
**détruit l'affichage sans un mot**. `--etats-ouverts` existait et avait été utilisé — il ouvre le
premier panneau et ne produit **aucun état d'échec**.

Ce que la matrice ajoute au-delà de V1/V2/V4 : **un état vide se déclare** (loi n° 3). Plus aucune
ligne visible et pas un mot pour le dire → **bloquant** `etat_muet` ; le socle prescrit déjà la
forme du message (`.tf-count` en zone vivante avec la classe `zero`, ou `.tf-vide-msg`). Et un état
qui ne trouve pas son déclencheur est déclaré **NON JOUÉ**, jamais vert : un composant absent est
une réponse, un état muet serait un mensonge. La preuve qui justifie d'ouvrir **les deux**
colonnes : sur la même page, le panneau rend 0 constat sur la première et 2 sur la dernière — un
panneau ne déborde pas du même côté à droite qu'à gauche.

Il mesure les bloquants **L2-rendu** (un bloc de texte occupe au moins 85 % de la largeur
qui lui est offerte, et une colonne d'étiquettes ne mange pas plus de 20 % d'une grille —
la mesure de lecture se règle sur le conteneur, pas sur le paragraphe),
**V1** (débordement horizontal), **V2** (contraste WCAG AA : ≥ 4.5:1,
≥ 3:1 en texte large) et **V4** (chevauchements — superposition voulue = `data-overlap-ok`),
signale **L2-frères** (TF-0491), **V3** et **V7** en avertissements — L2-frères compare la
largeur d'un bloc de texte à celle de son **frère empilé** : trois mesures L2 ne voyaient que
le rapport d'un bloc à son propre conteneur, et une prose bornée ET CENTRÉE au-dessus de
cartes pleine largeur les satisfaisait toutes les trois. Le lecteur, lui, voit un bord droit
qui ne tombe pas au même endroit — signalé trois fois par un client, sous trois formulations,
sur quatre versions. Ce n'est pas un bloquant : une mesure de lecture étroite est un choix
défendable, mais elle se **déclare** (`data-mesure-lecture` sur le bloc étroit) au lieu d'être
subie. Ne se prononce que dans un **flux vertical** — dans une grille ou une boîte flexible, la
largeur d'un enfant est décidée par sa piste, pas par lui, et produit un PNG par
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
mécanisé : c'est la **revue de lecture — OBLIGATOIRE avant toute livraison (TF-0422)**.
Capturer (`render_page.py`, 1920/1280/768/390 + `--sections`), **ouvrir et lire** les
captures, consigner chaque constat dans `REVUE.md` au gabarit
[references/gabarit-revue-de-lecture.md](references/gabarit-revue-de-lecture.md) (largeur ·
section · constat · suite · preuve) ou la mention « aucun constat » datée. Une page verte à
tous les oracles a été refusée par son client à l'ouverture : les oracles mesurent des
propriétés locales, la revue regarde la page comme un lecteur. Règles, conventions de
marquage et partage mécanique / revue : [references/lisibilite.md](references/lisibilite.md).

## Référentiel détaillé

- Charte & tokens : [references/charte-et-tokens.md](references/charte-et-tokens.md)
- Bonnes pratiques par axe (structure, sémantique, typo, a11y, responsive, print, JS, maintenabilité) :
  [references/bonnes-pratiques.md](references/bonnes-pratiques.md)
- Contournements à ne pas généraliser : [references/anti-patterns.md](references/anti-patterns.md)
- Checklist canonique zéro défaut visuel V1–V14 (transversale forge) : [references/zero-defaut-visuel.md](references/zero-defaut-visuel.md)
- Règles de lisibilité L1–L29 + partage contrôle mécanique / revue de lecture : [references/lisibilite.md](references/lisibilite.md)

## Composants

**Obligatoire** — Filtres de colonne sur les tableaux de données parcourus (≥ 8 lignes) — **chaque** colonne reçoit sa facette, la cardinalité ne décide que de la forme du panneau (G7) : [references/composant-filtres-tableau.md](references/composant-filtres-tableau.md) (asset : [assets/table-filters.js](assets/table-filters.js)). Exemption possible via `data-filterable="off"` **et** `data-filterable-reason="…"` — sans motif, c'est un échec.

**Optionnel** —

- Bibliothèque de composants chartés prêts à coller (KPI, badges de statut, barres de progression, légende, barre d'outils + compteur, tableau repliable en cartes, **onglets accessibles** `assets/tabs.js` — L16, **ligne de tableau dépliable** `assets/table-detail.js` — L17, gabarits de chapitre `.chap.lire`/`.chap.duo` — L2), validés par les oracles : [references/composants.md](references/composants.md).
- Recherche dans le document + compteur d'occurrences (pour catalogues/référentiels parcourus,
  insensible aux accents, viewer-only) : [references/composant-recherche.md](references/composant-recherche.md)
  (asset : [assets/find-in-page.js](assets/find-in-page.js)).

### Une copie d'un composant se POSE, elle ne se colle pas (TF-0784, 03/09/2026)

La règle A1 impose une page **autoportante** : un livrable qui charge un fichier voisin perd son
composant dès qu'il part par courriel. **Inliner un composant du socle est donc la règle**, pas
l'exception — et c'est exactement là qu'une copie se détache de sa source.

**Le fait payé.** `digit-ai-schemas/assets/exemple-reference.html` portait une copie **manuelle**
de `assets/table-filters.js`, collée un jour où elle était juste. Le composant a été corrigé
**sept fois** (TF-0429/0430/0431 le 21/08 ; TF-0768/0769/0781/0782 le 02/09) : la copie n'a pas
bougé d'un octet. Elle triait encore « 1 000 » comme 1, rangeait les mois par ordre alphabétique
et privait de facette la colonne clé — **dans le même dépôt que les correctifs**. Un correctif ne
voyage pas tout seul, et rien ne disait qu'une copie existait.

**Le geste.** On entoure le bloc de ses marqueurs, puis on le laisse être posé :

```bash
node .claude/skills/digit-ai-page-html/scripts/embarquer-composants.mjs --constat   # écart ? exit 1
node .claude/skills/digit-ai-page-html/scripts/embarquer-composants.mjs --ecrire    # (re)pose les blocs
```

```html
<!-- COMPOSANT-EMBARQUE:DEBUT table-filters.js -->
<script data-composant="table-filters.js" data-empreinte="sha256:…">…</script>
<!-- COMPOSANT-EMBARQUE:FIN table-filters.js -->
```

Le script ne touche **que** les blocs déjà marqués — adopter une copie manuelle reste un geste
explicite. Seule transformation admise entre source et copie : l'échappement `</script` (RA-1).
La contrepartie CSS se pose de la même façon (`table-filters.css` dans un `<style>` marqué) ; la
page hôte n'a qu'à **aliaser** les jetons du socle qu'elle ne nomme pas comme lui.

**Le contrôle.** `quality-oracles/scripts/oracle-parite-assets.mjs` balaie l'arborescence des
skills sans rien écrire (P1 déclaration · P2 empreinte · P3 parité octet · P4 exemption datée et
motivée) ; le self-test de `quality-oracles` le rejoue **sur le dépôt réel**, pour que le
troisième skill qui recopie un composant rougisse le banc au lieu de dériver en silence.

## Langue

Tout livrable et toute interaction en **français**.
