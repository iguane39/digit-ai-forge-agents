#!/usr/bin/env node
// oracle-conception-livrable — Domaine « Conception d'un livrable (glossaire, listes
// autoportantes, intention de chapitre) » (.md, .html).
//
// DÉFAUT PAYÉ (Produit-12, lot RETOURS 20260831e, 31/08/2026) : un livrable de consolidation a
// passé DIX-SEPT contrôles de forme sur dix-sept, et son lecteur l'a refusé pour la DEUXIÈME
// fois. Quatre griefs, tous invisibles à ces dix-sept contrôles :
//   (a) « 17 dimensions » écrit une trentaine de fois sans que le document dise ce qu'est une
//       dimension ni ne les nomme — le lecteur a écrit « charabia » ;
//   (b) une liste de décisions dont chaque ligne renvoyait à un chapitre plus bas ;
//   (c) un chapitre « table de réconciliation » exact colonne par colonne, dont le lecteur a
//       écrit « on ne sait absolument pas de quoi on parle » ;
//   (d) une carte de chaleur juste case par case et fausse dans son ensemble (→ oracle-calculs).
//
// La doctrine documents énonce pourtant D6, « conformité mécanique n'est pas qualité ». D6
// NOMMAIT le mal ; RIEN ne le cherchait. Cet oracle cherche les trois griefs mécanisables.
//
// CHECKLIST CANONIQUE
//   C1 — GLOSSAIRE : un terme de méthode que le document ÉRIGE EN VOCABULAIRE (nom d'un ensemble
//        annoncé par son cardinal, ou terme du lexique employé au-delà du seuil) est DÉFINI dans
//        le livrable. Un mot de méthode répété trente fois et jamais défini est du charabia.
//   C2 — CARDINAL ÉNUMÉRÉ : un ensemble annoncé par son cardinal (« 17 dimensions ») est
//        ÉNUMÉRÉ quelque part dans le document — pas forcément juste dessous.
//   C3 — LISTE AUTOPORTANTE : une entrée de liste dont l'UNIQUE porteur de détail est un renvoi
//        interne est un défaut ; le détail se replie dans la ligne.
//   C4 — INTENTION DE CHAPITRE : tout chapitre de niveau 2 porte un bloc « question du lecteur /
//        ce que le chapitre apporte / ce qu'il permet de décider ». C'est le plus utile des
//        quatre — il force la conception AVANT l'écriture, et un chapitre qui ne peut pas
//        l'écrire sans paraphraser son titre se supprime.
//
// SÉVÉRITÉ DE C4 — ET C'EST UNE MESURE, PAS UN GOÛT. Le bloc d'intention n'existe nulle part
// dans le parc au 02/09/2026 : rendre C4 bloquant d'emblée accuserait TOUS les documents et se
// ferait désactiver dans la semaine (R-33 bis). C4 sort donc en AVERTISSEMENT — sauf quand le
// document a COMMENCÉ la discipline : dès qu'UN chapitre porte son bloc, les chapitres qui n'en
// ont pas deviennent BLOQUANTS. Une discipline entamée et abandonnée en cours de document, elle,
// n'est pas du bruit : c'est un défaut que l'auteur a lui-même déclaré vouloir éviter.
//
// FRONTIÈRE AVEC oracle-calculs (N1) : N1 juge un effectif annoncé contre le cardinal RÉEL de
// son ANCRE IMMÉDIATE (liste ou table juste dessous). C2 ne juge QUE les annonces SANS ancre
// immédiate — celles que N1 laisse passer par construction. Les deux ne se recouvrent pas.
//
// Déclenchement par CONTENU, jamais sur tout .md du parc. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const ORACLE = 'oracle-conception-livrable';
const DOM = 'Conception d\'un livrable (glossaire, listes autoportantes, intention de chapitre)';
const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--profil');
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;

const NJ = [
  'la QUALITÉ d\'une définition trouvée : son existence est vérifiée, jamais son exactitude ni sa suffisance',
  'les termes de méthode hors lexique et non annoncés par un cardinal — le lexique est une donnée (profil `conception.termes_methode`), il ne se devine pas',
  'C2 : les ensembles annoncés AVEC une ancre immédiate (liste ou table juste dessous) — domaine d\'oracle-calculs N1, jamais jugé deux fois',
  'C3 : la pertinence du détail replié — seule l\'autoportance de la ligne est jugée, pas ce qu\'elle dit',
  'C4 : la SINCÉRITÉ d\'un bloc d\'intention — un bloc qui paraphrase le titre du chapitre est syntaxiquement conforme et reste un défaut de conception (→ revue de lecture, oracle-judge)',
  'l\'ordre des chapitres, la longueur du document et la redondance entre chapitres',
];
const out = (verdict, findings, nj, code) => {
  process.stdout.write(JSON.stringify({ oracle: ORACLE, domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj }));
  process.exit(code);
};
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
const ext = path.extname(file).toLowerCase();
if (!['.md', '.html', '.htm'].includes(ext)) out('SKIP', [], ['extension non gérée : ' + ext], 2);

const base = path.basename(file);
const raw = fs.readFileSync(file, 'utf8');
const estHtml = ext !== '.md';

// ---- réglages, surchargeables par profil (`conception.*`) -------------------------------------
let PROFIL = {};
if (pArg && fs.existsSync(pArg)) { try { PROFIL = JSON.parse(fs.readFileSync(pArg, 'utf8')); } catch { /* profil illisible : réglages par défaut */ } }
const cfg = PROFIL.conception || {};
const SEUIL_REPETITION = Number.isFinite(cfg.seuil_repetition) ? cfg.seuil_repetition : 5;
const SEUIL_SUBSTANCE = Number.isFinite(cfg.seuil_substance) ? cfg.seuil_substance : 40;
const CARDINAL_MIN = Number.isFinite(cfg.cardinal_min) ? cfg.cardinal_min : 3;

// Lexique FERMÉ des termes de méthode. Un mot ordinaire n'y entre pas : c'est la seule barrière
// entre « le document ne définit pas son vocabulaire » et « l'oracle crie sur du français ».
const TERMES = (Array.isArray(cfg.termes_methode) && cfg.termes_methode.length ? cfg.termes_methode : [
  'dimension', 'pilier', 'volet', 'palier', 'maturité', 'cotation', 'strate',
  'brique', 'gate', 'jalon', 'lentille', 'prisme',
  'grille de lecture', 'note de maturité', 'niveau de maturité', 'score de maturité',
]).map(t => t.toLowerCase());

// Noms de tête admis pour une annonce de cardinal (« 17 dimensions », « les quatre axes »).
const TETES_CARDINAL = (Array.isArray(cfg.tetes_cardinal) && cfg.tetes_cardinal.length ? cfg.tetes_cardinal : [
  'dimension', 'axe', 'pilier', 'volet', 'palier', 'brique', 'rubrique', 'grief',
  'strate', 'lentille',
]).map(t => t.toLowerCase());

const CHIFFRES_LETTRES = {
  trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11,
  douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30,
  'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19,
};

// ---- normalisation ---------------------------------------------------------------------------
// HTML : on ne juge que le TEXTE rendu. Scripts, styles et commentaires sont retirés — un mot de
// méthode dans du JavaScript n'est pas un mot que le lecteur voit.
const sansBalises = (s) => s
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');
const brut = estHtml ? sansBalises(raw) : raw;
const lignes = brut.split('\n');
const texte = (estHtml ? brut.replace(/<[^>]+>/g, ' ') : brut).replace(/&nbsp;/g, ' ');
// `deaccent` NE met PAS en minuscules, et ce n'est pas un détail : appliqué à une SOURCE
// d'expression régulière, un `toLowerCase()` transforme `\W` en `\w` et retourne silencieusement
// le sens du motif. Défaut payé en écrivant C4 — les trois libellés d'intention étaient
// introuvables sur un document qui les portait, et le contrôle rendait « aucun chapitre » sur un
// document conforme. Le texte se normalise avec `sansAccent`, les motifs avec `deaccent`.
const deaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const sansAccent = (s) => deaccent(s).toLowerCase();
const texteN = sansAccent(texte);

// ---- déclenchement : ce document relève-t-il de ce domaine ? ----------------------------------
// Deux titres de niveau 2 au moins (un document sans chapitres n'a pas d'intention de chapitre),
// ET soit un ensemble annoncé par son cardinal, soit un terme de méthode au-delà du seuil.
const titresH2 = [];
lignes.forEach((l, i) => {
  if (!estHtml) { const m = l.match(/^##\s+(?!#)(.+?)\s*$/); if (m) titresH2.push({ titre: m[1].trim(), ligne: i + 1, i }); }
  else { const m = l.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i); if (m) titresH2.push({ titre: m[1].replace(/<[^>]+>/g, ' ').trim(), ligne: i + 1, i }); }
});

/** Annonces de cardinal : « 17 dimensions », « les quatre axes », « dix-sept dimensions ». */
const annonces = [];
{
  const tetes = TETES_CARDINAL.map(t => sansAccent(t)).join('|');
  const rx = new RegExp('\\b(\\d{1,3}|' + Object.keys(CHIFFRES_LETTRES).join('|') + ')\\s+(' + tetes + ')s?\\b', 'g');
  lignes.forEach((l, i) => {
    const nu = estHtml ? l.replace(/<[^>]+>/g, ' ') : l;
    for (const m of sansAccent(nu).matchAll(rx)) {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : CHIFFRES_LETTRES[m[1]];
      if (!n || n < CARDINAL_MIN || n > 200) continue;
      annonces.push({ n, tete: m[2], ligne: i + 1, i, extrait: nu.trim().slice(0, 110) });
    }
  });
}

/** Occurrences d'un terme (forme normalisée, singulier ou pluriel). */
const compte = (terme) => {
  const t = sansAccent(terme).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (texteN.match(new RegExp('\\b' + t + 's?\\b', 'g')) || []).length;
};

// UN TERME « ÉRIGÉ EN VOCABULAIRE » PORTE DEUX MARQUES, ET LA MESURE A IMPOSÉ LES DEUX.
// Première écriture : une seule marque suffisait (annoncé par un cardinal OU répété). Bruit
// mesuré sur les 103 documents .md/.html suivis du dépôt le 02/09/2026 : 35 FAIL sur 103,
// c'est-à-dire un tiers du parc accusé pour des mots ordinaires — « 5 axes » cité une fois dans
// une fiche, « gate » employé six fois dans une doc technique. Un contrôle qui accuse un tiers
// du parc se fait désactiver dans la semaine (R-33 bis), et il aurait eu raison.
// Le défaut du 31/08 avait une signature précise : « 17 dimensions » ANNONCÉ **et** écrit une
// trentaine de fois. Le BLOCAGE exige donc les deux marques ; une seule marque AVERTIT.
const termesEriges = new Map();                       // terme normalisé -> { terme, occurrences, annonce }
for (const a of annonces) {
  if (!termesEriges.has(a.tete)) termesEriges.set(a.tete, { terme: a.tete, occurrences: compte(a.tete), annonce: a.n });
}
for (const t of TERMES) {
  const n = compte(t);
  if (n >= SEUIL_REPETITION && !termesEriges.has(sansAccent(t))) termesEriges.set(sansAccent(t), { terme: t, occurrences: n, annonce: null });
}

if (titresH2.length < 2 || (!annonces.length && !termesEriges.size)) {
  out('SKIP', [], [...NJ, 'hors périmètre : ce document ne porte ni ensemble annoncé par son cardinal, ni terme de méthode au-delà du seuil de répétition (' + SEUIL_REPETITION + '), ou compte moins de deux chapitres de niveau 2'], 2);
}

const findings = [];
const bloquant = (regle, msg, ligne) => findings.push({ sev: 'bloquant', regle, msg, where: base + (ligne ? ':' + ligne : '') });
const avertir = (regle, msg, ligne) => findings.push({ sev: 'avertissement', regle, msg, where: base + (ligne ? ':' + ligne : '') });

// ---- outillage partagé C1/C2 : cardinaux réellement présents, et ancre immédiate -------------
/** Cardinaux des listes, tables, familles d'identifiants et énumérations EN LIGNE du document.
 *  QUATRE FORMES, ET LES DEUX DERNIÈRES SONT VENUES DE LA MESURE DE BRUIT (02/09/2026) : ne
 *  compter que les listes et les tables accusait à tort deux documents du dépôt qui énuméraient
 *  bel et bien leur ensemble — l'un en ligne (« D1 Déclenchement, D2 Frontière, … »), l'autre en
 *  liste numérotée à items MULTILIGNES, que la première version coupait à chaque continuation.
 *  Une énumération que le lecteur voit est une énumération, quelle que soit sa typographie. */
function cardinauxDisponibles() {
  const c = new Set();
  // (1) listes — une ligne INDENTÉE ou vide est une CONTINUATION d'item, elle ne clôt pas la liste
  let courant = 0;
  for (const l of lignes) {
    const item = estHtml ? /<li\b/i.test(l) : /^\s{0,6}(?:[-*+]\s+|\d{1,3}[.)]\s+)/.test(l);
    if (item) { courant++; continue; }
    if (/^\s*$/.test(l)) continue;                                  // ligne vide : la liste respire
    if (courant && !estHtml && /^\s{2,}\S/.test(l)) continue;       // continuation indentée
    if (courant) { c.add(courant); courant = 0; }
  }
  if (courant) c.add(courant);
  // (2) familles d'identifiants : D1…D7, A1…A5 — l'énumération par étiquettes vaut énumération
  {
    const familles = new Map();
    for (const m of texte.matchAll(/\b([A-Z]{1,3})[ -]?(\d{1,2})\b/g)) {
      const k = m[1]; if (!familles.has(k)) familles.set(k, new Set());
      familles.get(k).add(Number(m[2]));
    }
    for (const [, nums] of familles) { let n = 0; while (nums.has(n + 1)) n++; if (n >= 3) c.add(n); }
  }
  // (3) énumérations EN LIGNE : au moins trois segments séparés par des virgules sur une ligne
  for (const l of lignes) {
    const nu = (estHtml ? l.replace(/<[^>]+>/g, ' ') : l).replace(/\([^)]*\)/g, ' ');
    const seg = nu.split(/,|\s+;\s+/).map(s => s.trim()).filter(Boolean);
    if (seg.length >= 3 && seg.length <= 40 && seg.every(s => s.length <= 60)) c.add(seg.length);
  }
  // (4) tables markdown / HTML
  let dansTable = 0;
  for (const l of lignes) {
    if (!estHtml && /^\s*\|.*\|\s*$/.test(l)) { dansTable++; continue; }
    if (dansTable) { c.add(Math.max(0, dansTable - 2)); dansTable = 0; }   // en-tête + séparateur
  }
  if (dansTable) c.add(Math.max(0, dansTable - 2));
  if (estHtml) { const tr = (brut.match(/<tr\b/gi) || []).length; if (tr) { c.add(tr); c.add(tr - 1); } }
  return c;
}
const CARDINAUX = cardinauxDisponibles();
/** L'annonce porte-t-elle une ANCRE IMMÉDIATE (liste ou table dans les 3 lignes qui suivent) ?
 *  Si oui, c'est le domaine d'oracle-calculs N1 — jamais jugé deux fois. */
function ancreImmediate(idx) {
  for (let k = idx + 1; k <= idx + 3 && k < lignes.length; k++) {
    const l = lignes[k];
    if (estHtml ? /<li\b|<tr\b/i.test(l) : (/^\s{0,6}(?:[-*+]\s+|\d{1,3}[.)]\s+)/.test(l) || /^\s*\|/.test(l))) return true;
  }
  return false;
}

// ---- C1 — GLOSSAIRE ---------------------------------------------------------------------------
/** Le document définit-il ce terme quelque part ? */
function estDefini(terme) {
  const t = sansAccent(terme).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const motifs = [
    // définition en tête de ligne ou en gras : « **dimension** — … », « Dimension : … »
    new RegExp('^\\s*(?:[|*_>#-]\\s*)*(?:[*_]{0,2})' + t + 's?(?:[*_]{0,2})\\s*(?::|—|–|=)\\s*\\S', 'im'),
    new RegExp('\\bun[e]?\\s+' + t + '\\s+(?:est|d[ée]signe|se\\s+d[ée]finit|correspond\\s+[àa])\\b', 'i'),
    new RegExp('\\bon\\s+appelle\\s+' + t + '\\b', 'i'),
    new RegExp('\\bpar\\s+' + t + '\\s*,?\\s*(?:on\\s+entend|il\\s+faut\\s+entendre)\\b', 'i'),
    new RegExp('\\b' + t + '\\s+(?:d[ée]signe|se\\s+d[ée]finit|s\\W?entend\\s+(?:ici\\s+)?comme)\\b', 'i'),
    new RegExp('\\b(?:d[ée]finition|nous\\s+appelons|j\\W?appelle)\\b[^.\\n]{0,60}\\b' + t + '\\b', 'i'),
  ];
  return motifs.some(m => m.test(texteN));
}
// UNE ÉNUMÉRATION NOMMÉE VAUT DÉFINITION DU TERME DE TÊTE, et c'est la troisième borne de bruit.
// Un document qui annonce « 6 dimensions » et qui NOMME les six a dit au lecteur de quoi il
// parle, même sans écrire « une dimension est… ». Le défaut du 31/08 est l'exact contraire :
// « 17 dimensions » trente fois, jamais définies ET jamais nommées. Sans cette borne, la
// documentation de la forge elle-même était accusée (couches.md, ses six dimensions en table).
const estEnumere = (tete) => annonces.some(a => a.tete === tete && (CARDINAUX.has(a.n) || ancreImmediate(a.i)));

for (const [, info] of termesEriges) {
  if (info.occurrences < 2) continue;                 // « employé plus d'une fois », à la lettre
  if (estDefini(info.terme)) continue;
  const deuxMarques = info.annonce !== null && info.occurrences >= SEUIL_REPETITION && !estEnumere(sansAccent(info.terme));
  const marques = (info.annonce !== null ? `annoncé par son cardinal (« ${info.annonce} ${info.terme}s »)` : 'du lexique de méthode')
    + `, ${info.occurrences} occurrence(s)`;
  const msg = `GLOSSAIRE — le terme de méthode « ${info.terme} » (${marques}) n'est DÉFINI nulle part dans le livrable. `
    + `Un mot de méthode répété sans être défini se lit comme du charabia — c'est le grief (a) du 31/08.`;
  if (deuxMarques) bloquant('C1', msg + ` BLOQUANT : les DEUX marques du défaut mesuré sont réunies (annonce d'un cardinal + au moins ${SEUIL_REPETITION} occurrences).`, null);
  else avertir('C1', msg + ` AVERTISSEMENT : une seule des deux marques du défaut mesuré est réunie. Bruit mesuré le 02/09/2026 sur 103 documents du dépôt — exiger une seule marque accusait 35 documents sur 103 (34 %).`, null);
}

// ---- C2 — CARDINAL ÉNUMÉRÉ --------------------------------------------------------------------
const vues = new Map();
for (const a of annonces) {
  const cle = a.n + '·' + a.tete;
  vues.set(cle, (vues.get(cle) || 0) + 1);
}
const traitees = new Set();
for (const a of annonces) {
  const cle = a.n + '·' + a.tete;
  if (traitees.has(cle)) continue; traitees.add(cle);
  if (ancreImmediate(a.i)) continue;                  // → oracle-calculs N1
  if (CARDINAUX.has(a.n)) continue;                   // énuméré quelque part : la promesse est tenue
  // Même arbitrage de bruit qu'en C1 : un ensemble cité UNE fois n'est pas le vocabulaire du
  // document, c'est une incise. Le défaut du 31/08 répétait son annonce d'un bout à l'autre.
  const repetee = vues.get(cle) >= 2;
  const msg = `CARDINAL NON ÉNUMÉRÉ — « ${a.n} ${a.tete}s » est annoncé (« ${a.extrait} ») et AUCUNE liste ni table du document ne compte ${a.n} entrées : `
    + `l'ensemble est nommé par son cardinal mais n'est énuméré nulle part. Cardinaux réellement présents : ${[...CARDINAUX].filter(x => x > 1).sort((x, y) => x - y).join(', ') || '(aucun)'}.`;
  if (repetee) bloquant('C2', msg + ` BLOQUANT : l'annonce est répétée ${vues.get(cle)} fois — c'est le vocabulaire du document, pas une incise.`, a.ligne);
  else avertir('C2', msg + ' AVERTISSEMENT : annonce citée une seule fois.', a.ligne);
}

// ---- C3 — LISTE AUTOPORTANTE ------------------------------------------------------------------
const RENVOIS = [
  /(?:voir|cf\.?|se\s+reporter\s+[àa]|d[ée]taill[ée]?e?s?)\s+(?:le\s+|la\s+|au\s+|en\s+|[àa]\s+la\s+)?(?:chapitre|section|§|partie|annexe|paragraphe)\s*[\w.§-]*/i,
  /(?:voir|cf\.?)\s+(?:ci-dessous|plus\s+bas|infra|ci-apr[èe]s|plus\s+loin)/i,
  /\bd[ée]taill[ée]e?s?\s+(?:plus\s+bas|ci-dessous|au\s+chapitre|en\s+§|infra)/i,
  /→\s*(?:chapitre|section|§|partie)\s*[\w.§-]*/i,
  /\]\(#[^)]*\)/,
  /<a\b[^>]*href\s*=\s*["']#[^"']*["'][^>]*>[\s\S]*?<\/a>/i,
];
// Un sommaire EST une liste de renvois : c'est sa raison d'être. On ne l'accuse pas.
const TITRES_SOMMAIRE = /(sommaire|table\s+des\s+mati[èe]res|plan\s+du\s+document|index|navigation|au\s+programme)/i;
function sousSommaire(idx) {
  for (let k = idx; k >= 0 && k > idx - 40; k--) {
    const l = lignes[k];
    const est = estHtml ? /<h[1-6]\b/i.test(l) : /^#{1,6}\s/.test(l);
    if (est) return TITRES_SOMMAIRE.test(l.replace(/<[^>]+>/g, ' '));
  }
  return false;
}
{
  let liste = [];                                     // items contigus : { texte, ligne, i }
  const clore = () => {
    if (liste.length) {
      const porteurs = liste.filter(it => RENVOIS.some(r => r.test(it.texte)));
      for (const it of porteurs) {
        let reste = it.texte;
        for (const r of RENVOIS) reste = reste.replace(new RegExp(r.source, 'gi'), ' ');
        reste = reste.replace(/[\s*_`()\[\]:;,.—–-]+/g, ' ').trim();
        if (reste.length < SEUIL_SUBSTANCE && !sousSommaire(it.i)) {
          bloquant('C3', `LISTE NON AUTOPORTANTE — l'entrée « ${it.texte.slice(0, 90)} » n'a d'autre porteur de détail qu'un RENVOI INTERNE : `
            + `${reste.length} caractère(s) de substance une fois le renvoi retiré (seuil ${SEUIL_SUBSTANCE}). Le détail se replie dans la ligne — c'est le grief (b) du 31/08.`, it.ligne);
        }
      }
      if (porteurs.length >= 3 && porteurs.length === liste.length && !sousSommaire(liste[0].i)) {
        avertir('C3', `LISTE ENTIÈREMENT DÉLÉGUÉE — les ${liste.length} entrées de cette liste renvoient TOUTES à un autre endroit du document : c'est un sommaire qui ne dit pas son nom. `
          + `Soit la liste porte son détail, soit elle se déclare sommaire.`, liste[0].ligne);
      }
    }
    liste = [];
  };
  lignes.forEach((l, i) => {
    let m = null;
    if (estHtml) { const mm = l.match(/<li\b[^>]*>([\s\S]*?)(?:<\/li>|$)/i); if (mm) m = mm[1].replace(/<[^>]+>/g, ' ').trim(); }
    else { const mm = l.match(/^\s{0,6}(?:[-*+]\s+|\d{1,3}[.)]\s+)(.*\S)\s*$/); if (mm) m = mm[1].trim(); }
    if (m !== null) liste.push({ texte: m, ligne: i + 1, i });
    else if (!/^\s*$/.test(l)) clore();
  });
  clore();
}

// ---- C4 — INTENTION DE CHAPITRE ---------------------------------------------------------------
const LABELS = cfg.labels_intention || {
  question: 'question\\s+du\\s+lecteur',
  apport: 'ce\\s+que\\s+(?:le\\s+chapitre|ce\\s+chapitre|il)\\s+apporte',
  decision: 'ce\\s+(?:qu\\W?il|que\\s+(?:le\\s+chapitre|ce\\s+chapitre|[çc]a))\\s+permet\\s+de\\s+d[ée]cider',
};
const FENETRE = Number.isFinite(cfg.fenetre_intention) ? cfg.fenetre_intention : 12;
// La fenêtre s'arrête au chapitre SUIVANT, jamais à un nombre de lignes seul : sans cette borne,
// un chapitre nu placé juste avant un chapitre discipliné empruntait le bloc d'intention de son
// voisin et passait pour conforme. Mesuré sur la fixture rouge — deux chapitres sans bloc, un
// seul accusé.
const estTitre = (l) => (estHtml ? /<h[1-6]\b/i.test(l) : /^#{1,6}\s/.test(l));
const porteIntention = (idx) => {
  let fin = Math.min(idx + 1 + FENETRE, lignes.length);
  for (let k = idx + 1; k < fin; k++) if (estTitre(lignes[k])) { fin = k; break; }
  const bloc = deaccent(lignes.slice(idx + 1, fin).join('\n').replace(/<[^>]+>/g, ' '));
  return Object.values(LABELS).every(l => new RegExp(l, 'i').test(bloc));
};
{
  const avec = titresH2.filter(t => porteIntention(t.i));
  const sans = titresH2.filter(t => !porteIntention(t.i));
  const taux = Math.round((avec.length / titresH2.length) * 100);
  if (avec.length && sans.length) {
    for (const t of sans) {
      bloquant('C4', `INTENTION DE CHAPITRE ABSENTE — « ${t.titre} » ne porte pas le bloc « question du lecteur / ce que le chapitre apporte / ce qu'il permet de décider », `
        + `alors que ${avec.length} chapitre(s) du même document le portent (${taux} % de couverture). Une discipline entamée et abandonnée en cours de document est un défaut déclaré par l'auteur lui-même.`, t.ligne);
    }
  } else if (!avec.length) {
    avertir('C4', `INTENTION DE CHAPITRE — aucun des ${titresH2.length} chapitres de niveau 2 ne porte le bloc « question du lecteur / ce que le chapitre apporte / ce qu'il permet de décider ». `
      + `AVERTISSEMENT et non blocage : au 02/09/2026 le bloc n'existe dans AUCUN document du parc (taux d'adoption mesuré 0 %), et un contrôle qui accuse tout le monde se fait désactiver. `
      + `Le seuil de bascule est écrit : dès qu'UN chapitre porte son bloc, tous les autres deviennent bloquants.`, titresH2[0].ligne);
  }
}

// ---- verdict ----------------------------------------------------------------------------------
const nj = [...NJ, `déclenché : ${titresH2.length} chapitre(s) de niveau 2 · ${annonces.length} annonce(s) de cardinal · ${termesEriges.size} terme(s) de méthode érigé(s) en vocabulaire`];
if (findings.some(f => f.sev === 'bloquant')) out('FAIL', findings, nj, 1);
findings.push({ sev: 'info', regle: 'C1-C4', msg: `conception conforme : ${termesEriges.size} terme(s) de méthode défini(s), ${annonces.length} annonce(s) de cardinal énumérée(s) ou ancrée(s), listes autoportantes`, where: base });
out('PASS', findings, nj, 0);
