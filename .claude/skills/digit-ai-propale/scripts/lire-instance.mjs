#!/usr/bin/env node
// lire-instance — charge les DONNÉES D'INSTANCE de l'émetteur d'une proposition (TF-2350, rattaché à TF-1023).
// Node pur, zéro dépendance, déterministe.
//
// LE FAIT (relevé du 11/09/2026, donnees/marque/LIVRABLES.md § 6, 17 lignes). Les gabarits de ce skill portaient
// en dur des valeurs qui décrivent l'émetteur et non la capacité : la baseline, le kicker et la mention de
// couverture, le footer, les coordonnées, la cadence d'un lot, les modalités, les engagements, une architecture
// type à noms de modèles datés, l'offre de formation citée. La loi n° 4 du produit veut ces valeurs chez
// l'émetteur, datées et sourcées ; il les y a rapatriées (décision D-7 (a) du 11/09/2026), dans `MARQUE.md`
// (§ « Baseline, signatures et coordonnées publiques ») et dans `offres/modalites.md`. Ce script les LIT, comme
// `digit-ai-pptx` lit déjà les jetons (`lire-marque.mjs`). Aucune valeur d'instance ne vit plus dans le skill.
//
// CE QU'IL FAIT
//   1. résout le dossier de marque : --marque=<dossier>, sinon $DIGIT_AI_MARQUE, sinon le chemin par défaut
//      <racine des forges>/digit-ai-marketing/donnees/marque/ ; le dossier des offres : --offres=<dossier>,
//      sinon $DIGIT_AI_OFFRES, sinon <marque>/../offres ;
//   2. lit le tableau « Baseline, signatures et coordonnées publiques » de `<marque>/MARQUE.md` → `signatures`
//      (une entrée par ligne, clé = libellé en minuscules sans accent, séparé par des tirets) ;
//   3. lit `<offres>/modalites.md` → `sections` (une entrée par titre de deuxième niveau, texte et éléments de
//      liste) ; une section dont le titre dit « périssable » porte `perissable: true` : à vérifier à chaque emploi.
//
// CE QU'IL NE FAIT PAS. Il ne retombe JAMAIS sur une valeur écrite dans le skill : dossier injoignable, tableau
// absent ou clé requise manquante ⇒ message sur stderr et exit 2, le skill rend la main. Il ne juge pas la
// JUSTESSE des valeurs ni leur statut « à valider » : il lit ce que l'émetteur déclare.
//
// Sortie : JSON sur stdout. Exit 0 (lu) / 2 (dossier, fichier, tableau ou clé requise manquant).
// Usage : node scripts/lire-instance.mjs [--marque=<dossier>] [--offres=<dossier>] [--exiger=<clé,clé…>] [--compact]
//   --exiger  remplace la liste des clés requises (signatures et sections confondues) ; défaut : celles qu'une
//             proposition consomme (voir CLES_REQUISES).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(ICI, '..');
const argv = process.argv.slice(2);
const opt = (nom) => {
  const egal = argv.find((a) => a.startsWith(`--${nom}=`));
  if (egal) return egal.slice(nom.length + 3);
  const i = argv.indexOf(`--${nom}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '';
};
function mourir(lignes) {
  process.stderr.write(lignes.join('\n') + '\n');
  process.exit(2);
}

const CLES_REQUISES = [
  'baseline', 'kicker-de-couverture', 'mention-de-couverture', 'footer-de-proposition', 'coordonnees-publiques', 'annee-de-reference',
  'modalites-de-facturation-et-de-perimetre', 'cadence-d-un-lot-applicatif', 'validite-d-une-offre', 'engagements-affiches-dans-une-proposition',
];

const RACINE_FORGES = process.env.FORGE_ROOT || path.resolve(SKILL_DIR, '..', '..', '..', '..');
const DEFAUT = path.join(RACINE_FORGES, 'digit-ai-marketing', 'donnees', 'marque');
const depuisArg = opt('marque');
const depuisEnv = process.env.DIGIT_AI_MARQUE || '';
const MARQUE = path.resolve(depuisArg || depuisEnv || DEFAUT);
const ORIGINE = depuisArg ? '--marque' : depuisEnv ? 'DIGIT_AI_MARQUE' : 'chemin par défaut';
const OFFRES = path.resolve(opt('offres') || process.env.DIGIT_AI_OFFRES || path.join(MARQUE, '..', 'offres'));
const aff = (p) => p.replace(/\\/g, '/');

const slug = (s) => s.replace(/\([^)]*\)/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

if (!fs.existsSync(MARQUE) || !fs.statSync(MARQUE).isDirectory()) {
  mourir([
    `ERREUR — dossier de marque introuvable : ${aff(MARQUE)}`,
    `  résolu depuis : ${ORIGINE}`,
    "  REMÈDE : donner le dossier de marque de l'émetteur par --marque=<dossier> ou par la variable DIGIT_AI_MARQUE.",
    `  Défaut Digit-AI : ${aff(DEFAUT)}`,
    '  Le skill NE retombe PAS sur des valeurs écrites en dur : sans les données de l\'émetteur, il rend la main.',
  ]);
}
const F_MARQUE = path.join(MARQUE, 'MARQUE.md');
const F_OFFRES = path.join(OFFRES, 'modalites.md');
for (const [f, role] of [[F_MARQUE, 'MARQUE.md (baseline, signatures et coordonnées)'], [F_OFFRES, 'modalites.md (modalités, cadence, validité, engagements)']]) {
  if (!fs.existsSync(f)) {
    mourir([`ERREUR — fichier de l'émetteur absent : ${aff(f)}`, `  attendu : ${role}`, `  dossier de marque : ${aff(MARQUE)} (résolu depuis ${ORIGINE}) ; dossier des offres : ${aff(OFFRES)}`,
      "  REMÈDE : désigner les bons dossiers (--marque, --offres) ou faire écrire ces données chez l'émetteur. Aucune valeur n'est substituée."]);
  }
}

// ---- sections « ## Titre » d'un fichier Markdown
function sections(texte) {
  const out = [];
  let cur = null;
  for (const l of texte.replace(/^﻿/, '').split(/\r?\n/)) {
    const h = l.match(/^##\s+(.+?)\s*$/);
    if (h) { cur = { titre: h[1], lignes: [] }; out.push(cur); } else if (cur) cur.lignes.push(l);
  }
  return out;
}
const nettoyer = (v) => v.trim().replace(/^«\s*/, '').replace(/\s*»$/, '').replace(/\s+/g, ' ');

// ---- MARQUE.md : le tableau des signatures
const signatures = {};
const secMarque = sections(fs.readFileSync(F_MARQUE, 'utf8')).find((s) => slug(s.titre).startsWith('baseline-signatures'));
if (secMarque) {
  const lignes = secMarque.lignes.filter((l) => /^\s*\|/.test(l)).filter((l) => !/^\s*\|[\s:|-]+\|?\s*$/.test(l)).slice(1);
  for (const l of lignes) {
    const c = l.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (c.length >= 2 && c[0] && c[1]) signatures[slug(c[0])] = { libelle: c[0], valeur: nettoyer(c[1]), emploi: c[2] || '' };
  }
}

// ---- modalites.md : les sections
const sectionsOffres = {};
for (const s of sections(fs.readFileSync(F_OFFRES, 'utf8'))) {
  const texte = s.lignes.join('\n').trim();
  const elements = s.lignes.filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, '').replace(/\*\*/g, '').trim());
  sectionsOffres[slug(s.titre)] = { titre: s.titre, texte, elements, perissable: /p[ée]rissable/i.test(s.titre) };
}

// ---- clés requises
const exiger = (opt('exiger') ? opt('exiger').split(',').map((x) => x.trim()).filter(Boolean) : CLES_REQUISES);
const manques = exiger.filter((k) => !(k in signatures) && !(k in sectionsOffres));
if (!secMarque) manques.unshift('(tableau « Baseline, signatures et coordonnées publiques » absent de MARQUE.md)');
if (manques.length) {
  mourir([
    "ERREUR — les données d'instance de l'émetteur sont incomplètes.",
    `  MARQUE.md : ${aff(F_MARQUE)}`,
    `  modalites.md : ${aff(F_OFFRES)}`,
    '  MANQUE :',
    ...manques.map((m) => `    - ${m}`),
    "  REMÈDE : compléter ces données chez l'émetteur (la loi n° 4 les veut là, datées et sourcées), puis relancer.",
    '  Le skill NE substitue AUCUNE valeur écrite en dur : il rend la main et dit ce qui manque.',
  ]);
}

process.stdout.write(JSON.stringify({
  outil: 'lire-instance',
  lu_le: new Date().toISOString().slice(0, 10),
  source: { marque: aff(F_MARQUE), offres: aff(F_OFFRES), resolu_depuis: ORIGINE },
  signatures,
  sections: sectionsOffres,
  non_juge: [
    "ne juge pas la JUSTESSE des valeurs : il lit ce que l'émetteur déclare, il ne l'arbitre pas",
    'ne voit pas les mentions « à valider » portées en prose par la documentation de marque',
    'une section marquée périssable (noms de modèles et d\'hébergeurs datés) se vérifie à chaque emploi, jamais recopiée d\'un gabarit',
  ],
}, null, argv.includes('--compact') ? 0 : 2) + '\n');
process.exit(0);
