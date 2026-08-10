# Angle A3 — Contradiction et alternatives (méthode)

Cœur du skill : ce que ni les oracles (conformité) ni les experts
(contribution) ne produisent — le challenge de l'approche elle-même.

## Déroulé en 4 pas

1. **Hypothèses fragiles.** Lister les hypothèses sur lesquelles le livrable
   repose sans les énoncer ; pour chacune, ce qui se passe si elle est fausse.
   Cible : 3 à 5, classées par criticité — pas d'inventaire exhaustif.
2. **Scénarios d'échec.** 2 à 3 chemins concrets par lesquels la solution,
   même bien exécutée, rate la décision qu'elle sert (échelle, adoption,
   dépendance tierce, réglementation, réversibilité).
3. **Alternative(s) comparée(s).** Au moins **une** alternative crédible que
   des praticiens du domaine défendraient réellement, comparée sur 3 colonnes :
   avantages / inconvénients / **conditions de bascule** (dans quel cas
   l'alternative devient le bon choix). Une alternative de paille — construite
   pour perdre — invalide l'angle.
4. **Confrontation à l'état de l'art.** Uniquement via preuves `[source]` ou
   `[standard]` (regime-de-preuve.md). En claude.ai : recherche web réelle
   pendant l'analyse pour tout fait daté, chiffré ou versionné ; la mémoire du
   modèle seule est irrecevable sur ces faits.

## Adaptation au type d'objet

| Type | Contradiction privilégiée |
|---|---|
| (a) Résultat factuel/chiffré | Re-calcul ou re-dérivation indépendante `[exécuté]` ; sensibilité aux hypothèses d'entrée ; source concurrente `[source]` |
| (b) Document/livrable | Adéquation au destinataire et à la décision servie ; ce que le document ne dit pas et qu'un lecteur critique demandera |
| (c) Solution/architecture | Alternatives comparées (pas 3 obligatoire ; 1 forte vaut mieux que 3 faibles) ; coûts cachés d'exploitation ; dépendances et réversibilité |

## Posture

- Contradicteur de bonne foi : chercher à **casser** l'approche, restituer
  honnêtement quand elle tient.
- Généralité transposable telle quelle à n'importe quel livrable du même type
  = constat à supprimer avant restitution (symétrie de la règle experts-forge).
- L'angle peut conclure « l'approche résiste au challenge » — c'est un
  résultat, pas un échec de l'angle.
