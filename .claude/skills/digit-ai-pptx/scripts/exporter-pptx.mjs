#!/usr/bin/env node
// exporter-pptx — l'export d'un deck par PowerPoint, écrit une fois pour tout producteur (TF-1502, 01/10/2026).
//
// LE FAIT (lot de retours du 30/09/2026, RA-03). Le skill rendait un PPTX par pptxgenjs ; le
// réenregistrement par PowerPoint, l'embarquement des polices et le tirage du PDF vivaient dans
// 9 scripts maison d'un seul produit. `New-Object -ComObject PowerPoint.Application` s'attache à
// l'instance que l'utilisateur a déjà ouverte : PowerPoint n'en a qu'une par session Windows. 8 de
// ces scripts appelaient Quit() sur elle sans condition, et l'instance de l'utilisateur s'est
// retrouvée sans fenêtre, avec 4 présentations inaccessibles. L'encodage des polices embarquées
// dépend de l'état de ce processus partagé entre sessions : 5 versions d'un deck sont sorties avec
// 8 polices fausses (RA-02), et aucun contrôle ne suivait l'export.
//
// CE QUE FAIT CE SCRIPT, dans cet ordre :
//   1. VERROU entre sessions parallèles : un seul export par PowerPoint à la fois sur le poste.
//      Le verrou est un fichier créé en exclusif ; celui d'un processus mort, ou plus vieux que
//      AGE_MAX_VERROU_MS, est repris, et le rapport le dit ;
//   2. EXPORT par scripts/exporter-powerpoint.ps1, sur une COPIE de l'entrée à chemin unique et vers
//      un dossier temporaire : PPTX à polices embarquées, PDF si demandé. Ce script ne quitte jamais
//      une application qu'il n'a pas lancée : la règle et sa preuve sont dans son en-tête ;
//   3. ASSAINISSEMENT des polices embarquées : oracle-polices-embarquees (skill quality-oracles)
//      juge le PPTX exporté ; s'il rend FAIL, scripts/reembarquer-polices.py réencode les polices
//      dans un processus neuf, puis le juge rejuge. Le PDF demandé passe devant le même juge ;
//   4. LIVRAISON tout ou rien : les sorties ne s'écrivent à leur chemin final que si tout est sain,
//      et jamais par-dessus un fichier existant. Refus : rien n'est écrit, le motif est dit.
//
// Usage :
//   node exporter-pptx.mjs <entrée.pptx> --pptx <sortie.pptx> [--pdf <sortie.pdf>]
//                          [--polices <dossier de polices de référence>] [--attente <secondes>] [--instance-neuve]
//   node exporter-pptx.mjs <deck déjà exporté.pptx> --deja-exporte --pptx <sortie.pptx> [--polices <dossier>]
//     --deja-exporte saute l'étape PowerPoint : la chaîne d'assainissement seule, sur un deck exporté
//     ailleurs. C'est aussi la preuve du self-test, qui n'ouvre jamais PowerPoint.
//     --instance-neuve refuse (code 2) si PowerPoint tourne déjà : l'export ne s'attache alors qu'à
//     l'instance qu'il lance. Sans elle, il travaille dans l'instance ouverte sans jamais la quitter.
//     --polices désigne les polices de référence du juge et les polices sources du réencodage, à la
//     place de celles du poste (une recette désigne sa donnée, TF-0912).
//     Le verrou vit sous %LOCALAPPDATA%\digit-ai-pptx\, ou au chemin de DIGIT_AI_PPTX_VERROU.
// Sortie : un rapport JSON sur stdout. Codes : 0 livré (polices saines, réencodées, ou aucune) ;
//   1 refus (polices fausses non réparables, export en échec, PDF jugé FAIL), rien n'est écrit ;
//   2 non joué (usage, sortie déjà présente, pas de PowerPoint, verrou non obtenu, contrôle
//   impossible faute de prérequis), rien n'est écrit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VERSION = '1.0.0';
const ICI = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPT_POWERPOINT = path.join(ICI, 'exporter-powerpoint.ps1');
export const SCRIPT_REEMBARQUER = path.join(ICI, 'reembarquer-polices.py');
export const ORACLE_POLICES = path.join(ICI, '..', '..', 'quality-oracles', 'scripts', 'oracle-polices-embarquees.mjs');
export const AGE_MAX_VERROU_MS = 20 * 60 * 1000;
const DELAI_POWERPOINT_MS = 10 * 60 * 1000;
const DELAI_JUGE_MS = 5 * 60 * 1000;
const ATTENTE_VERROU_S = 300;
const ILLISIBLE_TOLERE_MS = 10 * 1000;

const NON_JUGE = [
  'le rendu chez le destinataire (poste sans les polices, Mac) : l essai sur un tel poste reste un geste humain',
  'la charte, la composition et les débordements : → oracle-charte-pptx-semantique et la passe QA du deck',
  'les métadonnées que PowerPoint écrit dans le paquet (compte Office de l auteur dans docProps/core.xml) : ni lues ni nettoyées par cet export',
  'une instance PowerPoint qui ne répond plus : l export l abandonne après le délai sans la tuer, la fermer reste un geste de l utilisateur',
];

// ---------------------------------------------------------------- verrou entre sessions
export function cheminVerrouParDefaut() {
  if (process.env.DIGIT_AI_PPTX_VERROU) return path.resolve(process.env.DIGIT_AI_PPTX_VERROU);
  const base = process.platform === 'win32' && process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA : os.tmpdir();
  return path.join(base, 'digit-ai-pptx', 'export-powerpoint.verrou');
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export function processusVivant(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function lireVerrou(chemin) {
  let brut, mtime;
  try { brut = fs.readFileSync(chemin, 'utf8'); mtime = fs.statSync(chemin).mtimeMs; } catch { return null; }
  let j = null;
  try { j = JSON.parse(brut); } catch { /* en cours d'écriture, ou abîmé */ }
  return { brut, mtime, lisible: !!j, pid: j?.pid ?? null, jeton: j?.jeton ?? null, debut: j?.debut ?? null, entree: j?.entree ?? null };
}

// Un verrou est PÉRIMÉ quand son processus est terminé, quand il est plus vieux que l'âge maximal
// (un numéro de processus finit par resservir), ou quand il est illisible depuis plus de 10 s. Un
// verrou en cours d'écriture est illisible quelques millisecondes : il n'est pas repris pour autant.
function peremption(t, ageMaxMs) {
  const age = Date.now() - (t.lisible ? (Date.parse(t.debut) || t.mtime) : t.mtime);
  if (!t.lisible) return age > ILLISIBLE_TOLERE_MS ? `verrou illisible depuis ${Math.round(age / 1000)} s` : null;
  if (!processusVivant(t.pid)) return `processus ${t.pid} terminé`;
  if (age > ageMaxMs) return `verrou posé il y a ${Math.round(age / 60000)} min, au-delà de ${Math.round(ageMaxMs / 60000)} min`;
  return null;
}

export async function prendreVerrou(chemin, { attenteMs = ATTENTE_VERROU_S * 1000, ageMaxMs = AGE_MAX_VERROU_MS, pasMs = 250, contexte = {} } = {}) {
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const jeton = crypto.randomBytes(8).toString('hex');
  const t0 = Date.now();
  const repris = [];
  let tenant = null;
  for (;;) {
    try {
      fs.writeFileSync(chemin, JSON.stringify({ pid: process.pid, jeton, debut: new Date().toISOString(), ...contexte }), { flag: 'wx' });
      return { obtenu: true, chemin, jeton, attente_ms: Date.now() - t0, repris };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    tenant = lireVerrou(chemin);
    if (!tenant) continue; // rendu entre la tentative et la lecture : on retente aussitôt
    const motif = peremption(tenant, ageMaxMs);
    if (motif) {
      // reprise par comparaison : on ne supprime que le verrou qu'on vient de juger périmé
      const encore = lireVerrou(chemin);
      if (!encore || encore.brut !== tenant.brut) continue;
      try {
        fs.unlinkSync(chemin);
        repris.push({ motif, pid: tenant.pid, debut: tenant.debut });
        continue;
      } catch { /* suppression refusée : on attend comme pour un verrou tenu */ }
    }
    if (Date.now() - t0 >= attenteMs) {
      return { obtenu: false, chemin, attente_ms: Date.now() - t0, repris,
        tenu_par: { pid: tenant.pid, debut: tenant.debut, entree: tenant.entree } };
    }
    await attendre(pasMs);
  }
}

export function rendreVerrou(v) {
  if (!v || !v.obtenu) return false;
  const t = lireVerrou(v.chemin);
  if (!t || t.jeton !== v.jeton) return false; // repris par un autre entre-temps : on ne supprime pas le sien
  try { fs.unlinkSync(v.chemin); return true; } catch { return false; }
}

// ---------------------------------------------------------------- paquet, juge, réencodage
// Les noms des parties d'un paquet zip, lus dans son répertoire central ; null si l'archive est illisible.
export function partiesDuPaquet(fichier) {
  try {
    const buf = fs.readFileSync(fichier);
    let fin = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
    if (fin < 0) return null;
    const n = buf.readUInt16LE(fin + 10);
    let p = buf.readUInt32LE(fin + 16);
    const noms = [];
    for (let k = 0; k < n; k++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
      const ln = buf.readUInt16LE(p + 28);
      noms.push(buf.toString('utf8', p + 46, p + 46 + ln));
      p += 46 + ln + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    }
    return noms;
  } catch { return null; }
}

// Le même interpréteur que le juge : le premier Python qui répond, s'il importe fontTools ; sinon uv.
let lanceurMemorise;
function lanceurPython() {
  if (lanceurMemorise) return lanceurMemorise;
  const candidats = process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']];
  const py = candidats.find((c) => spawnSync(c[0], [...c.slice(1), '-c', 'import sys'], { encoding: 'utf8', timeout: 15000 }).status === 0) || null;
  if (py && spawnSync(py[0], [...py.slice(1), '-c', 'import fontTools'], { encoding: 'utf8', timeout: 30000 }).status === 0) {
    lanceurMemorise = { argv: [...py, '-B'], via: py.join(' ') };
  } else if (spawnSync('uv', ['--version'], { encoding: 'utf8', timeout: 30000 }).status === 0) {
    lanceurMemorise = { argv: ['uv', 'run', '--quiet', '--no-project', '--with', 'fonttools', 'python', '-B'], via: 'uv run --with fonttools' };
  } else {
    lanceurMemorise = { motif: 'fontTools introuvable : ' + (py ? `l interpréteur ${py.join(' ')} ne l importe pas` : 'aucun interpréteur Python ne répond')
      + ', et uv n est pas sur le PATH pour le fournir — pip install fonttools, ou installer uv' };
  }
  return lanceurMemorise;
}

export function juger(fichier, polices) {
  if (!fs.existsSync(ORACLE_POLICES)) {
    return { verdict: 'SKIP', motif: `juge absent : ${ORACLE_POLICES} (le skill quality-oracles doit être installé à côté de ce skill)` };
  }
  const r = spawnSync(process.execPath, [ORACLE_POLICES, fichier, ...(polices ? ['--polices', polices] : [])],
    { encoding: 'utf8', timeout: DELAI_JUGE_MS, maxBuffer: 16 * 1024 * 1024 });
  let j = null;
  try { j = JSON.parse((r.stdout || '').trim()); } catch { /* dit ci-dessous */ }
  if (!j || !['PASS', 'FAIL', 'SKIP'].includes(j.verdict)) {
    return { verdict: 'SKIP', motif: `juge sans rapport lisible (exit ${r.status}${r.error ? ', ' + r.error.code : ''}) : ${String(r.stderr || r.stdout || '').trim().slice(0, 240)}` };
  }
  return { verdict: j.verdict, motif: j.motif || null, constats: (j.findings || []).filter((f) => f.sev !== 'info').map((f) => f.msg) };
}

function reembarquer(entree, sortie, polices) {
  const l = lanceurPython();
  if (l.motif) return { code: 2, etat: 'non-joue', motif: l.motif };
  const r = spawnSync(l.argv[0], [...l.argv.slice(1), SCRIPT_REEMBARQUER, entree, sortie, ...(polices ? ['--polices', polices] : [])],
    { encoding: 'utf8', timeout: DELAI_JUGE_MS, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  let j = null;
  try { j = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { /* dit ci-dessous */ }
  if (!j) return { code: 1, etat: 'refus', motif: `réencodage sans rapport lisible (exit ${r.status}) : ${String(r.stderr || '').trim().slice(-240)}` };
  return { code: r.status, via: l.via, ...j };
}

// La chaîne d'assainissement d'un PPTX exporté : juge, réencodage si FAIL, juge rejoué. Rend l'état,
// le code (0 livrable, 1 refus, 2 non joué) et le chemin du fichier à livrer.
export function assainir(deck, dossierTravail, { polices } = {}) {
  const bilan = { etat: null, code: null, motif: null, livrable: null, controle: null, reencodage: null, recontrole: null };
  const parties = partiesDuPaquet(deck);
  if (parties === null) return { ...bilan, etat: 'refus', code: 1, motif: 'paquet illisible (répertoire central zip introuvable) : rien ne se livre' };
  const nb = parties.filter((n) => n.startsWith('ppt/fonts/') && !n.endsWith('/')).length;
  if (!nb) return { ...bilan, etat: 'aucune', code: 0, livrable: deck, motif: 'aucune police embarquée (pas de partie ppt/fonts/) : rien à assainir' };
  bilan.controle = juger(deck, polices);
  if (bilan.controle.verdict === 'PASS') return { ...bilan, etat: 'embarquees', code: 0, livrable: deck, motif: `${nb} police(s) embarquée(s), saines au contrôle` };
  if (bilan.controle.verdict === 'SKIP') {
    return { ...bilan, etat: 'non-joue', code: 2, motif: `contrôle des polices embarquées non joué (${bilan.controle.motif}) : un deck non jugé ne se livre pas` };
  }
  const repare = path.join(dossierTravail, `reencode-${crypto.randomBytes(4).toString('hex')}.pptx`);
  bilan.reencodage = reembarquer(deck, repare, polices);
  if (bilan.reencodage.code !== 0) {
    const nonJoue = bilan.reencodage.code === 2;
    return { ...bilan, etat: nonJoue ? 'non-joue' : 'refus', code: nonJoue ? 2 : 1,
      motif: `polices embarquées fausses au contrôle, réencodage impossible : ${bilan.reencodage.motif}` };
  }
  bilan.recontrole = juger(repare, polices);
  if (bilan.recontrole.verdict === 'PASS') {
    return { ...bilan, etat: 'reencodees', code: 0, livrable: repare, motif: `${nb} police(s) fausse(s) à l export, réencodées hors PowerPoint puis recontrôlées PASS` };
  }
  return { ...bilan, etat: 'refus', code: 1,
    motif: `polices réencodées encore ${bilan.recontrole.verdict} au contrôle (${(bilan.recontrole.constats || []).join(' ; ') || bilan.recontrole.motif}) : rien ne se livre` };
}

// ---------------------------------------------------------------- export
function lireArguments(argv) {
  const AVEC_VALEUR = new Set(['--pptx', '--pdf', '--polices', '--attente']);
  const o = { entree: null, pptx: null, pdf: null, polices: null, attente: String(ATTENTE_VERROU_S), dejaExporte: false, instanceNeuve: false, inconnus: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (AVEC_VALEUR.has(a)) { o[a.slice(2)] = argv[++i] ?? null; continue; }
    if (a === '--deja-exporte') { o.dejaExporte = true; continue; }
    if (a === '--instance-neuve') { o.instanceNeuve = true; continue; }
    if (a.startsWith('--')) { o.inconnus.push(a); continue; }
    if (!o.entree) o.entree = a; else o.inconnus.push(a);
  }
  return o;
}

function derniereLigneJSON(texte) {
  for (const ligne of String(texte || '').trim().split(/\r?\n/).reverse()) {
    if (!ligne.trim().startsWith('{')) continue;
    try { return JSON.parse(ligne); } catch { /* ligne suivante */ }
  }
  return null;
}

export async function exporter(argv) {
  const o = lireArguments(argv);
  const rapport = {
    outil: 'exporter-pptx', version: VERSION, entree: o.entree, sorties: { pptx: o.pptx, pdf: o.pdf },
    verdict: null, etat: null, motif: null, verrou: null, powerpoint: null, polices: null, pdf: null, non_juge: [...NON_JUGE],
  };
  const fin = (code, verdict, etat, motif) => {
    Object.assign(rapport, { verdict, etat, motif });
    process.stdout.write(JSON.stringify(rapport, null, 2) + '\n');
    return code;
  };
  const usage = (motif) => fin(2, 'NON_JOUE', 'non-joue', `${motif} — usage : exporter-pptx.mjs <entrée.pptx> --pptx <sortie.pptx> [--pdf <sortie.pdf>] [--polices <dossier>] [--attente <s>] [--instance-neuve] [--deja-exporte]`);

  if (o.inconnus.length) return usage(`argument(s) inconnu(s) : ${o.inconnus.join(' ')}`);
  if (!o.entree || !fs.existsSync(o.entree) || !fs.statSync(o.entree).isFile()) return usage(`entrée absente : ${o.entree ?? '(aucune)'}`);
  if (path.extname(o.entree).toLowerCase() !== '.pptx') return usage('l entrée doit être un .pptx');
  if (!o.pptx && !o.pdf) return usage('aucune sortie demandée : --pptx, --pdf, ou les deux');
  if (o.pptx && path.extname(o.pptx).toLowerCase() !== '.pptx') return usage('--pptx doit nommer un .pptx');
  if (o.pdf && path.extname(o.pdf).toLowerCase() !== '.pdf') return usage('--pdf doit nommer un .pdf');
  if (o.dejaExporte && (o.pdf || !o.pptx)) return usage('--deja-exporte assainit un PPTX déjà exporté : --pptx seul, sans --pdf');
  if (o.polices && !(fs.existsSync(o.polices) && fs.statSync(o.polices).isDirectory())) return usage(`dossier de polices introuvable : ${o.polices}`);
  const attenteS = Number(o.attente);
  if (!Number.isFinite(attenteS) || attenteS < 0) return usage(`--attente attend un nombre de secondes : ${o.attente}`);
  for (const s of [o.pptx, o.pdf].filter(Boolean)) {
    if (fs.existsSync(s)) return fin(2, 'NON_JOUE', 'non-joue', `la sortie existe déjà (${s}) : cet export n'écrase aucun fichier, nommer l'itération suivante`);
    if (!fs.existsSync(path.dirname(path.resolve(s)))) return usage(`dossier de sortie absent : ${path.dirname(path.resolve(s))}`);
  }
  if (!o.dejaExporte && process.platform !== 'win32') {
    return fin(2, 'NON_JOUE', 'non-joue', 'export par PowerPoint : Windows seulement (COM). Sans lui, le deck pptxgenjs se livre sans polices embarquées, et la restitution le dit');
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exporter-pptx-'));
  try {
    let pptxExporte = null;
    let pdfExporte = null;
    if (o.dejaExporte) {
      pptxExporte = path.resolve(o.entree);
    } else {
      // 1-2. verrou, puis PowerPoint sur une copie à chemin unique : aucune présentation de l'utilisateur
      // ne peut porter ce chemin, et la seule que l'export ferme est la sienne.
      const copie = path.join(tmp, `entree-${crypto.randomBytes(4).toString('hex')}.pptx`);
      fs.copyFileSync(o.entree, copie);
      const v = await prendreVerrou(cheminVerrouParDefaut(), { attenteMs: attenteS * 1000, contexte: { entree: path.basename(o.entree) } });
      rapport.verrou = { chemin: v.chemin, obtenu: v.obtenu, attente_ms: v.attente_ms, repris: v.repris, tenu_par: v.tenu_par ?? null };
      if (!v.obtenu) {
        return fin(2, 'NON_JOUE', 'non-joue', `un autre export par PowerPoint tient le verrou (processus ${v.tenu_par?.pid}, depuis ${v.tenu_par?.debut}, entrée ${v.tenu_par?.entree}) au-delà de ${attenteS} s d'attente : rejouer après lui`);
      }
      const liberer = () => rendreVerrou(v);
      process.once('exit', liberer);
      let r;
      try {
        r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_POWERPOINT, '-Entree', copie,
          ...(o.pptx ? ['-SortiePptx', path.join(tmp, 'export.pptx')] : []), ...(o.pdf ? ['-SortiePdf', path.join(tmp, 'export.pdf')] : []),
          ...(o.instanceNeuve ? ['-InstanceNeuve'] : [])],
        { encoding: 'utf8', timeout: DELAI_POWERPOINT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      } finally {
        liberer();
        process.removeListener('exit', liberer);
      }
      rapport.powerpoint = derniereLigneJSON(r.stdout);
      if (r.error) {
        const delai = r.error.code === 'ETIMEDOUT';
        return fin(delai ? 1 : 2, delai ? 'REFUS' : 'NON_JOUE', delai ? 'refus' : 'non-joue', delai
          ? `PowerPoint ne répond plus après ${DELAI_POWERPOINT_MS / 60000} min : export abandonné, l'instance n'est ni quittée ni tuée`
          : `powershell.exe introuvable ou en échec (${r.error.code}) : export non joué`);
      }
      if (!rapport.powerpoint) return fin(1, 'REFUS', 'refus', `rapport de l export PowerPoint illisible (exit ${r.status}) : ${String(r.stderr || '').trim().slice(0, 240)}`);
      if (r.status === 2) return fin(2, 'NON_JOUE', 'non-joue', rapport.powerpoint.motif);
      if (r.status !== 0) return fin(1, 'REFUS', 'refus', rapport.powerpoint.motif);
      pptxExporte = o.pptx ? path.join(tmp, 'export.pptx') : null;
      pdfExporte = o.pdf ? path.join(tmp, 'export.pdf') : null;
      const manquants = [pptxExporte, pdfExporte].filter((f) => f && !fs.existsSync(f));
      if (manquants.length) return fin(1, 'REFUS', 'refus', `PowerPoint rend la main sans avoir écrit : ${manquants.map((f) => path.basename(f)).join(', ')}`);
    }

    // 3. assainissement : le PPTX, puis le PDF devant le même juge
    let livrablePptx = null;
    let etat = 'pdf-seul';
    let motif = 'PDF tiré par PowerPoint';
    if (o.pptx) {
      const a = assainir(pptxExporte, tmp, { polices: o.polices });
      rapport.polices = { ...a, livrable: undefined };
      if (a.code !== 0) return fin(a.code, a.code === 2 ? 'NON_JOUE' : 'REFUS', a.etat, a.motif);
      livrablePptx = a.livrable;
      etat = a.etat;
      motif = a.motif;
    }
    if (o.pdf) {
      rapport.pdf = juger(pdfExporte, o.polices);
      if (rapport.pdf.verdict === 'FAIL') return fin(1, 'REFUS', 'refus', `polices du PDF jugées FAIL : ${(rapport.pdf.constats || []).join(' ; ')} — rien ne se livre`);
      if (rapport.pdf.verdict === 'SKIP') rapport.non_juge.push(`les polices du PDF, non jugées : ${rapport.pdf.motif}`);
    }

    // 4. livraison tout ou rien, jamais par-dessus un fichier existant
    const ecrits = [];
    try {
      for (const [source, cible] of [[livrablePptx, o.pptx], [pdfExporte, o.pdf]]) {
        if (!source || !cible) continue;
        fs.copyFileSync(source, cible, fs.constants.COPYFILE_EXCL);
        ecrits.push(cible);
      }
    } catch (e) {
      for (const f of ecrits) { try { fs.unlinkSync(f); } catch { /* rien */ } }
      return fin(2, 'NON_JOUE', 'non-joue', `écriture des sorties impossible (${e.code || e.message}) : rien n'est livré`);
    }
    return fin(0, 'LIVRE', etat, motif);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* dossier temporaire du système */ }
  }
}

const principal = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (principal) {
  exporter(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    process.stdout.write(JSON.stringify({ outil: 'exporter-pptx', version: VERSION, verdict: 'NON_JOUE', etat: 'non-joue', motif: `erreur inattendue : ${e.stack || e}` }, null, 2) + '\n');
    process.exitCode = 2;
  });
}
