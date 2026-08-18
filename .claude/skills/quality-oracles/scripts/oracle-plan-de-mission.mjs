#!/usr/bin/env node
// oracle-plan-de-mission — Domaine « Plan de mission (cohérence structurelle) ».
// Vérifie un état de mission (.md) au format canonique (versionné ici) :
//   ## Workstream <nom> — deadline : AAAA-MM-JJ
//   - etape: <id> · <titre> · echeance: AAAA-MM-JJ · sortie: <critère> · depend: <ids ou ->
//   chemin critique : id1 > id2 > id3
//   ## Risques
//   - risque: <énoncé> · probabilite: <cotation> · impact: <cotation> · proprietaire: <qui> · parade: <action>
//   ## Parties prenantes
//   - partie-prenante: <qui> · role: <rôle> · attente: <attente> · canal: <canal>
//   ## Mesures de succès
//   - mesure: <indicateur> · cible: <valeur visée> · source: <source de mesure>
// Contrôles :
//   W1 aucune étape après la deadline de son workstream ;
//   W2 dépendances acycliques et toutes référencées ;
//   W3 chaque étape porte un critère de sortie non vide ;
//   W4 chemin critique désigné, chaque id du chemin existant ;
//   W5 registre de risques : ≥ 1 risque, chacun coté (probabilite, impact) avec propriétaire et parade ;
//   W6 parties prenantes : ≥ 1 partie prenante, chacune avec rôle, attente et canal ;
//   W7 mesures de succès : ≥ 1 mesure, chacune avec cible et source de mesure.
// W5-W7 (TF-0323) : un risque est ce que le plan ne contrôle pas et qui peut arriver — objet
// DISTINCT d'une hypothèse (ce dont le plan dépend sans le contrôler), qui n'est pas au schéma
// de ce domaine (0 occurrence dans l'oracle et ses fixtures au 17/08/2026 : rien à articuler ici).
// Une mesure de succès se suit dans le temps (indicateur, cible, source) — distincte du critère
// de sortie binaire d'une étape, jugé par W3.
// Réserve documentée (inventaire P2 O8) : le schéma migre vers Notion (décision 22/07) —
// l'oracle lira l'export ; à caler sur l'architecture v1.1 de pilote-de-mission.
//
// PROVENANCE RETROUVÉE ET VÉRIFIÉE — TF-0326, clos le 18/08/2026.
// Le 18/08 au matin, `pilote-de-mission` n'existait dans aucun dépôt ni aucune installation
// de ce poste : 16 fichiers le mentionnaient, zéro ne le contenait, et la provenance ci-dessous
// n'était donc opposable à rien. L'humain a remis l'objet le jour même
// (`digit-ai-factory/input/pilote-de-mission.skill`) ; il est versionné depuis dans ce dépôt,
// sous `.claude/skills/pilote-de-mission/` (v1.0.0, SKILL.md + 3 références).
//
// Ce que la remise a permis de VÉRIFIER, et le résultat compte : les deux instanciations
// citées existent bien (`references/instanciations-types.md` — APDLB du 20-21/07 avec son
// premier cycle d'adaptation réel, et l'AO Client-E lot 4 du 21/07, absorption d'une mission
// déjà en cours). La provenance est donc rejouable : elle se lit, elle se date, elle se
// contredit si elle est fausse.
//
// Et la preuve amont du lot Run-Delivery se confirme, mesurée sur l'objet réel :
// « risque », « parties prenantes », « RAID », « compte rendu », « rapport d'avancement »,
// « lessons learned », « REX », « mesure de succès », « bénéfice » — **0 occurrence** dans les
// quatre fichiers du skill. W5-W7 comblaient donc un trou réel, pas supposé.
//
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOM = 'Plan de mission (cohérence structurelle)';
const findings = [];
const non_juge = [
  'réalisme des charges et des dates (jugement de pilotage, pas de structure)',
  'export Notion non encore câblé (réserve inventaire O8 — format md canonique en attendant)',
  'W5 : la QUALITÉ d\'un risque — pertinence de l\'énoncé, cotation plausible, parade réellement praticable, exhaustivité du registre (l\'oracle tient la forme, pas le jugement de pilotage)',
  'W5 : l\'échelle de cotation probabilité/impact n\'est pas arrêtée (revue prévue au 17/11/2026) — la valeur est exigée NON VIDE, jamais confrontée à un vocabulaire fermé',
  'W6 : la complétude de la cartographie (une partie prenante oubliée est invisible ici) et la justesse de l\'attente prêtée à chacune',
  'W7 : la sincérité d\'une cible et l\'existence réelle de la source de mesure — aucun relevé n\'est effectué, aucune valeur n\'est confrontée à sa source',
  'la cadence de communication et les artefacts périodiques (revue RAID, rapport d\'avancement, REX, suivi des bénéfices) : hors périmètre de ce domaine (TF-0324 candidat)'
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
// W5-W7 — objets de gouvernance : une règle par objet, chacune bloquante.
// L'objet se reconnaît à son entrée « - <mot-clé>: » ; ses attributs sont les segments
// « clé: valeur » séparés par « · ». Un attribut absent ou vide produit un constat qui NOMME
// l'attribut manquant — jamais « ligne non reconnue » : sinon un plan incomplet serait
// indiscernable d'un plan sans la section (loi transverse n° 3, l'oubli n'existe pas).
const attributs = seg => {
  const m = new Map();
  for (const s of seg) { const a = s.match(/^([a-z-]+)\s*:\s*([\s\S]*)$/i); if (a) m.set(a[1].toLowerCase(), a[2].trim()); }
  return m;
};
const OBJETS = [
  { regle: 'W5', cle: 'risque', libelle: 'registre de risques', tete: 'énoncé du risque', requis: ['probabilite', 'impact', 'proprietaire', 'parade'], entrees: [] },
  { regle: 'W6', cle: 'partie-prenante', libelle: 'cartographie des parties prenantes', tete: 'identité de la partie prenante', requis: ['role', 'attente', 'canal'], entrees: [] },
  { regle: 'W7', cle: 'mesure', libelle: 'mesures de succès', tete: 'intitulé de l\'indicateur', requis: ['cible', 'source'], entrees: [] }
];
lines.forEach((l, i) => {
  const m = l.match(/^\s*[-*]\s*(risque|partie-prenante|mesure)\s*:\s*(.+)$/i);
  if (!m) return;
  const o = OBJETS.find(x => x.cle === m[1].toLowerCase());
  const seg = m[2].split('·').map(s => s.trim());
  o.entrees.push({ tete: seg.shift(), attrs: attributs(seg), ligne: i + 1 });
});
const court = s => (s.length > 40 ? s.slice(0, 40) + '…' : s);
for (const o of OBJETS) {
  if (!o.entrees.length) {
    findings.push({ sev: 'bloquant', msg: `${o.regle} — ${o.libelle} absent : aucune entrée « - ${o.cle}: … » (format canonique en tête de cet oracle)`, where: base });
    continue;
  }
  for (const e of o.entrees) {
    if (!e.tete) findings.push({ sev: 'bloquant', msg: `${o.regle} — entrée ${o.cle} sans ${o.tete}`, where: base + ':' + e.ligne });
    for (const a of o.requis) if (!e.attrs.get(a))
      findings.push({ sev: 'bloquant', msg: `${o.regle} — ${o.cle} « ${court(e.tete) || '(sans intitulé)'} » : attribut « ${a} » ${e.attrs.has(a) ? 'vide' : 'absent'}`, where: base + ':' + e.ligne });
  }
}
if (findings.length) out('FAIL', 1);
const n = c => OBJETS.find(o => o.cle === c).entrees.length;
findings.push({ sev: 'info', msg: `conforme : ${wsCount} workstream(s), ${etapes.size} étape(s), ${n('risque')} risque(s), ${n('partie-prenante')} partie(s) prenante(s), ${n('mesure')} mesure(s) — W1-W7 vérifiés`, where: base });
out('PASS', 0);
