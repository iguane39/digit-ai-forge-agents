#!/usr/bin/env node
// oracle-terraform — Domaine « Configuration d'infrastructure (Terraform) » (TF-1492, 01/10/2026).
// Scaffoldé par write-an-oracle, puis durci.
//
// LE FAIT (lot Produit-03 - RETOURS - 20260929a, RA-48). Le fichier de variables de production
// portait budget_start_date = "2026-08-01T00:00:00Z", écrit pour une mise en production prévue le
// 26/08. Appliqué le 29/09, il a été refusé (400, « Start date for monthly time grain should not be
// prior to current month ») : 10 ressources créées sur 11, le budget absent. La valeur était juste
// le jour où elle a été écrite ; rien ne l'a rejugée contre la date d'application. Même défaut en
// juillet sur la qualification, et mesuré chez 3 produits voisins sur 4. Aucun oracle du registre ne
// jugeait une configuration d'infrastructure, et les contrôles de la chaîne (fmt -check, validate,
// plan relu) ne jugent pas une valeur contre la date où elle s'appliquera. Deuxième fait du même
// tour : la première écriture du correctif rendait fmt -check à 3, un commentaire ayant coupé le
// groupe d'alignement ; seul un passage local du contrôle standard l'a arrêtée.
//
// DEUX ÉTAPES, les standards avant la maison (R3) :
//   standard  T1 `terraform fmt -check` (le fichier, ou -recursive sur un dossier), localisé à la
//             première ligne que fmt réécrirait ; T2 `terraform validate -json` sur le dossier de
//             configuration, SANS `terraform init` : l'oracle n'écrit rien dans la cible et ne
//             télécharge rien. Fournisseur ou module non installé : T2 non jouée, et c'est dit.
//             Terraform absent du poste : l'étape rend SKIP, son motif à l'appui ;
//   maison    D1 toute valeur datée écrite en dur (une chaîne qui EST une date ISO 8601, hors des
//             blocs tags et labels) dont le MOIS précède le mois d'application est refusée — la
//             plateforme refuse une date de début antérieure au mois courant. Banc du lot, joué le
//             29/09 : août au 29/09 refusée, septembre au 29 et au 30/09 acceptée, septembre au 01/10
//             refusée ; étalonné sur 4 faits d'Azure (juin refusé en juillet, juin et juillet acceptés
//             à leur mois). Date d'application : `--date-application AAAA-MM-JJ`, sinon le jour du
//             poste. Le remède prescrit, joué au banc : la date calculée à la création,
//             formatdate("YYYY-MM-01'T'00:00:00'Z'", timestamp()) avec lifecycle { ignore_changes }.
//
// Usage : node oracle-terraform.mjs <fichier.tf|.tfvars|dossier> [--date-application AAAA-MM-JJ]
// Contrat JSON commun · exit 0 PASS / 1 FAIL / 2 SKIP · `etapes` porte le verdict de chaque étape,
// et tout SKIP, d'étape ou d'ensemble, porte son motif (TF-1447).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ecrivainDeContrat } from './lib/contrat.mjs';

const contratJSON = ecrivainDeContrat({ premier: true });
const args = process.argv.slice(2);
const iDate = args.indexOf('--date-application');
const dateArg = iDate >= 0 ? args[iDate + 1] : null;
const cible = args.find((a, i) => !a.startsWith('--') && !(iDate >= 0 && i === iDate + 1));
const DOM = "Configuration d'infrastructure (Terraform)";
const LIMITES = [
  'le plan et l application : l oracle ne contacte aucun fournisseur, ne lance jamais terraform init et n écrit rien dans la cible',
  'T2 sur une configuration dont les fournisseurs ou modules ne sont pas installés sur ce poste : non jouée, et dite',
  'D1 : une date écrite autrement qu en chaîne ISO (horodatage numérique, date dans un texte libre), celles des blocs tags et labels, et la règle propre à chaque ressource (une fin après le début, une planification à quelques minutes dans le futur) — seul le mois est jugé contre le mois d application',
  'les fichiers .tf.json et .tfvars.json',
];
const out = (verdict, findings, nonJuge, code, extra = {}) => {
  process.stdout.write(contratJSON({ oracle: 'oracle-terraform', domaine: DOM, artefact: cible || null, verdict, findings, non_juge: nonJuge, ...extra }));
  process.exit(code);
};
const skip = (motif, extra = {}) => out('SKIP', [], [motif, ...LIMITES], 2, { motif, ...extra });

if (!cible || !fs.existsSync(cible)) skip('fichier absent');
const estDossier = fs.statSync(cible).isDirectory();
if (!estDossier && !/\.(tf|tfvars)$/i.test(cible)) skip(`extension non gérée (${path.extname(cible) || 'aucune'}) : .tf, .tfvars, ou un dossier de configuration`);
if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) skip(`date d application illisible : ${dateArg} (attendu AAAA-MM-JJ)`);
const aujourdhui = new Date();
const dateApp = dateArg || [aujourdhui.getFullYear(), String(aujourdhui.getMonth() + 1).padStart(2, '0'), String(aujourdhui.getDate()).padStart(2, '0')].join('-');
const [anApp, moisApp] = dateApp.split('-').map(Number);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const ECARTES = new Set(['.terraform', '.git', 'node_modules']);
const fichiers = [];
const marcher = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!ECARTES.has(e.name)) marcher(p); }
    else if (/\.(tf|tfvars)$/i.test(e.name)) fichiers.push(p);
  }
};
if (estDossier) marcher(cible); else fichiers.push(cible);
const findings = [], nonJuge = [];
const rel = (p) => path.relative(estDossier ? cible : path.dirname(cible), p).split(path.sep).join('/') || path.basename(p);

// ---- étape standard : T1 terraform fmt -check, T2 terraform validate (jamais init) --------------
const etapes = {};
const tf = spawnSync('terraform', ['version', '-json'], { encoding: 'utf8', timeout: 30000 });
let versionTf = null;
if (tf.status === 0) { try { versionTf = JSON.parse(tf.stdout).terraform_version; } catch { versionTf = '?'; } }
if (!versionTf) {
  etapes.standard = { verdict: 'SKIP', motif: 'terraform introuvable sur ce poste (PATH) : fmt -check et validate non joués — installer Terraform' };
  nonJuge.push('T1 et T2 : ' + etapes.standard.motif);
} else {
  const avant = findings.length;
  // T1 — la forme canonique ; -diff localise la première ligne que fmt réécrirait.
  const fmt = spawnSync('terraform', ['fmt', '-check', '-list=true', '-diff', '-no-color', ...(estDossier ? ['-recursive'] : []), path.resolve(cible)],
    { encoding: 'utf8', timeout: 60000, cwd: estDossier ? cible : path.dirname(cible) });
  if (fmt.status === 3) {
    let fichier = null, ligne = 0;
    const premieres = new Map();
    for (const l of (fmt.stdout || '').split(/\r?\n/)) {
      const tete = l.match(/^--- old\/(.+)$/);
      if (tete) { fichier = tete[1]; continue; }
      const bloc = l.match(/^@@ -(\d+)/);
      if (bloc) { ligne = Number(bloc[1]) - 1; continue; }
      if (!fichier || l.startsWith('+++')) continue;
      if (l.startsWith(' ')) ligne++;
      else if (l.startsWith('-')) { ligne++; if (!premieres.has(fichier)) premieres.set(fichier, ligne); }
    }
    if (!premieres.size) for (const l of (fmt.stdout || '').split(/\r?\n/)) if (/\.(tf|tfvars)$/.test(l.trim())) premieres.set(l.trim(), 1);
    for (const [f, n] of premieres) findings.push({ sev: 'bloquant', regle: 'T1',
      msg: `T1 — terraform fmt -check : ${path.basename(f)} n'est pas au format canonique (première ligne réécrite : ${n}) — la chaîne l'arrêterait avant le plan ; terraform fmt le corrige`,
      where: `${rel(path.resolve(estDossier ? cible : path.dirname(cible), f))}:${n}` });
  } else if (fmt.status !== 0) {
    const err = String(fmt.stderr || '').replace(/\x1b\[[0-9;]*m/g, '');
    const m = err.match(/on (\S+) line (\d+)/);
    findings.push({ sev: 'bloquant', regle: 'T1', msg: `T1 — terraform fmt ne lit pas la configuration : ${(err.match(/Error: (.+)/) || [null, err.trim().split('\n')[0]])[1].slice(0, 160)}`,
      where: m ? `${rel(path.resolve(estDossier ? cible : path.dirname(cible), m[1]))}:${m[2]}` : rel(path.resolve(cible)) });
  }
  // T2 — validate sur le dossier de configuration, sans init : rien n'est écrit dans la cible.
  if (!estDossier && /\.tfvars$/i.test(cible)) nonJuge.push('T2 sans objet pour un fichier de variables seul : terraform validate ne lit pas les .tfvars');
  else {
    const dossier = estDossier ? cible : path.dirname(cible);
    const val = spawnSync('terraform', ['validate', '-json', '-no-color'], { encoding: 'utf8', timeout: 120000, cwd: dossier });
    let j = null; try { j = JSON.parse(val.stdout); } catch { /* dit ci-dessous */ }
    if (!j) nonJuge.push('T2 non jouée : sortie de terraform validate illisible — ' + String(val.stderr || '').trim().split('\n')[0].slice(0, 160));
    else {
      const diags = j.diagnostics || [];
      // Ce que validate dit du POSTE et non de la configuration : fournisseurs ou modules absents ou
      // abîmés, version de Terraform hors de required_version. Mesuré le 01/10/2026 sur les 33
      // dossiers Terraform du poste : les seuls constats T2 étaient de cette sorte — T2 n'est alors
      // pas jouée, et le motif est dit, plutôt qu'un faux défaut imputé à la configuration.
      const NON_INIT = /Missing required provider|Module not installed|Required plugins are not installed|missing or corrupted provider plugins|there is no package for|Backend initialization required|Inconsistent dependency lock file|terraform init/i;
      const VERSION = /Unsupported Terraform Core version/i;
      const nonInit = diags.filter((d) => NON_INIT.test(`${d.summary} ${d.detail || ''}`));
      const version = diags.filter((d) => VERSION.test(d.summary || ''));
      if (version.length) nonJuge.push(`T2 non jouée : la configuration exige une autre version de Terraform que celle du poste (${versionTf}) — ${String(version[0].detail || '').split('\n')[0].slice(0, 140)}`);
      else if (nonInit.length) nonJuge.push(`T2 non jouée : ${String(nonInit[0].summary).split('\n')[0].slice(0, 100)} — la configuration n'est pas initialisée sur ce poste (terraform init), et l'oracle n'écrit rien dans la cible`);
      else for (const d of diags) {
        const ou = d.range ? `${rel(path.resolve(dossier, d.range.filename))}:${d.range.start.line}` : rel(dossier);
        findings.push({ sev: d.severity === 'error' ? 'bloquant' : 'warn', regle: 'T2', msg: `T2 — terraform validate : ${d.summary}${d.detail ? ' — ' + String(d.detail).split('\n')[0].slice(0, 160) : ''}`, where: ou });
      }
    }
  }
  etapes.standard = { verdict: findings.slice(avant).some((f) => f.sev === 'bloquant') ? 'FAIL' : 'PASS', terraform: versionTf };
}

// ---- étape maison : D1, une valeur datée écrite en dur jugée contre le mois d'application ------
const DATE = /^\s*"?([\w.-]+)"?\s*=\s*"(\d{4})-(\d{2})-(\d{2})((?:[T ][0-9:.]+)?(?:Z|[+-]\d{2}:?\d{2})?)"\s*(?:(?:#|\/\/).*)?$/;
let jugees = 0, horsTags = 0;
for (const f of fichiers) {
  const lignes = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const pile = [];
  lignes.forEach((l, i) => {
    const sansChaines = l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/(#|\/\/).*$/, '');
    const entete = /\{\s*$/.test(sansChaines) ? l.match(/^\s*([\w-]+)((?:\s+"[^"]*")*)\s*=?\s*\{\s*(?:(?:#|\/\/).*)?$/) : null;
    const ouvre = entete ? [null, entete[1] + (entete[2] ? ' ' + entete[2].trim() : '')] : null;
    const m = l.match(DATE);
    if (m && !pile.some((b) => /^(tags|labels)$/.test(b))) {
      jugees++;
      const [, cle, an, mois, jour, suite] = m;
      if (Number(an) * 12 + Number(mois) < anApp * 12 + moisApp) {
        const contexte = pile.length ? pile.join(' › ') + ' › ' : '';
        findings.push({ sev: 'bloquant', regle: 'D1',
          msg: `D1 — ${contexte}${cle} = "${an}-${mois}-${jour}${suite}" : ${MOIS[Number(mois) - 1]} ${an}, avant le mois d'application (${MOIS[moisApp - 1]} ${anApp}, application au ${dateApp}) — une date d'effet écrite en dur périme avant d'être appliquée, la plateforme la refuse ; la calculer à la création, formatdate("YYYY-MM-01'T'00:00:00'Z'", timestamp()) avec lifecycle { ignore_changes }`,
          where: `${rel(f)}:${i + 1}` });
      }
    } else if (m) horsTags++;
    if (ouvre) pile.push(ouvre[1]);
    const net = (sansChaines.match(/\{/g) || []).length - (sansChaines.match(/\}/g) || []).length;
    if (net < 0) for (let k = 0; k < -net; k++) pile.pop();
    else if (net > 0 && !ouvre) for (let k = 0; k < net; k++) pile.push('{');
  });
}
if (horsTags) nonJuge.push(`D1 : ${horsTags} valeur(s) datée(s) dans un bloc tags ou labels, informatives, non jugées`);
const d1 = findings.filter((f) => f.regle === 'D1');
etapes.maison = jugees
  ? { verdict: d1.length ? 'FAIL' : 'PASS', valeurs_jugees: jugees, date_application: dateApp }
  : { verdict: 'SKIP', motif: 'aucune valeur datée écrite en dur : rien à juger', date_application: dateApp };
if (!jugees) nonJuge.push('D1 : ' + etapes.maison.motif);

// ---- verdict d'ensemble ------------------------------------------------------------------------
const verdicts = Object.values(etapes).map((e) => e.verdict);
const extra = { etapes, fichiers: fichiers.length };
if (findings.some((f) => f.sev === 'bloquant')) out('FAIL', findings, [...nonJuge, ...LIMITES], 1, extra);
if (!verdicts.includes('PASS')) skip(Object.values(etapes).map((e) => e.motif).filter(Boolean).join(' ; '), extra);
findings.push({ sev: 'info', msg: `conforme : ${fichiers.length} fichier(s) — étape standard ${etapes.standard.verdict}${versionTf ? ' (Terraform ' + versionTf + ')' : ''}, étape maison ${etapes.maison.verdict}`
  + (jugees ? ` (D1 sur ${jugees} valeur(s) datée(s), application au ${dateApp})` : ''), where: path.basename(cible) });
out('PASS', findings, [...nonJuge, ...LIMITES], 0, extra);
