#!/usr/bin/env node
// oracle-exigences-ao — Domaine « Traçabilité exigences AO → réponse ».
// Vérifie une réponse (.md) contre un RÉFÉRENTIEL STRUCTURÉ fourni par dossier (extrait du
// CCTP/RC, --exigences <fichier>) :
//   X1 chaque exigence du référentiel est référencée dans la réponse (motif regex trouvé) ;
//   X2 chaque rubrique imposée existe À L'IDENTIQUE comme titre de la réponse ;
//   X3 chaque pièce attendue est mentionnée comme livrée.
// Format canonique du référentiel (checklist versionnée ici) :
//   ## Exigences            → lignes « - EXG-xx · <texte> · motif: <regex> »
//   ## Rubriques imposées   → lignes « - <titre exact> »
//   ## Pièces attendues     → lignes « - <nom> · motif: <regex> » (motif optionnel : le nom)
// non_juge : la QUALITÉ de la réponse à chaque exigence (→ digit-ai-propale-review / juge) ;
// l'exhaustivité du référentiel lui-même (extraction humaine du CCTP/RC).
// Provenance : consultation OPCO 07/07/2026 — exigence Art. 3 (« ≥ 2 ans GRH ») repêchée en analyse,
// rubriques p. 22 « à l'identique » vérifiées à la main (inventaire P2 §2, §3 O4).
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = n => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const DOM = 'Traçabilité exigences AO → réponse';
const findings = [];
const non_juge = [
  'qualité de la réponse à chaque exigence (jugement → digit-ai-propale-review / oracle-judge)',
  'exhaustivité du référentiel fourni (extraction humaine du CCTP/RC)'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-exigences-ao', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (path.extname(file).toLowerCase() !== '.md') skip('extension non gérée');
const refPath = opt('exigences');
if (!refPath) skip('aucun référentiel fourni (--exigences <fichier>) — traçabilité non jugeable sans référentiel du dossier');
if (!fs.existsSync(refPath)) skip('référentiel introuvable : ' + refPath);
const rep = fs.readFileSync(file, 'utf8');
const ref = fs.readFileSync(refPath, 'utf8');
const base = path.basename(file);
const section = (name) => { const m = ref.split(/^## /m).find(s => s.toLowerCase().startsWith(name)); return m ? m.split(/\r?\n/).slice(1).map(l => l.match(/^\s*[-*]\s+(.*)$/)).filter(Boolean).map(x => x[1].trim()) : []; };
// X1
for (const line of section('exigences')) {
  const m = line.match(/^(\S+)\s*·\s*(.+?)\s*·\s*motif:\s*(.+)$/);
  if (!m) { findings.push({ sev: 'bloquant', msg: 'référentiel : ligne d exigence hors format « ID · texte · motif: regex » : ' + line.slice(0, 60), where: path.basename(refPath) }); continue; }
  let re; try { re = new RegExp(m[3], 'i'); } catch { findings.push({ sev: 'bloquant', msg: `référentiel : motif invalide pour ${m[1]}`, where: path.basename(refPath) }); continue; }
  if (!re.test(rep)) findings.push({ sev: 'bloquant', msg: `X1 — exigence non référencée dans la réponse : ${m[1]} « ${m[2]} »`, where: base });
}
// X2
for (const titre of section('rubriques imposées')) {
  const found = rep.split(/\r?\n/).some(l => l.replace(/^#+\s*/, '').trim() === titre);
  if (!found) findings.push({ sev: 'bloquant', msg: `X2 — rubrique imposée absente à l'identique : « ${titre} »`, where: base });
}
// X3
for (const line of section('pièces attendues')) {
  const m = line.match(/^(.+?)\s*·\s*motif:\s*(.+)$/);
  const nom = m ? m[1] : line; let re;
  if (m) { try { re = new RegExp(m[2], 'i'); } catch { continue; } if (!re.test(rep)) findings.push({ sev: 'bloquant', msg: `X3 — pièce attendue non mentionnée comme livrée : « ${nom} »`, where: base }); }
  else if (!rep.toLowerCase().includes(nom.toLowerCase())) findings.push({ sev: 'bloquant', msg: `X3 — pièce attendue non mentionnée comme livrée : « ${nom} »`, where: base });
}
if (findings.length) out('FAIL', 1);
findings.push({ sev: 'info', msg: 'conforme : exigences, rubriques et pièces du référentiel toutes tracées', where: base });
out('PASS', 0);
