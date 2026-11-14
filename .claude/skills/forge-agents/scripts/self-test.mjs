#!/usr/bin/env node
/**
 * self-test.mjs — rejoue les fixtures du compilateur (1 verte, 3 rouges), le champ `modele`
 * (D-1 (a) du pilot, 25/09/2026 : 3 vertes, 1 rouge), le cycle ledger et le relevé de la
 * version servie.
 * Exit 0 si tous les contrôles passent, 1 sinon. À rejouer après toute modification du skill.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdtempSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");
const compile = join(here, "compile-agent-def.mjs");
const ledger = join(here, "ledger.mjs");
const oracledefs = join(here, "oracle-defs.mjs");
const otlpProject = join(here, "otlp-project.mjs");
const oracleAgentEvals = join(here, "oracle-agent-evals.mjs");
let pass = 0, failCount = 0;

function check(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.error(`  [FAIL] ${name} — ${e.message}`); failCount++; }
}
async function checkAsync(name, fn) {
  try { await fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.error(`  [FAIL] ${name} — ${e.message}`); failCount++; }
}
function spawnAppend(file, obj) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ledger, "append", file, JSON.stringify(obj)], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
  });
}
function run(script, args) { return execFileSync("node", [script, ...args], { encoding: "utf8" }); }
function mustRefuse(script, args, motif) {
  try { execFileSync("node", [script, ...args], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) {
    const err = String(e.stderr || "");
    if (!err.includes("[REFUS]")) throw new Error(`refus attendu, autre erreur : ${err.slice(0, 120)}`);
    if (motif && !err.includes(motif)) throw new Error(`motif « ${motif} » absent du refus`);
    return;
  }
  throw new Error("aurait dû refuser, a accepté");
}

const out = mkdtempSync(join(tmpdir(), "fa-selftest-"));

check("verte : agent.def valide compile avec tools restreints et frontières", () => {
  run(compile, [join(fixtures, "verte-review.yaml"), "--out", out]);
  const md = readFileSync(join(out, "propale-review.md"), "utf8");
  for (const attendu of ["tools: Read", "arbitrage à charge", "seules lectures autorisées", "en-tête de provenance", "digit-ai-propale-review"])
    if (!md.includes(attendu)) throw new Error(`sortie compilée : « ${attendu} » absent`);
});

check("rouge 1 : champ obligatoire manquant (arbitre) → refus", () =>
  mustRefuse(compile, [join(fixtures, "rouge-sans-arbitre.yaml"), "--out", out], "arbitre"));

check("rouge 2 : champ inconnu (budget) → refus fail-closed", () =>
  mustRefuse(compile, [join(fixtures, "rouge-champ-inconnu.yaml"), "--out", out], "champ inconnu"));

check("rouge 3 : lot avec un def invalide → refus sans écriture partielle", () => {
  const out2 = mkdtempSync(join(tmpdir(), "fa-lot-"));
  mustRefuse(compile, [join(fixtures, "verte-review.yaml"), join(fixtures, "rouge-sans-arbitre.yaml"), "--out", out2]);
  let ecrit = false;
  try { readFileSync(join(out2, "propale-review.md")); ecrit = true; } catch {}
  rmSync(out2, { recursive: true, force: true });
  if (ecrit) throw new Error("écriture partielle détectée : le def valide du lot a été écrit malgré le refus");
});

check("ledger : run_open + append + verify PASS, corruption → FAIL", () => {
  const lf = join(out, "ledger.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "self-test" })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "etape_open", detail: "fixture" })]);
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("verify aurait dû passer");
  appendFileSync(lf, JSON.stringify({ seq: 9, ts: "2020-01-01T00:00:00Z", type: "triche" }) + "\n");
  try { execFileSync("node", [ledger, "verify", lf], { stdio: "pipe" }); }
  catch { return; }
  throw new Error("ledger corrompu accepté");
});

// TF-0385 (19/08) — FORME DU PAYLOAD de `oracles_verdict`. Le fait mesuré : 8 entrées de ce
// type dans un même ledger réel, SIX formes de champs différentes ; la liste des oracles qui
// ont tourné sur un run n'était donc pas calculable, et un juge de l'enclenchement n'avait pas
// d'entrée. Quatre sens joués, et le troisième est celui qui empêche le contrôle d'être
// désactivé au premier usage.
check("ledger TF-0385 : `oracles_verdict` conforme sous schéma déclaré → PASS", () => {
  const lf = join(out, "ledger-schema-vert.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.0" })]);
  run(ledger, ["append", lf, JSON.stringify({
    type: "oracles_verdict", oracle: "oracle-conformite-projet", verdict: "PASS",
    cible: "racine du projet", journal: "forge/oracles/conformite.json",
  })]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("une entrée conforme doit passer");
  if (!v.includes("forme vérifiée sur 1 entrée")) throw new Error("le verdict doit DIRE ce qu il a vérifié : " + v);
});

// TF-1204 (13/09, retour produit) — UNE CLOTURE D ETAPE DIT CE QU ELLE FERME. Un appel lance
// pour lire l usage du journal a ecrit une entree `etape_close` sans etape ni resume ; le contrat
// nommait les champs, rien ne les exigeait, et le journal en ajout seul garde l entree vide.
check("ledger TF-1204 : `etape_close` sans `etape` ni `resume` → FAIL qui NOMME les deux champs", () => {
  const lf = join(out, "ledger-cloture-rouge.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.0" })]);
  // TF-1366 (b)/(c), 21/09/2026 : `append` refuse DÉSORMAIS cette entrée à l'écriture, avant
  // même `verify` — une `etape_close` sans rien d'autre que son type est aussi une entrée « sans
  // contenu » (b), et un type contraint auquel manque un champ dû sous schéma déclaré (c).
  let refusApp = null;
  try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "etape_close" })], { stdio: "pipe" }); }
  catch (e) { refusApp = String(e.stderr || ""); }
  if (refusApp === null) throw new Error("append aurait dû refuser une `etape_close` sans contenu (TF-1366 b)");
  if (!refusApp.includes("[LEDGER FAIL]")) throw new Error("refus attendu avec [LEDGER FAIL] : " + refusApp);

  // Le fait mesuré le 13/09 reste possible via un AUTRE écrivain que cet `append` durci (un
  // autre outil, un ledger antérieur au correctif) : `verify` doit continuer à le voir, après
  // coup, sur un ledger qu'il n'a pas lui-même gardé — c'est le fait mesuré original, inchangé.
  // TF-1401 : horodatée APRÈS la naissance de la règle (22/09/2026) — avant, elle est antérieure.
  const lfTiers = join(out, "ledger-cloture-rouge-tiers.jsonl");
  ecrireBrut(lfTiers, [
    { seq: 1, ts: "2026-09-23T10:00:00Z", type: "run_open", schema_ledger: "1.0" },
    { seq: 2, ts: "2026-09-23T10:00:01Z", type: "etape_close" },
  ]);
  let sortie = null;
  try { execFileSync("node", [ledger, "verify", lfTiers], { stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || "") + String(e.stdout || ""); }
  if (sortie === null) throw new Error("une cloture d etape vide a ete acceptee — c est le fait mesure du 13/09");
  if (!sortie.includes("`etape`")) throw new Error("l echec ne NOMME pas le champ etape : " + sortie);
  if (!sortie.includes("`resume`")) throw new Error("l echec ne NOMME pas le champ resume : " + sortie);
});

// TF-1401 (24/09, corrigé le 12/10) — la règle du 22/09 ne juge pas les clôtures écrites avant
// elle : 2 ledgers réels du parc, en schéma 1.0, rendaient FAIL pour cette seule raison.
check("ledger TF-1401 : `etape_close` sans `resume` ANTÉRIEURE au 22/09 → PASS, comptée [ANTÉRIEUR] ; la même le 22/09 → FAIL", () => {
  const lfAvant = join(out, "ledger-cloture-anterieure.jsonl");
  ecrireBrut(lfAvant, [
    { seq: 1, ts: "2026-09-05T16:28:49Z", type: "run_open", schema_ledger: "1.0" },
    { seq: 2, ts: "2026-09-21T23:59:59Z", type: "etape_close", etape: "conception" },
  ]);
  const v = run(ledger, ["verify", lfAvant]);
  if (!v.includes("[PASS]")) throw new Error("une cloture antérieure à sa règle doit passer : " + v);
  if (!v.includes("[ANTÉRIEUR]") || !v.includes("seq 2")) throw new Error("l antériorité doit se DIRE, avec le seq : " + v);
  const lfApres = join(out, "ledger-cloture-posterieure.jsonl");
  ecrireBrut(lfApres, [
    { seq: 1, ts: "2026-09-05T16:28:49Z", type: "run_open", schema_ledger: "1.0" },
    { seq: 2, ts: "2026-09-22T00:00:00Z", type: "etape_close", etape: "conception" },
  ]);
  let sortie = null;
  try { execFileSync("node", [ledger, "verify", lfApres], { stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || "") + String(e.stdout || ""); }
  if (sortie === null) throw new Error("une cloture sans resume datée du jour de la règle a été acceptée");
  if (!sortie.includes("`resume`")) throw new Error("l echec ne NOMME pas le champ resume : " + sortie);
});

check("ledger TF-1204 : une `etape_close` complete passe — la regle ne deborde pas", () => {
  const lf = join(out, "ledger-cloture-vert.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.0" })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "etape_close", etape: "tests", resume: "audit forge_tests exit 0, 3 seuils tenus" })]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("une cloture complete doit passer : " + v);
});

check("ledger TF-0385 : `oracles_verdict` sans `oracle` → FAIL qui NOMME le champ", () => {
  const lf = join(out, "ledger-schema-rouge.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.0" })]);
  // La forme réellement rencontrée : un `oracles` imbriqué, aucun verdict de premier niveau.
  // TF-1366 (c), 21/09/2026 : `append` refuse DÉSORMAIS cette entrée à l'écriture, sous le
  // schéma déclaré par le `run_open` qui précède — avant même `verify`.
  let refusApp = null;
  try {
    execFileSync("node", [ledger, "append", lf, JSON.stringify({
      type: "oracles_verdict", etape: "tests", oracles: { forge_tests: "PARTIEL" },
    })], { stdio: "pipe" });
  } catch (e) { refusApp = String(e.stderr || ""); }
  if (refusApp === null) throw new Error("append aurait dû refuser un oracles_verdict sans oracle/verdict sous schéma déclaré (TF-1366 c)");
  if (!refusApp.includes("`oracle`") || !refusApp.includes("`verdict`")) throw new Error("le refus d'append ne nomme pas les deux champs dus : " + refusApp);

  // La forme réellement rencontrée le 19/08 reste possible via un AUTRE écrivain que cet
  // `append` durci : `verify` doit continuer à la voir, après coup, sur un ledger qu'il n'a pas
  // lui-même gardé — c'est le fait mesuré original (TF-0385), inchangé.
  const lfTiers = join(out, "ledger-schema-rouge-tiers.jsonl");
  ecrireBrut(lfTiers, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", schema_ledger: "1.0" },
    { seq: 2, ts: "2026-01-01T10:00:01Z", type: "oracles_verdict", etape: "tests", oracles: { forge_tests: "PARTIEL" } },
  ]);
  let sortie = null;
  try { execFileSync("node", [ledger, "verify", lfTiers], { stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || "") + String(e.stdout || ""); }
  if (sortie === null) throw new Error("une entrée sans `oracle` ni `verdict` a été acceptée");
  if (!sortie.includes("`oracle`")) throw new Error("l échec ne NOMME pas le champ manquant : " + sortie);
  if (!sortie.includes("`verdict`")) throw new Error("le second champ manquant n est pas nommé : " + sortie);
  if (!sortie.includes("aucun juge ne peut savoir ce qui a tourne")) {
    throw new Error("l échec ne dit pas POURQUOI le champ est dû : " + sortie);
  }
});

// LE SENS QUI COMPTE LE PLUS. Sans lui, ce contrôle mettrait en échec les trois ledgers du parc
// dès son premier passage — et un contrôle qui met tout l'existant en échec se fait désactiver
// (c'est le motif que R-33 bis donne pour ne pas armer d'office le verdict websec : « armer un
// gate que personne n'a exercé le ferait désarmer au premier faux positif »). L'antériorité se
// DÉCLARE, sur le modèle exact de R-32 bis du pilot.
check("ledger TF-0385 : un ledger SANS `schema_ledger` est DÉCLARÉ non vérifié, jamais mis en échec", () => {
  const lf = join(out, "ledger-anterieur.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "avant le schema" })]);
  run(ledger, ["append", lf, JSON.stringify({
    type: "oracles_verdict", etape: "tests", oracles: { forge_tests: "PARTIEL" },
  })]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("un ledger antérieur au schéma ne doit PAS échouer");
  if (!v.includes("[NON VÉRIFIÉ]")) throw new Error("l antériorité doit être DITE, pas tue : " + v);
  if (!v.includes("l'histoire ne se réécrit pas")) {
    throw new Error("le remède doit viser le PROCHAIN run, jamais la réécriture : " + v);
  }
});

check("ledger TF-0385 : les autres types ne sont PAS contraints", () => {
  // Un ledger sur-contraint cesse d accepter ce qu un run a besoin de consigner. Seul le type
  // dont l absence de forme rendait un fait incalculable est jugé.
  const lf = join(out, "ledger-autres-types.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.0" })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "etape_open", n_importe_quoi: true })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "etape_open", detail: "libre" })]);
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) {
    throw new Error("un type non contraint doit rester libre");
  }
});

check("ledger --fichier : payload lu depuis un fichier (avec BOM UTF-8 PowerShell) → mêmes validations", () => {
  const lf = join(out, "ledger-fichier.jsonl");
  const p1 = join(out, "payload-1.json");
  const p2 = join(out, "payload-2-bom.json");
  writeFileSync(p1, JSON.stringify({ type: "run_open", substrat: "self-test-fichier" }));
  run(ledger, ["append", lf, "--fichier", p1]);
  // BOM UTF-8 : Out-File/Set-Content PowerShell 5.1 l'écrivent par défaut sur un fichier —
  // --fichier doit l'absorber sans « Unexpected token » (raison d'être de l'option, RA-1).
  writeFileSync(p2, "﻿" + JSON.stringify({ type: "etape_open", detail: "fixture --fichier" }));
  run(ledger, ["append", lf, "--fichier", p2]);
  const verif = run(ledger, ["verify", lf]);
  if (!verif.includes("[PASS]")) throw new Error("verify aurait dû passer sur un ledger alimenté par --fichier");
  const lignes = readFileSync(lf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  if (lignes.length !== 2) throw new Error(`2 entrées attendues, ${lignes.length} trouvées`);
  if (lignes[1].detail !== "fixture --fichier") throw new Error("payload BOM mal décodé (JSON.parse aurait dû échouer sans le retrait du BOM)");
});

check("ledger --fichier : chemin manquant après --fichier → refus explicite", () => {
  const lf = join(out, "ledger-fichier-2.jsonl");
  try { execFileSync("node", [ledger, "append", lf, "--fichier"], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) {
    if (!String(e.stderr || "").includes("[LEDGER FAIL]")) throw new Error("refus attendu avec [LEDGER FAIL]");
    return;
  }
  throw new Error("aurait dû refuser --fichier sans chemin");
});

await checkAsync("ledger : verrou — appends concurrents (2 process × N) sans collision de seq", async () => {
  const lf2 = join(out, "ledger-concurrence.jsonl");
  run(ledger, ["append", lf2, JSON.stringify({ type: "run_open", substrat: "self-test-concurrence" })]);
  const N = 15;
  const appels = [];
  for (let i = 0; i < N; i++) {
    appels.push(spawnAppend(lf2, { type: "etape_open", proc: "a", i }));
    appels.push(spawnAppend(lf2, { type: "etape_open", proc: "b", i }));
  }
  await Promise.all(appels);
  const verifOut = run(ledger, ["verify", lf2]);
  if (!verifOut.includes("[PASS]")) throw new Error("verify aurait dû passer après appends concurrents");
  const lignes = readFileSync(lf2, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  if (lignes.length !== 2 * N + 1) throw new Error(`nb lignes ${lignes.length} attendu ${2 * N + 1}`);
  const seqs = lignes.map((l) => l.seq);
  if (new Set(seqs).size !== seqs.length) throw new Error("collision de seq détectée entre process concurrents");
});

// --- TF-0410 (20/08) : HORODATAGES — accumulation, garde à l'append, rectification déclarée.
// Le fait mesuré : un ledger réel de 138 entrées portait DEUX reculs d'horodatage et le second
// est resté invisible trois jours, parce que `verify` sortait au premier écart. Le sens qui
// compte le plus ici est le test ANTI-FAIL-FAST : il ne suffit pas que le verdict soit rouge,
// il faut que les DEUX seq soient nommés — un contrôle qui cesse de compter ne dit pas
// « un défaut », il dit « au moins un défaut ».
//
// Les fixtures rouges sont écrites À LA MAIN et non par `append` : `append` refuse désormais un
// ts qui remonte, donc il ne peut plus fabriquer le défaut. Cette impossibilité EST le correctif.
function ecrireBrut(chemin, entrees) {
  writeFileSync(chemin, entrees.map((e) => JSON.stringify(e)).join("\n") + "\n");
}
// Deux reculs, et un seul serait vu par un vérificateur fail-fast : seq 3 (09:00 sous 12:00)
// et seq 5 (11:00 sous 13:00).
const DEUX_RECULS = [
  { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "self-test-ts" },
  { seq: 2, ts: "2026-01-01T12:00:00Z", type: "note", detail: "en ordre" },
  { seq: 3, ts: "2026-01-01T09:00:00Z", type: "mise_en_production", detail: "horodatée à l heure de l action" },
  { seq: 4, ts: "2026-01-01T13:00:00Z", type: "note", detail: "en ordre" },
  { seq: 5, ts: "2026-01-01T11:00:00Z", type: "mise_en_production", detail: "second recul, celui qui restait masqué" },
];
const DECL_3 = { seq: 3, ts_consigne: "2026-01-01T09:00:00Z", ts_reel_estime: "2026-01-01T12:30:00Z", cause: "heure de l action et non de consignation" };
const DECL_5 = { seq: 5, ts_consigne: "2026-01-01T11:00:00Z", ts_reel_estime: "2026-01-01T13:30:00Z", cause: "heure de l action et non de consignation" };
function verifyRouge(lf) {
  try { execFileSync("node", [ledger, "verify", lf], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { return { sortie: String(e.stdout || "") + String(e.stderr || ""), code: e.status }; }
  throw new Error("verify aurait dû sortir en échec (exit 1)");
}

check("ledger TF-0410 : ledger sans recul → PASS exit 0 (le contrôle plus strict ne casse pas le vert)", () => {
  const lf = join(out, "ts-vert.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "self-test-ts" },
    { seq: 2, ts: "2026-01-01T10:00:00Z", type: "note", detail: "ts égal : non décroissant, donc accepté" },
    { seq: 3, ts: "2026-01-01T11:00:00Z", type: "note", detail: "croissant" },
  ]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("un ledger monotone doit passer");
  if (v.includes("[RECTIFIÉ]")) throw new Error("aucune rectification n est déclarée : rien ne doit s imprimer");
});

check("ledger TF-0410 : DEUX reculs → FAIL qui nomme les DEUX seq et les deux horodatages (anti-fail-fast)", () => {
  const lf = join(out, "ts-deux-reculs.jsonl");
  ecrireBrut(lf, DEUX_RECULS);
  const { sortie } = verifyRouge(lf);
  for (const attendu of [
    "seq 3 : horodatage décroissant (2026-01-01T09:00:00Z après 2026-01-01T12:00:00Z)",
    "seq 5 : horodatage décroissant (2026-01-01T11:00:00Z après 2026-01-01T13:00:00Z)",
  ]) if (!sortie.includes(attendu)) throw new Error(`écart non nommé : « ${attendu} » absent de la sortie`);
  if (!sortie.includes("2 écart(s)")) throw new Error("le compte des écarts doit être dit (2), pas seulement le premier écart");
});

check("ledger TF-0410 : rectification déclarant les DEUX seq → exit 0 avec DEUX lignes [RECTIFIÉ]", () => {
  const lf = join(out, "ts-rectifie-deux.jsonl");
  ecrireBrut(lf, [...DEUX_RECULS, {
    seq: 6, ts: "2026-01-02T09:00:00Z", type: "rectification_horodatage", entrees: [DECL_3, DECL_5],
  }]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("les deux écarts sont déclarés : le ledger doit passer");
  const rectifies = v.split("\n").filter((l) => l.includes("[RECTIFIÉ]"));
  if (rectifies.length !== 2) throw new Error(`2 lignes [RECTIFIÉ] attendues, ${rectifies.length} trouvée(s) — rectifié n est pas effacé`);
  for (const s of ["seq 3", "seq 5", "déclaré par la rectification du seq 6"])
    if (!v.includes(s)) throw new Error(`« ${s} » absent des lignes [RECTIFIÉ]`);
  if (!v.includes("rectifié(s) (seq 3, 5)")) throw new Error("le verdict PASS doit compter les écarts rectifiés, jamais les taire");
});

check("ledger TF-0410 : rectification partielle (un seul des deux) → exit 1, un FAIL ET un [RECTIFIÉ]", () => {
  const lf = join(out, "ts-rectifie-partiel.jsonl");
  ecrireBrut(lf, [...DEUX_RECULS, {
    seq: 6, ts: "2026-01-02T09:00:00Z", type: "rectification_horodatage", entrees: [DECL_3],
  }]);
  const { sortie } = verifyRouge(lf);
  if (!sortie.includes("[RECTIFIÉ] seq 3")) throw new Error("le seq déclaré doit s imprimer [RECTIFIÉ] même quand le verdict est rouge");
  if (!sortie.includes("1 écart(s) non rectifié(s)")) throw new Error("l écart NON déclaré doit rester un FAIL compté");
  if (!sortie.includes("seq 5 : horodatage décroissant")) throw new Error("l écart non déclaré doit être nommé");
  if (sortie.includes("[RECTIFIÉ] seq 5")) throw new Error("un seq NON déclaré ne doit jamais passer pour rectifié");
});

check("ledger TF-0410 : la rectification ne couvre pas un seq POSTÉRIEUR — on ne se dédouane pas d'avance", () => {
  const lf = join(out, "ts-rectif-future.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "self-test-ts" },
    { seq: 2, ts: "2026-01-01T12:00:00Z", type: "rectification_horodatage", entrees: [
      { seq: 3, ts_consigne: "2026-01-01T09:00:00Z", ts_reel_estime: "2026-01-01T12:30:00Z", cause: "tentative de couverture anticipée" }] },
    { seq: 3, ts: "2026-01-01T09:00:00Z", type: "note", detail: "recul couvert d avance ?" },
  ]);
  const { sortie } = verifyRouge(lf);
  if (!sortie.includes("ne lui est pas ANTÉRIEUR")) throw new Error("la déclaration d un seq postérieur doit être refusée explicitement");
  if (!sortie.includes("seq 3 : horodatage décroissant")) throw new Error("l écart doit rester un FAIL : la couverture anticipée ne vaut rien");
  if (sortie.includes("[RECTIFIÉ]")) throw new Error("rien ne doit être rectifié par une déclaration anticipée");
});

check("ledger TF-0410 : `ts_consigne` qui ne correspond pas à l'histoire ne couvre rien", () => {
  const lf = join(out, "ts-rectif-menteuse.jsonl");
  ecrireBrut(lf, [...DEUX_RECULS, {
    seq: 6, ts: "2026-01-02T09:00:00Z", type: "rectification_horodatage",
    entrees: [{ ...DECL_3, ts_consigne: "2026-01-01T08:00:00Z" }, DECL_5],
  }]);
  const { sortie } = verifyRouge(lf);
  if (!sortie.includes("ne correspond pas à")) throw new Error("un ts_consigne qui ne colle pas au ts réel doit être dit");
  if (sortie.includes("[RECTIFIÉ] seq 3")) throw new Error("seq 3 ne doit PAS être rectifié : la déclaration ne correspond pas");
  if (!sortie.includes("[RECTIFIÉ] seq 5")) throw new Error("seq 5, correctement déclaré, doit rester rectifié");
});

check("ledger TF-0410 : déclaration incomplète (cause absente) → écart, jamais une couverture", () => {
  const lf = join(out, "ts-rectif-incomplete.jsonl");
  const { cause, ...sansCause } = DECL_3;
  ecrireBrut(lf, [...DEUX_RECULS, {
    seq: 6, ts: "2026-01-02T09:00:00Z", type: "rectification_horodatage", entrees: [sansCause, DECL_5],
  }]);
  const { sortie } = verifyRouge(lf);
  if (!sortie.includes("déclaration incomplète") || !sortie.includes("`cause`")) throw new Error("le champ dû manquant doit être nommé");
  if (sortie.includes("[RECTIFIÉ] seq 3")) throw new Error("une déclaration incomplète ne couvre rien");
});

// --- TF-2494 (14/11/2026) : LE SAUT DE SEQ EN AVANT A SES DEUX VOIES, comme R-42 du pilot (a86f397d). Jusqu'ici ce
// test-ci, écrit sous TF-0410, FIGEAIT le contraire : « un seq SAUTÉ reste FAIL, même nommé par une rectification ». La
// décision de TF-2494 renverse cette règle pour le seul saut en avant — la fixture de ce vieux test (la rectification qui
// nomme le seq 3 avec son ts) devient le cas VERT ci-dessous, et le FAIL reste dû à tout saut que rien ne couvre.
const SAUT_ENTREES = [
  { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "self-test-saut" },
  { seq: 2, ts: "2026-01-01T10:30:00Z", type: "note", detail: "avant la lacune" },
  { seq: 6, ts: "2026-01-01T11:00:00Z", type: "note", detail: "seq 3 à 5 jamais écrits" },
];
const RECTIF_SAUT = (seq, tsConsigne, cause = "trois entrées écrites par une session dont le dépôt a été perdu") => ({
  seq, ts: "2026-01-02T09:00:00Z", type: "rectification_horodatage", entrees: [{ seq: 6, ts_consigne: tsConsigne, ts_reel_estime: tsConsigne, cause }],
});
check("ledger TF-2494 (rouge) : un saut en avant que rien ne déclare reste FAIL, il nomme la lacune (seq 3 à 5) et dit le remède", () => {
  const lf = join(out, "t2494-saut-nu.jsonl");
  ecrireBrut(lf, SAUT_ENTREES);
  const { sortie, code } = verifyRouge(lf);
  if (code !== 1) throw new Error(`exit 1 attendu, ${code}`);
  if (!sortie.includes("seq 6 attendu 3") || !sortie.includes("saut en avant, seq 3 à 5 jamais écrits")) throw new Error("la lacune doit être nommée : " + sortie.slice(0, 400));
  if (!sortie.includes("rectification_horodatage") || !sortie.includes("anteriorite_ledger")) throw new Error("les deux voies du remède doivent être dites : " + sortie.slice(0, 500));
});
check("ledger TF-2494 (vert) : une rectification ultérieure qui nomme le seq qui SUIT la lacune, avec son ts, couvre le saut → exit 0, [RECTIFIÉ] saut en avant imprimé et compté", () => {
  const lf = join(out, "t2494-saut-rectifie.jsonl");
  ecrireBrut(lf, [...SAUT_ENTREES, RECTIF_SAUT(7, "2026-01-01T11:00:00Z")]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("le saut rectifié doit passer : " + v);
  if (!/\[RECTIFIÉ\][^\n]*seq 6 attendu 3[^\n]*saut en avant, seq 3 à 5 jamais écrits/.test(v)) throw new Error("le saut doit s'imprimer [RECTIFIÉ], jamais disparaître : " + v);
  if (!v.includes("1 saut(s) de seq en avant DÉCLARÉ(S)") || v.includes("[SANS OBJET]")) throw new Error("le saut couvert doit être compté au verdict, la déclaration appliquée : " + v);
});
check("ledger TF-2494 (rouge) : une rectification dont `ts_consigne` ne colle pas à l'entrée qui suit la lacune ne couvre rien → FAIL, la divergence nommée", () => {
  const lf = join(out, "t2494-saut-ts-diverge.jsonl");
  ecrireBrut(lf, [...SAUT_ENTREES, RECTIF_SAUT(7, "2026-01-01T11:30:00Z")]);
  const { sortie } = verifyRouge(lf);
  if (!sortie.includes("saut en avant") || !sortie.includes("une déclaration qui ne correspond pas à l'histoire ne couvre rien")) throw new Error("la divergence doit être nommée : " + sortie.slice(0, 500));
});
check("ledger TF-2494 (rouge) : une rectification de saut incomplète (cause absente) reste un écart, et le saut reste FAIL", () => {
  const lf = join(out, "t2494-saut-incomplet.jsonl");
  const r = RECTIF_SAUT(7, "2026-01-01T11:00:00Z");
  delete r.entrees[0].cause;
  ecrireBrut(lf, [...SAUT_ENTREES, r]);
  const { sortie } = verifyRouge(lf);
  if (!sortie.includes("déclaration incomplète") || !sortie.includes("saut en avant")) throw new Error("déclaration incomplète ET saut non couvert attendus : " + sortie.slice(0, 500));
});
check("ledger TF-2494 (vert) : une antériorité bornée (`avant` après le ts de l'entrée qui suit la lacune, cause ≥ 20) couvre le saut → exit 0, [ANTÉRIORITÉ] saut en avant imprimé", () => {
  const lf = join(out, "t2494-saut-anteriorite.jsonl");
  ecrireBrut(lf, [...SAUT_ENTREES,
    { seq: 7, ts: "2026-01-02T09:00:00Z", type: "anteriorite_ledger", avant: "2026-01-01T12:00:00Z", cause: "lacune de seq du 01/01, antérieure à la session qui la révèle" }]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("le saut antérieur déclaré doit passer : " + v);
  if (!/\[ANTÉRIORITÉ\][^\n]*seq 6 attendu 3[^\n]*saut en avant, seq 3 à 5 jamais écrits/.test(v)) throw new Error("le saut doit s'imprimer [ANTÉRIORITÉ] : " + v);
  if (!v.includes("1 saut(s) de seq en avant DÉCLARÉ(S)")) throw new Error("le saut couvert doit être compté au verdict : " + v);
});
check("ledger TF-2494 (rouge) : une antériorité qui ne couvre pas — `avant` au plus tôt que le saut, ou cause de 19 caractères — laisse le saut FAIL", () => {
  const tropTot = join(out, "t2494-anteriorite-trop-tot.jsonl");
  ecrireBrut(tropTot, [...SAUT_ENTREES,
    { seq: 7, ts: "2026-01-02T09:00:00Z", type: "anteriorite_ledger", avant: "2026-01-01T11:00:00Z", cause: "lacune de seq du 01/01, antérieure à la session qui la révèle" }]);
  if (!verifyRouge(tropTot).sortie.includes("saut en avant")) throw new Error("`avant` égal au ts du saut (strictement antérieur exigé) ne couvre pas");
  const courte = join(out, "t2494-anteriorite-cause-courte.jsonl");
  ecrireBrut(courte, [...SAUT_ENTREES,
    { seq: 7, ts: "2026-01-02T09:00:00Z", type: "anteriorite_ledger", avant: "2026-01-01T12:00:00Z", cause: "x".repeat(19) }]);
  if (!verifyRouge(courte).sortie.includes("saut en avant")) throw new Error("une cause de 19 caractères ne couvre pas (R-42 en demande 20)");
});
check("ledger TF-2494 (anti-fail-fast) : deux sauts, un seul couvert → FAIL qui ne nomme que le second, le premier [RECTIFIÉ]", () => {
  const lf = join(out, "t2494-deux-sauts.jsonl");
  ecrireBrut(lf, [
    ...SAUT_ENTREES,
    { seq: 7, ts: "2026-01-01T12:00:00Z", type: "note", detail: "en ordre" },
    { seq: 10, ts: "2026-01-01T13:00:00Z", type: "note", detail: "seq 8 et 9 jamais écrits, personne ne les déclare" },
    RECTIF_SAUT(11, "2026-01-01T11:00:00Z"),
  ]);
  const { sortie } = verifyRouge(lf);
  if (!sortie.includes("seq 10 attendu 8") || !sortie.includes("seq 8 à 9 jamais écrits")) throw new Error("le second saut doit être nommé : " + sortie.slice(0, 500));
  if (!sortie.includes("[RECTIFIÉ]") || !sortie.includes("1 écart(s) non rectifié(s)")) throw new Error("le premier saut est couvert et le compte dit 1 écart : " + sortie.slice(0, 500));
});
// TF-2540 RENVERSE ce cas, par décision (14/11/2026) : TF-2494 figeait « l'antériorité ne couvre ici que le saut en avant » alors que R-42
// du pilot couvre aussi une collision ; la décision de TF-2540 est que les deux juges rendent le même verdict. La même fixture (seq 2 en
// double, horodaté 10:45, sous une antériorité `avant` 12:00) est donc désormais couverte [ANTÉRIORITÉ] ; le FAIL reste dû à l'écart
// qu'aucune antériorité ne précède (cas « collision nue », « égal à `avant` » du bloc TF-2540 plus bas).
check("ledger TF-2494 → TF-2540 : un seq en double antérieur à `avant` est couvert [ANTÉRIORITÉ], comme R-42 le couvre (TF-2494 le laissait FAIL)", () => {
  const lf = join(out, "t2494-recul-hors-anteriorite.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "self-test-saut" },
    { seq: 2, ts: "2026-01-01T10:30:00Z", type: "note", detail: "en ordre" },
    { seq: 2, ts: "2026-01-01T10:45:00Z", type: "note", detail: "seq 2 en double, deuxième écrivain" },
    { seq: 3, ts: "2026-01-02T09:00:00Z", type: "anteriorite_ledger", avant: "2026-01-01T12:00:00Z", cause: "lacune de seq du 01/01, antérieure à la session qui la révèle" },
  ]);
  const sortie = run(ledger, ["verify", lf]);
  if (!sortie.includes("[PASS]") || !sortie.includes("[ANTÉRIORITÉ]") || !sortie.includes("seq en collision")) throw new Error("une collision antérieure à `avant` est couverte, imprimée [ANTÉRIORITÉ] : " + sortie.slice(0, 400));
});

check("ledger TF-0410 : append refuse un `ts` de payload ANTÉRIEUR au maximum, sans rien écrire", () => {
  const lf = join(out, "ts-append-garde.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "self-test-garde", ts: "2026-01-01T12:00:00Z" })]);
  const avant = readFileSync(lf, "utf8");
  try {
    execFileSync("node", [ledger, "append", lf, JSON.stringify({
      type: "etape_open", ts: "2026-01-01T09:00:00Z", detail: "heure du run Azure",
    })], { encoding: "utf8", stdio: "pipe" });
    throw new Error("append aurait dû refuser un ts antérieur");
  } catch (e) {
    if (!e.status) throw e; // relance l'échec du test lui-même, jamais confondu avec un refus
    const err = String(e.stderr || "");
    if (!err.includes("[LEDGER FAIL]") || !err.includes("ANTÉRIEUR")) throw new Error(`refus attendu nommant l antériorité, reçu : ${err.slice(0, 200)}`);
    if (!err.includes("ts_action")) throw new Error("le refus doit dire OÙ consigner l heure de l action (ts_action)");
  }
  if (readFileSync(lf, "utf8") !== avant) throw new Error("le fichier a été modifié malgré le refus — un refus doit être sans écriture");
  // Et le sens inverse : un ts fourni qui NE remonte PAS reste accepté, mais annoncé.
  const okOut = run(ledger, ["append", lf, JSON.stringify({ type: "etape_open", ts: "2026-01-01T13:00:00Z", detail: "consignation fixée" })]);
  if (!okOut.includes("[ATTENTION]")) throw new Error("un ts imposé par le payload doit être annoncé, jamais silencieux");
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("le ledger doit rester intègre après un ts imposé non décroissant");
  const lignes = readFileSync(lf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  if (lignes.length !== 2) throw new Error(`2 entrées attendues, ${lignes.length} — le refus n a rien laissé passer`);
});

// --- TF-1422 (28/09/2026) : DES INSTANTS, JAMAIS DES CHAÎNES. Le fait mesuré chez un produit le
// 25/09 : `append` horodate en UTC, le produit écrit l'heure de Paris avec son décalage, et la
// monotonie se jugeait en comparant des chaînes. Les deux ledgers jetables du lot, tels quels :
// (a) seq 2 postérieure de 15 minutes mais écrite en UTC, accusée de recul à tort (exit 1) ;
// (b) seq 2 antérieure de 15 minutes, écrite avec décalage, passée à tort (exit 0).
check("ledger TF-1422 (a) : entrée POSTÉRIEURE écrite en UTC après une heure à décalage → PASS, aucun faux recul", () => {
  const lf = join(out, "ts-instant-a.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-09-25T09:30:00+02:00", type: "run_open" },
    { seq: 2, ts: "2026-09-25T07:45:00.000Z", type: "retour" },
  ]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("07:45Z est postérieur de 15 minutes à 09:30+02:00 : aucun recul");
});

check("ledger TF-1422 (b) : entrée ANTÉRIEURE écrite avec décalage après une heure UTC → FAIL qui nomme le recul", () => {
  const lf = join(out, "ts-instant-b.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-09-25T07:45:00.000Z", type: "run_open" },
    { seq: 2, ts: "2026-09-25T09:30:00+02:00", type: "retour" },
  ]);
  const { sortie } = verifyRouge(lf);
  if (!sortie.includes("seq 2 : horodatage décroissant (2026-09-25T09:30:00+02:00 après 2026-09-25T07:45:00.000Z)"))
    throw new Error("le recul masqué par le fuseau doit être nommé avec ses deux horodatages : " + sortie);
});

check("ledger TF-1422 : `ts` illisible ou absent → FAIL qui nomme les deux, jamais un PASS muet", () => {
  const lf = join(out, "ts-illisible-absent.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-09-25T07:45:00.000Z", type: "run_open", substrat: "self-test-ts" },
    { seq: 2, ts: "25/09/2026 09:50", type: "note", detail: "heure écrite à la française" },
    { seq: 3, type: "note", detail: "ts absent" },
  ]);
  const { sortie } = verifyRouge(lf);
  for (const attendu of ['seq 2 : horodatage illisible ("25/09/2026 09:50")', "seq 3 : horodatage absent", "2 écart(s)"])
    if (!sortie.includes(attendu)) throw new Error(`« ${attendu} » absent de la sortie : ${sortie}`);
});

check("ledger TF-1422 : un `ts` illisible cité tel quel par `ts_consigne` se rectifie → PASS avec [RECTIFIÉ]", () => {
  const lf = join(out, "ts-illisible-rectifie.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-09-25T07:45:00.000Z", type: "run_open", substrat: "self-test-ts" },
    { seq: 2, ts: "25/09/2026 09:50", type: "note", detail: "heure écrite à la française" },
    { seq: 3, ts: "2026-09-25T08:10:00.000Z", type: "rectification_horodatage", entrees: [
      { seq: 2, ts_consigne: "25/09/2026 09:50", ts_reel_estime: "2026-09-25T07:50:00.000Z", cause: "heure écrite à la main" }] },
  ]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]") || !v.includes('[RECTIFIÉ] seq 2 : horodatage illisible ("25/09/2026 09:50")'))
    throw new Error("la rectification qui cite l illisible doit le couvrir, et l imprimer : " + v);
});

check("ledger TF-1422 : la garde d'`append` compare des instants dans les deux sens, et refuse un `ts` illisible", () => {
  const lf = join(out, "ts-append-instants.jsonl");
  ecrireBrut(lf, [{ seq: 1, ts: "2026-09-25T09:30:00+02:00", type: "run_open", substrat: "self-test-ts" }]);
  // Vert : 07:45Z est postérieur à 09:30+02:00 (07:30Z), alors que la chaîne est « plus petite ».
  const ok = run(ledger, ["append", lf, JSON.stringify({ type: "etape_open", ts: "2026-09-25T07:45:00.000Z", detail: "postérieur, écrit en UTC" })]);
  if (!ok.includes("[OK] entrée 2")) throw new Error("un ts postérieur écrit en UTC doit être accepté : " + ok);
  const avant = readFileSync(lf, "utf8");
  // Rouge : 09:40+02:00 (07:40Z) précède le maximum 07:45Z, alors que la chaîne est « plus grande ».
  for (const [ts, motif] of [["2026-09-25T09:40:00+02:00", "ANTÉRIEUR"], ["hier soir", "ILLISIBLE"]]) {
    let err = null;
    try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "etape_open", ts, detail: "refus attendu" })], { encoding: "utf8", stdio: "pipe" }); }
    catch (e) { err = String(e.stderr || ""); }
    if (err === null) throw new Error(`append aurait dû refuser le ts ${ts}`);
    if (!err.includes("[LEDGER FAIL]") || !err.includes(motif)) throw new Error(`refus attendu nommant ${motif}, reçu : ${err.slice(0, 200)}`);
  }
  if (readFileSync(lf, "utf8") !== avant) throw new Error("le fichier a été modifié malgré un refus — un refus doit être sans écriture");
  // Le remède que le refus propose se joue (TF-1013) : sans `ts`, l'outil pose l'horodatage machine.
  run(ledger, ["append", lf, JSON.stringify({ type: "etape_open", detail: "ts laissé à l outil" })]);
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("le ledger doit rester intègre après le remède");
});

// ============================================================================================
// TF-1366 (a) — ARGUMENT EN SURNOMBRE REFUSÉ. Fait mesuré chez un produit (21/09) : un script de
// journal réécrit ignorait tout argument sans « -- ». `append <ledger> '<json>' --etape x` est
// l'exemple exact du fait mesuré.
// ============================================================================================
check("ledger TF-1366 (a) : `append` avec un argument en surnombre → refus qui NOMME l'argument et redonne l'usage", () => {
  const lf = join(out, "ledger-surnombre.jsonl");
  let sortie = null;
  try {
    execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "run_open", substrat: "x" }), "--etape", "x"],
      { encoding: "utf8", stdio: "pipe" });
  } catch (e) { sortie = String(e.stderr || ""); }
  if (sortie === null) throw new Error("append aurait dû refuser l'argument en surnombre --etape x");
  if (!sortie.includes("[LEDGER FAIL]")) throw new Error("refus attendu avec [LEDGER FAIL] : " + sortie);
  if (!sortie.includes("`--etape`") || !sortie.includes("`x`")) throw new Error("le refus ne NOMME pas l'argument en trop : " + sortie);
  if (!sortie.toLowerCase().includes("usage")) throw new Error("le refus ne redonne pas l'usage : " + sortie);
  if (existsSync(lf)) throw new Error("le fichier a été créé malgré le refus — un refus doit être sans écriture");
});

check("ledger TF-1366 (a) : `append` en forme reconnue (payload JSON seul) → accepté, non-régression", () => {
  const lf = join(out, "ledger-surnombre-vert.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "forme reconnue" })]);
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("un append en forme reconnue doit rester accepté");
});

check("ledger TF-1366 (a) : `verify` avec un argument en surnombre → refus qui NOMME l'argument", () => {
  const lf = join(out, "ledger-surnombre-verify.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "x" })]);
  let sortie = null;
  try { execFileSync("node", [ledger, "verify", lf, "--etape", "x"], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || ""); }
  if (sortie === null) throw new Error("verify aurait dû refuser l'argument en surnombre --etape x");
  if (!sortie.includes("`--etape`")) throw new Error("le refus ne NOMME pas l'argument en trop : " + sortie);
});

// ============================================================================================
// TF-1366 (b) — ENTRÉE SANS TYPE, OU SANS CONTENU AU-DELÀ DE SON TYPE (ET UN `ts` ÉVENTUEL) :
// REFUSÉE À L'ÉCRITURE. Une entrée sans contenu reste pour toujours dans un journal en ajout
// seul, et se lit ensuite comme une preuve — c'est le mécanisme exact du fait mesuré du 21/09.
// ============================================================================================
check("ledger TF-1366 (b) : `append` refuse une entrée sans `type`", () => {
  const lf = join(out, "ledger-sans-type.jsonl");
  let sortie = null;
  try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ substrat: "sans type" })], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || ""); }
  if (sortie === null) throw new Error("append aurait dû refuser une entrée sans `type`");
  if (!sortie.includes("`type`")) throw new Error("le refus ne nomme pas le champ type : " + sortie);
  if (existsSync(lf)) throw new Error("le fichier a été créé malgré le refus");
});

check("ledger TF-1366 (b) : `append` refuse une entrée réduite à son `type` (et un `ts` éventuel)", () => {
  const lf = join(out, "ledger-reduite-type.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "amorce" })]);
  let sortie = null;
  try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "etape_open" })], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || ""); }
  if (sortie === null) throw new Error("append aurait dû refuser une entrée réduite à son seul type");
  if (!sortie.includes("aucun contenu")) throw new Error("le refus ne dit pas pourquoi (aucun contenu) : " + sortie);
  // Le même refus vaut avec un `ts` fourni explicite — « et un ts éventuel » (b).
  let sortie2 = null;
  try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "etape_open", ts: "2026-01-01T00:00:00Z" })], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie2 = String(e.stderr || ""); }
  if (sortie2 === null) throw new Error("append aurait dû refuser une entrée réduite à son type + ts");
  const lignes = readFileSync(lf, "utf8").split("\n").filter(Boolean);
  if (lignes.length !== 1) throw new Error(`1 entrée attendue (l amorce), ${lignes.length} — un refus a laissé passer une écriture`);
});

check("ledger TF-1366 (b) : une entrée avec du contenu au-delà de `type`/`ts` reste acceptée (la règle ne déborde pas)", () => {
  const lf = join(out, "ledger-avec-contenu.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "x" })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "etape_open", detail: "un contenu" })]);
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("une entrée avec contenu doit rester acceptée");
});

// TF-1366 (d) — l'écho `[OK]` NOMME le type et les champs écrits.
check("ledger TF-1366 (d) : l'écho `[OK]` NOMME le type et les champs écrits", () => {
  const lf = join(out, "ledger-echo.jsonl");
  const okOut = run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.0", substrat: "echo" })]);
  if (!okOut.includes("type run_open")) throw new Error("l'écho ne nomme pas le type : " + okOut);
  if (!okOut.includes("schema_ledger") || !okOut.includes("substrat")) throw new Error("l'écho ne nomme pas les champs écrits : " + okOut);
});

// ============================================================================================
// TF-1366 (e) — `verify` SIGNALE LES ENTRÉES SANS CONTENU écrites par un AUTRE outil (ou avant ce
// correctif, `append` les refusant désormais lui-même) : non bloquant sous un schéma absent ou
// `1.0`, FAIL sous `1.1` (D-18) — on ne met JAMAIS en échec un journal existant.
// ============================================================================================
check("ledger TF-1366 (e) : entrée sans contenu, schéma ABSENT → [SANS CONTENU] non bloquant, PASS", () => {
  const lf = join(out, "ledger-sanscontenu-absent.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "sans schema" },
    { seq: 2, ts: "2026-01-01T10:00:01Z", type: "note" },
  ]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("une entrée sans contenu ne doit PAS bloquer sans schéma déclaré : " + v);
  if (!v.includes("[SANS CONTENU]")) throw new Error("l'entrée sans contenu doit être SIGNALÉE, pas tue : " + v);
  if (!v.includes("1 entrée")) throw new Error("le compte doit être dit : " + v);
});

check("ledger TF-1366 (e) : entrée sans contenu, schéma 1.0 → [SANS CONTENU] non bloquant, PASS (D-18, sans rien de neuf)", () => {
  const lf = join(out, "ledger-sanscontenu-1-0.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", schema_ledger: "1.0", substrat: "1.0" },
    { seq: 2, ts: "2026-01-01T10:00:01Z", type: "note" },
  ]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("un journal 1.0 existant ne doit PAS passer au rouge pour une entrée sans contenu (D-18) : " + v);
  if (!v.includes("[SANS CONTENU]")) throw new Error("l'entrée sans contenu doit être SIGNALÉE, pas tue : " + v);
});

check("ledger TF-1366 (e) : entrée sans contenu, schéma 1.1 → FAIL bloquant", () => {
  const lf = join(out, "ledger-sanscontenu-1-1.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["agents"], substrat: "1.1" },
    { seq: 2, ts: "2026-01-01T10:00:01Z", type: "note" },
  ]);
  let sortie = null;
  try { execFileSync("node", [ledger, "verify", lf], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie = String(e.stdout || "") + String(e.stderr || ""); }
  if (sortie === null) throw new Error("une entrée sans contenu doit FAIL sous le schéma 1.1");
  if (!sortie.includes("sans contenu")) throw new Error("le FAIL doit dire « sans contenu » : " + sortie);
});

// ============================================================================================
// TF-1367, 21/09/2026 — DEUX ÉCRIVAINS, UN MÊME SEQ. `append` verrouille déjà l'écriture ; deux
// appends CONCURRENTS DE CE SCRIPT reçoivent deux seq distincts (prouvé plus haut, test de
// verrou). Le défaut visé ici est un ledger écrit par un AUTRE outil sans ce verrou commun.
// ============================================================================================
// TF-1367, 27/09/2026 — LE NUMÉRO N'APPARTIENT QU'À L'OUTIL. Un `seq` fourni par le payload
// écrasait celui qu'`append` calcule sous verrou (spread après `seq`) : deux entrées pouvaient
// porter le même numéro sans aucune concurrence. Rouge : refusé, rien d'écrit, verify reste
// intègre. Vert : la même entrée sans `seq` reçoit le numéro suivant.
check("ledger TF-1367 : `append` refuse un `seq` fourni par le payload, et la même entrée sans lui reçoit le numéro suivant", () => {
  const lf = join(out, "ledger-seq-fourni.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "numero fourni" })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "etape_open", detail: "deuxieme" })]);
  let sortie = null;
  try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "etape_open", detail: "recopie", seq: 2 })], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || ""); }
  if (sortie === null) throw new Error("append aurait dû refuser un `seq` fourni par le payload");
  if (!sortie.includes("`seq`")) throw new Error("le refus ne nomme pas le champ seq : " + sortie);
  const avant = readFileSync(lf, "utf8").split("\n").filter(Boolean);
  if (avant.length !== 2) throw new Error(`2 entrées attendues après le refus, ${avant.length} — un refus a laissé passer une écriture`);
  run(ledger, ["append", lf, JSON.stringify({ type: "etape_open", detail: "recopie" })]);
  const apres = readFileSync(lf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).seq);
  if (apres.join(",") !== "1,2,3") throw new Error(`numéros attendus 1,2,3 — obtenus ${apres.join(",")}`);
  run(ledger, ["verify", lf]);
});

check("ledger TF-1367 : seq porté par deux entrées → NOMMÉ en tête des écarts, distinct d'une rupture ordinaire", () => {
  const lf = join(out, "ledger-doublon-seq.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "deux ecrivains" },
    { seq: 2, ts: "2026-01-01T10:00:01Z", type: "note", detail: "session a" },
    { seq: 2, ts: "2026-01-01T10:00:02Z", type: "note", detail: "session b — meme seq" },
    { seq: 3, ts: "2026-01-01T10:00:03Z", type: "note", detail: "suite" },
  ]);
  let sortie = null;
  try { execFileSync("node", [ledger, "verify", lf], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie = String(e.stdout || "") + String(e.stderr || ""); }
  if (sortie === null) throw new Error("un seq porté par deux entrées doit FAIL");
  if (!sortie.includes("seq 2 porté par 2 entrées")) throw new Error("le défaut n'est pas NOMMÉ avec seq et compte : " + sortie);
  if (!sortie.includes("lignes 2, 3")) throw new Error("les numéros de ligne ne sont pas cités : " + sortie);
  if (!sortie.includes("deux écrivains sans verrou commun")) throw new Error("le sens du défaut n'est pas dit : " + sortie);
  // EN TÊTE : le message du doublon précède toute autre rupture dans le rapport d'intégrité.
  const idxDoublon = sortie.indexOf("porté par 2 entrées");
  const idxRompu = sortie.indexOf("append-only rompu");
  if (idxRompu >= 0 && idxDoublon > idxRompu) throw new Error("le doublon doit être nommé EN TÊTE, avant les ruptures génériques : " + sortie);
});

// ============================================================================================
// TF-1425, 28/09/2026 — LA RECTIFICATION COUVRE AUSSI UNE COLLISION DE SEQ, comme R-42 du pilot
// la consomme depuis TF-0794. Le ledger jetable du lot « Produit-77 - RETOURS - 20260925b »
// (deux branches parallèles fusionnées) rendait PASS chez R-42 et exit 1 ici. Le vert se joue
// tel quel ; les rouges disent ce que la rectification ne couvre pas : rien sans elle, pas un seq
// qu'elle ne nomme pas, pas une entrée dont elle ne cite pas le ts, pas une entrée écrite après.
// ============================================================================================
const COLLISION = [
  { seq: 1, ts: "2026-09-25T09:00:00+02:00", type: "run_open" },
  { seq: 2, ts: "2026-09-25T09:10:00+02:00", type: "retour" },
  { seq: 3, ts: "2026-09-25T09:20:00+02:00", type: "retour" },
  { seq: 2, ts: "2026-09-25T09:30:00+02:00", type: "retour" },
  { seq: 3, ts: "2026-09-25T09:40:00+02:00", type: "retour" },
];
const DECL_COLLISION_2 = { seq: 2, ts_consigne: "2026-09-25T09:30:00+02:00", ts_reel_estime: "2026-09-25T09:30:00+02:00", cause: "deux branches, meme queue (1), fusionnees l'une apres l'autre" };
const DECL_COLLISION_3 = { seq: 3, ts_consigne: "2026-09-25T09:40:00+02:00", ts_reel_estime: "2026-09-25T09:40:00+02:00", cause: "meme collision" };
const rectifCollision = (declarations) => ({
  seq: 4, ts: "2026-09-25T09:50:00+02:00", type: "rectification_horodatage",
  resume: "collision de seq par deux branches paralleles", entrees: declarations,
});

check("ledger TF-1425 : le ledger du lot, collision des seq 2 et 3 rectifiée avec les quatre champs → PASS, chaque collision imprimée [RECTIFIÉ]", () => {
  const lf = join(out, "collision-rectifiee.jsonl");
  ecrireBrut(lf, [...COLLISION, rectifCollision([DECL_COLLISION_2, DECL_COLLISION_3])]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("la collision déclarée doit passer, comme chez R-42 : " + v);
  for (const attendu of [
    "[RECTIFIÉ] ligne 4 : seq 2 attendu 4 (seq en collision)",
    "[RECTIFIÉ] ligne 5 : seq 3 attendu 4 (seq en collision)",
    "[RECTIFIÉ] seq 2 porté par 2 entrées, lignes 2, 4",
    "[RECTIFIÉ] seq 3 porté par 2 entrées, lignes 3, 5",
    "2 collision(s) de seq DÉCLARÉE(S) et rectifiée(s) (seq 2, 3)",
  ]) if (!v.includes(attendu)) throw new Error(`« ${attendu} » absent : rectifié n est pas effacé — ${v}`);
  if (v.includes("[SANS OBJET]")) throw new Error("les deux déclarations couvrent une collision : aucune n est sans objet");
});

check("ledger TF-1425 : la même collision SANS rectification → FAIL, doublons en tête et les DEUX entrées nommées", () => {
  const lf = join(out, "collision-nue.jsonl");
  ecrireBrut(lf, COLLISION);
  const { sortie } = verifyRouge(lf);
  // La seconde entrée en collision (ligne 5) se juge contre le PLUS HAUT seq vu : comparée à la
  // précédente, elle passait (3 après 2) et la collision n'était vue qu'à moitié.
  for (const attendu of ["seq 2 porté par 2 entrées", "seq 3 porté par 2 entrées",
    "ligne 4 : seq 2 attendu 4 (append-only rompu)", "ligne 5 : seq 3 attendu 4 (append-only rompu)", "4 écart(s)"])
    if (!sortie.includes(attendu)) throw new Error(`« ${attendu} » absent : ${sortie}`);
  if (sortie.includes("[RECTIFIÉ]")) throw new Error("rien n est déclaré : rien ne doit s imprimer rectifié");
});

check("ledger TF-1425 : ce que la rectification ne couvre pas — un seq non nommé, un ts non cité, une entrée écrite après elle", () => {
  // (1) Partielle : seule la collision du seq 2 est nommée.
  let lf = join(out, "collision-partielle.jsonl");
  ecrireBrut(lf, [...COLLISION, rectifCollision([DECL_COLLISION_2])]);
  let { sortie } = verifyRouge(lf);
  if (!sortie.includes("[RECTIFIÉ] ligne 4 : seq 2")) throw new Error("la collision nommée reste rectifiée : " + sortie);
  if (!sortie.includes("ligne 5 : seq 3 attendu 4 (append-only rompu)") || !sortie.includes("seq 3 porté par 2 entrées"))
    throw new Error("la collision NON nommée doit rester un FAIL, doublon compris : " + sortie);
  // (2) La déclaration cite le ts de la PREMIÈRE entrée au seq 2, pas celui de l'entrée en collision.
  lf = join(out, "collision-ts-premiere.jsonl");
  ecrireBrut(lf, [...COLLISION, rectifCollision([{ ...DECL_COLLISION_2, ts_consigne: "2026-09-25T09:10:00+02:00" }, DECL_COLLISION_3])]);
  ({ sortie } = verifyRouge(lf));
  if (!sortie.includes("ligne 4 : seq 2 attendu 4 (append-only rompu)") || !sortie.includes("ne correspond pas à"))
    throw new Error("un ts_consigne qui ne cite pas l entrée en collision ne couvre rien, et le dit : " + sortie);
  // (3) La rectification est écrite AVANT la collision qu'elle nomme : on ne se dédouane pas d'avance.
  lf = join(out, "collision-couverte-d-avance.jsonl");
  ecrireBrut(lf, [...COLLISION.slice(0, 3), rectifCollision([DECL_COLLISION_2]), { seq: 2, ts: "2026-09-25T09:30:00+02:00", type: "retour" }]);
  ({ sortie } = verifyRouge(lf));
  if (!sortie.includes("ligne 5 : seq 2 attendu 5 (append-only rompu)")) throw new Error("la collision écrite après la rectification doit rester un FAIL : " + sortie);
  if (sortie.includes("[RECTIFIÉ]")) throw new Error("une rectification écrite avant la collision ne couvre rien : " + sortie);
});

check("ledger TF-1425 : une branche plus ancienne fusionnée après (collision ET recul) → une déclaration couvre les deux, la suite reprend au plus haut seq vu", () => {
  const lf = join(out, "collision-et-recul.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-09-25T09:00:00Z", type: "run_open", substrat: "deux branches" },
    { seq: 2, ts: "2026-09-25T09:10:00Z", type: "note", detail: "branche A" },
    { seq: 3, ts: "2026-09-25T09:20:00Z", type: "note", detail: "branche A" },
    { seq: 4, ts: "2026-09-25T09:30:00Z", type: "note", detail: "branche A" },
    { seq: 2, ts: "2026-09-25T09:15:00Z", type: "note", detail: "branche B, fusionnée après A" },
    { seq: 5, ts: "2026-09-25T09:40:00Z", type: "rectification_horodatage", entrees: [
      { seq: 2, ts_consigne: "2026-09-25T09:15:00Z", ts_reel_estime: "2026-09-25T09:15:00Z", cause: "branche B fusionnée après la branche A" }] },
    { seq: 6, ts: "2026-09-25T09:50:00Z", type: "note", detail: "la suite reprend au plus haut seq vu" },
  ]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("collision et recul d une même entrée, déclarés, doivent passer : " + v);
  for (const attendu of [
    "[RECTIFIÉ] ligne 5 : seq 2 attendu 5 (seq en collision)",
    "[RECTIFIÉ] seq 2 : horodatage décroissant (2026-09-25T09:15:00Z après 2026-09-25T09:30:00Z)",
    "1 écart(s) d'horodatage DÉCLARÉ(S) et rectifié(s) (seq 2)",
    "1 collision(s) de seq DÉCLARÉE(S) et rectifiée(s) (seq 2)",
  ]) if (!v.includes(attendu)) throw new Error(`« ${attendu} » absent — ${v}`);
});

// ============================================================================================
// D-18 (a), décision humaine du 26/09/2026 — SCHÉMA 1.1 : `forges_mobilisees` DEVIENT UN CHAMP
// DÛ DE `run_open`. Un journal qui déclare `1.0` reste jugé selon SES règles, sans rien de neuf.
// ============================================================================================
check("ledger D-18 (a) : `run_open` en 1.1 SANS `forges_mobilisees` → refusé à l'écriture (c), et FAIL à verify sur un ledger tiers", () => {
  const lf = join(out, "ledger-1-1-sans-forges.jsonl");
  let sortie = null;
  try {
    execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.1", substrat: "x" })],
      { encoding: "utf8", stdio: "pipe" });
  } catch (e) { sortie = String(e.stderr || ""); }
  if (sortie === null) throw new Error("append aurait dû refuser un run_open 1.1 sans forges_mobilisees");
  if (!sortie.includes("forges_mobilisees")) throw new Error("le refus ne nomme pas le champ dû : " + sortie);

  // Un ledger tiers (écrit hors de cet `append` durci, ex. avant le correctif) : `verify` doit
  // continuer à voir le manque, après coup.
  const lfTiers = join(out, "ledger-1-1-sans-forges-tiers.jsonl");
  ecrireBrut(lfTiers, [{ seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", schema_ledger: "1.1", substrat: "x" }]);
  let sortieV = null;
  try { execFileSync("node", [ledger, "verify", lfTiers], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortieV = String(e.stdout || "") + String(e.stderr || ""); }
  if (sortieV === null) throw new Error("verify aurait dû FAIL sur un run_open 1.1 sans forges_mobilisees");
  if (!sortieV.includes("forges_mobilisees")) throw new Error("verify ne nomme pas le champ dû : " + sortieV);
});

check("ledger D-18 (a) : `run_open` en 1.1 avec `forges_mobilisees` (noms complets, courts, annotés) → accepté, PASS", () => {
  const lf = join(out, "ledger-1-1-avec-forges.jsonl");
  run(ledger, ["append", lf, JSON.stringify({
    type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["agents", "design (aval)"], substrat: "x",
  })]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("un run_open 1.1 avec forges_mobilisees valide doit passer : " + v);
});

check("ledger D-18 (a) : `forges_mobilisees` tableau VIDE, ou avec un élément vide → refusé à l'écriture", () => {
  const lfVide = join(out, "ledger-1-1-forges-vide.jsonl");
  let s1 = null;
  try {
    execFileSync("node", [ledger, "append", lfVide, JSON.stringify({ type: "run_open", schema_ledger: "1.1", forges_mobilisees: [], substrat: "x" })],
      { encoding: "utf8", stdio: "pipe" });
  } catch (e) { s1 = String(e.stderr || ""); }
  if (s1 === null) throw new Error("un tableau vide de forges_mobilisees doit être refusé");

  const lfElemVide = join(out, "ledger-1-1-forges-elem-vide.jsonl");
  let s2 = null;
  try {
    execFileSync("node", [ledger, "append", lfElemVide, JSON.stringify({ type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["agents", "  "], substrat: "x" })],
      { encoding: "utf8", stdio: "pipe" });
  } catch (e) { s2 = String(e.stderr || ""); }
  if (s2 === null) throw new Error("un élément vide dans forges_mobilisees doit être refusé");
  if (!s2.includes("element")) throw new Error("le refus ne dit pas ce qui est vide : " + s2);
});

check("ledger D-18 (a) : un journal qui déclare 1.0 reste jugé selon 1.0 — `run_open` SANS `forges_mobilisees` reste accepté", () => {
  const lf = join(out, "ledger-1-0-sans-forges.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.0", substrat: "x" })]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("un run_open 1.0 sans forges_mobilisees ne doit PAS être mis en échec (D-18, sans rien de neuf) : " + v);
});

// ============================================================================================
// TF-1722 (15/10/2026) — une `rectification_forges_mobilisees` (TF-1715 du pilot) sans liste non
// vide ou sans `cause` est REFUSÉE à l'écriture, quel que soit le schéma : le juge de
// l'enclenchement l'ignorerait. Sur le code d'avant, les quatre rouges s'écrivaient (type libre).
// ============================================================================================
const RECTIF_COMPLETE = { type: "rectification_forges_mobilisees", forges_mobilisees: ["agents", "design"], cause: "le run_open déclarait ops à tort : aucune MEP dans ce run" };
const RECTIF_ROUGES = [
  ["sans liste", { type: "rectification_forges_mobilisees", cause: "x" }, "`forges_mobilisees` absent"],
  ["liste vide", { type: "rectification_forges_mobilisees", forges_mobilisees: [], cause: "x" }, "`forges_mobilisees` vide"],
  ["sans cause", { type: "rectification_forges_mobilisees", forges_mobilisees: ["agents"] }, "`cause` absent"],
  ["cause blanche", { type: "rectification_forges_mobilisees", forges_mobilisees: ["agents"], cause: "  " }, "`cause` vide"],
];
for (const [schema, ouverture] of [["1.1", { type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["agents", "ops"], substrat: "x" }],
  ["absent", { type: "run_open", substrat: "ledger antérieur au schéma" }]]) {
  check(`ledger TF-1722 : schéma ${schema} — une rectification_forges_mobilisees incomplète (${RECTIF_ROUGES.map((r) => r[0]).join(", ")}) est refusée, nommée, rien n'est écrit`, () => {
    const lf = join(out, `ledger-rectif-forges-${schema}.jsonl`);
    run(ledger, ["append", lf, JSON.stringify(ouverture)]);
    const avant = readFileSync(lf, "utf8");
    for (const [nom, payload, motif] of RECTIF_ROUGES) {
      let err = null;
      try { execFileSync("node", [ledger, "append", lf, JSON.stringify(payload)], { encoding: "utf8", stdio: "pipe" }); }
      catch (e) { err = String(e.stderr || ""); }
      if (err === null) throw new Error(`rectification « ${nom} » acceptée — elle aurait dû être refusée`);
      if (!err.includes(motif) || !err.includes("TF-1722")) throw new Error(`refus de « ${nom} » sans le motif « ${motif} » : ${err.slice(0, 200)}`);
      if (readFileSync(lf, "utf8") !== avant) throw new Error(`le refus de « ${nom} » a quand même écrit dans le ledger`);
    }
    // Sens vert : la rectification complète s'écrit, et le journal reste intègre.
    run(ledger, ["append", lf, JSON.stringify(RECTIF_COMPLETE)]);
    const v = run(ledger, ["verify", lf]);
    if (!v.includes("[PASS]")) throw new Error("une rectification complète doit laisser le ledger intègre : " + v);
  });
}
// Accord avec le juge du pilot (lecture seule) : ce que `append` refuse, `rectificationsForges` le
// rend invalide ; ce qu'il accepte, le juge le retient. Pilot absent : non joué, et dit.
{
  const juge = join(process.env.FORGE_ROOT || join(here, "..", "..", "..", "..", ".."), "digit-ai-factory", "oracles", "oracle-enclenchement.mjs");
  if (!existsSync(juge)) console.log(`  [NON JOUÉ] ledger TF-1722 : accord avec oracle-enclenchement — juge du pilot introuvable (${juge})`);
  else await checkAsync("ledger TF-1722 : accord avec le juge du pilot — les rectifications refusées à l'écriture sont celles qu'oracle-enclenchement ignore", async () => {
    const { rectificationsForges } = await import(new URL(`file:///${juge.split("\\").join("/")}`).href);
    const lus = rectificationsForges([...RECTIF_ROUGES.map((r) => r[1]), RECTIF_COMPLETE].map((e, i) => ({ seq: i + 2, ...e })));
    const valides = lus.map((r) => r.valide).join(",");
    if (valides !== "false,false,false,false,true") throw new Error(`le juge rend ${valides} pour [4 rouges, 1 verte], attendu false,false,false,false,true`);
  });
}

check("ledger D-18 (a) : `schema_ledger` déclaré mais INCONNU de ce vérificateur → [NON VÉRIFIÉ], jamais mis en échec", () => {
  const lf = join(out, "ledger-schema-inconnu.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "9.9", substrat: "version future" })]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("une version inconnue ne doit PAS être mise en échec : " + v);
  if (!v.includes("[NON VÉRIFIÉ]")) throw new Error("la version inconnue doit être DITE : " + v);
  if (!v.includes("9.9")) throw new Error("la version déclarée doit être citée : " + v);
});

check("oracle-defs : graphe def→def cohérent (fixture verte) → PASS", () => {
  const j = JSON.parse(run(oracledefs, [join(fixtures, "oracle-defs", "green")]));
  if (j.verdict !== "PASS") throw new Error(`verdict ${j.verdict} attendu PASS`);
});

check("oracle-defs : lien de:/vers: brisé (fixture rouge) → FAIL localisant", () => {
  try { execFileSync("node", [oracledefs, join(fixtures, "oracle-defs", "red")], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) {
    const j = JSON.parse(String(e.stdout || ""));
    if (j.verdict !== "FAIL") throw new Error(`verdict ${j.verdict} attendu FAIL`);
    if (!j.findings.some((f) => f.where && f.where.includes("cons-b"))) throw new Error("finding localisant (cons-b) attendu");
    return;
  }
  throw new Error("aurait dû sortir FAIL (exit 1)");
});

// --- TF-0106 (1) : otlp-project.mjs — projection OTLP GenAI du ledger --------------------
check("otlp-project : ledger valide → spans OTLP conformes (traceId/spanId hex, gen_ai.* présents, hiérarchie parent/enfant)", () => {
  const outFile = join(out, "spans-verte.json");
  const stdout = run(otlpProject, [join(fixtures, "otlp", "run-verte.jsonl"), "--out", outFile]);
  if (!stdout.includes("[OK]")) throw new Error("sortie [OK] attendue");
  const doc = JSON.parse(readFileSync(outFile, "utf8"));
  const spans = doc.resourceSpans[0].scopeSpans[0].spans;
  if (spans.length !== 4) throw new Error(`4 spans attendus (1 racine + 3 entrées), ${spans.length} trouvés`);
  if (!/^[0-9a-f]{32}$/.test(spans[0].traceId)) throw new Error("traceId non conforme (32 car. hex attendus)");
  if (!/^[0-9a-f]{16}$/.test(spans[0].spanId)) throw new Error("spanId non conforme (16 car. hex attendus)");
  const agentSpan = spans.find((s) => s.name === "invoke_agent agent-a");
  if (!agentSpan) throw new Error("span d'agent « invoke_agent agent-a » attendu");
  const attrKeys = agentSpan.attributes.map((a) => a.key);
  for (const k of ["gen_ai.system", "gen_ai.operation.name", "gen_ai.agent.name"])
    if (!attrKeys.includes(k)) throw new Error(`attribut GenAI « ${k} » absent du span d'agent`);
  if (agentSpan.parentSpanId !== spans[0].spanId) throw new Error("le span d'agent doit être enfant du span racine du run");
  if (agentSpan.status.code !== 1) throw new Error(`status OK (1) attendu pour verdict "ok", trouvé ${agentSpan.status.code}`);
});

check("otlp-project : ledger non intègre (pas de run_open en tête) → refus [REFUS], aucun fichier de spans écrit", () => {
  const outFile = join(out, "spans-rouge.json");
  mustRefuse(otlpProject, [join(fixtures, "otlp", "run-rouge.jsonl"), "--out", outFile]);
  let ecrit = false;
  try { readFileSync(outFile); ecrit = true; } catch {}
  if (ecrit) throw new Error("fichier de spans écrit malgré un ledger refusé par ledger.mjs verify");
});

// Bonus (pas une preuve exigée par le contrat, cf. fixtures verte/rouge ci-dessus) : le
// ledger.jsonl racine est un vrai ledger de run passé, mais lui aussi exclu du dépôt public
// par `.gitignore` (motif `ledger*.jsonl`) — absent par construction sur un clone frais.
// SKIP motivé plutôt qu'un échec sur un fichier structurellement absent de ce checkout.
{
  const repoLedger = join(here, "..", "..", "..", "..", "ledger.jsonl");
  if (existsSync(repoLedger)) {
    check("otlp-project : ledger réel du dépôt (ledger.jsonl racine, run P3-jouet) → projection sans erreur (bonus, non exigé par le contrat)", () => {
      const outFile = join(out, "spans-reel.json");
      run(otlpProject, [repoLedger, "--out", outFile]);
      const doc = JSON.parse(readFileSync(outFile, "utf8"));
      const spans = doc.resourceSpans[0].scopeSpans[0].spans;
      if (spans.length < 5) throw new Error(`peu de spans projetés depuis un ledger réel non trivial : ${spans.length}`);
    });
  } else {
    console.log("  [SKIP] otlp-project sur ledger réel (bonus) : ledger.jsonl racine absent de ce checkout (exclu du dépôt public par .gitignore)");
  }
}

// --- TF-0106 (3) : oracle-agent-evals.mjs — régression des sorties d'agents sur fixtures --
check("oracle-agent-evals : cas vert (critères mécaniques EXISTS/CONTAINS/REGEX satisfaits) → PASS", () => {
  const j = JSON.parse(run(oracleAgentEvals, [join(fixtures, "agent-evals", "verte")]));
  if (j.verdict !== "PASS") throw new Error(`verdict ${j.verdict} attendu PASS — findings: ${JSON.stringify(j.findings)}`);
});

check("oracle-agent-evals : cas rouge (critère CONTAINS manquant) → FAIL localisant la bonne raison", () => {
  try { execFileSync("node", [oracleAgentEvals, join(fixtures, "agent-evals", "rouge-contains")], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) {
    const j = JSON.parse(String(e.stdout || ""));
    if (j.verdict !== "FAIL") throw new Error(`verdict ${j.verdict} attendu FAIL`);
    if (!j.findings.some((f) => f.msg.includes("CONTAINS") && f.msg.includes("## Structure")))
      throw new Error(`finding localisant le critère CONTAINS manquant attendu, trouvé : ${JSON.stringify(j.findings)}`);
    return;
  }
  throw new Error("aurait dû sortir FAIL (exit 1)");
});

check("oracle-agent-evals : artefact absent → FAIL sur EXISTS (jamais un faux PASS sur une sortie d'agent manquante)", () => {
  try { execFileSync("node", [oracleAgentEvals, join(fixtures, "agent-evals", "rouge-absent")], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) {
    const j = JSON.parse(String(e.stdout || ""));
    if (j.verdict !== "FAIL") throw new Error(`verdict ${j.verdict} attendu FAIL`);
    if (!j.findings.some((f) => f.msg.includes("EXISTS"))) throw new Error("finding localisant le critère EXISTS attendu");
    return;
  }
  throw new Error("aurait dû sortir FAIL (exit 1)");
});

check("oracle-agent-evals : cas.json absent ou invalide → SKIP motivé, jamais un PASS de complaisance", () => {
  try { execFileSync("node", [oracleAgentEvals, join(out, "dossier-inexistant")], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) {
    const j = JSON.parse(String(e.stdout || ""));
    if (j.verdict !== "SKIP") throw new Error(`verdict ${j.verdict} attendu SKIP`);
    return;
  }
  throw new Error("aurait dû sortir SKIP (exit 2)");
});

// ---- D-1 (a) du pilot, 25/09/2026 : un agent désigne son modèle par FAMILLE, et le ledger note la
// version SERVIE. Le fait : les 8 agents compilés de la forge ne déclaraient aucun modèle et
// héritaient de la session (Opus 5.5, effort max), et le ledger ne notait que la famille.
function ecrireDef(nom, supplement) {
  const base = readFileSync(join(fixtures, "verte-review.yaml"), "utf8").replace(/^id: .*$/m, `id: ${nom}`);
  const chemin = join(out, `${nom}.yaml`);
  writeFileSync(chemin, base.replace(/\s*$/, "\n") + (supplement ? `${supplement}\n` : ""));
  return chemin;
}
function compilerUn(nom, supplement) {
  const outM = mkdtempSync(join(tmpdir(), "fa-modele-"));
  try { run(compile, [ecrireDef(nom, supplement), "--out", outM]); return readFileSync(join(outM, `${nom}.md`), "utf8"); }
  finally { rmSync(outM, { recursive: true, force: true }); }
}
check("D-1 : `modele: haiku` compile en `model: haiku` dans le frontmatter", () => {
  if (!/^model: haiku$/m.test(compilerUn("modele-haiku", "modele: haiku"))) throw new Error("`model: haiku` absent du frontmatter");
});
check("D-1 : sans `modele`, l'agent compile sur `model: sonnet`, le défaut du routage, et le DIT — il n'hérite plus en silence de la session", () => {
  const md = compilerUn("modele-absent", "");
  if (!/^model: sonnet$/m.test(md)) throw new Error("`model: sonnet` absent du frontmatter");
  if (!md.includes("défaut du routage")) throw new Error("le défaut n'est pas dit dans le corps de l'agent");
});
check("D-1 : `modele: inherit` reste possible, par choix déclaré", () => {
  const md = compilerUn("modele-inherit", "modele: inherit");
  if (!/^model: inherit$/m.test(md) || !md.includes("celui de la session")) throw new Error("`inherit` mal compilé");
});
check("D-1 rouge : un identifiant (`claude-opus-5-5`) épinglerait une version → refus qui exige le NOM DE FAMILLE", () =>
  mustRefuse(compile, [ecrireDef("modele-identifiant", "modele: claude-opus-5-5"), "--out", out], "NOM DE FAMILLE"));

// ---- TF-1561 (D-5 (a) du 01/10/2026, sur le rejeu D-6 (a)) : l'effort se DÉCLARE par agent au lieu
// d'hériter de celui de la session (456 réponses Sonnet 5 à `max` par héritage, mesuré le 01/10).
check("TF-1561 : `effort: medium` compile en `effort: medium` dans le frontmatter", () => {
  if (!/^effort: medium$/m.test(compilerUn("effort-medium", "effort: medium"))) throw new Error("`effort: medium` absent du frontmatter");
});
check("TF-1561 : sans `effort`, un agent sonnet compile sur `effort: high`, le défaut du rejeu, et le DIT", () => {
  const md = compilerUn("effort-absent", "");
  if (!/^effort: high$/m.test(md)) throw new Error("`effort: high` absent du frontmatter");
  if (!md.includes("défaut du rejeu")) throw new Error("le défaut n'est pas dit dans le corps de l'agent");
});
check("TF-1561 : `effort: inherit`, ou `modele: inherit` sans effort, ou `haiku` sans effort → aucune ligne `effort:`, et le corps le dit", () => {
  for (const [nom, sup] of [["effort-inherit", "effort: inherit"], ["effort-modele-inherit", "modele: inherit"], ["effort-haiku", "modele: haiku"]]) {
    const md = compilerUn(nom, sup);
    if (/^effort:/m.test(md)) throw new Error(`${nom} : une ligne effort a été compilée`);
    if (!/Effort : celui de la session/.test(md)) throw new Error(`${nom} : l'héritage n'est pas dit`);
  }
});
check("TF-1561 rouge : un effort hors des niveaux de Claude Code (`maximal`) → refus qui nomme les niveaux admis", () =>
  mustRefuse(compile, [ecrireDef("effort-inconnu", "effort: maximal"), "--out", out], "niveaux admis"));

const SID = "00000000-aaaa-bbbb-cccc-000000000001";
function racineTranscripts(principal, sousAgent) {
  const racine = mkdtempSync(join(tmpdir(), "fa-transcripts-"));
  const projet = join(racine, "projects", "projet-essai");
  mkdirSync(join(projet, SID, "subagents"), { recursive: true });
  const ligne = (m) => JSON.stringify({ parentUuid: "p", message: { model: m, role: "assistant", content: [] }, type: "assistant" });
  if (principal) writeFileSync(join(projet, `${SID}.jsonl`), principal.map(ligne).join("\n") + "\n");
  if (sousAgent) writeFileSync(join(projet, SID, "subagents", "agent-essai.jsonl"), sousAgent.map(ligne).join("\n") + "\n");
  return racine;
}
function appendAvec(lf, obj, env) {
  return execFileSync(process.execPath, [ledger, "append", lf, JSON.stringify(obj)], { encoding: "utf8", env: { ...process.env, ...env } });
}
const OUVERTURE_D1 = { type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["digit-ai-forge-agents"] };
check("D-1 : `append` relève `modele_version` dans le transcript de la session — sous-agent sonnet, fil principal opus [1m]", () => {
  const racine = racineTranscripts(["claude-opus-5-5[1m]"], ["claude-sonnet-5"]);
  const lf = join(out, "ledger-version.jsonl");
  const env = { FORGE_TRANSCRIPTS_RACINE: racine, CLAUDE_CODE_SESSION_ID: SID };
  try {
    appendAvec(lf, OUVERTURE_D1, env);
    const sortie = appendAvec(lf, { type: "invocation", forge: "agents", modele: "sonnet" }, env);
    appendAvec(lf, { type: "invocation", forge: "agents", modele: "opus" }, env);
    const e = readFileSync(lf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (e[1].modele_version !== "claude-sonnet-5") throw new Error(`sonnet : ${e[1].modele_version} au lieu de claude-sonnet-5`);
    if (e[2].modele_version !== "claude-opus-5-5") throw new Error(`opus : ${e[2].modele_version} au lieu de claude-opus-5-5`);
    if (!sortie.includes("[VERSION]")) throw new Error("le relevé n'est pas annoncé");
    run(ledger, ["verify", lf]);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});
check("D-1 : sans transcript de la famille, l'entrée est écrite SANS version et c'est dit `[NON VÉRIFIÉ]` — jamais refusée", () => {
  const racine = racineTranscripts(["claude-opus-5-5"], null);
  const lf = join(out, "ledger-sans-version.jsonl");
  const env = { FORGE_TRANSCRIPTS_RACINE: racine, CLAUDE_CODE_SESSION_ID: SID };
  try {
    appendAvec(lf, OUVERTURE_D1, env);
    const sortie = appendAvec(lf, { type: "invocation", forge: "agents", modele: "haiku" }, env);
    const e = readFileSync(lf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if ("modele_version" in e[1]) throw new Error("une version a été inventée");
    if (!sortie.includes("[NON VÉRIFIÉ] modele_version")) throw new Error("l'absence n'est pas dite");
  } finally { rmSync(racine, { recursive: true, force: true }); }
});
check("D-1 : une version déjà fournie par le payload est gardée telle quelle, et la forme imbriquée `invocation.modele` est complétée", () => {
  const racine = racineTranscripts(null, ["claude-sonnet-5"]);
  const lf = join(out, "ledger-version-fournie.jsonl");
  const env = { FORGE_TRANSCRIPTS_RACINE: racine, CLAUDE_CODE_SESSION_ID: SID };
  try {
    appendAvec(lf, OUVERTURE_D1, env);
    appendAvec(lf, { type: "invocation", modele: "opus", modele_version: "claude-opus-5" }, env);
    appendAvec(lf, { type: "invocation", invocation: { forge: "agents", modele: "sonnet" } }, env);
    const e = readFileSync(lf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (e[1].modele_version !== "claude-opus-5") throw new Error("la version fournie a été réécrite");
    if (e[2].invocation.modele_version !== "claude-sonnet-5") throw new Error("la forme imbriquée n'est pas complétée");
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

// ---- TF-1319, décision humaine D-5 (b) du 17/10/2026 : `consigner` écrit UNE entrée oracles_verdict
// PAR oracle depuis le rapport d'un lanceur. Sens vert : les trois formes de rapport du parc, la
// commande lancée sans shell, l'UTF-16 de PowerShell 5.1. Sens rouge : un lot fautif n'écrit RIEN,
// un ledger absent ne fait rien lancer, une source manquante ou doublée est refusée.
function ledgerOuvert(nom) {
  const lf = join(out, nom);
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["conception"] })]);
  return lf;
}
const lignesDe = (lf) => readFileSync(lf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const RAPPORT_LANCEUR = {
  runner: "run-oracles-conception", cible: "EXIGENCES.json", verdict: "FAIL",
  oracles: [
    { oracle: "oracle-exigences", verdict: "PASS", exit: 0, resume: "aucune règle en échec" },
    { oracle: "oracle-ears", verdict: "FAIL", exit: 1, resume: "E2 en échec" },
    { oracle: "oracle-tracabilite", verdict: "NON_JUGE", exit: 2, resume: "cascade absente" },
  ],
};
check("consigner (vert) : un rapport de lanceur à 3 oracles → 3 entrées oracles_verdict, une par oracle, même lot, verify PASS", () => {
  const lf = ledgerOuvert("ledger-consigner-vert.jsonl");
  const rp = join(out, "rapport-lanceur.json");
  writeFileSync(rp, JSON.stringify(RAPPORT_LANCEUR), "utf8");
  const sortie = run(ledger, ["consigner", lf, "--rapport", rp, "--forge", "conception"]);
  if (!sortie.includes("3 entrée(s) oracles_verdict ajoutée(s)")) throw new Error(`écho inattendu : ${sortie.slice(0, 160)}`);
  const e = lignesDe(lf).slice(1);
  if (e.length !== 3) throw new Error(`3 entrées attendues, ${e.length} écrites`);
  if (e.map((x) => x.oracle).join() !== "oracle-exigences,oracle-ears,oracle-tracabilite") throw new Error("noms d'oracles ou ordre perdus");
  if (e.map((x) => x.seq).join() !== "2,3,4") throw new Error(`seq ${e.map((x) => x.seq).join()} au lieu de 2,3,4`);
  if (!e.every((x) => x.type === "oracles_verdict" && x.consigne_par === "ledger.mjs consigner" && x.lanceur === "run-oracles-conception"
    && x.cible === "EXIGENCES.json" && x.forge === "conception")) throw new Error("champs communs du lot manquants");
  if (new Set(e.map((x) => x.lot.id)).size !== 1 || e.map((x) => `${x.lot.rang}/${x.lot.total}`).join() !== "1/3,2/3,3/3") throw new Error("lot mal numéroté");
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("verify aurait dû passer");
});
check("consigner (vert) : un verdict écrit autrement par un lanceur (NON_JUGE) devient SKIP, l'original GARDÉ en verdict_brut", () => {
  const e = lignesDe(join(out, "ledger-consigner-vert.jsonl"));
  const t = e.find((x) => x.oracle === "oracle-tracabilite");
  if (t.verdict !== "SKIP" || t.verdict_brut !== "NON_JUGE") throw new Error(`verdict ${t.verdict}, brut ${t.verdict_brut}`);
  const p = e.find((x) => x.oracle === "oracle-exigences");
  if ("verdict_brut" in p) throw new Error("verdict_brut posé sur un verdict déjà canonique");
});
check("consigner (vert) : la forme d'UN oracle ({oracle, verdict}) et une LISTE sont consignées ; un rapport UTF-16 à BOM (`>` de PowerShell 5.1) se lit", () => {
  const lf = ledgerOuvert("ledger-consigner-formes.jsonl");
  const r1 = join(out, "rapport-oracle.json");
  writeFileSync(r1, JSON.stringify({ oracle: "oracle-enclenchement", verdict: "FAIL", findings: [{}, {}] }), "utf8");
  run(ledger, ["consigner", lf, "--rapport", r1]);
  const r2 = join(out, "rapport-liste-utf16.json");
  writeFileSync(r2, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify([{ oracle: "oracle-é", verdict: "pass" }, { oracle: "oracle-b", verdict: "SANS OBJET" }]), "utf16le")]));
  run(ledger, ["consigner", lf, "--rapport", r2, "--cible", "page.html"]);
  const e = lignesDe(lf).slice(1);
  if (e.length !== 3) throw new Error(`3 entrées attendues, ${e.length}`);
  if (e[0].oracle !== "oracle-enclenchement" || e[0].verdict !== "FAIL" || e[0].constats !== 2) throw new Error("forme d'un oracle mal lue");
  if (e[1].oracle !== "oracle-é" || e[1].verdict !== "PASS" || e[1].cible !== "page.html") throw new Error(`UTF-16 mal lu : ${JSON.stringify(e[1])}`);
  if (e[2].verdict !== "NA" || e[2].verdict_brut !== "SANS OBJET") throw new Error("SANS OBJET non ramené à NA");
});
check("consigner (vert) : `-- <commande>` lance le lanceur SANS shell, consigne sa sortie et rend son code (exit_commande), sortie 0", () => {
  const lf = ledgerOuvert("ledger-consigner-commande.jsonl");
  const lanceur = join(out, "faux-lanceur.mjs");
  writeFileSync(lanceur, `process.stderr.write("progression\\n");\nconsole.log(JSON.stringify(${JSON.stringify(RAPPORT_LANCEUR)}));\nprocess.exit(1);\n`, "utf8");
  const sortie = run(ledger, ["consigner", lf, "--", "node", lanceur]);
  if (!sortie.includes("la commande a rendu exit 1")) throw new Error("le code du lanceur n'est pas rendu");
  const e = lignesDe(lf).slice(1);
  if (e.length !== 3 || !e.every((x) => x.exit_commande === 1 && x.commande.includes("faux-lanceur.mjs"))) throw new Error("commande ou code non portés par chaque entrée");
});
check("consigner (rouge) : un élément sans nom ET un verdict inconnu → lot REFUSÉ, chacun nommé, le ledger inchangé à l'octet", () => {
  const lf = ledgerOuvert("ledger-consigner-rouge.jsonl");
  const avant = readFileSync(lf, "utf8");
  const rp = join(out, "rapport-fautif.json");
  writeFileSync(rp, JSON.stringify({ oracles: [{ oracle: "oracle-a", verdict: "PASS" }, { verdict: "FAIL" }, { oracle: "oracle-c", verdict: "BOF" }] }), "utf8");
  try { execFileSync("node", [ledger, "consigner", lf, "--rapport", rp], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) {
    const err = String(e.stderr || "");
    if (!err.includes("AUCUNE entrée écrite") || !err.includes("élément 2/3") || !err.includes("« BOF » inconnu")) throw new Error(`refus mal nommé : ${err.slice(0, 200)}`);
    if (readFileSync(lf, "utf8") !== avant) throw new Error("écriture partielle : oracle-a a été écrit malgré le refus du lot");
    return;
  }
  throw new Error("aurait dû refuser le lot, l'a accepté");
});
check("consigner (rouge) : un rapport vide (`oracles: []`) ou non JSON est refusé — rien n'a tourné, rien ne s'écrit", () => {
  const lf = ledgerOuvert("ledger-consigner-vide.jsonl");
  const avant = readFileSync(lf, "utf8");
  const vide = join(out, "rapport-vide.json");
  writeFileSync(vide, JSON.stringify({ runner: "x", oracles: [] }), "utf8");
  const texte = join(out, "rapport-texte.txt");
  writeFileSync(texte, "PASS — tout va bien\n", "utf8");
  for (const [rp, motif] of [[vide, "AUCUN verdict"], [texte, "rapport non JSON"]]) {
    let refuse = false;
    try { execFileSync("node", [ledger, "consigner", lf, "--rapport", rp], { encoding: "utf8", stdio: "pipe" }); }
    catch (e) { refuse = String(e.stderr || "").includes(motif); }
    if (!refuse) throw new Error(`refus « ${motif} » attendu`);
  }
  if (readFileSync(lf, "utf8") !== avant) throw new Error("le ledger a changé");
});
check("consigner (rouge) : ledger absent → refus AVANT de lancer la commande (le lanceur ne tourne pas, aucun fichier créé)", () => {
  const lf = join(out, "ledger-consigner-absent.jsonl");
  const temoin = join(out, "temoin-lance.txt");
  const lanceur = join(out, "lanceur-temoin.mjs");
  writeFileSync(lanceur, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(temoin)}, "lancé");\nconsole.log(JSON.stringify({ oracle: "x", verdict: "PASS" }));\n`, "utf8");
  let refuse = false;
  try { execFileSync("node", [ledger, "consigner", lf, "--", "node", lanceur], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { refuse = String(e.stderr || "").includes("run OUVERT"); }
  if (!refuse) throw new Error("refus « run OUVERT » attendu");
  if (existsSync(lf)) throw new Error("un ledger a été créé");
  if (existsSync(temoin)) throw new Error("le lanceur a tourné alors que son relevé ne pouvait aller nulle part");
});
check("consigner (rouge) : aucune source, deux sources, ou un argument inconnu → refusé et NOMMÉ", () => {
  const lf = ledgerOuvert("ledger-consigner-args.jsonl");
  const rp = join(out, "rapport-lanceur.json");
  for (const [args, motif] of [
    [[], "une source de verdicts, et une seule"],
    [["--rapport", rp, "--", "node", "-e", "1"], "une source de verdicts, et une seule"],
    [["--rapport", rp, "--bavard"], "`--bavard`"],
    [["--rapport"], "`--rapport` sans valeur"],
  ]) {
    let err = "";
    try { execFileSync("node", [ledger, "consigner", lf, ...args], { encoding: "utf8", stdio: "pipe" }); }
    catch (e) { err = String(e.stderr || ""); }
    if (!err.includes(motif)) throw new Error(`args ${JSON.stringify(args)} : refus « ${motif} » attendu, reçu « ${err.slice(0, 120)} »`);
  }
  if (lignesDe(lf).length !== 1) throw new Error("une entrée a été écrite malgré un refus d'arguments");
});

// ---- TF-2153 (05/11/2026) : le rapport --json de forge-tests a la forme `adaptateurs[{nom, pan, verdict}]`
// (forge_tests/noyau.py, clé « adaptateurs » du dict rendu par `rapport`) ; `consigner` la refusait
// (« forme de rapport non reconnue »), constaté sur un rapport réel par l'agent de TF-2124 le 04/11/2026.
const RAPPORT_FORGE_TESTS = {
  adaptateurs: [
    { nom: "api", pan: "api", verdict: "PASS" },
    { nom: "personas", pan: "parcours-personas", verdict: "FAIL" },
    { nom: "migrations", pan: "migrations", verdict: "NA" },
  ],
  couverture_par_pan: {}, pans_non_couverts: [], findings: [{ pan: "parcours-personas" }], verdict: "FAIL",
};
check("consigner (vert TF-2153) : le rapport --json de forge-tests (`adaptateurs[{nom, pan, verdict}]`) → une entrée par pan, oracle `forge-tests:<pan>`, verify PASS", () => {
  const lf = ledgerOuvert("ledger-consigner-forge-tests.jsonl");
  const rp = join(out, "rapport-forge-tests.json");
  writeFileSync(rp, JSON.stringify(RAPPORT_FORGE_TESTS), "utf8");
  const sortie = run(ledger, ["consigner", lf, "--rapport", rp, "--forge", "tests", "--cible", "C:/produit"]);
  if (!sortie.includes("3 entrée(s) oracles_verdict ajoutée(s)")) throw new Error(`écho inattendu : ${sortie.slice(0, 160)}`);
  const e = lignesDe(lf).slice(1);
  if (e.map((x) => `${x.oracle}=${x.verdict}`).join() !== "forge-tests:api=PASS,forge-tests:parcours-personas=FAIL,forge-tests:migrations=NA")
    throw new Error(`oracle/verdict par pan : ${e.map((x) => `${x.oracle}=${x.verdict}`).join()}`);
  if (!e.every((x) => x.type === "oracles_verdict" && x.consigne_par === "ledger.mjs consigner" && x.lanceur === "forge-tests" && x.cible === "C:/produit" && x.forge === "tests"))
    throw new Error("champs communs du lot manquants");
  if (e.map((x) => x.adaptateur).join() !== "api,personas,migrations") throw new Error("le nom de l'adaptateur n'est pas gardé");
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("verify aurait dû passer");
});
check("consigner (rouge TF-2153) : un pan absent et un verdict inconnu dans `adaptateurs` → lot REFUSÉ, chacun nommé, ledger inchangé ; `adaptateurs: []` refusé", () => {
  const lf = ledgerOuvert("ledger-consigner-forge-tests-rouge.jsonl");
  const avant = readFileSync(lf, "utf8");
  const rp = join(out, "rapport-forge-tests-fautif.json");
  writeFileSync(rp, JSON.stringify({ adaptateurs: [{ nom: "api", pan: "api", verdict: "PASS" }, { nom: "x", verdict: "PASS" }, { nom: "c", pan: "back", verdict: "BOF" }] }), "utf8");
  const vide = join(out, "rapport-forge-tests-vide.json");
  writeFileSync(vide, JSON.stringify({ adaptateurs: [], verdict: "PARTIEL" }), "utf8");
  for (const [fichier, motifs] of [[rp, ["AUCUNE entrée écrite", "élément 2/3", "`pan` absent", "« BOF » inconnu"]], [vide, ["AUCUN verdict"]]]) {
    let err = null;
    try { execFileSync("node", [ledger, "consigner", lf, "--rapport", fichier], { encoding: "utf8", stdio: "pipe" }); }
    catch (e) { err = String(e.stderr || ""); }
    if (err === null) throw new Error(`le rapport ${fichier} aurait dû être refusé`);
    for (const m of motifs) if (!err.includes(m)) throw new Error(`refus sans « ${m} » : ${err.slice(0, 240)}`);
  }
  if (readFileSync(lf, "utf8") !== avant) throw new Error("écriture partielle malgré le refus");
});

// ---- TF-2152 (05/11/2026) : un run_close « prêt » joue R-61 bis (oracle-conformite-projet du pilot,
// `--declarer-pret`) AVANT d'être écrit, et `append` refuse sur FAIL. Le jour se fixe pour la recette par
// LEDGER_AUJOURDHUI (l'option --aujourd-hui de l'oracle) : avertissement jusqu'au 18/11/2026, FAIL dès le 19.
// Pilot absent de ce poste : non joué, et dit.
{
  const juge = join(process.env.FORGE_ROOT || join(here, "..", "..", "..", "..", ".."), "digit-ai-factory", "oracles", "oracle-conformite-projet.mjs");
  if (!existsSync(juge)) console.log(`  [NON JOUÉ] ledger TF-2152 : R-61 bis — oracle-conformite-projet du pilot introuvable (${juge})`);
  else {
    const produit = (nom) => {
      const racine = mkdtempSync(join(out, `produit-${nom}-`));
      mkdirSync(join(racine, "forge"));
      const lf = join(racine, "forge", "ledger.jsonl");
      run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["agents"], substrat: "essai TF-2152" })]);
      return lf;
    };
    const avec = (jour, extra = {}) => ({ ...process.env, FORGE_ORACLE_CONFORMITE_PROJET: juge, ...(jour ? { LEDGER_AUJOURDHUI: jour } : {}), ...extra });
    const ecrire = (lf, payload, env) => {
      try { return { code: 0, sortie: execFileSync("node", [ledger, "append", lf, JSON.stringify(payload)], { encoding: "utf8", stdio: "pipe", env }), err: "" }; }
      catch (e) { return { code: e.status, sortie: String(e.stdout || ""), err: String(e.stderr || "") }; }
    };
    const CLOTURE_PRETE = { type: "run_close", statut: "pret_client", resume: "run clos prêt, essai TF-2152" };
    const VERDICTS_USAGE = [
      { type: "oracles_verdict", oracle: "forge-tests:parcours-personas", verdict: "PASS" },
      { type: "oracles_verdict", oracle: "oracle-exploitabilite", verdict: "PASS" },
    ];

    check("ledger TF-2152 (rouge) : un run_close pret_* sans les deux contrôles d'usage, à partir du 19/11/2026 → REFUSÉ par R-61 bis, nommé, ledger inchangé", () => {
      const lf = produit("rouge");
      const avant = readFileSync(lf, "utf8");
      const r = ecrire(lf, CLOTURE_PRETE, avec("2026-11-20"));
      if (r.code === 0) throw new Error("le run_close prêt a été écrit alors que R-61 bis est en échec");
      for (const m of ["R-61 bis", "TF-2152", "parcours-personas", "oracle-exploitabilite", "Aucune écriture"])
        if (!r.err.includes(m)) throw new Error(`refus sans « ${m} » : ${r.err.slice(0, 300)}`);
      if (readFileSync(lf, "utf8") !== avant) throw new Error("le refus a quand même écrit dans le ledger");
      // `en_production` se juge comme `pret_*`
      if (ecrire(lf, { type: "run_close", statut: "en_production", resume: "x" }, avec("2026-11-20")).code === 0) throw new Error("en_production aurait dû être refusé aussi");
    });
    check("ledger TF-2152 (vert) : les deux contrôles consignés PASS au ledger du run → le run_close prêt s'écrit, journal intègre ; le geste que le refus propose est joué", () => {
      const lf = produit("vert");
      const rp = join(out, "rapport-usage-r61.json");
      writeFileSync(rp, JSON.stringify(VERDICTS_USAGE), "utf8");
      run(ledger, ["consigner", lf, "--rapport", rp]);
      const r = ecrire(lf, CLOTURE_PRETE, avec("2026-11-20"));
      if (r.code !== 0) throw new Error(`le run_close aurait dû s'écrire : ${r.err.slice(0, 300)}`);
      if (!lignesDe(lf).some((x) => x.type === "run_close" && x.statut === "pret_client")) throw new Error("run_close absent du ledger");
      if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("verify aurait dû passer");
    });
    check("ledger TF-2152 : avant le 19/11/2026 R-61 bis AVERTIT (écrit, `[ATTENTION]` dit le manque) ; un statut non prêt n'appelle pas l'oracle", () => {
      const lf = produit("avertissement");
      const r = ecrire(lf, CLOTURE_PRETE, avec("2026-11-10"));
      if (r.code !== 0) throw new Error(`l'avertissement ne doit pas refuser : ${r.err.slice(0, 200)}`);
      if (!r.sortie.includes("[ATTENTION]") || !r.sortie.includes("R-61 bis") || !r.sortie.includes("AVERTISSEMENT")) throw new Error(`avertissement non dit : ${r.sortie.slice(0, 300)}`);
      const lf2 = produit("non-pret");
      // Oracle désigné inexistant : s'il était consulté pour un statut non prêt, la sortie le dirait.
      const r2 = ecrire(lf2, { type: "run_close", statut: "abandonne", resume: "run abandonné" }, avec("2026-11-20", { FORGE_ORACLE_CONFORMITE_PROJET: join(out, "n-existe-pas.mjs") }));
      if (r2.code !== 0 || r2.sortie.includes("R-61 bis")) throw new Error(`un statut non prêt ne se juge pas : ${r2.err.slice(0, 200)}${r2.sortie.slice(0, 200)}`);
    });
    check("ledger TF-2152 : oracle introuvable, ou ledger hors d'un dossier forge/ → écrit mais `[NON VÉRIFIÉ]` le dit, jamais un vert muet", () => {
      const lf = produit("sans-oracle");
      const r = ecrire(lf, CLOTURE_PRETE, avec("2026-11-20", { FORGE_ORACLE_CONFORMITE_PROJET: join(out, "n-existe-pas.mjs") }));
      if (r.code !== 0 || !r.sortie.includes("[NON VÉRIFIÉ]") || !r.sortie.includes("introuvable")) throw new Error(`oracle absent non dit : ${r.err.slice(0, 200)}${r.sortie.slice(0, 200)}`);
      const nu = join(out, "ledger-hors-forge.jsonl");
      run(ledger, ["append", nu, JSON.stringify({ type: "run_open", substrat: "hors forge/" })]);
      const r2 = ecrire(nu, CLOTURE_PRETE, avec("2026-11-20"));
      if (r2.code !== 0 || !r2.sortie.includes("[NON VÉRIFIÉ]") || !r2.sortie.includes("forge")) throw new Error(`ledger hors forge/ non dit : ${r2.err.slice(0, 200)}${r2.sortie.slice(0, 200)}`);
    });
  }
}

// ---- TF-2163 (05/11/2026) : le rétablissement des pseudonymes se fait par MOTIF, pas par chaîne exacte.
// Le fait (Produit-86, RA-2) : le modèle a ôté les crochets de `[Client-A]` ; 3 propositions sur 3 sont
// restées sur leur pseudonyme et ont été refusées « hors périmètre ». Sens rouge : la chaîne exacte
// (l'ancien rétablissement) laisse le pseudonyme nu. Sens vert : le motif le rétablit. Gardes : une
// borne, la casse, un crochet d'une autre phrase, un `$` de la valeur réelle, un pseudonyme orphelin.
{
  const { retablirPseudonymes } = await import(new URL(`file:///${join(here, "retablir-pseudonymes.mjs").split("\\").join("/")}`).href);
  const TABLE = { "Client-A": "Société Exemple", "Client-AB": "Autre & Cie", "Produit-12": "Outil $& interne" };
  const parExacte = (texte) => Object.entries(TABLE).reduce((t, [p, v]) => t.split(`[${p}]`).join(v), texte);
  check("pseudonymes TF-2163 (rouge) : la chaîne exacte `[Client-A]` laisse le pseudonyme nu quand le modèle a ôté les crochets", () => {
    const repondu = "Je propose de relancer Client-A sur le Produit-12.";
    if (parExacte(repondu) !== repondu) throw new Error("la chaîne exacte aurait dû ne rien rétablir : le sens rouge ne prouve plus rien");
    const r = retablirPseudonymes(repondu, TABLE);
    if (r.texte !== "Je propose de relancer Société Exemple sur le Outil $& interne.") throw new Error(`motif : ${r.texte}`);
    if (r.retablis.length !== 2 || r.retablis.some((x) => x.sansCrochets !== 1)) throw new Error(`comptes : ${JSON.stringify(r.retablis)}`);
  });
  check("pseudonymes TF-2163 (vert) : avec crochets, crochets doubles, espaces, ouvrant ou fermant perdu, séparateur changé → rétabli, sans crochet résiduel", () => {
    const cas = [
      ["[Client-A] a signé", "Société Exemple a signé"],
      ["[[Client-A]] a signé", "Société Exemple a signé"],
      ["[ Client-A ] a signé", "Société Exemple a signé"],
      ["[Client-A a signé", "Société Exemple a signé"],
      ["Client-A] a signé", "Société Exemple a signé"],
      ["Client A a signé, puis Client_A", "Société Exemple a signé, puis Société Exemple"],
      ["Client-A, Client-A.", "Société Exemple, Société Exemple."],
    ];
    for (const [entree, attendu] of cas) {
      const r = retablirPseudonymes(entree, TABLE).texte;
      if (r !== attendu) throw new Error(`« ${entree} » → « ${r} », attendu « ${attendu} »`);
    }
  });
  check("pseudonymes TF-2163 (gardes) : borne (Client-AB ≠ Client-A), casse, crochet d'une autre phrase gardé, `$` littéral, sans table → texte inchangé", () => {
    const g = (t) => retablirPseudonymes(t, TABLE).texte;
    if (g("Client-AB et Client-A") !== "Autre & Cie et Société Exemple") throw new Error(`borne : ${g("Client-AB et Client-A")}`);
    if (g("Client-A2 reste") !== "Client-A2 reste") throw new Error("Client-A2 ne doit pas devenir Client-A suivi de 2");
    if (g("le client a signé") !== "le client a signé") throw new Error("la casse doit protéger le français ordinaire");
    if (g("[voir Client-A] puis fin") !== "[voir Société Exemple] puis fin") throw new Error(`crochet d'une autre phrase : ${g("[voir Client-A] puis fin")}`);
    if (g("Client-A-bis") !== "Client-A-bis") throw new Error("Client-A-bis est un autre mot");
    if (retablirPseudonymes("Client-A", {}).texte !== "Client-A") throw new Error("table vide : texte inchangé");
  });
  check("pseudonymes TF-2163 : un pseudonyme de la forme de la table mais absent d'elle (Client-Z) est RENDU dans `inconnus`, et la CLI sort 1", () => {
    const r = retablirPseudonymes("Client-A puis [Client-Z] et Produit-99", TABLE);
    if (r.inconnus.join("|") !== "Client-Z|Produit-99") throw new Error(`inconnus : ${JSON.stringify(r.inconnus)}`);
    if (!r.texte.startsWith("Société Exemple puis")) throw new Error("le connu doit être rétabli malgré l'orphelin");
    const tf = join(out, "table-pseudo.json"), rf = join(out, "reponse-pseudo.txt");
    writeFileSync(tf, JSON.stringify(TABLE), "utf8");
    writeFileSync(rf, "Client-A puis Client-Z", "utf8");
    let code = 0;
    try { execFileSync("node", [join(here, "retablir-pseudonymes.mjs"), "--table", tf, "--fichier", rf], { encoding: "utf8", stdio: "pipe" }); }
    catch (e) { code = e.status; }
    if (code !== 1) throw new Error(`exit ${code} attendu 1 sur un orphelin`);
    writeFileSync(rf, "Client-A seul", "utf8");
    if (!JSON.parse(run(join(here, "retablir-pseudonymes.mjs"), ["--table", tf, "--fichier", rf])).texte.startsWith("Société Exemple")) throw new Error("CLI : texte non rétabli");
  });
}

check("qualification_enclenchement (vert) : `fonde` ou `a_tort` avec sa cause → écrite", () => {
  const lf = ledgerOuvert("ledger-qualification-vert.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "qualification_enclenchement", qualification: "a_tort", cause: "forge mobilisée pour son journal, pas pour ses oracles" })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "qualification_enclenchement", qualification: "fonde", cause: "oracle-ears n'a pas tourné" })]);
  if (lignesDe(lf).length !== 3) throw new Error("les deux qualifications auraient dû être écrites");
});
check("qualification_enclenchement (rouge) : valeur inconnue, ou cause absente → refusée à l'écriture, quel que soit le schéma", () => {
  const lf = join(out, "ledger-qualification-rouge.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "sans schéma" })]);
  for (const [payload, motif] of [
    [{ type: "qualification_enclenchement", qualification: "peut-être", cause: "x" }, "`fonde` ou `a_tort`"],
    [{ type: "qualification_enclenchement", qualification: "a_tort" }, "`cause` absent"],
  ]) {
    let err = "";
    try { execFileSync("node", [ledger, "append", lf, JSON.stringify(payload)], { encoding: "utf8", stdio: "pipe" }); }
    catch (e) { err = String(e.stderr || ""); }
    if (!err.includes(motif) || !err.includes("TF-1319")) throw new Error(`refus « ${motif} » attendu, reçu « ${err.slice(0, 160)} »`);
  }
  if (lignesDe(lf).length !== 1) throw new Error("une qualification invalide a été écrite");
});

// ============================================================================================
// TF-1841 du pilot (17/10/2026) — `parties_mobilisees`, facultatif, borne la promesse d'une
// forge-outil au juge de l'enclenchement. Présent et mal formé : refusé à l'écriture, quel que soit
// le schéma. Sur le code d'avant, les quatre rouges s'écrivaient (champ libre), et le juge les
// aurait ignorés en gardant la promesse entière.
// ============================================================================================
check("parties_mobilisees (rouge TF-1841) : objet vide, tableau, liste vide, élément vide → refusé à l'écriture, nommé, rien n'est écrit", () => {
  for (const [schema, extra] of [["1.1", { schema_ledger: "1.1", forges_mobilisees: ["agents"] }], ["absent", {}]]) {
    for (const [nom, parties] of [["objet vide", {}], ["tableau", ["forge-agents"]], ["liste vide", { agents: [] }], ["élément vide", { agents: ["forge-agents", " "] }]]) {
      const lf = join(out, `ledger-parties-${schema}-${nom.replace(/\W+/g, "-")}.jsonl`);
      let err = null;
      try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "run_open", substrat: "x", ...extra, parties_mobilisees: parties })], { encoding: "utf8", stdio: "pipe" }); }
      catch (e) { err = String(e.stderr || ""); }
      if (err === null) throw new Error(`schéma ${schema}, « ${nom} » accepté — il aurait dû être refusé`);
      if (!err.includes("parties_mobilisees") || !err.includes("TF-1841")) throw new Error(`refus de « ${nom} » sans le champ ni TF-1841 : ${err.slice(0, 200)}`);
      if (existsSync(lf) && readFileSync(lf, "utf8").trim()) throw new Error(`le refus de « ${nom} » a quand même écrit`);
    }
  }
  // Même garde sur une rectification, qui porte la déclaration ENTIÈRE.
  const lf = join(out, "ledger-parties-rectif.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["agents"], substrat: "x" })]);
  let err = null;
  try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "rectification_forges_mobilisees", forges_mobilisees: ["agents"], cause: "x", parties_mobilisees: { agents: [] } })], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { err = String(e.stderr || ""); }
  if (err === null || !err.includes("TF-1841")) throw new Error("une rectification aux parties mal formées doit être refusée");
});
check("parties_mobilisees (vert TF-1841) : bien formé sur run_open et rectification → écrit, journal intègre ; absent → rien n'est exigé", () => {
  const lf = join(out, "ledger-parties-vert.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["agents", "design"], parties_mobilisees: { agents: ["forge-agents"] }, substrat: "x" })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "rectification_forges_mobilisees", forges_mobilisees: ["agents"], parties_mobilisees: { "digit-ai-forge-agents": ["forge-agents", "quality-oracles"] }, cause: "design déclarée à tort" })]);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("des parties bien formées doivent laisser le journal intègre : " + v);
  const lfSans = join(out, "ledger-parties-absent.jsonl");
  run(ledger, ["append", lfSans, JSON.stringify({ type: "run_open", schema_ledger: "1.1", forges_mobilisees: ["agents"], substrat: "x" })]);
  if (lignesDe(lfSans).length !== 1) throw new Error("un run_open sans parties doit rester accepté (compatibilité)");
});
// Accord avec le juge du pilot (lecture seule) : ce que `append` accepte, le juge le lit sans
// invalide ; ce qu'il refuse, le juge le rend invalide. Pilot absent : non joué, et dit.
{
  const juge = join(process.env.FORGE_ROOT || join(here, "..", "..", "..", "..", ".."), "digit-ai-factory", "oracles", "oracle-enclenchement.mjs");
  if (!existsSync(juge)) console.log(`  [NON JOUÉ] parties_mobilisees TF-1841 : accord avec oracle-enclenchement — juge du pilot introuvable (${juge})`);
  else await checkAsync("parties_mobilisees TF-1841 : accord avec le juge du pilot — formes refusées à l'écriture = formes que `partiesDeclarees` rend invalides", async () => {
    const m = await import(new URL(`file:///${juge.split("\\").join("/")}`).href);
    if (typeof m.partiesDeclarees !== "function") throw new Error("le juge du pilot n'expose pas `partiesDeclarees` (TF-1841 non livré au pilot ?)");
    for (const p of [["forge-agents"], { agents: [] }, { agents: ["forge-agents", " "] }]) {
      if (!m.partiesDeclarees(p).invalides.length) throw new Error(`le juge lit comme valide ce que append refuse : ${JSON.stringify(p)}`);
    }
    const ok = m.partiesDeclarees({ agents: ["forge-agents"] });
    if (ok.invalides.length || ok.parties["digit-ai-forge-agents"]?.join() !== "forge-agents") throw new Error(`le juge ne lit pas ce que append accepte : ${JSON.stringify(ok)}`);
  });
}

// --- TF-2245 (06/11/2026) : ledger.mjs reprend le vocabulaire des types du CONTRAT-INTERFACE §3, les
// contrôles de `remplace` / `artefacts_remplaces` et le journal hors run de `gabarits/ledger.py` du pilot.
// Le fait : les deux écrivains du même ledger divergeaient — ledger.mjs acceptait tout type et ne contrôlait pas ces
// champs ; ledger.py refusait. Un écrivain refuse (exit 1, aucune écriture), l'autre doit refuser le même cas.
const refuse = (lf, payload, nom = "append") => {
  const avant = existsSync(lf) ? readFileSync(lf, "utf8") : null;
  try { execFileSync("node", [ledger, nom, lf, JSON.stringify(payload)], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) {
    if (!e.status) throw e;
    const apres = existsSync(lf) ? readFileSync(lf, "utf8") : null;
    if (apres !== avant) throw new Error("le fichier a changé malgré le refus — un refus est sans écriture");
    return String(e.stderr || "");
  }
  throw new Error(`aurait dû refuser ${JSON.stringify(payload).slice(0, 120)}`);
};
const TYPES_ATTENDUS = ["run_open", "etape_open", "invocation", "oracles_verdict", "escalade_modele", "question_humain",
  "reponse_humain", "etape_close", "retour", "relais_arme", "run_close", "rectification_versions_forges",
  "rectification_run_open", "rectification_horodatage", "rectification_forges_mobilisees", "go_publication",
  "conflit_regles", "demande_emise", "demande_recue", "deplacement_effectue", "deplacement_en_attente",
  "demande_humain", "qualification_enclenchement", "anteriorite_ledger", "rectification_doublon", "decision_retiree", "secret_range"];
check("ledger TF-2245 (rouge/vert) : un type hors vocabulaire est refusé à l'écriture, le message nomme le vocabulaire, rien n'est écrit", () => {
  const lf = join(out, "t2245-vocabulaire.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2245" })]);
  const err = refuse(lf, { type: "decision_humaine", detail: "type improvisé" });
  if (!err.includes("[LEDGER FAIL]") || !err.includes("decision_humaine") || !err.includes("reponse_humain")) {
    throw new Error("le refus doit citer le type refusé et le vocabulaire (dont reponse_humain) : " + err.slice(0, 300));
  }
  if (lignesDe(lf).length !== 1) throw new Error("le refus a laissé une écriture");
  // Le vocabulaire que le refus annonce est EXACTEMENT celui de la liste attendue (ni type manquant, ni type en trop).
  const annonce = (err.match(/attendus ([a-z_, ]+) \(/) || [])[1];
  if (!annonce || annonce !== [...TYPES_ATTENDUS].sort().join(", ")) throw new Error("le vocabulaire annoncé diverge de la liste attendue : " + annonce);
});
check("ledger TF-2245 : les 27 types du vocabulaire sont acceptés à l'écriture (sauf `rectification_doublon`, qui exige un doublon réel : test dédié, TF-2424)", () => {
  const lf = join(out, "t2245-24-types.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2245" })]);
  const payload = {
    oracles_verdict: { oracle: "x", verdict: "PASS" },
    rectification_forges_mobilisees: { forges_mobilisees: ["agents"], cause: "x" },
    qualification_enclenchement: { qualification: "fonde", cause: "x" },
    rectification_horodatage: { entrees: [{ seq: 1, ts_consigne: "x", ts_reel_estime: "x", cause: "x" }] },
    anteriorite_ledger: { avant: "2026-01-01T00:00:00Z", cause: "lacune antérieure à la session qui la révèle" },
    decision_retiree: { decision: "D-12", cause: "la question ne se pose plus depuis ce lot" },
    secret_range: { nom: "X", remplace: false },
  };
  for (const t of TYPES_ATTENDUS.filter((x) => x !== "run_open" && x !== "rectification_doublon")) {
    run(ledger, ["append", lf, JSON.stringify({ type: t, detail: "t2245", ...(payload[t] || {}) })]);
  }
  const n = lignesDe(lf).length;
  if (n !== TYPES_ATTENDUS.length - 1) throw new Error(`${TYPES_ATTENDUS.length - 1} entrées attendues, ${n}`);
});
{
  const gabarit = join(process.env.FORGE_ROOT || join(here, "..", "..", "..", "..", ".."), "digit-ai-factory", "gabarits", "ledger.py");
  if (!existsSync(gabarit)) console.log(`  [NON JOUÉ] ledger TF-2245 : parité avec gabarits/ledger.py — gabarit du pilot introuvable (${gabarit})`);
  else check("ledger TF-2245 : parité avec gabarits/ledger.py du pilot — mêmes types, mêmes types hors run, mêmes sorts de remplacement", () => {
    const py = readFileSync(gabarit, "utf8");
    const mots = (re) => { const m = py.match(re); if (!m) throw new Error(`motif ${re} introuvable dans ledger.py`); return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort().join(","); };
    const attendu = (l) => [...l].sort().join(",");
    if (mots(/^TYPES = \{([^}]*)\}/m) !== attendu(TYPES_ATTENDUS)) throw new Error("le vocabulaire des types diverge de ledger.py : " + mots(/^TYPES = \{([^}]*)\}/m));
    if (mots(/^HORS_RUN = \{([^}]*)\}/m) !== attendu(["retour", "question_humain", "reponse_humain", "demande_humain"])) throw new Error("les types hors run divergent de ledger.py");
    if (mots(/^SORTS = \(([^)]*)\)/m) !== attendu(["retire", "conserve", "a_decider"])) throw new Error("les sorts de remplacement divergent de ledger.py");
  });
}
check("ledger TF-2245 (rouge/vert) : `remplace` vide, `artefacts_remplaces` sans `remplace` ou de forme fausse → refus ; forme juste → écrite", () => {
  const lf = join(out, "t2245-remplace.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2245" })]);
  refuse(lf, { type: "reponse_humain", decision: "D-49", remplace: "  " });
  refuse(lf, { type: "reponse_humain", decision: "D-49", remplace: [] });
  refuse(lf, { type: "reponse_humain", decision: "D-49", remplace: ["D-46", ""] });
  const sansRemplace = refuse(lf, { type: "reponse_humain", decision: "D-49", artefacts_remplaces: [{ artefact: "a", sort: "retire" }] });
  if (!sansRemplace.includes("remplace")) throw new Error("le refus doit nommer `remplace` : " + sansRemplace.slice(0, 200));
  refuse(lf, { type: "reponse_humain", decision: "D-49", remplace: "D-46", artefacts_remplaces: [] });
  refuse(lf, { type: "reponse_humain", decision: "D-49", remplace: "D-46", artefacts_remplaces: [{ artefact: "a", sort: "supprime" }] });
  refuse(lf, { type: "reponse_humain", decision: "D-49", remplace: "D-46", artefacts_remplaces: [{ artefact: " ", sort: "retire" }] });
  const sorts = refuse(lf, { type: "reponse_humain", decision: "D-49", remplace: "D-46", artefacts_remplaces: "tout" });
  if (!sorts.includes("retire") || !sorts.includes("conserve") || !sorts.includes("a_decider")) throw new Error("le refus doit nommer les trois sorts : " + sorts.slice(0, 300));
  const ok = run(ledger, ["append", lf, JSON.stringify({ type: "reponse_humain", decision: "D-49", remplace: ["D-46", "D-47"],
    artefacts_remplaces: [{ artefact: "onze ressources", sort: "retire" }, { artefact: "deux exigences", sort: "a_decider" }] })]);
  if (ok.includes("[À PORTER]")) throw new Error("une forme complète ne doit rien réclamer");
  if (lignesDe(lf).length !== 2) throw new Error("2 entrées attendues (run_open + la forme juste), " + lignesDe(lf).length);
});
check("ledger TF-2245 : `remplace` sans `artefacts_remplaces` est écrit et le dit [À PORTER] ; `secret_range` (remplace booléen) reste hors contrôle", () => {
  const lf = join(out, "t2245-a-porter.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2245" })]);
  const o = run(ledger, ["append", lf, JSON.stringify({ type: "reponse_humain", decision: "D-49", remplace: "D-46" })]);
  if (!o.includes("[À PORTER]") || !o.includes("artefacts_remplaces")) throw new Error("l'oubli doit se dire à l'écriture : " + o);
  const s = run(ledger, ["append", lf, JSON.stringify({ type: "secret_range", nom: "SUPABASE_TOKEN", empreinte: "ab12", remplace: true })]);
  if (s.includes("[À PORTER]")) throw new Error("secret_range n'est pas une décision remplaçante");
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("un oubli déjà écrit ne met jamais en échec : " + v);
  const declares = v.split("\n").filter((l) => l.includes("[DÉCLARÉ]") && l.includes("remplace"));
  if (declares.length !== 1 || !declares[0].includes("seq 2")) throw new Error("verify doit déclarer le seul seq 2 (pas secret_range) : " + v);
});
check("ledger TF-2245 : verify DÉCLARE les types hors vocabulaire déjà écrits (non bloquant), avec le compte et sans borne silencieuse", () => {
  const lf = join(out, "t2245-verify-vocabulaire.jsonl");
  const e = [{ seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "t2245" }];
  for (let i = 0; i < 8; i++) e.push({ seq: i + 2, ts: `2026-01-01T10:00:0${i + 1}Z`, type: i < 7 ? "constat" : "decision", detail: "antérieur" });
  ecrireBrut(lf, e);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]")) throw new Error("un type hors vocabulaire déjà écrit ne met jamais en échec : " + v);
  if (!/\[DÉCLARÉ\][^\n]*7 entrée\(s\)[^\n]*constat/.test(v) || !/\[DÉCLARÉ\][^\n]*1 entrée\(s\)[^\n]*decision/.test(v)) {
    throw new Error("le compte par type doit être dit (7 constat, 1 decision) : " + v);
  }
  if (!v.includes("reponse_humain")) throw new Error("le remède doit être dit : " + v);
});
check("ledger TF-2245 (rouge/vert) : journal hors run — un retour s'écrit comme première entrée à hors-run.jsonl, marqué hors_run, seq 1 puis 2, verify PASS", () => {
  const dossier = join(out, "t2245-forge");
  mkdirSync(dossier, { recursive: true });
  const hr = join(dossier, "hors-run.jsonl");
  const sans = join(dossier, "ledger.jsonl");
  // Rouge : sans journal hors run, le même retour est refusé en première entrée d'un ledger, avec l'indication du journal.
  const err = refuse(sans, { type: "retour", source: "produit", detail: "t2245" });
  if (!err.includes("hors-run.jsonl")) throw new Error("le refus d'une première entrée `retour` doit pointer le journal hors run : " + err.slice(0, 300));
  // Vert.
  run(ledger, ["append", hr, JSON.stringify({ type: "retour", source: "produit", detail: "premier" })]);
  run(ledger, ["append", hr, JSON.stringify({ type: "demande_humain", texte: "mot pour mot" })]);
  const l = lignesDe(hr);
  if (l.length !== 2 || l[0].seq !== 1 || l[1].seq !== 2 || !l.every((x) => x.hors_run === true)) throw new Error("seq 1, 2 et hors_run:true attendus : " + JSON.stringify(l));
  if (!run(ledger, ["verify", hr]).includes("[PASS]")) throw new Error("un journal hors run intègre doit passer verify sans run_open");
  // Le journal hors run ne porte que les quatre types hors run.
  refuse(hr, { type: "oracles_verdict", oracle: "x", verdict: "PASS" });
  refuse(hr, { type: "run_open", substrat: "x" });
  // Et la même première entrée hors d'un journal hors run reste un FAIL de verify : la règle R-42 n'est pas assouplie.
  const lf = join(dossier, "ledger-sans-run-open.jsonl");
  ecrireBrut(lf, [{ seq: 1, ts: "2026-01-01T10:00:00Z", type: "retour", detail: "x" }]);
  if (!verifyRouge(lf).sortie.includes("run_open")) throw new Error("un ledger de run sans run_open doit rester un FAIL");
});

// TF-2494 : le remède écrit par `append` (après la définition de `refuse`, section TF-2245 ci-dessus).
check("ledger TF-2494 : `anteriorite_ledger` est écrite par `append` (le remède prescrit par R-42, joué de bout en bout) et un saut ancien devient intègre ; sans `avant` lisible ou cause de 20 caractères → refus, rien d'écrit", () => {
  const lf = join(out, "t2494-remede-joue.jsonl");
  ecrireBrut(lf, SAUT_ENTREES);
  verifyRouge(lf);
  const avant = readFileSync(lf, "utf8");
  for (const [payload, motif] of [
    [{ type: "anteriorite_ledger", cause: "lacune de seq du 01/01, antérieure à la session" }, "`avant` absent"],
    [{ type: "anteriorite_ledger", avant: "pas une date", cause: "lacune de seq du 01/01, antérieure à la session" }, "date ISO lisible"],
    [{ type: "anteriorite_ledger", avant: "2026-01-01T12:00:00Z" }, "`cause` absent"],
    [{ type: "anteriorite_ledger", avant: "2026-01-01T12:00:00Z", cause: "trop courte" }, "au moins 20"],
  ]) {
    const err = refuse(lf, payload);
    if (!err.includes(motif) || !err.includes("TF-2494")) throw new Error(`le refus doit dire « ${motif} » : ` + err.slice(0, 300));
  }
  if (readFileSync(lf, "utf8") !== avant) throw new Error("un refus est sans écriture");
  const o = run(ledger, ["append", lf, JSON.stringify({ type: "anteriorite_ledger", avant: "2099-01-01T00:00:00Z", cause: "lacune de seq du 01/01, antérieure à la session qui la révèle" })]);
  if (!o.includes("[OK]") || !o.includes("anteriorite_ledger")) throw new Error("la forme juste doit s'écrire : " + o);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]") || !v.includes("[ANTÉRIORITÉ]")) throw new Error("le saut ancien déclaré par le remède doit passer, imprimé [ANTÉRIORITÉ] : " + v);
});

// TF-2494 : ACCORD avec le juge du pilot — le même fichier est intègre ou rompu pour R-42 (oracle-conformite-projet) comme pour
// `verify` (le défaut de TF-1425 : deux juges, deux verdicts). Quatre fixtures, mêmes verdicts ; pilot absent : non joué, et dit.
{
  const juge = join(process.env.FORGE_ROOT || join(here, "..", "..", "..", "..", ".."), "digit-ai-factory", "oracles", "oracle-conformite-projet.mjs");
  if (!existsSync(juge)) console.log(`  [NON JOUÉ] ledger TF-2494 : accord avec R-42 — oracle-conformite-projet du pilot introuvable (${juge})`);
  else check("ledger TF-2494 : accord avec R-42 du pilot — le saut nu est rompu, le saut rectifié ou antérieur déclaré est intègre, chez les DEUX juges", () => {
    const anteriorite = { seq: 7, ts: "2026-01-02T09:00:00Z", type: "anteriorite_ledger", avant: "2026-01-01T12:00:00Z", cause: "lacune de seq du 01/01, antérieure à la session qui la révèle" };
    const cas = [
      ["nu", SAUT_ENTREES, false],
      ["rectifié", [...SAUT_ENTREES, RECTIF_SAUT(7, "2026-01-01T11:00:00Z")], true],
      ["antériorité", [...SAUT_ENTREES, anteriorite], true],
      ["antériorité trop tôt (`avant` égal au ts du saut)", [...SAUT_ENTREES, { ...anteriorite, avant: "2026-01-01T11:00:00Z" }], false],
    ];
    // DIVERGENCE CONNUE, volontairement hors de ce test : une rectification dont `ts_consigne` ne colle PAS à l'entrée visée
    // (ici 11:30 au lieu de 11:00) est un écart pour `verify` (TF-1425 : « ts_consigne doit correspondre EXACTEMENT »), que R-42
    // laisse passer — il ne contrôle que l'antériorité de la rectification sur le ts cité (TF-1466). Mesuré le 14/11/2026 pour le
    // saut comme pour la collision ; R-42 est au pilot, hors de ce lot : rapporté, non aligné à la baisse ici (TF-2540, part pilot :
    // R-42 doit vérifier `ts_consigne`). L'AUTRE divergence de TF-2540, l'étendue de l'antériorité, est fermée ici : sept cas d'accord plus bas.
    for (const [nom, entrees, integre] of cas) {
      const racine = mkdtempSync(join(out, "r42-"));
      mkdirSync(join(racine, "forge"));
      const lf = join(racine, "forge", "ledger.jsonl");
      ecrireBrut(lf, entrees);
      let verifyPasse = true;
      try { execFileSync("node", [ledger, "verify", lf], { encoding: "utf8", stdio: "pipe" }); } catch { verifyPasse = false; }
      const r = spawnSync(process.execPath, [juge, racine], { encoding: "utf8" });
      const r42 = (JSON.parse(r.stdout || "{}").findings || []).filter((f) => f.regle === "R-42");
      if (!r42.length) throw new Error(`${nom} : R-42 n'a rendu aucun constat : ${(r.stdout || r.stderr || "").slice(0, 200)}`);
      const r42Passe = !r42.some((f) => f.statut === "FAIL");
      if (verifyPasse !== integre || r42Passe !== integre) throw new Error(`${nom} : intègre attendu ${integre}, verify ${verifyPasse}, R-42 ${r42Passe} (${r42.map((f) => f.message).join(" ").slice(0, 200)})`);
    }
  });
}

// --- TF-2540 (14/11/2026) : L'ANTÉRIORITÉ COUVRE AUSSI UNE COLLISION DE SEQ ET UN RECUL D'HORODATAGE, comme R-42 du pilot (TF-1203).
// Le fait (lot fa2, TF-2494) : R-42 couvrait par `anteriorite_ledger` tout écart dont l'horodatage précède `avant`, `verify` seulement le
// saut en avant ; le même ledger était intègre pour R-42 et rompu pour `verify`. Sens rouge : sur l'ancien `verify`, les deux cas « avant »
// ci-dessous échouent ; sens vert : la déclaration couvre, imprimée [ANTÉRIORITÉ] et comptée ; et trois bornes qui restent FAIL — l'entrée
// qui n'est pas STRICTEMENT antérieure à `avant`, un `ts` illisible (sans instant à comparer) et l'écart que rien ne déclare.
const BASE_3 = [
  { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "self-test-anteriorite" },
  { seq: 2, ts: "2026-01-01T10:30:00Z", type: "note", detail: "avant l'écart" },
  { seq: 3, ts: "2026-01-01T11:00:00Z", type: "note", detail: "dernière entrée saine" },
];
const ANTERIORITE_COLLISION = [...BASE_3, { seq: 3, ts: "2026-01-01T11:10:00Z", type: "note", detail: "seq 3 écrit par un second écrivain" }, { seq: 4, ts: "2026-01-01T11:20:00Z", type: "note", detail: "la suite reprend" }];
const ANTERIORITE_RECUL = [...BASE_3, { seq: 4, ts: "2026-01-01T10:45:00Z", type: "note", detail: "horodatage en recul" }];
const ANTERIORITE_ILLISIBLE = [...BASE_3, { seq: 4, ts: "pas-une-date", type: "note", detail: "horodatage illisible" }];
const ANTERIORITE_SEQ = (seq, avant) => ({ seq, ts: "2026-01-02T09:00:00Z", type: "anteriorite_ledger", avant, cause: "écart du 01/01 antérieur à la session qui le révèle" });
const CAS_ANTERIORITE = [
  ["collision nue", ANTERIORITE_COLLISION, false],
  ["collision couverte par une antériorité postérieure à son horodatage", [...ANTERIORITE_COLLISION, ANTERIORITE_SEQ(5, "2026-01-01T12:00:00Z")], true],
  ["collision, `avant` égal à son horodatage (pas STRICTEMENT antérieure)", [...ANTERIORITE_COLLISION, ANTERIORITE_SEQ(5, "2026-01-01T11:10:00Z")], false],
  ["recul nu", ANTERIORITE_RECUL, false],
  ["recul couvert par une antériorité postérieure à son horodatage", [...ANTERIORITE_RECUL, ANTERIORITE_SEQ(5, "2026-01-01T12:00:00Z")], true],
  ["recul, `avant` égal à son horodatage", [...ANTERIORITE_RECUL, ANTERIORITE_SEQ(5, "2026-01-01T10:45:00Z")], false],
  ["horodatage illisible, même sous une antériorité lointaine (aucun instant à comparer)", [...ANTERIORITE_ILLISIBLE, ANTERIORITE_SEQ(5, "2099-01-01T00:00:00Z")], false],
];
check("ledger TF-2540 : l'antériorité déclarée couvre une collision de seq et un recul d'horodatage antérieurs à `avant`, et ne couvre ni l'égalité, ni un `ts` illisible, ni un écart nu", () => {
  for (const [nom, entrees, integre] of CAS_ANTERIORITE) {
    const lf = join(out, "t2540-" + nom.replace(/[^a-z]+/gi, "-").slice(0, 40) + ".jsonl");
    ecrireBrut(lf, entrees);
    let sortie = "", passe = true;
    try { sortie = execFileSync("node", [ledger, "verify", lf], { encoding: "utf8", stdio: "pipe" }); } catch (e) { passe = false; sortie = String(e.stdout || "") + String(e.stderr || ""); }
    if (passe !== integre) throw new Error(`${nom} : intègre attendu ${integre}, verify ${passe} — ${sortie.slice(0, 300)}`);
    if (integre) {
      if (!sortie.includes("[ANTÉRIORITÉ]") || !/1 écart\(s\) de seq en collision ou d'horodatage ANTÉRIEUR\(S\)/.test(sortie)) throw new Error(`${nom} : l'écart couvert doit s'imprimer [ANTÉRIORITÉ] et se compter au verdict — ${sortie.slice(0, 400)}`);
    }
  }
});
{
  const juge = join(process.env.FORGE_ROOT || join(here, "..", "..", "..", "..", ".."), "digit-ai-factory", "oracles", "oracle-conformite-projet.mjs");
  if (!existsSync(juge)) console.log(`  [NON JOUÉ] ledger TF-2540 : accord avec R-42 — oracle-conformite-projet du pilot introuvable (${juge})`);
  else check("ledger TF-2540 : ACCORD avec R-42 du pilot — mêmes verdicts, chez les deux juges, sur les sept cas d'antériorité (collision, recul, égalité, illisible)", () => {
    for (const [nom, entrees, integre] of CAS_ANTERIORITE) {
      const racine = mkdtempSync(join(out, "r42a-"));
      mkdirSync(join(racine, "forge"));
      const lf = join(racine, "forge", "ledger.jsonl");
      ecrireBrut(lf, entrees);
      let verifyPasse = true;
      try { execFileSync("node", [ledger, "verify", lf], { encoding: "utf8", stdio: "pipe" }); } catch { verifyPasse = false; }
      const r = spawnSync(process.execPath, [juge, racine], { encoding: "utf8" });
      const r42 = (JSON.parse(r.stdout || "{}").findings || []).filter((f) => f.regle === "R-42");
      if (!r42.length) throw new Error(`${nom} : R-42 n'a rendu aucun constat : ${(r.stdout || r.stderr || "").slice(0, 200)}`);
      const r42Passe = !r42.some((f) => f.statut === "FAIL");
      if (verifyPasse !== integre || r42Passe !== integre) throw new Error(`${nom} : intègre attendu ${integre}, verify ${verifyPasse}, R-42 ${r42Passe} (${r42.map((f) => f.message).join(" ").slice(0, 200)})`);
    }
  });
}

// --- TF-2527 (14/11/2026) : `decision_retiree`, le type que `oracles/lib-decisions.mjs` du pilot lit depuis TF-2415 (décision posée, puis
// retirée : elle n'est plus rappelée comme ouverte). Ni `gabarits/ledger.py` ni ce script ne l'acceptaient à l'écriture : une retraite
// s'écrivait en `reponse_humain --decision D-M --remplace D-N`. Sens rouge : l'ancien écrivain refuse le type (« type inconnu ») ; sens vert :
// une décision nommée au format D-N et une cause de 20 caractères au moins s'écrivent, sous chacun des trois champs que lib-decisions lit.
const CAUSE_RETRAIT = "la question ne se pose plus depuis ce lot";
check("ledger TF-2527 (vert) : `decision_retiree` s'écrit quand elle nomme la décision (`decision`, `decisions` ou `decisions_retirees`, chaîne ou liste) et sa cause", () => {
  const lf = join(out, "t2527-vert.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2527" })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "decision_retiree", decision: "D-12", cause: CAUSE_RETRAIT })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "decision_retiree", decisions: ["D-13", "d-14"], cause: CAUSE_RETRAIT })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "decision_retiree", decisions_retirees: "D-15", cause: CAUSE_RETRAIT })]);
  if (lignesDe(lf).filter((e) => e.type === "decision_retiree").length !== 3) throw new Error("3 entrées decision_retiree attendues");
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("le ledger doit rester intègre : le type est au vocabulaire");
});
check("ledger TF-2527 (rouge) : sans décision nommée au format D-N, ou sans cause de 20 caractères, l'écriture est refusée et rien n'est écrit", () => {
  const lf = join(out, "t2527-rouge.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2527" })]);
  for (const [libelle, payload, motif] of [
    ["aucune décision", { type: "decision_retiree", cause: CAUSE_RETRAIT }, "doit nommer"],
    ["décision au mauvais format", { type: "decision_retiree", decision: "12", cause: CAUSE_RETRAIT }, "doit nommer"],
    ["liste dont un élément n'est pas une décision", { type: "decision_retiree", decisions: ["D-12", "bientôt"], cause: CAUSE_RETRAIT }, "doit nommer"],
    ["cause absente", { type: "decision_retiree", decision: "D-12" }, "doit dire pourquoi"],
    ["cause de 19 caractères", { type: "decision_retiree", decision: "D-12", cause: "x".repeat(19) }, "doit dire pourquoi"],
    ["cause qui n'est pas une chaîne", { type: "decision_retiree", decision: "D-12", cause: 12345678901234567890 }, "doit dire pourquoi"],
  ]) {
    const err = refuse(lf, payload);
    if (!err.includes("TF-2527") || !err.includes(motif)) throw new Error(`${libelle} : le refus doit nommer TF-2527 et dire « ${motif} » : ${err.slice(0, 300)}`);
  }
  if (lignesDe(lf).length !== 1) throw new Error("un refus est sans écriture : 1 entrée attendue, " + lignesDe(lf).length);
});
{
  const lib = join(process.env.FORGE_ROOT || join(here, "..", "..", "..", "..", ".."), "digit-ai-factory", "oracles", "lib-decisions.mjs");
  if (!existsSync(lib)) console.log(`  [NON JOUÉ] ledger TF-2527 : accord avec lib-decisions — lib-decisions.mjs du pilot introuvable (${lib})`);
  else await checkAsync("ledger TF-2527 : ACCORD avec lib-decisions du pilot — la décision qu'écrit `decision_retiree` n'est plus rappelée comme ouverte, la même sans la retraite l'est", async () => {
    const m = await import(pathToFileURL(lib).href);
    if (typeof m.decisionsSansReponse !== "function") throw new Error("lib-decisions n'expose pas `decisionsSansReponse`");
    const produit = mkdtempSync(join(out, "t2527-produit-"));
    mkdirSync(join(produit, "forge"));
    const lf = join(produit, "forge", "ledger.jsonl");
    run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2527" })]);
    run(ledger, ["append", lf, JSON.stringify({ type: "question_humain", decisions_posees: { "D-12": "Faut-il garder le lot de la semaine passée ?" } })]);
    const ouvertes = m.decisionsSansReponse(produit).map((d) => d.n).join();
    if (ouvertes !== "D-12") throw new Error("avant la retraite, D-12 doit être rappelée comme ouverte : " + ouvertes);
    run(ledger, ["append", lf, JSON.stringify({ type: "decision_retiree", decision: "D-12", cause: CAUSE_RETRAIT })]);
    const apres = m.decisionsSansReponse(produit).map((d) => d.n).join();
    if (apres !== "") throw new Error("après la retraite écrite par ledger.mjs, D-12 ne doit plus être rappelée : " + apres);
  });
}

// --- TF-2549 (14/11/2026) : LE MODE D'ESSAI. Le 14/11/2026, un agent vérificateur en lecture seule a joué `oracles_verdict --etape x` « pour
// voir » : l'entrée 84 est entrée au ledger d'un run, et aucun type de rectification ne neutralise une entrée. `--essai` joue tous les
// contrôles de `append` et de `consigner` et n'écrit RIEN — ni journal, ni verrou (il ne prend pas le verrou et ne libère jamais celui d'un
// autre processus). Sens rouge : l'ancien écrivain refuse `--essai` comme argument inconnu (exit 1) ; sens vert : exit 0, entrée montrée,
// fichier identique à l'octet, aucun `.lock`, et la même commande sans `--essai` écrit bien l'entrée montrée.
const lancer = (...args) => spawnSync(process.execPath, [ledger, ...args], { encoding: "utf8" });
check("ledger TF-2549 (vert) : `append --essai` rend 0, montre l'entrée et son seq, ne change pas un octet, ne laisse aucun verrou ; sans `--essai`, la même commande écrit l'entrée montrée", () => {
  const lf = join(out, "t2549-append.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2549" })]);
  const avant = readFileSync(lf, "utf8");
  const payload = JSON.stringify({ type: "oracles_verdict", oracle: "oracle-x", verdict: "PASS", etape: "x" });
  for (const args of [["append", lf, payload, "--essai"], ["append", lf, "--essai", payload]]) {
    const r = lancer(...args);
    if (r.status !== 0) throw new Error(`exit 0 attendu, ${r.status} : ${r.stderr.slice(0, 300)}`);
    if (!r.stdout.includes("[ESSAI] rien n'est écrit") || !r.stdout.includes("seq 2") || !r.stdout.includes('"oracle":"oracle-x"')) throw new Error("l'essai doit dire qu'il n'écrit rien et montrer l'entrée avec son seq : " + r.stdout.slice(0, 400));
    if (readFileSync(lf, "utf8") !== avant) throw new Error("un essai ne change pas un octet du ledger");
    if (existsSync(lf + ".lock")) throw new Error("un essai ne laisse aucun verrou");
  }
  const reel = lancer("append", lf, payload);
  if (reel.status !== 0 || lignesDe(lf).length !== 2) throw new Error("sans --essai, la même commande écrit : " + reel.stdout + reel.stderr);
  const e = lignesDe(lf)[1];
  if (e.seq !== 2 || e.oracle !== "oracle-x" || e.etape !== "x") throw new Error("l'entrée écrite n'est pas celle que l'essai montrait : " + JSON.stringify(e));
});
check("ledger TF-2549 (rouge) : l'essai joue TOUS les contrôles — type inconnu, `decision_retiree` sans cause, première entrée qui n'est pas run_open : refus, exit 1, ledger absent ou intact", () => {
  const lf = join(out, "t2549-controles.jsonl");
  const absent = lancer("append", lf, JSON.stringify({ type: "oracles_verdict", etape: "x" }), "--essai");
  if (absent.status !== 1 || !absent.stderr.includes("run_open exigé") || existsSync(lf)) throw new Error("sans ledger, une première entrée non run_open est refusée et rien n'est créé : " + absent.stderr.slice(0, 200));
  const ouverture = lancer("append", lf, JSON.stringify({ type: "run_open", substrat: "t2549" }), "--essai");
  if (ouverture.status !== 0 || existsSync(lf)) throw new Error("un run_open en essai ne crée pas le ledger : " + ouverture.stderr.slice(0, 200));
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2549" })]);
  const avant = readFileSync(lf, "utf8");
  for (const payload of [{ type: "type_improvise", detail: "x" }, { type: "decision_retiree", decision: "D-12" }]) {
    const r = lancer("append", lf, JSON.stringify(payload), "--essai");
    if (r.status !== 1 || !r.stderr.includes("[LEDGER FAIL]")) throw new Error(`l'essai doit refuser ${payload.type} (exit 1) : ${r.status} ${r.stderr.slice(0, 200)}`);
  }
  if (readFileSync(lf, "utf8") !== avant) throw new Error("un essai refusé ne change rien");
});
check("ledger TF-2549 : l'essai ne prend pas le verrou et ne libère pas celui d'un autre processus ; il ne crée pas le journal hors run", () => {
  const lf = join(out, "t2549-verrou.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2549" })]);
  writeFileSync(lf + ".lock", "");                                                      // le verrou d'une autre écriture, en cours
  const r = lancer("append", lf, JSON.stringify({ type: "etape_open", etape: "x" }), "--essai");
  if (r.status !== 0) throw new Error("l'essai n'attend pas un verrou qu'il ne prend pas : " + r.stderr.slice(0, 200));
  if (!existsSync(lf + ".lock")) throw new Error("l'essai a LIBÉRÉ le verrou d'un autre processus");
  rmSync(lf + ".lock", { force: true });
  const dossier = join(out, "t2549-forge");
  mkdirSync(dossier);
  const horsRun = join(dossier, "hors-run.jsonl");
  const h = lancer("append", horsRun, JSON.stringify({ type: "retour", detail: "essai" }), "--essai");
  if (h.status !== 0 || existsSync(horsRun)) throw new Error("l'essai ne crée pas le journal hors run : " + h.stderr.slice(0, 200));
});
check("ledger TF-2549 : `consigner --essai` ne change pas un octet, montre le lot ; `verify --essai` reste refusé (argument inconnu : verify n'écrit pas)", () => {
  const lf = join(out, "t2549-consigner.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2549" })]);
  const rapport = join(out, "t2549-rapport.json");
  writeFileSync(rapport, JSON.stringify({ oracles: [{ oracle: "oracle-x", verdict: "PASS" }, { oracle: "oracle-y", verdict: "FAIL" }] }));
  const avant = readFileSync(lf, "utf8");
  const r = lancer("consigner", lf, "--rapport", rapport, "--essai");
  if (r.status !== 0 || !r.stdout.includes("[ESSAI] rien n'est écrit : 2 entrée(s)") || !r.stdout.includes('"oracle":"oracle-y"')) throw new Error("l'essai du lot doit dire qu'il n'écrit rien et le montrer : " + r.stdout.slice(0, 400) + r.stderr.slice(0, 200));
  if (readFileSync(lf, "utf8") !== avant || existsSync(lf + ".lock")) throw new Error("un essai de consigner ne change rien et ne laisse aucun verrou");
  const v = lancer("verify", lf, "--essai");
  if (v.status !== 1 || !v.stderr.includes("non reconnu")) throw new Error("verify --essai doit rester refusé : " + v.stderr.slice(0, 200));
});

// --- TF-2424 (14/11/2026) : LE DOUBLON. Un script de clôture rejoué a écrit 6 entrées en double (seq 835 à 840 pour 830 à 834)
// chez un produit ; `append` ne bronchait pas, et aucun type ne désignait un doublon. Sens rouge : l'ancien écrivain écrit le second
// exemplaire (les trois premiers cas ci-dessous rendent FAIL contre lui) ; sens vert : le refus nomme la première, et le remède écrit.
const CLOTURE = { type: "etape_close", etape: "cloture", resume: "clôture du lot A" };
check("ledger TF-2424 (rouge) : le même `append` rejoué est REFUSÉ — le message nomme le seq de la première, rien n'est écrit, hors seq, ts et ordre des champs", () => {
  const lf = join(out, "t2424-rejeu.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2424" })]);
  run(ledger, ["append", lf, JSON.stringify(CLOTURE)]);
  const err = refuse(lf, CLOTURE);
  if (!err.includes("IDENTIQUE") || !err.includes("seq 2") || !err.includes("rectification_doublon") || !err.includes("ts_action")) throw new Error("le refus doit nommer la première (seq 2) et les deux gestes : " + err.slice(0, 400));
  refuse(lf, { resume: CLOTURE.resume, etape: CLOTURE.etape, type: CLOTURE.type });                       // autre ordre des champs
  refuse(lf, { ...CLOTURE, ts: new Date(Date.now() + 60000).toISOString() });                             // autre ts imposé
  if (lignesDe(lf).length !== 2) throw new Error("un refus est sans écriture : 2 entrées attendues, " + lignesDe(lf).length);
});
check("ledger TF-2424 (vert) : un second événement DISTINCT (champ de contenu), un run_open neuf et deux entrées de runs différents s'écrivent — le doublon est celui du même run", () => {
  const lf = join(out, "t2424-distincts.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2424" })]);
  run(ledger, ["append", lf, JSON.stringify(CLOTURE)]);
  run(ledger, ["append", lf, JSON.stringify({ ...CLOTURE, ts_action: "2026-11-14T09:00:00+01:00" })]);       // distingué par ts_action
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2424" })]);                       // run neuf, même contenu que le premier
  run(ledger, ["append", lf, JSON.stringify(CLOTURE)]);                                                        // même contenu qu'au run précédent, run différent
  if (lignesDe(lf).length !== 5) throw new Error("5 entrées attendues, " + lignesDe(lf).length);
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("le ledger doit rester intègre");
});
check("ledger TF-2424 : `consigner` rejoué écrit deux lots — un verdict rejoué est une preuve neuve, pas un doublon", () => {
  const lf = join(out, "t2424-consigner.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2424" })]);
  const rapport = join(out, "t2424-rapport.json");
  writeFileSync(rapport, JSON.stringify({ oracles: [{ oracle: "oracle-x", verdict: "PASS" }] }));
  run(ledger, ["consigner", lf, "--rapport", rapport]);
  run(ledger, ["consigner", lf, "--rapport", rapport]);
  if (lignesDe(lf).length !== 3) throw new Error("3 entrées attendues (run_open + 2 verdicts), " + lignesDe(lf).length);
});
check("ledger TF-2424 : le journal hors run refuse aussi un retour rejoué", () => {
  const dossier = join(out, "t2424-forge");
  mkdirSync(dossier, { recursive: true });
  const hr = join(dossier, "hors-run.jsonl");
  const retour = { type: "retour", source: "produit", detail: "t2424" };
  run(ledger, ["append", hr, JSON.stringify(retour)]);
  if (!refuse(hr, retour).includes("IDENTIQUE")) throw new Error("le retour rejoué doit être refusé comme doublon");
  if (lignesDe(hr).length !== 1) throw new Error("un refus est sans écriture");
});
/** Le cas du produit : 5 entrées (seq 2 à 4 puis un rejeu, seq 5 à 7 = copies de 2 à 4), écrites par un autre outil, sans verrou. */
const AVEC_DOUBLONS = [
  { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "t2424" },
  { seq: 2, ts: "2026-01-01T10:01:00Z", type: "etape_close", etape: "a", resume: "clôture a" },
  { seq: 3, ts: "2026-01-01T10:02:00Z", type: "etape_close", etape: "b", resume: "clôture b" },
  { seq: 4, ts: "2026-01-01T11:01:00Z", type: "etape_close", etape: "a", resume: "clôture a" },
  { seq: 5, ts: "2026-01-01T11:02:00Z", type: "etape_close", etape: "b", resume: "clôture b" },
];
const RECTIF_DOUBLON = (seq, entrees) => ({ seq, ts: "2026-01-01T12:00:00Z", type: "rectification_doublon", entrees });
check("ledger TF-2424 (vert) : verify DÉCLARE les doublons déjà écrits ([DOUBLON], non bloquant, compté, premiers seq nommés) et leur rectification les désigne ([RECTIFIÉ], vérifiée)", () => {
  const lf = join(out, "t2424-verify.jsonl");
  ecrireBrut(lf, AVEC_DOUBLONS);
  const nu = run(ledger, ["verify", lf]);
  if (!nu.includes("[PASS]") || !/\[DOUBLON\] 2 entrée\(s\)[^\n]*seq 4 = 2, 5 = 3/.test(nu) || !nu.includes("2 doublon(s) non déclaré(s)")) throw new Error("deux doublons non déclarés, non bloquants, nommés : " + nu);
  ecrireBrut(lf, [...AVEC_DOUBLONS, RECTIF_DOUBLON(6, [
    { seq: 4, doublon_de: 2, cause: "script de clôture rejoué" }, { seq: 5, doublon_de: 3, cause: "script de clôture rejoué" }])]);
  const rect = run(ledger, ["verify", lf]);
  if (!rect.includes("[PASS]") || !rect.includes("[RECTIFIÉ] doublon — le seq 4 est identique au seq 2") || !rect.includes("2 doublon(s) DÉCLARÉ(S)") || rect.includes("[DOUBLON]")) throw new Error("deux doublons désignés, plus rien de non déclaré : " + rect);
  ecrireBrut(lf, [...AVEC_DOUBLONS, RECTIF_DOUBLON(6, [{ seq: 4, doublon_de: 2, cause: "script de clôture rejoué" }])]);
  const part = run(ledger, ["verify", lf]);
  if (!/\[DOUBLON\] 1 entrée\(s\)[^\n]*seq 5 = 3/.test(part) || !part.includes("1 doublon(s) DÉCLARÉ(S)")) throw new Error("un seul désigné : l'autre reste déclaré non désigné : " + part);
});
check("ledger TF-2424 (rouge) : une rectification qui désigne comme doublon une entrée DISTINCTE, un seq absent ou incomplète → FAIL à verify, la raison nommée", () => {
  const faux = join(out, "t2424-faux-doublon.jsonl");
  ecrireBrut(faux, [...AVEC_DOUBLONS, RECTIF_DOUBLON(6, [{ seq: 3, doublon_de: 2, cause: "ce ne sont pas des copies" }])]);
  if (!verifyRouge(faux).sortie.includes("DIFFÈRENT")) throw new Error("une entrée distincte ne se désigne pas comme doublon");
  const absent = join(out, "t2424-doublon-absent.jsonl");
  ecrireBrut(absent, [...AVEC_DOUBLONS, RECTIF_DOUBLON(6, [{ seq: 9, doublon_de: 2, cause: "seq inexistant" }])]);
  if (!verifyRouge(absent).sortie.includes("n'existe pas")) throw new Error("un seq absent doit être nommé");
  const incomplet = join(out, "t2424-doublon-incomplet.jsonl");
  ecrireBrut(incomplet, [...AVEC_DOUBLONS, RECTIF_DOUBLON(6, [{ seq: 4, doublon_de: 2 }])]);
  if (!verifyRouge(incomplet).sortie.includes("déclaration incomplète")) throw new Error("une déclaration sans cause est incomplète");
  const vide = join(out, "t2424-doublon-vide.jsonl");
  ecrireBrut(vide, [...AVEC_DOUBLONS, { seq: 6, ts: "2026-01-01T12:00:00Z", type: "rectification_doublon", detail: "sans entrees" }]);
  if (!verifyRouge(vide).sortie.includes("`entrees` absent ou vide")) throw new Error("une rectification sans entrees ne rectifie rien");
});
check("ledger TF-2424 : `append` écrit une `rectification_doublon` juste (le remède du message de refus, joué) et refuse celle qui désigne une entrée distincte, un seq hors ordre, une cause absente, ou rien", () => {
  const lf = join(out, "t2424-remede.jsonl");
  ecrireBrut(lf, AVEC_DOUBLONS);
  const avant = readFileSync(lf, "utf8");
  for (const [entrees, motif] of [
    [[{ seq: 3, doublon_de: 2, cause: "pas des copies" }], "n'est PAS identique"],
    [[{ seq: 9, doublon_de: 2, cause: "postérieur à la rectification" }], "la rectification elle-même"],
    [[{ seq: 4, doublon_de: 2 }], "`cause`"],
    [[{ seq: 2, doublon_de: 4, cause: "à l'envers" }], "doublon_de (4) < seq (2)"],
    [[], "`entrees` absent ou vide"],
  ]) {
    const err = refuse(lf, { type: "rectification_doublon", entrees });
    if (!err.includes(motif) || !err.includes("TF-2424")) throw new Error(`le refus doit dire « ${motif} » : ` + err.slice(0, 300));
  }
  if (readFileSync(lf, "utf8") !== avant) throw new Error("un refus est sans écriture");
  const o = run(ledger, ["append", lf, JSON.stringify({ type: "rectification_doublon", entrees: [
    { seq: 4, doublon_de: 2, cause: "script de clôture rejoué" }, { seq: 5, doublon_de: 3, cause: "script de clôture rejoué" }] })]);
  if (!o.includes("[OK] entrée 6 ajoutée")) throw new Error("la rectification juste doit s'écrire : " + o);
  const v = run(ledger, ["verify", lf]);
  if (!v.includes("[PASS]") || !v.includes("2 doublon(s) DÉCLARÉ(S)") || v.includes("[DOUBLON]")) throw new Error("le remède joué solde les deux doublons : " + v);
});

// --- TF-2425 (14/11/2026) : S90 RAPPELÉE À L'ÉCRITURE. Une session a consigné « 12 demandes, 7 autorisées et 12 jobs » d'après une liste
// tronquée (recompte par requête : 11, 6 et 6) ; S90 ne juge que la restitution. Sens rouge : l'ancien écrivain n'imprime aucun rappel.
check("ledger TF-2425 (rouge) : un compte écrit sans provenance est RAPPELÉ [RAPPEL S90] (chiffre, nature, champ nommés), l'entrée est écrite et la sortie reste exit 0", () => {
  const lf = join(out, "t2425-rappel.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2425" })]);
  const o = run(ledger, ["append", lf, JSON.stringify({ type: "etape_close", etape: "cloture", resume: "12 demandes consignées, 7 autorisées et 12 jobs, 34 minutes de campagne" })]);
  if (!o.includes("[RAPPEL S90]") || !o.includes("« 12 demandes » (compte, champ `resume`)") || !o.includes("« 34 minutes » (durée, champ `resume`)")) throw new Error("le rappel doit nommer les chiffres, leur nature et leur champ : " + o);
  if (!o.includes("[OK] entrée 2 ajoutée") || lignesDe(lf).length !== 2) throw new Error("le rappel n'empêche pas l'écriture (S90 est avertissante) : " + o);
  if (!run(ledger, ["verify", lf]).includes("[PASS]")) throw new Error("le ledger reste intègre");
});
check("ledger TF-2425 (vert) : un chiffre qui dit sa provenance, ou non mesuré, estimé, rapporté — ou en code en ligne, dans `commande`, dans une date — n'est pas rappelé", () => {
  const lf = join(out, "t2425-vert.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2425" })]);
  const sans = (payload) => {
    const o = run(ledger, ["append", lf, JSON.stringify({ type: "etape_close", etape: "x", ...payload })]);
    if (o.includes("[RAPPEL S90]")) throw new Error(`aucun rappel attendu pour ${JSON.stringify(payload)} : ${o}`);
  };
  sans({ resume: "11 demandes recomptées par requête SELECT count(*)" });
  sans({ resume: "6 jobs autorisés, 12 fichiers mesurés par wc -l" });
  sans({ resume: "environ 40 minutes, non mesurées" });
  sans({ resume: "12 demandes (rapporté par l'agent, non recompté)" });
  sans({ resume: "le script `lancer 12 tests` a rendu exit 0" });
  sans({ resume: "clôture du 14/11/2026 à 12:45, sans compte" });
  sans({ commande: "node cible.mjs --max 12 tests", resume: "commande jouée" });
  if (lignesDe(lf).length !== 8) throw new Error("toutes les entrées sont écrites : 8 attendues, " + lignesDe(lf).length);
});
check("ledger TF-2425 : `consigner` ne rappelle rien (ses verdicts viennent d'oracles, pas d'un compte écrit par l'agent)", () => {
  const lf = join(out, "t2425-consigner.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "t2425" })]);
  const rapport = join(out, "t2425-rapport.json");
  writeFileSync(rapport, JSON.stringify({ oracles: [{ oracle: "oracle-x", verdict: "FAIL", message: "12 fichiers en défaut sur 40" }] }));
  const o = run(ledger, ["consigner", lf, "--rapport", rapport]);
  if (o.includes("[RAPPEL S90]")) throw new Error("consigner ne rappelle pas S90 : " + o);
});

rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
console.log(`\nSelf-test forge-agents : ${pass} PASS, ${failCount} FAIL`);
process.exit(failCount === 0 ? 0 : 1);
