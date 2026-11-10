#!/usr/bin/env node
// oracle-pdf — Domaine « Rendu PDF d'une page HTML » (TF-2351, 10/11/2026 ; squelette write-an-oracle).
//
// LE FAIT. Le 12/09/2026, le registre des oracles ne portait aucune ligne pour le PDF (grep -i pdf :
// 0 ligne). Un produit, qui rendait en PDF un dossier tiré d'une page HTML, a suivi la règle §4 et
// écrit son propre contrôle : six vérifications, P1 à P6. Six autres contrôles ad hoc ont suivi en
// dix-sept jours, chacun rejouant les mêmes premiers gestes. Cet oracle porte ces six contrôles au
// standard §3 ; il juge le PDF RENDU, l'artefact réel, et jamais la page source.
//
// Checklist canonique (versionnée ici) :
//   P1 OUVERTURE — le fichier s'ouvre (pypdf) et porte au moins une page ; `--pages N` exige N pages.
//   P2 FORMAT — chaque page a le format attendu (`--format A4` par défaut, ou `Letter`), à 2 points
//      près, en portrait ou en paysage.
//   P3 POLICES — chaque police EMPLOYÉE par le contenu (opérateur Tf de la page ou d'une forme) est
//      EMBARQUÉE (FontFile, FontFile2 ou FontFile3 ; une police Type3 l'est par nature) et en
//      SOUS-ENSEMBLE (nom préfixé de six capitales et d'un « + ») ; une police seulement déclarée dans
//      les ressources ne s'imprime pas et n'est pas jugée, ce que la sortie dit.
//   P4 LISIBILITÉ — le texte s'extrait, et chaque titre attendu (`--titres "A|B"`) s'y lit. Lecture par
//      TROIS lecteurs (pypdf, PyMuPDF, pdftotext) : un défaut n'est écrit que si TOUS les lecteurs
//      disponibles échouent (TF-2367, lib/texte-pdf.mjs) ; `--lecteurs a,b,c` exige ces lecteurs.
//   P5 NOMS — le texte extrait ne porte aucun nom interdit : il est jugé par la porte des noms
//      (oracle-nom-client-publie, l'outil qui fait foi, R3) sur un dépôt jetable ; `--referentiel=` et
//      `--produits=` lui sont transmis.
//   P6 TRACES DE RENDU — ni l'adresse de la page source (file://, localhost, chemin de disque, ou la
//      valeur de `--source`) ni, avec `--sans-courriel`, une adresse électronique ne s'impriment : un
//      en-tête ou un pied de navigateur oublié imprime l'adresse et la date du rendu.
//
// Usage : node oracle-pdf.mjs <rendu.pdf> [--format A4|Letter] [--pages N] [--titres "A|B"]
//         [--lecteurs pypdf,pymupdf,pdftotext] [--referentiel=<noms.json>] [--produits=<produits.json>]
//         [--source <chemin ou adresse de la page>] [--sans-courriel]
// Contrat JSON commun · exit 0 PASS / 1 FAIL / 2 SKIP.
import fs from 'node:fs';
import path from 'node:path';
import { lirePdf, lisibilite, LECTEURS } from './lib/texte-pdf.mjs';
import { jugerNoms } from './lib/noms-texte.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` ; ici, son domicile est le premier non_juge.
const contratJSON = ecrivainDeContrat({ premier: true });

const args = process.argv.slice(2);
const AVEC_VALEUR = ['--format', '--pages', '--titres', '--lecteurs', '--source'];
const file = args.find((a, i) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[i - 1]));
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const optEgal = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
const DOM = "Rendu PDF d'une page HTML";
const NJ = [
  'la FIDÉLITÉ du rendu à la page source (mise en page, couleurs, images) : le PDF est jugé seul → render_page.py et oracle-visual-diff pour la page',
  'le contenu des polices (contours, boîte englobante) → oracle-polices-embarquees',
  'les champs de formulaire et les signatures → oracle-formulaire-pdf (digit-ai-pdf)',
  'P4 : la lisibilité est le texte extrait et les titres attendus ; l\'ordre de lecture n\'est pas jugé (pdftotext rend l\'ordre visuel, pypdf et PyMuPDF l\'ordre de création)',
  'P6 : une adresse électronique n\'est cherchée qu\'avec --sans-courriel ; une adresse de page publique (https://…) n\'est pas une trace de rendu, sauf désignée par --source',
];
const findings = [];
const nonJuge = [...NJ];
const out = (verdict, code) => { process.stdout.write(contratJSON({ oracle: 'oracle-pdf', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nonJuge })); process.exit(code); };
const skip = motif => { nonJuge.unshift(motif); out('SKIP', 2); };

if (!file || !fs.existsSync(file)) skip('fichier absent : ' + (file || '(aucun argument)'));
if (path.extname(file).toLowerCase() !== '.pdf') skip('extension non gérée : ' + path.extname(file) + ' (attendu .pdf)');
const base = path.basename(file);
const exiges = (opt('lecteurs') || '').split(',').map(s => s.trim()).filter(Boolean);
const inconnus = exiges.filter(n => !LECTEURS.includes(n));
if (inconnus.length) skip(`--lecteurs : lecteur(s) inconnu(s) ${inconnus.join(', ')} (connus : ${LECTEURS.join(', ')})`);

const s = lirePdf(file);
const absentsExiges = exiges.filter(n => !(s.lecteurs[n] && s.lecteurs[n].ok));
if (absentsExiges.length) skip(`lecteur(s) exigé(s) indisponible(s) : ${absentsExiges.map(n => `${n} (${(s.lecteurs[n] || {}).erreur || 'absent'})`).join(', ')}`);
if (!s.lecteurs.pypdf || (!s.lecteurs.pypdf.ok && /absent|indisponible/.test(s.lecteurs.pypdf.erreur || ''))) skip('pypdf indisponible : la structure du PDF (P1 à P3) ne peut pas être lue — ' + (s.erreur || ''));
for (const n of LECTEURS) if (!(s.lecteurs[n] && s.lecteurs[n].ok)) nonJuge.push(`lecteur ${n} indisponible : ${(s.lecteurs[n] || {}).erreur || 'absent'}`);

// P1 — ouverture et pages
if (!s.ok) { findings.push({ sev: 'bloquant', regle: 'P1', msg: `P1 — le PDF ne s'ouvre pas : ${s.erreur}`, where: base }); out('FAIL', 1); }
if (!s.pages.length) findings.push({ sev: 'bloquant', regle: 'P1', msg: 'P1 — le PDF ne porte aucune page', where: base });
const nAttendu = opt('pages');
if (nAttendu && Number(nAttendu) !== s.pages.length) findings.push({ sev: 'bloquant', regle: 'P1', msg: `P1 — ${s.pages.length} page(s), ${nAttendu} attendue(s) (--pages)`, where: base });

// P2 — format de page
const FORMATS = { A4: [595.28, 841.89], LETTER: [612, 792] };
const nomFormat = (opt('format') || 'A4').toUpperCase();
const dims = FORMATS[nomFormat];
if (!dims) skip(`--format ${opt('format')} inconnu (A4 ou Letter)`);
s.pages.forEach((p, i) => {
  const ok = [[p.largeur, p.hauteur], [p.hauteur, p.largeur]].some(([w, h]) => Math.abs(w - dims[0]) <= 2 && Math.abs(h - dims[1]) <= 2);
  if (!ok) findings.push({ sev: 'bloquant', regle: 'P2', msg: `P2 — page ${i + 1} de ${p.largeur} × ${p.hauteur} points, format ${nomFormat} attendu (${dims[0]} × ${dims[1]})`, where: `${base}:page ${i + 1}` });
});

// P3 — polices embarquées en sous-ensembles
for (const f of s.polices) {
  const ou = `${base}:page ${f.pages.join(',')}`;
  if (!f.embarquee) findings.push({ sev: 'bloquant', regle: 'P3', msg: `P3 — police « ${f.nom} » (${f.type}) NON embarquée : le rendu dépend des polices du poste qui l'ouvre`, where: ou });
  else if (f.type !== 'Type3' && !f.sous_ensemble) findings.push({ sev: 'bloquant', regle: 'P3', msg: `P3 — police « ${f.nom} » embarquée en ENTIER, pas en sous-ensemble`, where: ou });
}
// Une police DÉCLARÉE dans les ressources sans être employée par le contenu (opérateur Tf) ne s'imprime pas :
// elle n'est pas jugée, et cela se dit (un générateur pose souvent une police par défaut qu'il n'emploie jamais).
if ((s.polices_declarees_non_employees || []).length) findings.push({ sev: 'info', regle: 'P3', msg: `P3 — police(s) déclarée(s) mais jamais employée(s) par le contenu, non jugée(s) : ${s.polices_declarees_non_employees.join(', ')}`, where: base });

// P4 — lisibilité, par plusieurs lecteurs (TF-2367)
const titres = (opt('titres') || '').split('|').map(t => t.trim()).filter(Boolean);
// `--lecteurs` désigne les lecteurs EMPLOYÉS (et exigés) : une fixture épingle ainsi ses lecteurs, et son verdict
// ne dépend pas de ce que le poste porte en plus (§3.6). Sans l'option, tous les lecteurs disponibles sont employés.
const employes = exiges.length ? exiges : LECTEURS;
const lecteursEmployes = Object.fromEntries(employes.map(n => [n, s.lecteurs[n]]));
const lis = lisibilite(lecteursEmployes, titres, { base, regle: 'P4' });
findings.push(...lis.constats);
if (!titres.length) nonJuge.push('P4 : aucun titre attendu fourni (--titres "A|B") — seul le texte extractible est jugé');
const texteTous = employes.filter(n => s.lecteurs[n] && s.lecteurs[n].ok).map(n => (s.lecteurs[n].pages || []).join('\n')).join('\n');

// P5 — noms interdits : la porte des noms, sur un dépôt jetable qui porte le texte extrait
{
  const n = jugerNoms(texteTous, { referentiel: optEgal('referentiel'), produits: optEgal('produits') });
  if (!n.juge) nonJuge.push('P5 non jugé : ' + n.motif);
  // Les noms trouvés ne se recopient pas : un journal d'oracle vit à côté du livrable (la porte les nomme si on la joue).
  if (n.constats.length) findings.push({ sev: 'bloquant', regle: 'P5', msg: `P5 — ${n.constats.length} nom(s) interdit(s) de la table des noms dans le texte du PDF (la porte des noms les nomme ; ils ne sont pas recopiés ici)`, where: base });
}

// P6 — traces de rendu : adresse de la page source, adresse électronique
const TRACES = [
  [/file:\/\/\/?[^\s"'<>]+/i, 'adresse de fichier (file://)'],
  [/\b(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s]*)?/i, 'adresse de serveur local'],
  [/\b[A-Za-z]:\\(?:[^\\\s]+\\)+[^\\\s]*/, 'chemin de disque'],
  [/(?:^|\s)\/(?:Users|home)\/[^\s]+/, 'chemin de disque'],
];
const source = opt('source');
for (const [rx, nom] of TRACES) { const m = texteTous.match(rx); if (m) findings.push({ sev: 'bloquant', regle: 'P6', msg: `P6 — ${nom} imprimé(e) dans le PDF (« ${m[0].trim().slice(0, 80)} ») : un en-tête ou un pied de navigateur est resté au rendu`, where: base }); }
if (source && texteTous.includes(source)) findings.push({ sev: 'bloquant', regle: 'P6', msg: `P6 — l'adresse de la page source (--source) est imprimée dans le PDF`, where: base });
if (args.includes('--sans-courriel')) {
  const m = texteTous.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (m) findings.push({ sev: 'bloquant', regle: 'P6', msg: `P6 — adresse électronique imprimée dans le PDF (« ${m[0]} »), interdite par --sans-courriel`, where: base });
}

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
findings.push({ sev: 'info', msg: `${s.pages.length} page(s) ${nomFormat}, ${s.polices.length} police(s) embarquée(s) en sous-ensemble, texte lu par ${lis.disponibles.join(', ')}${titres.length ? `, ${titres.length} titre(s) attendu(s) lu(s)` : ''} — P1 à P6 conformes`, where: base });
out('PASS', 0);
