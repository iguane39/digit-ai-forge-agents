#!/usr/bin/env node
// oracle-plan-de-mission — Domaine « Plan de mission (cohérence structurelle) ».
// Vérifie un état de mission (.md) au format canonique (versionné ici) :
//   ## Workstream <nom> — deadline : AAAA-MM-JJ
//   - etape: <id> · <titre> · echeance: AAAA-MM-JJ · sortie: <critère> · depend: <ids ou ->
//   chemin critique : id1 > id2 > id3
// Contrôles :
//   W1 aucune étape après la deadline de son workstream ;
//   W2 dépendances acycliques et toutes référencées ;
//   W3 chaque étape porte un critère de sortie non vide ;
//   W4 chemin critique désigné, chaque id du chemin existant.
// Réserve documentée (inventaire P2 O8) : le schéma migre vers Notion (décision 22/07) —
// l'oracle lira l'export ; à caler sur l'architecture v1.1 de pilote-de-mission.
// Provenance : pilote-de-mission, 2 instanciations réelles (APDLB v1.1, un AO public) —
// inventaire P2 §3 O8. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOM = 'Plan de mission (cohérence structurelle)';
const findings = [];
const non_juge = [
  'réalisme des charges et des dates (jugement de pilotage, pas de structure)',
  'export Notion non encore câblé (réserve inventaire O8 — format md canonique en attendant)'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-plan-de-mission', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (path.extname(file).toLowerCase() !== '.md') skip('extension non gérée');
const txt = fs.readFileSync(file, 'utf8');
const base = path.basename(file);
const lines = txt.split(/\r?\n/);
const etapes = new Map();
let ws = null, wsCount = 0;
lines.forEach((l, i) => {
  const w = l.match(/^##\s+Workstream\s+(.+?)\s*[—-]\s*deadline\s*:\s*(\d{4}-\d{2}-\d{2})/i);
  if (w) { ws = { nom: w[1], deadline: w[2], ligne: i + 1 }; wsCount++; return; }
  const e = l.match(/^\s*[-*]\s*etape:\s*(\S+)\s*·\s*(.+?)\s*·\s*echeance:\s*(\d{4}-\d{2}-\d{2})\s*·\s*sortie:\s*(.*?)\s*·\s*depend:\s*(.*)$/i);
  if (e && ws) etapes.set(e[1], { id: e[1], titre: e[2], echeance: e[3], sortie: e[4], depend: e[5].trim() === '-' ? [] : e[5].split(',').map(s => s.trim()).filter(Boolean), ws, ligne: i + 1 });
});
if (!wsCount) { findings.push({ sev: 'bloquant', msg: 'aucun workstream au format canonique (« ## Workstream <nom> — deadline : AAAA-MM-JJ »)', where: base + ':1' }); out('FAIL', 1); }
if (!etapes.size) findings.push({ sev: 'bloquant', msg: 'aucune étape au format canonique', where: base + ':1' });
for (const e of etapes.values()) {
  if (e.echeance > e.ws.deadline) findings.push({ sev: 'bloquant', msg: `W1 — étape ${e.id} (${e.echeance}) après la deadline du workstream « ${e.ws.nom} » (${e.ws.deadline})`, where: base + ':' + e.ligne });
  if (!e.sortie) findings.push({ sev: 'bloquant', msg: `W3 — étape ${e.id} sans critère de sortie`, where: base + ':' + e.ligne });
  for (const d of e.depend) if (!etapes.has(d)) findings.push({ sev: 'bloquant', msg: `W2 — dépendance inconnue : ${e.id} → ${d}`, where: base + ':' + e.ligne });
}
// W2 — acyclicité (DFS)
const state = new Map();
const cycle = (id, pile) => {
  if (state.get(id) === 1) { findings.push({ sev: 'bloquant', msg: `W2 — cycle de dépendances : ${[...pile, id].join(' → ')}`, where: base }); return true; }
  if (state.get(id) === 2 || !etapes.has(id)) return false;
  state.set(id, 1);
  for (const d of etapes.get(id).depend) if (cycle(d, [...pile, id])) return true;
  state.set(id, 2); return false;
};
for (const id of etapes.keys()) if (!state.has(id) && cycle(id, [])) break;
// W4
const cc = txt.match(/chemin critique\s*:\s*(.+)$/im);
if (!cc) findings.push({ sev: 'bloquant', msg: 'W4 — chemin critique non désigné', where: base });
else for (const id of cc[1].split('>').map(s => s.trim()).filter(Boolean))
  if (!etapes.has(id)) findings.push({ sev: 'bloquant', msg: `W4 — chemin critique : étape inconnue « ${id} »`, where: base });
if (findings.length) out('FAIL', 1);
findings.push({ sev: 'info', msg: `conforme : ${wsCount} workstream(s), ${etapes.size} étape(s), W1-W4 vérifiés`, where: base });
out('PASS', 0);
