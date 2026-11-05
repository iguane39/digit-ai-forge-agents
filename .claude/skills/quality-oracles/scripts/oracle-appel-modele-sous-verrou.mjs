#!/usr/bin/env node
// oracle-appel-modele-sous-verrou — Domaine « Code : appel de modèle tenu sous une transaction d'écriture ».
// TF-2163 (05/11/2026, Produit-86 lot 20261104a RA-2) : des pseudonymes rangés en base SQLite AVANT l'appel
// du modèle ; Python ouvre la transaction à la première écriture et la tient jusqu'à commit() — le verrou
// d'écriture est resté pris pendant toute la réflexion du modèle, et la fiche d'une mission est partie en
// erreur 500. Un appel de modèle dure des dizaines de secondes : aucun écrivain ne doit l'attendre.
//
// Contrôle STATIQUE (ast de Python, lib/appel_modele_sous_verrou.py) : par fonction et dans l'ordre du source,
// une écriture SQL (INSERT|UPDATE|DELETE|REPLACE, BEGIN IMMEDIATE|EXCLUSIVE, écriture d'ORM dans un `with`
// transactionnel) ouvre l'état « transaction ouverte » ; commit(), rollback(), COMMIT|ROLLBACK ou la sortie
// d'un `with` transactionnel le ferme ; un appel de modèle pendant qu'il est ouvert est un constat bloquant.
// Les fonctions du même fichier sont suivies (celle qui appelle le modèle, celle qui écrit sans valider).
//
// Gestes que le message propose, rejoués par la fixture verte : valider (commit) AVANT l'appel, ou appeler
// AVANT la première écriture. Exemption déclarée, l'oracle la lit : `# appel-sous-verrou-ok: <raison, 8
// caractères au moins>` sur la ligne de l'appel ou la précédente — un refus jugé faux se rapporte, il ne se
// contourne pas en déformant le code (TF-1912).
//
// Usage : node oracle-appel-modele-sous-verrou.mjs <fichier.py> [--appel <regex> …]   (--appel : un nom pointé
// d'appel de modèle de plus, ex. « mon_client\.demander$ »)
// Exit : 0 PASS · 1 FAIL · 2 SKIP (fichier absent, extension, Python indisponible, source non analysable).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPython } from './lib/python.mjs';

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--appel');
const extra = args.flatMap((a, i) => (a === '--appel' && args[i + 1] ? ['--appel', args[i + 1]] : []));
const DOM = "Code : appel de modèle tenu sous une transaction d'écriture";
const NJ = [
  'Python seulement ; SQLite (module sqlite3) et ORM courants (SQLAlchemy, Django) : une base ou un client inconnus ne sont pas vus.',
  "Suivi de l'état dans UN fichier : une écriture faite dans un autre module, ou une transaction ouverte par l'appelant d'une fonction qui appelle le modèle, n'est pas vue.",
  "Appel de modèle reconnu par son nom pointé (messages.create, chat.completions.create, generate_content, claude lancé par subprocess, requête vers une API de modèle, noms usuels, --appel) : un client enveloppé sous un autre nom n'est pas vu, sauf s'il est défini dans le même fichier.",
  "Écritures d'ORM (session.add, .save(), bulk_create…) comptées SEULEMENT dans un `with` transactionnel ; une session qui s'ouvre toute seule hors d'un `with` n'est pas suivie.",
  "Ne juge ni la durée réelle du verrou ni le mode de journalisation de la base (WAL) : un verrou court, mesuré, s'exempte avec sa raison.",
];
// Contrat commun (TF-1447) : tout SKIP porte `motif`, la raison pour laquelle rien n'est jugé.
const out = (verdict, findings, nj, code, motif) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-appel-modele-sous-verrou', domaine: DOM, artefact: file || null, verdict, ...(verdict === 'SKIP' ? { motif } : {}), findings, non_juge: nj })); process.exit(code); };
if (!file || !fs.existsSync(file)) out('SKIP', [], NJ, 2, 'fichier absent : ' + (file || '(aucun argument)'));
if (path.extname(file).toLowerCase() !== '.py') out('SKIP', [], NJ, 2, 'extension non gérée : ' + path.extname(file) + ' (attendu .py)');

const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'appel_modele_sous_verrou.py');
const r = runPython([helper, file, ...extra], { timeout: 60000 });
if (!r) out('SKIP', [], NJ, 2, 'Python indisponible sur ce poste (aucun interpréteur ne répond) : le source Python n\'a pas été analysé');
let res = null;
try { res = JSON.parse((r.stdout || '').trim()); } catch { /* traité ci-dessous */ }
if (!res || res.erreur) out('SKIP', [], NJ, 2, res && res.erreur ? res.erreur : 'analyse illisible (exit ' + r.status + ') : ' + String(r.stderr || '').slice(0, 200));

const nom = path.basename(file);
const findings = res.findings.map(f => ({
  sev: 'bloquant',
  msg: `appel de modèle (${f.appel}) tenu sous une transaction d'écriture ouverte ligne ${f.ecriture_ligne} (${f.ecriture}) dans ${f.fonction}() : le verrou reste pris pendant toute la réflexion du modèle. `
    + `Geste : valider (commit) AVANT l'appel, ou appeler le modèle AVANT la première écriture ; un verrou court et mesuré s'exempte par « # appel-sous-verrou-ok: <raison> » sur la ligne de l'appel.`,
  where: nom + ':' + f.ligne,
}));
const exemptes = res.exemptes.map(f => ({ sev: 'info', msg: `appel de modèle (${f.appel}) sous transaction ouverte ligne ${f.ecriture_ligne}, EXEMPTÉ par déclaration : ${f.raison}`, where: nom + ':' + f.ligne }));
if (findings.length) out('FAIL', [...findings, ...exemptes], NJ, 1);
out('PASS', exemptes.length ? exemptes : [{ sev: 'info', msg: `aucun appel de modèle sous transaction d'écriture (${res.fonctions_suivies} fonction(s) suivie(s))`, where: nom }], NJ, 0);
