#!/usr/bin/env node
// oracle-angles-vides — Domaine « Angle d'expertise déclaré vide (dette de couverture) ».
//
// DÉFAUT PAYÉ (TF-0717, Produit-05) : un angle déclaré vide le 20/08/2026 — « fiche expert
// MIGRATION DE PLATEFORME BROWNFIELD », nommée d'avance dans une revue — n'a jamais été écrit
// dans la file des candidats de la forge. ONZE JOURS PLUS TARD, le client trouvait exactement
// le défaut que cet angle aurait attrapé : un programme de migration qui ne prévoit nulle part
// de prévenir les utilisateurs. Une contre-expertise complète et quatre portes automatiques
// l'avaient laissé passer. « Un angle vide déclaré et non comblé n'est pas neutre. »
//
// CE QUE CET ORACLE REND MÉCANIQUE : la dette est NOMMÉE, DATÉE et ÉCHUE dans le registre des
// experts, et elle bloque tant qu'elle n'est ni comblée ni explicitement écartée.
//
// CHECKLIST CANONIQUE (v1.0.0) — section « Angles déclarés vides — dettes nommées » du registre
//   G1 — chaque ligne porte ses six colonnes renseignées (angle, déclaré le, produit, échéance,
//        statut, comblé par / raison).
//   G2 — statut dans le vocabulaire fermé : ouvert · comblé · écarté.
//   G3 — « comblé » : l'artefact cité EXISTE (test d'existence exécuté, jamais déclaré).
//   G4 — « ouvert » au-delà de son échéance : ÉCHEC — un angle déclaré vide et non comblé ne
//        laisse pas clore ; il se comble, se ré-échéance explicitement, ou s'écarte avec raison.
//   G5 — « écarté » : la raison est écrite, jamais implicite.
//
// Usage : node oracle-angles-vides.mjs <registre-experts.md> [--date AAAA-MM-JJ]
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const ORACLE = 'oracle-angles-vides', DOM = 'Angle d\'expertise déclaré vide (dette de couverture)';
const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--date');
const dArg = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;
const NJ = [
  'la PERTINENCE de l\'angle déclaré (seule sa tenue dans le temps est jugée)',
  'les angles vides jamais écrits dans le registre — l\'oracle juge la dette déclarée, il ne la découvre pas',
  'la qualité de la fiche qui comble l\'angle (→ oracle-judge, admission experts-forge)'
];
const out = (verdict, findings, nj, code) => {
  process.stdout.write(JSON.stringify({ oracle: ORACLE, domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj }));
  process.exit(code);
};
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
const texte = fs.readFileSync(file, 'utf8');
const base = path.basename(file), dir = path.dirname(path.resolve(file));

// Date de référence : --date pour un rejeu déterministe (fixtures), sinon le jour même.
const AUJ = dArg && /^\d{4}-\d{2}-\d{2}$/.test(dArg) ? dArg : new Date().toISOString().slice(0, 10);
const isoDe = s => {                                   // « 20/08/2026 » → « 2026-08-20 »
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()) ? String(s).trim() : null);
};

const lignes = texte.split('\n');
const iSection = lignes.findIndex(l => /^#{1,4}\s+Angles\s+d[ée]clar[ée]s\s+vides/i.test(l));
if (iSection < 0) out('SKIP', [], [...NJ, 'aucune section « Angles déclarés vides — dettes nommées » dans ce fichier'], 2);

// Lignes de table de la section, jusqu'au titre suivant.
const rows = [];
for (let i = iSection + 1; i < lignes.length; i++) {
  const l = lignes[i];
  if (/^#{1,4}\s/.test(l)) break;
  if (!/^\s*\|.*\|\s*$/.test(l)) continue;
  if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
  const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  rows.push({ cells, ligne: i + 1 });
}
if (rows.length < 2) out('SKIP', [], [...NJ, 'section présente mais sans ligne de dette exploitable'], 2);

const entete = rows[0].cells.map(c => c.toLowerCase());
const col = rx => entete.findIndex(c => rx.test(c));
const iAngle = col(/angle/), iDecl = col(/d[ée]clar/), iEch = col(/[ée]ch[ée]ance/), iSta = col(/statut/), iRes = col(/combl|raison|r[ée]solution/);
if ([iAngle, iDecl, iEch, iSta, iRes].some(x => x < 0)) {
  out('FAIL', [{ sev: 'bloquant', msg: 'G1 — en-tête incomplet : colonnes attendues Angle · Déclaré le · Produit · Échéance · Statut · Comblé par / raison', where: base + ':' + rows[0].ligne }], NJ, 1);
}

const STATUTS = ['ouvert', 'comblé', 'comble', 'écarté', 'ecarte'];
const findings = []; let verifies = 0;
for (const r of rows.slice(1)) {
  const ou = base + ':' + r.ligne;
  const c = r.cells, angle = c[iAngle] || '(sans nom)';
  let ok = true;
  if (c.length < entete.length || c.slice(0, entete.length).some(x => !String(x).replace(/[*_`—-]/g, '').trim())) {
    findings.push({ sev: 'bloquant', msg: `G1 — dette « ${angle} » : au moins une colonne vide — une dette non renseignée n'est pas une dette, c'est un oubli`, where: ou }); ok = false;
  }
  const statut = String(c[iSta] || '').replace(/[*_`]/g, '').trim().toLowerCase();
  if (!STATUTS.includes(statut)) {
    findings.push({ sev: 'bloquant', msg: `G2 — dette « ${angle} » : statut « ${c[iSta]} » hors vocabulaire fermé (ouvert · comblé · écarté)`, where: ou }); ok = false;
  }
  if (statut === 'comblé' || statut === 'comble') {
    const cible = (String(c[iRes] || '').match(/[\w./\\-]+\.(?:md|json|jsonl)/) || [null])[0];
    if (!cible) {
      findings.push({ sev: 'bloquant', msg: `G3 — dette « ${angle} » déclarée comblée sans artefact cité : une dette se ferme sur une preuve, pas sur une affirmation`, where: ou }); ok = false;
    } else {
      const candidats = [path.resolve(dir, cible), path.resolve(dir, '..', cible)];
      if (!candidats.some(p => fs.existsSync(p))) {
        findings.push({ sev: 'bloquant', msg: `G3 — dette « ${angle} » déclarée comblée par « ${cible} », qui N'EXISTE PAS (test d'existence exécuté)`, where: ou }); ok = false;
      }
    }
  }
  if (statut === 'ouvert') {
    const ech = isoDe(c[iEch]);
    if (!ech) { findings.push({ sev: 'bloquant', msg: `G1 — dette ouverte « ${angle} » : échéance illisible « ${c[iEch]} » (attendu JJ/MM/AAAA)`, where: ou }); ok = false; }
    else if (ech < AUJ) {
      findings.push({ sev: 'bloquant', msg: `G4 — angle « ${angle} » déclaré vide le ${c[iDecl]} et TOUJOURS OUVERT au-delà de son échéance (${c[iEch]}, date de référence ${AUJ}) : un angle vide non comblé ne laisse pas clore — le combler, le ré-échéancer explicitement, ou l'écarter avec sa raison`, where: ou }); ok = false;
    }
  }
  if (statut === 'écarté' || statut === 'ecarte') {
    if (!/\S{10,}/.test(String(c[iRes] || '').replace(/[*_`—-]/g, ' '))) {
      findings.push({ sev: 'bloquant', msg: `G5 — dette « ${angle} » écartée sans raison écrite : un angle qu'on cesse de regarder se justifie`, where: ou }); ok = false;
    }
  }
  if (ok) verifies++;
}

if (findings.length) out('FAIL', findings, NJ, 1);
out('PASS', [{ sev: 'info', msg: `${verifies}/${rows.length - 1} dette(s) d'angle vide tenue(s) — G1 complétude, G2 vocabulaire, G3 artefact existant, G4 échéance, G5 raison d'écartement (date de référence ${AUJ})`, where: base }], NJ, 0);
