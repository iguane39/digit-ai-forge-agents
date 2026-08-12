#!/usr/bin/env node
// oracle-agent-evals — Domaine « Régression de qualité des sorties d'agents (juge distinct de
// l'exécutant, fixtures de régression versionnées) » (TF-0106, sous-item 3).
//
// Les 33+ oracles de quality-oracles jugent la conformité STRUCTURELLE de livrables (charte,
// format, sécurité...) — aucun ne rejoue, sur une sortie d'agent donnée, un jeu de critères figé
// pour détecter une RÉGRESSION de qualité au fil des versions d'un agent (esprit Braintrust/
// Langfuse : eval sets versionnés). Cet oracle comble ce trou dans le périmètre forge-agents,
// sans API tierce payante : la couche mécanique (EXISTS/CONTAINS/REGEX) est déterministe ; le
// juge sémantique distinct (quand un critère n'est pas mécanique) réutilise le CLI `claude -p`
// déjà installé de l'utilisateur — même discipline que quality-oracles/oracle-judge.mjs (D2/R10 :
// une instance séparée de l'exécutant), dupliquée ici en miniature pour ne pas coupler
// forge-agents à un autre skill (périmètre de campagne, TF-0106).
//
// Contrat quality-oracles standard : JSON {oracle, domaine, artefact, verdict, findings,
// non_juge}, exit 0 (PASS) / 1 (FAIL) / 2 (SKIP). Fail-closed : critère non mécanique sans juge
// disponible → SKIP motivé de tout l'oracle, JAMAIS un PASS de complaisance sur ce critère.
//
// Usage : node oracle-agent-evals.mjs <dossier-cas>
//   <dossier-cas>/cas.json   { agent, artefact, criteres: ["EXISTS:...","CONTAINS:...","REGEX:..."] }
//   <dossier-cas>/<artefact> sortie réelle (ou fixture) de l'agent jugé
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DOM = "Régression de qualité des sorties d'agents (fixtures versionnées, juge distinct de l'exécutant)";
const NON_JUGE = [
  "Sémantique hors des critères déclarés dans cas.json — le juge n'évalue jamais librement, seulement les critères figés du cas",
  "Critères non mécaniques (aucun préfixe EXISTS:/CONTAINS:/REGEX: reconnu) quand la CLI claude est indisponible — SKIP motivé, jamais simulé",
  "Coût/latence réels de l'agent jugé (hors périmètre — cf. sous-item budget gate, TF-0106)",
];

const TARGET = process.argv[2] || null;
function out(verdict, findings, code) {
  process.stdout.write(JSON.stringify({ oracle: "oracle-agent-evals", domaine: DOM, artefact: TARGET, verdict, findings, non_juge: NON_JUGE }));
  process.exit(code);
}

if (!TARGET || !fs.existsSync(TARGET) || !fs.statSync(TARGET).isDirectory())
  out("SKIP", [{ sev: "info", msg: "usage : oracle-agent-evals.mjs <dossier-cas> (cas.json + artefact attendus)" }], 2);

const casFile = path.join(TARGET, "cas.json");
if (!fs.existsSync(casFile)) out("SKIP", [{ sev: "info", msg: "cas.json absent du dossier-cas" }], 2);

let cas;
try { cas = JSON.parse(fs.readFileSync(casFile, "utf8")); }
catch (e) { out("SKIP", [{ sev: "info", msg: `cas.json invalide : ${e.message}` }], 2); }

if (!cas.agent || !cas.artefact || !Array.isArray(cas.criteres) || cas.criteres.length === 0)
  out("SKIP", [{ sev: "info", msg: "cas.json incomplet : agent, artefact et criteres (liste non vide) obligatoires" }], 2);

const artefactPath = path.join(TARGET, cas.artefact);
const artefactContent = fs.existsSync(artefactPath) ? fs.readFileSync(artefactPath, "utf8") : null;

const findings = [];
const nonMecaniques = [];

for (const crit of cas.criteres) {
  if (crit.startsWith("EXISTS:")) {
    const p = path.join(TARGET, crit.slice("EXISTS:".length));
    const okExists = fs.existsSync(p) && fs.statSync(p).size > 0;
    if (!okExists) findings.push({ sev: "bloquant", msg: `critère non satisfait : ${crit} (fichier absent ou vide)`, where: cas.agent });
  } else if (crit.startsWith("CONTAINS:")) {
    const motif = crit.slice("CONTAINS:".length);
    if (artefactContent === null) findings.push({ sev: "bloquant", msg: `critère non satisfait : ${crit} (artefact « ${cas.artefact} » absent)`, where: cas.agent });
    else if (!artefactContent.includes(motif)) findings.push({ sev: "bloquant", msg: `critère non satisfait : ${crit} (motif absent de « ${cas.artefact} »)`, where: cas.agent });
  } else if (crit.startsWith("REGEX:")) {
    const pattern = crit.slice("REGEX:".length);
    let re;
    try { re = new RegExp(pattern, "m"); } catch (e) { findings.push({ sev: "bloquant", msg: `critère « ${crit} » : regex invalide (${e.message})`, where: cas.agent }); continue; }
    if (artefactContent === null) findings.push({ sev: "bloquant", msg: `critère non satisfait : ${crit} (artefact « ${cas.artefact} » absent)`, where: cas.agent });
    else if (!re.test(artefactContent)) findings.push({ sev: "bloquant", msg: `critère non satisfait : ${crit} (aucune correspondance dans « ${cas.artefact} »)`, where: cas.agent });
  } else {
    // critère nécessitant un jugement sémantique : juge distinct via CLI claude -p (fail-closed
    // si indisponible — jamais un PASS de complaisance sur un critère non vérifié).
    nonMecaniques.push(crit);
  }
}

if (nonMecaniques.length > 0) {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" });
  if (which.status !== 0)
    out("SKIP", [...findings, { sev: "info", msg: `${nonMecaniques.length} critère(s) non mécanique(s) et CLI claude indisponible — juge distinct non exécutable, jamais simulé : ${nonMecaniques.join(" | ")}` }], 2);

  let jugeCmd = "claude", jugePre = [];
  if (process.platform === "win32") {
    const shim = (which.stdout || "").split(/\r?\n/).find(Boolean);
    const candidats = [
      process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
      shim && path.join(path.dirname(shim), "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    ].filter(Boolean);
    const cli = candidats.find((c) => fs.existsSync(c));
    if (cli) { jugeCmd = process.execPath; jugePre = [cli]; }
    else {
      const exes = [
        process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
        shim && path.join(path.dirname(shim), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
      ].filter(Boolean);
      const exe = exes.find((c) => fs.existsSync(c));
      if (exe) { jugeCmd = exe; jugePre = []; }
    }
  }
  const prompt = [
    "Tu es un juge distinct de l'agent qui a produit ce texte (jamais l'auteur qui se note).",
    `Agent jugé : ${cas.agent}`,
    "Réponds STRICTEMENT en JSON : {\"verdicts\":[{\"critere\":\"...\",\"verdict\":\"PASS\"|\"FAIL\",\"motif\":\"...\"}]}",
    "Un verdict par critère listé ci-dessous, dans l'ordre. Aucun texte hors ce JSON.",
    "", "--- CRITÈRES À JUGER ---", ...nonMecaniques.map((c) => `- ${c}`),
    "", "--- SORTIE DE L'AGENT À ÉVALUER ---", (artefactContent ?? "(artefact absent)").slice(0, 20000),
  ].join("\n");
  const r = spawnSync(jugeCmd, [...jugePre, "-p", prompt, "--output-format", "text"], { encoding: "utf8", timeout: 180000 });
  if (r.error || r.status !== 0)
    out("SKIP", [...findings, { sev: "info", msg: "appel du juge distinct en échec — jamais simulé" }], 2);
  let j = null; try { j = JSON.parse((r.stdout.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { /* sortie hors contrat */ }
  if (!j || !Array.isArray(j.verdicts))
    out("SKIP", [...findings, { sev: "info", msg: "sortie du juge distinct hors contrat — non retenue" }], 2);
  for (const v of j.verdicts)
    if (v.verdict === "FAIL") findings.push({ sev: "bloquant", msg: `critère non satisfait (juge distinct) : ${v.critere} — ${String(v.motif || "").slice(0, 200)}`, where: cas.agent });
}

const bloquants = findings.filter((f) => f.sev === "bloquant");
if (bloquants.length) out("FAIL", findings, 1);
out("PASS", findings.length ? findings : [{ sev: "info", msg: `${cas.criteres.length} critère(s) satisfait(s) pour l'agent « ${cas.agent} »` }], 0);
