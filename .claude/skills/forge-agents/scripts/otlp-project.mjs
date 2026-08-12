#!/usr/bin/env node
/**
 * otlp-project.mjs — projette un ledger.jsonl (append-only, format `ledger.mjs` INCHANGÉ) en
 * spans OTLP/JSON conformes aux OpenTelemetry GenAI Semantic Conventions (TF-0106, sous-item 1).
 *
 * Projection = artefact dérivé, jamais un exporteur réseau : ce script écrit un FICHIER
 * OTLP/JSON (schéma ExportTraceServiceRequest). Aucun appel HTTP/gRPC n'est émis — la sortie
 * est consommable par tout backend d'observabilité qui sait lire ce format (import manuel ou
 * pipeline externe), zéro dépendance (node builtins uniquement : fs, crypto, child_process).
 *
 * Contrat :
 *  - le ledger source n'est jamais modifié ni réinterprété hors de son format existant
 *    (aucun champ ajouté au ledger, aucune écriture dans le fichier source) ;
 *  - un ledger qui échoue `ledger.mjs verify` est REFUSÉ (fail-closed) : jamais de spans
 *    projetés depuis une source dont l'intégrité append-only n'est pas prouvée ;
 *  - un ledger.jsonl = un run = UNE trace. Modèle PLAT v0 : tous les spans hors `run_open`
 *    sont des enfants directs du span racine, pas de sous-portées imbriquées par agent/étape
 *    — limitation documentée (references/otlp-genai.md), pas un défaut caché ;
 *  - durée de span : le ledger ne mesure aucune durée réelle par entrée (un seul horodatage
 *    par ligne). Convention affichée et jamais maquillée en mesure : `end = start + 1 ms`.
 *    Seul le span racine (run_open → run_close) porte une durée réellement mesurée.
 *
 * Usage : node otlp-project.mjs <ledger.jsonl> --out <spans.json>
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER_CLI = join(HERE, "ledger.mjs");

function fail(msg) { console.error(`[REFUS] ${msg}`); process.exit(1); }

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const ledgerFile = args.find((a) => !a.startsWith("--"));
if (!ledgerFile) fail("usage : otlp-project.mjs <ledger.jsonl> --out <spans.json>");
if (outIdx === -1 || !args[outIdx + 1])
  fail("--out <fichier.json> obligatoire : la projection est un artefact nommé, jamais un flux implicite sur stdout");
const outFile = args[outIdx + 1];
if (!existsSync(ledgerFile)) fail(`ledger introuvable : ${ledgerFile}`);

// 1) le ledger source doit prouver son intégrité append-only AVANT toute projection.
try {
  execFileSync(process.execPath, [LEDGER_CLI, "verify", ledgerFile], { encoding: "utf8", stdio: "pipe" });
} catch (e) {
  const reason = String(e.stderr || e.message || "").trim().slice(0, 200);
  fail(`ledger non intègre — projection refusée (${reason})`);
}

const lines = readFileSync(ledgerFile, "utf8").split("\n").filter(Boolean);
const entries = lines.map((l) => JSON.parse(l));
if (!entries.length || entries[0].type !== "run_open")
  fail("ledger sans entrée run_open en tête — devrait déjà être refusé par verify");

const RUN_KEY = entries[0].run || entries[0].ticket || basename(ledgerFile);
const traceId = createHash("sha256").update(`trace:${RUN_KEY}`).digest("hex").slice(0, 32);
const spanIdFor = (seq) => createHash("sha256").update(`span:${RUN_KEY}:${seq}`).digest("hex").slice(0, 16);

function nsFromIso(ts) {
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) fail(`horodatage invalide dans le ledger : « ${ts} »`);
  return BigInt(ms) * 1_000_000n;
}

function anyValue(v) {
  if (typeof v === "string") return { stringValue: v.length > 500 ? `${v.slice(0, 500)}…` : v };
  if (typeof v === "number") return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { boolValue: v };
  if (Array.isArray(v))
    return { arrayValue: { values: v.map((x) => anyValue(typeof x === "string" || typeof x === "number" || typeof x === "boolean" ? x : JSON.stringify(x))) } };
  return { stringValue: JSON.stringify(v).slice(0, 500) };
}
const attr = (key, value) => ({ key, value: anyValue(value) });

const STATUS_UNSET = 0, STATUS_OK = 1, STATUS_ERROR = 2;
function statusOf(e) {
  const probe = [e.verdict, e.decision, e.statut].filter(Boolean).join(" ");
  if (/FAIL|echec|block|invalide|ARBITRAGE_HUMAIN/i.test(probe)) return { code: STATUS_ERROR, message: probe.slice(0, 200) };
  if (/PASS|^ok$|closed|receipt_ok|count_task|pass_direct|appel_autorise/i.test(probe)) return { code: STATUS_OK };
  return { code: STATUS_UNSET };
}

// Attributs custom : namespace `forge.*`, jamais mêlé au namespace officiel `gen_ai.*` — on ne
// fabrique aucun attribut gen_ai.* absent de la spec pour loger des champs maison du ledger.
const SKIP_FIELDS = new Set(["seq", "ts", "type"]);
const forgeAttrs = (e) => Object.keys(e).filter((k) => !SKIP_FIELDS.has(k)).map((k) => attr(`forge.${k}`, e[k]));

const rootStart = nsFromIso(entries[0].ts);
const closeEntry = [...entries].reverse().find((e) => e.type === "run_close");
const rootEndCandidate = nsFromIso((closeEntry || entries[entries.length - 1]).ts);
const rootEnd = rootEndCandidate > rootStart ? rootEndCandidate : rootStart + 1_000_000n;
const rootSpanId = spanIdFor(entries[0].seq);

const spans = [];
spans.push({
  traceId,
  spanId: rootSpanId,
  name: `invoke_agent ${RUN_KEY}`,
  kind: 1, // SPAN_KIND_INTERNAL : portée d'orchestration du run, pas un appel modèle isolé
  startTimeUnixNano: rootStart.toString(),
  endTimeUnixNano: rootEnd.toString(),
  attributes: [
    attr("gen_ai.system", "digit-ai-forge-agents"),
    attr("gen_ai.operation.name", "invoke_agent"),
    attr("gen_ai.agent.name", RUN_KEY),
    ...forgeAttrs(entries[0]),
  ],
  status: statusOf(closeEntry || {}),
});

for (const e of entries.slice(1)) {
  const start = nsFromIso(e.ts);
  const end = start + 1_000_000n; // convention affichée, cf. en-tête — jamais une mesure réelle
  const isAgentSpan = Boolean(e.agent);
  const attributes = isAgentSpan
    ? [attr("gen_ai.system", "digit-ai-forge-agents"), attr("gen_ai.operation.name", "invoke_agent"), attr("gen_ai.agent.name", e.agent), ...forgeAttrs(e)]
    : forgeAttrs(e);
  if (e.ticket) attributes.push(attr("gen_ai.conversation.id", e.ticket));
  spans.push({
    traceId,
    spanId: spanIdFor(e.seq),
    parentSpanId: rootSpanId,
    name: isAgentSpan ? `invoke_agent ${e.agent}` : e.type,
    kind: isAgentSpan ? 3 : 1, // CLIENT pour un span d'agent (semconv GenAI), INTERNAL sinon
    startTimeUnixNano: start.toString(),
    endTimeUnixNano: end.toString(),
    attributes,
    status: statusOf(e),
  });
}

const otlp = {
  resourceSpans: [
    {
      resource: { attributes: [attr("service.name", "digit-ai-forge-agents"), attr("forge.ledger.source", ledgerFile)] },
      scopeSpans: [{ scope: { name: "digit-ai-forge-agents.otlp-project", version: "0.1.0" }, spans }],
    },
  ],
};

writeFileSync(outFile, JSON.stringify(otlp, null, 2), "utf8");
console.log(`[OK] ${spans.length} span(s) projeté(s) (trace ${traceId.slice(0, 8)}…) -> ${outFile}`);
