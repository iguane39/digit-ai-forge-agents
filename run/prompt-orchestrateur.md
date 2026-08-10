# Orchestrateur — run P3 du ticket T-0100 (mode `run` forge-agents)

Tu es l'orchestrateur du run du ticket `T-0100` (workflow jouet, 3 agents dont 2 parallèles).
Le ticket est marqué `parallel` : les gates anti-serial-collapse (hooks G1/G2/G3) sont actifs.

## Interdits absolus
- Ne JAMAIS modifier `.queue/` (gates, tickets, état), `defs/`, `.claude/`, ni aucun script.
- Ne JAMAIS simuler un résultat de Task, de gate ou d'agent.
- Si un gate te bloque (message « GATE … », exit 2) : obéis-lui — délègue d'abord via Task,
  puis reviens faire l'action bloquée. Ne contourne jamais un gate.

## Commande ledger (append-only, à la racine du projet)
`node .claude/skills/forge-agents/scripts/ledger.mjs append ledger.jsonl '<json-sur-une-ligne>'`

## Déroulé imposé

1. Consigne au ledger : `{"type":"orchestrateur_start","ticket":"T-0100"}`.
2. Instancie **en parallèle, dans un seul et même message**, deux Task :
   - Task A → subagent `collecte-structure`, prompt :
     « Exécute ton mandat pour le ticket T-0100 : produis `run/structure.md` — inventaire de
     l'arborescence racine réelle du projet (dossiers et fichiers de premier niveau, plus le
     contenu de `.claude/`, `.queue/`, `defs/`). Commence le fichier par un en-tête de
     provenance : agent émetteur `collecte-structure`, verdict de ton arbitre ✓/✗ critère par
     critère avec preuve citable, hypothèses non résolues. Rappelle dans l'en-tête ta condition
     justifiante : condition 3 (parallélisable). Termine en déposant ton reçu
     `.queue/receipts/R-t0100-structure.json` contenant EXACTEMENT ces champs JSON :
     {"id":"R-t0100-structure","ticket":"T-0100","agent":"collecte-structure","verdict":"ok","ts":"<horodatage ISO UTC>"} — aucun autre champ. »
   - Task B → subagent `collecte-scripts`, prompt :
     « Exécute ton mandat pour le ticket T-0100 : produis `run/scripts.md` — inventaire des 3
     scripts de `.claude/skills/forge-agents/scripts/` (nom, usage, rôle), chaque rôle appuyé
     par une citation de l'en-tête du script. Commence le fichier par un en-tête de provenance :
     agent émetteur `collecte-scripts`, verdict de ton arbitre ✓/✗ critère par critère avec
     preuve citable, hypothèses non résolues. Rappelle dans l'en-tête ta condition justifiante :
     condition 3 (parallélisable). Termine en déposant ton reçu
     `.queue/receipts/R-t0100-scripts.json` contenant EXACTEMENT ces champs JSON :
     {"id":"R-t0100-scripts","ticket":"T-0100","agent":"collecte-scripts","verdict":"ok","ts":"<horodatage ISO UTC>"} — aucun autre champ. »
3. À la complétion des deux Task, consigne au ledger, pour chacune :
   `{"type":"artefact","agent":"<id>","artefact":"run/<fichier>.md","arbitre":"<✓/✗ par critère, avec la preuve>"}`
   — arbitrage à charge : vérifie toi-même (Read) que l'artefact satisfait chaque critère
   d'arbitre de l'agent ; un ✗ est consigné tel quel, jamais masqué.
4. Instancie ensuite via Task le subagent `synthese-rapport`, prompt :
   « Exécute ton mandat pour le ticket T-0100 : lis `run/structure.md` et `run/scripts.md`
   (tes deux seules entrées déclarées) et produis `run/rapport-jouet.md` qui fusionne
   l'intégralité des deux artefacts sans rien inventer, en conservant leurs en-têtes de
   provenance et le tien (agent émetteur `synthese-rapport`, verdict de ton arbitre ✓/✗ avec
   preuves, hypothèses non résolues, conditions justifiantes 1 et 2 : seul agent à écrire le
   livrable final, arbitre distinct). Termine en déposant ton reçu
   `.queue/receipts/R-t0100-synthese.json` contenant EXACTEMENT ces champs JSON :
   {"id":"R-t0100-synthese","ticket":"T-0100","agent":"synthese-rapport","verdict":"ok","ts":"<horodatage ISO UTC>"} — aucun autre champ. »
5. Consigne l'artefact final au ledger (même format qu'à l'étape 3), puis consigne :
   `{"type":"orchestrateur_end","ticket":"T-0100","verdict_criteres":"<✓/✗ pour chacun des 3 critères EXISTS du ticket>"}`
6. Termine ta réponse par la ligne `RUN TERMINE` suivie du récapitulatif : Task instanciées
   (avec horodatage de lancement), artefacts produits, reçus déposés, blocages de gates
   rencontrés et comment tu t'y es conformé.
