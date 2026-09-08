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
// TF-0980 — le lanceur du hameçon de COMMIT, et la racine du parc telle que ce dépôt la voit.
// `<forge>/.claude/skills/quality-oracles/scripts` → `<forge>` → la racine du parc.
const LANCEUR_SOURCE = path.join(ICI, 'pre-commit-anonymiser.mjs');
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
 *  L'oracle n'importe que des modules du cœur de Node : un seul fichier suffit. */
function poserOracleSource(racine) {
  const d = path.join(racine, 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles', 'scripts');
  fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(ORACLE_SOURCE, path.join(d, 'oracle-nom-client-publie.mjs'));
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
    // Le fichier de travail suit l'index : sans cela, le prochain `git add` réintroduirait le nom.
    if (c6v.status === 0 && /Client-A/.test(fs.readFileSync(path.join(avecHook, 'note.md'), 'utf8')))
      oks.push('cas 6b — le fichier de TRAVAIL est corrigé lui aussi : le prochain `git add` ne réintroduira pas le nom');
    else if (c6v.status === 0) kos.push('cas 6b — l\'index est corrigé mais pas le fichier de travail : le nom revient au prochain `git add`');
    // La correction est TRACÉE : une réécriture silencieuse est indiscernable d'une corruption.
    const journal = path.join(avecHook, '.claude', 'anonymisation-au-commit.jsonl');
    if (fs.existsSync(journal) && /note\.md/.test(fs.readFileSync(journal, 'utf8')))
      oks.push('cas 6b — la substitution est JOURNALISÉE dans le dépôt qui commite : qui relit son diff peut savoir pourquoi son fichier a changé');
    else kos.push('cas 6b — aucun journal de substitution : une correction silencieuse et non tracée est indiscernable d\'une corruption');

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
    }
  } finally { try { fs.rmSync(cc, { recursive: true, force: true }); } catch { /* zone temporaire */ } }

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
