#!/usr/bin/env node
// oracle-reglages-corpus — Domaine « Réglage de sécurité de plateforme classé au corpus d'expert (défaut ou décision) ».
//
// DÉFAUT PAYÉ (étude « Sécurité par défaut de bout en bout », 06/11/2026, retour TF-2227). Le corpus ops-supabase
// CONNAISSAIT le TLS imposé (point 7) et la restriction réseau sans les classer ; la double vérification imposée aux
// membres de l'organisation Supabase et Always Use HTTPS de Cloudflare n'apparaissaient dans aucun corpus. Un expert qui
// annote un plan de déploiement ne pouvait donc pas dire, réglage par réglage, ce qui s'applique à la création (défaut)
// et ce qui se pose au cadrage (décision) : l'audit retrouvait les écarts après coup (7 écarts sur 30 du cas témoin).
//
// CE QUE CET ORACLE REND MÉCANIQUE : chaque corpus `corpus-ops-<plateforme>.md` porte un point « Réglages de sécurité de
// la plateforme » qui cite le registre du pilot (`references/REGLAGES-SURS-PAR-DEFAUT.json`, daté) et CLASSE chaque
// réglage que le registre inscrit pour cette plateforme, du classement que le registre donne. Le registre bouge (loi n° 4 :
// une donnée volatile est une donnée) : un réglage ajouté au registre rend le corpus rouge tant qu'il n'est pas classé ;
// un réglage classé au corpus et retiré du registre le rend rouge aussi.
//
// CHECKLIST CANONIQUE (v1.0.0)
//   G1 — le corpus porte un point numéroté « Réglages de sécurité de la plateforme ».
//   G2 — ce point cite `REGLAGES-SURS-PAR-DEFAUT.json`.
//   G3 — ce point date le registre lu (JJ/MM/AAAA, sur la ligne qui parle du registre).
//   G4 — plateforme SANS réglage au registre : le point le dit (« aucun réglage ») et ne classe rien.
//   G5 — chaque réglage du registre pour cette plateforme est LISTÉ au corpus (libellé du registre, puce du point).
//   G6 — sa puce porte son classement, `**défaut**` ou `**décision**`, et c'est celui du registre.
//   G7 — aucune puce ne classe un réglage absent du registre (corpus périmé ou inventé).
//   G8 — (avertissement) plateforme du registre sans corpus d'expert : dite, jamais passée sous silence.
//
// Usage : node oracle-reglages-corpus.mjs [corpus.md …] [--registre <json>] [--plateforme <Nom>] [--references <dossier>]
//   sans corpus : tous les `corpus-ops-*.md` du dossier `references/` du skill (ou de --references).
//   registre : --registre, sinon `$FORGE_ROOT/digit-ai-factory/references/REGLAGES-SURS-PAR-DEFAUT.json`, sinon le dépôt
//   frère du dépôt de ce skill ; introuvable → SKIP motivé (exit 2), jamais un PASS.
// Contrat JSON commun · exit 0 = PASS, 1 = FAIL, 2 = SKIP.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORACLE = 'oracle-reglages-corpus';
const DOM = 'Réglage de sécurité de plateforme classé au corpus d\'expert (défaut ou décision)';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(ICI, '..');

const args = process.argv.slice(2);
const valeurDe = (opt) => { const i = args.indexOf(opt); return i >= 0 ? args[i + 1] : null; };
const OPTS_AVEC_VALEUR = ['--registre', '--plateforme', '--references'];
const corpusArgs = args.filter((a, i) => !a.startsWith('--') && !OPTS_AVEC_VALEUR.includes(args[i - 1]));

const NJ = [
  'la JUSTESSE du classement : seul son accord avec le registre est jugé, le choix défaut ou décision appartient au registre (TF-2225) et à ses critères',
  'la fraîcheur du registre lui-même (sa date de lecture des pages des éditeurs) : oracle du registre, côté pilot',
  'la justesse des commandes et des attendus : le corpus renvoie au registre, il ne les recopie pas',
];
const out = (verdict, findings, nj, code, artefact) => {
  process.stdout.write(JSON.stringify({ oracle: ORACLE, domaine: DOM, artefact: artefact ?? null, verdict, findings, non_juge: nj }));
  process.exit(code);
};

// --- le registre ---
const racinePilot = () => [
  process.env.FORGE_ROOT ? path.join(process.env.FORGE_ROOT, 'digit-ai-factory') : null,
  path.resolve(SKILL, '..', '..', '..', '..', 'digit-ai-factory'),
].filter(Boolean);
const NOM_REGISTRE = 'REGLAGES-SURS-PAR-DEFAUT.json';
let cheminRegistre = valeurDe('--registre');
if (!cheminRegistre) cheminRegistre = racinePilot().map((r) => path.join(r, 'references', NOM_REGISTRE)).find((p) => fs.existsSync(p)) || null;
if (!cheminRegistre || !fs.existsSync(cheminRegistre)) {
  out('SKIP', [], [...NJ, `registre introuvable (${NOM_REGISTRE} : --registre, $FORGE_ROOT/digit-ai-factory/references/ ou le dépôt frère) — rien n'a été comparé, ce n'est pas un PASS`], 2);
}
let registre;
try { registre = JSON.parse(fs.readFileSync(cheminRegistre, 'utf8').replace(/^﻿/, '')); }
catch (e) { out('SKIP', [], [...NJ, `registre illisible (${cheminRegistre}) : ${e.message}`], 2); }
const entrees = Array.isArray(registre) ? registre : registre && Array.isArray(registre.reglages) ? registre.reglages : null;
if (!entrees || entrees.some((e) => !e || typeof e.plateforme !== 'string' || typeof e.reglage !== 'string' || !['defaut', 'decision'].includes(e.classement))) {
  out('SKIP', [], [...NJ, `registre de forme inconnue (${cheminRegistre}) : attendu une liste d'entrées {plateforme, reglage, classement defaut|decision, …}`], 2);
}

// --- normalisation : accents, casse, apostrophes et tirets typographiques, espaces ---
const norm = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[‘’ʼ`]/g, '\'').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const LIBELLE_CLASSEMENT = { defaut: 'défaut', decision: 'décision' };
const PLATEFORME_DU_FICHIER = { supabase: 'Supabase', cloudflare: 'Cloudflare', aws: 'AWS', azure: 'Azure', gcp: 'GCP', railway: 'Railway', github: 'GitHub' };

const dossierRefs = path.resolve(valeurDe('--references') || path.join(SKILL, 'references'));
const corpus = corpusArgs.length ? corpusArgs.map((p) => path.resolve(p))
  : fs.existsSync(dossierRefs) ? fs.readdirSync(dossierRefs).filter((f) => /^corpus-ops-.+\.md$/.test(f)).sort().map((f) => path.join(dossierRefs, f)) : [];
if (!corpus.length) out('SKIP', [], [...NJ, `aucun corpus à juger (${dossierRefs} ne porte aucun corpus-ops-*.md et aucun fichier n'est passé)`], 2);

const findings = [];
const bloquant = (msg, where) => findings.push({ sev: 'bloquant', msg, where });
const platformesCouvertes = new Set();
let classes = 0;

for (const fichier of corpus) {
  const base = path.basename(fichier);
  if (!fs.existsSync(fichier)) { bloquant(`corpus introuvable : ${fichier}`, base); continue; }
  const plateforme = valeurDe('--plateforme') || PLATEFORME_DU_FICHIER[(base.match(/^corpus-ops-(.+)\.md$/) || [])[1]];
  if (!plateforme) { bloquant(`plateforme inconnue pour « ${base} » : la passer par --plateforme <Nom>`, base); continue; }
  platformesCouvertes.add(norm(plateforme));
  const attendus = entrees.filter((e) => norm(e.plateforme) === norm(plateforme));
  const lignes = fs.readFileSync(fichier, 'utf8').split(/\r?\n/);

  // G1 — le point numéroté, jusqu'au point suivant (ou au titre suivant, ou à la fin)
  const iPoint = lignes.findIndex((l) => /^\s*\d+\.\s+\*\*R[ée]glages de s[ée]curit[ée] de la plateforme/i.test(l));
  if (iPoint < 0) {
    bloquant(`G1 — le corpus ${plateforme} ne porte aucun point « Réglages de sécurité de la plateforme » : ${attendus.length} réglage(s) du registre y sont sans classement (défaut appliqué à la création, ou décision à poser au cadrage)`, base);
    continue;
  }
  let iFin = lignes.length;
  for (let i = iPoint + 1; i < lignes.length; i++) { if (/^\s*\d+\.\s+\S/.test(lignes[i]) || /^#{1,4}\s/.test(lignes[i])) { iFin = i; break; } }
  const point = lignes.slice(iPoint, iFin);
  const texte = point.join('\n');
  const ou = (i) => `${base}:${iPoint + 1 + i}`;

  // G2, G3 — le registre est cité, et daté
  if (!texte.includes(NOM_REGISTRE)) bloquant(`G2 — le point « Réglages de sécurité » du corpus ${plateforme} ne cite pas ${NOM_REGISTRE} : sans renvoi au registre, le classement est une affirmation du corpus, pas une lecture`, ou(0));
  if (!point.some((l) => /registre/i.test(l) && /\b\d{2}\/\d{2}\/\d{4}\b/.test(l))) bloquant(`G3 — le point « Réglages de sécurité » du corpus ${plateforme} ne date pas le registre lu (JJ/MM/AAAA sur la ligne qui parle du registre) : une donnée volatile se date (loi n° 4)`, ou(0));

  const puces = point.map((l, i) => ({ l, i })).filter(({ l }) => /^\s*[-*]\s+\S/.test(l));
  if (attendus.length === 0) {
    // G4 — la plateforme n'a aucun réglage au registre : le point le dit
    if (!/aucun r[ée]glage/i.test(texte)) bloquant(`G4 — le registre n'inscrit aucun réglage pour ${plateforme} : le point doit le dire (« aucun réglage ») pour qu'un réglage ajouté au registre le rende périmé`, ou(0));
    for (const { l, i } of puces) bloquant(`G7 — le corpus ${plateforme} classe un réglage (« ${l.trim().slice(0, 90)} ») que le registre n'inscrit pas : corpus périmé ou réglage inventé`, ou(i));
    continue;
  }
  const dejaVues = new Set();
  for (const e of attendus) {
    // G5 — le réglage est listé, sous le libellé du registre
    const trouve = puces.find(({ l }) => norm(l).includes(norm(e.reglage)));
    if (!trouve) { bloquant(`G5 — le réglage « ${e.reglage} » (registre : ${LIBELLE_CLASSEMENT[e.classement]}) n'est pas classé au corpus ${plateforme} : un expert ne peut pas dire s'il s'applique à la création ou se pose au cadrage`, ou(0)); continue; }
    dejaVues.add(trouve.i);
    // G6 — son classement est celui du registre
    const m = trouve.l.match(/\*\*(d[ée]faut|d[ée]cision)\*\*/i);
    if (!m) bloquant(`G6 — le réglage « ${e.reglage} » est listé sans classement : attendu **${LIBELLE_CLASSEMENT[e.classement]}**`, ou(trouve.i));
    else if (norm(m[1]) !== norm(LIBELLE_CLASSEMENT[e.classement])) bloquant(`G6 — le réglage « ${e.reglage} » est classé **${m[1].toLowerCase()}** au corpus, le registre dit ${LIBELLE_CLASSEMENT[e.classement]} : le corpus enseignerait l'inverse de ce que la création applique`, ou(trouve.i));
    else classes++;
  }
  // G7 — aucune puce de classement pour un réglage hors registre
  for (const { l, i } of puces) {
    if (dejaVues.has(i)) continue;
    if (/\*\*(d[ée]faut|d[ée]cision)\*\*/i.test(l)) bloquant(`G7 — le corpus ${plateforme} classe « ${l.trim().slice(0, 90)} », réglage que le registre n'inscrit pas pour cette plateforme : corpus périmé ou réglage inventé`, ou(i));
  }
}

// G8 — une plateforme du registre sans corpus ne se tait pas (mode « tous les corpus » seulement)
if (!corpusArgs.length) {
  for (const p of [...new Set(entrees.map((e) => e.plateforme))]) {
    if (!platformesCouvertes.has(norm(p))) {
      findings.push({ sev: 'avertissement', msg: `G8 — ${p} : ${entrees.filter((e) => e.plateforme === p).length} réglage(s) au registre et AUCUN corpus d'expert pour cette plateforme (corpus-ops-${norm(p)}.md absent) — leur classement n'est jugé nulle part côté experts-forge`, where: path.basename(cheminRegistre) });
    }
  }
}

if (findings.some((f) => f.sev === 'bloquant')) out('FAIL', findings, NJ, 1, corpus.map((c) => path.basename(c)).join(', '));
findings.push({ sev: 'info', msg: `${classes} réglage(s) classé(s) au registre lu (${path.basename(cheminRegistre)}, ${entrees.length} entrée(s)) — G1 point, G2 renvoi, G3 date, G4 plateforme sans réglage, G5 réglage listé, G6 classement conforme, G7 aucune puce périmée`, where: corpus.map((c) => path.basename(c)).join(', ') });
out('PASS', findings, NJ, 0, corpus.map((c) => path.basename(c)).join(', '));
