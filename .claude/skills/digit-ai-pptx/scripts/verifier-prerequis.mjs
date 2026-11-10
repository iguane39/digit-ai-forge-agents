#!/usr/bin/env node
// verifier-prerequis — le module pptxgenjs se résout-il depuis le dossier de travail du deck ? (TF-2326)
// Node pur, zéro dépendance, déterministe.
//
// LE FAIT (retours du 09/11/2026). SKILL.md déclarait pptxgenjs « installé globalement ». Sur le poste,
// `npm root -g` ne le contient pas, et le script de construction sortait en code 1 sans nommer le module.
// Le module a été installé à la main dans le dossier de travail de la session (pptxgenjs@3.12.0), à
// chaque session qui rend un deck. Et une installation globale ne suffirait pas : un script de
// construction en ESM (`import … from 'pptxgenjs'`) ne consulte ni la racine globale de npm ni NODE_PATH ;
// un script CommonJS consulte NODE_PATH, jamais la racine globale. Seul un module résolu en remontant
// depuis le dossier du script le rend importable.
//
// CE QU'IL FAIT. Résout `pptxgenjs/package.json` depuis le dossier de travail (en remontant les
// `node_modules`, comme `import` le fait), rend sa version et son chemin. Il dit aussi, pour information,
// où il se trouve ailleurs (NODE_PATH, racine globale de npm) : un module qui n'existe qu'ailleurs n'est
// PAS résolu, et le message le dit avec la commande qui répare.
//
// CE QU'IL NE FAIT PAS. Il n'installe rien (aucun accès réseau, aucune écriture) et ne juge pas la
// version : la version éprouvée est nommée dans la commande d'installation, rien d'autre.
//
// Usage : node scripts/verifier-prerequis.mjs [--dossier <dossier de travail>] [--sans-global]
//   --dossier      dossier du script de construction (défaut : le dossier courant)
//   --sans-global  ne consulte pas la racine globale de npm (rejeu hors ligne, fixtures du self-test)
// Sortie : une ligne JSON sur stdout. Exit 0 (résolu depuis le dossier de travail) / 2 (non résolu).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const VERSION_EPROUVEE = '4.0.1';
const args = process.argv.slice(2);
const i = args.indexOf('--dossier');
const dossier = path.resolve(i >= 0 && args[i + 1] ? args[i + 1] : process.cwd());
const sansGlobal = args.includes('--sans-global');

function lireVersion(paquet) {
  try { return JSON.parse(fs.readFileSync(paquet, 'utf8')).version || null; } catch { return null; }
}

// 1. depuis le dossier de travail : ce que verrait `import 'pptxgenjs'`. L'import ESM remonte les dossiers
// node_modules du script et rien d'autre (ni NODE_PATH, ni la racine globale) : on fait de même, à la main.
let local = null;
for (let dir = dossier; !local; dir = path.dirname(dir)) {
  const paquet = path.join(dir, 'node_modules', 'pptxgenjs', 'package.json');
  if (fs.existsSync(paquet)) local = { chemin: path.dirname(paquet).replace(/\\/g, '/'), version: lireVersion(paquet) };
  if (path.dirname(dir) === dir) break;
}

// 2. ailleurs, pour information seulement
const ailleurs = [];
for (const d of (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)) {
  const p = path.join(d, 'pptxgenjs', 'package.json');
  if (fs.existsSync(p)) ailleurs.push({ ou: 'NODE_PATH', chemin: path.dirname(p).replace(/\\/g, '/'), version: lireVersion(p) });
}
if (!sansGlobal) {
  const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 20000, shell: process.platform === 'win32' });
  const racine = r.status === 0 ? String(r.stdout || '').trim() : '';
  const p = racine ? path.join(racine, 'pptxgenjs', 'package.json') : '';
  if (p && fs.existsSync(p)) ailleurs.push({ ou: 'racine globale de npm', chemin: path.dirname(p).replace(/\\/g, '/'), version: lireVersion(p) });
}

const commande = `npm install pptxgenjs@${VERSION_EPROUVEE}`;
const rapport = local
  ? { etat: 'resolu', module: 'pptxgenjs', version: local.version, chemin: local.chemin, dossier_de_travail: dossier.replace(/\\/g, '/'), ailleurs }
  : {
    etat: 'non-resolu',
    module: 'pptxgenjs',
    dossier_de_travail: dossier.replace(/\\/g, '/'),
    ailleurs,
    commande_d_installation: commande,
    message: `pptxgenjs ne se résout pas depuis ${dossier.replace(/\\/g, '/')} : un script de construction y sortirait en code 1. Remède : exécuter « ${commande} » dans ce dossier (version éprouvée par le skill, aucun besoin de droits d'administrateur).`
      + (ailleurs.length ? ` Le module existe ailleurs (${ailleurs.map((a) => a.ou).join(', ')}), mais un import ne le voit pas depuis ce dossier.` : ''),
  };
process.stdout.write(JSON.stringify(rapport) + '\n');
if (!local) process.stderr.write(rapport.message + '\n');
process.exit(local ? 0 : 2);
