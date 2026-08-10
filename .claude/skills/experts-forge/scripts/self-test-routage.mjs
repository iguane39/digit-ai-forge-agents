#!/usr/bin/env node
// self-test-routage.mjs — rejoue les fixtures R1–R5 du routage (E3). Exit 0 = tout PASS, 1 = au moins un FAIL.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const skill = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(skill, 'scripts', 'route-experts.mjs');
const run = (texte, dir = skill) =>
  JSON.parse(execFileSync('node', [script, '--dir', dir, texte], { encoding: 'utf-8' }));

const cas = JSON.parse(readFileSync(join(skill, 'fixtures', 'routage', 'cas-routage.json'), 'utf-8'));
let fails = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const c of cas.filter(c => !c.registre_modifie)) {
  const r = run(c.demande);
  const ok = eq(r.routees, c.routees_attendues);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.id} — routees=${JSON.stringify(r.routees)} attendu=${JSON.stringify(c.routees_attendues)}`);
  if (!ok) fails++;
}

// R5 : copie de test du skill avec une fiche passée en "refuse" — matche mais ne route pas.
const r5 = cas.find(c => c.registre_modifie);
const tmp = mkdtempSync(join(tmpdir(), 'ef-r5-'));
cpSync(skill, tmp, { recursive: true });
const regPath = join(tmp, 'references', 'registre-experts.md');
writeFileSync(regPath, readFileSync(regPath, 'utf-8').replace(
  /^\|\s*interop-archi\s*\|\s*ok\s*\|/m, '| interop-archi | refuse |'));
const r = run(r5.demande, tmp);
const matche = r.fiches_matchees.some(f => f.domaine === 'interop-archi' && f.statut === 'refuse');
const ok5 = matche && eq(r.routees, r5.routees_attendues);
console.log(`${ok5 ? 'PASS' : 'FAIL'} ${r5.id} — matche(refuse)=${matche} routees=${JSON.stringify(r.routees)} attendu=${JSON.stringify(r5.routees_attendues)}`);
if (!ok5) fails++;

console.log(fails === 0 ? `SELF-TEST ROUTAGE : ${cas.length}/${cas.length} PASS` : `SELF-TEST ROUTAGE : ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
