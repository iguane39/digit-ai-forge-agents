#!/usr/bin/env node
/**
 * self-test.mjs — rejoue les fixtures du compilateur (1 verte, 3 rouges), le champ `modele`
 * (D-1 (a) du pilot, 25/09/2026 : 3 vertes, 1 rouge), le cycle ledger et le relevé de la
 * version servie.
 * Exit 0 si tous les contrôles passent, 1 sinon. À rejouer après toute modification du skill.
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdtempSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  run(ledger, ["append", lf, JSON.stringify({ type: "limites", detail: "fixture" })]);
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
  const lfTiers = join(out, "ledger-cloture-rouge-tiers.jsonl");
  ecrireBrut(lfTiers, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", schema_ledger: "1.0" },
    { seq: 2, ts: "2026-01-01T10:00:01Z", type: "etape_close" },
  ]);
  let sortie = null;
  try { execFileSync("node", [ledger, "verify", lfTiers], { stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || "") + String(e.stdout || ""); }
  if (sortie === null) throw new Error("une cloture d etape vide a ete acceptee — c est le fait mesure du 13/09");
  if (!sortie.includes("`etape`")) throw new Error("l echec ne NOMME pas le champ etape : " + sortie);
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
// (R-33 bis). L'antériorité se DÉCLARE, sur le modèle exact de R-32 bis du pilot.
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
  run(ledger, ["append", lf, JSON.stringify({ type: "note", n_importe_quoi: true })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "mise_en_production", detail: "libre" })]);
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
  writeFileSync(p2, "﻿" + JSON.stringify({ type: "limites", detail: "fixture --fichier" }));
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
    appels.push(spawnAppend(lf2, { type: "entry", proc: "a", i }));
    appels.push(spawnAppend(lf2, { type: "entry", proc: "b", i }));
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

check("ledger TF-0410 : un seq SAUTÉ (saut en avant) reste FAIL, même nommé par une rectification", () => {
  const lf = join(out, "ts-rectif-hors-perimetre.jsonl");
  ecrireBrut(lf, [
    { seq: 1, ts: "2026-01-01T10:00:00Z", type: "run_open", substrat: "self-test-ts" },
    { seq: 3, ts: "2026-01-01T11:00:00Z", type: "note", detail: "seq 2 sauté" },
    { seq: 4, ts: "2026-01-01T12:00:00Z", type: "rectification_horodatage", entrees: [
      { seq: 3, ts_consigne: "2026-01-01T11:00:00Z", ts_reel_estime: "2026-01-01T11:00:00Z", cause: "tentative de couvrir un seq rompu" }] },
  ]);
  const { sortie } = verifyRouge(lf);
  if (!sortie.includes("append-only rompu")) throw new Error("un seq rompu doit rester un FAIL : rien ne le déclare rectifiable");
});

check("ledger TF-0410 : append refuse un `ts` de payload ANTÉRIEUR au maximum, sans rien écrire", () => {
  const lf = join(out, "ts-append-garde.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "self-test-garde", ts: "2026-01-01T12:00:00Z" })]);
  const avant = readFileSync(lf, "utf8");
  try {
    execFileSync("node", [ledger, "append", lf, JSON.stringify({
      type: "mise_en_production", ts: "2026-01-01T09:00:00Z", detail: "heure du run Azure",
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
  const okOut = run(ledger, ["append", lf, JSON.stringify({ type: "note", ts: "2026-01-01T13:00:00Z", detail: "consignation fixée" })]);
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
  const ok = run(ledger, ["append", lf, JSON.stringify({ type: "note", ts: "2026-09-25T07:45:00.000Z", detail: "postérieur, écrit en UTC" })]);
  if (!ok.includes("[OK] entrée 2")) throw new Error("un ts postérieur écrit en UTC doit être accepté : " + ok);
  const avant = readFileSync(lf, "utf8");
  // Rouge : 09:40+02:00 (07:40Z) précède le maximum 07:45Z, alors que la chaîne est « plus grande ».
  for (const [ts, motif] of [["2026-09-25T09:40:00+02:00", "ANTÉRIEUR"], ["hier soir", "ILLISIBLE"]]) {
    let err = null;
    try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "note", ts, detail: "refus attendu" })], { encoding: "utf8", stdio: "pipe" }); }
    catch (e) { err = String(e.stderr || ""); }
    if (err === null) throw new Error(`append aurait dû refuser le ts ${ts}`);
    if (!err.includes("[LEDGER FAIL]") || !err.includes(motif)) throw new Error(`refus attendu nommant ${motif}, reçu : ${err.slice(0, 200)}`);
  }
  if (readFileSync(lf, "utf8") !== avant) throw new Error("le fichier a été modifié malgré un refus — un refus doit être sans écriture");
  // Le remède que le refus propose se joue (TF-1013) : sans `ts`, l'outil pose l'horodatage machine.
  run(ledger, ["append", lf, JSON.stringify({ type: "note", detail: "ts laissé à l outil" })]);
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
  try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "note" })], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || ""); }
  if (sortie === null) throw new Error("append aurait dû refuser une entrée réduite à son seul type");
  if (!sortie.includes("aucun contenu")) throw new Error("le refus ne dit pas pourquoi (aucun contenu) : " + sortie);
  // Le même refus vaut avec un `ts` fourni explicite — « et un ts éventuel » (b).
  let sortie2 = null;
  try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "note", ts: "2026-01-01T00:00:00Z" })], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie2 = String(e.stderr || ""); }
  if (sortie2 === null) throw new Error("append aurait dû refuser une entrée réduite à son type + ts");
  const lignes = readFileSync(lf, "utf8").split("\n").filter(Boolean);
  if (lignes.length !== 1) throw new Error(`1 entrée attendue (l amorce), ${lignes.length} — un refus a laissé passer une écriture`);
});

check("ledger TF-1366 (b) : une entrée avec du contenu au-delà de `type`/`ts` reste acceptée (la règle ne déborde pas)", () => {
  const lf = join(out, "ledger-avec-contenu.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", substrat: "x" })]);
  run(ledger, ["append", lf, JSON.stringify({ type: "note", detail: "un contenu" })]);
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
  run(ledger, ["append", lf, JSON.stringify({ type: "note", detail: "deuxieme" })]);
  let sortie = null;
  try { execFileSync("node", [ledger, "append", lf, JSON.stringify({ type: "note", detail: "recopie", seq: 2 })], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { sortie = String(e.stderr || ""); }
  if (sortie === null) throw new Error("append aurait dû refuser un `seq` fourni par le payload");
  if (!sortie.includes("`seq`")) throw new Error("le refus ne nomme pas le champ seq : " + sortie);
  const avant = readFileSync(lf, "utf8").split("\n").filter(Boolean);
  if (avant.length !== 2) throw new Error(`2 entrées attendues après le refus, ${avant.length} — un refus a laissé passer une écriture`);
  run(ledger, ["append", lf, JSON.stringify({ type: "note", detail: "recopie" })]);
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

rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
console.log(`\nSelf-test forge-agents : ${pass} PASS, ${failCount} FAIL`);
process.exit(failCount === 0 ? 0 : 1);
