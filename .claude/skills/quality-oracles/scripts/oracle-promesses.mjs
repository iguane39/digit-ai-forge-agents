#!/usr/bin/env node
// oracle-promesses — Domaine « Promesses d'un texte dérivé des faits du produit : équipements
// absents, distances, capacités (référentiel déclaré par le produit) » (TF-1365, 26/09/2026).
//
// LE FAIT (lot Produit-02 - RETOURS - 20260922a, RT-97). Le produit tenait une garde de
// vocabulaire qui refusait « spa » et « jacuzzi » sur ses PAGES ; le générateur de ses ANNONCES
// ne l'appelait pas, et ses propres contrôles (longueurs, pages d'arrivée) passaient. Deux
// mots-clés « spa » ont été achetés alors que le domaine n'a pas de spa — c'est l'exploitant qui
// l'a vu. La veille, la même classe avait été corrigée à la main, sans règle : deux mots-clés
// « piscine privée » (la piscine est partagée) et une distance de 10 minutes là où le site dit
// 15. Une garde câblée à une étape sur deux ne protège qu'une étape sur deux.
//
// LA RÉPONSE : les promesses se déclarent UNE fois, par le produit, dans un référentiel de DONNÉES
// (loi n° 4 — daté, sourcé, éditable), et CHAQUE texte dérivé des mêmes faits — pages, annonces,
// fiche d'établissement, livrets — se juge contre lui, par le même oracle.
//
// LE RÉFÉRENTIEL, `promesses.json` — le format le plus simple qui tienne les trois familles :
//   {
//     "format": "quality-oracles/promesses@1",
//     "source": "<d'où viennent ces faits, et quand ils ont été relevés>",
//     "absents":   [ { "equipement": "spa", "termes": ["spa", "jacuzzi"], "motif": "…" } ],
//     "distances": [ { "lieu": "…", "termes": ["du Phare"], "valeur": 15, "unite": "min" } ],
//     "capacites": [ { "objet": "personnes", "termes": ["personnes", "voyageurs"], "max": 6 } ]
//   }
// `unite` vaut « min » ou « km ». Chaque famille est optionnelle : une famille absente n'est pas
// jugée, et le non_juge le dit.
//
// CE QUI EST JUGÉ, sur des fichiers texte (.csv, .tsv, .html, .htm, .md, .txt) :
//   P1 un terme d'un équipement ABSENT apparaît comme promesse (mot entier, sans casse ni accents) ;
//   P2 une distance annoncée PLUS COURTE que la distance déclarée vers le même lieu ;
//   P3 une capacité annoncée PLUS GRANDE que le maximum déclaré.
// Une mention NIÉE (« pas de spa », « sans jacuzzi », « ni spa ») n'est pas une promesse ; une
// ligne d'EXCLUSION d'un fichier d'annonces (une cellule « Négatif », « Negative … », « Exclusion »)
// non plus — exclure « spa » est précisément la correction de RT-97. Les deux sont COMPTÉES.
//
// Usage : node oracle-promesses.mjs <fichier|dossier> [--referentiel <promesses.json>]
//   Sans --referentiel : `promesses.json`, puis `donnees/promesses.json`, dans le dossier de la
//   cible puis dans ses parents. Introuvable → SKIP motivé, jamais un PASS.
// Contrat JSON commun {oracle, domaine, artefact, verdict, findings[], non_juge[], mesure} · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ info: true });

const DOM = "Promesses d'un texte dérivé des faits du produit : équipements absents, distances, capacités";
const EXT = new Set(['.csv', '.tsv', '.html', '.htm', '.md', '.txt']);
const IGNORES = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv']);
const NON_JUGE_BASE = [
  "la VÉRITÉ du référentiel : l'oracle confronte les textes aux faits DÉCLARÉS par le produit, il ne les vérifie pas sur le terrain",
  "une promesse formulée autrement que par les termes déclarés (synonyme, périphrase, image) : un terme absent du référentiel n'est pas vu",
  "une promesse d'un équipement PRÉSENT : l'oracle ne juge que ce qui manque, ce qui est rapproché ou ce qui est agrandi",
  "une négation plus lointaine que les trois mots qui précèdent le terme (« pas de », « sans », « ni », « aucun », « no », « without ») : elle compte comme une promesse — faux positif possible, jamais un faux négatif",
  "les textes hors .csv, .tsv, .html, .htm, .md, .txt (image, PDF, fiche d'établissement lue en ligne) : à exporter en texte pour être jugés",
];

const args = process.argv.slice(2);
const iRef = args.indexOf('--referentiel');
const refArg = iRef >= 0 ? args[iRef + 1] : null;
const cible = args.find((a, i) => !a.startsWith('--') && !(iRef >= 0 && i === iRef + 1)) || null;

function sortir(verdict, findings, nonJuge, mesure, code) {
  process.stdout.write(contratJSON({ oracle: 'oracle-promesses', version: '1.0.0', domaine: DOM,
    artefact: cible, verdict, findings, non_juge: nonJuge, mesure }) + '\n');
  process.exit(code);
}

if (!cible || !fs.existsSync(cible)) {
  sortir('SKIP', [{ sev: 'info', regle: 'P0', msg: 'usage : oracle-promesses.mjs <fichier|dossier> [--referentiel <promesses.json>]', where: String(cible) }],
    NON_JUGE_BASE, {}, 2);
}

// ---- le référentiel : désigné, sinon cherché au-dessus de la cible --------------------------
function pistesReferentiel() {
  if (refArg) return [path.resolve(refArg)];
  const pistes = [];
  let d = path.resolve(fs.statSync(cible).isDirectory() ? cible : path.dirname(cible));
  for (;;) {
    pistes.push(path.join(d, 'promesses.json'), path.join(d, 'donnees', 'promesses.json'));
    const parent = path.dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return pistes;
}
const pistes = pistesReferentiel();
const refPath = pistes.find((p) => fs.existsSync(p));
if (!refPath) {
  sortir('SKIP', [{ sev: 'info', regle: 'P0', msg: `aucun référentiel de promesses (pistes : ${pistes.slice(0, 6).join(' · ')}${pistes.length > 6 ? ' …' : ''}) — le produit déclare ses promesses dans promesses.json`, where: cible }],
    NON_JUGE_BASE, {}, 2);
}
let ref;
try { ref = JSON.parse(fs.readFileSync(refPath, 'utf8').replace(/^\uFEFF/, '')); }
catch (e) { sortir('FAIL', [{ sev: 'bloquant', regle: 'P0', msg: `référentiel illisible : ${e.message}`, where: refPath }], NON_JUGE_BASE, {}, 1); }

// ---- normalisation : sans casse, sans accents, apostrophes unifiées --------------------------
const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[’‘`´]/g, "'").toLowerCase();
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Frontière de mot UNICODE, jamais `\b` : `\b` est ASCII en JavaScript (piège P1 d'oracle-pieges-regex).
const motEntier = (terme) => new RegExp(`(?<![\\p{L}\\p{N}])${echapper(norm(terme)).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'gu');
const NEGATION = /(?:^|[^\p{L}])(?:pas d[e']|sans|ni|aucune?|no|without|non)\s*(?:[\p{L}']+\s+){0,2}$/u;
const EXCLUSION = /(?:^|[^\p{L}])(?:negati(?:f|ve)s?|exclusions?|exclure|exclu)(?![\p{L}])/u;

const absents = (ref.absents || []).map((a) => ({ ...a, re: (a.termes || []).map(motEntier) }));
const distances = (ref.distances || []).filter((d) => Number.isFinite(Number(d.valeur)))
  .map((d) => ({ ...d, valeur: Number(d.valeur), unite: norm(d.unite || 'min'), lieux: (d.termes || []).map(norm) }));
const capacites = (ref.capacites || []).filter((c) => Number.isFinite(Number(c.max)))
  .map((c) => ({ ...c, max: Number(c.max), re: (c.termes || []).map((t) => new RegExp(`(\\d+)\\s*(?:[\\p{L}']+\\s+){0,1}${echapper(norm(t))}(?![\\p{L}\\p{N}])`, 'gu')) }));
const RE_DISTANCE = /(\d+(?:[.,]\d+)?)\s*(minutes?|min|mn|kilometres?|km)(?![\p{L}])/gu;
const uniteDe = (u) => (/^(min|mn)/.test(u) ? 'min' : 'km');

// ---- lecture des fichiers : des segments { texte, ou } ----------------------------------------
const BASE = path.resolve(fs.statSync(cible).isDirectory() ? cible : path.dirname(cible));
function decoder(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}
function texteHtml(html) {
  const blanc = (m) => m.replace(/[^\n]/g, ' ');
  return html.replace(/<script[\s\S]*?<\/script>/gi, blanc).replace(/<style[\s\S]*?<\/style>/gi, blanc)
    .replace(/<!--[\s\S]*?-->/g, blanc).replace(/<[^>]+>/g, blanc)
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function cellulesCsv(texte) {
  const premiere = texte.split(/\r?\n/, 1)[0] || '';
  const sep = ['\t', ';', ','].map((s) => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = [];
  let ligne = [], cell = '', entre = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entre) {
      if (c === '"' && texte[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') entre = false;
      else cell += c;
    } else if (c === '"') entre = true;
    else if (c === sep) { ligne.push(cell); cell = ''; }
    else if (c === '\n') { ligne.push(cell.replace(/\r$/, '')); lignes.push(ligne); ligne = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || ligne.length) { ligne.push(cell); lignes.push(ligne); }
  return lignes;
}
function segments(fichier) {
  const texte = decoder(fs.readFileSync(fichier));
  const ext = path.extname(fichier).toLowerCase();
  // Relatif à la cible : deux fichiers homonymes de sous-dossiers différents restent discernables.
  const rel = (path.relative(BASE, fichier) || path.basename(fichier)).split(path.sep).join('/');
  if (ext === '.csv' || ext === '.tsv') {
    const lignes = cellulesCsv(texte);
    const entete = lignes[0] || [];
    const out = [];
    lignes.forEach((l, i) => {
      const exclusion = i > 0 && l.some((c) => EXCLUSION.test(norm(c)));
      l.forEach((c, j) => out.push({ texte: c, exclusion, ou: `${rel}:${i + 1}${entete[j] && i > 0 ? ` (${entete[j]})` : ''}` }));
    });
    return out;
  }
  const brut = ext === '.html' || ext === '.htm' ? texteHtml(texte) : texte;
  return brut.split(/\r?\n/).map((t, i) => ({ texte: t, exclusion: false, ou: `${rel}:${i + 1}` }));
}

// ---- le jugement -------------------------------------------------------------------------
const findings = [];
const mesure = { referentiel: refPath, fichiers: 0, segments: 0, promesses_dementies: 0, mentions_niees: 0, segments_exclusion: 0 };
function juger(fichier) {
  mesure.fichiers++;
  for (const s of segments(fichier)) {
    if (!s.texte || !s.texte.trim()) continue;
    mesure.segments++;
    const t = norm(s.texte);
    if (s.exclusion) { mesure.segments_exclusion++; continue; }
    // Un constat par équipement et par segment : « spa privatif » ne compte pas deux fois parce
    // que « spa » et « spa privatif » sont deux termes du même équipement.
    const cite = s.texte.replace(/\s+/g, ' ').trim().slice(0, 80);
    for (const a of absents) {
      let promis = null;
      a.re.forEach((re, k) => {
        re.lastIndex = 0;
        let m;
        while (!promis && (m = re.exec(t))) {
          if (NEGATION.test(t.slice(Math.max(0, m.index - 40), m.index))) { mesure.mentions_niees++; continue; }
          promis = a.termes[k];
        }
      });
      if (promis) findings.push({ sev: 'bloquant', regle: 'P1', where: s.ou,
        msg: `« ${cite} » promet « ${promis} » — équipement ABSENT au référentiel (${a.equipement}${a.motif ? ' : ' + a.motif : ''})` });
    }
    for (const m of t.matchAll(RE_DISTANCE)) {
      const valeur = Number(m[1].replace(',', '.'));
      const unite = uniteDe(m[2]);
      const autour = t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
      for (const d of distances) {
        if (d.unite !== unite || !d.lieux.some((l) => autour.includes(l))) continue;
        if (valeur < d.valeur) findings.push({ sev: 'bloquant', regle: 'P2', where: s.ou,
          msg: `« ${cite} » annonce ${m[1]} ${unite} — le référentiel déclare ${d.valeur} ${unite} pour ${d.lieu}` });
      }
    }
    for (const c of capacites) {
      for (const re of c.re) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(t))) {
          if (Number(m[1]) > c.max) findings.push({ sev: 'bloquant', regle: 'P3', where: s.ou,
            msg: `« ${cite} » annonce ${m[1]} ${c.objet} — le référentiel déclare au plus ${c.max}` });
        }
      }
    }
  }
}
function fichiersDe(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return EXT.has(path.extname(p).toLowerCase()) ? [p] : [];
  const out = [];
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (IGNORES.has(e.name) || /\.oracles[.-]/.test(e.name) || e.name.startsWith('.oracles')) continue;
    out.push(...fichiersDe(path.join(p, e.name)));
  }
  return out;
}

const cibles = fichiersDe(cible);
const nonJuge = [...NON_JUGE_BASE];
for (const [famille, liste] of [['absents', absents], ['distances', distances], ['capacites', capacites]]) {
  if (!liste.length) nonJuge.unshift(`famille « ${famille} » non déclarée au référentiel : non jugée`);
}
if (!cibles.length) {
  sortir('SKIP', [{ sev: 'info', regle: 'P0', msg: `aucun fichier texte jugeable (${[...EXT].join(', ')}) sous la cible`, where: cible }], nonJuge, mesure, 2);
}
for (const f of cibles) juger(f);
mesure.promesses_dementies = findings.length;
if (mesure.mentions_niees || mesure.segments_exclusion) {
  nonJuge.unshift(`${mesure.mentions_niees} mention(s) NIÉE(S) et ${mesure.segments_exclusion} cellule(s) de ligne d'EXCLUSION écartées : ce ne sont pas des promesses`);
}
if (findings.length) sortir('FAIL', findings, nonJuge, mesure, 1);
sortir('PASS', [{ sev: 'info', regle: 'P1-P3', msg: `${mesure.segments} segment(s) de ${mesure.fichiers} fichier(s) jugé(s) contre ${path.basename(refPath)} : aucune promesse démentie`, where: cible }], nonJuge, mesure, 0);
