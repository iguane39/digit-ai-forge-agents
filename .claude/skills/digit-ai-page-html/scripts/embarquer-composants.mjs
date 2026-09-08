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
//   node embarquer-composants.mjs --constat            ce qui a dérivé (exit 1 si écart)
//   node embarquer-composants.mjs --ecrire             (re)pose les blocs marqués
//   node embarquer-composants.mjs --constat <page…>    juge CES fichiers-là, où qu'ils vivent
//   node embarquer-composants.mjs --poser <page.html> --composants table-filters.js,table-filters.css
//
// TF-0890 (lot Produit-03 20260903a, 03/09/2026) — DEUX PORTES FERMÉES, ET LA SECONDE A COÛTÉ UN
// SECOND POSEUR. Ce module exportait `blocCanonique`, `echapper` et `sha`, mais son analyse
// d'arguments s'exécutait À L'IMPORT : `if (constat === ecrire) { … process.exit(2) }`. Tout
// `import { blocCanonique }` terminait donc le processus avec le code 2 AVANT le premier appel —
// une API publique qu'on ne pouvait pas appeler. Et `--ecrire` ne parcourait que l'arbre des
// SKILLS. Conséquence mesurée : pour embarquer trois composants du socle dans un livrable, un
// produit a RÉIMPLÉMENTÉ le format du bloc en Python — marqueurs, échappement de la balise de
// script fermante, trois lignes de commentaire, attributs `data-composant` et `data-empreinte`.
// Copie conforme au format, produite par un SECOND OUTIL : exactement la classe de défaut que ce
// script a été écrit pour éliminer. Trois copies dont la parité ne pouvait se rejouer que par
// l'outil maison du produit.
//
// Depuis : l'analyse d'arguments vit sous une garde de point d'entrée (le module s'importe sans
// rien exécuter), `--constat` accepte des chemins EXPLICITES, et `--poser` pose les blocs dans
// n'importe quel fichier, hors du dépôt des skills. La parité redevient jouable des deux côtés
// PAR LE MÊME CODE — comme `oracle-lot-retours.mjs` l'est pour les lots.
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
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(ICI, '..', 'assets');
const SKILLSROOT = path.resolve(ICI, '..', '..');
const IGNORES = new Set(['.oracles', '__pycache__', 'node_modules', '.git', 'fonts']);
const SOCLE_DEFAUT = 'digit-ai-page-html/assets';

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

export function pages(dir, acc = []) {
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
export function sourcesDe(socleRel) {
  if (socles.has(socleRel)) return socles.get(socleRel);
  const dir = socleRel === SOCLE_DEFAUT ? ASSETS : path.join(SKILLSROOT, socleRel);
  const m = new Map();
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const n of fs.readdirSync(dir)) {
      if (/\.(js|css)$/.test(n)) m.set(n, fs.readFileSync(path.join(dir, n), 'utf8'));
    }
  }
  // TF-0926 (08/09) — LA FEUILLE DU GABARIT, source synthétique `boilerplate.css`.
  //
  // Deux fixtures du socle portaient une copie FIGÉE du CSS de `assets/boilerplate.html`,
  // prise le 21/08 : 91 lignes du gabarit manquaient, dont le token `--hh`, le registre rouge
  // et la règle de conteneur du jour. Rien ne les rattachait à la source dont elles dérivent —
  // même classe de défaut que la copie embarquée d'un composant, sur du CSS de gabarit plutôt
  // que sur un composant, et dans le dépôt même qui édicte la parité.
  //
  // La feuille du gabarit n'est pas un fichier `.css` : elle vit DANS le HTML, et l'en sortir
  // changerait le gabarit, que tout auteur copie tel quel. Elle est donc exposée ici comme une
  // source SYNTHÉTIQUE, extraite du premier bloc `<style>` du gabarit — le poseur y devient
  // l'outil qui fait foi pour elle aussi, sans rien déplacer.
  if (socleRel === SOCLE_DEFAUT) {
    const gabarit = path.join(ASSETS, 'boilerplate.html');
    if (fs.existsSync(gabarit)) {
      const html = fs.readFileSync(gabarit, 'utf8');
      const bloc = html.match(/<style>([\s\S]*?)<\/style>/);
      if (bloc) m.set('boilerplate.css', bloc[1].replace(/^\n+/, '').replace(/\n+$/, ''));
    }
  }
  socles.set(socleRel, m);
  return m;
}

/**
 * Confronte les blocs marqués d'un HTML à leur source, et rend le HTML remis à jour.
 *
 * Fonction PURE (ne lit ni n'écrit aucun fichier) : c'est ce qui la rend jouable des deux côtés
 * — ici sur l'arbre des skills, chez un produit sur son livrable, dans un banc de test sur une
 * chaîne en mémoire. `repere` n'est qu'une étiquette pour les messages.
 */
export function confronterBlocs(html, repere = '(html)') {
  const ecarts = [];
  const ajour = [];
  let sortie = html;
  // À REBOURS : réécrire de la fin vers le début garde valides les bornes non encore traitées.
  for (const b of blocsMarques(sortie).sort((x, y) => y.debut - x.debut)) {
    if (b.fin < 0) { ecarts.push(`${repere} : marqueur DEBUT ${b.nom} sans marqueur FIN`); continue; }
    const src = sourcesDe(b.socle);
    if (!src.has(b.nom)) {
      ecarts.push(`${repere} : composant « ${b.nom} » introuvable dans le socle ${b.socle} `
        + "(faute de frappe, ou `socle=<chemin>` à déclarer au marqueur d'ouverture)");
      continue;
    }
    const attendu = blocCanonique(b.nom, src.get(b.nom), b.socle);
    const present = sortie.slice(b.debut, b.fin);
    if (present === attendu) { ajour.push(`${repere} · ${b.nom}`); continue; }
    ecarts.push(`${repere} · ${b.nom} : copie PÉRIMÉE (${present.length} octets contre ${attendu.length})`);
    sortie = sortie.slice(0, b.debut) + attendu + sortie.slice(b.fin);
  }
  return { html: sortie, ecarts, ajour, modifie: sortie !== html };
}

/**
 * POSE des composants dans une page QUELCONQUE — c'est la porte qui manquait (TF-0890).
 *
 * Un bloc DÉJÀ marqué pour ce composant est remplacé par sa forme canonique ; sinon le bloc est
 * INSÉRÉ — une feuille avant `</head>` (le style doit être connu avant la première peinture), un
 * script avant `</body>` (il opère sur un document construit). Sans point d'insertion (fragment
 * sans squelette), le bloc est ajouté en fin de chaîne plutôt que perdu en silence, et le
 * rapport le dit.
 *
 * Fonction PURE elle aussi : le produit qui l'appelle décide seul de ce qu'il écrit sur disque.
 */
export function poserComposants(html, noms, socleRel = SOCLE_DEFAUT) {
  const src = sourcesDe(socleRel);
  const poses = [];
  const manquants = [];
  let sortie = html;
  for (const nom of noms) {
    if (!src.has(nom)) { manquants.push(nom); continue; }
    const bloc = blocCanonique(nom, src.get(nom), socleRel);
    const deja = blocsMarques(sortie).find((b) => b.nom === nom && b.fin >= 0);
    if (deja) {
      sortie = sortie.slice(0, deja.debut) + bloc + sortie.slice(deja.fin);
      poses.push(`${nom} (bloc existant remis à la source)`);
      continue;
    }
    const ancre = nom.endsWith('.css') ? '</head>' : '</body>';
    const i = sortie.lastIndexOf(ancre);
    if (i < 0) {
      sortie = `${sortie.replace(/\n+$/, '')}\n${bloc}\n`;
      poses.push(`${nom} (aucun ${ancre} : bloc ajouté en fin de fichier)`);
      continue;
    }
    sortie = `${sortie.slice(0, i)}${bloc}\n${sortie.slice(i)}`;
    poses.push(`${nom} (inséré avant ${ancre})`);
  }
  return { html: sortie, poses, manquants };
}

/** Le point d'entrée en ligne de commande. Rend le code de sortie, il ne le pose pas. */
export function main(argv) {
  const args = argv.slice(2);
  const constat = args.includes('--constat');
  const ecrire = args.includes('--ecrire');
  const poser = args.includes('--poser');
  const drapeaux = [constat, ecrire, poser].filter(Boolean).length;
  if (drapeaux !== 1) {
    console.error('usage : node embarquer-composants.mjs (--constat [page…] | --ecrire | '
      + '--poser <page.html> --composants a.js,b.css)');
    return 2;
  }

  if (poser) {
    const cible = args[args.indexOf('--poser') + 1];
    const iC = args.indexOf('--composants');
    const liste = iC < 0 ? '' : (args[iC + 1] || '');
    const noms = liste.split(',').map((s) => s.trim()).filter(Boolean);
    if (!cible || cible.startsWith('--') || !noms.length) {
      console.error('usage : --poser <page.html> --composants table-filters.js,table-filters.css');
      return 2;
    }
    if (!fs.existsSync(cible)) {
      console.error(`fichier introuvable : ${cible}`);
      return 2;
    }
    const r = poserComposants(fs.readFileSync(cible, 'utf8'), noms);
    if (r.manquants.length) {
      console.error(`composant(s) introuvable(s) dans le socle ${SOCLE_DEFAUT} : `
        + `${r.manquants.join(', ')} — rien n'a été écrit.`);
      return 2;
    }
    fs.writeFileSync(cible, r.html, 'utf8');
    console.log(`composants embarqués : ${r.poses.length} bloc(s) posé(s) dans ${cible} —`);
    for (const p of r.poses) console.log(`  · ${p}`);
    console.log('\n`--constat <page.html>` rejoue la parité sur ce fichier.');
    return 0;
  }

  // `--constat` accepte des chemins EXPLICITES : c'est ce qui rend la parité jouable chez un
  // produit, sur un livrable qui ne vit pas dans l'arbre des skills.
  const explicites = args.filter((a) => !a.startsWith('--'));
  const fichiers = explicites.length ? explicites : pages(SKILLSROOT);
  const racine = explicites.length ? process.cwd() : SKILLSROOT;
  const ecarts = [];
  const ajour = [];
  const aEcrire = new Map();
  for (const fichier of fichiers) {
    if (!fs.existsSync(fichier)) { ecarts.push(`${fichier} : fichier introuvable`); continue; }
    const rel = path.relative(racine, fichier).replace(/\\/g, '/') || fichier;
    const r = confronterBlocs(fs.readFileSync(fichier, 'utf8'), rel);
    ecarts.push(...r.ecarts);
    ajour.push(...r.ajour);
    if (r.modifie) aEcrire.set(fichier, r.html);
  }

  if (constat) {
    if (!ecarts.length) {
      console.log(`composants embarqués : ${ajour.length} copie(s) à la parité de leur source.`);
      for (const a of ajour) console.log(`  · ${a}`);
      return 0;
    }
    console.log(`composants embarqués : ${ecarts.length} écart(s) —`);
    for (const e of ecarts) console.log(`  · ${e}`);
    console.log('\n`--ecrire` (re)pose les blocs marqués.');
    return 1;
  }

  for (const [fichier, html] of aEcrire) fs.writeFileSync(fichier, html, 'utf8');
  console.log(`composants embarqués : ${aEcrire.size} page(s) réécrite(s), `
    + `${ajour.length + ecarts.length} bloc(s) marqué(s) au total.`);
  for (const e of ecarts) console.log(`  · ${e}`);
  return 0;
}

// LA GARDE DE POINT D'ENTRÉE (TF-0890). Sans elle, l'analyse d'arguments s'exécutait à l'IMPORT
// et tout `import { blocCanonique }` terminait le processus avec le code 2 avant le premier
// appel. Un module qui s'exécute quand on l'importe n'a pas d'API : il n'a qu'un script.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv));
}
