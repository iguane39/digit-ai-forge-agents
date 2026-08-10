#!/usr/bin/env node
// oracle-post-linkedin — Domaine « Post LinkedIn (contraintes de publication) ».
// Vérifie un post (.txt) contre les règles du skill producteur linkedin-post-generator
// (SKILL.md : « aucun lien dans le corps du post — le mettre en premier commentaire » ;
// « 3-5 hashtags maximum, en fin de post » ; checklist : « longueur 1300-1500 caractères ») :
//   L1 longueur totale ≤ 3000 caractères (limite de publication) ; hors zone 1300-1500 = warn ;
//   L2 hook : première ligne non vide contenue dans la fenêtre avant troncature
//      (--fenetre <n>, défaut 210 caractères — convention plateforme, paramétrable) ;
//   L3 zéro URL dans le corps (règle « liens en commentaire » du skill) ;
//   L4 aller-retour Unicode Mathematical Bold sans caractère perdu (plages U+1D400-1D467,
//      U+1D7CE-1D7D7 — mapping standard Unicode) ;
//   L5 nombre de hashtags dans la fourchette du skill (3-5), en fin de post.
// non_juge : le script du skill (linkedin_unicode_formatting.py) n'est pas rejoué tel quel
// (interface non contractuelle) — contrôle par mapping Unicode standard, déclaré.
// Provenance : linkedin-post-generator (usage récurrent) et digit-ai-prospection étapes 6-7 —
// inventaire P2 §3 O9. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = n => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const DOM = 'Post LinkedIn (contraintes de publication)';
const findings = [];
const non_juge = [
  'qualité éditoriale du hook et du corps (jugement → oracle-judge / relecture)',
  'script linkedin_unicode_formatting.py non rejoué tel quel (interface non contractuelle) — mapping Unicode standard appliqué à la place, même plage de caractères',
  'le lien en premier commentaire (hors du fichier post) n est pas vérifiable ici'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-post-linkedin', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (path.extname(file).toLowerCase() !== '.txt') skip('extension non gérée');
const txt = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
const base = path.basename(file);
const FENETRE = parseInt(opt('fenetre') || '210', 10);
// L1
const len = [...txt].length;
if (len > 3000) findings.push({ sev: 'bloquant', msg: `L1 — ${len} caractères > limite de publication 3000`, where: base + ':1' });
else if (len < 1300 || len > 1500) findings.push({ sev: 'warn', msg: `L1 — ${len} caractères hors zone optimale 1300-1500 (checklist du skill)`, where: base + ':1' });
// L2
const firstLine = txt.split('\n').find(l => l.trim());
if (!firstLine) findings.push({ sev: 'bloquant', msg: 'L2 — post vide', where: base + ':1' });
else if ([...firstLine].length > FENETRE) findings.push({ sev: 'bloquant', msg: `L2 — hook de ${[...firstLine].length} caractères > fenêtre avant troncature (${FENETRE})`, where: base + ':1' });
// L3
const lignes = txt.split('\n');
lignes.forEach((l, i) => {
  if (/(https?:\/\/|www\.)\S+/i.test(l)) findings.push({ sev: 'bloquant', msg: 'L3 — URL dans le corps du post (règle du skill : lien en premier commentaire)', where: base + ':' + (i + 1) });
});
// L4 — aller-retour Mathematical Bold
const boldToAscii = (cp) => {
  if (cp >= 0x1D400 && cp <= 0x1D419) return String.fromCharCode(65 + cp - 0x1D400);        // A-Z bold
  if (cp >= 0x1D41A && cp <= 0x1D433) return String.fromCharCode(97 + cp - 0x1D41A);        // a-z bold
  if (cp >= 0x1D5D4 && cp <= 0x1D5ED) return String.fromCharCode(65 + cp - 0x1D5D4);        // A-Z sans-serif bold
  if (cp >= 0x1D5EE && cp <= 0x1D607) return String.fromCharCode(97 + cp - 0x1D5EE);        // a-z sans-serif bold
  if (cp >= 0x1D7CE && cp <= 0x1D7D7) return String.fromCharCode(48 + cp - 0x1D7CE);        // 0-9 bold
  if (cp >= 0x1D7EC && cp <= 0x1D7F5) return String.fromCharCode(48 + cp - 0x1D7EC);        // 0-9 sans-serif bold
  return null;
};
let boldCount = 0;
for (const ch of txt) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x1D400 && cp <= 0x1D7FF) {
    boldCount++;
    if (boldToAscii(cp) === null) findings.push({ sev: 'bloquant', msg: `L4 — caractère Unicode math hors plages réversibles connues : U+${cp.toString(16).toUpperCase()} (risque de perte au copier-coller)`, where: base });
  }
  if (cp === 0xFFFD) findings.push({ sev: 'bloquant', msg: 'L4 — caractère de remplacement U+FFFD présent (perte déjà survenue)', where: base });
}
// L5
const tags = txt.match(/(^|\s)#[\p{L}\p{N}_-]+/gu) || [];
if (tags.length < 3 || tags.length > 5) findings.push({ sev: 'bloquant', msg: `L5 — ${tags.length} hashtag(s) hors fourchette du skill (3-5)`, where: base });
else {
  const lastLines = lignes.slice(-3).join('\n');
  const tagsEnFin = (lastLines.match(/#[\p{L}\p{N}_-]+/gu) || []).length;
  if (tagsEnFin < tags.length) findings.push({ sev: 'warn', msg: 'L5 — hashtags dispersés dans le corps (le skill les attend en fin de post)', where: base });
}
if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
findings.push({ sev: 'info', msg: `conforme : ${len} caractères, hook ${[...(firstLine || '')].length} c., ${tags.length} hashtags, ${boldCount} caractère(s) Unicode Bold réversibles`, where: base });
out('PASS', 0);
