#!/usr/bin/env node
/**
 * ledger.mjs — ledger de run append-only (JSON Lines), persisté dans le dossier du projet.
 * Usage :
 *   node ledger.mjs append <ledger.jsonl> '<json>'          # payload en argument shell
 *   node ledger.mjs append <ledger.jsonl> --fichier <p.json> # payload lu depuis un fichier
 *   node ledger.mjs verify <ledger.jsonl>                   # vérifie l'intégrité append-only
 * Vérifications d'INTÉGRITÉ : JSON valide par ligne, seq strictement croissant depuis 1,
 * horodatages non décroissants, première entrée de type run_open. Exit 0 = PASS, 1 = FAIL.
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
    if (existsSync(file)) {
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      if (lines.length > 0) seq = JSON.parse(lines[lines.length - 1]).seq + 1;
    } else if (obj.type !== "run_open") {
      throw new Error("première entrée d'un ledger : type run_open exigé");
    }
    appendFileSync(file, JSON.stringify({ seq, ts: new Date().toISOString(), ...obj }) + "\n");
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
  let prevSeq = 0, prevTs = "";
  let schemaDeclare = null;
  const contraints = [];
  lines.forEach((l, i) => {
    let e;
    try { e = JSON.parse(l); } catch { fail(`ligne ${i + 1} : JSON invalide`); }
    if (e.seq !== prevSeq + 1) fail(`ligne ${i + 1} : seq ${e.seq} attendu ${prevSeq + 1} (append-only rompu)`);
    if (prevTs && e.ts < prevTs) fail(`ligne ${i + 1} : horodatage décroissant`);
    if (i === 0 && e.type !== "run_open") fail("première entrée : type run_open exigé");
    if (e.type === "run_open" && e.schema_ledger) schemaDeclare = String(e.schema_ledger);
    if (CHAMPS_DUS[e.type]) contraints.push({ ligne: i + 1, e });
    prevSeq = e.seq; prevTs = e.ts;
  });

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
    const ecarts = [];
    for (const { ligne, e } of contraints) {
      for (const [champ, pourquoi] of CHAMPS_DUS[e.type]) {
        const valeur = e[champ];
        if (valeur === undefined || valeur === null || String(valeur).trim() === "") {
          ecarts.push(`ligne ${ligne} (${e.type}, seq ${e.seq}) : champ \`${champ}\` ${
            champ in e ? "vide" : "absent"} — ${pourquoi}`);
        }
      }
    }
    if (ecarts.length) {
      fail(`forme du payload (schéma ${schemaDeclare}) — ${ecarts.length} écart(s) :` +
        ecarts.map((x) => `\n         ${x}`).join(""));
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
  console.log(`[PASS] ledger intègre — ${lines.length} entrée(s) · ${forme}`);
} else {
  fail("commande inconnue (append | verify)");
}
