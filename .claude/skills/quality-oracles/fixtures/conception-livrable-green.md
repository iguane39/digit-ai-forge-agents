# Produit-12 — Process Ingénierie POC-to-Prod, consolidation et cible (cas VERT)

Le même livrable, conçu avant d'être écrit. Une dimension est un axe d'observation du
passage POC → production, formulé comme une question à laquelle un acteur répond par
un fait vérifiable. Le référentiel en compte 17 dimensions, toutes nommées au chapitre
« Les dimensions du référentiel ».

## Les dimensions du référentiel

Question du lecteur : de quoi parle-t-on quand on dit « dimension » ?
Ce que le chapitre apporte : la liste nommée et close des axes d'observation.
Ce qu'il permet de décider : sur quels axes un acteur doit se prononcer.

- Traçabilité du code livré
- Reproductibilité de la construction
- Couverture de tests
- Revue de code
- Gestion des secrets
- Analyse de composition logicielle
- Analyse statique de sécurité
- Observabilité applicative
- Journalisation
- Alerte et astreinte
- Sauvegarde et restauration
- Reprise après sinistre
- Gestion des accès
- Documentation d'exploitation
- Gestion du changement
- Recette fonctionnelle
- Bascule et retour arrière

## Décisions à prendre

Question du lecteur : qu'attend-on de moi, et pour quand ?
Ce que le chapitre apporte : les quatre décisions ouvertes, chacune avec son objet.
Ce qu'il permet de décider : lesquelles peuvent être tranchées aujourd'hui.

- **D1 — périmètre du lot 1** : arrêté à seize capacités, aucune option laissée ouverte ;
  la liste des seize est reprise ici même et n'attend aucun arbitrage complémentaire.
- **D2 — propriétaire de l'astreinte** : l'équipe plateforme la porte du lundi au vendredi,
  l'équipe produit la reprend le week-end à compter de la bascule.
- **D3 — seuil de couverture bloquant** : 70 % de couverture de lignes, mesuré par la porte
  de qualité, sans exemption possible sur les modules de paiement.
- **D4 — date de bascule** : le 15 du mois suivant la recette, avec retour arrière outillé
  et fenêtre de deux heures. Voir chapitre « Trajectoire » pour l'historique des reports.

## Trajectoire

Question du lecteur : dans quel ordre les paliers s'ouvrent-ils ?
Ce que le chapitre apporte : la séquence des paliers et leurs conditions d'entrée.
Ce qu'il permet de décider : la date d'ouverture du palier suivant.

Un palier est un ensemble de conditions d'entrée constatées qui autorise la bascule d'un
lot vers l'environnement suivant.

La trajectoire enchaîne les paliers dans l'ordre des dépendances techniques, sans jamais
ouvrir un palier dont la condition d'entrée n'est pas constatée.
