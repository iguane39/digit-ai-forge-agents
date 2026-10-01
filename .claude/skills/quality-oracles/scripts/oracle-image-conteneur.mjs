#!/usr/bin/env node
// oracle-image-conteneur — Domaine « Image de conteneur, vulnérabilités de la couche système »
// (TF-1499, 01/10/2026). Scaffoldé par write-an-oracle, puis durci.
//
// LE FAIT (lot Produit-03 - RETOURS - 20260930b, RA-55). Pour anticiper le scan bloquant de la
// production, l'image du produit a été construite sur le poste, puis scannée par trivy : 1 faille
// HIGH (une bibliothèque XML système, installée dans sa version d'avant le correctif). Le journal de
// construction portait `RUN apk upgrade --no-cache` suivi de `CACHED` : la couche de mise à jour
// venait d'une construction ancienne du poste. Reconstruite avec `docker build --no-cache`, l'image
// portait les versions corrigées, et trivy rendait 0 faille HIGH ou CRITICAL. Sans la lecture du
// journal, le constat aurait conduit à un correctif inutile ou à une fausse alerte. Le registre
// n'avait aucune ligne « image de conteneur » ; la ligne SCA ne couvre pas la couche système.
//
// Checklist canonique :
//   C1 la construction ne réutilise AUCUNE couche du cache du poste : un journal BuildKit qui porte
//      `#N CACHED`, ou un journal du constructeur classique qui porte `---> Using cache`, nomme
//      chaque étape réutilisée — le scan d'une telle image ne dit pas ce que la chaîne construira.
//      L'image de base (`FROM … CACHED`), affichée ainsi même sous --no-cache, n'est pas une étape
//      réutilisée : elle est comptée et dite, et le mode construction la revérifie (--pull) ;
//   C2 `trivy image --severity HIGH,CRITICAL --exit-code 1` : aucune vulnérabilité HIGH ou CRITICAL
//      sur l'image construite avec `docker build --no-cache`, jamais sur une image issue du cache.
// Trois entrées, une seule commande :
//   <journal.log|.txt>                       C1 seule, sur le journal d'une construction faite ailleurs ;
//   <rapport-trivy.json> [--journal <log>]   C2 sur le rapport (JSON de trivy), C1 sur le journal s'il
//                                            est donné — sans journal, rien ne dit que l'image scannée
//                                            n'est pas issue du cache, et c'est dit ;
//   <Dockerfile|dossier de construction>     la chaîne entière : docker build --no-cache --pull
//                                            --progress=plain (C1 sur son propre journal), trivy image
//                                            (C2), puis l'image jetable est retirée. Docker ou trivy
//                                            absents, démon arrêté : SKIP motivé. Invocation explicite :
//                                            une construction coûte des minutes et le réseau.
// Usage : node oracle-image-conteneur.mjs <cible> [--journal <journal.log>]
// Contrat JSON commun · exit 0/1/2 · tout SKIP porte `motif` (TF-1447).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ecrivainDeContrat } from './lib/contrat.mjs';

const contratJSON = ecrivainDeContrat({ premier: true });
const args = process.argv.slice(2);
const iJ = args.indexOf('--journal');
const journalArg = iJ >= 0 ? args[iJ + 1] : null;
const cible = args.find((a, i) => !a.startsWith('--') && !(iJ >= 0 && i === iJ + 1));
const DOM = 'Image de conteneur, vulnérabilités de la couche système';
const LIMITES = [
  'les vulnérabilités MEDIUM et LOW, et celles qu une base de trivy plus récente publiera après le scan : un verdict d image se rejoue le jour du lancement',
  'les dépendances applicatives hors image (manifeste npm, pip) → Sécurité : vulnérabilités de dépendances (SCA)',
  'la configuration de l image (utilisateur root, ports, secrets dans les couches) : non jugée ici',
];
const out = (verdict, findings, nonJuge, code, extra = {}) => {
  process.stdout.write(contratJSON({ oracle: 'oracle-image-conteneur', domaine: DOM, artefact: cible || null, verdict, findings, non_juge: nonJuge, ...extra }));
  process.exit(code);
};
const skip = (motif, extra = {}) => out('SKIP', [], [motif, ...LIMITES], 2, { motif, ...extra });

if (!cible || !fs.existsSync(cible)) skip('fichier absent');
if (journalArg && !fs.existsSync(journalArg)) skip(`journal de construction introuvable : ${journalArg}`);
const findings = [], nonJuge = [];
const base = path.basename(cible);

// ---- C1 : le journal dit-il qu'une couche vient du cache du poste ? ---------------------------
function c1(texte, ou) {
  const lignes = texte.split(/\r?\n/);
  const etapes = new Map();
  let reconnues = 0, cachees = 0, baseLocale = 0, precedente = null;
  lignes.forEach((l, i) => {
    const titre = l.match(/^#(\d+) \[([^\]]+)\] (.+)$/);
    if (titre) { etapes.set(titre[1], `[${titre[2]}] ${titre[3].trim()}`); reconnues++; }
    const classique = l.match(/^Step \d+\/\d+ : (.+)$/);
    if (classique) { precedente = classique[1].trim(); reconnues++; }
    const cache = l.match(/^#(\d+) CACHED\s*$/);
    // L'image de BASE présente sur le poste s'affiche aussi CACHED, même sous --no-cache : ce n'est pas
    // une étape de construction réutilisée. Le mode construction la fait vérifier au registre (--pull).
    if (cache && /^\[[^\]]+\] FROM /.test(etapes.get(cache[1]) || '')) { baseLocale++; return; }
    if (cache) {
      cachees++;
      findings.push({ sev: 'bloquant', regle: 'C1', msg: `C1 — étape réutilisée du cache du poste : ${etapes.get(cache[1]) || '#' + cache[1]} (#${cache[1]} CACHED) — le scan de cette image ne dit pas ce que la chaîne construira ; reconstruire avec docker build --no-cache`, where: `${ou}:${i + 1}` });
    }
    if (/^\s*---> Using cache\s*$/.test(l)) {
      cachees++;
      findings.push({ sev: 'bloquant', regle: 'C1', msg: `C1 — étape réutilisée du cache du poste : ${precedente || '(étape inconnue)'} (---> Using cache) — le scan de cette image ne dit pas ce que la chaîne construira ; reconstruire avec docker build --no-cache`, where: `${ou}:${i + 1}` });
    }
  });
  if (baseLocale) nonJuge.push(`C1 : ${baseLocale} image de base prise sur le poste (FROM … CACHED) — sa fraîcheur n'est pas jugée sur un journal ; le mode construction la vérifie au registre (docker build --pull)`);
  return { reconnues, cachees };
}

// ---- C2 : le rapport de trivy porte-t-il une vulnérabilité HIGH ou CRITICAL ? -----------------
function c2(rapport, ou) {
  let vues = 0;
  for (const res of rapport.Results || []) {
    for (const v of res.Vulnerabilities || []) {
      if (!['HIGH', 'CRITICAL'].includes(String(v.Severity).toUpperCase())) continue;
      vues++;
      findings.push({ sev: 'bloquant', regle: 'C2', msg: `C2 — ${v.Severity} ${v.VulnerabilityID} : ${v.PkgName} ${v.InstalledVersion} installée`
        + (v.FixedVersion ? `, corrigée en ${v.FixedVersion}` : ', sans version corrigée publiée') + ` (${res.Class || res.Type || 'couche ?'}, ${res.Target || 'cible ?'})`, where: ou });
    }
  }
  return vues;
}

const extra = { mode: null };
if (/\.(log|txt)$/i.test(cible)) {
  extra.mode = 'journal';
  const r = c1(fs.readFileSync(cible, 'utf8'), base);
  if (!r.reconnues) skip('journal sans étape de construction reconnue (BuildKit « #N [étape] », ou « Step n/m : ») : rien à juger', extra);
  nonJuge.push('C2 : sans rapport de scan ni image, les vulnérabilités ne sont pas jugées — donner le Dockerfile, ou le rapport de trivy avec --journal');
  extra.etapes_reconnues = r.reconnues; extra.etapes_du_cache = r.cachees;
} else if (/\.json$/i.test(cible)) {
  extra.mode = 'rapport';
  let rap = null;
  try { rap = JSON.parse(fs.readFileSync(cible, 'utf8')); } catch { /* dit ci-dessous */ }
  if (!rap || !Array.isArray(rap.Results)) skip('rapport illisible : un JSON de trivy (champ Results) est attendu', extra);
  extra.image = rap.ArtifactName || null;
  extra.vulnerabilites_hautes = c2(rap, base);
  if (journalArg) { const r = c1(fs.readFileSync(journalArg, 'utf8'), path.basename(journalArg)); extra.etapes_du_cache = r.cachees; if (!r.reconnues) nonJuge.push('C1 : journal fourni sans étape de construction reconnue — non jugée'); }
  else nonJuge.push('C1 NON jouée : aucun journal de construction fourni (--journal) — rien ne dit que l image scannée n est pas issue du cache du poste');
} else {
  // ---- la chaîne entière : docker build --no-cache, puis trivy image ----------------------------
  extra.mode = 'construction';
  const dockerfile = fs.statSync(cible).isDirectory() ? path.join(cible, 'Dockerfile') : cible;
  if (!fs.existsSync(dockerfile) || !/(^|[\\/.])Dockerfile[^\\/]*$|\.dockerfile$/i.test(dockerfile)) skip('ni journal (.log, .txt), ni rapport de trivy (.json), ni Dockerfile : rien à juger', extra);
  const contexte = path.dirname(path.resolve(dockerfile));
  const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', timeout: 60000 });
  if (docker.error) skip('docker introuvable sur ce poste (PATH) : image non construite, C1 et C2 non jouées', extra);
  // Le client docker répond même quand son démon est arrêté : seule une version de SERVEUR lue prouve le démon.
  if (docker.status !== 0 || !String(docker.stdout || '').trim()) skip('démon docker injoignable (' + (String(docker.stderr || '').trim().split('\n')[0].slice(0, 140) || 'aucune version de serveur') + ') : image non construite, C1 et C2 non jouées', extra);
  const trivy = spawnSync('trivy', ['--version'], { encoding: 'utf8', timeout: 60000 });
  if (trivy.error || trivy.status !== 0) skip('trivy introuvable sur ce poste (PATH) : image non scannée, C1 et C2 non jouées — installer trivy', extra);
  const tag = 'qo-scan-' + crypto.createHash('sha256').update(path.resolve(dockerfile) + Date.now()).digest('hex').slice(0, 12);
  // --no-cache : aucune étape reprise du cache du poste ; --pull : l'image de base revérifiée au registre,
  // comme sur l'agent neuf d'une chaîne — sans elle, une base ancienne du poste passerait pour fraîche.
  const b = spawnSync('docker', ['build', '--no-cache', '--pull', '--progress=plain', '-t', tag, '-f', path.resolve(dockerfile), contexte], { encoding: 'utf8', timeout: 1500000, maxBuffer: 64 * 1024 * 1024 });
  const journal = String(b.stderr || '') + String(b.stdout || '');
  const jPath = path.join(os.tmpdir(), tag + '.build.log');
  try { fs.writeFileSync(jPath, journal, 'utf8'); } catch { /* le journal reste dans la sortie */ }
  extra.journal = jPath; extra.image = tag;
  if (b.status !== 0) skip('construction de l image en échec (docker build --no-cache) : ' + journal.trim().split('\n').slice(-1)[0].slice(0, 160), extra);
  const r = c1(journal, path.basename(jPath));
  extra.etapes_du_cache = r.cachees;
  const t = spawnSync('trivy', ['image', '--severity', 'HIGH,CRITICAL', '--exit-code', '1', '--format', 'json', '--quiet', tag], { encoding: 'utf8', timeout: 1500000, maxBuffer: 64 * 1024 * 1024 });
  spawnSync('docker', ['rmi', '-f', tag], { encoding: 'utf8', timeout: 120000 });
  let rap = null; try { rap = JSON.parse(t.stdout); } catch { /* dit ci-dessous */ }
  if (!rap || ![0, 1].includes(t.status)) skip('trivy n a pas rendu de rapport (' + String(t.stderr || '').trim().split('\n').slice(-1)[0].slice(0, 160) + ') : C2 non jouée', extra);
  extra.vulnerabilites_hautes = c2(rap, tag);
}

if (findings.some((f) => f.sev === 'bloquant')) out('FAIL', findings, [...nonJuge, ...LIMITES], 1, extra);
findings.push({ sev: 'info', msg: `conforme (${extra.mode}) : `
  + [extra.etapes_du_cache === 0 ? 'aucune couche du cache du poste (C1)' : null, typeof extra.vulnerabilites_hautes === 'number' ? 'aucune vulnérabilité HIGH ou CRITICAL (C2)' : null].filter(Boolean).join(', '), where: base });
out('PASS', findings, [...nonJuge, ...LIMITES], 0, extra);
