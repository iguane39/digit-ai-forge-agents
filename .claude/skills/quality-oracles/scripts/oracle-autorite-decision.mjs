#!/usr/bin/env node
// oracle-autorite-decision — Domaine « Autorité d'une décision affirmée » (.md, .html).
//
// DÉFAUT PAYÉ (Produit-05, 31/08/2026) : un livrable enregistrait, AU NOM DU CLIENT, une
// décision que le client n'avait pas prise — « Décideur : <prestataire>, pour <client> »,
// « Statut : clos par arbitrage » — puis l'affirmation s'était propagée en cinq endroits du
// rapport HTML. Quatre portes vertes (charte, rendu, 14 oracles). Le client a corrigé d'une
// phrase : « L'atelier n'a rien tranché du tout. » La contradiction était MÉCANIQUEMENT
// détectable : le livrable publiait lui-même sa définition (« acte = décision en vigueur dans
// docs/adr/ ») et citait comme source un fichier qui n'est pas un ADR.
//
// CHECKLIST CANONIQUE (v1.0.0)
//   A1 — tout bloc qui se déclare décision porte un décideur non vide.
//   A2 — un décideur appartenant à l'ÉMETTEUR du livrable rend le bloc non conforme :
//        c'est une recommandation, pas une décision, et le mot doit changer.
//   A3 — la décision cite une trace de RANG DÉCISION (ADR accepté, registre daté) ; toute
//        cible citée sous forme de chemin doit EXISTER et porter ce rang.
//   A4 — propagation : « décidé / arbitré / tranché / acté » hors du bloc doit, à sa première
//        occurrence, résoudre vers le bloc (identifiant, ancre, renvoi explicite).
//
// Déclenchement par CONTENU (motifs « Décideur », « clos par arbitrage », « Statut : tranché »),
// jamais sur tout .md du parc. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { extractTables } from './lib/tables.mjs';

const ORACLE = 'oracle-autorite-decision', DOM = 'Autorité d\'une décision affirmée';
const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--profil');
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
const NJ = [
  'la RÉALITÉ de la décision (qu\'un décideur cité ait effectivement décidé) — seule l\'autorité déclarée est jugée',
  'les décisions énoncées en prose libre, hors bloc ou table se déclarant décision',
  'la pertinence de ce qui est tranché',
  'les propagations au-delà de la première occurrence (listées en info, jamais bloquantes)'
];
const out = (verdict, findings, nj, code) => {
  process.stdout.write(JSON.stringify({ oracle: ORACLE, domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj }));
  process.exit(code);
};
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
const ext = path.extname(file).toLowerCase();
if (!['.md', '.html', '.htm'].includes(ext)) out('SKIP', [], ['extension non gérée : ' + ext], 2);
const text = fs.readFileSync(file, 'utf8');
const base = path.basename(file), dir = path.dirname(path.resolve(file));

// ---- profil : motifs de l'émetteur et motifs de rang décision --------------------------------
let PROFIL = {};
if (pArg && fs.existsSync(pArg)) { try { PROFIL = JSON.parse(fs.readFileSync(pArg, 'utf8')); } catch { /* profil illisible : contrôle A2 déclaré non jugé plus bas */ } }
const conf = PROFIL.autorite || {};
// Repli : à défaut de section `autorite`, l'émetteur est le préfixe de nommage du profil
// (déjà porté par profils/digit-ai.json). Aucun motif → A2 déclaré non jugé, jamais deviné.
const EMETTEUR = (conf.emetteur_motifs && conf.emetteur_motifs.length ? conf.emetteur_motifs
  : (PROFIL.nommage && PROFIL.nommage.prefixe ? [PROFIL.nommage.prefixe] : []))
  .map(s => { try { return new RegExp(s, 'i'); } catch { return null; } }).filter(Boolean);
const RANG = (conf.motifs_rang_decision && conf.motifs_rang_decision.length ? conf.motifs_rang_decision : [
  'ADR[-\\s_]?\\d+', '[\\\\/]adr[\\\\/]', 'registre\\s+d(?:es|e)\\s+d[ée]cisions?',
  'relev[ée]\\s+de\\s+d[ée]cisions?', 'PV\\s+(?:de|du)\\s+comit[ée]', 'd[ée]lib[ée]ration\\s+du\\s+\\d'
]).map(s => new RegExp(s, 'i'));
if (!EMETTEUR.length) NJ.push('A2 (décideur appartenant à l\'émetteur) : aucun motif d\'émetteur au profil — contrôle non exercé');

// ---- normalisation : lignes hors tables (les tables sont jugées à part) -----------------------
const rawLines = text.split('\n');
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const lines = rawLines.map(l => (ext === '.md' ? l : strip(l)));
const masked = lines.slice();                                    // lignes de table neutralisées
if (ext === '.md') rawLines.forEach((l, i) => { if (/^\s*\|.*\|\s*$/.test(l)) masked[i] = ''; });
else for (const m of text.matchAll(/<table[\s\S]*?<\/table>/gi)) {
  const a = text.slice(0, m.index).split('\n').length - 1, b = a + m[0].split('\n').length - 1;
  for (let i = a; i <= b && i < masked.length; i++) masked[i] = '';
}

// ---- collecte des blocs se déclarant décision -------------------------------------------------
const RX_DECISION_CELL = /^\s*\**\s*d[ée]cision\b/i;
const RX_DECIDEUR = /^\s*\**\s*d[ée]cideur\b/i;
// Accent EXIGÉ sur les participes : `act[ée]` capturait le NOM « acte » (faux positif mesuré
// sur la première fixture rouge) et `tranch[ée]` le verbe « tranche » des en-têtes de colonne.
// `\b` est inutilisable ici : « é » n'est pas un caractère de mot pour JS, donc `arbitré\b`
// ne matche JAMAIS en fin de mot (mesuré sur la fixture rouge). Bornes explicites de lettres.
const RX_STATUT_TRANCHE = /(?<![a-zA-ZÀ-ÿ])(tranché(?:e|s|es)?|acté(?:e|s|es)?|clos(?:e)?\s+par\s+arbitrage|arbitré(?:e|s|es)?)(?![a-zA-ZÀ-ÿ])/i;
const blocs = [];

for (const t of extractTables(text, ext)) {
  const header = t.rows[0].cells.map(c => String(c || ''));
  const iDec = header.findIndex(c => RX_DECISION_CELL.test(c));
  const iQui = header.findIndex(c => RX_DECIDEUR.test(c));
  const iSta = header.findIndex(c => /^\s*\**\s*statut\b/i.test(c));
  if (iDec < 0 && iQui < 0) continue;                            // table sans colonne Décision/Décideur
  for (let r = 1; r < t.rows.length; r++) {
    const cells = t.rows[r].cells;
    if (!cells.length || cells.every(c => !String(c || '').trim())) continue;
    const statut = iSta >= 0 ? String(cells[iSta] || '') : '';
    const dec = iDec >= 0 ? String(cells[iDec] || '') : '';
    // Une ligne n'est jugée que si elle SE DÉCLARE décision : colonne Décideur présente, ou
    // statut/décision portant « tranché / acté / arbitré / clos par arbitrage ».
    if (iQui < 0 && !RX_STATUT_TRANCHE.test(statut) && !RX_STATUT_TRANCHE.test(dec)) continue;
    blocs.push({
      id: String(cells[0] || '').replace(/[*_`]/g, '').trim() || 'ligne ' + r,
      ligne: t.rows[r].line, texte: cells.join(' | '),
      decideur: iQui >= 0 ? String(cells[iQui] || '').replace(/[*_`]/g, '').trim() : '',
      origine: t.origin
    });
  }
}

for (let i = 0; i < masked.length; i++) {
  const l = masked[i];
  if (!/^\s*(?:[-*+>#]\s*)*\**\s*d[ée]cision\s*\**\s*:/i.test(l)) continue;
  const bloc = masked.slice(i, Math.min(masked.length, i + 12));
  const stop = bloc.findIndex((x, k) => k > 0 && !x.trim());
  const corps = bloc.slice(0, stop > 0 ? stop : bloc.length);
  const mQui = corps.find(x => /d[ée]cideur\s*\**\s*:/i.test(x));
  blocs.push({
    id: (corps[0].split(':').slice(1).join(':') || '').replace(/[*_`]/g, '').trim().slice(0, 60) || 'ligne ' + (i + 1),
    ligne: i + 1, texte: corps.join(' '),
    decideur: mQui ? mQui.split(/d[ée]cideur\s*\**\s*:/i)[1].replace(/[*_`]/g, '').trim() : '',
    origine: 'bloc de champs'
  });
  i += corps.length - 1;
}

if (!blocs.length) out('SKIP', [], [...NJ, 'aucun bloc se déclarant décision (ni table Décision/Décideur, ni champ « Décision : ») — hors périmètre'], 2);

// ---- A1 / A2 / A3 sur chaque bloc -------------------------------------------------------------
// Un artefact qui EST lui-même de rang décision (relevé/registre de décisions, section
// « Décisions » d'une revue RAID, PV de comité) porte sa propre trace : lui réclamer une
// trace externe est un faux positif — mesuré sur `fixtures/cadence-de-mission-sources/`
// (1 FAIL sur 467 documents du dépôt, seul bruit du contrôle avant cette borne).
// Le contrôle « chemin cité qui n'est pas de rang décision » reste exercé, lui, partout.
const ARTEFACT_RANG = /(?:relev[ée]|registre)\s+d(?:es|e)\s+d[ée]cisions?|^#{1,4}\s*d[ée]cisions?\s*$|revue\s+RAID|proc[èe]s[- ]verbal|compte[- ]rendu\s+de\s+(?:r[ée]union|comit[ée])/im;
const artefactEstRang = ARTEFACT_RANG.test(text) || ARTEFACT_RANG.test(base);
if (artefactEstRang) NJ.push('A3 (trace externe de rang décision) : l\'artefact est lui-même un relevé/registre de décisions — il porte sa propre trace');
const findings = []; let verifies = 0;
const RX_CHEMIN = /(?:[\w.@~-]+[\\/])+[\w.@%-]+\.(?:md|markdown|adoc|txt|json|ya?ml|html?|pdf|docx)/gi;
for (const b of blocs) {
  const ou = base + ':' + b.ligne + ' (' + b.origine + ')';
  let ok = true;
  if (!b.decideur) {
    findings.push({ sev: 'bloquant', msg: `A1 — bloc de décision « ${b.id} » sans décideur : une décision sans décideur n'est pas une décision`, where: ou }); ok = false;
  } else if (EMETTEUR.some(rx => rx.test(b.decideur))) {
    findings.push({ sev: 'bloquant', msg: `A2 — décideur « ${b.decideur} » appartient à l'ÉMETTEUR du livrable : c'est une RECOMMANDATION, pas une décision — le mot doit changer`, where: ou }); ok = false;
  }
  const chemins = [...b.texte.matchAll(RX_CHEMIN)].map(m => m[0]);
  const rangTextuel = RANG.some(rx => rx.test(b.texte));
  if (!chemins.length && !rangTextuel && !artefactEstRang) {
    findings.push({ sev: 'bloquant', msg: `A3 — décision « ${b.id} » affirmée sans trace de rang décision (ADR accepté, registre daté, relevé de décisions)`, where: ou }); ok = false;
  }
  for (const c of chemins) {
    const abs = path.resolve(dir, c.replace(/\\/g, '/'));
    if (!fs.existsSync(abs)) {
      findings.push({ sev: 'bloquant', msg: `A3 — trace citée introuvable : « ${c} » — une décision se prouve par une cible qui existe`, where: ou }); ok = false; continue;
    }
    let contenu = ''; try { contenu = fs.readFileSync(abs, 'utf8').slice(0, 20000); } catch { /* binaire ou illisible : rang jugé sur le seul chemin */ }
    const rang = RANG.some(rx => rx.test(c)) || /statut\s*:?\s*\**\s*(accept|adopt|en vigueur|valid)/i.test(contenu);
    if (!rang) {
      findings.push({ sev: 'bloquant', msg: `A3 — la trace citée « ${c} » existe mais n'est PAS de rang décision (ni ADR accepté, ni registre daté) : elle ne peut pas porter « ${b.id} »`, where: ou }); ok = false;
    }
  }
  if (ok) verifies++;
}

// ---- A4 propagation ----------------------------------------------------------------------------
const RX_PROPA = /(?<![a-zA-ZÀ-ÿ])(tranché|arbitré|décidé|acté)(?:e|s|es)?(?![a-zA-ZÀ-ÿ])/i;
const RX_NEGATION = /\b(?:n[e']\s*(?:a|est|ont|sont|aura|auront)\s+(?:rien\s+|pas\s+|jamais\s+|encore\s+)?|non\s+|pas\s+|jamais\s+|rien\s+|reste[nt]?\s+à\s+|à\s+|sans\s+être\s+|ni\s+|sera\s+|seront\s+|doit\s+être\s+|devra\s+être\s+)$/i;
const RX_RESOLU = /\]\(#|#[\w-]{2,}|\bcf\.|\bvoir\b|\bconform[ée]ment\b|ADR[-\s_]?\d+/i;
const ids = blocs.map(b => b.id).filter(x => x && x.length >= 2 && x.length <= 60);
const lignesBloc = new Set(blocs.map(b => b.ligne));
const propagations = [];
for (let i = 0; i < masked.length; i++) {
  if (lignesBloc.has(i + 1)) continue;
  const l = masked[i]; const m = l.match(RX_PROPA);
  if (!m) continue;
  if (RX_NEGATION.test(l.slice(0, m.index))) continue;           // « n'a rien tranché », « reste à trancher »
  const resolu = RX_RESOLU.test(l) || ids.some(id => l.includes(id));
  propagations.push({ ligne: i + 1, resolu, extrait: l.trim().slice(0, 90) });
}
const nonResolues = propagations.filter(p => !p.resolu);
if (nonResolues.length) {
  const p = nonResolues[0];
  findings.push({ sev: 'bloquant', msg: `A4 — propagation non résolue : « ${p.extrait} » affirme une décision hors du bloc sans y renvoyer (identifiant, ancre ou renvoi explicite attendu)`, where: base + ':' + p.ligne });
  for (const q of nonResolues.slice(1)) findings.push({ sev: 'info', msg: `A4 — autre propagation non résolue : « ${q.extrait} »`, where: base + ':' + q.ligne });
}

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', findings, NJ, 1);
out('PASS', [{ sev: 'info', msg: `${verifies}/${blocs.length} bloc(s) de décision conforme(s) — A1 décideur, A2 hors émetteur, A3 trace de rang décision ; ${propagations.length} propagation(s) résolue(s)`, where: base }], NJ, 0);
