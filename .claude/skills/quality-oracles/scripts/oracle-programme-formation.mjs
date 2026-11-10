#!/usr/bin/env node
// oracle-programme-formation — Domaine « Programme de formation (structure pédagogique) ».
// Vérifie un programme .md ou .docx (paragraphes extraits via python zipfile, même mécanique
// qu'oracle-pptx — R3 : pas de réimplémentation zip maison) contre 5 contrôles déterministes :
//   C1 somme des durées de séquences = durée annoncée de chaque bloc ;
//   C2 part de pratique ≥ seuil DÉCLARÉ (ligne « part de pratique attendue : ≥ N % » du
//      programme, ou profil.formation.seuil_pratique_pct) — aucun seuil inventé : sans
//      déclaration ni profil, contrôle déclaré non jugé ;
//   C3 couverture des séquences vs liste de référence (--reference <fichier>, une séquence
//      attendue par ligne « - … ») — sans référence fournie, contrôle déclaré non jugé ;
//   C4 aucun segment mono-modalité > 50 min ;
//   C5 au moins une évaluation par bloc.
// Format canonique parsé (checklist versionnée ici même) :
//   ## Bloc <nom> — durée annoncée : <N> h|min
//   - séquence : <titre> · <N> min|h[ N min] · modalité : <exposé|pratique|démo|…>
//   - évaluation : <description>
//   part de pratique attendue : ≥ <N> %   (ligne de tête, optionnelle)
// Provenance : mission formation — contrôle rejoué 2× en scripts Python jetables dans le même
// fil (23/07/2026), déclencheur du chantier oracles/experts (note P1 §0).
//
// MODE « CONTENU COMMUN » (.json, TF-2315 et TF-2316, 10/11/2026) — les pièces d'une formation
// (support, notes, kit du participant, fiche du formateur) sont tirées d'UN fichier de contenu ; c'est
// lui que l'oracle lit, pour juger ce qu'aucune pièce prise seule ne montre. LE FAIT, chez un produit :
// le 26/10/2026, support, notes et kit ont passé tous leurs oracles avec 8 défauts de cohérence, et le
// 09/11, quatre jours avant une séance, la note d'une diapositive renvoyait à un « kit formateur » qui
// n'avait jamais existé et les solutions de deux exercices étaient imprimées dans le kit du participant.
// Format lu (celui du premier fichier réel du parc, schéma 1.0.0 du 13/10/2026) : `parties[].diapos[]`
// ({ type, titre, duree, notes: { duree }, etapes }), `deroule` ([heure, séquence, modalité]), `kit`
// ({ exercices: [{ titre, duree }], fiches: [{ titre, points, grille? }] }), `formateur` ({ solutions:
// { "<titre d'exercice>": "<texte>" }, … }), `bilan` ({ duree? }) et `fin` (heure de fin, ou `--fin`).
//   P1 la pièce du formateur existe : une section `formateur` non vide (solutions, questions, secours) ;
//   C6 un exercice a la même durée sur sa diapositive, dans ses notes et au kit (même clé « Exercice N ») ;
//   C7 les notes d'une demi-journée tiennent dans son créneau (déroulé, pauses déduites ; le déjeuner
//      sépare les deux demi-journées) ;
//   C8 le kit du participant ne porte aucune solution : ni marque (« Corrigé : », « Solution : »,
//      « réponse attendue »), ni ligne recopiée d'une solution du formateur ;
//   C9 une fiche mémo reprend chaque élément de la grille qu'elle résume (diapositive `etapes` liée par
//      `grille`, ou par un mot de six lettres au moins commun aux deux titres, éléments courts seulement).
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolvePython } from './lib/python.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ premier: true });

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && !['--fin', '--profil', '--reference'].includes(args[i - 1]));
const opt = n => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const DOM = 'Programme de formation (structure pédagogique)';
const findings = [];
const non_juge = [
  'qualité pédagogique du contenu (pertinence des séquences, formulation des objectifs) → fiche expert ingenierie-pedagogique',
  'rendu/format du document (→ oracle-format, inspection)',
  'exactitude des affirmations du programme (→ oracle-claims)'
];
const out = (verdict, nj, code) => { process.stdout.write(contratJSON({ oracle: 'oracle-programme-formation', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj })); process.exit(code); };
if (!file || !fs.existsSync(file)) { non_juge.unshift('fichier absent'); out('SKIP', non_juge, 2); }
const ext = path.extname(file).toLowerCase();
if (!['.md', '.docx', '.json'].includes(ext)) { non_juge.unshift('extension non gérée'); out('SKIP', non_juge, 2); }

// --- TF-2315 / TF-2316 : le FICHIER DE CONTENU COMMUN aux pièces d'une formation (.json) ---------------
if (ext === '.json') {
  const NJ_CONTENU = [
    'les pièces RENDUES (deck, kit en DOCX ou PDF, fiche du formateur) ne sont pas ouvertes : seul le fichier de contenu commun dont elles sont tirées est lu',
    'C7 : une demi-journée SOUS-employée (notes plus courtes que le créneau) n\'est pas un défaut jugé ; la durée du bilan n\'est comptée que si `bilan.duree` est déclarée',
    'C8 : une solution PARAPHRASÉE dans le kit n\'est pas vue — seules les marques et les lignes recopiées (25 caractères au moins) d\'une solution du formateur le sont',
    'C9 : une grille n\'est liée à sa fiche que par `grille` ou par un mot commun aux deux titres ; une grille d\'étapes longues (plus de trois mots) est une procédure, pas une grille d\'éléments',
    'qualité pédagogique du contenu → fiche expert ingenierie-pedagogique',
  ];
  const base = path.basename(file);
  let M;
  try { M = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { non_juge.splice(0, non_juge.length, 'contenu JSON illisible : ' + e.message, ...NJ_CONTENU); out('SKIP', non_juge, 2); }
  if (!M || !Array.isArray(M.parties) || !M.kit || typeof M.kit !== 'object') {
    non_juge.splice(0, non_juge.length, 'JSON sans « parties » ni « kit » : ce n\'est pas un fichier de contenu commun de formation', ...NJ_CONTENU);
    out('SKIP', non_juge, 2);
  }
  non_juge.splice(0, non_juge.length, ...NJ_CONTENU);
  const plier = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const titreDe = d => (Array.isArray(d.titre) ? d.titre.join(' ') : String(d.titre || ''));
  const cleExercice = t => String(t || '').split(' :')[0].trim();
  const minutesDe = s => {
    const t = String(s || '');
    const h = t.match(/(\d+)\s*h\s*(\d{1,2})?/i);
    if (h) return parseInt(h[1], 10) * 60 + (h[2] ? parseInt(h[2], 10) : 0);
    const m = t.match(/(\d+)\s*min/i);
    return m ? parseInt(m[1], 10) : null;
  };
  const diapos = M.parties.flatMap((p, ip) => (p.diapos || []).map((d, id) => ({ d, ip, id })));
  const ou = (ip, id) => `${base}:parties[${ip}].diapos[${id}]`;
  const kit = M.kit;
  const kitEx = new Map((kit.exercices || []).map(e => [cleExercice(e.titre), e]));
  let juges = 0;

  // P1 (TF-2315) — la pièce du formateur existe
  const F = M.formateur;
  const pieceFormateur = F && typeof F === 'object' && Object.keys(F).length > 0;
  juges++;
  if (!pieceFormateur) {
    const renvois = diapos.filter(({ d }) => /(kit|fiche|guide)\s+(du\s+)?formateur/i.test(JSON.stringify(d.notes || {}))).length;
    findings.push({ sev: 'bloquant', regle: 'P1', msg: `P1 — aucune pièce du formateur : le contenu ne porte pas de section « formateur » (solutions, déroulé et durée par diapositive, questions, secours) ; ce qui revient au formateur finit dans le kit du participant ou nulle part${renvois ? ` — et ${renvois} note(s) de diapositive y renvoient` : ''} (TF-2315)`, where: base });
  }

  // C8 (TF-2315, TF-2316) — le kit du participant ne porte aucune solution
  juges++;
  const texteKit = JSON.stringify(kit);
  for (const [rx, nom] of [[/corrig[ée]s?\s*(?:\([^)]*\))?\s*:/i, 'un corrigé'], [/CORRIG[ÉE]S?(?![a-zà-ÿ])/, 'un corrigé'], [/\bsolutions?\s*:/i, 'une solution'], [/r[ée]ponses?\s+attendues?/i, 'une réponse attendue']]) {
    const m = texteKit.match(rx);
    if (m) findings.push({ sev: 'bloquant', regle: 'C8', msg: `C8 — le kit du participant porte ${nom} d'exercice (« ${m[0].trim()} ») : les solutions vont à la pièce du formateur`, where: base + ':kit' });
  }
  const plat = s => plier(s).replace(/\\n|\s+/g, ' ').trim();
  const kitPlat = plat(texteKit);
  const solutions = F && F.solutions && typeof F.solutions === 'object' ? Object.entries(F.solutions) : [];
  for (const [t, s] of solutions) {
    const lignes = (Array.isArray(s) ? s : [s]).flatMap(x => String(x).split(/\n/)).map(plat).filter(x => x.length >= 25);
    const copie = lignes.find(l => kitPlat.includes(l));
    if (copie) findings.push({ sev: 'bloquant', regle: 'C8', msg: `C8 — une ligne de la solution de « ${t} » est recopiée dans le kit du participant (« ${copie.slice(0, 60)}… »)`, where: base + ':kit' });
  }

  // C6 (TF-2316) — même durée d'un exercice sur la diapositive, dans ses notes et au kit
  for (const { d, ip, id } of diapos) {
    if (d.type !== 'exercice') continue;
    juges++;
    const cle = cleExercice(titreDe(d));
    if (!kitEx.has(cle)) { findings.push({ sev: 'bloquant', regle: 'C6', msg: `C6 — « ${cle} » : aucun exercice du même titre au kit du participant`, where: ou(ip, id) }); continue; }
    const vals = [['diapositive', d.duree], ['notes', (d.notes || {}).duree], ['kit', kitEx.get(cle).duree]].filter(([, v]) => v != null && String(v).trim());
    const mins = vals.map(([k, v]) => [k, minutesDe(v)]);
    if (new Set(mins.map(([, m]) => m)).size > 1)
      findings.push({ sev: 'bloquant', regle: 'C6', msg: `C6 — « ${cle} » : durées différentes d'une pièce à l'autre (${mins.map(([k, m]) => `${k} ${m} min`).join(', ')})`, where: ou(ip, id) });
  }

  // C7 (TF-2316) — les notes d'une demi-journée tiennent dans son créneau
  const der = Array.isArray(M.deroule) ? M.deroule.filter(r => Array.isArray(r) && r.length >= 2 && minutesDe(r[0]) != null) : [];
  const iDej = der.findIndex(r => /pause/i.test(r[2] || '') && /jeuner/i.test(r[1] || ''));
  const heure = r => minutesDe(r[0]);
  const hh = m => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  const creneau = (lignes, debut, fin) => { let c = fin - debut; for (let k = 0; k < lignes.length; k++) if (/pause/i.test(lignes[k][2] || '')) c -= (k + 1 < lignes.length ? heure(lignes[k + 1]) : fin) - heure(lignes[k]); return c; };
  const notesDe = parts => parts.reduce((a, p) => a + (p.diapos || []).reduce((b, d) => b + (minutesDe((d.notes || {}).duree) || 0), 0), 0);
  const finJour = opt('fin') ? minutesDe(opt('fin')) : (M.fin ? minutesDe(M.fin) : null);
  if (iDej <= 0 || iDej + 1 >= der.length) non_juge.push('C7 non jugé : aucune pause « déjeuner » encadrée au déroulé — les demi-journées ne se découpent pas');
  else {
    // Première partie de l'après-midi : déclarée (`demi_journee: "apres-midi"`), sinon celle dont le titre, ou
    // celui de sa première diapositive, partage deux mots de cinq lettres au moins avec la séquence d'après le déjeuner.
    let kAm = M.parties.findIndex(p => /apr[eè]s-?midi/i.test(plier(p.demi_journee)));
    if (kAm < 0) {
      const mots = plier(der[iDej + 1][1]).match(/[a-z]{5,}/g) || [];
      kAm = M.parties.findIndex(p => { const t = plier(p.titre + ' ' + (p.diapos && p.diapos[0] ? titreDe(p.diapos[0]) : '')); return mots.filter(w => t.includes(w)).length >= 2; });
    }
    if (kAm <= 0) non_juge.push(`C7 non jugé : la première partie de l'après-midi est introuvable (séquence « ${der[iDej + 1][1]} » ; déclarer \`demi_journee: "apres-midi"\` sur cette partie)`);
    else {
      const demi = [['matin', M.parties.slice(0, kAm), der.slice(0, iDej), heure(der[0]), heure(der[iDej]), 0]];
      const bilan = M.bilan && (M.bilan.duree || (M.bilan.notes || {}).duree) ? minutesDe(M.bilan.duree || M.bilan.notes.duree) || 0 : 0;
      if (finJour != null) demi.push(['après-midi', M.parties.slice(kAm), der.slice(iDej + 1), heure(der[iDej + 1]), finJour, bilan]);
      else non_juge.push('C7 après-midi non jugé : heure de fin inconnue (champ `fin` du contenu, ou `--fin "17 h 00"`)');
      for (const [nom, parts, lignes, debut, fin, ajout] of demi) {
        juges++;
        const b = creneau(lignes, debut, fin), c = notesDe(parts) + ajout;
        if (c > b) findings.push({ sev: 'bloquant', regle: 'C7', msg: `C7 — ${nom} : ${c} minutes de notes pour un créneau de ${b} minutes (déroulé de ${hh(debut)} à ${hh(fin)}, pauses déduites)`, where: base + ':deroule' });
      }
    }
  }

  // C9 (TF-2316) — une fiche mémo reprend chaque élément de la grille qu'elle résume
  const motsSignif = s => new Set(plier(s).match(/[a-z]{6,}/g) || []);
  for (const fiche of kit.fiches || []) {
    const mf = motsSignif(String(fiche.titre || '').replace(/^[^:]*:/, ''));
    const liees = diapos.filter(({ d }) => d.type === 'etapes' && Array.isArray(d.etapes)
      && (fiche.grille ? titreDe(d) === fiche.grille : [...motsSignif(titreDe(d))].some(w => mf.has(w))));
    for (const { d, ip, id } of liees) {
      const elements = d.etapes.map(e => plier(typeof e === 'string' ? e : e.titre).replace(/^(?:les|le|la|une|un|des)\s+|^l['’]\s*/, '').trim()).filter(Boolean);
      if (!fiche.grille && elements.some(e => e.split(/\s+/).length > 3)) continue;
      juges++;
      const texte = plier((fiche.points || []).join(' '));
      for (const e of elements) if (!texte.includes(e))
        findings.push({ sev: 'bloquant', regle: 'C9', msg: `C9 — la fiche « ${fiche.titre} » omet l'élément « ${e} » de la grille qu'elle résume (« ${titreDe(d)} »)`, where: ou(ip, id) });
    }
  }

  if (findings.some(f => f.sev === 'bloquant')) out('FAIL', non_juge, 1);
  findings.push({ sev: 'info', msg: `contenu commun conforme : ${juges} contrôle(s) joué(s) (P1, C6 par exercice, C7 par demi-journée, C8, C9 par grille liée)`, where: base });
  out('PASS', non_juge, 0);
}

// --- texte : .md direct ; .docx via python zipfile (paragraphes de word/document.xml) ---
let text;
if (ext === '.md') text = fs.readFileSync(file, 'utf8');
else {
  const py = resolvePython(); // portable Windows/Unix, esquive l'alias Store (cf. lib/python.mjs)
  if (!py) { non_juge.unshift('python indisponible (lecture .docx impossible)'); out('SKIP', non_juge, 2); }
  const script = `
import sys, zipfile, re
xml = zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf-8", "replace")
for p in re.split(r"</w:p>", xml):
    t = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
    if t.strip(): print(t)
`;
  const r = spawnSync(py[0], [...py.slice(1), '-c', script, file], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (r.status !== 0 || !r.stdout) { non_juge.unshift('extraction .docx échouée : ' + (r.stderr || '').slice(0, 120)); out('SKIP', non_juge, 2); }
  text = r.stdout;
}

const base = path.basename(file);
const lines = text.split(/\r?\n/);
const toMin = (s) => {
  const hm = s.match(/(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d+)\s*(?:min)?)?/i);
  if (hm) return Math.round(parseFloat(hm[1].replace(',', '.')) * 60) + (hm[2] ? parseInt(hm[2]) : 0);
  const m = s.match(/(\d+)\s*min/i);
  return m ? parseInt(m[1]) : null;
};

// seuil de pratique : déclaré dans le document, sinon profil.formation.seuil_pratique_pct
let seuil = null, seuilSrc = null;
const decl = text.match(/part de pratique attendue\s*:\s*[≥>=]+\s*(\d+)\s*%/i);
if (decl) { seuil = parseInt(decl[1]); seuilSrc = 'déclaré dans le programme'; }
else if (opt('profil')) {
  try { const p = JSON.parse(fs.readFileSync(opt('profil'), 'utf8')); if (p.formation && Number.isFinite(p.formation.seuil_pratique_pct)) { seuil = p.formation.seuil_pratique_pct; seuilSrc = 'profil'; } } catch {}
}

// parsing des blocs
const blocs = [];
let cur = null;
lines.forEach((l, i) => {
  const b = l.match(/^#{1,4}\s*Bloc\s+(.+?)\s*[—-]\s*durée annoncée\s*:\s*(.+)$/i) || l.match(/^Bloc\s+(.+?)\s*[—-]\s*durée annoncée\s*:\s*(.+)$/i);
  if (b) { cur = { nom: b[1], annonce: toMin(b[2]), ligne: i + 1, seqs: [], evals: 0 }; blocs.push(cur); return; }
  const s = l.match(/^\s*[-*]?\s*séquence\s*:\s*(.+?)\s*[·|]\s*(.+?)\s*[·|]\s*modalité\s*:\s*([\wé-]+)/i);
  if (s && cur) { cur.seqs.push({ titre: s[1], duree: toMin(s[2]), modalite: s[3].toLowerCase(), ligne: i + 1 }); return; }
  if (/^\s*[-*]?\s*évaluation\s*:/i.test(l) && cur) cur.evals++;
});
if (!blocs.length) findings.push({ sev: 'bloquant', msg: 'aucun bloc au format canonique (« Bloc <nom> — durée annoncée : … ») — programme inanalysable', where: base + ':1' });

const PRATIQUE = ['pratique', 'atelier', 'exercice', 'tp'];
let totalMin = 0, pratiqueMin = 0;
for (const b of blocs) {
  const somme = b.seqs.reduce((a, s) => a + (s.duree || 0), 0);
  b.seqs.forEach(s => { if (s.duree == null) findings.push({ sev: 'bloquant', msg: `séquence sans durée exploitable : « ${s.titre} »`, where: base + ':' + s.ligne }); });
  // C1
  if (b.annonce == null) findings.push({ sev: 'bloquant', msg: `bloc « ${b.nom} » : durée annoncée illisible`, where: base + ':' + b.ligne });
  else if (somme !== b.annonce) findings.push({ sev: 'bloquant', msg: `C1 — bloc « ${b.nom} » : somme des séquences ${somme} min ≠ durée annoncée ${b.annonce} min`, where: base + ':' + b.ligne });
  // C4
  b.seqs.forEach(s => { if ((s.duree || 0) > 50) findings.push({ sev: 'bloquant', msg: `C4 — segment mono-modalité de ${s.duree} min > 50 min (« ${s.titre} », ${s.modalite})`, where: base + ':' + s.ligne }); });
  // C5
  if (b.evals === 0) findings.push({ sev: 'bloquant', msg: `C5 — bloc « ${b.nom} » sans évaluation`, where: base + ':' + b.ligne });
  totalMin += somme;
  pratiqueMin += b.seqs.filter(s => PRATIQUE.includes(s.modalite)).reduce((a, s) => a + (s.duree || 0), 0);
}
// C2
if (seuil != null && totalMin > 0) {
  const pct = Math.round(100 * pratiqueMin / totalMin);
  if (pct < seuil) findings.push({ sev: 'bloquant', msg: `C2 — part de pratique ${pct} % < seuil ${seuil} % (${seuilSrc})`, where: base + ':1' });
} else non_juge.push('C2 part de pratique : aucun seuil déclaré (programme) ni fourni (profil) — jamais de seuil inventé');
// C3
const refPath = opt('reference');
if (refPath && fs.existsSync(refPath)) {
  const attendues = fs.readFileSync(refPath, 'utf8').split(/\r?\n/).map(l => l.match(/^\s*[-*]\s*(.+)$/)).filter(Boolean).map(m => m[1].trim().toLowerCase());
  const presentes = blocs.flatMap(b => b.seqs.map(s => s.titre.trim().toLowerCase()));
  attendues.forEach(a => { if (!presentes.some(p => p.includes(a) || a.includes(p))) findings.push({ sev: 'bloquant', msg: `C3 — séquence de la liste de référence absente du programme : « ${a} »`, where: base + ':1' }); });
} else non_juge.push('C3 couverture : aucune liste de référence fournie (--reference <fichier>)');

if (findings.length) out('FAIL', non_juge, 1);
findings.push({ sev: 'info', msg: `conforme : ${blocs.length} bloc(s), ${blocs.reduce((a, b) => a + b.seqs.length, 0)} séquence(s), C1/C4/C5${seuil != null ? '/C2' : ''}${refPath ? '/C3' : ''} vérifiés`, where: base });
out('PASS', non_juge, 0);
