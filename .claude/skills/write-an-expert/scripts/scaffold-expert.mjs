#!/usr/bin/env node
// scaffold-expert.mjs — génère une fiche expert squelette + son entrée registre (statut todo), en une commande.
// TRANSACTIONNEL : toutes les validations passent avant la moindre écriture ; tout refus = zéro fichier modifié.
// Usage : node scaffold-expert.mjs --skill-dir <experts-forge> --domaine <kebab> --patterns "<regex|regex>"
//         --corpus "<chemin1,chemin2>" --merite "<récurrence>;<corpus>;<non-recouvrement>" [--types "<texte>"]
// Exit : 0 créé, 2 refus (validation), avec raison JSON sur stderr.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const refus = (raison) => { console.error(JSON.stringify({ verdict: 'REFUS', raison })); process.exit(2); };

const dir = arg('skill-dir'); const domaine = arg('domaine'); const patterns = arg('patterns');
const corpus = (arg('corpus', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const merite = (arg('merite', '') || '').split(';').map(s => s.trim()).filter(Boolean);
const types = arg('types', 'à compléter');

// ---- VALIDATIONS (aucune écriture avant ce bloc entier) ----
if (!dir || !existsSync(join(dir, 'references', 'registre-experts.md'))) refus('skill-dir invalide ou registre absent');
if (!domaine || !/^[a-z0-9][a-z0-9-]*$/.test(domaine)) refus('domaine manquant ou non kebab-case');
if (!patterns || !patterns.trim()) refus('content_patterns vide');
try { new RegExp(patterns); } catch (e) { refus('content_patterns : regex invalide — ' + e.message); }
if (merite.length !== 3) refus('critère « mérite un expert » : 3 conditions requises (récurrence;corpus;non-recouvrement), reçues ' + merite.length);
if (!corpus.length) refus('corpus vide = fiche refusée (loi du schéma, champ 3)');
for (const c of corpus) if (!existsSync(c)) refus('chemin de corpus non résolu : ' + c);
const regPath = join(dir, 'references', 'registre-experts.md');
const reg = readFileSync(regPath, 'utf-8');
if (new RegExp(`^\\|\\s*${domaine}\\s*\\|`, 'm').test(reg)) refus('domaine déjà présent au registre : ' + domaine);
const fichePath = join(dir, 'fiches', `expert-${domaine}.md`);
if (existsSync(fichePath)) refus('fiche déjà existante : ' + fichePath);
const date = new Date().toISOString().slice(0, 10).split('-').reverse().join('/');

// ---- ÉCRITURES (transaction : contenus préparés, puis écrits) ----
const fiche = `# Fiche expert — \`${domaine}\`

Version 0.1.0 — ${date} — Statut registre : **todo** (générée par scaffold-expert, verdict d'admission en attente).

## 0. Mérite un expert (3 conditions, renseignées à la création)
1. Récurrence : ${merite[0]}
2. Corpus disponible : ${merite[1]}
3. Non-recouvrement : ${merite[2]}

## 1. domaine
\`${domaine}\` — [PÉRIMÈTRE À PRÉCISER]

## 2. declencheurs
- \`content_patterns\` : \`${patterns}\`
- Types de demandes : ${types}
- Ne pas router : [EXCLUSIONS À PRÉCISER]

## 3. corpus
Chemins résolus (test d'existence exécuté le ${date} par scaffold-expert) :
${corpus.map(c => `- \`${c}\``).join('\n')}
- [CHECKLIST PROPRE À RÉDIGER — le corpus externe ne suffit pas, dériver 3 à 7 points spécifiques au domaine]

## 4. rubrique (À FIGER — 3 à 7 axes)
Contribution rendue exclusivement en annotations identifiées « Contribution expert-${domaine}» ; 1 à 3 annotations
actionnables par axe, ancrées corpus + faits ; généralités transposables interdites.
1. [AXE 1]

## 5. frontiere
N'exécute pas, ne juge pas, ne réécrit pas, ne chiffre rien. [FRONTIÈRES SPÉCIFIQUES À PRÉCISER — renvois aux domaines voisins]

## 6. fixture_valeur
- Demande témoin : [À DÉFINIR — demande réelle et rejouable]
- Baseline : [FIGÉE AVANT LECTURE DE CETTE FICHE]
- Critère : au moins un élément actionnable absent de la baseline — verdict par \`oracle-judge\` armé de \`rubrique-juge-experts.md\`.
`;
const ligne = `| ${domaine} | todo | \`fiches/expert-${domaine}.md\` | à définir (générée par scaffold-expert le ${date}) | — |`;
const lignes = reg.split('\n');
let last = -1; lignes.forEach((l, i) => { if (/^\|\s*[a-z0-9-]+\s*\|\s*(ok|todo|refuse)\s*\|/.test(l)) last = i; });
if (last < 0) refus('table du registre introuvable');
lignes.splice(last + 1, 0, ligne);
writeFileSync(fichePath, fiche);
writeFileSync(regPath, lignes.join('\n'));
console.log(JSON.stringify({ verdict: 'CREE', fiche: fichePath, registre: 'entrée todo ajoutée', prochaine_etape: 'compléter les [À …], puis rejouer la fixture A/B et soumettre à oracle-judge' }, null, 2));
