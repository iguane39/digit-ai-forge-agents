#!/usr/bin/env node
// self-test — recette du skill prompt-analyzer-l99 : joue la recette de l'oracle du mode boucle
// (TF-1831), 2 verts et 8 rouges qui ne changent chacun qu'un élément du vert. Exit 0 / 1.
// TF-1975 (29/10/2026) : le type du rapport d'analyse est « Revue », au registre des types ; le
// SKILL.md et couches.md le prescrivent tous deux, et un type « Analyse » prescrit serait vu.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(ICI, 'oracle-boucle-l99.mjs'), '--self-test'], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');

const NOM_REVUE = '<Projet> - Revue - Prompt <objet> passé au crible L99 - AAAAMMJJ<indice>.md';
const prescrit = (texte) => texte.includes(NOM_REVUE) && !/<Projet> - Analyse - /.test(texte);
const skill = readFileSync(path.join(ICI, '..', 'SKILL.md'), 'utf8');
const couches = readFileSync(path.join(ICI, '..', 'references', 'couches.md'), 'utf8');
const cas = [
  ['TF-1975 vert — SKILL.md prescrit le type « Revue » au rapport d analyse', prescrit(skill)],
  ['TF-1975 vert — couches.md prescrit le même nom', prescrit(couches)],
  ['TF-1975 rouge — un nom « <Projet> - Analyse - … » prescrit est vu', !prescrit(skill.replace(NOM_REVUE, '<Projet> - Analyse - Prompt <objet> - AAAAMMJJ<indice>.md'))],
];
// TF-2022 (29/10/2026) : le mode boucle s'ouvre d'office sur trois cas nommés, et le Ch8 dit pourquoi ;
// SKILL.md et boucle.md portent tous deux la règle, et son retrait se voit.
const boucle = readFileSync(path.join(ICI, '..', 'references', 'boucle.md'), 'utf8');
const ouvertureDOffice = (texte) => /Ouverture d'office/.test(texte) && /TF-2022/.test(texte)
  && /campagne d'agents qui écrit/.test(texte) && /défaut bloquant/.test(texte) && /pourquoi il ne l'a pas été/.test(texte);
cas.push(
  ['TF-2022 vert — SKILL.md ouvre le mode boucle d office sur ses trois cas', ouvertureDOffice(skill)],
  ['TF-2022 vert — boucle.md porte la même règle', ouvertureDOffice(boucle)],
  ['TF-2022 rouge — le paragraphe retiré de boucle.md est vu', !ouvertureDOffice(boucle.replace(/\*\*Ouverture d'office\*\*[\s\S]*?pas été\./, ''))],
);
// TF-2194 (06/11/2026) : le contrat de sortie du Ch8 nomme l'oracle de forme de CHAQUE format que le
// prompt peut produire, voie de repli comprise. Le 05/11, un contrat qui ne nommait que check_html.py
// a laissé sortir un Markdown à 9 défauts de forme (check_markdown.py, exit 1). `formatsSansOracle`
// rend les formats annoncés sur la ligne « Formats produits » dont l'oracle n'est pas nommé ; les
// deux fixtures ne diffèrent que par la ligne qui nomme check_markdown.py.
const ORACLE_PAR_FORMAT = { html: 'check_html.py', markdown: 'check_markdown.py' };
const formatsSansOracle = (contrat) => {
  const ligne = (contrat.match(/^Formats produits\s*:(.*)$/m) || [, ''])[1];
  return Object.entries(ORACLE_PAR_FORMAT)
    .filter(([format, oracle]) => new RegExp(format, 'i').test(ligne) && !contrat.includes(oracle))
    .map(([format]) => format);
};
const regleFormeContrat = (texte) => /TF-2194/.test(texte) && /check_markdown\.py/.test(texte) && /voie de repli|repli/.test(texte);
const contratVert = readFileSync(path.join(ICI, '..', 'fixtures', 'contrat-forme-vert.md'), 'utf8');
const contratRouge = readFileSync(path.join(ICI, '..', 'fixtures', 'contrat-forme-rouge.md'), 'utf8');
cas.push(
  ['TF-2194 vert — un contrat qui nomme check_html.py et check_markdown.py (repli compris) n est pas refusé', formatsSansOracle(contratVert).length === 0],
  ['TF-2194 rouge — un contrat à repli Markdown sans check_markdown.py est refusé, pour le seul format markdown', formatsSansOracle(contratRouge).join() === 'markdown'],
  ['TF-2194 vert — SKILL.md et couches.md prescrivent l oracle de forme par format, repli compris', regleFormeContrat(skill) && regleFormeContrat(couches)],
  ['TF-2194 rouge — la section retirée de couches.md est vue', !regleFormeContrat(couches.replace(/## Contrat de sortie : l'oracle de forme[\s\S]*?(?=## Nom du livrable)/, '').replace(/ \*\*Le contrat nomme l'oracle de forme[\s\S]*?un Markdown\./, ''))],
);
// TF-2202 (06/11/2026) : une note de relecteur est recomptée avant d'entrer dans une correction, et une
// régression due à un défaut créé ouvre une passe de reprise unique ; boucle.md et SKILL.md portent la
// règle, et le banc de l'oracle (B11, B12) la joue en rouge et en vert.
const reglesNotes = (texte) => /Deux clés de plus/.test(texte) && /`recompte_notes` : `true`/.test(texte) && /`reprise_unique` : `true`/.test(texte);
const oracleNotes = readFileSync(path.join(ICI, 'oracle-boucle-l99.mjs'), 'utf8');
cas.push(
  ['TF-2202 vert — boucle.md porte les deux clés recompte_notes et reprise_unique', reglesNotes(boucle)],
  ['TF-2202 vert — SKILL.md nomme la règle (note recomptée, reprise unique)', /TF-2202/.test(skill) && /passe de reprise unique/.test(skill)],
  ['TF-2202 rouge — le paragraphe retiré de boucle.md est vu', !reglesNotes(boucle.replace(/\*\*Deux clés de plus[\s\S]*?(?=\*\*Extension jusqu'à 5 passes\*\*)/, ''))],
  ['TF-2202 vert — l oracle joue B11 et B12', /B11/.test(oracleNotes) && /B12/.test(oracleNotes)],
);
for (const [libelle, tenu] of cas) console.log(`${tenu ? 'ok  ' : 'FAIL'} ${libelle}`);
const echecs = cas.filter(([, tenu]) => !tenu).length;
process.exit(r.status === 0 && echecs === 0 ? 0 : 1);
