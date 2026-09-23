#!/usr/bin/env node
// self-test.mjs — preuve à double sens de `oracles/decouvrir-oracles.mjs` (TF-1319, 23/09/2026).
//
// La découverte dit au juge d'enclenchement du pilot ce que cette forge porte comme oracles ; le
// juge confronte cette liste aux verdicts consignés au ledger d'un run. Deux mécanismes la
// composent — le NOM des fichiers, et le REGISTRE de quality-oracles qui ne peut qu'ajouter — et
// chacun se prouve dans les deux sens, sur des arbres jetables (jamais sur le registre versionné) :
//   vert  : un oracle nommé comme tel est découvert ; un script que seul le registre déclare l'est
//           aussi, marqué `par: ["registre"]` ; un oracle AJOUTÉ l'est au passage suivant ;
//   rouge : fixture, recette, dépendance, entrant, script désigné hors du dépôt et script
//           fantôme ne sont JAMAIS découverts ; un registre illisible ne retire rien et le DIT ;
//           une racine absente sort en 2 avec son motif.
// Exit 0 si tous les contrôles passent, 1 sinon. À rejouer après toute modification.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DECOUVRIR = path.join(ICI, "decouvrir-oracles.mjs");
let pass = 0, echec = 0;
const ok = (b, m) => { console.log(`  [${b ? "PASS" : "FAIL"}] ${m}`); b ? pass++ : echec++; };

const decouvre = (racine) => {
  const r = spawnSync(process.execPath, [DECOUVRIR, ...(racine ? ["--racine", racine] : [])], { encoding: "utf8" });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* sortie illisible : les contrôles la disent */ }
  return { code: r.status, j };
};
const arbre = () => fs.mkdtempSync(path.join(os.tmpdir(), "forge-agents-decouverte-"));
const poser = (racine, rel, contenu = "// fixture de découverte\n") => {
  const p = path.join(racine, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contenu);
};
const REGISTRE = ".claude/skills/quality-oracles/references/registre-oracles.json";
const registre = (cmds) => JSON.stringify({ version: "fixture", oracles: cmds.map((cmd, i) => ({ domaine: `d${i}`, type: "cli", cmd })) });

console.log("SELF-TEST forge-agents — découverte des oracles (TF-1319)\n");

// ── le dépôt lui-même ───────────────────────────────────────────────────────────────────────────
{
  const r = decouvre(null);
  const o = r.j?.oracles || [];
  ok(r.code === 0 && r.j?.contrat === "digit-ai/decouverte-oracles@1" && r.j?.forge === "digit-ai-forge-agents" && o.length > 0
    && o.every((x) => fs.existsSync(path.join(ICI, "..", x.chemin))),
    `VERT — la forge découvre ${o.length} oracle(s) sur son propre disque, contrat tenu, chaque chemin rendu existe`);
  ok(o.length > 0 && o.every((x) => Array.isArray(x.par) && x.par.length > 0 && x.par.every((p) => p === "nom" || p === "registre")),
    `VERT — chaque oracle dit PAR QUOI il a été trouvé (nom : ${o.filter((x) => x.par?.includes("nom")).length}, registre : ${o.filter((x) => x.par?.includes("registre")).length})`);
}

// ── un arbre jetable : le nom, le registre, et les leurres ──────────────────────────────────────
{
  const d = arbre();
  try {
    poser(d, ".claude/skills/s1/scripts/oracle-alpha.mjs");
    poser(d, ".claude/skills/s2/scripts/check_beta.py", "# oracle que son nom ne déclare pas\n");
    const leurres = [".claude/skills/s1/fixtures/oracle-faux.mjs", ".claude/skills/s1/scripts/self-test.mjs",
      ".claude/skills/s1/scripts/oracle-alpha.test.mjs", "node_modules/paquet/oracle-dep.mjs", "input/oracle-entrant.mjs"];
    leurres.forEach((l) => poser(d, l));
    poser(d, REGISTRE, registre([
      ["python", "{skillsroot}/s2/scripts/check_beta.py", "{file}"],
      ["node", "{pilot}/oracles/oracle-du-pilot.mjs", "{file}"],
      ["node", "{skilldir}/scripts/oracle-fantome.mjs", "{file}"],
    ]));
    const r = decouvre(d);
    const o = r.j?.oracles || [];
    const par = Object.fromEntries(o.map((x) => [x.nom, (x.par || []).join("+")]));
    ok(r.code === 0 && JSON.stringify(o.map((x) => x.nom).sort()) === JSON.stringify(["check_beta", "oracle-alpha"]),
      `VERT — un oracle nommé comme tel ET un script que seul le registre déclare sont découverts (obtenu ${JSON.stringify(par)})`);
    ok(par["oracle-alpha"] === "nom" && par.check_beta === "registre",
      "VERT — le registre AJOUTE sans rien retirer : oracle-alpha, qu'il ne nomme pas, reste découvert par son nom");
    ok(!o.some((x) => leurres.includes(x.chemin)) && !o.some((x) => /oracle-du-pilot|oracle-fantome/.test(x.chemin)),
      `ROUGE — fixture, recette, dépendance, entrant, script désigné HORS du dépôt et script FANTÔME ne sont jamais découverts (${leurres.length + 2} leurres)`);
    ok((r.j?.non_juge || []).some((n) => /oracle-alpha/.test(n) && /registre ne nomme pas/.test(n)),
      "VERT — l'oracle découvert que le registre ne nomme pas est DIT : le lanceur général ne le jouera jamais");
    poser(d, ".claude/skills/s3/scripts/oracle-gamma.mjs");
    ok((decouvre(d).j?.oracles || []).some((x) => x.nom === "oracle-gamma"),
      "VERT — un oracle AJOUTÉ est découvert au passage suivant, sans qu'aucune liste soit tenue à jour");
    fs.writeFileSync(path.join(d, REGISTRE), "{ ceci n'est pas du JSON");
    const illisible = decouvre(d);
    ok(illisible.code === 0 && (illisible.j?.oracles || []).some((x) => x.nom === "oracle-alpha")
      && !(illisible.j?.oracles || []).some((x) => x.nom === "check_beta")
      && (illisible.j?.non_juge || []).some((n) => /registre illisible/.test(n)),
      "ROUGE — un registre illisible ne retire rien à la découverte par le nom, et il est DIT, jamais tu");
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// ── la racine absente ──────────────────────────────────────────────────────────────────────────
{
  const r = decouvre(path.join(os.tmpdir(), "forge-agents-racine-qui-n-existe-pas"));
  ok(r.code === 2 && r.j?.oracles?.length === 0 && /introuvable/.test(r.j?.motif || ""),
    `ROUGE — une racine absente sort en 2 avec son motif, jamais en liste vide muette (obtenu exit ${r.code})`);
}

console.log(`\nSelf-test forge-agents (découverte des oracles) : ${pass} PASS, ${echec} FAIL`);
process.exit(echec ? 1 : 0);
