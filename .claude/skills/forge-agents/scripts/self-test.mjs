#!/usr/bin/env node
/**
 * self-test.mjs — rejoue les fixtures du compilateur (1 verte, 3 rouges) et le cycle ledger.
 * Exit 0 si tous les contrôles passent, 1 sinon. À rejouer après toute modification du skill.
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdtempSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");
const compile = join(here, "compile-agent-def.mjs");
const ledger = join(here, "ledger.mjs");
const oracledefs = join(here, "oracle-defs.mjs");
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

rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
console.log(`\nSelf-test forge-agents : ${pass} PASS, ${failCount} FAIL`);
process.exit(failCount === 0 ? 0 : 1);
