#!/usr/bin/env node
// oracle-judge — Domaine « Jugement rédactionnel (LLM-juge externe) ». AVIS OUTILLÉ, pas verdict
// déterministe : statut registre « partiel » à demeure. Extériorité R1 : seconde instance LLM
// (CLI `claude -p`) avec rubrique FIGÉE versionnée (profil juge.rubrique) — jamais l'auteur qui
// se note. CLI absent → SKIP motivé, jamais un PASS par défaut. Invocation explicite uniquement
// (pas d'auto-déclenchement au registre). Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && !['--profil', '--model'].includes(args[i - 1]));
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
// --model / QO_JUGE_MODELE (02/09/2026) : le modèle par défaut hérité de l'environnement peut
// être refusé par une CLI `claude` plus ancienne que lui (« does not support this model »), et le
// juge rendait alors un SKIP permanent — un oracle qui ne mesure JAMAIS n'est pas un repli, c'est
// une porte morte. Le drapeau est OPTIONNEL : sans lui, le comportement est strictement inchangé.
const MODELE = args.includes('--model') ? args[args.indexOf('--model') + 1] : (process.env.QO_JUGE_MODELE || null);
const DOM = 'Jugement rédactionnel (LLM-juge externe)';
const NJ = ['véracité factuelle (oracles déterministes)', 'AVIS OUTILLÉ non déterministe : deux runs peuvent diverger — ne jamais promouvoir en verdict', 'qualité visuelle (render/pptx)'];
const out = (verdict, findings, nj, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-judge', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj })); process.exit(code); };
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);

const SKILLDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let rub = path.join(SKILLDIR, 'references', 'rubrique-juge.md');
if (pArg) { try { const r = JSON.parse(fs.readFileSync(pArg, 'utf8')).juge?.rubrique; if (r) rub = path.isAbsolute(r) ? r : path.join(SKILLDIR, r); } catch {} }
if (!fs.existsSync(rub)) out('SKIP', [], [...NJ, 'rubrique introuvable : ' + rub], 2);
const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
if (which.status !== 0) out('SKIP', [], [...NJ, 'CLI claude absent — juge externe non exécutable (jamais simulé)'], 2);

// Compat win32 (correctif 24/07/2026, aucun changement de logique de jugement) : le shim npm
// `claude` est un .cmd, non exécutable par spawnSync sans shell (ENOENT) — résoudre le cli.js
// réel et le lancer via node ; à défaut, comportement POSIX inchangé.
let jugeCmd = 'claude', jugePre = [];
if (process.platform === 'win32') {
  const shim = (which.stdout || '').split(/\r?\n/).find(Boolean);
  // la sortie de `where` peut être mal décodée (codepage console ≠ utf8) : préférer %APPDATA%
  const candidats = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    shim && path.join(path.dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  ].filter(Boolean);
  const cli = candidats.find(c => fs.existsSync(c));
  if (cli) { jugeCmd = process.execPath; jugePre = [cli]; }
  else {
    // Claude Code ≥ 2.x : le paquet npm livre un exécutable natif bin/claude.exe (plus de cli.js).
    const exes = [
      process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
      shim && path.join(path.dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    ].filter(Boolean);
    const exe = exes.find(c => fs.existsSync(c));
    if (exe) { jugeCmd = exe; jugePre = []; }
  }
}
const prompt = fs.readFileSync(rub, 'utf8') + '\n\n--- LIVRABLE À ÉVALUER ---\n' + fs.readFileSync(file, 'utf8').slice(0, 60000);
const r = spawnSync(jugeCmd, [...jugePre, '-p', prompt, '--output-format', 'text', ...(MODELE ? ['--model', MODELE] : [])], { encoding: 'utf8', timeout: 180000 });
if (r.error || r.status !== 0) out('SKIP', [], [...NJ, 'appel du juge en échec (' + (r.error?.code || r.status) + ')' + (MODELE ? ' — modèle demandé : ' + MODELE : ' — aucun modèle explicite : réessayer avec --model <alias>')], 2);
let j = null; try { j = JSON.parse((r.stdout.match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch {}
if (!j || !['PASS', 'FAIL'].includes(j.verdict)) out('SKIP', [], [...NJ, 'sortie du juge hors contrat — non retenue (P5/R1)'], 2);
const findings = (Array.isArray(j.findings) ? j.findings.slice(0, 5) : []).map(f => ({ sev: f.sev === 'bloquant' ? 'bloquant' : 'warn', msg: String(f.msg || '').slice(0, 200), where: String(f.where || path.basename(file)) }));
findings.unshift({ sev: 'info', msg: 'scores juge : ' + JSON.stringify(j.scores || {}), where: path.basename(file) });
out(j.verdict, findings, NJ, j.verdict === 'FAIL' ? 1 : 0);
