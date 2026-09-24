// lib/coherence-fond — la cohérence de FOND d'un document, ou d'un dossier de documents dérivés
// d'une même source (TF-1352, 24/09/2026). Consommé par oracle-coherence.
//
// LE FAIT QUI L'A FAIT NAÎTRE. Le 24/09/2026, une session a répondu « oui » à « ces documents de
// proposition sont-ils cohérents entre eux ? » sur la foi d'un grep des noms d'objets : les noms
// s'écrivaient pareil partout. L'invariant était vrai, et ce n'était pas celui de la question. Le
// lendemain, une relecture humaine a trouvé 6 écarts de fond dans les 5 mêmes documents, dont 2
// contradictions internes à une seule ligne. oracle-coherence ne rapprochait alors que des
// GRANDEURS chiffrées, et le déclarait lui-même (« divergences sémantiques non chiffrées »).
//
// QUATRE FORMES, toutes vues sur le cas réel, toutes déterministes :
//   CF1  contradiction intra-ligne : une ligne classée par un statut (titre de sa section
//        « … à <verbe> », ou colonne Statut) dont le propre texte nie ce statut. BLOQUANT quand le
//        radical du statut est nié (« pas à réutiliser » sous « à réutiliser ») ; MAJEUR quand
//        c'est un antonyme connu (« recalculer » sous « à réutiliser »), parce qu'un antonyme peut
//        porter une nuance que la négation ne porte pas.
//   CF2  affirmation absolue démentie : « 0 colonne inventée » en tête d'un document dont une
//        ligne de table porte « source introuvable ». Trois familles : sans source, à confirmer,
//        manquant. Les marqueurs contraires ne se cherchent QUE dans les lignes de table : c'est
//        là que vivent les éléments que l'affirmation résume.
//   CF3  compte figé : « Le registre compte 9 notions : » juste au-dessus d'une table dont la
//        première colonne est « Notion » et qui en porte 10. Le compte se RECALCULE depuis la table
//        au moment du contrôle, jamais ne se relit. N1 d'oracle-calculs fait de même pour une liste
//        FERMÉE de noms ; CF3 prend tout nom, pourvu qu'il soit celui de la première colonne.
//   CF4  préséance non déclarée : deux documents d'un dossier dont les TABLES décrivent les mêmes
//        objets (au moins 5 clés de ligne snake_case communes, et 30 % du plus petit ensemble)
//        sans qu'aucun document du dossier ne dise lequel fait foi en cas de désaccord. Sans cette
//        phrase, un désaccord entre eux ne se lit jamais comme une anomalie. MAJEUR : c'est un
//        risque, pas un désaccord prouvé ; versions d'un même nom et livrables datés exclus.
//
// CE QU'IL NE FAIT PAS, et c'est rendu en non_juge : il ne comprend pas le texte. Il reconnaît
// des formes écrites ; une contradiction formulée autrement passe, et un antonyme nuancé peut
// accuser à tort (d'où MAJEUR et non BLOQUANT pour cette seule branche).
import fs from 'node:fs';
import path from 'node:path';
import { extractTables } from './tables.mjs';
import { isTotalLabel, isGrandTotalLabel } from './num.mjs';
import { LETTRES } from './effectifs.mjs';

// Plier casse et accents SANS changer la longueur : une position trouvée dans le texte plié
// découpe le texte d'origine, et l'extrait cité se lit tel que l'auteur l'a écrit.
const PLI = { à: 'a', â: 'a', ä: 'a', á: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', î: 'i', ï: 'i', í: 'i',
  ô: 'o', ö: 'o', ó: 'o', ù: 'u', û: 'u', ü: 'u', ú: 'u', ç: 'c', ÿ: 'y', '’': "'", 'ʼ': "'" };
export const plier = s => String(s).toLowerCase().replace(/[àâäáéèêëîïíôöóùûüúçÿ’ʼ]/g, c => PLI[c]);

const extrait = (orig, i, long = 70) => {
  const d = Math.max(0, i - 25), f = Math.min(orig.length, i + long - 25);
  return (d > 0 ? '…' : '') + orig.slice(d, f).replace(/\s+/g, ' ').trim() + (f < orig.length ? '…' : '');
};

// ---- négation : le premier mot plein AVANT le terme doit être une négation ------------------
// « pas à réutiliser », « sans les recalculer », « non-conforme », « n'est pas réutilisable » sont
// niés ; « ne pas recalculer mais réutiliser » ne l'est pas — « mais » est un mot plein.
const NEGATIONS = new Set(['pas', 'non', 'sans', 'jamais', 'aucun', 'aucune', 'ni']);
const LIANTS = new Set(['a', 'de', "d'", 'le', 'la', 'les', "l'", 'du', 'des', 'ne', "n'", 'se', "s'",
  'en', 'y', 'etre', 'est', 'sont', 'etait', 'plus', 'tout', 'du', 'au', 'aux', 'un', 'une']);
export function estNie(pli, i) {
  const mots = pli.slice(Math.max(0, i - 60), i).split(/[^a-z0-9'-]+/).filter(Boolean)
    .map(m => m.replace(/-+$/, ''));
  for (let k = mots.length - 1; k >= 0 && k >= mots.length - 5; k--) {
    let m = mots[k];
    if (/^[nd]'/.test(m) && m.length > 2) m = m.slice(2);    // « n'est » → « est »
    if (NEGATIONS.has(m)) return true;
    if (!LIANTS.has(m)) return false;
  }
  return false;
}

// ---- CF1 : statut d'une ligne, et ce qui le contredit ---------------------------------------
const radical = mot => { const m = mot.replace(/(?:ees|ee|es|er|ir|re|e|s)$/, ''); return m.length >= 4 ? m : null; };
// Antonymes connus, par radical de statut. Étendus par le profil : `coherence.antonymes`.
const ANTONYMES = {
  reutilis: ['recalcul', 'reconstrui', 'refaire', 'reecri', 'recre', 'redevelopp'],
  conserv: ['supprim', 'abandonn'],
  valid: ['a valider', 'invalid', 'a confirmer'],
  conform: ['non conforme', 'non-conforme'],
  migr: ['abandonn', 'decommission'],
  retenu: ['ecarte', 'rejete']
};
const PARTICIPES = /\b(reutilisee?s?|reutilisables?|conservee?s?|retenue?s?|validee?s?|conformes?)\b/g;
const COL_STATUT = /\b(statut|status|decision|classement|verdict|categorie|traitement)\b/;

// Les radicaux de statut d'un texte de contexte (titre de section, légende, cellule Statut).
// Un contexte qui porte DEUX statuts (« à réutiliser ou à recalculer ») ne classe rien : il est
// ignoré, et une négation dans le contexte lui-même (« à ne pas réutiliser ») aussi.
// « à <verbe> » se lit sur le texte ACCENTUÉ : plié, « chaque produit a déclaré » devient « a
// declare », pris pour « à déclarer » — 342 faux constats sur une seule page d'un produit, mesurés
// le 24/09/2026. Le verbe doit finir par -er, -ir ou -re sans accent (« déclaré » n'y entre pas).
const LETTRE = 'a-zàâäéèêëîïôöùûüç';
const RX_A_VERBE = new RegExp(`(?:^|[\\s(«"'—-])à\\s+([${LETTRE}]{4,}(?:er|ir|re))(?![${LETTRE}])`, 'g');
export function statutsDe(texte) {
  const bas = String(texte).toLowerCase();
  const pli = plier(bas);
  const rad = new Set();
  for (const m of bas.matchAll(RX_A_VERBE)) {
    if (estNie(pli, m.index + m[0].length - m[1].length)) return [];
    const r = radical(plier(m[1])); if (r) rad.add(r);
  }
  for (const m of pli.matchAll(PARTICIPES)) {
    if (estNie(pli, m.index)) return [];
    const r = radical(m[1].replace(/able?s?$/, '')); if (r) rad.add(r);
  }
  return rad.size === 1 ? [...rad] : [];
}
// Une cellule Statut courte (« REUTILISER », « À recalculer », « Validé ») : son premier mot plein.
function statutDeCellule(cell) {
  const pli = plier(cell).replace(/^[^a-z]*(?:a\s+)?/, '').trim();
  if (!pli || pli.split(/\s+/).length > 4) return [];
  if (/^(?:pas|non|sans|ne)\b/.test(pli)) return [];
  const mot = pli.match(/^[a-z]{4,}/);
  const r = mot ? radical(mot[0].replace(/able?s?$/, '')) : null;
  return r ? [r] : [];
}

// Cellule par cellule. BLOQUANT seulement quand la négation OUVRE sa cellule (40 premiers
// caractères) : c'est la forme du cas réel (« pas à réutiliser : … »). Niée en cours de phrase, elle
// vise souvent une PARTIE de la ligne (« ce trait-là n'est PAS adopté ») : MAJEUR. Mesuré le
// 24/09/2026 sur les 694 documents suivis du pilot — les 2 négations trouvées en fin de phrase
// étaient toutes deux partielles.
const OUVERTURE = 40;
function contredit(cellules, radicaux, antonymes) {
  for (const r of radicaux) {
    for (const cell of cellules) {
      const pli = plier(cell);
      for (const m of pli.matchAll(new RegExp('\\b' + r + '[a-z]*', 'g'))) {
        if (estNie(pli, m.index)) return { forme: 'nie', sev: m.index <= OUVERTURE ? 'bloquant' : 'majeur', extrait: extrait(cell, m.index), radical: r };
      }
    }
    for (const a of (antonymes[r] || [])) {
      for (const cell of cellules) {
        const pli = plier(cell);
        for (const m of pli.matchAll(new RegExp('\\b' + a.replace(/[-]/g, '[- ]'), 'g'))) {
          if (!estNie(pli, m.index)) return { forme: 'antonyme', sev: 'majeur', extrait: extrait(cell, m.index), radical: r, antonyme: a };
        }
      }
    }
  }
  return null;
}

// ---- lecture d'un document ------------------------------------------------------------------
const HTML = e => e === '.html' || e === '.htm';
function titres(raw, ext) {
  const t = [];
  if (HTML(ext)) {
    for (const m of raw.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      t.push({ line: raw.slice(0, m.index).split('\n').length, niveau: +m[1], texte: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
    }
  } else {
    let fence = false;
    raw.split('\n').forEach((l, i) => {
      if (/^\s*```/.test(l)) fence = !fence;
      const m = !fence && l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) t.push({ line: i + 1, niveau: m[1].length, texte: m[2] });
    });
  }
  return t;
}
function legendes(raw, ext) {           // <caption> d'une table HTML, par numéro de table
  if (!HTML(ext)) return [];
  return [...raw.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => {
    const c = m[0].match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
    return c ? c[1].replace(/<[^>]+>/g, ' ').trim() : '';
  });
}
// Lignes de PROSE : tables et blocs de code masqués, numéros de ligne conservés. Les suites
// d'espaces se replient en un seul : une page HTML dont les tables tiennent sur une ligne laisse,
// une fois masquée, une ligne de centaines de milliers d'espaces, et une expression ancrée en fin
// de ligne y devient quadratique (mesuré le 24/09/2026 : une page d'audit de 479 Ko, 410 699
// caractères sur une ligne, plus de 9 minutes sans rendre).
const replier = l => l.replace(/[ \t]{2,}/g, ' ');
function prose(raw, ext) {
  let t = raw.replace(/```[\s\S]*?```/g, m => m.replace(/[^\n]/g, ' '));
  if (HTML(ext)) {
    t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, m => m.replace(/[^\n]/g, ' '))
      .replace(/<table[\s\S]*?<\/table>/gi, m => m.replace(/[^\n]/g, ' '))
      .replace(/<[^>]+>/g, m => m.replace(/[^\n]/g, ' ')).replace(/&nbsp;/g, ' ');
    return t.split('\n').map(replier);
  }
  return t.split('\n').map(l => (/^\s*\|/.test(l) ? '' : replier(l)));
}
export function lireDocument(f) {
  const raw = fs.readFileSync(f, 'utf8');
  const ext = path.extname(f).toLowerCase();
  const tables = extractTables(raw, ext);
  const tt = titres(raw, ext), leg = legendes(raw, ext);
  tables.forEach((t, k) => {
    const l0 = t.rows[0].line;
    t.titre = [...tt].reverse().find(x => x.line < l0) || null;
    t.legende = HTML(ext) ? (leg[Number((t.origin.match(/#(\d+)/) || [0, 0])[1]) - 1] || '') : '';
    t.donnees = t.rows.slice(1).filter(r => r.cells.some(c => String(c).trim())
      && !isTotalLabel(r.cells[0]) && !isGrandTotalLabel(r.cells[0]));
  });
  return { f, nom: path.basename(f), raw, ext, tables, titres: tt, lignes: prose(raw, ext) };
}
const ou = (doc, line) => doc.nom + ':' + line;

// ---- CF1 ------------------------------------------------------------------------------------
function cf1(doc, antonymes, acc) {
  for (const t of doc.tables) {
    const entete = t.rows[0].cells.map(plier);
    const iStatut = entete.findIndex(c => COL_STATUT.test(c));
    const ctx = t.titre ? t.titre.texte + (t.legende ? ' — ' + t.legende : '') : t.legende;
    const radTitre = ctx ? statutsDe(ctx) : [];
    for (const r of t.donnees) {
      const sources = [];
      if (radTitre.length) sources.push({ rad: radTitre, dou: `section « ${ctx.trim()} »`, sauf: -1 });
      if (iStatut >= 0 && r.cells[iStatut]) {
        const rs = statutDeCellule(r.cells[iStatut]);
        if (rs.length) sources.push({ rad: rs, dou: `colonne « ${t.rows[0].cells[iStatut]} » = « ${r.cells[iStatut]} »`, sauf: iStatut });
      }
      if (!sources.length) continue;
      acc.cf1_lignes++;
      for (const s of sources) {
        const c = contredit(r.cells.filter((_, k) => k !== s.sauf), s.rad, antonymes);
        if (!c) continue;
        const quoi = c.forme === 'nie'
          ? (c.sev === 'bloquant' ? `son propre texte NIE ce statut` : `son texte nie ce statut en cours de phrase (peut-être une partie de la ligne seulement)`)
          : `son propre texte porte « ${c.antonyme} », contraire connu du statut`;
        acc.findings.push({ sev: c.sev, where: ou(doc, r.line),
          msg: `CF1 contradiction intra-ligne : la ligne « ${String(r.cells[0]).slice(0, 60)} » est classée par ${s.dou}, et ${quoi} : « ${c.extrait} »` });
        break;
      }
    }
  }
}

// ---- CF2 ------------------------------------------------------------------------------------
const ZERO = String.raw`\b(?:0|zero|aucun|aucune)\s+`;
const MOTS02 = String.raw`(?:[a-z'-]+\s+){0,2}?`;
const CENT = String.raw`\b100\s*%\s*(?:des\s+|de\s+|du\s+)?` + MOTS02;
const FAMILLES = [
  { cle: 'sans source',
    // « orphelin » n'y figure pas : « 0 orphelins » parle d'une JOINTURE, pas d'un élément sans
    // source (mesuré chez les produits le 24/09/2026).
    affirmations: [ZERO + MOTS02 + String.raw`(?:inventee?s?|non[- ]sourcee?s?|sans source|non[- ]tracee?s?)\b`,
      CENT + String.raw`(?:sourcee?s?|tracee?s?)\b`,
      String.raw`\btou(?:te)?s\s+les\s+[a-z'-]+\s+(?:sont|ont ete)\s+(?:sourcee?s|tracee?s)\b`],
    marqueurs: [String.raw`\bintrouvables?\b`, String.raw`\bsources?\s+inconnues?\b`, String.raw`\bsans source\b`,
      String.raw`\bnon[- ]sourcee?s?\b`, String.raw`\bnon[- ]tracee?s?\b`, String.raw`\ba tracer\b`,
      String.raw`\borigine inconnue\b`, String.raw`\binventee?s?\b`] },
  { cle: 'à confirmer',
    affirmations: [ZERO + String.raw`(?:hypotheses?|points?\s+ouverts?|points?\s+a\s+confirmer|inconnues?)\b`,
      CENT + String.raw`(?:validee?s?|confirmee?s?)\b`],
    marqueurs: [String.raw`\ba confirmer\b`, String.raw`\ba valider\b`, String.raw`\bhypotheses?\b`, String.raw`\btbd\b`,
      String.raw`\btodo\b`, String.raw`\ba definir\b`, String.raw`\?\?`] },
  { cle: 'manquant',
    affirmations: [ZERO + MOTS02 + String.raw`(?:manquante?s?|non\s+couverte?s?)\b`, ZERO + String.raw`(?:trous?|lacunes?)\b`,
      CENT + String.raw`(?:couverte?s?|completes?)\b`],
    // « à compléter » n'y figure pas : c'est souvent un PALIER de travail (mapping à compléter),
    // pas un élément manquant — seul constat CF2 restant chez les produits le 24/09/2026, ambigu.
    marqueurs: [String.raw`\bmanquante?s?\b`, String.raw`\bnon\s+couverte?s?\b`] }
];
const VALEUR_MAX = 60;
// Négation d'un GROUPE nominal : « sans valeur manquante », « aucune source introuvable » — une
// négation parmi les deux mots pleins qui précèdent le marqueur.
function nieProche(pli, i) {
  const mots = pli.slice(Math.max(0, i - 40), i).split(/[^a-z0-9'-]+/).filter(Boolean).filter(m => !LIANTS.has(m)).slice(-2);
  return mots.some(m => NEGATIONS.has(m.replace(/^[nd]'/, '')));
}
// La PORTÉE d'une affirmation : écrite en préambule (avant le premier sous-titre), elle vaut pour
// tout le document — c'est le cas réel, « 0 colonne inventée » en en-tête ; écrite dans une section,
// elle ne vaut que pour les tables de cette section et de ses sous-sections. Mesuré le 24/09/2026
// chez les produits : à l'échelle du document, « 2 MAPPER + 0 SANS SOURCE = 2 métier », écrit pour
// UNE table cible, était accusé par les 25 lignes « SANS SOURCE » des AUTRES tables (33 faux).
function tablesDansLaPortee(doc, ligne) {
  const premierSousTitre = (doc.titres.find(x => x.niveau >= 2) || { line: Infinity }).line;
  if (ligne < premierSousTitre) return doc.tables;
  const s = [...doc.titres].reverse().find(x => x.line <= ligne);
  if (!s) return doc.tables;
  const fin = (doc.titres.find(x => x.line > s.line && x.niveau <= s.niveau) || { line: Infinity }).line;
  return doc.tables.filter(t => t.rows[0].line > s.line && t.rows[0].line < fin);
}
function cf2(doc, acc) {
  if (!doc.tables.length) return;
  doc.lignes.forEach((l, i) => {
    const pli = plier(l);
    for (const fam of FAMILLES) {
      for (const a of fam.affirmations) {
        for (const m of pli.matchAll(new RegExp(a, 'g'))) {
          if (estNie(pli, m.index)) continue;
          const portee = tablesDansLaPortee(doc, i + 1);
          if (!portee.length) continue;
          // Un marqueur ne compte que dans une cellule COURTE, qui porte une VALEUR : « source
          // introuvable », « À confirmer ». Dans une phrase longue, il énonce presque toujours une
          // règle (« interdiction du chiffre sans source ») — mesuré le 24/09/2026 : les 3 constats
          // du pilot pris dans des phrases étaient tous des énoncés de règle.
          const contraires = [];
          for (const t of portee) for (const r of t.donnees) {
            const vu = r.cells.some(cell => {
              const p = plier(cell).replace(/[*_`]/g, ' ').trim();
              if (!p || p.length > VALEUR_MAX) return false;
              for (const mk of fam.marqueurs) {
                const h = [...p.matchAll(new RegExp(mk, 'g'))].find(x => !estNie(p, x.index) && !nieProche(p, x.index));
                if (h) { contraires.push(`« ${String(cell).trim().slice(0, 50)} » (${ou(doc, r.line)})`); return true; }
              }
              return false;
            });
            if (vu) continue;
          }
          const dit = l.slice(m.index, m.index + m[0].length).trim();
          if (contraires.length) {
            acc.findings.push({ sev: 'bloquant', where: ou(doc, i + 1),
              msg: `CF2 affirmation absolue démentie : « ${dit} » — ${contraires.length} ligne(s) de table ${portee === doc.tables ? 'du même document' : 'de la même section'} portent le contraire (famille « ${fam.cle} ») : ${contraires.slice(0, 4).join(' ; ')}${contraires.length > 4 ? ' ; …' : ''}` });
          } else acc.cf2_affirmations++;
        }
      }
    }
  });
}

// ---- CF3 ------------------------------------------------------------------------------------
const MOTS_NOMBRES = Object.keys(LETTRES).sort((a, b) => b.length - a.length).join('|');
const RX_COMPTE = new RegExp(String.raw`(?<![a-z0-9,.])(\d{1,4}|` + MOTS_NOMBRES + String.raw`)\s+([a-z][a-z'-]{2,}[sx])\b`, 'g');
const RX_AVANT_PARTIEL = /\b(?:dont|parmi|sur|de ces|seulement|encore|plus|moins|environ|pres de)\s*$/;
const singulier = n => (n.endsWith('x') ? n.slice(0, -1) : n.replace(/s$/, ''));
// Le SUJET d'une table est le premier mot plein de sa PREMIÈRE colonne : une table dont la
// première colonne s'intitule « Notion » porte une ligne par notion. Les mots du titre de section
// ne comptent pas — mesuré le 24/09/2026 sur les 694 documents du pilot, ils rattachaient « 3
// actions », « 13 forges » ou « 2 items » à des tables qui n'énuméraient pas ces objets (38 faux
// positifs sur 38).
const sujetDe = t => {
  const m = plier(t.rows[0].cells[0] || '').replace(/[*_`]/g, ' ').match(/[a-z][a-z'-]{3,}/);
  return m ? singulier(m[0]) : null;
};
// L'AMORCE d'une table : le paragraphe qui la précède immédiatement et finit par « : », ou le titre
// posé juste au-dessus. C'est le seul endroit où un compte désigne SANS AMBIGUÏTÉ la table qui
// suit. Mesuré le 24/09/2026 sur les 694 documents du pilot : rattaché par section ou par
// préambule, un compte désignait presque toujours autre chose (« 243 classés », « 2 dépôts »
// devant une table de 38 lignes, « deux familles » pour 4 sources de 2 familles, une phrase
// coupée par un retour à la ligne) ; rattaché par amorce, il a trouvé le seul vrai écart du
// corpus — « Les quatre exemptions, et rien d'autre » au-dessus d'une table qui en porte cinq.
const RX_TITRE_MD = /^\s*#{1,6}\s/;
function amorce(doc, t) {
  const L = doc.lignes, lignesTitres = new Set(doc.titres.map(x => x.line));
  let i = t.rows[0].line - 2;
  while (i >= 0 && !L[i].trim()) i--;
  if (i < 0) return null;
  if (RX_TITRE_MD.test(L[i]) || lignesTitres.has(i + 1)) return { texte: L[i].replace(/^\s*#+\s*/, ''), line: i + 1, titre: true };
  const fin = i;
  while (i >= 0 && L[i].trim() && !RX_TITRE_MD.test(L[i]) && !lignesTitres.has(i + 1)) i--;
  const texte = L.slice(i + 1, fin + 1).join(' ');
  // Découpe de fin LINÉAIRE : une classe répétée ancrée en fin (`[…]+$`) est quadratique sur une
  // longue suite qui ne finit pas la chaîne.
  let s = texte.trimEnd();
  while (s && '*_`'.includes(s[s.length - 1])) s = s.slice(0, -1).trimEnd();
  return s.endsWith(':') ? { texte, line: i + 2, titre: false } : null;
}
// Une table de GROUPES — première colonne qui énumère (« latitude, longitude, elevation (3) »,
// « 14 codes externes ») — porte un compte que ses lignes ne disent pas : seule la somme d'une
// colonne peut la juger, et sinon elle n'est pas jugée (« 18 colonnes » au-dessus de 3 lignes qui
// en groupent 1 + 3 + 14, faux positif mesuré chez un produit le 24/09/2026).
// Signe d'un groupe : un effectif entre parenthèses, ou une liste de mots SIMPLES séparés par des
// virgules. Une virgule de prose (« le juge, chez le produit ») ou une mesure en tête (« 2560 px »)
// n'en sont pas : les compter écartait 2 vrais comptes figés du pilot (mesuré le 24/09/2026).
const estTableDeGroupes = t => t.donnees.some(r => /\(\d+\)|^\s*[^\s,]+(?:\s*,\s*[^\s,]+)+\s*$/.test(String(r.cells[0] || '').replace(/[*_`]/g, '')));
function cf3(doc, acc) {
  for (const t of doc.tables) {
    const sujet = sujetDe(t);
    const a = sujet && amorce(doc, t);
    if (!a) continue;
    // Seule la DERNIÈRE phrase de l'amorce annonce la table : « La forge déclare 56 limites. Les
    // trois qui bornent le plus la lecture : » n'annonce pas 56 lignes (faux positif du 24/09/2026).
    const phrases = a.texte.replace(/[*_`]/g, ' ').split(/(?<=[.!?])\s+/);
    const orig = phrases[phrases.length - 1];
    const pli = plier(orig);
    for (const m of pli.matchAll(RX_COMPTE)) {
      const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : LETTRES[m[1]];
      if (!(n >= 2) || singulier(m[2]) !== sujet) continue;
      if (RX_AVANT_PARTIEL.test(pli.slice(Math.max(0, m.index - 14), m.index))) continue;
      // Un compte pris dans une FORMULE (« 43 colonnes métier + 8 SCD2 = 51 ») n'est pas le total.
      if (/^[^.:;]{0,25}[+=]/.test(pli.slice(m.index + m[0].length))) continue;
      const reel = t.donnees.length;
      const dit = orig.slice(m.index, m.index + m[0].length).replace(/\s+/g, ' ').trim();
      if (reel === n) { acc.cf3_comptes++; continue; }
      // Une table de GROUPES porte son compte dans une colonne : « 14 constats » au-dessus de
      // lignes « 1 nom… », « 6 noms… », « 2 noms… », « 5 noms… » est juste (faux positif mesuré
      // le 24/09/2026). Le compte vaut alors la somme des nombres qui ouvrent une colonne.
      const largeur = Math.max(...t.donnees.map(r => r.cells.length));
      const parSomme = Array.from({ length: largeur }, (_, c) => {
        const v = t.donnees.map(r => String(r.cells[c] || '').replace(/[*_`\s]/g, ' ').trim().match(/^(\d{1,4})\b/));
        return v.every(Boolean) ? v.reduce((s, x) => s + parseInt(x[1], 10), 0) : null;
      }).some(s => s === n);
      if (parSomme) { acc.cf3_comptes++; continue; }
      if (estTableDeGroupes(t)) { acc.cf3_ambigus++; continue; }
      acc.findings.push({ sev: 'bloquant', where: ou(doc, a.line),
        msg: `CF3 compte figé : « ${dit} » annonce la table qui suit (${ou(doc, t.rows[0].line)}), qui en porte ${reel} — un compte se recalcule depuis la table qu'il résume, jamais ne se relit` });
    }
  }
}

// ---- CF4 ------------------------------------------------------------------------------------
const RX_ID = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
const RX_PRESEANCE = /fait foi|font foi|prevaut|prevalent|prime sur|priment sur|source de verite|en cas de (?:desaccord|divergence|conflit|contradiction|ecart)/;
const RX_PRESEANCE_GENERALE = /\b(?:le|la) (?:plus fin|plus fine|plus detaille|plus detaillee)\b|granularite la plus fine/;
// Deux documents « décrivent les mêmes objets » quand leurs TABLES ont des lignes sur ces objets :
// l'identifiant compte s'il sert de CLÉ de ligne (deux premières colonnes d'une ligne de données).
// Pris dans tout le texte, il comptait le vocabulaire des outils (`non_juge`, `render_page`) que
// toutes les synthèses du pilot citent : 5 407 paires accusées sur un seul dépôt, le 24/09/2026.
function identifiants(doc) {
  const ids = new Set();
  for (const t of doc.tables) for (const r of t.donnees) for (const c of r.cells.slice(0, 2)) {
    for (const m of plier(c).matchAll(RX_ID)) if (m[0].length >= 6) ids.add(m[0]);
  }
  return ids;
}
function cf4(docs, acc) {
  if (docs.length < 2) return;
  const ids = docs.map(identifiants);
  const noms = docs.map(d => { const b = plier(d.nom), s = b.replace(/\.[a-z0-9]+$/, ''); return s.length >= 5 ? [b, s] : [b]; });
  // Déclarations : fenêtre de ±2 lignes autour de chaque phrase de préséance ; on y relève les
  // documents NOMMÉS. Une déclaration générale (« le plus fin fait foi ») couvre tout le dossier.
  const declare = new Set(); let generale = null;
  docs.forEach((d, k) => {
    const L = (HTML(d.ext) ? d.raw.replace(/<[^>]+>/g, ' ') : d.raw).split('\n').map(plier);
    L.forEach((l, i) => {
      if (!RX_PRESEANCE.test(l)) return;
      const fen = L.slice(Math.max(0, i - 2), i + 3).join(' ');
      if (RX_PRESEANCE_GENERALE.test(fen)) generale = ou(d, i + 1);
      const cites = docs.map((_, j) => j).filter(j => j === k || noms[j].some(n => fen.includes(n)));
      for (const a of cites) for (const b of cites) if (a < b) declare.add(a + ':' + b);
    });
  });
  // Un même livrable sous deux formes n'est pas deux documents : deux formats (`.md` et son rendu
  // `.html`, que R-4 laisse au même indice), ou deux versions du même nom (date, indice, « v1.2 »,
  // « (1) »). Et deux livrables DATÉS ont une préséance écrite dans leur nom : le plus récent fait
  // foi (règle 5 de REGLES-PROJET.md). Mesuré chez 8 produits le 24/09/2026 : 37 paires de
  // versions et 179 de livrables datés sur 297 accusées, toutes sans désaccord à signaler.
  const canon = d => d.nom.replace(/\.[A-Za-z0-9]+$/, '').replace(/[-_ ]?\d{8}[a-z]?/g, '')
    .replace(/\d{4}-\d{2}-\d{2}-?/g, '').replace(/[-_ ]?v\d+(?:\.\d+)*/gi, '').replace(/\s*\(\d+\)/g, '').trim().toLowerCase();
  const date = d => /\d{8}[a-z]?|\d{4}-\d{2}-\d{2}/.test(d.nom);
  for (let a = 0; a < docs.length; a++) for (let b = a + 1; b < docs.length; b++) {
    if (canon(docs[a]) === canon(docs[b])) continue;
    if (date(docs[a]) && date(docs[b])) { acc.cf4_dates++; continue; }
    const communs = [...ids[a]].filter(x => ids[b].has(x));
    if (communs.length < 5 || communs.length < 0.3 * Math.min(ids[a].size, ids[b].size)) continue;
    if (generale || declare.has(a + ':' + b)) { acc.cf4_paires++; continue; }
    // MAJEUR et non bloquant : une préséance absente est un RISQUE (un désaccord futur ne se lira
    // pas comme tel), pas un désaccord prouvé ; CF1 à CF3 et les grandeurs jugent les désaccords.
    acc.findings.push({ sev: 'majeur', where: docs[a].nom + ' ↔ ' + docs[b].nom,
      msg: `CF4 préséance non déclarée : « ${docs[a].nom} » et « ${docs[b].nom} » décrivent ${communs.length} objets communs (${communs.slice(0, 5).join(', ')}${communs.length > 5 ? ', …' : ''}) et aucun document du dossier ne dit lequel fait foi en cas de désaccord — sans cette phrase, un désaccord entre eux ne se lit jamais comme une anomalie` });
  }
}

export const NON_JUGE_FOND = [
  'CF1 : contradictions hors lexique (le radical du statut nié, et les antonymes connus de lib/coherence-fond.mjs, extensibles par le profil coherence.antonymes) ; lignes sans contexte de classement (ni section « … à <verbe> », ni colonne Statut) ; contextes à deux statuts',
  'CF2 : affirmations absolues hors des trois familles (sans source, à confirmer, manquant) ; marqueurs contraires écrits dans une phrase plutôt que dans une cellule-valeur ; une affirmation écrite dans une section ne se confronte qu aux tables de cette section (écrite en préambule, à tout le document)',
  'CF3 : tout compte qui n est PAS dans la dernière phrase de l amorce de sa table (paragraphe finissant par « : » ou titre juste au-dessus) — préambule, prose éloignée, autre document : les rattacher à une table accusait à tort 37 fois sur 38 au pilot le 24/09/2026 ; comptes partiels (« dont », « parmi », « sur ») ou pris dans une formule (« 43 … + 8 … = 51 ») ; tables de GROUPES dont la somme ne se lit dans aucune colonne ; comptes de valeurs DISTINCTES d une colonne',
  'CF4 : documents qui décrivent les mêmes objets sous des noms non snake_case ; versions d un même nom et livrables DATÉS, dont la date tient lieu de préséance (règle 5) ; la JUSTESSE de la préséance déclarée (sa présence est vérifiée, jamais sa pertinence) ; CF4 est majeur, jamais bloquant',
  'la vérité d une ligne au regard de sa source : une ligne cohérente avec son statut peut être fausse'
];

/** Juge le fond de `fichiers` ; `dossier` active CF4. Rend { findings, verifies, detail }. */
export function jugerFond(fichiers, { profil = {}, dossier = false } = {}) {
  const antonymes = { ...ANTONYMES };
  for (const [r, l] of Object.entries((profil.coherence && profil.coherence.antonymes) || {})) {
    antonymes[r] = [...new Set([...(antonymes[r] || []), ...l.map(plier)])];
  }
  const acc = { findings: [], cf1_lignes: 0, cf2_affirmations: 0, cf3_comptes: 0, cf3_ambigus: 0, cf4_paires: 0, cf4_dates: 0 };
  const docs = [];
  for (const f of fichiers) { try { docs.push(lireDocument(f)); } catch { /* illisible : ignoré */ } }
  for (const d of docs) { cf1(d, antonymes, acc); cf2(d, acc); cf3(d, acc); }
  if (dossier) cf4(docs, acc);
  const verifies = acc.cf1_lignes + acc.cf2_affirmations + acc.cf3_comptes + acc.cf4_paires;
  return { findings: acc.findings, verifies, detail: acc };
}
