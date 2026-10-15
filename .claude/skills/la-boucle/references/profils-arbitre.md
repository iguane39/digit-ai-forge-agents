# Profils d'arbitre par type de livrable

Complète la section « L'arbitre » du SKILL.md pour les **livrables outillables**. Principe :
**composition, pas duplication** — chaque profil délègue à l'oracle canonique de la forge
quand il est présent dans l'environnement ; sinon, mode dégradé explicite. Un ✓ sur un
critère outillable n'est valide qu'adossé à la **sortie citée d'un oracle exécuté**
(commande lancée, rendu produit, valeur mesurée) — jamais à l'auto-citation du candidat.

## Proportionnalité (rappel)

Ces profils ne s'appliquent qu'aux livrables substantiels. Une tâche légère (refus de
réunion, planning de repas, comparaison d'options) garde l'arbitre simple du SKILL.md :
critères binaires + preuve par citation. Ne jamais imposer un protocole outillé à une
tâche qui ne le justifie pas.

## Table des profils

| Type de livrable | Oracle canonique (si présent) | Preuve attendue pour un ✓ | Mode dégradé (oracle absent) |
|---|---|---|---|
| Code / script | Exécution réelle ; cycle détecter-corriger → `audite-et-corrige-l-appli` ; chirurgie → `karpathy-coding-discipline` | Sortie d'exécution citée : cas nominal + ≥ 1 cas limite | Relecture ligne à ligne avec trace écrite des cas simulés, signalée « non exécuté » |
| Page / fiche HTML | Script de conformité `digit-ai-page-html` (charte, accessibilité, print) + **rendu réel** (navigateur headless) aux breakpoints clés | Rapport du script + captures/mesures du rendu (débordements, alignements) | Checklist manuelle charte + structure, signalée comme telle |
| Deck / PPTX | Checklist charte `digit-ai-pptx` + rendu (LibreOffice) | Rendu produit + checklist cochée point par point avec référence de slide | Revue du XML/plan de slides, signalée « non rendue » |
| Document texte / propale | Contrat chiffré : longueur, structure, présence/absence d'éléments nommés ; audit commercial → `digit-ai-propale-review` | Comptages et repérages cités (section, ligne) | — (le contrat chiffré est toujours vérifiable) |
| Données / tableau | Contrôles de cohérence exécutés sur échantillon : totaux, types, bornes, doublons | Valeurs de contrôle citées (ex. « somme colonne C = 100 % ») | Inspection visuelle d'un échantillon, taille annoncée |
| Fidélité à une référence visuelle | Comparaison **mesurée** contre l'artefact de vérité terrain (fichier source, MHTML, export, capture) | Écarts chiffrés par niveau : structure/géométrie (ordre et coordonnées des sections), tokens (fontes, couleurs), composants/effets, comportement | **Pas de mode dégradé** : sans artefact de référence accessible, le critère est invérifiable ⇒ escalade au cadrage (demander l'artefact), jamais de substitution par interprétation |

## Décomposer un critère de fidélité (cas d'école)

« Le site suit le format et la présentation de la référence » n'est pas un critère : c'est
quatre critères, chacun avec son oracle.

1. **Structure** — mêmes sections, même ordre, même géométrie (hero plein cadre, titre
   aligné à gauche sous le hero, bandes alternées…). Preuve : coordonnées extraites du DOM
   rendu, comparées à la référence.
2. **Tokens** — fontes, graisses, casse, palette, interlignage. Preuve : valeurs CSS
   extraites des deux côtés.
3. **Composants & effets** — cadres photo, ombres, radius, superpositions, parallax.
   Preuve : styles calculés de la référence reproduits et cités.
4. **Comportement** — responsive aux breakpoints, navigation, interactions. Preuve : rendu
   headless aux largeurs cibles, zéro débordement horizontal.

Si l'artefact de référence est inaccessible (site qui bloque le fetch), ces quatre oracles
sont morts : le cadrage doit escalader et demander la vérité terrain (MHTML, export,
captures) **avant** la première passe — c'est moins coûteux qu'une reconstruction à
l'aveugle suivie de reprises.
