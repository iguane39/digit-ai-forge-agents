# Fixture de valeur A/B — `seo-web`

## Demande témoin (rejouable)

« Nous migrons un site vitrine d'un hébergeur historique vers Azure (nouveau domaine de recette, bascule DNS prévue). Faire la recette avant bascule et dire si on peut y aller. »

## Baseline (A) — figée le 23/07/2026, AVANT rédaction de la fiche et de sa checklist

> **Baseline reconstituée (fil d'origine inaccessible)** — la baseline citée par l'inventaire P2 §5 (recette SCC Vendôme : « diff brut ») vit dans un fil claude.ai non accessible depuis le repo ; produite à neuf sans lecture de la fiche ni du corpus (règle transverse du brief §4).

Recette sans expertise SEO outillée :

Comparer page à page l'ancien et le nouveau site : contenus identiques, images qui s'affichent, liens qui répondent, formulaires fonctionnels, temps de chargement acceptable. Vérifier le certificat TLS du nouveau domaine, tester sur mobile, et faire une passe de recette utilisateur sur les parcours principaux (contact, demande de devis). Si tout est identique et fonctionnel, la bascule peut être planifiée hors heures ouvrées avec un plan de retour arrière.

## Contribution (B) — par la rubrique de la fiche, produite le 23/07/2026 (session S ; jugement différé en S′)

**Contribution expert-seo-web** (annotations rattachées à la recette de base) :

- **Axe 1 · Canonicals** — contrôler canonical et og:url sur CHAQUE gabarit du site migré : des URL absolues recopiées de la prod diraient aux moteurs « la vraie page est ailleurs » (défaut réel détecté au fetch Vendôme du 21/07, invisible dans une recette visuelle) (corpus §1).
- **Axe 2 · Indexabilité** — deux contrôles absents de la baseline : l'environnement de recette Azure ne doit PAS être indexable (duplicate contre la prod), et le noindex de recette ne doit PAS partir en prod à la bascule (corpus §2). Outillé par l'oracle `parite-migration` (P5).
- **Axe 3 · Continuité des URLs** — si une seule URL change : plan de 301 unitaire (jamais tout-vers-accueil), sitemap régénéré et déclaré, robots.txt vérifié (assets non bloqués) (corpus §3-§4).
- **Axe 4 · Diagnostic factuel** — brancher la Search Console sur le nouveau domaine dès la recette : couverture et inspection d'URL donnent le rendu réel de Google, pas celui du navigateur (corpus §5).
- **Axe 5 · Mesure** — figer positions/indexation/trafic AVANT bascule et surveiller 2-4 semaines ; sans baseline, impossible d'attribuer une chute à la migration (corpus §7).

Chaque annotation ajoute un élément actionnable absent de la baseline (recette fonctionnelle et visuelle, TLS, parcours).

## Critère de différence matérielle

Au moins un élément actionnable absent de la baseline (risque d'indexation, perte de référencement, hygiène de migration), ancré dans le corpus cité — verdict par `oracle-judge` en session S′ ≠ S.
