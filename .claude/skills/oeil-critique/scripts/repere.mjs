#!/usr/bin/env node
/**
 * repere.mjs — le repère de dernière exécution du skill oeil-critique, un fichier par poste.
 *
 * Pourquoi il existe. « Tous les échanges depuis sa dernière exécution » suppose un repère écrit
 * quelque part ; sans lui, la première exécution lirait tout l'historique (2,2 Go sur un poste le
 * 21/10/2026). Le repère vit au pilot, `todo/oeil-critique-<poste>.json`, parce que les transcripts
 * ne quittent pas leur poste : chaque poste a sa période (décision D-62 (a) du 21/10/2026).
 *
 * Usage :
 *   node repere.mjs lire [--pilot <chemin>]
 *       → JSON { poste, fichier, depuis, age_jours, premiere } ; depuis = fin de la dernière analyse,
 *         ou la borne initiale du 20/10/2026 si le poste n'a pas de repère.
 *   node repere.mjs avancer --debut <iso> --fin <iso> --sortie <fichier.txt> [--pilot <chemin>]
 *       → écrit le repère ; la sortie de l'exécution (10 lignes au plus) est celle que le relevé
 *         d'ouverture affiche. Refuse une fin antérieure au repère, ou une sortie de plus de 10 lignes.
 *   node repere.mjs --self-test
 * Sortie JSON, exit 0 / 1 (refus) / 2 (erreur d'usage).
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BORNE_INITIALE, pilot, poste, valeur } from "./lib.mjs";

export const MAX_LIGNES = 10;
export const fichierRepere = (racine, nom = poste()) => join(racine, "todo", `oeil-critique-${nom}.json`);

export function lire(racine, nom = poste()) {
  const f = fichierRepere(racine, nom);
  const r = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  const depuis = r ? r.fin : BORNE_INITIALE;
  return { poste: nom, fichier: f, depuis, age_jours: Math.round(((Date.now() - Date.parse(depuis)) / 86400000) * 10) / 10, premiere: !r };
}

export function avancer(racine, { debut, fin, sortie }, nom = poste()) {
  const avant = lire(racine, nom);
  if (!Number.isFinite(Date.parse(debut)) || !Number.isFinite(Date.parse(fin))) throw new Error("--debut et --fin doivent être des dates ISO");
  if (Date.parse(fin) < Date.parse(avant.depuis)) throw new Error(`fin ${fin} antérieure au repère ${avant.depuis} : le repère ne recule pas`);
  const lignes = String(sortie).split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
  if (lignes.length > MAX_LIGNES) throw new Error(`sortie de ${lignes.length} lignes, ${MAX_LIGNES} au plus`);
  const r = { poste: nom, debut, fin, ts: new Date().toISOString(), sortie: lignes };
  writeFileSync(avant.fichier, JSON.stringify(r, null, 1) + "\n");
  return r;
}

function selfTest() {
  const racine = mkdtempSync(join(tmpdir(), "oeil-critique-repere-"));
  mkdirSync(join(racine, "todo"));
  writeFileSync(join(racine, "todo", "TODO.jsonl"), "");
  const casse = [];
  try {
    const l0 = lire(racine, "POSTE-TEST");
    if (!l0.premiere || l0.depuis !== BORNE_INITIALE) casse.push("sans repère, la période ne part pas de la borne initiale");
    avancer(racine, { debut: BORNE_INITIALE, fin: "2026-10-21T10:00:00+02:00", sortie: "analyse faite\nindicateurs" }, "POSTE-TEST");
    const l1 = lire(racine, "POSTE-TEST");
    if (l1.premiere || l1.depuis !== "2026-10-21T10:00:00+02:00") casse.push("le repère avancé n'est pas relu");
    try { avancer(racine, { debut: BORNE_INITIALE, fin: "2026-10-20T12:00:00+02:00", sortie: "x" }, "POSTE-TEST"); casse.push("un repère qui recule est accepté"); } catch { /* attendu */ }
    try { avancer(racine, { debut: l1.depuis, fin: "2026-10-22T10:00:00+02:00", sortie: Array.from({ length: 11 }, (_, i) => `l${i}`).join("\n") }, "POSTE-TEST"); casse.push("une sortie de 11 lignes est acceptée"); } catch { /* attendu */ }
    if (lire(racine, "AUTRE-POSTE").depuis !== BORNE_INITIALE) casse.push("le repère d'un poste a servi à un autre");
  } finally { rmSync(racine, { recursive: true, force: true }); }
  console.log(JSON.stringify({ outil: "repere", self_test: casse.length ? "FAIL" : "PASS", cas: 5, casse }));
  process.exit(casse.length ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();
else {
  try {
    const racine = pilot(args);
    if (args[0] === "lire") console.log(JSON.stringify(lire(racine)));
    else if (args[0] === "avancer") {
      const s = valeur(args, "--sortie");
      if (!s || !existsSync(s)) { console.log(JSON.stringify({ outil: "repere", erreur: "--sortie <fichier> requis" })); process.exit(2); }
      console.log(JSON.stringify({ outil: "repere", ecrit: avancer(racine, { debut: valeur(args, "--debut"), fin: valeur(args, "--fin"), sortie: readFileSync(s, "utf8") }) }));
    } else { console.log(JSON.stringify({ outil: "repere", erreur: "usage : lire | avancer --debut --fin --sortie | --self-test" })); process.exit(2); }
  } catch (e) { console.log(JSON.stringify({ outil: "repere", refus: e.message })); process.exit(1); }
}
