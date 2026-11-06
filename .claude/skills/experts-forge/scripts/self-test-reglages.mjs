#!/usr/bin/env node
// self-test-reglages.mjs — recette de oracle-reglages-corpus (TF-2227, 06/11/2026) : les corpus ops réels sont jugés contre
// une COPIE du registre (fixtures/reglages-registre.json, jamais le fichier du pilot), puis chaque règle est jouée en sens
// rouge sur une copie altérée, un défaut à la fois. Exit 0 = tout PASS, 1 = au moins un FAIL.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const skill = dirname(dirname(fileURLToPath(import.meta.url)));
const oracle = join(skill, 'scripts', 'oracle-reglages-corpus.mjs');
const registreCopie = join(skill, 'fixtures', 'reglages-registre.json');
const tmp = mkdtempSync(join(tmpdir(), 'ef-reglages-'));
let fails = 0, n = 0;

const jouer = (args) => {
  const r = spawnSync('node', [oracle, ...args], { encoding: 'utf-8' });
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* illisible */ }
  return { code: r.status, j, regles: j ? j.findings.filter((f) => f.sev === 'bloquant').map((f) => f.msg.slice(0, 2)) : [] };
};
const verifier = (nom, ok, detail) => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${nom}${ok ? '' : ' — ' + detail}`); };

// vert : les six corpus ops réels contre la copie du registre
const refs = join(skill, 'references');
const vert = jouer(['--registre', registreCopie, '--references', refs]);
verifier('R1 vert — les corpus ops réels classent les 6 réglages Supabase et Cloudflare du registre, les 4 autres plateformes disent « aucun réglage »',
  vert.code === 0 && vert.j.verdict === 'PASS' && vert.j.findings.some((f) => /6 réglage\(s\) classé/.test(f.msg)), JSON.stringify(vert.j && vert.j.findings.map((f) => f.msg.slice(0, 80))));
verifier('R2 vert — GitHub (3 réglages, aucun corpus) est DIT en avertissement G8, jamais passé sous silence',
  !!vert.j && vert.j.findings.some((f) => f.sev === 'avertissement' && f.msg.startsWith('G8') && f.msg.includes('GitHub')), 'pas de G8');

// copie des corpus pour les mutations
const copie = join(tmp, 'references');
cpSync(refs, copie, { recursive: true });
const muter = (fichier, f) => { const p = join(copie, fichier); const avant = readFileSync(p, 'utf-8'); const apres = f(avant); if (apres === avant) throw new Error(`mutation sans effet sur ${fichier}`); writeFileSync(p, apres); return () => writeFileSync(p, avant); };
const rouge = (nom, regle, fichier, f, registre = registreCopie) => {
  let restaurer; try { restaurer = muter(fichier, f); } catch (e) { verifier(nom, false, e.message); return; }
  const r = jouer(['--registre', registre, '--references', copie]);
  verifier(nom, r.code === 1 && r.regles.includes(regle), `exit ${r.code}, règles ${JSON.stringify(r.regles)}`);
  restaurer();
};
const sansPuce = (motif) => (s) => s.split('\n').filter((l, i, a) => !(l.includes(motif) || (a[i - 1] && a[i - 1].includes(motif) && /^\s{5}\S/.test(l) && !/^\s*-/.test(l)))).join('\n');

rouge('R3 rouge — la double vérification des membres d\'organisation retirée du corpus Supabase : G5', 'G5', 'corpus-ops-supabase.md', sansPuce('Double vérification imposée'));
rouge('R4 rouge — Always Use HTTPS retiré du corpus Cloudflare : G5', 'G5', 'corpus-ops-cloudflare.md', sansPuce('HTTPS imposé par redirection'));
rouge('R5 rouge — le TLS imposé classé décision au lieu de défaut : G6', 'G6', 'corpus-ops-supabase.md', (s) => s.replace('database=true) — **défaut**', 'database=true) — **décision**'));
rouge('R6 rouge — la puce sans classement : G6', 'G6', 'corpus-ops-cloudflare.md', (s) => s.replace('(Always Use HTTPS) — **défaut**', '(Always Use HTTPS) —'));
rouge('R7 rouge — le renvoi au registre retiré : G2', 'G2', 'corpus-ops-cloudflare.md', (s) => s.replace(/REGLAGES-SURS-PAR-DEFAUT\.json/g, 'REGLAGES.json'));
rouge('R8 rouge — le registre non daté : G3', 'G3', 'corpus-ops-supabase.md', (s) => s.replace('registre du pilot lu le 06/11/2026', 'registre du pilot lu'));
rouge('R9 rouge — le point retiré du corpus AWS : G1', 'G1', 'corpus-ops-aws.md', (s) => s.replace('**Réglages de sécurité de la plateforme**', '**Autre point**'));
rouge('R10 rouge — une puce classant un réglage absent du registre : G7', 'G7', 'corpus-ops-azure.md', (s) => s.trimEnd() + '\n   - Réglage inventé de la plateforme — **défaut** : sans entrée au registre.\n');

rouge('R10 bis rouge — la plateforme sans réglage ne le dit plus (« aucun réglage » retiré du corpus GCP) : G4', 'G4', 'corpus-ops-gcp.md', (s) => s.replace('aucun réglage', 'des réglages'));

// le registre bouge : une entrée AWS apparaît (le corpus AWS dit « aucun réglage » : G4), une entrée Cloudflare disparaît (G7)
const reg = JSON.parse(readFileSync(registreCopie, 'utf-8'));
const regAws = join(tmp, 'registre-aws.json');
writeFileSync(regAws, JSON.stringify([...reg, { ...reg[0], plateforme: 'AWS', reglage: 'Chiffrement du registre d\'images (ECR)', classement: 'defaut' }]));
let r = jouer(['--registre', regAws, '--references', refs]);
verifier('R11 rouge — un réglage AWS ajouté au registre rend le corpus AWS (« aucun réglage ») périmé : G5, le réglage n\'y est pas classé', r.code === 1 && r.regles.includes('G5'), `exit ${r.code}, ${JSON.stringify(r.regles)}`);
const regSans = join(tmp, 'registre-sans-hsts.json');
writeFileSync(regSans, JSON.stringify(reg.filter((e) => !e.reglage.startsWith('En-tête HSTS'))));
r = jouer(['--registre', regSans, '--references', refs]);
verifier('R12 rouge — un réglage retiré du registre laisse sa puce périmée au corpus Cloudflare : G7', r.code === 1 && r.regles.includes('G7'), `exit ${r.code}, ${JSON.stringify(r.regles)}`);

// sans registre : SKIP motivé, jamais un PASS
r = spawnSync('node', [oracle, '--registre', join(tmp, 'absent.json'), '--references', refs], { encoding: 'utf-8' });
verifier('R13 — registre introuvable : SKIP (exit 2), jamais PASS', r.status === 2 && JSON.parse(r.stdout).verdict === 'SKIP', `exit ${r.status}`);

rmSync(tmp, { recursive: true, force: true });
console.log(fails === 0 ? `SELF-TEST RÉGLAGES : ${n}/${n} PASS` : `SELF-TEST RÉGLAGES : ${fails} FAIL sur ${n}`);
process.exit(fails === 0 ? 0 : 1);
