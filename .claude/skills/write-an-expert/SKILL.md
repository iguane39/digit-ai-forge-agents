---
name: write-an-expert
description: Analyse le besoin d'un nouveau domaine d'expertise et génère en une commande une fiche expert conforme au schéma 6 champs d'experts-forge (domaine, déclencheurs, corpus résolu par test d'existence, rubrique, frontière, fixture de valeur) plus son entrée de registre en statut todo, puis guide son durcissement jusqu'à l'admission par oracle-judge. Scaffolder transactionnel calqué sur write-an-oracle — toutes les validations avant toute écriture, un refus ne laisse aucune modification partielle. Use when l'utilisateur veut créer, scaffolder ou ajouter un expert de domaine au pool experts-forge, couvrir un nouveau domaine de contribution, ou industrialiser la création d'une fiche expert. Ne pas déclencher pour appliquer une fiche existante à une demande (→ experts-forge), créer un oracle de jugement (→ write-an-oracle), ni créer un skill complet (→ write-a-skill).
---

# write-an-expert — scaffolder de fiches expert

Compagnon d'`experts-forge`, calqué sur `write-an-oracle` : rendre mécanique la
création d'un expert de domaine — moins de 15 minutes du besoin au squelette
valide, admission comprise dans le guide.

## Loi du scaffolder

**Transactionnel** : `scripts/scaffold-expert.mjs` exécute toutes les
validations avant la moindre écriture ; tout refus (exit 2, raison JSON) laisse
le skill cible strictement intact. Validations bloquantes : registre présent,
domaine kebab-case unique, regex de déclencheurs valide, critère « mérite un
expert » renseigné (3 conditions), **corpus non vide et chemins résolus par
test d'existence exécuté** — jamais déclarés.

## Procédure

1. Vérifier le critère « mérite un expert » (schéma d'experts-forge §) :
   récurrence, corpus disponible, non-recouvrement par un skill existant.
   Un doute sur le non-recouvrement = ne pas scaffolder, router vers le skill.
2. Scaffolder :
   ```
   node scripts/scaffold-expert.mjs --skill-dir <experts-forge> \
     --domaine <kebab> --patterns "<motif|motif>" \
     --corpus "<chemin1,chemin2>" --merite "<récurrence>;<corpus>;<non-recouvrement>"
   ```
   Produit : `fiches/expert-<domaine>.md` (squelette 6 champs, placeholders
   `[À …]` explicites) + entrée registre en **todo**.
3. Durcir : compléter périmètre, exclusions de routage, checklist propre du
   corpus (3–7 points — le corpus externe seul ne suffit pas), rubrique figée
   (3–7 axes), frontières avec les domaines voisins.
4. Admettre : figer une baseline **avant** toute lecture de la fiche, produire
   la contribution par la rubrique, soumettre à `oracle-judge` armé de
   `rubrique-juge-experts.md`. MATERIEL → registre `ok` daté ; NON_MATERIEL →
   `refuse` conservé ; CLI `claude` absente → **SKIP motivé + remontée, jamais
   de verdict simulé**. Deux NON_MATERIEL sur un même domaine : ne pas
   insister, remonter.
5. Vérifier le routage : rejouer `experts-forge/scripts/self-test-routage.mjs`
   après toute modification de déclencheurs.

## Fixtures du scaffolder (rejouables par `scripts/self-test-scaffold.mjs`)

- **Verte** : création complète d'une fiche valide sur copie de test —
  fiche présente, entrée registre todo, exit 0.
- **Rouge** : corpus avec chemin mort → exit 2, raison explicite, et état du
  skill cible **strictement identique** avant/après (vérifié par empreinte
  de l'arborescence, pas déclaré).

## Frontières

Ne juge pas les contributions (→ `oracle-judge`), n'applique pas les fiches
(→ `experts-forge`), ne modifie jamais une fiche existante (durcissement =
éditions manuelles chirurgicales, hors scaffolder).
