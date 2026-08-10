#!/usr/bin/env node
// report-couverture — C7 : gouvernance pilotée par les données.
// Agrège tous les journaux (*.oracles.json, _oracles-journal.json) et historiques
// (*-historique.jsonl) sous une racine : runs, répartition des verdicts, top domaines
// en échec, top domaines SKIPpés, exemptions actives/expirées, bilan cumulé des états.
// Les priorités §4 (quels oracles construire/durcir) se lisent ici, pas à l'intuition.
//   node report-couverture.mjs <racine> [--md <sortie.md>]   · exit 0 (rapport) / 2 (aucune donnée)
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const root = args.find(a => !a.startsWith('--'));
const mdOut = args.includes('--md') ? args[args.indexOf('--md') + 1] : null;
if (!root || !fs.existsSync(root)) { console.error('usage: node report-couverture.mjs <racine> [--md <sortie.md>]'); process.exit(2); }

const IGNORE = new Set(['node_modules', '.git', '.venv', 'dist', 'build', '__pycache__']);
const journals = [], histos = [], exemptFiles = [];
(function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (IGNORE.has(e.name)) continue;
    const fp = path.join(p, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/(\.oracles\.json|_oracles-journal\.json)$/.test(e.name)) journals.push(fp);
    else if (/-historique\.jsonl$/.test(e.name)) histos.push(fp);
    else if (e.name === '.oracles-exemptions.json') exemptFiles.push(fp);
  }
})(root);

const runs = [];
for (const h of histos) for (const l of fs.readFileSync(h, 'utf8').split('\n')) if (l.trim()) { try { runs.push(JSON.parse(l)); } catch {} }
const lastJournals = journals.map(j => { try { return JSON.parse(fs.readFileSync(j, 'utf8')); } catch { return null; } }).filter(Boolean);
if (!runs.length && !lastJournals.length) { console.log('Aucun journal ni historique sous ' + root + ' — lancer run-oracles d\'abord.'); process.exit(2); }

const count = (arr, key) => { const m = {}; for (const x of arr) m[key(x)] = (m[key(x)] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
const verdicts = count(runs, r => r.verdict);
const failDomains = count(runs.flatMap(r => (r.fails || []).map(f => f.split(':')[0])), x => x);
const skipDomains = count(lastJournals.flatMap(j => (j.resultats || []).filter(r => r.verdict === 'SKIP').map(r => r.domaine)), x => x);
const bilanCum = { 'jugé': 0, 'exempté': 0, 'délégué': 0, 'signalé': 0 };
for (const j of lastJournals) if (j.bilan_fichiers) for (const k of Object.keys(bilanCum)) bilanCum[k] += (j.bilan_fichiers[k] || []).length;
const today = new Date().toISOString().slice(0, 10);
const exempts = exemptFiles.flatMap(f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).map(e => ({ ...e, _src: path.relative(root, f) })); } catch { return []; } });
const actives = exempts.filter(e => !e.expire || e.expire >= today), expirees = exempts.filter(e => e.expire && e.expire < today);

const lines = [];
const p = s => lines.push(s);
p('# Rapport de couverture — oracles qualité'); p('');
p(`Racine : ${root} · ${runs.length} run(s) historisé(s) · ${lastJournals.length} journal(aux) courant(s) · généré le ${new Date().toISOString().slice(0, 10)}`); p('');
p('## Verdicts (historique)'); verdicts.forEach(([v, n]) => p(`- ${v} : ${n}`)); p('');
p('## Top domaines en ÉCHEC (priorités de correction)'); failDomains.length ? failDomains.slice(0, 10).forEach(([d, n]) => p(`- ${d} : ${n} échec(s)`)) : p('- aucun'); p('');
p('## Top domaines SKIPpés (priorités §4 / bootstrap)'); skipDomains.length ? skipDomains.slice(0, 10).forEach(([d, n]) => p(`- ${d} : ${n} SKIP`)) : p('- aucun'); p('');
p('## Bilan cumulé des fichiers (journaux courants)'); p(`- jugé=${bilanCum['jugé']} · exempté=${bilanCum['exempté']} · délégué=${bilanCum['délégué']} · signalé=${bilanCum['signalé']}`); p('');
p('## Exemptions'); p(`- actives : ${actives.length}` + (actives.length ? ' — ' + actives.map(e => `${e.fichier}/${e.domaine} (échéance ${e.expire || 'aucune'})`).join(' ; ') : ''));
p(`- EXPIRÉES : ${expirees.length}` + (expirees.length ? ' — À TRAITER : ' + expirees.map(e => `${e.fichier}/${e.domaine} (depuis ${e.expire})`).join(' ; ') : ''));
const report = lines.join('\n');
console.log(report);
if (mdOut) { fs.writeFileSync(mdOut, report + '\n', 'utf8'); console.log('\nRapport écrit : ' + mdOut); }
process.exit(0);
