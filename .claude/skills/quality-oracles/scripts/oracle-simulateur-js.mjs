#!/usr/bin/env node
// oracle-simulateur-js — Domaine « Simulateur JS (KPI vs modèle de référence) ».
// Rejoue le simulateur d'une page HTML autoportante en Node (DOM mocké minimal, scripts inline
// exécutés via node:vm) avec les valeurs par défaut, puis compare les KPI affichés au fichier
// d'attendus du dossier (--attendus <json>), à tolérance déclarée par KPI.
//   J1 zéro dépendance réseau au rendu : aucun <script src> ni <link href> http(s) (autoportance) ;
//   J2 chaque KPI de l'attendu : valeur affichée (textContent/value de l'élément) = attendue,
//      à tolerance_pct près — tolérance DÉCLARÉE dans le fichier d'attendus, jamais inventée.
// Format des attendus : { "kpis": { "#id": { "attendu": <nombre>, "tolerance_pct": <n> } } }
// DOM mocké : getElementById/querySelector('#id'), éléments {textContent, value, innerHTML,
// style, addEventListener}, inputs pré-remplis depuis les value="…" du HTML. Mode opératoire
// éprouvé 3× à la main (BEEF ROI, APDLB fiscal a→c, solaire Vessey — KPI vs modèle ±1 %).
// Provenance : incident Chart.js CDN (rendu cassé → règle « lib inline ») ; validations
// manuelles rejouées 3 fois (inventaire P2 §2, §3 O5).
// non_juge déclaré en sortie. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = n => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const DOM = 'Simulateur JS (KPI vs modèle de référence)';
const findings = [];
const non_juge = [
  'exactitude métier du modèle de référence lui-même (les attendus font foi, fournis par le dossier)',
  'rendu visuel du simulateur (→ render_page / visual-diff)',
  'interactions utilisateur au-delà des valeurs par défaut (sliders, scénarios alternatifs)'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-simulateur-js', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (!['.html', '.htm'].includes(path.extname(file).toLowerCase())) skip('extension non gérée');
const attPath = opt('attendus');
if (!attPath) skip('aucun fichier d attendus fourni (--attendus <json>) — KPI non jugeables sans modèle de référence');
if (!fs.existsSync(attPath)) skip('fichier d attendus introuvable : ' + attPath);
let att; try { att = JSON.parse(fs.readFileSync(attPath, 'utf8')); } catch (e) { findings.push({ sev: 'bloquant', msg: 'attendus illisibles : ' + e.message, where: path.basename(attPath) }); out('FAIL', 1); }
const html = fs.readFileSync(file, 'utf8');
const base = path.basename(file);
// J1 — autoportance
for (const m of html.matchAll(/<(script|link)[^>]*(src|href)=["'](https?:\/\/[^"']+)["']/gi))
  findings.push({ sev: 'bloquant', msg: `J1 — dépendance réseau au rendu (lib non inline) : ${m[3]}`, where: base });
// J2 — exécution
const elements = new Map();
const elem = (id) => { if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', value: '', style: {}, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, toggle() {} }, getContext: () => null, setAttribute() {} }); return elements.get(id); };
for (const m of html.matchAll(/<[^>]*\bid=["']([^"']+)["'][^>]*\bvalue=["']([^"']*)["']/gi)) elem(m[1]).value = m[2];
for (const m of html.matchAll(/<[^>]*\bvalue=["']([^"']*)["'][^>]*\bid=["']([^"']+)["']/gi)) elem(m[2]).value = m[1];
const documentMock = {
  getElementById: id => elem(id),
  querySelector: sel => sel && sel.startsWith('#') ? elem(sel.slice(1)) : elem('__q__' + sel),
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => elem('__new__' + Math.random())
};
const ctx = { document: documentMock, window: {}, console: { log() {}, warn() {}, error() {} }, Math, Number, parseFloat, parseInt, JSON, Intl, setTimeout: (f) => f(), alert() {} };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
if (!scripts.length) findings.push({ sev: 'bloquant', msg: 'aucun script inline exécutable trouvé', where: base });
for (const s of scripts) {
  try { vm.runInContext(s, ctx, { timeout: 10000 }); }
  catch (e) { findings.push({ sev: 'bloquant', msg: 'exécution du simulateur en échec : ' + e.message, where: base }); }
}
const parseNum = t => { const m = String(t).replace(/ | /g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
for (const [sel, spec] of Object.entries(att.kpis || {})) {
  const id = sel.replace(/^#/, '');
  const el = elements.get(id);
  const affiche = el ? parseNum(el.textContent || el.value) : null;
  if (affiche == null) { findings.push({ sev: 'bloquant', msg: `J2 — KPI « ${sel} » : aucune valeur affichée après exécution`, where: base }); continue; }
  const tol = Number(spec.tolerance_pct);
  if (!Number.isFinite(tol)) { findings.push({ sev: 'bloquant', msg: `J2 — tolérance non déclarée pour « ${sel} » (tolerance_pct requis — jamais inventée)`, where: path.basename(attPath) }); continue; }
  const ecart = spec.attendu === 0 ? Math.abs(affiche) : Math.abs((affiche - spec.attendu) / spec.attendu) * 100;
  if (ecart > tol) findings.push({ sev: 'bloquant', msg: `J2 — KPI « ${sel} » : affiché ${affiche} vs attendu ${spec.attendu} (écart ${ecart.toFixed(2)} % > ${tol} %)`, where: base });
}
if (findings.length) out('FAIL', 1);
findings.push({ sev: 'info', msg: `conforme : ${Object.keys(att.kpis || {}).length} KPI vérifié(s) aux valeurs par défaut, autoportance OK`, where: base });
out('PASS', 0);
