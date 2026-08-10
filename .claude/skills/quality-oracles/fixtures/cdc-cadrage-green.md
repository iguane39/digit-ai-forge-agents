# CDC de cadrage — fixture verte

Fixture de référence : CDC minimal tenant les 10 points du contrat de sortie.
Marqueurs employés : **[FAIT]** pour ce qui est constaté, **[HYP]** pour ce qui est supposé.

## SECTION 0 — Autopsie des échecs constatés

Corpus documenté, n = 1. **[FAIT]** Une suite d'interface restait sur les premières pages.
Cause : biais de disponibilité du générateur.
Extension aux autres pans : **[HYP]**, aucun cas réel documenté.

## SECTION 1 — Inventaire exécuté

Commande : `ls -la ./projet`

> drwxr-xr-x  backend
> drwxr-xr-x  frontend

Commande : `cat projet/pyproject.toml`

> [project] name = "demo"

**[FAIT]** Stack Python détectée, deux rôles.

## SECTION 2 — Frontière avec l'existant

| Capacité | Verdict | Composant examiné |
|---|---|---|
| Inventaire de surface | CRÉÉ | aucun composant n'énumère la surface testable |
| Exécution | ÉTENDU | lanceur de process existant, déterminisme à ajouter |
| Sécurité applicative | RÉUTILISÉ | oracle SAST du registre |

## SECTION 3 — Modèle de risque et critères d'arrêt

Le nombre de combinaisons croît trop vite pour être couvert intégralement : aucun objectif
de volume n'est fixé. À la place, une cotation criticité × probabilité × coût.

Doublet de contre-oracles : la **couverture de surface** répond à « a-t-on atteint ? »,
le **score de mutation** répond à « le vérifie-t-on ? ».
Règle dure : le score de mutation ne peut jamais être publié seul, il se calcule sur le seul
périmètre atteint et flatte d'autant plus que la suite est lacunaire.

| Id | Seuil | Valeur |
|---|---|---|
| S-01 | Détection du corpus section 0 | 100 % |
| S-02 | Pyramide unitaire / intégration / bout en bout | 70 / 20 / 10 |
| S-03 | Score de mutation sur périmètre critique | ≥ 70 % |
| S-04 | Couverture de surface API | 100 % des codes déclarés |
| S-05 | Couverture de surface Front | 100 % des routes |
| S-06 | Durée de suite en intégration continue | ≤ 15 min |
| S-07 | Tests instables tolérés | ≤ 1 % |

## SECTION 4 — Architecture

Le **noyau** porte le modèle de risque, la traçabilité, les critères d'arrêt et le reporting.
Les **adaptateurs** portent la profondeur d'exécution, par couple pan × technologie.
Un pan sans adaptateur produit un diagnostic **partiel**, déclaré comme tel dans le rapport,
jamais masqué par un vert global. Un pan non couvert est nommé.

## SECTION 5 — Garde-fous

Lecture seule par défaut sur le code analysé ; écriture sur branche dédiée sous feu vert.
Boucle de correction bornée à 3 itérations, puis livraison avec les écarts résiduels.
Aucune donnée de production non anonymisée dans les jeux d'essai.

## SECTION 6 — Plan phasé et gates

Phase 1 — banc d'essai à défauts plantés. Critère de sortie binaire : 100 % du corpus détecté.
Phase 2 — confrontation à un projet réel non conçu pour le framework.
Aucune généralisation avant preuve d'exécution en phase 1.

## Questions ouvertes

**a) Projet réel de confrontation ?** — Recommandé : un dépôt portant déjà des tests. **Défaut appliqué** : phase 2 non planifiée.

**b) Régime des jeux de données ?** — Recommandé : synthétiques uniquement. **Défaut appliqué** : synthétiques uniquement.

**c) Budget de suite en intégration continue ?** — Recommandé : 15 minutes. **Défaut appliqué** : S-06 tel que proposé.
