#!/usr/bin/env node
// self-test — recette du skill prompt-analyzer-l99 : joue la recette de l'oracle du mode boucle
// (TF-1831), 2 verts et 8 rouges qui ne changent chacun qu'un élément du vert. Exit 0 / 1.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(ICI, 'oracle-boucle-l99.mjs'), '--self-test'], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status === 0 ? 0 : 1);
