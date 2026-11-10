#!/usr/bin/env node
// lire-signature — lit la SIGNATURE de l'émetteur pour le pied de page d'un schéma (TF-2350, rattaché à TF-1023).
// Node pur, zéro dépendance, déterministe.
//
// LE FAIT (relevé du 11/09/2026, donnees/marque/LIVRABLES.md § 6). La formule du pied de page d'un schéma
// (« DIGIT-AI · CONSEIL ET STRATÉGIE IA » à gauche, « {Type} · {Audience} · {Année} » à droite) et l'année de
// référence étaient écrites en dur dans SKILL.md, dans references/conventions-communes.md § 13 et dans les gabarits
// HTML. La loi n° 4 du produit veut ces valeurs chez l'émetteur ; il les a rapatriées dans `MARQUE.md`, tableau
// « Baseline, signatures et coordonnées publiques » (décision D-7 (a) du 11/09/2026). Ce script les LIT.
//
// CE QU'IL FAIT. Résout le dossier de marque (--marque=<dossier>, sinon $DIGIT_AI_MARQUE, sinon
// <racine des forges>/digit-ai-marketing/donnees/marque/), lit les lignes « Footer de page de schéma » et « Année de
// référence » du tableau, et rend `footer.marque` (partie de gauche), `footer.droite_gabarit` (partie de droite,
// avec ses emplacements) et `annee_reference`.
//
// CE QU'IL NE FAIT PAS. Il ne retombe sur AUCUNE valeur écrite dans le skill : dossier, fichier, tableau ou ligne
// manquants ⇒ message sur stderr et exit 2, le skill rend la main. Pour un engagement client, `charte-livrable.json`
// (references/conventions-communes.md § 13) remplace la marque du pied de page : ce script n'est alors pas requis.
//
// Sortie : JSON sur stdout. Exit 0 (lu) / 2 (manquant).
// Usage : node scripts/lire-signature.mjs [--marque=<dossier>] [--compact]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (nom) => {
  const egal = argv.find((a) => a.startsWith(`--${nom}=`));
  if (egal) return egal.slice(nom.length + 3);
  const i = argv.indexOf(`--${nom}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '';
};
const aff = (p) => p.replace(/\\/g, '/');
function mourir(lignes) {
  process.stderr.write(lignes.join('\n') + '\n');
  process.exit(2);
}
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const RACINE_FORGES = process.env.FORGE_ROOT || path.resolve(SKILL_DIR, '..', '..', '..', '..');
const DEFAUT = path.join(RACINE_FORGES, 'digit-ai-marketing', 'donnees', 'marque');
const depuisArg = opt('marque');
const depuisEnv = process.env.DIGIT_AI_MARQUE || '';
const MARQUE = path.resolve(depuisArg || depuisEnv || DEFAUT);
const ORIGINE = depuisArg ? '--marque' : depuisEnv ? 'DIGIT_AI_MARQUE' : 'chemin par défaut';

if (!fs.existsSync(MARQUE) || !fs.statSync(MARQUE).isDirectory()) {
  mourir([`ERREUR — dossier de marque introuvable : ${aff(MARQUE)}`, `  résolu depuis : ${ORIGINE}`,
    "  REMÈDE : donner le dossier de marque de l'émetteur par --marque=<dossier> ou par la variable DIGIT_AI_MARQUE.",
    `  Défaut Digit-AI : ${aff(DEFAUT)}`, "  Le skill NE retombe PAS sur une valeur écrite en dur : sans la signature de l'émetteur, il rend la main."]);
}
const fichier = path.join(MARQUE, 'MARQUE.md');
if (!fs.existsSync(fichier)) mourir([`ERREUR — MARQUE.md absent du dossier de marque : ${aff(fichier)}`, "  REMÈDE : faire écrire la signature chez l'émetteur (tableau « Baseline, signatures et coordonnées publiques »)."]);

// ---- le tableau « Baseline, signatures et coordonnées publiques »
const lignes = fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
let dedans = false;
const rangs = {};
for (const l of lignes) {
  const h = l.match(/^##\s+(.+?)\s*$/);
  if (h) { dedans = slug(h[1]).startsWith('baseline-signatures'); continue; }
  if (!dedans || !/^\s*\|/.test(l) || /^\s*\|[\s:|-]+\|?\s*$/.test(l)) continue;
  const c = l.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
  if (c.length >= 2) rangs[slug(c[0])] = c[1];
}
const manques = ['footer-de-page-de-schema', 'annee-de-reference'].filter((k) => !rangs[k]);
if (manques.length) {
  mourir(["ERREUR — la signature de l'émetteur est incomplète.", `  MARQUE.md : ${aff(fichier)} (dossier résolu depuis ${ORIGINE})`, '  MANQUE (lignes du tableau « Baseline, signatures et coordonnées publiques ») :',
    ...manques.map((m) => `    - ${m}`), '  REMÈDE : compléter le tableau chez l\'émetteur. Le skill NE substitue AUCUNE valeur en dur : il rend la main.']);
}
const quotes = [...rangs['footer-de-page-de-schema'].matchAll(/«\s*([^»]+?)\s*»/g)].map((m) => m[1]);
if (quotes.length < 2) {
  mourir(['ERREUR — la ligne « Footer de page de schéma » ne porte pas deux formules entre « » (gauche, droite).', `  lu : ${rangs['footer-de-page-de-schema']}`,
    "  REMÈDE : écrire la formule de gauche et celle de droite chacune entre « » chez l'émetteur."]);
}

process.stdout.write(JSON.stringify({
  outil: 'lire-signature',
  lu_le: new Date().toISOString().slice(0, 10),
  source: { marque: aff(fichier), resolu_depuis: ORIGINE },
  footer: { marque: quotes[0], droite_gabarit: quotes[1] },
  annee_reference: rangs['annee-de-reference'].replace(/\*\*/g, '').trim(),
  non_juge: ["ne juge pas la JUSTESSE de la signature : il lit ce que l'émetteur déclare", 'ne voit pas les mentions « à valider » portées en prose par la documentation de marque'],
}, null, argv.includes('--compact') ? 0 : 2) + '\n');
process.exit(0);
