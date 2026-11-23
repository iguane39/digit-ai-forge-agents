#!/usr/bin/env node
/**
 * agent-tiers.mjs — lance Codex (GPT) ou Antigravity (Gemini) pour l'un des 3 gestes que la Factory
 * leur confie (D-240 (b) et réponse du porteur à D-231, 23/11/2026) : relire, concevoir, image.
 *
 * Règles tenues par construction, jamais par la consigne :
 * - l'agent travaille dans un DOSSIER JETABLE hors de tout dépôt git : le lanceur refuse un dossier
 *   qui est, ou qui est sous, un dossier portant `.git`. L'appelant y copie l'entrée et en ressort
 *   le résultat. Raison : le bac à sable d'Antigravity bloque le réseau mais ne confine pas
 *   l'écriture (essai A-6 du 23/11/2026) ; celui de Codex interdit `.git`, donc tout commit ;
 * - aucun drapeau qui lève un bac à sable n'est jamais construit (`--dangerously-*`,
 *   `danger-full-access`) ; le geste `relire` est en lecture seule chez Codex (`-s read-only`) et
 *   en mode `plan` chez Antigravity ;
 * - l'entrée standard est fermée : une question de l'agent ne peut pas bloquer le lanceur.
 *
 * Usage :
 *   node agent-tiers.mjs relire    --agent codex|antigravity --dossier <d> --consigne <f.md> [--json] [--sortie <f>]
 *   node agent-tiers.mjs concevoir --agent codex|antigravity --dossier <d> --consigne <f.md> [--sortie <f>]
 *   node agent-tiers.mjs image     --agent codex|antigravity --dossier <d> --prompt "<texte>" --nom <fichier.png> [--sortie <f>]
 *   options communes : --delai <s> (défaut 600 pour concevoir, 400 sinon) · --modele <id> · --effort <niveau> (défaut high) · --a-blanc
 *   --a-blanc rend la commande construite sans rien lancer (voie des recettes).
 * Sortie : JSON {verdict, geste, agent, modele, dossier, duree_s, code, reponse, json, fichiers_ecrits, sortie}
 * Exit : 0 l'agent a rendu · 1 l'agent a échoué, dépassé le délai ou rendu un JSON illisible avec --json
 *        · 2 appel refusé (argument manquant, dossier sous un dépôt, agent absent)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { tmpdir, homedir } from "node:os";

const MODELES = { codex: "gpt-6.2-sol", antigravity: "gemini-4-neon-high" };
const [geste, ...reste] = process.argv.slice(2);
const opt = (n) => { const i = reste.indexOf(n); return i >= 0 ? reste[i + 1] : null; };
const aBlanc = reste.includes("--a-blanc");

function fin(verdict, corps, code) {
  const s = JSON.stringify({ verdict, geste, ...corps }, null, 1) + "\n";
  if (opt("--sortie") && !aBlanc) writeFileSync(opt("--sortie"), s);
  process.stdout.write(s);
  process.exit(code);
}
const refus = (message) => fin("REFUS", { message }, 2);

if (!["relire", "concevoir", "image"].includes(geste)) refus("geste attendu : relire, concevoir ou image");
const agent = opt("--agent");
if (!MODELES[agent]) refus("--agent attendu : codex ou antigravity");
const dossierArg = opt("--dossier");
if (!dossierArg) refus("--dossier attendu : un dossier jetable, hors de tout dépôt git");
const dossier = resolve(dossierArg);
if (!existsSync(dossier) || !statSync(dossier).isDirectory()) refus(`dossier absent : ${dossier}`);
for (let d = dossier; ; d = dirname(d)) {
  if (existsSync(join(d, ".git"))) refus(`dossier sous un dépôt git (${d}) : copier l'entrée dans un dossier jetable hors dépôt`);
  if (dirname(d) === d) break;
}

let consigne = "";
if (geste === "image") {
  if (!opt("--prompt") || !opt("--nom")) refus("image : --prompt et --nom attendus");
  if (/[\\/]/.test(opt("--nom")) || !/\.png$/i.test(opt("--nom"))) refus("--nom : un nom de fichier .png, sans chemin");
  consigne = `Génère une image avec ton outil natif de génération d'images, puis enregistre-la en PNG sous le nom ${opt("--nom")} dans le dossier courant. Ne dessine pas par programme. Demande : ${opt("--prompt")}\n\nRends en une ligne : le fichier écrit, ses dimensions et l'outil employé.`;
} else {
  const f = opt("--consigne");
  if (!f || !existsSync(f)) refus("--consigne attendu : le fichier de consigne");
  consigne = readFileSync(f, "utf8");
}

const modele = opt("--modele") || MODELES[agent];
const effort = opt("--effort") || "high";
const delai = Number(opt("--delai") || (geste === "concevoir" ? 600 : 400));
const prealable = agent === "codex"
  ? "Préambule d'outil (Codex) : ton dossier de travail est le dossier courant. N'utilise aucune commande git. PowerShell est en mode de langage restreint : pour lire et écrire un fichier, utilise Get-Content et Set-Content, jamais de type .NET ; tu peux lancer node et python. Les fichiers texte sont en UTF-8 sans marque d'ordre d'octets. Ne supprime aucun fichier existant. Aucune question : tu travailles seul, jusqu'au bout."
  : "Préambule d'outil (Antigravity) : ton dossier de travail est le dossier courant ; n'écris RIEN en dehors. Une seule commande par appel, sans opérateur de shell (pas de &&, |, ;). N'utilise aucune commande git. Ne supprime aucun fichier existant. Aucune question : tu travailles seul, jusqu'au bout.";
const lecture = geste === "relire" ? "\n\nTu es en LECTURE SEULE : n'écris, ne modifie et ne supprime aucun fichier." : "";
const texte = `${prealable}${lecture}\n\n${consigne}`;

// Construction de la commande. Aucun drapeau de levée du bac à sable n'existe dans ce fichier.
const tmp = mkdtempSync(join(tmpdir(), "agent-tiers-"));
let exe, argv, cwd = dossier;
const derniere = join(tmp, "derniere.txt");
if (agent === "codex") {
  const js = join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
  exe = process.execPath;
  const bac = geste === "relire"
    ? ["-s", "read-only"]
    : ["-s", "workspace-write", "-c", "sandbox_workspace_write.exclude_tmpdir_env_var=true", "-c", "sandbox_workspace_write.exclude_slash_tmp=true"];
  argv = [js, "exec", "-C", dossier, ...bac, "-m", modele, "-c", `model_reasoning_effort=${effort}`, "--ephemeral", "--skip-git-repo-check", "--json", "-o", derniere, texte];
  if (!aBlanc && !existsSync(js)) refus(`Codex introuvable : ${js}`);
} else {
  exe = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "agy", "bin", "agy.exe");
  const reglages = join(tmp, "reglages.json");
  const allow = [`read_file(${dossier})`];
  if (geste !== "relire") allow.push(`write_file(${dossier})`, "command(*)");
  writeFileSync(reglages, JSON.stringify({ permissions: { allow } }, null, 2) + "\n");
  argv = ["-p", texte, "--model", modele, "--effort", effort, "--mode", geste === "relire" ? "plan" : "accept-edits", "--sandbox", "--settings", reglages, "--output-format", "json", "--print-timeout", `${delai}s`];
  if (!aBlanc && !existsSync(exe)) refus(`Antigravity introuvable : ${exe}`);
}
const interdits = argv.filter((a) => /dangerously|danger-full-access|bypass/i.test(a) && a !== texte);
if (interdits.length) refus(`drapeau interdit construit : ${interdits.join(", ")}`);
if (aBlanc) { rmSync(tmp, { recursive: true, force: true }); fin("A_BLANC", { agent, modele, dossier, exe, argv: argv.map((a) => (a === texte ? "<consigne>" : a)) }, 0); }

// Lancement.
const avant = new Set(lister(dossier));
const t0 = Date.now();
const r = spawnSync(exe, argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: (delai + 30) * 1000, maxBuffer: 64 * 1024 * 1024 });
const duree_s = Math.round((Date.now() - t0) / 1000);
let reponse = "", statut = r.status === 0 ? "ok" : "echec";
if (agent === "codex") reponse = existsSync(derniere) ? readFileSync(derniere, "utf8") : "";
else {
  try { const j = JSON.parse(r.stdout); reponse = j.response || ""; if (j.status !== "SUCCESS") statut = `echec (${j.status})`; } catch { reponse = r.stdout || ""; }
}
if (r.error && r.error.code === "ETIMEDOUT") statut = "delai depasse";
const fichiers_ecrits = lister(dossier).filter((f) => !avant.has(f));
rmSync(tmp, { recursive: true, force: true });

let json = null;
if (reste.includes("--json")) {
  const m = reponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  const brut = (m ? m[1] : reponse).trim();
  const a = brut.indexOf("{"), b = brut.lastIndexOf("}");
  try { json = JSON.parse(brut.slice(a, b + 1)); } catch { statut = statut === "ok" ? "json illisible" : statut; }
}
const corps = { agent, modele, effort, dossier, duree_s, code: r.status, statut, reponse, json, fichiers_ecrits, erreur: (r.stderr || "").slice(-1500) };
fin(statut === "ok" ? "PASS" : "FAIL", corps, statut === "ok" ? 0 : 1);

function lister(d, pre = "") {
  const out = [];
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const rel = pre ? `${pre}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...lister(join(d, e.name), rel));
    else out.push(rel);
  }
  return out;
}
