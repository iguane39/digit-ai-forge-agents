#!/usr/bin/env node
// verifier-accord-registre — l'accord entre les DEUX VUES du registre des oracles (TF-1538).
//
// LE FAIT, mesuré le 01/10/2026 : `registre-oracles.json` (machine, lu par run-oracles.mjs) et
// `registre-oracles.md` (vue humaine) décrivent le même catalogue, et rien ne jugeait leur accord.
// Les deux numéros de version étaient alignés à chaque enregistrement, mais `oracle-cadence-de-mission`
// figurait au JSON et manquait à la vue humaine, et cinq lignes du tableau portaient une barre
// verticale non échappée (`<fichier|dossier>`) qui cassait leurs colonnes. Un lecteur humain lit la
// vue et croit que le catalogue est complet.
//
// TROIS ACCORDS, tous déterministes, aucun ne lit le sens d'une description :
//   V1  la version annoncée par l'en-tête de la vue (« Vue humaine (vX.Y.Z ») est celle du JSON ;
//   V2  le script de chaque entrée du JSON (le premier argument de sa commande qui se termine par
//       .mjs, .js ou .py) est NOMMÉ quelque part dans la vue — par son nom de fichier ;
//   V3  chaque ligne d'un tableau de la vue a autant de colonnes que son en-tête (une barre verticale
//       dans une cellule s'écrit `\|`, sinon elle ouvre une colonne de plus).
// Remède de chaque refus : dit dans son message, et rejoué par la recette (TF-1013).
//
// Usage : node verifier-accord-registre.mjs [--json <registre.json>] [--vue <registre.md>]
// Contrat JSON commun {oracle, domaine, artefact, verdict, findings[], non_juge[]} · exit 0/1/2
// (2 = SKIP : l'un des deux fichiers est introuvable ou illisible — jamais un PASS par défaut).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrivainDeContrat } from './lib/contrat.mjs';
const contratJSON = ecrivainDeContrat({ dernier: true });

const ICI = path.dirname(fileURLToPath(import.meta.url));
const REFS = path.join(ICI, '..', 'references');
const args = process.argv.slice(2);
const opt = (nom, defaut) => (args.includes(nom) ? path.resolve(args[args.indexOf(nom) + 1]) : defaut);
const jsonPath = opt('--json', path.join(REFS, 'registre-oracles.json'));
const vuePath = opt('--vue', path.join(REFS, 'registre-oracles.md'));

const DOM = 'Accord des deux vues du registre des oracles (JSON machine, Markdown humain)';
const NJ = [
  "le CONTENU des descriptions : la vue humaine est libre, seuls la version, la présence du script et la forme des tableaux sont comparées",
  "le NOM du domaine : la vue humaine reformule souvent le domaine du JSON, il n'est pas comparé mot pour mot",
  "les entrées du JSON sans script (type manuel ou kit) : rien à retrouver par un nom de fichier",
];
const out = (verdict, findings, nj, code) => {
  process.stdout.write(contratJSON({ oracle: 'verifier-accord-registre', domaine: DOM, artefact: path.basename(vuePath), verdict, findings, non_juge: nj }) + '\n');
  process.exit(code);
};

let reg, vue;
try { reg = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { out('SKIP', [], [...NJ, 'registre JSON introuvable ou illisible : ' + jsonPath + ' (' + e.message + ')'], 2); }
try { vue = fs.readFileSync(vuePath, 'utf8').replace(/\r\n/g, '\n'); } catch (e) { out('SKIP', [], [...NJ, 'vue humaine introuvable ou illisible : ' + vuePath + ' (' + e.message + ')'], 2); }

const findings = [];
const ko = (regle, msg, where) => findings.push({ sev: 'bloquant', regle, msg, where });

// V1 — la version.
const mv = vue.match(/Vue humaine\*\*\s*\(v(\d+\.\d+\.\d+)/);
if (!mv) ko('V1', "l'en-tête de la vue humaine n'annonce aucune version (« Vue humaine (vX.Y.Z, … ») : un lecteur n'a rien à comparer au JSON", path.basename(vuePath) + ':3');
else if (mv[1] !== String(reg.version)) ko('V1', `la vue humaine annonce la version ${mv[1]} et le JSON ${reg.version} : aligner l'en-tête de la vue sur le JSON (ou régénérer le JSON), puis rejouer`, path.basename(vuePath) + ':3');

// V2 — chaque script du JSON est nommé dans la vue.
let nScripts = 0;
for (const o of reg.oracles || []) {
  const script = (o.cmd || []).map(String).find((c) => /[\w.-]+\.(?:mjs|js|py)$/.test(c) && !/^\{(?:file|profil)\}$/.test(c));
  if (!script) continue;
  nScripts++;
  const nom = script.split(/[\\/]/).pop();
  if (!vue.includes(nom)) ko('V2', `le script « ${nom} » de l'entrée « ${o.domaine} » du JSON n'est nommé nulle part dans la vue humaine : ajouter sa ligne au tableau (domaine, invocation, type, statut)`, path.basename(jsonPath));
}

// V3 — la forme des tableaux de la vue.
const cellules = (ligne) => {
  const s = ligne.trim().replace(/^\|/, '').replace(/\|$/, '');
  const r = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (s[i] === '|') { r.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  r.push(cur);
  return r;
};
let entete = null, nTableaux = 0, nLignes = 0;
vue.split('\n').forEach((l, i) => {
  if (!/^\s*\|.*\|\s*$/.test(l)) { entete = null; return; }
  if (entete === null) { entete = cellules(l).length; nTableaux++; return; }
  nLignes++;
  const n = cellules(l).length;
  if (n !== entete) ko('V3', `ligne de tableau à ${n} colonnes sous un en-tête de ${entete} : une barre verticale non échappée dans une cellule ouvre une colonne de plus : l'écrire « \\| » dans la cellule. Ligne : ${l.slice(0, 60).replace(/\|/g, '¦')}…`, path.basename(vuePath) + ':' + (i + 1));
});

const bilan = `${nScripts} script(s) du JSON retrouvé(s) dans la vue, ${nTableaux} tableau(x) et ${nLignes} ligne(s) de données contrôlés, version ${reg.version}`;
if (findings.length) out('FAIL', findings, NJ, 1);
out('PASS', [{ sev: 'info', msg: bilan, where: path.basename(vuePath) }], NJ, 0);
