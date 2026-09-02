#!/usr/bin/env node
// oracle-calculs — Domaine « Calculs / chiffres » (v2, déterministe).
// Vérifie par EXÉCUTION les totaux affichés dans les tables markdown et HTML :
//   · ligne « Total / Somme / Sous-total » : colonnes re-sommées sur le segment de données
//     au-dessus (depuis le dernier total) — comportement v1 inchangé ;
//   · ligne « Total général / Grand total » (v2) : colonnes re-sommées sur TOUTES les lignes
//     de données de la table (hors lignes de total) ; deux totaux généraux = structure ambiguë ;
//   · colonnes de répartition % totalisées : couvertes par la même re-somme (le total affiché,
//     typiquement 100 %, est jugé contre la somme des parts).
//   · EFFECTIF ANNONCÉ (v3, TF-0718) : un nombre écrit en chiffres OU en lettres, suivi d'un nom
//     dénombrable du document, en tête d'une liste ou d'un tableau, est rapproché du CARDINAL
//     RÉEL de cette ancre — délégué à lib/effectifs.mjs (N1), qui signale aussi les comptes
//     contradictoires pour un même nom dans le même document (N2).
// Parsing délégué à lib/num.mjs, extraction des tables à lib/tables.mjs (source unique).
// Verdicts : FAIL = écart au-delà de la tolérance d'arrondi · PASS = ≥1 total vérifié,
// 0 écart · SKIP = aucune structure vérifiable. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { parseNum, isTotalLabel, isGrandTotalLabel } from './lib/num.mjs';
import { extractTables } from './lib/tables.mjs';
import { verifierEffectifs } from './lib/effectifs.mjs';
import { verifierMesures, NON_JUGE_MESURE } from './lib/mesure.mjs';

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--profil');
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
const out = (verdict, findings, non_juge, code) => {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-calculs', domaine: 'Calculs / chiffres', artefact: file || null, verdict, findings, non_juge }));
  process.exit(code);
};
const NON_JUGE_BASE = [
  'calculs hors tables (prose, formules métier)',
  'pourcentages croisés (part d\'une table rapportée au total d\'une autre)',
  'colonnes % sans ligne de total (répartition non totalisée)',
  'chiffres sans ligne de total de contrôle (à vérifier à la source)',
  'justesse métier des valeurs unitaires (seule la cohérence arithmétique est jugée)',
  'ambiguïté séparateur unique + 3 décimales (traité comme milliers)',
  'effectifs annoncés sans ancre immédiate (liste ou tableau juste dessous) — non rapprochables',
  'effectifs de 1 (« une question ») et noms hors liste des dénombrables de lib/effectifs.mjs',
  'listes imbriquées HTML : les <li> de sous-listes sont comptés avec les items de premier niveau',
  ...NON_JUGE_MESURE
];
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
const ext = path.extname(file).toLowerCase();
if (!['.md', '.html', '.htm', '.txt'].includes(ext)) out('SKIP', [], ['extension non gérée : ' + ext], 2);
const text = fs.readFileSync(file, 'utf8');

const tables = extractTables(text, ext);

// ---- TF-0718 : effectifs annoncés vs cardinal réel (indépendant des lignes de total) ---------
// Ce volet juge AUSSI les documents sans aucune table de total : le décalage « Sept écarts »
// au-dessus d'un tableau de huit vivait dans un sommaire, pas dans une somme.
const eff = verifierEffectifs(text, ext, path.basename(file));

// ---- TF-0760 / TF-0777 : « un chiffre publié énonce son dénominateur, et une unité se lit » ---
// N3 pourcentage sans sa formule · N4 unités des en-têtes · N5 hypothèse calculable depuis la
// source déclarée. Délégué à lib/mesure.mjs — un domaine, un module, la même discipline que N1.
let PROFIL = {};
if (pArg && fs.existsSync(pArg)) { try { PROFIL = JSON.parse(fs.readFileSync(pArg, 'utf8')); } catch { /* profil illisible : réglages par défaut */ } }
const mes = verifierMesures(text, ext, path.basename(file), path.dirname(path.resolve(file)), (PROFIL.calculs && PROFIL.calculs.mesure) || {});

if (!tables.length && !eff.annonces && !eff.findings.length && !mes.juges && !mes.findings.length) out('SKIP', [], [...NON_JUGE_BASE, 'aucune table détectée, aucun effectif annoncé ancré, aucun pourcentage ni unité publiés'], 2);

// ---- vérification d'une ligne de total contre un jeu de lignes de données -------------------
const findings = [...eff.findings, ...mes.findings]; let verified = eff.verifies + mes.verifies, totalsSeen = eff.annonces + mes.juges;
function verifyRow(t, header, totalRow, data, kind) {
  const width = Math.max(...t.rows.map(x => x.cells.length));
  for (let c = 1; c < width; c++) {
    const shown = parseNum(totalRow.cells[c]);
    if (shown == null) continue;
    const vals = data.map(row => parseNum(row.cells[c])).filter(v => v != null);
    if (vals.length < 2) continue;                      // pas assez de données pour juger la colonne
    const sum = vals.reduce((a, b) => a + b, 0);
    const tol = 0.005 * vals.length + 0.011;            // arrondi d'affichage cumulé (2 déc.) + epsilon
    if (Math.abs(sum - shown) > tol) {
      findings.push({ sev: 'bloquant', msg: `${kind} incohérent « ${header[c] || 'col.' + (c + 1)} » : affiché ${totalRow.cells[c]} ≠ somme recalculée ${Math.round(sum * 100) / 100} (${vals.length} lignes)`, where: path.basename(file) + ':' + totalRow.line + ' (' + t.origin + ')' });
    } else verified++;
  }
}

for (const t of tables) {
  const header = t.rows[0].cells;
  const grandTotals = t.rows.map((r, i) => ({ r, i })).filter(x => x.i > 0 && isGrandTotalLabel(x.r.cells[0]));
  if (grandTotals.length > 1) {
    findings.push({ sev: 'bloquant', msg: `structure ambiguë : ${grandTotals.length} lignes « Total général » dans la même table`, where: path.basename(file) + ':' + grandTotals[1].r.line + ' (' + t.origin + ')' });
  }
  let segStart = 1;                                     // début du segment de données courant
  for (let r = 1; r < t.rows.length; r++) {
    if (isGrandTotalLabel(t.rows[r].cells[0])) {        // v2 : total général = toutes les données de la table
      totalsSeen++;
      const data = t.rows.slice(1, r).filter(row => !isTotalLabel(row.cells[0]) && !isGrandTotalLabel(row.cells[0]));
      verifyRow(t, header, t.rows[r], data, 'total général');
      segStart = r + 1;
      continue;
    }
    if (!isTotalLabel(t.rows[r].cells[0])) continue;
    totalsSeen++;
    verifyRow(t, header, t.rows[r], t.rows.slice(segStart, r), 'total');
    segStart = r + 1;                                   // sous-totaux : le segment suivant repart après ce total
  }
}
if (findings.some(f => f.sev === 'bloquant')) out('FAIL', findings, NON_JUGE_BASE, 1);
if (!totalsSeen || !verified) out('SKIP', [], [...NON_JUGE_BASE, totalsSeen ? 'totaux présents mais colonnes non sommables (données < 2 lignes)' : 'tables sans ligne de total de contrôle, aucun effectif annoncé ancré'], 2);
findings.push({ sev: 'info', msg: (verified - eff.verifies - mes.verifies) + ' total(aux) de colonne vérifié(s) par re-somme + ' + eff.verifies + ' effectif(s) annoncé(s) rapproché(s) de leur cardinal réel + ' + mes.verifies + '/' + mes.juges + ' mesure(s) publiée(s) portant leur dénominateur et leurs unités, 0 écart', where: path.basename(file) });
out('PASS', findings, NON_JUGE_BASE, 0);
