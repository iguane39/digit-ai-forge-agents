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
for (const [libelle, tenu] of cas) console.log(`${tenu ? 'ok  ' : 'FAIL'} ${libelle}`);
const echecs = cas.filter(([, tenu]) => !tenu).length;
process.exit(r.status === 0 && echecs === 0 ? 0 : 1);
