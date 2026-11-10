// gen-decks.mjs - regénère fixtures/grilles/grille-verte.pptx et grille-rouge.pptx (TF-2374). Nécessite pptxgenjs
// (4.0.1 éprouvé) : copier ce fichier dans un dossier où `npm install pptxgenjs@4.0.1` a été fait, puis
// `node gen-decks.mjs`. Textes fictifs.
//
// Verte : trois pages sœurs « évolution », une seule grille (bandeau à 1,10 po, trois cartes de 2,8 x 1,98 po
// à 1,70 po), aucune barre latérale.
// Rouge : le défaut du 29/09/2026 rejoué — la page 2 suit une autre grille (cartes de 1,62 po, bandeau à
// 1,46 po, soit 0,36 po plus bas) et les pages 2 et 3 portent chacune des barres latérales accolées aux cartes.
import pptxgen from 'pptxgenjs';

function page(p, titre, { cartesH, bandeauY, barres }) {
  const s = p.addSlide();
  s.addText(titre, { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 22, bold: true, lang: 'fr-FR', objectName: 'Titre' });
  s.addShape(p.ShapeType.rect, { x: 0.5, y: bandeauY, w: 9, h: 0.4, fill: { color: 'DDE3EC' }, objectName: 'Bandeau' });
  [0.5, 3.6, 6.7].forEach((x, i) => {
    s.addShape(p.ShapeType.rect, { x, y: bandeauY + 0.6, w: 2.8, h: cartesH, fill: { color: 'FFFFFF' }, line: { color: 'DDE3EC', width: 1 }, objectName: `Carte ${i + 1}` });
    s.addText(`Étape ${i + 1}`, { x: x + 0.15, y: bandeauY + 0.7, w: 2.5, h: 0.4, fontSize: 14, lang: 'fr-FR', objectName: `Texte ${i + 1}` });
    if (barres) s.addShape(p.ShapeType.rect, { x: x - 0.08, y: bandeauY + 0.6, w: 0.08, h: cartesH, fill: { color: '3355CC' }, objectName: `Barre ${i + 1}` });
  });
}

const verte = new pptxgen();
for (const t of ['Évolution 1 : cadrage', 'Évolution 2 : développement', 'Évolution 3 : mise en service']) page(verte, t, { cartesH: 1.98, bandeauY: 1.1, barres: false });
await verte.writeFile({ fileName: 'grille-verte.pptx' });

const rouge = new pptxgen();
page(rouge, 'Évolution 1 : cadrage', { cartesH: 1.98, bandeauY: 1.1, barres: false });
page(rouge, 'Évolution 2 : développement', { cartesH: 1.62, bandeauY: 1.46, barres: true });
page(rouge, 'Évolution 3 : mise en service', { cartesH: 1.98, bandeauY: 1.1, barres: true });
await rouge.writeFile({ fileName: 'grille-rouge.pptx' });
