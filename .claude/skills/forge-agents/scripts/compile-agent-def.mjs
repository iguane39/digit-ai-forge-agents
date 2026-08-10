#!/usr/bin/env node
/**
 * compile-agent-def.mjs — façade Claude Code de forge-agents.
 * Compile des définitions agent.def (sous-ensemble YAML documenté dans references/agent-def.md)
 * en subagents `.claude/agents/<id>.md`. Fail-closed : champ obligatoire manquant, champ
 * inconnu, liste d'outils vide ou id invalide => refus (exit 1), aucune écriture partielle.
 *
 * Usage : node compile-agent-def.mjs <def1.yaml> [def2.yaml ...] --out <dir>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";

const MANDATORY = ["id", "mandat", "outils", "arbitre", "entrees", "sorties"];
const OPTIONAL = ["parallel", "skill", "expert_refs", "provenance"];

function fail(msg) { console.error(`[REFUS] ${msg}`); process.exit(1); }

function stripQuotes(s) {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  return s;
}

function parseInlineArray(s) {
  const inner = s.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (inner === "") return [];
  return inner.split(",").map((x) => stripQuotes(x));
}

function parseInlineObject(s) {
  const inner = s.trim().replace(/^\{/, "").replace(/\}$/, "").trim();
  const obj = {};
  for (const part of inner.split(",")) {
    const i = part.indexOf(":");
    if (i === -1) fail(`objet inline invalide : ${s}`);
    obj[stripQuotes(part.slice(0, i))] = stripQuotes(part.slice(i + 1));
  }
  return obj;
}

/** Parseur du sous-ensemble YAML d'agent.def (clés racine, listes "- ", inline [..] et {..}). */
export function parseAgentDef(text, file) {
  const doc = {};
  let currentKey = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^[A-Za-z_][\w]*:/.test(line)) {
      const i = line.indexOf(":");
      const key = line.slice(0, i).trim();
      const val = line.slice(i + 1).trim();
      currentKey = key;
      if (val === "") doc[key] = [];
      else if (val.startsWith("[")) doc[key] = parseInlineArray(val);
      else if (val.startsWith("{")) doc[key] = parseInlineObject(val);
      else doc[key] = stripQuotes(val);
    } else if (/^\s+-\s+/.test(line)) {
      if (!currentKey || !Array.isArray(doc[currentKey]))
        fail(`${file}: élément de liste hors liste (« ${line.trim()} »)`);
      const item = line.replace(/^\s+-\s+/, "").trim();
      doc[currentKey].push(item.startsWith("{") ? parseInlineObject(item) : stripQuotes(item));
    } else {
      fail(`${file}: ligne non reconnue par le sous-ensemble agent.def : « ${line.trim()} »`);
    }
  }
  return doc;
}

export function validate(def, file) {
  for (const k of Object.keys(def))
    if (!MANDATORY.includes(k) && !OPTIONAL.includes(k))
      fail(`${file}: champ inconnu « ${k} » (6 champs obligatoires max + ${OPTIONAL.join("/")})`);
  for (const k of MANDATORY) {
    const v = def[k];
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0))
      fail(`${file}: champ obligatoire manquant ou vide « ${k} »`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(def.id)) fail(`${file}: id invalide « ${def.id} » (slug attendu)`);
  if (!Array.isArray(def.outils)) fail(`${file}: outils doit être une liste fermée`);
  if (!Array.isArray(def.arbitre)) fail(`${file}: arbitre doit être une liste de critères`);
  for (const side of ["entrees", "sorties"])
    for (const e of def[side])
      if (typeof e !== "object" || !e.artefact)
        fail(`${file}: ${side} — chaque élément doit être { artefact: …, ${side === "entrees" ? "de" : "vers"}: … }`);
  // provenance (optionnel) — traçabilité d'une capacité importée d'une source externe.
  // { source, author, confidence, date } ; confidence ∈ [0,1]. Fail-closed si présent mais mal formé.
  if (def.provenance !== undefined) {
    const p = def.provenance;
    if (typeof p !== "object" || Array.isArray(p))
      fail(`${file}: provenance doit être un objet { source: …, author: …, confidence: …, date: … }`);
    for (const k of ["source", "author", "confidence", "date"])
      if (p[k] === undefined || p[k] === "")
        fail(`${file}: provenance — sous-champ obligatoire manquant « ${k} »`);
    const c = Number(p.confidence);
    if (!Number.isFinite(c) || c < 0 || c > 1)
      fail(`${file}: provenance.confidence « ${p.confidence} » hors bornes — attendu un nombre dans [0,1]`);
  }
}

function render(def) {
  const lines = [];
  lines.push("---");
  lines.push(`name: ${def.id}`);
  lines.push(`description: ${def.mandat}`);
  lines.push(`tools: ${def.outils.join(", ")}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${def.id}`);
  lines.push("");
  lines.push(`## Mandat`);
  lines.push(def.skill ? `${def.mandat} — mandat opératoire : charger le skill \`${def.skill}\`.` : def.mandat);
  lines.push("");
  lines.push(`## Arbitre — critères binaires figés (arbitrage à charge)`);
  for (const c of def.arbitre) lines.push(`- [ ] ${c} — ✓ seulement avec preuve citable, ✗ avec raison réexploitable`);
  lines.push("");
  lines.push(`## Entrées (seules lectures autorisées)`);
  for (const e of def.entrees) lines.push(`- ${e.artefact} (de : ${e.de ?? "entrant humain"})`);
  lines.push("");
  lines.push(`## Sorties (chacune avec en-tête de provenance)`);
  for (const s of def.sorties) lines.push(`- ${s.artefact} (vers : ${s.vers ?? "livrable final"})`);
  if (def.expert_refs?.length) {
    lines.push("");
    lines.push(`## Experts consommés (fiches en statut « ok » uniquement)`);
    for (const x of def.expert_refs) lines.push(`- ${x}`);
  }
  if (def.provenance) {
    const p = def.provenance;
    lines.push("");
    lines.push(`## Provenance (capacité importée)`);
    lines.push(`- source : ${p.source} · auteur : ${p.author} · confiance : ${p.confidence} · date : ${p.date}`);
    lines.push(`- Capacité issue d'une source externe — à traiter comme hypothèse pondérée par la confiance, jamais comme vérité établie.`);
  }
  lines.push("");
  lines.push(`## Règles de frontière`);
  lines.push(`- Ne lire que les entrées déclarées ci-dessus — jamais le contexte d'autres agents.`);
  lines.push(`- Chaque sortie porte un en-tête de provenance : agent émetteur, verdict d'arbitre, hypothèses non résolues.`);
  lines.push(`- Un ✗ traverse la frontière signalé — jamais masqué. Consigner chaque étape au ledger du run.`);
  return lines.join("\n") + "\n";
}

// --- main (exécution directe seulement ; sinon module réutilisable par les oracles) ---
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  if (outIdx === -1 || !args[outIdx + 1]) fail("usage : compile-agent-def.mjs <defs…> --out <dir>");
  const outDir = args[outIdx + 1];
  const files = args.slice(0, outIdx);
  if (files.length === 0) fail("aucun fichier agent.def fourni");

  const compiled = [];
  const ids = new Set();
  for (const f of files) {
    if (!existsSync(f)) fail(`fichier introuvable : ${f}`);
    const def = parseAgentDef(readFileSync(f, "utf8"), basename(f));
    validate(def, basename(f));
    if (ids.has(def.id)) fail(`id dupliqué dans le run : « ${def.id} »`);
    ids.add(def.id);
    compiled.push({ id: def.id, content: render(def) });
  }
  // écriture atomique après validation de TOUT le lot (aucune écriture partielle)
  mkdirSync(outDir, { recursive: true });
  for (const c of compiled) writeFileSync(join(outDir, `${c.id}.md`), c.content, "utf8");
  console.log(`[OK] ${compiled.length} agent(s) compilé(s) → ${outDir}`);
}
