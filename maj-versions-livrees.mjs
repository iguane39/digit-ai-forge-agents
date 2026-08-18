#!/usr/bin/env node
// maj-versions-livrees — met le manifeste `versions-livrees.json` à l'état RÉEL du dépôt.
//
// TF-0336 (18/08/2026). Le manifeste annonçait quality-oracles 2.6.1 / registre 2.6.0 pour
// un réel 2.7.0 / 2.12.0, plus trois autres skills en retard et un skill (`la-barre`) absent
// du manifeste. La dérive était PRÉ-EXISTANTE et l'oracle `etat-forge` la relevait déjà en
// F1 — ce qui manquait n'était pas un contrôle, c'était le geste : les versions étaient
// recopiées à la main, donc oubliées à la main.
//
// POURQUOI CE N'EST PAS AUTOMATIQUE, et pourquoi ça ne doit jamais l'être.
// `versions-livrees.json` ne décrit pas ce qui EST — il décrit ce qui a été LIVRÉ. F1 compare
// les deux (`livré` vs `monté`) et c'est tout son intérêt : dériver le manifeste des
// frontmatters à chaque exécution ferait toujours passer F1, et l'oracle deviendrait un
// figurant. Ce script est donc un geste EXPLICITE, à jouer au moment où un lot part — jamais
// un hook, jamais une étape de build.
//
//   node maj-versions-livrees.mjs --constat   ce qui a dérivé, sans rien écrire (exit 1 si dérive)
//   node maj-versions-livrees.mjs --livrer    déclare le contenu actuel du dépôt comme LIVRÉ
//
// Exit : 0 = aligné (ou manifeste écrit) · 1 = dérive constatée · 2 = usage.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const MANIFESTE = path.join(RACINE, 'versions-livrees.json');
const DEPOT = path.join(RACINE, '.claude', 'skills');
// Les deux registres ne portent pas leur version au même endroit — l'un est machine (JSON),
// l'autre humain (titre du .md). On lit CHACUN où il l'écrit, plutôt que d'imposer une forme
// commune qui obligerait à toucher deux registres pour corriger un manifeste.
const REGISTRES = {
  'quality-oracles': { chemin: path.join('references', 'registre-oracles.json'), forme: 'json' },
  'experts-forge': { chemin: path.join('references', 'registre-experts.md'), forme: 'titre' },
};

const args = process.argv.slice(2);
const constat = args.includes('--constat');
const livrer = args.includes('--livrer');
if (constat === livrer) {
  console.error('usage : node maj-versions-livrees.mjs (--constat | --livrer)');
  process.exit(2);
}

const versionDuFrontmatter = (fichier) => {
  const texte = fs.readFileSync(fichier, 'utf8');
  if (!texte.startsWith('---')) return null;
  const fm = texte.split('---')[1] || '';
  const m = fm.match(/version:\s*["']?([\d.]+)/);
  return m ? m[1] : null;
};

const versionDuRegistre = (skill) => {
  const spec = REGISTRES[skill];
  if (!spec) return undefined;
  const chemin = path.join(DEPOT, skill, spec.chemin);
  if (!fs.existsSync(chemin)) return undefined;
  const texte = fs.readFileSync(chemin, 'utf8');
  if (spec.forme === 'json') {
    try {
      const v = JSON.parse(texte).version;
      return typeof v === 'string' ? v.trim() : undefined;
    } catch {
      return undefined;
    }
  }
  const m = texte.match(/^#[^\n]*\bv([\d.]+)/m);
  return m ? m[1] : undefined;
};

// L'état RÉEL du dépôt — la seule source. Un skill sans champ version le DIT (`null` +
// motif), il ne disparaît pas du manifeste : un skill absent du manifeste est un skill que
// F1 ne regarde jamais, et c'est exactement l'angle mort qu'on est en train de fermer.
const reel = {};
for (const nom of fs.readdirSync(DEPOT).sort()) {
  const skillMd = path.join(DEPOT, nom, 'SKILL.md');
  if (!fs.existsSync(skillMd)) continue;
  const version = versionDuFrontmatter(skillMd);
  const entree = version
    ? { version, source: 'frontmatter SKILL.md' }
    : { version: null, source: 'frontmatter sans champ version (constat, rien d inventé)' };
  const registre = versionDuRegistre(nom);
  if (registre) entree.registre = registre;
  reel[nom] = entree;
}

const manifeste = JSON.parse(fs.readFileSync(MANIFESTE, 'utf8'));
const declare = manifeste.skills || {};

const ecarts = [];
for (const [nom, e] of Object.entries(reel)) {
  const d = declare[nom];
  if (!d) { ecarts.push(`${nom} : ABSENT du manifeste — jamais regardé par F1`); continue; }
  if ((d.version ?? null) !== (e.version ?? null)) {
    ecarts.push(`${nom} : livré ${d.version ?? 'null'}, dépôt ${e.version ?? 'null'}`);
  }
  if ((d.registre ?? null) !== (e.registre ?? null)) {
    ecarts.push(`${nom} (registre) : livré ${d.registre ?? 'null'}, dépôt ${e.registre ?? 'null'}`);
  }
}
for (const nom of Object.keys(declare)) {
  if (!reel[nom]) ecarts.push(`${nom} : au manifeste mais ABSENT du dépôt`);
}

if (constat) {
  if (!ecarts.length) { console.log('versions-livrees.json : aligné sur le dépôt.'); process.exit(0); }
  console.log(`versions-livrees.json : ${ecarts.length} écart(s) —`);
  for (const e of ecarts) console.log(`  · ${e}`);
  console.log('\n`--livrer` déclare l état actuel du dépôt comme livré. À ne jouer QUE si le lot part.');
  process.exit(1);
}

const horodatage = new Date().toISOString().slice(0, 10);
manifeste.skills = reel;
manifeste.mis_a_jour_le = `${horodatage} (maj-versions-livrees --livrer : ${ecarts.length} écart(s) soldé(s))`;
fs.writeFileSync(MANIFESTE, `${JSON.stringify(manifeste, null, 2)}\n`, 'utf8');
console.log(`versions-livrees.json écrit — ${Object.keys(reel).length} skills, ${ecarts.length} écart(s) soldé(s).`);
for (const e of ecarts) console.log(`  · ${e}`);
