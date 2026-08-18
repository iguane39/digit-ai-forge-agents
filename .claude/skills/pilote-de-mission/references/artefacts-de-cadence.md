# Artefacts de cadence — les cinq qui reviennent

Table normative. **TF-0324, 18/08/2026.** Le constat qui l'a ouverte, mesuré et revérifié le
16/08 : sur les skills installés, **0 occurrence** de « RAID », « compte rendu », « rapport
d'avancement », « lessons learned ». Ce skill couvrait le **plan** et son **adaptation** — la
mission telle qu'elle se conçoit et telle qu'elle change. Il ne couvrait pas la **cadence** :
l'artefact qui revient chaque semaine, que personne ne conçoit et que tout le monde attend.

## La règle qui commande toutes les autres

**Aucun de ces cinq artefacts ne porte d'état.** Ils se **dérivent** de l'état de mission
(`MISSION.md` en repo, fichier mémoire `/areas` en chat), qui reste la source de vérité unique —
règle dure du skill, et critère d'acceptation explicite de TF-0324 : « preuve qu'aucun second
porteur d'état n'a été créé ».

Concrètement : un artefact de cadence est une **vue d'assemblage datée**. S'il faut y saisir une
information qui n'est pas déjà dans l'état de mission, c'est l'état de mission qu'on complète
d'abord. Un chiffre qui n'existe que dans un rapport d'avancement est un chiffre que la mission
ne connaît pas.

## La cadence est une donnée d'instance

Elle se déclare dans l'état de mission, **jamais en spécification** — deuxième critère
d'acceptation de TF-0324. Section canonique :

```text
## Artefacts de cadence

- artefact: revue-raid · cadence: hebdomadaire · derniere: 2026-08-14 · source: forge/RAID-20260814a.md
- artefact: rex-de-fin · cadence: fin-de-mission · statut: non-applicable · motif: mission en cours
```

Périodes admises (ensemble fermé) : `quotidienne` · `hebdomadaire` · `bihebdomadaire` ·
`mensuelle` · `trimestrielle` · `a-la-demande` · `fin-de-mission`.

**Écarter un artefact est légitime ; l'omettre ne l'est pas.** Un artefact qui ne s'applique pas
à cette mission se déclare `statut: non-applicable` **avec son motif**. C'est la loi transverse
n° 3 : « absent » est une réponse, un blanc n'en est pas une.

Jugé par `quality-oracles/scripts/oracle-cadence-de-mission.mjs` (C1-C5). **C5 itère sur les cinq
artefacts ATTENDUS, jamais sur ceux qui sont déclarés** — un contrôle qui itère sur ce qui est là
ne voit jamais ce qui manque.

## La table des cinq

| Artefact | Se dérive de | Cadence usuelle | Régime de preuve | Juge |
|---|---|---|---|---|
| **Revue RAID** | Risques (§Risques de l'état), décisions du journal, étapes en dépassement d'échéance | hebdomadaire | Le **R** : chaque risque coté (probabilité, impact) avec propriétaire et parade. A/I/D : porteur et échéance nommés | `oracle-plan-de-mission` **W5** pour le R · A/I/D non outillés, limite déclarée |
| **Rapport d'avancement** | Statuts d'étapes, chemin critique, hypothèses ayant bougé | hebdomadaire | **Aucun chiffre sans sa source** — troisième critère d'acceptation de TF-0324. « 4 étapes sur 9 » se lit dans l'état, et le rapport dit où | `oracle-claims` |
| **Compte rendu de réunion** | Décisions prises pendant la session, actions ouvertes | hebdomadaire ou par réunion | Présents · décisions · actions **avec porteur et échéance**. Une décision sans décideur n'est pas une décision | aucun à ce jour — entrée nommée dans la cartographie du 18/08 (complétude de champs), non ouverte au registre |
| **REX de fin de mission** | Journal des décisions, cycles d'adaptation, écarts entre plan initial et exécution | `fin-de-mission` | Blocs obligatoires, verdict **factuel**, non-traité **motivé**, écarts à la lettre, risques, actions par acteur | `oracle-synthese` **S1-S8** (pilot), applicables tels quels — S4 (choix fermé) y vaut « aucune », déjà géré |
| **Suivi des bénéfices** | Mesures de succès (§Mesures de l'état : indicateur, cible, source) | mensuelle | Attendu **et** constaté, chacun avec sa source et sa date de relevé | `oracle-claims` pour les chiffres · **la comparaison dans le TEMPS n'a aucun juge** — c'est la seconde capacité que la cartographie du 18/08 a nommée |

## Ce que cette table ne fait pas

**Elle ne remplace aucun oracle et n'en duplique aucun.** Trois des cinq artefacts avaient déjà
leur juge avant TF-0324, et deux de ces trois étaient déjà exécutés. Ce qui manquait n'était pas
un régime de preuve par artefact : c'était **la cadence elle-même**, et c'est le seul objet neuf.

**Elle ne prescrit pas de gabarit de mise en forme.** La forme d'un compte rendu se plie au
client ; ce qui ne se plie pas est la liste des champs dus. Un gabarit de présentation figé
aurait été un objet durable de plus, sans juge.

**Instanciation.** Les fixtures de `oracle-cadence-de-mission`
(`quality-oracles/fixtures/cadence-de-mission-green.md` et ses quatre sources réelles) sont une
instanciation **jouée** — quatre artefacts tenus, le cinquième écarté avec motif, et un oracle qui
le vérifie à chaque self-test. Ce n'est **pas** une instanciation sur mission réelle : aucune
mission réelle n'est instrumentée dans les dépôts au 18/08 (`missions.json` de forge-seo ne porte
que « Exemple Synthetique » et « Test », sur des répertoires temporaires). Le premier critère
d'acceptation de TF-0324 reste donc **ouvert sur cette moitié-là**, et il se soldera sur un fait —
une mission réelle — pas sur une décision.
