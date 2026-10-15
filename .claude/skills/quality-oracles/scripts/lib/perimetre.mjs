// perimetre.mjs — LE PÉRIMÈTRE VERSIONNÉ D'UNE CIBLE (TF-1702, lot Produit-82 20261014b, RA-3).
//
// LE FAIT, le 14/10/2026 : sur un dépôt qui porte un `.env` ignoré par git, un `htpasswd` et la sortie
// de `docker compose config` (qui recopie en clair les variables des `env_file`), run-oracles a rendu
// FAIL secrets. Il jugeait le DISQUE, alors que la question posée était celle du dépôt : ce qui sera
// versionné, donc publié. Le produit a dû exporter son contenu versionné à la main pour l'obtenir.
//
// CE QUE CE MODULE REND : l'ensemble des fichiers que git suit ou suivrait — `git ls-files -co
// --exclude-standard`, c'est-à-dire les fichiers suivis ET les non-suivis que le `.gitignore` ne
// couvre pas (un fichier neuf, pas encore ajouté, reste jugé). Chemins rendus en clés (`cleDeChemin`).
// Hors d'un dépôt git, il ne rend rien et DIT pourquoi : l'appelant juge alors le disque entier et
// le déclare, jamais l'inverse (un périmètre introuvable ne fait taire aucun juge).
//
// L'OPTION : `--versionne` sur la ligne de commande, ou `QO_PERIMETRE=versionne` dans
// l'environnement — run-oracles le pose pour les oracles qu'il lance (même voie que QO_NIVEAU).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const perimetreVersionneDemande = (argv = process.argv) =>
  argv.includes('--versionne') || process.env.QO_PERIMETRE === 'versionne';

/** La clé de comparaison d'un chemin : absolu, et sans casse sous Windows (`C:` et `c:` y désignent
 *  le même fichier ; gitleaks écrit `C:/…`, l'appelant a pu écrire `c:\…`). */
export const cleDeChemin = p => { const r = path.resolve(p); return process.platform === 'win32' ? r.toLowerCase() : r; };

/** { fichiers: Set<clé de chemin> } ou { motif } quand la cible n'est pas dans un dépôt git. */
export function fichiersVersionnes(cible) {
  const dossier = fs.statSync(cible).isDirectory() ? cible : path.dirname(cible);
  const r = spawnSync('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'],
    { cwd: dossier, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { motif: 'git introuvable sur ce poste (' + r.error.code + ')' };
  if (r.status !== 0) return { motif: 'la cible n\'est pas dans un dépôt git (' + (String(r.stderr || '').trim().split(/\r?\n/)[0] || 'exit ' + r.status).slice(0, 120) + ')' };
  return { fichiers: new Set(r.stdout.split('\0').filter(Boolean).map(p => cleDeChemin(path.resolve(dossier, p)))) };
}
