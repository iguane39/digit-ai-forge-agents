#!/usr/bin/env node
// oracle-tri-de-sujets — Domaine « Tri d'une liste de sujets avant étude d'opportunité ».
// Standard §3 : déterministe, checklist canonique, artefact réel, non_juge déclaré,
// sortie localisante, autoportant, prouvé par fixtures.
//
// Né le 02/11/2026 de l'étude du skill `tri-de-sujets` (pilot, output/03-etudes). Le fait : le tri
// du 19/10, refait à la main, a laissé 8 carrousels sans rangement, compté 7 liens de notifications
// comme des favoris et rangé 17 contenus sans les qualifier. Cet oracle lit le tableau remis et son
// fichier de rangement, et recalcule tout ce qui se recalcule. Il réécrit volontairement la règle de
// verdict au lieu d'importer `tri.mjs` : un juge qui partage le code du jugé ne juge rien.
//
// CHECKLIST CANONIQUE :
//   T1  le rangement est lisible : chaque entrée a un id unique, un état des 3, un motif, une voie.
//   T2  le périmètre déclaré vaut le nombre d'entrées rangées.
//   T3  le tableau a 3 ou 4 colonnes aux noms attendus, et tout verdict appartient au jeu fermé.
//   T4  le tableau et les lignes du rangement portent les mêmes éléments et les mêmes verdicts.
//   T5  la somme `G4 N3 P2 C4 = 17` est juste, hors lignes exemptées (2G + N + P + C).
//   T6  le verdict suit les notes, le seuil, la question et la mesure, la première condition l'emporte.
//   T7  chaque motif cite un existant, ou dit « aucun existant trouvé » avec les termes cherchés.
//   T8  le livrable ne porte aucune adresse signée, et aucun identifiant qui n'est pas retenu.
//   T9  toute entrée retenue a sa ligne, et une ligne ne cite que des entrées retenues.
//   T10 « Étude poussée » et « Essai court » citent une source datée.
//   T11 plus de la moitié de non qualifiés se dit dans les premières lignes du livrable.
//   T12 un tableau sans ligne n'est admis que si le rangement est complet et que le livrable le dit.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--rangement');
const iR = args.indexOf('--rangement');
const DOM = "Tri d'une liste de sujets avant étude d'opportunité";
const NJ = [
  'la justesse des notes données par le modèle : le back-test du skill les borne, cet oracle ne recalcule que leur somme',
  'la pertinence du filtre et le bien-fondé de chaque état : seules leur présence et leur cohérence se jugent',
  'que la citation mène bien à un existant qui couvre le sujet : sa forme se juge, jamais son contenu',
  'que la source datée soit primaire, et que la voie déclarée ait réellement servi',
];
const out = (verdict, findings, code, motif) => {
  const o = { oracle: 'oracle-tri-de-sujets', domaine: DOM, artefact: file || null, verdict, findings, non_juge: NJ };
  if (motif) o.motif = motif;
  process.stdout.write(JSON.stringify(o, null, 1) + '\n');
  process.exit(code);
};
if (!file || !fs.existsSync(file)) out('SKIP', [], 2, 'fichier absent : ' + (file || '(aucun argument)'));
if (path.extname(file).toLowerCase() !== '.md') out('SKIP', [], 2, 'extension non gérée : ' + path.extname(file) + ' (attendu .md)');
const cheminR = iR >= 0 ? args[iR + 1] : file + '.rangement.json';
if (!fs.existsSync(cheminR)) out('SKIP', [], 2, 'rangement absent : ' + cheminR + ' (--rangement <fichier>)');

const texte = fs.readFileSync(file, 'utf8');
let r;
try {
  r = JSON.parse(fs.readFileSync(cheminR, 'utf8'));
} catch (e) {
  out('FAIL', [{ sev: 'bloquant', regle: 'T1', msg: 'rangement illisible : ' + e.message, where: path.basename(cheminR) }], 1);
}

const f = [];
const ko = (regle, msg, where) => f.push({ sev: 'bloquant', regle, msg, where });
const ETATS = new Set(['retenu', 'hors filtre', 'non qualifié']);
const VERDICTS = new Set(['À écarter', 'Sans suite', 'Étude poussée', 'Essai court', 'Décision directe']);
const entrees = Array.isArray(r.entrees) ? r.entrees : [];
const lignes = Array.isArray(r.lignes) ? r.lignes : [];
const nom = path.basename(file);

// T1 — entrées
const vus = new Set();
entrees.forEach((e, i) => {
  const lieu = `entrees[${i}]`;
  if (!e.id) return ko('T1', 'entrée sans identifiant', lieu);
  if (vus.has(String(e.id))) ko('T1', `identifiant rangé 2 fois : ${e.id}`, lieu);
  vus.add(String(e.id));
  if (!ETATS.has(e.etat)) ko('T1', `état hors des 3 admis : ${e.etat}`, lieu);
  if (!e.motif) ko('T1', 'entrée sans motif', lieu);
  if (!e.voie) ko('T1', 'entrée sans voie de lecture', lieu);
});

// T2 — périmètre
if (typeof r.perimetre !== 'number') ko('T2', 'périmètre non déclaré', 'perimetre');
else if (r.perimetre !== entrees.length) ko('T2', `périmètre ${r.perimetre}, ${entrees.length} entrée(s) rangée(s)`, 'perimetre');

// T3 — tableau
const lignesTxt = texte.split(/\r?\n/);
const iEntete = lignesTxt.findIndex((l) => /^\|.*Élément abordé.*Pertinence d'une étude/.test(l));
const cellules = (l) => l.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
const rangees = [];
if (iEntete >= 0) {
  const entete = cellules(lignesTxt[iEntete]);
  if (entete.length < 3 || entete.length > 4 || (entete.length === 4 && entete[3] !== 'Motif') || !/^(Vidéos|Sources)$/.test(entete[1]))
    ko('T3', `colonnes attendues : Élément abordé, Vidéos ou Sources, Pertinence d'une étude, et Motif en option ; lues : ${entete.join(', ')}`, `${nom}:${iEntete + 1}`);
  for (let i = iEntete + 2; i < lignesTxt.length && lignesTxt[i].startsWith('|'); i++) {
    const c = cellules(lignesTxt[i]);
    if (c.length !== entete.length) ko('T3', `${c.length} cellule(s) pour ${entete.length} colonne(s)`, `${nom}:${i + 1}`);
    if (!VERDICTS.has(c[2])) ko('T3', `verdict hors du jeu fermé : ${c[2]}`, `${nom}:${i + 1}`);
    rangees.push({ element: c[0], verdict: c[2], ligne: i + 1 });
  }
}

// T4 — tableau contre rangement
const parElement = new Map(lignes.map((l) => [l.element, l]));
rangees.forEach((g) => {
  const l = parElement.get(g.element);
  if (!l) ko('T4', `élément du tableau absent du rangement : ${g.element}`, `${nom}:${g.ligne}`);
  else if (l.verdict !== g.verdict) ko('T4', `verdict ${g.verdict} au tableau, ${l.verdict} au rangement : ${g.element}`, `${nom}:${g.ligne}`);
});
const auTableau = new Set(rangees.map((g) => g.element));
lignes.forEach((l, i) => {
  if (!auTableau.has(l.element)) ko('T4', `ligne du rangement absente du tableau : ${l.element}`, `lignes[${i}]`);
});

// T5, T6, T7, T10 — ligne par ligne
const SEUILS = /^(objet-durable|gain-preuve|non|forges=.+)$/;
const CITE = /(`[^`]+`|https?:\/\/\S+|\bTF-\d+\b|\bD-\d+\b|[\w.\\/-]+\.(?:md|json|jsonl|mjs|html)\b)/;
const decider = (l, n) => {
  if (l.ecarte) return 'À écarter';
  if (l.deja_couvert) return 'Sans suite';
  if (n.somme < 14) return 'Sans suite'; // score minimal : D-125 (a) du 02/11/2026
  if (l.seuil && l.seuil !== 'non' && l.question) return 'Étude poussée';
  if (n.C >= 4 && l.mesure) return 'Essai court';
  return 'Décision directe';
};
lignes.forEach((l, i) => {
  const lieu = `lignes[${i}]`;
  if (!VERDICTS.has(l.verdict)) ko('T3', `verdict hors du jeu fermé : ${l.verdict}`, lieu);
  const exemptee = Boolean(l.ecarte || l.deja_couvert);
  if (!exemptee) {
    const m = /^G([1-5]) N([1-5]) P([1-5]) C([1-5]) = (\d+)$/.exec(l.notes || '');
    if (!m) {
      ko('T5', `notes absentes ou mal formées : ${l.notes}`, lieu);
    } else {
      const [G, N, P, C, S] = m.slice(1).map(Number);
      const somme = 2 * G + N + P + C;
      if (somme !== S) ko('T5', `somme écrite ${S}, recalculée ${somme} : ${l.element}`, lieu);
      if (!SEUILS.test(l.seuil || '')) ko('T6', `seuil mal formé : ${l.seuil}`, lieu);
      if (G >= 3 && P <= 2 && l.seuil === 'non') ko('T6', `gain ${G} et preuve ${P} tiennent le seuil, déclaré « non » : ${l.element}`, lieu);
      if (l.seuil === 'gain-preuve' && !(G >= 3 && P <= 2)) ko('T6', `seuil gain-preuve déclaré avec gain ${G} et preuve ${P}`, lieu);
      if (/^forges=/.test(l.seuil || '')) {
        const liste = l.seuil.slice(7).split(',').map((x) => x.trim()).filter(Boolean);
        if (liste.length < 3 && !liste.includes('noyau')) ko('T6', `seuil de forges avec ${liste.length} forge(s) sans le noyau`, lieu);
      }
      const attendu = decider(l, { somme, C });
      if (attendu !== l.verdict) ko('T6', `verdict ${l.verdict}, la règle rend ${attendu} : ${l.element}`, lieu);
    }
  } else {
    const attendu = l.ecarte ? 'À écarter' : 'Sans suite';
    if (attendu !== l.verdict) ko('T6', `verdict ${l.verdict}, la règle rend ${attendu} : ${l.element}`, lieu);
  }
  const motif = String(l.motif || '');
  const sansExistant = /aucun existant trouvé/i.test(motif);
  if (sansExistant && !/termes?/i.test(motif)) ko('T7', `« aucun existant trouvé » sans les termes cherchés : ${l.element}`, lieu);
  if (!sansExistant && !CITE.test(motif)) ko('T7', `motif sans citation d'existant : ${l.element}`, lieu);
  if ((l.verdict === 'Étude poussée' || l.verdict === 'Essai court')) {
    const s = String(l.source || '');
    if (!/https?:\/\//.test(s) || !/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b/.test(s)) ko('T10', `source datée absente : ${l.element}`, lieu);
  }
});

// T8 — adresses signées et identifiants écartés
const SIGNE = /x-expires|x-signature|[?&]tk=|X-Bogus|msToken|_signature/i;
lignesTxt.forEach((l, i) => {
  if (SIGNE.test(l)) ko('T8', 'adresse signée dans le livrable', `${nom}:${i + 1}`);
});
entrees.filter((e) => e.etat !== 'retenu' && e.id).forEach((e) => {
  if (texte.includes(String(e.id))) ko('T8', `identifiant non retenu cité au livrable : ${e.id}`, nom);
});

// T9 — couverture des entrées retenues
const retenus = new Set(entrees.filter((e) => e.etat === 'retenu').map((e) => String(e.id)));
const cites = new Set();
lignes.forEach((l, i) => (Array.isArray(l.ids) ? l.ids : []).forEach((id) => {
  cites.add(String(id));
  if (!retenus.has(String(id))) ko('T9', `ligne qui cite une entrée non retenue : ${id}`, `lignes[${i}]`);
}));
retenus.forEach((id) => {
  if (!cites.has(id)) ko('T9', `entrée retenue sans ligne : ${id}`, 'lignes');
});

// T11 — alerte sur les non qualifiés
const nq = entrees.filter((e) => e.etat === 'non qualifié').length;
const corps = lignesTxt.filter((l) => l.trim() && !/^(---|[a-z_]+:|#)/.test(l)).slice(0, 2).join(' ');
if (entrees.length && nq * 2 > entrees.length && !/non qualifi/i.test(corps))
  ko('T11', `${nq} non qualifiés sur ${entrees.length}, et l'ouverture du livrable ne le dit pas`, nom);

// T12 — tableau sans ligne
if (rangees.length === 0) {
  if (iEntete < 0 && !/rien n'a été retenu|aucun sujet retenu/i.test(texte)) ko('T12', 'aucun tableau, et le livrable ne dit pas que rien n\'a été retenu', nom);
  if (lignes.length) ko('T12', `${lignes.length} ligne(s) au rangement pour un tableau vide`, nom);
}

if (f.length) out('FAIL', f, 1);
out('PASS', [{ sev: 'info', msg: `${entrees.length} entrée(s), ${lignes.length} ligne(s) jugées`, where: nom }], 0);
