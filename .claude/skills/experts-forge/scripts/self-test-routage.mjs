#!/usr/bin/env node
// self-test-routage.mjs — rejoue les fixtures R1–R5 du routage (E3). Exit 0 = tout PASS, 1 = au moins un FAIL.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
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
  const matchees = r.fiches_matchees.map(f => f.domaine);
  // matchees_attendues / matchees_exclues : fiches qui DOIVENT / NE DOIVENT PAS matcher, statut quel qu'il soit (TF-2065 :
  // une fiche refusée ne route pas, mais elle doit rester trouvable ; un mot générique ne doit pas la matcher).
  const manquantes = (c.matchees_attendues ?? []).filter(d => !matchees.includes(d));
  const intruses = (c.matchees_exclues ?? []).filter(d => matchees.includes(d));
  const ok = eq(r.routees, c.routees_attendues) && !manquantes.length && !intruses.length;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.id} — routees=${JSON.stringify(r.routees)} attendu=${JSON.stringify(c.routees_attendues)}`
    + (c.matchees_attendues ? ` matchees=${JSON.stringify(matchees)} manquantes=${JSON.stringify(manquantes)}` : '')
    + (c.matchees_exclues ? ` intruses=${JSON.stringify(intruses)}` : ''));
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

// TF-2532 : un motif de 3 lettres ou moins, lu sans frontière de mot et en insensible à la casse, capte des mots
// sans rapport (« vacances » → ACA, « rapide » → API, « Seoul » → SEO, « carpaccio » → RPA). La règle est
// MÉCANIQUE, pas seulement écrite : toute alternative de `content_patterns` réduite à un mot de 3 caractères
// ou moins (pluriel `s?` toléré) est bornée par `\b` des deux côtés, sinon FAIL, fiche et motif nommés.
// Un `\b` devenu le caractère de contrôle 0x08 (cas réel de la fiche hebergement-touristique, motif OTA
// jamais déclenché) n'est pas une borne : la fiche qui en porte un est refusée aussi.
const BS = String.fromCharCode(8);
const BORNE = String.fromCharCode(92) + 'b';
const alternatives = (p) => {
  const alts = []; let prof = 0, cur = '';
  for (const c of p) {
    if (c === '(') prof++; else if (c === ')') prof--;
    if (c === '|' && prof === 0) { alts.push(cur); cur = ''; } else cur += c;
  }
  alts.push(cur);
  return alts;
};
let nBornes = 0;
for (const f of readdirSync(join(skill, 'fiches')).filter(f => f.startsWith('expert-') && f.endsWith('.md'))) {
  const t = readFileSync(join(skill, 'fiches', f), 'utf-8');
  const pm = t.match(/`content_patterns`\s*:\s*`([^`]+)`/);
  if (!pm) continue;
  if (pm[1].includes(BS)) { console.log(`FAIL TF-2532 ${f} — le motif porte un caractère de contrôle 0x08 (un « ${BORNE} » mal écrit), pas une frontière de mot`); fails++; continue; }
  for (const alt of alternatives(pm[1])) {
    const nu = alt.split(BORNE).join('').replace(/s\?$/, '');
    if (!/^[A-Za-z0-9]{1,3}$/.test(nu)) continue;
    nBornes++;
    if (!(alt.startsWith(BORNE) && alt.endsWith(BORNE))) { console.log(`FAIL TF-2532 ${f} — le motif « ${alt} » (${nu.length} lettre(s)) n'est pas borné par ${BORNE}`); fails++; }
  }
}
console.log(`${fails === 0 ? 'PASS' : 'FAIL'} TF-2532 — motifs de 3 lettres ou moins bornés par ${BORNE} : ${nBornes} examiné(s)`);

console.log(fails === 0 ? `SELF-TEST ROUTAGE : ${cas.length}/${cas.length} PASS` : `SELF-TEST ROUTAGE : ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
