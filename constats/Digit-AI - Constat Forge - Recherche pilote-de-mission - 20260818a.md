# Digit-AI — Constat de recherche : le skill `pilote-de-mission` — 20260818a

**TF-0326.** Émis par le pilot le 2026-08-18, sur mandat humain (boucle d'amélioration des
17 items restants du registre TODO-FORGE).

## Ce qui est établi, et par quoi

La forge juge un artefact dont elle ne possède **ni la spécification ni les instances**.
`oracle-plan-de-mission.mjs` cite `pilote-de-mission` comme provenance de ses règles, et le
lot externe « Extension Run-Delivery » (16/08) a bâti deux candidatures sur des mesures faites
*dans* ce skill — dont « 0 occurrence de *risque* dans pilote-de-mission v1.0.0 ».

Recherche exécutée le 2026-08-18, périmètre et méthode nommés pour que personne n'ait à la
refaire à l'aveugle :

| Où | Comment | Résultat |
|---|---|---|
| les 15 dépôts de `c:\dev` | recherche de contenu sur `pilote-de-mission`, hors `.git` et `node_modules` | **16 fichiers le MENTIONNENT, zéro ne le CONTIENT** |
| `c:\dev`, tous dépôts | recherche de répertoire `*pilote-de-mission*` (profondeur 6) | **aucun** |
| `~/.claude/skills` (24 skills installés) | listage direct | **absent** |

Les mentions se répartissent ainsi : le registre du pilot et ses vues (TODO), l'étude
`cadence-de-mission` du 17/08, le lot de candidatures externe du 16/08, deux documents datés
de `digit-ai-forge-conception` (04/08, qui le citent comme **frontière**, pas comme source),
et deux artefacts de ce dépôt — `oracle-plan-de-mission.mjs` et le `manifest.json` des
fixtures. Le dépôt `digit-ai-forge-pilot_old` en porte des copies, sans plus.

**C'est la maladie de TF-0290** (hook C7 survivant en copie installée seule), à un stade plus
avancé : ici, même la copie installée est absente.

## Ce que ce constat ne dit PAS

Il ne dit pas que l'objet n'a jamais existé. Une recherche exhaustive sur **un** poste ne
prouve rien sur un autre poste, un autre compte, ou l'espace claude.ai — trois endroits où il
a pu vivre et vivre encore. Écrire « il n'a jamais existé » serait exactement la faute que cet
item dénonce : une affirmation invérifiable présentée comme un fait.

## Ce qui est fait, et ce qui reste à un humain

**Fait, dans ce dépôt** : les deux mentions internes sont marquées `PROVENANCE NON REJOUABLE`,
avec la date et le périmètre de la recherche. La distinction y est explicite et elle compte :

- les règles **W1-W7 de l'oracle sont autoportantes** — elles se lisent, se rejouent et se
  jugent sur ses fixtures rouge/verte, sans rien devoir à l'objet cité. Rien à retirer ;
- ce qui n'est plus opposable, c'est **l'argument d'autorité** — « ces règles viennent d'un
  skill qui a servi deux fois en réel ». Personne ne peut l'ouvrir pour le vérifier.

**Reste à un humain**, et c'est une question, pas une tâche : `pilote-de-mission` existe-t-il
ailleurs (autre poste, autre compte, espace claude.ai) ?

- **Si oui** → le versionner chez sa forge d'accueil ; ce constat se clôt sur son sha, et la
  preuve amont du lot Run-Delivery redevient rejouable ;
- **Si non** → les mentions vivantes se requalifient en « inspiration non versionnée » et les
  candidatures qui s'appuient sur son contenu (TF-0323, TF-0324) se réinstruisent sur des
  mesures faites ailleurs. Les documents **datés** de forge-conception, eux, ne se réécrivent
  pas : ils citent une frontière au 04/08, ils restent tels quels.

Tant que la question n'est pas tranchée, la règle tient en une phrase, et elle est déjà
inscrite dans le code : **aucune décision ne s'appuie sur le CONTENU de `pilote-de-mission`.**
