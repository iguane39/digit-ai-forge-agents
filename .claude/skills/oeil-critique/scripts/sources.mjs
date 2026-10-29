#!/usr/bin/env node
/**
 * sources.mjs — ce que la conversation ne montre pas, relevé pour l'analyse : les produits, l'existant,
 * les process silencieux. Chaque relevé est un résumé chiffré, pseudonymisé, que l'agent de la mission
 * lit comme une donnée.
 *
 * Pourquoi il existe (D-95 (b) du 29/10/2026, fiche `output/03-etudes/Digit-AI - Fiche - Oeil critique
 * actions pour tenir les 8 demandes - 20261029c.md` du pilot, actions 1 à 3). La version 1.1 ne lisait
 * que les transcripts et le journal git. Elle ne voyait donc ni une correction qui n'atteint pas les
 * produits (demande du 03/09), ni le code et les items clos (17/09), ni un process coûteux dont
 * personne ne parle (20/10). Chaque source avait déjà son script ou son fichier au pilot : ce module
 * les lit, il ne relance rien qui écrive.
 *
 * Usage :
 *   node sources.mjs produits   --depuis <iso> [--pilot <chemin>]
 *       → héritage des produits au dernier relevé d'ouverture (`todo/HERITAGE-RELEVES.jsonl`), items
 *         corrigés de la période et leur descente déclarée, traces de mobilisation des forges
 *         (`forge/mobilisation.jsonl` des produits relevés à l'ouverture), chaque produit nommé par
 *         `scripts/lib-pseudonyme-produit.mjs` du pilot : un produit hors table n'est jamais nommé.
 *   node sources.mjs existant   --depuis <iso> [--pilot <chemin>]
 *       → contrôles sans appelant (`scripts/relever-appelants.mjs --json`), contrôles injoignables
 *         (`oracles/oracle-controles-injoignables.mjs --json`), items clos de la période sans gain
 *         constaté, lots de retours de la période et le sort de leurs items.
 *   node sources.mjs silencieux --depuis <iso> [--profils <d1;d2>] [--pilot <chemin>]
 *       → durée des hooks lue aux transcripts (jamais relancés), familles d'avertissements du relevé
 *         d'ouverture par nombre de sessions, domaines d'oracle sans un échec sur la période.
 *   node sources.mjs --self-test
 * Sortie JSON, exit 0 / 1 (refus) / 2 (usage).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { pilot, valeur, transcripts } from "./lib.mjs";

const lignesJson = (f) => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];

/** L'état courant de chaque item du registre : ses événements fusionnés dans l'ordre. */
export function etatRegistre(racine) {
  const etats = new Map();
  for (const ev of lignesJson(join(racine, "todo", "TODO.jsonl"))) if (ev.id) etats.set(ev.id, { ...(etats.get(ev.id) || {}), ...ev });
  return etats;
}

const jourDe = (iso) => String(iso).slice(0, 10);
const corrigesDepuis = (etats, depuis) => [...etats.values()].filter((x) => x.statut === "corrige" && jourDe(x.date_correction || x.ts) >= jourDe(new Date(Date.parse(depuis)).toISOString()));

function jouer(racine, script, args) {
  const r = spawnSync(process.execPath, [join(racine, script), ...args], { cwd: racine, encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  try { return JSON.parse(r.stdout); } catch { return { illisible: true, exit: r.status, tete: String(r.stderr || r.stdout || "").slice(0, 200) }; }
}

// ── Action 1 : les produits ─────────────────────────────────────────────────────────────────────
export function produits(racine, depuis, pseudoProduit) {
  const her = lignesJson(join(racine, "todo", "HERITAGE-RELEVES.jsonl")).pop() || null;
  const heritage = her ? {
    releve_le: her.ts, contrat: her.contrat,
    produits: her.produits.map((p) => ({ produit: p.produit, absents: p.absents, divergents: p.divergents, incomplets: p.incomplets, total: p.total }))
      .sort((a, b) => (b.absents + b.divergents) - (a.absents + a.divergents)),
  } : null;
  const corrections = corrigesDepuis(etatRegistre(racine), depuis).map((x) => ({ id: x.id, titre: String(x.titre || "").slice(0, 140), date_correction: x.date_correction || null, descente_declaree: Boolean(x.descente || x.produits_beneficiaires) }));
  let chemins = [];
  try { chemins = Object.keys(JSON.parse(readFileSync(join(racine, ".oracles", "produits-au-demarrage.json"), "utf8")).produits || {}); } catch { /* aucun relevé des produits : dit par la liste vide */ }
  const depuisMs = Date.parse(depuis);
  const mobilisation = chemins.map((p) => {
    const lignes = lignesJson(join(p, "forge", "mobilisation.jsonl")).filter((l) => Date.parse(l.ts) >= depuisMs);
    const ecartees = {};
    for (const l of lignes) for (const [forge, v] of Object.entries(l.verdicts || {})) if (v && v.verdict === "ecartee") ecartees[forge] = (ecartees[forge] || 0) + 1;
    return { produit: pseudoProduit(relative(join(racine, ".."), p).replaceAll("\\", "/")), demandes_tracees: lignes.length, ecartees };
  });
  return { heritage, corrections, mobilisation, produits_sans_trace: mobilisation.filter((m) => !m.demandes_tracees).length };
}

// ── Action 2 : l'existant ───────────────────────────────────────────────────────────────────────
export function lots(racine, depuis, etats) {
  const dossier = join(racine, "input", "00-retours");
  const noms = [];
  const marcher = (d) => { if (!existsSync(d)) return; for (const n of readdirSync(d, { withFileTypes: true })) { if (n.isDirectory()) marcher(join(d, n.name)); else if (/ - RETOURS - \d{8}[a-z]*\.md$/.test(n.name)) noms.push(n.name.replace(/\.md$/, "")); } };
  marcher(dossier);
  const borne = jourDe(new Date(Date.parse(depuis)).toISOString()).replaceAll("-", "");
  const items = [...etats.values()];
  return noms.filter((n) => (/(\d{8})[a-z]*$/.exec(n) || [])[1] >= borne).sort().map((n) => {
    const lies = items.filter((x) => JSON.stringify(x).includes(n));
    const statuts = {};
    for (const x of lies) statuts[x.statut || "?"] = (statuts[x.statut || "?"] || 0) + 1;
    return { lot: n, items: lies.length, statuts };
  });
}

export function existant(racine, depuis) {
  const app = jouer(racine, "scripts/relever-appelants.mjs", ["--json"]);
  const inj = jouer(racine, "oracles/oracle-controles-injoignables.mjs", ["--json"]);
  const etats = etatRegistre(racine);
  const clos = corrigesDepuis(etats, depuis);
  return {
    sans_appelant: app.illisible ? app : { controles: app.controles, nombre: app.nombre_sans_appelant, liste: (app.sansAppelant || []).slice(0, 40) },
    injoignables: inj.illisible ? inj : { verdict: inj.verdict, en_defaut: (inj.findings || []).filter((f) => f.statut === "FAIL").map((f) => ({ regle: f.regle, message: String(f.message).slice(0, 300) })) },
    items_clos: clos.length,
    clos_sans_gain_constate: clos.filter((x) => !String(x.gains_constates || "").trim()).map((x) => ({ id: x.id, titre: String(x.titre || "").slice(0, 140) })),
    lots: lots(racine, depuis, etats),
  };
}

// ── Action 3 : les process silencieux ───────────────────────────────────────────────────────────
/** Le nom court d'une commande de hook : le script, et le mot qui le suit s'il n'est pas une option. */
export const nomCommande = (c) => {
  const m = /([\w.-]+\.(?:mjs|cjs|js|py|cmd|sh|ps1))["']?(?:\s+([a-z][\w-]*))?/i.exec(String(c));
  return m ? (m[2] ? `${m[1]} ${m[2]}` : m[1]) : String(c).slice(0, 60);
};
/** Une ligne d'avertissement du relevé, réduite à sa famille : chiffres et chemins effacés. */
export const famille = (l) => l.replace(/[A-Z]:[\\/][^\s,;)]*|`[^`]*`/g, "…").replace(/\d+([.,]\d+)?/g, "N").replace(/\s+/g, " ").trim().slice(0, 110);
const ALERTE = /\[avert\]|DÉFAUT|DÉRIVE|NON mesur|NON PROTÉG|ILLISIBLE|verdict FAIL|\bFAIL\b|DÉCLENCHEUR|À TRAITER/;

export function lireHooks(fichiers, depuisMs, anonymiser) {
  const durees = new Map(), familles = new Map();
  let sessions = 0;
  for (const f of fichiers) {
    let vue = false;
    const vues = new Set();
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (!l || !l.includes('"attachment"')) continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      if (o.type !== "attachment" || !o.attachment || Date.parse(o.timestamp) < depuisMs) continue;
      const a = o.attachment;
      vue = true;
      if (Number.isFinite(a.durationMs) && a.command) {
        const k = `${a.hookEvent || "?"} ${nomCommande(anonymiser(a.command).texte)}`;
        if (!durees.has(k)) durees.set(k, []);
        durees.get(k).push(a.durationMs);
      }
      if (a.hookEvent === "SessionStart" && /hook-ouverture/.test(String(a.command))) {
        let texte = String(a.stdout || "");
        try { texte = JSON.parse(texte).hookSpecificOutput.additionalContext || texte; } catch { /* sortie texte brute */ }
        for (const ligne of texte.split("\n")) if (ALERTE.test(ligne)) vues.add(famille(anonymiser(ligne).texte));
      }
    }
    if (vue) sessions++;
    for (const v of vues) familles.set(v, (familles.get(v) || 0) + 1);
  }
  const med = (t) => { const s = [...t].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return {
    sessions_lues: sessions,
    hooks: [...durees].map(([k, t]) => ({ hook: k, executions: t.length, mediane_ms: med(t), max_ms: Math.max(...t), total_ms: t.reduce((a, b) => a + b, 0) })).sort((a, b) => b.total_ms - a.total_ms).slice(0, 15),
    avertissements: [...familles].map(([famille, sessions]) => ({ famille, sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 20),
  };
}

export function domainesMuets(racine, depuis) {
  const depuisIso = new Date(Date.parse(depuis)).toISOString();
  const passages = new Map(), echecs = new Map();
  const marcher = (d) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, n.name);
      if (n.isDirectory()) { if (![".git", "node_modules", "worktrees"].includes(n.name)) marcher(p); continue; }
      if (!n.name.endsWith(".oracles.json") || !p.includes(`${sep}.oracles${sep}`)) continue;
      let j; try { j = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
      const histo = lignesJson(p.replace(/\.oracles\.json$/, ".oracles-historique.jsonl")).filter((h) => String(h.date_iso) >= depuisIso);
      if (!histo.length) continue;
      for (const r of j.resultats || []) passages.set(r.domaine, (passages.get(r.domaine) || 0) + histo.length);
      for (const h of histo) for (const f of h.fails || []) { const dom = String(f).split(":")[0]; echecs.set(dom, (echecs.get(dom) || 0) + 1); }
    }
  };
  marcher(join(racine, ".oracles"));
  return [...passages].map(([domaine, n]) => ({ domaine, passages: n, echecs: echecs.get(domaine) || 0 })).filter((d) => !d.echecs).sort((a, b) => b.passages - a.passages);
}

export function silencieux(racine, depuis, profils, anonymiser) {
  const depuisMs = Date.parse(depuis);
  const fichiers = profils.flatMap((p) => transcripts(p, depuisMs));
  return { ...lireHooks(fichiers, depuisMs, anonymiser), domaines_sans_echec: domainesMuets(racine, depuis) };
}

// ── Self-test ───────────────────────────────────────────────────────────────────────────────────
function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "oeil-critique-sources-"));
  const casse = [];
  const ecrire = (f, t) => { mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, t); };
  const anonymiser = (t) => ({ texte: String(t).replaceAll("Produit-Reel", "Produit-99") });
  try {
    const racine = join(tmp, "pilot"), produit = join(tmp, "Produit-Reel");
    ecrire(join(racine, "todo", "TODO.jsonl"), [
      { ev: "creation", id: "TF-1", ts: "2026-10-25T10:00:00Z", titre: "ancien", statut: "candidat", source: "Produit-02 - RETOURS - 20261025a" },
      { ev: "maj", id: "TF-1", ts: "2026-10-27T10:00:00Z", statut: "corrige", date_correction: "2026-10-27", gains_constates: "mesuré" },
      { ev: "creation", id: "TF-2", ts: "2026-10-28T10:00:00Z", titre: "sans gain", statut: "corrige", date_correction: "2026-10-28", source: "Produit-02 - RETOURS - 20261028a" },
      { ev: "creation", id: "TF-3", ts: "2026-10-20T10:00:00Z", titre: "clos avant", statut: "corrige", date_correction: "2026-10-21" },
    ].map((o) => JSON.stringify(o)).join("\n") + "\n");
    ecrire(join(racine, "todo", "HERITAGE-RELEVES.jsonl"), JSON.stringify({ ts: "2026-10-29T08:00:00Z", contrat: "1.0.0", produits: [{ produit: "Produit-77", absents: 2, divergents: 1, incomplets: 0, total: 27 }, { produit: "Produit-78", absents: 9, divergents: 0, incomplets: 0, total: 27 }] }) + "\n");
    ecrire(join(racine, ".oracles", "produits-au-demarrage.json"), JSON.stringify({ produits: { [produit]: {}, [join(tmp, "Sans-Trace")]: {} } }));
    ecrire(join(produit, "forge", "mobilisation.jsonl"), [
      { ts: "2026-10-28T10:00:00Z", verdicts: { audit: { verdict: "ecartee" }, development: { verdict: "mobilisee" } } },
      { ts: "2026-10-10T10:00:00Z", verdicts: { audit: { verdict: "ecartee" } } },
    ].map((o) => JSON.stringify(o)).join("\n") + "\n");
    for (const n of ["Produit-02 - RETOURS - 20261028a.md", "Produit-02 - RETOURS - 20261025a.md", "old/Produit-02 - RETOURS - 20261001a.md"]) ecrire(join(racine, "input", "00-retours", n), "lot");
    const depuis = "2026-10-26T15:15:00+01:00";

    const pseudoProduit = (c) => (c.endsWith("Produit-Reel") ? "Produit-99" : "(produit hors table)");
    const p = produits(racine, depuis, pseudoProduit);
    if (p.heritage.produits[0].produit !== "Produit-78") casse.push("héritage : le produit le plus en retard ne vient pas en tête");
    if (p.corrections.map((c) => c.id).join(",") !== "TF-1,TF-2") casse.push(`corrections de la période : TF-1,TF-2 attendus, ${p.corrections.map((c) => c.id)}`);
    const m = p.mobilisation.find((x) => x.produit === "Produit-99");
    if (!m || m.demandes_tracees !== 1 || m.ecartees.audit !== 1) casse.push(`mobilisation : 1 demande de la période et audit écartée 1 fois attendus, ${JSON.stringify(p.mobilisation)}`);
    if (JSON.stringify(p).includes("Produit-Reel")) casse.push("un nom réel de produit sort du relevé");
    if (p.produits_sans_trace !== 1) casse.push(`1 produit sans trace attendu, ${p.produits_sans_trace}`);

    const etats = etatRegistre(racine);
    const lo = lots(racine, depuis, etats);
    if (lo.map((x) => x.lot).join(",") !== "Produit-02 - RETOURS - 20261028a" || lo[0].items !== 1) casse.push(`lots de la période : 1 lot du 28/10 avec 1 item attendu, ${JSON.stringify(lo)}`);
    const sansGain = corrigesDepuis(etats, depuis).filter((x) => !String(x.gains_constates || "").trim()).map((x) => x.id);
    if (sansGain.join(",") !== "TF-2") casse.push(`clos sans gain constaté : TF-2 attendu, ${sansGain}`);

    const tr = join(tmp, "projects", "C--dev-Produit-Reel", "s-a.jsonl");
    const att = (ts, a) => JSON.stringify({ type: "attachment", timestamp: ts, attachment: a });
    ecrire(tr, [
      att("2026-10-27T10:00:00Z", { type: "hook_success", hookEvent: "Stop", command: 'node "${CLAUDE_PROJECT_DIR}/oracles/hook-restitution.mjs"', durationMs: 4000 }),
      att("2026-10-27T11:00:00Z", { type: "hook_success", hookEvent: "Stop", command: 'node "${CLAUDE_PROJECT_DIR}/oracles/hook-restitution.mjs"', durationMs: 6000 }),
      att("2026-10-27T11:00:00Z", { type: "hook_success", hookEvent: "PreToolUse", command: "node C:/dev/Produit-Reel/forge/hooks/factory.mjs ecriture --x", durationMs: 50 }),
      att("2026-10-20T11:00:00Z", { type: "hook_success", hookEvent: "Stop", command: "node ancien.mjs", durationMs: 99999 }),
      att("2026-10-27T09:00:00Z", { type: "async_hook_response", hookEvent: "SessionStart", command: "node hook-ouverture.mjs --contexte-json", stdout: JSON.stringify({ hookSpecificOutput: { additionalContext: "## Relevé\n- Visibilité NON mesurée pour 3 dépôt(s) à C:\\dev\\Produit-Reel\n- tout va bien" } }) }),
    ].join("\n") + "\n");
    const h = lireHooks([tr], Date.parse(depuis), anonymiser);
    const stop = h.hooks.find((x) => x.hook === "Stop hook-restitution.mjs");
    if (!stop || stop.executions !== 2 || stop.total_ms !== 10000 || stop.max_ms !== 6000) casse.push(`durées : Stop hook-restitution 2 exécutions, 10 000 ms attendus, ${JSON.stringify(h.hooks)}`);
    if (!h.hooks.some((x) => x.hook === "PreToolUse factory.mjs ecriture")) casse.push("le sous-commande d'un lanceur de produit n'est pas gardée dans le nom du hook");
    if (h.hooks.some((x) => x.max_ms === 99999)) casse.push("une exécution antérieure au repère est comptée");
    if (h.avertissements.length !== 1 || h.avertissements[0].famille !== "- Visibilité NON mesurée pour N dépôt(s) à …") casse.push(`avertissements : 1 famille normalisée attendue, ${JSON.stringify(h.avertissements)}`);
    if (JSON.stringify(h).includes("Produit-Reel")) casse.push("un nom réel sort des durées de hooks");

    ecrire(join(racine, ".oracles", "doc.md.oracles.json"), JSON.stringify({ resultats: [{ domaine: "Sécurité / secrets" }, { domaine: "Lisibilité" }] }));
    ecrire(join(racine, ".oracles", "doc.md.oracles-historique.jsonl"), [{ date_iso: "2026-10-27T10:00:00Z", fails: ["Lisibilité:doc.md"] }, { date_iso: "2026-10-28T10:00:00Z", fails: [] }, { date_iso: "2026-10-01T10:00:00Z", fails: ["Sécurité / secrets:doc.md"] }].map((o) => JSON.stringify(o)).join("\n") + "\n");
    const d = domainesMuets(racine, depuis);
    if (d.length !== 1 || d[0].domaine !== "Sécurité / secrets" || d[0].passages !== 2) casse.push(`domaines sans échec : Sécurité / secrets, 2 passages attendus (l'échec ancien hors période), ${JSON.stringify(d)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(JSON.stringify({ outil: "sources", self_test: casse.length ? "FAIL" : "PASS", cas: 13, casse }));
  process.exit(casse.length ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();
else {
  const quoi = args[0], depuis = valeur(args, "--depuis");
  if (!["produits", "existant", "silencieux"].includes(quoi) || !Number.isFinite(Date.parse(depuis))) {
    console.log(JSON.stringify({ outil: "sources", erreur: "usage : produits | existant | silencieux --depuis <iso> | --self-test" }));
    process.exit(2);
  }
  try {
    const racine = pilot(args);
    const { anonymiser } = await import(pathToFileURL(join(racine, "todo", "anonymiser-entrant.mjs")).href);
    anonymiser("essai"); // lève si un référentiel manque : refuser plutôt que relever en clair
    const p = valeur(args, "--profils");
    const profils = p ? p.split(";") : [join(homedir(), ".claude", "projects"), join(homedir(), ".claude-b", "projects")];
    const { pseudonymeProduit } = await import(pathToFileURL(join(racine, "scripts", "lib-pseudonyme-produit.mjs")).href);
    const r = quoi === "produits" ? produits(racine, depuis, pseudonymeProduit) : quoi === "existant" ? existant(racine, depuis) : silencieux(racine, depuis, profils, anonymiser);
    console.log(JSON.stringify({ outil: "sources", quoi, depuis, ...r }, null, 1));
  } catch (e) { console.log(JSON.stringify({ outil: "sources", refus: e.message })); process.exit(1); }
}
