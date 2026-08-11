#!/usr/bin/env node
// self-test — oracle du skill sur LUI-MÊME (et sur les autres skills installés).
// Vérifie : (1) frontmatter de chaque SKILL.md — champ `name` présent, `description`
// ≤ 1024 caractères (règle d'import qui a déjà fait échouer une version) ; (2) le
// registre JSON parse ; (3) chaque oracle CLI (.mjs) du registre existe et compile
// (`node --check`). exit 0 = PASS, 1 = FAIL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePython } from './lib/python.mjs';

const SKILLDIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLSROOT = path.resolve(SKILLDIR, '..');
const fails = [], oks = [];
const ok = m => oks.push(m);
const ko = m => fails.push(m);

// --- extraction du champ description d'un frontmatter YAML (folded > / | / inline / quoted) ---
function frontmatter(txt) {
  // CRLF toléré : un SKILL.md servi en CRLF (poste Windows, core.autocrlf, skill tiers)
  // porte un frontmatter parfaitement valide ; sans normalisation le `\r` résiduel reste
  // collé en fin de ligne et `name`/`description` étaient déclarés absents à tort.
  // On normalise la lecture — aucun contrôle n'est assoupli.
  txt = txt.replace(/\r\n/g, '\n');
  const m = txt.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const lines = m[1].split('\n');
  const fm = { name: null, description: null };
  for (let i = 0; i < lines.length; i++) {
    const mn = lines[i].match(/^name:\s*(.*)$/); if (mn) fm.name = mn[1].trim().replace(/^["']|["']$/g, '');
    const md = lines[i].match(/^description:\s*(.*)$/);
    if (md) {
      let v = md[1].trim();
      if (v === '>' || v === '|' || v === '>-' || v === '|-') {
        const buf = [];
        for (let j = i + 1; j < lines.length; j++) { if (/^\S/.test(lines[j])) break; buf.push(lines[j].trim()); }
        fm.description = buf.filter(Boolean).join(v[0] === '|' ? '\n' : ' ');
      } else fm.description = v.replace(/^["']|["']$/g, '');
    }
  }
  return fm;
}

// (1) frontmatter de tous les skills installés
for (const d of fs.readdirSync(SKILLSROOT, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const sf = path.join(SKILLSROOT, d.name, 'SKILL.md');
  if (!fs.existsSync(sf)) continue;
  const fm = frontmatter(fs.readFileSync(sf, 'utf8'));
  if (!fm) { ko(`${d.name} : frontmatter illisible`); continue; }
  if (!fm.name) ko(`${d.name} : champ 'name' absent`);
  if (fm.description == null) ko(`${d.name} : champ 'description' absent`);
  else if (fm.description.length > 1024) ko(`${d.name} : description ${fm.description.length} > 1024 caractères`);
  else ok(`${d.name} : frontmatter OK (description ${fm.description.length}/1024)`);
}

// (2) registre JSON
let reg = null;
try { reg = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'references', 'registre-oracles.json'), 'utf8')); ok('registre-oracles.json : JSON valide (' + reg.oracles.length + ' oracles)'); }
catch (e) { ko('registre-oracles.json illisible : ' + e.message); }

// (2b) référentiel R1-R10 : source de vérité présente et non vide (règles canoniques d'audit des oracles)
const reglesPath = path.join(SKILLDIR, 'references', 'regles-oracles.md');
if (!fs.existsSync(reglesPath)) ko('regles-oracles.md absent (référentiel R1-R10 — source de vérité des audits d\'oracles)');
else {
  const t = fs.readFileSync(reglesPath, 'utf8');
  const missing = Array.from({ length: 10 }, (_, i) => 'R' + (i + 1) + '.').filter(r => !t.includes(r));
  missing.length ? ko('regles-oracles.md incomplet : règles manquantes ' + missing.join(' ')) : ok('regles-oracles.md : référentiel R1-R10 complet');
}

// (3) oracles CLI : script présent + compile (.mjs via node --check, .py via py_compile)
const have = c => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }).status === 0;
if (reg) for (const o of reg.oracles) {
  if (o.type !== 'cli' || !o.cmd) continue;
  const script = o.cmd.find(x => /\.(mjs|py)$/.test(x));
  if (!script) continue;
  const p = script.replace('{skilldir}', SKILLDIR).replace('{skillsroot}', SKILLSROOT);
  const base = path.basename(p);
  if (!fs.existsSync(p)) { ko('oracle absent : ' + base); continue; }
  if (!p.startsWith(SKILLDIR)) { ok('oracle délégué présent : ' + base); continue; }   // ex. render_page.py (autre skill)
  if (p.endsWith('.mjs')) {
    const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    r.status === 0 ? ok('oracle compile : ' + base) : ko('oracle ne compile pas : ' + base + ' — ' + (r.stderr || '').split('\n')[0]);
  } else {
    const py = resolvePython(); // portable Windows/Unix, esquive l'alias Store (cf. lib/python.mjs)
    if (!py) { ok('oracle .py présent (python absent — compile non vérifié) : ' + base); continue; }
    const r = spawnSync(py[0], [...py.slice(1), '-m', 'py_compile', p], { encoding: 'utf8' });
    r.status === 0 ? ok('oracle compile (py) : ' + base) : ko('oracle .py ne compile pas : ' + base + ' — ' + (r.stderr || '').split('\n')[0]);
  }
}

// (3b) présence effective des délégués : le registre ne doit jamais contredire l'environnement.
// statut ok + skill absent → ko (délégation déclarée opérante mais inopérante) ;
// statut todo + skill PRÉSENT → ko (registre périmé : la délégation existe mais reste ignorée) ;
// type kit → externe par conception : informatif seulement, jamais ko sur absence.
if (reg) for (const o of reg.oracles) {
  if (o.type === 'kit') { ok('kit externe (présence non exigée) : ' + o.domaine); continue; }
  if (o.type !== 'skill' || !o.skill) continue;
  const present = fs.existsSync(path.join(SKILLSROOT, o.skill, 'SKILL.md'));
  if (o.statut === 'ok' && !present) ko(`délégué déclaré ok mais absent de l'environnement : ${o.skill} (${o.domaine})`);
  else if (['todo', 'manuel'].includes(o.statut) && present) ko(`délégué présent mais marqué ${o.statut} — registre périmé : ${o.skill} (${o.domaine})`);
  else ok(`délégué cohérent registre↔environnement : ${o.skill} (${o.statut}${present ? ', présent' : ', absent assumé'})`);
}

// (4) couverture du registre (gouvernance)
if (reg) {
  const by = {}; reg.oracles.forEach(o => by[o.statut] = (by[o.statut] || 0) + 1);
  ok('couverture registre : ' + Object.entries(by).map(([k, v]) => k + '=' + v).join(' · '));
  const gaps = reg.oracles.filter(o => ['todo', 'manuel'].includes(o.statut)).map(o => o.domaine);
  if (gaps.length) ok('domaines sans oracle automatique (règle §4 si rencontrés) : ' + gaps.join(' ; '));
}

// (4b) C1 — profils : JSON valides, generique + digit-ai présents
const profDir = path.join(SKILLDIR, 'profils');
if (!fs.existsSync(profDir)) ko('profils/ absent (C1 — politiques contextuelles)');
else for (const need of ['generique.json', 'digit-ai.json']) {
  const pp = path.join(profDir, need);
  if (!fs.existsSync(pp)) { ko('profil manquant : ' + need); continue; }
  try { const pj = JSON.parse(fs.readFileSync(pp, 'utf8')); ok('profil valide : ' + need + ' (' + (pj.nom || '?') + ')'); }
  catch (e) { ko('profil illisible : ' + need + ' — ' + e.message); }
}
// (4d) §6 — niveaux d'exigence : sections valides, plancher jamais exclu, preuve comportementale
const PLANCHER = ['Format / livraison / versioning', 'Sécurité / secrets', 'Calculs / chiffres', 'Traçabilité des affirmations chiffrées'];
if (fs.existsSync(profDir)) for (const pf of fs.readdirSync(profDir).filter(f => f.endsWith('.json'))) {
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(profDir, pf), 'utf8'));
    if (!pj.niveaux) { ko('profil sans section niveaux (§6) : ' + pf); continue; }
    const bad = [];
    for (const [niv, cfg] of Object.entries(pj.niveaux)) for (const d of (cfg.exclus || [])) if (PLANCHER.includes(d)) bad.push(niv + ':' + d);
    bad.length ? ko('profil ' + pf + ' : plancher non désactivable exclu — ' + bad.join(' ; ')) : ok('profil ' + pf + ' : niveaux valides, plancher respecté (' + Object.keys(pj.niveaux).join('/') + ')');
  } catch {}
}
// preuve comportementale : perf-red.html non jugé en niveau note (perf exclu), FAIL en production
{
  // tmpdir du POSTE, jamais fixtures/ : un process tué en plein run y fuyait ses dossiers
  // .tmp-niv-* (24 résidus constatés, TF-0068) — hors dépôt, une fuite est sans victime.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-niv-'));
  try {
    fs.copyFileSync(path.join(SKILLDIR, 'fixtures', 'perf-red.html'), path.join(tmp, 'perf-red.html'));
    const run = niv => spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), tmp, '--niveau', niv, '--no-cache', '--json', '--profil', path.join(SKILLDIR, 'fixtures', 'profil-test-niveaux.json')], { encoding: 'utf8', timeout: 180000 });
    const parse = r => { try { return JSON.parse((r.stdout || '').trim()); } catch { return null; } };
    const jNote = parse(run('note')), jProd = parse(run('production'));
    const perfNote = jNote && jNote.resultats.some(x => x.domaine === 'Performance / poids');
    const perfProd = jProd && jProd.resultats.some(x => x.domaine === 'Performance / poids' && x.verdict === 'FAIL');
    !jNote || !jProd ? ko('§6 : run-oracles --json inexploitable pour la preuve des niveaux')
      : perfNote ? ko('§6 : domaine exclu au niveau note pourtant jugé (perf)')
        : !perfProd ? ko('§6 : perf-red non FAIL au niveau production')
          : ok('§6 niveaux : perf exclu en note, FAIL en production (preuve comportementale)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// (4c-lib) modules partagés scripts/lib/ : compilent (source unique num/tables/claims-extract)
const libDir = path.join(SKILLDIR, 'scripts', 'lib');
if (fs.existsSync(libDir)) for (const s of fs.readdirSync(libDir).filter(f => f.endsWith('.mjs'))) {
  const r = spawnSync(process.execPath, ['--check', path.join(libDir, s)], { encoding: 'utf8' });
  r.status === 0 ? ok('lib compile : ' + s) : ko('lib ne compile pas : ' + s + ' — ' + (r.stderr || '').split('\n')[0]);
}

// (4c) scripts utilitaires (bootstrap, report-couverture) : compilent
for (const s of ['bootstrap.mjs', 'report-couverture.mjs']) {
  const sp = path.join(SKILLDIR, 'scripts', s);
  if (!fs.existsSync(sp)) { ko('script utilitaire absent : ' + s); continue; }
  const r = spawnSync(process.execPath, ['--check', sp], { encoding: 'utf8' });
  r.status === 0 ? ok('utilitaire compile : ' + s) : ko('utilitaire ne compile pas : ' + s);
}

// (5) P1 — oracle de l'oracle : rejouer les fixtures rouge/verte du manifest.
// Un oracle n'est recevable que s'il ÉCHOUE sur le cas rouge et RÉUSSIT sur le cas vert
// (SKIP toléré uniquement pour les oracles déclarés dépendants d'un outil externe).
const manifestPath = path.join(SKILLDIR, 'fixtures', 'manifest.json');
if (!fs.existsSync(manifestPath)) ko('fixtures/manifest.json absent (P1 — chaque oracle doit prouver FAIL rouge / PASS verte)');
else {
  let man = null;
  try { man = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { ko('manifest.json illisible : ' + e.message); }
  if (man) for (const fx of man.fixtures) {
    for (const side of ['red', 'green']) {
      const fxFile = path.join(SKILLDIR, 'fixtures', fx[side]);
      if (!fs.existsSync(fxFile)) { ko(`fixture ${side} absente : ${fx[side]} (${fx.nom})`); continue; }
      let cmd = fx.cmd.map(s => s.replace('{skilldir}', SKILLDIR).replace('{fixture}', fxFile));
      // « python3 » du manifest est un nom Unix : sur ce poste on substitue l'interpréteur
      // réellement fonctionnel (esquive l'alias Store Windows) — cf. lib/python.mjs.
      if (cmd[0] === 'python3' || cmd[0] === 'python') {
        const pyFx = resolvePython();
        if (!pyFx) { ok(`fixture ${fx.nom}/${side} : SKIP toléré (python indisponible)`); continue; }
        cmd = [...pyFx, ...cmd.slice(1)];
      }
      const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 180000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      let v = null; try { v = JSON.parse((r.stdout || '').trim().match(/\{[\s\S]*\}/)[0]).verdict; } catch {}
      if (!v) v = r.status === 0 ? 'PASS' : r.status === 2 ? 'SKIP' : 'FAIL';
      const attendu = fx['attendu_' + side];
      if (!attendu.includes(v)) ko(`fixture ${fx.nom}/${side} : verdict ${v}, attendu ${attendu.join('|')} — l'oracle ne juge pas comme prouvé`);
      else if (v === 'SKIP') ok(`fixture ${fx.nom}/${side} : SKIP toléré (dépend de : ${fx.dependant_outil || 'outil externe'})`);
      else ok(`fixture ${fx.nom}/${side} : ${v} conforme`);
    }
  }
}

console.log('SELF-TEST quality-oracles');
oks.forEach(m => console.log('  ✅ ' + m));
fails.forEach(m => console.log('  ❌ ' + m));
console.log(fails.length ? `\n❌ ${fails.length} échec(s).` : `\n✅ PASS (${oks.length} contrôles).`);
process.exit(fails.length ? 1 : 0);
