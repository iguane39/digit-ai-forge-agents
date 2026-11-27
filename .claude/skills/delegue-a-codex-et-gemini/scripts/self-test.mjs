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
 *   PARTIEL (TF-2856) : délai atteint avec les livrables écrits → PARTIEL, code 4, fichiers nommés ;
 *           délai atteint sans livrable, ou livrable déclaré manquant, ou plantage sans délai → FAIL ;
 *           la consigne du geste concevoir borne la vérification que l'agent tiers se donne.
 *   RÈGLES JUGÉES (TF-2908) : concevoir joint l'extrait de references/regles-jugees-concevoir.md, lu dans
 *           le fichier (marqueur jetable), entre la consigne et la borne ; relire n'en porte pas ; un
 *           fichier de référence absent est un refus (code 2).
 *   CONFIGURÉ OU RIEN : sans agent, `etat` rend CLAUDE_SEUL en code 0 et l'annonce une seule fois ;
 *           un geste vers un agent absent rend ABSENT en code 0 ; un agent installé mais non
 *           connecté n'est pas disponible ; avec les 2 agents, aucune annonce.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
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
const poste = (nom, { codex = false, agy = false, codexJs = "", env: extra = {} } = {}) => {
  const H = join(T, nom); const env = { ...process.env, USERPROFILE: H, HOME: H, APPDATA: join(H, "Roaming"), LOCALAPPDATA: join(H, "Local"), CODEX_HOME: join(H, ".codex"), FORGE_UTILISATEUR_DIR: join(H, ".digit-ai"), ...extra };
  mkdirSync(H, { recursive: true });
  if (codex) {
    mkdirSync(join(env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin"), { recursive: true });
    writeFileSync(join(env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js"), codexJs);
    mkdirSync(env.CODEX_HOME, { recursive: true }); writeFileSync(join(env.CODEX_HOME, "auth.json"), "{}");
  }
  if (agy) {
    mkdirSync(join(env.LOCALAPPDATA, "agy", "bin"), { recursive: true }); writeFileSync(join(env.LOCALAPPDATA, "agy", "bin", "agy.exe"), "");
    mkdirSync(join(H, ".gemini", "antigravity-cli"), { recursive: true }); writeFileSync(join(H, ".gemini", "antigravity-cli", "settings.json"), "{}");
  }
  const lancer = (script, a) => { const r = spawnSync(process.execPath, [script, ...a], { encoding: "utf8", env }); let j = {}; try { j = JSON.parse(r.stdout); } catch { /* jugé par le code */ } return { code: r.status, j, H }; };
  const run = (...a) => lancer(SCRIPT, a);
  run.avec = (script, ...a) => lancer(script, a);   // TF-2908 : le même poste factice, un autre exemplaire du lanceur
  return run;
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

// PARTIEL (TF-2856, RT-50 du lot Produit-82 20261125b) : un faux Codex (un script node posé là où le
// lanceur cherche codex.js) écrit ses livrables puis ne rend jamais la main ; le délai du lanceur
// (--delai 1, marge ramenée à 1 s par AGENT_TIERS_MARGE_S) le coupe. Aucun agent réel n'est lancé.
const FAUX_ECRIT = `const fs = require("fs"), path = require("path");
const d = process.argv[process.argv.indexOf("-C") + 1];
fs.writeFileSync(path.join(d, "maquette.html"), "<html>complet</html>");
fs.writeFileSync(path.join(d, "DIRECTION.md"), "# Direction");
fs.writeFileSync(path.join(d, "consigne-recue.txt"), process.argv[process.argv.length - 1]);
`;
const FAUX_BLOQUE = FAUX_ECRIT + "setInterval(() => {}, 1000);\n";
const FAUX_PLANTE = FAUX_ECRIT + "process.exit(1);\n";
const FAUX_MUET = "setInterval(() => {}, 1000);\n";
const FAUX_UN_SEUL = `const fs = require("fs"), path = require("path");
const d = process.argv[process.argv.indexOf("-C") + 1];
fs.writeFileSync(path.join(d, "maquette.html"), "<html>complet</html>");
setInterval(() => {}, 1000);
`;
const FAUX_BREF = FAUX_ECRIT + `const o = process.argv.indexOf("-o"); fs.writeFileSync(process.argv[o + 1], "direction rendue"); `;
const concevoirFaux = (nom, js, ...plus) => {
  const p = poste(nom, { codex: true, codexJs: js, env: { AGENT_TIERS_MARGE_S: "1" } });
  const d = join(T, `dossier-${nom}`); mkdirSync(d);
  return p("concevoir", "--agent", "codex", "--dossier", d, "--consigne", C, "--delai", "1", ...plus);
};
check("PARTIEL : délai atteint, livrables écrits (déclarés) → PARTIEL, code 4, fichiers nommés", () => {
  const r = concevoirFaux("partiel-declare", FAUX_BLOQUE, "--livrables", "maquette.html,DIRECTION.md");
  ok(r.j.verdict === "PARTIEL" && r.code === 4, `verdict ${r.j.verdict}, exit ${r.code}`);
  ok(["maquette.html", "DIRECTION.md"].every((f) => (r.j.livrables || []).includes(f)), JSON.stringify(r.j.livrables));
  ok(/délai/.test(r.j.motif || "") && /juge/.test(r.j.motif || ""), `motif : ${r.j.motif}`);
});
check("PARTIEL : délai atteint, livrables écrits (non déclarés) → PARTIEL, fichiers écrits nommés", () => {
  const r = concevoirFaux("partiel-nu", FAUX_BLOQUE);
  ok(r.j.verdict === "PARTIEL" && r.code === 4, `verdict ${r.j.verdict}, exit ${r.code}`);
  ok(["maquette.html", "DIRECTION.md"].every((f) => (r.j.livrables || []).includes(f)), JSON.stringify(r.j.livrables));
});
check("ROUGE : délai atteint, aucun fichier écrit → FAIL, code 1", () => {
  const r = concevoirFaux("muet", FAUX_MUET);
  ok(r.j.verdict === "FAIL" && r.code === 1, `verdict ${r.j.verdict}, exit ${r.code}`);
});
check("ROUGE : délai atteint, un livrable déclaré manque → FAIL qui nomme le manquant", () => {
  const r = concevoirFaux("un-seul", FAUX_UN_SEUL, "--livrables", "maquette.html,DIRECTION.md");
  ok(r.j.verdict === "FAIL" && r.code === 1, `verdict ${r.j.verdict}, exit ${r.code}`);
  ok((r.j.livrables_manquants || []).join() === "DIRECTION.md", JSON.stringify(r.j.livrables_manquants));
});
check("ROUGE : plantage sans délai atteint, fichiers écrits → FAIL (un plantage n'est pas un délai)", () => {
  const r = concevoirFaux("plante", FAUX_PLANTE, "--livrables", "maquette.html,DIRECTION.md");
  ok(r.j.verdict === "FAIL" && r.code === 1, `verdict ${r.j.verdict}, exit ${r.code}`);
});
check("VERT : un agent qui rend dans le délai reste PASS, code 0", () => {
  const p = poste("bref", { codex: true, codexJs: FAUX_BREF, env: { AGENT_TIERS_MARGE_S: "5" } });
  const d = join(T, "dossier-bref"); mkdirSync(d);
  const r = p("concevoir", "--agent", "codex", "--dossier", d, "--consigne", C, "--delai", "40");
  ok(r.j.verdict === "PASS" && r.code === 0, `verdict ${r.j.verdict}, exit ${r.code}`);
});
check("BORNE : la consigne de concevoir borne la vérification de l'agent ; celle de relire n'en porte pas", () => {
  const p = poste("borne", { codex: true, codexJs: FAUX_BREF, env: { AGENT_TIERS_MARGE_S: "5" } });
  const d = join(T, "dossier-borne"); mkdirSync(d);
  p("concevoir", "--agent", "codex", "--dossier", d, "--consigne", C, "--delai", "40");
  const recue = readFileSync(join(d, "consigne-recue.txt"), "utf8");
  ok(/Borne de vérification/.test(recue) && /10 secondes/.test(recue) && /40 secondes/.test(recue), recue.slice(-400));
  ok(recue.indexOf("Relis le fichier") < recue.indexOf("Borne de vérification"), "la borne doit suivre la consigne");
  const d2 = join(T, "dossier-borne-relire"); mkdirSync(d2);
  p("relire", "--agent", "codex", "--dossier", d2, "--consigne", C, "--delai", "40");
  ok(!/Borne de vérification/.test(readFileSync(join(d2, "consigne-recue.txt"), "utf8")), "borne présente dans relire");
});

// TF-2908 (RT-69 du lot Produit-82 20261127e) : le geste concevoir joint l'extrait des règles jugées par les oracles du socle.
// Un faux Codex écrit la consigne qu'il reçoit ; l'extrait se lit dans references/regles-jugees-concevoir.md, jamais dans le code.
check("TF-2908 VERT : concevoir joint l'extrait des règles jugées et les commandes à rejouer, entre la consigne et la borne", () => {
  const p = poste("regles", { codex: true, codexJs: FAUX_BREF, env: { AGENT_TIERS_MARGE_S: "5", FORGE_ROOT: "C:\\racine-test" } });
  const d = join(T, "dossier-regles"); mkdirSync(d);
  p("concevoir", "--agent", "codex", "--dossier", d, "--consigne", C, "--delai", "40");
  const recue = readFileSync(join(d, "consigne-recue.txt"), "utf8");
  for (const motif of [/data-overlap-ok/, /multiple de 4/, /4,5:1/, /\[data-theme="dark"\]/, /`:root`/, /render_page\.py/, /run-oracles-design\.mjs/])
    ok(motif.test(recue), `l'extrait ne porte pas ${motif} : ${recue.slice(-600)}`);
  ok(/C:\/racine-test\/digit-ai-forge-design\/oracles\/run-oracles-design\.mjs/.test(recue) && !recue.includes("{FORGE_ROOT}"), "{FORGE_ROOT} doit être remplacé par la racine du parc");
  ok(recue.indexOf("Relis le fichier") < recue.indexOf("Règles que la Factory juge") && recue.indexOf("Règles que la Factory juge") < recue.indexOf("Borne de vérification"), "ordre : consigne, règles, borne");
});
check("TF-2908 ROUGE : relire n'en porte pas ; concevoir sans racine de parc le dit", () => {
  const p = poste("regles-relire", { codex: true, codexJs: FAUX_BREF, env: { AGENT_TIERS_MARGE_S: "5", FORGE_ROOT: "" } });
  const d = join(T, "dossier-regles-relire"); mkdirSync(d);
  p("relire", "--agent", "codex", "--dossier", d, "--consigne", C, "--delai", "40");
  ok(!/Règles que la Factory juge|data-overlap-ok/.test(readFileSync(join(d, "consigne-recue.txt"), "utf8")), "relire porte l'extrait");
  const d2 = join(T, "dossier-regles-sans-racine"); mkdirSync(d2);
  p("concevoir", "--agent", "codex", "--dossier", d2, "--consigne", C, "--delai", "40");
  ok(/<racine du parc>/.test(readFileSync(join(d2, "consigne-recue.txt"), "utf8")), "sans FORGE_ROOT, la racine doit rester nommée « <racine du parc> »");
});
check("TF-2908 ROUGE : l'extrait se lit dans le fichier de référence (marqueur jetable), et son absence est un refus", () => {
  const copie = join(T, "copie-skill"); mkdirSync(join(copie, "scripts"), { recursive: true }); mkdirSync(join(copie, "references"));
  writeFileSync(join(copie, "scripts", "agent-tiers.mjs"), readFileSync(SCRIPT, "utf8"));
  const p = poste("regles-copie", { codex: true, codexJs: FAUX_BREF, env: { AGENT_TIERS_MARGE_S: "5" } });
  const sans = p.avec(join(copie, "scripts", "agent-tiers.mjs"), "concevoir", "--agent", "codex", "--dossier", J, "--consigne", C, "--delai", "40");
  ok(sans.code === 2 && /référence absent/.test(sans.j.message || ""), `fichier absent : exit ${sans.code} ${sans.j.message}`);
  writeFileSync(join(copie, "references", "regles-jugees-concevoir.md"), "## Règles que la Factory juge\nMARQUEUR-JETABLE-2908 {FORGE_ROOT}\n");
  const d = join(T, "dossier-regles-copie"); mkdirSync(d);
  const avec = p.avec(join(copie, "scripts", "agent-tiers.mjs"), "concevoir", "--agent", "codex", "--dossier", d, "--consigne", C, "--delai", "40");
  ok(avec.code === 0 && /MARQUEUR-JETABLE-2908/.test(readFileSync(join(d, "consigne-recue.txt"), "utf8")), `marqueur absent : exit ${avec.code}`);
});

// TF-2907 (RT-68 du lot Produit-82 20261127d) : « pour chaque LLM, Claude, Codex et Gemini » a été lu comme un tableau de bord par modèle
// suivi, sans charger ce skill. La description nomme le cas et le corps prescrit le compte des livrables avant le premier fichier.
check("TF-2907 : la description nomme le concepteur tiers d'un livrable (≤ 1024 car.) et le corps prescrit le compte avant le premier fichier", () => {
  const skill = readFileSync(join(dirname(SCRIPT), "..", "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  ok(fm, "frontmatter introuvable");
  const m = /^description:\s*>\s*\n((?:  .*\n?)+)/m.exec(fm[1] + "\n");
  ok(m, "description introuvable");
  const description = m[1].split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
  ok(description.length <= 1024, `description de ${description.length} caractères`);
  ok(/une demande nomme Codex, Gemini ou un autre modèle comme concepteur d'un livrable/.test(description), "le cas n'est pas nommé dans la description");
  const corps = skill.slice(fm[0].length);
  const i = corps.indexOf("## Avant le premier fichier : compter les livrables"), j = corps.indexOf("## Les 3 gestes");
  ok(i >= 0 && j > i, "section « Avant le premier fichier » absente ou après les 3 gestes");
  const section = corps.slice(i, j);
  ok(/types de livrable × concepteurs ×\s+variantes par concepteur = total/.test(section) && /2 tableaux de bord × 3 concepteurs × 3 maquettes chacun = 18/.test(section), "le compte des livrables n'est pas prescrit avec son exemple");
});

rmSync(T, { recursive: true, force: true });
console.log(`agent-tiers : ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
