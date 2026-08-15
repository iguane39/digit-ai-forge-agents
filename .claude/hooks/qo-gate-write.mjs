#!/usr/bin/env node
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

const n = (compte[cle] || 0) + 1;
compte[cle] = n; ecrire(compte);

if (n > MAX_ECHECS) {
  delete compte[cle]; ecrire(compte);
  sortie(0, `qo-gate-write : ${MAX_ECHECS} passes en échec sur « ${path.basename(cible)} » — plafond atteint, contrôle laissé passer. Handoff humain (loi qualité §5) : ne pas abaisser les seuils, signaler les écarts résiduels à Sébastien.`);
}

const details = (r.stdout || '').split('\n').filter(l => l.includes('❌') || l.includes('NON CONFORME') || l.includes('FAIL')).slice(0, 8).join('\n');
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
