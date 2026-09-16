# Zéro défaut visuel — checklist canonique V1–V14

**Liste unique pour toute la forge.** Les skills livrables (`digit-ai-pptx`, `digit-ai-fiches-html`,
`digit-ai-schemas`, et ce socle) **référencent cette liste sans la redéfinir**. Un défaut ajouté ici
vaut partout. Aucun livrable visuel ne part avec un défaut V1–V9 ouvert.

## La liste

**Comment lire ce tableau.** Une ligne par défaut, dans l'ordre de leur numérotation — qui est
celui de leur apparition, jamais celui de leur gravité. La colonne « critère » est **binaire** :
elle se lit réussi/raté, sans nuance à négocier. La colonne « vérification » dit **qui juge** :
*Mesuré* quand un script rend un verdict (et le nom du script est donné), *Visuel* quand la
décision reste à l'œil sur les PNG produits. Les entrées en gras sont celles nées d'un défaut
**payé sur un livrable servi** ; chacune a son paragraphe plus bas, qui raconte le fait.

| # | Défaut | Critère binaire (réussi/raté) | Vérification |
|---|---|---|---|
| V1 | Texte ou élément qui sort de son cadre / de la page | Aucun débordement horizontal du document ; aucun contenu hors de la zone de son conteneur | **Mesuré** — `render_page.py` (scrollWidth vs clientWidth, bounding boxes vs viewport) |
| V2 | Texte illisible — clair sur fond clair, sombre sur sombre | Ratio de contraste **≥ 4.5:1** (WCAG AA) pour le texte courant ; ≥ 3:1 pour le texte large (≥ 24px, ou ≥ 18.66px gras) | **Mesuré** — `render_page.py` (couleur effective vs fond effectif, formule WCAG) |
| V3 | Éléments non alignés | Les éléments frères d'un même groupe partagent leur bord d'alignement (écart ≤ 2px) | **Mesuré (avertissement)** — `render_page.py` ; l'arbitrage final reste visuel (un décalage peut être voulu) |
| V4 | Éléments qui se chevauchent | Zéro intersection non voulue de bounding boxes entre éléments frères | **Mesuré** — `render_page.py` (intersections significatives) ; les superpositions voulues se déclarent via `data-overlap-ok` |
| V5 | Flèches ou filets qui croisent un élément | Aucun connecteur à travers un nœud ou un texte ; routage en L pur (règle `digit-ai-schemas`) | **Visuel** — rendu + inspection (boucle render-view-fix) |
| V6 | Image déformée ou débordante | Ratio d'origine préservé (contain-fit), image dans sa zone, sans cadre parasite (règle `digit-ai-pptx`) | **Visuel** — rendu + inspection ; contain-fit garanti à la source par `prepare_images.py` |
| **V8** | **Contenu ROGNÉ par un débordement masqué** | Aucun élément dont `overflow` vaut `hidden` ou `clip` ne cache du contenu : `scrollHeight` ≤ `clientHeight` et `scrollWidth` ≤ `clientWidth` (tolérance 2px) | **Mesuré (bloquant)** — `render_page.py` ; nomme le nombre d'éléments de texte invisibles et cite les trois premiers. Troncature voulue ET visible (une ligne, points de suspension) admise ; troncature assumée déclarée par `data-rognage-assume` |
| **V9** | **Actif visuel indiscernable de son fond** | Aucun `<img>` ni `<svg>` visible dont AUCUN pixel n'atteint **1,2:1** de contraste contre le fond effectivement peint derrière lui | **Mesuré (bloquant)** — `render_page.py` ; capture de l'élément et mesure au pixel, jamais sur le fichier source. Nomme le meilleur ratio atteint et la couleur dominante de l'actif |
| **V10** | **Verdict rendu sur un cadre qui ne contient pas le défaut** | Tout verdict visuel PORTANT SUR UNE PAGE s'appuie sur **au moins une capture pleine page**, et la revue **nomme ses captures avec leurs dimensions** | **Mesuré (bloquant)** — `oracle-verdict-visuel.mjs` du pilot (W1–W4) ; les captures par fenêtre jugent la ligne de flottaison et le défilement, **jamais la page** |
| **V11** | **Contrôles d'une même rangée désalignés** | Les contrôles (`input`, `select`, `textarea`, `button`) d'une même rangée de grille partagent leur bord haut à **2 px près** | **Mesuré (bloquant)** — `render_page.py` ; écart voulu déclaré par `data-alignement-ok`. Cause la plus fréquente, et nommée dans le message : une étiquette qui passe sur deux lignes parce qu'elle porte son statut dans son libellé |
| **V12** | **Tableau rogné dans un conteneur défilant** | À partir de **1 280 px** de fenêtre, aucun conteneur `overflow-x: auto\|scroll` portant un `<table>` ne rogne son contenu | **Mesuré (bloquant)** — `render_page.py` ; nomme les pixels hors champ. Un conteneur qui défile rend un tableau *consultable*, pas *lisible* — écart assumé déclaré par `data-rognage-assume`, jamais classé « acceptable » en revue |
| **V13** | **Bloc de texte étriqué sur une page de données** | Sur une page `data-page="donnees"`, tout bloc de texte occupe **≥ 70 %** de la largeur que son conteneur lui offre | **Mesuré (bloquant)** — `render_page.py` ; colonne de lecture voulue déclarée par `data-mesure-lecture`. Complète L2, qui ne regarde que six sélecteurs et manquait `.chapo` |
| **V14** | **Sommaire perdu au défilement** | Une page de plus de trois chapitres et de plus de deux écrans garde son sommaire **dans la fenêtre** après défilement | **Mesuré (bloquant)** — `render_page.py` (mesure aux 60 % de la page) ; l'existence du sommaire est jugée en amont par `L25` de `check_html.py` |
| **V15** | **En-tête de tableau posé sur ses lignes** | Au repos, aucun `<th>` de `<thead>` ne recouvre une ligne du corps (2 px de tolérance) ; après défilement, un `<th>` `sticky` se tient à son `top` déclaré (4 px) tant que le corps du tableau est à l'écran | **Mesuré** — `render_page.py`, après défilement : **bloquant** pour le recouvrement au repos, **avertissement** pour le décollement (la cause est nommée, le geste appartient à la page). Complément statique : `L29` de `check_html.py` signale un script qui pose `style.position` **sans garde** alors que la feuille déclare un `<th>` collant |
| **V16** | **Deux états indiscernables l'un de l'autre** | Dans un jeu d'au moins **trois** badges d'une même classe de base portant au moins trois fonds distincts, aucune paire de fonds n'est à la fois sous **20** d'écart de couleur (Delta-E CIE76) **et** sous **0,25** d'écart de luminance relative | **Mesuré (bloquant)** — `render_page.py` ; nomme les deux libellés, les deux fonds et les deux écarts. Un jeu d'états exige en outre un **indice non colorimétrique** (WCAG 1.4.1) : la sonde le signale quand deux badges indiscernables portent le **même** libellé — la couleur est alors le seul porteur |
| **V17** | **Conteneur bridé sur une page de données** | Sur une page `data-page="donnees"`, à partir de **1 280 px** de fenêtre, le conteneur principal (`.wrap`, `main`, ou l'élément porteur de `data-page`) occupe **≥ 96 %** de la largeur de la fenêtre | **Mesuré (bloquant)** — `render_page.py` ; nomme la largeur mesurée, celle de la fenêtre et le `max-width` calculé. Troisième angle de la page de données : V12 juge le tableau dans sa boîte, V13 le bloc dans son conteneur, V17 le conteneur dans la fenêtre — un plafond de confort (`--w: clamp(75vw, 1680px, 92vw)`) rendait PASS aux deux premiers |
| **V18** | **Ce que le 4K montre et que 1920 taisait** | À partir de **2 560 px** de fenêtre, **(a)** aucun paragraphe de prose que rien ne tient ne dépasse **135 caractères par ligne** (mesure : caractères du bloc ÷ lignes réellement peintes, `Range.getClientRects`) ; **(b)** sur une page de données (`data-page="donnees"`, `data-restitution="registre|suivi"`, ou tableau dominant d'au moins 8 lignes et 4 colonnes), le tableau principal occupe **≥ 85 %** de la largeur que son conteneur lui offre (L26) | **Mesuré (bloquant)** — `render_page.py`, **uniquement aux largeurs ≥ 2 560 px** : les deux défauts n'existent pas en deçà, et la grille par défaut les couvre (3840, 2560, 1920, 1280, 768, 390). Règle amont : **E5** du pilot (`references/BEST-PRACTICES-HTML.md` § E, 12/09/2026) — une page se conçoit à 1920 et se vérifie jusqu'à 3840. **Arbitrage tranché** (décision humaine du 15/09/2026, « 13a », TF-1069) : le plafond posé le 12/09 était 100 caractères par ligne, sous le token `.chap.lire` du socle (1 080 px, E4), mesuré à **134** caractères par ligne en 16 px — condamner la forme qu'un gabarit prescrit mettait le gabarit en défaut, jamais l'auteur. L'étude d'opportunité du 14/09 (TF-1069) a arbitré entre resserrer `.chap.lire` et porter le plafond à 135 ; la décision retient la seconde option, la moins destructrice pour l'existant : `.chap.lire` reste à 1 080 px, son token (134 cpl) passe désormais SOUS le plafond. **Frontière restante** : un paragraphe TENU par un conteneur de lecture (`.lire`, `[data-mesure-lecture]`) plus large que ce token reste, lui, jamais bloqué même au-delà de 135 — sa mesure est publiée en **non mesurable**, la même frontière qu'avant l'arbitrage |
| **V15 ter** | **En-tête de tableau masqué par l'empilement des collants** | Après défilement, un `<th>` `sticky` se pose au **bas du dernier élément collant qui le surplombe**, à 4 px près | **Mesuré (bloquant)** — `render_page.py` ; nomme l'élément coupable et les pixels masqués. Troisième branche de V15 : l'en-tête se tient à son `top` déclaré (les deux autres branches rendent PASS) et reste illisible, parce que `--hh` est un **token** et non une mesure. Jugé à chaque largeur — c'est la largeur qui décide du nombre de lignes de l'en-tête |
| V7 | Espacement irrégulier entre éléments répétés | **Blanc entre les boîtes** constant d'un frère au suivant, dans une même série (tolérance ≤ 2px) | **Mesuré (avertissement)** — `render_page.py`, plafonné à 20 constats détaillés puis agrégé ; arbitrage final visuel |

### V9 : un actif visuel se valide dans le CONTEXTE où il est servi, jamais sur son fichier

*Le fait, du 25/08/2026, payé en production.* Un site portait deux logos vectoriels pour deux
contextes — `logo.svg` coloré pour les fonds clairs, `logo-white.svg` blanc pour le bandeau sombre.
Le contenu coloré a été écrit dans les **deux**. La vérification faite était sincère et sans rapport
avec le défaut : le SVG modifié rendu en PNG, le texte parasite bien disparu. C'était **vrai**. Mais
un logo blanc devenu bleu foncé n'est visible que **posé sur son fond sombre** — le défaut n'existait
pas dans le fichier, il existait dans le contexte d'usage. Servi : `#2d4047` sur `#2d4047`, **ratio
1,0**. Une capture du bandeau l'a fait sauter aux yeux immédiatement.

*Pourquoi V2 ne pouvait pas le voir.* V2 compare `color` au fond effectif : elle mesure du **texte**.
Un actif visuel n'a pas de `color`, il a des **pixels**. V2 était donc littéralement vraie et sans
aucune valeur sur ce cas — le défaut de portée exact que décrit la règle N-33 du pilot.

*Le seuil est bas, et c'est délibéré.* WCAG 2.2 SC 1.4.11 demande 3:1 pour un objet graphique
**porteur de sens**. Distinguer le porteur de sens du décor demande un jugement, et une sonde qui
accuserait tout aplat décoratif se ferait éteindre. V9 ne juge donc que l'**indiscernable** : aucun
pixel n'atteint 1,2 de contraste. À ce niveau il n'y a plus de jugement à rendre — l'actif n'est pas
là. Ce qui vit **entre 1,2 et 3,0 est déclaré non jugé**, jamais tu.

### V8 mérite son paragraphe : c'est le seul défaut qu'un oracle VISUEL ne peut pas voir

*Le fait, du 24/08/2026.* Une fiche de sécurité livrée à un client avait été déclarée conforme la
veille par les **deux** contrôles du socle — marquage PASS, rendu PASS. Le gabarit est une feuille A4
à hauteur **figée** (`height: 297mm; overflow: hidden`) et le contenu ajouté l'a dépassée. Mesure
exacte : boîte de **1123 px**, contenu de **1441 px**, **318 px** sous la ligne de flottaison,
**41 éléments de texte devenus invisibles** — dont la section 7 (contrat de service et
observabilité), la section 8 (FinOps) et le pied de page qui porte la référence du document.

**Aucun signal**, ni à l'écran ni à l'impression. Le défaut n'a été découvert que parce que le
destinataire a demandé un PDF et qu'on a comparé les mots : **1132 contre 1313**.

*La cause est structurelle, et c'est pourquoi cette règle ne pouvait pas naître avant d'être payée* :
un contrôle qui juge l'apparence de ce qui reste **visible** ne peut, par construction, rien dire de
ce qui a été **rogné**. `overflow: hidden` EST le mécanisme qui rend un défaut invisible à un oracle
visuel. V8 ne regarde donc pas l'apparence : elle compare la taille du **contenu** à celle de la
**boîte**.

**Corollaire pour la bibliothèque de gabarits, et il vaut plus que la règle** : *une hauteur de page
est un PLANCHER (`min-height`), jamais un plafond.* Un gabarit qui fige `height` et masque son
débordement transforme tout ajout futur de contenu en perte silencieuse. La version d'origine de la
fiche tenait à 1123 px pile : le défaut était donc **latent depuis toujours**, et le premier ajout
l'a révélé.

**Portée volontairement étroite** : `hidden` et `clip` seulement. `auto` et `scroll` laissent au
lecteur la possibilité de défiler à l'écran, et le socle prescrit lui-même leur usage pour les
tableaux larges — les juger ici condamnerait un usage recommandé.

## Sévérité et verdict

- **V1, V2, V4 = bloquants mesurés** : un FAIL du script interdit la livraison. Corriger à la
  source, relancer jusqu'au PASS.
- **V3, V7 = avertissements mesurés** : le script signale, l'inspection du rendu tranche
  (un désalignement peut être un choix de composition — alors il doit être visiblement voulu).
  V7 mesure le **blanc entre deux boîtes**, jamais le pas d'un haut de boîte au suivant :
  une colonne de paragraphes de longueurs différentes a des hauteurs différentes et un
  rythme parfaitement régulier. Mesurer le pas y voyait un défaut par bloc de prose —
  288 avertissements sur un document dense, sous lesquels les bloquants V1/V2/V4
  disparaissaient. Au-delà de 20 constats, le reste est agrégé en une ligne : à ce volume
  le défaut est dans l'échelle d'espacement du gabarit, pas dans les séries une à une.
- **V5, V6 = bloquants visuels** : pas d'oracle automatique fiable ; vérifiés sur le rendu,
  jamais sur le code seul.

### V10 : une répétition n'est pas un défaut de POINT, c'est un défaut de RELATION

*Le fait, du 26/08/2026.* Une revue d'implémentation a rendu un verdict sur une page de
réservation en s'appuyant sur une capture de **1440 × 900** — une FENÊTRE. La page mesure
**1440 × 3684**. Le défaut recherché, un surtitre en double, se trouvait à **environ 800 px sous
le bas** de la seule capture de bureau ; les deux autres captures de cette page, 375 × 780 et
1440 × 900, ne l'atteignaient pas davantage. **Le verdict portait sur un quart de la page et se
lisait comme un verdict sur la page.**

**La capacité existait, dans le même dossier** : trois autres pages avaient une capture pleine —
1440 × 7001, 1440 × 3723, 1440 × 5180. **Trois pages sur 203.** Le cadrage était choisi page par
page, à la main, sans règle : *le hasard du cadrage décidait de ce que la revue pouvait voir.*

**La raison de fond dépasse ce défaut-ci.** Une répétition n'existe **que dans le cadre qui
contient LES DEUX occurrences**. Aucun nombre de captures par fenêtre n'y supplée — ce n'est pas
une question de quantité, c'est une question de **cadre**. C'est ce qui distingue V10 de V1–V9 :
les autres règles jugent un point, celle-ci juge ce que le cadre rend jugeable.

**Corollaire opérationnel, et il est mesuré** : une revue nomme ses captures **et leurs
dimensions**, une ligne chacune — `- fichier.png — 1440 × 3684 — pleine page`. L'oracle
confronte alors la dimension écrite à l'en-tête du fichier (**une dimension recopiée de mémoire
est une preuve qui ne prouve rien**), et signale une capture *déclarée* pleine page dont la
hauteur vaut exactement une hauteur de fenêtre usuelle — c'est la signature du cas fondateur.

**Ce que V10 ne dit pas** : que la page entière tient dans la capture. Seule la page connaît sa
hauteur, et l'image ne la porte pas. La règle juge une **déclaration** et la met à l'épreuve du
seul indice disponible. `render_page.py` capture déjà en pleine page par défaut ; le défaut
fondateur venait de scripts de capture **du produit**, cadrés par fenêtre.

### V15 — rien ne mesurait le rendu APRÈS DÉFILEMENT (TF-0901, 07/09/2026)

Une page dont les **huit** en-têtes de tableau étaient posés sur leurs propres lignes a été
rendue **PASS** par trois oracles, et vue par l'humain à la première ouverture. Chacun des trois
était aveugle *pour sa propre raison*, et c'est ce cumul qui fait la leçon :

- `check_html` **L29** juge les **déclarations** de la feuille — un style en ligne posé par un
  script est invisible à la lecture du fichier ;
- `render_page` **V4** compare les enfants d'un **même parent** — le décalage vivait sur les
  `<th>`, donc sur des frères décalés **pareil**, et `thead`/`tbody` gardaient leurs boîtes
  naturelles ;
- l'oracle de câblage des filtres juge le **marquage**, qui était juste.

Et le seul défilement que cet outil pratiquait servait le sommaire (V14, à 60 % de la page).
*Trois mesures locales justes ne font pas une page juste.*

**Deux branches, deux causes.**

- **a — l'en-tête recouvre ses lignes AU REPOS (bloquant).** Page en haut, tout `<th>` de
  `<thead>` dont la boîte recouvre une ligne du corps de plus de 2 px. Un en-tête correct ne
  recouvre **rien** au repos : il est à sa place naturelle. C'est la signature d'un `top`
  appliqué à un élément **non collant** — décalage permanent, une à deux lignes mangées à chaque
  instant (TF-0899). Une cause par tableau : huit `<th>` décalés pareil font **un** défaut.
- **b — l'en-tête collant se tient hors de son `top` déclaré (constat).** Le tableau est amené
  au-dessus du bord haut de la fenêtre, son corps restant à l'écran : un `<th>` `sticky` doit se
  tenir **exactement** au `top` qu'il déclare, à 4 px près. Sinon, il colle à une **autre boîte
  de défilement** que la fenêtre — un ancêtre à `overflow` non `visible` (TF-0900).

La mesure n'a besoin d'**aucun jeton** : elle compare le `top` **rendu** au `top` **déclaré**.
Trois garde-fous, chacun né d'un faux constat mesuré le 08/09 sur une fixture verte : le
`sticky` doit avoir eu à **s'engager** (une page trop courte pour défiler n'a rien à prouver),
il doit rester de la place **sous** le seuil (un en-tête repoussé par la fin de son propre
tableau suit la spécification), et le recul se borne à la hauteur du tableau.

**Complément statique.** `check_html` L29 signale désormais un script embarqué qui pose
`style.position` alors que la feuille déclare un `<th>` collant — **avertissement**, et
seulement si la pose n'est **pas gardée** : le geste sûr lit la position calculée et ne pose que
sur un `static`. Fixtures `l29t-pose-nue.html` / `l29t-pose-gardee.html`, qui ne diffèrent que
par cette garde ; la verte existe pour verrouiller que l'avertissement **n'accuse pas le
correctif**.

Bruit mesuré avant mise en bloquant : **0 constat** sur les 159 documents HTML du skill, hors
les deux fixtures rouges qui le portent par construction.

### V16 — le défaut vit ENTRE deux mesures, pas dans une mesure (TF-0910, 08/09/2026)

Les cinq teintes d'état du socle — `--green-fill` #DCFCE7, `--teal-fill`, `--amber-fill`
#FEF3C7, `--red-fill` #FEE2E2, plus `--surface` — vivent toutes entre **L\* 93 et 97** : des
pastels de même clarté séparés par une pointe de teinte. Le texte encré dessus tient 4,5:1, donc
**V2 rendait PASS sur chaque badge pris un par un**. Retour humain sur le livrable servi : « les
bulles des statuts ne sont pas suffisamment différentes pour être différenciées ». Le produit a
refait la palette **hors socle**.

*Ce que cette famille ajoute au catalogue :* V1 à V14 jugent une **propriété d'un élément** —
un ratio, un débordement, une intersection, une largeur. V16 juge une **distance entre deux
éléments**. Aucune somme de mesures individuelles justes ne la porte, et c'est pourquoi trois
oracles verts laissaient passer un codage de couleur illisible. *Une palette dont deux registres
ne se distinguent pas n'a pas deux registres.*

Seuils **cumulatifs** à dessein : deux teintes éloignées en teinte mais de même clarté restent
séparables, et deux clartés éloignées aussi — il faut perdre **les deux** pour perdre le lecteur.
Le cas payé tenait 0 sur les deux axes (jusqu'à 7,3 d'écart de couleur entre le vert et le
turquoise). Bruit mesuré avant mise en bloquant : **0 constat sur les 155 documents HTML du
skill**. Le geste de sortie est écrit dans `charte-et-tokens.md` : les `*-solid` à encre blanche,
un glyphe par palier, une légende couleur + forme + libellé.

### Une capture qui échoue est un CONSTAT, jamais une panne (TF-0897, 07/09/2026)

La branche d'échec de capture était écrite, mesurée et rendue au JSON — `capture.faite` à
`False`, `png` à `None`, largeur portée à `captures_manquees` — et la sortie **texte** la
traversait quand même en `Path(None)` : `TypeError`, `exit 1`, traceback dans le journal R-32,
et **aucun verdict pour la largeur concernée**, alors que toutes les familles lues dans le DOM
étaient déjà mesurées. Mesuré le 07/09 sur une page de 188 Ko (~13 500 px de haut) à 768 px et
échelle 2, reproduit deux fois ; le même appel en échelle 1 rendait PASS. Deux exécutions
perdues pour un verdict qui existait.

**Règle.** Ce qui n'a pas pu être capturé se **dit** — l'en-tête de largeur porte
« capture NON FAITE » et le motif est imprimé — et le reste du verdict se **rend** : les
familles du DOM (V1, V2, V4, V3, V7, L2) sont jugées et comptent, V5/V6 sont déclarées non
jugées à cette largeur. Levier connu quand la capture ne passe pas : `--timeout` plus grand, ou
`--scale` plus petit (une page très haute × échelle 2 dépasse la limite d'encodage du
navigateur). Preuve à double sens dans `self_test.py` (`run_capture_manquee`) : la même page
jouée au délai normal puis à **1 ms**, et le banc exige qu'aucun traceback ne sorte et que le
verdict soit rendu dans les deux cas.

### Seuil de hauteur : au-delà, la page n'est plus jugeable visuellement (TF-1139, 15/09/2026)

**Le seuil est `50 000 px` de `scrollHeight` CSS**, mesuré **avant** toute tentative de capture,
à chaque largeur. Au-delà, `render_page.py` ne tente rien et rend immédiatement un constat nommé
et chiffré — « page trop haute pour etre jugee visuellement a `<largeur>` px : `N` px de haut,
seuil `M` px ». Les familles lues au DOM (V1, V2, V4, V3, V7, L2, V18) restent jugées et comptent
dans le verdict ; V5 et V6 sont déclarées non jugées. Le seuil employé et la hauteur mesurée
sortent dans le bloc `non jugé` **à chaque exécution**, seuil atteint ou non : un auteur doit
pouvoir lire la marge qui lui reste, pas la découvrir.

**Le geste de remède est de DÉCOUPER la page** — un document par chapitre ou par vue. Ce n'est
pas un réglage d'échelle : sur le cas fondateur, six échelles ont été essayées (0,4 / 0,35 / 0,3
/ 0,25 / 0,2 / 0,12) et aucune n'a produit d'image. `--hauteur-max` déplace la borne pour tenter
quand même, et la valeur employée est publiée.

**Le fait payé.** Page de référence de 15 228 mots. Hauteurs relevées par l'oracle lui-même :
**54 793 px** à 2560 px de large, **62 127** à 1280, **98 079** à 768, **123 822** à 390. Quatre
exécutions successives, six échelles, délais de 45 s à 300 s : **aucune n'a produit d'image**, et
**deux ont tourné plus de trente minutes** avant d'être arrêtées à la main — pour un verdict
d'image jamais rendu. L'oracle se comportait honnêtement ; ce qui manquait était la borne, et
qu'elle soit publiée.

**Où le seuil est posé, et sur quelles mesures.** Sous le plus bas **échec** mesuré (54 793 px)
et au-dessus du plus haut **succès** mesuré (22 740 px CSS — la capture 780 × 45 480 de TF-1131,
à 390 px et échelle 2). Entre 22 740 et 50 000 px, aucune mesure : la tentative a donc bien lieu,
délibérément — un seuil posé trop bas retirerait la capture à des pages qui l'obtiennent.

**Preuve à double sens** dans `self_test.py` (`run_capture_tuiles`) : `capture-page-au-dela-du-seuil.html`
(60 210 px à 1280) rend le constat **sans tenter**, et `capture-page-tres-haute.html` (12 381 px)
reste capturée avec ses tuiles. Le banc mesure aussi la **durée** — c'est elle, pas le message,
qui prouve qu'aucune tentative n'a eu lieu : **2,4 s** contre les dizaines de minutes payées.

### V11 à V14 : quatre angles morts nommés par un lecteur, pas par un oracle (02/09/2026)

Les quatre familles ajoutées ce jour ont une origine commune, et elle mérite d'être écrite : **ce
sont des retours humains directs sur un livrable servi**, pas des défauts trouvés par un contrôle.
Chacune vit dans l'angle mort *déclaré* d'une famille existante :

- **V11** — « textbox pas alignés ». V3 juge des séries de **blocs** et V7 leur espacement ; une
  rangée de formulaire n'est ni l'un ni l'autre, et le décalage venait d'un **libellé** trop long.
- **V12** — « les pages doivent profiter de toute la largeur de l'écran ». V1 se tait dès qu'un
  ancêtre défile — c'est délibéré, le socle prescrit le défilement sous 1 280 px. La revue avait
  donc classé un rognage mesuré « acceptable » **sans mesure** : c'est le classement qui manquait
  de preuve, pas la mesure.
- **V13** — un chapô bridé à 90ch, « répété des dizaines de fois ». L2 ne regarde que
  `p, dd, li, blockquote, .va, .prose` : un `.chapo` en `<div>` n'en est aucun.
- **V14** — un sommaire qui existe et qui défile hors de l'écran. Rien n'est faux dans le
  marquage ; seul le rendu peut le dire.

**Bruit mesuré avant mise en bloquant** : les quatre familles rejouées sur les **153 documents
HTML du dépôt** (fixtures des skills, gabarits de `digit-ai-schemas`, pages de référence) rendent
**0 constat** hors de leurs propres fixtures rouges. Un contrôle qui accuserait à côté se
publierait en avertissant avec son taux ; celui-ci n'accuse personne à tort.

## Application par type de livrable

Tous les livrables visuels partagent cette liste, mais pas les mêmes outils pour l'exécuter : ce
tableau dit, pour chaque type, ce qui est **mesuré par un script** et ce qui reste à lire sur les
images produites. Une case vide n'existe pas — quand l'outil manque, il est nommé comme
manquant.

| Livrable | Oracle mesuré (V1/V2/V4 + avertissements V3/V7) | Reste visuel (V5/V6 + composition) |
|---|---|---|
| Page / fiche HTML | `scripts/render_page.py <page.html>` — rendu multi-breakpoints + mesures | Lecture des PNG produits — déposés dans `<dossier du HTML>/.oracles/`, ou dans `--out <dossier>` |
| Schéma SVG (page hôte) | Idem — `render_page.py` accepte `--selector .diagram-wrap` | Boucle render-view-fix de `digit-ai-schemas` |
| Deck PPTX | Contrôles équivalents portés par `check_pptx.py` (contraste et positions depuis le XML — *à créer, cf. plan de fermeture E2*) ; en attendant : rasterisation + inspection de **chaque** slide contre cette liste | Passe QA `digit-ai-pptx` §Workflow 6 |

## Règles d'usage

1. **Jamais de ✓ sur V1–V7 sans preuve** : sortie du script citée (mesuré) ou capture lue (visuel) —
   conforme à l'arbitrage à charge de `la-boucle`.
2. **Corriger à la source, jamais masquer** : un contraste insuffisant se corrige dans les tokens
   `:root`, pas par une ombre portée ; un chevauchement se corrige dans la géométrie, pas en
   déclarant `data-overlap-ok` (réservé aux superpositions par construction : badges, rubans).
3. **Cette liste s'étend ici et seulement ici.** Un nouveau défaut récurrent constaté sur un
   livrable = une ligne V8+ ajoutée dans ce fichier, jamais une règle locale dans un autre skill.
