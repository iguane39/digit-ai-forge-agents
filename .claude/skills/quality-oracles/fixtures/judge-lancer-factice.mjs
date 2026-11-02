#!/usr/bin/env node
// judge-lancer-factice <reponse.json> — joue oracle-judge sur judge-green.md avec la CLI factice, qui répond
// le fichier donné (TF-2033, 02/11/2026). Le manifest l'appelle avec la rouge (verdict FAIL) et la verte (PASS) :
// la paire est déterministe, le juge LLM réel n'y entre pas.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(ici, '..');
const reponse = process.argv[2];
if (!reponse) { process.stderr.write('usage : judge-lancer-factice.mjs <reponse.json>\n'); process.exit(2); }
const r = spawnSync(process.execPath, [
  path.join(skill, 'scripts', 'oracle-judge.mjs'), path.join(ici, 'judge-green.md'),
  '--profil', path.join(skill, 'profils', 'digit-ai.json'),
], { encoding: 'utf8', timeout: 60000,
  env: { ...process.env, QO_JUGE_CLI: path.join(ici, 'judge-cli-factice.mjs'), QO_JUGE_REPONSE: path.resolve(reponse) } });
process.stdout.write(r.stdout || '');
process.exit(r.status === null ? 2 : r.status);
