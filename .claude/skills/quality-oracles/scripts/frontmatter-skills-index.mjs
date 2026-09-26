#!/usr/bin/env node
// frontmatter-skills-index — le frontmatter des SEULS skills touchés, juge AVANT le commit
// (TF-1337, 26/09/2026).
//
// LE FAIT. Le skill `accueil-factory` est entré au dépôt le 22/09 (commit 47590ee) avec une
// description de plus de 1 024 caractères : la recette de quality-oracles l'aurait refusé, mais
// personne ne l'a jouée avant l'enregistrement — forge-agents n'a ni hameçon avant commit ni CI,
// et la recette complète coûte plus de six minutes. Ce contrôle-ci ne juge que ce qui ENTRE : les
// skills dont un fichier est dans l'index, lus dans l'INDEX (ce qui sera commité, pas l'arbre de
// travail), avec le MÊME lecteur et le MÊME barème que la recette (`lib/frontmatter.mjs`). Coût :
// deux appels à git et une lecture par skill touché.
//
// Un skill est un dossier `<…>/.claude/skills/<nom>/` ou `<…>/skills/<nom>/` qui porte un
// `SKILL.md`. Un skill dont le SKILL.md sort de l'index (suppression) n'est pas jugé : il ne se
// propage plus.
//
// Usage : node frontmatter-skills-index.mjs [<dépôt>] [--tous] [--json]
//   <dépôt>  défaut : le dépôt courant ;
//   --tous   juge TOUS les skills de l'index, pas seulement les touchés — la forme à appeler AVANT
//            de propager les skills, quand rien n'est indexé ;
//   --json   sortie machine {controle, verdict, depot, juges[], defauts[]}.
// Exit : 0 = recevable (ou aucun skill touché) · 1 = au moins un défaut · 2 = usage (pas un dépôt).
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { defautsFrontmatter } from './lib/frontmatter.mjs';

const args = process.argv.slice(2);
const JSON_SORTIE = args.includes('--json');
const TOUS = args.includes('--tous');
const depotArg = args.find((a) => !a.startsWith('--')) || process.cwd();
const git = (...a) => spawnSync('git', ['-C', depotArg, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const racine = git('rev-parse', '--show-toplevel');
if (racine.status !== 0) {
  const motif = `pas un dépôt git : ${depotArg}`;
  if (JSON_SORTIE) process.stdout.write(JSON.stringify({ controle: 'frontmatter-skills-index', verdict: 'ERREUR', depot: depotArg, motif }) + '\n');
  else console.error(motif);
  process.exit(2);
}
const depot = racine.stdout.trim();

// Le dossier du skill qui porte un chemin, ou null. `a/.claude/skills/x/y` → `a/.claude/skills/x`.
const RE_SKILL = /^((?:.*\/)?(?:\.claude\/)?skills\/[^/]+)\//;
const skillDe = (p) => { const m = p.match(RE_SKILL); return m ? m[1] : null; };

const liste = TOUS
  ? git('ls-files', '--cached')
  : git('diff', '--cached', '--name-only', '--diff-filter=ACMR');
const chemins = (liste.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
const skills = [...new Set(chemins.map(skillDe).filter(Boolean))].sort();

const juges = [], defauts = [];
for (const s of skills) {
  const lu = git('show', `:${s}/SKILL.md`);
  if (lu.status !== 0) continue; // pas de SKILL.md dans l'index : pas un skill, ou un skill retiré
  juges.push(s);
  for (const d of defautsFrontmatter(lu.stdout)) defauts.push({ skill: s, defaut: d });
}

const verdict = defauts.length ? 'FAIL' : 'PASS';
if (JSON_SORTIE) {
  process.stdout.write(JSON.stringify({ controle: 'frontmatter-skills-index', verdict, depot, portee: TOUS ? 'tous' : 'touches', juges, defauts }) + '\n');
} else if (defauts.length) {
  console.error(`FRONTMATTER REFUSÉ — ${defauts.length} défaut(s) sur ${juges.length} skill(s) ${TOUS ? 'de l index' : 'touché(s)'} :`);
  for (const d of defauts) console.error(`  ${d.skill}/SKILL.md : ${d.defaut}`);
  console.error('  Même barème que la recette de quality-oracles (description ≤ 1024 caractères, name et description présents).');
} else {
  console.log(`frontmatter recevable : ${juges.length} skill(s) ${TOUS ? 'de l index' : 'touché(s)'} jugé(s)${juges.length ? ' — ' + juges.map((s) => path.posix.basename(s)).join(', ') : ''}`);
}
process.exit(defauts.length ? 1 : 0);
