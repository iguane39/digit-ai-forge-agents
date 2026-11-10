#!/usr/bin/env node
// pre-commit-anonymiser — LE NOM EST RETIRÉ AVANT QUE LE COMMIT N'EXISTE, DANS N'IMPORTE QUEL
// DÉPÔT DU PARC (TF-0980).
//
// ============================================================================================
// POURQUOI CE FICHIER EXISTE ICI, ET PAS SEULEMENT CHEZ LE PILOT
// ============================================================================================
//
// Le pilot porte depuis le 08/09/2026 un `pre-commit` qui pseudonymise le contenu indexé et le
// RÉ-INDEXE, sans refuser. Le geste est le bon, et il ne se généralise pas tel quel : son script
// calcule sa racine depuis SON PROPRE emplacement (`todo/..`) et journalise dans le `.claude` du
// pilot. Posé sur un autre dépôt, il anonymiserait l'index DU PILOT pendant qu'on commite
// ailleurs — c'est-à-dire qu'il ne ferait rien d'utile tout en paraissant travailler, le pire des
// deux mondes pour un garde-fou.
//
// CE FICHIER EST DONC UN LANCEUR, PAS UNE COPIE. Il résout le dépôt sur lequel le commit est en
// cours, résout la CHAÎNE D'ANONYMISATION du pilot, et lui passe les deux choses qu'elle sait
// déjà prendre en paramètre : la liste des fichiers indexés et la racine. Les règles de
// substitution — graphies, variantes, casse, garde des identifiants de code, extensions traitées
// comme du code — ne sont PAS réécrites ici.
//
// C'EST LA RÈGLE R3 : L'OUTIL QUI FAIT FOI, JAMAIS UNE COPIE MAISON. Recopier ces règles dans une
// seconde implémentation garantirait la divergence — la même leçon a été payée par la porte de
// publication, dont les angles C1 à C4 avaient chacun leur idée de la frontière de mot, et par
// `digit-ai-schemas`, qui embarquait une copie manuelle d'un composant corrigé sept fois sans
// qu'un seul correctif l'atteigne. Deux contrôles du même sujet qui ne s'accordent pas donnent le
// pire des deux mondes : le nettoyage se croit fini d'un côté, le refus tombe de l'autre.
//
// ============================================================================================
// IL CORRIGE, IL NE REFUSE PAS — LES BORNES SONT CELLES DU PILOT, ET ELLES SONT REPRISES ICI
// ============================================================================================
//
//   1. IL NE JUGE QUE L'INDEX, jamais l'histoire : quelques fichiers au lieu de neuf cents
//      révisions, quelques millisecondes au lieu de trois à cinq minutes. C'est ce qui le rend
//      supportable à chaque commit, là où la porte de publication ne l'est qu'au push ;
//   1 bis. IL N'ÉCRIT QUE L'INDEX, jamais l'arbre de travail (TF-2321, 10/11/2026). LE FAIT, chez un
//      produit, le 02/10/2026 : la chaîne lisait et réécrivait le fichier du DISQUE puis l'indexait ;
//      40 fichiers réécrits, dont un entrant de input/ en lecture seule et sans original dans git
//      (143 occurrences remplacées, restauré à la main) et un générateur de deck. La chaîne travaille
//      désormais dans un dépôt JETABLE où ce lanceur a déposé la COPIE INDEXÉE de chaque fichier ; le
//      texte réécrit entre dans l'index par `git hash-object` et `git update-index`, et le fichier de
//      travail garde son texte. Une anonymisation s'applique à la copie publiée : le commit porte le
//      pseudonyme, le disque le nom, et le prochain `git add` repasse par ce hameçon. Effet de bord
//      corrigé du même geste : un fichier indexé en partie ne voit plus ses lignes non indexées
//      entrer dans le commit, puisque c'est la copie indexée, et non le disque, qui est lue ;
//   1 ter. CE QUI RESTE HORS DE PORTÉE, ni réécrit sur le disque ni à l'index, et dit à la sortie :
//      tout fichier sous `input/` (un entrant se lit, il ne se réécrit pas), et tout fichier que
//      l'attribut git `anonymiser` déclare hors de portée (`-anonymiser` ou `anonymiser=non` dans
//      `.gitattributes`) — c'est ainsi qu'un produit protège la SOURCE d'un contrôle de fidélité
//      (TF-2322 : le 02/10/2026, une source réécrite comme le livrable a laissé un contrôle de
//      fidélité vert sur un deck faux). Un nom de produit homonyme d'un lieu ou d'un domaine public
//      se règle dans la table, pas ici : une entrée `{ "pseudo": "Produit-NN", "formes": […] }`
//      (TF-2130) ne fait substituer que ses graphies déclarées, par la chaîne comme par la porte ;
//   2. IL JOURNALISE CHAQUE SUBSTITUTION, dans le dépôt où le commit a lieu : depuis TF-2321, dans
//      son répertoire git commun (`anonymisation-au-commit.jsonl`), hors de l'arbre de travail. Une
//      correction silencieuse et non tracée est indiscernable d'une corruption ;
//   3. IL REFUSE, BRUYAMMENT, DANS DEUX CAS SEULEMENT — tables illisibles (un anonymiseur qui ne
//      peut pas anonymiser arrête le convoi) et NOM de fichier porteur. Le nom de fichier se
//      refuse au lieu de se corriger : renommer un fichier sous les pieds de quelqu'un pendant
//      son commit casserait son index et son éditeur ouvert. Le refus donne la commande exacte.
//
// LA CHAÎNE INTROUVABLE TOMBE DANS LE PREMIER CAS, et ce n'est pas un troisième refus déguisé :
// chez le pilot, la chaîne est importée statiquement — absente, le processus meurt et le commit
// est refusé de la même façon. Ici la résolution est explicite, donc le motif est lisible au lieu
// d'être une trace de pile.
//
// LES CHEMINS NE SONT PAS GRAVÉS À L'INSTALLATION, même doctrine que le hameçon de publication :
// un chemin résolu le jour de la pose périme en silence, et le même geste se rejoue sur un autre
// poste où la racine n'est pas au même endroit. La résolution se fait donc À CHAQUE APPEL.
//
// Usage : appelé par `.git/hooks/pre-commit`. À la main : node pre-commit-anonymiser.mjs [--essai]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
// <forge>/.claude/skills/quality-oracles/scripts → <forge>
const RACINE_FORGE = path.resolve(ICI, '..', '..', '..', '..');
const essai = process.argv.includes('--essai');

const refus = (lignes) => {
  console.error('');
  for (const l of lignes) console.error(l);
  console.error('');
  process.exit(1);
};

// --- le dépôt sur lequel le commit est en cours -------------------------------------------
// `git rev-parse` plutôt que le répertoire courant : un hook peut être appelé depuis un
// sous-répertoire, et un chemin relatif ferait travailler l'outil à côté de sa cible.
const rv = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
if (rv.status !== 0) refus([
  'COMMIT REFUSÉ — impossible de déterminer le dépôt courant.',
  '  ' + String(rv.stderr || '').trim().slice(0, 200),
]);
const DEPOT = path.resolve(String(rv.stdout).trim());

// --- la chaîne d'anonymisation, résolue à chaque appel --------------------------------------
// L'ORDRE VA DU PLUS EXPLICITE AU PLUS IMPLICITE, comme celui des tables de la porte de
// publication : une désignation explicite fait foi (c'est aussi ce qui rend ce lanceur éprouvable
// par un banc, qui pointe une chaîne jetable), puis la racine DÉCLARÉE du parc, puis les deux
// racines qu'on devine — le parent du dépôt où le commit a lieu, puis le parent de cette forge.
// La seconde sert le cas d'un dépôt qui ne vit pas dans le parc, où seule l'implantation de la
// forge dit encore où est la racine.
function racinesParc() {
  const r = process.env.FORGE_ROOT
    ? [process.env.FORGE_ROOT]
    : [path.resolve(DEPOT, '..'), path.resolve(RACINE_FORGE, '..')];
  return [...new Set(r.map((x) => path.resolve(x)))];
}

function resoudreChaine() {
  const pistes = [];
  if (process.env.FORGE_ANONYMISEUR) pistes.push(process.env.FORGE_ANONYMISEUR);
  for (const r of racinesParc()) pistes.push(path.join(r, 'digit-ai-factory', 'todo', 'pre-commit-anonymise.mjs'));
  for (const p of pistes) if (p && fs.existsSync(p)) return { chemin: p, pistes };
  return { chemin: null, pistes };
}

const { chemin: CHAINE, pistes } = resoudreChaine();
if (!CHAINE) refus([
  "COMMIT REFUSÉ — la chaîne d'anonymisation est introuvable.",
  '  Pistes explorées, dans l\'ordre : ' + pistes.join(' · '),
  '  Un anonymiseur qui ne peut pas anonymiser ne doit pas laisser passer : la désigner par',
  "  la variable d'environnement FORGE_ANONYMISEUR, ou poser FORGE_ROOT sur la racine du parc.",
  '  Contournement explicite si vous savez ce que vous faites : git commit --no-verify',
]);

let passer;
try { ({ passer } = await import(pathToFileURL(CHAINE).href)); }
catch (e) {
  refus([
    "COMMIT REFUSÉ — la chaîne d'anonymisation (" + CHAINE + ') est illisible.',
    '  ' + e.message,
    '  Un anonymiseur qui ne peut pas anonymiser ne doit pas laisser passer.',
  ]);
}
if (typeof passer !== 'function') refus([
  "COMMIT REFUSÉ — la chaîne d'anonymisation (" + CHAINE + ") n'expose pas `passer`.",
  '  Le contrat attendu est `passer({ fichiers, racine, ecrire })`.',
]);

// --- les fichiers de l'INDEX du dépôt courant ----------------------------------------------
// Ajoutés, copiés, modifiés ou renommés — jamais les supprimés, et jamais l'histoire. Le même
// filtre que chez le pilot, appliqué au dépôt qui commite au lieu du sien. Lecture -z (TF-1633) :
// sans elle, git cite en style C un chemin à octet non ASCII ("synth\303\250se.md"), le fichier
// cité est introuvable et son contenu échappe à l'anonymisation.
const dif = spawnSync('git', ['-C', DEPOT, 'diff', '--cached', '--name-only', '-z', '--diff-filter=ACM'],
  { encoding: 'utf8', maxBuffer: 64e6 });
if (dif.status !== 0) refus([
  "COMMIT REFUSÉ — impossible de lire l'index de " + DEPOT + '.',
  '  ' + String(dif.stderr || '').trim().slice(0, 200),
]);
const fichiers = String(dif.stdout || '').split('\0').filter(Boolean);

// --- TF-2321 / TF-2322 : CE QUI RESTE HORS DE PORTÉE ----------------------------------------
// Un entrant de `input/` se lit, il ne se réécrit pas ; un fichier que `.gitattributes` déclare
// `-anonymiser` (ou `anonymiser=non`) non plus — la source d'un contrôle de fidélité, d'abord. Ni le
// disque ni l'index n'en sont touchés, et la sortie le dit : le nom qu'il porte part dans le commit, et
// la porte de publication le jugera.
const horsPortee = new Map();
for (const f of fichiers) if (/^input\//i.test(f)) horsPortee.set(f, 'entrant sous input/, en lecture seule');
if (fichiers.length) {
  const ca = spawnSync('git', ['-C', DEPOT, 'check-attr', '-z', '--stdin', 'anonymiser'],
    { input: fichiers.join('\0') + '\0', encoding: 'utf8', maxBuffer: 64e6 });
  if (ca.status !== 0) refus([
    "COMMIT REFUSÉ — impossible de lire l'attribut git `anonymiser` de l'index de " + DEPOT + '.',
    '  ' + String(ca.stderr || '').trim().slice(0, 200),
  ]);
  const t = String(ca.stdout || '').split('\0');
  for (let i = 0; i + 2 < t.length; i += 3) {
    const v = t[i + 2];
    if ((v === 'unset' || /^(non|no|false)$/i.test(v)) && !horsPortee.has(t[i])) horsPortee.set(t[i], 'déclaré hors de portée par l\'attribut git « -anonymiser »');
  }
}

// --- TF-2321 : LA CHAÎNE TRAVAILLE SUR LA COPIE INDEXÉE, DANS UN DÉPÔT JETABLE --------------
// Chaque fichier à traiter est déposé tel que l'index le porte (son objet, lu par `git cat-file`) dans
// un dépôt jetable : la chaîne y lit, y écrit et y indexe à son habitude, sans jamais voir l'arbre de
// travail. Les variables GIT_* que git pose dans un hameçon (GIT_INDEX_FILE pendant `commit -a`,
// GIT_DIR…) sont retirées le temps de la chaîne : héritées, elles feraient écrire son `git add` dans
// l'index RÉEL. Liens symboliques et sous-modules ne sont pas des textes : ils ne sont pas traités.
const lsi = spawnSync('git', ['-C', DEPOT, 'ls-files', '-s', '-z'], { encoding: 'utf8', maxBuffer: 256e6 });
if (lsi.status !== 0) refus([
  "COMMIT REFUSÉ — impossible de lire l'index de " + DEPOT + '.',
  '  ' + String(lsi.stderr || '').trim().slice(0, 200),
]);
const indexe = new Map();
for (const e of String(lsi.stdout || '').split('\0').filter(Boolean)) {
  const m = e.match(/^(\d{6}) ([0-9a-f]{40,64}) (\d)\t([\s\S]+)$/);
  if (m && m[3] === '0' && /^100(644|755)$/.test(m[1])) indexe.set(m[4], { mode: m[1], sha: m[2] });
}
const aTraiter = fichiers.filter((f) => !horsPortee.has(f) && indexe.has(f));
const JETABLE = fs.mkdtempSync(path.join(os.tmpdir(), 'anon-index-'));
const nettoyer = () => { try { fs.rmSync(JETABLE, { recursive: true, force: true }); } catch { /* zone temporaire */ } };
const refusJetable = (lignes) => { nettoyer(); refus(lignes); };
const VARIABLES_GIT = ['GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE', 'GIT_PREFIX'];
for (const f of aTraiter) {
  const blob = spawnSync('git', ['-C', DEPOT, 'cat-file', 'blob', indexe.get(f).sha], { maxBuffer: 256e6 });
  if (blob.status !== 0) refusJetable(["COMMIT REFUSÉ — la copie indexée de " + f + ' est illisible.', '  ' + String(blob.stderr || '').trim().slice(0, 200)]);
  fs.mkdirSync(path.dirname(path.join(JETABLE, f)), { recursive: true });
  fs.writeFileSync(path.join(JETABLE, f), blob.stdout);
}

let r;
const sauvees = {};
for (const k of VARIABLES_GIT) if (k in process.env) { sauvees[k] = process.env[k]; delete process.env[k]; }
try {
  const ini = spawnSync('git', ['init', '-q', JETABLE], { encoding: 'utf8' });
  if (ini.status !== 0) throw new Error('dépôt jetable impossible à créer : ' + String(ini.stderr || '').trim().slice(0, 200));
  r = passer({ fichiers: aTraiter, racine: JETABLE, ecrire: !essai });
}
catch (e) {
  Object.assign(process.env, sauvees);
  // Tables illisibles : on arrête le convoi, on ne laisse pas passer.
  refusJetable([
    "COMMIT REFUSÉ — la chaîne d'anonymisation ne peut pas travailler.",
    '  ' + e.message,
    '  Un anonymiseur qui ne peut pas anonymiser ne doit pas laisser passer.',
  ]);
}
Object.assign(process.env, sauvees);

// Le texte réécrit entre dans l'INDEX du dépôt qui commite, et nulle part ailleurs.
if (!essai) for (const c of r.corriges) {
  const e = indexe.get(c.fichier);
  if (!e) continue;
  const h = spawnSync('git', ['-C', DEPOT, 'hash-object', '-w', '--no-filters', '--stdin'],
    { input: fs.readFileSync(path.join(JETABLE, c.fichier)), encoding: 'utf8' });
  const sha = String(h.stdout || '').trim();
  if (h.status !== 0 || !/^[0-9a-f]{40,64}$/.test(sha)) refusJetable(["COMMIT REFUSÉ — l'objet pseudonymisé de " + c.fichier + " n'a pas pu être écrit.", '  ' + String(h.stderr || '').trim().slice(0, 200)]);
  const u = spawnSync('git', ['-C', DEPOT, 'update-index', '--cacheinfo', `${e.mode},${sha},${c.fichier}`], { encoding: 'utf8' });
  if (u.status !== 0) refusJetable(["COMMIT REFUSÉ — l'index n'a pas pu recevoir la copie pseudonymisée de " + c.fichier + '.', '  ' + String(u.stderr || '').trim().slice(0, 200)]);
}
nettoyer();

// --- le journal, DANS LE DÉPÔT QUI COMMITE, HORS DE SON ARBRE DE TRAVAIL (TF-2321) -----------
// Il ne doit JAMAIS bloquer un commit : une écriture impossible se tait. Mais elle ne se tait
// qu'après avoir dit la substitution sur la sortie d'erreur, qui est la trace que l'auteur voit.
const commun = spawnSync('git', ['-C', DEPOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
const JOURNAL = path.join(commun.status === 0 ? String(commun.stdout).trim() : path.join(DEPOT, '.git'), 'anonymisation-au-commit.jsonl');
const journaliser = (ligne) => { if (essai) return; try { fs.appendFileSync(JOURNAL, JSON.stringify({ ts: new Date().toISOString(), depot: DEPOT, ...ligne }) + '\n', 'utf8'); } catch { /* le journal ne doit jamais bloquer un commit */ } };
for (const c of r.corriges) {
  console.error(`  [pseudonymisé à l'index seulement] ${c.fichier} — ${c.termes} terme(s) ; le fichier de travail garde son texte`);
  journaliser({ ...c, index_seul: true });
}
for (const [f, motif] of horsPortee) {
  console.error(`  [hors de portée] ${f} — ${motif} : ni réécrit sur le disque ni à l'index`);
  journaliser({ fichier: f, hors_portee: motif });
}
if (r.corriges.length && !essai) {
  console.error("  Le disque n'est pas réécrit : `git diff` montre ce qui sépare le fichier de travail de sa copie commitée,");
  console.error('  et le prochain `git add` repassera par ce hameçon. Journal : ' + JOURNAL);
}

if (r.nomsPorteurs.length) {
  console.error('\nCOMMIT REFUSÉ — le NOM de ces fichiers porte un nom réel :');
  for (const n of r.nomsPorteurs) console.error(`  ${n.fichier}\n    → git mv -- "${n.fichier}" "${n.propose}"`);
  console.error('\n  Le contenu, lui, a été corrigé et ré-indexé. Renommer un fichier pendant votre');
  console.error('  commit casserait votre index : ce geste-là vous revient, et il tient sur une ligne.\n');
  process.exit(1);
}
process.exit(0);
