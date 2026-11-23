#!/usr/bin/env node
/**
 * self-test.mjs — recette d'agent-tiers.mjs, sans lancer aucun agent (voie --a-blanc).
 *   VERT  : relire chez Codex est en lecture seule (-s read-only) ; concevoir chez Codex est en
 *           workspace-write sans %TEMP% ; relire chez Antigravity est en mode plan sans droit
 *           d'écriture ; concevoir chez Antigravity écrit dans son seul dossier ; le modèle par
 *           défaut est gpt-6.2-sol et gemini-4-neon-high ;
 *   ROUGE : un dossier sous un dépôt git est refusé (exit 2) ; un agent inconnu, un geste inconnu,
 *           une image sans --nom ou avec un chemin dans --nom sont refusés ;
 *   BORNES : aucune commande construite ne porte un drapeau de levée du bac à sable.
 *   CONFIGURÉ OU RIEN : sans agent, `etat` rend CLAUDE_SEUL en code 0 et l'annonce une seule fois ;
 *           un geste vers un agent absent rend ABSENT en code 0 ; un agent installé mais non
 *           connecté n'est pas disponible ; avec les 2 agents, aucune annonce.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "agent-tiers.mjs");
let pass = 0, fail = 0;
const check = (nom, fn) => { try { fn(); console.log(`  [PASS] ${nom}`); pass++; } catch (e) { console.error(`  [FAIL] ${nom} — ${e.message}`); fail++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const T = mkdtempSync(join(tmpdir(), "agent-tiers-test-"));
const J = join(T, "jetable"); mkdirSync(J);
const D = join(T, "depot", "sous"); mkdirSync(join(T, "depot", ".git"), { recursive: true }); mkdirSync(D, { recursive: true });
const C = join(T, "consigne.md"); writeFileSync(C, "Relis le fichier et rends un JSON.");
const jouer = (...a) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...a, "--a-blanc"], { encoding: "utf8" });
  let j = {}; try { j = JSON.parse(r.stdout); } catch { /* refus non JSON : jugé par le code */ }
  return { code: r.status, j, argv: (j.argv || []).join(" ") };
};

check("VERT : relire chez Codex en lecture seule, modèle gpt-6.2-sol", () => {
  const r = jouer("relire", "--agent", "codex", "--dossier", J, "--consigne", C);
  ok(r.code === 0, `exit ${r.code} ${r.j.message || ""}`);
  ok(r.argv.includes("-s read-only") && !r.argv.includes("workspace-write"), r.argv);
  ok(r.j.modele === "gpt-6.2-sol", r.j.modele);
});
check("VERT : concevoir chez Codex en workspace-write, %TEMP% exclu", () => {
  const r = jouer("concevoir", "--agent", "codex", "--dossier", J, "--consigne", C);
  ok(r.argv.includes("-s workspace-write") && r.argv.includes("exclude_tmpdir_env_var=true"), r.argv);
});
check("VERT : relire chez Antigravity en mode plan, modèle gemini-4-neon-high", () => {
  const r = jouer("relire", "--agent", "antigravity", "--dossier", J, "--consigne", C);
  ok(r.code === 0 && r.argv.includes("--mode plan") && r.argv.includes("--sandbox"), r.argv);
  ok(r.j.modele === "gemini-4-neon-high", r.j.modele);
});
check("VERT : image chez Antigravity en accept-edits dans son dossier", () => {
  const r = jouer("image", "--agent", "antigravity", "--dossier", J, "--prompt", "un phare", "--nom", "phare.png");
  ok(r.code === 0 && r.argv.includes("--mode accept-edits"), r.argv);
});
check("ROUGE : dossier sous un dépôt git refusé", () => {
  const r = jouer("relire", "--agent", "codex", "--dossier", D, "--consigne", C);
  ok(r.code === 2 && /dépôt git/.test(r.j.message || ""), `exit ${r.code}`);
});
check("ROUGE : agent inconnu, geste inconnu refusés", () => {
  ok(jouer("relire", "--agent", "autre", "--dossier", J, "--consigne", C).code === 2, "agent inconnu accepté");
  ok(jouer("publier", "--agent", "codex", "--dossier", J).code === 2, "geste inconnu accepté");
});
check("ROUGE : image sans --nom, ou --nom avec un chemin, refusée", () => {
  ok(jouer("image", "--agent", "codex", "--dossier", J, "--prompt", "x").code === 2, "sans --nom accepté");
  ok(jouer("image", "--agent", "codex", "--dossier", J, "--prompt", "x", "--nom", "../x.png").code === 2, "chemin accepté");
});
check("BORNES : aucun drapeau de levée du bac à sable, dans aucune commande", () => {
  for (const ag of ["codex", "antigravity"]) for (const g of ["relire", "concevoir"]) {
    const r = jouer(g, "--agent", ag, "--dossier", J, "--consigne", C);
    ok(!/dangerously|danger-full-access|bypass/i.test(r.argv), `${ag} ${g} : ${r.argv}`);
  }
});

// Configuré ou rien (consigne du porteur du 23/11/2026) : un poste factice par cas, dont les
// variables d'environnement pointent vers des dossiers jetables ; aucun agent réel n'est lancé.
const poste = (nom, { codex = false, agy = false } = {}) => {
  const H = join(T, nom); const env = { ...process.env, USERPROFILE: H, HOME: H, APPDATA: join(H, "Roaming"), LOCALAPPDATA: join(H, "Local"), CODEX_HOME: join(H, ".codex"), FORGE_UTILISATEUR_DIR: join(H, ".digit-ai") };
  mkdirSync(H, { recursive: true });
  if (codex) {
    mkdirSync(join(env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin"), { recursive: true });
    writeFileSync(join(env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js"), "");
    mkdirSync(env.CODEX_HOME, { recursive: true }); writeFileSync(join(env.CODEX_HOME, "auth.json"), "{}");
  }
  if (agy) {
    mkdirSync(join(env.LOCALAPPDATA, "agy", "bin"), { recursive: true }); writeFileSync(join(env.LOCALAPPDATA, "agy", "bin", "agy.exe"), "");
    mkdirSync(join(H, ".gemini", "antigravity-cli"), { recursive: true }); writeFileSync(join(H, ".gemini", "antigravity-cli", "settings.json"), "{}");
  }
  return (...a) => { const r = spawnSync(process.execPath, [SCRIPT, ...a], { encoding: "utf8", env }); let j = {}; try { j = JSON.parse(r.stdout); } catch { /* jugé par le code */ } return { code: r.status, j, H }; };
};

check("VIDE : aucun agent, etat rend CLAUDE_SEUL en code 0, puis l'annonce une seule fois", () => {
  const p = poste("vide");
  const r1 = p("etat");
  ok(r1.code === 0 && r1.j.verdict === "CLAUDE_SEUL" && r1.j.disponibles.length === 0, `exit ${r1.code} ${r1.j.verdict}`);
  ok(/abonnement payant/.test(r1.j.annonce || "") && /procédure Codex et Gemini/.test(r1.j.annonce || ""), `annonce : ${r1.j.annonce}`);
  ok(/installés et connectés/.test(r1.j.annonce || ""), `accord au pluriel absent : ${r1.j.annonce}`);
  ok(existsSync(r1.j.procedure || ""), `procédure absente : ${r1.j.procedure}`);
  const r2 = p("etat");
  ok(r2.code === 0 && r2.j.annonce === null, `2e annonce : ${r2.j.annonce}`);
});
check("VIDE : un geste vers un agent absent rend ABSENT en code 0, sans refus", () => {
  const p = poste("vide-geste");
  const r = p("relire", "--agent", "codex", "--dossier", J, "--consigne", C);
  ok(r.code === 0 && r.j.verdict === "ABSENT", `exit ${r.code} ${r.j.verdict} ${r.j.message || ""}`);
  ok(/pas une erreur/.test(r.j.message || "") && r.j.annonce, "message ou annonce manquants");
});
check("VIDE : etat --a-blanc ne pose pas la marque de l'annonce", () => {
  const p = poste("a-blanc");
  ok(p("etat", "--a-blanc").j.annonce, "pas d'annonce");
  ok(p("etat").j.annonce, "la marque a été posée par --a-blanc");
});
check("UN SEUL : Codex prêt, Gemini absent ; l'annonce nomme celui qui manque", () => {
  const r = poste("codex", { codex: true })("etat");
  ok(r.j.verdict === "PRET" && r.j.disponibles.join() === "codex", `${r.j.verdict} ${r.j.disponibles}`);
  ok(/Codex travaille déjà/.test(r.j.annonce || "") && /Gemini/.test(r.j.annonce || ""), `annonce : ${r.j.annonce}`);
});
check("LES DEUX : PRET, aucune annonce", () => {
  const r = poste("deux", { codex: true, agy: true })("etat");
  ok(r.j.verdict === "PRET" && r.j.disponibles.length === 2 && r.j.annonce === null, `${r.j.verdict} ${r.j.annonce}`);
});
check("INSTALLÉ SANS CONNEXION : Antigravity installé, non connecté, n'est pas disponible", () => {
  const p = poste("agy-sans-connexion");
  mkdirSync(join(p("etat", "--a-blanc").H, "Local", "agy", "bin"), { recursive: true });
  writeFileSync(join(T, "agy-sans-connexion", "Local", "agy", "bin", "agy.exe"), "");
  const r = p("etat", "--a-blanc");
  ok(r.j.agents.antigravity.installe && !r.j.agents.antigravity.disponible, JSON.stringify(r.j.agents));
});

rmSync(T, { recursive: true, force: true });
console.log(`agent-tiers : ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
