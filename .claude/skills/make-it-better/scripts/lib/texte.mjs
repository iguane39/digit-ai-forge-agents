// lib/texte.mjs — le texte d'une version, seule mesure commune aux 5 formats : mots, faits, écarts.
// Markdown et HTML se lisent ici ; Word, PowerPoint et PDF passent par formats.py.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { appelerFormats, extensionDe, formatDe } from './commun.mjs';

const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', euro: '€', deg: '°', middot: '·', times: '×', copy: '©', reg: '®', trade: '™',
  bull: '•', sect: '§', para: '¶', ensp: ' ', emsp: ' ', thinsp: ' ', shy: '', agrave: 'à', aacute: 'á', acirc: 'â', auml: 'ä',
  ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö', ugrave: 'ù',
  ucirc: 'û', uuml: 'ü', yuml: 'ÿ', oelig: 'œ', aelig: 'æ', Agrave: 'À', Acirc: 'Â', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É',
  Ecirc: 'Ê', Euml: 'Ë', Icirc: 'Î', Iuml: 'Ï', Ocirc: 'Ô', Ugrave: 'Ù', Ucirc: 'Û', OElig: 'Œ', AElig: 'Æ',
};

export function decoderEntites(t) {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+[0-9]*);/gi, (tout, c) => {
    if (c[0] === '#') {
      const n = c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : tout;
    }
    return ENTITES[c] ?? tout;
  });
}

/** Le texte d'une page : le visible, le titre, et les attributs qu'un lecteur voit ou entend. */
export function htmlEnTexte(html) {
  const sansBruit = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  const attributs = [];
  for (const m of sansBruit.matchAll(/\s(alt|title|aria-label|placeholder)\s*=\s*("([^"]*)"|'([^']*)')/gi)) attributs.push(m[3] ?? m[4] ?? '');
  for (const m of sansBruit.matchAll(/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*\bcontent\s*=\s*("([^"]*)"|'([^']*)')/gi)) attributs.push(m[2] ?? m[3] ?? '');
  const corps = sansBruit
    .replace(/<\/?(p|div|section|article|aside|header|footer|main|nav|h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|dl|dt|dd|figure|figcaption|blockquote|pre|br|hr|title|caption|summary|details|form|fieldset|legend|option|button|label)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decoderEntites([corps, ...attributs].join('\n')).replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** Le texte d'un Markdown : sans les marques de structure, numéros de liste et de titre compris. */
export function markdownEnTexte(md) {
  return md
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l) || !l.includes('-'))
    .map((l) => l
      .replace(/^\s{0,3}#{1,6}\s+(?:\d+(?:\.\d+)*[.)]?\s+)?/, '')
      .replace(/^\s*>+\s?/, '')
      .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '')
      .replace(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '$1 $2')
      .replace(/\|/g, ' ')
      .replace(/(\*\*|__|\*|`)/g, ''))
    .join('\n')
    .trim();
}

export function motsDe(texte) {
  return (texte.match(/\S+/gu) || []).filter((m) => /[\p{L}\p{N}]/u.test(m));
}
export const compterMots = (texte) => motsDe(texte).length;

/** Le texte d'un fichier, ou { erreur } : jamais un texte vide pris pour une lecture réussie. */
export function texteDeFichier(chemin, { complet = false } = {}) {
  const f = formatDe(chemin);
  const ext = extensionDe(chemin);
  try {
    if (f === 'md') return { texte: markdownEnTexte(readFileSync(chemin, 'utf8')) };
    if (f === 'html') return { texte: htmlEnTexte(readFileSync(chemin, 'utf8')) };
    if (['.txt', '.csv', '.tsv', '.json', '.jsonl', '.xml', '.yaml', '.yml'].includes(ext)) return { texte: readFileSync(chemin, 'utf8') };
  } catch (e) {
    return { erreur: `lecture impossible : ${e.message}` };
  }
  if (f === 'docx' || f === 'pptx' || f === 'pdf') {
    const r = appelerFormats(['texte', chemin, ...(complet ? ['--complet'] : [])]);
    if (r.code === null) return { erreur: 'Python introuvable, formats.py ne peut pas lire ce fichier', dependance: true };
    if (r.code === 3) return { erreur: r.json?.motif || 'dépendance absente', dependance: true };
    if (r.code !== 0) return { erreur: (r.stderr || 'texte illisible').trim() };
    return { texte: r.stdout };
  }
  return { erreur: `format de source non lu : ${ext || chemin}` };
}

function fichiersDe(dossier, prefixe = '') {
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...fichiersDe(join(dossier, e.name), `${prefixe}${e.name}/`));
    else out.push({ nom: `${prefixe}${e.name}`, chemin: join(dossier, e.name) });
  }
  return out;
}

/** Les textes de sources/ : { textes: [{nom, texte}], illisibles: [{nom, motif}] }. */
export function lireSources(dossier) {
  const textes = [];
  const illisibles = [];
  if (!dossier || !existsSync(dossier)) return { textes, illisibles };
  for (const { nom, chemin } of fichiersDe(dossier)) {
    const r = texteDeFichier(chemin, { complet: true });
    if (r.erreur) illisibles.push({ nom, motif: r.erreur });
    else if (!r.texte.trim()) illisibles.push({ nom, motif: 'aucun texte lisible (scan sans couche de texte ?)' });
    else textes.push({ nom, texte: r.texte });
  }
  return { textes, illisibles };
}
