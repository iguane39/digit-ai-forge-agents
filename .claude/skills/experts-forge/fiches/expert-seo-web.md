# Fiche expert — `seo-web`

Version 1.0.0 — 24/07/2026 — Statut registre : **ok** — admise le 24/07/2026 (verdict MATERIEL, oracle-judge en session S′ ; dossier A/B : `fixtures/fixture-seo-web.md`).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : 3 chantiers (SCC Vendôme canonical/og en dur + indexabilité env Azure, digit-ai.fr 400 URLs / 10 indexées, landing APDLB)
2. Corpus disponible : checklist propre constituée (canonicals, indexabilité recette, redirections, sitemap/robots, GSC, duplicate, mesure post-bascule)
3. Non-recouvrement : l'oracle parite-migration mesure la parité mécanique — la fiche explique et priorise, et page-html porte le rendu jamais le référencement

## 1. domaine
`seo-web` — indexabilité et référencement : canonicals et og, indexabilité des environnements, plans de redirections, sitemap/robots, diagnostic Search Console, duplicate content, hygiène et mesure des migrations SEO.

## 2. declencheurs
- `content_patterns` : `SEO|référencement|indexation|canonical|sitemap|robots.txt|Search Console|migration de site|redirection 301|duplicate content|noindex`
- Types de demandes : recette SEO d'une migration, diagnostic d'indexation, hygiène canonical/sitemap/robots d'un site
- Ne pas router : parité mécanique route par route (→ oracle parite-migration), rendu et charte des pages (→ digit-ai-page-html), contenu éditorial (hors périmètre).

## 3. corpus
Chemins résolus (test d'existence exécuté le 23/07/2026 par scaffold-expert) :
- `.claude/skills/experts-forge/references/corpus-seo-web.md`
- La checklist propre EST le corpus ci-dessus (7 points, `corpus-seo-web.md`) — constituée pour ce domaine le 23/07/2026.

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-seo-web» ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. Canonicals et og — génération depuis l'hôte courant, vérification après chaque build. (corpus §1)
2. Indexabilité par environnement — noindex de la recette, et sa non-propagation en prod. (corpus §2)
3. Continuité des URLs — plan de 301 unitaire, sitemap et robots régénérés. (corpus §3-§4)
4. Diagnostic factuel — lecture Search Console (couverture, requêtes, inspection d'URL). (corpus §5-§6)
5. Mesure — baseline avant bascule, fenêtre de surveillance, attribution des écarts. (corpus §7)

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. L'oracle `parite-migration` mesure — la fiche explique et priorise (complémentarité déclarée de l'inventaire P2 E8) ; le rendu → `digit-ai-page-html`.

## 6. fixture_valeur
- Demande témoin : recette avant bascule d'une migration de site vitrine vers Azure (détail : `fixtures/fixture-seo-web.md`).
- Baseline : section A de `fixtures/fixture-seo-web.md` — baseline reconstituée figée le 23/07/2026 AVANT rédaction de la présente fiche (recette Vendôme du 21/07 inaccessible depuis le repo, écart documenté du brief §4).
- Critère : au moins un élément actionnable absent de la baseline — verdict par `oracle-judge` armé de `rubrique-juge-experts.md`.
