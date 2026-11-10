#!/usr/bin/env node
// oracle-fidelite-source — Domaine « Fidélité des chiffres d'un livrable dérivé à son document source »
// (TF-2376 et TF-2320, 10/11/2026 ; squelette write-an-oracle).
//
// LE FAIT. oracle-claims exige qu'un montant cite une source sans la relire ; oracle-coherence compare des
// livrables d'un même dossier entre eux. Le 30/09/2026, pour un deck de 7 diapositives tiré d'un programme
// de formation de 100 000 caractères, un producteur a écrit son propre contrôle (31 faits, 152 nombres
// jugés sans orphelin, 20 grandeurs recomptées, épreuve : 4 altérations détectées sur 4) — TF-2376. Le
// 01/10, le même geste a laissé passer 3 faits non sourcés : chaque fait était cherché par un motif dans le
// livrable et un AUTRE dans la source, tous deux écrits par lui, et jamais comparés — TF-2320.
//
// LA RÈGLE. Un fait déclaré se juge contre le PASSAGE de sa source : le passage se lit tel quel dans la
// source, les nombres de l'affirmation s'y lisent, et un fait littéral se lit lui-même tel quel dans la
// source. L'épreuve (`--epreuve`) altère le livrable ET la table des faits : chaque altération doit faire
// échouer le jugement, sans quoi la table ne prouve rien.
//
// Checklist canonique (versionnée ici) :
//   F1 FAIT SOURCÉ — chaque fait de la table : (a) son affirmation se lit au livrable ; (b) son passage se
//      lit tel quel dans la source ; (c) chaque nombre de l'affirmation se lit dans le passage (chiffres ou
//      lettres) ; (d) un fait littéral (défaut) se lit tel quel dans la source ; un fait reformulé
//      (`"litteral": false`) déclare sa reformulation. Un fait de calcul (F3) n'a pas de passage.
//   F2 AUCUN NOMBRE ORPHELIN — tout nombre du livrable appartient à une affirmation de la table ou à une
//      structure déclarée (`structure` : motifs de ligne, pagination, numérotation) ; la numérotation d'une
//      liste ou d'un titre en tête de ligne est admise d'office.
//   F3 GRANDEUR RECOMPTÉE — un fait de calcul (`"calcul": { "valeur": N, "compter": "<motif de ligne>" }`)
//      vaut le nombre de lignes de la source qui portent le motif, jamais un nombre lu dans sa prose ; et
//      son affirmation porte N.
//   F4 FRISE — chaque temps d'une frise (`frise` : { livrable, etapes, mots }) se lit au livrable, et les
//      titres de la source qui portent le motif `etapes` portent chacun des mots attendus.
//
// Table des faits (`--faits <faits.json>`, format quality-oracles/faits-source@1) :
//   { "faits": [{ "id", "livrable", "passage", "litteral"?, "reformulation"?, "calcul"? }],
//     "structure": [{ "id", "motif" }], "frise": [{ "livrable", "etapes", "mots": [] }] }
//
// Usage : node oracle-fidelite-source.mjs <livrable.md|.txt|.html> --source <source.md|.txt|.html>
//         --faits <faits.json> [--epreuve]
// Contrat JSON commun · exit 0 PASS / 1 FAIL / 2 SKIP.
import fs from 'node:fs';
import path from 'node:path';
import { LETTRES } from './lib/effectifs.mjs';
import { decoderEntites } from './lib/entites.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe ; ici, son domicile est le premier non_juge.
const contratJSON = ecrivainDeContrat({ premier: true });

const args = process.argv.slice(2);
const AVEC_VALEUR = ['--source', '--faits'];
const file = args.find((a, i) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[i - 1]));
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const DOM = "Fidélité des chiffres d'un livrable dérivé à son document source";
const nonJuge = [
  'la VÉRITÉ de la source elle-même : le livrable est jugé fidèle à sa source, pas la source au monde',
  'un fait que la table ne déclare pas : F2 refuse ses nombres, mais une affirmation sans nombre et sans fait déclaré n\'est pas vue',
  'la justesse d\'une reformulation déclarée (`"litteral": false`) : sa présence est jugée, son sens est l\'affaire du relecteur ; ses nombres restent jugés (F1 c)',
  'un livrable .pptx, .docx ou .pdf : le texte s\'en extrait d\'abord (oracle-pdf, lib/texte-pdf.mjs pour un PDF), cet oracle lit .md, .txt et .html',
];
const findings = [];
const out = (verdict, code) => { process.stdout.write(contratJSON({ oracle: 'oracle-fidelite-source', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nonJuge })); process.exit(code); };
const skip = motif => { nonJuge.unshift(motif); out('SKIP', 2); };
const EXT = ['.md', '.txt', '.html', '.htm'];
if (!file || !fs.existsSync(file)) skip('fichier absent : ' + (file || '(aucun argument)'));
if (!EXT.includes(path.extname(file).toLowerCase())) skip('extension non gérée : ' + path.extname(file) + ' (attendu .md, .txt ou .html)');
const sourceF = opt('source'), faitsF = opt('faits');
if (!sourceF || !fs.existsSync(sourceF)) skip('--source absente ou introuvable : sans le document source, aucun fait ne se relit');
if (!EXT.includes(path.extname(sourceF).toLowerCase())) skip('--source : extension non gérée (attendu .md, .txt ou .html)');
if (!faitsF || !fs.existsSync(faitsF)) skip('--faits absente ou introuvable : sans la table des faits, rien ne dit quel passage fonde quelle affirmation');
let table;
try { table = JSON.parse(fs.readFileSync(faitsF, 'utf8')); } catch (e) { skip('--faits illisible : ' + e.message); }
if (!Array.isArray(table.faits) || !table.faits.length) skip('--faits sans aucun fait (champ `faits`)');

// Une page HTML se lit dans son texte décodé (lib/entites.mjs) : « &#39; » est une apostrophe, pas le nombre 39.
const texteDe = f => {
  const t = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return /\.html?$/i.test(f) ? decoderEntites(t.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, m => m.replace(/[^\n]/g, '')).replace(/<[^>]+>/g, ' ')) : t;
};
// Espaces insécables, apostrophes typographiques et blancs répétés ramenés à leur forme simple.
const norm = s => String(s || '').replace(/[   \t]/g, ' ').replace(/[’‘ʼ]/g, "'").replace(/ {2,}/g, ' ');
const RX_NOMBRE = /\d{1,3}(?: \d{3})+(?:[.,]\d+)?|\d+(?:[.,:/h]\d+)*/g;
const canon = n => n.replace(/ /g, '').replace(',', '.');
const mots = Object.keys(LETTRES).sort((a, b) => b.length - a.length);
const RX_LETTRES = new RegExp(`(?<![\\p{L}])(${mots.join('|')})(?![\\p{L}])`, 'giu');
const nombresDe = s => new Set([...norm(s).matchAll(RX_NOMBRE)].map(m => canon(m[0])).concat([...norm(s).matchAll(RX_LETTRES)].map(m => String(LETTRES[m[1].toLowerCase()]))));
const base = path.basename(file);

/** Le jugement pur F1 à F4 d'un livrable, d'une source et d'une table : rend la liste des constats. */
function juger(livrable, source, t) {
  const L = norm(livrable), Sx = norm(source), c = [];
  const couvert = new Array(L.length).fill(false);
  for (const f of t.faits || []) {
    const id = f.id || '(sans id)';
    const aff = norm(f.livrable);
    if (!aff.trim()) { c.push({ sev: 'bloquant', regle: 'F1', msg: `F1 — fait ${id} : affirmation vide dans la table`, where: base }); continue; }
    let i = L.indexOf(aff), vu = i >= 0;
    while (i >= 0) { for (let k = i; k < i + aff.length; k++) couvert[k] = true; i = L.indexOf(aff, i + 1); }
    if (!vu) c.push({ sev: 'bloquant', regle: 'F1', msg: `F1 — fait ${id} : son affirmation ne se lit pas au livrable (a)`, where: base });
    if (f.calcul) {
      // F3 — la grandeur se recompte dans la structure de la source, jamais dans sa prose.
      let rx = null; try { rx = new RegExp(f.calcul.compter, 'gm'); } catch { /* motif invalide, dit ci-dessous */ }
      if (!rx) { c.push({ sev: 'bloquant', regle: 'F3', msg: `F3 — fait ${id} : motif de comptage invalide`, where: base }); continue; }
      const n = (Sx.match(rx) || []).length;
      if (n !== Number(f.calcul.valeur)) c.push({ sev: 'bloquant', regle: 'F3', msg: `F3 — fait ${id} : ${n} ligne(s) de la source portent le motif, la table attend ${f.calcul.valeur}`, where: base });
      if (!nombresDe(aff).has(String(f.calcul.valeur))) c.push({ sev: 'bloquant', regle: 'F3', msg: `F3 — fait ${id} : l'affirmation ne porte pas la grandeur recomptée (${f.calcul.valeur})`, where: base });
      continue;
    }
    const pas = norm(f.passage);
    if (!pas.trim() || !Sx.includes(pas)) { c.push({ sev: 'bloquant', regle: 'F1', msg: `F1 — fait ${id} : son passage ne se lit pas tel quel dans la source (b)`, where: base }); continue; }
    const np = nombresDe(pas), manquants = [...nombresDe(aff)].filter(n => !np.has(n));
    if (manquants.length) c.push({ sev: 'bloquant', regle: 'F1', msg: `F1 — fait ${id} : nombre(s) de l'affirmation absent(s) du passage de la source (c) : ${manquants.join(', ')}`, where: base });
    if (f.litteral === false) { if (!String(f.reformulation || '').trim()) c.push({ sev: 'bloquant', regle: 'F1', msg: `F1 — fait ${id} : déclaré reformulé sans reformulation justifiée (d)`, where: base }); }
    else if (!Sx.includes(aff)) c.push({ sev: 'bloquant', regle: 'F1', msg: `F1 — fait ${id} : fait littéral qui ne se lit pas tel quel dans la source (d) — le reformuler se déclare (\`"litteral": false\`, \`"reformulation"\`)`, where: base });
  }
  // F2 — aucun nombre orphelin
  const lignes = L.split('\n'); let off = 0;
  for (const l of lignes) {
    const marque = l.match(/^\s*(?:#{1,6}\s*)?\d+[.)]\s/);
    if (marque) for (let k = off; k < off + marque[0].length; k++) couvert[k] = true;
    for (const s of t.structure || []) { let rx = null; try { rx = new RegExp(s.motif, 'g'); } catch { continue; } for (const m of l.matchAll(rx)) for (let k = off + m.index; k < off + m.index + m[0].length; k++) couvert[k] = true; }
    off += l.length + 1;
  }
  const orphelins = [...L.matchAll(RX_NOMBRE)].filter(m => { for (let k = m.index; k < m.index + m[0].length; k++) if (!couvert[k]) return true; return false; });
  for (const m of orphelins.slice(0, 20)) c.push({ sev: 'bloquant', regle: 'F2', msg: `F2 — nombre orphelin « ${m[0]} » : il n'appartient à aucun fait de la table ni à une structure déclarée`, where: base + ':' + (L.slice(0, m.index).split('\n').length) });
  if (orphelins.length > 20) c.push({ sev: 'bloquant', regle: 'F2', msg: `F2 — ${orphelins.length - 20} nombre(s) orphelin(s) de plus, non listés`, where: base });
  // F4 — frise
  for (const fr of t.frise || []) {
    if (!L.includes(norm(fr.livrable))) c.push({ sev: 'bloquant', regle: 'F4', msg: `F4 — le temps « ${fr.livrable} » de la frise ne se lit pas au livrable`, where: base });
    let rx = null; try { rx = new RegExp(fr.etapes, 'gm'); } catch { /* dit ci-dessous */ }
    const titres = rx ? Sx.split('\n').filter(l => { rx.lastIndex = 0; return rx.test(l); }) : [];
    if (!titres.length) { c.push({ sev: 'bloquant', regle: 'F4', msg: `F4 — temps « ${fr.livrable} » : aucun titre d'étape de la source ne porte le motif`, where: base }); continue; }
    for (const mot of fr.mots || []) if (!titres.some(x => x.toLowerCase().includes(String(mot).toLowerCase())))
      c.push({ sev: 'bloquant', regle: 'F4', msg: `F4 — temps « ${fr.livrable} » : aucune étape qu'il annonce ne porte le mot « ${mot} »`, where: base });
  }
  return c;
}

const livrable = texteDe(file), source = texteDe(sourceF);
const constats = juger(livrable, source, table);
findings.push(...constats);
const nFaits = table.faits.length;

if (args.includes('--epreuve')) {
  // L'ÉPREUVE : chaque altération du livrable OU de la table doit faire échouer le jugement.
  const alterations = [];
  const copie = () => JSON.parse(JSON.stringify(table));
  const plusUn = s => s.replace(/\d+/, d => String(Number(d) + 1));
  for (const [k, f] of table.faits.entries()) {
    const aff = norm(f.livrable);
    if (!/\d/.test(aff)) continue;
    alterations.push({ quoi: `livrable : un nombre du fait ${f.id} change`, l: norm(livrable).split(aff).join(plusUn(aff)), t: table });
    const t1 = copie(); t1.faits[k].livrable = plusUn(aff);
    alterations.push({ quoi: `table et livrable changés ensemble : le fait ${f.id} affirme un autre nombre que son passage`, l: norm(livrable).split(aff).join(plusUn(aff)), t: t1 });
    if (!f.calcul) { const t2 = copie(); t2.faits[k].passage = plusUn(norm(f.passage)) + ' (passage altéré)'; alterations.push({ quoi: `table : le passage du fait ${f.id} est altéré`, l: livrable, t: t2 }); }
    else { const t3 = copie(); t3.faits[k].calcul.valeur = Number(f.calcul.valeur) + 1; alterations.push({ quoi: `table : la grandeur du fait ${f.id} est altérée`, l: livrable, t: t3 }); }
  }
  alterations.push({ quoi: 'livrable : un nombre orphelin est ajouté', l: livrable + '\nUn chiffre glissé sans source : 4747 participants.\n', t: table });
  let detectees = 0;
  for (const a of alterations) {
    if (juger(a.l, source, a.t).some(x => x.sev === 'bloquant')) detectees++;
    else findings.push({ sev: 'bloquant', regle: 'EPREUVE', msg: `épreuve — altération NON détectée : ${a.quoi} — la table des faits ne prouve pas ce fait`, where: base });
  }
  findings.push({ sev: 'info', regle: 'EPREUVE', msg: `épreuve : ${detectees} altération(s) détectée(s) sur ${alterations.length} (livrable et table des faits)`, where: base });
}

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
findings.push({ sev: 'info', msg: `${nFaits} fait(s) relu(s) contre le passage de leur source, ${(table.structure || []).length} structure(s) déclarée(s), ${(table.frise || []).length} temps de frise ; aucun nombre orphelin`, where: base });
out('PASS', 0);
