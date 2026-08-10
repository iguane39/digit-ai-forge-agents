#!/usr/bin/env node
// oracle-format — Domaine « Format / livraison / versioning ».
// Vérifie un artefact : encodage UTF-8 valide (bloquant), intégrité ZIP (bloquant),
// + avertissements (placeholders {{…}} résiduels, références externes d'une page HTML).
// Contrat de sortie commun : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]}
//   verdict ∈ PASS | FAIL | SKIP ; exit 0=PASS, 1=FAIL, 2=SKIP.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = process.argv[2];
const DOM = 'Format / livraison / versioning';
function emit(verdict, findings = [], non_juge = []) {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-format', domaine: DOM, artefact: file || null, verdict, findings, non_juge }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
}
if (!file || !fs.existsSync(file)) emit('SKIP', [{ sev: 'info', msg: 'fichier absent' }]);
const ext = path.extname(file).toLowerCase();
const findings = [], nj = [];

if (ext === '.zip') {
  const code = 'import sys,zipfile\nr="OK"\ntry:\n z=zipfile.ZipFile(sys.argv[1])\n if z.testzip(): r="BAD"\nexcept Exception: r="BAD"\nprint(r)';
  let verdict = null;
  for (const py of ['python', 'python3']) {
    const rr = spawnSync(py, ['-c', code, file], { encoding: 'utf8' });
    if (!rr.error) { verdict = /OK/.test(rr.stdout) ? 'OK' : 'BAD'; break; }
  }
  if (verdict === null) emit('SKIP', [], ['intégrité ZIP non vérifiée (python indisponible)']);
  if (verdict === 'OK') emit('PASS', [{ sev: 'info', msg: 'archive ZIP valide (testzip)' }]);
  emit('FAIL', [{ sev: 'bloquant', msg: 'archive ZIP corrompue / illisible (testzip)' }]);
}

const TEXT = ['.html', '.htm', '.md', '.json', '.svg', '.txt', '.js', '.mjs', '.cjs', '.css', '.tf', '.yml', '.yaml', '.csv'];
if (!TEXT.includes(ext)) emit('SKIP', [], ['type binaire ou non textuel — hors périmètre de cet oracle (' + (ext || 'sans extension') + ')']);

const buf = fs.readFileSync(file);
try { new TextDecoder('utf-8', { fatal: true }).decode(buf); }
catch { emit('FAIL', [{ sev: 'bloquant', msg: 'encodage non UTF-8 valide' }]); }
const txt = buf.toString('utf8');

const ph = txt.match(/\{\{[\s\S]*?\}\}/g);
if (ph) findings.push({ sev: 'warn', msg: (ph.length) + ' placeholder(s) {{…}} présent(s) — normal pour un gabarit, à vérifier pour un livrable final', where: [...new Set(ph)].slice(0, 3).join(' · ') });

if (ext === '.html' || ext === '.htm') {
  const ext_refs = [...txt.matchAll(/\b(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi)].map(m => m[0]);
  const imports = [...txt.matchAll(/@import\s+(?:url\()?["']?https?:\/\/[^"')]+/gi)].map(m => m[0]);
  const n = ext_refs.length + imports.length;
  if (n) findings.push({ sev: 'warn', msg: n + ' référence(s) externe(s) http(s) — vérifier l\'autoportance', where: (ext_refs[0] || imports[0] || '').slice(0, 60) });
  nj.push('rendu visuel (débordement/contraste/chevauchement) — voir oracle « rendu HTML » (render_page.py)');
}
emit('PASS', findings, nj);
