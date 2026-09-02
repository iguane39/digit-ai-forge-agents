# Fixture de valeur A/B — `migration-plateforme-brownfield`

Cas **réel**, anonymisé (Produit-05). Il reproduit exactement la situation décrite par
TF-0717 : un lotissement de bascule que quatre portes automatiques et une contre-expertise
complète ont laissé passer, et dans lequel le client a trouvé, seul, que **le programme ne
prévoit nulle part de prévenir les utilisateurs**.

## 1. Demande témoin (rejouable)

> Revue du lotissement du programme de migration v1 → v2 d'une plateforme **en service**.
> Matière fournie :
> - une **machine d'états de bascule à huit états** : `planned`, `rehearsed`, `frozen`,
>   `migrated`, `verified`, `switched`, `observed`, `closed` (ou `rolled_back`) ;
> - un **lot 2 de quarante travaux** : 16 capacités, 6 portes, 12 travaux de bascule,
>   6 critères de sortie, 4 questions ouvertes ;
> - un **plan de cohabitation v1/v2 de six mois**, sens de synchronisation non précisé ;
> - la reprise de l'historique est renvoyée « au lot 3 ».
>
> Question : **ce lotissement est-il complet pour ouvrir le lot 2 ?**

## 2. Baseline (A) — figée AVANT la rédaction du corpus et de la fiche

Reconstitution de ce que la contre-expertise complète du 22/08/2026 a effectivement produit sur
cette demande : **sept constats**, aucun sur le sujet que le client a relevé onze jours plus tard.

1. La machine d'états est cohérente : chaque état a un successeur et une sortie d'échec
   (`rolled_back`).
2. Les 6 portes du lot 2 doivent porter un critère de sortie observable — 2 d'entre elles sont
   formulées en intention.
3. Les 4 questions ouvertes du lot 2 n'ont pas de propriétaire nommé.
4. La durée de cohabitation (six mois) n'est adossée à aucun jalon : elle se lit comme une
   estimation, pas comme un engagement.
5. Le sens de synchronisation entre v1 et v2 pendant la cohabitation n'est pas précisé ;
   l'arbitrage des conflits non plus.
6. La reprise de l'historique renvoyée au lot 3 n'est pas assortie d'une décision sur ce qui
   reste consultable dans la v1 en attendant.
7. Le lot 2 mélange des travaux de capacité et des travaux de bascule : la lecture du reste à
   faire est difficile.

*(Fin de la baseline. Elle s'arrête ici : le commentaire sur ce qu'elle ne dit pas est en §5,
hors de la zone comparée, pour que le comptage de §5 porte sur la baseline seule.)*

## 3. Contribution (B) — par la rubrique de la fiche

Contribution expert-migration-plateforme-brownfield :

1. **[Axe 1 · ce que la bascule impose et le préavis]** La machine d'états passe de `frozen` à
   `migrated` puis `switched` **sans aucun état d'annonce** : aucune des huit transitions ne
   décrit un moment où quelqu'un est prévenu. Or la bascule impose au moins une fenêtre
   d'indisponibilité et un changement de mode de connexion. **Manque un état `announced`
   avant `frozen`**, avec sa date d'entrée. (corpus §1 ; demande : « machine d'états à huit
   états »)
2. **[Axe 1 · ce que la bascule impose et le préavis]** Aucun des **quarante travaux du lot 2**
   n'est un travail de préavis (annonce initiale, rappel, message du jour J, adresse de
   retour). Un lot de bascule sans travail de préavis est incomplet : **le lot 2 ne peut pas
   s'ouvrir en l'état**, ou il s'ouvre en déclarant explicitement que le préavis est hors
   périmètre — et alors le préavis devient une question ouverte avec un propriétaire.
   (corpus §1 ; demande : « 12 travaux de bascule, 6 critères de sortie »)
3. **[Axe 2 · populations à prévenir]** Le lotissement ne dénombre aucune population. La
   population **à cheval sur v1 et v2** pendant les six mois de cohabitation est la plus
   coûteuse (deux modes de connexion, deux jeux de données, deux supports) et n'est ni nommée
   ni dénombrée. Le canal d'annonce doit être choisi **par population** : un message publié
   dans la v2 ne prévient personne de ceux qui sont encore en v1. (corpus §2 ; demande :
   « plan de cohabitation de six mois »)
4. **[Axe 3 · coût et durée de la cohabitation]** Les six mois ne sont bornés par aucun
   événement observable et personne n'est désigné pour prononcer l'arrêt du double run. À
   nommer : qui prononce l'arrêt, sur quel critère, et ce que coûte le mois supplémentaire —
   la baseline note l'absence de jalon (constat 4), elle ne nomme pas le décideur.
   (corpus §3 ; demande : « cohabitation de six mois »)
5. **[Axe 4 · réversibilité]** L'état `rolled_back` existe mais rien n'indique qu'il ait été
   **rejoué** en répétition (`rehearsed` porte sur la migration, pas sur le retour), et le
   **point de non-retour n'est pas nommé** : à partir de quelle première écriture métier dans
   la v2 le retour devient-il impossible ? Le sort de ce qui a été produit dans la v2 entre
   bascule et retour n'est pas décidé. (corpus §4 ; demande : machine d'états)
6. **[Axe 5 · historique]** Renvoyer la reprise de l'historique au lot 3 est acceptable ; ne
   pas dire ce qui reste consultable dans la v1 pendant ce temps ne l'est pas, et les
   obligations de conservation applicables doivent être **citées**, pas supposées.
   (corpus §5 ; demande : « historique renvoyé au lot 3 »)

## 4. Critère de différence matérielle

Verdict `MATERIEL` exigé, avec un plancher explicite : la contribution doit faire apparaître,
**absents de la baseline** :

- (a) l'**absence d'état d'annonce** dans la machine d'états de bascule — annotation 1 ;
- (b) l'**absence de travail de préavis** dans les quarante travaux du lot 2 — annotation 2.

Ces deux points sont exactement l'écart que le client a trouvé le 31/08/2026 après qu'une
contre-expertise complète et quatre portes automatiques l'aient laissé passer. La **référence
d'arrivée** est la version corrigée du rapport (écart E9, chapitre 7.5, rapport 20260831b).

Sans (a) **et** (b), la fiche reste `todo` / `refuse` et n'est jamais routée.

## 5. Vérification exécutée de la différence matérielle (02/09/2026)

Rapprochement mécanique baseline (A) ↔ contribution (B), joué sur ce fichier :

| Élément attendu | Présent dans A (baseline) | Présent dans B (contribution) |
|---|---|---|
| (a) absence d'état d'annonce nommée | non | oui — annotation 1 |
| (b) absence de travail de préavis nommée | non | oui — annotation 2 |
| population à cheval nommée | non | oui — annotation 3 |
| point de non-retour nommé | non | oui — annotation 5 |
| décideur de l'arrêt du double run nommé | non | oui — annotation 4 |

Comptage exécuté le 02/09/2026 sur les seules sections 2 (A) et 3 (B) de ce fichier :

| Terme | Occurrences dans A (baseline) | Occurrences dans B (contribution) |
|---|---|---|
| préavis | 0 | 6 |
| prévenir | 0 | 1 |
| annonc… | 0 | 3 |
| population | 0 | 4 |
| non-retour | 0 | 1 |

La différence est donc **constatable par comptage**, pas par appréciation : la baseline ne
porte aucun de ces termes, la contribution en porte quinze occurrences réparties sur cinq
notions distinctes. Ce comptage ne remplace pas le jugement de matérialité — verdict
d'admission par `oracle-judge` armé de `run-admission/rubrique-armee.md` :
`run-admission/verdict-migration-plateforme-brownfield.json`.
