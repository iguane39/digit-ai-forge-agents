# Gate G0 — budget (extension optionnelle, TF-0106)

Addendum à « Digit-AI - Spec Forge - Gates anti-serial-collapse - 20260719a.md » (`input/`,
document daté conservé tel quel — cette page documente l'extension, ne réécrit pas l'historique).
G0 s'ajoute à G1 (Instanciation), G2 (Complétion), G3 (Résultat) : un budget est une garde-fou de
**coût**, vérifiée **avant** l'appel modèle — G3 juge un résultat déjà produit, G0 refuse l'appel
qui n'a pas encore eu lieu.

## Schéma ticket — champ optionnel `budget`

```yaml
# .queue/tickets/T-0042.yaml
budget:
  max_appels: 5   # G0 : nombre maximal d'instanciations Task autorisées sur ce ticket
```

- `budget` absent → G0 inactif, **zéro écriture** dans `.queue/state/` (même règle que
  `parallel` pour G1-G3 — non-régression, aucun champ obligatoire ajouté).
- `budget` est **indépendant** de `parallel` : un ticket peut plafonner ses appels sans imposer
  de minimum de sous-agents, et réciproquement.
- `max_appels` non numérique → champ optionnel mal formé, **ignoré** avec message explicite
  (jamais un blocage sur une faute de frappe dans un champ optionnel).

## Mécanique (hook `PreToolUse`, matcher `Task`)

`.claude/settings.json` déclare G0 **avant** G1 sur le même matcher `Task` : le budget est
vérifié avant que G1 ne compte l'instanciation, cohérent avec « budget vérifié avant appel ».

```
.queue/gates/g0-budget.sh
```

1. Ticket introuvable ou sans `budget` → exit 0, aucune écriture (symétrique G1).
2. `jq` indisponible → **refus** (exit 2), jamais un laisser-passer par défaut.
3. `appels ≥ max_appels` (état `.queue/state/<ticket>.json`, champ `appels`) → bloque (exit 2),
   message renvoyé à l'agent, main rendue à l'arbitrage humain (pas de retry automatique caché :
   dépasser un budget n'est pas une erreur qui se corrige seule, contrairement à G1).
4. Sinon → incrémente `appels` sous verrou, autorise (exit 0).

État étendu (`.queue/state/<ticket>.json`) : nouveau champ `appels` (défaut `0`, lu partout via
`.appels // 0` — les fichiers d'état antérieurs à TF-0106 restent valides sans migration).

## Écart avec G1/G2/G3 au moment de l'écriture de G0 (corrigé depuis, TF-0118)

Constat fait en écrivant ce sous-item (12/08/2026, machine de développement) : `jq` était absent
de ce poste. `g1-block-direct.sh` sur un ticket `parallel` réel, dans cet état, se terminait en
**exit 0** (laisse passer) après avoir imprimé des erreurs `jq: command not found` — c'est-à-dire
que **G1/G2/G3 dégradaient en fail-OPEN, pas fail-closed, quand `jq` manquait** sur la machine
qui les exécute. C'était un défaut réel du mécanisme existant, hors périmètre de ce sous-item
(G0 seul était mandaté) ; consigné comme candidature séparée puis corrigé par TF-0118 : les
quatre gates partagent maintenant `require_jq()` (`common.sh`) et refusent explicitement
(exit 2) plutôt que de laisser passer en silence — preuve rejouable dans
`scripts/self-test-gates-jq.sh`.

G0 est conçu pour **ne pas hériter** de ce défaut : `ticket_has_budget`/`ticket_budget_max_appels`
n'utilisent que `grep`/`sed` (jamais `jq`), donc un ticket **sans** `budget` reste totalement
insensible à l'absence de `jq`. Dès qu'un `budget` est déclaré, l'absence de `jq` produit un
**refus explicite** (`exit 2`), jamais un passage silencieux : un garde-fou de coût qui fail-open
en silence n'en est pas un.

## Preuve (double sens, self-test dédié)

`scripts/self-test-gate-budget.sh` — isolé (`QUEUE_DIR` temporaire, aucune écriture dans les
tickets/état réels du dépôt) :

- **vert** : ticket sans `budget` → G0 exit 0, zéro écriture ;
- **vert** : `max_appels` mal formé → ignoré, exit 0 ;
- **rouge** : `jq` absent + ticket avec `budget` → refus prudentiel, exit 2 (rejoué et PASS sur
  ce poste, `jq` étant réellement absent au moment de l'écriture) ;
- **vert/rouge par plafond réel** (2 appels autorisés, 3e bloqué) : chemin nécessitant `jq` —
  **non rejoué sur ce poste** (`jq` absent), exécuté automatiquement dès que `jq` est disponible
  (le script détecte sa présence et bascule sur ce volet plutôt que de le simuler). Relecture
  ligne à ligne : idiome identique à `g1-count-task.sh`/`g1-block-direct.sh` déjà en production.

## Constat de portée : `.queue/` n'est jamais versionné

`.gitignore` (racine du dépôt, ligne 24) exclut `.queue/` en bloc — commentaire du dépôt :
« Espace d'engagement (local uniquement — jamais dans le dépôt public) ». Vérifié : `.queue/`
n'a **jamais** figuré dans l'historique git de ce dépôt (`git log --diff-filter=A --all -- .queue`
: 0 résultat). Conséquence directe et assumée : **G1, G2, G3 et ce G0** vivent tous les quatre
dans un dossier qui ne sera **jamais capturé par un commit** de ce dépôt — ils ne sont présents
que sur les postes où un engagement réel (ex. runs P3/P4 de ce checkout) les a matérialisés à la
main. `.claude/settings.json` (lui, versionné) référence donc des scripts qui **n'existent pas**
sur un clone frais du dépôt public — écart déjà présent avant ce sous-item (G1-G3), auquel G0
s'aligne sans l'aggraver ni le corriger (hors mandat de ce sous-item ; candidature séparée à
proposer : soit sortir `.queue/gates/*.sh` de l'ignore — ce sont des scripts génériques, pas des
données d'engagement, à la différence de `.queue/tickets/`/`state/`/`receipts/` qui contiennent
de vrais éléments client — soit documenter que le protocole « queue » est un gabarit à redéployer
par engagement, jamais un mécanisme partagé du dépôt public). `scripts/self-test-gate-budget.sh`
détecte l'absence de `.queue/gates/g0-budget.sh` et **SKIP** proprement plutôt que d'échouer sur
un mécanisme structurellement absent d'un clone frais.

## Restes (hors V0)

- Coût/tokens réels (pas seulement un nombre d'appels) : nécessiterait un champ de coût dans le
  reçu, impossible sans dépasser le plafond de 6 champs du schéma reçu existant (cf. `g2-require-
  receipt.sh`) — à traiter par un mandat dédié si le besoin se confirme.
- ~~Correction du fail-open de G1/G2/G3 sur `jq` absent~~ — fait, TF-0118 (`require_jq()` dans
  `common.sh`, preuve dans `scripts/self-test-gates-jq.sh`).
- Façade Codex (le budget, comme G2/G3, est appelable manuellement : `bash .queue/gates/
  g0-budget.sh` avec `QUEUE_TICKET` exporté — non testé côté Codex).
