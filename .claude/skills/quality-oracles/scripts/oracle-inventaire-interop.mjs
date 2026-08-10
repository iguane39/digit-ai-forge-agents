#!/usr/bin/env node
// oracle-inventaire-interop — Domaine « Inventaire de connecteurs (interop) ».
// Vérifie un inventaire de connecteurs (.md, table) :
//   I1 la table porte les colonnes obligatoires : Sens, Moyen d'échange, Déclenchement, Statut ;
//   I2 chaque cellule obligatoire est renseignée (non vide, pas de placeholder « ? ») ;
//   I3 statuts dans le vocabulaire FERMÉ : « établi » (avec source citée dans la cellule,
//      entre parenthèses), « à vérifier », « divergence datée » (avec date) ;
//   I4 zéro doublon d'entrée (1re colonne).
// Provenance : X14 — critères C1-C5 tenus à la main sur l'index 16 connecteurs (itérations a/b) ;
// divergence datée guide 2018 vs Orisha 2026 attrapée par la discipline, pas par un outil
// (inventaire P2 §2, §3 O7).
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOM = 'Inventaire de connecteurs (interop)';
const findings = [];
const non_juge = [
  'exactitude technique des connecteurs décrits (→ fiche interop-archi, vérification métier)',
  'complétude du périmètre (la liste des systèmes couverts relève du dossier)'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-inventaire-interop', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (path.extname(file).toLowerCase() !== '.md') skip('extension non gérée');
const txt = fs.readFileSync(file, 'utf8');
const base = path.basename(file);
const lines = txt.split(/\r?\n/);
const REQ = ['sens', "moyen d'échange", 'déclenchement', 'statut'];
const hIdx = lines.findIndex(l => l.startsWith('|') && REQ.every(c => l.toLowerCase().includes(c)));
if (hIdx === -1) { findings.push({ sev: 'bloquant', msg: `I1 — aucune table avec les colonnes obligatoires (${REQ.join(', ')})`, where: base + ':1' }); out('FAIL', 1); }
const headers = lines[hIdx].split('|').map(s => s.trim().toLowerCase());
const col = name => headers.findIndex(h => h.includes(name));
const idx = { sens: col('sens'), moyen: col("moyen d'échange"), decl: col('déclenchement'), statut: col('statut') };
const seen = new Map();
for (let i = hIdx + 2; i < lines.length; i++) {
  const l = lines[i];
  if (!l.trim().startsWith('|')) break;
  const cells = l.split('|').map(s => s.trim());
  const nom = cells[1] || '';
  const ln = base + ':' + (i + 1);
  // I4
  const key = nom.toLowerCase();
  if (seen.has(key)) findings.push({ sev: 'bloquant', msg: `I4 — doublon d'entrée : « ${nom} » (déjà ligne ${seen.get(key)})`, where: ln });
  else seen.set(key, i + 1);
  // I2
  for (const [k, label] of [['sens', 'Sens'], ['moyen', "Moyen d'échange"], ['decl', 'Déclenchement'], ['statut', 'Statut']]) {
    const v = cells[idx[k]] || '';
    if (!v || v === '?' || v === '—' || v === '-') findings.push({ sev: 'bloquant', msg: `I2 — colonne ${label} vide pour « ${nom} »`, where: ln });
  }
  // I3
  const stRaw = cells[idx.statut] || '';
  const st = stRaw.toLowerCase();
  if (st) {
    if (st.startsWith('établi')) {
      if (!/\(.+\)/.test(stRaw)) findings.push({ sev: 'bloquant', msg: `I3 — statut « établi » sans source citée pour « ${nom} »`, where: ln });
    } else if (st.startsWith('à vérifier')) { /* vocabulaire ok */ }
    else if (st.startsWith('divergence')) {
      if (!/\d{4}/.test(st)) findings.push({ sev: 'bloquant', msg: `I3 — « divergence » non datée pour « ${nom} »`, where: ln });
    } else findings.push({ sev: 'bloquant', msg: `I3 — statut hors vocabulaire fermé (établi / à vérifier / divergence datée) : « ${stRaw} »`, where: ln });
  }
}
if (!seen.size) findings.push({ sev: 'bloquant', msg: 'table sans aucune entrée', where: base });
if (findings.length) out('FAIL', 1);
findings.push({ sev: 'info', msg: `conforme : ${seen.size} connecteur(s), I1-I4 vérifiés`, where: base });
out('PASS', 0);
