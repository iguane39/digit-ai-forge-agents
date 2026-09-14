#!/usr/bin/env node
// oracle-sca — Domaine « Sécurité : vulnérabilités de dépendances (SCA) ».
// Détecte les manifestes (requirements*.txt, package.json), interroge un outil
// faisant foi : pip-audit / npm audit s'ils sont installés, sinon l'API OSV
// (https://api.osv.dev) pour les versions ÉPINGLÉES. Verdict FAIL si vulnérabilité,
// PASS si vérifié sans vulnérabilité, SKIP si rien n'est vérifiable (outils absents
// ET réseau OSV inaccessible) → honnêteté : « non vérifié » plutôt qu'un faux PASS.
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} ; exit 0/1/2.
//
// TF-1107 (14/09/2026) — LE VERDICT DES FIXTURES DÉPENDAIT DU RÉSEAU. La fixture verte, sans
// version épinglée, passait par pip-audit (résolution PyPI + base vivante) : PASS en général, FAIL
// une fois sur quatre exécutions le 14/09. Et un pip-audit EN ÉCHEC posait `checked = true` : PASS
// sans rien avoir vérifié. Deux corrections :
//   · `--osv-fige=<fichier>` répond aux requêtes depuis des données FIGÉES, datées et sourcées,
//     sans outil ni réseau — le manifeste des fixtures le DÉSIGNE (jamais par voisinage, §3.6) ;
//   · en usage réel, un pip-audit sans sortie exploitable, un OSV injoignable ou l'absence de
//     dépendance épinglée rendent un SKIP MOTIVÉ et NOMMÉ, déclaré au non_juge — jamais un PASS.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const target = process.argv[2];
const optFige = (process.argv.find(a => a.startsWith('--osv-fige=')) || '').slice('--osv-fige='.length);
const DOM = 'Sécurité : vulnérabilités de dépendances (SCA)';
const NJ = ['dépendances transitives non épinglées (version inconnue → non interrogée)', 'vulnérabilités hors bases publiques'];
const raisons = [];                                  // pourquoi une partie n'a PAS été vérifiée
const nonVerifie = (m) => { raisons.push(m); NJ.push(m); };
function emit(verdict, findings = [], non_juge = NJ) {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-sca', domaine: DOM, artefact: target || null, verdict, findings, non_juge }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
}
if (!target || !fs.existsSync(target)) emit('SKIP', [{ sev: 'info', msg: 'cible absente' }]);
let FIGE = null;
if (optFige) {
  try { FIGE = JSON.parse(fs.readFileSync(optFige, 'utf8')); }
  catch (e) { emit('SKIP', [{ sev: 'info', msg: 'données OSV figées illisibles (' + optFige + ') : ' + e.message }]); }
  NJ.push(`mode --osv-fige : verdict rendu sur des données FIGÉES (${FIGE.source || 'source non dite'}, relevées le ${FIGE.date || 'date non dite'}) — `
    + 'aucun outil ni réseau interrogé ; ne dit rien des vulnérabilités publiées depuis');
}
const have = c => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }).status === 0;
const isDir = fs.statSync(target).isDirectory();
const find = name => { const p = isDir ? path.join(target, name) : (path.basename(target) === name ? target : null); return p && fs.existsSync(p) ? p : null; };
const req = find('requirements.txt'); const pkg = find('package.json');
if (!req && !pkg) emit('SKIP', [{ sev: 'info', msg: 'aucun manifeste (requirements.txt / package.json) détecté' }]);

const findings = []; let checked = false;

// --- Python : pip-audit sinon OSV (ou données figées) ---
if (req) {
  if (!FIGE && have('pip-audit')) {
    const r = spawnSync('pip-audit', ['-r', req, '-f', 'json'], { encoding: 'utf8' });
    let j = null; try { j = JSON.parse(r.stdout || ''); } catch { /* sortie inexploitable : non vérifié */ }
    const deps = Array.isArray(j) ? j : (j && Array.isArray(j.dependencies) ? j.dependencies : null);
    if (!deps) nonVerifie('pip-audit sans sortie exploitable (exit ' + r.status + ' : '
      + (String(r.stderr || '').trim().split(/\r?\n/).pop() || 'aucun message').slice(0, 160)
      + ') → dépendances Python NON vérifiées — ressource distante (PyPI, base de vulnérabilités) injoignable ?');
    else { checked = true; deps.forEach(d => (d.vulns || []).forEach(v => findings.push({ sev: 'bloquant', msg: 'PyPI ' + d.name + '@' + d.version + ' : ' + v.id }))); }
  } else {
    const deps = fs.readFileSync(req, 'utf8').split(/\r?\n/).map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && !l.startsWith('-') && /==/.test(l))
      .map(l => { const [n, v] = l.split('=='); return { name: n.trim().toLowerCase(), version: (v || '').match(/\d[\w.]*/)?.[0] }; }).filter(d => d.version).slice(0, 50);
    if (!deps.length) nonVerifie('aucune dépendance Python ÉPINGLÉE (==) : rien d\'interrogeable');
    else {
      const r = await interroger(deps.map(d => ({ ecosystem: 'PyPI', name: d.name, version: d.version })));
      if (r === null) nonVerifie(FIGE ? 'dépendances Python absentes des données figées → NON vérifiées'
        : 'pip-audit absent et OSV injoignable (https://api.osv.dev) → dépendances Python NON vérifiées');
      else { checked = true; r.forEach((vulns, i) => (vulns || []).forEach(id => findings.push({ sev: 'bloquant', msg: 'PyPI ' + deps[i].name + '@' + deps[i].version + ' : ' + id }))); }
    }
  }
}
// --- npm : npm audit sinon OSV (ou données figées) ---
if (pkg) {
  const dir = path.dirname(pkg);
  if (!FIGE && have('npm') && (fs.existsSync(path.join(dir, 'package-lock.json')) || fs.existsSync(path.join(dir, 'npm-shrinkwrap.json')))) {
    const r = spawnSync('npm', ['audit', '--json'], { cwd: dir, encoding: 'utf8' });
    let j = null; try { j = JSON.parse(r.stdout || ''); } catch { /* sortie inexploitable : non vérifié */ }
    const v = j && j.metadata && j.metadata.vulnerabilities;
    if (!v) nonVerifie('npm audit sans sortie exploitable (exit ' + r.status + ') → dépendances npm NON vérifiées — registre npm injoignable ?');
    else { checked = true; const tot = (v.critical || 0) + (v.high || 0) + (v.moderate || 0); if (tot) findings.push({ sev: 'bloquant', msg: 'npm audit : ' + v.critical + ' crit / ' + v.high + ' high / ' + v.moderate + ' mod' }); }
  } else {
    try {
      const j = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      const deps = Object.entries({ ...(j.dependencies || {}), ...(j.devDependencies || {}) })
        .map(([name, r]) => ({ name, version: String(r).match(/\d[\w.]*/)?.[0] })).filter(d => d.version).slice(0, 50);
      if (!deps.length) nonVerifie('aucune dépendance npm versionnée : rien d\'interrogeable');
      else {
        const r = await interroger(deps.map(d => ({ ecosystem: 'npm', name: d.name, version: d.version })));
        if (r === null) nonVerifie(FIGE ? 'dépendances npm absentes des données figées → NON vérifiées'
          : 'npm audit indisponible et OSV injoignable (https://api.osv.dev) → dépendances npm NON vérifiées');
        else { checked = true; r.forEach((vulns, i) => (vulns || []).forEach(id => findings.push({ sev: 'bloquant', msg: 'npm ' + deps[i].name + '@' + deps[i].version + ' : ' + id }))); }
      }
    } catch { nonVerifie('package.json illisible → dépendances npm NON vérifiées'); }
  }
}

/** Les vulnérabilités de chaque requête — depuis les données figées si désignées, sinon OSV.
 *  `null` = non vérifiable (réseau injoignable, ou requête absente des données figées). */
async function interroger(queries) {
  if (FIGE) {
    const rep = FIGE.reponses || {};
    const cle = q => `${q.ecosystem}:${q.name}@${q.version}`;
    return queries.every(q => Array.isArray(rep[cle(q)])) ? queries.map(q => rep[cle(q)]) : null;
  }
  return osvBatch(queries);
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

if (!checked) emit('SKIP', findings.length ? findings : [{ sev: 'info', msg: 'SCA non vérifiable — ' + (raisons.join(' ; ') || 'outils absents et OSV injoignable') }]);
if (findings.some(f => f.sev === 'bloquant')) emit('FAIL', findings);
emit('PASS', [{ sev: 'info', msg: 'aucune vulnérabilité connue sur les dépendances épinglées vérifiées' }]);
