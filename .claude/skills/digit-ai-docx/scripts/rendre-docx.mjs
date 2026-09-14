#!/usr/bin/env node
// rendre-docx — rend un plan de document en .docx, sur la MARQUE de l'émetteur ou sur la TRAME
// imposée par un destinataire (digit-ai-docx, TF-1027). Node pur, zéro dépendance, déterministe.
//
// POURQUOI IL EXISTE. Une réponse à appel d'offres public impose souvent un mémoire technique en
// DOCX sur une trame fournie ; un kit partenaire ou un courrier fournisseur n'est pas un deck.
// digit-ai-propale déléguait « intégralement » le rendu à digit-ai-pptx : aucun skill ne savait
// rendre un document, et la méthode (references/PRODUCTION-OOXML.md du pilot : relevé de charte
// AVANT d'écrire, contrôle d'ordre bloquant AVANT remise) n'était outillée par personne.
//
// TROIS GESTES, dans l'ordre de PRODUCTION-OOXML.md :
//   --relever <trame.docx>        RELÈVE la charte d'une trame avant d'écrire : styles (id, nom),
//                                 polices, couleurs, médias, format de page, en-têtes et pieds.
//                                 Une charte se relève, elle ne se déduit jamais (TF-0687).
//   --plan <plan.json> --marque <dossier> --out <x.docx>
//                                 rend sur la marque de l'ÉMETTEUR (tokens.css du système de marque) ;
//                                 jeton requis absent → exit 2, JAMAIS une valeur en dur.
//   --plan <plan.json> --trame <trame.docx> --out <x.docx>
//                                 rend sur la TRAME : toutes ses parties sont gardées (styles,
//                                 thème, en-têtes, pieds, médias, format de page) et seul le CORPS
//                                 est remplacé ; les styles de titre sont retrouvés par leur nom.
// Puis, toujours : node oracle-docx.mjs <x.docx> — gate bloquante avant remise.
//
// Les titres du plan passent MOT POUR MOT : une rubrique imposée par un règlement de consultation
// se reprend à l'identique (oracle-exigences-ao, X2), le rendu ne renumérote rien.
//
// Plan (JSON) : { "titre": "…", "emetteur": "…", "sections": [ { "titre": "…", "niveau": 1|2,
//   "blocs": [ {"type":"paragraphe","texte":"…"}, {"type":"puces","items":["…"]},
//              {"type":"tableau","entetes":["…"],"lignes":[["…"]]} ] } ] }
// Exit : 0 = rendu (ou relevé) · 2 = usage, marque incomplète ou trame sans le style requis.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ecrireZip, lireZip } from './lib-zip.mjs';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_BASE = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
const LARGEUR_UTILE = 9072;   // A4 (11 906) moins deux marges de 1 417 twips (2,5 cm)

const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
class Refus extends Error {}

// ------------------------------------------------------------------ marque de l'émetteur
export function lireMarque(dossier) {
  const f = path.join(dossier, 'tokens.css');
  if (!fs.existsSync(f)) throw new Refus(`marque introuvable : ${f} — donner le dossier du système de marque de l'émetteur (tokens.css de systeme-de-marque)`);
  const css = fs.readFileSync(f, 'utf8');
  const racine = /:root\s*\{([^}]*)\}/.exec(css);
  const v = {};
  for (const m of (racine ? racine[1] : css).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) v[m[1]] = m[2].trim();
  const police = (nom) => (v[nom] || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  const hex = (nom) => {
    const brut = v[nom];
    if (!brut) return null;
    let m = /^#([0-9a-f]{6})$/i.exec(brut);
    if (m) return m[1].toUpperCase();
    m = /^#([0-9a-f]{3})$/i.exec(brut);
    if (m) return m[1].split('').map((c) => c + c).join('').toUpperCase();
    throw new Refus(`jeton --${nom} = « ${brut} » : seule une couleur hexadécimale se convertit en DOCX — la marque doit fournir sa valeur hex, le rendu n'en invente aucune`);
  };
  const accent = ['accent', 'blue', 'primary'].find((n) => v[n]);
  const manques = [];
  if (!police('sans')) manques.push('--sans (police du corps)');
  if (!police('head')) manques.push('--head (police des titres)');
  if (!v.ink) manques.push('--ink (couleur du texte)');
  if (!accent) manques.push('--accent, --blue ou --primary (couleur d\'accent)');
  if (manques.length) throw new Refus(`marque INCOMPLÈTE (${f}) : ${manques.join(', ')} — aucune valeur de repli en dur, le rendu rend la main`);
  return { corps: police('sans'), titres: police('head'), encre: hex('ink'), accent: hex(accent), filet: hex('line') || hex('muted') || hex('ink'), source: f };
}

// ------------------------------------------------------------------ corps du document
const run = (texte, gras = false) => `<w:r>${gras ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${x(texte)}</w:t></w:r>`;
const para = (texte, style = null, gras = false) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${run(texte, gras)}</w:p>`;

function tableau(bloc, styleTableau) {
  const n = Math.max(1, bloc.entetes.length);
  const col = Math.floor(LARGEUR_UTILE / n);
  const cellule = (t, gras) => `<w:tc><w:tcPr><w:tcW w:w="${col}" w:type="dxa"/></w:tcPr>${para(t, null, gras)}</w:tc>`;
  return `<w:tbl><w:tblPr>${styleTableau ? `<w:tblStyle w:val="${styleTableau}"/>` : ''}<w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`
    + `<w:tblGrid>${bloc.entetes.map(() => `<w:gridCol w:w="${col}"/>`).join('')}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${bloc.entetes.map((t) => cellule(t, true)).join('')}</w:tr>`
    + bloc.lignes.map((l) => `<w:tr>${bloc.entetes.map((_, i) => cellule(l[i] ?? '', false)).join('')}</w:tr>`).join('')
    + '</w:tbl>';
}

function corps(plan, styles) {
  const ecarts = [];
  const out = [];
  if (plan.titre) out.push(para(plan.titre, styles.titre));
  for (const s of plan.sections || []) {
    const niveau = s.niveau === 2 ? 2 : 1;
    if (!styles['h' + niveau]) throw new Refus(`aucun style de titre de niveau ${niveau} (« Heading ${niveau} » ou « Titre ${niveau} ») — le relevé de la trame doit le montrer, le rendu ne l'invente pas`);
    out.push(para(s.titre, styles['h' + niveau]));
    for (const b of s.blocs || []) {
      if (b.type === 'paragraphe') out.push(para(b.texte));
      else if (b.type === 'puces') {
        for (const it of b.items) out.push(styles.puce ? para(it, styles.puce) : para('– ' + it));
        if (!styles.puce) ecarts.push('puces rendues par un tiret : aucun style de liste à puces dans la trame');
      } else if (b.type === 'tableau') { out.push(tableau(b, styles.tableau)); out.push('<w:p/>'); }
      else throw new Refus(`bloc de type inconnu : ${b.type} (paragraphe, puces, tableau)`);
    }
  }
  return { xml: out.join(''), ecarts: [...new Set(ecarts)] };
}

// ------------------------------------------------------------------ rendu sur la marque
function stylesMarque(m) {
  const polices = (f) => `<w:rFonts w:ascii="${x(f)}" w:hAnsi="${x(f)}" w:cs="${x(f)}" w:eastAsia="${x(f)}"/>`;
  const titre = (id, nom, lvl, sz, couleur) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nom}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${lvl}"/></w:pPr><w:rPr>${polices(m.titres)}<w:b/><w:color w:val="${couleur}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  const bord = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="${m.filet}"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="${W}">`
    + `<w:docDefaults><w:rPrDefault><w:rPr>${polices(m.corps)}<w:color w:val="${m.encre}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr>${polices(m.titres)}<w:b/><w:color w:val="${m.accent}"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>`
    + titre('Heading1', 'heading 1', 0, 32, m.accent) + titre('Heading2', 'heading 2', 1, 26, m.encre)
    + '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:style>'
    + `<w:style w:type="table" w:styleId="TableauMarque"><w:name w:val="Tableau marque"/><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(bord).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`
    + '</w:styles>';
}

const NUMEROTATION = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

export function rendreSurMarque(plan, marque) {
  const { xml, ecarts } = corps(plan, { titre: 'Title', h1: 'Heading1', h2: 'Heading2', puce: 'ListBullet', tableau: 'TableauMarque' });
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${xml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const parties = [
    { nom: '[Content_Types].xml', donnees: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${CT_BASE}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${CT_BASE}.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="${CT_BASE}.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { nom: '_rels/.rels', donnees: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { nom: 'docProps/core.xml', donnees: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${x(plan.titre || '')}</dc:title><dc:creator>${x(plan.emetteur || '')}</dc:creator></cp:coreProperties>` },
    { nom: 'word/_rels/document.xml.rels', donnees: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/></Relationships>` },
    { nom: 'word/document.xml', donnees: doc },
    { nom: 'word/styles.xml', donnees: stylesMarque(marque) },
    { nom: 'word/numbering.xml', donnees: NUMEROTATION },
  ];
  return { buffer: ecrireZip(parties), ecarts };
}

// ------------------------------------------------------------------ trame imposée
function stylesDe(stylesXml) {
  return [...stylesXml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)].map((m) => ({
    id: (/w:styleId="([^"]*)"/.exec(m[1]) || [])[1],
    type: (/w:type="([^"]*)"/.exec(m[1]) || [])[1],
    nom: (/<w:name w:val="([^"]*)"/.exec(m[2]) || [])[1] || '',
  }));
}

export function relever(buf) {
  const p = lireZip(buf);
  const t = (n) => (p.has(n) ? p.get(n).toString('utf8') : '');
  const styles = stylesDe(t('word/styles.xml'));
  const doc = t('word/document.xml');
  const pg = /<w:pgSz\b([^>]*)\/>/.exec(doc);
  const mg = /<w:pgMar\b([^>]*)\/>/.exec(doc);
  return {
    styles,
    polices: [...new Set([...t('word/styles.xml').matchAll(/w:ascii="([^"]+)"/g), ...t('word/fontTable.xml').matchAll(/<w:font w:name="([^"]+)"/g)].map((m) => m[1]))],
    couleurs: [...new Set([...t('word/styles.xml').matchAll(/<w:color w:val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()))],
    medias: [...p.keys()].filter((n) => n.startsWith('word/media/')).map((n) => ({ partie: n, octets: p.get(n).length })),
    page: { taille: pg ? pg[1].trim() : null, marges: mg ? mg[1].trim() : null },
    en_tetes_pieds: [...p.keys()].filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)),
    correspondance: correspondance(styles),
  };
}

function correspondance(styles) {
  const par = (re, type = 'paragraph') => (styles.find((s) => s.type === type && re.test(s.nom)) || {}).id || null;
  return {
    titre: par(/^(title|titre)$/i),
    h1: par(/^(heading|titre)\s*1$/i),
    h2: par(/^(heading|titre)\s*2$/i),
    puce: par(/^(list bullet|liste à puces|liste a puces)$/i),
    tableau: par(/./, 'table'),
  };
}

export function rendreSurTrame(plan, trameBuf) {
  const p = lireZip(trameBuf);
  if (!p.has('word/document.xml') || !p.has('word/styles.xml')) throw new Refus('trame sans word/document.xml ou sans word/styles.xml : ce n\'est pas une trame DOCX exploitable');
  const doc = p.get('word/document.xml').toString('utf8');
  const racine = /<w:document\b[^>]*>/.exec(doc);
  const sect = [...doc.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].pop();
  if (!racine || !sect) throw new Refus('trame sans racine w:document ou sans w:sectPr : format de page et en-têtes introuvables');
  const styles = correspondance(stylesDe(p.get('word/styles.xml').toString('utf8')));
  const { xml, ecarts } = corps(plan, styles);
  const neuf = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${racine[0]}<w:body>${xml}${sect[0]}</w:body></w:document>`;
  const parties = [...p].map(([nom, donnees]) => ({ nom, donnees: nom === 'word/document.xml' ? neuf : donnees }));
  return { buffer: ecrireZip(parties), ecarts, styles };
}

function main(argv) {
  const args = argv.slice(2);
  const opt = (n) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null);
  try {
    if (opt('relever')) {
      process.stdout.write(JSON.stringify({ verbe: 'rendre-docx --relever', trame: opt('relever'), ...relever(fs.readFileSync(opt('relever'))) }, null, 2) + '\n');
      return 0;
    }
    if (!opt('plan') || !opt('out') || (!opt('marque') === !opt('trame'))) {
      console.error('usage : rendre-docx.mjs --relever <trame.docx> | --plan <plan.json> (--marque <dossier> | --trame <trame.docx>) --out <x.docx>');
      return 2;
    }
    const plan = JSON.parse(fs.readFileSync(opt('plan'), 'utf8'));
    const r = opt('marque') ? rendreSurMarque(plan, lireMarque(opt('marque'))) : rendreSurTrame(plan, fs.readFileSync(opt('trame')));
    fs.writeFileSync(opt('out'), r.buffer);
    process.stdout.write(JSON.stringify({ verbe: 'rendre-docx', ecrit: opt('out'), mode: opt('marque') ? 'marque' : 'trame', ecarts: r.ecarts,
      suite: `node ${path.join(path.dirname(fileURLToPath(import.meta.url)), 'oracle-docx.mjs')} ${opt('out')} — gate bloquante avant remise` }, null, 2) + '\n');
    return 0;
  } catch (e) {
    if (e instanceof Refus) { console.error('REFUS — ' + e.message); return 2; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv));
