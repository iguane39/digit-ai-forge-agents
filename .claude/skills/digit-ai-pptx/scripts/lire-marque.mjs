#!/usr/bin/env node
// lire-marque — charge le système de marque de l'ÉMETTEUR et le rend prêt à peindre une
// diapositive avec pptxgenjs. Node pur, zéro dépendance, déterministe.
//
// POURQUOI IL EXISTE (TF-1022 / TF-1023, décision humaine D-4 « 4b pour les powerpoints »,
// 11/09/2026). Jusqu'ici le skill digit-ai-pptx portait la charte EN DUR dans son texte : une
// couleur changeait chez l'émetteur, le skill continuait de peindre l'ancienne, et rien ne le
// disait. Une valeur de marque est une DONNÉE périssable, pas du code (loi transverse n° 4) :
// elle vit chez l'émetteur, datée et sourcée, et le skill la CONSOMME.
//
// CE QU'IL FAIT
//   1. résout le dossier de marque : --marque=<dossier>, sinon $DIGIT_AI_MARQUE, sinon le
//      chemin par défaut <racine des forges>/digit-ai-marketing/donnees/marque/ (Digit-AI) ;
//   2. lit la SOURCE DTCG `tokens-diapositives.tokens.json` si elle est là, sinon le dérivé
//      `tokens-diapositives.css` (--format=dtcg|css|auto force la lecture) ;
//   3. rend en JSON, par thème et par jeton : la valeur d'origine ET sa conversion pptxgenjs
//      (hex SANS dièse, pouces depuis les px à 96 px/pouce, face de police).
//
// CE QU'IL NE FAIT PAS. Il ne retombe JAMAIS sur des valeurs en dur : dossier injoignable ou
// jeton requis manquant ⇒ message clair sur stderr et exit 2, le skill rend la main.
//
// LECTURE DES THÈMES SUR LE SUPPORT DIAPOSITIVE (charte v2) : « clair » = diapositive de
// CONTENU ; « sombre » = COUVERTURE et INTERCALAIRES. Ce n'est pas une bascule utilisateur,
// c'est une navigation — le contraste signale le changement de partie.
//
//   4. (TF-2354) dit si les polices rendues sont INSTALLÉES au poste : champ `polices_poste`. Le skill exige
//      la police sur le poste de rendu et ne le vérifiait pas : sans elle, PowerPoint substitue une autre
//      face (Calibri, le 16/09/2026) et l'export PDF répète le dernier mot de chaque ligne coupée, défaut que
//      ni oracle-pptx ni oracle-charte-pptx-semantique ne voient. Un avertissement sort sur stderr pour chaque
//      police absente ; `--exiger-polices` en fait un exit 2. `--polices-installees=<fichier JSON ou liste>`
//      remplace la détection du poste (poste de rendu distant, rejeu du self-test).
//
// Sortie : JSON sur stdout. Exit 0 (lu) / 2 (dossier ou jeton manquant, ou police absente avec --exiger-polices).
// Usage : node scripts/lire-marque.mjs [--marque=<dossier>] [--format=auto|dtcg|css] [--compact]
//           [--exiger-polices] [--polices-installees=<fichier.json | Nom1,Nom2,…>]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(ICI, '..');
const PX_PAR_POUCE = 96;

const argv = process.argv.slice(2);
function opt(nom) {
  const egal = argv.find((a) => a.startsWith(`--${nom}=`));
  if (egal) return egal.slice(nom.length + 3);
  const i = argv.indexOf(`--${nom}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return '';
}

function mourir(lignes) {
  process.stderr.write(lignes.map((l) => (l ? l : '')).join('\n') + '\n');
  process.exit(2);
}

// ------------------------------------------------------------------ 1 · dossier de marque
const RACINE_FORGES = process.env.FORGE_ROOT || path.resolve(SKILL_DIR, '..', '..', '..', '..');
const DEFAUT = path.join(RACINE_FORGES, 'digit-ai-marketing', 'donnees', 'marque');

const depuisArg = opt('marque');
const depuisEnv = process.env.DIGIT_AI_MARQUE || '';
const MARQUE = path.resolve(depuisArg || depuisEnv || DEFAUT);
const ORIGINE = depuisArg ? '--marque' : depuisEnv ? 'DIGIT_AI_MARQUE' : 'chemin par défaut';

if (!fs.existsSync(MARQUE) || !fs.statSync(MARQUE).isDirectory()) {
  mourir([
    `ERREUR — dossier de marque introuvable : ${MARQUE.replace(/\\/g, '/')}`,
    `  résolu depuis : ${ORIGINE}`,
    '  REMÈDE : donner le dossier de marque de l\'émetteur par --marque=<dossier> ou par la',
    `  variable DIGIT_AI_MARQUE. Défaut Digit-AI : ${DEFAUT.replace(/\\/g, '/')}`,
    '  Le skill NE retombe PAS sur des valeurs en dur : sans dossier de marque, il rend la main.',
  ]);
}

const F_DTCG = path.join(MARQUE, 'tokens-diapositives.tokens.json');
const F_CSS = path.join(MARQUE, 'tokens-diapositives.css');
const demande = (opt('format') || 'auto').toLowerCase();
if (!['auto', 'dtcg', 'css'].includes(demande)) {
  mourir([`ERREUR — --format inconnu : ${demande} (attendu : auto, dtcg ou css)`]);
}

let format = demande;
if (format === 'auto') format = fs.existsSync(F_DTCG) ? 'dtcg' : 'css';
const FICHIER = format === 'dtcg' ? F_DTCG : F_CSS;

if (!fs.existsSync(FICHIER)) {
  mourir([
    `ERREUR — artefact de jetons absent du dossier de marque : ${FICHIER.replace(/\\/g, '/')}`,
    `  dossier lu : ${MARQUE.replace(/\\/g, '/')} (résolu depuis ${ORIGINE})`,
    '  ATTENDU : tokens-diapositives.tokens.json (source DTCG) ou tokens-diapositives.css (dérivé).',
    '  REMÈDE : régénérer les jetons du support « diapositives » chez l\'émetteur, ou désigner',
    '  un autre dossier de marque. Aucune valeur en dur n\'est substituée.',
  ]);
}

// ------------------------------------------------------------------ 2 · lecture
const THEMES = { clair: 'diapositive de contenu', sombre: 'couverture et intercalaires' };
const COULEURS_REQUISES = ['bg', 'card', 'ink', 'muted', 'line', 'blue'];
const POLICES_REQUISES = ['head', 'sans', 'mono'];
const DIMENSIONS_REQUISES = ['filet-epaisseur'];

const brut = { couleurs: { clair: {}, sombre: {} }, polices: {}, dimensions: {}, alias: {} };

function pileDepuisChaine(v) {
  return String(v)
    .split(',')
    .map((x) => x.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

if (format === 'dtcg') {
  let src;
  try {
    src = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  } catch (e) {
    mourir([`ERREUR — source DTCG illisible : ${FICHIER.replace(/\\/g, '/')}`, `  ${e.message}`]);
  }
  for (const t of Object.keys(THEMES)) {
    const g = (src.couleur && src.couleur[t]) || {};
    for (const [nom, jeton] of Object.entries(g)) {
      if (jeton && typeof jeton.$value === 'string') brut.couleurs[t][nom] = jeton.$value;
    }
  }
  for (const [nom, jeton] of Object.entries(src.typographie || {})) {
    if (!jeton) continue;
    brut.polices[nom] = Array.isArray(jeton.$value) ? jeton.$value.slice() : pileDepuisChaine(jeton.$value);
  }
  for (const groupe of ['espacement', 'rayon']) {
    for (const [nom, jeton] of Object.entries(src[groupe] || {})) {
      if (jeton && typeof jeton.$value === 'string') brut.dimensions[nom] = jeton.$value;
    }
  }
  // Alias : { couleur.sombre.bg } → la valeur du thème visé. La source DTCG garde le thème ;
  // le dérivé CSS l'aplatit sur le thème clair (var(--bg)) — d'où la préférence pour la source.
  for (const [nom, jeton] of Object.entries(src.alias || {})) {
    const ref = jeton && typeof jeton.$value === 'string' ? jeton.$value.match(/^\{(.+)\}$/) : null;
    if (!ref) continue;
    const chemin = ref[1].split('.');
    let cur = src;
    for (const seg of chemin) cur = cur && typeof cur === 'object' ? cur[seg] : undefined;
    const val = cur && cur.$value !== undefined ? cur.$value : undefined;
    if (val !== undefined) brut.alias[nom] = { vers: ref[1], valeur: Array.isArray(val) ? val[0] : val };
  }
} else {
  const css = fs.readFileSync(FICHIER, 'utf8');
  const proprietes = (bloc) => {
    const o = {};
    for (const m of bloc.matchAll(/--([A-Za-z0-9_-]+)\s*:\s*([^;}]+)[;}]/g)) o[m[1]] = m[2].trim();
    return o;
  };
  const bloc = (motif) => {
    const i = css.search(motif);
    if (i < 0) return '';
    const j = css.indexOf('{', i);
    if (j < 0) return '';
    let prof = 0;
    for (let k = j; k < css.length; k += 1) {
      if (css[k] === '{') prof += 1;
      else if (css[k] === '}') { prof -= 1; if (prof === 0) return css.slice(j + 1, k); }
    }
    return css.slice(j + 1);
  };
  const racine = proprietes(bloc(/:root\s*\{/));
  const sombre = proprietes(bloc(/:root\[data-theme=["']dark["']\]\s*\{/));
  const estCouleur = (v) => /^#[0-9A-Fa-f]{3,8}$/.test(v);
  const estDimension = (v) => /^-?\d+(\.\d+)?px$/.test(v);
  for (const [nom, val] of Object.entries(racine)) {
    if (estCouleur(val)) brut.couleurs.clair[nom] = val;
    else if (estDimension(val)) brut.dimensions[nom] = val;
    else if (POLICES_REQUISES.includes(nom)) brut.polices[nom] = pileDepuisChaine(val);
  }
  for (const [nom, val] of Object.entries(sombre)) {
    if (estCouleur(val)) brut.couleurs.sombre[nom] = val;
  }
}

// ------------------------------------------------------------------ 3 · manques
const manques = [];
for (const t of Object.keys(THEMES)) {
  for (const c of COULEURS_REQUISES) {
    if (!brut.couleurs[t][c]) manques.push(`couleur du thème « ${t} » : --${c}`);
  }
}
for (const p of POLICES_REQUISES) if (!brut.polices[p] || !brut.polices[p].length) manques.push(`police : --${p}`);
for (const d of DIMENSIONS_REQUISES) if (!brut.dimensions[d]) manques.push(`dimension : --${d}`);

if (manques.length) {
  mourir([
    `ERREUR — le système de marque lu ne porte pas tous les jetons requis par le support « diapositives ».`,
    `  dossier : ${MARQUE.replace(/\\/g, '/')} (résolu depuis ${ORIGINE})`,
    `  artefact : ${path.basename(FICHIER)} (format ${format})`,
    '  MANQUE :',
    ...manques.map((m) => `    - ${m}`),
    '  REMÈDE : compléter les jetons chez l\'émetteur puis régénérer le dérivé CSS.',
    '  Le skill NE substitue AUCUNE valeur en dur : il rend la main.',
  ]);
}

// ------------------------------------------------------------------ 4 · conversion pptxgenjs
const versPptx = (hex) => hex.replace('#', '').toUpperCase();
const pouces = (px) => Math.round((parseFloat(px) / PX_PAR_POUCE) * 10000) / 10000;

const themes = {};
for (const [t, role] of Object.entries(THEMES)) {
  const couleurs = {};
  for (const [nom, hex] of Object.entries(brut.couleurs[t])) {
    couleurs[nom] = { jeton: `--${nom}`, css: hex, pptx: versPptx(hex) };
  }
  themes[t] = { role, couleurs };
}

const polices = {};
for (const [nom, pile] of Object.entries(brut.polices)) {
  polices[nom] = { jeton: `--${nom}`, pile, pptx: pile[0] };
}

const dimensions = {};
for (const [nom, val] of Object.entries(brut.dimensions)) {
  dimensions[nom] = { jeton: `--${nom}`, css: val, px: parseFloat(val), pouces: pouces(val) };
}

const usage = (theme, jeton) => ({
  theme,
  jeton: `--${jeton}`,
  pptx: themes[theme].couleurs[jeton].pptx,
});

// ------------------------------------------------------------------ 5 · polices installées au poste (TF-2354)
const STYLES = new Set(['regular', 'bold', 'italic', 'oblique', 'light', 'medium', 'semibold', 'extrabold', 'black',
  'thin', 'extralight', 'ultralight', 'heavy', 'condensed', 'semilight', 'demibold', 'book', 'normal', 'truetype', 'opentype']);
const famille = (nom) => {
  const mots = nom.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[-_]/g, ' ').split(/\s+/).filter(Boolean);
  while (mots.length > 1 && STYLES.has(mots[mots.length - 1])) mots.pop();
  return mots.join(' ');
};
function famillesDuPoste() {
  const donnee = opt('polices-installees');
  if (donnee) {
    let liste;
    try {
      liste = fs.existsSync(donnee) ? JSON.parse(fs.readFileSync(donnee, 'utf8')) : donnee.split(',');
    } catch { liste = null; }
    if (!Array.isArray(liste)) mourir([`ERREUR — --polices-installees illisible : ${donnee} (attendu : un fichier JSON qui porte un tableau de noms, ou « Nom1,Nom2 »)`]);
    return { methode: 'liste donnée par --polices-installees', familles: new Set(liste.map((x) => famille(String(x)))) };
  }
  if (process.platform === 'win32') {
    const familles = new Set();
    let lu = false;
    for (const ruche of ['HKLM', 'HKCU']) {
      const r = spawnSync('reg', ['query', `${ruche}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`], { encoding: 'utf8', timeout: 20000 });
      if (r.status !== 0) continue;
      lu = true;
      for (const ligne of String(r.stdout || '').split(/\r?\n/)) {
        const m = ligne.match(/^\s+(.+?)\s+REG_SZ\s/);
        if (m) familles.add(famille(m[1]));
      }
    }
    return lu ? { methode: 'registre Windows des polices (HKLM et HKCU)', familles } : { methode: 'registre Windows illisible', familles: null };
  }
  const r = spawnSync('fc-list', [':', 'family'], { encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) return { methode: 'fc-list absent', familles: null };
  const familles = new Set();
  for (const ligne of String(r.stdout || '').split(/\r?\n/)) for (const f of ligne.split(',')) if (f.trim()) familles.add(famille(f));
  return { methode: 'fc-list', familles };
}
const poste = famillesDuPoste();
const pilePoste = {};
const manquantes = [];
for (const [cle, nom] of [['police_titre', polices.head.pptx], ['police_corps', polices.sans.pptx], ['police_mono', polices.mono.pptx]]) {
  const installee = poste.familles ? poste.familles.has(famille(nom)) : null;
  pilePoste[cle] = { famille: nom, installee };
  if (installee === false) manquantes.push(`${cle} (${nom})`);
}
if (manquantes.length) {
  process.stderr.write(`AVERTISSEMENT — police(s) non installée(s) au poste (${poste.methode}) : ${manquantes.join(', ')}.\n`
    + '  PowerPoint substituera une autre face en silence, et l\'export PDF peut répéter le dernier mot de chaque ligne coupée.\n'
    + '  REMÈDE : installer la police au poste de rendu, ou passer --polices-installees=<liste> si le rendu se fait ailleurs.\n');
  if (argv.includes('--exiger-polices')) process.exit(2);
}

const sortie = {
  outil: 'lire-marque',
  support: 'diapositives PowerPoint',
  lu_le: new Date().toISOString().slice(0, 10),
  source: {
    dossier_marque: MARQUE.replace(/\\/g, '/'),
    resolu_depuis: ORIGINE,
    artefact: FICHIER.replace(/\\/g, '/'),
    format,
    autorite: format === 'dtcg'
      ? 'source DTCG (fait foi)'
      : 'dérivé CSS (la source DTCG fait foi ; le dérivé aplatit les alias sur le thème clair)',
  },
  px_par_pouce: PX_PAR_POUCE,
  themes,
  polices,
  dimensions,
  alias: brut.alias,
  usages_pptx: {
    fond_contenu: usage('clair', 'bg'),
    encre_contenu: usage('clair', 'ink'),
    encre_faible_contenu: usage('clair', 'muted'),
    trait_contenu: usage('clair', 'line'),
    surface_carte: usage('clair', 'card'),
    accent_filets: usage('clair', 'blue'),
    fond_couverture: usage('sombre', 'bg'),
    encre_couverture: usage('sombre', 'ink'),
    encre_faible_couverture: usage('sombre', 'muted'),
    trait_couverture: usage('sombre', 'line'),
    accent_couverture: usage('sombre', 'blue'),
    police_titre: polices.head.pptx,
    police_corps: polices.sans.pptx,
    police_mono: polices.mono.pptx,
    filet_epaisseur_pouces: dimensions['filet-epaisseur'].pouces,
  },
  polices_poste: {
    methode: poste.methode,
    polices: pilePoste,
    manquantes,
  },
  non_juge: [
    'ne juge pas la JUSTESSE des valeurs : il lit ce que l\'émetteur déclare, il ne l\'arbitre pas',
    'ne voit pas les mentions [à valider] portées par la documentation de marque — les lire dans MARQUE.md',
    'ne contrôle ni contraste, ni accessibilité',
    'polices_poste dit ce que CE poste installe : un deck rendu sur un autre poste (collègue, serveur) exige la liste de ce poste-là par --polices-installees ; une installée:null veut dire que la détection n\'a pas pu lire le poste',
    'ne rend que les jetons présents : un jeton non requis et absent passe en silence',
  ],
};

process.stdout.write(JSON.stringify(sortie, null, argv.includes('--compact') ? 0 : 2) + '\n');
process.exit(0);
