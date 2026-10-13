// lib/lecteur-vise — LA PARTIE MÉCANIQUE DE LA RUBRIQUE « LECTEUR VISÉ » D'ORACLE-JUDGE (TF-1392, TF-1394).
//
// LE FAIT. Une présentation écrite pour des décideurs sans formation technique a passé tous les
// juges du parc (0 terme proscrit, oracle-ecriture PASS, revue de lecture PASS) ; son lecteur en a
// jugé 3 éléments « ça ne veut rien dire » (lot Produit-68 20260926b, RP-69). Le lendemain, une carte
// jugée FLOU 3 fois de suite par le relecteur du produit, avec la même question, était partie avec
// le motif « sans suite : les réécrire changerait un fait », sans que le fait soit cité ; le lecteur
// l'a relevée une seconde fois (RP-71). Étude : pilot, output/03-etudes/
// 20261013-etude-opportunite-juge-de-comprehension.md, option O2.
//
// CE QUE LES MODÈLES FONT, ET CE QUE CE MODULE FAIT. Deux relecteurs (deux appels de modèle
// indépendants) jouent le lecteur visé : chacun redit chaque unité en une phrase et rend COMPRIS,
// FLOU ou INCOMPRIS avec la question du lecteur. Ce module ne lit AUCUN sens : il agrège.
//   R1  une unité est REFUSÉE par un relecteur s'il la rend FLOU ou INCOMPRIS, ou s'il ne sait pas
//       la redire (redite vide) — « refuse ce qu'il ne sait pas redire » ;
//   R2  un constat est RETENU seulement si les DEUX relecteurs refusent l'unité (mesure du 13/10 :
//       2 faux refus sur 18 avec l'accord, 3 à 9 sans) ; un désaccord n'est pas retenu mais se TRACE ;
//   R3  la question qui revient d'une lecture à l'autre (même unité refusée à la lecture précédente,
//       question proche) REMONTE à l'humain avant la remise (décision D-3 (a) du 13/10/2026) ;
//   R4  dans REVUE.md, chaque constat retenu a une suite ; un motif « changerait un fait » CITE le
//       fait qu'il protège (entre guillemets, entre accents graves, ou par un nombre) — sinon constat.
// TOUT EST SIGNALEMENT (décision D-2 (a) du 13/10/2026) : aucune de ces règles ne bloque une remise.
// Promotion au blocage : décision humaine, après une mesure sur 100 unités au moins (revue le
// 2026-11-10).

const REFUS = new Set(['FLOU', 'INCOMPRIS']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VIDES = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'd', 'l', 'et', 'ou', 'a', 'au', 'aux', 'en',
  'que', 'qui', 'quoi', 'ce', 'cet', 'cette', 'ces', 'est', 'sont', 'il', 'elle', 'on', 'je', 'pour', 'par', 'sur', 'dans', 'qu', 'ne', 'pas']);
const motsPleins = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((m) => m.length > 1 && !VIDES.has(m)));

/** Ressemblance de deux questions : part des mots pleins communs (indice de Jaccard), 0 à 1. */
export function ressemblance(q1, q2) {
  const a = motsPleins(q1), b = motsPleins(q2);
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const m of a) if (b.has(m)) inter++;
  return inter / (a.size + b.size - inter);
}
export const SEUIL_QUESTION_REPETEE = 0.5;

/** R1 — une unité est-elle refusée par ce relecteur ? */
export function estRefusee(u) {
  if (!u) return false;
  const v = String(u.verdict || '').toUpperCase();
  return REFUS.has(v) || !String(u.redite || '').trim();
}

/**
 * Lit une ou plusieurs lectures. Accepte un objet lecture `{relecteur, unites[]}` ou un paquet
 * `{lectures: [lecture, lecture]}`. Rend la liste des lectures (jamais d'exception sur la forme :
 * une lecture hors contrat se signale par l'appelant).
 */
export function lectures(objets) {
  const out = [];
  for (const o of objets) {
    if (o && Array.isArray(o.lectures)) out.push(...o.lectures);
    else if (o) out.push(o);
  }
  return out;
}

/** R2 — agrège deux lectures en constats retenus et désaccords tracés. */
export function agreger(a, b) {
  const ua = new Map((a.unites || []).map((u) => [String(u.id), u]));
  const ub = new Map((b.unites || []).map((u) => [String(u.id), u]));
  const ids = [...new Set([...ua.keys(), ...ub.keys()])];
  const retenus = [], desaccords = [], absentes = [];
  for (const id of ids) {
    const x = ua.get(id), y = ub.get(id);
    if (!x || !y) { absentes.push({ id, absente_de: !x ? (a.relecteur || 'A') : (b.relecteur || 'B') }); continue; }
    const rx = estRefusee(x), ry = estRefusee(y);
    const extrait = String(x.extrait || y.extrait || '').slice(0, 160);
    if (rx && ry) retenus.push({ id, extrait, questions: [x.question, y.question].filter((q) => String(q || '').trim()), verdicts: [x.verdict || 'SANS REDITE', y.verdict || 'SANS REDITE'] });
    else if (rx || ry) desaccords.push({ id, extrait, refuse_par: rx ? (a.relecteur || 'A') : (b.relecteur || 'B'), question: (rx ? x : y).question || '' });
  }
  return { unites: ids.length, retenus, desaccords, absentes };
}

/**
 * R3 — questions répétées : un constat retenu maintenant, dont l'unité était déjà refusée à la
 * lecture précédente (retenue ou en désaccord) avec une question proche, ou dont une question est
 * proche d'une question précédente sur la même unité.
 */
export function questionsRepetees(courant, precedent) {
  if (!precedent) return [];
  const avant = new Map();
  for (const r of [...(precedent.retenus || []), ...(precedent.desaccords || [])]) {
    const qs = r.questions || (r.question ? [r.question] : []);
    avant.set(String(r.id), [...(avant.get(String(r.id)) || []), ...qs]);
  }
  const rep = [];
  for (const r of courant.retenus) {
    const qsAvant = avant.get(String(r.id));
    if (!qsAvant) continue;
    let meilleur = 0, paire = null;
    for (const q of r.questions) for (const p of qsAvant) { const s = ressemblance(q, p); if (s > meilleur) { meilleur = s; paire = [p, q]; } }
    if (meilleur >= SEUIL_QUESTION_REPETEE) rep.push({ id: r.id, extrait: r.extrait, question_avant: paire[0], question_maintenant: paire[1], ressemblance: Math.round(meilleur * 100) / 100 });
  }
  return rep;
}

/** Un fait est-il CITÉ dans ce segment ? Guillemets français ou droits, accents graves, ou un nombre. */
export function citeUnFait(segment) {
  const s = String(segment || '');
  return /«\s*[^»]{3,}»/.test(s) || /"[^"]{3,}"/.test(s) || /`[^`]{2,}`/.test(s) || /\d/.test(s);
}

/**
 * R4 — les suites dans REVUE.md. Pour chaque constat retenu : une ligne de REVUE.md qui nomme son
 * id ; si cette ligne porte « changerait un fait », le fait qui suit doit être cité.
 */
export function suitesDansRevue(retenus, revueTexte) {
  const lignes = String(revueTexte || '').split(/\r?\n/);
  const sansSuite = [], motifSansFait = [];
  for (const r of retenus) {
    const re = new RegExp('(^|[^\\p{L}\\p{N}_-])' + String(r.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}\\p{N}_-])', 'u');
    const ls = lignes.filter((l) => re.test(l));
    if (!ls.length) { sansSuite.push(r.id); continue; }
    for (const l of ls) {
      // « changerait un fait » ne porte aucun accent : la recherche se fait sur la ligne d'origine,
      // et le fait se lit dans ce qui SUIT le motif (l'id et l'extrait, avant, ne comptent pas).
      const m = l.match(/changerai(?:t|ent)\s+un\s+fait(.*)$/i);
      // Dans un tableau, seule la CELLULE du motif compte : une date dans la colonne suivante
      // (« Preuve ») n'est pas le fait protégé.
      if (m && !citeUnFait(m[1].split('|')[0])) motifSansFait.push({ id: r.id, ligne: l.trim().slice(0, 160) });
    }
  }
  return { sansSuite, motifSansFait };
}

/**
 * Le lecteur visé, par ordre de préséance : texte explicite, section « Le lecteur » d'une fiche de
 * conception, clé `lecteur:` ou `destinataire:` du front matter du document. '' si aucun.
 */
export function lecteurVise({ explicite, ficheTexte, documentTexte }) {
  if (String(explicite || '').trim()) return String(explicite).trim();
  if (ficheTexte) {
    const l = String(ficheTexte).split(/\r?\n/);
    const i = l.findIndex((x) => /^#{1,4}\s.*\blecteur\b/i.test(x));
    if (i >= 0) {
      const niv = (l[i].match(/^#+/) || ['#'])[0].length;
      const fin = l.findIndex((x, j) => j > i && new RegExp('^#{1,' + niv + '}\\s').test(x));
      const corps = l.slice(i + 1, fin < 0 ? undefined : fin).join('\n').trim();
      if (corps) return corps.slice(0, 1500);
    }
  }
  const fm = String(documentTexte || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const m = fm[1].match(/^(?:lecteur|destinataire)\s*:\s*(.+)$/mi);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}
