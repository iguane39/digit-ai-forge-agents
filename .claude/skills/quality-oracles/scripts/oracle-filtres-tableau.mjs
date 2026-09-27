#!/usr/bin/env node
/* Oracle — Filtres de colonne sur les tableaux de donnees (checklist G1-G6).
   Domaine : composants interactifs des pages HTML autonomes Digit-AI.
   Contrat : {oracle,domaine,artefact,verdict,findings[],non_juge[]} — exit 0 PASS / 1 FAIL / 2 INCONCLUSIF.
   Regle : references/composant-filtres-tableau.md

   Portee du controle : le CABLAGE statique. Le comportement d'execution (construction des
   panneaux, bascules Tous/Aucun, recherche, combinaison ET) exige un rendu navigateur et est
   declare en non_juge — le passer a render_page.py (V1-V7).

   RS-1 (TF-0837, 05/09) : G3 (initialisation) et G6 (regle print) admettent desormais un
   asset DECLARE — <script src> / <link rel="stylesheet" href> resolu depuis le fichier
   audite — en plus du contenu inline. Une application dont la CSP est script-src 'self'
   (donc sans script inline ni nonce disponible) n'a plus a dupliquer l'init ou la regle
   print dans le document : la reference suffit, a condition que le fichier reference
   existe et porte reellement le motif — la seule presence d'un src/href ne suffit jamais
   (voir fixtures/filtres-rouge-cspexterne.html). */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SEUIL_LIGNES = 8;
const OUT = { oracle: 'filtres-tableau', domaine: 'Composant filtres de tableau', artefact: null, verdict: 'INCONCLUSIF', findings: [], non_juge: [] };

const add = (regle, severite, message, ou) => OUT.findings.push({ regle, severite, message, ou });

/* ---------- extraction ---------- */

function attrs(balise) {
  const a = {};
  for (const m of balise.matchAll(/([\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) a[m[1].toLowerCase()] = m[3] ?? m[4] ?? '';
  for (const m of balise.matchAll(/(?:^|\s)([\w-]+)(?=\s|$|>)/g)) if (!(m[1].toLowerCase() in a) && m[1].toLowerCase() !== 'table') a[m[1].toLowerCase()] = '';
  return a;
}

function texte(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function tables(html) {
  const out = [];
  for (const m of html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)) {
    const a = attrs(m[1]);
    const thead = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(m[2]);
    const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(m[2]);
    const ths = thead ? [...thead[1].matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi)].map(t => ({ attrs: attrs(t[1]), texte: texte(t[2]) })) : [];
    const lignes = tbody ? [...tbody[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map(r => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => texte(c[1]))) : [];
    out.push({ attrs: a, ths, lignes, ligne: html.slice(0, m.index).split('\n').length });
  }
  return out;
}

/* Colonne categorielle : valeurs repetees (cardinalite < nb lignes). */
function colonnesCategorielles(t) {
  const n = t.lignes.length, cols = [];
  const largeur = Math.max(0, ...t.lignes.map(l => l.length));
  for (let i = 0; i < largeur; i++) {
    const forcee = t.ths[i]?.attrs['data-filter-col'];
    if (forcee === 'off') continue;
    const distinctes = new Set(t.lignes.map(l => l[i] ?? ''));
    if (forcee !== undefined || (distinctes.size > 1 && distinctes.size < n)) cols.push(i);
  }
  return cols;
}

/* RS-1 (TF-0837) : assets externes declares par le document (script src / link href
   stylesheet), lus depuis le dossier du fichier audite. Une URL distante (http/https)
   est hors de portee d'un controle statique local et n'est pas lue. Une reference dont
   le fichier n'existe pas sur disque est nommee dans non_juge, jamais silencieuse. */
function referencesExternes(html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map(m => attrs(m[1])).filter(a => a.src).map(a => a.src);
  const styles = [...html.matchAll(/<link\b([^>]*)>/gi)].map(m => attrs(m[1])).filter(a => (a.rel || '').toLowerCase() === 'stylesheet' && a.href).map(a => a.href);
  return [...scripts, ...styles];
}

/* Un commentaire n'est pas du cablage : sans ce nettoyage, l'en-tete de doc de
   table-filters.js ("...la regle @media print du livrable doit reafficher
   tr[data-tf-hidden]...") satisferait G6 par sa seule PROSE sur toute page qui
   reference la librairie — constate en fixture rouge pendant le durcissement de RS-1. */
function sansCommentaires(texte) {
  return texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
}

/* RS-1 bis (TF-0837, 08/09) : DEUX formes de reference qu'une application SERVIE emploie
   ordinairement echappaient encore a RS-1, et leur effet etait exactement le defaut que
   RS-1 corrige — la page devait dupliquer l'init inline sous nonce. Mesure du 08/09 sur
   banc jetable : une page dont les assets sont declares « /assets/init.js » (forme
   racine-relative, celle d'une application servie depuis sa racine web) rendait G3 ET G6
   bloquants ; idem avec un suffixe de cache « init.js?v=3 ».
   RIEN N'EST ASSOUPLI : le fichier doit toujours EXISTER et porter reellement le motif hors
   commentaire. Seule sa LOCALISATION est corrigee. La racine du document n'est pas
   connaissable d'un controle statique sur fichier : une reference racine-relative est donc
   cherchee en REMONTANT depuis le dossier de la page, premiere resolution existante gagne.
   Sans resolution, la reference reste « manquante » et G3/G6 restent bloquants. */
const REMONTEE_MAX = 8;

function cheminsCandidats(dossier, url) {
  const propre = url.split('#')[0].split('?')[0];      // ancre et suffixe de cache-busting
  if (!propre) return [];
  if (!propre.startsWith('/')) return [resolve(dossier, propre)];
  const candidats = [];
  let courant = dossier;
  for (let i = 0; i <= REMONTEE_MAX; i++) {
    candidats.push(resolve(courant, '.' + propre));
    const parent = dirname(courant);
    if (parent === courant) break;                     // racine du systeme de fichiers
    courant = parent;
  }
  return candidats;
}

function corpusExterne(html, cheminPage) {
  if (!cheminPage) return { texte: '', lues: [], manquantes: [] };
  const dossier = dirname(cheminPage);
  const lues = [], manquantes = [];
  let texte = '';
  for (const url of referencesExternes(html)) {
    if (/^(https?:)?\/\//i.test(url)) continue;
    let contenu = null;
    for (const candidat of cheminsCandidats(dossier, url)) {
      try { contenu = readFileSync(candidat, 'utf8'); break; } catch { /* on tente le parent */ }
    }
    if (contenu === null) { manquantes.push(url); continue; }
    texte += '\n' + sansCommentaires(contenu);
    lues.push(url);
  }
  return { texte, lues, manquantes };
}

/* ---------- controles ---------- */

function controler(html, chemin) {
  OUT.artefact = chemin;

  const { texte: externe, lues, manquantes } = corpusExterne(html, chemin);
  const corpus = html + externe;

  const assetPresent = /<script[^>]+src\s*=\s*["'][^"']*table-filters\.js/i.test(html) || /DigitAITableFilters\s*=/.test(html);
  const initAll = /DigitAITableFilters\s*\.\s*initAll\s*\(/.test(corpus);
  const printOk = /@media\s+print[\s\S]{0,600}?tr\s*\[\s*data-tf-hidden\s*\]/i.test(corpus);

  const toutes = tables(html);
  let enPerimetre = 0, exemptees = 0, filtrables = 0;

  for (const t of toutes) {
    const oue = `ligne ${t.ligne}`;
    const cols = colonnesCategorielles(t);
    const dansPerimetre = t.lignes.length >= SEUIL_LIGNES && cols.length > 0;
    const marque = t.attrs['data-filterable'];

    if (marque === 'off') {
      exemptees++;
      if (!t.attrs['data-filterable-reason']) add('G1', 'bloquant', 'Exemption data-filterable="off" sans data-filterable-reason : une exemption sans motif est un echec, pas une exemption.', oue);
      continue;
    }
    if (!dansPerimetre && marque === undefined) continue;

    if (dansPerimetre) enPerimetre++;
    if (marque === undefined) { add('G1', 'bloquant', `Tableau de ${t.lignes.length} lignes avec ${cols.length} colonne(s) categorielle(s) sans data-filterable ni exemption motivee.`, oue); continue; }

    filtrables++;
    const id = t.attrs['id'];

    if (!id) add('G4', 'bloquant', 'Tableau data-filterable sans attribut id : le composant ne peut ni etre initialise ni relie a son compteur.', oue);
    if (!t.ths.length) add('G4', 'bloquant', 'Tableau data-filterable sans <thead> porteur de <th> : prerequis du composant.', oue);

    if (!initAll && id) {
      const initCible = new RegExp(`DigitAITableFilters\\s*\\.\\s*init\\s*\\([^)]*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(corpus);
      if (!initCible) add('G3', 'bloquant', `Tableau "${id}" jamais initialise : ni initAll(), ni init() le designant (document ou asset externe declare).`, oue);
    }

    if (id) {
      const cpt = new RegExp(`<[^>]+data-tf-count-for\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i').exec(html);
      if (!cpt) add('G5', 'bloquant', `Aucun compteur data-tf-count-for="${id}" : l'utilisateur ne peut pas savoir combien de lignes sont masquees.`, oue);
      else if (!/aria-live\s*=\s*["']polite["']/i.test(cpt[0])) add('G5', 'bloquant', `Compteur de "${id}" sans aria-live="polite" : le changement n'est pas annonce aux lecteurs d'ecran.`, oue);
    }
  }

  if (filtrables > 0 && !assetPresent) add('G2', 'bloquant', 'Aucune reference a table-filters.js ni a DigitAITableFilters : le composant est declare mais absent.', 'document');
  if (filtrables > 0 && !printOk) add('G6', 'bloquant', 'Aucune regle @media print reaffichant tr[data-tf-hidden] (document ou asset externe declare) : un PDF exporte apres filtrage sortirait tronque.', 'document');

  OUT.non_juge.push('Comportement d\'execution : construction des panneaux, bascules Tous/Aucun, recherche accent-insensible, combinaison ET entre colonnes — exige un rendu navigateur (render_page.py).');
  OUT.non_juge.push('Pertinence des colonnes retenues comme categorielles : heuristique de cardinalite, non validee metier.');
  if (exemptees) OUT.non_juge.push(`${exemptees} tableau(x) exempte(s) par data-filterable="off" — non juge(s).`);
  if (lues.length) OUT.non_juge.push(`Assets externes lus pour G3/G6 (RS-1) : ${lues.join(', ')}.`);
  if (manquantes.length) OUT.non_juge.push(`Assets externes references mais illisibles depuis le dossier de la page — G3/G6 juges sans leur contenu : ${manquantes.join(', ')}.`);

  /* Un bloquant prime sur tout : un PASS portant un finding bloquant serait un oracle qui ment
     (cas des exemptions non motivees, qui sortent de la boucle avant les compteurs). */
  const bloquants = OUT.findings.filter(f => f.severite === 'bloquant').length;
  if (bloquants) OUT.verdict = 'FAIL';
  else if (enPerimetre === 0 && filtrables === 0) { OUT.verdict = 'PASS'; OUT.non_juge.push('Aucun tableau en perimetre (seuil : >= 8 lignes et >= 1 colonne categorielle).'); }
  else OUT.verdict = 'PASS';

  return OUT.verdict === 'PASS' ? 0 : 1;
}

/* ---------- entree ---------- */

const chemin = process.argv[2];
if (!chemin) { OUT.verdict = 'INCONCLUSIF'; add('—', 'bloquant', 'Usage : node oracle-filtres-tableau.mjs <page.html>', 'cli'); console.log(JSON.stringify(OUT, null, 2)); process.exit(2); }

let code = 2;
try { code = controler(readFileSync(chemin, 'utf8'), chemin); }
catch (e) { OUT.verdict = 'INCONCLUSIF'; add('—', 'bloquant', `Lecture impossible : ${e.message}`, chemin); code = 2; }

console.log(JSON.stringify(OUT, null, 2));
process.exit(code);
