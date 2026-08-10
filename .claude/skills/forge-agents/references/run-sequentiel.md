# run-sequentiel — exécution dégradée assumée dans claude.ai

Mode d'exécution du graphe d'agents **sans substrat Claude Code** : une seule instance de Claude
joue les agents l'un après l'autre, dans l'ordre topologique du graphe. Ce mode est **assumé et
étiqueté** — il ne prétend jamais être un run Claude Code, et ses limites sont consignées au
ledger dès l'ouverture du run.

## Ce qui reste RÉEL (identique au run Claude Code)

- **Les artefacts** : chaque sortie d'agent est un vrai fichier écrit dans le dossier de travail,
  avec son en-tête de provenance (agent émetteur, verdict d'arbitre, hypothèses non résolues).
- **Les oracles** : la recette C2 et les arbitres outillés exécutent réellement run-oracles et
  les oracles de domaine disponibles — jamais de verdict simulé, outil absent = SKIP motivé.
- **Le ledger** : append-only via `scripts/ledger.mjs`, persisté, vérifié avant restitution.
- **Le référentiel A0** : figé et validé par l'humain avant le run, opposable à la recette.
- **La discipline de frontière** : avant de jouer un agent, ne relire que ses `entrees`
  déclarées (les fichiers), pas le fil de conversation des agents précédents.

## Ce qui est DÉGRADÉ (à consigner au ledger, entrée `limites`)

| Limite | Conséquence |
|---|---|
| Isolation **comportementale**, pas structurelle | Les agents partagent le contexte de la session ; la contamination est atténuée par la discipline de frontière, pas garantie |
| Permissions `outils` **non contraintes** par le substrat | Respect sur l'honneur ; un écart d'outillage constaté = ✗ au ledger |
| **Aucun parallélisme** | Ordre topologique strict ; les blocs `parallel` et leurs gates anti-serial-collapse sont **sans objet** — consignés « non exécutés (substrat) », jamais « passés » |
| Pas de subagents Task | Un « agent » = un segment de travail étiqueté, pas une instance séparée |

## Protocole

1. Ouvrir le ledger : entrée `run_open` avec `substrat: "claude.ai-sequentiel"` + entrée
   `limites` (tableau ci-dessus).
2. Trier le graphe topologiquement (fail-closed si cycle ou sortie orpheline).
3. Pour chaque agent, dans l'ordre : annoncer `[agent: <id>]` · relire uniquement ses `entrees` ·
   produire ses `sorties` (fichiers + en-tête de provenance) · appliquer son arbitre **à charge**
   (✓ avec preuve, ✗ avec raison) · consigner au ledger. Bornes : ~2 passes correctives, puis ✗
   signalé et poursuite ou stop selon dépendances.
4. Recette C2 : jouée par un segment dédié qui ne lit **que** le livrable final et le référentiel
   A0 — oracles exécutés, 3 itérations max, escalade au-delà.
5. Restitution : livrable(s) + PV de recette + ledger vérifié (`ledger.mjs verify`) + rappel
   explicite des limites du substrat.

## Quand l'utiliser — et quand s'en abstenir

Adapté : workflows petits et moyens, validation d'un découpage et d'un référentiel avant le run
réel, chantiers où les livrables sont outillés par des oracles (l'essentiel de la garantie vient
alors de C2, qui est réelle). À proscrire : workflows dont la valeur tient au parallélisme ou à
l'isolation stricte des permissions — là, le run Claude Code n'est pas une option de confort,
c'est le critère.
