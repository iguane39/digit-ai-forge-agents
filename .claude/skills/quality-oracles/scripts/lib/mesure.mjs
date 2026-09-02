// lib/mesure — « un chiffre publié énonce son dénominateur, et une unité se lit ».
// Consommé par oracle-calculs (domaine « Calculs / chiffres »). Trois règles, deux chantiers.
//
// N3 — TF-0760 (lot Produit-12 - RETOURS - 20260831e, 31/08/2026). UNE MESURE EXACTE CASE PAR
// CASE PEUT ÊTRE FAUSSE DANS SON ENSEMBLE, ET AUCUN CONTRÔLE NE LE VOYAIT. La carte de chaleur
// d'un livrable donnait un produit à 0 % en tests, alors que ce produit porte une porte de
// couverture BLOQUANTE à 70 %. Deux défauts de conception cumulés, tous deux invisibles à un
// contrôle de forme : le DÉNOMINATEUR était fabriqué par les déclarations des AUTRES acteurs
// (une règle déclarée par un seul produit mettait les trois autres « en écart », alors qu'ils
// n'avaient jamais eu à se prononcer), et la règle du produit accusé avait été ROUTÉE HORS DU
// CORPUS parce qu'elle était générique — ce qui le privait du crédit de ce qu'il fait vraiment.
// Le défaut a été trouvé par l'ÉTONNEMENT DU LECTEUR, pas par un contrôle.
// La règle de doctrine tient en six lignes, et une seule de ses six est mécanisable :
//   · tout chiffre publié énonce son dénominateur et ce qu'il inclut ;
//   · on ne mesure un acteur que sur ce qu'il a eu l'occasion de faire ;
//   · une absence de déclaration n'est pas un échec et ne se compte pas comme un zéro ;
//   · un objet écarté d'un canal n'est pas retiré de la mesure ;
//   · préférer un compte à un pourcentage quand le dénominateur est petit ou hétérogène ;
//   · MÉCANISABLE : **un pourcentage affiché sans sa formule écrite à côté est un défaut** — et
//     il aurait forcé à écrire le dénominateur, donc à le REGARDER.
//
// N4/N5 — TF-0777 (Produit-02, 02/09/2026). Aucune règle n'imposait un dictionnaire de colonnes :
// en-têtes sans définition, infobulle « Trier par », et une hypothèse exprimée EN EUROS PAR AN
// consommée comme une valeur UNITAIRE dans « séjours × valeur ». `oracle-calculs` rendait SKIP.
//   N4 — les unités des en-têtes se lisent : une même grandeur à deux unités dans le même
//        document, une cellule dont l'unité contredit son en-tête, et une unité de FLUX
//        (€/an, €/mois) consommée par une multiplication par un COMPTE D'ÉVÉNEMENTS.
//   N5 — quand le document DÉCLARE sa source de données et qu'une hypothèse porte sur une
//        grandeur que cette source contient, l'hypothèse est CALCULABLE : on ne suppose pas ce
//        qu'on peut compter. BORNE DÉCLARÉE : ce module ne fait PAS le calcul — il constate que
//        la matière existe et nomme le fichier ; le recompute reste au producteur du livrable.
import fs from 'node:fs';
import path from 'node:path';
import { extractTables } from './tables.mjs';

const CELL_PCT = /(\d[\d\s.,]*)\s*%/;
// Ce qui vaut FORMULE à côté d'un pourcentage : une fraction écrite, un dénominateur nommé,
// une base annoncée. La liste est fermée et surchargeable — un contrôle de rédaction qui devine
// est un contrôle qui accuse à côté.
const FORMULE = [
  /\b\d[\d\s.,]*\s*\/\s*\d/,                       // 12 / 17
  /\bsur\s+\d/i,                                   // « 12 sur 17 »
  // « dénominateur » suivi d'un CHIFFRE ou d'un deux-points : le mot seul ne vaut pas formule —
  // une prose qui DIT que le dénominateur manque contenait le mot et désarmait le contrôle
  // (constaté sur la fixture rouge elle-même, qui passait au vert en décrivant son propre défaut).
  /d[ée]nominateur\b[^\n]{0,80}?(?::|=|\d)/i,
  /\bbase\s*(?::|=)/i,
  /\bn\s*=\s*\d/i,
  /\beffectif\s*(?::|=)/i,
  /\bformule\s*(?::|=)/i,
  /\bcalcul[ée]?\s+(?:comme|sur|par)\b/i,
  /\brapport[ée]?\s+[àa]\b/i,
];
// En-têtes qui PORTENT le dénominateur : une colonne de comptes à côté d'une colonne de parts
// suffit à ce que le lecteur retrouve la formule.
const ENTETE_COMPTE = /\b(nombre|nb|effectif|compte|count|base|cardinal|total|d[ée]nominateur|sur)\b/i;

// LA LISTE DES UNITÉS EST FERMÉE, et la mesure de bruit l'a imposée. Première écriture : tout
// parenthétique de fin de titre était pris pour une unité — « Oracle (invocation) », « Critère
// binaire (réussi/raté) », « Intention (« je veux… ») » étaient accusés d'incohérence d'unité.
// Trois faux positifs sur trois documents du dépôt, dont son propre README. Une unité n'est pas
// « ce qui est entre parenthèses » : c'est un membre d'une liste connue.
const UNITES_CONNUES = '€\\s*(?:\\/|par)\\s*(?:an|mois|nuit|s[ée]jour|jour|semaine|trimestre)|k?€|EUR|%|nuit[ée]?e?s?|s[ée]jours?|jours?|j\\/h|jh|heures?|h|min|km|m²|m2|Mo|Go|ko|kg|t';
const UNITE = new RegExp('\\((\\s*(?:' + UNITES_CONNUES + ')\\s*)\\)\\s*$|(?:^|\\s)(' + UNITES_CONNUES + ')\\s*$', 'i');
// Un pourcentage CIBLE, SEUIL ou POIDS n'a pas de dénominateur, et n'a pas à en avoir : il ne
// mesure pas une population, il en fixe une borne. Seuls les pourcentages MESURÉS sont jugés.
// La BANDE (« 1–10 % », « 10-30 % ») est un seuil comme un autre : elle borne, elle ne mesure
// pas. Sans elle, une table de remédiation du dépôt restait accusée alors que ses quatre lignes
// sont des intervalles — dernier faux positif de la mesure de bruit du 02/09.
const CIBLE_OU_SEUIL = /\b(cible|seuils?|objectifs?|poids|pond[ée]ration|weight|budget|tol[ée]rance|plafonds?|planchers?|max(?:imum)?|min(?:imum)?|sla|quota|marge)\b|[≥≤<>]|\d\s*[–—-]\s*\d/i;
const FLUX = /(€|eur|euros?)\s*(?:\/|par)\s*(an|mois|trimestre|semaine)/i;
// Le gras Markdown (**mot**) n est PAS une multiplication : sans cette borne, une page de la
// bibliotheque qui DECRIT le defaut (« **euros par an** s est fait multiplier par un nombre de
// sejours ») etait elle-meme accusee — dernier faux positif de la mesure de bruit du 02/09.
const MULTIPLICATION = /×|\s\*\s|\bx\b/;
const COMPTE_EVENEMENT = /\b(s[ée]jours?|nuit[ée]?e?s?|visites?|transactions?|commandes?|r[ée]servations?|passages?)\b/i;

const norme = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const sansUnite = (s) => norme(s).replace(/\([^)]*\)\s*$/, '').replace(/[€%]|\bk€\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
const uniteDe = (s) => { const m = norme(s).match(UNITE); return m ? norme(m[1] || m[2]).toLowerCase() : ''; };

/** Lignes de contexte autour d'une table : chapeau AVANT, note APRÈS, table comprise.
 *  Le rayon se compte depuis les DEUX bords de la table, jamais depuis son en-tête seul — une
 *  note de dénominateur se pose sous la table, et une table de dix lignes la mettait hors de vue. */
function contexte(lignes, premiere, derniere, rayon = 4) {
  const a = Math.max(0, premiere - 1 - rayon), b = Math.min(lignes.length, derniere + rayon);
  return lignes.slice(a, b).join('\n');
}

/**
 * @param {string} text   contenu du document
 * @param {string} ext    extension (.md/.html)
 * @param {string} base   nom de fichier pour la localisation des constats
 * @param {string} dir    répertoire du document (résolution des sources déclarées)
 * @param {object} cfg    réglages (profil `calculs.mesure`)
 * @returns {{findings: Array, verifies: number, juges: number}}
 */
export function verifierMesures(text, ext, base, dir, cfg = {}) {
  const findings = [];
  let verifies = 0, juges = 0;
  const lignes = text.split('\n');
  const nu = (ext === '.md' ? text : text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
  const lignesNu = nu.split('\n');
  const formules = (Array.isArray(cfg.formules) && cfg.formules.length ? cfg.formules.map(s => new RegExp(s, 'i')) : FORMULE);
  const aFormule = (s) => formules.some(r => r.test(s));

  // ---- N3 — un pourcentage publié sans sa formule ---------------------------------------------
  for (const t of extractTables(text, ext)) {
    const header = (t.rows[0] || { cells: [] }).cells;
    const colsPct = [];
    for (let c = 0; c < Math.max(...t.rows.map(r => r.cells.length)); c++) {
      const cellules = t.rows.slice(1).map(r => r.cells[c]).filter(Boolean);
      if (cellules.length < 3 || cellules.filter(x => CELL_PCT.test(x)).length < 3) continue;
      if (CIBLE_OU_SEUIL.test(header[c] || '') || cellules.every(x => CIBLE_OU_SEUIL.test(x))) continue;
      colsPct.push(c);
    }
    if (!colsPct.length) continue;
    juges++;
    // Le dénominateur est-il écrit QUELQUE PART : dans l'en-tête, dans une cellule, dans la note ?
    const texteTable = t.rows.map(r => r.cells.join(' | ')).join('\n');
    const note = contexte(lignesNu, t.rows[0].line, t.rows[t.rows.length - 1].line, Number.isFinite(cfg.rayon_note) ? cfg.rayon_note : 4);
    const colonneCompte = header.some((h, i) => !colsPct.includes(i) && ENTETE_COMPTE.test(h || ''))
      || t.rows.slice(1).some(r => r.cells.some((x, i) => !colsPct.includes(i) && /^\s*\d[\d\s.,]*\s*$/.test(x || '')));
    if (aFormule(texteTable) || aFormule(note) || colonneCompte) { verifies++; continue; }
    findings.push({
      sev: 'bloquant', regle: 'N3',
      msg: `pourcentage publié SANS SA FORMULE — la colonne « ${norme(header[colsPct[0]]) || 'col. ' + (colsPct[0] + 1)} » affiche des parts et le document n'écrit nulle part `
        + `le dénominateur : ni fraction (« 12 / 17 »), ni colonne de comptes, ni note (« base : … », « n = … », « dénominateur … »). `
        + `Un pourcentage dont le dénominateur n'est pas écrit n'a pas été REGARDÉ : c'est ainsi qu'un produit s'est affiché à 0 % sur une exigence qu'il tient (31/08/2026).`,
      where: base + ':' + t.rows[0].line + ' (' + t.origin + ')',
    });
  }
  // Un pourcentage en TITRE est une publication à lui seul : le chapeau doit porter sa formule.
  lignesNu.forEach((l, i) => {
    const estTitre = /^#{1,6}\s/.test(l) || /^\s*(?:\*\*|__)[^*_]{3,80}(?:\*\*|__)\s*$/.test(l);
    if (!estTitre || !CELL_PCT.test(l)) return;
    if (CIBLE_OU_SEUIL.test(l) || /\b100\s*%/.test(l)) return;   // borne, pas mesure — et 100 % est un tout
    juges++;
    const autour = lignesNu.slice(i, Math.min(lignesNu.length, i + 3)).join('\n');
    if (aFormule(l) || aFormule(autour)) { verifies++; return; }
    findings.push({
      sev: 'bloquant', regle: 'N3',
      msg: `pourcentage publié SANS SA FORMULE en tête de section — « ${norme(l).slice(0, 90)} » : ni dénominateur écrit, ni fraction, ni base annoncée dans les deux lignes qui suivent.`,
      where: base + ':' + (i + 1),
    });
  });

  // ---- N4 — les unités des en-têtes se lisent -------------------------------------------------
  const parLabel = new Map();                       // libellé sans unité -> Set(unités)
  for (const t of extractTables(text, ext)) {
    const header = (t.rows[0] || { cells: [] }).cells;
    header.forEach((h, c) => {
      const lbl = sansUnite(h); const u = uniteDe(h);
      if (!lbl || lbl.length < 3) return;
      if (u) { if (!parLabel.has(lbl)) parLabel.set(lbl, new Map()); parLabel.get(lbl).set(u, base + ':' + t.rows[0].line); }
      // U3 — la cellule contredit son en-tête
      if (!u) return;
      juges++;
      const contredit = t.rows.slice(1).map(r => r.cells[c]).filter(Boolean)
        .map(x => uniteDe(x)).filter(x => x && x !== u);
      if (!contredit.length) { verifies++; return; }
      findings.push({
        sev: 'bloquant', regle: 'N4',
        msg: `unité incohérente — l'en-tête « ${norme(h)} » annonce « ${u} » et ses cellules portent « ${[...new Set(contredit)].join(' », « ')} ». `
          + `Une colonne dont l'unité change entre son titre et son contenu ne se lit pas : c'est le défaut « valeur de séjour en euros PAR AN » du 02/09.`,
        where: base + ':' + t.rows[0].line + ' (' + t.origin + ')',
      });
    });
  }
  // U1 — une même grandeur, deux unités dans le même document
  for (const [lbl, unites] of parLabel) {
    if (unites.size < 2) continue;
    findings.push({
      sev: 'bloquant', regle: 'N4',
      msg: `unité incohérente — la grandeur « ${lbl} » est publiée avec ${unites.size} unités différentes dans le même document : « ${[...unites.keys()].join(' », « ')} ». `
        + `Le lecteur ne peut pas savoir laquelle fait foi, et un calcul qui les mélange est faux sans qu'aucune case ne le soit.`,
      where: [...unites.values()][0],
    });
  }
  // U2 — une unité de FLUX consommée par une multiplication par un compte d'ÉVÉNEMENTS
  lignesNu.forEach((l, i) => {
    // `x` doit être un MOT, jamais une lettre au milieu d'un mot : « faute de mieux » contient un
    // x, et la première écriture prenait cette phrase pour une multiplication — le constat était
    // alors porté par la mauvaise ligne, ce qui envoie corriger au mauvais endroit.
    if (!MULTIPLICATION.test(l) || !COMPTE_EVENEMENT.test(l)) return;
    juges++;
    if (!FLUX.test(l)) {
      // L'unité de flux est déclarée AILLEURS, sur l'une des grandeurs multipliées. On la cherche
      // par partage de RADICAL (six premières lettres) plutôt qu'en construisant une expression
      // à partir du libellé : construire un motif depuis du texte libre échappe mal (un « . »
      // final, un « + » dans un titre) et rate en silence — et « séjours » multiplié doit
      // retrouver « séjour » déclaré, ce qu'une comparaison de mots entiers manque.
      const operandes = norme(l).split(MULTIPLICATION).map(s => norme(s)).filter(s => s.length >= 4);
      if (operandes.length < 2) { verifies++; return; }
      let cible = null, decl = null;
      for (const op of operandes) {
        const radicaux = (op.toLowerCase().match(/[a-zà-ÿ]{5,}/g) || []).map(w => w.slice(0, 6));
        const d = lignesNu.find((x, j) => j !== i && FLUX.test(x) && radicaux.some(r => x.toLowerCase().includes(r)));
        if (d) { cible = op; decl = d; break; }
      }
      if (!decl) { verifies++; return; }
      findings.push({
        sev: 'bloquant', regle: 'N4',
        msg: `unité de FLUX consommée comme unité unitaire — « ${norme(l).slice(0, 100) }» multiplie un COMPTE D'ÉVÉNEMENTS par « ${cible.slice(0, 50)} », `
          + `grandeur déclarée ailleurs en flux (« ${norme(decl).slice(0, 70)} »). Multiplier une valeur PAR AN par un nombre de séjours ne produit pas des euros : `
          + `c'est le défaut du 02/09, resté SKIP à l'oracle des calculs.`,
        where: base + ':' + (i + 1),
      });
      return;
    }
    findings.push({
      sev: 'bloquant', regle: 'N4',
      msg: `unité de FLUX consommée comme unité unitaire — « ${norme(l).slice(0, 110)} » multiplie un compte d'événements par une valeur exprimée PAR AN (ou par mois). `
        + `Le produit n'a pas d'unité lisible : soit la valeur est unitaire, soit le compte est annuel, jamais les deux.`,
      where: base + ':' + (i + 1),
    });
  });

  // ---- N5 — une hypothèse calculable depuis la source déclarée --------------------------------
  // Deux conditions cumulées : le document DÉCLARE une source de données résolvable, et il pose
  // une HYPOTHÈSE sur une grandeur que cette source contient. Alors l'hypothèse est calculable.
  const sources = [];
  for (const m of nu.matchAll(/(?:source\s+de\s+donn[ée]es|donn[ée]es\s+source|jeu\s+de\s+donn[ée]es|source)\s*:\s*`?([\w./\\-]+\.(?:mjs|js|json|csv|ts|py))`?/gi)) {
    for (const cand of [path.resolve(dir, m[1]), path.resolve(dir, '..', m[1]), path.resolve(process.cwd(), m[1])]) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) { sources.push({ decl: m[1], chemin: cand }); break; }
    }
  }
  if (sources.length) {
    const hypotheses = [];
    lignesNu.forEach((l, i) => {
      const m = l.match(/\b(?:hypoth[èe]se|HYP|estim[ée]e?\s+[àa]|suppos[ée]e?\s+[àa]|[àa]\s+d[ée]faut\s+de\s+donn[ée]e)\b[^\n]{0,120}/i);
      if (m) hypotheses.push({ texte: norme(m[0]), ligne: i + 1 });
    });
    for (const h of hypotheses) {
      juges++;
      const mots = h.texte.toLowerCase().match(/[a-zà-ÿ]{5,}/g) || [];
      const utiles = mots.filter(w => !['hypothese', 'hypothèse', 'estimee', 'estimée', 'estime', 'suppose', 'supposee', 'supposée',
        'defaut', 'défaut', 'donnee', 'donnée', 'donnees', 'données', 'faute', 'valeur'].includes(w));
      let trouve = null;
      for (const s of sources) {
        let contenu = ''; try { contenu = fs.readFileSync(s.chemin, 'utf8'); } catch { continue; }
        const bas = contenu.toLowerCase();
        const hit = utiles.find(w => bas.includes(w));
        if (hit) { trouve = { s, hit }; break; }
      }
      if (!trouve) { verifies++; continue; }
      findings.push({
        sev: 'avertissement', regle: 'N5',
        msg: `hypothèse CALCULABLE depuis la source déclarée — « ${h.texte.slice(0, 100)} » porte sur une grandeur que le document dit tirer de \`${trouve.s.decl}\`, `
          + `et ce fichier contient « ${trouve.hit} ». On ne suppose pas ce qu'on peut compter. `
          + `BORNE DÉCLARÉE : cet oracle ne fait PAS le calcul — il constate que la matière existe et nomme le fichier ; le recompute reste au producteur du livrable.`,
        where: base + ':' + h.ligne,
      });
    }
  }

  return { findings, verifies, juges };
}

export const NON_JUGE_MESURE = [
  'N3 : la JUSTESSE du dénominateur écrit — sa présence est vérifiée, jamais sa pertinence (« on ne mesure un acteur que sur ce qu\'il a eu l\'occasion de faire » reste une revue humaine)',
  'N3 : les pourcentages en pleine prose hors table et hors titre — les mécaniser produirait plus de bruit que de gain',
  'N4 : les unités hors de la liste connue (€, €/an, %, nuits, séjours, jours, j/h, h, km, m²) et les unités écrites en toutes lettres dans la prose',
  'N5 : le CALCUL lui-même — l\'oracle constate que la source déclarée contient la grandeur supposée, il ne recalcule rien et ne dit pas quelle valeur serait juste',
  'N5 : les sources de données NON déclarées dans le document — une source qu\'on ne nomme pas est invisible à ce contrôle',
  'l\'épreuve de l\'étonnement (faire lire les résultats à quelqu\'un qui connaît le terrain) : c\'est la pratique qui a trouvé le défaut du 31/08, et elle n\'est pas mécanisable',
];
