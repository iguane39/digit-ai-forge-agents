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
//   C5 — l'export par PowerPoint ne quitte jamais une application qu'il n'a pas lancée (TF-1502,
//        01/10/2026 : 8 scripts maison sur 9 quittaient l'instance de l'utilisateur). La règle de
//        `scripts/exporter-powerpoint.ps1` est jouée par son mode -Decision, sans PowerPoint, sur
//        sept cas ; puis trois MUTANTS de la règle (Quit sans condition, garde sur le seul compte
//        des présentations, garde sans la visibilité) doivent chacun être pris par un cas.
//   C6 — le verrou entre sessions parallèles de `scripts/exporter-pptx.mjs` : libre il s'obtient,
//        tenu par un processus vivant il ne s'obtient ni ne se touche, en cours d'écriture il ne se
//        reprend pas, périmé (processus terminé, trop vieux) il se reprend et c'est dit ; deux
//        processus lancés ensemble ne le tiennent jamais en même temps.
//   C7 — la chaîne d'assainissement (`--deja-exporte`, sans PowerPoint) sur les fixtures FICTIVES
//        du juge des polices embarquées (skill quality-oracles) : verte livrée à l'identique,
//        rouge réencodée puis rejugée PASS avec ses seules parties de police changées, rouge sans
//        police source refusée sans rien écrire, deck sans police livré tel quel, sortie existante
//        jamais écrasée.
//   C8 — sur demande (--essai-powerpoint) : l'essai réel par PowerPoint, joué seulement si AUCUN
//        processus PowerPoint ne tourne, et avec --instance-neuve. L'instance lancée doit être
//        quittée, le PPTX et le PDF écrits. Sans l'option, ou si PowerPoint tourne : non joué, dit.
//
// DOUBLE SENS. Chaque contrôle est rejoué sur une FIXTURE ROUGE : C1 sur un SKILL.md temporaire
// citant un fichier absent, C2 sur un terme inventé, C3 sur le dossier de marque amputé, C4 sur
// un texte planté, C5 sur des mutants de la règle, C6 sur un verrou tenu et un verrou en cours
// d'écriture, C7 sur un deck à polices fausses. Si une fixture rouge ne rougit pas, le contrôle est
// aveugle et le self-test échoue de lui-même. Les fixtures VERTES sont le skill réel,
// `fixtures/marque-valide`, la règle livrée, un verrou libre et le deck fictif à polices saines.
//
// Sortie : JSON {verdict, findings, non_juge} sur stdout. Exit 0 (PASS) / 1 (FAIL) / 2 (SKIP).
// Usage : node scripts/self-test.mjs [--skill=<dir>] [--referentiel=<chemin table>] [--essai-powerpoint]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  "C5 joue la RÈGLE de décision sur des faits donnés : que les faits soient bien relevés sur une vraie instance (numéros de processus, visibilité, présentations ouvertes) ne se prouve que par C8",
  "C6 prouve l'exclusion entre processus d'un même poste : un verrou n'arbitre pas deux postes, et chaque poste a sa propre instance PowerPoint",
  "C7 répare des polices fictives à une famille : l'équivalence octet pour octet avec PowerPoint sur des polices réelles est une mesure du produit (8 flux sur 8, 30/09/2026), rapportée et non rejouée ici",
  "C8 n'est joué que sur demande, et jamais quand PowerPoint tourne : sans lui, le chemin COM réel n'est prouvé par aucun contrôle de ce self-test",
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

// ------------------------------------------- C5 : la règle « l'export a-t-il lancé l'instance ? »
const PS1 = path.join(SKILL_DIR, 'scripts', 'exporter-powerpoint.ps1');
const EXPORTEUR = path.join(SKILL_DIR, 'scripts', 'exporter-pptx.mjs');
const LIGNE_REGLE = '$quitter = $lancee -and (-not $erreur) -and ($autres -eq 0) -and (-not $visible)';
const CAS_DECISION = [
  { cas: "instance de l'utilisateur, sans fenêtre ni présentation (le 30/09/2026)", pids_avant: [4321], pids_apres: [4321], autres_presentations: 0, visible: false, erreur_lecture: false, attendu: false },
  { cas: "instance de l'utilisateur, visible, quatre présentations ouvertes", pids_avant: [4321], pids_apres: [4321], autres_presentations: 4, visible: true, erreur_lecture: false, attendu: false },
  { cas: "instance lancée par l'export, seule et invisible", pids_avant: [], pids_apres: [5555], autres_presentations: 0, visible: false, erreur_lecture: false, attendu: true },
  { cas: "instance lancée par l'export, où l'utilisateur a ouvert une présentation", pids_avant: [], pids_apres: [5555], autres_presentations: 1, visible: false, erreur_lecture: false, attendu: false },
  { cas: "instance lancée par l'export, devenue visible", pids_avant: [], pids_apres: [5555], autres_presentations: 0, visible: true, erreur_lecture: false, attendu: false },
  { cas: "état de l'instance illisible", pids_avant: [], pids_apres: [5555], autres_presentations: null, visible: null, erreur_lecture: true, attendu: false },
  { cas: 'aucun processus PowerPoint retrouvé après le rattachement', pids_avant: [], pids_apres: [], autres_presentations: 0, visible: false, erreur_lecture: false, attendu: false },
];
const MUTANTS = [
  { nom: 'Quit() sans condition (8 scripts maison sur 9)', ligne: '$quitter = $true' },
  { nom: 'garde sur le seul compte des présentations', ligne: '$quitter = ($autres -eq 0)' },
  { nom: 'garde sans la visibilité', ligne: '$quitter = $lancee -and (-not $erreur) -and ($autres -eq 0)' },
];

function jouerDecision(ps1) {
  const cas = CAS_DECISION.map(({ attendu, ...c }) => c);
  const b64 = Buffer.from(JSON.stringify(cas), 'utf8').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Decision', '-CasBase64', b64],
    { encoding: 'utf8', timeout: 60000, windowsHide: true });
  let j = null;
  try { j = JSON.parse(String(r.stdout || '').trim().split(/\r?\n/).pop()); } catch { /* dit ci-dessous */ }
  if (!j || !Array.isArray(j.decisions) || j.decisions.length !== CAS_DECISION.length) {
    return { erreur: `mode -Decision sans réponse lisible (exit ${r.status}${r.error ? ', ' + r.error.code : ''}) : ${String(r.stderr || r.stdout || '').trim().slice(0, 200)}` };
  }
  return { ecarts: CAS_DECISION.filter((c, i) => j.decisions[i].quitter !== c.attendu).map((c) => c.cas) };
}

function verifierDecision() {
  if (!fs.existsSync(PS1)) return { joue: true, findings: ["scripts/exporter-powerpoint.ps1 — absent : l'export par PowerPoint n'est plus livré"] };
  if (process.platform !== 'win32') return { joue: false, motif: 'C5 NON JOUÉE : PowerShell et PowerPoint, Windows seulement' };
  const findings = [];
  // FIXTURE VERTE — la règle livrée rend la décision attendue sur chaque cas
  const v = jouerDecision(PS1);
  if (v.erreur) return { joue: true, findings: [`C5 — ${v.erreur}`] };
  for (const cas of v.ecarts) findings.push(`C5 — exporter-powerpoint.ps1 décide mal : « ${cas} »`);
  // FIXTURES ROUGES — trois mutants de la règle, dont celle des 8 scripts sur 9 : chacun doit être pris
  const texte = fs.readFileSync(PS1, 'utf8');
  const occurrences = texte.split(LIGNE_REGLE).length - 1;
  if (occurrences !== 1) {
    findings.push(`C5 — la ligne de la règle apparaît ${occurrences} fois dans exporter-powerpoint.ps1 au lieu d'une : les mutants ne savent plus où frapper`);
    return { joue: true, findings };
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'self-test-decision-'));
  try {
    MUTANTS.forEach((m, i) => {
      const f = path.join(tmp, `mutant-${i}.ps1`);
      fs.writeFileSync(f, texte.replace(LIGNE_REGLE, () => m.ligne));
      const r = jouerDecision(f);
      if (r.erreur) findings.push(`C5 — mutant « ${m.nom} » injouable : ${r.erreur}`);
      else if (!r.ecarts.length) findings.push(`fixture-rouge — C5 est AVEUGLE : le mutant « ${m.nom} » passe les ${CAS_DECISION.length} cas`);
    });
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* rien */ }
  }
  return { joue: true, findings };
}

// ------------------------------------------------------- C6 : le verrou entre sessions parallèles
async function verifierVerrou() {
  if (!fs.existsSync(EXPORTEUR)) return ["scripts/exporter-pptx.mjs — absent : ni verrou, ni assainissement"];
  const { prendreVerrou, rendreVerrou, AGE_MAX_VERROU_MS } = await import(pathToFileURL(EXPORTEUR).href);
  const findings = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'self-test-verrou-'));
  const chemin = path.join(tmp, 'export-powerpoint.verrou');
  const poser = (o) => fs.writeFileSync(chemin, typeof o === 'string' ? o : JSON.stringify(o));
  try {
    // VERTE — libre : obtenu, jeton écrit, rendu
    const v = await prendreVerrou(chemin, { attenteMs: 1000 });
    if (!v.obtenu) findings.push("C6 — un verrou libre n'est pas obtenu");
    else if (JSON.parse(fs.readFileSync(chemin, 'utf8')).jeton !== v.jeton) findings.push('C6 — verrou obtenu sans son jeton dans le fichier');
    if (!rendreVerrou(v) || fs.existsSync(chemin)) findings.push('C6 — verrou rendu, fichier resté en place');
    // ROUGE — tenu par un processus vivant : ni obtenu, ni touché (deux sessions parallèles)
    const tenu = JSON.stringify({ pid: process.pid, jeton: 'tenu-par-une-autre-session', debut: new Date().toISOString(), entree: 'autre.pptx' });
    poser(tenu);
    const r1 = await prendreVerrou(chemin, { attenteMs: 600, pasMs: 100 });
    if (r1.obtenu) findings.push("fixture-rouge — C6 : le verrou n'exclut rien, il est obtenu alors qu'un processus vivant le tient");
    else if (r1.tenu_par?.pid !== process.pid) findings.push('C6 — verrou tenu : le rapport ne nomme pas le processus qui le tient');
    if (fs.readFileSync(chemin, 'utf8') !== tenu) findings.push("C6 — le verrou d'une autre session a été modifié");
    if (rendreVerrou({ obtenu: true, chemin, jeton: 'pas-le-sien' }) || !fs.existsSync(chemin)) findings.push("C6 — rendreVerrou a supprimé le verrou d'une autre session");
    // ROUGE — en cours d'écriture (illisible depuis moins de 10 s) : pas repris
    poser('');
    const r2 = await prendreVerrou(chemin, { attenteMs: 500, pasMs: 100 });
    if (r2.obtenu) findings.push("fixture-rouge — C6 : un verrou en cours d'écriture est repris, deux exports se croiseraient");
    // VERTE — processus terminé : repris, et dit
    const mort = spawnSync(process.execPath, ['-e', '0']).pid;
    poser({ pid: mort, jeton: 'processus-termine', debut: new Date().toISOString() });
    const v2 = await prendreVerrou(chemin, { attenteMs: 1000 });
    if (!v2.obtenu || !v2.repris.some((x) => x.pid === mort)) findings.push(`C6 — le verrou d'un processus terminé (${mort}) n'est pas repris`);
    rendreVerrou(v2);
    // VERTE — trop vieux, processus vivant (numéro resservi) : repris
    poser({ pid: process.pid, jeton: 'trop-vieux', debut: new Date(Date.now() - 2 * AGE_MAX_VERROU_MS).toISOString() });
    const v3 = await prendreVerrou(chemin, { attenteMs: 1000 });
    if (!v3.obtenu || !v3.repris.length) findings.push("C6 — un verrou plus vieux que l'âge maximal n'est pas repris");
    rendreVerrou(v3);
    // DEUX PROCESSUS LANCÉS ENSEMBLE — jamais ensemble dans la section tenue
    const code = [
      `import { prendreVerrou, rendreVerrou } from ${JSON.stringify(pathToFileURL(EXPORTEUR).href)};`,
      `const v = await prendreVerrou(${JSON.stringify(chemin)}, { attenteMs: 20000, pasMs: 50 });`,
      'const debut = Date.now(); await new Promise((r) => setTimeout(r, 700)); const fin = Date.now();',
      'const rendu = rendreVerrou(v);',
      'process.stdout.write(JSON.stringify({ obtenu: v.obtenu, debut, fin, rendu }));',
    ].join('\n');
    const lancer = () => new Promise((resolve) => {
      const p = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('close', () => { try { resolve(JSON.parse(out)); } catch { resolve(null); } });
    });
    const [a, b] = await Promise.all([lancer(), lancer()]);
    if (!a || !b) findings.push("C6 — un des deux processus concurrents n'a pas rendu de rapport");
    else if (!a.obtenu || !b.obtenu) findings.push("C6 — un des deux processus concurrents n'a jamais obtenu le verrou");
    else if (!(a.fin <= b.debut || b.fin <= a.debut)) findings.push(`fixture-rouge — C6 : deux processus ont tenu le verrou ensemble (${a.debut}-${a.fin} et ${b.debut}-${b.fin})`);
    else if (!a.rendu || !b.rendu) findings.push("C6 — un processus concurrent n'a pas pu rendre son verrou");
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* rien */ }
  }
  return findings;
}

// --------------------------------------------- C7 : la chaîne d'assainissement, sans PowerPoint
const ORACLE_POLICES = path.join(SKILL_DIR, '..', 'quality-oracles', 'scripts', 'oracle-polices-embarquees.mjs');
const FIX_POLICES = path.join(SKILL_DIR, '..', 'quality-oracles', 'fixtures');

// Les noms et les CRC-32 des parties d'un paquet zip, lus dans son répertoire central (rien n'est décompressé).
function empreintesDuPaquet(fichier) {
  const buf = fs.readFileSync(fichier);
  const carte = new Map();
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) return carte;
  let p = buf.readUInt32LE(fin + 16);
  for (let k = 0; k < buf.readUInt16LE(fin + 10); k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const ln = buf.readUInt16LE(p + 28);
    carte.set(buf.toString('utf8', p + 46, p + 46 + ln), buf.readUInt32LE(p + 16));
    p += 46 + ln + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return carte;
}

function exporterCli(argsExport) {
  const r = spawnSync(process.execPath, [EXPORTEUR, ...argsExport], { encoding: 'utf8', timeout: 600000, windowsHide: true });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* rapport illisible : le code et j nul le disent */ }
  return { code: r.status, j };
}

function pythonQuiRepond() {
  const candidats = process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']];
  return candidats.find((c) => spawnSync(c[0], [...c.slice(1), '-c', 'import sys'], { encoding: 'utf8', timeout: 15000 }).status === 0) || null;
}

// Un deck SANS police embarquée, dérivé de la fixture verte : parties ppt/fonts/ retirées, et leurs renvois avec.
const PY_SANS_POLICE = [
  'import re, sys, zipfile',
  'src, dst = sys.argv[1:3]',
  'with zipfile.ZipFile(src) as zi, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zo:',
  '    for info in zi.infolist():',
  '        if info.filename.startswith("ppt/fonts/"):',
  '            continue',
  '        data = zi.read(info.filename)',
  '        if info.filename == "ppt/presentation.xml":',
  '            data = re.sub(rb"<p:embeddedFontLst>.*?</p:embeddedFontLst>", b"", data, flags=re.S)',
  '        if info.filename == "ppt/_rels/presentation.xml.rels":',
  '            data = re.sub(rb"<Relationship [^>]*Target=\\"fonts/[^\\"]*\\"/>", b"", data)',
  '        zo.writestr(info, data)',
].join('\n');

function verifierChaine() {
  if (!fs.existsSync(EXPORTEUR)) return { joue: true, findings: ["scripts/exporter-pptx.mjs — absent : ni verrou, ni assainissement"] };
  const vert = path.join(FIX_POLICES, 'polices-embarquees-green.pptx');
  const rouge = path.join(FIX_POLICES, 'polices-embarquees-red.pptx');
  const sources = path.join(FIX_POLICES, 'polices-embarquees-sources');
  const manquent = [ORACLE_POLICES, vert, rouge, sources].filter((f) => !fs.existsSync(f));
  if (manquent.length) return { joue: false, motif: `C7 NON JOUÉE : le juge des polices embarquées ou ses fixtures fictives manquent (${manquent.map((f) => path.basename(f)).join(', ')}) — le skill quality-oracles doit être installé à côté de ce skill` };
  const findings = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'self-test-chaine-'));
  try {
    // VERTE — polices saines : livrées telles quelles
    const s1 = path.join(tmp, 'vert.pptx');
    const a = exporterCli([vert, '--deja-exporte', '--pptx', s1, '--polices', sources]);
    if (a.code === 2 && a.j?.etat === 'non-joue') return { joue: false, motif: `C7 NON JOUÉE : ${a.j.motif}` };
    if (a.code !== 0 || a.j?.etat !== 'embarquees') findings.push(`C7 — fixture verte : exit ${a.code}, état ${a.j?.etat} au lieu de 0 et embarquees (${a.j?.motif})`);
    else if (!fs.readFileSync(s1).equals(fs.readFileSync(vert))) findings.push("C7 — fixture verte : la sortie diffère de l'entrée, alors que rien n'était à réparer");
    // ROUGE — polices fausses : jugées FAIL, réencodées, rejugées PASS ; seules les parties de police changent
    const s2 = path.join(tmp, 'rouge.pptx');
    const b = exporterCli([rouge, '--deja-exporte', '--pptx', s2, '--polices', sources]);
    if (b.code !== 0 || b.j?.etat !== 'reencodees') {
      findings.push(`fixture-rouge — C7 : polices fausses, exit ${b.code} et état ${b.j?.etat} au lieu de 0 et reencodees (${b.j?.motif})`);
    } else {
      const avant = empreintesDuPaquet(rouge);
      const apres = empreintesDuPaquet(s2);
      const changees = [...avant.keys()].filter((n) => avant.get(n) !== apres.get(n));
      if (!changees.length || apres.size !== avant.size || changees.some((n) => !n.startsWith('ppt/fonts/'))) {
        findings.push(`C7 — fixture rouge réparée : parties changées ${changees.join(', ') || 'aucune'} — seules des parties ppt/fonts/ doivent changer`);
      }
      const juge = spawnSync(process.execPath, [ORACLE_POLICES, s2, '--polices', sources], { encoding: 'utf8', timeout: 300000, windowsHide: true });
      let jj = null;
      try { jj = JSON.parse(juge.stdout); } catch { /* dit ci-dessous */ }
      if (jj?.verdict !== 'PASS') findings.push(`C7 — fixture rouge réparée : le juge rejoué à part rend ${jj?.verdict ?? 'un rapport illisible'} au lieu de PASS`);
    }
    // ROUGE — polices fausses et aucune police source : refus, rien n'est écrit
    const vide = path.join(tmp, 'sans-source');
    fs.mkdirSync(vide);
    const s3 = path.join(tmp, 'refus.pptx');
    const c = exporterCli([rouge, '--deja-exporte', '--pptx', s3, '--polices', vide]);
    if (c.code !== 1 || c.j?.etat !== 'refus') findings.push(`fixture-rouge — C7 : polices fausses sans police source, exit ${c.code} et état ${c.j?.etat} au lieu de 1 et refus`);
    if (fs.existsSync(s3)) findings.push('fixture-rouge — C7 : un deck refusé a tout de même été écrit');
    // ROUGE — le défaut est dans la police SOURCE (fixtures/export/source-defectueuse) : le réencodage
    // réussit, le juge rejoué rend encore FAIL, et la chaîne refuse sans rien écrire
    const s6 = path.join(tmp, 'source-defectueuse.pptx');
    const f = exporterCli([rouge, '--deja-exporte', '--pptx', s6, '--polices', path.join(SKILL_DIR, 'fixtures', 'export', 'source-defectueuse')]);
    if (f.code !== 1 || f.j?.etat !== 'refus' || f.j?.polices?.recontrole?.verdict !== 'FAIL') {
      findings.push(`fixture-rouge — C7 : police source défectueuse, exit ${f.code}, état ${f.j?.etat}, recontrôle ${f.j?.polices?.recontrole?.verdict} au lieu de 1, refus et FAIL`);
    }
    if (fs.existsSync(s6)) findings.push('fixture-rouge — C7 : un deck encore FAIL après réencodage a été écrit');
    // ROUGE — la police source a perdu un glyphe que la copie embarquée portait (fixtures/export/
    // source-incomplete) : réencoder effacerait une lettre que le juge ne verrait pas, vide des deux
    // côtés. C'est la garde « glyphe perdu » du réencodage qui refuse, et rien n'est écrit
    const s7 = path.join(tmp, 'source-incomplete.pptx');
    const g7 = exporterCli([vert, '--deja-exporte', '--pptx', s7, '--polices', path.join(SKILL_DIR, 'fixtures', 'export', 'source-incomplete')]);
    const perdus = (g7.j?.polices?.reencodage?.polices || []).reduce((n, p) => n + (p.glyphes_perdus || 0), 0);
    if (g7.code !== 1 || g7.j?.etat !== 'refus' || perdus < 1) {
      findings.push(`fixture-rouge — C7 : police source privée d'un glyphe, exit ${g7.code}, état ${g7.j?.etat}, ${perdus} glyphe(s) perdu(s) au lieu de 1, refus et au moins 1`);
    }
    if (fs.existsSync(s7)) findings.push("fixture-rouge — C7 : un deck réencodé avec un glyphe en moins a été écrit");
    // VERTE — aucune police embarquée : livré tel quel, sans juge ni réencodage
    const py = pythonQuiRepond();
    if (!py) {
      findings.push("C7 — aucun interpréteur Python ne répond : le deck sans police n'a pas pu être dérivé");
    } else {
      const script = path.join(tmp, 'sans-police.py');
      const sans = path.join(tmp, 'sans-police.pptx');
      fs.writeFileSync(script, PY_SANS_POLICE);
      const g = spawnSync(py[0], [...py.slice(1), '-B', script, vert, sans], { encoding: 'utf8', timeout: 60000 });
      const s4 = path.join(tmp, 'sans-police-livre.pptx');
      const d = g.status === 0 ? exporterCli([sans, '--deja-exporte', '--pptx', s4]) : null;
      if (!d) findings.push(`C7 — deck sans police non dérivé : ${String(g.stderr || '').trim().slice(-200)}`);
      else if (d.code !== 0 || d.j?.etat !== 'aucune') findings.push(`C7 — deck sans police : exit ${d.code}, état ${d.j?.etat} au lieu de 0 et aucune`);
      else if (!fs.readFileSync(s4).equals(fs.readFileSync(sans))) findings.push("C7 — deck sans police : la sortie diffère de l'entrée");
    }
    // ROUGE — sortie déjà présente : rien n'est écrasé
    const s5 = path.join(tmp, 'existe.pptx');
    fs.writeFileSync(s5, 'deja la');
    const e = exporterCli([vert, '--deja-exporte', '--pptx', s5]);
    if (e.code !== 2 || fs.readFileSync(s5, 'utf8') !== 'deja la') findings.push(`fixture-rouge — C7 : une sortie existante n'est pas protégée (exit ${e.code})`);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* rien */ }
  }
  return { joue: true, findings };
}

// ------------------------------------------------ C8 : l'essai réel par PowerPoint, sur demande
function processusPowerPoint() {
  const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq POWERPNT.EXE', '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (r.status !== 0) return null;
  return String(r.stdout).split(/\r?\n/).filter((l) => /POWERPNT\.EXE/i.test(l)).map((l) => Number((l.split('","')[1] || '').replace(/"/g, '')));
}

// Le deck d'essai : texte fictif, dans une police INSTALLÉE PAR L'UTILISATEUR quand le poste en a une
// qui s'embarque (PowerPoint n'embarque pas la police du thème par défaut, mesuré le 01/10/2026) :
// c'est le cas réel d'une police de marque, et le seul qui exerce l'assainissement après l'export.
const PY_DECK_ESSAI = [
  'import glob, json, os, sys',
  'from fontTools.ttLib import TTFont',
  'from pptx import Presentation',
  'choix = None',
  'for f in sorted(glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts", "*.ttf"))):',
  '    try:',
  '        t = TTFont(f, lazy=True)',
  '        if t["OS/2"].fsType & 0x2 or t["OS/2"].usWeightClass != 400 or t["head"].macStyle & 2 or "glyf" not in t:',
  '            continue',
  '        choix = (t["name"].getDebugName(1) or "").strip() or None',
  '    except Exception:',
  '        continue',
  '    if choix:',
  '        break',
  'prs = Presentation()',
  'diapo = prs.slides.add_slide(prs.slide_layouts[1])',
  'diapo.shapes.title.text = "Essai d\'export par PowerPoint"',
  'diapo.placeholders[1].text = "Deck fictif du self-test de digit-ai-pptx : polices embarquées, puis contrôlées."',
  'for forme in (diapo.shapes.title, diapo.placeholders[1]) if choix else ():',
  '    for p in forme.text_frame.paragraphs:',
  '        for r in p.runs:',
  '            r.font.name = choix',
  'prs.save(sys.argv[1])',
  'print(json.dumps({"police_utilisateur": choix}))',
].join('\n');

async function essaiPowerPoint() {
  if (process.platform !== 'win32') return { joue: false, motif: 'C8 NON JOUÉE : PowerPoint par COM, Windows seulement' };
  const avant = processusPowerPoint();
  if (avant === null) return { joue: false, motif: "C8 NON JOUÉE : tasklist ne répond pas, l'essai ne sait pas si PowerPoint tourne et ne se lance pas" };
  if (avant.length) return { joue: false, motif: `C8 NON JOUÉE : PowerPoint tourne (PID ${avant.join(', ')}), l'essai réel ne s'attache pas à une instance qu'il n'a pas lancée` };
  const findings = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'self-test-powerpoint-'));
  try {
    const script = path.join(tmp, 'deck-essai.py');
    const deck = path.join(tmp, 'deck-essai.pptx');
    fs.writeFileSync(script, PY_DECK_ESSAI);
    const g = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', 'python-pptx', '--with', 'fonttools', 'python', '-B', script, deck],
      { encoding: 'utf8', timeout: 300000, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
    if (g.status !== 0 || !fs.existsSync(deck)) return { joue: false, motif: `C8 NON JOUÉE : deck d'essai non généré par python-pptx (uv) : ${String(g.stderr || g.error || '').trim().slice(-200)}` };
    let police = null;
    try { police = JSON.parse(String(g.stdout).trim().split(/\r?\n/).pop()).police_utilisateur; } catch { /* aucune police dite : traitée comme absente */ }
    const sPptx = path.join(tmp, 'sortie.pptx');
    const sPdf = path.join(tmp, 'sortie.pdf');
    const e = exporterCli([deck, '--pptx', sPptx, '--pdf', sPdf, '--instance-neuve', '--attente', '120']);
    const pp = e.j?.powerpoint;
    if (e.code === 2 && pp && pp.pids_avant?.length) return { joue: false, motif: `C8 NON JOUÉE : PowerPoint lancé entre-temps (PID ${pp.pids_avant.join(', ')}), refusé par --instance-neuve` };
    if (e.code !== 0) findings.push(`C8 — export réel : exit ${e.code}, ${e.j?.verdict} ${e.j?.etat} (${e.j?.motif})`);
    if (!pp?.lancee_par_l_export) findings.push("C8 — l'instance n'est pas reconnue comme lancée par l'export");
    if (!pp?.quittee) findings.push(`C8 — l'instance lancée par l'export n'a pas été quittée (${pp?.decision})`);
    if (e.code === 0) {
      if (!fs.existsSync(sPptx)) findings.push('C8 — PPTX livré absent');
      if (!fs.existsSync(sPdf) || fs.readFileSync(sPdf).subarray(0, 5).toString('latin1') !== '%PDF-') findings.push('C8 — PDF livré absent ou illisible');
      if (police && !['embarquees', 'reencodees'].includes(e.j?.polices?.etat)) {
        findings.push(`C8 — deck en police ${police} : état des polices ${e.j?.polices?.etat} au lieu d'embarquees ou reencodees, l'assainissement réel n'a pas été exercé`);
      }
    }
    const note = police ? null : "C8 : aucune police installée par l'utilisateur ne s'embarque sur ce poste, le deck d'essai garde la police du thème que PowerPoint n'embarque pas : l'assainissement réel n'est pas exercé";
    // l'instance quittée doit disparaître : on la laisse s'éteindre, sans jamais rien tuer
    let reste = processusPowerPoint();
    for (let i = 0; i < 40 && reste && reste.length; i++) { await new Promise((r) => setTimeout(r, 500)); reste = processusPowerPoint(); }
    if (reste?.length) findings.push(`C8 — un processus PowerPoint tourne encore 20 s après l'export (PID ${reste.join(', ')}) : instance non quittée, ou ouverte entre-temps par l'utilisateur`);
    return { joue: true, findings, note, bilan: e.j ? { police_du_deck: police, etat: e.j.etat, motif: e.j.motif, decision: pp?.decision, polices: e.j.polices?.etat, pdf: e.j.pdf?.verdict } : null };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* rien */ }
  }
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

// C5 à C7 — l'export par PowerPoint, prouvé sans ouvrir PowerPoint (TF-1502). Un contrôle que le
// poste ne permet pas de jouer est dit au non_juge et rend le verdict SKIP, jamais PASS.
const c5 = verifierDecision();
if (c5.joue) findings.push(...c5.findings); else nonJuge.push(c5.motif);
findings.push(...await verifierVerrou());
const c7 = verifierChaine();
if (c7.joue) findings.push(...c7.findings); else nonJuge.push(c7.motif);
// C8 — l'essai réel, sur demande seulement, et jamais quand PowerPoint tourne
let c8 = { joue: false, motif: "C8 NON JOUÉE : l'essai réel par PowerPoint ne se joue que sur demande (--essai-powerpoint)" };
if (args.includes('--essai-powerpoint')) c8 = await essaiPowerPoint();
if (c8.joue) findings.push(...c8.findings); else nonJuge.push(c8.motif);
if (c8.note) nonJuge.push(c8.note);

if (findings.length) verdict = 'FAIL';
else if (!c2Jouee || !c5.joue || !c7.joue) verdict = 'SKIP';

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
    C5_decision_quitter_powerpoint: c5.joue ? 'jouée' : 'NON jouée (Windows seulement)',
    C6_verrou_entre_sessions: 'jouée',
    C7_chaine_assainissement: c7.joue ? 'jouée' : 'NON jouée (juge ou prérequis absents)',
    C8_essai_reel_powerpoint: c8.joue ? 'jouée' : 'NON jouée',
  },
  ...(c8.bilan ? { essai_powerpoint: c8.bilan } : {}),
  verdict,
  findings,
  non_juge: nonJuge,
}, null, 2) + '\n');
process.exit(code);
