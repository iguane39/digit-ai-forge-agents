#!/usr/bin/env node
// releve-boucles — mesure ce que le mode « L99 boucle » a rapporté, sur tous les journaux
// `*.boucle.json` trouvés sous une racine (TF-1831, revue du 2026-11-16 de l'étude 20261016e).
//
// Par journal : score mesuré à la passe 1 et à la passe d'arrêt, gain, majeurs retenus à la passe 1
// et à l'arrêt, raison d'arrêt, nombre de passes. Sur l'ensemble : gain médian et majeurs clos en
// médiane. La règle de l'étude : si le gain médian reste sous 3 points, le mode redevient optionnel
// et le seul score mesuré devient le défaut — ce relevé le dit, il ne le décide pas.
//
// Usage : node releve-boucles.mjs <racine> [--json]   · exit 0 relevé rendu, 2 racine absente.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const racine = args.find((a) => !a.startsWith('--'));
const JSON_SEUL = args.includes('--json');
const EXCLUS = new Set(['node_modules', '.git', 'worktrees', '_sauvegardes', 'old']);
if (!racine || !fs.existsSync(racine)) { process.stdout.write(JSON.stringify({ outil: 'releve-boucles', erreur: 'racine absente', racine }) + '\n'); process.exit(2); }

const journaux = [];
const parcourir = (d, prof) => {
  if (prof > 8) return;
  let entrees = [];
  try { entrees = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entrees) {
    if (e.isDirectory()) { if (!EXCLUS.has(e.name)) parcourir(path.join(d, e.name), prof + 1); }
    else if (e.name.endsWith('.boucle.json')) journaux.push(path.join(d, e.name));
  }
};
parcourir(path.resolve(racine), 0);

const GRAVES = new Set(['bloquant', 'majeur']);
const graves = (p) => (p.defauts || []).filter((x) => GRAVES.has(x.severite) && x.statut === 'retenu').length;
const mediane = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const lignes = [];
for (const f of journaux) {
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { lignes.push({ fichier: f, illisible: true }); continue; }
  if (j.schema !== 'l99-boucle@1') continue;
  const gardees = (j.passes || []).filter((p) => !(p.rejetee === true || p.decision === 'rejeter'));
  const p1 = gardees[0], fin = (j.passes || []).find((p) => j.arret && p.n === j.arret.passe) || gardees[gardees.length - 1];
  if (!p1 || !fin) { lignes.push({ fichier: f, illisible: true }); continue; }
  lignes.push({ fichier: f, passes: (j.passes || []).length, score_p1: p1.score_mesure, score_fin: fin.score_mesure,
    gain: fin.score_mesure - p1.score_mesure, graves_p1: graves(p1), graves_fin: graves(fin),
    graves_clos: graves(p1) - graves(fin), arret: j.arret ? j.arret.raison : null });
}
const valides = lignes.filter((l) => !l.illisible);
const synthese = { outil: 'releve-boucles', racine: path.resolve(racine), journaux: valides.length, illisibles: lignes.length - valides.length,
  gain_median: mediane(valides.map((l) => l.gain)), graves_clos_median: mediane(valides.map((l) => l.graves_clos)),
  regle_de_revue: 'gain médian < 3 points → le mode redevient optionnel et le seul score mesuré devient le défaut (étude 20261016e)', lignes };
if (JSON_SEUL) process.stdout.write(JSON.stringify(synthese, null, 1) + '\n');
else {
  process.stdout.write(`${valides.length} journal(aux) de boucle sous ${synthese.racine}` + (synthese.illisibles ? `, ${synthese.illisibles} illisible(s)` : '') + '\n');
  for (const l of valides) process.stdout.write(`- ${l.fichier} : ${l.passes} passe(s), ${l.score_p1} → ${l.score_fin} (gain ${l.gain}), défauts graves ${l.graves_p1} → ${l.graves_fin}, arrêt ${l.arret}\n`);
  process.stdout.write(`gain médian : ${synthese.gain_median ?? 'sans objet'} ; défauts graves clos en médiane : ${synthese.graves_clos_median ?? 'sans objet'}\n${synthese.regle_de_revue}\n`);
}
process.exit(0);
