#!/usr/bin/env node
// Génération scriptée des fixtures « deck produit par pptxgenjs » d'oracle-charte-pptx-semantique
// (TF-1381 et TF-1382, retours Produit-68 du 26/09/2026, RG-13 et RG-14). Tout est FICTIF.
//
// Pourquoi un vrai pptxgenjs : les fixtures historiques (gen-pptx-fixtures.py) écrivent `<p:ph type="…"/>`
// à la main, type en tête. pptxgenjs 4.0.1 écrit `idx` AVANT `type`, sur plusieurs lignes, et ne sait
// émettre ni `ftr` ni `sldNum` : une fixture écrite à la main ne pouvait montrer ni l'un ni l'autre défaut.
//
// Sorties, dans ce dossier :
//   charte-pptx-pptxgenjs-brut.pptx   deck conforme, tel que pptxgenjs l'écrit : pieds NOMMÉS (objectName
//                                     « Pied de page », « Pagination ») mais sans espace réservé ftr/sldNum ;
//   charte-pptx-pptxgenjs-green.pptx  le même deck passé par digit-ai-pptx/scripts/poser-pieds-de-page.py ;
//   charte-pptx-pptxgenjs-red.pptx    deck brut à trois défauts : un sommaire à une entrée sans intercalaire
//                                     (S1), un sur-titre au-dessus du titre (S2), aucun pied de page (S4).
// Rejouable : node gen-charte-pptx-pptxgenjs-fixtures.mjs <dossier qui contient node_modules/pptxgenjs>
// (sans argument, pptxgenjs est cherché depuis ce dossier, puis en global).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const racine = process.argv[2] ? path.resolve(process.argv[2]) + path.sep : ICI + path.sep;
const PptxGenJS = createRequire(racine)('pptxgenjs');

function deck(rouge) {
  const p = new PptxGenJS();
  p.defineLayout({ name: 'L', width: 13.333, height: 7.5 });
  p.layout = 'L';
  p.defineSlideMaster({
    title: 'M',
    objects: [
      { placeholder: { options: { name: 'titre', type: 'title', x: 0.6, y: 0.5, w: 12, h: 0.8 }, text: '' } },
    ],
  });
  const diapo = () => p.addSlide({ masterName: 'M' });
  const pieds = (s, n) => {
    s.addText('Digit-AI — support fictif', { x: 0.6, y: 7.0, w: 8, h: 0.3, objectName: 'Pied de page' });
    s.addText(String(n), { x: 12.0, y: 7.0, w: 0.7, h: 0.3, objectName: 'Pagination' });
  };
  // 1 — couverture
  const s1 = diapo();
  s1.addText('Support fictif', { placeholder: 'titre' });
  // 2 — sommaire
  const s2 = diapo();
  s2.addText('Sommaire', { placeholder: 'titre' });
  s2.addText('01 Contexte', { x: 0.6, y: 1.8, w: 8, h: 0.5, objectName: 'Entrée de sommaire' });
  if (!rouge) pieds(s2, 2);
  if (rouge) {
    // 3 — contenu avec sur-titre au-dessus du titre ; pas d'intercalaire pour l'entrée « 01 Contexte »
    const s3 = diapo();
    s3.addText('NOTRE CONVICTION', { x: 0.6, y: 0.1, w: 6, h: 0.3, objectName: 'Sur-titre' });
    s3.addText('Contexte détaillé', { placeholder: 'titre' });
    s3.addText('Corps de la diapositive', { x: 0.6, y: 2.0, w: 10, h: 0.6, objectName: 'Corps' });
  } else {
    // 3 — intercalaire 01, 4 — contenu
    const s3 = diapo();
    s3.addText('01', { x: 0.6, y: 2.4, w: 2, h: 0.8, objectName: 'Numéro d intercalaire' });
    s3.addText('Contexte', { x: 0.6, y: 3.2, w: 8, h: 0.8, objectName: 'Intitulé d intercalaire' });
    pieds(s3, 3);
    const s4 = diapo();
    s4.addText('Contexte détaillé', { placeholder: 'titre' });
    s4.addText('Corps de la diapositive', { x: 0.6, y: 2.0, w: 10, h: 0.6, objectName: 'Corps' });
    pieds(s4, 4);
  }
  return p;
}

const sortie = (nom) => path.join(ICI, nom);
await deck(false).writeFile({ fileName: sortie('charte-pptx-pptxgenjs-brut.pptx') });
await deck(true).writeFile({ fileName: sortie('charte-pptx-pptxgenjs-red.pptx') });
const poser = path.join(ICI, '..', '..', 'digit-ai-pptx', 'scripts', 'poser-pieds-de-page.py');
const vert = sortie('charte-pptx-pptxgenjs-green.pptx');
fs.rmSync(vert, { force: true });
const r = spawnSync('python', [poser, sortie('charte-pptx-pptxgenjs-brut.pptx'), '--out', vert], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
console.log('écrit : brut, red, green —', r.stdout.trim().slice(0, 120));
