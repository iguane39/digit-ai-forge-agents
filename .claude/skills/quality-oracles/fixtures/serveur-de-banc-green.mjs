// Fixture VERTE de oracle-serveur-de-banc (TF-2414) — le même banc, qui joue les gestes que le message propose :
// l'arrêt dans la même commande (`try … finally` qui tue le processus lancé) ou l'exemption déclarée avec sa raison.
import { spawn, spawnSync } from 'node:child_process';

function attendre(ms) { return new Promise(r => setTimeout(r, ms)); }

// 1. wrangler en arrière-plan, arrêté dans un finally : il ne survit pas au banc, quoi qu'il arrive
async function banc_accessibilite() {
  const serveur = spawn(
    'npx',
    ['wrangler', 'pages', 'dev', './dist', '--port', '8788'],
    { stdio: 'ignore' },
  );
  try {
    await attendre(5000);
    const r = spawnSync('node', ['oracle-a11y.mjs', 'http://localhost:8788/'], { encoding: 'utf8' });
    console.log(r.stdout);
  } finally {
    serveur.kill();
  }
}

// 2. serveur statique rendu au banc suivant, exemption déclarée avec sa raison
async function banc_statique() {
  // serveur-banc-ok: le banc suivant le réutilise et l'arrête dans sa propre commande
  const statique = spawn('python', ['-m', 'http.server', '8080'], { detached: true });
  statique.unref();
  await attendre(2000);
}

await banc_accessibilite();
await banc_statique();
// Un serveur lancé en AVANT-plan (spawnSync) bloque le script lui-même : ce n'est pas un serveur orphelin, il n'est pas accusé.
