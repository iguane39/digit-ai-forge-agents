#!/usr/bin/env node
// sync-skills — compare et réconcilie les skills VERSIONNÉS (.claude/skills/ de ce dépôt)
// et les skills EXÉCUTÉS (~/.claude/skills/).
//
// Pourquoi. Les deux arbres dérivent dans les deux sens et personne ne s'en aperçoit :
// le 09/08/2026, le registre quality-oracles était en 2.6.1 au dépôt et en 2.9.1 à
// l'exécution — huit domaines d'oracles vivaient uniquement sur le poste, hors de git,
// pendant qu'un correctif versionné n'était jamais monté. Une dérive silencieuse est une
// perte de travail en attente : ce script la rend bruyante.
//
//   node sync-skills.mjs --diff                    constat, exit 1 s'il y a dérive
//   node sync-skills.mjs --diff --skill <nom>      limité à un skill
//   node sync-skills.mjs --sync --vers installation   dépôt      -> ~/.claude/skills
//   node sync-skills.mjs --sync --vers depot          ~/.claude  -> .claude/skills
//
// Le sens de `--sync` n'a PAS de valeur par défaut : recopier dans le mauvais sens écrase
// du travail. Il s'affiche en tête d'exécution et sur chaque fichier.
//
// Périmètre : les skills présents dans le dépôt. Ceux qui ne vivent qu'à l'installation
// (skills tiers, skills d'autres forges) sont listés pour information, jamais touchés.
//
// Exit : 0 = aligné (ou sync effectuée) · 1 = dérive constatée · 2 = usage.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.join(RACINE, '.claude', 'skills');
const INSTALL = path.join(os.homedir(), '.claude', 'skills');

// Artefacts d'exécution et sauvegardes de travail : hors comparaison par construction.
// Ce ne sont pas des sources, ils divergent à chaque run et le dire serait du bruit.
//
// TF-0336 (18/08/2026) — `/\.bak$/` ne couvrait QUE le suffixe nu. Un
// `SKILL.md.bak-20260407` traînait à l'installation depuis quatre mois, compté comme un
// fichier du skill à chaque comparaison : la forme DATÉE est justement celle qu'on produit
// quand on sauvegarde à la main, donc la plus probable. Le motif la couvre désormais.
// Les `.bak` VERSIONNÉS, eux, ont été retirés du dépôt le même jour : une sauvegarde suivie
// par git est une seconde source qui diverge — et les deux divergeaient déjà de leurs
// sources. L'historique git EST la sauvegarde ; un `.bak` à côté ne fait qu'ajouter une
// vérité concurrente à celle qu'on vient de corriger.
const IGNORE_DOSSIER = new Set(['__pycache__', '.venv', 'node_modules', '.oracles']);
const IGNORE_FICHIER = [
  /\.oracles-cache\.json$/, /\.oracles-historique\.jsonl$/, /\.oracles\.json$/,
  /^_oracles-journal/, /^_routages-journal/, /\.pyc$/, /\.bak(-\d{8})?$/, /\.avant-/,
  /^uv\.lock$/, /^\.tmp-niv-/,
];

const args = process.argv.slice(2);
const a = (n) => args.includes(n);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const MODE = a('--sync') ? 'sync' : a('--diff') ? 'diff' : null;
const SENS = val('--vers');
const SKILL = val('--skill');

if (!MODE) {
  console.error('usage: node sync-skills.mjs --diff [--skill <nom>]');
  console.error('       node sync-skills.mjs --sync --vers installation|depot [--skill <nom>]');
  process.exit(2);
}
if (MODE === 'sync' && !['installation', 'depot'].includes(SENS)) {
  console.error('--sync exige --vers installation | depot — le sens ne se devine pas.');
  process.exit(2);
}
if (!fs.existsSync(DEPOT)) { console.error('arbre versionné introuvable : ' + DEPOT); process.exit(2); }

function fichiers(racine) {
  const out = [];
  const marcher = (rel) => {
    const abs = path.join(racine, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (IGNORE_DOSSIER.has(e.name) || e.name.startsWith('.tmp-niv-')) continue;
        marcher(path.join(rel, e.name));
      } else if (!IGNORE_FICHIER.some((rx) => rx.test(e.name))) {
        out.push(path.join(rel, e.name).split(path.sep).join('/'));
      }
    }
  };
  marcher('');
  return out;
}

const lf = (b) => Buffer.from(b.toString('binary').split('\r\n').join('\n'), 'binary');
const lire = (p) => { try { return fs.readFileSync(p); } catch { return null; } };

const skillsDepot = fs.readdirSync(DEPOT, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name)
  .filter((n) => !SKILL || n === SKILL);
if (SKILL && !skillsDepot.length) { console.error('skill absent du dépôt : ' + SKILL); process.exit(2); }

const etats = [];   // { skill, rel, etat }
for (const skill of skillsDepot) {
  const dD = path.join(DEPOT, skill);
  const dI = path.join(INSTALL, skill);
  if (!fs.existsSync(dI)) { etats.push({ skill, rel: '(skill entier)', etat: 'absent_installation' }); continue; }
  const tous = [...new Set([...fichiers(dD), ...fichiers(dI)])].sort();
  for (const rel of tous) {
    const bD = lire(path.join(dD, rel));
    const bI = lire(path.join(dI, rel));
    if (bD && !bI) etats.push({ skill, rel, etat: 'absent_installation' });
    else if (!bD && bI) etats.push({ skill, rel, etat: 'absent_depot' });
    else if (!bD.equals(bI)) {
      etats.push({ skill, rel, etat: lf(bD).equals(lf(bI)) ? 'fins_de_ligne' : 'contenu' });
    }
  }
}

const LIB = {
  contenu: 'contenu différent',
  fins_de_ligne: 'fins de ligne seules',
  absent_installation: "absent de l'installation",
  absent_depot: 'absent du dépôt (jamais versionné)',
};

if (MODE === 'diff') {
  console.log(`dépôt       : ${DEPOT}`);
  console.log(`installation: ${INSTALL}`);
  if (!etats.length) {
    console.log(`\n✅ aligné — ${skillsDepot.length} skill(s) comparé(s), aucune dérive.`);
  } else {
    let courant = null;
    for (const e of etats) {
      if (e.skill !== courant) { console.log(`\n${e.skill}`); courant = e.skill; }
      console.log(`  [${LIB[e.etat]}] ${e.rel}`);
    }
    const par = {};
    etats.forEach((e) => { par[e.etat] = (par[e.etat] || 0) + 1; });
    // TF-0361 (constat en passant, 18/08/2026) — une différence de FINS DE LIGNE n'est pas
    // une dérive de contenu, et ce fichier le sait déjà puisqu'il la classe à part. La
    // compter comme dérive faisait sortir « dérive : 11 écart(s) » sur onze fichiers
    // rigoureusement identiques — asymétrie CRLF/LF entre un dépôt normalisé par git et une
    // copie posée par `--sync`, donc PERMANENTE sur poste Windows. Un outil qui crie sur du
    // bruit qu'il a lui-même identifié comme du bruit apprend à être ignoré : TF-0228, en
    // petit. Les lignes restent LISTÉES — on ne les cache pas, on cesse de les appeler dérive.
    const reels = etats.filter((e) => e.etat !== 'fins_de_ligne');
    const bruit = etats.length - reels.length;
    if (reels.length) {
      console.log(`\n❌ dérive : ${reels.length} écart(s) de contenu — `
        + Object.entries(par).filter(([k]) => k !== 'fins_de_ligne')
          .map(([k, v]) => `${LIB[k]} ${v}`).join(' · ')
        + (bruit ? ` (plus ${bruit} fichier(s) où SEULES les fins de ligne diffèrent)` : ''));
      console.log('réconcilier : node sync-skills.mjs --sync --vers installation|depot [--skill <nom>]');
    } else {
      console.log(`\n✅ aligné en CONTENU — ${bruit} fichier(s) ne diffèrent que par `
        + 'leurs fins de ligne : listés ci-dessus, non comptés comme dérive. `--sync` les '
        + 'uniformise si le bruit gêne.');
    }
  }
  const inconnus = fs.existsSync(INSTALL)
    ? fs.readdirSync(INSTALL, { withFileTypes: true }).filter((d) => d.isDirectory())
      .map((d) => d.name).filter((n) => !fs.existsSync(path.join(DEPOT, n)))
    : [];
  if (inconnus.length && !SKILL) {
    console.log(`\nℹ installés hors de ce dépôt (non comparés, jamais touchés) : ${inconnus.join(' · ')}`);
  }
  // Exit 1 sur une dérive de CONTENU seulement : un exit non nul sur du bruit de fins de
  // ligne ferait échouer une recette pour rien, et on apprendrait à passer outre.
  process.exit(etats.some((e) => e.etat !== 'fins_de_ligne') ? 1 : 0);
}

// --- sync -------------------------------------------------------------------
const versInstall = SENS === 'installation';
console.log(`SENS : ${versInstall ? 'dépôt versionné  ──>  installation exécutée'
  : 'installation exécutée  ──>  dépôt versionné'}`);
console.log(`source      : ${versInstall ? DEPOT : INSTALL}`);
console.log(`destination : ${versInstall ? INSTALL : DEPOT}\n`);

let n = 0;
for (const e of etats) {
  if (e.rel === '(skill entier)') {
    console.log(`  [ignoré] ${e.skill} — skill entier absent d'un côté : le créer explicitement`);
    continue;
  }
  const src = path.join(versInstall ? DEPOT : INSTALL, e.skill, e.rel);
  const dst = path.join(versInstall ? INSTALL : DEPOT, e.skill, e.rel);
  if (!fs.existsSync(src)) {
    console.log(`  [ignoré] ${e.skill}/${e.rel} — absent de la source : une suppression ne se recopie pas`);
    continue;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  // LF systématique : c'est la forme versionnée (.gitattributes) et celle qui n'a jamais
  // cassé le parsing d'un frontmatter.
  fs.writeFileSync(dst, lf(fs.readFileSync(src)));
  console.log(`  ${versInstall ? '-->' : '<--'} ${e.skill}/${e.rel}`);
  n++;
}
console.log(`\n${n} fichier(s) recopié(s).`);
process.exit(0);
