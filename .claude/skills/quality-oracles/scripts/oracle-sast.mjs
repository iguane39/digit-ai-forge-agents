#!/usr/bin/env node
// oracle-sast — Domaine « Sécurité : SAST (injection / exécution dangereuse) ».
// Analyse statique du code source. Utilise semgrep / bandit s'ils sont installés
// (autorité) ; sinon, jeu de règles INTÉGRÉES déterministes (injection SQL par
// concaténation/f-string, eval/exec, shell=True, os.system, child_process.exec
// interpolé, désérialisation non sûre, innerHTML dynamique…). Verdict FAIL si motif
// bloquant. Complète oracle-secrets (secrets) et oracle-sca (dépendances).
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} ; exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const target = process.argv[2];
const DOM = 'Sécurité : SAST (injection / exécution dangereuse)';
const NJ = ['analyse de flux (taint) inter-fichiers', 'faux négatifs des patterns indirects', 'logique métier'];
function emit(verdict, findings = [], non_juge = NJ) {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-sast', domaine: DOM, artefact: target || null, verdict, findings, non_juge }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
}
if (!target || !fs.existsSync(target)) emit('SKIP', [{ sev: 'info', msg: 'cible absente' }]);
const have = c => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }).status === 0;

const CODE = ['.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'];
function listFiles(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (['node_modules', '.git', '.venv', 'dist', 'build', '__pycache__'].includes(e.name)) continue;
    const fp = path.join(p, e.name);
    if (e.isDirectory()) out.push(...listFiles(fp)); else out.push(fp);
  }
  return out;
}
const codeFiles = listFiles(target).filter(f => CODE.includes(path.extname(f).toLowerCase()));
if (!codeFiles.length) emit('SKIP', [{ sev: 'info', msg: 'aucun fichier de code source' }]);

const SQLKW = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|WHERE|FROM)\b/i;
// règles intégrées : [regex, sévérité, message, langs]
const RULES = [
  [/\b(?:cursor\.)?execute(?:script)?\s*\(\s*f["'][^"']*\{/i, 'bloquant', 'injection SQL : f-string dans execute()', 'py'],
  [/\b(?:cursor\.)?execute(?:script)?\s*\([^)]*(?:%|\+)\s*[A-Za-z_]/i, 'bloquant', 'injection SQL : chaîne concaténée/formatée dans execute()', 'py'],
  [/\b(?:query|execute|raw)\s*\(\s*`[^`]*\$\{/i, 'bloquant', 'injection SQL : template literal ${} dans une requête', 'js'],
  [/\b(?:query|execute)\s*\([^)]*\+[^)]*/i, 'warn', 'requête construite par concaténation (vérifier paramétrage)', 'js'],
  [/\beval\s*\(/, 'bloquant', 'exécution dynamique : eval()', 'any'],
  [/\bnew\s+Function\s*\(/, 'bloquant', 'exécution dynamique : new Function()', 'js'],
  [/\bexec\s*\(/, 'warn', 'exec() — exécution dynamique (contexte à vérifier)', 'py'],
  [/subprocess\.[A-Za-z_]+\([^)]*shell\s*=\s*True/i, 'bloquant', 'subprocess shell=True (injection de commande)', 'py'],
  [/\bos\.system\s*\(/, 'bloquant', 'os.system() (injection de commande)', 'py'],
  [/child_process\.\w*exec\w*\s*\(\s*[`'"][^`'"]*(?:\$\{|"\s*\+|'\s*\+)/i, 'bloquant', 'child_process.exec interpolé (injection de commande)', 'js'],
  [/yaml\.load\s*\((?![^)]*Safe)/i, 'warn', 'yaml.load sans SafeLoader', 'py'],
  [/\bpickle\.loads?\s*\(/, 'warn', 'désérialisation pickle (source non fiable ?)', 'py'],
  [/dangerouslySetInnerHTML/, 'warn', 'dangerouslySetInnerHTML (XSS potentiel)', 'js'],
  [/\.innerHTML\s*=\s*(?!['"`])/, 'warn', 'affectation innerHTML dynamique (XSS potentiel)', 'js']
];
const langOf = ext => ext === '.py' ? 'py' : 'js';

const findings = [];
for (const f of codeFiles) {
  let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const lang = langOf(path.extname(f).toLowerCase());
  const lines = txt.split(/\r?\n/);
  lines.forEach((ln, i) => {
    for (const [re, sev, msg, rl] of RULES) {
      if (rl !== 'any' && rl !== lang) continue;
      if (re.test(ln)) {
        if (/injection SQL/.test(msg) && !SQLKW.test(ln) && !SQLKW.test(lines[i + 1] || '')) continue; // exiger un mot-clé SQL proche
        findings.push({ sev, msg, where: path.relative(process.cwd(), f) + ':' + (i + 1) });
      }
    }
  });
}
// outils faisant autorité si présents (complètent le repli)
if (have('semgrep')) {
  const g = spawnSync('semgrep', ['--quiet', '--json', '--config', 'auto', target], { encoding: 'utf8', timeout: 120000 });
  try { (JSON.parse(g.stdout || '{}').results || []).forEach(r => findings.push({ sev: 'bloquant', msg: 'semgrep ' + (r.check_id || '').split('.').pop(), where: (r.path || '') + ':' + (r.start && r.start.line) })); } catch {}
} else NJ.push('semgrep non installé — règles intégrées utilisées (couverture moindre)');
if (have('bandit') && codeFiles.some(f => f.endsWith('.py'))) {
  const b = spawnSync('bandit', ['-r', target, '-f', 'json'], { encoding: 'utf8', timeout: 120000 });
  try { (JSON.parse(b.stdout || '{}').results || []).forEach(r => { if (/HIGH|MEDIUM/i.test(r.issue_severity)) findings.push({ sev: r.issue_severity === 'HIGH' ? 'bloquant' : 'warn', msg: 'bandit ' + r.test_id + ' ' + r.issue_text.slice(0, 60), where: r.filename + ':' + r.line_number }); }); } catch {}
}

const blocking = findings.filter(f => f.sev === 'bloquant');
if (blocking.length) emit('FAIL', findings);
emit('PASS', findings.length ? findings : [{ sev: 'info', msg: 'aucun motif d\'injection / exécution dangereuse détecté (' + codeFiles.length + ' fichier[s])' }]);
