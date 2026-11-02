// lib/markdown.mjs — le convertisseur minimal de l'aperçu : titres, paragraphes, listes, tableaux,
// gras, italique, liens, code. Toute autre syntaxe reste en texte brut, et tout s'échappe d'abord :
// une version écrite par le modèle n'injecte aucune balise dans la page.

export const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const lienSur = (u) => /^(https?:|mailto:|#|\.{0,2}\/|[\w%-]+(\.[\w%-]+)*($|[/?#]))/i.test(u) && !/^(javascript|data|vbscript):/i.test(u);

function enLigne(texte) {
  // Le code d'abord : ce qu'il contient ne s'interprète pas.
  const codes = [];
  let t = texte.replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(`<code>${echapper(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  t = echapper(t);
  // Un lien vers `javascript:` n'est pas un lien : il reste du texte. Dans un cadre sans `allow-popups`,
  // target="_blank" ne s'ouvre pas : un clic ne quitte jamais l'aperçu.
  t = t.replace(/(^|[^!])\[([^\]\n]+)\]\(([^)\s]+)\)/g, (tout, av, label, url) => (lienSur(url.replace(/&amp;/g, '&'))
    ? `${av}<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : tout));
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\s][^*\n]*)\*/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\s][^_\n]*)_(?![\w])/g, '$1<em>$2</em>');
  // eslint-disable-next-line no-control-regex
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

const cellules = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const estSeparateur = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');

export function markdownEnHtml(md) {
  const lignes = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (!l.trim()) { i++; continue; }
    const cloture = /^\s*(```|~~~)/.exec(l);
    if (cloture) {
      const bloc = [];
      i++;
      while (i < lignes.length && !lignes[i].trim().startsWith(cloture[1])) bloc.push(lignes[i++]);
      i++;
      out.push(`<pre><code>${echapper(bloc.join('\n'))}</code></pre>`);
      continue;
    }
    const titre = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (titre) {
      const n = titre[1].length;
      out.push(`<h${n}>${enLigne(titre[2])}</h${n}>`);
      i++;
      continue;
    }
    if (l.includes('|') && i + 1 < lignes.length && estSeparateur(lignes[i + 1]) && lignes[i + 1].includes('|')) {
      const tete = cellules(l);
      const aligne = cellules(lignes[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : null));
      i += 2;
      const corps = [];
      while (i < lignes.length && lignes[i].includes('|') && lignes[i].trim()) corps.push(cellules(lignes[i++]));
      const st = (j) => (aligne[j] ? ` style="text-align:${aligne[j]}"` : '');
      out.push(`<table><thead><tr>${tete.map((c, j) => `<th scope="col"${st(j)}>${enLigne(c)}</th>`).join('')}</tr></thead><tbody>${corps.map((r) => `<tr>${r.map((c, j) => `<td${st(j)}>${enLigne(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const puce = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;
    if (puce.test(l)) {
      const ordonnee = Boolean(puce.exec(l)[2]);
      const items = [];
      while (i < lignes.length && lignes[i].trim()) {
        const m = puce.exec(lignes[i]);
        if (m && Boolean(m[2]) === ordonnee) items.push(m[3]);
        else if (m || /^\s*#/.test(lignes[i])) break;
        else if (/^\s+\S/.test(lignes[i]) && items.length) items[items.length - 1] += ` ${lignes[i].trim()}`;
        else break;
        i++;
      }
      const balise = ordonnee ? 'ol' : 'ul';
      out.push(`<${balise}>${items.map((x) => `<li>${enLigne(x)}</li>`).join('')}</${balise}>`);
      continue;
    }
    const para = [];
    while (i < lignes.length && lignes[i].trim() && !/^\s{0,3}#{1,6}\s/.test(lignes[i]) && !/^\s*(```|~~~)/.test(lignes[i]) && !puce.test(lignes[i])
      && !(lignes[i].includes('|') && i + 1 < lignes.length && estSeparateur(lignes[i + 1]))) para.push(lignes[i++]);
    if (para.length) out.push(`<p>${para.map(enLigne).join('<br>')}</p>`);
    else { out.push(`<p>${enLigne(lignes[i])}</p>`); i++; }
  }
  return out.join('\n');
}

const STYLE_APERCU = `html{color-scheme:light}body{margin:0;padding:24px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.55;color:#0F172A;background:#FFFFFF;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.2em 0 .5em}h1{font-size:1.6rem;margin-top:0}h2{font-size:1.3rem}h3{font-size:1.1rem}
p,ul,ol,pre,table{margin:0 0 1em}table{border-collapse:collapse;width:100%}th,td{border:1px solid #CBD5E1;padding:6px 10px;text-align:left}
pre{background:#F1F5F9;padding:12px;overflow:auto;white-space:pre-wrap}code{font-family:ui-monospace,Consolas,monospace;background:#F1F5F9;padding:0 3px}pre code{padding:0}
img{display:block;max-width:100%;height:auto;margin:0 auto 16px;border:1px solid #CBD5E1}.avis{background:#FFFBEB;border:1px solid #92400E;padding:10px 14px;margin:0 0 16px}`;

/** La page d'aperçu servie dans le cadre : aucun script, aucune ressource hors de l'adresse du serveur. */
export function pageApercu(corps, titre = 'Aperçu') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${echapper(titre)}</title><style>${STYLE_APERCU}</style></head><body>${corps}</body></html>`;
}
