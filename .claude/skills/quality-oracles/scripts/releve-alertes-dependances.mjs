#!/usr/bin/env node
// releve-alertes-dependances — parmi les alertes de dépendances qu'un hébergeur signale sur un dépôt, distingue celles qui visent des
// fixtures VOLONTAIREMENT vulnérables (déclarées) de celles qui visent des dépendances RÉELLES (TF-2539, 14/11/2026).
//
// LE FAIT. Le 14/11/2026, l'hébergeur a signalé 35 alertes sur la branche par défaut de ce dépôt, à chaque envoi, et aucun contrôle ne les
// lisait. Relevées en lecture (`gh api repos/<dépôt>/dependabot/alerts`), les 35 visaient toutes les cinq fixtures rouges de l'oracle SCA :
// des versions épinglées vulnérables exprès. Sans liste, rien ne séparait ces alertes de celles qu'il faut traiter ; avec, une alerte
// qui ne vise aucune fixture déclarée est une dépendance réelle, à mettre à jour sous recette verte.
//
// Usage : node scripts/releve-alertes-dependances.mjs (--alertes <fichier> | --depot <propriétaire/nom>) [--declaration <fichier>] [--json]
//   --alertes     une sortie de `gh api repos/<dépôt>/dependabot/alerts --paginate` (un tableau JSON, des tableaux concaténés, ou un objet par ligne)
//   --depot       lit les alertes ouvertes avec `gh api` (lecture seule) ; `gh` absent ou refusé : exit 2, jamais un relevé vide
//   --declaration la liste des fixtures déclarées (défaut : references/fixtures-vulnerables.json de ce skill)
// Exit : 0 aucune dépendance réelle en alerte · 1 au moins une alerte hors fixture déclarée · 2 source ou déclaration illisible ou invalide
// (un relevé qui n'a pas pu lire ne dit jamais « zéro »). Ce n'est pas un oracle de livrable : il n'a pas d'entrée au registre, la recette le
// joue dans les deux sens.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const valeur = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const JSON_SEUL = args.includes('--json');
const fichierAlertes = valeur('--alertes');
const depot = valeur('--depot');
const declaration = valeur('--declaration') || path.join(ICI, '..', 'references', 'fixtures-vulnerables.json');

const sortir = (code, objet, texte) => {
  process.stdout.write(JSON_SEUL ? JSON.stringify(objet, null, 1) + '\n' : texte + '\n');
  process.exit(code);
};
const erreur = (motif) => sortir(2, { outil: 'releve-alertes-dependances', verdict: 'INCONCLUSIF', motif }, `INCONCLUSIF — ${motif}`);

if (Boolean(fichierAlertes) === Boolean(depot)) erreur('une source d\'alertes, et une seule : --alertes <fichier> OU --depot <propriétaire/nom>');

// 1. La liste des fixtures déclarées : chaque entrée porte chemin, date (AAAA-MM-JJ) et motif.
let fixtures;
try {
  fixtures = JSON.parse(fs.readFileSync(declaration, 'utf8').replace(/^﻿/, '')).fixtures;
} catch (e) { erreur(`déclaration des fixtures illisible (${declaration}) : ${e.message}`); }
if (!Array.isArray(fixtures)) erreur(`déclaration des fixtures sans liste \`fixtures\` (${declaration})`);
const incompletes = fixtures.map((f, i) => [f, i]).filter(([f]) => !f || typeof f.chemin !== 'string' || !f.chemin.trim()
  || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || '')) || typeof f.motif !== 'string' || !f.motif.trim());
if (incompletes.length) erreur(`déclaration refusée : l'entrée ${incompletes.map(([, i]) => i + 1).join(', ')} n'a pas ses trois champs (chemin, date AAAA-MM-JJ, motif) — une fixture déclarée sans motif ne se distingue de rien`);
const normaliser = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
const declarees = fixtures.map((f) => normaliser(f.chemin));
const fixtureDe = (manifeste) => {
  const m = normaliser(manifeste);
  return declarees.find((d) => m === d || m.startsWith(d + '/')) ?? null;      // frontière de dossier : `sca-red-bis` n'est pas `sca-red`
};

// 2. Les alertes : un tableau, des tableaux concaténés (`gh --paginate`), ou un objet par ligne.
let texte;
if (fichierAlertes) {
  try { texte = fs.readFileSync(fichierAlertes, 'utf8').replace(/^﻿/, ''); }
  catch (e) { erreur(`alertes illisibles (${fichierAlertes}) : ${e.message}`); }
} else {
  const r = spawnSync('gh', ['api', `repos/${depot}/dependabot/alerts?state=open&per_page=100`, '--paginate', '--jq', '.[]'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) erreur(`\`gh api\` n'a pas rendu les alertes de ${depot} (${r.error ? r.error.message : 'exit ' + r.status + ' : ' + String(r.stderr || '').trim().slice(0, 200)})`);
  texte = r.stdout;
}
const lire = (t) => {
  for (const essai of [t, t.replace(/\]\s*\[/g, ',')]) { try { const v = JSON.parse(essai); return Array.isArray(v) ? v : [v]; } catch { /* essai suivant */ } }
  return t.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
};
let alertes;
try { alertes = lire(texte); } catch (e) { erreur(`alertes non lisibles comme JSON : ${e.message}`); }
// `state` n'est présent que sur une sortie brute de l'API : une alerte fermée ou rejetée n'est plus à traiter.
alertes = alertes.filter((a) => !a.state || a.state === 'open');

// 3. La distinction.
const lignes = alertes.map((a) => ({
  numero: a.number ?? null,
  severite: a.security_vulnerability?.severity ?? a.security_advisory?.severity ?? 'inconnue',
  paquet: a.dependency?.package?.name ?? '?',
  ecosysteme: a.dependency?.package?.ecosystem ?? '?',
  manifeste: a.dependency?.manifest_path ?? '?',
  corrige_en: a.security_vulnerability?.first_patched_version?.identifier ?? null,
  avis: a.security_advisory?.ghsa_id ?? null,
  fixture: a.dependency?.manifest_path ? fixtureDe(a.dependency.manifest_path) : null,
}));
const reelles = lignes.filter((l) => !l.fixture);
const parFixture = {};
for (const l of lignes.filter((x) => x.fixture)) parFixture[l.fixture] = (parFixture[l.fixture] || 0) + 1;
const parSeverite = (ls) => Object.entries(ls.reduce((acc, l) => ({ ...acc, [l.severite]: (acc[l.severite] || 0) + 1 }), {})).map(([s, n]) => `${n} ${s}`).join(', ') || 'aucune';

const resume = {
  outil: 'releve-alertes-dependances', verdict: reelles.length ? 'FAIL' : 'PASS',
  source: fichierAlertes || `gh api repos/${depot}/dependabot/alerts`, declaration,
  alertes_ouvertes: lignes.length, sur_fixtures_declarees: lignes.length - reelles.length, dependances_reelles: reelles.length,
  par_fixture: parFixture, reelles,
};
const sortie = [
  `${lignes.length} alerte(s) ouverte(s) (source : ${resume.source}) — ${lignes.length - reelles.length} sur des fixtures volontairement vulnérables déclarées, ${reelles.length} sur des dépendances réelles`,
  ...Object.entries(parFixture).map(([f, n]) => `  fixture déclarée ${f} : ${n} alerte(s)`),
  ...reelles.map((l) => `  RÉELLE n° ${l.numero ?? '?'} : ${l.paquet} (${l.ecosysteme}, ${l.severite}) dans ${l.manifeste}${l.corrige_en ? ', corrigée en ' + l.corrige_en : ''}${l.avis ? ' [' + l.avis + ']' : ''}`),
  reelles.length
    ? `FAIL — ${reelles.length} dépendance(s) réelle(s) en alerte (${parSeverite(reelles)}) : à mettre à jour sous recette verte, ou à déclarer si c'est une fixture`
    : `PASS — aucune dépendance réelle en alerte ; les ${lignes.length - reelles.length} alerte(s) visent des fixtures déclarées (${parSeverite(lignes)}), qui ne se corrigent pas`,
].join('\n');
sortir(reelles.length ? 1 : 0, resume, sortie);
