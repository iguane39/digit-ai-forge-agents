#!/usr/bin/env node
// oracle-programme-formation — Domaine « Programme de formation (structure pédagogique) ».
// Vérifie un programme .md ou .docx (paragraphes extraits via python zipfile, même mécanique
// qu'oracle-pptx — R3 : pas de réimplémentation zip maison) contre 5 contrôles déterministes :
//   C1 somme des durées de séquences = durée annoncée de chaque bloc ;
//   C2 part de pratique ≥ seuil DÉCLARÉ (ligne « part de pratique attendue : ≥ N % » du
//      programme, ou profil.formation.seuil_pratique_pct) — aucun seuil inventé : sans
//      déclaration ni profil, contrôle déclaré non jugé ;
//   C3 couverture des séquences vs liste de référence (--reference <fichier>, une séquence
//      attendue par ligne « - … ») — sans référence fournie, contrôle déclaré non jugé ;
//   C4 aucun segment mono-modalité > 50 min ;
//   C5 au moins une évaluation par bloc.
// Format canonique parsé (checklist versionnée ici même) :
//   ## Bloc <nom> — durée annoncée : <N> h|min
//   - séquence : <titre> · <N> min|h[ N min] · modalité : <exposé|pratique|démo|…>
//   - évaluation : <description>
//   part de pratique attendue : ≥ <N> %   (ligne de tête, optionnelle)
// Provenance : mission formation — contrôle rejoué 2× en scripts Python jetables dans le même
// fil (23/07/2026), déclencheur du chantier oracles/experts (note P1 §0).
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolvePython } from './lib/python.mjs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = n => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const DOM = 'Programme de formation (structure pédagogique)';
const findings = [];
const non_juge = [
  'qualité pédagogique du contenu (pertinence des séquences, formulation des objectifs) → fiche expert ingenierie-pedagogique',
  'rendu/format du document (→ oracle-format, inspection)',
  'exactitude des affirmations du programme (→ oracle-claims)'
];
const out = (verdict, nj, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-programme-formation', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj })); process.exit(code); };
if (!file || !fs.existsSync(file)) { non_juge.unshift('fichier absent'); out('SKIP', non_juge, 2); }
const ext = path.extname(file).toLowerCase();
if (!['.md', '.docx'].includes(ext)) { non_juge.unshift('extension non gérée'); out('SKIP', non_juge, 2); }

// --- texte : .md direct ; .docx via python zipfile (paragraphes de word/document.xml) ---
let text;
if (ext === '.md') text = fs.readFileSync(file, 'utf8');
else {
  const py = resolvePython(); // portable Windows/Unix, esquive l'alias Store (cf. lib/python.mjs)
  if (!py) { non_juge.unshift('python indisponible (lecture .docx impossible)'); out('SKIP', non_juge, 2); }
  const script = `
import sys, zipfile, re
xml = zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf-8", "replace")
for p in re.split(r"</w:p>", xml):
    t = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
    if t.strip(): print(t)
`;
  const r = spawnSync(py[0], [...py.slice(1), '-c', script, file], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (r.status !== 0 || !r.stdout) { non_juge.unshift('extraction .docx échouée : ' + (r.stderr || '').slice(0, 120)); out('SKIP', non_juge, 2); }
  text = r.stdout;
}

const base = path.basename(file);
const lines = text.split(/\r?\n/);
const toMin = (s) => {
  const hm = s.match(/(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d+)\s*(?:min)?)?/i);
  if (hm) return Math.round(parseFloat(hm[1].replace(',', '.')) * 60) + (hm[2] ? parseInt(hm[2]) : 0);
  const m = s.match(/(\d+)\s*min/i);
  return m ? parseInt(m[1]) : null;
};

// seuil de pratique : déclaré dans le document, sinon profil.formation.seuil_pratique_pct
let seuil = null, seuilSrc = null;
const decl = text.match(/part de pratique attendue\s*:\s*[≥>=]+\s*(\d+)\s*%/i);
if (decl) { seuil = parseInt(decl[1]); seuilSrc = 'déclaré dans le programme'; }
else if (opt('profil')) {
  try { const p = JSON.parse(fs.readFileSync(opt('profil'), 'utf8')); if (p.formation && Number.isFinite(p.formation.seuil_pratique_pct)) { seuil = p.formation.seuil_pratique_pct; seuilSrc = 'profil'; } } catch {}
}

// parsing des blocs
const blocs = [];
let cur = null;
lines.forEach((l, i) => {
  const b = l.match(/^#{1,4}\s*Bloc\s+(.+?)\s*[—-]\s*durée annoncée\s*:\s*(.+)$/i) || l.match(/^Bloc\s+(.+?)\s*[—-]\s*durée annoncée\s*:\s*(.+)$/i);
  if (b) { cur = { nom: b[1], annonce: toMin(b[2]), ligne: i + 1, seqs: [], evals: 0 }; blocs.push(cur); return; }
  const s = l.match(/^\s*[-*]?\s*séquence\s*:\s*(.+?)\s*[·|]\s*(.+?)\s*[·|]\s*modalité\s*:\s*([\wé-]+)/i);
  if (s && cur) { cur.seqs.push({ titre: s[1], duree: toMin(s[2]), modalite: s[3].toLowerCase(), ligne: i + 1 }); return; }
  if (/^\s*[-*]?\s*évaluation\s*:/i.test(l) && cur) cur.evals++;
});
if (!blocs.length) findings.push({ sev: 'bloquant', msg: 'aucun bloc au format canonique (« Bloc <nom> — durée annoncée : … ») — programme inanalysable', where: base + ':1' });

const PRATIQUE = ['pratique', 'atelier', 'exercice', 'tp'];
let totalMin = 0, pratiqueMin = 0;
for (const b of blocs) {
  const somme = b.seqs.reduce((a, s) => a + (s.duree || 0), 0);
  b.seqs.forEach(s => { if (s.duree == null) findings.push({ sev: 'bloquant', msg: `séquence sans durée exploitable : « ${s.titre} »`, where: base + ':' + s.ligne }); });
  // C1
  if (b.annonce == null) findings.push({ sev: 'bloquant', msg: `bloc « ${b.nom} » : durée annoncée illisible`, where: base + ':' + b.ligne });
  else if (somme !== b.annonce) findings.push({ sev: 'bloquant', msg: `C1 — bloc « ${b.nom} » : somme des séquences ${somme} min ≠ durée annoncée ${b.annonce} min`, where: base + ':' + b.ligne });
  // C4
  b.seqs.forEach(s => { if ((s.duree || 0) > 50) findings.push({ sev: 'bloquant', msg: `C4 — segment mono-modalité de ${s.duree} min > 50 min (« ${s.titre} », ${s.modalite})`, where: base + ':' + s.ligne }); });
  // C5
  if (b.evals === 0) findings.push({ sev: 'bloquant', msg: `C5 — bloc « ${b.nom} » sans évaluation`, where: base + ':' + b.ligne });
  totalMin += somme;
  pratiqueMin += b.seqs.filter(s => PRATIQUE.includes(s.modalite)).reduce((a, s) => a + (s.duree || 0), 0);
}
// C2
if (seuil != null && totalMin > 0) {
  const pct = Math.round(100 * pratiqueMin / totalMin);
  if (pct < seuil) findings.push({ sev: 'bloquant', msg: `C2 — part de pratique ${pct} % < seuil ${seuil} % (${seuilSrc})`, where: base + ':1' });
} else non_juge.push('C2 part de pratique : aucun seuil déclaré (programme) ni fourni (profil) — jamais de seuil inventé');
// C3
const refPath = opt('reference');
if (refPath && fs.existsSync(refPath)) {
  const attendues = fs.readFileSync(refPath, 'utf8').split(/\r?\n/).map(l => l.match(/^\s*[-*]\s*(.+)$/)).filter(Boolean).map(m => m[1].trim().toLowerCase());
  const presentes = blocs.flatMap(b => b.seqs.map(s => s.titre.trim().toLowerCase()));
  attendues.forEach(a => { if (!presentes.some(p => p.includes(a) || a.includes(p))) findings.push({ sev: 'bloquant', msg: `C3 — séquence de la liste de référence absente du programme : « ${a} »`, where: base + ':1' }); });
} else non_juge.push('C3 couverture : aucune liste de référence fournie (--reference <fichier>)');

if (findings.length) out('FAIL', non_juge, 1);
findings.push({ sev: 'info', msg: `conforme : ${blocs.length} bloc(s), ${blocs.reduce((a, b) => a + b.seqs.length, 0)} séquence(s), C1/C4/C5${seuil != null ? '/C2' : ''}${refPath ? '/C3' : ''} vérifiés`, where: base });
out('PASS', non_juge, 0);
