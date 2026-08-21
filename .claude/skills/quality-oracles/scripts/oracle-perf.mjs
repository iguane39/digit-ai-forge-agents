#!/usr/bin/env node
// oracle-perf — Domaine « Performance / poids ».
// Mesures STRUCTURELLES déterministes d'une page HTML autonome (sans navigateur,
// donc reproductibles) : poids total, nombre d'éléments (~taille du DOM), images,
// poids du JS inline, poids des data: URIs, références externes. Compare à des
// budgets. NE MESURE PAS le temps de rendu réel / LCP sous charge (→ navigateur,
// non déterministe) : déclaré en non_juge.
// TF-0437 (lot Hoopiz 20260820b, 21/08) : le compte DOM est publié en DEUX temps — nœuds
// totaux, et nœuds HORS zones repliées ou citées (<details>, tr[data-detail], <pre>, <code>,
// <blockquote>, [data-cite]). Un livrable riche (99 lignes de détail, 12 sources embarquées)
// et une page mal construite franchissent le même seuil ; le diagnostic les sépare, pas le
// budget, qui reste unique sur le total.
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[],metriques} ; exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const DOM = 'Performance / poids';
const NJ = ['temps de rendu réel / FCP / LCP sous charge (mesure navigateur, non déterministe)', 'performance runtime des scripts',
  'la légitimité des zones repliées ou citées : le compte « hors zones » éclaire le diagnostic, il n\'exempte rien du budget'];
function emit(verdict, findings = [], metriques = {}) {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-perf', domaine: DOM, artefact: file || null, verdict, findings, non_juge: NJ, metriques }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
}
if (!file || !fs.existsSync(file)) emit('SKIP', [{ sev: 'info', msg: 'fichier absent' }]);
if (!['.html', '.htm'].includes(path.extname(file).toLowerCase())) emit('SKIP', [{ sev: 'info', msg: 'type non HTML — hors périmètre perf' }]);

const buf = fs.readFileSync(file);
const bytes = buf.length;
const txt = buf.toString('utf8');
const compterBalises = s => (s.match(/<[a-zA-Z][^>]*>/g) || []).length;
const tags = compterBalises(txt);
// Zones repliées ou citées : retirées du texte AVANT recompte (expressions non imbriquées, au
// plus près de ce que le DOM ferait ; une zone imbriquée dans une autre est comptée une fois).
const ZONES = [
  /<details\b[^>]*>[\s\S]*?<\/details>/gi,
  /<tr\b[^>]*\bdata-detail\b[^>]*>[\s\S]*?<\/tr>/gi,
  /<pre\b[^>]*>[\s\S]*?<\/pre>/gi,
  /<code\b[^>]*>[\s\S]*?<\/code>/gi,
  /<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi,
  /<[a-zA-Z][^>]*\bdata-cite\b[^>]*>[\s\S]*?<\/[a-zA-Z]+>/gi,
];
let horsZones = txt;
for (const z of ZONES) horsZones = horsZones.replace(z, '<x-zone></x-zone>');
const tagsHors = compterBalises(horsZones);
const imgs = (txt.match(/<img\b/gi) || []).length;
const inlineJs = [...txt.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].reduce((n, m) => n + Buffer.byteLength(m[1], 'utf8'), 0);
const dataUris = [...txt.matchAll(/data:[^)"']+/g)].reduce((n, m) => n + m[0].length, 0);
const extRefs = (txt.match(/\b(?:src|href)\s*=\s*["']https?:\/\//gi) || []).length + (txt.match(/@import\s+(?:url\()?["']?https?:\/\//gi) || []).length;

const MB = 1024 * 1024;
// C1 — budgets surchargables par profil (--profil <chemin>) ; défauts = valeurs historiques
const pArg = process.argv.includes('--profil') ? process.argv[process.argv.indexOf('--profil') + 1] : null;
let P = {};
if (pArg) { try { P = JSON.parse(fs.readFileSync(pArg, 'utf8')).perf || {}; } catch {} }
const B = { poids_warn: P.poids_warn ?? 2 * MB, poids_fail: P.poids_fail ?? 5 * MB, dom_warn: P.dom_warn ?? 6000, dom_fail: P.dom_fail ?? 12000, js_warn: P.js_warn ?? 1.2 * MB, js_fail: P.js_fail ?? 3 * MB };
const metriques = { poids_octets: bytes, elements: tags, elements_hors_zones_repliees_citees: tagsHors, images: imgs, js_inline_octets: inlineJs, data_uris_octets: dataUris, refs_externes: extRefs };
const findings = [];
const budget = (val, warnT, failT, label, fmt) => {
  const v = fmt ? fmt(val) : val;
  if (val > failT) findings.push({ sev: 'bloquant', msg: label + ' : ' + v + ' > budget ' + fmt(failT) });
  else if (val > warnT) findings.push({ sev: 'warn', msg: label + ' : ' + v + ' > seuil ' + fmt(warnT) });
};
const kb = n => Math.round(n / 1024) + ' Ko';
const noeuds = n => n + ' nœuds' + (n === tags && tagsHors < tags ? ' (' + tagsHors + ' hors zones repliées/citées : details, data-detail, pre, code, blockquote, data-cite)' : '');
budget(bytes, B.poids_warn, B.poids_fail, 'poids total', kb);
budget(tags, B.dom_warn, B.dom_fail, 'éléments (DOM)', noeuds);
budget(inlineJs, B.js_warn, B.js_fail, 'JS inline', kb);
if (extRefs > 0) findings.push({ sev: 'warn', msg: extRefs + ' référence(s) externe(s) — nuit à l\'autoportance et au temps de chargement' });

const verdict = findings.some(f => f.sev === 'bloquant') ? 'FAIL' : 'PASS';
emit(verdict, findings.length ? findings : [{ sev: 'info', msg: 'poids/DOM dans les budgets (' + kb(bytes) + ', ' + tags + ' nœuds' + (tagsHors < tags ? ', ' + tagsHors + ' hors zones repliées/citées' : '') + ')' }], metriques);
