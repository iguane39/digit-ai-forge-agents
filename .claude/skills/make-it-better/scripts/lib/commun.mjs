// lib/commun.mjs — chemins, fichiers et appels partagés par les commandes de make-it-better.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOSSIER_SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RACINE_SKILL = resolve(DOSSIER_SCRIPTS, '..');

// Un seul nom de fichier par format : `document.<ext>` dans l'espace comme dans le dossier du tour.
const FORMATS = { '.md': 'md', '.markdown': 'md', '.html': 'html', '.htm': 'html', '.docx': 'docx', '.pptx': 'pptx', '.pdf': 'pdf' };

export function extensionDe(chemin) {
  const m = /\.[^./\\]+$/.exec(String(chemin));
  return m ? m[0].toLowerCase() : '';
}
export function formatDe(chemin) {
  return FORMATS[extensionDe(chemin)] || null;
}
export const LIBELLE_FORMAT = { md: 'Markdown', html: 'HTML', docx: 'Word', pptx: 'PowerPoint', pdf: 'PDF' };
/** Un paquet Office : il se dépaquette pour le tour, et son plafond se compte sur le corps. */
export const estPaquet = (ext) => ext === 'docx' || ext === 'pptx';

export const pad = (n) => String(n).padStart(3, '0');

export function lireJson(chemin, defaut = null) {
  try {
    return JSON.parse(readFileSync(chemin, 'utf8'));
  } catch {
    return defaut;
  }
}

/** Écriture atomique : une coupure du poste laisse l'ancien fichier ou le nouveau, jamais la moitié. */
export function ecrireJson(chemin, objet) {
  mkdirSync(dirname(chemin), { recursive: true });
  const provisoire = `${chemin}.${process.pid}.tmp`;
  writeFileSync(provisoire, JSON.stringify(objet, null, 1) + '\n', 'utf8');
  for (let essai = 0; ; essai++) {
    try {
      renameSync(provisoire, chemin);
      return;
    } catch (e) {
      // Sous Windows un antivirus tient parfois le fichier un instant.
      if (essai >= 10 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

export function listerFichiers(dossier, prefixe = '') {
  if (!existsSync(dossier)) return [];
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const rel = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listerFichiers(join(dossier, e.name), rel));
    else out.push(rel);
  }
  return out;
}

/** Vrai si `dossier`, ou son plus proche parent existant, est dans un dépôt git. */
export function estDansDepot(dossier) {
  let d = resolve(dossier);
  while (!existsSync(d)) {
    const parent = dirname(d);
    if (parent === d) return false;
    d = parent;
  }
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CEILING_DIRECTORIES']) delete env[k];
  const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: d, encoding: 'utf8', windowsHide: true, env });
  if (!r.error && r.status === 0) return true;
  // git absent, ou qui refuse de répondre (dépôt d'un autre propriétaire) : le dossier .git d'un parent reste une preuve lisible.
  for (let p = d; ; p = dirname(p)) {
    if (existsSync(join(p, '.git'))) return true;
    if (dirname(p) === p) return false;
  }
}

/** Le fichier d'un skill voisin : installé, à défaut sous FORGE_ROOT, à défaut à côté de ce skill. */
export function cheminSkillVoisin(skill, relatif) {
  const pistes = [
    join(homedir(), '.claude', 'skills', skill, relatif),
    process.env.FORGE_ROOT ? join(process.env.FORGE_ROOT, 'digit-ai-forge-agents', '.claude', 'skills', skill, relatif) : null,
    join(RACINE_SKILL, '..', skill, relatif),
  ].filter(Boolean);
  return pistes.find((p) => existsSync(p)) || null;
}

let pythonTrouve;
export function trouverPython() {
  if (pythonTrouve !== undefined) return pythonTrouve;
  pythonTrouve = null;
  for (const [cmd, pre] of [[process.env.MAKE_IT_BETTER_PYTHON || 'python', []], ['python3', []], ['py', ['-3']]]) {
    const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8', windowsHide: true });
    if (!r.error && r.status === 0) {
      pythonTrouve = { cmd, pre };
      break;
    }
  }
  return pythonTrouve;
}

/** Appelle scripts/formats.py : { code, json, stdout, stderr } ; code null si Python manque. */
export function appelerFormats(args, { binaire = false } = {}) {
  const py = trouverPython();
  if (!py) return { code: null, json: null, stdout: '', stderr: 'Python introuvable' };
  const r = spawnSync(py.cmd, [...py.pre, join(DOSSIER_SCRIPTS, 'formats.py'), ...args], {
    encoding: binaire ? 'buffer' : 'utf8',
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PYTHONUTF8: '1' },
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch { /* la commande `texte` rend du texte */ }
  return { code: r.status, json, stdout: r.stdout || '', stderr: r.stderr || '' };
}

export const dateIso = () => new Date().toISOString();

export function tailleDe(chemin) {
  try {
    return statSync(chemin).size;
  } catch {
    return 0;
  }
}
