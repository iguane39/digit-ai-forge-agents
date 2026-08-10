// lib/claims-extract — extraction des affirmations chiffrées labellisées (source unique).
// Extrait d'oracle-claims v1, étendu (v2.2) aux unités de charge j / j.h / jours-homme.
// Consommé par oracle-claims (cohérence intra-document) et oracle-coherence (inter-documents).

const STOP = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'du', 'de', 'des', 'au', 'aux', 'ce', 'cet', 'cette', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'apres', 'avec', 'pour', 'et']);

// libellé → clé normalisée (minuscules, sans accents, stop-words de tête retirés, 3 derniers mots)
export function normLabel(s) {
  let w = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  while (w.length > 1 && STOP.has(w[0])) w.shift();
  return w.slice(-3).join(' ');
}

export function numOf(s) {
  const t = String(s).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  const v = Number(t.replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(v) ? v : null;
}

// unité brute du pattern → unité canonique de rapprochement (k€ → € avec ×1000 sur la valeur)
export function canonUnit(u) {
  const s = (u || '').toLowerCase();
  if (s === 'k€') return { unit: '€', mult: 1000 };
  if (s === '€') return { unit: '€', mult: 1 };
  if (s === '%') return { unit: '%', mult: 1 };
  if (/^j\.?h\.?$|jours?-hommes?|j\/h/.test(s)) return { unit: 'jh', mult: 1 };
  if (/^j(?:ours?)?$/.test(s)) return { unit: 'j', mult: 1 };
  return { unit: s, mult: 1 };
}

// « Libellé : X unité » hors tables → [{ key, v, line, brut }]
// unités : € / k€ / % (v1) + j / jours / j.h / jours-homme / j/h (v2.2)
const LABELLED = /([A-Za-zÀ-ÿ'’ %()\/-]{4,60}?)\s*[:=]\s*(\d[\d\s\u00a0\u202f.,]*)\s*(k€|K€|€|%|(?:j\.?h\.?|jours?[- ]hommes?|j\/h|j(?:ours?)?)\b)/g;
export function extractLabelled(lines, isTableLine) {
  const out = [];
  lines.forEach((l, i) => {
    if (isTableLine(l)) return;
    for (const m of l.matchAll(LABELLED)) {
      const { unit, mult } = canonUnit(m[3]);
      const v = numOf(m[2]);
      if (v == null) continue;
      out.push({ key: normLabel(m[1]) + '|' + unit, v: v * mult, line: i + 1, brut: m[0].trim() });
    }
  });
  return out;
}
