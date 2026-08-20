#!/usr/bin/env node
/**
 * ledger.mjs — ledger de run append-only (JSON Lines), persisté dans le dossier du projet.
 * Usage :
 *   node ledger.mjs append <ledger.jsonl> '<json>'          # payload en argument shell
 *   node ledger.mjs append <ledger.jsonl> --fichier <p.json> # payload lu depuis un fichier
 *   node ledger.mjs verify <ledger.jsonl>                   # vérifie l'intégrité append-only
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
 * 19/08 échoueraient tous, et un contrôle qui met en échec tout l'existant se fait désactiver
 * (R-33 bis) : on ne juge que ce qui s'est déclaré jugeable.
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
const fichierIdx = rest.indexOf("--fichier");
let payload;
if (fichierIdx >= 0) {
  const payloadPath = rest[fichierIdx + 1];
  if (!payloadPath) fail_usage();
  try { payload = readFileSync(payloadPath, "utf8").replace(/^﻿/, ""); }
  catch (e) { console.error(`[LEDGER FAIL] --fichier illisible (${payloadPath}) : ${e.message}`); process.exit(1); }
  // BOM UTF-8 : Out-File/Set-Content PowerShell 5.1 l'écrivent par défaut — sans ce retrait,
  // JSON.parse échoue sur « Unexpected token » (RA-1, cas réel visé par --fichier).
} else {
  payload = rest[2];
}
//: Version du schéma de payload. Déclarée par `run_open` (`schema_ledger`), elle dit sous
//: quelle forme le ledger a été écrit — comme l'empreinte de règles d'un journal d'oracles.
const SCHEMA_LEDGER = "1.0";

//: Les champs dus, par type. Un seul type est contraint aujourd'hui : celui dont l'absence de
//: forme rendait un fait incalculable. Étendre cette table est une décision, pas un réflexe —
//: un ledger sur-contraint cesse d'accepter ce qu'un run a besoin de consigner.
const CHAMPS_DUS = {
  oracles_verdict: [
    ["oracle", "le NOM de l oracle qui a rendu le verdict — sans lui, aucun juge ne peut savoir ce qui a tourne"],
    ["verdict", "le VERDICT rendu (PASS | FAIL | SKIP | NA | PARTIEL) — un releve sans verdict n est pas un verdict"],
  ],
};

//: Type d'entrée qui déclare des écarts d'horodatage antérieurs, et les champs dus de chaque
//: déclaration. Une déclaration incomplète ne couvre rien : ces quatre champs sont ce qui
//: rend la rectification vérifiable (le seq visé, le ts fautif tel qu'il est écrit, l'heure
//: réelle estimée, la cause). Sans eux, « rectification » serait un mot qui éteint un contrôle.
const TYPE_RECTIFICATION = "rectification_horodatage";
const CHAMPS_RECTIFICATION = ["seq", "ts_consigne", "ts_reel_estime", "cause"];

function fail(msg) { console.error(`[LEDGER FAIL] ${msg}`); process.exit(1); }
function fail_usage() { fail("usage : append <ledger.jsonl> ('<json>' | --fichier <payload.json>)"); }

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
  if (!file || !payload) fail_usage();
  let obj;
  try { obj = JSON.parse(payload); } catch { fail("payload JSON invalide"); }
  const lockFile = `${file}.lock`;
  acquireLock(lockFile);
  // Note : process.exit() (dans fail()) ne déroule pas les blocs finally — toute sortie en
  // erreur pendant la section verrouillée doit donc libérer le verrou explicitement avant
  // d'appeler fail(), plutôt que de compter sur un try/finally autour de process.exit().
  let seq = 1;
  try {
    let tsMax = "";
    if (existsSync(file)) {
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      if (lines.length > 0) {
        seq = JSON.parse(lines[lines.length - 1]).seq + 1;
        // Maximum courant, pas dernier ts : sur un fichier qui porte déjà un recul, se
        // comparer au dernier autoriserait à consigner sous une heure déjà atteinte.
        for (const l of lines) {
          const t = JSON.parse(l).ts;
          if (typeof t === "string" && t > tsMax) tsMax = t;
        }
      }
    } else if (obj.type !== "run_open") {
      throw new Error("première entrée d'un ledger : type run_open exigé");
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
    const { ts: _tsPayload, ...corps } = obj;
    const tsEntree = tsFourni || new Date().toISOString();
    appendFileSync(file, JSON.stringify({ seq, ts: tsEntree, ...corps }) + "\n");
    if (tsFourni) console.log(`[ATTENTION] \`ts\` imposé par le payload (${tsFourni}) au lieu de l'horodatage machine`);
  } catch (e) {
    releaseLock(lockFile);
    fail(e.message);
  }
  releaseLock(lockFile);
  console.log(`[OK] entrée ${seq} ajoutée`);
} else if (cmd === "verify") {
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

  // --- PASSE 2 : intégrité. Les écarts s'ACCUMULENT — un vérificateur qui sort au premier
  // ne dit pas « un défaut », il dit « au moins un défaut », et le reste n'est pas jugé.
  let prevSeq = 0, tsMax = "", seqTsMax = 0;
  let schemaDeclare = null;
  const contraints = [];
  const ecarts = [...ecartsRectif];
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
    if (CHAMPS_DUS[e.type]) contraints.push({ ligne: i + 1, e });
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

  // FORME DU PAYLOAD — exigée seulement si le ledger s'est déclaré jugeable. L'antériorité se
  // DIT (elle n'est ni devinée ni ignorée) : sans elle, ce contrôle mettrait en échec tout
  // l'existant, et un contrôle qui met tout en échec se fait désactiver.
  if (!schemaDeclare) {
    if (contraints.length) {
      console.log(
        `[NON VÉRIFIÉ] forme du payload — \`run_open\` ne déclare pas \`schema_ledger\` : ce ` +
        `ledger PRÉCÈDE le schéma (courant ${SCHEMA_LEDGER}), ses ${contraints.length} entrée(s) ` +
        `de type contraint ne sont pas jugées sur leur forme. Pour les rendre jugeables : ` +
        `porter \`schema_ledger: "${SCHEMA_LEDGER}"\` au \`run_open\` du PROCHAIN run — jamais ` +
        `réécrire un ledger existant, l'histoire ne se réécrit pas`);
    }
  } else {
    const ecartsForme = [];
    for (const { ligne, e } of contraints) {
      for (const [champ, pourquoi] of CHAMPS_DUS[e.type]) {
        const valeur = e[champ];
        if (valeur === undefined || valeur === null || String(valeur).trim() === "") {
          ecartsForme.push(`ligne ${ligne} (${e.type}, seq ${e.seq}) : champ \`${champ}\` ${
            champ in e ? "vide" : "absent"} — ${pourquoi}`);
        }
      }
    }
    if (ecartsForme.length) {
      fail(`forme du payload (schéma ${schemaDeclare}) — ${ecartsForme.length} écart(s) :` +
        ecartsForme.map((x) => `\n         ${x}`).join(""));
    }
    if (schemaDeclare !== SCHEMA_LEDGER) {
      console.log(
        `[NON VÉRIFIÉ] \`schema_ledger: ${schemaDeclare}\` déclaré, ${SCHEMA_LEDGER} courant — ` +
        `les champs dus de cette version ont été appliqués ; une version antérieure peut en ` +
        `avoir exigé d'autres, et ce vérificateur ne les connaît pas`);
    }
  }

  const forme = schemaDeclare
    ? `forme vérifiée sur ${contraints.length} entrée(s) contrainte(s) (schéma ${schemaDeclare})`
    : "forme NON vérifiée (ledger antérieur au schéma)";
  // « Intègre » ne veut pas dire « sans faute » : les écarts rectifiés sont comptés au verdict,
  // pas seulement imprimés au-dessus — un PASS muet sur eux serait un PASS qui ment.
  const rectifie = rectifiesAppliques.size
    ? ` · ${rectifiesAppliques.size} écart(s) d'horodatage DÉCLARÉ(S) et rectifié(s) (seq ${
      [...rectifiesAppliques].join(", ")})`
    : "";
  console.log(`[PASS] ledger intègre — ${lines.length} entrée(s) · ${forme}${rectifie}`);
} else {
  fail("commande inconnue (append | verify)");
}
