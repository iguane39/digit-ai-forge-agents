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
    /* TF-2158 : les cellules BRUTES de chaque rangee d'en-tete (colonne i = cellule i de chaque rangee). */
    const rangeesEntete = thead ? [...thead[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map(r => [...r[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map(c => ({ attrs: attrs(c[1]), brut: c[2], texte: texte(c[2]) }))) : [];
    /* TF-2196 : la VALEUR DE FACETTE d'une cellule est `data-tf-valeur` quand elle existe (comme le composant,
       TF-2195), sinon son texte. `cellules` garde le marquage brut de chaque cellule du corps. */
    const rangees = tbody ? [...tbody[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map(r => [...r[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map(c => ({ attrs: attrs(c[1]), brut: c[2] }))) : [];
    const lignes = rangees.map(r => r.map(c => (c.attrs['data-tf-valeur'] !== undefined ? c.attrs['data-tf-valeur'].trim() : texte(c.brut))));
    out.push({ attrs: a, ths, rangeesEntete, lignes, cellules: rangees, ligne: html.slice(0, m.index).split('\n').length });
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

/* TF-2158 (lot Produit-86 20261104a, RP-7) — DEUX DEFAUTS D'ERGONOMIE QUE LE PORTEUR A VUS D'EMBLEE, apres
   une critique PASS et des filtres PASS : des filtres DOUBLES, et un filtre sur une colonne de 55 valeurs
   pour 3 etats. G1-G6 jugeaient le cablage, jamais l'USAGE du filtre.

   G10 — UNE COLONNE, UN SEUL CONTROLE DE FILTRE. Le composant pose une facette dans l'en-tete de CHAQUE
   colonne d'un tableau data-filterable, sauf `data-filter-col="off"`. Un second controle sur la meme colonne
   — une liste ou un champ DANS l'en-tete (autre cellule de la meme colonne, dans une rangee d'en-tete), ou
   un controle HORS du tableau qui le designe (aria-controls | data-table = id du tableau)
   et nomme la colonne (aria-label, name, data-col, data-colonne, ou son <label for>) —
   fait deux filtres pour une colonne. La sortie est l'une des deux : retirer le controle manuel, ou
   declarer la colonne hors facette (`data-filter-col="off"` + motif) quand le controle manuel est le bon.
   LIMITE DITE : un filtre pose par un script, sans controle dans le HTML source ou sans aria-controls /
   data-table vers l'id du tableau, n'est pas vu (non_juge).

   G11 — PAS DE FACETTE SUR UNE COLONNE AUX VALEURS PRESQUE TOUTES UNIQUES. Au-dela de 15 valeurs distinctes
   (la forme « recherche » du composant, references/composant-filtres-tableau.md G7) et quand au moins 90 %
   des lignes portent une valeur distincte, la facette est une liste de cases que personne ne parcourt. Le
   composant n'admet qu'une sortie, deja declaree : `data-filter-col="off"` + `data-filter-reason`. Les deux
   SEUILS (15 et 90 %) sont ceux de l'agent de TF-2158, non fondes sur une mesure du parc : le seul fait est
   le cas du porteur (55 valeurs). Sous 15 valeurs, TF-0782 s'applique : une colonne cle de 8 valeurs sur 8
   lignes GARDE sa facette. */
const SEUIL_VALEURS_UNIQUES = 15;
const PART_VALEURS_UNIQUES = 0.9;
/* G12 (TF-2196, Produit-86 RP-16 du 05/11/2026) — LE FILTRE SERT-IL A QUELQUE CHOSE ? Quatre PASS avaient
   couvert des filtres a une valeur par ligne (84 sur 84, 67 pour 3 agents) : l'oracle jugeait la PRESENCE du
   composant, pas l'UTILITE de ses valeurs. Une cellule COMPOSITE — au moins deux fragments de texte separes
   par du marquage (pastille + nom + reference) — donne au composant son texte entier pour valeur de facette,
   donc une valeur par ligne. Elle porte `data-tf-valeur` (TF-2195), ou sa colonne sort de la facette
   (`data-filter-col="off"` + motif). Une cellule a UN fragment (un badge « Clos ») n'est pas composite.
   G13 (avertissement) — autant de valeurs distinctes que de lignes dans une colonne facettee de 8 a 15 lignes
   (au-dela de 15, G11 refuse) : une facette qui ne regroupe rien. Le seuil de 8 est SEUIL_LIGNES. */
const fragmentsDeTexte = (brut) => brut.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
  .replace(/<[^>]*>/g, '\u0001').replace(/&nbsp;/g, ' ').split('\u0001').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
const estComposite = (brut) => fragmentsDeTexte(brut).length >= 2;
const TYPES_NON_FILTRE =/^(hidden|checkbox|radio|button|submit|reset|image|file)$/i;

const normaliser = (s) => texte(String(s ?? '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* Un controle de saisie qui peut filtrer : select, champ de saisie (hors case, bouton, cache), role combobox. */
function controlesDeFiltre(htmlFragment) {
  const trouves = [];
  for (const m of htmlFragment.matchAll(/<select\b([^>]*)>/gi)) trouves.push({ balise: 'select', attrs: attrs(m[1]) });
  for (const m of htmlFragment.matchAll(/<input\b([^>]*)>/gi)) {
    const a = attrs(m[1]);
    if (!TYPES_NON_FILTRE.test(a.type || 'text')) trouves.push({ balise: 'input', attrs: a });
  }
  for (const m of htmlFragment.matchAll(/<(?!select\b|input\b)[a-z]+\b([^>]*\brole\s*=\s*["']combobox["'][^>]*)>/gi)) trouves.push({ balise: 'combobox', attrs: attrs(m[1]) });
  return trouves;
}

/* Les controles HORS tableau qui designent la table `id` : { colonne (libelle normalise ou '') , balise }. */
function controlesExternes(html, id) {
  const hors = html.replace(/<table\b[\s\S]*?<\/table>/gi, '');
  const libelles = new Map();
  for (const m of hors.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) { const a = attrs(m[1]); if (a.for) libelles.set(a.for, texte(m[2])); }
  const out = [];
  for (const c of controlesDeFiltre(hors)) {
    const a = c.attrs;
    const vise = a['aria-controls'] ?? a['data-table'] ?? a['data-filtre-table'] ?? a['data-tf-table'];
    if (vise === undefined || vise.trim() !== id) continue;
    const nom = [a['aria-label'], a['data-col'], a['data-colonne'], a['name'], libelles.get(a.id)].find(v => v && v.trim());
    out.push({ colonne: nom ? normaliser(nom) : '', balise: c.balise });
  }
  return out;
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

    /* G11 (TF-2158) : une facette sur une colonne aux valeurs presque toutes uniques. */
    const premiere = t.rangeesEntete[0] || [];
    for (let i = 0; i < premiere.length; i++) {
      if (premiere[i].attrs['data-filter-col'] === 'off') continue;
      const valeurs = t.lignes.map(l => l[i] ?? '');
      const distinctes = new Set(valeurs).size;
      if (valeurs.length >= SEUIL_LIGNES && distinctes > SEUIL_VALEURS_UNIQUES && distinctes / valeurs.length >= PART_VALEURS_UNIQUES) {
        add('G11', 'bloquant', `Colonne "${premiere[i].texte}" : ${distinctes} valeurs distinctes sur ${valeurs.length} lignes (${Math.round(100 * distinctes / valeurs.length)} %) — sa facette est une liste de ${distinctes} cases que personne ne parcourt. Geste : data-filter-col="off" avec data-filter-reason sur ce <th> (la recherche de page couvre l'identifiant), seule sortie du composant (G7).`, oue);
      }
    }

    /* G12 / G13 (TF-2196) : la valeur de facette est utile. */
    for (let i = 0; i < premiere.length; i++) {
      if (premiere[i].attrs['data-filter-col'] === 'off') continue;
      const cellules = t.cellules.map(r => r[i]).filter(Boolean);
      const composites = cellules.filter(c => c.attrs['data-tf-valeur'] === undefined && estComposite(c.brut));
      /* SEUIL POSE PAR L'AGENT (TF-2196), non fonde sur une mesure du parc : la moitie des cellules de la colonne.
         Mesure du 06/11 sur les 26 pages a data-filterable du depot : sans seuil, une page (digit-ai-schemas,
         exemple-reference) bascule PASS -> FAIL sur 5 colonnes de prose dont 1 a 3 cellules portent un <code> ;
         avec, aucune ; le cas du porteur (3 fragments dans CHAQUE cellule) est refuse dans les deux cas. */
      if (composites.length && composites.length * 2 >= cellules.length) {
        add('G12', 'bloquant', `Colonne "${premiere[i].texte}" : ${composites.length} cellule(s) composite(s) sur ${cellules.length} (plusieurs fragments de texte balises, par exemple "${fragmentsDeTexte(composites[0].brut).join(' | ').slice(0, 60)}") sans data-tf-valeur — le composant prend leur texte entier pour valeur de facette, soit une valeur par ligne. Geste : data-tf-valeur="<la valeur a filtrer>" sur chaque cellule, ou data-filter-col="off" avec data-filter-reason sur ce <th>.`, oue);
      }
      const valeurs = t.lignes.map(l => l[i] ?? '');
      const distinctes = new Set(valeurs).size;
      if (valeurs.length >= SEUIL_LIGNES && valeurs.length <= SEUIL_VALEURS_UNIQUES && distinctes === valeurs.length) {
        OUT.findings.push({ regle: 'G13', severite: 'avertissement', sev: 'warn', message: `Colonne "${premiere[i].texte}" : ${distinctes} valeurs distinctes pour ${valeurs.length} lignes — la facette ne regroupe rien. Si la colonne est une cle, la recherche de page suffit (data-filter-col="off" avec data-filter-reason) ; sinon declarer la valeur a filtrer (data-tf-valeur).`, ou: oue });
      }
    }

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

  /* G10 (TF-2158) : une colonne, un seul controle de filtre. Jugee sur TOUT tableau portant un controle manuel
     ou une facette du composant — un tableau exempte (data-filterable="off") n'a pas de facette, mais deux
     controles manuels sur la meme colonne restent un doublon. */
  for (const t of toutes) {
    const premiere = t.rangeesEntete[0] || [];
    const id = t.attrs['id'];
    const facette = t.attrs['data-filterable'] !== undefined && t.attrs['data-filterable'] !== 'off';
    const externes = id ? controlesExternes(html, id) : [];
    premiere.forEach((cellule, i) => {
      const manuels = [];
      for (const rangee of t.rangeesEntete) if (rangee[i]) manuels.push(...controlesDeFiltre(rangee[i].brut).map(c => ({ ...c, lieu: "dans l'en-tete" })));
      const libelle = normaliser(cellule.texte);
      if (libelle) for (const c of externes) if (c.colonne === libelle) manuels.push({ ...c, lieu: 'hors du tableau' });
      const composant = facette && cellule.attrs['data-filter-col'] !== 'off' ? 1 : 0;
      if (composant + manuels.length >= 2) {
        add('G10', 'bloquant', `Colonne "${cellule.texte}"${id ? ` du tableau "${id}"` : ''} : ${composant + manuels.length} controles de filtre pour une seule colonne (${[composant ? 'la facette du composant' : null, ...manuels.map(c => `un ${c.balise} ${c.lieu}`)].filter(Boolean).join(' + ')}). Geste : retirer le controle manuel, ou declarer la colonne hors facette (data-filter-col="off" avec data-filter-reason) quand c'est le controle manuel qui est le bon.`, `ligne ${t.ligne}`);
      }
    });
  }

  if (filtrables > 0 && !assetPresent) add('G2', 'bloquant', 'Aucune reference a table-filters.js ni a DigitAITableFilters : le composant est declare mais absent.', 'document');
  if (filtrables > 0 && !printOk) add('G6', 'bloquant', 'Aucune regle @media print reaffichant tr[data-tf-hidden] (document ou asset externe declare) : un PDF exporte apres filtrage sortirait tronque.', 'document');

  OUT.non_juge.push('Comportement d\'execution : construction des panneaux, bascules Tous/Aucun, recherche accent-insensible, combinaison ET entre colonnes — exige un rendu navigateur (render_page.py).');
  OUT.non_juge.push('Pertinence des colonnes retenues comme categorielles : heuristique de cardinalite, non validee metier.');
  OUT.non_juge.push(`G10 (TF-2158) : seuls les controles ECRITS dans le HTML source sont vus (liste ou champ dans l'en-tete, ou controle hors tableau qui porte aria-controls / data-table = id du tableau ET nomme la colonne) — un filtre pose par un script, une tuile KPI (data-kpi-table) ou un controle qui ne designe pas le tableau ne sont pas comptes.`);
  OUT.non_juge.push(`G11 (TF-2158) : seuils de ${SEUIL_VALEURS_UNIQUES} valeurs distinctes et de ${Math.round(PART_VALEURS_UNIQUES * 100)} % de lignes distinctes — poses par l'agent de TF-2158, non fondes sur une mesure du parc ; seules les lignes du premier <tbody> sont comptees.`);
  OUT.non_juge.push(`G12/G13 (TF-2196) : G12 refuse une colonne dont la moitie au moins des cellules sont composites (seuil pose par l'agent) ; une cellule est composite quand elle porte au moins deux fragments de texte separes par du marquage — un script qui remplit les cellules apres le chargement n'est pas vu ; G13 s'arrete a ${SEUIL_VALEURS_UNIQUES} lignes (au-dela, G11 refuse) et signale une valeur par ligne, pas la pertinence d'un regroupement.`);
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
