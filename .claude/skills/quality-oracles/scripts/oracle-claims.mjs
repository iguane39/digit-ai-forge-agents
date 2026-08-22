#!/usr/bin/env node
// oracle-claims — Domaine « Traçabilité des affirmations chiffrées » (v2, déterministe).
// Transcription exécutable de la règle dure : « toute donnée affichée trace à une source
// citée ou un calcul rejoué, sinon est marquée à vérifier ».
//   1. Montant monétaire (€, k€, $) hors table SANS marqueur de source (profil) ni
//      « à vérifier » dans son paragraphe → BLOQUANT.
//   2. (v2) TJM chiffré non sourcé → BLOQUANT. Charge en jours-homme non sourcée →
//      BLOQUANT si la ligne porte aussi un contexte d'engagement (€ ou TJM), sinon warn.
//   3. (v2) Date d'échéance formulée en engagement (livraison/échéance/au plus tard + date)
//      non sourcée → warn (jamais bloquant : faux positifs attendus).
//   4. Pourcentage ou grand nombre (≥ 4 chiffres) non sourcé hors table → warn.
//   5. Cohérence intra-document : même libellé porté à des valeurs divergentes → BLOQUANT
//      (v2 : unités €, k€, % ET j / j.h / jours-homme, via lib/claims-extract.mjs).
// Lignes de tables exclues (domaine oracle-calculs). Motifs additionnels par profil :
// claims.motifs_bloquants / claims.motifs_warn (listes de regex ; invalides → ignorées,
// tracées en non_juge — jamais de crash). Inactif par profil → SKIP motivé.
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { extractLabelled } from './lib/claims-extract.mjs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
const DOM = 'Traçabilité des affirmations chiffrées';
const NJ = [
  'véracité des valeurs sourcées (la source citée n\'est pas contre-vérifiée ici)',
  'affirmations non chiffrées (faits, noms, citations)',
  'totaux des tables → oracle-calculs',
  'petits nombres en prose (< 4 chiffres, hors €, %, TJM, jours-homme)',
  'dates d\'échéance : avertissement seulement (jamais bloquant)'
];
const out = (verdict, findings, nj, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-claims', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj })); process.exit(code); };
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
if (!['.md', '.html', '.htm', '.txt'].includes(path.extname(file).toLowerCase())) out('SKIP', [], ['extension non gérée'], 2);

let conf = { actif: true, marqueurs_source: ['source', 'sources?\\s*:', 'à vérifier', 'cf\\.', 'réf', '\\[\\^?\\d+\\]', 'calculé', 'https?://'], motifs_bloquants: [], motifs_warn: [] };
if (pArg) { try { conf = { ...conf, ...(JSON.parse(fs.readFileSync(pArg, 'utf8')).claims || {}) }; } catch {} }
if (conf.actif === false) out('SKIP', [], ['contrôle des claims désactivé par le profil'], 2);
const SRC = new RegExp('(' + conf.marqueurs_source.join('|') + ')', 'i');
const njExtra = [];
const compile = (list, label) => (list || []).map(p => { try { return new RegExp(p, 'gi'); } catch { njExtra.push(`motif ${label} invalide ignoré : ${p}`); return null; } }).filter(Boolean);
const PROFIL_BLOQ = compile(conf.motifs_bloquants, 'bloquant');
const PROFIL_WARN = compile(conf.motifs_warn, 'warn');

// TF-0485, TF-0486 et TF-0487 (lot v2-architecture-cible, 22/08) — TROIS FAUX POSITIFS, UN SEUL
// MÉCANISME : l'oracle jugeait tout le fichier comme du texte écrit par le livrable. Or un
// livrable AUTOPORTANT embarque son code, sa charte et ses sources ; la surface d'analyse
// contenait donc des choses que personne n'a « affirmées ».
//   · TF-0485 — `s.replace(/[*][*]([^*]+)[*][*]/g, '<strong>$1</strong>')` : la référence arrière
//     `$1` lue comme « montant 1 $ sans source », FAIL bloquant, en pointant `(function () {`
//     trois lignes plus haut. Contournement subi côté produit : réécrire les quatre `$1/$2` en
//     fonctions de remplacement — c'est-à-dire dégrader le code pour plaire à l'oracle, et le
//     prochain auteur réécrira `$1` sans savoir pourquoi il ne faut pas.
//   · TF-0486 — `#334155` et `#374151` lus comme « nombre non sourcé ». Ce sont deux tokens de
//     couleur du bloc `:root`, c'est-à-dire exactement ce que la charte PRESCRIT d'écrire. Seules
//     les couleurs purement numériques étaient touchées (`#0F172A` passait) : un oracle dont le
//     verdict dépend des lettres présentes dans une couleur n'est pas lisible.
//   · TF-0487 — « pourcentage 100% non sourcé », onze occurrences, toutes dans les douze documents
//     Markdown CITÉS par le rapport. Ceux du texte propre ont pu être reformulés ; ceux des
//     citations sont INCORRIGIBLES sans falsifier la source.
//
// Le précédent existait déjà dans la forge et n'avait pas été suivi : la règle L1 de check_html
// fait `if parent.tag in ("script", "style"): continue`. Même règle ici, étendue au contenu CITÉ
// — `<pre>`, `<code>`, `<blockquote>`, et tout élément portant `data-cite`. Les lignes sont
// PRÉSERVÉES (on blanchit, on ne supprime pas) pour que les numéros de ligne restent justes.
const NEUTRALISE = m => m.replace(/[^\n]/g, ' ');
let text = fs.readFileSync(file, 'utf8');
text = text.replace(/```[\s\S]*?```/g, NEUTRALISE);                                    // bloc de code exclu
text = text.replace(/`[^`\n]+`/g, NEUTRALISE);                                         // code en ligne aussi
if (/\.html?$/.test(file)) text = text
  .replace(/<script\b[\s\S]*?<\/script>/gi, NEUTRALISE)                                // le JS inline n'affirme rien
  .replace(/<style\b[\s\S]*?<\/style>/gi, NEUTRALISE)                                  // la charte non plus
  .replace(/<pre\b[\s\S]*?<\/pre>/gi, NEUTRALISE)
  .replace(/<code\b[\s\S]*?<\/code>/gi, NEUTRALISE)
  .replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, NEUTRALISE)
  .replace(/<([a-z0-9]+)\b[^>]*\bdata-cite\b[^>]*>[\s\S]*?<\/\1>/gi, NEUTRALISE)        // source citée verbatim
  .replace(/<table[\s\S]*?<\/table>/gi, NEUTRALISE)
  .replace(/<[^>]+>/g, ' ');
const lines = text.split('\n');
const base = path.basename(file);
const isTableLine = l => /^\s*\|/.test(l);

// paragraphe = la ligne + ses voisines non vides (le marqueur de source peut être adjacent)
const para = i => [lines[i - 1] || '', lines[i], lines[i + 1] || ''].join(' ');
const findings = [];
const MONEY = /(\d[\d\s\u00a0\u202f.,]*)\s*(k?€|k?\$|K€)/g;
const PCT = /(\d[\d.,]*)\s*%/g;
// Le `#` entre dans la garde arrière (TF-0486) : `#334155` n'est pas un nombre affirmé, c'est une
// couleur. La garde vaut aussi hors HTML — un Markdown peut porter une couleur de charte.
const BIG = /(?<![\d.,€$%#])\b\d{1,3}(?:[\s\u00a0\u202f]\d{3})+(?:[.,]\d+)?\b|(?<!#)\b\d{4,}\b/g;
const TJM = /\bTJM\b[^\d\n]{0,12}\d[\d\s\u00a0\u202f.,]*/gi;                            // v2 — TJM chiffré
const JH = /\d[\d\s.,]*\s*(?:j\.?h\.?|jours?[- ]hommes?|j\/h)\b/gi;                     // v2 — charge en jours-homme
const DATEVAL = /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b\d{1,2}(?:er)?\s+(?:janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)/i;
const ENGAGE = /livraison|échéance|echeance|deadline|au plus tard/i;                    // v2 — date d'engagement
let checked = 0;
lines.forEach((l, i) => {
  if (isTableLine(l) || !l.trim()) return;
  const ctx = para(i);
  const sourced = SRC.test(ctx);
  const moneySpans = [...l.matchAll(MONEY)].map(m => [m.index, m.index + m[0].length]);
  const inMoney = m => moneySpans.some(([a, b]) => m.index >= a - 1 && m.index < b);
  for (const m of moneySpans.keys()) checked++;
  for (const m of l.matchAll(TJM)) if (!/[€$]/.test(m[0])) checked++;                   // TJM contrôlé, sourcé ou non
  for (const m of l.matchAll(JH)) checked++;                                            // charge contrôlée, sourcée ou non
  if (!sourced) {
    for (const m of l.matchAll(MONEY)) findings.push({ sev: 'bloquant', msg: `montant « ${m[0].trim()} » sans source ni « à vérifier » (règle : toute donnée trace ou est marquée)`, where: base + ':' + (i + 1) });
    for (const m of l.matchAll(TJM)) { if (/[€$]/.test(m[0])) continue; findings.push({ sev: 'bloquant', msg: `TJM « ${m[0].trim()} » sans source ni « à vérifier »`, where: base + ':' + (i + 1) }); }
    for (const m of l.matchAll(JH)) {
      const engage = /[€$]/.test(l) || /\bTJM\b/i.test(l);                              // contexte d'engagement
      findings.push({ sev: engage ? 'bloquant' : 'warn', msg: `charge « ${m[0].trim()} » non sourcée${engage ? ' (contexte d\'engagement € / TJM)' : ''}`, where: base + ':' + (i + 1) });
    }
    if (ENGAGE.test(l) && DATEVAL.test(l)) { checked++; findings.push({ sev: 'warn', msg: `date d'engagement non sourcée : « ${l.trim().slice(0, 80)} »`, where: base + ':' + (i + 1) }); }
    for (const m of l.matchAll(PCT)) { checked++; findings.push({ sev: 'warn', msg: `pourcentage « ${m[0]} » non sourcé`, where: base + ':' + (i + 1) }); }
    for (const m of l.matchAll(BIG)) { if (inMoney(m) || /^\d{4}$/.test(m[0].trim())) continue; checked++; findings.push({ sev: 'warn', msg: `nombre « ${m[0].trim()} » non sourcé`, where: base + ':' + (i + 1) }); }
    for (const rx of PROFIL_BLOQ) for (const m of l.matchAll(rx)) { checked++; findings.push({ sev: 'bloquant', msg: `motif bloquant du profil : « ${m[0].trim().slice(0, 60)} » non sourcé`, where: base + ':' + (i + 1) }); }
    for (const rx of PROFIL_WARN) for (const m of l.matchAll(rx)) { checked++; findings.push({ sev: 'warn', msg: `motif du profil : « ${m[0].trim().slice(0, 60)} » non sourcé`, where: base + ':' + (i + 1) }); }
  }
});

// cohérence intra-document : même libellé porté à des valeurs divergentes (lib partagée, unités €/%/j/jh)
const labelled = new Map();
for (const e of extractLabelled(lines, isTableLine)) {
  if (!labelled.has(e.key)) labelled.set(e.key, []);
  labelled.get(e.key).push(e);
}
for (const [key, occ] of labelled) {
  const vals = [...new Set(occ.map(o => o.v))];
  if (vals.length > 1) findings.push({ sev: 'bloquant', msg: `incohérence intra-document « ${occ[0].brut} » vs « ${occ[occ.length - 1].brut} » (${vals.join(' ≠ ')})`, where: base + ':' + occ.map(o => o.line).join(',') });
}

const NJALL = [...NJ, ...njExtra];
const bloquants = findings.filter(f => f.sev === 'bloquant').length;
if (bloquants) out('FAIL', findings, NJALL, 1);
if (!checked && !labelled.size) out('SKIP', [], [...NJALL, 'aucune affirmation chiffrée hors table détectée'], 2);
out('PASS', [{ sev: 'info', msg: (checked + labelled.size) + ' affirmation(s) chiffrée(s) contrôlée(s) — toutes sourcées/cohérentes' + (findings.length ? ' (' + findings.length + ' avertissement(s))' : ''), where: base }, ...findings], NJALL, 0);
