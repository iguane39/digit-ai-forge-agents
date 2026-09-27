#!/usr/bin/env node
/**
 * ledger.mjs — ledger de run append-only (JSON Lines), persisté dans le dossier du projet.
 * Usage :
 *   node ledger.mjs append <ledger.jsonl> '<json>'          # payload en argument shell
 *   node ledger.mjs append <ledger.jsonl> --fichier <p.json> # payload lu depuis un fichier
 *   node ledger.mjs verify <ledger.jsonl>                   # vérifie l'intégrité append-only
 * Aucune des deux formes n'accepte d'argument en surnombre : un argument non reconnu est REFUSÉ
 * (sortie 1), NOMMÉ, avec cet usage redonné (TF-1366 a, 21/09/2026).
 * Vérifications d'INTÉGRITÉ : JSON valide par ligne, seq strictement croissant depuis 1,
 * horodatages non décroissants, première entrée de type run_open. Exit 0 = PASS, 1 = FAIL.
 * Les écarts d'horodatage sont TOUS relevés (jamais le premier seul) et chacun nomme les deux
 * horodatages et le seq.
 *
 * Vérification de FORME, un seul type (TF-0385, 19/08/2026) : `oracles_verdict` porte `oracle`
 * et `verdict`. Mesure qui l'a fait naître — 8 entrées `oracles_verdict` d'un même ledger réel,
 * SIX formes de champs différentes : deux avec `oracle`+`verdict` au singulier, six avec un
 * `oracles` imbriqué sans verdict de premier niveau, et des champs improvisés à chaque fois.
 * Conséquence : la liste des oracles qui ont tourné sur un run n'était pas CALCULABLE, et un
 * juge de l'enclenchement n'avait donc pas d'entrée. Ce vérificateur ne pouvait pas le voir —
 * il ne lisait aucun payload.
 *
 * ANTÉRIORITÉ DÉCLARÉE, sur le modèle exact de R-32 bis du pilot : la forme n'est exigée que si
 * `run_open` porte `schema_ledger`. Sans ce champ, le ledger PRÉCÈDE le schéma — ses entrées
 * sont déclarées non vérifiables, jamais mises en échec. Les trois ledgers du parc mesurés le
 * 19/08 échoueraient tous : un contrôle qui met en échec tout l'existant se fait désactiver —
 * c'est le motif que R-33 bis donne pour ne pas armer d'office le verdict websec (« armer un
 * gate que personne n'a exercé le ferait désarmer au premier faux positif », REGLES-PROJET.md,
 * TF-1332) : on ne juge que ce qui s'est déclaré jugeable.
 *
 * HORODATAGES — TROIS DÉFAUTS CORRIGÉS ENSEMBLE (TF-0410, 20/08/2026). Le fait mesuré : le
 * ledger de Produit-11 (138 entrées) portait DEUX reculs d'horodatage, et le second
 * (seq 134) est resté INVISIBLE trois jours pendant que le premier (seq 129) était connu —
 * ce vérificateur sortait au premier écart. Un contrôle qui cesse de compter ne dit pas
 * « un défaut », il dit « au moins un défaut » : le reste du fichier n'est pas jugé.
 *   1. `verify` ACCUMULE les écarts (précédent : oracle-todo.mjs du pilot, qui accumule et
 *      nomme les deux horodatages) et n'exite qu'à la fin.
 *   2. La monotonie se juge contre le MAXIMUM COURANT (high-water mark), pas contre l'entrée
 *      précédente. Comparer au précédent abaisse la barre juste après un recul : l'entrée
 *      fautive devient la référence, et tout ce qui suit est jugé contre un repère faux —
 *      c'est le mécanisme même qui masquait. Mesure avant bascule : sur les 11 ledgers du
 *      parc, cette règle plus stricte ne change RIEN pour 10 d'entre eux ; sur le seul
 *      concerné elle révèle 4 entrées sous le maximum (seq 129/130/134/135) là où la
 *      comparaison au précédent n'en voyait que 2. Ce n'est donc pas un contrôle qui met en
 *      échec tout l'existant (R-33 bis) : c'est un contrôle qui voit enfin ce qui existait.
 *   3. `append` REFUSE un `ts` de payload antérieur au maximum du fichier. Cause racine des
 *      quatre écarts : l'entrée était horodatée à l'heure de l'ACTION (run de déploiement)
 *      alors qu'elle est consignée après coup, et le spread `{seq, ts, ...obj}` laissait
 *      silencieusement le payload écraser l'horodatage machine. `append` pouvait donc CRÉER
 *      le défaut que `verify` reproche. L'heure de l'action est une DONNÉE du payload
 *      (`ts_action`) ; `ts` est l'heure de CONSIGNATION, et elle ne remonte jamais.
 *
 * RECTIFICATION DÉCLARÉE, sur le modèle exact de l'antériorité déclarée ci-dessus. L'histoire
 * ne se réécrit pas : les entrées fautives restent, à leur place, avec leur ts faux. Mais un
 * ledger dont l'intégrité est DÉFINITIVEMENT rouge est un ledger que plus personne ne vérifie.
 * Une entrée ULTÉRIEURE de type `rectification_horodatage` porte donc
 * `entrees: [{seq, ts_consigne, ts_reel_estime, cause}]` et déclare des seq PRÉCIS. Bornes,
 * qui sont ce qui empêche ce mécanisme de devenir un effaceur :
 *   · elle ne couvre QUE des seq qui lui sont ANTÉRIEURS — on ne se dédouane pas d'avance ;
 *   · `ts_consigne` doit correspondre EXACTEMENT au ts de l'entrée visée : une déclaration
 *     qui ne colle pas à l'histoire ne couvre rien (et le dit) ;
 *   · les quatre champs sont dus — une déclaration incomplète est un écart, pas une couverture ;
 *   · elle n'agit QUE sur l'horodatage : seq rompu, JSON invalide, run_open absent, forme du
 *     payload restent des FAIL — rien ne les déclare rectifiables ;
 *   · un écart rectifié s'IMPRIME `[RECTIFIÉ]`, toujours, à chaque verify. Il ne disparaît
 *     pas : il cesse seulement de bloquer. Un écart NON déclaré reste FAIL.
 *
 * SURNOMBRE ET ENTRÉE SANS CONTENU (TF-1366, 21/09/2026). Fait mesuré chez un produit (21/09) :
 * un script de journal réécrit par le produit ignorait tout argument sans « -- », onze entrées
 * écrites réduites à `{seq, ts, type}`, citées ensuite comme preuves dans 7 restitutions. Ce
 * script-ci n'a pas ce défaut d'analyse (corps JSON), mais il en gardait trois voisins :
 *   (a) tout argument NON RECONNU après <ledger.jsonl> est REFUSÉ (sortie 1, l'argument est
 *       NOMMÉ, l'usage est redonné) — jamais silencieusement ignoré (voir Usage ci-dessus) ;
 *   (b) `append` REFUSE à l'écriture une entrée sans `type`, ou réduite à son seul `type` (et un
 *       `ts` éventuel) : une entrée sans contenu reste pour toujours dans un journal en ajout
 *       seul, et se lit ensuite comme une preuve ;
 *   (c) `append` REFUSE aussi une entrée d'un type contraint (table des champs dus, PAR VERSION
 *       de schéma — voir CHAMPS_DUS_PAR_VERSION) à laquelle manque un champ dû, dès que le
 *       journal a déclaré un schéma à son `run_open` — jusqu'ici seul `verify` le voyait, après
 *       coup ;
 *   (d) l'écho `[OK] entrée N ajoutée` NOMME désormais le type et les champs écrits, pour se
 *       relire depuis la seule sortie de la commande ;
 *   (e) `verify` signale, lui, les entrées SANS CONTENU déjà écrites par un AUTRE outil ou avant
 *       ce correctif : ligne `[SANS CONTENU]` non bloquante, avec le compte, sous un schéma
 *       absent ou `1.0` — FAIL sous `1.1` (ci-dessous) — on ne met jamais en échec un journal
 *       existant (antériorité déclarée, ci-dessus).
 *
 * DEUX ÉCRIVAINS, UN MÊME SEQ (TF-1367, 21/09/2026). `append` verrouille déjà l'écriture
 * (`<ledger>.lock`) : deux appels concurrents de CE script reçoivent deux seq distincts (prouvé
 * par le self-test). Le fait qui reste, mesuré chez un produit dont le script de journal n'avait
 * pas ce verrou commun : deux sessions simultanées ont écrit le même numéro de seq à quatre
 * reprises, noyé dans 57 ruptures anciennes par le seul message générique d'append-only rompu.
 * `verify` NOMME désormais un seq porté par plusieurs entrées (« seq N porté par K entrées,
 * lignes a, b — deux écrivains sans verrou commun »), EN TÊTE des écarts, distinct de toute
 * autre rupture.
 *
 * SCHÉMA 1.1 — FORGES MOBILISÉES (décision humaine D-18 (a), 26/09/2026). Sous 1.1, `run_open`
 * doit porter `forges_mobilisees` (table CHAMPS_DUS_PAR_VERSION ci-dessous) — la forme que lit
 * `oracle-enclenchement.mjs` du pilot. Les champs dus sont désormais PAR VERSION : un journal qui
 * déclare `1.0` reste jugé selon SES règles, pour toujours — une version ne durcit jamais un
 * journal qui en a déclaré une antérieure, elle ne s'applique qu'à qui la déclare.
 *
 * --fichier : le passage du payload JSON en argument shell est pénible sous PowerShell 5.1
 * (échappement des guillemets, longueur de ligne). --fichier lit le même JSON depuis un
 * fichier — mêmes validations, même verrou, même format de sortie (RA-1, 05/08/2026).
 *
 * Verrou d'écriture (append) : fichier `<ledger>.lock` adjacent, créé en exclusif (flag "wx")
 * pour toute la section lecture-du-dernier-seq → écriture. Zéro dépendance : retry borné avec
 * délai (Atomics.wait, sommeil synchrone) puis erreur explicite si le verrou reste pris.
 */
import { readFileSync, appendFileSync, existsSync, openSync, closeSync, unlinkSync } from "node:fs";

const rest = process.argv.slice(2);
const [cmd, file] = rest;
//: Tout ce qui suit <ledger> — la forme reconnue dépend de la commande (append : un payload
//: JSON, ou --fichier <chemin> ; verify : rien). TF-1366 (a), 21/09/2026 : le fait mesuré chez
//: un produit — un script de journal réécrit ignorait tout argument sans « -- », onze entrées
//: écrites amputées de ce qu'il ignorait, citées ensuite comme preuves dans 7 restitutions. Ici,
//: un argument NON RECONNU est REFUSÉ (sortie 1, nommé), jamais silencieusement ignoré.
const argsRestants = rest.slice(2);
const USAGE_APPEND = "usage : append <ledger.jsonl> ('<json>' | --fichier <payload.json>)";
const USAGE_VERIFY = "usage : verify <ledger.jsonl>";
//: Version du schéma de payload. Déclarée par `run_open` (`schema_ledger`), elle dit sous
//: quelle forme le ledger a été écrit — comme l'empreinte de règles d'un journal d'oracles.
//: TF-1366/D-18 (a), 26/09/2026 — la version COURANTE ; une version antérieure DÉCLARÉE
//: (`1.0`) reste jugée selon SES propres règles, pour toujours (table PAR VERSION ci-dessous).
const SCHEMA_LEDGER = "1.1";

//: Les champs dus des DEUX types nés de TF-0385 (19/08) et TF-1204 (22/09) — inchangés par le
//: passage à 1.1, portés tels quels dans chaque version de CHAMPS_DUS_PAR_VERSION ci-dessous.
const CHAMPS_DUS_1_0 = {
  oracles_verdict: [
    ["oracle", "le NOM de l oracle qui a rendu le verdict — sans lui, aucun juge ne peut savoir ce qui a tourne"],
    ["verdict", "le VERDICT rendu (PASS | FAIL | SKIP | NA | PARTIEL) — un releve sans verdict n est pas un verdict"],
  ],
  //: TF-1204, decision humaine D-25 (a) du 22/09/2026 — la table s etend, et c est bien une
  //: decision, pas un reflexe. LE FAIT : le 13/09 a 08:55 UTC, chez un produit, un appel lance
  //: pour LIRE l usage du journal a ecrit une entree de cloture d etape SANS etape ni resume.
  //: Le contrat d interface §3 nomme ces deux champs ; rien ne les exigeait a l ecriture, et le
  //: journal etant en ajout seul, l entree vide y reste pour toujours. Une regle ecrite que
  //: personne ne joue n est pas une regle.
  etape_close: [
    ["etape", "l ETAPE qui se ferme — une cloture qui ne dit pas ce qu elle ferme ne se relit pas"],
    ["resume", "ce qui a ete fait a cette etape — sans lui, la cloture est un evenement sans contenu"],
  ],
};

//: TF-1366/D-18 (a), decision humaine du 26/09/2026 — sous 1.1, `run_open` doit porter
//: `forges_mobilisees`. C'est la forme que lit `oracle-enclenchement.mjs` du pilot
//: (`forgesMobilisees`/`forgeCanonique`) : nom complet (`digit-ai-forge-design`) ou court
//: (`design`), une annotation apres le nom est admise. Ce validateur ne juge que la FORME
//: (tableau non vide, elements non vides) — jamais que les noms designent des forges qui
//: existent reellement : ce jugement-la appartient au juge de l enclenchement, pas a l ecriture.
function validerForgesMobilisees(valeur) {
  if (!Array.isArray(valeur)) return `doit etre un TABLEAU de chaines (recu ${typeof valeur})`;
  const invalides = valeur.filter((v) => typeof v !== "string" || !v.trim());
  if (invalides.length) return `contient ${invalides.length} element(s) non-chaine ou vide(s) sur ${valeur.length}`;
  return null;
}

//: Les champs dus, PAR VERSION DE SCHÉMA (TF-1366/D-18, 26/09/2026). Un journal qui déclare
//: `1.0` reste jugé selon les règles `1.0` SANS RIEN DE NEUF : une version ne durcit jamais un
//: journal qui a déclaré une version antérieure, elle ne s'applique qu'à qui la déclare — sur
//: le même modèle que l'antériorité déclarée (ci-dessus), un cran plus fin (par version, pas
//: seulement par présence/absence de schéma). Chaque règle est `[champ, motif]` pour une simple
//: présence, ou `[champ, motif, validateur]` quand la présence ne suffit pas à juger la forme
//: (ex. tableau non vide plutôt que simple chaîne non vide).
const CHAMPS_DUS_PAR_VERSION = {
  "1.0": CHAMPS_DUS_1_0,
  "1.1": {
    ...CHAMPS_DUS_1_0,
    run_open: [
      ["forges_mobilisees", "la LISTE DES FORGES mobilisees par ce run — sans elle, le juge de l enclenchement ne sait pas ce qui devait tourner", validerForgesMobilisees],
    ],
  },
};

//: Type d'entrée qui déclare des écarts d'horodatage antérieurs, et les champs dus de chaque
//: déclaration. Une déclaration incomplète ne couvre rien : ces quatre champs sont ce qui
//: rend la rectification vérifiable (le seq visé, le ts fautif tel qu'il est écrit, l'heure
//: réelle estimée, la cause). Sans eux, « rectification » serait un mot qui éteint un contrôle.
const TYPE_RECTIFICATION = "rectification_horodatage";
const CHAMPS_RECTIFICATION = ["seq", "ts_consigne", "ts_reel_estime", "cause"];

function fail(msg) { console.error(`[LEDGER FAIL] ${msg}`); process.exit(1); }
function fail_usage() { fail(USAGE_APPEND); }

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const LOCK_RETRIES = 100;
const LOCK_DELAY_MS = 50;

function acquireLock(lockFile) {
  for (let i = 0; i < LOCK_RETRIES; i++) {
    try {
      closeSync(openSync(lockFile, "wx"));
      return;
    } catch (e) {
      // Windows : une création/suppression concurrente du même fichier peut renvoyer EPERM,
      // EACCES ou EBUSY de façon transitoire (suppression en attente, scan antivirus) — même
      // sens qu'EEXIST : le verrou est disputé, on réessaie. Constaté au self-test (flaky).
      if (!["EEXIST", "EPERM", "EACCES", "EBUSY"].includes(e.code))
        fail(`verrou : erreur inattendue (${e.code || e.message})`);
      sleepSync(LOCK_DELAY_MS);
    }
  }
  fail(`verrou non obtenu après ${LOCK_RETRIES * LOCK_DELAY_MS}ms — un autre processus détient ${lockFile}`);
}

function releaseLock(lockFile) {
  try { unlinkSync(lockFile); } catch { /* déjà absent : rien à faire */ }
}

if (cmd === "append") {
  if (!file) fail_usage();
  // Forme reconnue : UN payload JSON positionnel, OU --fichier <chemin> — jamais les deux,
  // jamais rien d'autre en surnombre (TF-1366 a) : l'argument en trop est NOMMÉ, pas absorbé.
  const reconnu = argsRestants[0] === "--fichier" ? argsRestants.slice(0, 2) : argsRestants.slice(0, 1);
  const enTrop = argsRestants.slice(reconnu.length);
  if (enTrop.length) fail(`argument(s) non reconnu(s) : ${enTrop.map((a) => `\`${a}\``).join(", ")} — ${USAGE_APPEND}`);
  let payload;
  if (reconnu[0] === "--fichier") {
    const payloadPath = reconnu[1];
    if (!payloadPath) fail_usage();
    try { payload = readFileSync(payloadPath, "utf8").replace(/^﻿/, ""); }
    catch (e) { console.error(`[LEDGER FAIL] --fichier illisible (${payloadPath}) : ${e.message}`); process.exit(1); }
    // BOM UTF-8 : Out-File/Set-Content PowerShell 5.1 l'écrivent par défaut — sans ce retrait,
    // JSON.parse échoue sur « Unexpected token » (RA-1, cas réel visé par --fichier).
  } else {
    payload = reconnu[0];
  }
  if (!payload) fail_usage();
  let obj;
  try { obj = JSON.parse(payload); } catch { fail("payload JSON invalide"); }
  // TF-1366 (b) : une entrée sans `type`, ou réduite à son seul `type` (et un `ts` éventuel),
  // reste pour toujours dans un journal en ajout seul, et se lit ensuite comme une preuve —
  // refusée ici, avant même le verrou (aucune écriture, aucun état partagé touché).
  if (typeof obj.type !== "string" || !obj.type.trim()) {
    fail("entrée refusée : champ `type` absent — une entrée sans type ne se relit jamais comme preuve (TF-1366)");
  }
  // TF-1367 (27/09/2026) — LE NUMÉRO D'UNE ENTRÉE N'APPARTIENT QU'À L'OUTIL. Le spread
  // `{ seq, ts, ...corps }` laissait un `seq` fourni par le payload écraser celui que l'outil
  // calcule sous verrou : deux entrées pouvaient porter le même numéro sans aucune concurrence,
  // le défaut même que le verrou existe pour empêcher. Relevé par l'agent de campagne de TF-1366 ;
  // refusé ici, avant le verrou, sans rien écrire.
  if (Object.prototype.hasOwnProperty.call(obj, "seq")) {
    fail(`entrée refusée : le payload porte \`seq\` (${JSON.stringify(obj.seq)}) — le numéro d'une entrée est attribué par l'outil sous verrou, jamais fourni ; un seq recopié ferait porter le même numéro à deux entrées (TF-1367)`);
  }
  const clesUtiles = Object.keys(obj).filter((k) => k !== "type" && k !== "ts");
  if (clesUtiles.length === 0) {
    fail(`entrée refusée : aucun contenu au-delà de \`type\` (${JSON.stringify(obj.type)}) — une entrée sans contenu reste pour toujours dans un journal en ajout seul, et se lit ensuite comme une preuve (TF-1366)`);
  }
  const lockFile = `${file}.lock`;
  acquireLock(lockFile);
  // Note : process.exit() (dans fail()) ne déroule pas les blocs finally — toute sortie en
  // erreur pendant la section verrouillée doit donc libérer le verrou explicitement avant
  // d'appeler fail(), plutôt que de compter sur un try/finally autour de process.exit().
  let seq = 1;
  let schemaActif = null;
  try {
    let tsMax = "";
    if (existsSync(file)) {
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      if (lines.length > 0) {
        seq = JSON.parse(lines[lines.length - 1]).seq + 1;
        // Maximum courant, pas dernier ts : sur un fichier qui porte déjà un recul, se
        // comparer au dernier autoriserait à consigner sous une heure déjà atteinte.
        for (const l of lines) {
          const parsed = JSON.parse(l);
          const t = parsed.ts;
          if (typeof t === "string" && t > tsMax) tsMax = t;
          // Schéma ACTIF pour juger CETTE entrée (TF-1366 c) : celui du DERNIER run_open qui en
          // déclare un dans le fichier — même lecture que verify (schemaDeclare), au sens d'un
          // seul journal (un run de version ne change pas ce choix, pour rester simple).
          if (parsed.type === "run_open" && typeof parsed.schema_ledger === "string" && parsed.schema_ledger.trim()) {
            schemaActif = parsed.schema_ledger.trim();
          }
        }
      }
    } else if (obj.type !== "run_open") {
      throw new Error("première entrée d'un ledger : type run_open exigé");
    }
    // L'entrée elle-même, si c'est un run_open qui déclare (ou redéclare) un schéma, DEVIENT le
    // schéma actif — pour SE juger elle-même (cas du tout premier run_open d'un ledger neuf).
    if (obj.type === "run_open" && typeof obj.schema_ledger === "string" && obj.schema_ledger.trim()) {
      schemaActif = obj.schema_ledger.trim();
    }
    // Un `ts` fourni par le payload écrasait l'horodatage machine SANS AUCUNE GARDE (spread
    // après ts) : append pouvait créer le recul que verify reproche. Il reste accepté quand il
    // ne remonte pas — un run peut avoir une raison de fixer l'heure de consignation — mais il
    // est alors ANNONCÉ, et refusé dès qu'il passe sous le maximum du fichier.
    const tsFourni = typeof obj.ts === "string" && obj.ts.trim() ? obj.ts.trim() : null;
    if (tsFourni && tsMax && tsFourni < tsMax) {
      throw new Error(
        `\`ts\` fourni par le payload (${tsFourni}) ANTÉRIEUR au maximum du ledger (${tsMax}) — ` +
        `refusé, aucune écriture. Le champ \`ts\` est l'heure de CONSIGNATION de l'entrée : ` +
        `elle ne remonte jamais, sinon l'append-only ne prouve plus aucun ordre. L'heure de ` +
        `l'ACTION rapportée (run de déploiement, mesure, décision passée) est une DONNÉE du ` +
        `payload : la consigner dans un champ dédié — ex. \`ts_action\` — et laisser \`ts\` à ` +
        `l'horodatage machine. Si l'entrée doit constater un recul DÉJÀ écrit, c'est une ` +
        `entrée \`${TYPE_RECTIFICATION}\`, jamais une réécriture.`);
    }
    // TF-1366 (c) : un type CONTRAINT (table des champs dus) auquel manque un champ dû est
    // refusé À L'ÉCRITURE, sous le schéma ACTIF — jusqu'ici seul `verify` le voyait, après coup.
    const champsDus = schemaActif && CHAMPS_DUS_PAR_VERSION[schemaActif];
    if (champsDus && champsDus[obj.type]) {
      const manquants = [];
      for (const [champ, pourquoi, valider] of champsDus[obj.type]) {
        const valeur = obj[champ];
        const estVide = valeur === undefined || valeur === null || String(valeur).trim() === "";
        if (estVide) { manquants.push(`\`${champ}\` ${champ in obj ? "vide" : "absent"} — ${pourquoi}`); continue; }
        if (valider) { const probleme = valider(valeur); if (probleme) manquants.push(`\`${champ}\` ${probleme} — ${pourquoi}`); }
      }
      if (manquants.length) {
        throw new Error(`entrée refusée (schéma ${schemaActif}, type \`${obj.type}\`) — champ(s) dû(s) :\n           ${manquants.join("\n           ")}`);
      }
    }
    const { ts: _tsPayload, ...corps } = obj;
    const tsEntree = tsFourni || new Date().toISOString();
    appendFileSync(file, JSON.stringify({ seq, ts: tsEntree, ...corps }) + "\n");
    if (tsFourni) console.log(`[ATTENTION] \`ts\` imposé par le payload (${tsFourni}) au lieu de l'horodatage machine`);
  } catch (e) {
    releaseLock(lockFile);
    fail(e.message);
  }
  releaseLock(lockFile);
  // TF-1366 (d) : l'écho NOMME le type et les champs écrits — un « [OK] » muet sur le contenu ne
  // permet pas de relire, depuis la seule sortie de la commande, ce qui vient d'être ajouté.
  console.log(`[OK] entrée ${seq} ajoutée (type ${obj.type} ; champs : ${clesUtiles.join(", ")})`);
} else if (cmd === "verify") {
  if (argsRestants.length) fail(`argument(s) non reconnu(s) : ${argsRestants.map((a) => `\`${a}\``).join(", ")} — ${USAGE_VERIFY}`);
  if (!file || !existsSync(file)) fail("ledger introuvable");
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  if (lines.length === 0) fail("ledger vide");
  // JSON invalide reste un arrêt immédiat : une ligne qu'on ne peut pas lire n'est pas une
  // entrée dont on pourrait accumuler les écarts — le fichier n'est plus un ledger.
  const entrees = lines.map((l, i) => {
    try { return JSON.parse(l); } catch { return fail(`ligne ${i + 1} : JSON invalide`); }
  });

  // --- PASSE 1 : recenser les RECTIFICATIONS DÉCLARÉES avant de juger les horodatages.
  // Deux passes sont nécessaires : une rectification est forcément POSTÉRIEURE à ce qu'elle
  // déclare (append-only), donc inconnue au moment où l'écart est rencontré.
  const rectifs = new Map(); // seq visé -> { parSeq, ts_consigne, ts_reel_estime, cause }
  const ecartsRectif = [];   // une déclaration fautive n'est pas une couverture : c'est un écart
  entrees.forEach((e, i) => {
    if (e.type !== TYPE_RECTIFICATION) return;
    const ou = `ligne ${i + 1} (${TYPE_RECTIFICATION}, seq ${e.seq})`;
    if (!Array.isArray(e.entrees) || e.entrees.length === 0) {
      ecartsRectif.push(`${ou} : \`entrees\` absent ou vide — une rectification qui ne déclare ` +
        `aucun seq ne rectifie rien (les seq visés se DISENT, ils ne se devinent pas)`);
      return;
    }
    for (const d of e.entrees) {
      const manquants = CHAMPS_RECTIFICATION.filter((c) =>
        d === null || typeof d !== "object" || d[c] === undefined || d[c] === null || String(d[c]).trim() === "");
      if (manquants.length) {
        ecartsRectif.push(`${ou} : déclaration incomplète — champ(s) ${
          manquants.map((c) => `\`${c}\``).join(", ")} manquant(s) dans ${JSON.stringify(d)}`);
        continue;
      }
      if (!Number.isInteger(d.seq) || d.seq < 1) {
        ecartsRectif.push(`${ou} : \`seq\` déclaré invalide (${JSON.stringify(d.seq)}) — entier ≥ 1 attendu`);
        continue;
      }
      if (d.seq >= e.seq) {
        ecartsRectif.push(`${ou} : déclare le seq ${d.seq}, qui ne lui est pas ANTÉRIEUR — une ` +
          `rectification ne couvre jamais un seq postérieur ni elle-même : on ne se dédouane pas d'avance`);
        continue;
      }
      if (!rectifs.has(d.seq)) rectifs.set(d.seq, { parSeq: e.seq, ...d });
    }
  });

  // --- PASSE 1 bis : NUMÉROS PORTÉS PAR PLUSIEURS ENTRÉES (TF-1367, 21/09/2026). Fait mesuré :
  // deux sessions simultanées ont écrit dans le même journal d'un produit ; les seq 262, 263,
  // 265 et 266 y désignaient chacun deux entrées, noyées dans 57 ruptures anciennes par le seul
  // message générique d'append-only rompu. Ce défaut est DISTINCT d'une rupture ordinaire (un
  // gap, un désordre) : il signe DEUX ÉCRIVAINS SANS VERROU COMMUN, et se nomme EN TÊTE des
  // écarts, avant toute autre rupture — `ledger.mjs` verrouille déjà l'écriture (`<ledger>.lock`),
  // ce constat vise les entrées écrites AILLEURS (un autre outil, un autre poste) sans lui.
  const lignesParSeq = new Map(); // seq -> [n° de ligne, ...]
  entrees.forEach((e, i) => {
    if (!Number.isInteger(e.seq)) return;
    lignesParSeq.set(e.seq, [...(lignesParSeq.get(e.seq) || []), i + 1]);
  });
  const ecartsDoublons = [];
  for (const [seqPorte, lignesDup] of lignesParSeq) {
    if (lignesDup.length > 1) {
      ecartsDoublons.push(`seq ${seqPorte} porté par ${lignesDup.length} entrées, lignes ${
        lignesDup.join(", ")} — deux écrivains sans verrou commun`);
    }
  }

  // --- PASSE 2 : intégrité. Les écarts s'ACCUMULENT — un vérificateur qui sort au premier
  // ne dit pas « un défaut », il dit « au moins un défaut », et le reste n'est pas jugé.
  let prevSeq = 0, tsMax = "", seqTsMax = 0;
  let schemaDeclare = null;
  const sansContenu = []; // TF-1366 (e) : entrées réduites à {seq, ts, type} — jamais un contenu
  const ecarts = [...ecartsDoublons, ...ecartsRectif];
  const rectifiesAppliques = new Set();
  entrees.forEach((e, i) => {
    if (e.seq !== prevSeq + 1) ecarts.push(`ligne ${i + 1} : seq ${e.seq} attendu ${prevSeq + 1} (append-only rompu)`);
    if (i === 0 && e.type !== "run_open") ecarts.push("ligne 1 : première entrée — type run_open exigé");
    // Monotonie jugée contre le MAXIMUM COURANT : après un recul, l'entrée fautive ne devient
    // pas la référence. Sinon un seul recul suffit à rendre invisible tout ce qui le suit.
    if (tsMax && typeof e.ts === "string" && e.ts < tsMax) {
      const quoi = `seq ${e.seq} : horodatage décroissant (${e.ts} après ${tsMax})`;
      const r = rectifs.get(e.seq);
      if (!r) {
        ecarts.push(`${quoi} — maximum atteint au seq ${seqTsMax}`);
      } else if (r.ts_consigne !== e.ts) {
        ecarts.push(`${quoi} — la rectification du seq ${r.parSeq} déclare \`ts_consigne\` ` +
          `${r.ts_consigne}, l'entrée porte ${e.ts} : une déclaration qui ne correspond pas à ` +
          `l'histoire ne couvre rien`);
      } else {
        // Rectifié n'est pas effacé : la ligne s'imprime à CHAQUE verify. L'écart cesse de
        // bloquer, il ne cesse pas d'exister.
        rectifiesAppliques.add(e.seq);
        console.log(`[RECTIFIÉ] ${quoi} — déclaré par la rectification du seq ${r.parSeq}, ` +
          `heure réelle estimée ${r.ts_reel_estime} : ${r.cause}`);
      }
    }
    if (e.type === "run_open" && e.schema_ledger) schemaDeclare = String(e.schema_ledger);
    // TF-1366 (e) : « sans contenu » = rien au-delà de seq/ts/type — le seul énoncé qu'`append`
    // refuse désormais à l'écriture (b) ; un journal antérieur à ce refus, ou alimenté par un
    // autre outil, peut encore en porter.
    if (Object.keys(e).every((k) => k === "seq" || k === "ts" || k === "type")) {
      sansContenu.push({ ligne: i + 1, seq: e.seq });
    }
    prevSeq = e.seq;
    if (typeof e.ts === "string" && e.ts > tsMax) { tsMax = e.ts; seqTsMax = e.seq; }
  });

  // Déclaration sans objet : dite à voix haute, jamais bloquante. Elle ne peut rien couvrir
  // d'avance (les seq visés sont antérieurs, donc figés) — mais taire une déclaration inopérante
  // laisserait croire qu'une couverture existe.
  for (const [seqVise, r] of rectifs) {
    if (!rectifiesAppliques.has(seqVise))
      console.log(`[SANS OBJET] la rectification du seq ${r.parSeq} déclare le seq ${seqVise}, ` +
        `qui ne porte aucun écart d'horodatage — déclaration conservée, sans effet`);
  }
  if (ecarts.length) {
    fail(`intégrité — ${ecarts.length} écart(s) non rectifié(s) :` +
      ecarts.map((x) => `\n         ${x}`).join(""));
  }

  // FORME DU PAYLOAD, PAR VERSION DE SCHÉMA (TF-1366/D-18 (a), 26/09/2026) — exigée seulement si
  // le ledger s'est déclaré jugeable, et selon LA VERSION qu'il a déclarée : un journal qui
  // déclare `1.0` reste jugé selon les règles `1.0`, POUR TOUJOURS — jamais celles d'une version
  // plus récente (une version ne durcit jamais un journal qui en a déclaré une antérieure).
  // L'antériorité se DIT (elle n'est ni devinée ni ignorée) : sans elle, ce contrôle mettrait en
  // échec tout l'existant — c'est le motif que R-33 bis donne pour ne pas armer d'office le
  // verdict websec (REGLES-PROJET.md).
  const champsDusVersion = schemaDeclare ? CHAMPS_DUS_PAR_VERSION[schemaDeclare] : null;
  const contraints = champsDusVersion
    ? entrees.map((e, i) => ({ ligne: i + 1, e })).filter(({ e }) => champsDusVersion[e.type])
    : [];
  // Combien d'entrées ONT un type contraint sous la version COURANTE — pour dire, quand la forme
  // n'est PAS jugée (aucun schéma déclaré, ou une version inconnue), qu'il existe une population
  // qui le DEVIENDRAIT sous un schéma déclaré. Purement informatif : ne juge jamais CE ledger.
  const contraintsSousCourant = champsDusVersion ? contraints
    : entrees.map((e, i) => ({ ligne: i + 1, e })).filter(({ e }) => CHAMPS_DUS_PAR_VERSION[SCHEMA_LEDGER][e.type]);
  // Item (e) : bloquant SOUS 1.1 SEULEMENT — sa table de champs dus est la première à rendre ce
  // défaut jugeable. Pour un journal antérieur au schéma OU en 1.0, il reste NON BLOQUANT (on ne
  // met jamais en échec un journal existant — section antériorité déclarée en tête de fichier) ;
  // même traitement, par prudence, pour une version déclarée mais inconnue de ce vérificateur.
  const sansContenuBloquant = schemaDeclare === "1.1" && sansContenu.length > 0;
  const rapportSansContenu = () => `${sansContenu.length} entrée(s) sans contenu (rien d'autre ` +
    `que seq/ts/type) — ${sansContenu.map((x) => `ligne ${x.ligne} (seq ${x.seq})`).join(", ")}`;

  if (!champsDusVersion) {
    if (contraintsSousCourant.length) {
      console.log(
        schemaDeclare
          ? `[NON VÉRIFIÉ] forme du payload — \`schema_ledger: ${schemaDeclare}\` déclaré, ` +
            `version inconnue de ce vérificateur (connues : ${Object.keys(CHAMPS_DUS_PAR_VERSION).join(", ")}) ` +
            `: ses ${contraintsSousCourant.length} entrée(s) de type contraint (sous ${SCHEMA_LEDGER}) ne sont pas jugées sur leur forme`
          : `[NON VÉRIFIÉ] forme du payload — \`run_open\` ne déclare pas \`schema_ledger\` : ce ` +
            `ledger PRÉCÈDE le schéma (courant ${SCHEMA_LEDGER}), ses ${contraintsSousCourant.length} entrée(s) ` +
            `de type contraint ne sont pas jugées sur leur forme. Pour les rendre jugeables : ` +
            `porter \`schema_ledger: "${SCHEMA_LEDGER}"\` au \`run_open\` du PROCHAIN run — jamais ` +
            `réécrire un ledger existant, l'histoire ne se réécrit pas`);
    }
    if (sansContenu.length) console.log(`[SANS CONTENU] ${rapportSansContenu()}`);
  } else {
    const ecartsForme = [];
    for (const { ligne, e } of contraints) {
      for (const [champ, pourquoi, valider] of champsDusVersion[e.type]) {
        const valeur = e[champ];
        const estVide = valeur === undefined || valeur === null || String(valeur).trim() === "";
        if (estVide) {
          ecartsForme.push(`ligne ${ligne} (${e.type}, seq ${e.seq}) : champ \`${champ}\` ${
            champ in e ? "vide" : "absent"} — ${pourquoi}`);
          continue;
        }
        if (valider) {
          const probleme = valider(valeur);
          if (probleme) ecartsForme.push(`ligne ${ligne} (${e.type}, seq ${e.seq}) : champ \`${champ}\` ${probleme} — ${pourquoi}`);
        }
      }
    }
    if (sansContenuBloquant) ecartsForme.push(`${rapportSansContenu()} — schéma 1.1 : une entrée ` +
      `sans contenu reste pour toujours dans un journal en ajout seul, et se lit ensuite comme une preuve (TF-1366)`);
    else if (sansContenu.length) console.log(`[SANS CONTENU] ${rapportSansContenu()}`);
    if (ecartsForme.length) {
      fail(`forme du payload (schéma ${schemaDeclare}) — ${ecartsForme.length} écart(s) :` +
        ecartsForme.map((x) => `\n         ${x}`).join(""));
    }
  }

  const forme = champsDusVersion
    ? `forme vérifiée sur ${contraints.length} entrée(s) contrainte(s) (schéma ${schemaDeclare})`
    : schemaDeclare
      ? `forme NON vérifiée (schéma ${schemaDeclare} inconnu de ce vérificateur)`
      : "forme NON vérifiée (ledger antérieur au schéma)";
  // « Intègre » ne veut pas dire « sans faute » : les écarts rectifiés sont comptés au verdict,
  // pas seulement imprimés au-dessus — un PASS muet sur eux serait un PASS qui ment.
  const rectifie = rectifiesAppliques.size
    ? ` · ${rectifiesAppliques.size} écart(s) d'horodatage DÉCLARÉ(S) et rectifié(s) (seq ${
      [...rectifiesAppliques].join(", ")})`
    : "";
  const sansContenuDit = !sansContenuBloquant && sansContenu.length
    ? ` · ${sansContenu.length} entrée(s) SANS CONTENU (non bloquant, schéma ${schemaDeclare || "absent"})`
    : "";
  console.log(`[PASS] ledger intègre — ${lines.length} entrée(s) · ${forme}${rectifie}${sansContenuDit}`);
} else {
  fail("commande inconnue (append | verify)");
}
