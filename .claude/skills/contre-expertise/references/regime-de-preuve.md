# Régime de preuve — types admissibles et critères

Chaque constat de contre-expertise porte **exactement un** tag de preuve.
Un constat sans tag admissible est supprimé ou marqué « à vérifier » — jamais
présenté comme établi.

## Les 4 types

| Tag | Définition | Critère d'admissibilité |
|---|---|---|
| `[exécuté]` | Vérification rejouée pendant l'analyse : code exécuté, calcul re-sommé, rendu observé, oracle lancé | La commande ou l'opération figure dans la restitution, avec son résultat réel — jamais « testé mentalement » |
| `[source]` | Référence externe réelle, consultée pendant l'analyse (recherche web, documentation éditeur, manuel fourni) | Citation ou lien précis ; une recherche réellement effectuée dans la session — jamais de mémoire seule pour un fait daté ou chiffré |
| `[standard]` | Norme, référentiel ou bonne pratique nommés et vérifiables (WCAG 2.2, RGPD, TOGAF, ISO, RFC…) | Le standard est nommé avec sa clause ou son principe précis — « les bonnes pratiques du marché » sans nom = irrecevable |
| `[raisonnement]` | Argument logique explicite, présenté comme tel | La chaîne d'inférence est écrite (prémisses → conclusion) ; le lecteur peut la contester pas à pas |

## Interdits absolus

- « État de l'art » ou « le marché » invoqués sans source ni standard nommé.
- Chiffre de marché, benchmark, pourcentage d'adoption non cités.
- Montant, TJM, geste commercial inventés — placeholder ou « à vérifier ».
- Requalifier un `[raisonnement]` en `[standard]` pour lui donner plus de poids.

## Hiérarchie en cas de conflit entre preuves

`[exécuté]` > `[source]` > `[standard]` > `[raisonnement]`.
Un raisonnement contredit par une exécution ou une source cède — le noter
explicitement dans l'arbitrage (cf. references/restitution.md).

## « À vérifier »

Marqueur obligatoire pour toute affirmation utile mais non prouvable dans la
session (accès manquant, information détenue par un tiers, donnée client).
Chaque « à vérifier » est restitué avec **qui peut trancher** et **comment**
(question à poser, document à obtenir, test à exécuter).

## Périmètre d'exécution des preuves `[exécuté]`

Une preuve `[exécuté]` **observe**, elle ne **transforme** jamais. Trois règles dures :

1. **Non destructif.** L'objet audité n'est jamais modifié pendant l'analyse — jamais
   d'écriture, de renommage ni de suppression sur le livrable ou ses sources. La vérification
   se fait sur une lecture ou une copie ; toute commande qui muterait l'objet est un défaut de
   contre-expertise, pas une preuve.
2. **Commandes de vérification durcies.** Rester en lecture seule et neutraliser les effets de
   bord : pour git, toujours `--no-pager` (ou `-c core.pager=cat`) afin qu'un `.git/config` de
   dépôt ne fasse pas exécuter de pager ; jamais de `curl … | sh`, `npm/pip install`, ni de
   script tiers lancé à l'aveugle. Un oracle de la forge (`run-oracles`) est le moyen privilégié.
3. **Ne jamais réécrire le livrable.** La contre-expertise produit un **constat** (verdict +
   preuves + corrections priorisées), jamais une nouvelle version de l'objet. Proposer une
   correction, oui ; la substituer au livrable, non — c'est le rôle du producteur, pas de
   l'expert. Un expert qui refait le travail perd son indépendance de jugement.
