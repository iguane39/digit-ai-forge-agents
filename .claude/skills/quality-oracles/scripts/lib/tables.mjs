// lib/tables — extraction des tables markdown et HTML (source unique).
// Extrait d'oracle-calculs v1 (comportement inchangé) ; consommé par oracle-calculs,
// oracle-coherence et oracle-claims. Retour : [{ rows: [{ cells: [...], line, entete }], origin,
// debut, fin, legende }]. TF-2358 (10/11/2026) : `debut` et `fin` (lignes de la première et de la
// dernière rangée, ou des balises <table>), `legende` (texte du <caption>, vide en Markdown) et
// `entete` (rangée faite de seuls <th>, ou première rangée d'un tableau Markdown) s'ajoutent pour
// oracle-claims, qui juge la source des montants d'un tableau ; les champs d'avant ne changent pas.

export function extractTables(text, ext) {
  const tables = [];
  if (ext === '.html' || ext === '.htm') {
    // Numéro de ligne par recherche dichotomique dans la table des sauts de ligne : le redécoupage
    // du texte à chaque rangée était quadratique (12 000 rangées sur une page de 430 Ko : 2 s par
    // appel, TF-1352, 24/09/2026). Même résultat : le nombre de sauts avant la position, plus un.
    const sauts = [];
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) sauts.push(i);
    const ligneDe = pos => { let lo = 0, hi = sauts.length; while (lo < hi) { const mi = (lo + hi) >> 1; if (sauts[mi] < pos) lo = mi + 1; else hi = mi; } return lo + 1; };
    const tbl = [...text.matchAll(/<table[\s\S]*?<\/table>/gi)];
    tbl.forEach((m, ti) => {
      const rows = [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(tr => ({
        cells: [...tr[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => c[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()),
        line: ligneDe(m.index + tr.index),
        entete: /<th\b/i.test(tr[0]) && !/<td\b/i.test(tr[0])
      }));
      const cap = m[0].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i);
      if (rows.length) tables.push({ rows, origin: 'table html #' + (ti + 1), debut: ligneDe(m.index), fin: ligneDe(m.index + m[0].length - 1),
        legende: cap ? cap[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '' });
    });
  } else {
    const lines = text.split('\n');
    let cur = null;
    const flush = () => { if (cur && cur.rows.length > 1) tables.push(cur); cur = null; };
    lines.forEach((l, i) => {
      if (/^\s*\|.*\|\s*$/.test(l)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) { if (cur) cur.fin = i + 1; return; }     // ligne séparatrice
        const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (!cur) cur = { rows: [], origin: 'table md l.' + (i + 1), debut: i + 1, fin: i + 1, legende: '' };
        cur.rows.push({ cells, line: i + 1, entete: cur.rows.length === 0 });
        cur.fin = i + 1;
      } else flush();
    });
    flush();
  }
  return tables;
}
