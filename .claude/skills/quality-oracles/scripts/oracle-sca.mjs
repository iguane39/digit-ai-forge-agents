#!/usr/bin/env node
// oracle-sca — Domaine « Sécurité : vulnérabilités de dépendances (SCA) ».
// Détecte les manifestes (requirements*.txt, package.json), interroge un outil
// faisant foi : pip-audit / npm audit s'ils sont installés, sinon l'API OSV
// (https://api.osv.dev) pour les versions ÉPINGLÉES. Verdict FAIL si vulnérabilité,
// PASS si vérifié sans vulnérabilité, SKIP si rien n'est vérifiable (outils absents
// ET réseau OSV inaccessible) → honnêteté : « non vérifié » plutôt qu'un faux PASS.
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} ; exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const target = process.argv[2];
const DOM = 'Sécurité : vulnérabilités de dépendances (SCA)';
const NJ = ['dépendances transitives non épinglées (version inconnue → non interrogée)', 'vulnérabilités hors bases publiques'];
function emit(verdict, findings = [], non_juge = NJ) {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-sca', domaine: DOM, artefact: target || null, verdict, findings, non_juge }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
}
if (!target || !fs.existsSync(target)) emit('SKIP', [{ sev: 'info', msg: 'cible absente' }]);
const have = c => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }).status === 0;
const isDir = fs.statSync(target).isDirectory();
const find = name => { const p = isDir ? path.join(target, name) : (path.basename(target) === name ? target : null); return p && fs.existsSync(p) ? p : null; };
const req = find('requirements.txt'); const pkg = find('package.json');
if (!req && !pkg) emit('SKIP', [{ sev: 'info', msg: 'aucun manifeste (requirements.txt / package.json) détecté' }]);

const findings = []; let checked = false;

// --- Python : pip-audit sinon OSV ---
if (req) {
  if (have('pip-audit')) {
    const r = spawnSync('pip-audit', ['-r', req, '-f', 'json'], { encoding: 'utf8' });
    checked = true;
    try { const j = JSON.parse(r.stdout || '{}'); (j.dependencies || j || []).forEach(d => (d.vulns || []).forEach(v => findings.push({ sev: 'bloquant', msg: 'PyPI ' + d.name + '@' + d.version + ' : ' + v.id }))); } catch {}
  } else {
    const deps = fs.readFileSync(req, 'utf8').split(/\r?\n/).map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && !l.startsWith('-') && /==/.test(l))
      .map(l => { const [n, v] = l.split('=='); return { name: n.trim().toLowerCase(), version: (v || '').match(/\d[\w.]*/)?.[0] }; }).filter(d => d.version).slice(0, 50);
    const r = await osvBatch(deps.map(d => ({ ecosystem: 'PyPI', name: d.name, version: d.version })));
    if (r === null) NJ.push('pip-audit absent et OSV inaccessible → dépendances Python non vérifiées');
    else { checked = true; r.forEach((vulns, i) => (vulns || []).forEach(id => findings.push({ sev: 'bloquant', msg: 'PyPI ' + deps[i].name + '@' + deps[i].version + ' : ' + id }))); }
  }
}
// --- npm : npm audit sinon OSV ---
if (pkg) {
  const dir = path.dirname(pkg);
  if (have('npm') && (fs.existsSync(path.join(dir, 'package-lock.json')) || fs.existsSync(path.join(dir, 'npm-shrinkwrap.json')))) {
    const r = spawnSync('npm', ['audit', '--json'], { cwd: dir, encoding: 'utf8' });
    checked = true;
    try { const j = JSON.parse(r.stdout || '{}'); const v = j.metadata && j.metadata.vulnerabilities; if (v) { const tot = (v.critical || 0) + (v.high || 0) + (v.moderate || 0); if (tot) findings.push({ sev: 'bloquant', msg: 'npm audit : ' + v.critical + ' crit / ' + v.high + ' high / ' + v.moderate + ' mod' }); } } catch {}
  } else {
    try {
      const j = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      const deps = Object.entries({ ...(j.dependencies || {}), ...(j.devDependencies || {}) })
        .map(([name, r]) => ({ name, version: String(r).match(/\d[\w.]*/)?.[0] })).filter(d => d.version).slice(0, 50);
      const r = await osvBatch(deps.map(d => ({ ecosystem: 'npm', name: d.name, version: d.version })));
      if (r === null) NJ.push('npm audit indisponible et OSV inaccessible → dépendances npm non vérifiées');
      else { checked = true; r.forEach((vulns, i) => (vulns || []).forEach(id => findings.push({ sev: 'bloquant', msg: 'npm ' + deps[i].name + '@' + deps[i].version + ' : ' + id }))); }
    } catch {}
  }
}

async function osvBatch(queries) {
  try {
    const res = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ queries: queries.map(q => ({ package: { ecosystem: q.ecosystem, name: q.name }, version: q.version })) }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.results || []).map(r => (r.vulns || []).map(v => v.id));
  } catch { return null; }
}

if (!checked) emit('SKIP', findings.length ? findings : [{ sev: 'info', msg: 'SCA non vérifiable (outils absents et OSV inaccessible)' }]);
if (findings.some(f => f.sev === 'bloquant')) emit('FAIL', findings);
emit('PASS', [{ sev: 'info', msg: 'aucune vulnérabilité connue sur les dépendances épinglées vérifiées' }]);
