#!/usr/bin/env node
// oracle-fiche-prospection-ice — Domaine « Fiches prospection ICE (structure et classement) ».
// Vérifie le livrable HTML de diagnostic digit-ai-prospection :
//   K1 chaque fiche cas d'usage porte les 9 champs obligatoires du skill (pipeline.md §étape 3) :
//      Problème adressé, Bénéficiaires, Solution proposée, Stack technique, Build vs Buy,
//      Effort, ROI, KPIs, Conformité ;
//   K2 scores ICE dans les bornes de la grille du skill (grille-ice.md : chaque dimension 1-10,
//      score = moyenne, donc 1 ≤ ICE ≤ 10) ;
//   K3 classement affiché cohérent avec les scores (re-tri exécuté : l'ordre d'apparition des
//      fiches doit suivre l'ordre décroissant des ICE).
// Conventions de détection (déterministes) : une fiche = un bloc <article|section|div avec
// class contenant « fiche » ou « card » ; score ICE = motif « ICE » suivi d'un nombre dans le bloc.
// non_juge : défauts de sources des montants → oracle-claims (+ exemptions du 21/07, d'où la
// priorité basse de ce domaine — inventaire P2 O10).
// Provenance : digit-ai-prospection, pipeline systématique 10-15 cas d'usage par prospect —
// inventaire P2 §3 O10. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOM = 'Fiches prospection ICE (structure et classement)';
const findings = [];
const non_juge = [
  'montants et références non sourcés → oracle-claims (exemptions du 21/07/2026)',
  'pertinence métier des cas d usage (jugement commercial)',
  'charte visuelle du livrable → digit-ai-page-html / digit-ai-fiches-html'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-fiche-prospection-ice', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (!['.html', '.htm'].includes(path.extname(file).toLowerCase())) skip('extension non gérée');
const html = fs.readFileSync(file, 'utf8');
const base = path.basename(file);
const CHAMPS = ['Problème adressé', 'Bénéficiaires', 'Solution proposée', 'Stack technique', 'Build vs Buy', 'Effort', 'ROI', 'KPIs', 'Conformité'];
const blocs = [...html.matchAll(/<(article|section|div)[^>]*class=["'][^"']*(?:fiche|card)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)];
if (!blocs.length) { findings.push({ sev: 'bloquant', msg: 'aucune fiche détectée (bloc avec class « fiche »/« card »)', where: base + ':1' }); out('FAIL', 1); }
const scores = [];
blocs.forEach((b, i) => {
  const contenu = b[2];
  const titre = (contenu.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/i) || [null, 'fiche ' + (i + 1)])[1].replace(/<[^>]+>/g, '').trim();
  // K1
  for (const c of CHAMPS)
    if (!new RegExp(c.replace(/[éè]/g, '[éè]'), 'i').test(contenu))
      findings.push({ sev: 'bloquant', msg: `K1 — champ « ${c} » absent de la fiche « ${titre} » (9 champs obligatoires du skill)`, where: base });
  // K2
  const sm = contenu.match(/ICE[^0-9]{0,12}(\d+(?:[.,]\d+)?)/i);
  if (!sm) { findings.push({ sev: 'bloquant', msg: `K2 — score ICE introuvable dans la fiche « ${titre} »`, where: base }); return; }
  const score = parseFloat(sm[1].replace(',', '.'));
  if (score < 1 || score > 10) findings.push({ sev: 'bloquant', msg: `K2 — score ICE ${score} hors bornes de la grille (1-10, moyenne de 3 dimensions /10) — fiche « ${titre} »`, where: base });
  scores.push({ titre, score });
});
// K3 — re-tri exécuté
for (let i = 1; i < scores.length; i++) {
  if (scores[i].score > scores[i - 1].score)
    findings.push({ sev: 'bloquant', msg: `K3 — classement incohérent avec les scores : « ${scores[i].titre} » (ICE ${scores[i].score}) apparaît après « ${scores[i - 1].titre} » (ICE ${scores[i - 1].score})`, where: base });
}
if (findings.length) out('FAIL', 1);
findings.push({ sev: 'info', msg: `conforme : ${blocs.length} fiche(s), 9 champs présents, ICE dans les bornes, classement = re-tri`, where: base });
out('PASS', 0);
