#!/usr/bin/env node
// recette-powerpoint.mjs — l'aperçu PowerPoint contre le vrai PowerPoint du poste : export réel par
// exporter-pptx.mjs, images de pages, repli sur le texte, et un PowerPoint du porteur laissé intact.
//   node recette-powerpoint.mjs --racine <dossier>
//
// PowerPoint n'a qu'une instance par session Windows. Un PowerPoint déjà ouvert est donc celui du porteur :
// cette recette n'y ouvre rien, n'y ferme rien, et relit seulement son numéro, sa date de lancement et son
// titre avant et après chaque export. Si aucun ne tourne, elle joue l'instance lancée puis quittée par
// l'export, puis ouvre elle-même un « PowerPoint du porteur » sur une copie fictive, qu'elle seule referme.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireJson, estDansDepot, pad } from './lib/commun.mjs';
import { listerPowerpoint } from './lib/powerpoint.mjs';
import { creerServeur } from './serveur-versions.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE_SKILL = join(ICI, '..');
const FIXTURE = join(RACINE_SKILL, 'fixtures', 'documents', 'note.pptx');

let ko = 0;
function verifier(nom, vrai, detail = '') {
  console.log(`${vrai ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`);
  if (!vrai) ko++;
}
const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });

function requete(port, chemin) {
  return new Promise((rendre, rejeter) => {
    http.get({ host: '127.0.0.1', port, path: chemin, timeout: 1000000 }, (res) => {
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
  console.error('usage : recette-powerpoint.mjs --racine <dossier>');
  process.exit(2);
}
if (estDansDepot(racine)) {
  console.error(`${racine} est dans un dépôt git : la recette vit hors de tout dépôt`);
  process.exit(2);
}
delete process.env.MIB_SIM_POWERPOINT;

const empreinte = (liste) => liste.map((p) => `${p.pid}|${p.debut}|${p.titre}`).sort().join('\n');
const avantTout = listerPowerpoint();
console.log(`POWERPNT relevés avant le test : ${avantTout.length ? avantTout.map((p) => `${p.pid} « ${p.titre} »`).join(', ') : 'aucun'}`);
const presents = new Set(avantTout.map((p) => p.pid));
const dejaOuvert = avantTout.length > 0;

// Un espace à 4 versions, une par cas : le cache d'aperçu de l'une ne sert pas à l'autre.
const espace = join(racine, `powerpoint-${Date.now()}`);
mkdirSync(join(espace, 'document'), { recursive: true });
cpSync(join(RACINE_SKILL, 'fixtures', 'cadre'), join(espace, 'document'), { recursive: true });
copyFileSync(FIXTURE, join(espace, 'document', 'origine.pptx'));
const essai = join(espace, 'essais', 'opus-1');
for (const n of [0, 1, 2, 3]) {
  mkdirSync(join(essai, 'tours', pad(n)), { recursive: true });
  copyFileSync(FIXTURE, join(essai, 'tours', pad(n), 'document.pptx'));
  ecrireJson(join(essai, 'tours', pad(n), 'controle.json'), { numero: n, statut: 'gardee', type: n ? 'reformulation' : 'origine', motif: '', note: { apporte: 'x', retire: 'y' }, mots: { ajoutes: 0, retires: 0, total: 100 } });
}
ecrireJson(join(essai, 'etat.json'), { statut: 'arrete', arret: { type: 'borne' }, tours_max: 3, debut: 'x' });

const { serveur, ecouter } = creerServeur({ espace, port: 0 });
const port = await ecouter();
const base = `/apercu/${encodeURIComponent(espace.split(/[\\/]/).pop())}/opus-1`;
let pidOuvertIci = null;

async function apercuReel(numero, libelle) {
  const t = Date.now();
  const r = await requete(port, `${base}/${pad(numero)}`);
  verifier(`${libelle} : images de pages`, /<img src=/.test(r.texte), `${Math.round((Date.now() - t) / 1000)} s — ${r.texte.slice(0, 260).replace(/\s+/g, ' ')}`);
  const png = await requete(port, `${base}/${pad(numero)}/page/1`);
  verifier(`${libelle} : une vraie image`, png.type === 'image/png' && png.octets.slice(1, 4).toString() === 'PNG');
  const fait = join(espace, 'apercus', 'opus-1', pad(numero), 'apercu.json');
  verifier(`${libelle} : 3 pages, une par diapositive`, existsSync(fait) && JSON.parse(readFileSync(fait, 'utf8')).pages === 3, existsSync(fait) ? readFileSync(fait, 'utf8').replace(/\s+/g, ' ') : 'pas d\'apercu.json');
  verifier(`${libelle} : le PDF d'export vit dans le cache`, existsSync(join(espace, 'apercus', 'opus-1', pad(numero), 'document.pdf')));
  return existsSync(fait) ? JSON.parse(readFileSync(fait, 'utf8')).powerpoint : null;
}

try {
  if (dejaOuvert) {
    console.log('Un PowerPoint tourne déjà : le cas de l\'instance lancée puis quittée n\'est pas joué, il exigerait de fermer le sien.');
  } else {
    // Sans PowerPoint ouvert : l'export lance son instance et la quitte.
    const trace = await apercuReel(0, 'sans PowerPoint ouvert');
    verifier('sans PowerPoint ouvert : l\'export quitte l\'instance qu\'il a lancée', trace?.quittee === true, JSON.stringify(trace));
    for (let i = 0; i < 20 && listerPowerpoint().length; i++) await pause(500);
    verifier('sans PowerPoint ouvert : aucun processus ne reste', listerPowerpoint().length === 0, listerPowerpoint().map((p) => p.pid).join(', '));
    const copie = join(espace, 'powerpoint-du-porteur.pptx');
    copyFileSync(FIXTURE, copie);
    const lance = powershell(`$p = Start-Process -FilePath 'POWERPNT.EXE' -ArgumentList '"${copie}"' -WindowStyle Minimized -PassThru; Write-Output $p.Id`);
    pidOuvertIci = Number((lance.stdout || '').trim().split(/\r?\n/).pop());
    for (let i = 0; i < 40 && !listerPowerpoint().some((p) => p.pid === pidOuvertIci); i++) await pause(500);
    await pause(8000); // le temps d'ouvrir le deck
  }

  // Le PowerPoint du porteur, à empreinte relevée après son ouverture.
  const avant = listerPowerpoint();
  verifier('PowerPoint du porteur ouvert', avant.length > 0, avant.map((p) => `${p.pid} « ${p.titre} »`).join(', '));
  const intact = (quand) => {
    const maintenant = listerPowerpoint();
    verifier(`${quand} : numéro, date de lancement et titre inchangés`, avant.every((p) => maintenant.some((q) => q.pid === p.pid && q.debut === p.debut && q.titre === p.titre)), `avant : ${empreinte(avant).replace(/\n/g, ' ; ')} — après : ${empreinte(maintenant).replace(/\n/g, ' ; ')}`);
    return maintenant;
  };

  const trace = await apercuReel(1, 'export réel, PowerPoint du porteur ouvert');
  verifier('l\'export voit l\'instance du porteur et ne la quitte pas', trace?.quittee === false && trace?.pids_avant?.length > 0, JSON.stringify(trace));
  intact('après l\'export');

  // Un export déjà fait se relit sans rouvrir PowerPoint.
  const t = Date.now();
  const relu = await requete(port, `${base}/001`);
  verifier('la version déjà exportée se relit du cache', /<img src=/.test(relu.texte) && Date.now() - t < 5000, `${Date.now() - t} ms`);

  // Le repli : l'export échoue, et le porteur n'en sait rien d'autre que ce que l'aperçu dit.
  process.env.MIB_SIM_POWERPOINT = 'absent';
  const repli = await requete(port, `${base}/002`);
  delete process.env.MIB_SIM_POWERPOINT;
  verifier('à défaut d\'export : le texte extrait, et l\'aperçu le dit', /Aperçu en texte extrait/.test(repli.texte) && /Camille Exemple/.test(repli.texte), repli.texte.slice(0, 300).replace(/\s+/g, ' '));
  intact('après le repli');

  // PowerPoint revenu : le repli ne reste pas collé à la version.
  const revenu = await requete(port, `${base}/002`);
  verifier('export revenu : la même version passe en images', /<img src=/.test(revenu.texte));
  intact('après le second export');

  // La revue à l'aveugle se prépare sur des exports réels, version après version, sans repli.
  const ouverture = await new Promise((rendre, rejeter) => {
    const corps = JSON.stringify({ doc: espace.split(/[\\/]/).pop(), essai: 'opus-1' });
    const r = http.request({ host: '127.0.0.1', port, path: '/api/aveugle/ouvrir', method: 'POST', timeout: 1000000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corps) } }, (res) => {
      let s = '';
      res.on('data', (d) => { s += d; });
      res.on('end', () => rendre(JSON.parse(s)));
    });
    r.on('error', rejeter);
    r.end(corps);
  });
  verifier('revue à l\'aveugle sur exports réels : en images', ouverture.repli_texte === false && ouverture.lettres?.length >= 2, JSON.stringify(ouverture));
  intact('après la préparation de la revue');
} finally {
  serveur.close();
  delete process.env.MIB_SIM_POWERPOINT;
  // Fermé par le test qui l'a ouvert, et lui seul : jamais un numéro présent avant le test.
  if (pidOuvertIci && !presents.has(pidOuvertIci)) {
    powershell(`$p = Get-Process -Id ${pidOuvertIci} -ErrorAction SilentlyContinue; if ($p) { [void]$p.CloseMainWindow(); Start-Sleep -Seconds 4; if (-not $p.HasExited) { Stop-Process -Id ${pidOuvertIci} -Force } }`);
  }
}

await pause(1500);
const fin = listerPowerpoint();
verifier('fin : les POWERPNT présents avant le test restent, inchangés', avantTout.every((p) => fin.some((q) => q.pid === p.pid && q.debut === p.debut && q.titre === p.titre)), empreinte(fin).replace(/\n/g, ' ; '));
const neufs = fin.filter((p) => !presents.has(p.pid));
verifier('fin : aucun POWERPNT neuf ne reste', neufs.length === 0, neufs.map((p) => p.pid).join(', '));
try {
  rmSync(espace, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
} catch (e) {
  console.log(`espace non retiré : ${espace} (${e.code})`);
}
console.log(ko ? `recette PowerPoint : ${ko} écart(s)` : 'recette PowerPoint : tous les verdicts attendus');
process.exit(ko ? 1 : 0);
