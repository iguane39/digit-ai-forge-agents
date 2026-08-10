#!/usr/bin/env node
// oracle-llm — Domaine « Sortie LLM / IA générative ».
// Partie AUTOMATISABLE : si la sortie est structurée (JSON) et qu'un schéma est
// fourni (--schema), valide la conformité (type, required, enum, propriétés) →
// PASS/FAIL déterministe. Partie NON automatisable (véracité factuelle,
// non-régression) : émet une checklist à instruire par revue sourcée → SKIP.
// La véracité d'une affirmation n'est pas jugeable par une machine : elle exige
// une source citée ou un recompute (cf. loi §5). Ne jamais la simuler en PASS.
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} ; exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const schemaPath = args.includes('--schema') ? args[args.indexOf('--schema') + 1] : null;
const DOM = 'Sortie LLM / IA générative';
const NJ = ['véracité factuelle (revue humaine sourcée / recompute — cf. loi §5)', 'qualité rédactionnelle', 'non-régression sans jeu de golden outputs'];
function emit(verdict, findings = [], non_juge = NJ) {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-llm', domaine: DOM, artefact: file || null, verdict, findings, non_juge }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
}
if (!file || !fs.existsSync(file)) emit('SKIP', [{ sev: 'info', msg: 'fichier absent' }]);

const CHECKLIST = [
  'Chaque affirmation trace à une source citée ou à un calcul rejoué (sinon « à vérifier »).',
  'Aucune donnée inventée (chiffre, date, nom, référence, citation).',
  'Réponse dans le périmètre demandé, sans sur-interprétation.',
  'Non-régression : comparer à un golden output si le prompt est réutilisé.'
];
if (!schemaPath) emit('SKIP', [{ sev: 'info', msg: 'pas de schéma fourni — véracité à instruire par revue :' }].concat(CHECKLIST.map(c => ({ sev: 'todo', msg: c }))));

// --- validation minimale de schéma JSON ---
let data, schema;
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { emit('FAIL', [{ sev: 'bloquant', msg: 'sortie JSON invalide : ' + e.message }]); }
try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')); } catch (e) { emit('SKIP', [{ sev: 'info', msg: 'schéma illisible : ' + e.message }]); }

const errs = [];
const typeOf = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v;
function check(node, sch, pathStr) {
  if (!sch || typeof sch !== 'object') return;
  if (sch.type) {
    const t = typeOf(node);
    const ok = sch.type === 'number' ? (t === 'number' || t === 'integer') : sch.type === t || (sch.type === 'object' && t === 'object');
    if (!ok) { errs.push(pathStr + ' : type ' + t + ' ≠ ' + sch.type); return; }
  }
  if (sch.enum && !sch.enum.includes(node)) errs.push(pathStr + ' : valeur « ' + node + ' » hors enum [' + sch.enum.join(', ') + ']');
  if (sch.type === 'object' || sch.properties || sch.required) {
    (sch.required || []).forEach(k => { if (node == null || !(k in node)) errs.push(pathStr + ' : propriété requise « ' + k + ' » absente'); });
    if (sch.properties && node && typeof node === 'object') Object.entries(sch.properties).forEach(([k, s]) => { if (k in node) check(node[k], s, pathStr + '.' + k); });
  }
  if ((sch.type === 'array' || sch.items) && Array.isArray(node) && sch.items) node.forEach((it, i) => check(it, sch.items, pathStr + '[' + i + ']'));
}
check(data, schema, '$');

if (errs.length) emit('FAIL', errs.map(e => ({ sev: 'bloquant', msg: e })));
emit('PASS', [{ sev: 'info', msg: 'sortie conforme au schéma' }].concat(CHECKLIST.map(c => ({ sev: 'todo', msg: '[véracité, à instruire] ' + c }))));
