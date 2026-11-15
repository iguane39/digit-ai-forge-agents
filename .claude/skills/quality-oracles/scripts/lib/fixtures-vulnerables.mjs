// lib/fixtures-vulnerables — les manifestes des fixtures volontairement vulnérables se rangent sous un nom que l'hébergeur
// ne lit pas, et la recette les rejoue sous leur vrai nom (TF-2580, décision D-220 (a) du 15/11/2026).
//
// LE FAIT. Le 14/11/2026, l'hébergeur affichait 35 alertes de dépendances ouvertes sur ce dépôt, les 35 portées par les cinq fixtures
// rouges de l'oracle SCA (versions épinglées vulnérables EXPRÈS). Elles ne se « corrigent » pas — les mettre à jour casserait la preuve
// de l'oracle — et elles noyaient les alertes qui comptent. Un manifeste rangé sous son vrai nom (`requirements.txt`, `uv.lock`,
// `package-lock.json`…) est lu par l'hébergeur ; rangé sous un autre (`requirements.txt.fixture`), il ne l'est plus.
//
// CE QUE FAIT CE MODULE, à partir de `references/fixtures-vulnerables.json` :
//   - `nomLuParHebergeur` : dit si un nom de fichier est un manifeste que l'hébergeur lit (liste datée et sourcée de la déclaration) ;
//   - `controlerRangement` : refuse tout manifeste de fixture rangé sous un nom lu, et toute entrée dont le fichier rangé manque ;
//   - `materialiser` : recopie une fixture déclarée sous ses vrais noms dans un dossier temporaire, rend la cible à donner à l'oracle
//     et de quoi retirer la copie. L'oracle SCA reste inchangé : il juge la copie, jamais le fichier rangé.
// Une cible qui n'est pas une fixture déclarée est rendue telle quelle, sans copie.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const normaliser = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

export function lireDeclaration(dossierSkill) {
  return JSON.parse(fs.readFileSync(path.join(dossierSkill, 'references', 'fixtures-vulnerables.json'), 'utf8').replace(/^﻿/, ''));
}

// Un motif de la liste (`*.csproj`, `requirements*.txt`) devient une expression ; la casse ne compte pas (Windows, macOS).
const motifEnExpression = (m) => new RegExp('^' + String(m).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');

/** Le nom (dernier segment) est-il un manifeste que l'hébergeur lit ? `lecture` = le champ `lecture_hebergeur` de la déclaration. */
export function nomLuParHebergeur(nom, lecture) {
  const base = path.posix.basename(normaliser(nom)).toLowerCase();
  const exacts = ((lecture && lecture.noms) || []).map((n) => String(n).toLowerCase());
  if (exacts.includes(base)) return true;
  return ((lecture && lecture.motifs) || []).some((m) => motifEnExpression(m).test(base));
}

const lister = (dossier) => fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dossier, e.name);
  return e.isDirectory() ? lister(p) : [p];
});

/**
 * Le rangement de chaque fixture déclarée. Rend la liste des défauts (vide = rangement conforme) :
 *   - la liste `lecture_hebergeur` manque ou est vide (sans elle, rien ne se juge : on ne rend jamais « conforme » sur ce qu'on n'a pas lu) ;
 *   - une entrée sans `manifestes` (chemin rangé + nom rejoué) ;
 *   - un fichier rangé qui n'existe pas, ou qui sort du dossier de son entrée ;
 *   - un manifeste rangé sous un nom que l'hébergeur lit ;
 *   - un nom rejoué qui n'est pas lu par l'hébergeur (la recette ne rejouerait alors pas ce que l'oracle reconnaît comme manifeste) ;
 *   - un fichier sous le dossier d'une entrée qui porte un nom lu, déclaré ou non (la fixture qui reprend son vrai nom).
 */
export function controlerRangement(declaration, racineDepot) {
  const defauts = [];
  const lecture = declaration && declaration.lecture_hebergeur;
  if (!lecture || !((lecture.noms || []).length || (lecture.motifs || []).length)) {
    return ['la déclaration ne porte pas `lecture_hebergeur` (noms ou motifs lus par l\'hébergeur) : le rangement ne peut pas se juger'];
  }
  for (const f of (declaration.fixtures || [])) {
    const dossier = normaliser(f.chemin);
    if (!Array.isArray(f.manifestes) || !f.manifestes.length) { defauts.push(`${dossier} : aucun manifeste déclaré (chemin rangé et nom rejoué)`); continue; }
    for (const m of f.manifestes) {
      const range = normaliser(m.range || '');
      if (!range || !m.rejoue) { defauts.push(`${dossier} : un manifeste sans chemin rangé (\`range\`) ou sans nom rejoué (\`rejoue\`)`); continue; }
      if (range !== dossier && !range.startsWith(dossier + '/')) defauts.push(`${range} : le fichier rangé sort du dossier de son entrée (${dossier})`);
      else if (!fs.existsSync(path.join(racineDepot, range))) defauts.push(`${range} : le fichier rangé n'existe pas`);
      if (nomLuParHebergeur(range, lecture)) defauts.push(`${range} : rangé sous un nom que l'hébergeur lit comme manifeste — la fixture reprend son vrai nom, l'hébergeur en signale les alertes ; rangez-le sous « ${path.posix.basename(range)}.fixture » et déclarez son nom de rejeu (\`rejoue\`)`);
      if (!nomLuParHebergeur(m.rejoue, lecture)) defauts.push(`${range} : rejoué sous « ${m.rejoue} », qui n'est pas un nom que l'hébergeur lit — ce n'est pas le nom de manifeste qu'attend l'oracle`);
    }
    const dossierDisque = path.join(racineDepot, dossier);
    if (fs.existsSync(dossierDisque) && fs.statSync(dossierDisque).isDirectory()) {
      for (const fichier of lister(dossierDisque)) {
        const rel = normaliser(path.relative(racineDepot, fichier));
        if (nomLuParHebergeur(rel, lecture) && !defauts.some((d) => d.startsWith(rel + ' :'))) defauts.push(`${rel} : un fichier sous une fixture déclarée porte un nom que l'hébergeur lit`);
      }
    }
  }
  return defauts;
}

/**
 * Une cible d'oracle prise dans l'arbre du dépôt : si elle est (ou est sous) une fixture déclarée, la recopie sous ses vrais noms dans un
 * dossier temporaire et rend `{ cible, retirer }` ; sinon rend la cible telle quelle, `retirer` ne fait rien.
 * `cible` est un chemin absolu, un fichier rangé (`…/sca-red/requirements.txt.fixture`) ou le dossier de l'entrée.
 */
export function materialiser(declaration, racineDepot, cible) {
  const sansCopie = { cible, retirer: () => {} };
  const abs = normaliser(path.resolve(cible)).toLowerCase();
  for (const f of (declaration.fixtures || [])) {
    const dossier = path.resolve(racineDepot, normaliser(f.chemin));
    const dossierN = normaliser(dossier).toLowerCase();
    if (abs !== dossierN && !abs.startsWith(dossierN + '/')) continue;
    const rejoue = new Map((f.manifestes || []).map((m) => [normaliser(path.relative(dossier, path.resolve(racineDepot, normaliser(m.range)))).toLowerCase(), normaliser(m.rejoue)]));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-fixture-'));
    const versTmp = (fichier) => {
      const rel = normaliser(path.relative(dossier, fichier));
      return path.join(tmp, rejoue.get(rel.toLowerCase()) || rel);
    };
    for (const fichier of lister(dossier)) {
      const dest = versTmp(fichier);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(fichier, dest);
    }
    const relCible = normaliser(path.relative(dossier, path.resolve(cible)));
    const copie = relCible ? versTmp(path.resolve(cible)) : tmp;
    return { cible: copie, retirer: () => fs.rmSync(tmp, { recursive: true, force: true }) };
  }
  return sansCopie;
}
