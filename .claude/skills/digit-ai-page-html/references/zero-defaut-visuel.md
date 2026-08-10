# Zéro défaut visuel — checklist canonique V1–V7

**Liste unique pour toute la forge.** Les skills livrables (`digit-ai-pptx`, `digit-ai-fiches-html`,
`digit-ai-schemas`, et ce socle) **référencent cette liste sans la redéfinir**. Un défaut ajouté ici
vaut partout. Aucun livrable visuel ne part avec un défaut V1–V7 ouvert.

## La liste

| # | Défaut | Critère binaire (réussi/raté) | Vérification |
|---|---|---|---|
| V1 | Texte ou élément qui sort de son cadre / de la page | Aucun débordement horizontal du document ; aucun contenu hors de la zone de son conteneur | **Mesuré** — `render_page.py` (scrollWidth vs clientWidth, bounding boxes vs viewport) |
| V2 | Texte illisible — clair sur fond clair, sombre sur sombre | Ratio de contraste **≥ 4.5:1** (WCAG AA) pour le texte courant ; ≥ 3:1 pour le texte large (≥ 24px, ou ≥ 18.66px gras) | **Mesuré** — `render_page.py` (couleur effective vs fond effectif, formule WCAG) |
| V3 | Éléments non alignés | Les éléments frères d'un même groupe partagent leur bord d'alignement (écart ≤ 2px) | **Mesuré (avertissement)** — `render_page.py` ; l'arbitrage final reste visuel (un décalage peut être voulu) |
| V4 | Éléments qui se chevauchent | Zéro intersection non voulue de bounding boxes entre éléments frères | **Mesuré** — `render_page.py` (intersections significatives) ; les superpositions voulues se déclarent via `data-overlap-ok` |
| V5 | Flèches ou filets qui croisent un élément | Aucun connecteur à travers un nœud ou un texte ; routage en L pur (règle `digit-ai-schemas`) | **Visuel** — rendu + inspection (boucle render-view-fix) |
| V6 | Image déformée ou débordante | Ratio d'origine préservé (contain-fit), image dans sa zone, sans cadre parasite (règle `digit-ai-pptx`) | **Visuel** — rendu + inspection ; contain-fit garanti à la source par `prepare_images.py` |
| V7 | Espacement irrégulier entre éléments répétés | **Blanc entre les boîtes** constant d'un frère au suivant, dans une même série (tolérance ≤ 2px) | **Mesuré (avertissement)** — `render_page.py`, plafonné à 20 constats détaillés puis agrégé ; arbitrage final visuel |

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
