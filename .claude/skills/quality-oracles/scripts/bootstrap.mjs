#!/usr/bin/env node
// bootstrap — C5 : convergence d'environnement pour la loi qualité.
// Par défaut : RAPPORT de l'état des outils externes dont dépendent les oracles
// (présent / absent → quel oracle dégrade en SKIP). Avec --install : tente
// l'installation de ce qui manque (pip --user avec repli --break-system-packages,
// npm -g, playwright install chromium) et re-vérifie. Jamais silencieux : chaque
// absence est rattachée à sa conséquence (« oracle X SKIPpera »).
//   node bootstrap.mjs [--install]   · exit 0 = tout présent · 2 = dégradations restantes
import { spawnSync } from 'node:child_process';

const INSTALL = process.argv.includes('--install');
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 300000 });
const has = c => sh(process.platform === 'win32' ? 'where' : 'which', [c]).status === 0;
const pipInstall = pkg => { let r = sh('pip', ['install', '--user', pkg]); if (r.status !== 0) r = sh('pip', ['install', '--break-system-packages', pkg]); return r.status === 0; };

const TOOLS = [
  { nom: 'python3', oracle: 'oracle-a11y / oracle-pptx (inspection zip)', install: null },
  { nom: 'soffice', oracle: 'oracle-pptx (smoke-test conversion)', install: null, note: 'installer LibreOffice via le gestionnaire de paquets' },
  { nom: 'pip-audit', oracle: 'oracle-sca (audit Python)', install: () => pipInstall('pip-audit') },
  { nom: 'semgrep', oracle: 'oracle-sast (règles étendues — repli intégré sinon)', install: () => pipInstall('semgrep') },
  { nom: 'bandit', oracle: 'oracle-sast (Python — repli intégré sinon)', install: () => pipInstall('bandit') },
  { nom: 'gitleaks', oracle: 'oracle-secrets (complément — scanner intégré sinon)', install: null, note: 'binaire à installer manuellement' },
  { nom: 'claude', oracle: 'oracle-judge (LLM-juge externe)', install: null, note: 'CLI Claude Code' },
  { nom: 'playwright', oracle: 'oracle-a11y / render_page.py', check: () => sh('python3', ['-c', 'import playwright']).status === 0, install: () => pipInstall('playwright') && sh('python3', ['-m', 'playwright', 'install', 'chromium']).status === 0 }
];

console.log('BOOTSTRAP quality-oracles — état des outils externes' + (INSTALL ? ' (mode --install)' : ''));
let degrades = 0;
for (const t of TOOLS) {
  let present = t.check ? t.check() : has(t.nom);
  if (!present && INSTALL && t.install) { process.stdout.write('  … installation ' + t.nom + '\n'); if (t.install()) present = t.check ? t.check() : has(t.nom); }
  if (present) console.log('  ✅ ' + t.nom);
  else { degrades++; console.log('  ⚠️  ' + t.nom + ' ABSENT → ' + t.oracle + ' dégradera en SKIP' + (t.note ? ' (' + t.note + ')' : '') + (!INSTALL && t.install ? ' — installable via --install' : '')); }
}
console.log(degrades ? '\n⚠️ ' + degrades + ' dégradation(s) — les SKIP correspondants seront motivés, jamais convertis en PASS.' : '\n✅ Environnement complet — aucun oracle ne dégradera.');
process.exit(degrades ? 2 : 0);
