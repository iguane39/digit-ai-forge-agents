// lib/contrat — LE MOTIF D'UN SKIP A UNE PLACE FIXE (TF-1447, 28/09/2026).
//
// LE FAIT. Le contrat JSON commun des oracles — {oracle, domaine, artefact, verdict, findings[],
// non_juge[]} — ne disait pas OÙ vit la raison d'un SKIP. Mesuré chez un produit sur les 29 SKIP
// d'un run : oracle-conception-livrable la range en FIN de non_juge, oracle-post-linkedin en TÊTE,
// oracle-sast dans un constat de niveau `info`. Un relevé qui lisait le premier élément de non_juge
// a rendu des LIMITES DÉCLARÉES à la place des motifs ; vu avant consignation, il a fallu relire les
// sorties brutes. Une raison qui n'a pas de domicile se lit au hasard.
//
// LA RÈGLE. Tout verdict `SKIP` porte `motif` : une chaîne non vide, la raison pour laquelle
// l'oracle n'a pas jugé. Chaque oracle déclare UNE FOIS où il écrit cette raison, en créant son
// écrivain de contrat ; l'écrivain l'y prend et la recopie dans `motif`. Les domiciles du parc :
//   · `premier: true` — le PREMIER élément de non_juge (un `skip` qui fait `non_juge.unshift(m)`,
//                       ou un appel qui écrit `[motif, ...NJ]`) ;
//   · `dernier: true` — le DERNIER élément de non_juge (un appel qui écrit `[...NJ, motif]` ou
//                       `[motif]`) ;
//   · `limites: () => L` — le premier élément de non_juge qui n'est pas une limite permanente de `L`
//                       (lue au moment d'écrire, à jour) ;
//   · `info: true`    — le premier constat de niveau `info`.
// Quand le domicile déclaré est vide, le premier constat `info` (puis le premier constat qui porte
// un message) sert de repli. Un `motif` déjà posé par l'oracle n'est jamais réécrit. Une raison
// introuvable laisse `motif` VIDE : c'est la recette commune qui le refuse, jamais une valeur de
// remplacement qui le cacherait.

const propre = (x) => typeof x === 'string' && x.trim() !== '';

/** La raison d'un SKIP, lue au domicile que l'oracle a déclaré ; '' si elle n'y est pas. */
export function motifDeSkip(sortie, { premier = false, dernier = false, limites = null, info = false } = {}) {
  const nonJuge = Array.isArray(sortie && sortie.non_juge) ? sortie.non_juge : [];
  const findings = Array.isArray(sortie && sortie.findings) ? sortie.findings : [];
  const constatInfo = () => {
    const f = findings.find((x) => x && x.sev === 'info' && propre(x.msg)) || findings.find((x) => x && propre(x.msg));
    return f ? f.msg.trim() : '';
  };
  if (info && constatInfo()) return constatInfo();
  if (premier && propre(nonJuge[0])) return nonJuge[0].trim();
  if (dernier && propre(nonJuge[nonJuge.length - 1])) return nonJuge[nonJuge.length - 1].trim();
  if (limites) {
    const L = typeof limites === 'function' ? limites() : limites;
    const hors = nonJuge.find((x) => propre(x) && !(Array.isArray(L) && L.includes(x)));
    if (hors) return hors.trim();
  }
  return constatInfo();
}

/** L'écrivain du contrat d'un oracle : `JSON.stringify`, plus `motif` sur tout SKIP. */
export function ecrivainDeContrat(domicile = {}) {
  return (sortie, ...reste) => JSON.stringify(
    sortie && sortie.verdict === 'SKIP' && !propre(sortie.motif)
      ? { ...sortie, motif: motifDeSkip(sortie, domicile) }
      : sortie,
    ...reste);
}
