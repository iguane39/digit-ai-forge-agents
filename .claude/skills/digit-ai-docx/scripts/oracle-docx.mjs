#!/usr/bin/env node
// oracle-docx — Domaine « Validité d'un paquet DOCX avant remise » (digit-ai-docx, TF-1027).
//
// LE FAIT QUI L'IMPOSE (TF-0686, 28/08/2026, rappelé par references/PRODUCTION-OOXML.md du
// pilot). Un paquet OOXML généré peut être invalide sans que RIEN ne le signale à la génération :
// la bibliothèque écrit un arbre hors schéma sans un mot, l'archive se déclare saine, et seul le
// logiciel du client découvre le défaut — en proposant une « réparation » qui perd du formatage
// en silence. Le contrôle se joue donc APRÈS génération et AVANT remise, en gate bloquante.
//
// CE QUE L'ORACLE JUGE sur un .docx :
//   D1 l'archive se lit (répertoire central, en-têtes locaux, décompression) ;
//   D2 [Content_Types].xml existe, déclare le document principal, et TOUTE partie a un type
//      (par extension ou par surcharge) ;
//   D3 toute relation interne (_rels/.rels, word/_rels/*.rels) désigne une partie PRÉSENTE ;
//   D4 toute partie XML est bien formée (balises équilibrées, une seule racine) ;
//   D5 l'ORDRE des enfants que Word exige et que rien ne signale à l'écriture : w:sectPr en
//      DERNIER de w:body ; w:pPr en PREMIER de w:p ; w:rPr en PREMIER de w:r ; w:tcPr en PREMIER
//      de w:tc ; w:tblPr puis w:tblGrid avant tout w:tr dans w:tbl ;
//   D6 l'ordre DrawingML (a:ln, a:rPr, a:defRPr — la classe payée sur un .pptx) est DÉLÉGUÉ au
//      contrôle du pilot `scripts/verifier-ooxml.py`, jamais réimplémenté ; pilot ou Python
//      introuvable → D6 NON JUGÉE et dite, jamais un PASS silencieux.
//
// Usage : node oracle-docx.mjs <document.docx>
// Contrat JSON commun {oracle, domaine, artefact, verdict, findings[], non_juge[], mesure} · exit 0/1/2.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lireZip } from './lib-zip.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DOM = "Validité d'un paquet DOCX avant remise";
export const NON_JUGE_BASE = [
  "l'OUVERTURE réelle dans Word : aucun Word sur le poste de recette — l'oracle contrôle les causes connues de réparation (D1-D6), pas l'exhaustivité du schéma OOXML",
  'la validité complète contre les schémas XSD de WordprocessingML (ce serait refaire un validateur) : D5 attrape les ordres dont le défaut est connu',
  'la CHARTE du document (polices, couleurs, grille) : le relevé se fait avant d\'écrire (`rendre-docx.mjs --relever`), sa fidélité se juge à l\'œil ou par un rendu',
];

/** Arbre minimal d'une partie XML : {racine} ou {erreur}. Suffit à D4 et D5. */
export function arbre(xml) {
  const s = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  const pile = [{ nom: '#doc', enfants: [] }];
  let m;
  let dernier = 0;
  while ((m = re.exec(s))) {
    const entre = s.slice(dernier, m.index);
    if (entre.includes('<')) return { erreur: `balise mal formée près de « ${entre.trim().slice(0, 40)} »` };
    dernier = re.lastIndex;
    const [, ferme, nom, , auto] = m;
    if (ferme) {
      const haut = pile.pop();
      if (!haut || haut.nom !== nom) return { erreur: `</${nom}> ferme <${haut ? haut.nom : '—'}>` };
    } else {
      const el = { nom, enfants: [] };
      pile[pile.length - 1].enfants.push(el);
      if (!auto) pile.push(el);
    }
  }
  if (s.slice(dernier).includes('<')) return { erreur: 'balise mal formée en fin de partie' };
  if (pile.length !== 1) return { erreur: `<${pile[pile.length - 1].nom}> jamais fermé` };
  if (pile[0].enfants.length !== 1) return { erreur: `${pile[0].enfants.length} racine(s) — une partie XML en a exactement une` };
  return { racine: pile[0].enfants[0] };
}

function ordre(el, partie, fautes, mesure) {
  const noms = el.enfants.map((e) => e.nom);
  const faute = (msg) => fautes.push({ sev: 'bloquant', where: partie, msg });
  if (['w:body', 'w:p', 'w:r', 'w:tc', 'w:tbl'].includes(el.nom)) mesure.elements++;
  if (el.nom === 'w:body') {
    const i = noms.lastIndexOf('w:sectPr');
    if (i >= 0 && i !== noms.length - 1) faute(`D5 — w:sectPr n'est pas le DERNIER enfant de w:body (${i + 1}e sur ${noms.length}) : Word propose une réparation`);
  }
  for (const [parent, premier] of [['w:p', 'w:pPr'], ['w:r', 'w:rPr'], ['w:tc', 'w:tcPr']]) {
    if (el.nom === parent) {
      const i = noms.indexOf(premier);
      if (i > 0) faute(`D5 — ${premier} en ${i + 1}e position dans un ${parent} : les propriétés viennent en PREMIER`);
    }
  }
  if (el.nom === 'w:tbl') {
    const ip = noms.indexOf('w:tblPr'), ig = noms.indexOf('w:tblGrid'), it = noms.indexOf('w:tr');
    if (ip < 0 || ig < 0) faute('D5 — w:tbl sans w:tblPr ou sans w:tblGrid, tous deux obligatoires');
    else if (!(ip < ig && (it < 0 || ig < it))) faute('D5 — w:tbl : ordre attendu w:tblPr → w:tblGrid → w:tr');
  }
  for (const c of el.enfants) ordre(c, partie, fautes, mesure);
}

const attr = (balise, nom) => { const m = new RegExp(`\\b${nom}\\s*=\\s*"([^"]*)"`).exec(balise); return m ? m[1] : null; };

function resoudre(base, cible) {
  if (cible.startsWith('/')) return cible.slice(1);
  return path.posix.normalize(path.posix.join(base, cible));
}

export function pistesPilot() {
  return [
    process.env.FORGE_ROOT ? path.join(process.env.FORGE_ROOT, 'digit-ai-factory') : null,
    path.resolve(ICI, '..', '..', '..', '..', '..', 'digit-ai-factory'),
    'C:/dev/digit-ai-factory',
    path.join(os.homedir(), '.digit-ai-forge', 'digit-ai-factory'),
  ].filter(Boolean);
}

/** Juge un paquet (Buffer). Rend {findings, non_juge, mesure}. */
export function juger(buf, nomFichier = 'document.docx', { deleguer = true, chemin = null } = {}) {
  const findings = [];
  const non_juge = [...NON_JUGE_BASE];
  const mesure = { parties: 0, parties_xml: 0, elements: 0 };
  const bloque = (regle, msg, where = nomFichier) => findings.push({ sev: 'bloquant', where, msg: `${regle} — ${msg}` });
  let parties;
  try { parties = lireZip(buf); } catch (e) { bloque('D1', `archive illisible : ${e.message}`); return { findings, non_juge, mesure }; }
  mesure.parties = parties.size;
  const texte = (n) => parties.get(n).toString('utf8');

  // D2 — types de contenu
  if (!parties.has('[Content_Types].xml')) bloque('D2', '[Content_Types].xml absent : aucun logiciel ne sait lire le paquet');
  const ct = parties.has('[Content_Types].xml') ? texte('[Content_Types].xml') : '';
  const defauts = new Set([...ct.matchAll(/<Default\b[^>]*>/g)].map((m) => (attr(m[0], 'Extension') || '').toLowerCase()));
  const surcharges = new Map([...ct.matchAll(/<Override\b[^>]*>/g)].map((m) => [(attr(m[0], 'PartName') || '').replace(/^\//, ''), attr(m[0], 'ContentType') || '']));
  for (const nom of parties.keys()) {
    if (nom.endsWith('/') || nom === '[Content_Types].xml') continue;
    // L'extension se lit après le DERNIER point du nom de fichier, points de tête compris :
    // `path.extname('_rels/.rels')` rend '' (fichier « caché »), alors que le type de contenu de
    // `.rels` est déclaré par extension (Default Extension="rels") dans tout paquet OOXML.
    const base = path.posix.basename(nom);
    const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
    if (!surcharges.has(nom) && !defauts.has(ext)) bloque('D2', `partie sans type de contenu : ${nom}`);
  }

  // D3 — relations
  let principal = null;
  for (const [nom] of parties) {
    if (!nom.endsWith('.rels')) continue;
    const base = nom === '_rels/.rels' ? '' : path.posix.dirname(path.posix.dirname(nom));
    for (const m of texte(nom).matchAll(/<Relationship\b[^>]*>/g)) {
      if (attr(m[0], 'TargetMode') === 'External') continue;
      const cible = resoudre(base, attr(m[0], 'Target') || '');
      if (nom === '_rels/.rels' && /\/officeDocument$/.test(attr(m[0], 'Type') || '')) principal = cible;
      if (!parties.has(cible)) bloque('D3', `relation ${attr(m[0], 'Id')} de ${nom} vers une partie ABSENTE : ${cible}`, nom);
    }
  }
  if (!principal) bloque('D3', "aucune relation officeDocument dans _rels/.rels : le document principal n'est pas désigné");
  else if (!/wordprocessingml\.(document|template)\.main\+xml/.test(surcharges.get(principal) || '')) bloque('D2', `le document principal ${principal} n'est pas déclaré de type WordprocessingML`);

  // D4 + D5 — parties XML
  for (const [nom] of parties) {
    if (!/\.(xml|rels)$/i.test(nom)) continue;
    mesure.parties_xml++;
    const a = arbre(texte(nom));
    if (a.erreur) { bloque('D4', `partie mal formée : ${a.erreur}`, nom); continue; }
    ordre(a.racine, nom, findings, mesure);
  }

  // D6 — délégation DrawingML au contrôle du pilot
  if (deleguer) {
    const pilot = pistesPilot().find((p) => fs.existsSync(path.join(p, 'scripts', 'verifier-ooxml.py')));
    if (!pilot) non_juge.unshift(`D6 NON JUGÉE : verifier-ooxml.py du pilot introuvable (pistes : ${pistesPilot().join(' · ')})`);
    else {
      let cible = chemin;
      let tmp = null;
      if (!cible) { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-docx-')); cible = path.join(tmp, 'paquet.docx'); fs.writeFileSync(cible, buf); }
      const r = spawnSync('python', [path.join(pilot, 'scripts', 'verifier-ooxml.py'), cible], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
      if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
      let v = null;
      try { v = JSON.parse(r.stdout); } catch { /* sortie illisible */ }
      if (!v) non_juge.unshift(`D6 NON JUGÉE : verifier-ooxml.py n'a pas rendu de verdict lisible (${(r.error && r.error.code) || 'exit ' + r.status})`);
      else {
        mesure.drawingml_controles = v.mesure ? v.mesure.elements_controles : null;
        if (v.verdict === 'FAIL') for (const f of v.findings) bloque('D6', `${f.element} : ${f.message}`, f.partie);
        else if (v.verdict !== 'PASS') non_juge.unshift(`D6 NON JUGÉE : verifier-ooxml.py rend ${v.verdict}`);
      }
    }
  }
  return { findings, non_juge, mesure };
}

function main(argv) {
  const file = argv.slice(2).find((a) => !a.startsWith('--'));
  const sortir = (verdict, code, r = { findings: [], non_juge: [...NON_JUGE_BASE], mesure: {} }) => {
    process.stdout.write(JSON.stringify({ oracle: 'oracle-docx', domaine: DOM, artefact: file || null, verdict, findings: r.findings, non_juge: r.non_juge, mesure: r.mesure }, null, 2) + '\n');
    return code;
  };
  if (!file || !fs.existsSync(file)) return sortir('SKIP', 2, { findings: [], non_juge: ['fichier absent', ...NON_JUGE_BASE], mesure: {} });
  if (path.extname(file).toLowerCase() !== '.docx') return sortir('SKIP', 2, { findings: [], non_juge: ['extension non gérée (.docx attendu)', ...NON_JUGE_BASE], mesure: {} });
  const r = juger(fs.readFileSync(file), path.basename(file), { chemin: path.resolve(file) });
  if (r.findings.length) return sortir('FAIL', 1, r);
  r.findings.push({ sev: 'info', where: path.basename(file), msg: `conforme : ${r.mesure.parties} parties, ${r.mesure.parties_xml} XML bien formées, ${r.mesure.elements} éléments d'ordre contrôlés` });
  return sortir('PASS', 0, r);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv));
