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
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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

rmSync(T, { recursive: true, force: true });
console.log(`agent-tiers : ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
