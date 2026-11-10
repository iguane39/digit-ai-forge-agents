#!/usr/bin/env node
// oracle-anonymisation-dossier — Domaine « Anonymisation d'un dossier d'intervenant » (TF-2361, 10/11/2026 ;
// squelette write-an-oracle).
//
// LE FAIT. La liste fermée d'anonymisation d'un document d'intervenant (gabarit cv-anonyme, § Anonymisation)
// n'avait pas d'oracle au registre. Un produit en a écrit un par dossier : sept contrôles ad hoc du 12 au
// 28/09/2026, chacun avec ses rapports vert et rouges, et deux cribles de session y ont trouvé un nom
// d'employeur que la table des noms interdits ne connaissait pas. Cet oracle porte au standard §3 le cœur
// commun de ces contrôles (N3 à N7 de celui du 24/09) : il TIRE les termes identifiants de la version
// nominative et du profil source, à l'exécution, et ne les RECOPIE jamais — ni dans son code, ni dans sa
// sortie, qui désigne une ligne par son numéro et un terme par son compte.
//
// Checklist canonique (versionnée ici) :
//   A1 IDENTITÉ — les mots que l'anonymisation a retirés du titre de premier niveau de la version nominative,
//      et les mots à capitale du nom de fichier du profil source, n'apparaissent pas au dossier anonymisé.
//   A2 EMPLOYEURS ET LIEUX — les mots à capitale que l'anonymisation a retirés d'une ligne, et ceux des
//      lignes nominatives que `--lieux <motif>` déclare identifiantes (hors premier mot et `--generiques`),
//      n'apparaissent nulle part au dossier anonymisé (à la casse de leur graphie, ou en capitales).
//   A3 COORDONNÉES — aucune adresse électronique, adresse LinkedIn ni numéro de téléphone du profil source
//      ou de la version nominative n'apparaît au dossier anonymisé.
//   A4 PÉRIMÈTRE DU DIFF — même nombre de lignes, et chaque ligne modifiée retire au moins un terme
//      identifiant (mot à capitale, adresse, numéro) et ne retire aucun nombre : une anonymisation remplace
//      des noms, elle ne réécrit ni une phrase ni une durée. `--perimetre <motif>` élargit le périmètre aux
//      lignes qui le portent.
//   A5 NOMS INTERDITS — le texte anonymisé passe la porte des noms (oracle-nom-client-publie, R3).
//
// Usage : node oracle-anonymisation-dossier.mjs <anonyme.md|.html|.txt> --nominatif <nominatif>
//         [--profil-source <profil.txt|.md|.html|.pdf>] [--lieux <motif de ligne>] [--generiques "A,B"]
//         [--perimetre <motif de ligne>] [--referentiel=<noms.json>] [--produits=<produits.json>]
// Contrat JSON commun · exit 0 PASS / 1 FAIL / 2 SKIP.
import fs from 'node:fs';
import path from 'node:path';
import { LETTRES } from './lib/effectifs.mjs';
import { lirePdf } from './lib/texte-pdf.mjs';
import { jugerNoms } from './lib/noms-texte.mjs';
import { decoderEntites } from './lib/entites.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe ; ici, son domicile est le premier non_juge.
const contratJSON = ecrivainDeContrat({ premier: true });

const args = process.argv.slice(2);
const AVEC_VALEUR = ['--nominatif', '--profil-source', '--lieux', '--generiques', '--perimetre'];
const file = args.find((a, i) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[i - 1]));
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const optEgal = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
const DOM = "Anonymisation d'un dossier d'intervenant";
const nonJuge = [
  'un terme identifiant que ni la version nominative ni le profil source ne portent (un nom cité ailleurs, oralement) : la porte des noms (A5) le voit seulement s\'il est à sa table',
  'A2 : un employeur écrit en minuscules, ou dont la graphie change (sigle, abréviation), n\'est pas reconnu ; un mot générique déclaré par --generiques n\'est pas cherché',
  'le rendu (PDF, image) du dossier anonymisé : seul son texte source est jugé → oracle-pdf pour le PDF rendu',
  'la qualité de la périphrase qui remplace un nom (« un groupe de distribution ») : son exactitude est l\'affaire du relecteur',
];
const findings = [];
const out = (verdict, code) => { process.stdout.write(contratJSON({ oracle: 'oracle-anonymisation-dossier', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nonJuge })); process.exit(code); };
const skip = motif => { nonJuge.unshift(motif); out('SKIP', 2); };
const EXT = ['.md', '.txt', '.html', '.htm'];
if (!file || !fs.existsSync(file)) skip('fichier absent : ' + (file || '(aucun argument)'));
if (!EXT.includes(path.extname(file).toLowerCase())) skip('extension non gérée : ' + path.extname(file) + ' (attendu .md, .txt ou .html)');
const nominatifF = opt('nominatif');
if (!nominatifF || !fs.existsSync(nominatifF)) skip('--nominatif absente ou introuvable : sans la version nominative, aucun terme identifiant ne se tire');
const profilF = opt('profil-source');
if (profilF && !fs.existsSync(profilF)) skip('--profil-source introuvable : ' + profilF);

const brut = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const estHtml = f => /\.html?$/i.test(f);
// Le texte lisible d'une page : texte visible et attributs lus par un humain ou une machine (title, alt,
// aria-label, content) ; ni script, ni style, ni données data: (un nom se cache aussi dans un alt). Chaque
// balise est REMPLACÉE par les valeurs de ces attributs, posées hors d'elle, et garde ses sauts de ligne :
// laissées dans la balise, elles disparaissaient avec elle (essai du 10/11/2026 : un nom laissé dans le alt
// d'un portrait passait en PASS).
// Les entités se décodent ensuite (lib/entites.mjs) : « nom&#64;exemple.test » est une adresse électronique.
const lisible = (t, html) => !html ? t : decoderEntites(t
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, m => m.replace(/[^\n]/g, ''))
  .replace(/<[^>]+>/g, tag => ' ' + [...tag.matchAll(/\s(?:title|alt|aria-label|content)\s*=\s*"([^"]*)"/gi)]
    .map(m => m[1]).filter(v => !/^data:/i.test(v)).join(' ') + ' ' + tag.replace(/[^\n]/g, '')));
const anonymeBrut = brut(file), nominatifBrut = brut(nominatifF);
const anonyme = lisible(anonymeBrut, estHtml(file)), nominatif = lisible(nominatifBrut, estHtml(nominatifF));
let profil = '';
if (profilF) {
  if (/\.pdf$/i.test(profilF)) { const s = lirePdf(profilF); profil = ['pypdf', 'pdftotext', 'pymupdf'].map(n => s.lecteurs[n] && s.lecteurs[n].ok ? s.lecteurs[n].pages.join('\n') : '').join('\n'); }
  else profil = lisible(brut(profilF), estHtml(profilF));
} else nonJuge.push('A1 et A3 sans profil source (--profil-source) : seuls les termes de la version nominative sont tirés');

const base = path.basename(file);
const RX_MOT_CAP = /(?<![\p{L}\d])\p{Lu}[\p{L}'’-]{2,}(?![\p{L}])/gu;
const RX_COURRIEL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const RX_LINKEDIN = /linkedin\.com\/[^\s"'<>)]+/gi;
const RX_TEL = /(?:\+33\s?|0)[1-9](?:[\s.]?\d{2}){4}/g;
const RX_NOMBRE = /\d+/;
const nombresLettres = new RegExp(`(?<![\\p{L}])(?:${Object.keys(LETTRES).join('|')})(?![\\p{L}])`, 'iu');
const generiques = new Set((opt('generiques') || '').split(',').map(s => s.trim()).filter(Boolean));
const mots = l => new Set(l.split(/[\s,;:.()«»"—–\/]+/).filter(Boolean));
const capitales = l => [...l.matchAll(RX_MOT_CAP)].map(m => m[0].replace(/['’]$/, '')).filter(m => !generiques.has(m));
const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const occurrences = (terme, texte) => {
  const rx = new RegExp(`(?<![\\p{L}\\d])(?:${echapper(terme)}|${echapper(terme.toUpperCase())})(?![\\p{L}\\d])`, 'gu');
  const lignes = []; texte.split('\n').forEach((l, i) => { rx.lastIndex = 0; if (rx.test(l)) lignes.push(i + 1); });
  return lignes;
};

// Les lignes des deux versions, comparées rang par rang (texte lisible ; pour une page HTML, le source ligne à
// ligne, données base64 réduites, comme le contrôle du produit).
const lignesDe = (t, html) => (html ? t.replace(/base64,[A-Za-z0-9+/=]{200,}/g, 'base64,<B64>') : t).split('\n');
const la = lignesDe(estHtml(file) ? anonymeBrut : anonyme, estHtml(file)), ln = lignesDe(estHtml(nominatifF) ? nominatifBrut : nominatif, estHtml(nominatifF));
const retires = [];                                       // termes identifiants retirés par l'anonymisation
const changees = [];
for (let i = 0; i < Math.min(la.length, ln.length); i++) {
  if (la[i] === ln[i]) continue;
  const mA = mots(lisible(la[i], estHtml(file))), mN = mots(lisible(ln[i], estHtml(nominatifF)));
  const partis = [...mN].filter(w => !mA.has(w));
  changees.push({ ligne: i + 1, partis, nominative: lisible(ln[i], estHtml(nominatifF)), anonymisee: lisible(la[i], estHtml(file)) });
}

// A1 — identité
const titreN = (nominatif.match(/^\s*#\s+(.+)$/m) || nominatifBrut.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '';
const titreA = (anonyme.match(/^\s*#\s+(.+)$/m) || anonymeBrut.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '';
const motsTitreA = mots(titreA.replace(/<[^>]+>/g, ' '));
const identite = new Set([...capitales(titreN.replace(/<[^>]+>/g, ' ')).filter(w => !motsTitreA.has(w)),
  ...(profilF ? capitales(path.basename(profilF, path.extname(profilF)).replace(/[_.-]+/g, ' ')) : [])]
  .filter(w => !(w.length === 3 && w === w.toUpperCase())));          // un trigramme en capitales est le remplaçant
const fuitesA1 = [...identite].map(t => occurrences(t, anonyme)).filter(l => l.length);
if (!identite.size) nonJuge.push('A1 : aucun terme d\'identité tiré (titre de premier niveau inchangé, profil sans nom en capitales) — identité non jugée');
else if (fuitesA1.length) findings.push({ sev: 'bloquant', regle: 'A1', msg: `A1 — ${fuitesA1.length} terme(s) d'identité tiré(s) de la version nominative ou du profil source sur ${identite.size} apparaissent au dossier anonymisé`, where: `${base}:ligne(s) ${[...new Set(fuitesA1.flat())].join(', ')}` });

// A2 — employeurs et lieux
const termesA2 = new Set();
for (const c of changees) for (const w of capitales(c.partis.join(' '))) if (!identite.has(w)) termesA2.add(w);
const lieux = opt('lieux');
if (lieux) {
  let rx = null; try { rx = new RegExp(lieux); } catch { skip('--lieux : motif invalide'); }
  // Le motif se cherche dans la ligne SOURCE (en HTML, `class="lieu"` n'existe plus dans le texte lisible) ;
  // les termes se lisent dans la ligne lisible de même rang (lisible() garde les sauts de ligne).
  const sources = nominatifBrut.split('\n'), lisibles = nominatif.split('\n');
  for (const [i, s] of sources.entries()) {
    if (!rx.test(s)) continue;
    const l = lisibles[i] || '';
    // Le premier mot d'une ligne porte sa capitale de PHRASE quand un mot en minuscules le suit (« Responsable des
    // études ») : il n'est pas un terme. Suivi d'un mot à capitale (« Valdorne Distribution • … »), c'est un nom.
    const mots1 = l.trim().split(/\s+/).filter(w => /\p{L}/u.test(w));
    const phrase = mots1.length > 1 && /^\p{Ll}/u.test(mots1[1]);
    capitales(l).filter((w, k) => !(k === 0 && phrase && (mots1[0] || '').startsWith(w)) && w.length >= 4 && !identite.has(w)).forEach(w => termesA2.add(w));
  }
}
const fuitesA2 = [...termesA2].map(t => occurrences(t, anonyme)).filter(l => l.length);
if (fuitesA2.length) findings.push({ sev: 'bloquant', regle: 'A2', msg: `A2 — ${fuitesA2.length} terme(s) d'employeur ou de lieu tiré(s) de la version nominative sur ${termesA2.size} apparaissent au dossier anonymisé`, where: `${base}:ligne(s) ${[...new Set(fuitesA2.flat())].join(', ')}` });

// A3 — coordonnées
const coordonnees = new Set([...profil.matchAll(RX_COURRIEL), ...profil.matchAll(RX_LINKEDIN), ...profil.matchAll(RX_TEL),
  ...nominatif.matchAll(RX_COURRIEL), ...nominatif.matchAll(RX_LINKEDIN), ...nominatif.matchAll(RX_TEL)].map(m => m[0].replace(/[\s.]/g, '').toLowerCase()));
const anonymeCompact = anonyme.toLowerCase().replace(/[\s.]/g, '');
const fuitesA3 = [...coordonnees].filter(c => anonymeCompact.includes(c));
if (fuitesA3.length) findings.push({ sev: 'bloquant', regle: 'A3', msg: `A3 — ${fuitesA3.length} coordonnée(s) du profil source ou de la version nominative (adresse électronique, LinkedIn, téléphone) sur ${coordonnees.size} apparaissent au dossier anonymisé`, where: base });

// A4 — périmètre du diff
let rxPerimetre = null;
if (opt('perimetre')) { try { rxPerimetre = new RegExp(opt('perimetre')); } catch { skip('--perimetre : motif invalide'); } }
if (la.length !== ln.length) findings.push({ sev: 'bloquant', regle: 'A4', msg: `A4 — ${la.length} ligne(s) au dossier anonymisé contre ${ln.length} à la version nominative : une anonymisation remplace des termes, elle n'ajoute ni ne retire de ligne`, where: base });
for (const c of changees) {
  if (rxPerimetre && rxPerimetre.test(c.nominative)) continue;
  // Copies SANS drapeau `g` : test() sur un motif global garde son lastIndex d'un appel à l'autre.
  const cap1 = new RegExp(RX_MOT_CAP.source, 'u'), tel1 = new RegExp(RX_TEL.source);
  const identifiant = c.partis.some(w => cap1.test(w) || /@|linkedin\.com/i.test(w)) || tel1.test(c.partis.join(' '));
  // Les chiffres d'un téléphone RETIRÉ sont un terme identifiant, pas un nombre du texte.
  const chiffresTel = new Set([...c.nominative.matchAll(RX_TEL)].filter(m => !c.anonymisee.includes(m[0])).flatMap(m => m[0].split(/[\s.]+/)));
  const nombre = c.partis.some(w => (RX_NOMBRE.test(w) && !chiffresTel.has(w)) || nombresLettres.test(w));
  if (!identifiant || nombre) findings.push({ sev: 'bloquant', regle: 'A4', msg: `A4 — ligne modifiée hors du périmètre d'anonymisation : ${!identifiant ? 'aucun terme identifiant retiré' : ''}${!identifiant && nombre ? ', et ' : ''}${nombre ? 'un nombre retiré' : ''} — une anonymisation ne réécrit ni une phrase ni une durée`, where: `${base}:ligne ${c.ligne}` });
}

// A5 — noms interdits (la porte des noms)
const n = jugerNoms(anonyme, { referentiel: optEgal('referentiel'), produits: optEgal('produits') });
if (!n.juge) nonJuge.push('A5 non jugé : ' + n.motif);
if (n.constats.length) findings.push({ sev: 'bloquant', regle: 'A5', msg: `A5 — ${n.constats.length} nom(s) interdit(s) de la table des noms au dossier anonymisé (la porte des noms les nomme ; ils ne sont pas recopiés ici)`, where: base });

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
findings.push({ sev: 'info', msg: `anonymisation conforme : ${identite.size} terme(s) d'identité et ${termesA2.size} d'employeur ou de lieu tirés sans être recopiés, ${coordonnees.size} coordonnée(s), ${changees.length} ligne(s) modifiée(s) toutes dans le périmètre`, where: base });
out('PASS', 0);
