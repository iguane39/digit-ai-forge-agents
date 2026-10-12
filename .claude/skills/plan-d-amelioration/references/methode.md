# Méthode du plan d'amélioration post-audit

> **Vérifié le 2026-10-12. Péremption : 2027-04-12.** Méthode datée et éditable (loi 4 : une
> donnée volatile est une donnée). Sources : prompt réécrit du 19/09/2026 (chapitre 8 de
> `output/03-etudes/20260919-L99-audit-et-plan-d-amelioration-plateforme.md` du pilot) et étude
> d'opportunité du même jour, section 5. **Aucune mission réelle ne l'a encore exercée** : elle naît
> de cette analyse et de cas d'essai fictifs. La première mission la corrigera, et cette ligne
> disparaîtra avec la correction.

## 1. La frontière

- **Remédiation = écart à une norme.** Tout constat rattachable à un contrôle du référentiel
  d'audit vit dans le rapport d'audit et dans son fichier d'actions. Le plan ne le recopie pas : il
  le cite par son identifiant (`REM-Dxx-nnn`).
- **Amélioration = écart à une ambition.** Rien n'échoue à un contrôle, mais le produit pourrait
  mieux servir ses utilisateurs, son exploitant ou son éditeur. Chaque amélioration nomme la cible
  qu'elle sert, et la cite.
- **Table de jonction obligatoire, même vide** : les remédiations qu'une amélioration rend
  caduques ou modifie, les améliorations qu'une remédiation conditionne. On ne paie pas deux fois.

Le test qui tranche est décidable parce que l'audit exporte la liste des contrôles évalués
(`<rapport>.controles-evalues.json`, contrat forge-audit 1.0.0) : un constat qui cite un contrôle
évalué, ou qui reprend un constat d'audit (`finding_ref`), est une remédiation.

## 2. La base de domaines

`references/domaines.json` : treize domaines fermés, chacun rattaché aux dimensions D00-D17 de
forge-audit qui le recouvrent et aux caractéristiques d'ISO/IEC 25010:2023. Front, back,
connectivités et dette d'un fork n'ont pas de dimension d'audit propre : c'est ce que le plan
ajoute à l'audit. Un domaine sans amélioration justifiée le dit en une ligne, avec ce qui a été
regardé. Un domaine ajouté ou retiré se déclare au champ `ajustements`, avec son motif.

## 3. Les cinq questions d'ouverture

Posées en une fois, en choix fermés. Sans réponse, le défaut s'applique et s'écrit en tête du plan.

| Question | Défaut |
|---|---|
| Q1 Lecteur du plan ? | le commanditaire seul |
| Q2 Horizon et capacité ? | trois horizons (court, moyen, long), sans hypothèse de capacité ; efforts en complexité × durée |
| Q3 Invariants ? | ce qui structure le produit (hébergement, modèle d'instance, briques majeures) ne se remet en cause que par une fiche de décision structurante argumentée |
| Q4 Volume visé à douze mois ? | inconnu : le plan donne les seuils où une recommandation change |
| Q5 Une instance de test est-elle joignable pour mesurer ? | non |

## 4. La fiche à dix champs

1 identifiant `AM-<DOMAINE>-NN` · 2 titre · 3 constat **sourcé** (fichier et ligne, document, ou
mesure) · 4 cible servie (citation de la documentation du produit, ou réponse Q1-Q5) · 5
proposition, et l'alternative écartée avec son motif · 6 gain attendu, et à quoi on le constatera ·
7 effort en complexité × durée · 8 dépendances (autres `AM`, `REM`) · 9 statut vis-à-vis de
l'existant : neuve, déjà planifiée (référence), contraire à une décision enregistrée (référence et
motif) · 10 preuve de clôture, binaire.

S'y ajoutent l'horizon, le rang, la liste des chiffres et le test rétro (fiche → cible →
intention). **Une recommandation sans constat sourcé ou sans cible est retirée, pas adoucie.**

## 5. Les trois statuts d'un chiffre

**Mesuré** : la commande et sa sortie sont jointes. **Lu** : le document et la ligne sont cités.
**Hypothèse** : déclarée comme telle, elle attend sa mesure. Sans instance joignable (Q5), les
performances livrent un **plan de mesure** (quoi, comment, seuil visé), jamais des conclusions.

## 6. Prioriser et lotir

Priorité dérivée, jamais ressentie : gain × portée rapporté à l'effort, corrigé des dépendances.
Les remédiations de gravité maximale précèdent toute amélioration du même composant. Trois
horizons, des lots « utiles, utilisables, utilisés » (`gabarits/DEMARCHE-ROI.md` du pilot). En
tête, les dix premières décisions, chacune en choix fermé, avec ce qu'elle coûte, ce qu'elle
rapporte et ce qui se passe si rien n'est décidé.

## 7. Contrat de sortie, et la règle qui joue chaque point

Le tableau relie les douze points du contrat du 19/09 aux règles de
`scripts/oracle-plan-d-amelioration.mjs`. Il se lit par ligne ; la dernière colonne dit ce qui
n'est pas joué par l'oracle et où cela se juge.

| Point du contrat | Règle | Hors oracle |
|---|---|---|
| 1 dix champs par fiche | PA1 | — |
| 2 zéro constat sans source | PA2 | la vérité de la source |
| 3 zéro chiffre sans statut ; « mesuré » avec commande et sortie | PA3, PA13 | — |
| 4 zéro doublon avec l'audit | PA4 (verbe joindre) | — |
| 5 tous les domaines présents | PA5 | — |
| 6 plans existants rattachés | PA6 | — |
| 7 table de jonction présente | PA7 | — |
| 8 horizon, rang, dix décisions | PA8 | — |
| 9 aucun effort en jours | PA9 | une durée de prose n'est pas un effort |
| 10 empreinte de l'archive inchangée | PA10 (si déclarée) | — |
| 11 oracles des vues | — | `check_html.py`, `render_page.py`, `oracle-filtres-tableau`, `check_markdown.py`, `run-oracles-design.mjs` |
| 12 test rétro | PA12 | le sens de la chaîne |

PA11 (statut vis-à-vis de l'existant) et PA14 (questions d'ouverture) jouent les cas limites du
protocole de tests du 19/09.
