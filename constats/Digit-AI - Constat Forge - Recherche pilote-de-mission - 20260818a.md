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

## RÉSOLU le même jour — branche (a) : l'objet existait ailleurs

Question posée à l'humain le 18/08 en clôture de la boucle. **Réponse le jour même** : il en
détenait une archive, remise dans `digit-ai-factory/input/pilote-de-mission.skill` (5 402
octets, ZIP). L'hypothèse prudente de ce constat — « une recherche sur UN poste ne prouve rien
sur un autre » — était la bonne : écrire « il n'a jamais existé » aurait été faux de quelques
heures.

**Contenu, versionné depuis dans `.claude/skills/pilote-de-mission/`** — v1.0.0, quatre
fichiers, empreintes sha256 (16 premiers caractères) :

| Fichier | sha256 |
|---|---|
| `SKILL.md` | `167d7a5f18ccc3f0` |
| `references/schema-de-plan.md` | `9a9220df33413341` |
| `references/protocole-adaptation.md` | `488eb16526dec563` |
| `references/instanciations-types.md` | `a0d4ce2b7d889085` |

**Admission R-33 ter, jouée AVANT versionnement** : `oracle-scan-agentdef.mjs` sur le
`SKILL.md` extrait → **PASS**, aucun défaut sur les quatre familles CAP-1..4.

### Ce que la remise a permis de vérifier — et le résultat n'est pas celui qu'on pouvait espérer

Les deux instanciations citées comme provenance **existent bien** et sont datées :
`references/instanciations-types.md` porte APDLB (20-21/07/2026, avec son premier cycle
d'adaptation réel : 3 informations entrantes, une classe balayée, 2 étapes créées, diff
restitué) et l'AO Client-E lot 4 Normandie (21/07/2026, absorption d'une mission déjà en
cours). La provenance de `oracle-plan-de-mission` est donc **rejouable** : elle se lit, elle
se date, et elle se contredirait si elle était fausse.

Et la preuve amont du lot Run-Delivery — celle sur laquelle le registre avait failli décider
en aveugle — **se confirme, mesurée sur l'objet réel** :

| Terme cherché dans les 4 fichiers | Occurrences |
|---|---|
| risque · parties prenantes · RAID | **0** |
| compte rendu · rapport d'avancement · lessons learned · REX | **0** |
| mesure de succès · bénéfice · cadence | **0** |

C'est-à-dire que TF-0323 (W5-W7 : risques, parties prenantes, mesures de succès) comblait un
trou **réel**, et que le constat de TF-0324 sur les cinq artefacts de cadence tient lui aussi.
La leçon n'est pas que la preuve était fausse — elle était juste. La leçon est qu'elle a été
**invérifiable pendant deux jours**, et qu'un registre qui décide sur de l'invérifiable a
raison par accident.

### Ce qui reste

TF-0324 avait deux conditions de déblocage : (1) une mission réelle instrumentée, (2) un
porteur d'état versionné. **La seconde est levée** — le porteur existe, et son bloc 1
(en-tête de mission) plus son bloc 7 (journal des adaptations) sont l'état que les cinq
artefacts de cadence devraient dériver **sans le dupliquer**, ce que le critère
« aucun second porteur d'état créé » exige. La première tient toujours : aucune mission réelle
n'est instrumentée dans les dépôts.

*Note de forme, pour la prochaine remise* : l'archive est arrivée sous `input/` à plat, sans
sidecar ni nommage R-4. Ce n'est pas un défaut de l'humain — le canal des lots
(`input/00-retours/`) est fait pour des retours, pas pour la remise d'un artefact manquant, et
aucune convention n'existait pour ce cas. Constat en passant, à porter au registre si le cas
se reproduit.
