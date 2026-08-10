#!/usr/bin/env node
// oracle-nommage — Domaine « Nommage / convention de livraison » (déterministe).
// Un fichier dont le nom se réclame de la convention (déclencheur du profil : une structure
// « <Préfixe> - <Objet> … ») DOIT matcher la regex complète — sinon FAIL localisant.
// Fichier hors déclencheur → SKIP (la convention ne s'impose qu'aux noms qui s'en réclament).
// Profil sans bloc nommage → SKIP motivé.
//
// Q3-bis (09/08/2026) : le déclencheur ne peut plus être un préfixe littéral. Depuis que le
// nom du PROJET prime sur l'émetteur, « Aux Portes de la Baie - Audit SEO - 20260809k.html »
// est un livrable conforme qu'un déclencheur « commence par Digit-AI » mettait en SKIP : la
// convention échappait à son propre oracle. Le profil porte donc `declencheur` (regex) ;
// `prefixe` seul reste accepté pour les profils antérieurs.
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
const DOM = 'Nommage / convention de livraison';
const NJ = ['fichiers hors préfixe de convention (non couverts par la règle)', 'pertinence métier du TypeDoc/Scope choisis'];
const out = (verdict, findings, nj, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-nommage', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj })); process.exit(code); };
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);

let nom = null;
if (pArg) { try { nom = JSON.parse(fs.readFileSync(pArg, 'utf8')).nommage || null; } catch {} }
if (!nom || !nom.regex || !(nom.declencheur || nom.prefixe)) out('SKIP', [], [...NJ, 'profil sans convention de nommage'], 2);

const base = path.basename(file);
const seReclame = nom.declencheur ? new RegExp(nom.declencheur).test(base) : base.startsWith(nom.prefixe);
if (!seReclame) out('SKIP', [], [...NJ, 'nom ne se réclamant pas de la convention'], 2);

const libelle = nom.libelle || '<Projet> - <Objet> - AAAAMMJJ{a…}.<ext>';
const findings = [];
if (!new RegExp(nom.regex).test(base)) {
  const hints = [];
  if (/_/.test(base)) hints.push('underscore interdit (espaces et tirets simples)');
  if (!/\d{8}[a-z]\./.test(base)) hints.push('date AAAAMMJJ + suffixe alphabétique (a, b, c…) attendus avant l\'extension');
  if ((base.match(/ - /g) || []).length < 2) hints.push('deux séparateurs «  -  » attendus : projet, objet, puis date');
  findings.push({ sev: 'bloquant', msg: 'nom hors convention « ' + libelle + ' »' + (hints.length ? ' : ' + hints.join(' ; ') : ''), where: base });
}
if (findings.length) out('FAIL', findings, NJ, 1);
out('PASS', [{ sev: 'info', msg: 'nom conforme à la convention du profil', where: base }], NJ, 0);
