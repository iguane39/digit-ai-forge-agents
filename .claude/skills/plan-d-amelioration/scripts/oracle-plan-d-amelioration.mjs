#!/usr/bin/env node
// oracle-plan-d-amelioration — LE VERBE JUGER du skill plan-d-amelioration (TF-1234, 12/10/2026).
//
// Joue le contrat de sortie d'un plan d'amélioration post-audit sur son FICHIER DE DONNÉES
// (plan-d-amelioration@1.0.0), jamais sur sa page : la page est une vue, la donnée fait foi.
// Règles PA1-PA14 (détail : references/methode.md, section « Contrat de sortie ») :
//   PA1 dix champs par fiche, identifiant AM-<DOMAINE>-NN, domaine de la base, unicité
//   PA2 constat ET cible sourcés            PA3 chaque chiffre a un statut (mesuré exige commande et sortie)
//   PA4 zéro doublon avec l'audit           PA5 chaque domaine : une fiche ou une ligne motivée
//   PA6 plans existants rattachés           PA7 table de jonction présente, renvois résolus
//   PA8 horizon, rang unique, dix décisions fermées
//   PA9 aucun effort en jours               PA10 empreinte de l'archive inchangée (si déclarée)
//   PA11 statut vis-à-vis de l'existant     PA12 intention validée, test rétro écrit
//   PA13 sans instance joignable : plan de mesure, aucun chiffre de performance « mesuré »
//   PA14 les cinq questions d'ouverture répondues ou à défaut déclaré
//
// Usage : node oracle-plan-d-amelioration.mjs <plan.json> [--actions <remediation-actions.yaml>]
//         [--controles <controles-evalues.json>]
// Sortie : contrat JSON commun de quality-oracles {oracle, domaine, artefact, verdict, findings[],
// non_juge[]} ; exit 0 PASS, 1 FAIL, 2 SKIP (artefact illisible ou qui n'est pas un plan).

import fs from 'node:fs';
import path from 'node:path';
import { CONTRAT, chargerAudit, juger } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const positionnels = args.filter((a, i) => !a.startsWith('--') && !['--actions', '--controles'].includes(args[i - 1]));
const fichier = positionnels[0];

const NON_JUGE_FIXE = [
  'la PERTINENCE d une amélioration, la justesse d un gain ou d une cible : l oracle vérifie que chaque fiche porte ses champs, ses sources et ses statuts, il ne juge pas le fond (→ contre-expertise, revue humaine)',
  'la vérité d une source citée (fichier et ligne existants, mesure rejouable) : la source est exigée, non rouverte',
  'la règle « une remédiation de gravité maximale précède toute amélioration du même composant » : le composant n est pas une donnée du contrat',
  'les oracles de la page et du document (check_html.py, render_page.py, oracle-filtres-tableau, check_markdown.py, oracle-livrable-conseil) : critère 11 du contrat, joués à part sur les vues',
  'l extracteur du fichier d actions YAML est borné (audit_ref et six clés scalaires par action) : ancre, alias ou scalaire multiligne sur ces clés non compris',
];

function sortir(verdict, findings, nonJuge, extra = {}) {
  const out = {
    oracle: 'oracle-plan-d-amelioration',
    domaine: "Plan d'amélioration post-audit (contrat de sortie, fichier de données)",
    artefact: fichier || null,
    verdict,
    findings,
    non_juge: [...nonJuge, ...NON_JUGE_FIXE],
    ...extra,
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2);
}

if (!fichier) sortir('SKIP', [], ['aucun artefact passé : usage node oracle-plan-d-amelioration.mjs <plan.json>']);
let plan;
try { plan = JSON.parse(fs.readFileSync(fichier, 'utf8')); }
catch (e) { sortir('SKIP', [], [`artefact illisible comme JSON (${path.basename(fichier)}) : ${e.message}`]); }
if (!plan || typeof plan !== 'object' || !Array.isArray(plan.fiches) || !String(plan.contrat || '').startsWith('plan-d-amelioration@'))
  sortir('SKIP', [], [`${path.basename(fichier)} n est pas un plan d amélioration (champ contrat « ${CONTRAT} » et liste fiches attendus) — non jugeable, jamais PASS`]);

const audit = chargerAudit(plan, fichier, { actions: opt('--actions'), controles: opt('--controles') });
const findings = audit.erreurs.map((e) => ({ regle: 'PA4', localisation: 'audit', msg: `PA4 audit — ${e}` }));
if (audit.actions && audit.controles && audit.actions.audit_ref !== audit.controles.audit_ref)
  findings.push({ regle: 'PA4', localisation: 'audit', msg: `PA4 audit — le fichier d actions (${audit.actions.audit_ref}) et la liste des contrôles évalués (${audit.controles.audit_ref}) ne parlent pas du même audit` });
if (plan.audit?.audit_ref && audit.actions && plan.audit.audit_ref !== audit.actions.audit_ref)
  findings.push({ regle: 'PA4', localisation: 'audit.audit_ref', msg: `PA4 audit.audit_ref — le plan se dit joint à ${plan.audit.audit_ref}, le fichier d actions porte ${audit.actions.audit_ref}` });

const r = juger(plan, audit);
findings.push(...r.findings);
sortir(findings.length ? 'FAIL' : 'PASS', findings, r.nonJuge, {
  mesure: { fiches: plan.fiches.length, jonction: r.jonction.table.length, doublons: r.jonction.doublons.length, renvois_orphelins: r.jonction.orphelins.length },
});
