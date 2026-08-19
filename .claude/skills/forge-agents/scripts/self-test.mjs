#!/usr/bin/env node
/**
 * self-test.mjs — rejoue les fixtures du compilateur (1 verte, 3 rouges) et le cycle ledger.
 * Exit 0 si tous les contrôles passent, 1 sinon. À rejouer après toute modification du skill.
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdtempSync, appendFileSync, existsSync } from "node:fs";
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

check("ledger TF-0385 : `oracles_verdict` sans `oracle` → FAIL qui NOMME le champ", () => {
  const lf = join(out, "ledger-schema-rouge.jsonl");
  run(ledger, ["append", lf, JSON.stringify({ type: "run_open", schema_ledger: "1.0" })]);
  // La forme réellement rencontrée : un `oracles` imbriqué, aucun verdict de premier niveau.
  run(ledger, ["append", lf, JSON.stringify({
    type: "oracles_verdict", etape: "tests", oracles: { forge_tests: "PARTIEL" },
  })]);
  let sortie = null;
  try { execFileSync("node", [ledger, "verify", lf], { stdio: "pipe" }); }
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

rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
console.log(`\nSelf-test forge-agents : ${pass} PASS, ${failCount} FAIL`);
process.exit(failCount === 0 ? 0 : 1);
