#!/usr/bin/env node
// joindre — LE VERBE JOINDRE du skill plan-d-amelioration (TF-1234, 12/10/2026).
//
// Lit le fichier des améliorations (plan-d-amelioration@1.0.0) et les deux fichiers d'un audit
// forge-audit (remediation-actions.yaml, contrat 1.1.0 ; <rapport>.controles-evalues.json,
// contrat 1.0.0), puis :
//   1. refuse toute fiche rattachable à un contrôle ÉVALUÉ ou à un constat de l'audit (zéro doublon) ;
//   2. résout les renvois AM et REM (dépendances des fiches, table de jonction) ;
//   3. rend la table de jonction consolidée : celle que le plan déclare, plus les liens
//      « conditionne » que les dépendances REM des fiches impliquent ; et les remédiations sans lien.
// Avec --ecrire, la table consolidée remplace le champ `jonction` du plan (le reste du fichier est
// réécrit à l'identique, indentation de deux espaces).
//
// Usage : node joindre.mjs <plan.json> [--actions <yaml|json>] [--controles <json>] [--ecrire]
// Exit 0 jonction propre · 1 doublon ou renvoi orphelin (rien n'est écrit) · 2 entrée illisible.
// Limite déclarée : un seul adaptateur, forge-audit (étude du 19/09/2026, test rétro).

import fs from 'node:fs';
import { chargerAudit, joindre } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const fichier = args.find((a, i) => !a.startsWith('--') && !['--actions', '--controles'].includes(args[i - 1]));
if (!fichier) { console.error('usage : node joindre.mjs <plan.json> [--actions <fichier>] [--controles <fichier>] [--ecrire]'); process.exit(2); }

let plan;
try { plan = JSON.parse(fs.readFileSync(fichier, 'utf8')); }
catch (e) { console.error(`plan illisible : ${e.message}`); process.exit(2); }
const audit = chargerAudit(plan, fichier, { actions: opt('--actions'), controles: opt('--controles') });
if (audit.erreurs.length) { console.error(audit.erreurs.join('\n')); process.exit(2); }
if (!audit.actions && !audit.controles) { console.error("aucun fichier de l'audit : passer --actions et --controles, ou les déclarer dans plan.audit"); process.exit(2); }
if (audit.actions && audit.controles && audit.actions.audit_ref !== audit.controles.audit_ref) {
  console.error(`les deux fichiers ne parlent pas du même audit : ${audit.actions.audit_ref} ≠ ${audit.controles.audit_ref}`);
  process.exit(1);
}

const j = joindre(plan, audit);
const rapport = {
  audit_ref: audit.actions?.audit_ref ?? audit.controles?.audit_ref ?? null,
  doublons: j.doublons,
  renvois_orphelins: j.orphelins,
  jonction: j.table,
  remediations_sans_lien: j.remSansLien,
};
console.log(JSON.stringify(rapport, null, 2));
if (j.doublons.length || j.orphelins.length) {
  console.error(`REFUS : ${j.doublons.length} doublon(s), ${j.orphelins.length} renvoi(s) orphelin(s) — aucune écriture`);
  process.exit(1);
}
if (args.includes('--ecrire')) {
  plan.jonction = j.table.map(({ origine, ...x }) => x);
  fs.writeFileSync(fichier, JSON.stringify(plan, null, 2) + '\n');
  console.error(`jonction écrite dans ${fichier} : ${plan.jonction.length} lien(s)`);
}
