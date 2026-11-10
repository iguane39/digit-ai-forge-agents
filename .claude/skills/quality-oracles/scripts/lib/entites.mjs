// lib/entites — les entités HTML se DÉCODENT avant qu'un texte soit jugé (10/11/2026, TF-2376, TF-2361).
//
// LE FAIT, mesuré à l'essai d'un livrable HTML : « Jusqu&#39;à 12 participants » faisait lire « 39 » comme un
// nombre orphelin, et une adresse écrite « nom&#64;exemple.test » aurait traversé un contrôle de coordonnées.
// Un générateur de page code souvent l'apostrophe, l'espace insécable ou une lettre accentuée : le texte qu'un
// lecteur voit est le texte décodé, c'est donc lui qui se juge.
const NOMMEES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘',
  laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', euro: '€', eacute: 'é', egrave: 'è', ecirc: 'ê',
  agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë',
  thinsp: ' ', nnbsp: ' ' };

/** Le texte avec ses entités numériques (&#39; &#x27;) et nommées courantes décodées ; une entité inconnue reste. */
export function decoderEntites(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NOMMEES[e.toLowerCase()] ?? m;
  });
}
