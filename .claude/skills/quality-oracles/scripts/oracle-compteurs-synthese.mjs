#!/usr/bin/env node
// oracle-compteurs-synthese — Domaine « Sortie automatisée de tri, de classement ou de rédaction »,
// principe PC-6 (TF-1727, 15/10/2026) : tout chiffre de synthèse se RECALCULE par script depuis la
// table qu'il résume, et l'écart toléré est nul.
//
// LE FAIT (lot Produit-12 - RETOURS - 20261014a, RS-31, et sa pièce « Principe d'analyse critique »,
// §3 (a)) : six pages de rangement affichaient de 97 à 98 % de fichiers « rangés », portes vertes ;
// leurs compteurs d'en-tête étaient faux, et rien ne les recalculait depuis la table rangée. R-63 du
// pilot (REGLES-PROJET.md, section AR) déclare PC-6 « le seul des six déjà exécutable sans le métier ».
//
// CE QU'IL LIT : une DÉCLARATION de compteurs (JSON) écrite à côté de la synthèse par ce qui la
// produit, et la TABLE qu'elle résume (CSV à en-tête, séparateur `,` ou `;`, ou JSON tableau d'objets) :
//   { "table": "<chemin relatif à la déclaration>",
//     "compteurs": [ { "id": "total", "libelle": "fichiers traités", "valeur": 12 },
//                    { "id": "ranges", "valeur": 9, "quand": { "statut": "range" } },
//                    { "id": "part", "valeur": 75, "part": { "de": "ranges", "sur": "total" }, "decimales": 0 } ] }
// `quand` : égalité de chaînes (espaces de bord retirés), un tableau vaut « l'une de ces valeurs »,
// plusieurs colonnes valent « toutes » ; absent, toutes les lignes comptent. `part` : pourcentage
// 100 × de / sur, arrondi à `decimales` (0 par défaut), entre deux compteurs déclarés.
//
// RÈGLES : K1 un compteur se recalcule — `valeur` numérique, colonnes de `quand` présentes dans la
// table, `part` qui nomme deux compteurs déclarés ; K2 un compte recalculé égale la valeur affichée ;
// K3 une part recalculée égale la valeur affichée, à sa précision, et jamais sur un dénominateur nul.
// SKIP motivé : déclaration ou table illisible, aucun compteur déclaré — jamais un PASS.
//
// Usage : node oracle-compteurs-synthese.mjs <declaration.json>
// Contrat JSON commun {oracle, domaine, artefact, verdict, findings[], non_juge[]} · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { ecrivainDeContrat } from './lib/contrat.mjs';
const contratJSON = ecrivainDeContrat({ info: true });

const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOM = 'Sortie automatisée de tri, de classement ou de rédaction';
const NJ = [
  'que la synthèse AFFICHE les valeurs déclarées : la déclaration est écrite par ce qui produit la page, le lien page ↔ déclaration reste à sa charge',
  'que la TABLE soit juste : un compteur exact sur une table fausse passe — la justesse se mesure sur un échantillon étiqueté hors du système (PC-1, PC-2)',
  'PC-1 à PC-5 (justesse, échantillon indépendant, gravité, recoupement, cas d\'échec des règles) : ils demandent le métier, aucun oracle ici ne les joue',
];
const emit = (verdict, findings) => {
  process.stdout.write(contratJSON({ oracle: 'oracle-compteurs-synthese', domaine: DOM, artefact: file || null, verdict, findings, non_juge: NJ }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
};
const skip = (msg) => emit('SKIP', [{ sev: 'info', msg }]);
if (!file || !fs.existsSync(file)) skip('déclaration de compteurs absente : ' + (file || '(aucun argument)'));

let decl;
try { decl = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { skip('déclaration illisible (JSON) : ' + e.message); }
if (!decl || typeof decl.table !== 'string' || !decl.table.trim()) skip('la déclaration ne nomme pas sa table (`table`) : rien à recalculer');
const compteurs = Array.isArray(decl.compteurs) ? decl.compteurs : [];
if (!compteurs.length) skip('aucun compteur déclaré (`compteurs` vide ou absent) : rien à recalculer');
const cheminTable = path.resolve(path.dirname(file), decl.table);

/** Lignes CSV (guillemets doubles, séparateur `,` ou `;` lu sur l'en-tête) → objets. */
function lireCsv(texte) {
  const sep = (texte.split(/\r?\n/, 1)[0].match(/;/g) || []).length > (texte.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ';' : ',';
  const lignes = []; let champ = '', ligne = [], guill = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guill) { if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') guill = false; else champ += c; continue; }
    if (c === '"') guill = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texte[i + 1] === '\n') i++; ligne.push(champ); champ = ''; if (ligne.some(x => x !== '')) lignes.push(ligne); ligne = []; }
    else champ += c;
  }
  ligne.push(champ); if (ligne.some(x => x !== '')) lignes.push(ligne);
  const [entete, ...corps] = lignes;
  return { colonnes: (entete || []).map(x => x.trim()), lignes: corps.map(l => Object.fromEntries((entete || []).map((h, j) => [h.trim(), l[j] ?? '']))) };
}
let table;
try {
  const brut = fs.readFileSync(cheminTable, 'utf8').replace(/^﻿/, '');
  if (/\.json$/i.test(cheminTable)) {
    const j = JSON.parse(brut);
    if (!Array.isArray(j) || j.some(x => !x || typeof x !== 'object')) throw new Error('un tableau d\'objets est attendu');
    table = { colonnes: [...new Set(j.flatMap(Object.keys))], lignes: j };
  } else table = lireCsv(brut);
} catch (e) { skip('table illisible (' + decl.table + ') : ' + e.message); }

const findings = [];
const ou = (c, i) => path.basename(file) + ' · compteur ' + (c && c.id ? '« ' + c.id + ' »' : 'n° ' + (i + 1));
const egal = (cellule, attendu) => String(cellule ?? '').trim() === String(attendu).trim();
const comptes = new Map();
// Passe 1 : les comptes (K1, K2). Passe 2 : les parts (K1, K3), qui lisent les comptes recalculés.
compteurs.forEach((c, i) => {
  if (!c || typeof c !== 'object' || c.part) return;
  if (typeof c.valeur !== 'number' || !Number.isFinite(c.valeur)) { findings.push({ sev: 'bloquant', regle: 'K1', msg: 'valeur affichée non numérique (' + JSON.stringify(c && c.valeur) + ') : le compteur ne se recalcule pas', where: ou(c, i) }); return; }
  const quand = c.quand && typeof c.quand === 'object' ? c.quand : {};
  const absentes = Object.keys(quand).filter(k => !table.colonnes.includes(k));
  if (absentes.length) { findings.push({ sev: 'bloquant', regle: 'K1', msg: 'colonne(s) ' + absentes.map(k => '« ' + k + ' »').join(', ') + ' absente(s) de la table ' + decl.table + ' : le compteur ne se recalcule pas', where: ou(c, i) }); return; }
  const n = table.lignes.filter(l => Object.entries(quand).every(([k, v]) => (Array.isArray(v) ? v : [v]).some(x => egal(l[k], x)))).length;
  if (c.id) comptes.set(c.id, n);
  if (n !== c.valeur) findings.push({ sev: 'bloquant', regle: 'K2', msg: 'compte affiché ' + c.valeur + ', recalculé ' + n + ' depuis ' + decl.table + (c.libelle ? ' (' + c.libelle + ')' : ''), where: ou(c, i) });
});
compteurs.forEach((c, i) => {
  if (!c || typeof c !== 'object' || !c.part) return;
  const { de, sur } = c.part;
  if (typeof c.valeur !== 'number' || !Number.isFinite(c.valeur)) { findings.push({ sev: 'bloquant', regle: 'K1', msg: 'part affichée non numérique (' + JSON.stringify(c.valeur) + ')', where: ou(c, i) }); return; }
  if (!comptes.has(de) || !comptes.has(sur)) { findings.push({ sev: 'bloquant', regle: 'K1', msg: 'la part nomme ' + JSON.stringify(de) + ' sur ' + JSON.stringify(sur) + ', qui ne sont pas deux compteurs déclarés et recalculés : elle ne se recalcule pas', where: ou(c, i) }); return; }
  const d = Number.isInteger(c.decimales) && c.decimales >= 0 ? c.decimales : 0;
  if (comptes.get(sur) === 0) { findings.push({ sev: 'bloquant', regle: 'K3', msg: 'part affichée ' + c.valeur + ' % sur un dénominateur nul (« ' + sur + ' » = 0)', where: ou(c, i) }); return; }
  const recalc = Number((100 * comptes.get(de) / comptes.get(sur)).toFixed(d));
  if (recalc !== Number(c.valeur.toFixed(d)) || c.valeur !== Number(c.valeur.toFixed(d)))
    findings.push({ sev: 'bloquant', regle: 'K3', msg: 'part affichée ' + c.valeur + ' %, recalculée ' + recalc + ' % (' + comptes.get(de) + ' / ' + comptes.get(sur) + ', ' + d + ' décimale(s))' + (c.libelle ? ' (' + c.libelle + ')' : ''), where: ou(c, i) });
});

if (findings.length) emit('FAIL', findings);
emit('PASS', [{ sev: 'info', msg: compteurs.length + ' compteur(s) recalculé(s) depuis ' + decl.table + ' (' + table.lignes.length + ' ligne(s)) : 0 écart', where: path.basename(file) }]);
