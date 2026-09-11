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
//   C3 — `scripts/lire-marque.mjs` consomme bien un dossier de marque (TF-1023, 11/09/2026) :
//        joué sur les DEUX fixtures de `fixtures/`, dans les DEUX formats (source DTCG et
//        dérivé CSS). Fixture VERTE `marque-valide` : exit 0 et chaque valeur rendue égale à
//        `fixtures/marque-valide/attendu.json` — une valeur en dur survivante divergerait.
//        Fixture ROUGE `marque-sans-blue` : exit 2, le jeton manquant nommé. Dossier absent :
//        exit 2. Un lecteur qui « réussirait » sur la fixture rouge retomberait sur du dur.
//   C4 — SKILL.md ne porte plus de VALEUR de marque en dur : aucune couleur hexadécimale,
//        aucune famille de police nommée comme valeur. Les noms de jetons, eux, sont attendus.
//        Une police nommée pour être INTERDITE reste permise : c'est une règle, pas une valeur.
//
// DOUBLE SENS. Chaque contrôle est rejoué sur une FIXTURE ROUGE : C1 sur un SKILL.md temporaire
// citant un fichier absent, C2 sur un terme inventé, C3 sur le dossier de marque amputé, C4 sur
// un texte planté. Si une fixture rouge ne rougit pas, le contrôle est aveugle et le self-test
// échoue de lui-même. Les fixtures VERTES sont le skill réel et `fixtures/marque-valide`.
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
  "C3 joue lire-marque.mjs sur des fixtures SYNTHÉTIQUES : il ne dit rien du dossier de marque réel de l'émetteur, ni de la justesse des valeurs qui y vivent",
  "C3 ne juge pas le RENDU : qu'un jeton soit lu ne prouve pas qu'il ait été peint sur la diapositive — c'est l'affaire de la passe QA du deck",
  "C4 ne voit que SKILL.md : une valeur en dur dans references/ n'est pas attrapée — charte.md porte d'ailleurs des valeurs datées, explicitement « ne fait pas foi »",
  "C4 ne connaît que la notation hexadécimale à six chiffres et les familles de polices nommées : un nom de couleur CSS ou une valeur rgb() lui échappe",
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

// ------------------------------------------------------- C3 : consommation du système de marque
const LECTEUR = path.join(SKILL_DIR, 'scripts', 'lire-marque.mjs');
const FIX = path.join(SKILL_DIR, 'fixtures');

function jouerLecteur(dossier, format) {
  const r = spawnSync(process.execPath, [LECTEUR, `--marque=${dossier}`, `--format=${format}`, '--compact'], {
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

function verifierMarque() {
  const findings = [];
  if (!fs.existsSync(LECTEUR)) {
    findings.push('scripts/lire-marque.mjs — absent : le skill ne peut plus consommer de système de marque');
    return findings;
  }
  const dossierVert = path.join(FIX, 'marque-valide');
  const dossierRouge = path.join(FIX, 'marque-sans-blue');
  const cheminAttendu = path.join(dossierVert, 'attendu.json');
  if (!fs.existsSync(cheminAttendu)) {
    findings.push('fixtures/marque-valide/attendu.json — absent : la fixture verte ne dit plus ce qu\'elle attend');
    return findings;
  }
  const attendu = JSON.parse(fs.readFileSync(cheminAttendu, 'utf8'));

  for (const format of ['dtcg', 'css']) {
    // FIXTURE VERTE — exit 0 et valeurs strictement égales à celles du dossier de marque lu.
    const v = jouerLecteur(dossierVert, format);
    if (v.code !== 0) {
      findings.push(`fixture-verte/marque-valide (${format}) — lire-marque.mjs sort en ${v.code} au lieu de 0 : ${v.err.split('\n')[0]}`);
      continue;
    }
    let lu;
    try { lu = JSON.parse(v.out); } catch { findings.push(`fixture-verte/marque-valide (${format}) — sortie JSON illisible`); continue; }
    for (const [cle, val] of Object.entries(attendu.usages_pptx || {})) {
      const obtenu = lu.usages_pptx && lu.usages_pptx[cle];
      const brut = obtenu && typeof obtenu === 'object' ? obtenu.pptx : obtenu;
      if (String(brut) !== String(val)) {
        findings.push(`fixture-verte/marque-valide (${format}) — usages_pptx.${cle} = ${brut}, attendu ${val} : la valeur rendue ne vient pas du dossier de marque`);
      }
    }
    for (const [jeton, pouces] of Object.entries(attendu.dimensions_pouces || {})) {
      const d = lu.dimensions && lu.dimensions[jeton];
      if (!d || d.pouces !== pouces) {
        findings.push(`fixture-verte/marque-valide (${format}) — dimension ${jeton} = ${d ? d.pouces : 'absente'} pouce(s), attendu ${pouces} : conversion px→pouce fausse`);
      }
    }

    // FIXTURE ROUGE — un jeton requis manque : le lecteur DOIT rendre la main, pas improviser.
    const r = jouerLecteur(dossierRouge, format);
    if (r.code !== 2) {
      findings.push(`fixture-rouge/marque-sans-blue (${format}) — lire-marque.mjs sort en ${r.code} au lieu de 2 : un jeton manquant ne rend pas la main`);
    } else if (!/blue/i.test(r.err)) {
      findings.push(`fixture-rouge/marque-sans-blue (${format}) — exit 2 correct mais le message ne nomme pas le jeton manquant`);
    }
    if (r.out.trim()) {
      findings.push(`fixture-rouge/marque-sans-blue (${format}) — le lecteur a tout de même écrit des valeurs sur stdout`);
    }
  }

  // FIXTURE ROUGE — dossier de marque injoignable : rendre la main, jamais retomber sur du dur.
  const absent = jouerLecteur(path.join(FIX, 'marque-qui-n-existe-pas'), 'auto');
  if (absent.code !== 2) {
    findings.push(`fixture-rouge/dossier-absent — lire-marque.mjs sort en ${absent.code} au lieu de 2 : un dossier de marque injoignable ne rend pas la main`);
  }
  return findings;
}

// ---------------------------------------------------- C4 : plus de valeur de marque en dur
const FAMILLES = ['Montserrat', 'Inter', 'Roboto', 'DM Sans', 'JetBrains Mono', 'Helvetica', 'Arial', 'Calibri', 'Poppins', 'Lato'];

function valeursEnDur(texte, etiquette) {
  const findings = [];
  texte.split(/\r?\n/).forEach((ligne, i) => {
    const interdiction = /jamais|interdit/i.test(ligne); // nommer une police pour la BANNIR est une règle
    for (const m of ligne.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
      findings.push(`${etiquette}:${i + 1} — couleur en dur : ${m[0]} — écrire le nom du jeton, la valeur vit chez l'émetteur`);
    }
    if (interdiction) return;
    for (const fam of FAMILLES) {
      if (new RegExp(`\\b${fam}\\b`).test(ligne)) {
        findings.push(`${etiquette}:${i + 1} — police en dur : ${fam} — écrire le nom du jeton, la valeur vit chez l'émetteur`);
      }
    }
  });
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

// C3 — consommation du système de marque, fixtures verte et rouge
findings.push(...verifierMarque());

// C4 — fixture ROUGE synthétique d'abord : le détecteur doit voir une valeur plantée.
const textePlante = [
  'Fond de couverture #ABC123 posé en dur.',
  'Titres en Montserrat, corps en Inter.',
].join('\n');
const rougeC4 = valeursEnDur(textePlante, 'fixture-rouge-c4');
if (!rougeC4.some((x) => x.includes('#ABC123'))) findings.push('fixture-rouge — C4 est AVEUGLE : une couleur en dur n\'a pas été détectée');
if (!rougeC4.some((x) => x.includes('police en dur'))) findings.push('fixture-rouge — C4 est AVEUGLE : une police en dur n\'a pas été détectée');
if (valeursEnDur('Jamais la police Montserrat ici : elle est interdite.', 'fixture-verte-c4').length) {
  findings.push('fixture-verte — C4 rougit sur une police nommée pour être INTERDITE : l\'exemption est cassée');
}
// C4 — fixture VERTE : le SKILL.md réel.
if (fs.existsSync(skillMdPath)) {
  findings.push(...valeursEnDur(fs.readFileSync(skillMdPath, 'utf8'), `${NOM_SKILL}/SKILL.md`));
}

if (findings.length) verdict = 'FAIL';
else if (!c2Jouee) verdict = 'SKIP';

const code = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2;
process.stdout.write(JSON.stringify({
  oracle: 'self-test-skill',
  skill: NOM_SKILL,
  artefact: SKILL_DIR.replace(/\\/g, '/'),
  controles: {
    C1_liens_relatifs: 'jouée',
    C2_noms_interdits: c2Jouee ? 'jouée' : 'NON jouée (table absente)',
    C3_consommation_marque: 'jouée',
    C4_valeurs_de_marque_en_dur: 'jouée',
  },
  verdict,
  findings,
  non_juge: nonJuge,
}, null, 2) + '\n');
process.exit(code);
