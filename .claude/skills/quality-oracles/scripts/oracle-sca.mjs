#!/usr/bin/env node
// oracle-sca — Domaine « Sécurité : vulnérabilités de dépendances (SCA) ».
// Détecte les manifestes (requirements*.txt, package.json, uv.lock, poetry.lock), interroge un outil
// faisant foi : pip-audit (ou uvx pip-audit) / npm audit s'ils sont installés, sinon l'API OSV
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
//
// TF-2281 (09/11/2026, reste de TF-2272) — LES VERROUS uv.lock ET poetry.lock SE LISENT, ET pip-audit SE
// LANCE PAR uvx. L'oracle ne connaissait que requirements.txt et package.json : un produit Python verrouillé
// par uv ou poetry rendait SKIP « aucun manifeste ». Le code est celui de forge-websec 0.2.0 (oracles/
// oracle-sca.mjs : lireVerrou et le recours à `uvx pip-audit`). Les paquets de REGISTRE d'un verrou sont des
// versions épinglées : interrogés par pip-audit (--no-deps --disable-pip, rien n'est résolu ni installé) ou,
// sans outil, par OSV / les données figées. Les paquets hors registre (git, chemin, URL, projet lui-même) sont
// nommés au non_juge, jamais audités. QO_SCA_PIP_AUDIT et QO_SCA_UVX désignent l'outil à la place de
// `pip-audit` / `uvx` (la recette y met un outil simulé ; un chemin injouable simule l'absence de l'outil).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ecrivainDeContrat } from './lib/contrat.mjs';
import { borneVersionnee } from './lib/perimetre.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ info: true });

const target = process.argv[2];
const optFige = (process.argv.find(a => a.startsWith('--osv-fige=')) || '').slice('--osv-fige='.length);
const DOM = 'Sécurité : vulnérabilités de dépendances (SCA)';
const NJ = ['dépendances transitives non épinglées (version inconnue → non interrogée)', 'vulnérabilités hors bases publiques'];
const raisons = [];                                  // pourquoi une partie n'a PAS été vérifiée
let courant = '';                                    // TF-1700 : le manifeste en cours, qui nomme ses non-vérifiés
const nonVerifie = (m) => { const t = courant ? courant + ' : ' + m : m; raisons.push(t); NJ.push(t); };
let direPerimetre = () => {};   // TF-1729 : les manifestes hors du périmètre versionné se nomment au non_juge, avant toute sortie
function emit(verdict, findings = [], non_juge = NJ) {
  direPerimetre(); direPerimetre = () => {};
  process.stdout.write(contratJSON({ oracle: 'oracle-sca', domaine: DOM, artefact: target || null, verdict, findings, non_juge }));
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
// TF-1700 (lot Produit-82 20261014b, RA-1) — LES MANIFESTES SE CHERCHENT DANS LES SOUS-DOSSIERS.
// run-oracles déclenche cet oracle sur le DOSSIER dès qu'un manifeste y apparaît, à n'importe quelle
// profondeur ; l'oracle ne lisait que la racine et rendait SKIP « aucun manifeste » sur un dépôt
// qui portait `tests/requirements.txt`. Les dossiers écartés sont ceux que le lanceur ne parcourt
// pas (dépendances installées, environnements, sorties, fixtures) ; ils sont dits au non_juge.
const MANIFESTES = ['requirements.txt', 'package.json', 'uv.lock', 'poetry.lock'];
const ECARTES = ['node_modules', '.git', '.venv', 'venv', 'dist', 'build', '__pycache__', 'fixtures', 'old', 'Old'];
const chercher = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ECARTES.includes(e.name)) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...chercher(fp)); else if (MANIFESTES.includes(e.name)) out.push(fp);
  }
  return out;
};
// TF-1729 — `--versionne` (ou QO_PERIMETRE=versionne, posé par run-oracles --versionne) : seuls les
// manifestes que git suit ou suivrait sont lus, comme oracle-secrets depuis TF-1702. Un manifeste
// ignoré par git (copie locale, sortie d'outil) est nommé au non_juge, jamais interrogé.
const borne = borneVersionnee(target, NJ);
direPerimetre = borne.dire;
const manifestes = (isDir ? chercher(target) : (MANIFESTES.includes(path.basename(target)) ? [target] : [])).filter(borne.dans);
const nomM = f => (isDir ? path.relative(target, f) : path.basename(f)).split(path.sep).join('/');
const reqs = manifestes.filter(f => path.basename(f) === 'requirements.txt');
const pkgs = manifestes.filter(f => path.basename(f) === 'package.json');
const locks = manifestes.filter(f => ['uv.lock', 'poetry.lock'].includes(path.basename(f)));
if (!reqs.length && !pkgs.length && !locks.length) emit('SKIP', [{ sev: 'info', msg: 'aucun manifeste (requirements.txt / package.json / uv.lock / poetry.lock) détecté'
  + (isDir ? ' dans le dossier ni dans ses sous-dossiers (hors ' + ECARTES.join(', ') + ')' : '') + (borne.actif ? ', dans le périmètre versionné' : '') }]);
if (isDir) NJ.push('manifestes rangés sous ' + ECARTES.join(', ') + ' : non lus (TF-1700)');
if (locks.length) NJ.push('verrous uv.lock et poetry.lock : un paquet de registre est interrogé comme paquet PyPI, un index privé n\'est pas distingué (TF-2281)');

const findings = []; let checked = false;

// TF-2281 — L'OUTIL D'AUDIT PYTHON : `pip-audit` du poste, sinon `uvx pip-audit` (uv le lance sans l'installer).
const outil = (nom, variable) => {
  const force = process.env[variable];
  if (!force) return { cmd: nom, pre: [] };
  return /\.(mjs|cjs|js)$/i.test(force) ? { cmd: process.execPath, pre: [force] } : { cmd: force, pre: [] };
};
const dispo = (o) => { try { const r = spawnSync(o.cmd, [...o.pre, '--version'], { encoding: 'utf8', timeout: 10000 }); return r.error === undefined && r.status === 0; } catch { return false; } };
let voieMemo;
const voiePip = () => {
  if (voieMemo !== undefined) return voieMemo;
  const pa = outil('pip-audit', 'QO_SCA_PIP_AUDIT'), ux = outil('uvx', 'QO_SCA_UVX');
  voieMemo = dispo(pa) ? { libelle: 'pip-audit', ...pa, delai: 120000 }
    : dispo(ux) ? { libelle: 'uvx pip-audit', cmd: ux.cmd, pre: [...ux.pre, 'pip-audit'], delai: 240000 } : null;
  return voieMemo;
};
/** Un appel à pip-audit sur un fichier requirements ; `epingle` : versions déjà épinglées (verrou) → ni résolution ni installation. */
const auditerPip = (voie, req, epingle) => {
  const r = spawnSync(voie.cmd, [...voie.pre, '-r', req, '-f', 'json', ...(epingle ? ['--no-deps', '--disable-pip'] : [])], { encoding: 'utf8', timeout: voie.delai });
  let j = null; try { j = JSON.parse(r.stdout || ''); } catch { /* sortie inexploitable : non vérifié */ }
  const deps = Array.isArray(j) ? j : (j && Array.isArray(j.dependencies) ? j.dependencies : null);
  const motif = (r.error && r.error.code === 'ETIMEDOUT' ? 'délai de ' + voie.delai / 1000 + ' s dépassé' : (String(r.stderr || '').trim().split(/\r?\n/).pop() || 'aucun message')).slice(0, 160);
  return { deps, exit: r.status, motif };
};

// Lecture d'un verrou uv.lock ou poetry.lock (code de forge-websec 0.2.0) : blocs [[package]], clés name et version en
// tête de bloc. Un paquet qui ne vient pas d'un registre (git, chemin, URL ; le projet lui-même côté uv ; toute
// [package.source] côté poetry) n'est pas interrogeable : il est compté dans `ignores`.
const NOM_OK = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VERSION_OK = /^[A-Za-z0-9][A-Za-z0-9._+!-]*$/;
function lireVerrou(fichier, format) {
  const paquets = [];
  const ignores = [];
  let cur = null;
  let zone = 'tete';
  const clore = () => {
    if (!cur) return;
    if (cur.projet) { cur = null; return; } // le projet lui-même (uv : source virtual ou editable) n'est pas une dépendance
    if (cur.registre && cur.name && cur.version && NOM_OK.test(cur.name) && VERSION_OK.test(cur.version)) paquets.push({ name: cur.name, version: cur.version });
    else ignores.push(cur.name || '(sans nom)');
    cur = null;
  };
  for (const l of fs.readFileSync(fichier, 'utf8').split(/\r?\n/)) {
    if (l.trim() === '[[package]]') { clore(); cur = { name: null, version: null, registre: format === 'poetry' }; zone = 'tete'; continue; }
    if (/^\[/.test(l)) {
      if (cur && /^\[\[?package\./.test(l)) { zone = format === 'poetry' && /^\[package\.source\]/.test(l) ? 'source' : 'autre'; if (zone === 'source') cur.registre = false; }
      else clore();
      continue;
    }
    if (!cur || zone !== 'tete') continue;
    let m;
    if ((m = /^name\s*=\s*"([^"]*)"/.exec(l))) cur.name = m[1];
    else if ((m = /^version\s*=\s*"([^"]*)"/.exec(l))) cur.version = m[1];
    else if (format === 'uv' && /^source\s*=\s*\{\s*registry\s*=/.test(l)) cur.registre = true;
    else if (format === 'uv' && /^source\s*=\s*\{\s*(virtual|editable)\s*=/.test(l)) cur.projet = true;
  }
  clore();
  return { paquets, ignores };
}

// --- Python : pip-audit, sinon uvx pip-audit, sinon OSV (ou données figées) ---
for (const req of reqs) {
  courant = nomM(req); const avant = findings.length;
  const voie = FIGE ? null : voiePip();
  if (voie) {
    const { deps, exit, motif } = auditerPip(voie, req, false);
    if (!deps) nonVerifie(voie.libelle + ' sans sortie exploitable (exit ' + exit + ' : ' + motif
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
  findings.slice(avant).forEach(f => { f.where = courant; });
}
// --- Python verrouillé : uv.lock, poetry.lock (TF-2281) — mêmes voies que requirements.txt, sur des versions épinglées ---
for (const lock of locks) {
  courant = nomM(lock); const avant = findings.length;
  const v = lireVerrou(lock, path.basename(lock) === 'uv.lock' ? 'uv' : 'poetry');
  if (v.ignores.length) nonVerifie(v.ignores.length + ' paquet(s) hors registre non audité(s) (git, chemin, URL ou index privé) : '
    + v.ignores.slice(0, 10).join(', ') + (v.ignores.length > 10 ? ', …' : ''));
  if (!v.paquets.length) { nonVerifie('verrou lu mais aucun paquet de registre reconnu (format inattendu ou verrou vide) → dépendances Python NON vérifiées'); }
  else {
    const voie = FIGE ? null : voiePip();
    if (voie) {
      // pip-audit refuse deux versions du même nom dans un fichier : une couche par rang de version.
      const parNom = new Map();
      for (const p of v.paquets) { if (!parNom.has(p.name)) parNom.set(p.name, []); const vs = parNom.get(p.name); if (!vs.includes(p.version)) vs.push(p.version); }
      const rangs = Math.max(...[...parNom.values()].map(vs => vs.length));
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-sca-'));
      const deps = []; let echec = null;
      try {
        for (let i = 0; i < rangs && echec === null; i++) {
          const f = path.join(tmp, 'requirements-' + i + '.txt');
          fs.writeFileSync(f, [...parNom].filter(([, vs]) => vs.length > i).map(([n, vs]) => n + '==' + vs[i]).join('\n') + '\n');
          const r = auditerPip(voie, f, true);
          if (!r.deps) echec = 'exit ' + r.exit + ' : ' + r.motif; else deps.push(...r.deps);
        }
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
      if (echec !== null) nonVerifie(voie.libelle + ' sans sortie exploitable sur le verrou (' + echec + ') → dépendances Python NON vérifiées — ressource distante (PyPI, base de vulnérabilités) injoignable ?');
      else { checked = true; deps.forEach(d => (d.vulns || []).forEach(x => findings.push({ sev: 'bloquant', msg: 'PyPI ' + d.name + '@' + d.version + ' : ' + x.id }))); }
    } else {
      const deps = v.paquets.map(p => ({ name: p.name.toLowerCase(), version: p.version })).slice(0, 1000);
      if (v.paquets.length > deps.length) nonVerifie((v.paquets.length - deps.length) + ' paquet(s) du verrou au-delà des 1000 premiers : non interrogés');
      const r = await interroger(deps.map(d => ({ ecosystem: 'PyPI', name: d.name, version: d.version })));
      if (r === null) nonVerifie(FIGE ? 'paquets du verrou absents des données figées → NON vérifiés'
        : 'pip-audit et uvx absents et OSV injoignable (https://api.osv.dev) → dépendances Python du verrou NON vérifiées');
      else { checked = true; r.forEach((vulns, i) => (vulns || []).forEach(id => findings.push({ sev: 'bloquant', msg: 'PyPI ' + deps[i].name + '@' + deps[i].version + ' : ' + id }))); }
    }
  }
  findings.slice(avant).forEach(f => { f.where = courant; });
}
// --- npm : npm audit sinon OSV (ou données figées) ---
for (const pkg of pkgs) {
  courant = nomM(pkg); const avant = findings.length;
  const dir = path.dirname(pkg);
  if (!FIGE && have('npm') && (fs.existsSync(path.join(dir, 'package-lock.json')) || fs.existsSync(path.join(dir, 'npm-shrinkwrap.json')))) {
    // Sous Windows, npm est un script `npm.cmd` : Node refuse de le lancer sans shell (status null,
    // aucune sortie), et l'oracle rendait SKIP sur un poste où npm répond (TF-1348, 01/10/2026).
    const r = spawnSync('npm', ['audit', '--json'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
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
  findings.slice(avant).forEach(f => { f.where = courant; });
}
courant = '';

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
emit('PASS', [{ sev: 'info', msg: 'aucune vulnérabilité connue sur les dépendances épinglées vérifiées — manifeste(s) lu(s) : ' + manifestes.map(nomM).join(', ') }]);
