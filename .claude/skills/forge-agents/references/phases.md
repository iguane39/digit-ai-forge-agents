# Phases du run forge-agents — P0 → A0 → A → B → C → C2

Six phases, dans l'ordre : **P0 → A0 → A → B → C → C2**. Seule P0 est sautable, et uniquement
par son bypass explicite (workflow déjà fourni) ; les cinq phases suivantes ne sont jamais
sautables.

## P0 — Imagination du workflow

Mécanisme de divergence **délégué** au module `references/axes-de-divergence.md` de
`challenge-un-prompt` — composition, pas duplication.

**Entrée.**

- Le **besoin** exprimé (objectif métier, livrable final attendu), pas un workflow.
- Contraintes connues : outils/skills disponibles, points de passage obligés, interdits.
- **Bypass explicite** : si l'utilisateur fournit déjà un workflow arrêté, P0 est sautée
  d'office et le skill enchaîne sur le découpage (comportement antérieur inchangé —
  non-régression).

**Mécanisme.**

1. Reformuler le besoin perçu en 1-2 phrases falsifiables (socle : reformulation fausse →
   workflows faux).
2. Générer **2 à 5 candidats de workflow orthogonaux** en appliquant la règle d'or du module de
   divergence : chaque candidat tranche une décision structurante différente, et on doit pouvoir
   nommer ce que chacun **exclut**. Axes prioritaires pour un workflow (déclinés des axes du
   module, du plus structurant au moins) :
   - **Stratégie de production** : pipeline séquentiel ⇄ parallèle avec fusion ⇄ itératif par
     raffinements ;
   - **Découpage du travail** : par étape du processus ⇄ par type de livrable ⇄ par niveau de
     qualité (draft/durci/audité) ;
   - **Placement du contrôle qualité** : gate final unique ⇄ oracle à chaque frontière d'agent ⇄
     juge continu ;
   - **Placement de l'humain** : validation aux jalons ⇄ arbitrage sur exception seulement ⇄
     fire-and-forget borné.
3. Format imposé par candidat : `Libellé (AXE) — optimise … · sacrifie … · convient quand …` +
   schéma linéaire du workflow en une ligne (`étape → étape → étape`).
4. **Escape hatch** : s'il n'existe pas 2 candidats réellement distincts pour ce besoin, le dire
   et proposer le candidat unique — jamais de divergence de cérémonie.
5. **Rendre la main** : choix indicés a/b/c… + option « aucun — le workflow que je vise est en
   fait … ». P0 se termine ici ; le découpage ne démarre qu'après sélection.

**Sortie.** Le **workflow retenu**, formalisé au format d'entrée déjà attendu par le découpage
(phase A) : liste ordonnée d'étapes, entrées/sorties par étape, points de contrôle. Cette sortie
devient l'unique entrée de la suite du pipeline — les candidats non retenus sont abandonnés, pas
archivés dans le contexte.

**Critère symétrique amont** (pendant du critère « mérite un agent ») : un candidat de workflow
n'est proposé que s'il exclut quelque chose qu'un autre candidat permet.

**Critères d'acceptation de P0 (binaires).**

1. Reformulation du besoin présente et falsifiable.
2. 2 à 5 candidats, chacun nommant explicitement ce qu'il exclut ; aucune paire paraphrase de
   l'autre.
3. Triplet `optimise · sacrifie · convient quand` présent sur chaque candidat.
4. Main rendue à l'utilisateur avant tout découpage (sauf bypass d'entrée ou escape hatch du
   mécanisme, alors dits explicitement).
5. Sortie au format d'entrée exact de la phase A — le découpage ne sait pas si le workflow vient
   de P0 ou de l'utilisateur.
6. Délégation effective : P0 référence le module de `challenge-un-prompt`, ne recopie pas sa
   typologie.

## A0 — Qualification amont : le référentiel d'exigences

Produire le **référentiel d'exigences du livrable final**, artefact figé avant tout run :

- **périmètre** : liste fermée des contenus attendus du livrable final ;
- **profondeur** : niveau de détail exigé par contenu, formulé de façon testable ;
- **fond** : exactitude, sources, cohérence + règles dures du dossier (ex. aucun montant ou TJM
  inventé — placeholders) ;
- **forme** : charte applicable, convention de nommage Digit-AI, format de fichier.

Chaque exigence est **binaire ou mesurable** ; toute exigence non binarisable est reformulée ou
escaladée à l'humain — jamais conservée en l'état. Le référentiel est validé par l'humain dans le
même tour que le découpage (phase A), puis **figé** : aucun assouplissement en cours de run.
C'est un artefact de frontière : en-tête de provenance, tracé au ledger, opposable à la recette.

## A — Découpage

Entrée : description du workflow (prose, liste d'étapes, skill à agentifier, ou brief forge-brief).
Produire le graphe d'étapes ; appliquer à chacune le critère « mérite un agent » (SKILL.md) ;
restituer à l'humain : agents proposés **avec leur condition (1/2/3)**, étapes restées dans
l'orchestrateur, graphe entrées/sorties, référentiel A0. **Validation humaine en un tour** avant
toute génération.

## B — Génération

Écrire les `agent.def` (references/agent-def.md) + l'arbitre de chaque agent. Poser les blocs
`parallel` (gates anti-serial-collapse) sur les étapes déclarées parallélisables. Sous Claude
Code, la façade compile ensuite vers `.claude/agents/*.md` (system prompt, tools restreints).

## C — Orchestration (deux profils d'exécution)

L'orchestrateur exécute le graphe, tient le **ledger append-only persisté dans le dossier du
projet** (`scripts/ledger.mjs`), applique l'arbitre de chaque agent à sa sortie (arbitrage à
charge : chercher à faire échouer, ✓ seulement avec preuve). Bornes : ~2 passes correctives max
par agent, puis escalade avec ✗ signalés. Restitution : livrable(s) + mini-rapport ✓/✗ consolidé
+ escalades.

- **Profil Claude Code** (mode `run`) : agents compilés via `scripts/compile-agent-def.mjs`,
  instanciés en subagents (Task), gates anti-serial-collapse actifs, parallélisme réel.
- **Profil claude.ai** (mode `run-sequentiel`) : ordre topologique strict, isolation
  comportementale, limites consignées au ledger — protocole : references/run-sequentiel.md.

## C2 — Recette aval (avant remise)

Un **agent de recette dédié** — lecture seule, arbitre distinct (condition 2 du critère) — teste
le **livrable final** contre le référentiel A0, exigence par exigence :

- verdict ✓/✗ par exigence, chaque ✓ adossé à une **preuve citable** ;
- **oracle réellement exécuté** quand le type de livrable en possède un (run-oracles,
  conformité charte HTML, validation PPTX…) ; à défaut, contrôle sur lecture avec justification
  explicite de l'absence d'oracle ;
- en cas de ✗ : au plus **3 itérations correctives**, ciblées sur le seul agent responsable de
  l'exigence en échec ; au-delà, escalade à l'humain avec les ✗ signalés.

**Jamais de remise silencieuse d'un livrable en échec, jamais d'assouplissement du référentiel
en cours de run.**

## Partage des rôles (anti-duplication)

Les arbitres par agent testent les **sorties intermédiaires** ; la recette C2 ne teste que le
**livrable final** contre le référentiel A0. Deux juges, deux objets — jamais le même deux fois.

## Proportionnalité

Workflow simple à livrable unique : A0 tient en **5 exigences maximum**, C2 en **une passe**.
La machinerie se dose sur l'enjeu, pas l'inverse.
