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
//   2. IL JOURNALISE CHAQUE SUBSTITUTION, dans le dépôt où le commit a lieu. Une correction
//      silencieuse et non tracée est indiscernable d'une corruption ;
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
// filtre que chez le pilot, appliqué au dépôt qui commite au lieu du sien.
const dif = spawnSync('git', ['-C', DEPOT, 'diff', '--cached', '--name-only', '--diff-filter=ACM'],
  { encoding: 'utf8', maxBuffer: 64e6 });
if (dif.status !== 0) refus([
  "COMMIT REFUSÉ — impossible de lire l'index de " + DEPOT + '.',
  '  ' + String(dif.stderr || '').trim().slice(0, 200),
]);
const fichiers = String(dif.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);

let r;
try { r = passer({ fichiers, racine: DEPOT, ecrire: !essai }); }
catch (e) {
  // Tables illisibles : on arrête le convoi, on ne laisse pas passer.
  refus([
    "COMMIT REFUSÉ — la chaîne d'anonymisation ne peut pas travailler.",
    '  ' + e.message,
    '  Un anonymiseur qui ne peut pas anonymiser ne doit pas laisser passer.',
  ]);
}

// --- le journal, DANS LE DÉPÔT QUI COMMITE ---------------------------------------------------
// Il ne doit JAMAIS bloquer un commit : une écriture impossible se tait. Mais elle ne se tait
// qu'après avoir dit la substitution sur la sortie d'erreur, qui est la trace que l'auteur voit.
const JOURNAL = path.join(DEPOT, '.claude', 'anonymisation-au-commit.jsonl');
for (const c of r.corriges) {
  console.error(`  [pseudonymisé et ré-indexé] ${c.fichier} — ${c.termes} terme(s)`);
  if (essai) continue;
  try {
    fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
    fs.appendFileSync(JOURNAL, JSON.stringify({ ts: new Date().toISOString(), depot: DEPOT, ...c }) + '\n', 'utf8');
  } catch { /* le journal ne doit jamais bloquer un commit */ }
}

if (r.nomsPorteurs.length) {
  console.error('\nCOMMIT REFUSÉ — le NOM de ces fichiers porte un nom réel :');
  for (const n of r.nomsPorteurs) console.error(`  ${n.fichier}\n    → git mv -- "${n.fichier}" "${n.propose}"`);
  console.error('\n  Le contenu, lui, a été corrigé et ré-indexé. Renommer un fichier pendant votre');
  console.error('  commit casserait votre index : ce geste-là vous revient, et il tient sur une ligne.\n');
  process.exit(1);
}
process.exit(0);
