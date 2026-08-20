#!/usr/bin/env node
// oracle-dossier-cab — Domaine « Dossier CAB (DOCX, template Client-A) ».
// Observe l'artefact réel : ouvre le .docx (zip), lit word/document.xml + word/styles.xml
// + word/numbering.xml et juge le dossier tel qu'il sera lu par le CAB.
//
// Checklist canonique (v1.0) :
//   C1 sections obligatoires du template présentes (§1 à §4, points de contrôle, e-mails FR + EN)
//   C2 tableau d'en-tête : « Nom du changement », « Demandeur », « Date prévue » présents ET renseignés
//   C3 aucun placeholder ni consigne du template laissés tels quels
//   C4 chaque section §1 à §4 porte du contenu (>= 3 paragraphes)
//   C5 cohérence date : nom de fichier CAB_AAAA-MM-JJ_* == date prévue du tableau d'en-tête
//   C6 règle Easyvista J+5 (si --depot AAAA-MM-JJ fourni)
//   C7 numérotation Word : deux listes numérotées séparées par un titre ne partagent pas le même
//      numId (sinon la 2e ne redémarre pas à 1 dans Word)
//   C8 marqueurs [À COMPLÉTER] / [À CONFIRMER] recensés (warn : assumés, mais jamais silencieux)
//   C9 charte : les titres portent la couleur Client-A (77C043) en mise en forme directe — les styles
//      Titre1/2/3 portent le bleu Word par défaut (365F91 / 4F81BD), qui ressort dès qu'un titre
//      est recréé sans réappliquer la couleur (défaut observé le 20/08/2026 sur le dossier MEP)
//
// Usage : node oracle-dossier-cab.mjs <fichier.docx> [--depot AAAA-MM-JJ] [--couleur-titres RRGGBB]
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const depotArg = (() => { const i = args.indexOf('--depot'); return i >= 0 ? args[i + 1] : null; })();
const couleurArg = (() => { const i = args.indexOf('--couleur-titres'); return i >= 0 ? args[i + 1] : null; })();
const COULEUR_TITRES = (couleurArg || '77C043').toUpperCase();
const DOM = 'Dossier CAB (DOCX, template Client-A)';
const NJ = [
  'rendu réel (pagination, veuves/orphelines, débordements) — non ouvert dans Word',
  'exactitude factuelle du contenu (noms de ressources, pipelines, coûts) vis-à-vis du SI',
  'orthographe, style rédactionnel et validité des URL',
  'conformité de la fenêtre au calendrier partagé des déploiements',
  'charte des blocs non-titres (corps, listes, tableaux) : seule la couleur des titres est jugée',
];
const out = (verdict, findings, nj, code) => {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-dossier-cab', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj }));
  process.exit(code);
};

if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
if (path.extname(file).toLowerCase() !== '.docx') out('SKIP', [], ['extension non gérée'], 2);

// ---------------------------------------------------------------- lecture zip (sans dépendance)
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65557; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const map = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    map.set(name, { method, csize, lho });
    off += 46 + nlen + elen + clen;
  }
  return map;
}
function readEntry(buf, e) {
  if (buf.readUInt32LE(e.lho) !== 0x04034b50) return null;
  const nlen = buf.readUInt16LE(e.lho + 26);
  const elen = buf.readUInt16LE(e.lho + 28);
  const start = e.lho + 30 + nlen + elen;
  const raw = buf.subarray(start, start + e.csize);
  return e.method === 8 ? zlib.inflateRawSync(raw).toString('utf8') : raw.toString('utf8');
}

const buf = fs.readFileSync(file);
const base = path.basename(file);
const entries = zipEntries(buf);
if (!entries) out('FAIL', [{ sev: 'bloquant', msg: 'fichier .docx illisible (archive zip invalide)', where: base }], NJ, 1);
for (const req of ['word/document.xml', 'word/styles.xml']) {
  if (!entries.has(req)) out('FAIL', [{ sev: 'bloquant', msg: `entrée ${req} absente — document Word invalide`, where: base }], NJ, 1);
}
const docXml = readEntry(buf, entries.get('word/document.xml'));
const stylesXml = readEntry(buf, entries.get('word/styles.xml'));
if (!docXml || !stylesXml) out('FAIL', [{ sev: 'bloquant', msg: 'contenu XML du document illisible (décompression échouée)', where: base }], NJ, 1);

// ---------------------------------------------------------------- helpers XML
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const norm = s => decode(s)
  .replace(/[‘’ʼ]/g, "'")
  .replace(/[–—]/g, '-')
  .replace(/ /g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const deaccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const paraText = p => {
  const t = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');
  return norm(t);
};

// styleId -> nom lisible ; styleId -> numId hérité
const styleName = new Map(), styleNum = new Map();
for (const m of stylesXml.matchAll(/<w:style [^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
  const [, sid, body] = m;
  const n = body.match(/<w:name w:val="([^"]+)"/);
  if (n) styleName.set(sid, n[1]);
  const num = body.match(/<w:numId w:val="(\d+)"/);
  if (num) styleNum.set(sid, num[1]);
}

// paragraphes du corps (hors tableaux) + tableaux
const body = docXml.slice(docXml.indexOf('<w:body>'));
const bodyNoTables = body.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '');
const paras = [...bodyNoTables.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(m => {
  const xml = m[0];
  const sid = (xml.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || 'Normal';
  const inline = (xml.match(/<w:numPr>[\s\S]*?<w:numId w:val="(\d+)"/) || [])[1] || null;
  return { xml, sid, style: styleName.get(sid) || sid, text: paraText(xml), numId: inline || styleNum.get(sid) || null };
});

const findings = [];
const isHeading = p => /^(heading|titre) ?[1-9]$/i.test(p.style) || /^(Heading|Titre)[1-9]$/.test(p.sid);
const level = p => Number((p.style.match(/(\d)/) || p.sid.match(/(\d)/) || [])[1] || 0);
const headings = paras.filter(isHeading);
const H = headings.map(p => deaccent(p.text));

// ---------------------------------------------------------------- C1 sections obligatoires
const requis = [
  ['1. descriptif de la demande', /^1\..*descriptif de la demande/],
  ['2. mode operatoire de deploiement', /^2\..*mode operatoire de deploiement/],
  ['points de controle qualite', /points de controle qualite/],
  ['3. etapes de rollback', /^3\..*(etapes de rollback|rollback)/],
  ['4. plan de communication', /^4\..*plan de communication/],
  ['modele e-mail francais', /(modele|exemple).*(email|e-mail).*francais/],
  ['modele e-mail english', /(modele|exemple).*(email|e-mail).*english/],
];
for (const [libelle, rx] of requis) {
  if (!H.some(h => rx.test(h))) findings.push({ sev: 'bloquant', msg: `section obligatoire du template absente : « ${libelle} »`, where: base });
}

// ---------------------------------------------------------------- C2 tableau d'en-tête
const tbl = (body.match(/<w:tbl>[\s\S]*?<\/w:tbl>/) || [])[0] || '';
const rows = [...tbl.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map(m => {
  const cells = [...m[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(c => norm([...c[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x => x[1]).join('')));
  return cells;
});
const rowOf = label => rows.find(r => r.length >= 2 && deaccent(r[0]).startsWith(deaccent(label)));
let datePrevue = null;
for (const label of ['Nom du changement', 'Demandeur', 'Date prévue']) {
  const r = rowOf(label);
  if (!r) findings.push({ sev: 'bloquant', msg: `ligne « ${label} » absente du tableau d'en-tête`, where: base + ':tableau' });
  else if (!r[1] || r[1].length < 3) findings.push({ sev: 'bloquant', msg: `ligne « ${label} » non renseignée dans le tableau d'en-tête`, where: base + ':tableau' });
  else if (label === 'Date prévue') datePrevue = r[1];
}

// ---------------------------------------------------------------- C3 placeholders / consignes du template
const PLACEHOLDERS = [
  '[Date du changement]', '[Description du changement]', '[Sujet changement]', '[description du changement]',
  '[date]', '[scope]', '[Détail]', '[Nom / équipe]', '[Change deployment notification]',
  '[change description]', '[environment]', '[Details]', '[Name / Team]',
];
const CONSIGNES = [
  'Décrire les points suivants',
  'Indiquer le déroulé détaillé du déploiement',
  'Ajouter les vérifications avant/pendant/après',
  'Indiquer le plan de retour arrière en cas d',
  'Lister les équipes, managers, prestataires concernés',
];
const allText = paras.map(p => p.text).concat(rows.flat());
allText.forEach((t, i) => {
  for (const ph of PLACEHOLDERS) if (t.includes(ph)) findings.push({ sev: 'bloquant', msg: `placeholder du template non remplacé : « ${ph} »`, where: `${base}:bloc ${i + 1}` });
  for (const c of CONSIGNES) if (deaccent(t).includes(deaccent(c))) findings.push({ sev: 'bloquant', msg: `consigne du template laissée telle quelle : « ${c}… »`, where: `${base}:bloc ${i + 1}` });
});

// ---------------------------------------------------------------- C4 sections non vides
const idx = paras.map((p, i) => ({ p, i })).filter(x => isHeading(x.p) && level(x.p) <= 2);
for (const [libelle, rx] of requis.slice(0, 5)) {
  const startIdx = idx.findIndex(x => rx.test(deaccent(x.p.text)));
  if (startIdx < 0) continue;
  const start = idx[startIdx].i;
  const end = idx.slice(startIdx + 1).find(x => level(x.p) <= 2)?.i ?? paras.length;
  const contenu = paras.slice(start + 1, end).filter(p => !isHeading(p) && p.text.length > 0);
  if (contenu.length < 3) findings.push({ sev: 'bloquant', msg: `section « ${libelle} » quasi vide (${contenu.length} paragraphe(s) de contenu)`, where: base });
}

// ---------------------------------------------------------------- C5 / C6 dates
const FR = /(\d{2})\/(\d{2})\/(\d{4})/;
const fileDate = base.match(/CAB[_-](\d{4})-(\d{2})-(\d{2})/);
const njDates = [];
if (datePrevue) {
  const m = datePrevue.match(FR);
  if (!m) njDates.push('date prévue non exprimée en JJ/MM/AAAA — cohérence de date non jugée');
  else {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    if (fileDate) {
      const isoFile = `${fileDate[1]}-${fileDate[2]}-${fileDate[3]}`;
      if (isoFile !== iso) findings.push({ sev: 'bloquant', msg: `incohérence de date : nom de fichier ${isoFile} ≠ date prévue ${iso}`, where: base });
    } else njDates.push('nom de fichier hors convention CAB_AAAA-MM-JJ_* — cohérence nom/date non jugée');
    if (depotArg && /^\d{4}-\d{2}-\d{2}$/.test(depotArg)) {
      const delta = Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(depotArg + 'T00:00:00Z')) / 86400000);
      if (delta < 5) findings.push({ sev: 'bloquant', msg: `règle Easyvista non respectée : implémentation à J+${delta} du dépôt (minimum J+5)`, where: base });
    } else njDates.push('règle Easyvista J+5 non jugée (option --depot AAAA-MM-JJ non fournie)');
  }
} else njDates.push('date prévue absente — règles de date non jugées');

// ---------------------------------------------------------------- C7 numérotation Word
const runs = [];
let cur = null;
for (const p of paras) {
  const numbered = /^list ?number/i.test(p.style) || /^Listenumros/i.test(p.sid);
  if (numbered) { if (!cur) { cur = { numId: p.numId, first: p.text }; runs.push(cur); } }
  else if (isHeading(p)) cur = null;               // un titre ferme la liste en cours
  else if (cur && !/^(Normal|Corps de texte|Body Text)$/.test(p.style)) cur = null;
}
const seen = new Map();
for (const r of runs) {
  if (r.numId == null) continue;
  if (seen.has(r.numId)) {
    findings.push({ sev: 'bloquant', msg: `deux listes numérotées séparées par un titre partagent le numId ${r.numId} : la seconde (« ${r.first.slice(0, 50)}… ») ne redémarrera pas à 1 dans Word`, where: base });
  } else seen.set(r.numId, r.first);
}

// ---------------------------------------------------------------- C8 marqueurs assumés
const marqueurs = allText.reduce((n, t) => n + (t.match(/\[À (COMPLÉTER|CONFIRMER|CRÉER|VÉRIFIER)/gi) || []).length, 0);
if (marqueurs) findings.push({ sev: 'warn', msg: `${marqueurs} marqueur(s) [À COMPLÉTER / À CONFIRMER / À CRÉER] restant(s) — à lever avant le dépôt SharePoint (toute modification après envoi de la demande = refus)`, where: base });

// ---------------------------------------------------------------- C9 charte des titres
const titresSansCouleur = headings.filter(p => p.text.length > 0 && !new RegExp('<w:color w:val="' + COULEUR_TITRES + '"', 'i').test(p.xml));
if (headings.length && titresSansCouleur.length) {
  const bleuWord = titresSansCouleur.some(p => /<w:color w:val="(365F91|4F81BD)"/i.test(p.xml));
  findings.push({
    sev: 'bloquant',
    msg: `${titresSansCouleur.length}/${headings.length} titre(s) sans la couleur de charte ${COULEUR_TITRES}` +
      (bleuWord ? ' (couleur bleu Word explicite trouvée)' : ' (les styles Titre1/2/3 rendront alors le bleu Word par défaut)') +
      ` — 1er : « ${titresSansCouleur[0].text.slice(0, 50)} »`,
    where: base,
  });
}

// ---------------------------------------------------------------- verdict
const NJALL = NJ.concat(njDates);
const bloquants = findings.filter(f => f.sev === 'bloquant');
if (bloquants.length) out('FAIL', findings, NJALL, 1);
out('PASS', [{ sev: 'info', msg: `structure du template conforme (${requis.length} sections), en-tête renseigné, ${runs.length} liste(s) numérotée(s) contrôlée(s), aucun placeholder résiduel, titres à la couleur de charte ${COULEUR_TITRES}`, where: base }, ...findings], NJALL, 0);
