// lib/noms-texte — un TEXTE jugé par la porte des noms (10/11/2026, TF-2351, TF-2370, TF-2361).
//
// La porte des noms (oracle-nom-client-publie.mjs) fait foi pour les noms interdits : ses graphies, ses
// variantes, ses formes déclarées (TF-2130) ne se recopient pas (R3). Elle juge un dépôt git ; un oracle
// qui veut faire juger un texte qu'il a extrait (d'un PDF, des paragraphes ajoutés d'un document Word,
// d'un dossier anonymisé) le dépose dans un dépôt JETABLE, l'indexe, et lui transmet ses tables.
// Rend { juge, constats: [message], motif } ; `juge: false` quand la porte n'a pas pu juger (motif dit).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORTE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'oracle-nom-client-publie.mjs');

export function jugerNoms(texte, { referentiel = null, produits = null } = {}) {
  const jetable = fs.mkdtempSync(path.join(os.tmpdir(), 'noms-texte-'));
  try {
    const env = { ...process.env };
    for (const k of ['GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete env[k];
    spawnSync('git', ['init', '-q', jetable], { encoding: 'utf8', env });
    fs.writeFileSync(path.join(jetable, 'texte.txt'), String(texte || ''), 'utf8');
    spawnSync('git', ['-C', jetable, 'add', 'texte.txt'], { encoding: 'utf8', env });
    const passe = [referentiel ? `--referentiel=${referentiel}` : null, produits ? `--produits=${produits}` : null].filter(Boolean);
    const r = spawnSync(process.execPath, [PORTE, jetable, ...passe], { encoding: 'utf8', timeout: 180000, env, maxBuffer: 64e6 });
    let j = null; try { j = JSON.parse(String(r.stdout || '').trim()); } catch { /* sortie illisible, dite ci-dessous */ }
    if (!j) return { juge: false, constats: [], motif: 'la porte des noms n\'a pas rendu de verdict lisible (' + String(r.stderr || r.error || '').trim().slice(0, 160) + ')' };
    if (j.verdict === 'SKIP') return { juge: false, constats: [], motif: j.motif || (j.non_juge || [])[0] || 'porte des noms en SKIP' };
    // Un même nom revient une fois par occurrence, il se dit une fois.
    const constats = [...new Set((j.findings || []).filter(x => x.sev === 'bloquant').map(x => x.msg.replace(/ dans le contenu d'un fichier suivi/, '')))];
    return { juge: true, constats, motif: null };
  } finally { try { fs.rmSync(jetable, { recursive: true, force: true }); } catch { /* zone temporaire */ } }
}
