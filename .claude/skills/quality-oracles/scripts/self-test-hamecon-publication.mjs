#!/usr/bin/env node
// self-test-hamecon-publication — prouve, sur de VRAIS dépôts et un VRAI `git push`, que le
// hameçon de publication refuse ce qu'il doit refuser et laisse passer ce qu'il doit laisser
// passer.
//
// POURQUOI CE TEST EXISTE EN PLUS DES FIXTURES DE L'ORACLE. Les fixtures prouvent que l'ORACLE
// juge. Elles ne prouvent RIEN du câblage : un hameçon peut être posé, exact, et ne jamais
// s'exécuter — mauvais nom de fichier, droit d'exécution absent, chemin d'oracle faux, verdict
// mal lu. Un garde-fou qu'on n'a pas vu refuser un push n'est pas un garde-fou, c'est une
// intention. Ce test fait donc le geste réel, contre un dépôt distant réel (local et jetable).
//
// QUATRE CAS, et les quatre comptent :
//   1. dépôt PORTEUR      → push REFUSÉ, exit non nul, constats imprimés ;
//   2. dépôt PROPRE       → push ACCEPTÉ ;
//   3. dépôt PORTEUR avec --no-verify → push ACCEPTÉ (le contournement explicite fonctionne :
//      un garde-fou qu'on ne peut pas lever en connaissance de cause se fait arracher) ;
//   4. référentiel ABSENT → push REFUSÉ (un oracle qui ne peut pas mesurer ne laisse pas passer).
//
// Exit 0 = les quatre cas conformes · 1 = au moins un cas non conforme.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const INSTALLEUR = path.join(ICI, 'installer-hamecon-publication.mjs');
const oks = [], kos = [];

const sh = (cwd, cmd, a, env) => spawnSync(cmd, a, { cwd, encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
const git = (cwd, ...a) => sh(cwd, 'git', a);

function depot(racine, nom, porteur) {
  const d = path.join(racine, nom);
  fs.mkdirSync(d, { recursive: true });
  git(d, 'init', '-q', '-b', 'main', '.');
  git(d, 'config', 'user.email', 'o@o');
  git(d, 'config', 'user.name', 'o');
  fs.writeFileSync(path.join(d, 'index.md'), porteur
    ? 'Rapport remis a Zorglub, espace de travail wks-99999999999999.\n'
    : 'Rapport remis a Client-A, espace de travail wks-00000000000000.\n');
  git(d, 'add', '-A');
  git(d, 'commit', '-q', '-m', porteur ? 'Ajout du rapport Zorglub' : 'Ajout du rapport pseudonymise');
  return d;
}

function distantJetable(racine, nom) {
  const b = path.join(racine, nom + '.git');
  spawnSync('git', ['init', '-q', '--bare', b], { encoding: 'utf8' });
  return b;
}

const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'self-test-hamecon-'));
// Référentiel de jeu d'essai posé À CÔTÉ des dépôts : c'est la marche « frère de l'artefact »
// de la résolution de l'oracle. Noms INVENTÉS, comme partout dans les fixtures.
fs.writeFileSync(path.join(racine, '_noms-interdits.json'), JSON.stringify({
  commentaire: 'jeu d\'essai du self-test du hameçon — noms inventés',
  noms: ['Zorglub'], identifiants: ['wks-99999999999999'], sigles: ['ZRG'],
}, null, 1));

try {
  // --- cas 1 : dépôt PORTEUR → push refusé -----------------------------------
  const d1 = depot(racine, 'porteur', true);
  const r1 = distantJetable(racine, 'porteur-distant');
  git(d1, 'remote', 'add', 'origin', r1);
  const pose = sh(racine, 'node', [INSTALLEUR, d1]);
  (pose.stdout || '').includes('POSE') ? oks.push('hameçon posé sur le dépôt porteur')
    : kos.push('hameçon NON posé : ' + (pose.stdout || pose.stderr || '').trim().slice(0, 200));
  const p1 = git(d1, 'push', 'origin', 'main');
  if (p1.status !== 0 && /PUBLICATION REFUSEE/.test(p1.stderr || '')) oks.push('cas 1 — dépôt PORTEUR : push REFUSÉ (exit ' + p1.status + ')');
  else kos.push('cas 1 — dépôt PORTEUR : push NON refusé (exit ' + p1.status + ') — LE GARDE-FOU NE S\'EXÉCUTE PAS');
  if (/C1/.test(p1.stderr || '')) oks.push('cas 1 — les constats sont imprimés, localisants');
  else kos.push('cas 1 — refus SANS constat : l\'auteur ne sait pas quoi corriger');

  // --- cas 2 : dépôt PROPRE → push accepté -----------------------------------
  const d2 = depot(racine, 'propre', false);
  const r2 = distantJetable(racine, 'propre-distant');
  git(d2, 'remote', 'add', 'origin', r2);
  sh(racine, 'node', [INSTALLEUR, d2]);
  const p2 = git(d2, 'push', 'origin', 'main');
  if (p2.status === 0) oks.push('cas 2 — dépôt PROPRE : push ACCEPTÉ');
  else kos.push('cas 2 — dépôt PROPRE : push REFUSÉ À TORT — le garde-fou crie sur du travail juste : ' + (p2.stderr || '').trim().slice(0, 300));

  // --- cas 3 : contournement EXPLICITE ---------------------------------------
  const p3 = git(d1, 'push', '--no-verify', 'origin', 'main');
  if (p3.status === 0) oks.push('cas 3 — contournement --no-verify : push ACCEPTÉ, le garde-fou reste levable en connaissance de cause');
  else kos.push('cas 3 — --no-verify ne passe PAS : un garde-fou inlevable se fait arracher au lieu d\'être discuté');

  // --- cas 4 : référentiel ABSENT → push refusé ------------------------------
  const d4 = depot(racine, 'sans-referentiel', false);
  const r4 = distantJetable(racine, 'sans-referentiel-distant');
  git(d4, 'remote', 'add', 'origin', r4);
  sh(racine, 'node', [INSTALLEUR, d4]);
  const isole = fs.mkdtempSync(path.join(os.tmpdir(), 'sans-ref-'));
  const p4 = sh(d4, 'git', ['push', 'origin', 'main'], { FORGE_ROOT: isole, FORGE_NOMS_INTERDITS: path.join(isole, 'absent.json'), HOME: isole, USERPROFILE: isole });
  if (p4.status !== 0 && /SKIP|REFUSEE/.test(p4.stderr || '')) oks.push('cas 4 — référentiel ABSENT : push REFUSÉ (un oracle qui ne mesure pas ne laisse pas passer)');
  else kos.push('cas 4 — référentiel absent et push ACCEPTÉ : le SKIP se lit comme un vert, exactement le défaut que la règle interdit');

  // --- retrait propre ---------------------------------------------------------
  const ret = sh(racine, 'node', [INSTALLEUR, d1, d2, d4, '--retirer']);
  (ret.stdout || '').includes('RETIRE') ? oks.push('retrait : le hameçon se dépose ET se retire')
    : kos.push('retrait impossible : ' + (ret.stdout || '').trim().slice(0, 200));
} finally {
  try { fs.rmSync(racine, { recursive: true, force: true }); } catch { /* zone temporaire */ }
}

for (const m of oks) console.log('  [PASS] ' + m);
for (const m of kos) console.log('  [FAIL] ' + m);
console.log(`\nSelf-test hameçon de publication : ${oks.length} PASS, ${kos.length} FAIL`);
process.exit(kos.length ? 1 : 0);
