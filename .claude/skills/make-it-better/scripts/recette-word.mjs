#!/usr/bin/env node
// recette-word.mjs — l'aperçu Word contre le vrai Word du poste : export réel, aucun processus laissé,
// un Word ouvert par le porteur reste ouvert, un Word qui ne répond plus s'arrête à 120 secondes.
//   node recette-word.mjs --racine <dossier>
// Le « Word du porteur » est lancé par ce script, sur une copie fictive : il est seul à être fermé à la fin.
// Tout WINWORD présent avant le lancement est relevé et laissé tel quel. Dure environ 3 minutes.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireJson, estDansDepot, pad } from './lib/commun.mjs';
import { effacerReprise, entreesDeReprise, listerWinword } from './lib/word.mjs';
import { creerServeur } from './serveur-versions.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE_SKILL = join(ICI, '..');
const FIXTURE = join(RACINE_SKILL, 'fixtures', 'documents', 'note.docx');

let ko = 0;
function verifier(nom, vrai, detail = '') {
  console.log(`${vrai ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`);
  if (!vrai) ko++;
}
const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });

function requete(port, chemin) {
  return new Promise((rendre, rejeter) => {
    http.get({ host: '127.0.0.1', port, path: chemin, timeout: 400000 }, (res) => {
      const m = [];
      res.on('data', (d) => m.push(d));
      res.on('end', () => rendre({ code: res.statusCode, type: res.headers['content-type'], octets: Buffer.concat(m), texte: Buffer.concat(m).toString('utf8') }));
    }).on('error', rejeter);
  });
}

function powershell(commande) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', commande], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
}

const racine = process.argv.includes('--racine') ? resolve(process.argv[process.argv.indexOf('--racine') + 1]) : null;
if (!racine) {
  console.error('usage : recette-word.mjs --racine <dossier>');
  process.exit(2);
}
if (estDansDepot(racine)) {
  console.error(`${racine} est dans un dépôt git : la recette vit hors de tout dépôt`);
  process.exit(2);
}

const avantTout = listerWinword();
console.log(`WINWORD relevés avant le test : ${avantTout.length ? avantTout.map((w) => `${w.pid}${w.automation ? ' (automation)' : ''}`).join(', ') : 'aucun'}`);
const presents = new Set(avantTout.map((w) => w.pid));

// Un espace Word à 3 versions, une par cas : le cache d'aperçu de l'une ne sert pas à l'autre.
const espace = join(racine, `word-${Date.now()}`);
mkdirSync(join(espace, 'document'), { recursive: true });
cpSync(join(RACINE_SKILL, 'fixtures', 'cadre'), join(espace, 'document'), { recursive: true });
copyFileSync(FIXTURE, join(espace, 'document', 'origine.docx'));
const essai = join(espace, 'essais', 'opus-1');
for (const n of [0, 1, 2]) {
  mkdirSync(join(essai, 'tours', pad(n)), { recursive: true });
  copyFileSync(FIXTURE, join(essai, 'tours', pad(n), 'document.docx'));
  ecrireJson(join(essai, 'tours', pad(n), 'controle.json'), { numero: n, statut: 'gardee', type: n ? 'reformulation' : 'origine', motif: '', note: { apporte: 'x', retire: 'y' }, mots: { ajoutes: 0, retires: 0, total: 100 } });
}
ecrireJson(join(essai, 'etat.json'), { statut: 'arrete', arret: { type: 'borne' }, tours_max: 2, debut: 'x' });

const { serveur, ecouter } = creerServeur({ espace, port: 0 });
const port = await ecouter();
const base = `/apercu/${encodeURIComponent(espace.split(/[\\/]/).pop())}/opus-1`;
let pidPorteur = null;

try {
  // Cas 1 : un aperçu réel, et aucun processus lancé par le serveur ne reste.
  let t = Date.now();
  const r1 = await requete(port, `${base}/000`);
  const duree1 = Math.round((Date.now() - t) / 1000);
  verifier('aperçu réel : images de pages', /<img src=/.test(r1.texte), `${duree1} s — ${r1.texte.slice(0, 200).replace(/\s+/g, ' ')}`);
  const png = await requete(port, `${base}/000/page/1`);
  verifier('aperçu réel : une vraie image', png.type === 'image/png' && png.octets.slice(1, 4).toString() === 'PNG');
  verifier('aperçu réel : le PDF d\'export vit dans le cache, jamais servi', existsSync(join(espace, 'apercus', 'opus-1', '000', 'document.pdf')));
  const meta1 = JSON.parse(readFileSync(join(espace, 'apercus', 'opus-1', '000', 'apercu.json'), 'utf8'));
  verifier('aperçu réel : Word sort seul par Quit, sans arrêt forcé', meta1.word?.arrete === false && meta1.word?.numero > 0, JSON.stringify(meta1.word));
  await pause(1000);
  const apres1 = listerWinword().filter((w) => !presents.has(w.pid));
  verifier('après un aperçu, aucun processus lancé par le serveur ne reste', apres1.length === 0, apres1.map((w) => w.pid).join(', '));

  // Le Word du porteur : une copie fictive ouverte à part, avant les 2 cas suivants.
  const copiePorteur = join(espace, 'word-du-porteur.docx');
  copyFileSync(FIXTURE, copiePorteur);
  const lance = powershell(`$p = Start-Process -FilePath 'WINWORD.EXE' -ArgumentList '/n', '"${copiePorteur}"' -WindowStyle Minimized -PassThru; Write-Output $p.Id`);
  pidPorteur = Number((lance.stdout || '').trim().split(/\r?\n/).pop());
  for (let i = 0; i < 40 && !listerWinword().some((w) => w.pid === pidPorteur); i++) await pause(500);
  await pause(8000); // le temps d'ouvrir le document
  const fenetre = () => (powershell(`(Get-Process -Id ${pidPorteur} -ErrorAction SilentlyContinue).MainWindowTitle`).stdout || '').trim();
  const titreAvant = fenetre();
  verifier('Word du porteur ouvert par le test', listerWinword().some((w) => w.pid === pidPorteur && !w.automation), `processus ${pidPorteur}, fenêtre « ${titreAvant} »`);

  // Cas 2 : un aperçu pendant que le porteur travaille.
  t = Date.now();
  const r2 = await requete(port, `${base}/001`);
  verifier('aperçu réel, Word du porteur ouvert : images', /<img src=/.test(r2.texte), `${Math.round((Date.now() - t) / 1000)} s`);
  verifier('Word du porteur toujours ouvert après l\'aperçu', listerWinword().some((w) => w.pid === pidPorteur));
  verifier('sa fenêtre porte toujours son document', fenetre() === titreAvant, `« ${fenetre()} »`);
  const apres2 = listerWinword().filter((w) => !presents.has(w.pid) && w.pid !== pidPorteur);
  verifier('après l\'aperçu, seul le Word du porteur reste', apres2.length === 0, apres2.map((w) => w.pid).join(', '));

  // Cas 3 : Word ne répond plus, arrêt à 120 secondes, repli sur le texte.
  process.env.MIB_SIM_WORD = 'gel';
  t = Date.now();
  const r3 = await requete(port, `${base}/002`);
  const duree3 = (Date.now() - t) / 1000;
  delete process.env.MIB_SIM_WORD;
  verifier('Word qui ne répond pas : arrêté à 120 secondes', duree3 >= 119 && duree3 < 150, `${Math.round(duree3)} s`);
  verifier('repli sur le texte extrait, dit', /Aperçu en texte extrait/.test(r3.texte) && /n&#39;a pas répondu en 120 secondes/.test(r3.texte) && /Camille Exemple/.test(r3.texte), r3.texte.slice(0, 300).replace(/\s+/g, ' '));
  await pause(1000);
  const apres3 = listerWinword().filter((w) => !presents.has(w.pid) && w.pid !== pidPorteur);
  verifier('le Word figé est arrêté, aucun autre processus du serveur ne reste', apres3.length === 0, apres3.map((w) => w.pid).join(', '));
  verifier('Word du porteur toujours ouvert après l\'arrêt du Word figé', listerWinword().some((w) => w.pid === pidPorteur) && fenetre() === titreAvant, `« ${fenetre()} »`);
  const reprises = entreesDeReprise().filter((e) => /mib-word-/.test(e));
  verifier('aucune copie du serveur ne reste à reprendre dans Word', reprises.length === 0, reprises.join(' | '));

  // Un nouvel essai réussit : le repli ne reste pas collé à la version.
  const r4 = await requete(port, `${base}/002`);
  verifier('Word revenu : la même version passe en images', /<img src=/.test(r4.texte));
} finally {
  serveur.close();
  delete process.env.MIB_SIM_WORD;
  if (pidPorteur) {
    // Fermé par le test qui l'a ouvert, et lui seul.
    powershell(`$p = Get-Process -Id ${pidPorteur} -ErrorAction SilentlyContinue; if ($p) { [void]$p.CloseMainWindow(); Start-Sleep -Seconds 4; if (-not $p.HasExited) { Stop-Process -Id ${pidPorteur} -Force } }`);
    effacerReprise(join(espace, 'word-du-porteur.docx'));
  }
}

await pause(1500);
const fin = listerWinword();
const horsRelevé = fin.filter((w) => !presents.has(w.pid));
verifier('fin : seuls restent les WINWORD présents avant le test', horsRelevé.length === 0, horsRelevé.map((w) => w.pid).join(', '));
verifier('fin : les WINWORD présents avant le test n\'ont pas été touchés', avantTout.every((w) => fin.some((x) => x.pid === w.pid)));
rmSync(espace, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
console.log(ko ? `recette Word : ${ko} écart(s)` : 'recette Word : tous les verdicts attendus');
process.exit(ko ? 1 : 0);
