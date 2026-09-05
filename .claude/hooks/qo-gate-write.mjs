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

// ── UNE CHARTE POSÉE PRIME SUR LA LISTE DES FONTES RÉFLEXES (D-41 (b), 02/09/2026) ──────────
//
// LE FAIT, mesuré le 31/08 : quatre éditions de trois lignes sur des gabarits HTML de la
// bibliothèque bloquées en un tour, et l'un des motifs était la POLICE. Or ce motif ne vient
// d'AUCUN détecteur du socle HTML : ni `check_html.py` ni `check_markdown.py` ne nomment DM Sans.
// Il vient de `reference/new-work.md`, un texte destiné au CHOIX DE FONTES POUR UN TRAVAIL NEUF,
// appliqué à un livrable QUI A DÉJÀ SA CHARTE. Les deux doctrines ne se contredisent donc pas
// mécaniquement : il manquait une règle de PRÉCÉDENCE, et son emplacement.
//
// D-41 (b) l'a tranché : la règle vit au REGISTRE DES ORACLES, dans le profil `digit-ai`
// (`polices.precedence_charte`), et elle est CÂBLÉE ici — sans câblage, une règle de précédence
// n'est qu'un texte de plus à côté des deux qu'elle devait départager (loi transverse n° 1).
//
// CE QUI EST NEUTRALISÉ, ET RIEN D'AUTRE. Un constat n'est écarté que si les TROIS conditions
// sont réunies : (1) c'est un constat de POLICE ou de FONTE ; (2) le fichier DÉCLARE une charte
// (un marqueur explicite, jamais une devinette) ; (3) TOUTES les fontes nommées dans le constat
// appartiennent à cette charte. Un constat de police qui ne nomme AUCUNE fonte n'est PAS
// neutralisé : « je ne sais pas » ne vaut jamais « c'est bon » — même garde que le jugement au
// delta, trois lignes plus bas. Et une page SANS charte déclarée reste accusée comme avant.
const CHARTES = [{
  nom: 'digit-ai-page-html',
  fontes: ['roboto', 'dm sans', 'jetbrains mono'],
  // Ce qui vaut DÉCLARATION de charte : un token de police du socle, une police de la charte
  // posée en `font-family`, ou la charte nommée en clair.
  marqueurs: [
    /--font-(?:titres?|corps|mono|display|body)\s*:/i,
    /font-family\s*:[^;]{0,120}(?:Roboto|DM\s+Sans|JetBrains\s+Mono)/i,
    /charte\s*:\s*digit-ai-page-html|socle\s+digit-ai-page-html|digit-ai-page-html/i,
  ],
}];

/** Le fichier déclare-t-il l'une des chartes connues ? (nom de la charte, ou null) */
export function charteDeclaree(contenu, chartes = CHARTES) {
  for (const c of chartes) if (c.marqueurs.some(m => m.test(contenu || ''))) return c;
  return null;
}

/** Ce constat de police est-il NEUTRALISÉ par la charte posée du fichier ?
 *  Fonction pure — c'est elle que le banc éprouve, dans les deux sens. */
export function constatDePoliceNeutralise(ligne, contenu, chartes = CHARTES) {
  const estPolice = /\b(?:polices?|fontes?)\s+r[ée]flexes?\b|\bpolice\s+non\s+chart[ée]e\b|\bfont-family\b|\bS3\b.*\bpolice/i.test(ligne || '');
  if (!estPolice) return false;
  const charte = charteDeclaree(contenu, chartes);
  if (!charte) return false;                       // page sans charte : la règle générique s'applique
  const nommees = [...String(ligne).matchAll(/[«"'`]\s*([^»"'`]{2,40}?)\s*[»"'`]/g)].map(m => m[1].trim().toLowerCase());
  if (!nommees.length) return false;               // aucune fonte nommée : on ne neutralise pas ce qu'on ne lit pas
  return nommees.every(f => charte.fontes.includes(f));
}

// ── LE CHEMIN N'EST PAS L'IDENTITÉ D'UN CONSTAT (TF-0806 + TF-0812, 05/09/2026) ──────────────
//
// LE FAIT, mesuré le 05/09 par trois forges le même jour : le partage neufs/préexistants de
// `partagerConstats` (D-33, plus bas) ne partageait rien. La version `HEAD` est jugée dans une
// COPIE TEMPORAIRE, donc sous un AUTRE CHEMIN ; or le runner écrit ce chemin DANS la ligne de
// constat (« ❌ [domaine] <chemin> — détail »). Le masque d'identité repliait les espaces et
// masquait les chiffres, jamais le chemin : aucune clé ne coïncidait entre les deux passes, et
// TOUT constat préexistant comptait comme neuf. Le coût, le même jour : une forge a réécrit deux
// chapitres sans rapport pour livrer, une deuxième a été bloquée deux fois sur un fichier dont la
// version précédente portait déjà les deux constats, une troisième a corrigé des défauts
// préexistants dans six fichiers pour pouvoir écrire — c'est-à-dire exactement le péage que
// D-33 (a) avait supprimé, revenu par la porte de l'identité. Récidive de la classe close par
// TF-0732 : une règle juste dont la CLÉ est fausse est une règle morte qui croit vivre.
//
// CE QUI EST FAIT : la ligne est NORMALISÉE avant masquage — tout chemin de fichier y devient un
// JETON FIXE. Ce qui reste est ce qui identifie vraiment un constat : la règle, le message, et la
// position (masquée ensuite avec les chiffres). La même ligne obtenue sur la copie temporaire et
// sur le fichier réel produit alors la même clé.
//
// CE QUI N'EST PAS NORMALISÉ, et c'est voulu : un mot ne devient le jeton que s'il PORTE une
// extension de fichier, seul ou au bout d'un chemin. « 2/3 », « ligne 36 » ou « niveau 4 » ne sont
// pas des chemins et ne le deviennent pas — sur-normaliser confondrait deux constats distincts, et
// un gate qui s'ouvre par erreur est pire qu'un gate absent (même garde que partout ailleurs ici).
// Limite déclarée : deux constats qui ne diffèrent QUE par le nom du fichier se confondent ; sans
// effet à cet endroit, le gate ne juge jamais qu'un seul fichier à la fois.
//
// POURQUOI ICI, au-dessus du dispatch `--self-test` : le banc appelle ces fonctions avant que les
// `const` du corps du hook ne soient évaluées. Une zone morte temporelle y a déjà transformé cinq
// cas en échecs MUETS le 01/09 — le jeton et ses motifs sont donc déclarés avant ce point.
export const JETON_CHEMIN = '<fichier>';

// Un chemin : au moins un séparateur, et une extension au bout. Puis un nom de fichier NU, pour le
// cas où le runner rend la cible relative à son propre dossier (« note.md », sans dossier devant).
const RE_CHEMIN = /[^\s"'`«»(),;]*[\\/][^\s"'`«»(),;]*\.[A-Za-z0-9]{1,6}\b/g;
const RE_FICHIER_NU = /[^\s\\/"'`«»(),;]+\.(?:html?|md|markdown|pptx|xlsx|docx|pdf|svg|csv|json|jsonl|txt|py|mjs|cjs|js|css|ya?ml)\b/gi;

/** La ligne de constat privée de tout chemin de fichier — règle, message et position seulement.
 *  Fonction pure : c'est elle que le banc éprouve, dans les deux sens (TF-0806). */
export function normaliserChemin(ligne) {
  return String(ligne ?? '').replace(RE_CHEMIN, JETON_CHEMIN).replace(RE_FICHIER_NU, JETON_CHEMIN);
}

// ── LE DELTA NE SE REND PLUS NON CALCULABLE EN SILENCE (TF-0816, 05/09/2026) ─────────────────
//
// LE FAIT, mesuré le 05/09 : `constatsAvant` interrogeait
// `git -C <dossier de la cible> ls-files --full-name --error-unmatch -- <la cible telle que reçue>`.
// Git réinterprète la cible relativement au dossier passé à `-C` : un chemin RELATIF ne s'y résout
// donc JAMAIS. La fonction rendait `null`, tout comptait comme neuf, et le gate bloquait comme
// avant D-33 — sans dire que le delta avait été abandonné. Un verdict qui bloque sans dire que le
// delta n'a pas été calculable est indistinguable d'un verdict qui a calculé le delta et n'a trouvé
// aucun préexistant : le lecteur cherche la cause au mauvais endroit, et il la cherche chez lui.
//
// CE QUI EST FAIT : (1) la cible est RÉSOLUE en entrée — ce qui part vers git est toujours absolu ;
// (2) le repli est DÉCLARÉ, comme le hook déclare déjà ses exemptions. Ce que le contrôle ne sait
// pas, il le dit ; il ne le laisse pas ressembler à ce qu'il sait.
//
// POURQUOI ICI, au-dessus du dispatch `--self-test` : même raison qu'au bloc précédent — le banc
// appelle ces deux fonctions avant que les `const` du corps du hook ne soient évaluées.

/** La cible telle qu'on l'interroge : TOUJOURS absolue. Fonction pure — c'est elle que le banc
 *  éprouve, dans les deux sens (un relatif et l'absolu du même fichier donnent la même cible). */
export function cibleResolue(chemin, base = process.cwd()) {
  return path.resolve(base, String(chemin ?? ''));
}

/** Pourquoi le delta n'est PAS calculable, en clair — ou null quand il l'est. Fonction pure.
 *  Les quatre états sont exhaustifs : chaque sortie anticipée de `constatsAvant` en nomme un. */
export function motifSansDelta(etat) {
  const motifs = {
    'hors-depot': "hors dépôt — aucun dépôt git au-dessus de ce fichier, il n'a pas de version HEAD",
    'non-resolu': "chemin non résolu ou fichier non suivi par git — `git ls-files` ne reconnaît pas cette cible",
    'absent-de-head': "absent de HEAD — fichier neuf, aucune version antérieure à laquelle le comparer",
    'seconde-passe-injouable': "seconde passe injouable — les oracles n'ont pas pu être rejoués sur la version HEAD",
  };
  return motifs[etat] || null;
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
// lignes en décale forcément. L'identité est donc la ligne CHEMIN NORMALISÉ (TF-0806 : sans cela
// la clé ne coïncidait jamais, cf. `normaliserChemin` plus haut) puis CHIFFRES MASQUÉS.
// Le comptage, lui, n'est pas jeté : si le compteur de la ligne AUGMENTE, le constat est neuf
// (une occurrence de plus est une occurrence introduite). Ce compteur est d'abord le NOMBRE DE
// CONSTATS que la ligne annonce (TF-0815 : sans lui, la ligne ne bougeait pas d'un caractère du
// deuxième au troisième constat d'un même oracle, et le gate s'ouvrait sur du travail neuf).
// Limite assumée et déclarée : deux constats de même classe dont aucun compteur ne bouge se
// confondent — le nombre bouge désormais, la nature d'un constat de rang égal, non.
//
// TROIS GARDES, parce qu'un gate qui s'ouvre par erreur est pire qu'un gate absent :
//   · fichier NON SUIVI par git, hors dépôt, ou `HEAD` illisible → aucun delta calculable, on
//     bloque comme avant, et le verdict DÉCLARE ce repli avec son motif (TF-0816). « Je ne sais
//     pas » ne vaut jamais « c'est bon », et ne se tait jamais non plus ;
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

/** Les constats de la version HEAD du même fichier : `{ constats, motif }`. `constats` à null =
 *  delta non calculable, et `motif` DIT alors pourquoi (TF-0816) — jamais un abandon muet. */
function constatsAvant(chemin) {
  const abs = cibleResolue(chemin);            // TF-0816 : ce qui part vers git est toujours absolu
  const rendre = (etat, constats = null) => ({ constats, motif: motifSansDelta(etat) });
  const dir = path.dirname(abs);
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', timeout: 30000 });
  const racine = g('rev-parse', '--show-toplevel');
  if (racine.status !== 0 || !racine.stdout.trim()) return rendre('hors-depot');
  const rel = g('ls-files', '--full-name', '--error-unmatch', '--', abs);
  if (rel.status !== 0 || !rel.stdout.trim()) return rendre('non-resolu');
  const avant = spawnSync('git', ['-C', racine.stdout.trim(), 'show', `HEAD:${rel.stdout.trim()}`],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  if (avant.status !== 0) return rendre('absent-de-head');
  let temporaire = null;
  try {
    temporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-delta-'));
    const copie = path.join(temporaire, path.basename(abs));
    fs.writeFileSync(copie, avant.stdout, 'utf8');
    const passe = spawnSync(process.execPath, [runner, copie, '--profil', 'digit-ai', '--niveau', 'note'], {
      encoding: 'utf8', timeout: 120000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    if (passe.error) return rendre('seconde-passe-injouable');
    return rendre(null, lignesFautives(passe.stdout));
  } catch { return rendre('seconde-passe-injouable'); }
  finally { if (temporaire) { try { fs.rmSync(temporaire, { recursive: true, force: true }); } catch { /* best effort */ } } }
}

/** Partage les constats d'aujourd'hui en { neufs, preexistants }. `avant` à null → tout est neuf. */
export function partagerConstats(apres, avant) {
  // Le CHEMIN tombe d'abord (TF-0806), les chiffres ensuite : masquer les chiffres d'un chemin ne
  // le rend pas égal à un autre chemin, il le rend seulement méconnaissable.
  const masque = (l) => normaliserChemin(l).replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  // LE COMPTEUR N'EST PAS « LE PREMIER NOMBRE DE LA LIGNE », et le banc l'a prouvé en une passe :
  // dans « L2 police réflexe × 7 », le premier nombre est le 2 de « L2 ». Une occurrence de plus
  // passait donc pour une occurrence identique — la règle était morte en croyant vivre.
  // Seul un MARQUEUR DE MULTIPLICITÉ explicite est comparé : « × 7 », « 7 occurrences », « 7 cas ».
  // Un nombre nu ne l'est jamais, et c'est voulu : les numéros de ligne montent d'eux-mêmes dès
  // qu'on insère trois lignes, et les comparer ferait de chaque décalage un faux constat neuf —
  // c'est-à-dire exactement le péage que cette correction supprime.
  // TF-0815 : le COMPTE ANNONCÉ PAR LE RUNNER passe en premier. La ligne d'un oracle ne portait
  // que ses DEUX premiers messages : de 2 à 3 constats de la même règle, elle ne bougeait pas d'un
  // caractère, et le troisième passait pour un préexistant. Le runner écrit désormais « n
  // constat(s) · … » en tête ; c'est le seul compte qui vaut pour la ligne ENTIÈRE, donc il prime
  // sur un « × n » qui, lui, ne compte qu'à l'intérieur d'un message.
  const compteur = (ligne) => {
    const l = normaliserChemin(ligne);   // un « v2 » dans un nom de dossier n'est pas une multiplicité
    const m = l.match(/\b(\d+)\s*constats?(?:\(s\))?/i)
      || l.match(/[×x]\s*(\d+)\b/i)
      || l.match(/\b(\d+)\s*(?:occurrences?|[ée]l[ée]ments?|fois|cas)\b/i);
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
// D-41 (b) : la précédence s'applique AVANT le partage neufs/préexistants. Un constat neutralisé
// par la charte posée du fichier n'est pas « préexistant », il n'a jamais eu lieu d'être.
const neutralises = apresConstats.filter(l => constatDePoliceNeutralise(l, contenu));
const versionHead = constatsAvant(cible);
const { neufs, preexistants, delta } = partagerConstats(
  apresConstats.filter(l => !neutralises.includes(l)), versionHead.constats);

if (!neufs.length && !preexistants.length && neutralises.length) {
  if (compte[cle]) { delete compte[cle]; ecrire(compte); }
  sortie(0, `qo-gate-write : « ${path.basename(cible)} » PASSE — ${neutralises.length} constat(s) de POLICE `
    + `écarté(s) par la règle de PRÉCÉDENCE (D-41 (b), registre des oracles, profil digit-ai) : une charte POSÉE `
    + `prime sur la liste des fontes réflexes. Ce fichier déclare la charte « ${(charteDeclaree(contenu) || {}).nom} », `
    + `qui prescrit ces fontes.\n` + neutralises.slice(0, 4).join('\n'));
}

if (delta && !neufs.length && preexistants.length) {
  if (compte[cle]) { delete compte[cle]; ecrire(compte); }
  sortie(0, `qo-gate-write : « ${path.basename(cible)} » PASSE — les ${preexistants.length} constat(s) `
    + `de ce fichier PRÉEXISTENT à cette édition (mêmes constats sur la version HEAD), aucun n'est `
    + `neuf. Le gate juge le DELTA depuis le 01/09 (décision D-33) : un défaut historique n'est plus `
    + `un péage sur chaque édition future. La dette reste due et reste nommée :\n`
    + preexistants.slice(0, 8).join('\n')
    + `\nLimite déclarée : deux constats de même classe dont aucun compteur ne bouge se confondent — `
    + `depuis TF-0815 la ligne porte le NOMBRE de constats de son oracle, donc une occurrence de plus `
    + `est vue ; deux constats distincts de même rang, non.`);
}

const n = (compte[cle] || 0) + 1;
compte[cle] = n; ecrire(compte);

if (n > MAX_ECHECS) {
  delete compte[cle]; ecrire(compte);
  sortie(0, `qo-gate-write : ${MAX_ECHECS} passes en échec sur « ${path.basename(cible)} » — plafond atteint, contrôle laissé passer. Handoff humain (loi qualité §5) : ne pas abaisser les seuils, signaler les écarts résiduels à Sébastien.`);
}

// Le verdict SÉPARE ce que cette édition introduit de ce qu'elle hérite : mélanger les deux
// fait chercher la cause au mauvais endroit, et c'est le coût mesuré le 31/08.
// Les préexistants sont CITÉS sous leur forme NORMALISÉE (TF-0806) : c'est cette ligne-là qui a
// servi de clé, et la montrer est le seul moyen, pour un lecteur, de voir POURQUOI un constat a
// été reconnu des deux côtés — un partage invérifiable se croit sur parole.
const details = (delta ? neufs : apresConstats).slice(0, 8).join('\n')
  // TF-0816 : quand le delta n'a PAS été calculable, le verdict le DIT et dit pourquoi. Sans cette
  // ligne, un refus faute de delta ressemble trait pour trait à un refus après un delta calculé
  // sans aucun préexistant, et la cause se cherche là où elle n'est pas.
  + (!delta
      ? `\n(DELTA NON CALCULABLE — ${versionHead.motif || 'motif indéterminé'}. Aucun partage `
        + `neufs/préexistants n'a donc eu lieu : TOUT constat ci-dessus compte comme neuf, et le gate `
        + `bloque comme avant D-33. « Je ne sais pas » ne vaut jamais « c'est bon ».)`
      : '')
  + (delta && preexistants.length
      ? `\n(+ ${preexistants.length} constat(s) PRÉEXISTANT(S) sur ce fichier, non imputé(s) à cette `
        + `édition — reconnus sur la ligne NORMALISÉE, chemin remplacé par « ${JETON_CHEMIN} » :\n`
        + preexistants.slice(0, 4).map(l => '   · ' + normaliserChemin(l).trim()).join('\n')
        + (preexistants.length > 4 ? `\n   · (+ ${preexistants.length - 4} autre(s))` : '') + ')'
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

  // ── TF-0806 + TF-0812 (05/09/2026) — LA MEME LIGNE, VUE DES DEUX COTES DU PARTAGE. La version
  // HEAD est jugee dans une COPIE TEMPORAIRE : le runner ecrit son chemin DANS la ligne, donc la
  // meme constatation y porte un autre chemin (et un autre numero de ligne). Ces trois lignes sont
  // celles observees le 05/09, chemins reels raccourcis.
  const M7_REEL = "  ❌ [Lisibilite d'un document (Markdown)] docs\\run-playbook.md — M7 chapitre sans ouverture : « Discipline du run » (ligne 118) commence directement par des donnees.";
  const M7_HEAD = "  ❌ [Lisibilite d'un document (Markdown)] ..\\..\\Local\\Temp\\qo-delta-a1b2c3\\run-playbook.md — M7 chapitre sans ouverture : « Discipline du run » (ligne 112) commence directement par des donnees.";
  const M10_NEUF = "  ❌ [Lisibilite d'un document (Markdown)] docs\\run-playbook.md — M10 chapitre de plus de 12 lignes de tableau sans mode de lecture (ligne 140).";

  // ── TF-0815 (05/09/2026) — LES TROIS ETATS D UNE MEME LIGNE D ORACLE. Ces lignes sont celles
  // mesurees le 05/09 sur deux notes identiques a un chapitre pres, au format que le runner rend
  // depuis ce jour : le COMPTE en tete, puis les deux premiers messages. Sans le compte, les deux
  // premieres etaient identiques mot pour mot — c est tout le defaut.
  const M7_DEUX = "  ❌ [Lisibilite d'un document (Markdown)] notes\\note.md — 2 constat(s) · M7 chapitre sans ouverture : « Chapitre A » (ligne 6) commence directement par des donnees. ; M7 chapitre sans ouverture : « Chapitre B » (ligne 13) commence directement par des donnees.";
  const M7_TROIS = "  ❌ [Lisibilite d'un document (Markdown)] notes\\note.md — 3 constat(s) · M7 chapitre sans ouverture : « Chapitre A » (ligne 6) commence directement par des donnees. ; M7 chapitre sans ouverture : « Chapitre B » (ligne 13) commence directement par des donnees.";
  // La MEME ligne vue du cote HEAD : autre chemin (copie temporaire) et autres numeros de ligne.
  const M7_DEUX_AILLEURS = "  ❌ [Lisibilite d'un document (Markdown)] ..\\Temp\\qo-delta-a1b2c3\\note.md — 2 constat(s) · M7 chapitre sans ouverture : « Chapitre A » (ligne 4) commence directement par des donnees. ; M7 chapitre sans ouverture : « Chapitre B » (ligne 11) commence directement par des donnees.";
  const NON_CONFORME = "❌ NON CONFORME — 1 oracle(s) en echec (2 PASS, 4 SKIP). Corriger la source puis relancer.";

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
    // ── TF-0806 + TF-0812 (05/09/2026) — LE CHEMIN N'EST PAS L'IDENTITE, DANS LES DEUX SENS.
    // Le premier cas est celui qui etait ROUGE le 05/09 : une edition qui n'ajoutait AUCUN constat
    // etait refusee, parce que la copie temporaire de HEAD vit sous un autre chemin que le fichier
    // reel et qu'aucune cle ne coincidait. Les suivants gardent la porte fermee : ajouter un
    // constat bloque toujours, il est NOMME, et normaliser ne confond pas deux regles distinctes.
    ['VERTE  meme constat des DEUX COTES malgre deux chemins differents : PREEXISTANT, 0 neuf',
      () => { const p = partagerConstats([M7_REEL], [M7_HEAD]);
              return p.neufs.length === 0 && p.preexistants.length === 1 && p.delta === true; }],
    ['ROUGE  la meme edition qui AJOUTE un constat : 1 NEUF, nomme, le preexistant reste non impute',
      () => { const p = partagerConstats([M7_REEL, M10_NEUF], [M7_HEAD]);
              return p.neufs.length === 1 && p.neufs[0] === M10_NEUF && p.preexistants.length === 1; }],
    ['ROUGE  normaliser le chemin ne CONFOND pas deux regles differentes (M10 n est pas M7)',
      () => { const p = partagerConstats([M10_NEUF], [M7_HEAD]);
              return p.neufs.length === 1 && p.preexistants.length === 0; }],
    ['VERTE  le chemin devient un JETON FIXE des deux cotes, et rien du chemin ne survit',
      () => normaliserChemin(M7_REEL).includes(JETON_CHEMIN) && normaliserChemin(M7_HEAD).includes(JETON_CHEMIN)
            && !/docs|qo-delta|run-playbook/.test(normaliserChemin(M7_REEL) + normaliserChemin(M7_HEAD))],
    ['ROUGE  ce qui n est PAS un chemin reste intact (sur-normaliser confondrait deux constats)',
      () => normaliserChemin('❌ L4 ratio 2/3 des colonnes sans filtre (ligne 12)')
              === '❌ L4 ratio 2/3 des colonnes sans filtre (ligne 12)'],
    ['       la limite de l\'exemption est declaree au non_juge (marqueurs exotiques)',
      () => NON_JUGE.length >= 3 && /exotiques/.test(NON_JUGE[0])],
    // ── D-41 (b) (02/09/2026) — LA PRECEDENCE, DANS LES DEUX SENS. Une charte POSEE prime sur
    // la liste des fontes reflexes. Le cas rouge est celui qui compte : une page SANS charte
    // reste accusee, sans quoi la regle de precedence serait une desactivation deguisee.
    ['VERTE  gabarit CHARTE : le constat de police est NEUTRALISE (une charte posee prime)',
      () => constatDePoliceNeutralise('❌ L2 police reflexe : « DM Sans » x 4',
              ':root { --font-corps: "DM Sans", system-ui, sans-serif; }') === true],
    ['VERTE  les TROIS fontes de la charte sont couvertes, pas seulement DM Sans',
      () => constatDePoliceNeutralise('❌ S3 polices reflexes : « Roboto », « JetBrains Mono »',
              'font-family: Roboto, "DM Sans", sans-serif;') === true],
    ['ROUGE  page SANS charte declaree : le constat de police TIENT, la regle generique s applique',
      () => constatDePoliceNeutralise('❌ L2 police reflexe : « DM Sans » x 4',
              '<style>body { font-family: Arial; }</style>') === false],
    ['ROUGE  fonte HORS charte dans un fichier charte : le constat TIENT (« Inter » n est pas de la charte)',
      () => constatDePoliceNeutralise('❌ S3 polices reflexes : « Inter »',
              ':root { --font-corps: "DM Sans", sans-serif; }') === false],
    ['ROUGE  constat de police qui ne NOMME aucune fonte : jamais neutralise (« je ne sais pas » ne vaut pas « c est bon »)',
      () => constatDePoliceNeutralise('❌ L2 police reflexe x 7',
              ':root { --font-corps: "DM Sans", sans-serif; }') === false],
    ['ROUGE  un constat qui n est PAS de police n est jamais touche par la precedence',
      () => constatDePoliceNeutralise('❌ M7 chapitre sans phrase d ouverture : « DM Sans »',
              ':root { --font-corps: "DM Sans", sans-serif; }') === false],
    // ── TF-0815 (05/09/2026) — LA LIGNE DIT COMBIEN DE CONSTATS ELLE RESUME. Le runner ne
    // rendait que les DEUX PREMIERS messages d un oracle : deux versions d un meme fichier
    // portant 2 puis 3 constats de la MEME regle rendaient une ligne identique mot pour mot,
    // donc la meme cle, donc « 0 neuf » — le gate s ouvrait sur du travail NEUF, le seul des
    // deux defauts possibles qui laisse passer un defaut reel. Le premier cas est celui qui
    // etait ROUGE le 05/09 ; le second garde la porte OUVERTE quand rien n a ete ajoute, sans
    // quoi le correctif redeviendrait le peage que D-33 a supprime.
    ['ROUGE  un TROISIEME constat du meme oracle est NEUF, nomme, et l ecriture est refusee',
      () => { const p = partagerConstats([M7_TROIS, NON_CONFORME], [M7_DEUX, NON_CONFORME]);
              return p.neufs.length === 1 && p.neufs[0] === M7_TROIS && p.preexistants.length === 1; }],
    ['VERTE  meme HEAD, edition SANS constat neuf : 0 neuf, 2 preexistants, l ecriture passe',
      () => { const p = partagerConstats([M7_DEUX_AILLEURS, NON_CONFORME], [M7_DEUX, NON_CONFORME]);
              return p.neufs.length === 0 && p.preexistants.length === 2 && p.delta === true; }],
    ['ROUGE  un constat de MOINS du meme oracle reste PREEXISTANT (solder une part de la dette ne bloque pas)',
      () => { const p = partagerConstats([M7_DEUX], [M7_TROIS]);
              return p.neufs.length === 0 && p.preexistants.length === 1; }],
    // ── TF-0816 (05/09/2026) — LE DELTA NE SE REND PLUS NON CALCULABLE EN SILENCE. `constatsAvant`
    // interrogeait `git -C <dossier de la cible> ls-files -- <cible telle que recue>` : la cible y
    // est reinterpretee relativement au dossier passe a -C, donc un chemin RELATIF ne s y resolvait
    // jamais. La fonction rendait null, tout comptait comme neuf, et le verdict ne disait pas que
    // le delta avait ete abandonne — indistinguable d un delta calcule sans aucun preexistant.
    ['VERTE  chemin RELATIF et chemin ABSOLU du meme fichier : MEME cible interrogee, donc meme partage',
      () => cibleResolue('run/rapport-jouet.md', '/depot')
              === cibleResolue('/depot/run/rapport-jouet.md', '/depot')],
    ['ROUGE  la cible interrogee est TOUJOURS absolue — plus rien ne part relatif vers git -C',
      () => path.isAbsolute(cibleResolue('run/rapport-jouet.md', '/depot'))],
    ['ROUGE  cible HORS DEPOT : le repli est DECLARE, le motif est ecrit et jamais null',
      () => /hors d[ée]p[oô]t/i.test(String(motifSansDelta('hors-depot')))],
    ['ROUGE  les etats sans delta ont chacun leur motif, et deux motifs ne se confondent pas',
      () => { const m = ['hors-depot', 'non-resolu', 'absent-de-head', 'seconde-passe-injouable']
                .map(motifSansDelta);
              return m.every(x => typeof x === 'string' && x.length > 10) && new Set(m).size === 4; }],
    ['VERTE  un delta CALCULABLE ne fabrique aucun motif (on ne declare pas un repli qui n a pas eu lieu)',
      () => motifSansDelta(null) === null && motifSansDelta('calculable') === null],
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
