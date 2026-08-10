#!/usr/bin/env node
// oracle-defs — Domaine « Cohérence du graphe des définitions d'agents (de:/vers:) ».
// Complète compile-agent-def.mjs (qui valide CHAQUE def isolément) par la validation
// TRANSVERSALE du lot : la spec agent-def dit « chaque sortie est l'entrée d'exactement un
// agent aval ou un livrable final ; sortie orpheline = erreur → stop », mais rien ne le
// contrôlait sur l'ensemble. Ici on vérifie les liens def→def, sans faux positif sur les
// sentinelles (entrant humain, orchestrateur, livrable-final) qui restent non jugées.
// Standard quality-oracles §3 : déterministe, contrat JSON, exit 0/1/2, non_juge déclaré,
// sortie localisante, prouvé par fixtures (self-test.mjs).
//
// Usage : node oracle-defs.mjs <dossier-de-defs | def1.yaml def2.yaml ...>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { parseAgentDef } from "./compile-agent-def.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPILER = path.join(HERE, "compile-agent-def.mjs");
const DOM = "Cohérence du graphe des définitions d'agents (de:/vers:)";
const NON_JUGE = [
  "Liens de:/vers: pointant vers un non-agent (entrant humain, orchestrateur, fusion-orchestrateur, livrable-final) — cohérence non vérifiable au niveau du lot",
  "Sémantique métier des mandats et des critères d'arbitre (jugement humain / experts-forge)",
  "Existence réelle des artefacts sur disque au moment du run (contrôlé à l'exécution, pas ici)",
];

function out(verdict, findings, code) {
  process.stdout.write(JSON.stringify({ oracle: "oracle-defs", domaine: DOM, artefact: TARGET, verdict, findings, non_juge: NON_JUGE }));
  process.exit(code);
}

// --- collecte des fichiers ---
const rawArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
let TARGET = rawArgs[0] || null;
let files = [];
if (rawArgs.length === 1 && fs.existsSync(rawArgs[0]) && fs.statSync(rawArgs[0]).isDirectory()) {
  files = fs.readdirSync(rawArgs[0]).filter((f) => f.endsWith(".yaml")).map((f) => path.join(rawArgs[0], f));
} else {
  files = rawArgs.filter((f) => f.endsWith(".yaml"));
  TARGET = files.length === 1 ? files[0] : (rawArgs.length ? "lot de defs" : null);
}
if (!files.length) out("SKIP", [{ sev: "info", msg: "aucun fichier .yaml de def fourni" }], 2);

const findings = [];
const defs = []; // { id, file, entrees:[{artefact,de}], sorties:[{artefact,vers}] }

// --- 1) validité par def : déléguée au compilateur (porte fail-closed), sans tuer l'oracle ---
const tmpOut = fs.mkdtempSync(path.join(tmpdir(), "oracle-defs-"));
for (const f of files) {
  const base = path.basename(f);
  try {
    execFileSync("node", [COMPILER, f, "--out", tmpOut], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    const reason = String(e.stderr || e.message || "").replace(/\s+/g, " ").trim().slice(0, 200);
    findings.push({ sev: "bloquant", msg: `def invalide (compilateur) : ${reason}`, where: base });
    continue; // pas d'analyse de graphe sur une def invalide
  }
  const def = parseAgentDef(fs.readFileSync(f, "utf8"), base); // sûr : la def vient de passer le compilateur
  defs.push({
    id: def.id, file: base,
    entrees: (def.entrees || []).map((e) => ({ artefact: e.artefact, de: e.de })),
    sorties: (def.sorties || []).map((s) => ({ artefact: s.artefact, vers: s.vers })),
  });
}

// --- 2) index et unicité des id ---
const byId = new Map();
for (const d of defs) {
  if (byId.has(d.id)) findings.push({ sev: "bloquant", msg: `id dupliqué « ${d.id} » (aussi dans ${byId.get(d.id).file})`, where: d.file });
  else byId.set(d.id, d);
}

// --- 3) cohérence des liens def→def (les seuls vérifiables sans faux positif) ---
for (const d of defs) {
  // entrées : { de: <autre def> } ⇒ cette def doit produire l'artefact
  for (const e of d.entrees) {
    if (e.de && byId.has(e.de)) {
      const prod = byId.get(e.de);
      if (!prod.sorties.some((s) => s.artefact === e.artefact))
        findings.push({ sev: "majeur", msg: `entrée « ${e.artefact} » dit venir de « ${e.de} », mais « ${e.de} » ne produit pas cet artefact`, where: `${d.file} (entrees)` });
    }
  }
  // sorties : { vers: <autre def> } ⇒ cette def doit lire l'artefact
  for (const s of d.sorties) {
    if (s.vers && byId.has(s.vers)) {
      const cons = byId.get(s.vers);
      if (!cons.entrees.some((e) => e.artefact === s.artefact))
        findings.push({ sev: "majeur", msg: `sortie « ${s.artefact} » dit aller vers « ${s.vers} », mais « ${s.vers} » ne lit pas cet artefact`, where: `${d.file} (sorties)` });
    }
  }
}

// --- 4) cycles sur les arêtes def→def (de:) ---
const adj = new Map(defs.map((d) => [d.id, []]));
for (const d of defs)
  for (const e of d.entrees)
    if (e.de && byId.has(e.de)) adj.get(e.de).push(d.id); // producteur → consommateur
const WHITE = 0, GREY = 1, BLACK = 2;
const color = new Map(defs.map((d) => [d.id, WHITE]));
let cycleNode = null;
function dfs(u) {
  color.set(u, GREY);
  for (const v of adj.get(u) || []) {
    if (color.get(v) === GREY) { cycleNode = v; return true; }
    if (color.get(v) === WHITE && dfs(v)) return true;
  }
  color.set(u, BLACK);
  return false;
}
for (const d of defs) if (color.get(d.id) === WHITE && dfs(d.id)) break;
if (cycleNode) findings.push({ sev: "bloquant", msg: `cycle détecté dans le graphe des defs (implique « ${cycleNode} ») — le workflow doit être un DAG`, where: "lot" });

// --- verdict ---
const dur = findings.filter((f) => f.sev === "bloquant" || f.sev === "majeur");
if (dur.length) out("FAIL", findings, 1);
out("PASS", findings.length ? findings : [{ sev: "info", msg: `${defs.length} def(s), graphe def→def cohérent` }], 0);
