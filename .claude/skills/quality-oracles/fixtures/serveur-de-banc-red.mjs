// Fixture ROUGE de oracle-serveur-de-banc (TF-2414) — un banc d'accessibilité qui lance des serveurs et ne les arrête jamais :
// le cas du 09/11/2026 (wrangler pages dev lancé à 20:16, encore actif le 10/11, 25 880 s de processeur d'esbuild).
import { spawn, spawnSync } from 'node:child_process';

function attendre(ms) { return new Promise(r => setTimeout(r, ms)); }

// 1. wrangler en arrière-plan, appel sur plusieurs lignes : aucun arrêt nulle part
async function banc_accessibilite() {
  const serveur = spawn(
    'npx',
    ['wrangler', 'pages', 'dev', './dist', '--port', '8788'],
    { stdio: 'ignore' },
  );
  await attendre(5000);
  const r = spawnSync('node', ['oracle-a11y.mjs', 'http://localhost:8788/'], { encoding: 'utf8' });
  console.log(r.stdout);
  return serveur.pid;
}

// 2. serveur statique en arrière-plan, exemption sans raison valable
async function banc_statique() {
  // serveur-banc-ok: ok
  const statique = spawn('python', ['-m', 'http.server', '8080'], { detached: true });
  statique.unref();
  await attendre(2000);
}

await banc_accessibilite();
await banc_statique();
