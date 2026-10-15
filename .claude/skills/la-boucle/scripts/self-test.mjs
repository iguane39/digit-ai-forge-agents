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
// DOUBLE SENS : la fixture verte est le skill réel ; chaque rouge en est une copie amputée d'UN
// élément (une ligne de critère, un lien rendu mort), qui doit échouer sur SA règle.
//
// NON JUGÉ : que Claude APPLIQUE la méthode en session (comportement, pas texte) ; la justesse
// d'une mesure ; la taille d'un échantillon ou un seuil, choix du métier (R-63, point 3).
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
  constats.longueurDescription = description.length;
  return constats;
}

// ── La verte : le skill réel ──
const vert = juger(SKILL);
vert.length === 0 ? bon('verte : le skill réel passe B1 (description ' + vert.longueurDescription + '/1024), B2 et B3 (' + CRITERES_R63.length + ' énoncés R-63 reconnus)')
  : mal('verte : ' + vert.map((c) => c.regle + ' ' + c.msg).join(' · '));

// ── Les rouges : une copie amputée d'un seul élément, qui doit échouer sur SA règle ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'la-boucle-'));
try {
  const original = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const rouge = (nom, texte, regle, motif) => {
    const d = path.join(tmp, nom);
    fs.cpSync(SKILL, d, { recursive: true });
    fs.writeFileSync(path.join(d, 'SKILL.md'), texte);
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
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(ko.length ? `\n❌ la-boucle : ${ko.length} échec(s), ${ok.length} vert(s)` : `\n✅ la-boucle : PASS (${ok.length} contrôles)`);
process.exit(ko.length ? 1 : 0);
