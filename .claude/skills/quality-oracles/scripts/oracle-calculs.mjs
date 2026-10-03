#!/usr/bin/env node
// oracle-calculs — Domaine « Calculs / chiffres » (v2, déterministe).
// Vérifie par EXÉCUTION les totaux affichés dans les tables markdown et HTML :
//   · ligne « Total / Somme / Sous-total » : colonnes re-sommées sur le segment de données
//     au-dessus (depuis le dernier total) — comportement v1 inchangé ;
//   · ligne « Total général / Grand total » (v2) : colonnes re-sommées sur TOUTES les lignes
//     de données de la table (hors lignes de total) ; deux totaux généraux = structure ambiguë ;
//   · colonnes de répartition % totalisées : couvertes par la même re-somme (le total affiché,
//     typiquement 100 %, est jugé contre la somme des parts).
//   · EFFECTIF ANNONCÉ (v3, TF-0718) : un nombre écrit en chiffres OU en lettres, suivi d'un nom
//     dénombrable du document, en tête d'une liste ou d'un tableau, est rapproché du CARDINAL
//     RÉEL de cette ancre — délégué à lib/effectifs.mjs (N1), qui signale aussi les comptes
//     contradictoires pour un même nom dans le même document (N2).
// Parsing délégué à lib/num.mjs, extraction des tables à lib/tables.mjs (source unique).
// Verdicts : FAIL = écart au-delà de la tolérance d'arrondi · PASS = ≥1 total vérifié,
// 0 écart · SKIP = aucune structure vérifiable. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { parseNum, isTotalLabel, isGrandTotalLabel } from './lib/num.mjs';
import { extractTables } from './lib/tables.mjs';
import { verifierEffectifs } from './lib/effectifs.mjs';
import { verifierMesures, NON_JUGE_MESURE } from './lib/mesure.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ dernier: true });

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--profil');
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
const out = (verdict, findings, non_juge, code) => {
  process.stdout.write(contratJSON({ oracle: 'oracle-calculs', domaine: 'Calculs / chiffres', artefact: file || null, verdict, findings, non_juge }));
  process.exit(code);
};
const NON_JUGE_BASE = [
  'calculs hors tables (prose, formules métier)',
  'pourcentages croisés (part d\'une table rapportée au total d\'une autre)',
  'colonnes % sans ligne de total (répartition non totalisée)',
  'chiffres sans ligne de total de contrôle (à vérifier à la source)',
  'justesse métier des valeurs unitaires (seule la cohérence arithmétique est jugée)',
  'ambiguïté séparateur unique + 3 décimales (traité comme milliers)',
  'effectifs annoncés sans ancre immédiate (liste ou tableau juste dessous) — non rapprochables',
  'effectifs de 1 (« une question ») et noms hors liste des dénombrables de lib/effectifs.mjs',
  'listes imbriquées HTML : les <li> de sous-listes sont comptés avec les items de premier niveau',
  'I1 (même indicateur, deux valeurs) : deux tuiles entre elles, deux mentions en prose entre elles, la forme « libellé : nombre », un libellé d\'un seul mot — seule la valeur déclarée (tuile, dt/dd) est confrontée à la prose',
  ...NON_JUGE_MESURE
];
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
const ext = path.extname(file).toLowerCase();
if (!['.md', '.html', '.htm', '.txt'].includes(ext)) out('SKIP', [], ['extension non gérée : ' + ext], 2);
const brut = fs.readFileSync(file, 'utf8');

// ---- RT-122 (Produit-02, 03/10/2026) : une page HTML se lit dans son TEXTE RENDU ----------------
// LE FAIT : oracle-calculs lisait le source HTML brut, ligne par ligne. Une infobulle SVG écrite
// dans un attribut `title` sur plusieurs lignes laissait, sur sa dernière ligne, « …(Google Ads) : 2"/>
// 26,69 27 sept. <rect class="seg c1" x="148.6" » : la balise ouverte sans fermeture sur la ligne
// échappait au retrait des balises, et le `x` de l'attribut x= se lisait comme une multiplication.
// 17 constats bloquants « unité de FLUX » sur la version c du statut ; contournement subi : finir
// chaque infobulle par une ligne de mots.
// LE CORRECTIF : avant les volets tables et mesures, une page HTML est ramenée à ce qu'elle REND — commentaires,
// <script>, <style>, <template>, <noscript> retirés, et chaque balise réduite à son NOM (attributs
// retirés, valeurs entre guillemets comprises, même sur plusieurs lignes). Les sauts de ligne retirés
// sont reposés après la balise : un constat garde le numéro de ligne du source. Une balise qui n'est
// pas de texte courant et que lib/ ne lit pas déjà comme une fin d'unité (élément SVG, <title>, <text>,
// <section>, <button>…) est suivie d'un <br> à sa fermeture : c'est une FRONTIÈRE SÛRE, le nombre
// qui termine un nœud ne se colle jamais au suivant. La structure (tables, listes, titres) reste,
// les modules lib/ la lisent comme avant. Le Markdown est inchangé.
// LA MESURE (03/10/2026, 2 996 pages HTML de 29 dépôts produits, avant → après) : 2 906 SKIP, 61 PASS
// et 22 FAIL inchangés ; 4 PASS → SKIP (le seul « jugé » vivait dans un <script> ou un attribut) ;
// 3 bascules N3 (2 FAIL → PASS, 1 PASS → FAIL) : l'ancien `nu` de lib/mesure.mjs perdait les sauts de
// ligne des balises sur plusieurs lignes et lisait la note d'une table plusieurs lignes trop haut.
const EN_LIGNE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'tspan', 'u', 'var', 'wbr', 'br', 'html', 'head', 'body']);
// Fins d'unité déjà lues par lib/ (FIN_D_UNITE de mesure.mjs, structure des tables et listes) : rien
// à ajouter — chaque <br> de plus déplace la fenêtre de 2 000 caractères de lib/effectifs.mjs.
const DEJA_FRONTIERE = new Set(['td', 'th', 'tr', 'li', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dt', 'dd', 'caption', 'div', 'blockquote', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'ul', 'ol', 'dl', 'colgroup', 'col']);
const sautsSeuls = s => s.replace(/[^\n]/g, '');
function texteRendu(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, sautsSeuls)
    .replace(/<(script|style|template|noscript)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi, sautsSeuls)
    .replace(/<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (m, ferme, nom, attrs) => {
      const n = nom.toLowerCase(), auto = /\/\s*$/.test(attrs) ? '/' : '';
      const balise = '<' + ferme + n + auto + '>';
      if (EN_LIGNE.has(n)) return balise + sautsSeuls(m);
      return balise + ((ferme || auto) && !DEJA_FRONTIERE.has(n) ? '<br>' : '') + sautsSeuls(m);
    });
}
const text = (ext === '.html' || ext === '.htm') ? texteRendu(brut) : brut;

// ---- RT-121 (Produit-02, 03/10/2026) : MÊME INDICATEUR, DEUX VALEURS (règle I1) --------------------
// LE FAIT : une page de statut, livrée PASS 15/15, publiait « 54 visites sur 63 sont engagées » ;
// au grain du jour, la source rend 64 visites dont 40 engagées. 54 venait de la somme d'un rapport
// à la minute : deux valeurs du même indicateur, tirées de deux grains de la source, coexistaient,
// et aucun oracle ne les confrontait.
// LA RÈGLE : dans une même page HTML, une valeur DÉCLARÉE d'indicateur et une mention en PROSE du
// même libellé (minuscules, accents, ponctuation et pluriel neutralisés) portent deux NOMBRES
// différents → constat bloquant. Les deux formes lues :
//   · valeur déclarée — tuile / KPI : un élément de classe *label / *libelle / *titre… et un élément
//     de classe *value / *valeur / *nombre…, seuls de leur espèce dans un même conteneur (≤ 3
//     niveaux) ; ou <dt> suivi de son <dd> court ; la valeur OUVRE l'élément (« 54 », « 1 234 € ») ;
//   · forme textuelle « <nombre> <libellé> » (« 54 visites engagées ») : le groupe nominal ENTIER
//     qui suit le nombre (jusqu'au premier mot-outil : sur, ont, sont…) est le libellé d'une valeur
//     déclarée de la page, de 2 mots au moins, et n'est pas suivi d'une préposition de périmètre
//     (« 18 informations proposées POUR un propriétaire » est une part, pas l'indicateur).
// HORS RÈGLE : cellules de tableau (chaque ligne a sa valeur) sauf la ligne de total ; contenu SVG
// (marques et infobulles par donnée) ; attributs ; <script>, <style>, <template>, <noscript>.
// Deux affichages d'une même valeur à des précisions différentes (26,2 % et 26 %) sont une valeur.
// SORTIE DÉCLARATIVE : `data-indicateur-portee="<périmètre>"` sur l'élément ou un ancêtre — deux
// valeurs portant des portées déclarées DIFFÉRENTES ne sont pas un constat (7 jours / 30 jours).
// LA MESURE (03/10/2026, D-55 (a) : mesurée en bruit avant de bloquer) — 2 996 pages HTML lues dans
// 29 dépôts produits de C:\dev (hors node_modules, old/, environnements Python, couverture,
// worktrees). Passe 1, toutes paires (prose/prose, tuile/tuile comprises) : 425 constats sur 168
// pages, tous faux positifs (adresses « 12 rue… », durées « 3 semaines », pages traduites, cartes
// d'entités répétées « Dépôt de garantie » par lot, numéros de fichiers « LOT 31 »). Passe 2, valeur
// déclarée contre prose seulement, libellé de 2 mots : 6 constats sur 6 pages, 6 faux positifs (un
// sous-groupe qualifié « 76 règles instruites non conformes » contre la tuile « Règles instruites »,
// une part « 18 informations proposées pour un propriétaire » contre le total 52, « - LOT » lu comme
// un mot). Passe 3, règle ci-dessus : 0 constat ; 163 pages portent une valeur déclarée, 8 pages
// confrontent 17 indicateurs, tous à valeur unique. Zéro faux positif mesuré : la règle BLOQUE.
// NON JUGÉ (assumé pour tenir le bruit à zéro) : deux tuiles entre elles, deux mentions en prose
// entre elles, la forme « <libellé> : <nombre> », un libellé d'un seul mot.
const SEV_I1 = 'bloquant';
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param']);
const BRUTS = new Set(['script', 'style', 'template', 'noscript', 'textarea']);
const ENTITES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', euro: '€', hellip: '…', ndash: '–', mdash: '—', thinsp: ' ', nnbsp: ' ' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITES[e.toLowerCase()] ?? m));
function arbreHtml(html) {
  const racine = { nom: '#racine', attrs: {}, enfants: [], parent: null, pos: 0 };
  let cur = racine; const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
  const ouvert = n => { for (let e = cur; e; e = e.parent) if (e.nom === n) return e; return null; };
  const fermerJusqua = e => { cur = e.parent || racine; };
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[2] === undefined) { cur.enfants.push({ nom: '#texte', texte: decode(m[0]), parent: cur, pos: m.index }); continue; }
    const n = m[2].toLowerCase();
    if (m[1]) { const e = ouvert(n); if (e) fermerJusqua(e); continue; }
    // fermetures implicites usuelles
    if (n === 'li') { const e = ouvert('li'); if (e && !['ul', 'ol'].some(x => { for (let k = cur; k && k !== e; k = k.parent) if (k.nom === x) return true; return false; })) fermerJusqua(e); }
    if (n === 'dt' || n === 'dd') { const e = ouvert('dt') || ouvert('dd'); if (e) fermerJusqua(e); }
    if (n === 'td' || n === 'th') { const e = ouvert('td') || ouvert('th'); if (e) fermerJusqua(e); }
    if (n === 'tr') { const e = ouvert('tr'); if (e) fermerJusqua(e); }
    if (n === 'p' || /^(div|ul|ol|dl|table|h[1-6]|section|article)$/.test(n)) { const e = ouvert('p'); if (e && cur === e) fermerJusqua(e); }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const el = { nom: n, attrs, enfants: [], parent: cur, pos: m.index };
    cur.enfants.push(el);
    if (BRUTS.has(n)) { const fin = html.toLowerCase().indexOf('</' + n, re.lastIndex); re.lastIndex = fin < 0 ? html.length : fin; const f = html.indexOf('>', re.lastIndex); re.lastIndex = f < 0 ? html.length : f + 1; continue; }
    if (!VIDES.has(n) && !/\/\s*$/.test(m[3])) cur = el;
  }
  return racine;
}
const texteDe = e => e.nom === '#texte' ? e.texte : BRUTS.has(e.nom) ? ' ' : e.enfants.map(c => (c.nom !== '#texte' && !EN_LIGNE.has(c.nom) ? ' ' + texteDe(c) + ' ' : texteDe(c))).join('');
const classes = e => (e.attrs && e.attrs.class || '').toLowerCase().split(/\s+/).filter(Boolean);
const EST_LIBELLE = /(?:^|[-_])(?:label|libell[eé]|libelle|intitul[eé]|titre|title|name|nom|legende)$/;
const EST_VALEUR = /(?:^|[-_])(?:value|valeur|val|nombre|number|chiffre|count|montant|amount)$/;
const RX_NB = /[-+−]?\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?(?!\d)|[-+−]?\d+(?:[.,]\d+)?/;
const MOTS_OUTILS = new Set(['sur', 'de', 'des', 'du', 'd', 'le', 'la', 'les', 'l', 'et', 'ou', 'en', 'a', 'au', 'aux', 'par', 'pour', 'sont', 'est', 'ont', 'a', 'dans', 'contre', 'soit', 'avec', 'depuis', 'entre', 'sans', 'sous', 'vers', 'chez', 'que', 'qui', 'dont', 'on', 'il', 'elle', 'ils', 'elles', 'ce', 'ces', 'cette', 'son', 'sa', 'ses', 'leur', 'leurs', 'un', 'une', 'pas', 'plus', 'moins', 'the', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'by', 'per', 'with', 'from', 'is', 'are', 'was', 'were']);
// Prépositions de PÉRIMÈTRE, sous leur forme normalisée (normeLibelle retire le s final : dans → dan, lors → lor).
const PERIMETRE = new Set(['pour', 'par', 'dan', 'chez', 'en', 'au', 'aux', 'a', 'du', 'de', 'des', 'd', 'le', 'la', 'les', 'l', 'lor', 'entre', 'ce', 'cet', 'cette', 'ces', 'avant', 'apre', 'hor', 'parmi', 'selon', 'chaque', 'per', 'in', 'for', 'by', 'on', 'at', 'during', 'from']);
const normeLibelle = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  .split(' ').filter(Boolean).map(w => (w.length > 3 ? w.replace(/(s|x)$/, '') : w)).join(' ');
function nombre(txt) {
  const m = String(txt).replace(/−/g, '-').match(RX_NB);
  if (!m) return null;
  const s = m[0].replace(/[   ]/g, '');
  const v = Number(s.replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const dec = (s.split(/[.,]/)[1] || '').length;
  return { v, dec, brut: m[0] };
}
function verifierIndicateurs(html, base) {
  const racine = arbreHtml(html);
  const sauts = []; for (let i = 0; i < html.length; i++) if (html.charCodeAt(i) === 10) sauts.push(i);
  const ligneDe = pos => { let lo = 0, hi = sauts.length; while (lo < hi) { const mi = (lo + hi) >> 1; if (sauts[mi] < pos) lo = mi + 1; else hi = mi; } return lo + 1; };
  const portee = e => { for (let k = e; k; k = k.parent) if (k.attrs && k.attrs['data-indicateur-portee'] != null) return k.attrs['data-indicateur-portee'].trim() || null; return null; };
  // Zones hors règle : SVG, <head>, cellules de tableau hors ligne de total.
  const horsRegle = e => {
    for (let k = e; k; k = k.parent) {
      if (k.nom === 'svg' || k.nom === 'head') return true;
      if (k.nom === 'td' || k.nom === 'th') {
        const tr = (() => { for (let t = k; t; t = t.parent) if (t.nom === 'tr') return t; return null; })();
        if (!tr) return true;
        const premiere = tr.enfants.find(c => c.nom === 'td' || c.nom === 'th');
        return !(premiere && (isTotalLabel(texteDe(premiere).trim()) || isGrandTotalLabel(texteDe(premiere).trim())));
      }
    }
    return false;
  };
  const tous = []; (function parcours(e) { for (const c of e.enfants || []) { if (c.nom !== '#texte') { tous.push(c); parcours(c); } } })(racine);
  const mentions = [];
  const ajoute = (libelle, valeurTxt, el, forme) => {
    const cle = normeLibelle(libelle);
    if (!cle || !/[a-z]{3}/.test(cle) || cle.length > 60) return;
    const vt = valeurTxt.replace(/\s+/g, ' ').trim();
    if (!/^[^\p{L}\d]{0,3}\d/u.test(vt)) return;          // la valeur OUVRE l'élément
    const n = nombre(vt); if (!n) return;
    const unite = /%/.test(vt) ? '%' : /€|eur\b/i.test(vt) ? '€' : '';
    mentions.push({ cle, libelle: libelle.replace(/\s+/g, ' ').trim(), ...n, unite, portee: portee(el), ligne: ligneDe(el.pos), forme });
  };
  // (a) tuiles : libellé et valeur seuls de leur espèce dans un même conteneur
  const libellesTuiles = new Set();
  for (const L of tous) {
    if (horsRegle(L) || !classes(L).some(c => EST_LIBELLE.test(c))) continue;
    let A = L.parent;
    for (let niveau = 0; A && niveau < 3; niveau++, A = A.parent) {
      const sous = []; (function p(e) { for (const c of e.enfants || []) if (c.nom !== '#texte') { sous.push(c); p(c); } })(A);
      const libs = sous.filter(x => classes(x).some(c => EST_LIBELLE.test(c)));
      const vals = sous.filter(x => classes(x).some(c => EST_VALEUR.test(c)) && !libs.includes(x));
      if (libs.length > 1 || vals.length > 1) break;
      if (vals.length === 1) { const t = texteDe(L); ajoute(t, texteDe(vals[0]), vals[0], 'tuile'); libellesTuiles.add(normeLibelle(t)); break; }
    }
  }
  for (const dt of tous) {
    if (dt.nom !== 'dt' || horsRegle(dt)) continue;
    const fr = dt.parent.enfants.filter(c => c.nom !== '#texte'); const i = fr.indexOf(dt);
    const dd = fr[i + 1]; if (!dd || dd.nom !== 'dd') continue;
    const t = texteDe(dt), v = texteDe(dd);
    if (v.replace(/\s+/g, ' ').trim().length > 40) continue;  // un <dd> de définition, pas une valeur
    ajoute(t, v, dd, 'dt/dd'); libellesTuiles.add(normeLibelle(t));
  }
  // (b) forme textuelle « <nombre> <libellé> », bloc par bloc
  const blocs = [];
  (function blocsDe(e) {
    let courant = null;
    const pousse = (t, el) => { if (!courant) { courant = { parts: [] }; blocs.push(courant); } courant.parts.push({ t, el }); };
    (function inl(x) {
      for (const c of x.enfants || []) {
        if (c.nom === '#texte') { if (!horsRegle(x)) pousse(c.texte, x); }
        else if (BRUTS.has(c.nom) || c.nom === 'svg' || c.nom === 'head') { courant = null; }
        else if (EN_LIGNE.has(c.nom) && c.nom !== 'br') inl(c);
        else { courant = null; blocsDe(c); courant = null; }
      }
    })(e);
  })(racine);
  const RX_TEXTE = new RegExp('(?<![\\p{L}\\d.,/:-])(' + RX_NB.source + ')\\s+((?:\\p{L}[\\p{L}’\'-]*\\s*){1,7})', 'gu');
  for (const b of blocs) {
    const txt = b.parts.map(p => p.t).join(''); let off = 0; const bornes = b.parts.map(p => { const d = off; off += p.t.length; return d; });
    for (const m of txt.matchAll(RX_TEXTE)) {
      const mots = m[2].trim().split(/\s+/);
      const garde = []; for (const w of mots) { if (MOTS_OUTILS.has(normeLibelle(w)) || MOTS_OUTILS.has(w.toLowerCase())) break; garde.push(w); }
      // Le groupe nominal ENTIER (jusqu'au premier mot-outil) doit être le libellé d'une valeur déclarée :
      // « 76 règles instruites non conformes » n'est pas « Règles instruites ». Et un groupe suivi d'une
      // préposition de périmètre (« 18 informations proposées pour un propriétaire », « 4 documents
      // indexés dans un dossier ») nomme une PARTIE de l'indicateur, pas l'indicateur.
      const libelle = garde.join(' '), suivant = mots[garde.length] ? normeLibelle(mots[garde.length]) : '';
      if (normeLibelle(libelle).split(' ').length < 2 || !libellesTuiles.has(normeLibelle(libelle)) || PERIMETRE.has(suivant)) continue;
      let pi = 0; while (pi + 1 < bornes.length && bornes[pi + 1] <= m.index) pi++;
      ajoute(libelle, m[1], b.parts[pi].el, 'texte');
    }
  }
  // confrontation : même libellé, même unité, deux valeurs différentes, portées non distinctes
  const findings = []; const groupes = new Map();
  for (const x of mentions) { const k = x.cle + '|' + x.unite; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(x); }
  let juges = 0, verifies = 0;
  const egales = (a, b) => Math.abs(a.v - b.v) < 0.5 * Math.pow(10, -Math.min(a.dec, b.dec)) + 1e-9;
  for (const g of groupes.values()) {
    if (g.length < 2) continue;
    juges++;
    let conflit = null;
    for (let i = 0; i < g.length && !conflit; i++) for (let j = i + 1; j < g.length && !conflit; j++) {
      const a = g[i], b = g[j];
      if (egales(a, b)) continue;
      if ((a.forme === 'texte') === (b.forme === 'texte')) continue;   // une valeur DÉCLARÉE (tuile, dt/dd) contre une mention en prose
      if (a.portee && b.portee && a.portee !== b.portee) continue;
      conflit = [a, b];
    }
    if (!conflit) { verifies++; continue; }
    const [a, b] = conflit;
    findings.push({ sev: SEV_I1, regle: 'I1',
      msg: `I1 — même indicateur, deux valeurs : « ${a.libelle} » vaut ${a.brut}${a.unite ? ' ' + a.unite : ''} (${a.forme}, ligne ${a.ligne}) et ${b.brut}${b.unite ? ' ' + b.unite : ''} (${b.forme}, ligne ${b.ligne}). `
        + `Deux valeurs d'un même indicateur dans une page viennent souvent de deux grains de la source (somme d'un rapport fin ≠ total au grain de l'indicateur). `
        + `Soit l'une est fausse, soit ce sont deux périmètres : déclarer data-indicateur-portee="<périmètre>" sur chacune.`,
      where: base + ':' + b.ligne });
  }
  return { findings, juges, verifies };
}

const tables = extractTables(text, ext);

// ---- TF-0718 : effectifs annoncés vs cardinal réel (indépendant des lignes de total) ---------
// Ce volet juge AUSSI les documents sans aucune table de total : le décalage « Sept écarts »
// au-dessus d'un tableau de huit vivait dans un sommaire, pas dans une somme.
// RT-122 : ce volet garde le SOURCE. lib/effectifs.mjs cherche l'ancre d'une annonce dans une fenêtre
// de 2 000 caractères ; le texte rendu, plus court (attributs retirés), y fait entrer des tableaux
// TRONQUÉS, et la mesure du parc du 03/10/2026 l'a montré : 4 pages SKIP devenues FAIL sur des
// cardinaux coupés (« trois constats » ≠ 2 lignes d'un tableau qui en a 3). Ce volet retire déjà
// les balises sur le texte entier, sans découpage par ligne : il n'avait pas le défaut de RT-122.
const eff = verifierEffectifs(brut, ext, path.basename(file));

// ---- TF-0760 / TF-0777 : « un chiffre publié énonce son dénominateur, et une unité se lit » ---
// N3 pourcentage sans sa formule · N4 unités des en-têtes · N5 hypothèse calculable depuis la
// source déclarée. Délégué à lib/mesure.mjs — un domaine, un module, la même discipline que N1.
let PROFIL = {};
if (pArg && fs.existsSync(pArg)) { try { PROFIL = JSON.parse(fs.readFileSync(pArg, 'utf8')); } catch { /* profil illisible : réglages par défaut */ } }
const mes = verifierMesures(text, ext, path.basename(file), path.dirname(path.resolve(file)), (PROFIL.calculs && PROFIL.calculs.mesure) || {});

const ind = (ext === '.html' || ext === '.htm') ? verifierIndicateurs(brut, path.basename(file)) : { findings: [], juges: 0, verifies: 0 };

if (!tables.length && !ind.juges && !eff.annonces && !eff.findings.length && !mes.juges && !mes.findings.length) out('SKIP', [], [...NON_JUGE_BASE, 'aucune table détectée, aucun effectif annoncé ancré, aucun pourcentage ni unité publiés'], 2);

// ---- vérification d'une ligne de total contre un jeu de lignes de données -------------------
const findings = [...eff.findings, ...mes.findings, ...ind.findings]; let verified = eff.verifies + mes.verifies + ind.verifies, totalsSeen = eff.annonces + mes.juges + ind.juges;
function verifyRow(t, header, totalRow, data, kind) {
  const width = Math.max(...t.rows.map(x => x.cells.length));
  for (let c = 1; c < width; c++) {
    const shown = parseNum(totalRow.cells[c]);
    if (shown == null) continue;
    const vals = data.map(row => parseNum(row.cells[c])).filter(v => v != null);
    if (vals.length < 2) continue;                      // pas assez de données pour juger la colonne
    const sum = vals.reduce((a, b) => a + b, 0);
    const tol = 0.005 * vals.length + 0.011;            // arrondi d'affichage cumulé (2 déc.) + epsilon
    if (Math.abs(sum - shown) > tol) {
      findings.push({ sev: 'bloquant', msg: `${kind} incohérent « ${header[c] || 'col.' + (c + 1)} » : affiché ${totalRow.cells[c]} ≠ somme recalculée ${Math.round(sum * 100) / 100} (${vals.length} lignes)`, where: path.basename(file) + ':' + totalRow.line + ' (' + t.origin + ')' });
    } else verified++;
  }
}

for (const t of tables) {
  const header = t.rows[0].cells;
  const grandTotals = t.rows.map((r, i) => ({ r, i })).filter(x => x.i > 0 && isGrandTotalLabel(x.r.cells[0]));
  if (grandTotals.length > 1) {
    findings.push({ sev: 'bloquant', msg: `structure ambiguë : ${grandTotals.length} lignes « Total général » dans la même table`, where: path.basename(file) + ':' + grandTotals[1].r.line + ' (' + t.origin + ')' });
  }
  let segStart = 1;                                     // début du segment de données courant
  for (let r = 1; r < t.rows.length; r++) {
    if (isGrandTotalLabel(t.rows[r].cells[0])) {        // v2 : total général = toutes les données de la table
      totalsSeen++;
      const data = t.rows.slice(1, r).filter(row => !isTotalLabel(row.cells[0]) && !isGrandTotalLabel(row.cells[0]));
      verifyRow(t, header, t.rows[r], data, 'total général');
      segStart = r + 1;
      continue;
    }
    if (!isTotalLabel(t.rows[r].cells[0])) continue;
    totalsSeen++;
    verifyRow(t, header, t.rows[r], t.rows.slice(segStart, r), 'total');
    segStart = r + 1;                                   // sous-totaux : le segment suivant repart après ce total
  }
}
if (findings.some(f => f.sev === 'bloquant')) out('FAIL', findings, NON_JUGE_BASE, 1);
if (!totalsSeen || !verified) out('SKIP', [], [...NON_JUGE_BASE, totalsSeen ? 'totaux présents mais colonnes non sommables (données < 2 lignes)' : 'tables sans ligne de total de contrôle, aucun effectif annoncé ancré'], 2);
findings.push({ sev: 'info', msg: (verified - eff.verifies - mes.verifies - ind.verifies) + ' total(aux) de colonne vérifié(s) par re-somme + ' + eff.verifies + ' effectif(s) annoncé(s) rapproché(s) de leur cardinal réel + ' + mes.verifies + '/' + mes.juges + ' mesure(s) publiée(s) portant leur dénominateur et leurs unités + ' + ind.verifies + ' indicateur(s) à valeur unique, 0 écart', where: path.basename(file) });
out('PASS', findings, NON_JUGE_BASE, 0);
