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
//   C3 — le tableau de `references/presets-livrables.md` porte au moins 8 presets (TF-1155,
//        17/09/2026 : ajout du preset « Publication réseau »), ce preset y figure nommément,
//        et il porte une section de contrat de sortie détectable. Un preset ajouté sans son
//        contrat de sortie, ou un compte de presets qui régresse sous le seuil, est un FAIL :
//        c'est exactement le défaut qu'un preset « décoratif » (aucun critère vérifiable)
//        laisserait passer sans bruit.
//
// DOUBLE SENS. C1 et C3 sont rejoués sur des FIXTURES ROUGES synthétiques : si une fixture
// rouge ne rougit pas, le contrôle correspondant est aveugle et le self-test échoue de
// lui-même. La fixture VERTE est le skill réel.
//
// Sortie : JSON {verdict, findings, non_juge} sur stdout. Exit 0 (PASS) / 1 (FAIL) / 2 (SKIP).
// Usage : node scripts/self-test.mjs [--skill=<dir>] [--referentiel=<chemin table>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

// ---------------------------------------------------------------- C3 : presets (TF-1155)
// Compte les lignes de DONNÉES du tableau principal de presets-livrables.md (une ligne de
// preset commence par « | ** » — le nom du livrable en gras, première colonne) et vérifie
// que le preset « Publication réseau » y figure avec une section de contrat de sortie.
const MIN_PRESETS_ATTENDU = 8;

function compterLignesPresets(texte) {
  return texte.split(/\r?\n/).filter((l) => /^\|\s*\*\*/.test(l)).length;
}

function verifierPresets(texte, etiquette) {
  const findings = [];
  const nb = compterLignesPresets(texte);
  if (nb < MIN_PRESETS_ATTENDU) {
    findings.push(`${etiquette} — ${nb} preset(s) dans le tableau, ${MIN_PRESETS_ATTENDU} attendus au minimum depuis TF-1155 (« Publication réseau »)`);
  }
  if (!/Publication réseau/.test(texte)) {
    findings.push(`${etiquette} — preset « Publication réseau » absent du tableau`);
  } else if (!/Contrat de sortie, binaire/.test(texte)) {
    findings.push(`${etiquette} — preset « Publication réseau » sans section de contrat de sortie détectable (attendu : « Contrat de sortie, binaire »)`);
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

// C3 — fixture VERTE : le tableau réel de presets-livrables.md
const presetsPath = path.join(SKILL_DIR, 'references', 'presets-livrables.md');
let c3Jouee = false;
if (!fs.existsSync(presetsPath)) {
  nonJuge.push('C3 NON JOUÉE : references/presets-livrables.md introuvable.');
} else {
  c3Jouee = true;
  findings.push(...verifierPresets(fs.readFileSync(presetsPath, 'utf8'), 'digit-ai-communication/references/presets-livrables.md'));

  // C3 — fixture ROUGE 1 : compte de presets faux (sous le seuil, preset absent) DOIT rougir
  const rougeCompte = [
    '# Fixture rouge — compte faux', '',
    '| Livrable | Objectif | Curseur E / L / P | Structure | Patterns prioritaires | Piège à éviter |',
    '|---|---|---|---|---|---|',
    '| **Propale** | x | 1/1/1 | x | x | x |',
    '| **Conférence** | x | 1/1/1 | x | x | x |',
    '| **Formation** | x | 1/1/1 | x | x | x |',
  ].join('\n');
  const frCompte = verifierPresets(rougeCompte, 'fixture-rouge-compte');
  if (!frCompte.length) {
    findings.push('fixture-rouge — C3 est AVEUGLE sur un compte de presets faux : 3 lignes n\'ont pas été détectées comme insuffisantes');
  }

  // C3 — fixture ROUGE 2 : 8 presets, dont « Publication réseau », mais SANS section de
  // contrat de sortie — DOIT rougir spécifiquement sur ce manque, pas sur le compte.
  const rougeContrat = [
    '# Fixture rouge — preset sans contrat de sortie', '',
    '| Livrable | Objectif | Curseur E / L / P | Structure | Patterns prioritaires | Piège à éviter |',
    '|---|---|---|---|---|---|',
    ...Array.from({ length: 7 }, (_, i) => `| **Livrable ${i}** | x | 1/1/1 | x | x | x |`),
    '| **Publication réseau** | x | 1/1/1 | x | x | x |',
    '',
    '(aucune section de contrat de sortie plus bas dans ce fichier)',
  ].join('\n');
  const frContrat = verifierPresets(rougeContrat, 'fixture-rouge-contrat');
  const attrapeContratManquant = frContrat.some((x) => x.includes('sans section de contrat de sortie'));
  const neRougitPasSurLeCompte = !frContrat.some((x) => x.includes('preset(s) dans le tableau'));
  if (!attrapeContratManquant) {
    findings.push('fixture-rouge — C3 est AVEUGLE : un preset « Publication réseau » sans contrat de sortie n\'a pas été détecté');
  }
  if (!neRougitPasSurLeCompte) {
    findings.push('fixture-rouge — C3 se trompe de motif : 8 presets présents, le FAIL doit porter sur le contrat de sortie, pas sur le compte');
  }
}

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
else if (!c2Jouee || !c3Jouee) verdict = 'SKIP';

const code = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2;
process.stdout.write(JSON.stringify({
  oracle: 'self-test-skill',
  skill: NOM_SKILL,
  artefact: SKILL_DIR.replace(/\\/g, '/'),
  controles: {
    C1_liens_relatifs: 'jouée',
    C2_noms_interdits: c2Jouee ? 'jouée' : 'NON jouée (table absente)',
    C3_presets_reseau: c3Jouee ? 'jouée' : 'NON jouée (presets-livrables.md absent)',
  },
  verdict,
  findings,
  non_juge: nonJuge,
}, null, 2) + '\n');
process.exit(code);
