#!/usr/bin/env node
// embarquer-polices — inline les WOFF2 du skill en `@font-face` data: dans les gabarits.
//
// TF-0336 (18/08/2026). Depuis TF-0308, les gabarits ne chargent plus les polices par le
// réseau : un livrable qui téléphone au chargement signale au serveur tiers quand et d'où il
// est lu, et perd son rendu hors ligne. Le rendu fidèle venait alors des WOFF2 installés au
// cache fontconfig par `render_schema.py` — c'est-à-dire d'une PROPRIÉTÉ DU POSTE.
//
// Conséquence : un gabarit ouvert ailleurs (autre machine, client, revue) retombe sur la pile
// système, et personne ne le sait — un titre en repli système se voit, mais seulement si on
// sait quoi regarder. La fidélité typographique dépendait d'un équipement, pas du fichier.
// C'est la loi 1 à l'envers : une affordance qui n'existe que sur un poste n'est pas câblée.
//
// Le remède : les faces vivent DANS le fichier, en base64. La page reste autonome (A1), elle
// ne téléphone toujours pas, et elle est fidèle partout.
//
// PÉRIMÈTRE ASSUMÉ, et déclaré au CSS produit : sous-ensemble `latin` seulement, et seules
// les graisses réellement employées par les gabarits. `latin-ext` (polonais, tchèque, turc…)
// double le poids pour un besoin qu'aucun gabarit n'exprime aujourd'hui — il s'ajoute ici en
// une ligne le jour où un schéma en a besoin. Un écart se déclare, il ne se devine pas.
//
//   node embarquer-polices.mjs --constat   ce qui manque ou a dérivé (exit 1 si écart)
//   node embarquer-polices.mjs --ecrire    (re)pose le bloc dans les gabarits
//
// Exit : 0 = à jour (ou écrit) · 1 = écart constaté · 2 = usage.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(ICI, 'fonts');
const ASSETS = path.join(ICI, '..', 'assets');

// Les graisses relevées dans les gabarits le 18/08 : 400, 500, 600, 700, 800.
// JetBrains Mono n'existe pas en 600/800 au bundle — on ne déclare que ce qui existe, jamais
// une face qu'un navigateur devrait synthétiser en croyant l'avoir.
const FACES = [
  ['Roboto', 'roboto', [400, 500, 700, 800, 900]],
  ['DM Sans', 'dm-sans', [400, 500, 600, 700]],
  ['JetBrains Mono', 'jetbrains-mono', [400, 500, 700]],
];

const DEBUT = '/* POLICES-EMBARQUEES:DEBUT — généré par scripts/embarquer-polices.mjs, ne pas éditer */';
const FIN = '/* POLICES-EMBARQUEES:FIN */';

const args = process.argv.slice(2);
const constat = args.includes('--constat');
const ecrire = args.includes('--ecrire');
if (constat === ecrire) {
  console.error('usage : node embarquer-polices.mjs (--constat | --ecrire)');
  process.exit(2);
}

const manquantes = [];
const blocs = [
  DEBUT,
  '/* Sous-ensemble latin uniquement, graisses employées par les gabarits. `latin-ext` est un',
  '   écart ASSUMÉ : il double le poids pour un besoin qu aucun gabarit n exprime — l ajouter',
  '   ici le jour où un schéma porte du polonais, du tchèque ou du turc. */',
];
let poids = 0;
for (const [famille, prefixe, graisses] of FACES) {
  for (const graisse of graisses) {
    const fichier = path.join(FONTS, `${prefixe}-latin-${graisse}-normal.woff2`);
    if (!fs.existsSync(fichier)) { manquantes.push(path.basename(fichier)); continue; }
    const octets = fs.readFileSync(fichier);
    poids += octets.length;
    blocs.push(
      '@font-face {',
      `  font-family: '${famille}';`,
      '  font-style: normal;',
      `  font-weight: ${graisse};`,
      '  font-display: swap;',
      `  src: url(data:font/woff2;base64,${octets.toString('base64')}) format('woff2');`,
      '}',
    );
  }
}
blocs.push(FIN);
const bloc = blocs.join('\n');

// Seules les PAGES reçoivent les faces. Les fragments de canevas (pas de `<head>`) sont
// insérés dans `template-multi-bandes.html`, qui les porte déjà : les y dupliquer ajouterait
// 300 Ko par insertion pour la même police. Le critère est structurel — présence d'un
// `<head>` — pas une liste nominative qui périmerait au prochain canevas.
const estPage = (html) => /<head[\s>]/i.test(html);
const tous = fs.readdirSync(ASSETS).filter((n) => n.endsWith('.html')).sort();
const fragments = [];
const gabarits = tous.filter((n) => {
  const page = estPage(fs.readFileSync(path.join(ASSETS, n), 'utf8'));
  if (!page) fragments.push(n);
  return page;
});
const ecarts = [];
for (const nom of gabarits) {
  const chemin = path.join(ASSETS, nom);
  const html = fs.readFileSync(chemin, 'utf8');
  const i = html.indexOf(DEBUT);
  const j = html.indexOf(FIN);
  if (i < 0 || j < 0) { ecarts.push(`${nom} : aucun bloc de polices embarquées`); continue; }
  if (html.slice(i, j + FIN.length) !== bloc) ecarts.push(`${nom} : bloc PÉRIMÉ`);
}

if (manquantes.length) {
  console.error(`WOFF2 absents de scripts/fonts/ : ${manquantes.join(', ')}`);
  process.exit(1);
}

if (constat) {
  if (!ecarts.length) {
    console.log(`polices embarquées : ${gabarits.length} page(s) à jour `
      + `(${blocs.filter((l) => l === '@font-face {').length} faces, ${Math.round(poids / 1024)} Ko bruts).`);
    if (fragments.length) {
      console.log(`  fragments SANS <head>, servis par leur page hôte : ${fragments.join(', ')}`);
    }
    process.exit(0);
  }
  console.log(`polices embarquées : ${ecarts.length} écart(s) —`);
  for (const e of ecarts) console.log(`  · ${e}`);
  console.log('\n`--ecrire` (re)pose le bloc.');
  process.exit(1);
}

let touches = 0;
for (const nom of gabarits) {
  const chemin = path.join(ASSETS, nom);
  let html = fs.readFileSync(chemin, 'utf8');
  const i = html.indexOf(DEBUT);
  const j = html.indexOf(FIN);
  if (i >= 0 && j >= 0) {
    if (html.slice(i, j + FIN.length) === bloc) continue;
    html = html.slice(0, i) + bloc + html.slice(j + FIN.length);
  } else {
    // Premier <style> du fichier : les faces doivent précéder toute règle qui les emploie.
    const k = html.indexOf('<style>');
    if (k < 0) { console.warn(`${nom} : page sans <style> — bloc non posé, à déclarer`); continue; }
    html = `${html.slice(0, k + '<style>'.length)}\n${bloc}\n${html.slice(k + '<style>'.length)}`;
  }
  fs.writeFileSync(chemin, html, 'utf8');
  touches += 1;
}
if (fragments.length) {
  console.log(`fragments SANS <head>, servis par leur page hôte (aucune duplication) : ${fragments.join(', ')}`);
}
console.log(`polices embarquées dans ${touches} page(s) sur ${gabarits.length} `
  + `(${Math.round(poids / 1024)} Ko bruts, ~${Math.round((poids * 4 / 3) / 1024)} Ko en base64 par fichier).`);
