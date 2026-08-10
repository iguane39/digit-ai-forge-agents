#!/usr/bin/env node
// oracle-parite-migration — Domaine « Parité de migration (routes symétriques) ».
// Compare, pour une liste de routes symétriques, les captures HTML source vs migré d'un dossier
// de recette. Artefact jugé : le fichier de routes (.txt), qui déclare en tête ses dossiers :
//   source: <dir>   migre: <dir>   domaine-cible: <hôte attendu du site migré>
// puis une route par ligne (chemin relatif du fichier capturé, ex. index.html).
// Contrôles par route (sévérités : bloquant = no-go, warn = post-bascule) :
//   P1 capture présente des deux côtés ;
//   P2 canonical et og:url NORMALISÉS (domaine et hash de build retirés) identiques des deux côtés ;
//   P3 canonical/og:url ABSOLUS du côté migré pointant vers un autre domaine que domaine-cible
//      → bloquant (le cas réel du 21/07 : og:url et canonical en dur vers la prod) ;
//   P4 ensemble des liens internes normalisés identiques → sinon warn (post-bascule) ;
//   P5 noindex présent côté migré et absent côté source → bloquant (indexabilité).
// Verdict : bloquant(s) → FAIL (no-go) ; warns seuls → PASS avec liste post-bascule.
// La checklist canonique existe : prompt d'acceptation réécrit du 21/07 (7 routes symétriques,
// 6 dimensions, normalisation domaines/hashes, verdict go/no-go) — inventaire P2 §3 O6.
// non_juge déclaré en sortie. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOM = 'Parité de migration (routes symétriques)';
const findings = [];
const non_juge = [
  'codes HTTP réels et comportement serveur (recette sur captures statiques — le fetch vit dans le protocole de recette)',
  'parité visuelle du rendu (→ visual-diff)',
  'performances comparées (→ oracle-perf)'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-parite-migration', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (path.extname(file).toLowerCase() !== '.txt') skip('extension non gérée');
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const head = k => { const l = lines.find(x => x.toLowerCase().startsWith(k + ':')); return l ? l.slice(k.length + 1).trim() : null; };
const dir = path.dirname(path.resolve(file));
const srcDir = head('source') ? path.resolve(dir, head('source')) : null;
const migDir = head('migre') ? path.resolve(dir, head('migre')) : null;
const cible = head('domaine-cible');
if (!srcDir || !migDir) skip('en-têtes source:/migre: absents du fichier de routes');
const routes = lines.filter(l => !/^(source|migre|domaine-cible):/i.test(l));
const base = path.basename(file);
if (!routes.length) { findings.push({ sev: 'bloquant', msg: 'aucune route déclarée', where: base }); out('FAIL', 1); }
const meta = (html, prop) => { const m = html.match(new RegExp('<meta[^>]*property=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', 'i')) || html.match(new RegExp('<meta[^>]*content=["\']([^"\']*)["\'][^>]*property=["\']' + prop + '["\']', 'i')); return m ? m[1] : null; };
const canonical = html => { const m = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) || html.match(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i); return m ? m[1] : null; };
const hostOf = u => { const m = String(u).match(/^https?:\/\/([^\/]+)/i); return m ? m[1].toLowerCase() : null; };
const normUrl = u => u == null ? null : String(u).replace(/^https?:\/\/[^\/]+/i, '').replace(/[?#].*$/, '').replace(/\.[0-9a-f]{8,}\./gi, '.').replace(/\/$/, '') || '/';
const links = html => [...html.matchAll(/<a[^>]*href=["']([^"']+)["']/gi)].map(m => m[1]).filter(h => !/^https?:|^mailto:|^#/i.test(h)).map(normUrl).sort();
let warns = 0;
for (const r of routes) {
  const sp = path.join(srcDir, r), mp = path.join(migDir, r);
  const sOk = fs.existsSync(sp), mOk = fs.existsSync(mp);
  if (!sOk || !mOk) { findings.push({ sev: 'bloquant', msg: `P1 — capture absente côté ${!sOk ? 'source' : 'migré'} pour la route ${r}`, where: r }); continue; }
  const sh = fs.readFileSync(sp, 'utf8'), mh = fs.readFileSync(mp, 'utf8');
  for (const [nom, get] of [['canonical', canonical], ['og:url', h => meta(h, 'og:url')]]) {
    const sv = get(sh), mv = get(mh);
    if (normUrl(sv) !== normUrl(mv)) findings.push({ sev: 'bloquant', msg: `P2 — ${nom} divergent après normalisation : source « ${sv} » vs migré « ${mv} »`, where: r });
    const mHost = hostOf(mv);
    if (mHost && cible && mHost !== cible.toLowerCase()) findings.push({ sev: 'bloquant', msg: `P3 — ${nom} en dur vers un autre domaine côté migré : ${mv} (attendu ${cible})`, where: r });
  }
  const sl = links(sh).join('|'), ml = links(mh).join('|');
  if (sl !== ml) { findings.push({ sev: 'warn', msg: 'P4 — ensembles de liens internes divergents (post-bascule)', where: r }); warns++; }
  const nx = h => /<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(h);
  if (nx(mh) && !nx(sh)) findings.push({ sev: 'bloquant', msg: 'P5 — noindex côté migré absent côté source (page désindexée à la bascule)', where: r });
}
if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
findings.push({ sev: 'info', msg: `go : ${routes.length} route(s) symétriques, ${warns} point(s) post-bascule`, where: base });
out('PASS', 0);
