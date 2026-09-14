# Contrat d'entrée & chiffrage

## Typologie des entrants acceptés

Un ou plusieurs parmi :

| Entrant | Ce qu'il apporte | Exemple corpus |
|---|---|---|
| CDC / cahier des charges client | Périmètre, contraintes techniques imposées, exigences | Client-F (CDC-METIER, stack Laravel imposée) |
| Notes ou transcript de RDV | Douleurs, contexte, vocabulaire du client, contraintes implicites | Client-I |
| Diagnostic `digit-ai-prospection` | Cas d'usage scorés ICE, qualification BANT, enjeux | Entrant naturel de la chaîne avant-vente |
| Échanges email | Précisions de périmètre, validation d'orientations | Client-H |
| Contraintes explicites | Budget / enveloppe, TJM, échéance, stack imposée | Client-G (MS Fabric) |
| Propale ou lot précédent | Acquis en production, moteur réutilisable, TJM établi | Client-H Lot 2 (sur Lot 1) |

## Checklist de qualification (avant rédaction)

- [ ] Client : nom, interlocuteur, secteur, localisation
- [ ] Type : première propale ou lot suivant ?
- [ ] Douleurs / enjeux identifiés (au moins 2-3 concrets, chiffrés si possible)
- [ ] Découpage en lots pressenti (combien, quel ordre, quelles promesses)
- [ ] Chiffrage : budget, enveloppe ou TJM disponible ? → cf. règles ci-dessous
- [ ] Échéance ou contrainte calendaire
- [ ] Contraintes techniques (stack imposée, outils en place à préserver, souveraineté)
- [ ] Données sensibles transitant par un LLM ? → bloc UE / human-in-the-loop obligatoire

## Si des entrants critiques manquent

Poser **au maximum 4 questions, groupées en un seul message**, sur les seuls points
bloquants : périmètre, lots, budget/TJM, échéance. Tout le reste : hypothèses explicites,
listées dans la réponse (et reportées dans la slide « Points de vigilance » ou en notes).

Anti-pattern : poser une question, attendre, en poser une autre. Anti-pattern inverse :
générer 14 slides sur du vide sans signaler les hypothèses.

## Règles de chiffrage (dures)

1. **Aucun montant inventé.** Sources légitimes, par ordre de priorité :
   - chiffrage explicite dans les entrants ;
   - TJM établi sur une mission précédente du même client (ex. « TJM Lot 1 », à vérifier
     dans la propale de ce lot, source citée) — à confirmer avec l'utilisateur ;
   - proposition de l'utilisateur en réponse à la question de cadrage.
2. Sans source : slide investissement en placeholders `[à chiffrer]`, signalés
   explicitement à l'étape de validation du plan. Ne jamais générer le PPTX final
   avec des placeholders de prix sans l'avoir dit.
3. **Structure canonique de la slide investissement** (constante sur les 4 propales
   du corpus) :
   - « Investissement par lot — facturation au forfait »
   - BUDGET GLOBAL : gros chiffre € HT + libellé du périmètre
   - Ligne de décomposition (ex. « 4 lots × N € HT » ou « N j × TJM € HT »)
   - Tableau : Lot / Durée / Tarif forfait, avec ligne TOTAL
   - Bloc MODALITÉS : forfait par lot, avenant après validation specs, pas de frais
     de déplacement (Métropole Lilloise), garantie 3 mois (si dev applicatif),
     coûts récurrents séparés (si hébergement/API), options chiffrées séparément
4. **Geste commercial** optionnel et explicite : « demi-journée de cadrage offerte si
   signature » — uniquement si l'utilisateur le valide.
5. Ce qui est **hors périmètre est nommé et chiffré « séparément » ou « ultérieurement »**
   (TMA, API tierces, alertes, lot N+1) — jamais passé sous silence.
