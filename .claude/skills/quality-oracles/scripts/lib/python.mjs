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

/** spawnSync prêt à l'emploi : runPython(['script.py', 'arg'], opts) avec l'interpréteur validé. */
export function runPython(args, opts = {}) {
  const py = resolvePython();
  if (!py) return null;
  return spawnSync(py[0], [...py.slice(1), ...args],
    { encoding: 'utf8', ...opts, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...(opts.env || {}) } });
}
