#!/usr/bin/env node
// promesses-verifiees — ce fichier ADHÈRE au contrôle des promesses de commentaire
// (`oracle-promesses`, règle PR1 du pilot) : une classe ou un attribut nommé dans un commentaire
// ici DOIT exister dans le code. Un générateur de page est l'endroit où une promesse de prose coûte
// le plus cher — elle s'y lit comme une garantie de ce que la page contient. Signé le 23/08/2026,
// choix humain « signer tout ce qui est propre dans les forges » ; joué avant signature, zéro constat.
//
// qo-gate-write.mjs — hook C7 : application de la loi qualité à l'ÉCRITURE (quality-oracles).
// Complément de qo-gate.mjs (C6), qui ne couvre que la diffusion (present_files/upload/Artifact).
//
// Pourquoi PostToolUse et non PreToolUse : avant une écriture, le fichier n'existe pas encore
// (création) ou porte encore l'ancienne version (écrasement) — un contrôle en amont jugerait
// du vide ou du contenu précédent. En PostToolUse le fichier est celui qui vient d'être écrit.
// Le hook ne bloque donc pas l'écriture (déjà faite) mais bloque le FLUX : exit 2 renvoie le
// verdict à Claude, qui doit traiter l'échec avant d'enchaîner.
//
// Réglages arbitrés le 08/08/2026 : livrables seulement · bloquant · --niveau note à l'écriture
// (--niveau production reste porté par C6 à la diffusion).
//
// SOURCE VERSIONNÉE (TF-0282, 15/08/2026). Ce fichier ne vivait qu'en copie installée sous
// `~/.claude/hooks/` — aucune forge ne le versionnait, donc aucune correction n'était traçable
// ni rejouable. Il est désormais versionné ici ; la copie installée s'en déduit par copie.
// Self-test : `node qo-gate-write.mjs --self-test`.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const EXT_LIVRABLES = new Set(['.html', '.htm', '.md', '.pptx', '.xlsx', '.docx', '.pdf', '.svg', '.csv']);

// Un chemin contenant l'un de ces segments n'est pas un livrable.
// `fixtures` est capital : une fixture rouge DOIT échouer, la bloquer rendrait tout oracle
// inécrivable (standard §3 : un oracle qui ne sait pas échouer n'est pas un oracle).
const SEGMENTS_EXCLUS = [
  'node_modules', '.git', 'fixtures', '__pycache__', '.venv', 'venv',
  'dist', 'build', 'htmlcov', '.oracles-goldens', 'scratchpad', 'AppData'
];

// Exemption par CONTENU (TF-0282), complément de l'exemption par SEGMENT ci-dessus.
// Le hook jugeait un FRAGMENT de moteur de templates comme une page autonome : `base.html`
// (blocs `{% %}`, tokens liés par `<link>` au lieu d'être déclarés dans le fichier) était
// bloqué pour « aucun token déclaré ». Écrire un template SSR par l'outil d'édition devenait
// impossible — coût réel payé le 15/08 : écriture par la voie shell, c'est-à-dire un gate
// contourné, donc plus un gate du tout. Un fragment n'est pas un livrable : il n'a ni <html>
// ni tokens propres par construction, et c'est la page RENDUE qui se juge.
// Extensions concernées : HTML seulement — un .md ou un .csv qui contient « {{ » cite le plus
// souvent une syntaxe, il ne l'exécute pas.
const EXT_TEMPLATE = new Set(['.html', '.htm']);
const MARQUEURS_TEMPLATE = [
  { motif: /\{%[-+]?\s*\w+/, nom: 'bloc Jinja/Django `{% ... %}`' },
  { motif: /\{\{[^{}]{1,200}\}\}/, nom: 'interpolation `{{ ... }}`' },
];

// Ce que cette exemption NE juge PAS — dit ici, et redit au verdict quand elle s'applique.
const NON_JUGE = [
  "les moteurs de templates à marqueurs exotiques (ERB `<% %>`, Blade `@if`, Handlebars/Mustache " +
  "sans accolades doubles, Twig hors syntaxe Jinja) : ils ne sont PAS reconnus et restent jugés " +
  "comme des pages autonomes — l'exemption se déclare, elle ne se devine pas",
  "une vraie page autonome qui CITE de la syntaxe Jinja (documentation, exemple en <code>) : elle " +
  "sera exemptée à tort — l'exemption est déclarée au verdict pour que ce cas soit visible",
  "la qualité du template lui-même — ce hook décide s'il y a lieu de juger, pas ce que vaut le fichier",
  "la page RENDUE par le template : elle, se juge normalement quand elle est écrite",
];

/** Marqueur de moteur de templates trouvé dans ce contenu ? (nom du marqueur, ou null) */
function marqueurDeTemplate(contenu) {
  for (const { motif, nom } of MARQUEURS_TEMPLATE) if (motif.test(contenu)) return nom;
  return null;
}

/** Pourquoi ce fichier n'est PAS soumis aux oracles — ou null s'il doit l'être.
 *  Fonction pure (le contenu est passé, jamais relu) : c'est elle que le self-test éprouve. */
function motifExemption(cible, contenu) {
  if (!EXT_LIVRABLES.has(path.extname(cible).toLowerCase())) return 'extension non livrable';
  const segments = cible.split(/[\\/]+/);
  const exclu = segments.find(s => SEGMENTS_EXCLUS.includes(s));
  if (exclu) return `segment de chemin exclu (${exclu})`;
  if (EXT_TEMPLATE.has(path.extname(cible).toLowerCase())) {
    const marqueur = marqueurDeTemplate(contenu);
    if (marqueur) return `fragment de moteur de templates (${marqueur})`;
  }
  return null;
}

const MAX_ECHECS = 3;                       // §5 : boucle bornée, puis handoff humain
const COMPTEUR = path.join(os.tmpdir(), 'qo-gate-write-echecs.json');

const sortie = (code, msg) => { if (msg) console.error(msg); process.exit(code); };

if (process.argv.includes('--self-test')) process.exit(selfTest());

let input = '';
try { input = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
let j = {}; try { j = JSON.parse(input); } catch { process.exit(0); }

const ti = j.tool_input || {};
const cible = [ti.file_path, ti.path, ti.notebook_path].find(v => typeof v === 'string' && v);
if (!cible) process.exit(0);

// filtres : extension livrable, fichier réellement présent, hors segments techniques
if (!EXT_LIVRABLES.has(path.extname(cible).toLowerCase())) process.exit(0);
const segments = cible.split(/[\\/]+/);
if (segments.some(s => SEGMENTS_EXCLUS.includes(s))) process.exit(0);
try { if (!fs.statSync(cible).isFile()) process.exit(0); } catch { process.exit(0); }

// filtre de CONTENU (TF-0282) : un fragment de moteur de templates n'est pas une page.
// L'exemption est DÉCLARÉE — un contrôle qui s'écarte en silence est indistinguable d'un
// contrôle qui n'existe pas — et sa limite est dite avec elle.
let contenu = '';
try { contenu = fs.readFileSync(cible, 'utf8'); } catch { /* binaire ou illisible : on juge */ }
const exemption = motifExemption(cible, contenu);
if (exemption && exemption.startsWith('fragment de moteur de templates')) {
  sortie(0, `qo-gate-write : « ${path.basename(cible)} » EXEMPTÉ — ${exemption}. Un fragment n'a ni `
    + `<html> ni tokens propres par construction : c'est la page rendue qui se juge. Limite de `
    + `cette exemption : ${NON_JUGE[0]}`);
}

// résolution de run-oracles : projet courant d'abord, puis niveau utilisateur
const roots = [
  process.env.CLAUDE_PROJECT_DIR && path.join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'skills'),
  j.cwd && path.join(j.cwd, '.claude', 'skills'),
  path.join(process.cwd(), '.claude', 'skills'),
  path.join(os.homedir(), '.claude', 'skills')
].filter(Boolean);
const runner = roots.map(r => path.join(r, 'quality-oracles', 'scripts', 'run-oracles.mjs')).find(p => fs.existsSync(p));
if (!runner) process.exit(0);                // projet hors forge : la loi ne s'applique pas

// garde anti-boucle : au-delà de MAX_ECHECS passes en échec sur le même fichier, on laisse
// passer avec un avertissement explicite plutôt que d'empêcher tout travail sur un faux positif.
const lire = () => { try { return JSON.parse(fs.readFileSync(COMPTEUR, 'utf8')); } catch { return {}; } };
const ecrire = o => { try { fs.writeFileSync(COMPTEUR, JSON.stringify(o)); } catch { /* best effort */ } };
const cle = path.resolve(cible);
const compte = lire();

const r = spawnSync(process.execPath, [runner, cible, '--profil', 'digit-ai', '--niveau', 'note'], {
  encoding: 'utf8', timeout: 120000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
});

if (r.status === 0) {                        // PASS : on repart de zéro sur ce fichier
  if (compte[cle]) { delete compte[cle]; ecrire(compte); }
  process.exit(0);
}

// ── LE DELTA D'UNE ÉDITION, ET NON LE FICHIER ENTIER (D-33 (a), 01/09/2026) ──────────────
//
// LE FAIT, mesuré le 31/08 en exécutant TF-0690 : l'ajout de TROIS LIGNES de pied de page à
// quatre gabarits de la bibliothèque a été bloqué ici, au motif de défauts qui PRÉEXISTAIENT
// tous à l'édition — police, couleurs en dur, tables sans reflow. La preuve que ce n'était pas
// le delta : le fichier NON TOUCHÉ d'une troisième famille portait les mêmes motifs. Un gate
// d'écriture qui juge le fichier entier transforme chaque défaut historique en PÉAGE sur toute
// édition future : corriger une ligne exige alors de refondre le fichier, ou de passer en
// force. Le 15/08 avait déjà montré où mène le péage — écriture par la voie shell, c'est-à-dire
// un gate contourné, donc plus un gate du tout.
//
// CE QUI EST FAIT : quand les oracles échouent, on rejoue les MÊMES oracles sur la version de
// `HEAD` du même fichier. Un constat présent des deux côtés est PRÉEXISTANT — il est nommé,
// jamais imputé à cette édition. Ne bloquent que les constats NEUFS. Si aucun n'est neuf, le
// flux passe et le verdict DIT ce qui reste dû sur ce fichier : la dette ne disparaît pas, elle
// cesse d'être un péage.
//
// L'IDENTITÉ D'UN CONSTAT, et c'est le point délicat. Comparer les lignes telles quelles
// produirait des faux « neufs » au premier décalage de numéro de ligne — or ajouter trois
// lignes en décale forcément. L'identité est donc la ligne CHIFFRES MASQUÉS. Le comptage, lui,
// n'est pas jeté : si le premier nombre de la ligne AUGMENTE, le constat est traité comme neuf
// (une occurrence de plus est une occurrence introduite). Limite assumée et déclarée : deux
// constats de même classe dont aucun compteur ne bouge se confondent.
//
// TROIS GARDES, parce qu'un gate qui s'ouvre par erreur est pire qu'un gate absent :
//   · fichier NON SUIVI par git, hors dépôt, ou `HEAD` illisible → aucun delta calculable, on
//     bloque comme avant. « Je ne sais pas » ne vaut jamais « c'est bon » ;
//   · la seconde passe est bornée dans le temps comme la première ; un dépassement retombe sur
//     le comportement d'avant ;
//   · le plafond de passes et le handoff humain restent inchangés.
// Les deux helpers d'identité vivent DANS `partagerConstats`, et pas ici : le banc appelle la
// fonction avant que les `const` du corps du hook ne soient évalués — `--self-test` sort tout en
// haut —, et une zone morte temporelle y transformait cinq cas en échecs MUETS, avalés par le
// `try/catch` du banc. Mesuré le 01/09 : 5 cas sur 6 rouges pour cette seule raison. Un banc qui
// échoue pour la mauvaise cause est pire qu'un banc absent : il fait chercher le défaut là où il
// n'est pas.
const lignesFautives = (sortie) => (sortie || '').split('\n')
  .filter(l => l.includes('❌') || l.includes('NON CONFORME') || l.includes('FAIL'));

/** Les constats de la version HEAD du même fichier, ou null si le delta n'est pas calculable. */
function constatsAvant(chemin) {
  const dir = path.dirname(chemin);
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', timeout: 30000 });
  const racine = g('rev-parse', '--show-toplevel');
  if (racine.status !== 0 || !racine.stdout.trim()) return null;          // hors dépôt
  const rel = g('ls-files', '--full-name', '--error-unmatch', '--', chemin);
  if (rel.status !== 0 || !rel.stdout.trim()) return null;                // fichier non suivi
  const avant = spawnSync('git', ['-C', racine.stdout.trim(), 'show', `HEAD:${rel.stdout.trim()}`],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  if (avant.status !== 0) return null;                                    // pas dans HEAD (fichier neuf)
  let temporaire = null;
  try {
    temporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-delta-'));
    const copie = path.join(temporaire, path.basename(chemin));
    fs.writeFileSync(copie, avant.stdout, 'utf8');
    const passe = spawnSync(process.execPath, [runner, copie, '--profil', 'digit-ai', '--niveau', 'note'], {
      encoding: 'utf8', timeout: 120000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    if (passe.error) return null;                                         // seconde passe injouable
    return lignesFautives(passe.stdout);
  } catch { return null; }
  finally { if (temporaire) { try { fs.rmSync(temporaire, { recursive: true, force: true }); } catch { /* best effort */ } } }
}

/** Partage les constats d'aujourd'hui en { neufs, preexistants }. `avant` à null → tout est neuf. */
export function partagerConstats(apres, avant) {
  const masque = (l) => l.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  // LE COMPTEUR N'EST PAS « LE PREMIER NOMBRE DE LA LIGNE », et le banc l'a prouvé en une passe :
  // dans « L2 police réflexe × 7 », le premier nombre est le 2 de « L2 ». Une occurrence de plus
  // passait donc pour une occurrence identique — la règle était morte en croyant vivre.
  // Seul un MARQUEUR DE MULTIPLICITÉ explicite est comparé : « × 7 », « 7 occurrences », « 7 cas ».
  // Un nombre nu ne l'est jamais, et c'est voulu : les numéros de ligne montent d'eux-mêmes dès
  // qu'on insère trois lignes, et les comparer ferait de chaque décalage un faux constat neuf —
  // c'est-à-dire exactement le péage que cette correction supprime.
  const compteur = (l) => {
    const m = l.match(/[×x]\s*(\d+)\b/i) || l.match(/\b(\d+)\s*(?:occurrences?|[ée]l[ée]ments?|fois|cas)\b/i);
    return m ? Number(m[1]) : null;
  };
  if (avant === null) return { neufs: apres, preexistants: [], delta: false };
  const connus = new Map();
  for (const l of avant) connus.set(masque(l), compteur(l));
  const neufs = [], preexistants = [];
  for (const l of apres) {
    const cle = masque(l);
    if (!connus.has(cle)) { neufs.push(l); continue; }
    const ancien = connus.get(cle), nouveau = compteur(l);
    (ancien !== null && nouveau !== null && nouveau > ancien) ? neufs.push(l) : preexistants.push(l);
  }
  return { neufs, preexistants, delta: true };
}

const apresConstats = lignesFautives(r.stdout);
const { neufs, preexistants, delta } = partagerConstats(apresConstats, constatsAvant(cible));

if (delta && !neufs.length && preexistants.length) {
  if (compte[cle]) { delete compte[cle]; ecrire(compte); }
  sortie(0, `qo-gate-write : « ${path.basename(cible)} » PASSE — les ${preexistants.length} constat(s) `
    + `de ce fichier PRÉEXISTENT à cette édition (mêmes constats sur la version HEAD), aucun n'est `
    + `neuf. Le gate juge le DELTA depuis le 01/09 (décision D-33) : un défaut historique n'est plus `
    + `un péage sur chaque édition future. La dette reste due et reste nommée :\n`
    + preexistants.slice(0, 8).join('\n')
    + `\nLimite déclarée : deux constats de même classe dont aucun compteur ne bouge se confondent.`);
}

const n = (compte[cle] || 0) + 1;
compte[cle] = n; ecrire(compte);

if (n > MAX_ECHECS) {
  delete compte[cle]; ecrire(compte);
  sortie(0, `qo-gate-write : ${MAX_ECHECS} passes en échec sur « ${path.basename(cible)} » — plafond atteint, contrôle laissé passer. Handoff humain (loi qualité §5) : ne pas abaisser les seuils, signaler les écarts résiduels à Sébastien.`);
}

// Le verdict SÉPARE ce que cette édition introduit de ce qu'elle hérite : mélanger les deux
// fait chercher la cause au mauvais endroit, et c'est le coût mesuré le 31/08.
const details = (delta ? neufs : apresConstats).slice(0, 8).join('\n')
  + (delta && preexistants.length
      ? `\n(+ ${preexistants.length} constat(s) PRÉEXISTANT(S), non imputés à cette édition)`
      : '');
sortie(2, `BLOQUÉ (hook C7) : oracles en échec ou inconclusifs sur « ${path.basename(cible)} » après écriture — passe ${n}/${MAX_ECHECS}. Corriger le fichier puis réécrire (loi qualité §5 : jamais de suite sur FAIL/INCONCLUSIF).\n${details}`);

// ── SELF-TEST (TF-0282) — fixtures a double sens de la decision d'exemption ────────────
// Eprouve `motifExemption()`, la fonction PURE qui decide s'il y a lieu de juger. Les
// fixtures sont embarquees : un fichier temporaire vivrait sous AppData, or `AppData` est
// lui-meme un segment exclu — la fixture rouge serait exemptee pour la mauvaise raison.
function selfTest() {
  // VERTE : fragment SSR reel — blocs Jinja, tokens lies par <link>, aucun <html> : c'est
  // exactement `base.html` que le hook bloquait pour « aucun token declare ».
  const FRAGMENT_JINJA = [
    '{% load static %}',
    '<link rel="stylesheet" href="{% static \'css/tokens.css\' %}">',
    '<header class="bandeau">{% block titre %}{% endblock %}</header>',
    '<main>{{ contenu }}</main>',
  ].join('\n');
  // ROUGE : vraie page autonome, complete, sans aucun token declare — elle DOIT rester
  // soumise aux oracles (et donc bloquee). Aucune accolade de template dedans.
  const PAGE_AUTONOME = [
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Note</title>',
    '<style>body { color: #333; font-family: Arial; }</style></head>',
    '<body><h1>Note client</h1><p>Contenu.</p></body></html>',
  ].join('\n');

  const cas = [
    ['VERTE  fragment Jinja (bloc {% %}) — exempte',
      () => /^fragment de moteur de templates/.test(motifExemption('/p/templates/base.html', FRAGMENT_JINJA))],
    ['VERTE  le motif NOMME le marqueur reconnu (exemption declaree, jamais muette)',
      () => /bloc Jinja\/Django/.test(motifExemption('/p/templates/base.html', FRAGMENT_JINJA))],
    ['VERTE  interpolation {{ ... }} seule suffit (template sans bloc)',
      () => /interpolation/.test(motifExemption('/p/templates/carte.html', '<div>{{ titre }}</div>'))],
    ['ROUGE  page autonome sans tokens — PAS exemptee, soumise aux oracles',
      () => motifExemption('/p/livrables/note.html', PAGE_AUTONOME) === null],
    ['ROUGE  page autonome sans tokens ET sans marqueur — jamais un faux vert',
      () => marqueurDeTemplate(PAGE_AUTONOME) === null],
    ['ROUGE  .md portant {{ }} — hors EXT_TEMPLATE, reste juge (une syntaxe citee n\'est pas un template)',
      () => motifExemption('/p/livrables/note.md', 'Exemple : {{ variable }} dans un gabarit.') === null],
    ['       une accolade simple {x} n\'est pas un marqueur (CSS, JS)',
      () => marqueurDeTemplate('<style>.a{color:red}</style>') === null],
    ['       les exclusions par SEGMENT restent prioritaires et inchangees',
      () => /segment de chemin exclu \(fixtures\)/.test(motifExemption('/p/fixtures/a11y-red.html', PAGE_AUTONOME))],
    // ── D-33 (01/09/2026) — LE PARTAGE DES CONSTATS, dans ses quatre etats. C'est la fonction
    // PURE du jugement au delta, et c'est la seule dont un defaut passerait inapercu : la partie
    // qui va chercher HEAD echoue bruyamment, celle qui TRIE se tromperait en silence.
    ['VERTE  un constat present des DEUX cotes est PREEXISTANT, pas impute a cette edition',
      () => { const p = partagerConstats(['❌ L2 police reflexe x 4'], ['❌ L2 police reflexe x 4']);
              return p.neufs.length === 0 && p.preexistants.length === 1 && p.delta === true; }],
    ['VERTE  le decalage des NUMEROS DE LIGNE ne fabrique pas de faux neuf (ajouter 3 lignes en decale)',
      () => { const p = partagerConstats(['❌ L2 couleur en dur ligne 71'], ['❌ L2 couleur en dur ligne 67']);
              return p.neufs.length === 0 && p.preexistants.length === 1; }],
    ['ROUGE  un constat ABSENT d\'avant est NEUF et bloque — le gate ne s\'ouvre pas sur du travail neuf',
      () => { const p = partagerConstats(['❌ M7 chapitre sans phrase d ouverture'], ['❌ L2 police reflexe x 4']);
              return p.neufs.length === 1 && p.preexistants.length === 0; }],
    ['ROUGE  une OCCURRENCE DE PLUS du meme constat est NEUVE — le comptage n\'est pas jete avec les chiffres',
      () => { const p = partagerConstats(['❌ L2 police reflexe x 7'], ['❌ L2 police reflexe x 4']);
              return p.neufs.length === 1 && p.preexistants.length === 0; }],
    ['ROUGE  une occurrence de MOINS reste preexistante — corriger une partie de la dette ne bloque pas',
      () => { const p = partagerConstats(['❌ L2 police reflexe x 2'], ['❌ L2 police reflexe x 4']);
              return p.neufs.length === 0 && p.preexistants.length === 1; }],
    ['ROUGE  delta NON CALCULABLE (fichier hors depot ou absent de HEAD) : TOUT est neuf, on bloque comme avant',
      () => { const p = partagerConstats(['❌ L2 police reflexe x 4'], null);
              return p.delta === false && p.neufs.length === 1 && p.preexistants.length === 0; }],
    ['       la limite de l\'exemption est declaree au non_juge (marqueurs exotiques)',
      () => NON_JUGE.length >= 3 && /exotiques/.test(NON_JUGE[0])],
  ];
  let bons = 0;
  for (const [nom, f] of cas) {
    let tenu = false;
    try { tenu = f() === true; } catch (e) { tenu = false; }
    console.log(`  [${tenu ? 'OK    ' : 'ECHEC '}] ${nom}`);
    if (tenu) bons += 1;
  }
  console.log(`Self-test qo-gate-write (C7) : ${bons}/${cas.length}`);
  return bons === cas.length ? 0 : 1;
}
