// gen-deck.mjs - regénère fixtures/accessibilite/deck-brut.pptx (TF-2368). Nécessite pptxgenjs (4.0.1 éprouvé) :
// copier ce fichier dans un dossier où `npm install pptxgenjs@4.0.1` a été fait, puis `node gen-deck.mjs`.
//
// Le deck est ce que le workflow écrivait AVANT TF-2368, sans lang ni en-tête de tableau ni marque
// décorative : pptxgenjs déclare lang="en-US" sur chaque passage, le tableau n'a pas de firstRow, et les
// deux formes sans texte (un bandeau, un filet) ne sont pas marquées. Le texte est fictif.
import pptxgen from 'pptxgenjs';

const p = new pptxgen();
const s = p.addSlide();
s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: '3355CC' }, objectName: 'Bandeau' });
s.addText('Le déploiement se fait en trois étapes', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, objectName: 'Titre' });
s.addText([
  { text: 'Chaque étape est validée par le comité', options: { breakLine: true } },
  { text: 'avant la mise en service.', options: {} },
], { x: 0.5, y: 1.2, w: 9, h: 1.0, fontSize: 14, objectName: 'Corps' });
s.addTable([
  [{ text: 'Lot' }, { text: 'Durée' }],
  [{ text: 'Cadrage' }, { text: '1 semaine' }],
  [{ text: 'Développement' }, { text: '2 semaines' }],
], { x: 0.5, y: 2.4, w: 6, objectName: 'Tableau' });
s.addShape(p.ShapeType.line, { x: 0.5, y: 5.2, w: 9, h: 0, line: { color: '3355CC', width: 1 }, objectName: 'Filet' });
await p.writeFile({ fileName: 'deck-brut.pptx' });
