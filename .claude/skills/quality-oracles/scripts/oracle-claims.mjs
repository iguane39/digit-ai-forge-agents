#!/usr/bin/env node
// oracle-claims — Domaine « Traçabilité des affirmations chiffrées » (v2, déterministe).
// Transcription exécutable de la règle dure : « toute donnée affichée trace à une source
// citée ou un calcul rejoué, sinon est marquée à vérifier ».
//   1. Montant monétaire (€, k€, $) hors table SANS marqueur de source (profil) ni
//      « à vérifier » dans son paragraphe → BLOQUANT.
//   2. (v2) TJM chiffré non sourcé → BLOQUANT. Charge en jours-homme non sourcée →
//      BLOQUANT si la ligne porte aussi un contexte d'engagement (€ ou TJM), sinon warn.
//   3. (v2) Date d'échéance formulée en engagement (livraison/échéance/au plus tard + date)
//      non sourcée → warn (jamais bloquant : faux positifs attendus).
//   4. Pourcentage ou grand nombre (≥ 4 chiffres) non sourcé hors table → warn.
//   5. Cohérence intra-document : même libellé porté à des valeurs divergentes → BLOQUANT
//      (v2 : unités €, k€, % ET j / j.h / jours-homme, via lib/claims-extract.mjs).
//   6. (TF-2358) Montant ou TJM d'une LIGNE DE TABLEAU (Markdown ou HTML) hors lignes de total
//      SANS source → BLOQUANT. Le tableau est sourcé par son en-tête, sa légende (ligne au-dessus,
//      <caption>) ou sa note (ligne sous le tableau) ; une ligne, par elle-même ou sa section.
//      Les lignes Total / Sous-total / Total général restent à oracle-calculs (re-somme).
//   7. (TF-2318) TEXTE DE DIAPOSITIVES : une source posée n'importe où dans la diapositive couvre
//      ses chiffres. Diapositive = ligne-repère (« Diapositive N », « Slide N », « <!-- Slide
//      number: N --> ») ou saut de page avec `--diapositives` (texte d'un PDF de deck).
//   8. (TF-2359) TEXTE À PLAT (.txt, .md) : une cellule courte qui porte un montant est couverte
//      par la cellule d'en-tête qui porte un marqueur de source au-dessus d'elle, dans le même bloc
//      de lignes courtes — le même tableau rend le même verdict extrait en lignes « | a | b | » ou
//      cellule par cellule.
//   9. (TF-2319) GRILLE DE PRIX (`--grille <grille.json>`) : chaque montant qui n'est ni un total
//      ni un calcul déclaré est rapproché de la grille (G1 montant absent de la grille, G2 unité
//      contraire à celle de la grille → BLOQUANT ; G3 unité de la grille non dite → warn).
// Motifs additionnels par profil :
// claims.motifs_bloquants / claims.motifs_warn (listes de regex ; invalides → ignorées,
// tracées en non_juge — jamais de crash). Inactif par profil → SKIP motivé.
// Usage : node oracle-claims.mjs <fichier.md|.html|.txt> [--profil <profil.json>]
//         [--diapositives] [--grille <grille.json>]
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { extractLabelled } from './lib/claims-extract.mjs';
import { extractTables } from './lib/tables.mjs';
import { parseNum, isTotalLabel, isGrandTotalLabel } from './lib/num.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ dernier: true });

const args = process.argv.slice(2);
const AVEC_VALEUR = ['--profil', '--grille'];
const file = args.find((a, i) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[i - 1]));
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
const gArg = args.includes('--grille') ? args[args.indexOf('--grille') + 1] : null;
const optDiapositives = args.includes('--diapositives');
const DOM = 'Traçabilité des affirmations chiffrées';
const NJ = [
  'véracité des valeurs sourcées (la source citée n\'est pas contre-vérifiée ici)',
  'affirmations non chiffrées (faits, noms, citations)',
  'lignes Total / Sous-total / Total général des tableaux → oracle-calculs (re-somme) ; les montants et TJM des AUTRES lignes de tableau sont jugés ici (TF-2358), sourcés par l\'en-tête, la légende, la note sous le tableau, la ligne ou la section',
  'pourcentages, grands nombres et charges en jours-homme des lignes de tableau : non jugés (seuls les montants et les TJM d\'un tableau le sont)',
  'texte à plat (TF-2359) : une cellule n\'est couverte que par une cellule d\'en-tête à marqueur de source posée AU-DESSUS d\'elle dans le même bloc de lignes courtes (60 caractères au plus, 40 lignes au plus, ni titre ni ligne longue entre les deux) ; un tableau à plat dont l\'en-tête est sous ses cellules, ou dont les cellules sont longues, se lit comme de la prose',
  'texte de diapositives (TF-2318) : reconnu aux seules lignes-repères (« Diapositive N », « Slide N », « <!-- Slide number: N --> ») et, avec --diapositives, aux sauts de page ; sans repère ni option, un texte de deck se lit comme un document (source cherchée sur la ligne et ses voisines)',
  'petits nombres en prose (< 4 chiffres, hors €, %, TJM, jours-homme)',
  'dates d\'échéance : avertissement seulement (jamais bloquant)'
];
const out = (verdict, findings, nj, code) => { process.stdout.write(contratJSON({ oracle: 'oracle-claims', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj })); process.exit(code); };
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
if (!['.md', '.html', '.htm', '.txt'].includes(path.extname(file).toLowerCase())) out('SKIP', [], ['extension non gérée'], 2);

let conf = { actif: true, marqueurs_source: ['source', 'sources?\\s*:', 'à vérifier', 'cf\\.', 'réf', '\\[\\^?\\d+\\]', 'calculé', 'https?://'], motifs_bloquants: [], motifs_warn: [] };
if (pArg) { try { conf = { ...conf, ...(JSON.parse(fs.readFileSync(pArg, 'utf8')).claims || {}) }; } catch {} }
if (conf.actif === false) out('SKIP', [], ['contrôle des claims désactivé par le profil'], 2);
const SRC = new RegExp('(' + conf.marqueurs_source.join('|') + ')', 'i');
const njExtra = [];
const compile = (list, label) => (list || []).map(p => { try { return new RegExp(p, 'gi'); } catch { njExtra.push(`motif ${label} invalide ignoré : ${p}`); return null; } }).filter(Boolean);
const PROFIL_BLOQ = compile(conf.motifs_bloquants, 'bloquant');
const PROFIL_WARN = compile(conf.motifs_warn, 'warn');

// TF-2319 (lot du produit marketing du 09/11/2026, seq 511) — LA RÈGLE « UN MONTANT VIENT DE LA GRILLE
// DE PRIX » N'ÉTAIT JOUÉE PAR AUCUN CONTRÔLE. La spécification d'un produit disait qu'un montant hors
// grille est refusé par cet oracle ; il acceptait tout montant suivi d'un renvoi, sans lire de grille, et
// un tarif dicté a été rapproché de la grille à la main le 30/09/2026. La grille est une DONNÉE, fournie
// par `--grille` (loi transverse n° 4) : `{ "format": "quality-oracles/grille-prix@1", "source": "…",
// "prix": [{ "libelle": "…", "montant": 3200, "unite": "€ HT / atelier" }] }`. L'unité se lit en deux
// parts : la taxe (HT, TTC) et la base (« / jour », « par participant »…). Sans `--grille`, G1 à G3 ne
// sont pas jouées, et le non_juge le dit.
const BASES = { j: 'jour', jour: 'jour', jours: 'jour', journee: 'jour', 'demi-journee': 'demi-journee', participant: 'participant', participants: 'participant', personne: 'personne', personnes: 'personne', pers: 'personne', atelier: 'atelier', ateliers: 'atelier', session: 'session', sessions: 'session', mois: 'mois', an: 'an', annee: 'an', heure: 'heure', h: 'heure', forfait: 'forfait', licence: 'licence', utilisateur: 'utilisateur' };
const plierUnite = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function lireUnite(s) {
  const t = plierUnite(s);
  const taxe = /\bht\b/.test(t) ? 'HT' : /\bttc\b/.test(t) ? 'TTC' : null;
  const b = t.match(/(?:\/|\bpar\b|\bl[ae]\b)\s*(demi-journee|[a-z]+)/) || (/\bforfait/.test(t) ? [null, 'forfait'] : null);
  return { taxe, base: b ? (BASES[b[1]] || null) : null };
}
let grille = null;
if (gArg) {
  let g = null;
  try { g = JSON.parse(fs.readFileSync(gArg, 'utf8')); } catch (e) { out('SKIP', [], ['--grille illisible (' + gArg + ') : ' + e.message + ' — sans la grille, aucun montant ne peut lui être rapproché'], 2); }
  const prix = (g && Array.isArray(g.prix) ? g.prix : []).filter(p => Number.isFinite(Number(p.montant)));
  if (!prix.length) out('SKIP', [], ['--grille sans aucun prix exploitable (' + path.basename(gArg) + ', champ `prix` : [{ libelle, montant, unite }])'], 2);
  grille = { source: g.source || path.basename(gArg), prix: prix.map(p => ({ libelle: p.libelle || '', montant: Number(p.montant), unite: p.unite || '', ...lireUnite(p.unite) })) };
}

// TF-0485, TF-0486 et TF-0487 (lot v2-architecture-cible, 22/08) — TROIS FAUX POSITIFS, UN SEUL
// MÉCANISME : l'oracle jugeait tout le fichier comme du texte écrit par le livrable. Or un
// livrable AUTOPORTANT embarque son code, sa charte et ses sources ; la surface d'analyse
// contenait donc des choses que personne n'a « affirmées ».
//   · TF-0485 — `s.replace(/[*][*]([^*]+)[*][*]/g, '<strong>$1</strong>')` : la référence arrière
//     `$1` lue comme « montant 1 $ sans source », FAIL bloquant, en pointant `(function () {`
//     trois lignes plus haut. Contournement subi côté produit : réécrire les quatre `$1/$2` en
//     fonctions de remplacement — c'est-à-dire dégrader le code pour plaire à l'oracle, et le
//     prochain auteur réécrira `$1` sans savoir pourquoi il ne faut pas.
//   · TF-0486 — `#334155` et `#374151` lus comme « nombre non sourcé ». Ce sont deux tokens de
//     couleur du bloc `:root`, c'est-à-dire exactement ce que la charte PRESCRIT d'écrire. Seules
//     les couleurs purement numériques étaient touchées (`#0F172A` passait) : un oracle dont le
//     verdict dépend des lettres présentes dans une couleur n'est pas lisible.
//   · TF-0487 — « pourcentage 100% non sourcé », onze occurrences, toutes dans les douze documents
//     Markdown CITÉS par le rapport. Ceux du texte propre ont pu être reformulés ; ceux des
//     citations sont INCORRIGIBLES sans falsifier la source.
//
// Le précédent existait déjà dans la forge et n'avait pas été suivi : la règle L1 de check_html
// fait `if parent.tag in ("script", "style"): continue`. Même règle ici, étendue au contenu CITÉ
// — `<pre>`, `<code>`, `<blockquote>`, et tout élément portant `data-cite`. Les lignes sont
// PRÉSERVÉES (on blanchit, on ne supprime pas) pour que les numéros de ligne restent justes.
//
// TF-2357 (lot du produit marketing du 09/11/2026, seq 215, 285, 302) — UNE PAGE AUTOPORTANTE NE
// RENDAIT RIEN EN DEUX MINUTES. Mesuré le 10/11/2026 sur une page de 272 671 octets (police woff2 et
// logo en base64, tête sur une ligne) : aucune sortie en 150 s. La cause n'était pas une expression
// rejouée sur les attributs : le blanchiment remplaçait chaque caractère de la police par une espace,
// soit une ligne de 208 213 caractères, et trois motifs y reculaient au CARRÉ de sa longueur (à 8 000
// caractères : MONEY 936 ms, JH 492 ms, LABELLED de lib/claims-extract.mjs 8 596 ms ; doubler la
// longueur quadruplait le temps). Trois gestes, chacun suffisant pour la page mesurée :
//   1. les DONNÉES EMBARQUÉES s'écartent avant toute analyse, comme script et style : `url(data:…)`,
//      un attribut dont la valeur commence par `data:`, une image Markdown `](data:…)`. Leur charge
//      utile disparaît, ses sauts de ligne restent ;
//   2. le blanchiment garde les sauts de ligne et réduit le reste de chaque ligne à UNE espace : les
//      numéros de ligne restent justes, et aucune suite d'espaces ne naît d'un bloc blanchi ;
//   3. MONEY et JH perdent leur `\s*` redondant (la classe qui précède absorbe déjà les blancs), et
//      lib/claims-extract.mjs réduit les blancs d'une ligne avant d'y chercher un libellé.
const NEUTRALISE = m => m.replace(/[^\n]+/g, ' ');
const SANS_CHARGE = m => m.replace(/[^\n]/g, '');
const ecarterDonneesEmbarquees = t => t
  .replace(/url\(\s*"data:[^"]*"\s*\)/gi, m => 'url()' + SANS_CHARGE(m))
  .replace(/url\(\s*'data:[^']*'\s*\)/gi, m => 'url()' + SANS_CHARGE(m))
  .replace(/url\(\s*data:[^)]*\)/gi, m => 'url()' + SANS_CHARGE(m))
  .replace(/(=\s*)"data:[^"]*"/gi, (m, eg) => eg + '""' + SANS_CHARGE(m))
  .replace(/(=\s*)'data:[^']*'/gi, (m, eg) => eg + "''" + SANS_CHARGE(m))
  .replace(/(=\s*)data:[^\s>]*/gi, (m, eg) => eg + SANS_CHARGE(m))
  .replace(/\]\(\s*data:[^)]*\)/gi, m => ']()' + SANS_CHARGE(m));
let text = ecarterDonneesEmbarquees(fs.readFileSync(file, 'utf8'));
text = text.replace(/```[\s\S]*?```/g, NEUTRALISE);                                    // bloc de code exclu
text = text.replace(/`[^`\n]+`/g, NEUTRALISE);                                         // code en ligne aussi
// TF-1902 : un titre HTML (h1-h6) se marque d'un repère de rang, SANS ajouter ni retirer de ligne
// (les numéros de ligne restent justes) ; le repère est retiré des lignes avant toute analyse.
const REPERE_TITRE = /\u0001H([1-6])\u0001/;
if (/\.html?$/.test(file)) text = text
  .replace(/<h([1-6])\b[^>]*>/gi, (m, n) => `\u0001H${n}\u0001 ` + m.replace(/[^\n]/g, ''))
  .replace(/<script\b[\s\S]*?<\/script>/gi, NEUTRALISE)                                // le JS inline n'affirme rien
  .replace(/<style\b[\s\S]*?<\/style>/gi, NEUTRALISE)                                  // la charte non plus
  .replace(/<pre\b[\s\S]*?<\/pre>/gi, NEUTRALISE)
  .replace(/<code\b[\s\S]*?<\/code>/gi, NEUTRALISE)
  .replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, NEUTRALISE)
  .replace(/<([a-z0-9]+)\b[^>]*\bdata-cite\b[^>]*>[\s\S]*?<\/\1>/gi, NEUTRALISE);       // source citée verbatim
// TF-2358 : les tableaux se lisent sur cette copie (code, charte et citations déjà blanchis), avant que
// la prose ne les blanchisse à son tour — un tableau n'est plus hors de portée, il est jugé à part.
const textePourTableaux = text;
if (/\.html?$/.test(file)) text = text
  .replace(/<table[\s\S]*?<\/table>/gi, NEUTRALISE)
  .replace(/<[^>]+>/g, ' ');
const lines = text.split('\n');
const base = path.basename(file);
const isTableLine = l => /^\s*\|/.test(l);

// TF-1902 (RP-18, lot Produit-79 20261018a) — UNE SOURCE POSÉE SOUS LE TITRE D'UNE SECTION COUVRE
// SA SECTION. Une étude sur les réseaux sociaux posait « Source : … » sous le titre de chaque
// section ; l'oracle ne voyait une source que dans la ligne du chiffre et ses deux voisines, si bien
// que l'auteur a recopié la source ligne par ligne — un texte alourdi de mentions répétées, sans
// qu'un lecteur en sache davantage.
//   · Le TITRE : `#`…`######` en Markdown, `<h1>`…`<h6>` en HTML (repère posé plus haut).
//   · La SOURCE : la première ligne non vide SOUS le titre COMMENCE par un libellé de source
//     (source(s), d'après, selon, réf., à vérifier) ou une adresse. Un « cf. » au milieu d'une
//     phrase, ou une source posée plus bas dans la section, ne couvre pas la section.
//   · La PORTÉE : jusqu'au prochain titre de même rang ou supérieur — les sous-sections d'une
//     section sourcée héritent de sa source, la source d'une sous-section ne remonte pas.
// Le titre ne porte aucun chiffre affirmé : seules les lignes de la section sont couvertes.
const rangTitre = lines.map(l => {
  const h = l.match(REPERE_TITRE);
  if (h) return Number(h[1]);
  const md = !/\.html?$/.test(file) && l.match(/^\s{0,3}(#{1,6})\s+\S/);
  return md ? md[1].length : 0;
});
lines.forEach((l, i) => { lines[i] = l.replace(/\u0001H[1-6]\u0001 ?/g, ''); });
const LIBELLE_SOURCE = /^[\s>*_\-–—•]*(sources?\b|d['’]après\b|selon\b|réf\b|à vérifier|https?:\/\/)/i;
const parSection = (() => {
  const couvert = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    const n = rangTitre[i];
    if (!n) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim() && !rangTitre[j]) j++;
    if (j >= lines.length || rangTitre[j] || !LIBELLE_SOURCE.test(lines[j])) continue;
    let fin = i + 1;
    while (fin < lines.length && !(rangTitre[fin] && rangTitre[fin] <= n)) fin++;
    for (let k = i + 1; k < fin; k++) couvert[k] = true;
  }
  return couvert;
})();

// TF-2318 (lot du produit marketing du 09/11/2026, seq 510) — DANS UN TEXTE DE DIAPOSITIVES, LA SOURCE
// SE CHERCHE DANS LA DIAPOSITIVE ENTIÈRE. Le texte extrait d'un deck suit l'ordre de création des
// formes, pas la mise en page : même diapositive à l'œil, PASS quand la note de source était créée juste
// après le titre, FAIL sur le montant du titre quand elle était créée en dernier (30/09/2026). Un
// générateur a dû forcer l'ordre de ses formes pour passer : le contrôle mesurait un corrélat (le
// voisinage dans le fichier), pas l'invariant (la source est sur la diapositive).
//   · une diapositive commence à une LIGNE-REPÈRE qui ne porte que cela (« --- Diapositive 3 --- »,
//     « ## Slide 3 », « <!-- Slide number: 3 --> », un titre court peut suivre un tiret) ; avec
//     `--diapositives`, un SAUT DE PAGE (\f, sortie de pdftotext d'un PDF de deck) en commence une aussi ;
//   · un texte .md ou .txt qui porte au moins une ligne-repère, ou jugé avec `--diapositives`, est un
//     texte de diapositives ; une page HTML ne l'est jamais ;
//   · une diapositive dont une ligne porte un marqueur de source couvre tous ses chiffres ; la source
//     d'une diapositive ne couvre pas la suivante.
const RX_DIAPO = /^\s*(?:<!--\s*)?(?:[-=#*[]{1,6}\s*)?(?:diapositive|slide)\s*(?:(?:n[°o]|number|numéro)\s*:?\s*)?\d{1,3}(?:\s*\/\s*\d{1,3})?\s*(?:[-=*\]]{1,6}|-->|[—–:-]\s*[^\n]{0,60})?\s*$/i;
const texteAPlat = !/\.html?$/.test(file);
const debutDiapo = lines.map(l => texteAPlat && (RX_DIAPO.test(l.replace(/\f/g, '')) || (optDiapositives && l.includes('\f'))));
const modeDiapositives = texteAPlat && (optDiapositives || debutDiapo.some(Boolean));
const diapoSourcee = (() => {
  const couvert = new Array(lines.length).fill(false);
  if (!modeDiapositives) return couvert;
  let debut = 0;
  const fermer = fin => { let s = false; for (let k = debut; k < fin; k++) if (SRC.test(lines[k])) { s = true; break; } if (s) for (let k = debut; k < fin; k++) couvert[k] = true; };
  for (let i = 1; i <= lines.length; i++) if (i === lines.length || debutDiapo[i]) { fermer(i); debut = i; }
  return couvert;
})();

// TF-2359 (lot du produit marketing du 09/11/2026, seq 438) — LE VERDICT DÉPENDAIT DE L'EXTRACTION, PAS
// DU LIVRABLE. Une grille de prix (en-tête « Montant HT [1] », renvoi [1] en pied) rendait PASS extraite
// en lignes « | a | b | » (lignes de tableau hors périmètre) et FAIL extraite à plat d'un PDF (5
// bloquants) : chaque cellule y est seule sur sa ligne, et la fenêtre de 3 lignes ne voit plus l'en-tête.
// En texte à plat, une ligne COURTE (60 caractères au plus) qui porte un montant est couverte par la
// cellule d'en-tête posée au-dessus d'elle dans le même bloc : une ligne courte SANS montant qui porte un
// marqueur de source, 40 lignes au plus plus haut, sans titre, sans ligne longue et sans début de
// diapositive entre les deux (les lignes vides et les autres cellules sont traversées).
const COURTE = 60;
let MONEY_1 = null;                                       // MONEY sans drapeau `g` (test() sans état)
const celluleSourcee = i => {
  if (!texteAPlat || lines[i].trim().length > COURTE) return false;
  MONEY_1 = MONEY_1 || new RegExp(MONEY.source);
  for (let k = i - 1; k >= 0 && k >= i - 40; k--) {
    if (debutDiapo[k + 1]) return false;                  // une diapositive commence entre l'en-tête et la cellule
    const l = lines[k].trim();
    if (!l) continue;
    if (l.length > COURTE || rangTitre[k] || isTableLine(lines[k])) return false;
    if (!MONEY_1.test(l) && SRC.test(l)) return true;
  }
  return false;
};

// paragraphe = la ligne + ses voisines non vides (le marqueur de source peut être adjacent)
const para = i => [lines[i - 1] || '', lines[i], lines[i + 1] || ''].join(' ');
const findings = [];
const MONEY = /(\d[\d\s\u00a0\u202f.,]*)(k?€|k?\$|K€)/g;                               // TF-2357 : sans `\s*` redondant
const PCT = /(\d[\d.,]*)\s*%/g;
// Le `#` entre dans la garde arrière (TF-0486) : `#334155` n'est pas un nombre affirmé, c'est une
// couleur. La garde vaut aussi hors HTML — un Markdown peut porter une couleur de charte.
const BIG = /(?<![\d.,€$%#])\b\d{1,3}(?:[\s\u00a0\u202f]\d{3})+(?:[.,]\d+)?\b|(?<!#)\b\d{4,}\b/g;
const TJM = /\bTJM\b[^\d\n]{0,12}\d[\d\s\u00a0\u202f.,]*/gi;                            // v2 — TJM chiffré
const JH = /\d[\d\s.,]*(?:j\.?h\.?|jours?[- ]hommes?|j\/h)\b/gi;                        // v2 — charge en jours-homme (TF-2357 : sans `\s*`)
const DATEVAL = /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b\d{1,2}(?:er)?\s+(?:janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)/i;
const ENGAGE = /livraison|échéance|echeance|deadline|au plus tard/i;                    // v2 — date d'engagement
let checked = 0;
const montantsVus = [];                                   // TF-2319 : chaque montant, avec ce qui l'entoure, pour la grille
lines.forEach((l, i) => {
  if (isTableLine(l) || !l.trim()) return;
  if (grille) for (const m of l.matchAll(MONEY)) montantsVus.push({ brut: m[0].trim(), ligne: i + 1, avant: l.slice(0, m.index), apres: l.slice(m.index + m[0].length, m.index + m[0].length + 40), derive: false });
  const ctx = para(i);
  const sourced = SRC.test(ctx) || parSection[i] || diapoSourcee[i] || celluleSourcee(i);   // TF-2318, TF-2359
  const moneySpans = [...l.matchAll(MONEY)].map(m => [m.index, m.index + m[0].length]);
  const inMoney = m => moneySpans.some(([a, b]) => m.index >= a - 1 && m.index < b);
  for (const m of moneySpans.keys()) checked++;
  for (const m of l.matchAll(TJM)) if (!/[€$]/.test(m[0])) checked++;                   // TJM contrôlé, sourcé ou non
  for (const m of l.matchAll(JH)) checked++;                                            // charge contrôlée, sourcée ou non
  if (!sourced) {
    for (const m of l.matchAll(MONEY)) findings.push({ sev: 'bloquant', msg: `montant « ${m[0].trim()} » sans source ni « à vérifier » (règle : toute donnée trace ou est marquée)`, where: base + ':' + (i + 1) });
    for (const m of l.matchAll(TJM)) { if (/[€$]/.test(m[0])) continue; findings.push({ sev: 'bloquant', msg: `TJM « ${m[0].trim()} » sans source ni « à vérifier »`, where: base + ':' + (i + 1) }); }
    for (const m of l.matchAll(JH)) {
      const engage = /[€$]/.test(l) || /\bTJM\b/i.test(l);                              // contexte d'engagement
      findings.push({ sev: engage ? 'bloquant' : 'warn', msg: `charge « ${m[0].trim()} » non sourcée${engage ? ' (contexte d\'engagement € / TJM)' : ''}`, where: base + ':' + (i + 1) });
    }
    if (ENGAGE.test(l) && DATEVAL.test(l)) { checked++; findings.push({ sev: 'warn', msg: `date d'engagement non sourcée : « ${l.trim().slice(0, 80)} »`, where: base + ':' + (i + 1) }); }
    for (const m of l.matchAll(PCT)) { checked++; findings.push({ sev: 'warn', msg: `pourcentage « ${m[0]} » non sourcé`, where: base + ':' + (i + 1) }); }
    for (const m of l.matchAll(BIG)) { if (inMoney(m) || /^\d{4}$/.test(m[0].trim())) continue; checked++; findings.push({ sev: 'warn', msg: `nombre « ${m[0].trim()} » non sourcé`, where: base + ':' + (i + 1) }); }
    for (const rx of PROFIL_BLOQ) for (const m of l.matchAll(rx)) { checked++; findings.push({ sev: 'bloquant', msg: `motif bloquant du profil : « ${m[0].trim().slice(0, 60)} » non sourcé`, where: base + ':' + (i + 1) }); }
    for (const rx of PROFIL_WARN) for (const m of l.matchAll(rx)) { checked++; findings.push({ sev: 'warn', msg: `motif du profil : « ${m[0].trim().slice(0, 60)} » non sourcé`, where: base + ':' + (i + 1) }); }
  }
});

// TF-2358 (lot du produit marketing du 09/11/2026, seq 342) — LES MONTANTS D'UN TABLEAU SANS TOTAL
// N'ÉTAIENT JUGÉS PAR PERSONNE. Cet oracle excluait les lignes de tableau « domaine d'oracle-calculs »,
// qui ne juge que les totaux : une grille de 5 prix sans total rendait PASS en HTML et 5 bloquants
// extraite d'un PDF (livret du 25/09/2026), et le non_juge publiait une exclusion plus étroite que celle
// qu'il appliquait (« totaux des tables → oracle-calculs »). Désormais chaque montant et chaque TJM d'une
// ligne de DONNÉES est jugé ici ; les lignes Total, Sous-total et Total général restent à oracle-calculs.
//   · le tableau est SOURCÉ par son en-tête (une cellule d'en-tête à marqueur : « Montant HT [1] »), sa
//     légende (<caption>, ou la ligne non vide juste au-dessus) ou sa note (la ligne non vide juste
//     au-dessous) ;
//   · une ligne de données l'est aussi par elle-même, par la source de sa section (TF-1902) ou de sa
//     diapositive (TF-2318), ou par sa cellule NON VIDE d'une COLONNE DE SOURCE — colonne dont l'en-tête
//     nomme une source, une adresse, un lien, une référence, une citation, un localisateur, une preuve,
//     un calcul, une formule ou « comment le rejouer ». MESURÉ le 10/11/2026 sur 700 documents du pilot :
//     sans cette colonne, la règle accusait 9 fichiers, dont des tableaux qui citent page, adresse et date
//     à chaque ligne (une adresse sans `https://` n'est pas un marqueur) ; le compte avec la colonne est
//     dit au non_juge et au registre.
const RX_COLONNE_SOURCE = /\b(sources?|adresses?|liens?|url|r[ée]f[ée]rences?|r[ée]f|citations?|localisateurs?|preuves?|origines?|provenances?|justificatifs?|calculs?|formules?|comment le rejouer)\b/i;
const celluleVide = c => !String(c || '').replace(/[-–—?*_`\s]/g, '') || /^(aucune?s?|n\/?a|néant)$/i.test(String(c).trim());
const voisine = (depart, pas) => {
  for (let k = depart, n = 0; k >= 0 && k < lines.length && n < 3; k += pas, n++) { const l = lines[k]; if (l.trim() && !isTableLine(l)) return l; }
  return '';
};
for (const t of extractTables(textePourTableaux, /\.html?$/.test(file) ? '.html' : '.md')) {
  const marques = t.rows.filter(r => r.entete);
  const tete = marques.length ? marques : [t.rows[0]];
  const legende = t.legende || voisine(t.debut - 2, -1);
  const note = voisine(t.fin, 1);
  const sourceeTable = tete.some(r => SRC.test(r.cells.join(' '))) || SRC.test(legende) || SRC.test(note);
  const colonnesSource = [];
  for (const h of tete) h.cells.forEach((c, ci) => { if (RX_COLONNE_SOURCE.test(c) && !colonnesSource.includes(ci)) colonnesSource.push(ci); });
  for (const r of t.rows) {
    if (tete.includes(r)) continue;
    const total = isTotalLabel(r.cells[0]) || isGrandTotalLabel(r.cells[0]);
    const texteRangee = r.cells.join(' | ');
    const sourcee = sourceeTable || SRC.test(texteRangee) || parSection[r.line - 1] || diapoSourcee[r.line - 1]
      || colonnesSource.some(ci => !celluleVide(r.cells[ci]));
    r.cells.forEach((c, ci) => {
      for (const m of c.matchAll(MONEY)) {
        const enTete = tete.map(h => h.cells[ci] || '').join(' ');
        if (grille) montantsVus.push({ brut: m[0].trim(), ligne: r.line, avant: (r.cells[0] || '') + ' ' + c.slice(0, m.index), apres: c.slice(m.index + m[0].length) + ' ' + enTete, derive: total });
        if (total) continue;                              // la re-somme est le domaine d'oracle-calculs
        checked++;
        if (!sourcee) findings.push({ sev: 'bloquant', msg: `montant « ${m[0].trim()} » d'une ligne de tableau sans source — ni l'en-tête, ni la légende, ni la note sous le tableau, ni la ligne, ni une colonne de source (adresse, citation, preuve, calcul…) n'en portent (TF-2358)`, where: base + ':' + r.line });
      }
      if (total) return;
      for (const m of c.matchAll(TJM)) {
        if (/[€$]/.test(m[0])) continue;
        checked++;
        if (!sourcee) findings.push({ sev: 'bloquant', msg: `TJM « ${m[0].trim()} » d'une ligne de tableau sans source ni « à vérifier » (TF-2358)`, where: base + ':' + r.line });
      }
    });
  }
}

// TF-2319 — G1 à G3 : chaque montant rapproché de la grille de prix fournie (montant ET unité).
// Un montant DÉRIVÉ n'est pas un prix : ligne de total d'un tableau, ou montant que sa ligne déclare
// calculé (total, sous-total, soit, calculé, remise, réduction, TVA, acompte, solde, ou posé après un
// « = »). Sa justesse arithmétique est le domaine d'oracle-calculs.
const DERIVE = /\b(total|totaux|sous-total|soit|calcul[ée]e?s?|recalcul[ée]e?s?|remise|r[ée]duction|tva|acompte|solde)\b|=/i;
if (grille) {
  for (const x of montantsVus) {
    if (x.derive || DERIVE.test(x.avant)) continue;
    const v = parseNum(x.brut);
    if (v == null) continue;
    checked++;
    const lu = lireUnite(x.apres);
    const memes = grille.prix.filter(p => Math.abs(p.montant - v) < 0.005);
    if (!memes.length) { findings.push({ sev: 'bloquant', regle: 'G1', msg: `G1 — montant « ${x.brut} » absent de la grille de prix (${grille.source}) : ce n'est ni un prix de la grille, ni un total, ni un calcul déclaré`, where: base + ':' + x.ligne }); continue; }
    const compatible = p => (!lu.taxe || !p.taxe || lu.taxe === p.taxe) && (!lu.base || !p.base || lu.base === p.base);
    const bon = memes.find(compatible);
    if (!bon) { findings.push({ sev: 'bloquant', regle: 'G2', msg: `G2 — montant « ${x.brut} » : la grille le donne en « ${memes.map(p => p.unite).join(' » ou « ')} », le livrable en ${[lu.taxe, lu.base].filter(Boolean).join(' par ') || 'une autre unité'}`, where: base + ':' + x.ligne }); continue; }
    const tus = [bon.taxe && !lu.taxe ? bon.taxe : null, bon.base && !lu.base ? 'par ' + bon.base : null].filter(Boolean);
    if (tus.length) findings.push({ sev: 'warn', regle: 'G3', msg: `G3 — montant « ${x.brut} » : la grille le donne en « ${bon.unite} », et le livrable ne dit pas ${tus.join(' ni ')}`, where: base + ':' + x.ligne });
  }
}
const njGrille = grille
  ? [`grille de prix lue : ${grille.source} (${grille.prix.length} prix) — un montant dérivé (ligne de total, « total », « soit », « calculé », « remise », « TVA », « acompte », « solde », ou après « = ») n'est pas rapproché de la grille ; l'unité se compare en taxe (HT, TTC) et en base (jour, participant, atelier…), une unité que ni la grille ni le livrable ne disent n'est pas jugée`]
  : ['G1-G3 non jouées : aucune grille de prix fournie (--grille <grille.json>) — un montant n\'est rapproché d\'aucun tarif'];

// cohérence intra-document : même libellé porté à des valeurs divergentes (lib partagée, unités €/%/j/jh)
const labelled = new Map();
for (const e of extractLabelled(lines, isTableLine)) {
  if (!labelled.has(e.key)) labelled.set(e.key, []);
  labelled.get(e.key).push(e);
}
for (const [key, occ] of labelled) {
  const vals = [...new Set(occ.map(o => o.v))];
  if (vals.length > 1) findings.push({ sev: 'bloquant', msg: `incohérence intra-document « ${occ[0].brut} » vs « ${occ[occ.length - 1].brut} » (${vals.join(' ≠ ')})`, where: base + ':' + occ.map(o => o.line).join(',') });
}

const NJALL = [...NJ, ...njGrille, ...njExtra];
const bloquants = findings.filter(f => f.sev === 'bloquant').length;
if (bloquants) out('FAIL', findings, NJALL, 1);
if (!checked && !labelled.size) out('SKIP', [], [...NJALL, 'aucune affirmation chiffrée hors table détectée'], 2);
out('PASS', [{ sev: 'info', msg: (checked + labelled.size) + ' affirmation(s) chiffrée(s) contrôlée(s) — toutes sourcées/cohérentes' + (findings.length ? ' (' + findings.length + ' avertissement(s))' : ''), where: base }, ...findings], NJALL, 0);
