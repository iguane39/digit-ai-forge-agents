#!/usr/bin/env node
/**
 * scelle.mjs — la recommandation d'une majeure, scellée avant l'affichage, dévoilée après le choix.
 *
 * Pourquoi il existe. Le skill se juge sur la part de ses majeures acceptées. Une décision qui
 * affiche sa recommandation avant les options mesure l'ancrage autant que la justesse : l'humain
 * qui suit la recommandation affichée ne dit rien de sa qualité. Repris de task-observer
 * (rebelytics, `references/weekly-review.md`, « Separate the recommendation from the choice ») par
 * la décision D-72 (b) du 26/10/2026. La recommandation est écrite AVANT l'affichage, dans un
 * journal à ajout seul du pilot, `todo/oeil-critique-scelles.jsonl` ; le choix humain s'y ajoute
 * ensuite ; le bilan ne compte l'adhésion que sur ces paires.
 *
 * Usage :
 *   node scelle.mjs sceller --decision D-N --option <lettre> --motif "<pourquoi>" [--pilot <chemin>]
 *       → refuse une décision déjà scellée : une recommandation ne se réécrit pas.
 *   node scelle.mjs devoiler --decision D-N --choix <lettre> [--pilot <chemin>]
 *       → refuse une décision non scellée ou déjà dévoilée ; rend la recommandation et l'accord.
 *   node scelle.mjs bilan [--pilot <chemin>]
 *       → { scellees, devoilees, en_attente, accords, taux_adhesion }.
 *   node scelle.mjs --self-test
 * Sortie JSON, exit 0 / 1 (refus) / 2 (usage).
 */
import { existsSync, readFileSync, appendFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pilot, poste, valeur } from "./lib.mjs";

export const fichierScelles = (racine) => join(racine, "todo", "oeil-critique-scelles.jsonl");

const numero = (d) => {
  const m = /^D-(\d{1,4})$/.exec(String(d || "").trim());
  if (!m) throw new Error(`--decision attend D-N, reçu « ${d} »`);
  return "D-" + m[1];
};
const lettre = (o, nom) => {
  const m = /^\(?([a-z])\)?$/i.exec(String(o || "").trim());
  if (!m) throw new Error(`${nom} attend une lettre d'option, reçu « ${o} »`);
  return m[1].toLowerCase();
};

export function lireScelles(racine) {
  const f = fichierScelles(racine);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

const ajouter = (racine, entree) => appendFileSync(fichierScelles(racine), JSON.stringify(entree) + "\n");

export function sceller(racine, { decision, option, motif }) {
  const d = numero(decision);
  const o = lettre(option, "--option");
  if (!motif || !String(motif).trim()) throw new Error("--motif requis : une recommandation sans motif ne se juge pas");
  if (lireScelles(racine).some((e) => e.type === "scelle" && e.decision === d)) throw new Error(`${d} est déjà scellée : une recommandation ne se réécrit pas`);
  const e = { type: "scelle", decision: d, option: o, motif: String(motif).trim(), poste: poste(), ts: new Date().toISOString() };
  ajouter(racine, e);
  return e;
}

export function devoiler(racine, { decision, choix }) {
  const d = numero(decision);
  const c = lettre(choix, "--choix");
  const lignes = lireScelles(racine);
  const s = lignes.find((e) => e.type === "scelle" && e.decision === d);
  if (!s) throw new Error(`${d} n'a pas été scellée : son adhésion ne se mesure pas`);
  if (lignes.some((e) => e.type === "choix" && e.decision === d)) throw new Error(`${d} est déjà dévoilée`);
  const e = { type: "choix", decision: d, choix: c, recommandation: s.option, accord: c === s.option, poste: poste(), ts: new Date().toISOString() };
  ajouter(racine, e);
  return { ...e, motif: s.motif };
}

export function bilan(racine) {
  const lignes = lireScelles(racine);
  const scellees = lignes.filter((e) => e.type === "scelle").length;
  const choix = lignes.filter((e) => e.type === "choix");
  const accords = choix.filter((e) => e.accord).length;
  return { scellees, devoilees: choix.length, en_attente: scellees - choix.length, accords, taux_adhesion: choix.length ? Math.round((accords / choix.length) * 100) / 100 : null };
}

function selfTest() {
  const racine = mkdtempSync(join(tmpdir(), "oeil-critique-scelle-"));
  mkdirSync(join(racine, "todo"));
  writeFileSync(join(racine, "todo", "TODO.jsonl"), "");
  const casse = [];
  const refuse = (f, quoi) => { try { f(); casse.push(`accepté à tort : ${quoi}`); } catch { /* attendu */ } };
  try {
    sceller(racine, { decision: "D-90", option: "(b)", motif: "moins cher" });
    refuse(() => sceller(racine, { decision: "D-90", option: "a", motif: "autre avis" }), "une recommandation réécrite");
    refuse(() => sceller(racine, { decision: "D-91", option: "a", motif: "" }), "un scellé sans motif");
    refuse(() => devoiler(racine, { decision: "D-92", choix: "a" }), "un dévoilement sans scellé");
    const v = devoiler(racine, { decision: "D-90", choix: "a" });
    if (v.accord !== false || v.recommandation !== "b") casse.push("un choix différent de la recommandation compté d'accord");
    refuse(() => devoiler(racine, { decision: "D-90", choix: "b" }), "un second dévoilement");
    sceller(racine, { decision: "D-93", option: "c", motif: "statu quo" });
    devoiler(racine, { decision: "D-93", choix: "c" });
    sceller(racine, { decision: "D-94", option: "a", motif: "en attente" });
    const b = bilan(racine);
    if (b.scellees !== 3 || b.devoilees !== 2 || b.en_attente !== 1 || b.accords !== 1 || b.taux_adhesion !== 0.5) casse.push(`bilan faux : ${JSON.stringify(b)}`);
  } finally { rmSync(racine, { recursive: true, force: true }); }
  console.log(JSON.stringify({ outil: "scelle", self_test: casse.length ? "FAIL" : "PASS", cas: 7, casse }));
  process.exit(casse.length ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();
else {
  try {
    const racine = pilot(args);
    if (args[0] === "sceller") console.log(JSON.stringify({ outil: "scelle", ecrit: sceller(racine, { decision: valeur(args, "--decision"), option: valeur(args, "--option"), motif: valeur(args, "--motif") }) }));
    else if (args[0] === "devoiler") console.log(JSON.stringify({ outil: "scelle", ecrit: devoiler(racine, { decision: valeur(args, "--decision"), choix: valeur(args, "--choix") }) }));
    else if (args[0] === "bilan") console.log(JSON.stringify({ outil: "scelle", ...bilan(racine) }));
    else { console.log(JSON.stringify({ outil: "scelle", erreur: "usage : sceller --decision --option --motif | devoiler --decision --choix | bilan | --self-test" })); process.exit(2); }
  } catch (e) { console.log(JSON.stringify({ outil: "scelle", refus: e.message })); process.exit(1); }
}
