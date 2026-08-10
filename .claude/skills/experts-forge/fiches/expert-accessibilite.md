# Fiche expert — `accessibilite`

Version 0.1.0 — 21/07/2026 — Statut registre : **todo** (générée par scaffold-expert, verdict d'admission en attente).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : demandes récurrentes sur livrables visuels (HTML, PPTX, PDF, formations) au-delà des pages HTML
2. Corpus disponible : références WCAG/zéro-défaut de digit-ai-page-html + checklist propre à dériver
3. Non-recouvrement : digit-ai-page-html ne couvre que les pages HTML — les autres livrables n'ont pas de contributeur accessibilité

## 1. domaine
`accessibilite` — accessibilité et lisibilité des livrables visuels au-delà des pages HTML : PPTX, PDF, supports de formation, schémas diffusés, avec attention aux publics à basse vision et à la restitution imprimée/PDF.

## 2. declencheurs
- `content_patterns` : `accessibilit|WCAG|contraste|a11y|lisibilité|malvoyan`
- Types de demandes : contribution accessibilité sur tout livrable visuel non couvert par digit-ai-page-html
- Ne pas router : audit ou production d'une page HTML autonome (→ digit-ai-page-html, qui embarque déjà V1–V7 et l'oracle a11y), dessin de schémas (→ digit-ai-schemas).

## 3. corpus
Chemins résolus (test d'existence exécuté le 21/07/2026 par scaffold-expert) :
- `/mnt/skills/user/digit-ai-page-html/references/zero-defaut-visuel.md`
- `/mnt/skills/user/digit-ai-page-html/references/bonnes-pratiques.md`
### Checklist propre (dérivée du corpus, transposée hors HTML)
1. Contraste effectif ≥ 4.5:1 (texte courant) / ≥ 3:1 (texte large) sur le support final projeté ou imprimé, pas seulement à l'écran d'auteur.
2. Taille minimale lisible selon la distance de lecture (projection en salle ≠ écran individuel ≠ PDF imprimé).
3. Information jamais portée par la couleur seule (légendes, états, courbes) — doublage par forme, libellé ou position.
4. Alternatives textuelles : alt descriptif sur toute image porteuse de sens ; schémas accompagnés d'une lecture textuelle.
5. Piège PDF/print : hover, focus et JS inertes — tout contenu interactif (tooltip, simulateur) doit avoir un équivalent statique.
6. Interactifs (si support numérique) : focus visible et contrasté ≥ 3:1, cibles atteignables au clavier, rôles ARIA sur composants riches.

## 4. rubrique (figée — 5 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-accessibilite » ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Contraste et lisibilité sur le support final (projection, impression, PDF) — écarts mesurables vs seuils.
2. Information portée par la couleur seule — doublages requis (forme, libellé, position).
3. Alternatives textuelles et lecture non visuelle des éléments graphiques.
4. Comportement en PDF/print des éléments interactifs — équivalents statiques exigés.
5. Publics et contexte de diffusion (distance, éclairage, matériel) — prérequis qui en découlent.

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. Ne refait pas l'audit outillé d'une page HTML (→ oracle a11y et render_page.py de digit-ai-page-html) ; contribue là où l'oracle ne va pas : supports non-HTML, contexte de diffusion, publics.

## 6. fixture_valeur
- Demande témoin : « Nous allons projeter la fiche architecture X14 en salle chez le client (vidéoprojecteur, une personne malvoyante dans l'audience) puis l'envoyer en PDF — points d'attention avant diffusion ? » — rejouée le 21/07/2026, A/B dans `fixtures/fixture-accessibilite.md`.
- Baseline : section A de `fixtures/fixture-accessibilite.md` — figée avant le durcissement de la présente fiche.
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`.
