#!/usr/bin/env node
// Outil SIMULÉ pour la recette d'oracle-sca (TF-2450) : joue `npm audit --json` sans réseau ni registre.
// Désigné par QO_SCA_NPM ; jamais utilisé hors du self-test. Mode choisi par QO_SIM_NPM :
//   reel (défaut) → rend, telle quelle, la sortie RÉELLE de `npm audit --json` relevée le 12/11/2026 avec npm 11.13.0
//                   (fixtures/sca-npm-audit-reel.json : vite 5.4.21, react-router-dom 6.30.4, react-router 6.30.4,
//                   esbuild 0.21.5), exit 1 comme npm quand il y a des avis
//   bas           → un seul avis, de sévérité low (npm l'écrit « low ») : celui que le décompte critical/high/moderate ignorait
//   comptes       → seulement metadata.vulnerabilities, sans la table des avis (sortie d'un npm ancien) : jamais un PASS
//   info          → un seul avis de sévérité info : non jugé, nommé au non_juge
//   propre        → aucun avis, exit 0
//   echec         → pas de JSON, message d'erreur réseau, exit 1
//   --version     → exit 0
// QO_SIM_TRACE=<fichier> ajoute une ligne JSON par appel : {argv, cwd}.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
if (process.env.QO_SIM_TRACE) fs.appendFileSync(process.env.QO_SIM_TRACE, JSON.stringify({ argv, cwd: process.cwd() }) + '\n');
if (argv.includes('--version')) { console.log('10.0.0-simule'); process.exit(0); }
if (argv[0] !== 'audit') { process.stderr.write('npm simulé : seul « audit --json » est joué\n'); process.exit(1); }
const mode = process.env.QO_SIM_NPM || 'reel';
const compte = (n) => ({ info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...n });
const avis = (nom, severite, id) => ({
  name: nom, severity: severite, isDirect: true,
  via: [{ source: 1, name: nom, dependency: nom, title: 'avis simulé', url: 'https://github.com/advisories/' + id, severity: severite, range: '*' }],
  effects: [], range: '*', nodes: ['node_modules/' + nom], fixAvailable: false,
});
const sortie = (j, code) => { process.stdout.write(JSON.stringify(j)); process.exit(code); };
if (mode === 'echec') { process.stderr.write('npm error audit endpoint injoignable (échec simulé)\n'); process.exit(1); }
if (mode === 'propre') sortie({ auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: compte({}) } }, 0);
if (mode === 'comptes') sortie({ metadata: { vulnerabilities: compte({ moderate: 1, total: 1 }) } }, 1);
if (mode === 'bas') sortie({ auditReportVersion: 2, vulnerabilities: { 'paquet-bas': avis('paquet-bas', 'low', 'GHSA-sim0-bas0-0001') }, metadata: { vulnerabilities: compte({ low: 1, total: 1 }) } }, 1);
if (mode === 'info') sortie({ auditReportVersion: 2, vulnerabilities: { 'paquet-info': avis('paquet-info', 'info', 'GHSA-sim0-inf0-0001') }, metadata: { vulnerabilities: compte({ info: 1, total: 1 }) } }, 1);
process.stdout.write(fs.readFileSync(path.join(ICI, 'sca-npm-audit-reel.json'), 'utf8'));
process.exit(1);
