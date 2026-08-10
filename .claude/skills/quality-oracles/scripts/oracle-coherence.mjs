#!/usr/bin/env node
// oracle-coherence — Domaine « Cohérence inter-documents » (v1, déterministe).
// Détecte qu'une même grandeur diverge entre les livrables d'un même DOSSIER :
// affirmations labellisées « Libellé : valeur + unité » hors tables (lib/claims-extract,
// unités €/k€/%/j/j.h) + lignes de total de tables (lib/tables : clé = libellé du total
// enrichi de l'en-tête de colonne). Divergence sur une même clé entre ≥ 2 fichiers → BLOQUANT,
// where = « fichierA:ligneA ↔ fichierB:ligneB ».
// Versions successives (piège principal) : parmi les fichiers matchant la convention de
// nommage du profil et ne différant que par le bloc {AAAAMMJJ}{suffixe}, seule la plus
// récente est comparée ; les écartées sont tracées en non_juge. Fichiers hors convention :
// tous comparés (conservateur). ignore_patterns du profil respectés.
// Verdicts : SKIP si cible fichier ou < 2 fichiers porteurs · PASS = concordances, 0
// divergence · FAIL = ≥ 1 divergence. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { extractLabelled, normLabel } from './lib/claims-extract.mjs';
import { parseNum, uniteOf, isTotalLabel, isGrandTotalLabel } from './lib/num.mjs';
import { extractTables } from './lib/tables.mjs';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
const DOM = 'Cohérence inter-documents';
const NJ_BASE = [
  'cohérence des binaires (pptx, xlsx) — extension possible après couverture des tables OOXML',
  'divergences sémantiques non chiffrées (formulations, engagements textuels)',
  'libellés de total d\'un seul mot : rapprochés au sein du fichier seulement (anti-collision)'
];
const out = (verdict, findings, nj, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-coherence', domaine: DOM, artefact: target || null, verdict, findings, non_juge: nj })); process.exit(code); };
if (!target || !fs.existsSync(target)) out('SKIP', [], ['cible absente'], 2);
if (fs.statSync(target).isFile()) out('SKIP', [], ['cible fichier : la cohérence inter-documents se juge sur un dossier'], 2);

let profil = {}; if (pArg) { try { profil = JSON.parse(fs.readFileSync(pArg, 'utf8')); } catch {} }
const IGNORE_RX = (profil.ignore_patterns || []).map(p => { try { return new RegExp(p); } catch { return null; } }).filter(Boolean);
const nommageRx = profil.nommage && profil.nommage.regex ? (() => { try { return new RegExp(profil.nommage.regex); } catch { return null; } })() : null;

const TEXT_EXT = new Set(['.md', '.html', '.htm', '.txt']);
const IGNORE_DIRS = new Set(['node_modules', '.git', '.venv', 'dist', 'build', 'old', 'Old', '__pycache__', 'fixtures']);
function walk(p) {
  const outF = [];
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.oracles') || e.name.startsWith('_oracles') || IGNORE_RX.some(rx => rx.test(e.name))) continue;
    const fp = path.join(p, e.name);
    if (e.isDirectory()) outF.push(...walk(fp));
    else if (TEXT_EXT.has(path.extname(e.name).toLowerCase()) && !/\.oracles[.-]/.test(e.name)) outF.push(fp);
  }
  return outF;
}
let files = walk(target);

// ---- exclusion des versions antérieures d'un même livrable (convention du profil) ------------
const nj = [...NJ_BASE];
const VERBLOC = /(\d{8})([a-z])(?=(?: [^.]*)?\.[A-Za-z0-9]+$)/;
if (nommageRx) {
  const groups = new Map();                              // clé = nom sans bloc version → [{f, date, suf}]
  for (const f of files) {
    const b = path.basename(f);
    const m = nommageRx.test(b) ? b.match(VERBLOC) : null;
    if (!m) continue;
    const key = b.replace(VERBLOC, '@VER@');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ f, date: m[1], suf: m[2] });
  }
  const excluded = [];
  for (const [, occ] of groups) {
    if (occ.length < 2) continue;
    occ.sort((a, b) => (a.date + a.suf).localeCompare(b.date + b.suf));
    for (const old of occ.slice(0, -1)) excluded.push(old.f);
  }
  if (excluded.length) {
    files = files.filter(f => !excluded.includes(f));
    nj.push('versions antérieures exclues de la comparaison : ' + excluded.map(f => path.basename(f)).join(' · '));
  }
}

// ---- extraction par fichier : labellisés hors tables + lignes de total de tables -------------
const claims = [];                                       // { key, v, file, line, brut }
let carriers = 0;
for (const f of files) {
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const ext = path.extname(f).toLowerCase();
  text = text.replace(/```[\s\S]*?```/g, m => m.replace(/[^\n]/g, ' '));
  const lines = (ext === '.html' || ext === '.htm')
    ? text.replace(/<table[\s\S]*?<\/table>/gi, m => m.replace(/[^\n]/g, ' ')).replace(/<[^>]+>/g, ' ').split('\n')
    : text.split('\n');
  const isTableLine = l => /^\s*\|/.test(l);
  const before = claims.length;
  for (const e of extractLabelled(lines, isTableLine)) claims.push({ ...e, file: path.basename(f) });
  const rawText = fs.readFileSync(f, 'utf8');
  for (const t of extractTables(rawText, ext)) {
    const header = t.rows[0].cells;
    for (const row of t.rows.slice(1)) {
      if (!isTotalLabel(row.cells[0]) && !isGrandTotalLabel(row.cells[0])) continue;
      for (let c = 1; c < row.cells.length; c++) {
        const v = parseNum(row.cells[c]);
        if (v == null) continue;
        const labelRaw = (String(row.cells[0]) + ' ' + String(header[c] || '')).trim();
        const oneWord = normLabel(labelRaw).split(' ').length < 2;
        const key = (oneWord ? path.basename(f) + '#' : '') + normLabel(labelRaw) + '|' + (uniteOf(row.cells[c]) || uniteOf(header[c]));
        claims.push({ key, v, line: row.line, brut: (labelRaw + ' = ' + row.cells[c]).trim(), file: path.basename(f) });
      }
    }
  }
  if (claims.length > before) carriers++;
}
if (carriers < 2) out('SKIP', [], [...nj, `moins de 2 fichiers porteurs d'affirmations comparables (${carriers})`], 2);

// ---- rapprochement inter-fichiers ------------------------------------------------------------
const byKey = new Map();
for (const c of claims) { if (!byKey.has(c.key)) byKey.set(c.key, []); byKey.get(c.key).push(c); }
const findings = []; let concord = 0;
for (const [, occ] of byKey) {
  const filesOf = [...new Set(occ.map(o => o.file))];
  if (filesOf.length < 2) continue;                      // intra-document → oracle-claims
  const vals = [...new Set(occ.map(o => o.v))];
  if (vals.length > 1) {
    const a = occ[0], b = occ.find(o => o.v !== a.v) || occ[occ.length - 1];
    findings.push({ sev: 'bloquant', msg: `divergence inter-documents « ${a.brut} » vs « ${b.brut} » (${vals.join(' ≠ ')})`, where: `${a.file}:${a.line} ↔ ${b.file}:${b.line}` });
  } else concord++;
}
if (findings.length) out('FAIL', findings, nj, 1);
if (!concord) out('SKIP', [], [...nj, 'aucune grandeur commune entre les fichiers du dossier'], 2);
out('PASS', [{ sev: 'info', msg: concord + ' grandeur(s) commune(s) concordante(s) entre ' + carriers + ' fichiers, 0 divergence', where: path.basename(target) }], nj, 0);
