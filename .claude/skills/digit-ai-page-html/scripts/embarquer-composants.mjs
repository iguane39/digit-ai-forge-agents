#!/usr/bin/env node
// embarquer-composants — pose dans les pages du dépôt des skills la copie À JOUR d'un
// composant du socle, et refuse toute copie qui a dérivé de sa source.
//
// LE FAIT PAYÉ, et il est daté du 02/09/2026. `digit-ai-schemas/assets/exemple-reference.html`
// embarquait une copie MANUELLE de `digit-ai-page-html/assets/table-filters.js`, collée un jour
// où elle était juste. Le composant a été corrigé QUATRE fois depuis (TF-0429/0430/0431 le 21/08,
// puis TF-0768/0769/0781/0782 le 02/09) : la copie, elle, n'a bougé d'aucun octet. Elle triait
// encore « 1 000 » comme 1, rangeait les mois par ordre alphabétique et privait de facette la
// colonne clé — dans le MÊME dépôt que les correctifs, à deux dossiers de distance.
//
// C'est la classe exacte de TF-0761/RT-39 (un générateur réécrit hors d'atteinte des
// corrections), transposée ENTRE DEUX SKILLS : le correctif ne voyage pas tout seul, et rien
// ne disait qu'une copie existait. Une copie non déclarée n'est pas une copie : c'est une
// FOURCHE silencieuse.
//
// POURQUOI UNE COPIE ET PAS UN `<script src>`. La règle A1 du socle exige une page AUTOPORTANTE :
// un livrable qui charge un fichier voisin perd son composant dès qu'il part par courriel. La
// copie est donc le prix de l'autoportance — ce qui se corrige n'est pas la copie, c'est le fait
// qu'elle soit MANUELLE. Ici elle est POSÉE À LA CONSTRUCTION, scellée par l'empreinte de sa
// source, et sa dérive est un échec (`--constat`, et l'oracle `oracle-parite-assets` du skill
// quality-oracles, qui balaie tout le dépôt sans rien écrire).
//
//   node embarquer-composants.mjs --constat   ce qui a dérivé (exit 1 si écart)
//   node embarquer-composants.mjs --ecrire    (re)pose les blocs marqués
//
// Ne touche QUE les blocs déjà marqués. Adopter une copie manuelle est un geste explicite :
// on entoure le `<script>` des deux marqueurs ci-dessous, puis `--ecrire` la met à jour.
//
//   <!-- COMPOSANT-EMBARQUE:DEBUT <fichier> ... -->
//   <script data-composant="<fichier>" data-empreinte="sha256:...">…</script>
//   <!-- COMPOSANT-EMBARQUE:FIN <fichier> -->
//
// UN BLOC PEUT VENIR D'UN AUTRE SOCLE, et il le DIT : `socle=<chemin relatif à la racine des
// skills>` dans le marqueur d'ouverture. Sans cette porte, ce poseur déclarait « composant
// inconnu » les copies de jeu d'essai des fixtures de `oracle-parite-assets` — trois faux écarts
// mesurés le 03/09, sur des blocs parfaitement en règle. Avec elle, un nom INCONNU reste un
// écart (c'est ainsi qu'une faute de frappe se voit), mais un socle DÉCLARÉ est respecté.
//
// Exit : 0 = à jour (ou écrit) · 1 = écart constaté · 2 = usage.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(ICI, '..', 'assets');
const SKILLSROOT = path.resolve(ICI, '..', '..');
const IGNORES = new Set(['.oracles', '__pycache__', 'node_modules', '.git', 'fonts']);
const SOCLE_DEFAUT = 'digit-ai-page-html/assets';

const args = process.argv.slice(2);
const constat = args.includes('--constat');
const ecrire = args.includes('--ecrire');
if (constat === ecrire) {
  console.error('usage : node embarquer-composants.mjs (--constat | --ecrire)');
  process.exit(2);
}

// L'ÉCHAPPEMENT N'EST PAS UN DÉTAIL (RA-1) : la séquence `</script` à l'intérieur d'un
// `<script>` — fût-elle dans un commentaire — ferme le bloc pour l'analyseur HTML et casse la
// page. Toute copie inlinée l'échappe ; la source, elle, ne l'échappe pas. C'est la SEULE
// transformation admise entre la source et sa copie, et elle est réversible.
export const echapper = (txt) => txt.replace(/<\/script/gi, '<\\/script');
export const sha = (txt) => crypto.createHash('sha256').update(txt, 'utf8').digest('hex');

/** Le bloc canonique d'un composant : ce que `--ecrire` pose, mot pour mot. */
export function blocCanonique(nom, source, socleRel = SOCLE_DEFAUT) {
  const balise = nom.endsWith('.css') ? 'style' : 'script';
  const corps = balise === 'script' ? echapper(source) : source;
  const declare = socleRel === SOCLE_DEFAUT ? '' : ` socle=${socleRel}`;
  return [
    `<!-- COMPOSANT-EMBARQUE:DEBUT ${nom}${declare} — copie du socle ${socleRel}/${nom},`,
    '     posée par digit-ai-page-html/scripts/embarquer-composants.mjs. NE PAS ÉDITER ICI : la SOURCE fait foi.',
    '     La copie se régénère (--ecrire) et sa dérive est refusée (--constat, oracle-parite-assets). -->',
    `<${balise} data-composant="${nom}" data-empreinte="sha256:${sha(source)}">`,
    corps.replace(/\n+$/, ''),
    `</${balise}>`,
    `<!-- COMPOSANT-EMBARQUE:FIN ${nom} -->`,
  ].join('\n');
}

const RE_DEBUT = /<!--\s*COMPOSANT-EMBARQUE:DEBUT\s+([A-Za-z0-9._-]+)(?:\s+socle=([A-Za-z0-9._/-]+))?/g;

/** Repère les blocs marqués d'un HTML : { nom, socle, debut, fin } (bornes d'octets). */
export function blocsMarques(html) {
  const trouves = [];
  RE_DEBUT.lastIndex = 0;
  let m;
  while ((m = RE_DEBUT.exec(html)) !== null) {
    const nom = m[1];
    const marqueFin = `<!-- COMPOSANT-EMBARQUE:FIN ${nom} -->`;
    const j = html.indexOf(marqueFin, m.index);
    // Un marqueur d'ouverture sans son marqueur de fermeture n'est pas un bloc : le signaler
    // plutôt que de deviner sa borne — une borne devinée réécrirait du contenu voisin.
    trouves.push({ nom, socle: m[2] || SOCLE_DEFAUT, debut: m.index, fin: j < 0 ? -1 : j + marqueFin.length });
  }
  return trouves;
}

function pages(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORES.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pages(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

// Les sources, PAR SOCLE. Le socle par défaut est celui de ce skill ; un bloc peut en déclarer
// un autre (`socle=…` au marqueur d'ouverture). Sans cette porte, ce poseur déclarait « composant
// inconnu » les trois copies de jeu d'essai des fixtures d'`oracle-parite-assets` — trois faux
// écarts sur des blocs parfaitement en règle, mesurés le 03/09 au premier passage sur l'arbre
// installé. Un nom introuvable DANS LE SOCLE DÉCLARÉ reste un écart : c'est ainsi qu'une faute
// de frappe se voit.
const socles = new Map();
function sourcesDe(socleRel) {
  if (socles.has(socleRel)) return socles.get(socleRel);
  const dir = socleRel === SOCLE_DEFAUT ? ASSETS : path.join(SKILLSROOT, socleRel);
  const m = new Map();
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const n of fs.readdirSync(dir)) {
      if (/\.(js|css)$/.test(n)) m.set(n, fs.readFileSync(path.join(dir, n), 'utf8'));
    }
  }
  socles.set(socleRel, m);
  return m;
}

const ecarts = [];
const ajour = [];
const aEcrire = new Map();
for (const fichier of pages(SKILLSROOT)) {
  let html = fs.readFileSync(fichier, 'utf8');
  const rel = path.relative(SKILLSROOT, fichier).replace(/\\/g, '/');
  let modifie = false;
  // À REBOURS : réécrire de la fin vers le début garde valides les bornes non encore traitées.
  for (const b of blocsMarques(html).sort((x, y) => y.debut - x.debut)) {
    if (b.fin < 0) { ecarts.push(`${rel} : marqueur DEBUT ${b.nom} sans marqueur FIN`); continue; }
    const src = sourcesDe(b.socle);
    if (!src.has(b.nom)) {
      ecarts.push(`${rel} : composant « ${b.nom} » introuvable dans le socle ${b.socle} `
        + "(faute de frappe, ou `socle=<chemin>` à déclarer au marqueur d'ouverture)");
      continue;
    }
    const attendu = blocCanonique(b.nom, src.get(b.nom), b.socle);
    const present = html.slice(b.debut, b.fin);
    if (present === attendu) { ajour.push(`${rel} · ${b.nom}`); continue; }
    ecarts.push(`${rel} · ${b.nom} : copie PÉRIMÉE (${present.length} octets contre ${attendu.length})`);
    html = html.slice(0, b.debut) + attendu + html.slice(b.fin);
    modifie = true;
  }
  if (modifie) aEcrire.set(fichier, html);
}

if (constat) {
  if (!ecarts.length) {
    console.log(`composants embarqués : ${ajour.length} copie(s) à la parité de leur source.`);
    for (const a of ajour) console.log(`  · ${a}`);
    process.exit(0);
  }
  console.log(`composants embarqués : ${ecarts.length} écart(s) —`);
  for (const e of ecarts) console.log(`  · ${e}`);
  console.log('\n`--ecrire` (re)pose les blocs marqués.');
  process.exit(1);
}

for (const [fichier, html] of aEcrire) fs.writeFileSync(fichier, html, 'utf8');
console.log(`composants embarqués : ${aEcrire.size} page(s) réécrite(s), `
  + `${ajour.length + ecarts.length} bloc(s) marqué(s) au total.`);
for (const e of ecarts) console.log(`  · ${e}`);
