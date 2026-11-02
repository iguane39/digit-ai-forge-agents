// lib/diff.mjs — l'écart de texte entre 2 versions, mot à mot (Myers), sans dépendance.
// Le lanceur y mesure les mots ajoutés et retirés, l'onglet « Comparer » y lit ce qu'il surligne.

const SEUIL_ECART = 6000; // au-delà, 2 textes sans rapport : le coût n'apprend rien de plus

function operations(a, b) {
  let debut = 0;
  while (debut < a.length && debut < b.length && a[debut] === b[debut]) debut++;
  let finA = a.length;
  let finB = b.length;
  while (finA > debut && finB > debut && a[finA - 1] === b[finB - 1]) { finA--; finB--; }
  const n = finA - debut;
  const m = finB - debut;
  const ops = [];
  if (debut) ops.push(['=', debut]);
  if (n === 0 || m === 0) {
    if (n) ops.push(['-', n]);
    if (m) ops.push(['+', m]);
  } else {
    const max = Math.min(n + m, SEUIL_ECART);
    const decalage = max + 1;
    let v = new Int32Array(2 * max + 3);
    const traces = [];
    let trouve = -1;
    for (let d = 0; d <= max && trouve < 0; d++) {
      traces.push(v.slice(decalage - d - 1, decalage + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[decalage + k - 1] < v[decalage + k + 1]) ? v[decalage + k + 1] : v[decalage + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[debut + x] === b[debut + y]) { x++; y++; }
        v[decalage + k] = x;
        if (x >= n && y >= m) { trouve = d; break; }
      }
    }
    if (trouve < 0) {
      ops.push(['-', n], ['+', m]);
    } else {
      const inverse = [];
      let x = n;
      let y = m;
      for (let d = trouve; d > 0; d--) {
        const trace = traces[d];
        const lire = (k) => trace[k + d + 1];
        const k = x - y;
        const venantDeHaut = k === -d || (k !== d && lire(k - 1) < lire(k + 1));
        const kPrec = venantDeHaut ? k + 1 : k - 1;
        const xPrec = lire(kPrec);
        const yPrec = xPrec - kPrec;
        const egaux = venantDeHaut ? x - xPrec : x - xPrec - 1;
        if (egaux > 0) inverse.push(['=', egaux]);
        inverse.push(venantDeHaut ? ['+', 1] : ['-', 1]);
        x = xPrec;
        y = yPrec;
      }
      if (x > 0) inverse.push(['=', x]);
      ops.push(...inverse.reverse());
    }
  }
  if (a.length - finA) ops.push(['=', a.length - finA]);
  const fusion = [];
  for (const [o, c] of ops) {
    const der = fusion[fusion.length - 1];
    if (der && der[0] === o) der[1] += c;
    else fusion.push([o, c]);
  }
  return fusion;
}

const decouper = (texte) => {
  const mots = [];
  const blancs = [];
  for (const m of texte.matchAll(/(\S+)(\s*)/gu)) {
    mots.push(m[1]);
    blancs.push(m[2]);
  }
  return { mots, blancs };
};

const compte = (mots) => mots.filter((m) => /[\p{L}\p{N}]/u.test(m)).length;

/** { ajoutes, retires } : mots portant une lettre ou un chiffre, comme le compte du plafond. */
export function ecartMots(avant, apres) {
  const a = decouper(avant).mots;
  const b = decouper(apres).mots;
  let i = 0;
  let j = 0;
  let ajoutes = 0;
  let retires = 0;
  for (const [o, c] of operations(a, b)) {
    if (o === '=') { i += c; j += c; }
    if (o === '-') { retires += compte(a.slice(i, i + c)); i += c; }
    if (o === '+') { ajoutes += compte(b.slice(j, j + c)); j += c; }
  }
  return { ajoutes, retires };
}

/** Les 2 colonnes de « Comparer » : gauche et droite, en suites de { t, s } ; s vrai = surligné. */
export function comparer(avant, apres) {
  const A = decouper(avant);
  const B = decouper(apres);
  const gauche = [];
  const droite = [];
  const pousser = (col, t, s) => {
    const der = col[col.length - 1];
    if (der && der.s === s) der.t += t;
    else col.push({ t, s });
  };
  let i = 0;
  let j = 0;
  for (const [o, c] of operations(A.mots, B.mots)) {
    if (o !== '+') for (let n = 0; n < c; n++, i++) pousser(gauche, A.mots[i] + A.blancs[i], o === '-');
    if (o !== '-') for (let n = 0; n < c; n++, j++) pousser(droite, B.mots[j] + B.blancs[j], o === '+');
  }
  return { gauche, droite, ...ecartMots(avant, apres) };
}
