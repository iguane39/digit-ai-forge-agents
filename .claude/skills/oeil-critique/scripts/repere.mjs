#!/usr/bin/env node
/**
 * repere.mjs — le repère de dernière exécution du skill oeil-critique, un fichier par poste.
 *
 * Pourquoi il existe. « Tous les échanges depuis sa dernière exécution » suppose un repère écrit
 * quelque part ; sans lui, la première exécution lirait tout l'historique (2,2 Go sur un poste le
 * 21/10/2026). Le repère vit au pilot, `todo/oeil-critique-<poste>.json`, parce que les transcripts
 * ne quittent pas leur poste : chaque poste a sa période (décision D-62 (a) du 21/10/2026).
 *
 * 1.2.0 (D-95 (b) du 29/10/2026, action 4) : le repère garde aussi la date du dernier palier
 * d'architecture et les indicateurs de l'exécution. Le fait : le skill annonçait « un palier par
 * mois » sans aucune date pour le déclencher, et sa première exécution n'avait rien à quoi comparer
 * ses indicateurs. Les indicateurs sont exigés pour avancer : sans eux, le progrès ne se mesure pas.
 *
 * Usage :
 *   node repere.mjs lire [--pilot <chemin>]
 *       → JSON { poste, fichier, depuis, age_jours, premiere, dernier_palier, palier_du,
 *         indicateurs_precedents } ; depuis = fin de la dernière analyse, ou la borne initiale du
 *         20/10/2026 ; palier_du = plus de 30 jours depuis le dernier palier, ou depuis la borne.
 *   node repere.mjs avancer --debut <iso> --fin <iso> --sortie <fichier.txt> --indicateurs <fichier.json> [--palier] [--pilot <chemin>]
 *       → écrit le repère et rend l'évolution des indicateurs ; --palier dit que le palier
 *         d'architecture a été joué. Refuse une fin antérieure au repère, une sortie de plus de
 *         10 lignes, ou des indicateurs absents ou non numériques.
 *   node repere.mjs --self-test
 * Sortie JSON, exit 0 / 1 (refus) / 2 (erreur d'usage).
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BORNE_INITIALE, pilot, poste, valeur } from "./lib.mjs";

export const MAX_LIGNES = 10;
export const PALIER_JOURS = 30;
/** Les indicateurs du §g de la proposition 20261021a, comptés par la mission 3. */
export const INDICATEURS = ["demandes", "reprises", "consignes_repetees", "messages_hors_demande", "refus_hook"];
export const fichierRepere = (racine, nom = poste()) => join(racine, "todo", `oeil-critique-${nom}.json`);

const jours = (de, a) => Math.round(((a - Date.parse(de)) / 86400000) * 10) / 10;

export function lire(racine, nom = poste(), maintenant = Date.now()) {
  const f = fichierRepere(racine, nom);
  const r = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  const depuis = r ? r.fin : BORNE_INITIALE;
  const dernierPalier = (r && r.palier) || null;
  return {
    poste: nom, fichier: f, depuis, age_jours: jours(depuis, maintenant), premiere: !r,
    dernier_palier: dernierPalier,
    palier_du: jours(dernierPalier || BORNE_INITIALE, maintenant) > PALIER_JOURS,
    indicateurs_precedents: (r && r.indicateurs) || null,
  };
}

export function evolution(avant, apres) {
  const e = {};
  for (const k of INDICATEURS) e[k] = { avant: avant ? avant[k] : null, apres: apres[k], ecart: avant ? apres[k] - avant[k] : null };
  const taux = (i) => (i && i.demandes ? Math.round((i.reprises / i.demandes) * 1000) / 1000 : null);
  e.reprises_par_demande = { avant: taux(avant), apres: taux(apres) };
  return e;
}

export function avancer(racine, { debut, fin, sortie, indicateurs, palier = false }, nom = poste()) {
  const avant = lire(racine, nom);
  if (!Number.isFinite(Date.parse(debut)) || !Number.isFinite(Date.parse(fin))) throw new Error("--debut et --fin doivent être des dates ISO");
  if (Date.parse(fin) < Date.parse(avant.depuis)) throw new Error(`fin ${fin} antérieure au repère ${avant.depuis} : le repère ne recule pas`);
  const lignes = String(sortie).split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
  if (lignes.length > MAX_LIGNES) throw new Error(`sortie de ${lignes.length} lignes, ${MAX_LIGNES} au plus`);
  const manquants = INDICATEURS.filter((k) => !indicateurs || !Number.isFinite(indicateurs[k]) || indicateurs[k] < 0);
  if (manquants.length) throw new Error(`indicateurs absents ou non numériques : ${manquants.join(", ")} — sans eux, le progrès ne se compare pas`);
  const garde = Object.fromEntries(INDICATEURS.map((k) => [k, indicateurs[k]]));
  const evol = evolution(avant.indicateurs_precedents, garde);
  const r = { poste: nom, debut, fin, ts: new Date().toISOString(), palier: palier ? fin : avant.dernier_palier, indicateurs: garde, evolution: evol, sortie: lignes };
  writeFileSync(avant.fichier, JSON.stringify(r, null, 1) + "\n");
  return r;
}

function selfTest() {
  const racine = mkdtempSync(join(tmpdir(), "oeil-critique-repere-"));
  mkdirSync(join(racine, "todo"));
  writeFileSync(join(racine, "todo", "TODO.jsonl"), "");
  const casse = [];
  const ind = (d, r) => ({ demandes: d, reprises: r, consignes_repetees: 3, messages_hors_demande: 10, refus_hook: 7 });
  try {
    const l0 = lire(racine, "POSTE-TEST");
    if (!l0.premiere || l0.depuis !== BORNE_INITIALE) casse.push("sans repère, la période ne part pas de la borne initiale");
    avancer(racine, { debut: BORNE_INITIALE, fin: "2026-10-21T10:00:00+02:00", sortie: "analyse faite\nindicateurs", indicateurs: ind(100, 40) }, "POSTE-TEST");
    const l1 = lire(racine, "POSTE-TEST");
    if (l1.premiere || l1.depuis !== "2026-10-21T10:00:00+02:00") casse.push("le repère avancé n'est pas relu");
    try { avancer(racine, { debut: BORNE_INITIALE, fin: "2026-10-20T12:00:00+02:00", sortie: "x", indicateurs: ind(1, 0) }, "POSTE-TEST"); casse.push("un repère qui recule est accepté"); } catch { /* attendu */ }
    try { avancer(racine, { debut: l1.depuis, fin: "2026-10-22T10:00:00+02:00", sortie: Array.from({ length: 11 }, (_, i) => `l${i}`).join("\n"), indicateurs: ind(1, 0) }, "POSTE-TEST"); casse.push("une sortie de 11 lignes est acceptée"); } catch { /* attendu */ }
    if (lire(racine, "AUTRE-POSTE").depuis !== BORNE_INITIALE) casse.push("le repère d'un poste a servi à un autre");
    try { avancer(racine, { debut: l1.depuis, fin: "2026-10-22T10:00:00+02:00", sortie: "x", indicateurs: { demandes: 5 } }, "POSTE-TEST"); casse.push("des indicateurs incomplets sont acceptés"); } catch { /* attendu */ }
    const r2 = avancer(racine, { debut: l1.depuis, fin: "2026-10-22T10:00:00+02:00", sortie: "x", indicateurs: ind(50, 10) }, "POSTE-TEST");
    if (r2.evolution.reprises.ecart !== -30 || r2.evolution.reprises_par_demande.avant !== 0.4 || r2.evolution.reprises_par_demande.apres !== 0.2) casse.push(`évolution mal calculée : ${JSON.stringify(r2.evolution.reprises)} ${JSON.stringify(r2.evolution.reprises_par_demande)}`);
    if (lire(racine, "POSTE-TEST", Date.parse("2026-11-15T00:00:00+01:00")).palier_du) casse.push("palier dû avant 30 jours depuis la borne");
    if (!lire(racine, "POSTE-TEST", Date.parse("2026-11-20T00:00:00+01:00")).palier_du) casse.push("palier non dû après 30 jours sans palier");
    avancer(racine, { debut: "2026-10-22T10:00:00+02:00", fin: "2026-11-20T09:00:00+01:00", sortie: "x", indicateurs: ind(40, 8), palier: true }, "POSTE-TEST");
    const l3 = lire(racine, "POSTE-TEST", Date.parse("2026-11-25T00:00:00+01:00"));
    if (l3.palier_du || l3.dernier_palier !== "2026-11-20T09:00:00+01:00") casse.push("le palier joué n'est pas daté au repère");
    avancer(racine, { debut: "2026-11-20T09:00:00+01:00", fin: "2026-11-26T09:00:00+01:00", sortie: "x", indicateurs: ind(40, 8) }, "POSTE-TEST");
    if (lire(racine, "POSTE-TEST").dernier_palier !== "2026-11-20T09:00:00+01:00") casse.push("une exécution sans palier efface la date du dernier palier");
  } finally { rmSync(racine, { recursive: true, force: true }); }
  console.log(JSON.stringify({ outil: "repere", self_test: casse.length ? "FAIL" : "PASS", cas: 11, casse }));
  process.exit(casse.length ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();
else {
  try {
    const racine = pilot(args);
    if (args[0] === "lire") console.log(JSON.stringify(lire(racine)));
    else if (args[0] === "avancer") {
      const s = valeur(args, "--sortie"), i = valeur(args, "--indicateurs");
      if (!s || !existsSync(s)) { console.log(JSON.stringify({ outil: "repere", erreur: "--sortie <fichier> requis" })); process.exit(2); }
      if (!i || !existsSync(i)) { console.log(JSON.stringify({ outil: "repere", erreur: "--indicateurs <fichier.json> requis" })); process.exit(2); }
      const ecrit = avancer(racine, { debut: valeur(args, "--debut"), fin: valeur(args, "--fin"), sortie: readFileSync(s, "utf8"), indicateurs: JSON.parse(readFileSync(i, "utf8")), palier: args.includes("--palier") });
      console.log(JSON.stringify({ outil: "repere", ecrit }));
    } else { console.log(JSON.stringify({ outil: "repere", erreur: "usage : lire | avancer --debut --fin --sortie --indicateurs [--palier] | --self-test" })); process.exit(2); }
  } catch (e) { console.log(JSON.stringify({ outil: "repere", refus: e.message })); process.exit(1); }
}
