// lib/python.mjs — résolution PORTABLE de l'interpréteur Python (validation fonctionnelle).
//
// Pourquoi : sur Windows, `which` n'existe pas (Unix), `python3` n'existe pas (nommage
// Unix), et `python` peut résoudre vers l'ALIAS Microsoft Store (WindowsApps) qui
// imprime « Python est introuvable… Microsoft Store » et sort en erreur alors qu'un
// vrai Python est installé. Constaté le 10/08/2026 : 8 des 9 échecs du self-test
// venaient de ces trois pièges combinés (oracle-pptx, oracle-charte-pptx-semantique,
// fixtures a11y/visual lancées en `python3` littéral).
//
// Principe : on ne fait PAS confiance à la présence d'un nom sur le PATH — on ne
// retient qu'un candidat qui EXÉCUTE réellement `import sys` avec un exit 0.
// L'alias Store échoue à ce test ; un python absent aussi. Fail-closed → null.
import { spawnSync } from 'node:child_process';

let _cache; // une résolution par process suffit (les oracles sont des CLI courts)

/**
 * Retourne l'invocation Python validée sous forme de tableau argv-prefix
 * (ex. ['py', '-3'] ou ['python']) — ou null si aucun interpréteur ne fonctionne.
 * Usage : const py = resolvePython(); spawnSync(py[0], [...py.slice(1), ...args]).
 */
export function resolvePython() {
  if (_cache !== undefined) return _cache;
  const candidats = process.platform === 'win32'
    ? [['py', '-3'], ['python'], ['python3']]   // py.exe (C:\Windows) d'abord : jamais shadowé par l'alias Store
    : [['python3'], ['python']];
  for (const c of candidats) {
    const r = spawnSync(c[0], [...c.slice(1), '-c', 'import sys'], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) { _cache = c; return c; }
  }
  _cache = null;
  return null;
}

// TF-2522 (14/11/2026) — UN PRÉREQUIS ABSENT DU POSTE SE DIT, IL NE SE LIT PAS COMME UN ÉCHEC.
// Le 14/11/2026, sur le poste DESKTOP-ULTRA7, pypdf, pypdfium2, pdfplumber et reportlab manquaient à l'interpréteur
// résolu : les oracles PDF rendaient bien SKIP, avec leur motif, mais la recette lisait ce SKIP comme un échec
// (fixture « verdict SKIP, attendu FAIL ») — 11 contrôles rouges pour une bibliothèque non installée, que rien ne
// distinguait d'un oracle cassé. La fixture DÉCLARE désormais les modules Python qu'elle exige (`prerequis_python`) ;
// la recette SONDE chacun (un `import` réel, avec l'interpréteur de l'oracle) et ne tolère le SKIP que si l'un d'eux
// manque VRAIMENT. Un SKIP alors que tout est installé, un SKIP sans prérequis déclaré, un verdict faux : échecs.
const PAQUET_PIP = { fitz: 'pymupdf', PIL: 'pillow', docx: 'python-docx', pptx: 'python-pptx' };

/** Le module s'importe-t-il avec cet interpréteur ? (exit 0 de `import <module>`). */
export function sondeImport(module, py = resolvePython()) {
  if (!py || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(module)) return false;
  return spawnSync(py[0], [...py.slice(1), '-c', `import ${module}`], { encoding: 'utf8', timeout: 30000 }).status === 0;
}

/** Les modules de la liste que l'interpréteur n'importe pas. `sonde` est injectable pour la recette. */
export function modulesAbsents(modules, sonde = sondeImport) {
  return (modules || []).filter((m) => !sonde(m));
}

/** La commande qui installe ces modules au poste (nom du paquet pip, qui diffère parfois du module). */
export function commandeInstallation(modules, py = resolvePython()) {
  const paquets = [...new Set((modules || []).map((m) => PAQUET_PIP[m] || m))];
  return `${(py || ['python']).join(' ')} -m pip install ${paquets.join(' ')}`;
}

/**
 * Le motif d'un SKIP motivé par un prérequis absent, ou null. Rend un motif seulement si le verdict est SKIP, que
 * la fixture déclare des modules et que l'un d'eux manque réellement : le motif nomme le paquet absent et la
 * commande d'installation. Tout autre cas reste jugé comme avant par l'appelant. Un attendu qui tolère déjà le
 * SKIP n'y change rien : il tolère le verdict, pas les messages que la paire rouge attendait de l'oracle.
 */
export function skipMotiveParPrerequis(verdict, modules, { sonde = sondeImport, py } = {}) {
  if (verdict !== 'SKIP' || !(modules || []).length) return null;
  const absents = modulesAbsents(modules, sonde);
  if (!absents.length) return null;
  return `paquet(s) Python absent(s) de ce poste : ${absents.join(', ')} — à installer au poste : ${commandeInstallation(absents, py)} ; `
    + `cette paire rouge/verte n'est PAS rejouée ici`;
}

/** spawnSync prêt à l'emploi : runPython(['script.py', 'arg'], opts) avec l'interpréteur validé. */
export function runPython(args, opts = {}) {
  const py = resolvePython();
  if (!py) return null;
  return spawnSync(py[0], [...py.slice(1), ...args],
    { encoding: 'utf8', ...opts, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...(opts.env || {}) } });
}
