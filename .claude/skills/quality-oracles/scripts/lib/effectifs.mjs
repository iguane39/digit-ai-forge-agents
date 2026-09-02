// lib/effectifs — effectifs ANNONCÉS en prose, rapprochés du CARDINAL RÉEL de ce qu'ils annoncent.
//
// DÉFAUT PAYÉ (Produit-05, 31/08/2026) : l'oracle Calculs re-sommait correctement les colonnes,
// mais ne rapprochait AUCUN effectif écrit en prose du nombre d'objets qu'il annonce. Le sommaire
// annonçait « Sept écarts que la boucle n'a pas pu lever » au-dessus d'un tableau qui en portait
// HUIT (E1 à E8) — décalage introduit avec E8, présent dans TROIS versions livrées, invisible aux
// quatre portes, trouvé à la main. Le badge du même onglet disait « 8 écarts résiduels » : deux
// comptes contradictoires dans le même écran.
//
// N1 — un effectif annoncé (chiffres OU lettres) suivi d'un nom dénombrable, en TÊTE d'une liste
//      ou d'un tableau, est comparé au cardinal réel de cette ancre.
// N2 — une fois le cardinal réel connu pour un nom, tout AUTRE effectif annoncé pour ce même nom
//      dans le document et qui en diffère est signalé (cas du badge contradictoire).
//
// Périmètre volontairement étroit (bruit mesuré à 0 sur le parc du dépôt) : l'effectif doit être
// ≥ 2, porté par un titre ou une ligne s'achevant par « : », et l'ancre doit suivre immédiatement.
import { isTotalLabel, isGrandTotalLabel } from './num.mjs';

const LETTRES = {
  deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20, 'vingt-et-un': 21,
  'vingt-deux': 22, 'vingt-trois': 23, 'vingt-quatre': 24, 'vingt-cinq': 25, 'vingt-six': 26,
  'vingt-sept': 27, 'vingt-huit': 28, 'vingt-neuf': 29, trente: 30, 'trente-et-un': 31,
  'trente-deux': 32, 'trente-cinq': 35, quarante: 40, cinquante: 50, soixante: 60,
  'quatre-vingts': 80, 'quatre-vingt': 80, cent: 100
};
// Noms dénombrables d'objets de document. Volontairement sans « ligne » ni « colonne » (bruit).
export const NOMS_DENOMBRABLES = [
  'écarts', 'questions', 'constats', 'lots', 'travaux', 'exigences', 'risques', 'hypothèses',
  'chapitres', 'actions', 'décisions', 'critères', 'étapes', 'points', 'items', 'livrables',
  'oracles', 'fiches', 'recommandations', 'scénarios', 'axes', 'conditions', 'contrôles',
  'sections', 'annexes', 'indicateurs', 'jalons', 'options', 'principes', 'règles', 'tâches',
  'onglets', 'capacités', 'portes', 'anomalies', 'defauts', 'défauts'
];

const mots = Object.keys(LETTRES).sort((a, b) => b.length - a.length).join('|');
const noms = NOMS_DENOMBRABLES.slice().sort((a, b) => b.length - a.length).join('|');
// « sept écarts », « 19 questions », « huit travaux de bascule » — un qualificatif toléré entre les deux.
const RX_EFFECTIF = new RegExp(
  `(?<![a-zA-ZÀ-ÿ0-9])(\\d{1,4}|${mots})(?![a-zA-ZÀ-ÿ])\\s+(?:(?:autres|premiers?|premières?|derniers?|dernières?|grands?|petits?|nouveaux|nouvelles?)\\s+)?(${noms})(?![a-zA-ZÀ-ÿ])`,
  'gi');

const valeur = t => (/^\d+$/.test(t) ? parseInt(t, 10) : LETTRES[t.toLowerCase()]);
const RX_PUCE = /^(\s*)(?:[-*+]|\d{1,3}[.)])\s+\S/;
const RX_ID = /^[A-Z]{1,3}[-_]?\d{1,3}$/;

// L'effectif doit OUVRIR le titre ou la ligne : « Sept écarts que la boucle… », « Trois
// questions restées ouvertes : ». Sans cette borne, tout nombre cité au passage dans un titre
// (« rubrique — 3 à 7 axes », « (les 3 critères binaires) ») était rapproché de la première
// liste venue : 19 FAIL sur 469 documents du dépôt, tous faux. Après la borne : 0.
const RX_ENTETE = /^[\s#>*_`+-]*(?:\d{1,3}[.)]\s*)?(?:\*\*)?(?:les|des|ces|ses|nos|leurs|voici)?\s*/i;
// Garde-fou de fourchette : « 3 à 7 axes », « entre 3 et 7 axes » n'annoncent aucun effectif.
const RX_FOURCHETTE = /(?:\d|\b(?:un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix))\s*(?:à|-|et)\s*$/i;

// ---- cardinal d'une ancre markdown ------------------------------------------------------------
function ancreMarkdown(lines, start) {
  let j = start, prose = 0;
  while (j < lines.length && j < start + 7) {
    const l = lines[j];
    if (!l.trim()) { j++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) return tableauMd(lines, j);
    if (RX_PUCE.test(l)) return listeMd(lines, j);
    if (/^#{1,6}\s/.test(l)) return null;                       // autre titre : l'annonce n'a pas d'ancre
    if (++prose > 2) return null;                               // trop de prose intercalée
    j++;
  }
  return null;
}

function tableauMd(lines, j) {
  const rows = [];
  for (let k = j; k < lines.length && /^\s*\|.*\|\s*$/.test(lines[k]); k++) {
    if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[k])) continue;        // séparateur
    rows.push(lines[k].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  }
  if (rows.length < 2) return null;
  const data = rows.slice(1).filter(r => !isTotalLabel(r[0]) && !isGrandTotalLabel(r[0]) && r.some(c => c));
  const ids = data.map(r => String(r[0] || '').replace(/[*_`]/g, '').trim()).filter(x => RX_ID.test(x));
  return { type: 'tableau', ligne: j + 1, cardinal: ids.length === data.length && ids.length ? new Set(ids).size : data.length, detail: ids.length === data.length && ids.length ? 'identifiants distincts : ' + ids.join(', ') : data.length + ' ligne(s) de données' };
}

function listeMd(lines, j) {
  const m0 = lines[j].match(RX_PUCE); const indent = m0[1].length;
  let n = 0, k = j, vides = 0;
  for (; k < lines.length; k++) {
    const l = lines[k];
    if (!l.trim()) { if (++vides > 1) break; continue; }
    const m = l.match(RX_PUCE);
    // Une puce MOINS indentée referme la sous-liste : sans cette borne, une annonce placée
    // au-dessus d'une sous-liste comptait aussi les puces de la liste parente qui la suivent.
    if (m) { if (m[1].length < indent) break; if (m[1].length === indent) { n++; vides = 0; } continue; }
    if (/^\s{2,}\S/.test(l)) { vides = 0; continue; }            // continuation d'un item
    break;
  }
  return n >= 2 ? { type: 'liste', ligne: j + 1, cardinal: n, detail: n + ' item(s) de premier niveau' } : null;
}

// ---- cardinal d'une ancre HTML ----------------------------------------------------------------
function ancreHtml(text, from) {
  const zone = text.slice(from, from + 2000);
  const mList = zone.search(/<(?:table|ul|ol)\b/i);
  if (mList < 0) return null;
  const avant = zone.slice(0, mList);
  if (/<h[1-6]\b/i.test(avant)) return null;                     // un autre titre s'intercale
  const ligne = text.slice(0, from + mList).split('\n').length;
  const reste = zone.slice(mList);
  if (/^<table\b/i.test(reste)) {
    const bloc = (reste.match(/^<table[\s\S]*?<\/table>/i) || [reste])[0];
    const trs = [...bloc.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => m[0]);
    const data = trs.filter(tr => !/<th\b/i.test(tr));
    const prem = data.map(tr => { const c = tr.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/i); return c ? c[1].replace(/<[^>]+>/g, '').trim() : ''; });
    const utiles = prem.filter((x, i) => !isTotalLabel(x) && !isGrandTotalLabel(x)).length;
    const ids = prem.filter(x => RX_ID.test(x));
    if (utiles < 2) return null;
    return { type: 'tableau', ligne, cardinal: ids.length === prem.length && ids.length ? new Set(ids).size : utiles, detail: ids.length === prem.length && ids.length ? 'identifiants distincts : ' + ids.join(', ') : utiles + ' ligne(s) de données' };
  }
  const bloc = (reste.match(/^<(ul|ol)[\s\S]*?<\/\1>/i) || [reste])[0];
  const n = (bloc.match(/<li\b/gi) || []).length;
  return n >= 2 ? { type: 'liste', ligne, cardinal: n, detail: n + ' item(s)' } : null;
}

// ---- API --------------------------------------------------------------------------------------
// Retourne { findings, verifies, annonces } — findings au contrat commun (sev/msg/where).
export function verifierEffectifs(text, ext, base) {
  const findings = [], cardinaux = new Map(), annoncesToutes = [];
  let verifies = 0, annonces = 0;
  const html = ext === '.html' || ext === '.htm';

  // Une annonce n'est ancrable que si l'effectif OUVRE le titre / la ligne (cf. RX_ENTETE).
  const ouvre = (ligneTexte, idx) => idx === ligneTexte.match(RX_ENTETE)[0].length;
  const fourchette = (ligneTexte, idx) => RX_FOURCHETTE.test(ligneTexte.slice(0, idx));

  if (html) {
    for (const h of text.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
      const titre = h[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
      const ligne = text.slice(0, h.index).split('\n').length;
      for (const m of titre.matchAll(RX_EFFECTIF)) {
        if (fourchette(titre, m.index)) continue;
        const ancrable = ouvre(titre, m.index);
        annoncesToutes.push({ n: valeur(m[1]), nom: m[2].toLowerCase(), brut: m[0].trim(), ligne, ancre: ancrable ? () => ancreHtml(text, h.index + h[0].length) : () => null });
      }
    }
    // Effectifs hors titres (badges, encarts) : jamais ancrés, servis à N2 seulement.
    const plat = text.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, ' ').replace(/<[^>]+>/g, ' ');
    for (const m of plat.matchAll(RX_EFFECTIF)) {
      if (fourchette(plat, m.index)) continue;
      annoncesToutes.push({ n: valeur(m[1]), nom: m[2].toLowerCase(), brut: m[0].trim(), ligne: 0, ancre: () => null });
    }
  } else {
    const lines = text.split('\n');
    let fence = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
      if (fence) continue;
      const enTete = /^#{1,6}\s/.test(l) || /:\s*$/.test(l);
      for (const m of l.matchAll(RX_EFFECTIF)) {
        if (fourchette(l, m.index)) continue;
        const ancrable = enTete && ouvre(l, m.index);
        annoncesToutes.push({
          n: valeur(m[1]), nom: m[2].toLowerCase(), brut: m[0].trim(), ligne: i + 1,
          ancre: ancrable ? () => ancreMarkdown(lines, i + 1) : () => null
        });
      }
    }
  }

  for (const a of annoncesToutes) {
    if (!a.n || a.n < 2) continue;
    const anc = a.ancre();
    if (!anc) continue;
    annonces++;
    cardinaux.set(a.nom, anc.cardinal);
    if (anc.cardinal !== a.n) {
      findings.push({ sev: 'bloquant', msg: `N1 — effectif annoncé « ${a.brut} » ≠ cardinal réel ${anc.cardinal} (${anc.type} ligne ${anc.ligne} : ${anc.detail})`, where: base + ':' + a.ligne });
    } else verifies++;
  }
  // N2 — autres mentions du même nom dénombrable, une fois le cardinal réel mesuré.
  for (const a of annoncesToutes) {
    if (!a.n || a.n < 2 || a.ancre()) continue;
    const reel = cardinaux.get(a.nom);
    if (reel === undefined || reel === a.n) continue;
    findings.push({ sev: 'bloquant', msg: `N2 — compte contradictoire dans le même document : « ${a.brut} » alors que le cardinal réel mesuré est ${reel}`, where: base + (a.ligne ? ':' + a.ligne : '') });
  }
  return { findings, verifies, annonces };
}
