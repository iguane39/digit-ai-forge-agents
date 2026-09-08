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
// CINQ CAS, et les cinq comptent :
//   1. dépôt PORTEUR      → push REFUSÉ, exit non nul, constats imprimés ;
//   2. dépôt PROPRE       → push ACCEPTÉ ;
//   3. dépôt PORTEUR avec --no-verify → push ACCEPTÉ (le contournement explicite fonctionne :
//      un garde-fou qu'on ne peut pas lever en connaissance de cause se fait arracher) ;
//   4. référentiel ABSENT → push REFUSÉ, ET LE MOTIF DU SKIP EST RÉPÉTÉ EN CLAIR (un oracle qui
//      ne peut pas mesurer ne laisse pas passer — mais un refus muet se contourne à l'aveugle) ;
//   5. TABLES DANS LE CANAL, AUCUNE VARIABLE D'ENVIRONNEMENT (TF-0887) → le dépôt propre passe et
//      le dépôt porteur est refusé, la porte ayant trouvé les deux tables toute seule.
//
// DEUX RÈGLES D'HYGIÈNE DU BANC, ET ELLES SONT NÉES D'UN DÉFAUT MESURÉ LE 08/09 (TF-0887) :
//
//   · LE BANC ÉPROUVE LA SOURCE, PAS LA COPIE INSTALLÉE. Le `pre-push` cherche l'oracle d'abord
//     dans `$HOME/.claude/skills/…`, parce que c'est cette copie-là qui s'exécute en vrai. Un
//     banc qui hérite du vrai `$HOME` juge donc la copie MONTÉE — c'est-à-dire, juste après une
//     modification, la version d'AVANT : mesuré le 08/09, les quatre cas rendaient vert sur un
//     oracle vieux d'un jour. Le banc pointe donc `HOME` sur sa racine jetable et y dépose une
//     COPIE DE LA SOURCE à l'emplacement de repli du hameçon. L'ordre de recherche du hameçon
//     n'est pas touché : c'est le banc qui se met en position de juger ce qu'il modifie.
//
//   · LE BANC NE DOIT PAS POUVOIR ATTEINDRE LES TABLES DU POSTE. Depuis TF-0887 la porte cherche
//     `<racine>/_confidentiel/tables/` par défaut, et devine la racine par le parent du dépôt
//     jugé PUIS le parent de la forge. Sur un poste du parc, cette seconde racine porte les
//     tables RÉELLES : les cas 1 à 4, dont les référentiels sont des jeux d'essai, jugeraient le
//     parc au lieu de la règle et leur verdict dépendrait de la machine. Chaque cas DÉCLARE donc
//     sa racine jetable par FORGE_ROOT — sauf le cas 5, qui doit justement prouver que la porte
//     se débrouille SANS aucune variable, et qui referme l'échelle autrement : sa racine jetable
//     est le parent du dépôt jugé ET le parent de la forge copiée.
//
// Exit 0 = tous les cas conformes · 1 = au moins un cas non conforme.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const INSTALLEUR = path.join(ICI, 'installer-hamecon-publication.mjs');
const ORACLE_SOURCE = path.join(ICI, 'oracle-nom-client-publie.mjs');
const oks = [], kos = [];

// L'environnement d'un push du banc : jamais les variables du poste, qui feraient lire les tables
// réelles et rendraient le verdict dépendant de la machine.
function envBanc(extra) {
  const e = { ...process.env };
  // Les TROIS variables du poste sautent TOUJOURS ; un cas qui a besoin d'une racine la redéclare.
  for (const k of ['FORGE_NOMS_INTERDITS', 'FORGE_PRODUITS_PSEUDO', 'FORGE_ROOT']) delete e[k];
  for (const [k, v] of Object.entries(extra || {})) { if (v === undefined) delete e[k]; else e[k] = v; }
  return e;
}

const sh = (cwd, cmd, a, env) => spawnSync(cmd, a, { cwd, encoding: 'utf8', env: envBanc(env) });
const git = (cwd, ...a) => sh(cwd, 'git', a);

/** Dépose une COPIE DE LA SOURCE de l'oracle à l'emplacement de repli du hameçon, sous une racine
 *  jetable : `<racine>/digit-ai-forge-agents/.claude/skills/quality-oracles/scripts/`. C'est ce
 *  qui fait juger au banc le code qu'on vient d'écrire, et non celui qui est monté sur le poste.
 *  L'oracle n'importe que des modules du cœur de Node : un seul fichier suffit. */
function poserOracleSource(racine) {
  const d = path.join(racine, 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles', 'scripts');
  fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(ORACLE_SOURCE, path.join(d, 'oracle-nom-client-publie.mjs'));
  return d;
}

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
// La source de l'oracle, déposée au repli du hameçon ; `HOME` détourné sur la racine jetable pour
// que la copie MONTÉE sur le poste ne soit pas celle qui juge (cf. en-tête).
poserOracleSource(racine);
const ENV_JEU_ESSAI = { HOME: racine, USERPROFILE: racine, FORGE_ROOT: racine };

try {
  // --- cas 1 : dépôt PORTEUR → push refusé -----------------------------------
  const d1 = depot(racine, 'porteur', true);
  const r1 = distantJetable(racine, 'porteur-distant');
  git(d1, 'remote', 'add', 'origin', r1);
  const pose = sh(racine, 'node', [INSTALLEUR, d1]);
  (pose.stdout || '').includes('POSE') ? oks.push('hameçon posé sur le dépôt porteur')
    : kos.push('hameçon NON posé : ' + (pose.stdout || pose.stderr || '').trim().slice(0, 200));
  const p1 = sh(d1, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
  if (p1.status !== 0 && /PUBLICATION REFUSEE/.test(p1.stderr || '')) oks.push('cas 1 — dépôt PORTEUR : push REFUSÉ (exit ' + p1.status + ')');
  else kos.push('cas 1 — dépôt PORTEUR : push NON refusé (exit ' + p1.status + ') — LE GARDE-FOU NE S\'EXÉCUTE PAS');
  if (/C1/.test(p1.stderr || '')) oks.push('cas 1 — les constats sont imprimés, localisants');
  else kos.push('cas 1 — refus SANS constat : l\'auteur ne sait pas quoi corriger');

  // --- cas 2 : dépôt PROPRE → push accepté -----------------------------------
  const d2 = depot(racine, 'propre', false);
  const r2 = distantJetable(racine, 'propre-distant');
  git(d2, 'remote', 'add', 'origin', r2);
  sh(racine, 'node', [INSTALLEUR, d2]);
  const p2 = sh(d2, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
  if (p2.status === 0) oks.push('cas 2 — dépôt PROPRE : push ACCEPTÉ');
  else kos.push('cas 2 — dépôt PROPRE : push REFUSÉ À TORT — le garde-fou crie sur du travail juste : ' + (p2.stderr || '').trim().slice(0, 300));

  // --- cas 3 : contournement EXPLICITE ---------------------------------------
  const p3 = sh(d1, 'git', ['push', '--no-verify', 'origin', 'main'], ENV_JEU_ESSAI);
  if (p3.status === 0) oks.push('cas 3 — contournement --no-verify : push ACCEPTÉ, le garde-fou reste levable en connaissance de cause');
  else kos.push('cas 3 — --no-verify ne passe PAS : un garde-fou inlevable se fait arracher au lieu d\'être discuté');

  // --- cas 4 : référentiel ABSENT → push refusé, MOTIF RÉPÉTÉ EN CLAIR -------
  // Le dépôt vit sous une racine SANS aucune table, mais où l'oracle EST trouvable : sans cela le
  // hameçon refuserait pour « oracle introuvable » et le cas croirait prouver le SKIP alors qu'il
  // ne prouve que l'absence du fichier. Défaut mesuré le 08/09 — l'assertion tolérait « REFUSEE »
  // seul, et la branche SKIP n'était éprouvée par personne.
  const isole = fs.mkdtempSync(path.join(os.tmpdir(), 'sans-ref-'));
  poserOracleSource(isole);
  const d4 = depot(isole, 'sans-referentiel', false);
  const r4 = distantJetable(isole, 'sans-referentiel-distant');
  git(d4, 'remote', 'add', 'origin', r4);
  sh(isole, 'node', [INSTALLEUR, d4]);
  const p4 = sh(d4, 'git', ['push', 'origin', 'main'], { FORGE_ROOT: isole, HOME: isole, USERPROFILE: isole });
  const e4 = p4.stderr || '';
  if (p4.status !== 0 && /verdict SKIP/.test(e4)) oks.push('cas 4 — référentiel ABSENT : push REFUSÉ sur un verdict SKIP (un oracle qui ne mesure pas ne laisse pas passer)');
  else kos.push('cas 4 — le refus n\'est pas un refus sur SKIP (exit ' + p4.status + ') : ' + e4.trim().slice(0, 300));
  if (/porte SKIP : /.test(e4) && /RÉFÉRENTIEL DES NOMS INTERDITS ABSENT/.test(e4))
    oks.push('cas 4 — le motif du SKIP est RÉPÉTÉ EN CLAIR avant le refus (« porte SKIP : … »), pistes explorées comprises');
  else kos.push('cas 4 — refus SANS motif lisible : un garde-fou qui ne dit pas pourquoi il refuse se lève à l\'aveugle avec --no-verify. Rendu : ' + e4.trim().slice(0, 300));

  // --- cas 5 : LES TABLES DANS LE CANAL, AUCUNE VARIABLE (TF-0887) -----------
  // LE FAIT PAYÉ : le 07/09 les deux tables ont déménagé dans le canal confidentiel, la porte
  // appelée sans argument s'est mise à rendre SKIP, et CE hameçon traite un SKIP en refus — tout
  // dépôt porteur du hameçon refusait chaque push. Le cas reproduit la situation exacte : une
  // racine jetable qui porte `_confidentiel/tables/`, les dépôts DEDANS, et pas une seule variable
  // d'environnement. La racine du parc est donc DEVINÉE par le parent du dépôt jugé — la marche
  // qui manquait — et le même parent porte la forge copiée, ce qui referme l'échelle sur le banc.
  const canal = fs.mkdtempSync(path.join(os.tmpdir(), 'hamecon-canal-'));
  poserOracleSource(canal);
  const tables = path.join(canal, '_confidentiel', 'tables');
  fs.mkdirSync(tables, { recursive: true });
  fs.writeFileSync(path.join(tables, 'noms-interdits.json'), JSON.stringify({
    commentaire: 'canal jetable du self-test du hameçon — noms inventés',
    noms: ['Zorglub'], identifiants: ['wks-99999999999999'], sigles: ['ZRG'],
  }, null, 1));
  fs.writeFileSync(path.join(tables, 'produits-pseudonymes.json'), JSON.stringify({
    commentaire: 'canal jetable du self-test du hameçon — noms de produits inventés',
    produits: { 'PortailBidule-Machin': 'Produit-99' },
  }, null, 1));
  const ENV_SANS_VARIABLE = { HOME: canal, USERPROFILE: canal, FORGE_ROOT: undefined };

  const d5 = depot(canal, 'canal-porteur', true);
  const r5 = distantJetable(canal, 'canal-porteur-distant');
  git(d5, 'remote', 'add', 'origin', r5);
  sh(canal, 'node', [INSTALLEUR, d5]);
  const p5 = sh(d5, 'git', ['push', 'origin', 'main'], ENV_SANS_VARIABLE);
  const e5 = p5.stderr || '';
  if (p5.status === 0) kos.push('cas 5 — tables dans le CANAL, dépôt PORTEUR : push ACCEPTÉ — la porte n\'a pas trouvé les tables toute seule');
  else if (/verdict SKIP/.test(e5)) kos.push('cas 5 — tables dans le CANAL et la porte rend SKIP : c\'est LA panne du 07/09, tout dépôt porteur du hameçon refuse chaque push. ' + e5.trim().slice(0, 300));
  else if (!/C1/.test(e5)) kos.push('cas 5 — refus sans constat C1 : ' + e5.trim().slice(0, 300));
  else oks.push('cas 5 — tables dans <racine>/_confidentiel/tables/ et AUCUNE variable : dépôt PORTEUR refusé sur un verdict FAIL, constats imprimés');

  const d6 = depot(canal, 'canal-propre', false);
  const r6 = distantJetable(canal, 'canal-propre-distant');
  git(d6, 'remote', 'add', 'origin', r6);
  sh(canal, 'node', [INSTALLEUR, d6]);
  const p6 = sh(d6, 'git', ['push', 'origin', 'main'], ENV_SANS_VARIABLE);
  if (p6.status === 0) oks.push('cas 5 — tables dans le CANAL et AUCUNE variable : dépôt PROPRE ACCEPTÉ — la porte mesure, elle ne bloque pas par défaut');
  else kos.push('cas 5 — dépôt PROPRE REFUSÉ alors que les tables sont dans le canal : ' + (p6.stderr || '').trim().slice(0, 300));

  // --- retrait propre ---------------------------------------------------------
  const ret = sh(racine, 'node', [INSTALLEUR, d1, d2, d4, d5, d6, '--retirer']);
  (ret.stdout || '').includes('RETIRE') ? oks.push('retrait : le hameçon se dépose ET se retire')
    : kos.push('retrait impossible : ' + (ret.stdout || '').trim().slice(0, 200));
  for (const z of [isole, canal]) try { fs.rmSync(z, { recursive: true, force: true }); } catch { /* zone temporaire */ }
} finally {
  try { fs.rmSync(racine, { recursive: true, force: true }); } catch { /* zone temporaire */ }
}

for (const m of oks) console.log('  [PASS] ' + m);
for (const m of kos) console.log('  [FAIL] ' + m);
console.log(`\nSelf-test hameçon de publication : ${oks.length} PASS, ${kos.length} FAIL`);
process.exit(kos.length ? 1 : 0);
