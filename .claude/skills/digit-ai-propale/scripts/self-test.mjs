#!/usr/bin/env node
// self-test — contrôle exécuté d'un skill Digit-AI versionné en source (TF-1021 / TF-1022,
// 11/09/2026). Node pur, zéro dépendance, déterministe, double sens (fixture rouge ET verte).
//
// POURQUOI IL EXISTE, et le fait est daté. Le 11/09/2026, l'audit des quatre skills qui ne
// vivaient qu'en archive a mesuré deux défauts qu'aucun contrôle n'attrapait :
//   — `digit-ai-pptx` v2.5.0 citait 14 ressources en chemin relatif et n'en livrait que 3 ;
//     11 liens morts, dont la charte « toujours » à charger et le script mis en avant dans
//     la description elle-même. Un skill dont le workflow renvoie vers des fichiers absents
//     n'est pas déroulable, et rien ne le disait.
//   — 4 des 5 fichiers `references/` de `digit-ai-propale` embarquaient, en clair, les noms
//     de cinq clients réels — dans un paquet réutilisé pour TOUT client futur, et alors que
//     la règle dure n° 2 du skill lui-même interdit exactement cette migration.
// C1 ferme le premier trou, C2 le second.
//
// CE QU'IL JUGE
//   C1 — tout chemin relatif cité par SKILL.md existe dans le skill.
//        Une ligne portant la mention « non livré » est EXEMPTÉE : déclarer un manque est
//        l'inverse d'un lien mort, et un skill doit pouvoir nommer ce qui lui manque.
//   C2 — aucun terme de la table des noms interdits dans les fichiers texte du skill.
//        La table est une DONNÉE et vit HORS de tout dépôt publié (loi transverse n° 4) :
//        elle est résolue à l'exécution, jamais embarquée — un contrôle qui embarquerait la
//        liste publierait exactement ce qu'il protège. Son ABSENCE rend SKIP, jamais PASS.
//
//   C3 — le skill LIT les données d'instance de l'émetteur (TF-2350) : `scripts/lire-instance.mjs` sur un
//        émetteur FICTIF complet (fixtures/instance), puis refus (exit 2, message, rien sur stdout) quand le
//        dossier de marque, la ligne Baseline, le fichier des offres ou la section de cadence manque.
//   C4 — aucune donnée d'instance textuelle en dur (TF-2350) : l'extension, aux textes de SKILL.md et de
//        references/, du contrôle « aucune valeur de marque en dur » de digit-ai-pptx. Adresse électronique et nom
//        de domaine d'abord ; puis toute valeur que l'émetteur déclare (baseline, footer, éléments de modalités,
//        phrases de cadence et de validité), lue chez lui au moment du test et retrouvée mot pour mot.
//
// DOUBLE SENS. C1, C3 et C4 sont rejoués sur une FIXTURE ROUGE synthétique (un SKILL.md temporaire qui
// cite un fichier absent) : si la fixture rouge ne rougit pas, le contrôle est aveugle et le
// self-test échoue de lui-même. La fixture VERTE est le skill réel.
//
// Sortie : JSON {verdict, findings, non_juge} sur stdout. Exit 0 (PASS) / 1 (FAIL) / 2 (SKIP).
// Usage : node scripts/self-test.mjs [--skill=<dir>] [--referentiel=<chemin table>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=');

const SKILL_DIR = path.resolve(opt('skill') || path.join(ICI, '..'));
const NOM_SKILL = path.basename(SKILL_DIR);

// --referentiel=<chemin> est AUTORITAIRE : s'il est donné, aucune autre piste n'est explorée.
// Sans lui, les pistes par défaut du parc sont essayées dans l'ordre.
const REF_EXPLICITE = opt('referentiel');
const PISTES_TABLE = REF_EXPLICITE ? [REF_EXPLICITE] : [
  process.env.FORGE_NOMS_INTERDITS,
  process.env.FORGE_ROOT ? path.join(process.env.FORGE_ROOT, '_confidentiel', 'tables', 'noms-interdits.json') : null,
  'C:/dev/_confidentiel/tables/noms-interdits.json',
  path.join(SKILL_DIR, '..', '..', '..', '..', '_confidentiel', 'tables', 'noms-interdits.json'),
].filter(Boolean);

const NON_JUGE = [
  "ne lit que du TEXTE : un nom vivant dans une image, une archive ou un binaire n'est pas vu",
  "C1 ne juge que SKILL.md — un chemin mort cité par un fichier de references/ n'est pas attrapé",
  "C1 ne vérifie que l'EXISTENCE du fichier, jamais que son contenu tient la promesse du renvoi",
  "C2 n'a pas d'opinion sur un nom de client ABSENT de la table : la table est figée et ne s'étend pas toute seule",
  "C2 exige une frontière non alphanumérique autour des termes de 4 caractères ou moins, pour ne pas rougir sur une sous-chaîne fortuite — un sigle court collé à un mot lui échappe donc",
  "C3 joue lire-instance.mjs sur un émetteur SYNTHÉTIQUE : il ne dit rien du dossier de marque réel, ni de la justesse des valeurs qui y vivent",
  "C4 ne lit que SKILL.md et references/*.md : une donnée d'instance dans scripts/ ou fixtures/ n'est pas vue ; il ne voit que les adresses, les domaines et les valeurs que l'émetteur a déclarées dans MARQUE.md et modalites.md — un lexique (MARQUE.md § Vocabulaire) ou un nom de modèle d'une autre source lui échappe",
  "ne juge ni la qualité rédactionnelle, ni le déclenchement, ni la conformité à la charte du parc",
];

const EXT_TEXTE = new Set(['.md', '.mjs', '.js', '.py', '.html', '.css', '.json', '.txt', '.xml', '.yml', '.yaml', '.jsonl']);
const EXT_CITABLE = new Set(['.md', '.mjs', '.js', '.py', '.html', '.css', '.json', '.txt', '.xml']);

function marcher(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '__pycache__' || e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) marcher(p, out);
    else out.push(p);
  }
  return out;
}

const sansAccent = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ---------------------------------------------------------------- C1 : liens relatifs
// Extrait les candidats « chemin » d'un SKILL.md : ce qui est entre backticks et les cibles
// de liens Markdown. Un candidat est retenu s'il ressemble à un fichier du skill.
function cheminsCites(texte) {
  const trouves = [];
  texte.split(/\r?\n/).forEach((ligne, i) => {
    if (sansAccent(ligne).includes('non livre')) return; // manque DÉCLARÉ ≠ lien mort
    const bruts = [
      ...[...ligne.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]),
      ...[...ligne.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
    ];
    for (const brut of bruts) {
      const tok = brut.trim();
      if (!tok || /\s/.test(tok)) continue;              // libellés, gabarits de nommage
      if (/^[a-z]+:\/\//i.test(tok)) continue;           // URL
      if (tok.startsWith('/') || /^[A-Za-z]:[\\/]/.test(tok)) continue; // chemin absolu
      if (/[{}<>*?|]/.test(tok)) continue;               // gabarit, placeholder
      const ext = path.extname(tok).toLowerCase();
      if (!EXT_CITABLE.has(ext)) continue;
      trouves.push({ tok, ligne: i + 1 });
    }
  });
  return trouves;
}

function verifierChemins(dirSkill, texteSkillMd, etiquette) {
  const findings = [];
  let fichiers = [];
  try { fichiers = marcher(dirSkill).map((f) => path.relative(dirSkill, f).replace(/\\/g, '/')); } catch { fichiers = []; }
  const basenames = new Set(fichiers.map((f) => f.split('/').pop()));
  for (const { tok, ligne } of cheminsCites(texteSkillMd)) {
    const existe = tok.includes('/')
      ? fs.existsSync(path.join(dirSkill, tok))
      : basenames.has(tok);
    if (!existe) findings.push(`${etiquette}:${ligne} — chemin cité et absent du skill : ${tok}`);
  }
  return findings;
}

// ---------------------------------------------------------------- C2 : noms interdits
function chargerTable() {
  for (const p of PISTES_TABLE) {
    try {
      if (p && fs.existsSync(p)) {
        const t = JSON.parse(fs.readFileSync(p, 'utf8'));
        const termes = new Set([
          ...(t.noms || []), ...(t.identifiants || []), ...(t.sigles || []),
          ...Object.keys(t.pseudonymes || {}),
        ].filter(Boolean));
        return { chemin: p, termes: [...termes] };
      }
    } catch { /* piste suivante */ }
  }
  return null;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function verifierNoms(dirSkill, termes) {
  const findings = [];
  for (const f of marcher(dirSkill)) {
    if (!EXT_TEXTE.has(path.extname(f).toLowerCase())) continue;
    let lignes;
    try { lignes = fs.readFileSync(f, 'utf8').split(/\r?\n/); } catch { continue; }
    const rel = path.relative(dirSkill, f).replace(/\\/g, '/');
    for (const terme of termes) {
      const motif = terme.length <= 4
        ? new RegExp(`(?<![A-Za-z0-9])${esc(terme)}(?![A-Za-z0-9])`, 'i')
        : new RegExp(esc(terme), 'i');
      lignes.forEach((l, i) => {
        if (motif.test(l)) findings.push(`${rel}:${i + 1} — terme de la table des noms interdits présent (terme non recopié ici)`);
      });
    }
  }
  return findings;
}

// ------------------------------------------- C3 : le skill LIT les données d'instance de l'émetteur (TF-2350)
// Le fait (relevé du 11/09/2026, 17 lignes) : baseline, kicker, footer, coordonnées, cadence, modalités,
// engagements, architecture type écrits en dur dans les gabarits. `scripts/lire-instance.mjs` les lit chez
// l'émetteur ; fixture verte : un émetteur FICTIF complet ; fixtures rouges : dossier absent, tableau sans la
// ligne « Baseline », fichier des offres absent — chacune rend exit 2, un message, et RIEN sur stdout.
const LECTEUR_INSTANCE = path.join(SKILL_DIR, 'scripts', 'lire-instance.mjs');
const FIX_INSTANCE = path.join(SKILL_DIR, 'fixtures', 'instance');
function jouerInstance(marque, extra = []) {
  const r = spawnSync(process.execPath, [LECTEUR_INSTANCE, `--marque=${marque}`, '--compact', ...extra], { encoding: 'utf8', timeout: 30000, env: { ...process.env, DIGIT_AI_OFFRES: '' } });
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* le code le dit */ }
  return { code: r.status, j, out: r.stdout || '', err: r.stderr || '' };
}
function verifierLectureInstance() {
  const findings = [];
  const skillMd = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
  if (!skillMd.includes('scripts/lire-instance.mjs')) findings.push('C3 : SKILL.md ne prescrit plus `scripts/lire-instance.mjs` : les données d\'instance ne se lisent plus chez l\'émetteur');
  if (!/Exit 2 ⇒ s'arrêter et rendre la main/.test(skillMd)) findings.push('C3 : SKILL.md ne dit plus de rendre la main quand les données de l\'émetteur manquent');
  if (!fs.existsSync(LECTEUR_INSTANCE) || !fs.existsSync(path.join(FIX_INSTANCE, 'marque', 'MARQUE.md'))) return [...findings, 'C3 : scripts/lire-instance.mjs ou fixtures/instance absent'];
  const marque = path.join(FIX_INSTANCE, 'marque');
  // sens VERT : l'émetteur fictif complet
  const v = jouerInstance(marque);
  if (v.code !== 0 || !v.j) findings.push(`C3 sens vert : l'émetteur fictif complet doit être lu (code ${v.code}) — ${v.err.split('\n')[0]}`);
  else {
    const s = v.j.signatures, o = v.j.sections;
    const attendu = [
      [s.baseline && s.baseline.valeur, 'Le sens avant la vitesse', 'baseline'],
      [s['coordonnees-publiques'] && s['coordonnees-publiques'].valeur, 'bonjour@exemple.invalid · exemple.invalid', 'coordonnees-publiques'],
      [s['annee-de-reference'] && s['annee-de-reference'].valeur, '2030', 'annee-de-reference'],
      [o['cadence-d-un-lot-applicatif'] && /quatre semaines/.test(o['cadence-d-un-lot-applicatif'].texte), true, 'cadence-d-un-lot-applicatif'],
      [o['modalites-de-facturation-et-de-perimetre'] && o['modalites-de-facturation-et-de-perimetre'].elements.length, 3, 'modalites (3 éléments)'],
      [o['architecture-type-citee'] && o['architecture-type-citee'].perissable, true, 'architecture-type-citee périssable'],
    ];
    for (const [obtenu, voulu, nom] of attendu) if (obtenu !== voulu) findings.push(`C3 sens vert : « ${nom} » = ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(voulu)} : la valeur rendue ne vient pas de l'émetteur`);
  }
  // sens ROUGE 1 : dossier de marque absent
  const a = jouerInstance(path.join(FIX_INSTANCE, 'marque-qui-n-existe-pas'));
  if (a.code !== 2 || a.out.trim() || !/introuvable/.test(a.err)) findings.push(`C3 sens rouge : un dossier de marque absent doit rendre exit 2, un message, rien sur stdout (code ${a.code})`);
  // sens ROUGE 2 et 3 : sur des copies altérées de la fixture verte
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'instance-'));
  try {
    const copie = (nom) => { const d = path.join(dossier, nom); fs.cpSync(FIX_INSTANCE, d, { recursive: true }); return d; };
    const d1 = copie('sans-baseline');
    const f1 = path.join(d1, 'marque', 'MARQUE.md');
    fs.writeFileSync(f1, fs.readFileSync(f1, 'utf8').split('\n').filter((l) => !/^\| Baseline \|/.test(l)).join('\n'));
    const r1 = jouerInstance(path.join(d1, 'marque'));
    if (r1.code !== 2 || r1.out.trim() || !/baseline/.test(r1.err)) findings.push(`C3 sens rouge : un tableau sans la ligne Baseline doit rendre exit 2 en nommant « baseline » (code ${r1.code}, stdout ${r1.out.trim() ? 'écrit' : 'vide'})`);
    const d2 = copie('sans-offres');
    fs.rmSync(path.join(d2, 'offres', 'modalites.md'));
    const r2 = jouerInstance(path.join(d2, 'marque'));
    if (r2.code !== 2 || r2.out.trim() || !/modalites\.md/.test(r2.err)) findings.push(`C3 sens rouge : un fichier des offres absent doit rendre exit 2 en le nommant (code ${r2.code})`);
    const d3 = copie('sans-cadence');
    const f3 = path.join(d3, 'offres', 'modalites.md');
    fs.writeFileSync(f3, fs.readFileSync(f3, 'utf8').replace(/## Cadence d'un lot applicatif[^\n]*\n/, '## Autre sujet\n'));
    const r3 = jouerInstance(path.join(d3, 'marque'));
    if (r3.code !== 2 || !/cadence-d-un-lot-applicatif/.test(r3.err)) findings.push(`C3 sens rouge : une section de cadence retirée doit rendre exit 2 en la nommant (code ${r3.code})`);
  } finally {
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch { /* rien */ }
  }
  return findings;
}

// ----------------------------- C4 : aucune donnée d'instance textuelle en dur dans le skill (TF-2350)
// C4 du skill digit-ai-pptx juge les VALEURS de marque (couleurs, polices) ; il s'étend ici aux données
// d'instance TEXTUELLES : une adresse électronique ou un nom de domaine écrits dans SKILL.md ou references/,
// et toute valeur que l'émetteur déclare (baseline, footer, coordonnées, éléments de modalités…) retrouvée
// mot pour mot. Les valeurs de l'émetteur réel se lisent au moment du test (lire-instance.mjs) : le contrôle
// n'en embarque aucune ; si l'émetteur n'est pas joignable, seuls les motifs jouent, et le non_juge le dit.
// Domaines TECHNIQUES admis (espaces de noms, services d'outils) : ils ne décrivent aucun émetteur. Liste figée, dite au non_juge.
const DOMAINES_TECHNIQUES = ['w3.org', 'googleapis.com', 'gstatic.com', 'google.com', 'claude.ai', 'anthropic.com', 'github.com', 'npmjs.com', 'nodejs.org', 'unsplash.com'];
const motifDomaine = /\b(?:[A-Za-z0-9-]+\.)+(?:fr|com|io|ai|eu|net|org|dev)\b/g;
const MOTIFS_INSTANCE = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/, 'adresse électronique'],
  [{ match: (ligne) => (ligne.match(motifDomaine) || []).find((d) => !DOMAINES_TECHNIQUES.some((t) => d.toLowerCase() === t || d.toLowerCase().endsWith('.' + t))) }, 'nom de domaine'],
];
const normaliser = (s) => s.replace(/\*\*/g, '').replace(/[«»]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
function valeursDInstance(lu) {
  const v = new Set();
  for (const e of Object.values(lu.signatures || {})) if (e.valeur && e.valeur.length >= 12) v.add(normaliser(e.valeur));
  for (const s of Object.values(lu.sections || {})) {
    for (const e of s.elements || []) if (e.length >= 20) v.add(normaliser(e));
    for (const phrase of s.texte.split(/(?<=[.!?])\s+/)) if (!/^\s*-/.test(phrase) && phrase.length >= 30) v.add(normaliser(phrase));
  }
  return [...v];
}
function donneesEnDur(texte, valeurs, etiquette) {
  const findings = [];
  const brut = texte.split(/\r?\n/);
  brut.forEach((ligne, i) => {
    for (const [motif, nom] of MOTIFS_INSTANCE) {
      const trouve = typeof motif.match === 'function' ? motif.match(ligne) : (ligne.match(motif) || [])[0];
      if (trouve) findings.push(`${etiquette}:${i + 1} — ${nom} en dur : ${trouve} — la lire chez l'émetteur (scripts/lire-instance.mjs)`);
    }
  });
  const plat = normaliser(texte);
  for (const val of valeurs) if (plat.includes(val)) findings.push(`${etiquette} — valeur d'instance de l'émetteur écrite en dur : « ${val.slice(0, 60)} » — écrire la clé {signatures.…} ou {sections.…}, la valeur vit chez l'émetteur`);
  return findings;
}
function fichiersDeContenu(dir) {
  const out = [path.join(dir, 'SKILL.md')];
  const refs = path.join(dir, 'references');
  if (fs.existsSync(refs)) for (const f of fs.readdirSync(refs)) if (f.endsWith('.md')) out.push(path.join(refs, f));
  return out.filter((f) => fs.existsSync(f));
}
function verifierDonneesEnDur() {
  const findings = [];
  const nonJugeLocal = [];
  // valeurs de l'émetteur FICTIF (fixture) : pour la preuve à double sens
  const fict = jouerInstance(path.join(FIX_INSTANCE, 'marque'));
  const valFict = fict.j ? valeursDInstance(fict.j) : [];
  if (!valFict.length) findings.push('C4 : les valeurs de l\'émetteur fictif ne se lisent pas : le contrôle ne peut pas prouver son sens rouge');
  // sens ROUGE : un texte qui recopie baseline, footer et coordonnées de l'émetteur fictif, et un autre qui porte une adresse
  const planté = ['# Fixture rouge', '', 'Couverture : « Le sens avant la vitesse » et footer « Émetteur fictif · Offre · {CLIENT} · {Mois Année} · Diffusion restreinte ».', ''].join('\n');
  const f1 = donneesEnDur(planté, valFict, 'fixture-rouge');
  if (!f1.some((x) => /valeur d'instance/.test(x))) findings.push("fixture-rouge — C4 est AVEUGLE : la baseline de l'émetteur fictif, recopiée dans un gabarit, n'a pas été vue");
  const f2 = donneesEnDur('Contact : bonjour@exemple.fr · exemple.fr\n', [], 'fixture-rouge');
  if (f2.length !== 2) findings.push(`fixture-rouge — C4 est AVEUGLE ou bavard : une adresse et un domaine plantés doivent rendre 2 constats (${f2.length})`);
  // sens VERT : le même texte écrit avec les clés passe
  if (donneesEnDur('Couverture : `{signatures.baseline}`, footer `{signatures.footer-de-proposition}`, contact `{signatures.coordonnees-publiques}`.\n', valFict, 'fixture-verte').length) findings.push('fixture-verte — C4 rougit sur un texte écrit avec les clés : faux positif');
  // le skill réel : motifs, puis valeurs de l'émetteur réel quand il est joignable
  const reel = jouerInstance(path.join(process.env.FORGE_ROOT || path.resolve(SKILL_DIR, '..', '..', '..', '..'), 'digit-ai-marketing', 'donnees', 'marque'));
  const valeursReelles = reel.j ? valeursDInstance(reel.j) : [];
  if (!reel.j) nonJugeLocal.push("C4 : l'émetteur réel (digit-ai-marketing, donnees/marque) n'est pas joignable : seuls les motifs (adresse électronique, nom de domaine) et l'émetteur fictif sont joués, ses valeurs réelles ne sont pas comparées au texte du skill");
  for (const f of fichiersDeContenu(SKILL_DIR)) findings.push(...donneesEnDur(fs.readFileSync(f, 'utf8'), valeursReelles, path.relative(SKILL_DIR, f).replace(/\\/g, '/')));
  return { findings, nonJugeLocal, valeursComparees: valeursReelles.length };
}

// ---------------------------------------------------------------- exécution
const findings = [];
const nonJuge = [...NON_JUGE];
let verdict = 'PASS';

// C1 — fixture VERTE : le skill réel
const skillMdPath = path.join(SKILL_DIR, 'SKILL.md');
if (!fs.existsSync(skillMdPath)) {
  findings.push(`${NOM_SKILL}/SKILL.md — absent : un skill sans SKILL.md n'est pas un skill`);
  verdict = 'FAIL';
} else {
  findings.push(...verifierChemins(SKILL_DIR, fs.readFileSync(skillMdPath, 'utf8'), `${NOM_SKILL}/SKILL.md`));
}

// C1 — fixture ROUGE : un SKILL.md temporaire qui cite un fichier absent DOIT rougir
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'self-test-rouge-'));
try {
  const rouge = [
    '# Fixture rouge', '',
    'Renvoi vers `references/fichier-absent-fixture-rouge.md` — ce fichier n\'existe pas.', '',
    'Renvoi déclaré : `scripts/outil-fantome.py` — **non livré** (doit être EXEMPTÉ).', '',
  ].join('\n');
  fs.writeFileSync(path.join(tmp, 'SKILL.md'), rouge);
  const fr = verifierChemins(tmp, rouge, 'fixture-rouge/SKILL.md');
  const attrapeAbsent = fr.some((x) => x.includes('fichier-absent-fixture-rouge.md'));
  const exempteDeclare = !fr.some((x) => x.includes('outil-fantome.py'));
  if (!attrapeAbsent) { findings.push('fixture-rouge — C1 est AVEUGLE : un chemin absent n\'a pas été détecté'); verdict = 'FAIL'; }
  if (!exempteDeclare) { findings.push('fixture-rouge — C1 rougit sur un manque DÉCLARÉ « non livré » : exemption cassée'); verdict = 'FAIL'; }
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* rien */ }
}

// C3 — lecture des données d'instance
findings.push(...verifierLectureInstance());
// C4 — aucune donnée d'instance textuelle en dur
const c4 = verifierDonneesEnDur();
findings.push(...c4.findings);
nonJuge.push(...c4.nonJugeLocal);

// C2 — noms interdits
const table = chargerTable();
let c2Jouee = false;
if (!table) {
  nonJuge.push(
    'C2 NON JOUÉE : table des noms interdits introuvable. Pistes explorées : '
    + PISTES_TABLE.join(' · ')
    + ". REMÈDE : cloner le canal confidentiel du parc (`<racine>\\_confidentiel\\tables\\noms-interdits.json`), "
    + 'ou désigner la table par --referentiel=<chemin> ou la variable FORGE_NOMS_INTERDITS. '
    + "La table vit HORS de tout dépôt publié : ne jamais l'embarquer dans le skill.",
  );
} else {
  c2Jouee = true;
  // C2 — fixture ROUGE, entièrement SYNTHÉTIQUE : un terme inventé, jamais un nom réel.
  // Elle prouve que le détecteur voit quelque chose, sans écrire nulle part ce qu'il protège.
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'self-test-noms-'));
  try {
    const invente = 'ZRGTEST-ORGA';
    fs.writeFileSync(path.join(tmp2, 'SKILL.md'), `# Fixture rouge C2\n\nMission menée chez ${invente} en 2026.\n`);
    if (!verifierNoms(tmp2, [invente]).length) {
      findings.push('fixture-rouge — C2 est AVEUGLE : un terme planté n\'a pas été détecté');
    }
    if (verifierNoms(tmp2, ['ZZQX']).length) {
      findings.push('fixture-verte — C2 rougit sur un terme absent : le détecteur est faux positif');
    }
  } finally {
    try { fs.rmSync(tmp2, { recursive: true, force: true }); } catch { /* rien */ }
  }
  // C2 — fixture VERTE : le skill réel, jugé contre la table du parc.
  findings.push(...verifierNoms(SKILL_DIR, table.termes));
}

if (findings.length) verdict = 'FAIL';
else if (!c2Jouee) verdict = 'SKIP';

const code = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2;
process.stdout.write(JSON.stringify({
  oracle: 'self-test-skill',
  skill: NOM_SKILL,
  artefact: SKILL_DIR.replace(/\\/g, '/'),
  controles: { C1_liens_relatifs: 'jouée', C2_noms_interdits: c2Jouee ? 'jouée' : 'NON jouée (table absente)', C3_lecture_donnees_instance: 'jouée', C4_donnees_instance_en_dur: c4.valeursComparees ? 'jouée (motifs + valeurs de l\'émetteur)' : 'jouée (motifs seuls : émetteur réel injoignable)' },
  verdict,
  findings,
  non_juge: nonJuge,
}, null, 2) + '\n');
process.exit(code);
