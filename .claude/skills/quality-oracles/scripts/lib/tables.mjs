// lib/tables — extraction des tables markdown et HTML (source unique).
// Extrait d'oracle-calculs v1 (comportement inchangé) ; consommé par oracle-calculs
// et oracle-coherence. Retour : [{ rows: [{ cells: [...], line }], origin }].

export function extractTables(text, ext) {
  const tables = [];
  if (ext === '.html' || ext === '.htm') {
    const tbl = [...text.matchAll(/<table[\s\S]*?<\/table>/gi)];
    tbl.forEach((m, ti) => {
      const rows = [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(tr => ({
        cells: [...tr[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => c[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()),
        line: text.slice(0, m.index + tr.index).split('\n').length
      }));
      if (rows.length) tables.push({ rows, origin: 'table html #' + (ti + 1) });
    });
  } else {
    const lines = text.split('\n');
    let cur = null;
    const flush = () => { if (cur && cur.rows.length > 1) tables.push(cur); cur = null; };
    lines.forEach((l, i) => {
      if (/^\s*\|.*\|\s*$/.test(l)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) return;     // ligne séparatrice
        const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (!cur) cur = { rows: [], origin: 'table md l.' + (i + 1) };
        cur.rows.push({ cells, line: i + 1 });
      } else flush();
    });
    flush();
  }
  return tables;
}
