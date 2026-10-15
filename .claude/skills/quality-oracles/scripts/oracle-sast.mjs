#!/usr/bin/env node
// oracle-sast — Domaine « Sécurité : SAST (injection / exécution dangereuse) ».
// Analyse statique du code source. Utilise semgrep / bandit s'ils sont installés
// (autorité) ; sinon, jeu de règles INTÉGRÉES déterministes (injection SQL par
// concaténation/f-string/.format(), eval/exec, shell=True, os.system, child_process.exec
// interpolé, désérialisation non sûre, innerHTML dynamique…). Verdict FAIL si motif
// bloquant. Complète oracle-secrets (secrets) et oracle-sca (dépendances).
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} ; exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ecrivainDeContrat } from './lib/contrat.mjs';
import { borneVersionnee } from './lib/perimetre.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ info: true });

const target = process.argv[2];
const DOM = 'Sécurité : SAST (injection / exécution dangereuse)';
const NJ = ['analyse de flux (taint) inter-fichiers', 'faux négatifs des patterns indirects', 'logique métier'];
let direPerimetre = () => {};   // TF-1729 : les fichiers hors du périmètre versionné se nomment au non_juge, avant toute sortie
function emit(verdict, findings = [], non_juge = NJ) {
  direPerimetre(); direPerimetre = () => {};
  process.stdout.write(contratJSON({ oracle: 'oracle-sast', domaine: DOM, artefact: target || null, verdict, findings, non_juge }));
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
// TF-1729 — `--versionne` (ou QO_PERIMETRE=versionne, posé par run-oracles --versionne) : seul le code
// que git suit ou suivrait est jugé, comme oracle-secrets depuis TF-1702 ; les règles intégrées comme
// les constats de semgrep et de bandit. Un fichier ignoré par git est nommé au non_juge, jamais jugé.
const borne = borneVersionnee(target, NJ);
direPerimetre = borne.dire;
const codeFiles = listFiles(target).filter(f => CODE.includes(path.extname(f).toLowerCase())).filter(borne.dans);
if (!codeFiles.length) emit('SKIP', [{ sev: 'info', msg: 'aucun fichier de code source' + (borne.actif ? ' dans le périmètre versionné' : '') }]);
const horsBorne = f => borne.actif && f && !borne.dans(path.resolve(String(f)));   // constat d'un outil hors du périmètre

const SQLKW = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|WHERE|FROM)\b/i;
// TF-1705 (lot Produit-82 20261014c, RA-4) — `%s` et `%(nom)s` écrits DANS le littéral sont les
// marqueurs des paramètres liés de psycopg (`execute("… ANY(%s)", (ids,))`) : ce n'est pas un
// formatage. La règle « concaténée/formatée » se confirme donc sur la ligne aux littéraux VIDÉS :
// seul un `%` ou un `+` posé HORS de la chaîne (`"…'%s'" % nom`, `"…'" + nom`, `sql + "…"`) reste
// une injection. Les littéraux d'une ligne sont vidés, triples guillemets d'abord, échappements tenus.
const sansLitteraux = ln => ln.replace(/("""|''')[\s\S]*?\1|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
const SQL_FORMATEE_HORS_LITTERAL = /\bexecute(?:script)?\s*\([^)]*(?:%\s*[A-Za-z_(\[{]|\+\s*[A-Za-z_("']|[A-Za-z0-9_)\]"']\s*\+)/i;
// règles intégrées : [regex, sévérité, message, langs]
// TF-1730 (15/10/2026, constat de TF-1705) — deux formes que la règle f-string ne voyait pas : la
// chaîne formatée par `.format()` passée à execute() (`execute("… '{}'".format(nom))`, ce que bandit
// B608 accuse et la règle intégrée non), et la f-string à préfixe `rf`/`fr` ou entre triples
// guillemets. Le littéral doit porter une accolade et être suivi de `.format(` : une requête
// paramétrée (`execute("… %s", (nom,))`) et un `.format()` hors d'execute() ne sont pas accusés.
const RULES = [
  [/\b(?:cursor\.)?execute(?:script)?\s*\(\s*(?:f[rb]?|[rb]f)("""|'''|"|')(?:(?!\1)[^\\]|\\.)*?\{/i, 'bloquant', 'injection SQL : f-string dans execute()', 'py'],
  [/\bexecute(?:script)?\s*\(\s*[rbu]?("""|'''|"|')(?:(?!\1)[^\\]|\\.)*?\{[^}]*\}(?:(?!\1)[^\\]|\\.)*?\1\s*\.\s*format\s*\(/i, 'bloquant', 'injection SQL : chaîne formatée par .format() dans execute()', 'py'],
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
        if (/concaténée\/formatée/.test(msg) && !SQL_FORMATEE_HORS_LITTERAL.test(sansLitteraux(ln))) continue; // TF-1705
        findings.push({ sev, msg, where: path.relative(process.cwd(), f) + ':' + (i + 1) });
      }
    }
  });
}
// outils faisant autorité si présents (complètent le repli)
// TF-1349 (24/09/2026) — L'ÉCHELLE DE RÉSOLUTION DE SEMGREP : le PATH, puis `uvx semgrep`. Mesuré chez
// un produit : semgrep, absent du PATH mais joignable par uvx, a trouvé un constat réel que cet oracle
// rendait PASS sur ses seules règles intégrées. Une voie qui échoue (téléchargement, sortie hors JSON)
// se DIT au non_juge, elle ne se tait plus.
const SEMGREP = have('semgrep') ? { cmd: 'semgrep', pre: [], voie: 'semgrep (PATH)' }
  : have('uvx') ? { cmd: 'uvx', pre: ['semgrep'], voie: 'uvx semgrep' } : null;
if (SEMGREP) {
  const g = spawnSync(SEMGREP.cmd, [...SEMGREP.pre, '--quiet', '--json', '--config', 'auto', target], { encoding: 'utf8', timeout: 300000 });
  let lu = null; try { lu = JSON.parse(g.stdout || ''); } catch { /* sortie illisible : dite plus bas */ }
  if (lu) (lu.results || []).filter(r => !horsBorne(r.path)).forEach(r => findings.push({ sev: 'bloquant', msg: 'semgrep ' + (r.check_id || '').split('.').pop(), where: (r.path || '') + ':' + (r.start && r.start.line) }));
  else NJ.push(SEMGREP.voie + ' injoignable (exit ' + g.status + (g.error ? ', ' + g.error.code : '') + ') — règles intégrées seules (couverture moindre)');
} else NJ.push('semgrep non installé et uvx absent — règles intégrées utilisées (couverture moindre)');
if (have('bandit') && codeFiles.some(f => f.endsWith('.py'))) {
  const b = spawnSync('bandit', ['-r', target, '-f', 'json'], { encoding: 'utf8', timeout: 120000 });
  try { (JSON.parse(b.stdout || '{}').results || []).filter(r => !horsBorne(r.filename)).forEach(r => { if (/HIGH|MEDIUM/i.test(r.issue_severity)) findings.push({ sev: r.issue_severity === 'HIGH' ? 'bloquant' : 'warn', msg: 'bandit ' + r.test_id + ' ' + r.issue_text.slice(0, 60), where: r.filename + ':' + r.line_number }); }); } catch {}
}

const blocking = findings.filter(f => f.sev === 'bloquant');
if (blocking.length) emit('FAIL', findings);
emit('PASS', findings.length ? findings : [{ sev: 'info', msg: 'aucun motif d\'injection / exécution dangereuse détecté (' + codeFiles.length + ' fichier[s])' }]);
