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
 * Configuré ou rien (consigne du porteur du 23/11/2026 à 17:38) : un agent ne travaille que s'il est
 * installé ET connecté sur le poste. Sinon, Claude fait le geste seul et RIEN n'est signalé comme une
 * erreur : le geste `etat` rend la liste des agents prêts, et un geste lancé vers un agent absent rend
 * le verdict ABSENT, code 0. La première fois qu'un agent manque sur le poste, la sortie porte une
 * `annonce` unique : Codex et Gemini peuvent travailler avec Claude, sur abonnement payant, et la
 * procédure pas à pas existe. La marque de cette annonce vit dans `~/.digit-ai/agents-tiers.json`
 * (ou `FORGE_UTILISATEUR_DIR`), hors de tout dépôt.
 *
 * Usage :
 *   node agent-tiers.mjs etat [--a-blanc]   (--a-blanc : ne pose pas la marque de l'annonce)
 *   node agent-tiers.mjs relire    --agent codex|antigravity --dossier <d> --consigne <f.md> [--json] [--sortie <f>]
 *   node agent-tiers.mjs concevoir --agent codex|antigravity --dossier <d> --consigne <f.md> [--sortie <f>]
 *   node agent-tiers.mjs image     --agent codex|antigravity --dossier <d> --prompt "<texte>" --nom <fichier.png> [--sortie <f>]
 *   options communes : --delai <s> (défaut 600 pour concevoir, 400 sinon) · --modele <id> · --effort <niveau> (défaut high) · --a-blanc
 *   --a-blanc rend la commande construite sans rien lancer (voie des recettes).
 * Sortie : JSON {verdict, geste, agent, modele, dossier, duree_s, code, reponse, json, fichiers_ecrits, sortie}
 *   etat : JSON {verdict PRET|CLAUDE_SEUL, agents:{codex, antigravity}, disponibles, annonce, procedure}
 * Exit : 0 l'agent a rendu, ou verdict ABSENT (agent non configuré, pas une erreur), ou `etat`
 *        · 1 l'agent a échoué, dépassé le délai ou rendu un JSON illisible avec --json
 *        · 2 appel refusé (argument manquant, dossier sous un dépôt)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";

const MODELES = { codex: "gpt-6.2-sol", antigravity: "gemini-4-neon-high" };
const NOMS = { codex: "Codex", antigravity: "Gemini (par Antigravity)" };
const PROCEDURE = join(dirname(dirname(fileURLToPath(import.meta.url))), "references", "installer-codex-et-gemini.md");
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

// Chemins des agents : les mêmes que ceux du lancement, plus le fichier que pose leur connexion.
const cheminCodexJs = () => join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
const cheminAgy = () => join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "agy", "bin", "agy.exe");

/** Installé : le binaire est là. Connecté : le fichier que la connexion pose existe (son contenu
 *  n'est jamais lu). Une connexion expirée ne se voit pas ici : le premier geste réel la révèle. */
function detecter() {
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const codex = { installe: existsSync(cheminCodexJs()), connecte: existsSync(join(codexHome, "auth.json")) };
  const antigravity = { installe: existsSync(cheminAgy()), connecte: existsSync(join(homedir(), ".gemini", "antigravity-cli", "settings.json")) };
  for (const a of [codex, antigravity]) a.disponible = a.installe && a.connecte;
  return { codex, antigravity };
}

/** L'annonce ne sort qu'une fois par poste, et seulement si un agent au moins manque. */
function annonceUnique(agents) {
  const manquants = Object.keys(agents).filter((k) => !agents[k].disponible);
  if (!manquants.length) return null;
  const dossierUtil = process.env.FORGE_UTILISATEUR_DIR || join(homedir(), ".digit-ai");
  const marque = join(dossierUtil, "agents-tiers.json");
  if (existsSync(marque)) return null;
  const prets = Object.keys(agents).filter((k) => agents[k].disponible);
  const debut = prets.length
    ? `${prets.map((k) => NOMS[k]).join(" et ")} travaille déjà avec Claude sur ce poste. ${manquants.map((k) => NOMS[k]).join(" et ")} peut le rejoindre`
    : "Claude travaille seul sur ce poste. Codex et Gemini (par Antigravity) peuvent travailler avec lui";
  const texte = `${debut}, sur votre abonnement payant (ChatGPT pour Codex, compte Google pour Gemini), une fois installé et connecté. Ils relisent un document, proposent une variante de design et génèrent des images. Je peux vous fournir la procédure pas à pas : dites « procédure Codex et Gemini ».`;
  if (!aBlanc) {
    try { mkdirSync(dossierUtil, { recursive: true }); writeFileSync(marque, JSON.stringify({ annonce_faite: new Date().toISOString(), manquants }, null, 1) + "\n"); }
    catch { /* marque non écrite : l'annonce reviendra, ce n'est pas une erreur */ }
  }
  return texte;
}

if (geste === "etat") {
  const agents = detecter();
  const disponibles = Object.keys(agents).filter((k) => agents[k].disponible);
  fin(disponibles.length ? "PRET" : "CLAUDE_SEUL", { agents, disponibles, annonce: annonceUnique(agents), procedure: PROCEDURE }, 0);
}
if (!["relire", "concevoir", "image"].includes(geste)) refus("geste attendu : etat, relire, concevoir ou image");
const agent = opt("--agent");
if (!MODELES[agent]) refus("--agent attendu : codex ou antigravity");
if (!aBlanc) {
  const agents = detecter();
  if (!agents[agent].disponible) fin("ABSENT", {
    agent, agents, annonce: annonceUnique(agents), procedure: PROCEDURE,
    message: `${NOMS[agent]} n'est pas configuré sur ce poste : Claude fait ce geste seul. Ce n'est pas une erreur, ne le signale pas comme tel.`,
  }, 0);
}
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
  const js = cheminCodexJs();
  exe = process.execPath;
  const bac = geste === "relire"
    ? ["-s", "read-only"]
    : ["-s", "workspace-write", "-c", "sandbox_workspace_write.exclude_tmpdir_env_var=true", "-c", "sandbox_workspace_write.exclude_slash_tmp=true"];
  argv = [js, "exec", "-C", dossier, ...bac, "-m", modele, "-c", `model_reasoning_effort=${effort}`, "--ephemeral", "--skip-git-repo-check", "--json", "-o", derniere, texte];
} else {
  exe = cheminAgy();
  const reglages = join(tmp, "reglages.json");
  const allow = [`read_file(${dossier})`];
  if (geste !== "relire") allow.push(`write_file(${dossier})`, "command(*)");
  writeFileSync(reglages, JSON.stringify({ permissions: { allow } }, null, 2) + "\n");
  argv = ["-p", texte, "--model", modele, "--effort", effort, "--mode", geste === "relire" ? "plan" : "accept-edits", "--sandbox", "--settings", reglages, "--output-format", "json", "--print-timeout", `${delai}s`];
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
