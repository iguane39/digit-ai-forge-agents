# Corpus propre — SEO et hygiène de migration web (checklist)

Constitué le 23/07/2026 pour la fiche `expert-seo-web` (inventaire P2 §5 E8). Ancré dans les chantiers SCC Vendôme (canonical/og en dur détectés au fetch du 21/07), digit-ai.fr (400 URLs / 10 indexées), landing APDLB. Complémentaire de l'oracle `parite-migration` : **l'oracle mesure, la fiche explique et priorise.**

1. **Canonical et og:url : le piège des URL en dur** — un canonical absolu recopié de la prod sur l'environnement migré dit aux moteurs « la vraie page est ailleurs » ; générer les canonicals depuis l'hôte courant ou en relatif au build, et vérifier après CHAQUE build (cas Vendôme : en dur des deux côtés).
2. **Indexabilité de l'environnement de recette** — un env de recette indexable crée du duplicate content contre sa propre prod : noindex ou authentification sur la recette, MAIS vérifier que le noindex ne part pas en prod à la bascule (les deux sens du même défaut).
3. **Plan de redirections** — toute URL qui change = 301 unitaire (jamais tout-vers-accueil) ; conserver la carte ancienne URL → nouvelle, y compris querystrings significatifs ; les 404 post-bascule se lisent dans la Search Console dès J+1.
4. **Sitemap et robots.txt** — régénérer le sitemap avec les URLs finales, le déclarer en Search Console ; vérifier que robots.txt ne bloque pas les assets critiques (CSS/JS) ni des sections entières héritées de la recette.
5. **Search Console : le diagnostic factuel** — couverture (indexées vs explorées non indexées : cas digit-ai.fr 400/10 = problème structurel, pas éditorial), performances par requête avant/après bascule, inspection d'URL pour vérifier le rendu réel de Google.
6. **Hygiène du contenu dupliqué interne** — variantes www/non-www, http/https, trailing slash : un seul hôte canonique, redirections systématiques des autres ; les hreflang/pagination si le site en a.
7. **Mesure post-bascule** — figer un point de référence avant bascule (positions, pages indexées, trafic organique) et une fenêtre de surveillance (2-4 semaines) ; sans baseline, impossible d'attribuer une chute à la migration.

Frontière du corpus : la parité mécanique route par route → oracle `parite-migration` ; le rendu et la charte → `digit-ai-page-html` ; le contenu éditorial → hors périmètre.
