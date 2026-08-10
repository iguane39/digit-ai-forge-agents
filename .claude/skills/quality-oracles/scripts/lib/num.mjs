// lib/num — parsing des nombres affichés et libellés de totaux (source unique).
// Extrait d'oracle-calculs v1 (comportement inchangé) ; consommé par oracle-calculs,
// oracle-claims (normalisation) et oracle-coherence.

// nombre affiché → valeur | null. Milliers espace/nbsp/étroit, virgule OU point décimal
// (heuristique : séparateur + 3 chiffres = milliers), €, $, %, k€/K€ (×1000).
export function parseNum(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\u00a0|\u202f/g, ' ');
  let mult = 1;
  if (/k€|k\$|K€|K\$/.test(s)) mult = 1000;
  s = s.replace(/[€$%]|k€|k\$|K€|K\$/gi, '').replace(/\s+/g, '').trim();
  if (!s || !/^[+-]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
  if (lastC >= 0 && lastD >= 0) {                       // les deux présents : le dernier est décimal
    const dec = Math.max(lastC, lastD), decCh = s[dec];
    s = s.split(decCh === ',' ? '.' : ',').join('');    // retire les milliers
    s = s.replace(decCh === ',' ? ',' : '.', '.');
  } else if (lastC >= 0 || lastD >= 0) {                // un seul séparateur : 3 chiffres après = milliers
    const i = Math.max(lastC, lastD), after = s.length - i - 1, seps = (s.match(/[.,]/g) || []).length;
    if (seps > 1 || after === 3) s = s.replace(/[.,]/g, '');
    else s = s.replace(/[.,]/, '.');
  }
  const v = Number(s);
  return Number.isFinite(v) ? v * mult : null;
}

// unité canonique d'une valeur affichée (pour rapprochements inter-documents) :
// k€ est ramené à € par parseNum (×1000) → même unité '€'.
export function uniteOf(raw) {
  const s = String(raw || '');
  if (/k?€|K€|k?\$/i.test(s)) return '€';
  if (/%/.test(s)) return '%';
  if (/\bj\.?h\.?\b|jours?[- ]hommes?|\bj\/h\b/i.test(s)) return 'jh';
  if (/\bj(?:ours?)?\b/i.test(s)) return 'j';
  return '';
}

const clean = c => String(c || '').trim().replace(/[*_`]/g, '');
export const isTotalLabel = c => /^(total|totaux|somme|sous[- ]?total)\b/i.test(clean(c));
export const isGrandTotalLabel = c => /^(total\s+g[ée]n[ée]ral|grand\s+total)\b/i.test(clean(c));
