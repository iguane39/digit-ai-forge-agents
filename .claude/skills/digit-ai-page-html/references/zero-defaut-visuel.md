# Zéro défaut visuel — checklist canonique V1–V14

**Liste unique pour toute la forge.** Les skills livrables (`digit-ai-pptx`, `digit-ai-fiches-html`,
`digit-ai-schemas`, et ce socle) **référencent cette liste sans la redéfinir**. Un défaut ajouté ici
vaut partout. Aucun livrable visuel ne part avec un défaut V1–V9 ouvert.

## La liste

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
