#!/usr/bin/env node
// self-test — recette du skill la-boucle (TF-1728, 15/10/2026). Node pur, zéro dépendance,
// déterministe, double sens. Exit 0 = PASS, 1 = FAIL.
//
// POURQUOI IL EXISTE. R-63 du pilot (REGLES-PROJET.md, section AR, point 2) écrit la méthode qui
// juge une VERSION AMÉLIORÉE d'une sortie automatisée de tri, de classement ou de rédaction, et la
// déclare à porter par ce skill. Le fait qui l'a fait naître, lot Produit-12 du 14/10/2026 : la v2.10
// annonçait une correction qui ne touchait aucune ligne existante, un test de la v2.14 passait aussi
// sur le code précédent, et la v2.11 gagnait 2,7 points sur l'échantillon avec 4 faux sur 12 de ses
// changements relus. La-boucle est une discipline qu'applique Claude, pas un mécanisme : ce qui se
// vérifie par script, c'est que le contrat écrit reste entier.
//
// CE QU'IL JUGE
//   B1 — le frontmatter porte `name: la-boucle` et une description d'au plus 1 024 caractères.
//   B2 — tout chemin relatif cité par un lien Markdown de SKILL.md existe dans le skill.
//   B3 — la section R-63 porte ses cinq critères, chacun reconnu par un énoncé testable :
//        test rouge sur le code précédent, règle appliquée à l'existant, tirage des changements
//        avec graine, rejet tracé (numéro et raison), arrêt borné (deux versions sous un point, ou
//        borne fixée d'avance) — et la mesure de départ hors du système qui les précède.
//   B4 — (D-133 (a), TF-2051, 02/11/2026) la section « Passes successives » écrit le critère
//        comparatif : lecture de l'écart dès la 2e passe, mesure, apport à un critère nommé, un ajout
//        sans progrès n'en est pas un, un retrait sans casse en est un, figeage de l'arbitre intact.
//   B5 — la même section écrit la sortie « rien à changer » : sortie valide, preuve, arrêt sans passe
//        de plus, attestation de l'arbitre, et jamais une sortie d'échappement.
//   B6 — elle écrit l'articulation avec la loi n° 3 du pilot : ce qui manque se propose toujours une
//        fois, et n'est pas re-proposé à chaque passe.
//   B7 — la COHÉRENCE des trois : profils-arbitre.md porte la section « Comparer deux passes » avec une
//        ligne par type de livrable de sa propre table des profils ; la section ne contient aucune
//        phrase qui autorise « rien à changer » avec un critère en échec ; le figeage de l'arbitre et la
//        règle de la borne (Garde-fous) sont restés entiers ; la mesure citée de make-it-better existe
//        quand le skill voisin est présent (sinon : dit, jamais inventé).
// DOUBLE SENS : la fixture verte est le skill réel ; chaque rouge en est une copie amputée d'UN
// élément (une ligne de critère, une phrase, un lien rendu mort, une ligne de profil), ou altérée
// d'UNE phrase d'échappement, qui doit échouer sur SA règle.
//
// NON JUGÉ : que Claude APPLIQUE la méthode en session (comportement, pas texte) ; la justesse
// d'une mesure ; la taille d'un échantillon ou un seuil, choix du métier (R-63, point 3) ; qu'un
// « rien à changer » soit VRAI sur un livrable donné (c'est l'attestation de l'arbitre, en session) ;
// la justesse de l'écart mesuré par un livrable réel.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = [], ko = [];
const bon = (m) => { ok.push(m); console.log('  ✅ ' + m); };
const mal = (m) => { ko.push(m); console.log('  ❌ ' + m); };

const CRITERES_R63 = [
  ['mesure de départ', /mesurer l'existant sur un échantillon étiqueté hors du système/i],
  ['test rouge sur le code précédent', /test qui échoue sur la version précédente/i],
  ["règle appliquée à l'existant", /lignes déjà traitées/i],
  ['tirage des changements', /tirage, avec graine écrite, des changements/i],
  ['rejet tracé', /rejetée ; son numéro et sa raison restent au journal/i],
  ['arrêt borné', /deux versions consécutives gagnent moins d'un point, ou à la borne fixée/i],
];

// D-133 (a), TF-2051 : [règle, nom, énoncé reconnu dans la section « Passes successives »].
const CRITERES_PASSES = [
  ['B4', 'lecture de l\'écart dès la 2e passe', /À partir de la 2e passe, l'arbitre lit l'écart entre la passe précédente et le candidat/],
  ['B4', 'écart mesuré (lignes, poids ou volume)', /mesuré \(lignes, poids ou volume du livrable\)/],
  ['B4', 'apport à un critère nommé', /Il note ce que l'ajout apporte à un critère de l'arbitre, nommé/],
  ['B4', 'ajout sans progrès', /Un ajout qui ne fait progresser aucun critère ne compte pas comme un progrès/],
  ['B4', 'retrait sans casse', /Un retrait qui ne casse aucun critère en est un/],
  ['B4', 'figeage intact', /sans modifier la règle du figeage de l'arbitre au cadrage/],
  ['B5', 'sortie valide', /« rien à changer » est une sortie valide/],
  ['B5', 'preuve de la sortie', /critères relus un à un, oracles lancés, constats lus/],
  ['B5', 'arrêt sans passe de plus', /La boucle s'arrête alors sans passe de plus/],
  ['B5', 'attestation de l\'arbitre', /n'est valide que si l'arbitre l'atteste/],
  ['B5', 'pas une sortie d\'échappement', /Ce n'est pas une sortie d'échappement quand un critère reste en échec/],
  ['B6', 'loi n° 3 : proposé une fois', /Ce qui manque se propose toujours une fois/],
  ['B6', 'loi n° 3 : pas re-proposé à chaque passe', /n'est pas re-proposé à chaque passe/],
];
const SECTION_PASSES = /^Passes successives/;
const ESCAPATOIRE = /(?:même|y compris) (?:si|quand|avec) (?:un|des|le|les) critères? (?:reste|restent|est|sont) (?:en échec|rouges?|non tenus?)/i;
/** Les lignes d'un tableau Markdown d'une section : première cellule de chaque ligne de données. */
const premieresCellules = (section) => section.split('\n').filter((l) => /^\| /.test(l) && !/^\|[-| ]+\|$/.test(l)).map((l) => l.split('|')[1].trim());

/** Les constats d'un dossier de skill : [{ regle, msg }]. */
function juger(dir) {
  const constats = [];
  const texte = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const fm = texte.match(/^---\n([\s\S]*?)\n---/);
  const name = fm && /^name:\s*(\S+)/m.exec(fm[1]);
  // La description : la ligne `description:` et ses lignes indentées (bloc YAML replié `>`).
  const lignesFm = fm ? fm[1].split('\n') : [];
  const iDesc = lignesFm.findIndex((l) => /^description:/.test(l));
  const blocDesc = [];
  if (iDesc >= 0) {
    blocDesc.push(lignesFm[iDesc].replace(/^description:\s*>?-?\s*/, ''));
    for (let k = iDesc + 1; k < lignesFm.length && /^\s+\S/.test(lignesFm[k]); k++) blocDesc.push(lignesFm[k]);
  }
  const description = blocDesc.map((l) => l.trim()).filter(Boolean).join(' ');
  if (!name || name[1] !== 'la-boucle') constats.push({ regle: 'B1', msg: 'frontmatter : `name: la-boucle` absent' });
  if (!description || description.length > 1024) constats.push({ regle: 'B1', msg: `frontmatter : description ${description.length} caractères (1 à 1 024 attendus)` });
  for (const m of texte.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    const cible = m[1];
    if (/^[a-z]+:/i.test(cible)) continue;   // lien externe
    if (!fs.existsSync(path.join(dir, cible))) constats.push({ regle: 'B2', msg: `lien mort : ${cible}` });
  }
  const section = (texte.split(/\n## /).find((s) => /^Améliorer une version/.test(s)) || '');
  if (!section) constats.push({ regle: 'B3', msg: 'section « Améliorer une version… » (R-63, point 2) absente' });
  for (const [nom, re] of CRITERES_R63) if (section && !re.test(section.replace(/\s*\n\s*/g, ' '))) constats.push({ regle: 'B3', msg: `critère R-63 absent de la section : ${nom}` });
  // B4-B6 : la section « Passes successives » (D-133 (a), TF-2051), un énoncé reconnu par phrase.
  const passes = (texte.split(/\n## /).find((s) => SECTION_PASSES.test(s)) || '');
  if (!passes) constats.push({ regle: 'B4', msg: 'section « Passes successives » (D-133 (a), TF-2051) absente' });
  else for (const [regle, nom, re] of CRITERES_PASSES) if (!re.test(passes.replace(/\s*\n\s*/g, ' '))) constats.push({ regle, msg: `énoncé ${regle} absent de la section Passes successives : ${nom}` });
  // B7 : la cohérence. (a) aucune phrase n'autorise « rien à changer » avec un critère en échec.
  if (passes && ESCAPATOIRE.test(passes.replace(/\s*\n\s*/g, ' '))) constats.push({ regle: 'B7', msg: 'échappatoire : la section autorise « rien à changer » avec un critère en échec' });
  // (b) le figeage de l'arbitre et la règle de la borne restent entiers.
  const plat = texte.replace(/\s*\n\s*/g, ' ');
  if (!/figé et validé avant le premier candidat/.test(plat)) constats.push({ regle: 'B7', msg: "figeage de l'arbitre modifié : « figé et validé avant le premier candidat » a disparu" });
  if (!/À la borne, arbitre toujours en échec/.test(plat)) constats.push({ regle: 'B7', msg: 'règle de la borne modifiée : « À la borne, arbitre toujours en échec » a disparu des Garde-fous' });
  // (c) profils-arbitre.md : la section « Comparer deux passes » a une ligne par type de SA table des profils.
  let profils = null;
  try { profils = fs.readFileSync(path.join(dir, 'references', 'profils-arbitre.md'), 'utf8').replace(/\r\n/g, '\n'); } catch { constats.push({ regle: 'B7', msg: 'references/profils-arbitre.md illisible' }); }
  if (profils !== null) {
    const parties = profils.split(/\n## /);
    const table = parties.find((s) => /^Table des profils/.test(s)) || '';
    const comparer = parties.find((s) => /^Comparer deux passes/.test(s)) || '';
    const types = premieresCellules(table).filter((c) => c !== 'Type de livrable');
    if (!types.length) constats.push({ regle: 'B7', msg: 'table des profils vide ou absente de profils-arbitre.md' });
    if (!comparer) constats.push({ regle: 'B7', msg: 'section « Comparer deux passes » absente de profils-arbitre.md' });
    else { const lignes = premieresCellules(comparer); for (const t of types) if (!lignes.includes(t)) constats.push({ regle: 'B7', msg: `ligne de profil absente de « Comparer deux passes » : ${t}` }); }
  }
  constats.longueurDescription = description.length;
  return constats;
}

// ── La verte : le skill réel ──
const vert = juger(SKILL);
vert.length === 0 ? bon('verte : le skill réel passe B1 (description ' + vert.longueurDescription + '/1024), B2, B3 (' + CRITERES_R63.length + ' énoncés R-63 reconnus), B4 à B6 (' + CRITERES_PASSES.length + ' énoncés des passes successives reconnus) et B7 (cohérence)')
  : mal('verte : ' + vert.map((c) => c.regle + ' ' + c.msg).join(' · '));

// La mesure que la section cite en exemple existe chez le skill voisin, quand il est présent.
{
  const voisin = path.join(SKILL, '..', 'make-it-better', 'scripts', 'lib', 'diff.mjs');
  if (!fs.existsSync(voisin)) bon('verte : make-it-better absent de cette racine, la mesure citée (ecartMots) n\'est pas vérifiée ici');
  else /export function ecartMots\b/.test(fs.readFileSync(voisin, 'utf8')) ? bon('verte : la mesure citée en exemple existe (ecartMots, make-it-better/scripts/lib/diff.mjs)')
    : mal('verte : la section cite ecartMots de make-it-better, absent de scripts/lib/diff.mjs');
}

// ── Les rouges : une copie amputée d'un seul élément, qui doit échouer sur SA règle ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'la-boucle-'));
try {
  const original = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const rouge = (nom, texte, regle, motif, fichier = 'SKILL.md') => {
    const d = path.join(tmp, nom);
    fs.cpSync(SKILL, d, { recursive: true });
    fs.writeFileSync(path.join(d, fichier), texte);
    const c = juger(d);
    c.some((x) => x.regle === regle && x.msg.includes(motif)) ? bon(`rouge ${nom} : échoue sur ${regle} (${motif})`)
      : mal(`rouge ${nom} : attendu un échec ${regle} « ${motif} », obtenu ${JSON.stringify(c)}`);
  };
  for (const [nom, re] of CRITERES_R63) {
    const lignes = original.split('\n');
    const i = lignes.findIndex((l) => re.test(l));
    if (i < 0) { mal(`rouge « sans ${nom} » non construit : l'énoncé tient sur plusieurs lignes ou manque à la verte`); continue; }
    rouge('sans-' + nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/gi, '-'), lignes.filter((_, j) => j !== i).join('\n'), 'B3', nom);
  }
  rouge('lien-mort', original.replace('references/profils-arbitre.md)', 'references/profils-absents.md)'), 'B2', 'profils-absents.md');
  rouge('sans-section', original.replace(/\n## Améliorer une version/, '\n## Autre titre'), 'B3', 'absente');

  // D-133 (a), TF-2051 — chaque énoncé des passes successives est retiré seul : sa règle échoue, nommément.
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-');
  for (const [regle, nom, re] of CRITERES_PASSES) {
    const coupe = original.replace(re, '');
    if (coupe === original) { mal(`rouge « sans ${nom} » non construit : l'énoncé manque à la verte`); continue; }
    rouge(`${regle}-sans-${slug(nom)}`, coupe, regle, nom);
  }
  rouge('passes-sans-section', original.replace(/\n## Passes successives/, '\n## Autre passage'), 'B4', 'absente');
  // Cohérence : une phrase d'échappatoire AJOUTÉE (les énoncés B5 restent), le figeage et la borne altérés.
  const echappe = original.replace("La boucle s'arrête alors sans passe de plus", "La boucle s'arrête alors sans passe de plus, même si un critère reste en échec");
  if (echappe === original) mal("rouge « échappatoire » non construit : la phrase d'arrêt manque à la verte");
  else rouge('echappatoire', echappe, 'B7', 'échappatoire');
  rouge('figeage-modifie', original.replace('figé et validé avant le premier', 'ajusté après le premier'), 'B7', 'figeage de l\'arbitre modifié');
  rouge('borne-modifiee', original.replace('À la borne, arbitre toujours en échec', 'À la borne, arbitre toujours satisfait'), 'B7', 'règle de la borne modifiée');
  // Cohérence côté profils : la section ôtée, puis une ligne de type ôtée.
  const profils = fs.readFileSync(path.join(SKILL, 'references', 'profils-arbitre.md'), 'utf8').replace(/\r\n/g, '\n');
  rouge('profils-sans-section', profils.replace('## Comparer deux passes', '## Autre mesure'), 'B7', 'section « Comparer deux passes » absente', 'references/profils-arbitre.md');
  const sansDeck = profils.split('\n').filter((l) => !(l.startsWith('| Deck / PPTX |') && l.includes('Nombre de slides'))).join('\n');
  sansDeck === profils ? mal('rouge « profils sans ligne Deck » non construit : la ligne manque à la verte')
    : rouge('profils-sans-deck', sansDeck, 'B7', 'ligne de profil absente de « Comparer deux passes » : Deck / PPTX', 'references/profils-arbitre.md');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(ko.length ? `\n❌ la-boucle : ${ko.length} échec(s), ${ok.length} vert(s)` : `\n✅ la-boucle : PASS (${ok.length} contrôles)`);
process.exit(ko.length ? 1 : 0);
