// cli-claude.mjs — LA CLI DU JUGE EXTERNE EST LA PLUS RÉCENTE DU POSTE, PAS LA PREMIÈRE TROUVÉE
// (décision humaine D-19 (a) du pilot, 18/10/2026 ; étude output/03-etudes/20261018-etude-opportunite-flotte-d-agents.md).
//
// LE FAIT. oracle-judge lançait le cli.js du paquet npm global, resté en 2.1.107 sur le poste, quand l'extension
// VS Code embarquait la 2.1.300. Sans --model, cette CLI servait claude-opus-4-6 : 12 sessions de juge depuis le
// 13/10/2026, deux générations derrière la session qui les commandait. Et avec --model claude-opus-5-5 elle répond
// « API Error: 400 » : la mettre à jour n'est pas son affaire, choisir la bonne l'est. Mesuré le 18/10/2026 : le
// binaire de l'extension, avec --model opus, sert claude-opus-5-5.
//
// RÈGLE. Les candidats sont : QO_JUGE_CLI s'il est posé (il prime, c'est une décision de l'opérateur) ; le cli.js
// ou bin/claude.exe du paquet npm ; le binaire natif de chaque extension VS Code `anthropic.claude-code-<version>-*`.
// On garde celui dont la version est la plus haute ; une version illisible passe après toute version lue.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** « 2.1.107 » → [2, 1, 107] ; null si illisible. */
export function versionDe(texte) {
  const m = String(texte || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1).map(Number) : null;
}
/** Compare deux versions lues ; une version absente est plus basse que toute version lue. */
export function comparerVersions(a, b) {
  if (!a && !b) return 0; if (!a) return -1; if (!b) return 1;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Les CLI `claude` du poste : [{ cmd, pre, version, origine }]. `existe` est injectable pour la recette. */
export function candidatsCli({ env = process.env, maison = os.homedir(), shim = null, existe = fs.existsSync, lister = (d) => fs.readdirSync(d) } = {}) {
  const out = [];
  if (env.QO_JUGE_CLI && existe(env.QO_JUGE_CLI)) {
    const c = env.QO_JUGE_CLI;
    out.push(/\.m?js$/i.test(c) ? { cmd: process.execPath, pre: [c], version: null, origine: 'QO_JUGE_CLI', prime: true } : { cmd: c, pre: [], version: null, origine: 'QO_JUGE_CLI', prime: true });
  }
  const racinesNpm = [env.APPDATA && path.join(env.APPDATA, 'npm'), shim && path.dirname(shim)].filter(Boolean);
  for (const r of racinesNpm) {
    const paquet = path.join(r, 'node_modules', '@anthropic-ai', 'claude-code');
    let version = null;
    try { version = versionDe(JSON.parse(fs.readFileSync(path.join(paquet, 'package.json'), 'utf8')).version); } catch { /* version illisible */ }
    const cli = path.join(paquet, 'cli.js'), exe = path.join(paquet, 'bin', 'claude.exe');
    if (existe(cli)) out.push({ cmd: process.execPath, pre: [cli], version, origine: 'npm cli.js' });
    else if (existe(exe)) out.push({ cmd: exe, pre: [], version, origine: 'npm bin/claude.exe' });
  }
  const ext = path.join(maison, '.vscode', 'extensions');
  let dossiers = [];
  try { dossiers = lister(ext).filter((d) => /^anthropic\.claude-code-\d/.test(d)); } catch { /* pas d'extension */ }
  for (const d of dossiers) {
    for (const nom of ['claude.exe', 'claude']) {
      const b = path.join(ext, d, 'resources', 'native-binary', nom);
      if (existe(b)) { out.push({ cmd: b, pre: [], version: versionDe(d), origine: 'extension VS Code' }); break; }
    }
  }
  // dédoublonnage par chemin (le shim et APPDATA désignent souvent le même paquet)
  const vus = new Set();
  return out.filter((c) => { const k = (c.pre[0] || c.cmd).toLowerCase(); if (vus.has(k)) return false; vus.add(k); return true; });
}

/** La CLI retenue : QO_JUGE_CLI s'il est posé, sinon la plus haute version ; null s'il n'y en a aucune. */
export function choisirCli(candidats) {
  if (!candidats.length) return null;
  const prime = candidats.find((c) => c.prime);
  if (prime) return prime;
  return [...candidats].sort((a, b) => comparerVersions(b.version, a.version))[0];
}
