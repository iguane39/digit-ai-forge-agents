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
// SEPT CAS, et les sept comptent :
//   1. dépôt PORTEUR      → push REFUSÉ, exit non nul, constats imprimés ;
//   2. dépôt PROPRE       → push ACCEPTÉ ;
//   3. dépôt PORTEUR avec --no-verify → push ACCEPTÉ (le contournement explicite fonctionne :
//      un garde-fou qu'on ne peut pas lever en connaissance de cause se fait arracher) ;
//   4. référentiel ABSENT → push REFUSÉ, ET LE MOTIF DU SKIP EST RÉPÉTÉ EN CLAIR (un oracle qui
//      ne peut pas mesurer ne laisse pas passer — mais un refus muet se contourne à l'aveugle) ;
//   5. TABLES DANS LE CANAL, AUCUNE VARIABLE D'ENVIRONNEMENT (TF-0887) → le dépôt propre passe et
//      le dépôt porteur est refusé, la porte ayant trouvé les deux tables toute seule ;
//   6. LE HAMEÇON DE COMMIT (TF-0980) → il CORRIGE l'index au lieu de refuser, il travaille sur
//      LE DÉPÔT QUI COMMITE et sur lui seul, il journalise, et il ne refuse que sur un NOM de
//      fichier porteur, une chaîne en échec ou un lanceur introuvable. Un hameçon qui corrige ne
//      se prouve pas en constatant que le commit passe : il faut LIRE CE QUI A ÉTÉ COMMITÉ ;
//   7. LE RACCORD avec la chaîne d'anonymisation RÉELLE du pilot — un contrat d'appel entre DEUX
//      dépôts dérive sans que personne ne le voie. Absent de la machine, le cas le DIT.
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
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const INSTALLEUR = path.join(ICI, 'installer-hamecon-publication.mjs');
const ORACLE_SOURCE = path.join(ICI, 'oracle-nom-client-publie.mjs');
// TF-1221 — la porte des secrets (règle SP2 sur les fichiers que l'envoi ajoute).
const PORTE_SECRETS_SOURCE = path.join(ICI, 'porte-secrets-publies.mjs');
// TF-2168 (D-175) — la porte d'identité de publication, jouée avant celle des secrets.
const PORTE_IDENTITE_SOURCE = path.join(ICI, 'porte-identite-publication.mjs');
// TF-0980 — le lanceur du hameçon de COMMIT, et la racine du parc telle que ce dépôt la voit.
// `<forge>/.claude/skills/quality-oracles/scripts` → `<forge>` → la racine du parc.
const LANCEUR_SOURCE = path.join(ICI, 'pre-commit-anonymiser.mjs');
// TF-1337 — le contrôle rapide du frontmatter des skills de l'index.
const CONTROLE_SOURCE = path.join(ICI, 'frontmatter-skills-index.mjs');
const RACINE_PARC = process.env.FORGE_ROOT || path.resolve(ICI, '..', '..', '..', '..', '..');
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
 *  Depuis TF-1447 (28/09/2026) l'oracle importe aussi `lib/contrat.mjs` : sans lui, la copie ne
 *  se chargeait plus, le hameçon lisait un verdict ILLISIBLE, et 10 cas du banc étaient rouges
 *  (mesuré le 12/10/2026 sur la source d'avant cette ligne). Le lecteur de contrat ne dépend que
 *  du cœur de Node : ces deux fichiers suffisent. */
function poserOracleSource(racine) {
  const d = path.join(racine, 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles', 'scripts');
  fs.mkdirSync(path.join(d, 'lib'), { recursive: true });
  fs.copyFileSync(ORACLE_SOURCE, path.join(d, 'oracle-nom-client-publie.mjs'));
  fs.copyFileSync(path.join(ICI, 'lib', 'contrat.mjs'), path.join(d, 'lib', 'contrat.mjs'));
  // TF-1221 — le pre-push joue aussi la porte des secrets, cherchée au même repli.
  fs.copyFileSync(PORTE_SECRETS_SOURCE, path.join(d, 'porte-secrets-publies.mjs'));
  // TF-2168 — la porte d'identité (un seul fichier, aucune dépendance) : absente de la source, le banc
  // le DIT en échec (cas 18) au lieu de poser un hameçon qui chercherait une porte introuvable.
  if (fs.existsSync(PORTE_IDENTITE_SOURCE)) fs.copyFileSync(PORTE_IDENTITE_SOURCE, path.join(d, 'porte-identite-publication.mjs'));
  return d;
}

/** Le pendant de `poserOracleSource` pour le hameçon de COMMIT (TF-0980) : une copie de la SOURCE
 *  du lanceur à l'emplacement de repli du hook, sous une racine jetable. Même raison, mot pour
 *  mot : sans elle le banc jugerait la copie MONTÉE sur le poste, c'est-à-dire, juste après une
 *  modification, la version d'AVANT. Le lanceur n'importe que des modules du cœur de Node et
 *  résout sa chaîne à l'exécution : un seul fichier suffit. */
function poserLanceurSource(racine) {
  const d = path.join(racine, 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles', 'scripts');
  fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(LANCEUR_SOURCE, path.join(d, 'pre-commit-anonymiser.mjs'));
  return d;
}

/** TF-1337 — le pendant pour le contrôle du frontmatter des skills : sa SOURCE et le lecteur
 *  partagé qu'il importe (`lib/frontmatter.mjs`), au repli du hameçon, sous une racine jetable. */
function poserControleSource(racine) {
  const d = path.join(racine, 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles', 'scripts');
  fs.mkdirSync(path.join(d, 'lib'), { recursive: true });
  fs.copyFileSync(CONTROLE_SOURCE, path.join(d, 'frontmatter-skills-index.mjs'));
  fs.copyFileSync(path.join(ICI, 'lib', 'frontmatter.mjs'), path.join(d, 'lib', 'frontmatter.mjs'));
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

/** TF-1360 — le `sh` qui rejoue le tuyau : celui qui accompagne git. Sous Windows, une session
 *  PowerShell ne l'a pas sur son PATH, et `bash` y désigne le lanceur de WSL : il se cherche donc à
 *  côté de git (`git --exec-path` → `<git>/mingw64/libexec/git-core` → `<git>/usr/bin/sh.exe`). */
function trouverSh() {
  if (process.platform !== 'win32') return fs.existsSync('/bin/sh') ? '/bin/sh' : null;
  const exec = (spawnSync('git', ['--exec-path'], { encoding: 'utf8' }).stdout || '').trim();
  if (!exec) return null;
  const racineGit = path.resolve(exec, '..', '..', '..');
  return [path.join(racineGit, 'usr', 'bin', 'sh.exe'), path.join(racineGit, 'bin', 'sh.exe')]
    .find((c) => fs.existsSync(c)) || null;
}

/** TF-1360 — joue `commande` dans `d`, sa sortie ET sa sortie d'erreur envoyées dans un filtre qui
 *  a DÉJÀ fini sans rien lire (`false`) : la situation du 24/09. La sonde écrit dans le tuyau
 *  jusqu'à ce qu'il soit rompu (bornée à une dizaine de secondes) : la commande ne part qu'une fois
 *  le lecteur disparu, le cas ne dépend d'aucune course entre les deux côtés du tuyau. */
function jouerDansFiltreFini(shBanc, d, commande, env) {
  const e = envBanc(env);
  // Les outils du `sh` de git (sleep) vivent à côté de lui ; une session PowerShell ne les a pas.
  const cle = Object.keys(e).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  e[cle] = path.dirname(shBanc) + path.delimiter + (e[cle] || '');
  const sonde = 'i=0; while [ "$i" -lt 200 ] && ( printf x ) 2>/dev/null; do i=$((i+1)); sleep 0.05; done';
  return spawnSync(shBanc, ['-c', '{ ' + sonde + '; ' + commande + '; } 2>&1 | false'],
    { cwd: d, encoding: 'utf8', env: e });
}

/** Retire la ligne `trap '' PIPE` d'un hameçon posé : le sens ROUGE de TF-1360, et lui seul. */
function sansLigneTrap(fichier) {
  const avant = fs.readFileSync(fichier, 'utf8');
  const apres = avant.split('\n').filter((l) => l.trim() !== "trap '' PIPE").join('\n');
  fs.writeFileSync(fichier, apres, { mode: 0o755 });
  return apres !== avant;
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

  // --- cas 8 : LE MESSAGE SE JUGE AU COMMIT (TF-1071) --------------------------
  // Un nom de produit entré dans un message a coûté une réécriture de 23 enregistrements : le
  // pre-push l'a vu deux jours après. Le commit-msg le refuse à l'écriture. Deux sens sur le MÊME
  // dépôt : le message qui porte un nom de la table (jetable, nom inventé) est refusé et rien n'est
  // enregistré ; le même message pseudonymisé passe.
  const d8 = depot(racine, 'message', false);
  const pose8 = sh(racine, 'node', [INSTALLEUR, d8, '--seul=commit-msg']);
  fs.writeFileSync(path.join(d8, 'suite.md'), 'suite du rapport\n');
  git(d8, 'add', '-A');
  const sujet8 = () => (git(d8, 'log', '-1', '--format=%s').stdout || '').trim();
  const c8r = sh(d8, 'git', ['commit', '-q', '-m', 'Livraison du rapport Zorglub'], ENV_JEU_ESSAI);
  if (/POSE/.test(pose8.stdout || '') && c8r.status !== 0 && /MESSAGE REFUSE/.test(c8r.stderr || '')
      && /message:1/.test(c8r.stderr || '') && sujet8() !== 'Livraison du rapport Zorglub')
    oks.push('cas 8 — commit-msg : un message portant un nom de la table est REFUSÉ à l\'écriture, constat localisé (message:1), rien n\'est enregistré');
  else kos.push('cas 8 — le message porteur n\'est pas refusé au commit (exit ' + c8r.status + ') : ' + ((c8r.stderr || '') + (pose8.stdout || '')).trim().slice(0, 300));
  const c8v = sh(d8, 'git', ['commit', '-q', '-m', 'Livraison du rapport Client-A'], ENV_JEU_ESSAI);
  if (c8v.status === 0 && sujet8() === 'Livraison du rapport Client-A')
    oks.push('cas 8 — commit-msg : le MÊME message pseudonymisé passe, le hameçon ne crie pas sur un travail juste');
  else kos.push('cas 8 — le message pseudonymisé est refusé à tort (exit ' + c8v.status + ') : ' + (c8v.stderr || '').trim().slice(0, 300));

  // --- cas 9 : LA SORTIE PART DANS UN FILTRE QUI A DÉJÀ FINI (TF-1360) ---------
  // LE FAIT PAYÉ, 24/09/2026 : 13 envois sont partis alors que leur sortie allait dans un `grep`
  // en échec. Le hameçon refusait bien, mais son premier écho sur la sortie d'erreur, écrit dans un
  // tuyau sans lecteur, l'a tué par SIGPIPE — et sous Windows git lit alors un code 0 (mesuré par
  // trace2 : l'événement `child_exit` du hameçon porte "code":0) et PUBLIE. Les cas 1 à 8 lisent la
  // sortie : ils ne pouvaient pas le voir. Ce cas fait le geste réel et juge sur la seule preuve
  // qui compte, le DISTANT (la branche y est-elle arrivée ?) :
  //   · sens ROUGE : le MÊME hameçon privé de sa ligne `trap '' PIPE` → publié malgré le refus ;
  //   · sens VERT : le hameçon tel que l'installeur le pose → refusé, rien n'arrive au distant.
  // Le commit-msg refuse de la même façon (écho puis exit 1) et le même trou y a été mesuré le
  // 26/09 : un message porteur enregistré. Il se rejoue dans les deux sens, lui aussi.
  const shBanc = trouverSh();
  // Hors Windows, le défaut n'a pas été mesuré : le sens rouge y est DIT non reproduit, jamais tu.
  const rougeAttendu = process.platform === 'win32';
  if (!shBanc) kos.push('cas 9 — aucun `sh` trouvé à côté de git : le banc ne peut pas rejouer le tuyau rompu, TF-1360 n\'est pas éprouvé');
  else {
    const publie = (distant) => spawnSync('git', ['--git-dir=' + distant, 'rev-parse', '--verify', '-q', 'refs/heads/main'], { encoding: 'utf8' }).status === 0;

    const d9r = depot(racine, 'filtre-rouge', true);
    const r9r = distantJetable(racine, 'filtre-rouge-distant');
    git(d9r, 'remote', 'add', 'origin', r9r);
    sh(racine, 'node', [INSTALLEUR, d9r, '--seul=pre-push']);
    const retiree = sansLigneTrap(path.join(d9r, '.git', 'hooks', 'pre-push'));
    jouerDansFiltreFini(shBanc, d9r, 'git push origin main', ENV_JEU_ESSAI);
    const publieRouge = publie(r9r);
    if (!retiree) kos.push('cas 9 (sens rouge) — le pre-push posé ne porte pas la ligne trap \'\' PIPE : il n\'y a rien à retirer, le sens rouge ne se construit pas');
    else if (publieRouge) oks.push('cas 9 (sens rouge) — pre-push SANS la ligne trap \'\' PIPE, sortie dans un filtre fini : PUBLIÉ malgré le refus — le défaut du 24/09 est vivant, et c\'est lui que le sens vert tue');
    else if (rougeAttendu) kos.push('cas 9 (sens rouge) — le témoin ne reproduit rien : sans la ligne, rien n\'est publié (ou le banc n\'a pas rompu le tuyau) — le sens vert ne prouvera donc pas grand-chose');
    else oks.push('cas 9 (sens rouge) — NON REPRODUIT sur ' + process.platform + ' : la publication malgré le refus n\'a été mesurée que sous Windows. La ligne reste posée et le sens vert est joué — dit, jamais tu');

    const d9v = depot(racine, 'filtre-vert', true);
    const r9v = distantJetable(racine, 'filtre-vert-distant');
    git(d9v, 'remote', 'add', 'origin', r9v);
    sh(racine, 'node', [INSTALLEUR, d9v, '--seul=pre-push']);
    jouerDansFiltreFini(shBanc, d9v, 'git push origin main', ENV_JEU_ESSAI);
    if (!publie(r9v)) oks.push('cas 9 (sens vert) — pre-push tel que l\'installeur le pose, sortie dans le MÊME filtre fini : push REFUSÉ, rien n\'est arrivé au distant');
    else kos.push('cas 9 (sens vert) — le pre-push posé laisse PUBLIER quand la sortie part dans un filtre fini : son refus ne tient que si quelqu\'un lit la sortie');

    // Le commit-msg, dans les deux sens : le message porte un nom de la table (jetable, inventé).
    const sujet9 = (d) => (git(d, 'log', '-1', '--format=%s').stdout || '').trim();
    const d9mr = depot(racine, 'filtre-message-rouge', false);
    sh(racine, 'node', [INSTALLEUR, d9mr, '--seul=commit-msg']);
    const retireeMsg = sansLigneTrap(path.join(d9mr, '.git', 'hooks', 'commit-msg'));
    fs.writeFileSync(path.join(d9mr, 'suite.md'), 'suite du rapport\n');
    git(d9mr, 'add', '-A');
    jouerDansFiltreFini(shBanc, d9mr, "git commit -q -m 'Livraison du rapport Zorglub'", ENV_JEU_ESSAI);
    const enregistreRouge = sujet9(d9mr) === 'Livraison du rapport Zorglub';
    if (!retireeMsg) kos.push('cas 9 (commit-msg, sens rouge) — le commit-msg posé ne porte pas la ligne trap \'\' PIPE');
    else if (enregistreRouge) oks.push('cas 9 (commit-msg, sens rouge) — SANS la ligne, sortie dans un filtre fini : le message porteur est ENREGISTRÉ malgré le refus');
    else if (rougeAttendu) kos.push('cas 9 (commit-msg, sens rouge) — le témoin ne reproduit rien : sans la ligne, le message porteur n\'est pas enregistré');
    else oks.push('cas 9 (commit-msg, sens rouge) — NON REPRODUIT sur ' + process.platform + ' : mesuré seulement sous Windows — dit, jamais tu');

    const d9mv = depot(racine, 'filtre-message-vert', false);
    sh(racine, 'node', [INSTALLEUR, d9mv, '--seul=commit-msg']);
    fs.writeFileSync(path.join(d9mv, 'suite.md'), 'suite du rapport\n');
    git(d9mv, 'add', '-A');
    jouerDansFiltreFini(shBanc, d9mv, "git commit -q -m 'Livraison du rapport Zorglub'", ENV_JEU_ESSAI);
    if (sujet9(d9mv) !== 'Livraison du rapport Zorglub') oks.push('cas 9 (commit-msg, sens vert) — AVEC la ligne, sortie dans le MÊME filtre fini : message porteur REFUSÉ, rien n\'est enregistré');
    else kos.push('cas 9 (commit-msg, sens vert) — le commit-msg posé laisse ENREGISTRER un message porteur quand la sortie part dans un filtre fini');
  }

  // Les TROIS gabarits portent la ligne, et en PREMIÈRE commande : un écho placé avant elle
  // rouvrirait le trou. Lu sur les hameçons réellement POSÉS, pas sur la source de l'installeur.
  const d9s = depot(racine, 'trois-gabarits', false);
  sh(racine, 'node', [INSTALLEUR, d9s]);
  const premiereCommande = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '').split(/\r?\n/)
    .map((l) => l.trim()).find((l) => l && !l.startsWith('#')) || '(aucune)';
  const sansTrapEnTete = ['pre-push', 'pre-commit', 'commit-msg']
    .map((h) => [h, premiereCommande(path.join(d9s, '.git', 'hooks', h))])
    .filter(([, c]) => c !== "trap '' PIPE");
  if (!sansTrapEnTete.length) oks.push('cas 9 — les TROIS hameçons posés (pre-push, pre-commit, commit-msg) ont trap \'\' PIPE pour première commande');
  else kos.push('cas 9 — hameçon(s) posé(s) dont la première commande n\'est pas trap \'\' PIPE : ' + sansTrapEnTete.map(([h, c]) => h + ' → « ' + c.slice(0, 60) + ' »').join(' ; '));

  // --- cas 11 : AU REFUS, LES COMPTES PUIS LES SEULS BLOQUANTS (TF-1554) ----------------
  // LE FAIT, 27/09/2026 au pilot : 4 constats bloquants suivis de 36 antériorités non bloquantes
  // dans les 40 lignes imprimées, sans compte. Une porte jouet, déposée là où le hameçon cherche
  // d'abord (la copie installée sous HOME), rend exactement cette sortie ; le refus doit dire les
  // deux comptes, imprimer les 4 bloquants et taire les 36 antériorités en les comptant.
  {
    const maison = fs.mkdtempSync(path.join(os.tmpdir(), 'hamecon-comptes-'));
    try {
      const dPorte = path.join(maison, '.claude', 'skills', 'quality-oracles', 'scripts');
      fs.mkdirSync(dPorte, { recursive: true });
      const findings = [
        ...Array.from({ length: 4 }, (_, i) => ({ sev: 'bloquant', regle: 'C5', where: 'BLOQ-' + i, msg: 'nom de produit' })),
        ...Array.from({ length: 36 }, (_, i) => ({ sev: 'anteriorite', regle: 'C5', where: 'ANTER-' + i, msg: 'nom de produit — ANTÉRIORITÉ' })),
      ];
      fs.writeFileSync(path.join(dPorte, 'oracle-nom-client-publie.mjs'), 'process.stdout.write(' + JSON.stringify(JSON.stringify({
        oracle: 'oracle-nom-client-publie', verdict: 'FAIL', findings,
        comptes: { bloquants: { total: 4, rendus: 4 }, anteriorites: { total: 36, rendus: 36 } },
        non_juge: ['limite generique de la porte'],
      })) + '); process.exit(1);\n');
      // TF-1221 — le pre-push joue la porte des secrets avant celle des noms : la vraie, à côté du jouet.
      fs.copyFileSync(PORTE_SECRETS_SOURCE, path.join(dPorte, 'porte-secrets-publies.mjs'));
      if (fs.existsSync(PORTE_IDENTITE_SOURCE)) fs.copyFileSync(PORTE_IDENTITE_SOURCE, path.join(dPorte, 'porte-identite-publication.mjs'));
      const d11 = depot(maison, 'comptes', false);
      git(d11, 'remote', 'add', 'origin', distantJetable(maison, 'comptes-distant'));
      sh(maison, 'node', [INSTALLEUR, d11, '--seul=pre-push']);
      const p11 = sh(d11, 'git', ['push', 'origin', 'main'], { HOME: maison, USERPROFILE: maison, FORGE_ROOT: maison });
      const e11 = p11.stderr || '';
      const nB = (e11.match(/BLOQ-\d/g) || []).length, nA = (e11.match(/ANTER-\d/g) || []).length;
      if (p11.status !== 0 && /4 constat\(s\) BLOQUANT\(S\)/.test(e11) && /36 anteriorite\(s\) tue\(s\)/.test(e11) && nB === 4 && nA === 0
          && e11.indexOf('BLOQUANT(S)') < e11.indexOf('BLOQ-0'))
        oks.push('cas 11 (TF-1554) — refus à 4 bloquants et 36 antériorités : les deux comptes en tête, les 4 bloquants imprimés, les 36 antériorités tues et comptées');
      else kos.push(`cas 11 (TF-1554) — sortie du refus : exit ${p11.status}, ${nB} bloquant(s) et ${nA} antériorité(s) imprimés : ` + e11.trim().slice(0, 300));
    } finally { try { fs.rmSync(maison, { recursive: true, force: true }); } catch { /* zone temporaire */ } }
  }

  // --- cas 12 : UN PRE-PUSH QUI PROLONGE LE GABARIT N'EST JAMAIS ÉCRASÉ (TF-1402) --------------
  // LE FAIT, 24/09/2026 : le pre-push du pilot, le gabarit plus sa borne R-38 §4-5, sans signature,
  // était dit A-MIGRER, et --migrer l'aurait remplacé par le gabarit. Sens rouge : le même hameçon
  // jouet (gabarit sans signature ni marqueurs, plus deux lignes propres) est dit PROLONGE et
  // --migrer n'y touche pas. Sens vert : ses lignes entre les marqueurs et la signature ajoutée —
  // le geste que le refus prescrit —, l'installeur le repose en CONSERVANT la section, qui joue.
  {
    const d12 = depot(racine, 'prolonge', false);
    git(d12, 'remote', 'add', 'origin', distantJetable(racine, 'prolonge-distant'));
    sh(racine, 'node', [INSTALLEUR, d12, '--seul=pre-push']);
    const h12 = path.join(d12, '.git', 'hooks', 'pre-push');
    const gabarit = fs.readFileSync(h12, 'utf8');
    const PROPRES = ['echo "BORNE PROPRE DU DEPOT : envoi refuse sans GO" >&2', 'exit 1'];
    const L = gabarit.split('\n');
    const iD = L.indexOf('# >>> prolongement local >>>');
    const iF = L.indexOf('# <<< prolongement local <<<');
    const ancien = [...L.slice(0, iD), ...PROPRES, ...L.slice(iF + 1)].filter((l) => !l.startsWith('# hamecon-parc:')).join('\n');
    fs.writeFileSync(h12, ancien, { mode: 0o755 });
    const v12 = sh(racine, 'node', [INSTALLEUR, d12, '--seul=pre-push', '--verifier']);
    const m12 = sh(racine, 'node', [INSTALLEUR, d12, '--seul=pre-push', '--migrer']);
    if (iD >= 0 && iF > iD && /PROLONGE/.test(v12.stdout || '') && /CONFLIT/.test(m12.stdout || '') && /PROLONGÉ/.test(m12.stdout || '')
        && fs.readFileSync(h12, 'utf8') === ancien)
      oks.push('cas 12 (TF-1402, sens rouge) — un pre-push non signé qui porte deux lignes propres est dit PROLONGE, et --migrer le laisse intact');
    else kos.push('cas 12 (TF-1402, sens rouge) — marqueurs ' + iD + '/' + iF + ', vérifier « ' + (v12.stdout || '').trim().slice(0, 160) + ' », migrer « ' + (m12.stdout || '').trim().slice(0, 160) + ' »');
    const delimite = [...L.slice(0, iD + 1), ...PROPRES, ...L.slice(iF)].join('\n');
    fs.writeFileSync(h12, delimite, { mode: 0o755 });
    const r12 = sh(racine, 'node', [INSTALLEUR, d12, '--seul=pre-push']);
    const apres12 = fs.readFileSync(h12, 'utf8');
    const v12b = sh(racine, 'node', [INSTALLEUR, d12, '--seul=pre-push', '--verifier']);
    const p12 = sh(d12, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    if (/REPOSE/.test(r12.stdout || '') && /section propre conservée/.test(r12.stdout || '') && apres12 === delimite
        && /POSE /.test(v12b.stdout || '') && p12.status !== 0 && /BORNE PROPRE DU DEPOT/.test(p12.stderr || ''))
      oks.push('cas 12 (TF-1402, sens vert) — section entre les marqueurs et signature ajoutée : reposé, section conservée, dit POSE, et la section JOUE (envoi d\'un dépôt propre refusé par elle)');
    else kos.push('cas 12 (TF-1402, sens vert) — reposer « ' + (r12.stdout || '').trim().slice(0, 160) + ' », vérifier « ' + (v12b.stdout || '').trim().slice(0, 120) + ' », push exit ' + p12.status);
  }

  // --- cas 13 : UN HAMEÇON SIGNÉ MAIS PÉRIMÉ SE DIT PÉRIMÉ (TF-1360) ------------------------
  // Le 28/09 : un pre-push posé avant la ligne trap '' PIPE, et signé, se disait POSÉ ; et un
  // hameçon signé `v2` par une variante non publiée se disait A-MIGRER. La propriété tient à
  // l'identifiant, la fraîcheur au contenu.
  {
    const d13 = depot(racine, 'perime', false);
    sh(racine, 'node', [INSTALLEUR, d13, '--seul=pre-push']);
    const h13 = path.join(d13, '.git', 'hooks', 'pre-push');
    const verif = () => sh(racine, 'node', [INSTALLEUR, d13, '--seul=pre-push', '--verifier']);
    const v0 = verif();
    sansLigneTrap(h13);
    const v1 = verif();
    const r13 = sh(racine, 'node', [INSTALLEUR, d13, '--seul=pre-push']);
    const v2 = verif();
    fs.writeFileSync(h13, fs.readFileSync(h13, 'utf8').replace('# hamecon-parc: pre-push-nom-client v1', '# hamecon-parc: pre-push-nom-client v2'), { mode: 0o755 });
    const v3 = verif();
    if (v0.status === 0 && /POSE /.test(v0.stdout || '') && v1.status !== 0 && /PERIME/.test(v1.stdout || '')
        && /REPOSE/.test(r13.stdout || '') && v2.status === 0 && /PERIME/.test(v3.stdout || '') && !/A-MIGRER/.test(v3.stdout || ''))
      oks.push('cas 13 (TF-1360) — signé et à jour : POSE ; privé de trap \'\' PIPE : PERIME (exit 1), reposé par un lancement ordinaire ; signé v2 : PERIME, jamais A-MIGRER');
    else kos.push('cas 13 (TF-1360) — ' + [v0, v1, v2, v3].map((v) => (v.stdout || '').trim().split('\n')[0]).join(' | '));
  }

  // --- cas 14 : LA BORNE R-38 §4-5 EST PORTÉE PAR LE GABARIT (TF-1275) ------------------------
  // Le pre-push du pilot portait cette section écrite à la main ; une repose pouvait l'effacer et
  // un clone neuf ne l'avait pas. Le gabarit la porte, gardée par la présence du classeur
  // `scripts/verifier-avance-publication.mjs` : un classeur jouet qui refuse sans `--go`.
  {
    const d14 = depot(racine, 'borne-r38', false);
    git(d14, 'remote', 'add', 'origin', distantJetable(racine, 'borne-r38-distant'));
    fs.mkdirSync(path.join(d14, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(d14, 'scripts', 'verifier-avance-publication.mjs'),
      'const i = process.argv.indexOf("--go");\n'
      + 'if (i > 0 && process.argv[i + 1]) process.exit(0);\n'
      + 'process.stdout.write(JSON.stringify({ enregistrements: [{ sha: "abc1234", classe: "explicite", sujet: "Regle modifiee", fichiers_hors_classe: ["REGLES.md"] }] }));\n'
      + 'process.exit(1);\n');
    sh(racine, 'node', [INSTALLEUR, d14, '--seul=pre-push']);
    const r14 = sh(racine, 'node', [INSTALLEUR, d14, '--seul=pre-push']);
    const h14 = fs.readFileSync(path.join(d14, '.git', 'hooks', 'pre-push'), 'utf8');
    const p14r = sh(d14, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    const p14v = sh(d14, 'git', ['push', 'origin', 'main'], { ...ENV_JEU_ESSAI, FORGE_PUSH_GO: 'D-1 (a) du 12/10' });
    if (/REPOSE/.test(r14.stdout || '') && h14.includes('verifier-avance-publication.mjs')
        && p14r.status !== 0 && /GO humain explicite/.test(p14r.stderr || '') && /abc1234/.test(p14r.stderr || ''))
      oks.push('cas 14 (TF-1275, sens rouge) — gabarit reposé, la borne R-38 y reste ; sans FORGE_PUSH_GO, l\'envoi d\'un enregistrement « explicite » est REFUSÉ, l\'enregistrement nommé');
    else kos.push('cas 14 (TF-1275, sens rouge) — reposer « ' + (r14.stdout || '').trim().slice(0, 120) + ' », push exit ' + p14r.status + ' : ' + (p14r.stderr || '').trim().slice(0, 300));
    if (p14v.status === 0) oks.push('cas 14 (TF-1275, sens vert) — avec FORGE_PUSH_GO déclaré, le même envoi passe la borne puis la porte des noms');
    else kos.push('cas 14 (TF-1275, sens vert) — envoi avec GO refusé (exit ' + p14v.status + ') : ' + (p14v.stderr || '').trim().slice(0, 300));
  }

  // --- cas 15 : --essai DIT CE QU'IL FERAIT ET N'ÉCRIT RIEN (TF-1360, TF-1403) -----------------
  // La repose du parc touche 14 dépôts réels : elle se joue d'abord à blanc.
  {
    const d15 = depot(racine, 'essai', false);
    const hooks15 = path.join(d15, '.git', 'hooks');
    const e15a = sh(racine, 'node', [INSTALLEUR, d15, '--essai']);
    const rienPose = ['pre-push', 'pre-commit', 'commit-msg'].every((n) => !fs.existsSync(path.join(hooks15, n)));
    sh(racine, 'node', [INSTALLEUR, d15, '--seul=pre-push']);
    sansLigneTrap(path.join(hooks15, 'pre-push'));
    const avant15 = fs.readFileSync(path.join(hooks15, 'pre-push'), 'utf8');
    const e15b = sh(racine, 'node', [INSTALLEUR, d15, '--essai', '--seul=pre-push']);
    if (rienPose && (e15a.stdout.match(/\(essai\) POSE/g) || []).length === 3 && /ESSAI : rien n'a été écrit/.test(e15a.stdout)
        && /\(essai\) REPOSE/.test(e15b.stdout || '') && fs.readFileSync(path.join(hooks15, 'pre-push'), 'utf8') === avant15)
      oks.push('cas 15 — --essai annonce les 3 poses puis la repose d\'un hameçon périmé, et n\'écrit RIEN');
    else kos.push('cas 15 — --essai : « ' + (e15a.stdout || '').trim().slice(0, 160) + ' » / « ' + (e15b.stdout || '').trim().slice(0, 120) + ' », rien posé : ' + rienPose);
  }

  // --- cas 16 : LE PRE-PUSH NE JUGE QUE CE QUE L'ENVOI AJOUTE (TF-1555) -----------------------
  // Un passé déjà publié porteur (envoyé avec --no-verify, comme le passif d'un dépôt réel) ne
  // refuse plus chaque envoi suivant ; un ajout porteur, même retiré de l'arbre, refuse toujours.
  {
    const d16 = depot(racine, 'avance', false);
    git(d16, 'remote', 'add', 'origin', distantJetable(racine, 'avance-distant'));
    sh(racine, 'node', [INSTALLEUR, d16, '--seul=pre-push']);
    const ecrire = (nom, txt, msg) => { fs.writeFileSync(path.join(d16, nom), txt); git(d16, 'add', '-A'); git(d16, 'commit', '-q', '-m', msg); };
    ecrire('ancien.md', 'Note pour Zorglub.\n', 'Note ancienne');
    git(d16, 'rm', '-q', 'ancien.md'); git(d16, 'commit', '-q', '-m', 'Retrait de la note');
    sh(d16, 'git', ['push', '--no-verify', 'origin', 'main'], ENV_JEU_ESSAI);
    ecrire('suite.md', 'Suite pseudonymisee pour Client-A.\n', 'Suite propre');
    const complet = sh(racine, 'node', [ORACLE_SOURCE, d16], ENV_JEU_ESSAI);
    const p16v = sh(d16, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    if (complet.status === 1 && p16v.status === 0)
      oks.push('cas 16 (TF-1555, sens vert) — passé publié porteur : la porte sans --revs rend FAIL, l\'envoi d\'un ajout propre PASSE (seul l\'ajout est jugé)');
    else kos.push('cas 16 (TF-1555, sens vert) — porte complète exit ' + complet.status + ', push exit ' + p16v.status + ' : ' + (p16v.stderr || '').trim().slice(0, 300));
    ecrire('fuite.md', 'Livraison Zorglub.\n', 'Ajout neutre');
    git(d16, 'rm', '-q', 'fuite.md'); git(d16, 'commit', '-q', '-m', 'Retrait');
    const p16r = sh(d16, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    if (p16r.status !== 0 && /C4/.test(p16r.stderr || ''))
      oks.push('cas 16 (TF-1555, sens rouge) — un ajout porteur retiré de l\'arbre dans le même envoi est REFUSÉ sur C4 : l\'histoire ajoutée reste jugée');
    else kos.push('cas 16 (TF-1555, sens rouge) — push exit ' + p16r.status + ' : ' + (p16r.stderr || '').trim().slice(0, 300));
    const tete = (git(d16, 'rev-parse', 'HEAD').stdout || '').trim();
    const inval = sh(racine, 'node', [ORACLE_SOURCE, d16, '--revs=' + tete + ',--output=x'], ENV_JEU_ESSAI);
    const inconnu = sh(racine, 'node', [ORACLE_SOURCE, d16, '--revs=' + 'f'.repeat(40)], ENV_JEU_ESSAI);
    if (inval.status === 2 && /jeton refusé/.test(inval.stdout || '') && inconnu.status === 2 && /ne lit pas cette plage/.test(inconnu.stdout || ''))
      oks.push('cas 16 (TF-1555) — --revs : une option git glissée et une empreinte inconnue font SKIP (exit 2), jamais une histoire vide jugée PASS');
    else kos.push('cas 16 (TF-1555) — --revs invalide exit ' + inval.status + ', inconnu exit ' + inconnu.status);
  }

  // --- cas 16 ter : L'ARBRE JUGÉ EST CELUI QUI PART, PAS CELUI DU DISQUE (TF-1953) ----------------
  // Mesuré le 20/10/2026 au pilot : un envoi de 5 révisions propres refusé par 2 constats C5 sur des
  // lignes NON enregistrées d'un fichier suivi (HEAD : 44 lignes, disque : 49). C1, C2 et C5 d'arbre
  // lisaient le disque. Sens vert : un nom dans une modification non enregistrée ne refuse plus un
  // envoi propre ; sens rouge : un nom enregistré, déjà publié, puis effacé du disque seulement,
  // reste refusé sur C1 (l'arbre envoyé le porte encore).
  {
    const monter = (nom) => {
      const d = depot(racine, nom, false);
      const distant = distantJetable(racine, nom + '-distant');
      git(d, 'remote', 'add', 'origin', distant);
      sh(racine, 'node', [INSTALLEUR, d, '--seul=pre-push']);
      return { d, distant };
    };
    const auDistant = (distant) => spawnSync('git', ['--git-dir=' + distant, 'rev-parse', '--verify', '-q', 'refs/heads/main'], { encoding: 'utf8' }).status === 0;
    const valider = (d, nom, txt, msg) => { fs.writeFileSync(path.join(d, nom), txt); git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', msg); };

    // (a) sens vert : révision propre, disque sale
    const a = monter('arbre-disque-sale');
    valider(a.d, 'journal.md', 'Ligne enregistree, pseudonymisee pour Client-A.\n', 'Journal propre');
    fs.appendFileSync(path.join(a.d, 'journal.md'), 'Brouillon local pour Zorglub, non enregistre.\n');
    const disqueSeul = sh(racine, 'node', [ORACLE_SOURCE, a.d], ENV_JEU_ESSAI);
    const p16a = sh(a.d, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    if (disqueSeul.status === 1 && /C1/.test(disqueSeul.stdout || '') && p16a.status === 0 && auDistant(a.distant))
      oks.push('cas 16 ter (TF-1953, sens vert) — un nom dans une modification NON ENREGISTRÉE ne refuse plus l\'envoi : la porte sans --revs juge le disque (FAIL C1), le pre-push juge l\'arbre envoyé (PASS, branche au distant)');
    else kos.push('cas 16 ter (TF-1953, sens vert) — porte sans --revs exit ' + disqueSeul.status + ', push exit ' + p16a.status + ', au distant : ' + auDistant(a.distant) + ' : ' + (p16a.stderr || '').trim().slice(0, 300));

    // (b) sens rouge : un porteur déjà publié, effacé du disque seulement, puis un envoi propre
    const b = monter('arbre-porteur-efface');
    valider(b.d, 'ancien.md', 'Note ancienne pour Zorglub.\n', 'Note ancienne');
    sh(b.d, 'git', ['push', '--no-verify', 'origin', 'main'], ENV_JEU_ESSAI);
    valider(b.d, 'suite.md', 'Suite pseudonymisee pour Client-A.\n', 'Suite propre');       // l'arbre envoyé porte encore ancien.md
    fs.writeFileSync(path.join(b.d, 'ancien.md'), 'Note ancienne pour Client-A.\n');       // effacé du DISQUE seulement, non enregistré
    const p16b = sh(b.d, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    const e16b = p16b.stderr || '';
    if (p16b.status !== 0 && /C1/.test(e16b) && /ancien\.md:1/.test(e16b))
      oks.push('cas 16 ter (TF-1953, sens rouge) — un nom porté par l\'arbre ENVOYÉ et effacé du disque seulement reste refusé : C1 nomme ancien.md:1 (la lecture du disque le laissait passer)');
    else kos.push('cas 16 ter (TF-1953, sens rouge) — push exit ' + p16b.status + ' : ' + e16b.trim().slice(0, 400));
  }

  // --- cas 16 quater : LA VUE LOCALE DU DISTANT N'EST PAS LE DISTANT (TF-2027) -------------------
  // Mesuré le 29/10/2026 au pilot : 4 enregistrements déjà publiés (ancêtres d'origin/main) refusaient tout
  // envoi par 4 constats C5. Rejoué le 02/11/2026 sur un clone jetable : une vue locale du distant en retard
  // (suivi supprimé ou périmé) et une empreinte distante nulle (branche neuve) redonnent EXACTEMENT ces 4
  // constats bloquants, la plage jugée contenant du publié. Le pre-push demande donc au distant ce qu'il porte
  // (`git ls-remote --heads`) et exclut ces têtes avant de juger. Sens vert : un porteur publié, suivi effacé,
  // envoi propre vers une branche NEUVE → PASSE ; sens rouge : un ajout porteur dans le même envoi → REFUSÉ.
  {
    const d = depot(racine, 'vue-perimee', false);
    const distant = distantJetable(racine, 'vue-perimee-distant');
    git(d, 'remote', 'add', 'origin', distant);
    sh(racine, 'node', [INSTALLEUR, d, '--seul=pre-push']);
    const valider = (nom, txt, msg) => { fs.writeFileSync(path.join(d, nom), txt); git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', msg); };
    const brancheAuDistant = (b) => spawnSync('git', ['--git-dir=' + distant, 'rev-parse', '--verify', '-q', 'refs/heads/' + b], { encoding: 'utf8' }).status === 0;
    valider('ancien.md', 'Note ancienne pour Zorglub.\n', 'Note ancienne');
    git(d, 'rm', '-q', 'ancien.md'); git(d, 'commit', '-q', '-m', 'Retrait de la note');
    sh(d, 'git', ['push', '--no-verify', 'origin', 'main'], ENV_JEU_ESSAI);          // le porteur est PUBLIÉ
    git(d, 'update-ref', '-d', 'refs/remotes/origin/main');                           // la vue locale du distant est perdue
    valider('suite.md', 'Suite pseudonymisee pour Client-A.\n', 'Suite propre');
    const vue = sh(d, 'git', ['for-each-ref', 'refs/remotes'], ENV_JEU_ESSAI);
    const p16q = sh(d, 'git', ['push', 'origin', 'main:neuve'], ENV_JEU_ESSAI);
    if ((vue.stdout || '').trim() === '' && p16q.status === 0 && brancheAuDistant('neuve'))
      oks.push('cas 16 quater (TF-2027, sens vert) — passé publié porteur, aucun suivi local du distant, branche neuve : l\'envoi propre PASSE (le distant dit ce qu\'il porte) et la branche est au distant');
    else kos.push('cas 16 quater (TF-2027, sens vert) — suivis locaux : « ' + (vue.stdout || '').trim().slice(0, 80) + ' », push exit ' + p16q.status + ', branche au distant : ' + brancheAuDistant('neuve') + ' : ' + (p16q.stderr || '').trim().slice(0, 300));
    valider('fuite.md', 'Livraison Zorglub.\n', 'Ajout neutre');
    git(d, 'rm', '-q', 'fuite.md'); git(d, 'commit', '-q', '-m', 'Retrait');
    git(d, 'update-ref', '-d', 'refs/remotes/origin/neuve');
    const p16r2 = sh(d, 'git', ['push', 'origin', 'main:neuve2'], ENV_JEU_ESSAI);
    if (p16r2.status !== 0 && /C4/.test(p16r2.stderr || '') && !brancheAuDistant('neuve2'))
      oks.push('cas 16 quater (TF-2027, sens rouge) — le même envoi vers une branche neuve, avec un ajout porteur retiré de l\'arbre, est REFUSÉ sur C4 et la branche n\'arrive pas au distant');
    else kos.push('cas 16 quater (TF-2027, sens rouge) — push exit ' + p16r2.status + ', branche au distant : ' + brancheAuDistant('neuve2') + ' : ' + (p16r2.stderr || '').trim().slice(0, 400));
  }

  // --- cas 17 : UN PORTEUR DE SECRETS AJOUTÉ PAR L'ENVOI EST REFUSÉ (TF-1221) ------------------
  // Des porteurs de secrets ont été publiés chez deux produits : la règle SP2 ne se jouait que depuis
  // le pilot. Le pre-push la joue sur les fichiers que l'envoi ajoute. Chaque sens se juge sur la
  // seule preuve qui compte, la branche au distant ; le remède que dit le refus est joué et passe.
  {
    const auDistant17 = (distant) => spawnSync('git', ['--git-dir=' + distant, 'rev-parse', '--verify', '-q', 'refs/heads/main'], { encoding: 'utf8' }).status === 0;
    const preparer = (nom) => {
      const d = depot(racine, nom, false);
      const distant = distantJetable(racine, nom + '-distant');
      git(d, 'remote', 'add', 'origin', distant);
      sh(racine, 'node', [INSTALLEUR, d, '--seul=pre-push']);
      return { d, distant };
    };
    const ajouter = (d, fichiers, msg, force) => {
      for (const [nom, txt] of Object.entries(fichiers)) fs.writeFileSync(path.join(d, nom), txt);
      git(d, 'add', ...(force ? ['-f'] : []), '--', ...Object.keys(fichiers));
      git(d, 'commit', '-q', '-m', msg);
    };

    // (17a) sens ROUGE : un `.env` suivi ajouté → refusé, rien au distant, le fichier nommé
    const a = preparer('secret-rouge');
    ajouter(a.d, { '.env': 'CLE=valeur-de-recette\n' }, 'Configuration locale');
    const p17a = sh(a.d, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    const e17a = p17a.stderr || '';
    if (p17a.status !== 0 && !auDistant17(a.distant) && /PUBLICATION REFUSEE/.test(e17a) && /SP2\s+\.env \(/.test(e17a)
        && /aucune ligne du \.gitignore/.test(e17a) && !/valeur-de-recette/.test(e17a))
      oks.push('cas 17a (TF-1221, sens rouge) — un `.env` suivi ajouté par l\'envoi : REFUSÉ, rien au distant, SP2 nomme le fichier et sa révision, le contenu n\'est jamais imprimé');
    else kos.push('cas 17a (TF-1221, sens rouge) — push exit ' + p17a.status + ', au distant : ' + auDistant17(a.distant) + ' : ' + e17a.trim().slice(0, 400));

    // (17b) le REMÈDE dit par le refus, joué : retiré du suivi, ignoré, dernier enregistrement réécrit → publié
    git(a.d, 'rm', '-q', '--cached', '--', '.env');
    fs.writeFileSync(path.join(a.d, '.gitignore'), '.env\n');
    git(a.d, 'add', '.gitignore');
    git(a.d, 'commit', '-q', '--amend', '--no-edit');
    const p17b = sh(a.d, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    if (p17b.status === 0 && auDistant17(a.distant) && fs.existsSync(path.join(a.d, '.env')))
      oks.push('cas 17b (TF-1221, remède joué) — `git rm --cached`, `.env` au .gitignore, `git commit --amend` : PUBLIÉ, le `.env` reste sur le disque, ignoré');
    else kos.push('cas 17b (TF-1221, remède joué) — push exit ' + p17b.status + ' : ' + (p17b.stderr || '').trim().slice(0, 300));

    // (17c) sens VERT, borne du gabarit : `.env.example` versionné exprès, `.env` ignoré non suivi → publié
    const c = preparer('secret-vert');
    fs.writeFileSync(path.join(c.d, '.env'), 'CLE=valeur\n');
    ajouter(c.d, { '.gitignore': '.env\n', '.env.example': 'CLE=\n' }, 'Gabarit de configuration');
    const p17c = sh(c.d, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    if (p17c.status === 0 && auDistant17(c.distant))
      oks.push('cas 17c (TF-1221, sens vert) — `.env.example` ajouté et `.env` ignoré non suivi : PUBLIÉ, la bonne pratique n\'est pas accusée');
    else kos.push('cas 17c (TF-1221, sens vert) — push exit ' + p17c.status + ' : ' + (p17c.stderr || '').trim().slice(0, 300));

    // (17d) borne d'antériorité : un porteur DÉJÀ publié ne refuse pas l'envoi suivant ; un porteur
    // ajouté puis retiré de l'arbre dans le même envoi part dans l'histoire, et il est refusé.
    const ant = preparer('secret-anteriorite');
    ajouter(ant.d, { '.npmrc': 'registry=x\n' }, 'Configuration npm');
    sh(ant.d, 'git', ['push', '--no-verify', 'origin', 'main'], ENV_JEU_ESSAI);
    ajouter(ant.d, { 'suite.md': 'Suite.\n' }, 'Suite');
    const p17d = sh(ant.d, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    ajouter(ant.d, { 'cle.pem': 'x\n' }, 'Certificat');
    git(ant.d, 'rm', '-q', '--', 'cle.pem'); git(ant.d, 'commit', '-q', '-m', 'Retrait du certificat');
    const p17d2 = sh(ant.d, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    if (p17d.status === 0 && p17d2.status !== 0 && /SP2\s+cle\.pem/.test(p17d2.stderr || '') && !/\.npmrc/.test(p17d2.stderr || ''))
      oks.push('cas 17d (TF-1221, borne) — `.npmrc` déjà publié : l\'envoi suivant PASSE ; `cle.pem` ajouté puis retiré dans le même envoi : REFUSÉ, l\'histoire ajoutée est jugée');
    else kos.push('cas 17d (TF-1221, borne) — envoi après antériorité exit ' + p17d.status + ', ajout retiré exit ' + p17d2.status + ' : ' + (p17d2.stderr || '').trim().slice(0, 300));

    // (17e) borne : ajouté de FORCE malgré un .gitignore qui le couvre → refusé, et le refus le dit
    const f = preparer('secret-force');
    ajouter(f.d, { '.gitignore': 'credentials.json\n' }, 'Ignorer les identifiants');
    ajouter(f.d, { 'credentials.json': '{}\n' }, 'Identifiants', true);
    const p17e = sh(f.d, 'git', ['push', 'origin', 'main'], ENV_JEU_ESSAI);
    if (p17e.status !== 0 && !auDistant17(f.distant) && /credentials\.json/.test(p17e.stderr || '') && /ajouté de force/.test(p17e.stderr || ''))
      oks.push('cas 17e (TF-1221, borne) — `credentials.json` ajouté par `git add -f` malgré le .gitignore : REFUSÉ, « ajouté de force » dit');
    else kos.push('cas 17e (TF-1221, borne) — push exit ' + p17e.status + ' : ' + (p17e.stderr || '').trim().slice(0, 300));

    // (17f) porte INTROUVABLE → refus motivé ; --revs invalide → SKIP (exit 2), jamais PASS
    const desert17 = fs.mkdtempSync(path.join(os.tmpdir(), 'sans-porte-'));
    try {
      fs.writeFileSync(path.join(desert17, '_noms-interdits.json'), fs.readFileSync(path.join(racine, '_noms-interdits.json')));
      const dir17 = poserOracleSource(desert17);
      fs.rmSync(path.join(dir17, 'porte-secrets-publies.mjs'));
      const d17f = depot(desert17, 'sans-porte', false);
      const r17f = distantJetable(desert17, 'sans-porte-distant');
      git(d17f, 'remote', 'add', 'origin', r17f);
      sh(desert17, 'node', [INSTALLEUR, d17f, '--seul=pre-push']);
      const p17f = sh(d17f, 'git', ['push', 'origin', 'main'], { HOME: desert17, USERPROFILE: desert17, FORGE_ROOT: desert17 });
      const tete17 = (git(d17f, 'rev-parse', 'HEAD').stdout || '').trim();
      const skip17 = sh(racine, 'node', [PORTE_SECRETS_SOURCE, d17f, '--revs=' + tete17 + ',--output=x']);
      const inconnu17 = sh(racine, 'node', [PORTE_SECRETS_SOURCE, d17f, '--revs=' + 'f'.repeat(40)]);
      if (p17f.status !== 0 && !auDistant17(r17f) && /porte des secrets .*introuvable/.test(p17f.stderr || '')
          && skip17.status === 2 && /jeton refusé/.test(skip17.stdout || '') && inconnu17.status === 2 && /ne lit pas cette plage/.test(inconnu17.stdout || ''))
        oks.push('cas 17f (TF-1221) — porte des secrets INTROUVABLE : envoi REFUSÉ, motif dit ; option glissée ou empreinte inconnue : SKIP (exit 2), jamais PASS');
      else kos.push('cas 17f (TF-1221) — sans porte exit ' + p17f.status + ', jeton exit ' + skip17.status + ', inconnu exit ' + inconnu17.status + ' : ' + (p17f.stderr || '').trim().slice(0, 300));
    } finally { try { fs.rmSync(desert17, { recursive: true, force: true }); } catch { /* zone temporaire */ } }

    // (17g) PARITÉ de la famille avec l'oracle du pilot : la copie ne dérive pas en silence
    const oraclePilot = path.join(RACINE_PARC, 'digit-ai-factory', 'oracles', 'oracle-secrets-hors-perimetre.mjs');
    if (!fs.existsSync(oraclePilot)) {
      oks.push('cas 17g — NON JOUÉ : l\'oracle du pilot est absent de cette machine (' + oraclePilot + ') ; la parité de la famille n\'est pas mesurée ici — dit, jamais tu');
    } else {
      const noms = ['.env', '.ENV', '.env.local', '.env.production', '.env.example', '.env.exemple', '.env.sample', '.env.template', '.env.dist',
        'cle.pem', 'id.key', 'a.p12', 'a.pfx', 'a.jks', 'cle.pem.example', 'credentials', 'credentials.json', 'secret', 'secrets', 'secrets.yaml',
        'secret-x', 'secrets_y', '.npmrc', '.databrickscfg', 'README.md', 'package.json', 'tokens.css', 'environnement.md', 'mykey.txt', 'monsecret.txt'];
      const sonde = spawnSync(process.execPath, ['--input-type=module', '-e',
        'const [a, b] = await Promise.all([import(' + JSON.stringify(pathToFileURL(oraclePilot).href) + '), import(' + JSON.stringify(pathToFileURL(PORTE_SECRETS_SOURCE).href) + ')]);'
        + 'const n = ' + JSON.stringify(noms) + '; process.stdout.write(JSON.stringify(n.filter((x) => a.PORTEUR_DE_SECRETS(x) !== b.PORTEUR_DE_SECRETS(x))));'],
      { encoding: 'utf8', env: envBanc({}) });
      const ecarts = (() => { try { return JSON.parse(sonde.stdout); } catch { return null; } })();
      if (Array.isArray(ecarts) && !ecarts.length) oks.push('cas 17g (TF-1221) — la famille copiée et celle du pilot rendent le même jugement sur ' + noms.length + ' noms : la copie n\'a pas dérivé');
      else kos.push('cas 17g (TF-1221) — la famille copiée a dérivé de celle du pilot : ' + (ecarts ? ecarts.join(', ') : (sonde.stderr || sonde.stdout || '').trim().slice(0, 300)));
    }
  }

  // --- cas 10 : LE FRONTMATTER DES SKILLS TOUCHÉS, AVANT LE COMMIT (TF-1337) -----------
  // LE FAIT : `accueil-factory` est entré au dépôt le 22/09 avec une description de plus de 1 024
  // caractères — la recette de quality-oracles l'aurait refusé, rien ne la jouait avant
  // l'enregistrement. Le contrôle rapide juge les SEULS skills de l'index, lus DANS l'index ; son
  // hameçon ne se pose que sur demande. Les deux sens au commit, puis le contrôle appelé à la main
  // avec `--tous` — la forme que le pilot joue avant de propager —, dans les deux sens aussi.
  poserControleSource(racine);
  const skillMd = (description) => `---\nname: jouet\ndescription: ${description}\n---\n\n# Jouet\n`;
  const TROP_LONGUE = 'Skill de jeu d essai. ' + 'declencheur '.repeat(90).trim();
  const ecrireSkill = (d, nom, description) => {
    fs.mkdirSync(path.join(d, '.claude', 'skills', nom), { recursive: true });
    fs.writeFileSync(path.join(d, '.claude', 'skills', nom, 'SKILL.md'), skillMd(description).replace('name: jouet', 'name: ' + nom));
  };
  const nbCommits = (d) => Number((git(d, 'rev-list', '--count', 'HEAD').stdout || '0').trim());

  // (10a) le jeu par défaut ne le pose pas, et il ne s'impose pas à un pre-commit déjà là
  const d10a = depot(racine, 'skills-defaut', false);
  sh(racine, 'node', [INSTALLEUR, d10a]);
  const hook10a = path.join(d10a, '.git', 'hooks', 'pre-commit');
  const avant10a = fs.existsSync(hook10a) ? fs.readFileSync(hook10a, 'utf8') : '';
  const p10a = sh(racine, 'node', [INSTALLEUR, d10a, '--seul=pre-commit-skills']);
  if (!avant10a.includes('pre-commit-skills') && avant10a.includes('pre-commit-anonymiser')
      && /CONFLIT/.test(p10a.stdout || '') && fs.readFileSync(hook10a, 'utf8') === avant10a)
    oks.push('cas 10a — sans le drapeau, l\'installeur ne pose PAS le pre-commit des skills ; demandé sur un dépôt qui porte déjà le pre-commit du parc, il dit CONFLIT et ne touche à rien');
  else kos.push('cas 10a — pose par défaut ou conflit mal tenu : ' + (p10a.stdout || '').trim().slice(0, 200));

  // (10b) posé sur demande : première commande trap '' PIPE, comme ses trois frères
  const d10 = depot(racine, 'skills', false);
  const p10 = sh(racine, 'node', [INSTALLEUR, d10, '--seul=pre-commit-skills']);
  const hook10 = path.join(d10, '.git', 'hooks', 'pre-commit');
  const txt10 = fs.existsSync(hook10) ? fs.readFileSync(hook10, 'utf8') : '';
  if (/POSE/.test(p10.stdout || '') && txt10.includes('# hamecon-parc: pre-commit-skills v1') && premiereCommande(hook10) === "trap '' PIPE")
    oks.push('cas 10b — `--seul=pre-commit-skills` pose le hameçon, signé, trap \'\' PIPE en première commande');
  else kos.push('cas 10b — hameçon des skills non posé ou mal formé : ' + (p10.stdout || '').trim().slice(0, 200));

  // (10c) sens ROUGE : une description de plus de 1 024 caractères est REFUSÉE, rien n'est enregistré
  ecrireSkill(d10, 'jouet', TROP_LONGUE);
  git(d10, 'add', '-A');
  const n10 = nbCommits(d10);
  const c10r = sh(d10, 'git', ['commit', '-q', '-m', 'skill jouet'], ENV_JEU_ESSAI);
  const e10r = c10r.stderr || '';
  if (c10r.status !== 0 && /FRONTMATTER REFUS/.test(e10r) && /jouet/.test(e10r) && new RegExp(TROP_LONGUE.length + ' > 1024').test(e10r) && nbCommits(d10) === n10)
    oks.push(`cas 10c (sens rouge) — description de ${TROP_LONGUE.length} caractères : commit REFUSÉ, le skill et la longueur sont nommés, rien n'est enregistré`);
  else kos.push('cas 10c — la description trop longue passe au commit (exit ' + c10r.status + ') : ' + e10r.trim().slice(0, 300));

  // (10d) sens VERT : la MÊME entrée, description ramenée sous la limite, passe
  ecrireSkill(d10, 'jouet', 'Skill de jeu d essai, description courte.');
  git(d10, 'add', '-A');
  const c10v = sh(d10, 'git', ['commit', '-q', '-m', 'skill jouet'], ENV_JEU_ESSAI);
  if (c10v.status === 0 && nbCommits(d10) === n10 + 1) oks.push('cas 10d (sens vert) — la même entrée sous la limite est ENREGISTRÉE');
  else kos.push('cas 10d — un frontmatter recevable est refusé (exit ' + c10v.status + ') : ' + (c10v.stderr || '').trim().slice(0, 300));

  // (10e) un commit qui ne touche aucun skill passe sans rien juger
  fs.writeFileSync(path.join(d10, 'notes.md'), 'rien a voir avec les skills\n');
  git(d10, 'add', '-A');
  const c10e = sh(d10, 'git', ['commit', '-q', '-m', 'notes'], ENV_JEU_ESSAI);
  if (c10e.status === 0) oks.push('cas 10e — un commit qui ne touche aucun skill passe');
  else kos.push('cas 10e — un commit sans skill est refusé : ' + (c10e.stderr || '').trim().slice(0, 300));

  // (10f) le contrôle appelé à la main, `--tous` : ce que le pilot joue avant de propager, quand
  // rien n'est indexé. Vert sur l'histoire saine ; rouge dès qu'un skill trop long a été ENREGISTRÉ
  // (ici en contournant le hameçon, exactement le cas du 22/09).
  const tousVert = sh(racine, 'node', [CONTROLE_SOURCE, d10, '--tous']);
  ecrireSkill(d10, 'autre', TROP_LONGUE);
  git(d10, 'add', '-A');
  sh(d10, 'git', ['commit', '-q', '--no-verify', '-m', 'skill autre, hameçon contourné'], ENV_JEU_ESSAI);
  const tousRouge = sh(racine, 'node', [CONTROLE_SOURCE, d10, '--tous']);
  if (tousVert.status === 0 && tousRouge.status === 1 && /autre/.test(tousRouge.stderr || '') && !/jouet\/SKILL/.test(tousRouge.stderr || ''))
    oks.push('cas 10f — `--tous` rend 0 sur des skills recevables, et 1 en nommant le seul skill enregistré trop long (le hameçon contourné ne cache rien au contrôle de propagation)');
  else kos.push(`cas 10f — --tous : vert exit ${tousVert.status}, rouge exit ${tousRouge.status} : ` + (tousRouge.stderr || tousRouge.stdout || '').trim().slice(0, 300));

  // (10g) ce qui se pose se dépose
  const r10 = sh(racine, 'node', [INSTALLEUR, d10, '--seul=pre-commit-skills', '--retirer']);
  if (/RETIRE/.test(r10.stdout || '') && !fs.existsSync(hook10)) oks.push('cas 10g — le pre-commit des skills se retire');
  else kos.push('cas 10g — retrait impossible : ' + (r10.stdout || '').trim().slice(0, 200));

  // --- cas 11 : L'ENVOI DU CANAL CONFIDENTIEL SE JUGE PAR SON PROPRE CONTRÔLE (D-30 a, 27/09) ---
  // LE FAIT : la porte des noms ne peut pas juger le canal — ses tables SONT les noms, 144 bloquants
  // par construction —, et son contrôle (`oracle-confidentiel.mjs`, à la racine du canal) n'était
  // joué qu'à l'ouverture d'une session. Un envoi vers un canal devenu public serait parti. Le
  // hameçon joue ce contrôle avant l'envoi. Ce banc prouve le CÂBLAGE, pas le contrôle : celui-ci
  // vit dans le canal, dépôt privé, et sa recette y vit avec lui. Le contrôle est donc remplacé ici
  // par un jouet qui rend le verdict voulu — PASS, FAIL, ou un code 0 SANS verdict, le vert fabriqué
  // de TF-1373 —, et chaque sens se juge sur la seule preuve qui compte : la branche au distant.
  const CONTROLE_PASS = 'console.log(JSON.stringify({ oracle: "oracle-confidentiel", verdict: "PASS", constats: '
    + '[{ regle: "K1", statut: "PASS", message: "le depot distant est prive" }] }, null, 1));\n';
  const CONTROLE_FAIL = 'console.log(JSON.stringify({ oracle: "oracle-confidentiel", verdict: "FAIL", constats: '
    + '[{ regle: "K1", statut: "FAIL", message: "LE DEPOT DISTANT EST PUBLIC" }, { regle: "K3", statut: "PASS", message: "aucun secret" }] }, null, 1));\n'
    + 'process.exit(1);\n';
  const CONTROLE_MUET = 'process.exit(0);\n';
  const depotCanal = (nom, controle) => {
    const d = depot(racine, nom, false);
    if (controle !== null) {
      fs.writeFileSync(path.join(d, 'oracle-confidentiel.mjs'), controle);
      git(d, 'add', '-A');
      git(d, 'commit', '-q', '-m', 'Controle du canal (jeu d essai)');
    }
    const distant = distantJetable(racine, nom + '-distant');
    git(d, 'remote', 'add', 'origin', distant);
    return { d, distant };
  };
  const auDistant = (distant) => spawnSync('git', ['--git-dir=' + distant, 'rev-parse', '--verify', '-q', 'refs/heads/main'], { encoding: 'utf8' }).status === 0;
  const poserCanal = (d) => sh(racine, 'node', [INSTALLEUR, d, '--seul=pre-push-canal']);

  // (11a) le jeu par défaut ne le pose pas, et il ne s'impose pas au pre-push du parc déjà posé
  const d11a = depot(racine, 'canal-conflit', false);
  sh(racine, 'node', [INSTALLEUR, d11a]);
  const hook11a = path.join(d11a, '.git', 'hooks', 'pre-push');
  const avant11a = fs.existsSync(hook11a) ? fs.readFileSync(hook11a, 'utf8') : '';
  const p11a = poserCanal(d11a);
  if (avant11a.includes('# hamecon-parc: pre-push-nom-client v1') && !avant11a.includes('# hamecon-parc: pre-push-canal v1')
      && /CONFLIT/.test(p11a.stdout || '') && fs.readFileSync(hook11a, 'utf8') === avant11a)
    oks.push('cas 11a — le jeu par défaut ne pose PAS le pre-push du canal ; demandé sur un dépôt qui porte le pre-push du parc, il dit CONFLIT et ne touche à rien');
  else kos.push('cas 11a — pose par défaut ou conflit mal tenu : ' + (p11a.stdout || '').trim().slice(0, 200));

  // (11b) la pose : signé, trap '' PIPE en première commande, reconnu par --verifier
  const c11 = depotCanal('canal', CONTROLE_PASS);
  const p11 = poserCanal(c11.d);
  const hook11 = path.join(c11.d, '.git', 'hooks', 'pre-push');
  const v11 = sh(racine, 'node', [INSTALLEUR, c11.d, '--seul=pre-push-canal', '--verifier']);
  if (/POSE/.test(p11.stdout || '') && fs.existsSync(hook11) && fs.readFileSync(hook11, 'utf8').includes('# hamecon-parc: pre-push-canal v1')
      && premiereCommande(hook11) === "trap '' PIPE" && v11.status === 0 && /POSE/.test(v11.stdout || ''))
    oks.push('cas 11b — `--seul=pre-push-canal` pose le hameçon, signé, trap \'\' PIPE en première commande, et `--verifier` le reconnaît');
  else kos.push('cas 11b — hameçon du canal non posé, mal formé ou non reconnu : ' + ((p11.stdout || '') + (v11.stdout || '')).trim().slice(0, 300));

  // (11c) sens VERT : le contrôle rend PASS, l'envoi part
  const p11c = sh(c11.d, 'git', ['push', 'origin', 'main']);
  if (p11c.status === 0 && auDistant(c11.distant)) oks.push('cas 11c (sens vert) — contrôle du canal PASS : envoi ACCEPTÉ, la branche est au distant');
  else kos.push('cas 11c — un canal dont le contrôle rend PASS voit son envoi refusé (exit ' + p11c.status + ') : ' + (p11c.stderr || '').trim().slice(0, 300));

  // (11d) sens ROUGE : le contrôle rend FAIL (canal devenu public), l'envoi est refusé et dit pourquoi
  const c11d = depotCanal('canal-public', CONTROLE_FAIL);
  poserCanal(c11d.d);
  const p11d = sh(c11d.d, 'git', ['push', 'origin', 'main']);
  const e11d = p11d.stderr || '';
  if (p11d.status !== 0 && !auDistant(c11d.distant) && /ENVOI DU CANAL REFUSE/.test(e11d) && /verdict FAIL/.test(e11d)
      && /K1\s+LE DEPOT DISTANT EST PUBLIC/.test(e11d) && !/K3/.test(e11d))
    oks.push('cas 11d (sens rouge) — contrôle du canal FAIL (dépôt devenu public) : envoi REFUSÉ, rien au distant, et la seule règle en échec est imprimée');
  else kos.push('cas 11d — un canal dont le contrôle rend FAIL n\'est pas refusé comme il faut (exit ' + p11d.status + ', au distant : ' + auDistant(c11d.distant) + ') : ' + e11d.trim().slice(0, 300));

  // (11e) un code 0 SANS verdict n'est pas un vert (TF-1373)
  const c11e = depotCanal('canal-muet', CONTROLE_MUET);
  poserCanal(c11e.d);
  const p11e = sh(c11e.d, 'git', ['push', 'origin', 'main']);
  if (p11e.status !== 0 && !auDistant(c11e.distant) && /verdict ILLISIBLE/.test(p11e.stderr || ''))
    oks.push('cas 11e — un contrôle qui sort en 0 SANS verdict : envoi REFUSÉ (ILLISIBLE), le code de sortie seul ne fabrique pas de vert');
  else kos.push('cas 11e — un contrôle muet laisse partir l\'envoi (exit ' + p11e.status + ') : ' + (p11e.stderr || '').trim().slice(0, 300));

  // (11f) un dépôt sans contrôle n'est pas le canal : refusé, et le refus le dit
  const c11f = depotCanal('canal-sans-controle', null);
  poserCanal(c11f.d);
  const p11f = sh(c11f.d, 'git', ['push', 'origin', 'main']);
  if (p11f.status !== 0 && !auDistant(c11f.distant) && /introuvable/.test(p11f.stderr || ''))
    oks.push('cas 11f — contrôle du canal INTROUVABLE : envoi REFUSÉ, le refus nomme le fichier cherché');
  else kos.push('cas 11f — sans contrôle, l\'envoi part ou le refus est muet (exit ' + p11f.status + ') : ' + (p11f.stderr || '').trim().slice(0, 300));

  // (11g) la sortie part dans un filtre qui a déjà fini (TF-1360), dans les deux sens
  if (!shBanc) kos.push('cas 11g — aucun `sh` trouvé à côté de git : le tuyau rompu n\'est pas rejoué pour le hameçon du canal');
  else {
    const c11gr = depotCanal('canal-filtre-rouge', CONTROLE_FAIL);
    poserCanal(c11gr.d);
    // Le hameçon absent se DIT : un banc qui plante sur un fichier manquant ne rend aucun verdict.
    const hookRouge11 = path.join(c11gr.d, '.git', 'hooks', 'pre-push');
    const retiree11 = fs.existsSync(hookRouge11) && sansLigneTrap(hookRouge11);
    jouerDansFiltreFini(shBanc, c11gr.d, 'git push origin main', {});
    const publieRouge11 = auDistant(c11gr.distant);
    if (!retiree11) kos.push('cas 11g (sens rouge) — le hameçon du canal n\'est pas posé, ou ne porte pas la ligne trap \'\' PIPE : rien à retirer');
    else if (publieRouge11) oks.push('cas 11g (sens rouge) — SANS la ligne trap \'\' PIPE, sortie dans un filtre fini : PUBLIÉ malgré le refus du contrôle');
    else if (rougeAttendu) kos.push('cas 11g (sens rouge) — le témoin ne reproduit rien : sans la ligne, rien n\'est publié');
    else oks.push('cas 11g (sens rouge) — NON REPRODUIT sur ' + process.platform + ' : mesuré seulement sous Windows — dit, jamais tu');
    const c11gv = depotCanal('canal-filtre-vert', CONTROLE_FAIL);
    poserCanal(c11gv.d);
    jouerDansFiltreFini(shBanc, c11gv.d, 'git push origin main', {});
    if (!auDistant(c11gv.distant)) oks.push('cas 11g (sens vert) — le hameçon du canal tel que posé, sortie dans le MÊME filtre fini : envoi REFUSÉ, rien au distant');
    else kos.push('cas 11g (sens vert) — le hameçon du canal laisse PUBLIER quand la sortie part dans un filtre fini');
  }

  // (11h) le contournement explicite reste possible
  const p11h = sh(c11d.d, 'git', ['push', '--no-verify', 'origin', 'main']);
  if (p11h.status === 0 && auDistant(c11d.distant)) oks.push('cas 11h — contournement --no-verify : envoi ACCEPTÉ, le garde-fou reste levable en connaissance de cause');
  else kos.push('cas 11h — --no-verify ne passe pas sur le canal (exit ' + p11h.status + ')');

  // (11i) ce qui se pose se dépose
  const r11 = sh(racine, 'node', [INSTALLEUR, c11.d, '--seul=pre-push-canal', '--retirer']);
  if (/RETIRE/.test(r11.stdout || '') && !fs.existsSync(hook11)) oks.push('cas 11i — le pre-push du canal se retire');
  else kos.push('cas 11i — retrait impossible : ' + (r11.stdout || '').trim().slice(0, 200));

  // --- cas 6 : LE HAMEÇON DE COMMIT (TF-0980) --------------------------------
  //
  // POURQUOI CES CAS EXISTENT. Le `pre-push` arrive après : quand il parle, le nom est déjà dans
  // un objet git, et le corriger demande de modifier un commit existant. Le `pre-commit`, lui,
  // CORRIGE l'index avant que le commit n'existe. Un hameçon qui corrige se prouve autrement
  // qu'un hameçon qui refuse : il ne suffit pas de constater que le commit passe — il faut LIRE
  // CE QUI A ÉTÉ COMMITÉ. Un hook posé, exécuté, et qui n'écrit rien laisse exactement la même
  // trace qu'un hook qui travaille.
  //
  // LA CHAÎNE D'ANONYMISATION DE CES CAS EST JETABLE, ET C'EST UN CHOIX DÉCLARÉ. Les règles de
  // substitution réelles (graphies, variantes, casse, garde des identifiants de code) vivent chez
  // le pilot et y sont éprouvées par ses propres bancs. Ce qui se prouve ICI est le CÂBLAGE, qui
  // est le travail de ce dépôt : le hook s'exécute, il trouve son lanceur, le lanceur travaille
  // sur LE DÉPÔT QUI COMMITE, il ré-indexe, il journalise, et il refuse dans les deux cas prévus.
  // Une chaîne jetable rend ces sept sens déterministes ; la chaîne RÉELLE est éprouvée à part,
  // au cas 7, sur son seul contrat d'appel.
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hamecon-commit-'));
  try {
    poserLanceurSource(cc);
    // TF-1071 : l'installeur pose désormais AUSSI le commit-msg, qui juge le message par la porte.
    // Un poste réel porte les deux ; la racine jetable les porte donc aussi — l'oracle en SOURCE au
    // repli du hameçon et un référentiel jetable voisin des dépôts (nom inventé). Sans eux, le cas 6
    // éprouverait un poste amputé : le commit tomberait sur « oracle introuvable » avant même que le
    // pre-commit ait corrigé quoi que ce soit. Les messages des cas 6 ne portent aucun nom.
    poserOracleSource(cc);
    fs.writeFileSync(path.join(cc, '_noms-interdits.json'),
      JSON.stringify({ noms: ['Zorglub'], identifiants: [], sigles: [] }), 'utf8');
    // La chaîne jetable : le MÊME contrat que celle du pilot — `passer({ fichiers, racine,
    // ecrire })` rendant `{ corriges, nomsPorteurs }` — et rien de plus. Elle lève quand on le lui
    // demande, ce qui est le seul moyen d'éprouver la branche « tables illisibles ».
    const chaine = path.join(cc, 'chaine-jetable.mjs');
    fs.writeFileSync(chaine, [
      "import { readFileSync, writeFileSync, existsSync } from 'node:fs';",
      "import { join } from 'node:path';",
      "import { execFileSync } from 'node:child_process';",
      "const NOM = 'Zorglub', PSEUDO = 'Client-A';",
      'export function passer({ fichiers, racine, ecrire = true } = {}) {',
      "  if (process.env.BANC_TABLES_ILLISIBLES) throw new Error('référentiel des clients introuvable (table jetable du banc)');",
      '  const corriges = [], nomsPorteurs = [];',
      '  for (const f of fichiers) {',
      '    const abs = join(racine, f);',
      '    if (!existsSync(abs)) continue;',
      '    if (f.includes(NOM)) nomsPorteurs.push({ fichier: f, propose: f.split(NOM).join(PSEUDO) });',
      "    const brut = readFileSync(abs, 'utf8');",
      '    if (!brut.includes(NOM)) continue;',
      '    if (ecrire) {',
      "      writeFileSync(abs, brut.split(NOM).join(PSEUDO), 'utf8');",
      "      execFileSync('git', ['add', '--', f], { cwd: racine });",
      '    }',
      '    corriges.push({ fichier: f, termes: 1 });',
      '  }',
      '  return { corriges, nomsPorteurs };',
      '}',
    ].join('\n'), 'utf8');

    const ENV_COMMIT = { HOME: cc, USERPROFILE: cc, FORGE_ROOT: cc, FORGE_ANONYMISEUR: chaine };
    /** Un dépôt jetable vide, prêt à recevoir un premier commit sous hameçon. */
    const nu = (nom) => {
      const d = path.join(cc, nom);
      fs.mkdirSync(d, { recursive: true });
      git(d, 'init', '-q', '-b', 'main', '.');
      git(d, 'config', 'user.email', 'o@o');
      git(d, 'config', 'user.name', 'o');
      return d;
    };
    const lireCommite = (d, f) => (sh(d, 'git', ['show', 'HEAD:' + f], ENV_COMMIT).stdout || '');

    // --- (6a) LE SENS ROUGE, D'ABORD : le MÊME dépôt SANS hameçon --------------------------
    // Sans lui, « le commit porte le pseudonyme » ne prouverait rien : peut-être que rien n'a
    // jamais porté le nom. Ce cas montre le défaut vivant, et c'est ce défaut que le suivant tue.
    const sansHook = nu('sans-hamecon');
    fs.writeFileSync(path.join(sansHook, 'note.md'), 'Compte rendu remis a Zorglub ce matin.\n');
    git(sansHook, 'add', '-A');
    const c6r = sh(sansHook, 'git', ['commit', '-q', '-m', 'note du banc'], ENV_COMMIT);
    if (c6r.status === 0 && /Zorglub/.test(lireCommite(sansHook, 'note.md')))
      oks.push('cas 6a (sens rouge) — SANS hameçon de commit, le nom entre dans un objet git : c\'est le défaut, et c\'est ce que le pre-push ne peut plus que constater');
    else kos.push('cas 6a — le témoin du défaut ne reproduit rien (exit ' + c6r.status + ') : le cas 6b ne prouvera donc pas grand-chose');

    // --- (6b) LE SENS VERT : le même dépôt AVEC hameçon ------------------------------------
    const avecHook = nu('avec-hamecon');
    const pose6 = sh(cc, 'node', [INSTALLEUR, avecHook]);
    (pose6.stdout || '').includes('pre-commit') ? oks.push('cas 6b — l\'installeur pose AUSSI le pre-commit, pas seulement le pre-push')
      : kos.push('cas 6b — l\'installeur ne pose pas de pre-commit : ' + (pose6.stdout || pose6.stderr || '').trim().slice(0, 200));
    fs.writeFileSync(path.join(avecHook, 'note.md'), 'Compte rendu remis a Zorglub ce matin.\n');
    git(avecHook, 'add', '-A');
    const c6v = sh(avecHook, 'git', ['commit', '-q', '-m', 'note du banc'], ENV_COMMIT);
    const commite = lireCommite(avecHook, 'note.md');
    if (c6v.status !== 0) kos.push('cas 6b — le commit est REFUSÉ alors que le hameçon devait CORRIGER (exit ' + c6v.status + ') : ' + (c6v.stderr || '').trim().slice(0, 300));
    else if (/Zorglub/.test(commite)) kos.push('cas 6b — le commit passe mais le nom est TOUJOURS dans l\'objet git : le hook s\'exécute sans rien corriger, ou ne s\'exécute pas. Commité : ' + commite.trim().slice(0, 120));
    else if (!/Client-A/.test(commite)) kos.push('cas 6b — le nom a disparu du commit sans que le pseudonyme y soit : le contenu a été perdu, pas pseudonymisé. Commité : ' + commite.trim().slice(0, 120));
    else oks.push('cas 6b — dépôt PORTEUR : le commit PASSE et l\'objet git porte le PSEUDONYME, pas le nom — le hameçon corrige au lieu de refuser');
    // TF-2321 (10/11/2026) — LE FICHIER DE TRAVAIL N'EST PAS RÉÉCRIT. Jusqu'au 10/11 ce cas exigeait
    // l'inverse (« le fichier de travail suit l'index »), et c'est ce geste qui, chez un produit le
    // 02/10/2026, a réécrit 40 fichiers du disque, dont un entrant de input/ sans original dans git. La
    // décision du 10/11/2026 (R-58) le retourne : une anonymisation s'applique à la copie publiée. Le
    // commit porte le pseudonyme, le disque garde son texte, et le prochain `git add` repasse par le
    // hameçon. Assertion RETOURNÉE par décision, pas assouplie : le défaut qu'elle protégeait (un nom
    // qui revient au commit suivant) reste tenu, par le hameçon qui rejoue à chaque commit.
    if (c6v.status === 0 && /Zorglub/.test(fs.readFileSync(path.join(avecHook, 'note.md'), 'utf8')))
      oks.push('cas 6b (TF-2321) — le fichier de TRAVAIL garde son texte : seule la copie indexée, celle qui part dans le commit, est pseudonymisée');
    else if (c6v.status === 0) kos.push('cas 6b (TF-2321) — le hameçon a RÉÉCRIT le fichier de travail : il ne devait toucher que la copie indexée');
    // La correction est TRACÉE : une réécriture silencieuse est indiscernable d'une corruption. Depuis
    // TF-2321 le journal vit dans le répertoire git commun du dépôt qui commite, hors de son arbre.
    const journal = path.join(avecHook, '.git', 'anonymisation-au-commit.jsonl');
    if (fs.existsSync(journal) && /note\.md/.test(fs.readFileSync(journal, 'utf8')))
      oks.push('cas 6b — la substitution est JOURNALISÉE dans le dépôt qui commite (.git/anonymisation-au-commit.jsonl), hors de son arbre de travail');
    else kos.push('cas 6b — aucun journal de substitution dans .git/ : une correction silencieuse et non tracée est indiscernable d\'une corruption');
    if (fs.existsSync(path.join(avecHook, '.claude', 'anonymisation-au-commit.jsonl')))
      kos.push('cas 6b (TF-2321) — le journal est encore écrit dans l\'arbre de travail (.claude/) : le hameçon y écrit un fichier');

    // --- (6b quater) TF-2321 : un fichier indexé EN PARTIE ---------------------------------
    // La chaîne lisait le disque : les lignes NON indexées entraient dans le commit avec le nom réécrit.
    // Depuis TF-2321 la copie indexée est lue : le commit porte la seule partie indexée, pseudonymisée,
    // et le disque garde ses deux lignes, nom compris.
    const partiel = nu('indexe-en-partie');
    sh(cc, 'node', [INSTALLEUR, partiel]);
    fs.writeFileSync(path.join(partiel, 'note.md'), 'Ligne indexée, remise a Zorglub.\n');
    git(partiel, 'add', '-A');
    fs.appendFileSync(path.join(partiel, 'note.md'), 'Ligne non indexée, brouillon en cours.\n');
    const c6q = sh(partiel, 'git', ['commit', '-q', '-m', 'note du banc'], ENV_COMMIT);
    const commitePartiel = lireCommite(partiel, 'note.md');
    const disquePartiel = fs.readFileSync(path.join(partiel, 'note.md'), 'utf8');
    if (c6q.status === 0 && /Client-A/.test(commitePartiel) && !/non indexée/.test(commitePartiel) && /Zorglub/.test(disquePartiel) && /non indexée/.test(disquePartiel))
      oks.push('cas 6b quater (TF-2321) — fichier indexé en partie : le commit porte la seule partie indexée, pseudonymisée ; le disque garde ses deux lignes');
    else kos.push('cas 6b quater (TF-2321) — fichier indexé en partie (exit ' + c6q.status + ') : commité « ' + commitePartiel.trim().slice(0, 120) + ' », disque « ' + disquePartiel.trim().slice(0, 120) + ' »');

    // --- (6b quinquies) TF-2321 : un entrant de input/ n'est JAMAIS réécrit --------------------
    const entrant = nu('entrant-input');
    sh(cc, 'node', [INSTALLEUR, entrant]);
    fs.mkdirSync(path.join(entrant, 'input'), { recursive: true });
    fs.writeFileSync(path.join(entrant, 'input', 'cahier.md'), 'Cahier remis par Zorglub, version du client.\n');
    fs.writeFileSync(path.join(entrant, 'note.md'), 'Note de travail remise a Zorglub.\n');
    git(entrant, 'add', '-A');
    const c6qq = sh(entrant, 'git', ['commit', '-q', '-m', 'entrant du banc'], ENV_COMMIT);
    const commiteEntrant = lireCommite(entrant, 'input/cahier.md');
    if (c6qq.status === 0 && /Zorglub/.test(commiteEntrant) && /Zorglub/.test(fs.readFileSync(path.join(entrant, 'input', 'cahier.md'), 'utf8'))
        && /Client-A/.test(lireCommite(entrant, 'note.md')) && /hors de portée/.test(c6qq.stderr || ''))
      oks.push('cas 6b quinquies (TF-2321) — un entrant de input/ n\'est réécrit ni sur le disque ni à l\'index, et la sortie le dit ; la note voisine est pseudonymisée');
    else kos.push('cas 6b quinquies (TF-2321) — entrant de input/ (exit ' + c6qq.status + ') : commité « ' + commiteEntrant.trim().slice(0, 100) + ' », sortie « ' + (c6qq.stderr || '').trim().slice(0, 160) + ' »');

    // --- (6b sexies) TF-2322 : la SOURCE d'un contrôle de fidélité, déclarée hors de portée -----
    // Le 02/10/2026, la source d'un contrôle de fidélité a été réécrite comme le livrable, et le
    // contrôle est resté vert sur un deck faux. Un produit la déclare `-anonymiser` dans .gitattributes.
    const fidelite = nu('source-de-fidelite');
    sh(cc, 'node', [INSTALLEUR, fidelite]);
    fs.writeFileSync(path.join(fidelite, '.gitattributes'), 'sources/** -anonymiser\n');
    fs.mkdirSync(path.join(fidelite, 'sources'), { recursive: true });
    fs.writeFileSync(path.join(fidelite, 'sources', 'faits.json'), '{ "fait": "visite remise a Zorglub" }\n');
    fs.writeFileSync(path.join(fidelite, 'deck.md'), 'Deck remis a Zorglub.\n');
    git(fidelite, 'add', '-A');
    const c6qs = sh(fidelite, 'git', ['commit', '-q', '-m', 'source du banc'], ENV_COMMIT);
    if (c6qs.status === 0 && /Zorglub/.test(lireCommite(fidelite, 'sources/faits.json')) && /Client-A/.test(lireCommite(fidelite, 'deck.md'))
        && /hors de portée/.test(c6qs.stderr || ''))
      oks.push('cas 6b sexies (TF-2322) — une source déclarée « -anonymiser » reste hors de portée du hameçon ; le livrable voisin est pseudonymisé');
    else kos.push('cas 6b sexies (TF-2322) — source déclarée hors de portée (exit ' + c6qs.status + ') : commitée « ' + lireCommite(fidelite, 'sources/faits.json').trim().slice(0, 100) + ' »');

    // --- (6b ter) TF-1633 : un NOM DE FICHIER ACCENTUÉ est lu, pas cité --------------------
    // Sans -z, git rend « "synth\303\250se.md" » : le chemin cité est introuvable, le contenu
    // n'est jamais relu et le nom entre dans l'objet git. Le sens rouge est le code d'avant.
    const accent = nu('nom-accentue');
    sh(cc, 'node', [INSTALLEUR, accent]);
    fs.writeFileSync(path.join(accent, 'synthèse.md'), 'Synthèse remise a Zorglub ce matin.\n');
    git(accent, 'add', '-A');
    const c6t = sh(accent, 'git', ['commit', '-q', '-m', 'synthese du banc'], ENV_COMMIT);
    const commiteAccent = lireCommite(accent, 'synthèse.md');
    if (c6t.status === 0 && /Client-A/.test(commiteAccent) && !/Zorglub/.test(commiteAccent))
      oks.push('cas 6b ter — NOM DE FICHIER ACCENTUÉ : l\'index est lu en -z, le contenu est pseudonymisé (TF-1633)');
    else kos.push('cas 6b ter — fichier « synthèse.md » : le nom réel entre dans le commit (exit ' + c6t.status + ') — lecture de l\'index sans -z, chemin cité en style C. Commité : ' + commiteAccent.trim().slice(0, 120));

    // --- (6c) LE DÉPÔT QUI COMMITE, ET LUI SEUL -------------------------------------------
    // C'EST LE CAS QUI JUSTIFIE CE FICHIER. Le script du pilot calcule sa racine depuis son
    // propre emplacement : posé ailleurs, il anonymiserait l'index DU PILOT pendant qu'on commite
    // dans un autre dépôt — travailler sur le mauvais dépôt tout en paraissant travailler.
    const voisin = nu('voisin');
    fs.writeFileSync(path.join(voisin, 'a-lui.md'), 'Note du voisin, remise a Zorglub.\n');
    git(voisin, 'add', '-A');
    const avantVoisin = fs.readFileSync(path.join(voisin, 'a-lui.md'), 'utf8');
    const encore = nu('encore-un');
    sh(cc, 'node', [INSTALLEUR, encore]);
    fs.writeFileSync(path.join(encore, 'note.md'), 'Autre note remise a Zorglub.\n');
    git(encore, 'add', '-A');
    sh(encore, 'git', ['commit', '-q', '-m', 'note du banc'], ENV_COMMIT);
    const apresVoisin = fs.readFileSync(path.join(voisin, 'a-lui.md'), 'utf8');
    if (apresVoisin !== avantVoisin) kos.push('cas 6c — commiter dans UN dépôt a modifié l\'index d\'un AUTRE : le lanceur travaille sur la mauvaise racine');
    else if (!/Client-A/.test(lireCommite(encore, 'note.md'))) kos.push('cas 6c — le dépôt qui commite n\'a PAS été corrigé : le lanceur ne travaille sur aucun des deux');
    else oks.push('cas 6c — le lanceur travaille sur LE DÉPÔT QUI COMMITE et sur lui seul : le voisin, indexé et porteur, est intact');

    // --- (6d) NOM DE FICHIER PORTEUR → REFUS, avec la commande exacte ---------------------
    const nomPorteur = nu('nom-porteur');
    sh(cc, 'node', [INSTALLEUR, nomPorteur]);
    fs.writeFileSync(path.join(nomPorteur, 'rapport-Zorglub.md'), 'Rien de particulier ici.\n');
    git(nomPorteur, 'add', '-A');
    const c6d = sh(nomPorteur, 'git', ['commit', '-q', '-m', 'rapport'], ENV_COMMIT);
    const e6d = c6d.stderr || '';
    if (c6d.status === 0) kos.push('cas 6d — un fichier dont le NOM porte un nom réel est commité sans un mot : le nom se lit dans l\'arborescence sans ouvrir un fichier');
    else if (!/COMMIT REFUSÉ/.test(e6d) || !/git mv/.test(e6d)) kos.push('cas 6d — refus SANS la commande exacte de renommage : un refus qu\'on ne sait pas lever se contourne. Rendu : ' + e6d.trim().slice(0, 300));
    else oks.push('cas 6d — NOM de fichier porteur : commit REFUSÉ (exit ' + c6d.status + ') et la commande `git mv` est donnée — le seul geste que le hameçon ne fait pas à votre place');

    // --- (6e) LE CONTOURNEMENT EXPLICITE RESTE POSSIBLE -----------------------------------
    const c6e = sh(nomPorteur, 'git', ['commit', '-q', '--no-verify', '-m', 'rapport'], ENV_COMMIT);
    if (c6e.status === 0) oks.push('cas 6e — contournement --no-verify : commit ACCEPTÉ, le garde-fou reste levable en connaissance de cause');
    else kos.push('cas 6e — --no-verify ne passe PAS : un garde-fou inlevable se fait arracher au lieu d\'être discuté');

    // --- (6f) TABLES ILLISIBLES → REFUS ---------------------------------------------------
    // Un anonymiseur qui ne peut pas anonymiser arrête le convoi : anonymiser à moitié serait
    // pire que ne pas anonymiser, parce que l'outil afficherait quand même « corrigé ».
    const c6f = sh(avecHook, 'git', ['commit', '-q', '--allow-empty', '-m', 'commit vide'],
      { ...ENV_COMMIT, BANC_TABLES_ILLISIBLES: '1' });
    const e6f = c6f.stderr || '';
    if (c6f.status !== 0 && /ne peut pas travailler|ne peut pas anonymiser/.test(e6f))
      oks.push('cas 6f — chaîne en échec (tables illisibles) : commit REFUSÉ et le motif est dit — anonymiser à moitié serait pire que ne pas anonymiser');
    else kos.push('cas 6f — une chaîne qui ne peut pas travailler laisse passer le commit (exit ' + c6f.status + ') : ' + e6f.trim().slice(0, 300));

    // --- (6g) LANCEUR INTROUVABLE → REFUS, pistes dites -----------------------------------
    // Un garde-fou absent ne se remplace pas par un passage en force silencieux ; et un refus
    // sans pistes ne se répare pas.
    const desert = fs.mkdtempSync(path.join(os.tmpdir(), 'hamecon-desert-'));
    try {
      const d6g = nu('sans-lanceur');
      sh(cc, 'node', [INSTALLEUR, d6g]);
      fs.writeFileSync(path.join(d6g, 'note.md'), 'Une note ordinaire.\n');
      git(d6g, 'add', '-A');
      const c6g = sh(d6g, 'git', ['commit', '-q', '-m', 'note'],
        { HOME: desert, USERPROFILE: desert, FORGE_ROOT: desert, FORGE_ANONYMISEUR: undefined });
      const e6g = c6g.stderr || '';
      if (c6g.status !== 0 && /introuvable/.test(e6g)) oks.push('cas 6g — lanceur INTROUVABLE : commit REFUSÉ, un garde-fou absent ne se remplace pas par un passage en force silencieux');
      else kos.push('cas 6g — lanceur introuvable et le commit passe (exit ' + c6g.status + ') : ' + e6g.trim().slice(0, 300));
    } finally { try { fs.rmSync(desert, { recursive: true, force: true }); } catch { /* zone temporaire */ } }

    // --- (6h) UN pre-commit ÉTRANGER N'EST PAS ÉCRASÉ -------------------------------------
    const etranger = nu('pre-commit-etranger');
    const cible = path.join(etranger, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(cible, '#!/bin/sh\n# le hook de quelqu un d autre\nexit 0\n', { mode: 0o755 });
    const p6h = sh(cc, 'node', [INSTALLEUR, etranger]);
    if (/CONFLIT/.test(p6h.stdout || '') && /quelqu un d autre/.test(fs.readFileSync(cible, 'utf8')))
      oks.push('cas 6h — un pre-commit ÉTRANGER est signalé en CONFLIT et laissé intact : écraser le travail de quelqu\'un d\'autre en silence se découvre trois semaines plus tard');
    else kos.push('cas 6h — un pre-commit étranger a été écrasé ou le conflit n\'est pas dit : ' + (p6h.stdout || '').trim().slice(0, 200));

    // --- (6h bis) TF-0994 : un ÉTRANGER QUI CITE LA MARQUE n'est pas le nôtre ---------------
    // La collision de noms qu'une lettre séparait : un hook étranger dont le contenu CONTIENT
    // `pre-commit-anonymiser`. Reconnu par sous-chaîne, il était écrasé en affichant REPOSE.
    const cite = nu('pre-commit-cite-la-marque');
    const cibleCite = path.join(cite, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(cibleCite, '#!/bin/sh\n# le hook de quelqu un d autre\nexec node tools/pre-commit-anonymiser.mjs\n', { mode: 0o755 });
    const p6hb = sh(cc, 'node', [INSTALLEUR, cite]);
    if (/CONFLIT/.test(p6hb.stdout || '') && /quelqu un d autre/.test(fs.readFileSync(cibleCite, 'utf8')))
      oks.push('cas 6h bis — un pre-commit étranger qui CITE la marque est en CONFLIT et laissé intact : la propriété tient à la signature, plus à une lettre');
    else kos.push('cas 6h bis — un étranger citant la marque a été écrasé ou le conflit n\'est pas dit : ' + (p6hb.stdout || '').trim().slice(0, 200));

    // --- (6h ter) la SIGNATURE seule vaut propriété : le hook signé est reposé -------------
    const signe = nu('pre-commit-signe');
    const cibleSigne = path.join(signe, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(cibleSigne, '#!/bin/sh\n# hamecon-parc: pre-commit-anonymiser v1\nexit 0\n', { mode: 0o755 });
    const p6ht = sh(cc, 'node', [INSTALLEUR, signe]);
    if (/REPOSE/.test(p6ht.stdout || '') && /exec node "\$LANCEUR"/.test(fs.readFileSync(cibleSigne, 'utf8')))
      oks.push('cas 6h ter — un pre-commit portant la ligne de signature est REPOSÉ à la version courante');
    else kos.push('cas 6h ter — le hook signé n\'a pas été reposé : ' + (p6ht.stdout || '').trim().slice(0, 200));

    // --- (6h quater) migration EXPLICITE : l'ancien hook (marque sans signature) → --migrer ----
    // TF-1402 (12/10/2026) : l'ancien hook migré est un ancien GABARIT du parc (le gabarit courant
    // privé de sa signature) — il n'a que des lignes du gabarit. Jusqu'au 12/10 ce cas migrait
    // l'étranger de 6h bis, qui porte une ligne de code à lui : c'est désormais le sens rouge
    // ci-dessous, parce que le migrer effaçait cette ligne, comme il aurait effacé R-38 au pilot.
    const ancienGabarit = nu('pre-commit-ancien-gabarit');
    const cibleAncien = path.join(ancienGabarit, '.git', 'hooks', 'pre-commit');
    sh(cc, 'node', [INSTALLEUR, ancienGabarit, '--seul=pre-commit']);
    fs.writeFileSync(cibleAncien, fs.readFileSync(cibleAncien, 'utf8').split('\n')
      .filter((l) => !l.startsWith('# hamecon-parc:')).join('\n'), { mode: 0o755 });
    const p6hq = sh(cc, 'node', [INSTALLEUR, ancienGabarit, '--migrer', '--seul=pre-commit']);
    const txtMigre = fs.readFileSync(cibleAncien, 'utf8');
    if (/MIGRE/.test(p6hq.stdout || '') && txtMigre.includes('# hamecon-parc: pre-commit-anonymiser v1'))
      oks.push('cas 6h quater — `--migrer` reprend un ancien gabarit à la marque sans signature et le signe : la passe de migration est un geste décidé');
    else kos.push('cas 6h quater — la migration explicite n\'a pas signé l\'ancien gabarit : ' + (p6hq.stdout || '').trim().slice(0, 200));
    const avantCite = fs.readFileSync(cibleCite, 'utf8');
    const p6hqr = sh(cc, 'node', [INSTALLEUR, cite, '--migrer', '--seul=pre-commit']);
    if (/CONFLIT/.test(p6hqr.stdout || '') && /PROLONGÉ/.test(p6hqr.stdout || '') && fs.readFileSync(cibleCite, 'utf8') === avantCite)
      oks.push('cas 6h quater (sens rouge, TF-1402) — `--migrer` REFUSE un hook non signé qui porte une ligne de code absente du gabarit : PROLONGÉ, rien touché');
    else kos.push('cas 6h quater (sens rouge, TF-1402) — un hook porteur de code propre a été migré, donc effacé : ' + (p6hqr.stdout || '').trim().slice(0, 200));

    // --- (6i) LE RETRAIT VAUT POUR LES DEUX HAMEÇONS --------------------------------------
    const ret6 = sh(cc, 'node', [INSTALLEUR, avecHook, '--retirer']);
    const resteCommit = fs.existsSync(path.join(avecHook, '.git', 'hooks', 'pre-commit'));
    const restePush = fs.existsSync(path.join(avecHook, '.git', 'hooks', 'pre-push'));
    if (!resteCommit && !restePush && /RETIRE/.test(ret6.stdout || '')) oks.push('cas 6i — le retrait emporte les DEUX hameçons : ce qui se pose se dépose');
    else kos.push('cas 6i — le retrait laisse un hameçon derrière lui (pre-commit : ' + resteCommit + ', pre-push : ' + restePush + ')');

    // --- cas 7 : LE RACCORD AVEC LA CHAÎNE RÉELLE DU PILOT --------------------------------
    // Les cas 6a-6i prouvent le câblage contre une chaîne jetable. Ils ne diraient RIEN du jour
    // où la chaîne réelle change de contrat d'appel — et c'est un contrat entre DEUX dépôts, donc
    // exactement le genre qui dérive sans que personne ne le voie. Ce cas-ci ne rejoue pas les
    // règles de substitution (elles sont éprouvées chez le pilot) : il vérifie que la chaîne
    // réelle est résolvable et qu'elle expose bien `passer`. Quand le pilot n'est pas sur la
    // machine, le cas le DIT au lieu de se taire : un banc muet se lit comme un banc vert.
    const pilotChaine = [
      path.join(RACINE_PARC, 'digit-ai-factory', 'todo', 'pre-commit-anonymise.mjs'),
    ].find((p) => fs.existsSync(p));
    if (!pilotChaine) {
      oks.push('cas 7 — NON JOUÉ : la chaîne d\'anonymisation du pilot est absente de cette machine (' + path.join(RACINE_PARC, 'digit-ai-factory', 'todo', 'pre-commit-anonymise.mjs') + '). Le raccord entre les deux dépôts n\'est donc pas mesuré ici — dit, jamais tu');
    } else {
      const sonde = spawnSync(process.execPath, ['--input-type=module', '-e',
        'const m = await import(process.argv[1]); process.stdout.write(typeof m.passer);'.replace('process.argv[1]', JSON.stringify(pathToFileURL(pilotChaine).href)),
      ], { encoding: 'utf8', env: envBanc({}) });
      if ((sonde.stdout || '').trim() === 'function') oks.push('cas 7 — la chaîne RÉELLE du pilot est résolvable et expose `passer` : le contrat d\'appel entre les deux dépôts tient');
      else kos.push('cas 7 — la chaîne réelle du pilot n\'expose pas `passer` (' + pilotChaine + ') : le contrat d\'appel entre les deux dépôts a dérivé. ' + ((sonde.stderr || '').trim().slice(0, 300) || (sonde.stdout || '').trim()));

      // --- (7 bis) TF-2322 : UN NOM DE PRODUIT HOMONYME D'UN LIEU PUBLIC, DE BOUT EN BOUT ------
      // Le 02/10/2026, le pseudonyme d'un produit a remplacé le nom d'un lieu public dans un
      // générateur, ses sources et sa table de faits : le deck régénéré portait le pseudonyme en
      // couverture. La table le règle depuis TF-2130 : une entrée `{ pseudo, formes }` ne fait
      // substituer que ses graphies déclarées. Ce cas le prouve à travers le lanceur et la chaîne
      // RÉELLE du pilot, sur des tables jetables aux noms inventés : clé nue, le lieu est falsifié
      // dans le commit (le défaut) ; formes déclarées, le lieu reste et seule la forme du produit
      // est pseudonymisée. Dans les deux sens, le disque garde son texte (TF-2321).
      const tablesH = path.join(cc, 'tables-homonyme');
      fs.mkdirSync(tablesH, { recursive: true });
      const tClients = path.join(tablesH, 'noms-interdits.json');
      fs.writeFileSync(tClients, JSON.stringify({ noms: ['Zorglub'], identifiants: [], sigles: [], pseudonymes: { Zorglub: 'Client-A' } }), 'utf8');
      const texteH = 'Visite du musée de Valbrise ; l\'outil ValbriseApp est prêt.\n';
      for (const [sens, entree] of [['clé nue', 'Produit-77'], ['formes déclarées', { pseudo: 'Produit-77', formes: ['ValbriseApp'] }]]) {
        const tProduits = path.join(tablesH, 'produits-' + (sens === 'clé nue' ? 'nue' : 'formes') + '.json');
        fs.writeFileSync(tProduits, JSON.stringify({ produits: { Valbrise: entree } }), 'utf8');
        const dH = nu('homonyme-' + (sens === 'clé nue' ? 'nue' : 'formes'));
        sh(cc, 'node', [INSTALLEUR, dH]);
        fs.writeFileSync(path.join(dH, 'visite.md'), texteH);
        git(dH, 'add', '-A');
        const envH = { ...ENV_COMMIT, FORGE_ANONYMISEUR: pilotChaine, FORGE_NOMS_INTERDITS: tClients, FORGE_PRODUITS_PSEUDO: tProduits };
        const cH = sh(dH, 'git', ['commit', '-q', '-m', 'visite du banc'], envH);
        const commiteH = lireCommite(dH, 'visite.md');
        const disqueIntact = fs.readFileSync(path.join(dH, 'visite.md'), 'utf8') === texteH;
        if (sens === 'clé nue') {
          if (cH.status === 0 && /musée de Produit-77/.test(commiteH) && disqueIntact)
            oks.push('cas 7 bis (sens rouge, TF-2322) — clé NUE : la chaîne réelle falsifie le lieu homonyme dans le commit (« musée de Produit-77 ») — c\'est le défaut que les formes déclarées lèvent ; le disque est intact');
          else kos.push('cas 7 bis (sens rouge) — le témoin du défaut ne reproduit rien (exit ' + cH.status + ') : commité « ' + commiteH.trim().slice(0, 120) + ' », disque intact : ' + disqueIntact + ' — ' + (cH.stderr || '').trim().slice(0, 200));
        } else if (cH.status === 0 && /musée de Valbrise/.test(commiteH) && /outil Produit-77/.test(commiteH) && disqueIntact)
          oks.push('cas 7 bis (TF-2322) — formes DÉCLARÉES : le lieu homonyme reste, seule la forme du produit est pseudonymisée dans le commit, et le disque est intact');
        else kos.push('cas 7 bis (TF-2322) — formes déclarées (exit ' + cH.status + ') : commité « ' + commiteH.trim().slice(0, 120) + ' », disque intact : ' + disqueIntact + ' — ' + (cH.stderr || '').trim().slice(0, 200));
      }
    }
  } finally { try { fs.rmSync(cc, { recursive: true, force: true }); } catch { /* zone temporaire */ } }

  // --- cas 18 : SEUL LE COMPTE DE L'UTILISATEUR DE LA FACTORY PUBLIE (D-175, TF-2168) ------------
  // LE FAIT PAYÉ, 05/11/2026 à 09:17 : l'envoi de digit-ai-forge-audit est parti sous le compte du profil
  // de session d'un produit client (GH_CONFIG_DIR). L'hébergeur l'a refusé en 403, par hasard : un compte
  // client doté du droit d'écriture aurait publié. Décision humaine D-175 : « Seule l'identité de
  // l'utilisateur de la Factory peut publier pour la Factory et les forges, personne d'autre. »
  // Le banc ne fait AUCUN appel réseau : un faux gh (PORTE_IDENTITE_GH) rend le compte que dit
  // l'environnement de l'envoi, comme le vrai gh : GH_CONFIG_DIR posé → un compte client, absent → le
  // compte du poste. Les dépôts visés déclarent une URL github.com ; une réécriture `insteadOf` locale
  // la renvoie vers un dépôt nu jetable, qui reçoit le vrai `git push`. Chaque sens se juge sur la seule
  // preuve qui compte : la branche est-elle arrivée au distant ?
  {
    if (!fs.existsSync(PORTE_IDENTITE_SOURCE)) kos.push('cas 18 — la porte d\'identité de publication n\'existe pas (' + PORTE_IDENTITE_SOURCE + ') : un envoi sous n\'importe quel compte passe');
    const aLeDistant = (distant) => spawnSync('git', ['--git-dir=' + distant, 'rev-parse', '--verify', '-q', 'refs/heads/main'], { encoding: 'utf8' }).status === 0;
    const fauxGh = path.join(racine, 'faux-gh.mjs');
    fs.writeFileSync(fauxGh, [
      "import fs from 'node:fs';",
      "if (process.env.FAUX_GH_JOURNAL) fs.appendFileSync(process.env.FAUX_GH_JOURNAL, process.argv.slice(2).join(' ') + ' | GH_CONFIG_DIR=' + (process.env.GH_CONFIG_DIR || '') + '\\n');",
      "const mode = process.env.FAUX_GH_MODE || '';",
      "if (mode === 'echec') { process.stderr.write('HTTP 401: Bad credentials\\n'); process.exit(1); }",
      "if (mode === 'vide') process.exit(0);",
      "if (mode === 'lent') setTimeout(() => {}, 60000);",
      "else process.stdout.write((process.env.GH_CONFIG_DIR ? 'compte-client' : 'compte-banc') + '\\n');",
    ].join('\n'));
    const REMEDE18 = 'Rejouer l\'envoi sous le compte du poste, pour cette seule commande : env -u GH_CONFIG_DIR -u GH_TOKEN -u GITHUB_TOKEN git push …';
    const ref18 = path.join(racine, 'identite-publication-banc.json');
    fs.writeFileSync(ref18, JSON.stringify({ schema: 'banc', comptes_autorises: ['compte-banc'], depots: ['digit-ai-factory', 'digit-ai-forge-*'], remede: REMEDE18 }, null, 1));
    const journal18 = path.join(racine, 'faux-gh.journal');
    const appels = (j) => (fs.existsSync(j) ? fs.readFileSync(j, 'utf8').split('\n').filter(Boolean).length : 0);
    // L'environnement de l'envoi : aucun profil ni jeton hérité du poste, sauf ce que le cas pose.
    const ENV18 = (extra) => ({ ...ENV_JEU_ESSAI, PORTE_IDENTITE_GH: fauxGh, FORGE_IDENTITE_PUBLICATION: ref18, FAUX_GH_JOURNAL: journal18,
      GH_CONFIG_DIR: undefined, GH_TOKEN: undefined, GITHUB_TOKEN: undefined, FAUX_GH_MODE: undefined, ...(extra || {}) });
    const ASSISTANT_GH = "!'C:\\Program Files\\GitHub CLI\\gh.exe' auth git-credential";
    // Un dépôt dont l'URL déclarée est github.com (nom = `nom`) et dont l'envoi atterrit dans un nu jetable.
    const viser = (dossier, nom, { url, assistants = ['', ASSISTANT_GH] } = {}) => {
      const d = depot(racine, dossier, false);
      const distant = distantJetable(racine, dossier + '-distant');
      const declaree = url || 'https://github.com/proprietaire-banc/' + nom + '.git';
      git(d, 'remote', 'add', 'origin', declaree);
      git(d, 'config', '--local', 'url.' + distant.replace(/\\/g, '/') + '.insteadOf', declaree);
      for (const a of assistants) git(d, 'config', '--local', '--add', 'credential.https://github.com.helper', a);
      sh(racine, 'node', [INSTALLEUR, d, '--seul=pre-push']);
      return { d, distant };
    };
    const lire = (r) => { try { return JSON.parse((r.stdout || '').trim()); } catch { return null; } };

    // (18a) sens VERT : le compte autorisé publie ; gh est interrogé avec les arguments attendus
    const a = viser('identite-vert', 'digit-ai-forge-banc');
    const p18a = sh(a.d, 'git', ['push', 'origin', 'main'], ENV18());
    const journal = fs.existsSync(journal18) ? fs.readFileSync(journal18, 'utf8') : '';
    if (p18a.status === 0 && aLeDistant(a.distant) && /api --hostname github\.com user --jq \.login/.test(journal))
      oks.push('cas 18a (D-175, sens vert) — compte autorisé : PUBLIÉ, la branche arrive au distant, gh est interrogé par `api --hostname github.com user --jq .login`');
    else kos.push('cas 18a (D-175, sens vert) — compte autorisé : push exit ' + p18a.status + ', au distant : ' + aLeDistant(a.distant) + ', appels gh : « ' + journal.trim().slice(0, 120) + ' » : ' + (p18a.stderr || '').trim().slice(0, 300));

    // (18b) sens ROUGE : le profil d'un autre compte (GH_CONFIG_DIR) → refusé, rien au distant, le compte
    // lu et le remède nommés, et c'est la porte d'identité qui parle (pas celle des secrets)
    const b = viser('identite-autre', 'digit-ai-forge-banc');
    const p18b = sh(b.d, 'git', ['push', 'origin', 'main'], ENV18({ GH_CONFIG_DIR: path.join(racine, 'profil-client') }));
    const e18b = p18b.stderr || '';
    if (p18b.status !== 0 && !aLeDistant(b.distant) && /compte de publication non autorisé/.test(e18b) && /compte-client/.test(e18b)
        && /env -u GH_CONFIG_DIR -u GH_TOKEN -u GITHUB_TOKEN git push/.test(e18b) && /GH_CONFIG_DIR=.*profil-client/.test(fs.readFileSync(journal18, 'utf8')))
      oks.push('cas 18b (D-175, sens rouge) — l\'environnement de l\'envoi porte le profil d\'un autre compte : REFUSÉ, rien au distant, le compte lu (compte-client) et le remède nommés, et gh a reçu GH_CONFIG_DIR');
    else kos.push('cas 18b (D-175, sens rouge) — un envoi sous un autre compte n\'est pas refusé : exit ' + p18b.status + ', au distant : ' + aLeDistant(b.distant) + ' : ' + e18b.trim().slice(0, 400));

    // (18c) le REMÈDE dit par le refus, joué à la lettre : `env -u …` retire le profil pour la seule commande
    const shId = trouverSh();
    if (!shId) kos.push('cas 18c (D-175, remède joué) — aucun `sh` trouvé à côté de git : le banc ne peut pas jouer `env -u …`');
    else {
      const cmdRemede = REMEDE18.split(' : ').pop().replace('…', 'origin main');
      const e = envBanc(ENV18({ GH_CONFIG_DIR: path.join(racine, 'profil-client') }));
      const cle = Object.keys(e).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
      e[cle] = path.dirname(shId) + path.delimiter + (e[cle] || '');
      const p18c = spawnSync(shId, ['-c', cmdRemede], { cwd: b.d, encoding: 'utf8', env: e });
      if (p18c.status === 0 && aLeDistant(b.distant) && /^env -u GH_CONFIG_DIR/.test(cmdRemede))
        oks.push('cas 18c (D-175, remède joué) — `' + cmdRemede + '` sous le profil d\'un autre compte : PUBLIÉ sous le compte du poste');
      else kos.push('cas 18c (D-175, remède joué) — le remède du refus ne publie pas : exit ' + p18c.status + ', au distant : ' + aLeDistant(b.distant) + ' : ' + (p18c.stderr || '').trim().slice(0, 300));
    }

    // (18d) compte ILLISIBLE → refusé (SKIP refuse), motif en clair : gh en échec, sortie vide, délai
    // dépassé (borne raccourcie à 1,5 s par PORTE_IDENTITE_DELAI_MS), exécutable introuvable
    const illisibles = [
      ['gh en échec (code 1)', { FAUX_GH_MODE: 'echec' }, /code 1/],
      ['gh sans sortie', { FAUX_GH_MODE: 'vide' }, /identifiant de compte lisible/],
      ['gh sans réponse dans le délai', { FAUX_GH_MODE: 'lent', PORTE_IDENTITE_DELAI_MS: '1500' }, /sans réponse après/],
      ['gh introuvable', { PORTE_IDENTITE_GH: path.join(racine, 'gh-qui-n-existe-pas') }, /ne se lance pas/],
    ];
    const echecs18d = [];
    for (const [i, [libelle, extra, motif]] of illisibles.entries()) {
      const v = viser('identite-illisible-' + i, 'digit-ai-forge-banc');
      const t0 = Date.now();
      const p = sh(v.d, 'git', ['push', 'origin', 'main'], ENV18(extra));
      const e = p.stderr || '';
      if (!(p.status !== 0 && !aLeDistant(v.distant) && /porte SKIP : /.test(e) && motif.test(e) && /env -u GH_CONFIG_DIR/.test(e) && Date.now() - t0 < 15000))
        echecs18d.push(libelle + ' → exit ' + p.status + ', au distant ' + aLeDistant(v.distant) + ' : ' + e.trim().slice(0, 200));
    }
    if (!echecs18d.length) oks.push('cas 18d (D-175) — compte ILLISIBLE (gh en échec, sans sortie, sans réponse dans le délai, introuvable) : REFUSÉ à chaque fois, motif « porte SKIP » en clair, remède nommé, délai tenu');
    else kos.push('cas 18d (D-175) — un compte illisible n\'est pas refusé comme il faut : ' + echecs18d.join(' ; '));

    // (18e) un PRODUIT (hors portée) publie sous n'importe quel compte, SANS appeler gh : SANS_OBJET dit
    const journalProduit = path.join(racine, 'faux-gh-produit.journal');
    const produit = viser('identite-produit', 'produit-banc');
    const envProduit = ENV18({ GH_CONFIG_DIR: path.join(racine, 'profil-client'), FAUX_GH_JOURNAL: journalProduit });
    const direct18e = sh(produit.d, 'node', [PORTE_IDENTITE_SOURCE, produit.d], envProduit);
    const j18e = lire(direct18e);
    const p18e = sh(produit.d, 'git', ['push', 'origin', 'main'], envProduit);
    if (p18e.status === 0 && aLeDistant(produit.distant) && appels(journalProduit) === 0 && direct18e.status === 0 && j18e && j18e.verdict === 'PASS'
        && j18e.sans_objet === true && /SANS_OBJET/.test(j18e.note || ''))
      oks.push('cas 18e (D-175, hors portée) — un produit (nom hors de `depots`) publie sous le profil d\'un autre compte : PUBLIÉ, gh jamais appelé, la porte dit SANS_OBJET (exit 0)');
    else kos.push('cas 18e (D-175, hors portée) — produit : push exit ' + p18e.status + ', gh appelé ' + appels(journalProduit) + ' fois, porte exit ' + direct18e.status + ' : ' + ((p18e.stderr || '') + (direct18e.stdout || '')).trim().slice(0, 300));

    // (18f) RÉFÉRENTIEL absent : un dépôt visé est refusé (exit 2), le motif dit où il est cherché ; un
    // produit passe encore ; sans variable, la porte le cherche sous <racine>/digit-ai-factory/references/
    const sansRef = ENV18({ FORGE_IDENTITE_PUBLICATION: path.join(racine, 'identite-qui-n-existe-pas.json') });
    const f1 = viser('identite-sans-ref', 'digit-ai-forge-banc');
    const p18f1 = sh(f1.d, 'git', ['push', 'origin', 'main'], sansRef);
    const f2 = viser('identite-sans-ref-produit', 'produit-banc');
    const p18f2 = sh(f2.d, 'git', ['push', 'origin', 'main'], sansRef);
    const nuRef = fs.mkdtempSync(path.join(os.tmpdir(), 'identite-racine-'));
    let sansVariable;
    try {
      const refsDir = path.join(nuRef, 'digit-ai-factory', 'references');
      fs.mkdirSync(refsDir, { recursive: true });
      fs.copyFileSync(ref18, path.join(refsDir, 'IDENTITE-PUBLICATION.json'));
      const dRef = path.join(nuRef, 'digit-ai-forge-banc');
      fs.mkdirSync(dRef);
      git(dRef, 'init', '-q', '-b', 'main', '.');
      git(dRef, 'remote', 'add', 'origin', 'https://github.com/proprietaire-banc/digit-ai-forge-banc.git');
      git(dRef, 'config', '--local', '--add', 'credential.https://github.com.helper', '');
      git(dRef, 'config', '--local', '--add', 'credential.https://github.com.helper', ASSISTANT_GH);
      sansVariable = lire(sh(dRef, 'node', [PORTE_IDENTITE_SOURCE, dRef], ENV18({ FORGE_ROOT: undefined, FORGE_IDENTITE_PUBLICATION: undefined })));
    } finally { try { fs.rmSync(nuRef, { recursive: true, force: true }); } catch { /* zone temporaire */ } }
    const e18f1 = p18f1.stderr || '';
    if (p18f1.status !== 0 && !aLeDistant(f1.distant) && /porte SKIP : /.test(e18f1) && /introuvable/.test(e18f1) && /IDENTITE-PUBLICATION/.test(e18f1)
        && p18f2.status === 0 && aLeDistant(f2.distant) && sansVariable && sansVariable.verdict === 'PASS' && sansVariable.compte === 'compte-banc')
      oks.push('cas 18f (D-175) — référentiel ABSENT : un dépôt visé est REFUSÉ (porte SKIP, chemin cherché dit), un produit passe encore ; sans variable la porte le trouve sous <racine>/digit-ai-factory/references/');
    else kos.push('cas 18f (D-175) — référentiel absent : dépôt visé exit ' + p18f1.status + ' (au distant ' + aLeDistant(f1.distant) + '), produit exit ' + p18f2.status + ', sans variable ' + JSON.stringify(sansVariable && { v: sansVariable.verdict, c: sansVariable.compte }) + ' : ' + e18f1.trim().slice(0, 300));

    // (18g) l'ASSISTANT d'identification n'est pas gh seul → refusé (la porte ne sait pas quel compte il présentera)
    const autresAssistants = [
      ['gestionnaire du système seul', ['', 'manager']],
      ['gestionnaire puis gh, sans remise à zéro', ['manager', ASSISTANT_GH]],
      ['aucun assistant', ['']],
    ];
    const echecs18g = [];
    for (const [i, [libelle, assistants]] of autresAssistants.entries()) {
      const v = viser('identite-assistant-' + i, 'digit-ai-forge-banc', { assistants });
      const p = sh(v.d, 'git', ['push', 'origin', 'main'], ENV18());
      if (!(p.status !== 0 && !aLeDistant(v.distant) && /porte SKIP : /.test(p.stderr || '') && /assistant d'identification/.test(p.stderr || '')))
        echecs18g.push(libelle + ' → exit ' + p.status + ', au distant ' + aLeDistant(v.distant) + ' : ' + (p.stderr || '').trim().slice(0, 200));
    }
    if (!echecs18g.length) oks.push('cas 18g (D-175) — assistant autre que `gh auth git-credential` seul (gestionnaire, gestionnaire puis gh, aucun) : REFUSÉ, le motif nomme l\'assistant lu');
    else kos.push('cas 18g (D-175) — un assistant étranger n\'est pas refusé : ' + echecs18g.join(' ; '));

    // (18h) un envoi par SSH : le compte est celui de la clé, que gh ne dit pas → refusé, motif dit
    const ssh = viser('identite-ssh', 'digit-ai-forge-banc', { url: 'git@github.com:proprietaire-banc/digit-ai-forge-banc.git' });
    const p18h = sh(ssh.d, 'git', ['push', 'origin', 'main'], ENV18());
    if (p18h.status !== 0 && !aLeDistant(ssh.distant) && /porte SKIP : envoi par ssh/.test(p18h.stderr || ''))
      oks.push('cas 18h (D-175) — destination en ssh sur un dépôt visé : REFUSÉ (porte SKIP : envoi par ssh), rien au distant');
    else kos.push('cas 18h (D-175) — un envoi par ssh n\'est pas refusé : exit ' + p18h.status + ' : ' + (p18h.stderr || '').trim().slice(0, 300));

    // (18i) le CONTRAT des oracles : JSON {oracle, verdict, findings[], non_juge[]}, exit 0 / 1 / 2, motif sur SKIP
    const vert = lire(sh(a.d, 'node', [PORTE_IDENTITE_SOURCE, a.d], ENV18()));
    const rougeR = sh(b.d, 'node', [PORTE_IDENTITE_SOURCE, b.d], ENV18({ GH_CONFIG_DIR: path.join(racine, 'profil-client') }));
    const rouge = lire(rougeR);
    const skipR = sh(b.d, 'node', [PORTE_IDENTITE_SOURCE, b.d], ENV18({ FAUX_GH_MODE: 'echec' }));
    const skip = lire(skipR);
    const horsDepot = sh(racine, 'node', [PORTE_IDENTITE_SOURCE, path.join(racine, 'dossier-qui-n-existe-pas')], ENV18());
    const nonJuge = (o) => o && Array.isArray(o.non_juge) && o.non_juge.length > 0;
    if (vert && vert.verdict === 'PASS' && Array.isArray(vert.findings) && !vert.findings.length && nonJuge(vert) && vert.compte === 'compte-banc'
        && rougeR.status === 1 && rouge && rouge.verdict === 'FAIL' && rouge.findings.length === 1 && rouge.findings[0].regle === 'D-175'
        && /compte-client/.test(rouge.findings[0].msg) && /env -u GH_CONFIG_DIR/.test(rouge.findings[0].msg) && nonJuge(rouge)
        && skipR.status === 2 && skip && skip.verdict === 'SKIP' && typeof skip.motif === 'string' && skip.motif.length > 0 && skip.non_juge[0] === skip.motif
        && horsDepot.status === 2 && (lire(horsDepot) || {}).verdict === 'SKIP')
      oks.push('cas 18i (D-175) — contrat des oracles : PASS exit 0 (findings vides, non_juge, compte), FAIL exit 1 (un constat D-175 qui nomme le compte et le remède), SKIP exit 2 (motif en tête du non_juge), dépôt introuvable SKIP exit 2');
    else kos.push('cas 18i (D-175) — contrat : vert ' + JSON.stringify(vert && vert.verdict) + ', rouge exit ' + rougeR.status + ' ' + JSON.stringify(rouge && rouge.verdict) + ', skip exit ' + skipR.status + ' ' + JSON.stringify(skip && skip.verdict) + ', hors dépôt exit ' + horsDepot.status);

    // (18j) l'ASSISTANT gh se reconnaît sous toutes ses graphies, jamais un autre (jugé sur le code de la porte)
    try {
      const m = await import(pathToFileURL(PORTE_IDENTITE_SOURCE).href);
      const reconnus = [ASSISTANT_GH, '!gh auth git-credential', "!'/usr/bin/gh' auth git-credential", '!"C:\\Program Files\\GitHub CLI\\gh.exe" auth git-credential', '!/usr/local/bin/gh auth git-credential'];
      const refuses = ['manager', 'osxkeychain', '!ghx auth git-credential', '!gh auth login', '!/bin/sh -c "gh auth git-credential"', 'gh auth git-credential', '!gh auth git-credential --extra', ''];
      const mal = [...reconnus.filter((v) => !m.estAssistantGh(v)).map((v) => 'refusé à tort : ' + v), ...refuses.filter((v) => m.estAssistantGh(v)).map((v) => 'accepté à tort : ' + v)];
      const noms = [['https://github.com/proprietaire-banc/digit-ai-forge-audit.git', 'digit-ai-forge-audit'], ['git@github.com:proprietaire-banc/digit-ai-factory.git', 'digit-ai-factory'], ['C:\\tmp\\digit-ai-forge-x.git\\', 'digit-ai-forge-x'], ['https://github.com/proprietaire-banc/Produit-84', 'Produit-84']];
      for (const [url, attendu] of noms) if (m.nomDepuisUrl(url) !== attendu) mal.push('nom de ' + url + ' → ' + m.nomDepuisUrl(url));
      if (!mal.length) oks.push('cas 18j (D-175) — l\'assistant gh est reconnu sous ' + reconnus.length + ' graphies et refusé sous ' + refuses.length + ' autres ; le nom du dépôt distant se lit sur ' + noms.length + ' formes d\'URL');
      else kos.push('cas 18j (D-175) — ' + mal.join(' ; '));
    } catch (err) { kos.push('cas 18j (D-175) — la porte ne se charge pas comme module : ' + String(err.message).slice(0, 200)); }

    // (18k) CÂBLAGE du pre-push : la porte d'identité est jouée AVANT celle des secrets, et un porteur de
    // secrets sous un autre compte est refusé pour le COMPTE (l'identité parle la première)
    const hook18 = fs.readFileSync(path.join(a.d, '.git', 'hooks', 'pre-push'), 'utf8');
    const iId = hook18.indexOf('porte-identite-publication.mjs'), iSec = hook18.indexOf('porte-secrets-publies.mjs');
    const k = viser('identite-ordre', 'digit-ai-forge-banc');
    fs.writeFileSync(path.join(k.d, '.env'), 'CLE=valeur-de-recette\n');
    git(k.d, 'add', '-f', '--', '.env'); git(k.d, 'commit', '-q', '-m', 'Configuration locale');
    const p18k = sh(k.d, 'git', ['push', 'origin', 'main'], ENV18({ GH_CONFIG_DIR: path.join(racine, 'profil-client') }));
    const e18k = p18k.stderr || '';
    if (iId > 0 && iSec > iId && p18k.status !== 0 && /compte de publication non autorisé/.test(e18k) && !/SP2/.test(e18k) && !aLeDistant(k.distant))
      oks.push('cas 18k (D-175) — le pre-push joue la porte d\'identité AVANT celle des secrets : un `.env` ajouté sous un autre compte est refusé pour le compte (SP2 ne parle pas)');
    else kos.push('cas 18k (D-175) — ordre des portes : identité à ' + iId + ', secrets à ' + iSec + ', push exit ' + p18k.status + ' : ' + e18k.trim().slice(0, 300));

    // (18l) porte INTROUVABLE, ou qui sort 0 SANS verdict PASS lu : l'envoi est refusé (TF-1373 : jamais sur le seul code de sortie)
    const desert18 = fs.mkdtempSync(path.join(os.tmpdir(), 'sans-porte-identite-'));
    try {
      fs.writeFileSync(path.join(desert18, '_noms-interdits.json'), fs.readFileSync(path.join(racine, '_noms-interdits.json')));
      const dir18 = poserOracleSource(desert18);
      fs.rmSync(path.join(dir18, 'porte-identite-publication.mjs'), { force: true });
      const envDesert = ENV18({ HOME: desert18, USERPROFILE: desert18, FORGE_ROOT: desert18 });
      const l1 = viser('identite-sans-porte', 'digit-ai-forge-banc');
      const p18l1 = sh(l1.d, 'git', ['push', 'origin', 'main'], envDesert);
      // une porte qui sort 0 et n'imprime rien, déposée à l'emplacement prioritaire (la copie installée)
      const dirHome = path.join(desert18, '.claude', 'skills', 'quality-oracles', 'scripts');
      fs.mkdirSync(dirHome, { recursive: true });
      fs.writeFileSync(path.join(dirHome, 'porte-identite-publication.mjs'), 'process.exit(0);\n');
      const l2 = viser('identite-porte-muette', 'digit-ai-forge-banc');
      const p18l2 = sh(l2.d, 'git', ['push', 'origin', 'main'], envDesert);
      if (p18l1.status !== 0 && !aLeDistant(l1.distant) && /porte d'identité de publication .*introuvable/.test(p18l1.stderr || '')
          && p18l2.status !== 0 && !aLeDistant(l2.distant) && /porte SKIP|verdict ILLISIBLE/.test(p18l2.stderr || ''))
        oks.push('cas 18l (D-175, TF-1373) — porte d\'identité INTROUVABLE : envoi REFUSÉ, motif dit ; porte qui sort 0 sans verdict : REFUSÉ aussi (le code de sortie seul ne suffit jamais)');
      else kos.push('cas 18l (D-175, TF-1373) — sans porte exit ' + p18l1.status + ' : ' + (p18l1.stderr || '').trim().slice(0, 200) + ' | porte muette exit ' + p18l2.status + ' : ' + (p18l2.stderr || '').trim().slice(0, 200));
    } finally { try { fs.rmSync(desert18, { recursive: true, force: true }); } catch { /* zone temporaire */ } }
  }

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
