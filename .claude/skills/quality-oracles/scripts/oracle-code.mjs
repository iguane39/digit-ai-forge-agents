#!/usr/bin/env node
// oracle-code — Domaine « Code source ».
// Vérifie qu'un fichier de code COMPILE (syntaxe) : .js/.mjs/.cjs via `node --check`,
// .py via `python -m py_compile`. .ts via `tsc --noEmit` si disponible, sinon SKIP.
// « Compile ≠ s'exécute » : cet oracle ne juge que la syntaxe ; l'exécution/les tests
// relèvent du harnais de test du projet (déclaré en non_juge).
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} ; exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = process.argv[2];
const DOM = 'Code source';
const NJ = ['exécution réelle & tests fonctionnels (harnais de test du projet)', 'lint/typage approfondi (si outil non présent)'];
function emit(verdict, findings = [], non_juge = NJ) {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-code', domaine: DOM, artefact: file || null, verdict, findings, non_juge }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
}
if (!file || !fs.existsSync(file)) emit('SKIP', [{ sev: 'info', msg: 'fichier absent' }]);
const ext = path.extname(file).toLowerCase();
const have = cmd => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0;

let res;
if (['.js', '.mjs', '.cjs'].includes(ext)) res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
else if (ext === '.py') { const py = have('python') ? 'python' : (have('python3') ? 'python3' : null); if (!py) emit('SKIP', [], ['python indisponible']); res = spawnSync(py, ['-m', 'py_compile', file], { encoding: 'utf8' }); }
else if (ext === '.ts' || ext === '.tsx') { if (!have('tsc')) emit('SKIP', [], ['tsc indisponible — typage non vérifié']); res = spawnSync('tsc', ['--noEmit', file], { encoding: 'utf8' }); }
else emit('SKIP', [], ['extension non prise en charge par cet oracle (' + (ext || 'sans extension') + ')']);

if (res.status === 0) emit('PASS', [{ sev: 'info', msg: 'compilation/syntaxe OK' }]);
emit('FAIL', [{ sev: 'bloquant', msg: 'ne compile pas', where: (res.stderr || res.stdout || '').trim().split('\n').slice(0, 3).join(' | ') }]);
