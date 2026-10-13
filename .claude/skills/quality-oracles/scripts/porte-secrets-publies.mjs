#!/usr/bin/env node
// porte-secrets-publies — refuse un envoi qui AJOUTE un porteur de secrets suivi par git (règle SP2
// d'`oracle-secrets-hors-perimetre`, R-14, appliquée aux seuls fichiers que l'envoi ajoute).
//
// LE FAIT (TF-1221, constat du 14/09/2026). Des fichiers porteurs de secrets ont été trouvés PUBLIÉS
// sur les dépôts distants de deux produits : un fichier de configuration d'intégration continue sur
// la branche principale et trois branches distantes de l'un, un fichier de configuration npm sur la
// branche principale de l'autre. La règle R-14 et son oracle existaient ; l'oracle ne se jouait que
// dans les campagnes du pilot, jamais au moment où le produit pousse. Le pre-push posé par
// `installer-hamecon-publication.mjs` appelle désormais cette porte avant la porte des noms.
//
// POURQUOI UNE COPIE DE LA SEULE RÈGLE SP2, ET PAS L'APPEL DE L'ORACLE DU PILOT. Trois raisons
// mesurées sur l'oracle du pilot (`digit-ai-factory/oracles/oracle-secrets-hors-perimetre.mjs`) :
//   · il juge le DISQUE d'un parc (porteurs trouvés par leur nom sous une racine, profondeur 3), pas
//     le contenu d'un envoi : un `.env` commité puis retiré de l'arbre dans le même envoi part dans
//     l'histoire et lui échappe ;
//   · son code de sortie ne vaut 1 que pour un constat dans le pilot ou une forge (`AUTONOME`) : chez
//     un produit, il sort en 0 sur un `.env` publié. Le hameçon qui le croirait fabriquerait un vert ;
//   · un produit cloné sur un poste sans le pilot refuserait chaque envoi pour « oracle introuvable ».
// La famille « porteur de secrets » est une liste FERMÉE de huit motifs de noms : elle se recopie
// ici telle quelle, et sa PARITÉ avec celle du pilot est jugée par le cas 17 de
// `self-test-hamecon-publication.mjs`, qui importe les deux quand le pilot est sur la machine.
//
// SP2 SUR UN ENVOI. « Un porteur dans un dépôt qui ne l'ignore pas » : un fichier présent dans un
// enregistrement est suivi par git, et git ne tient jamais pour ignoré un fichier suivi. Sur un envoi,
// la règle revient donc à : un porteur figure parmi les fichiers AJOUTÉS par une révision envoyée.
// Le `.gitignore` n'est consulté que pour dire le bon geste : couvert, le fichier a été ajouté de
// force (`git add -f`) ; non couvert, il manque une ligne au `.gitignore`.
//
// AUCUNE LECTURE DE CONTENU, JAMAIS : tout se décide sur des NOMS de fichiers, comme dans l'oracle du
// pilot. Une porte qui ouvrirait ces fichiers deviendrait elle-même un chemin de fuite.
//
// Usage : node porte-secrets-publies.mjs <dépôt> [--revs=<empreinte>,^<empreinte>,--not,--remotes=<distant>]
//   sans --revs : juge `HEAD --not --remotes`, ce qu'un envoi publierait de plus que les distants connus.
// Sortie : JSON {oracle, regle, verdict, findings[], non_juge[], motif?} · exit 0 PASS · 1 FAIL · 2 SKIP.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Copie de la famille d'`oracle-secrets-hors-perimetre.mjs` (pilot), mot pour mot : `.env.example`
 *  et les gabarits sont EXCLUS nommément, ce sont des fichiers versionnés exprès. */
export const PORTEUR_DE_SECRETS = (nom) => {
  if (/^\.env\.(example|exemple|sample|template|dist)$/i.test(nom)) return false;
  if (/\.(example|exemple|sample|template)$/i.test(nom)) return false;
  return /^\.env$/i.test(nom)
    || /^\.env\./i.test(nom)
    || /\.(pem|key|p12|pfx|jks)$/i.test(nom)
    || /^credentials/i.test(nom)
    || /^secrets?[.\-_]/i.test(nom)
    || /^secrets?$/i.test(nom)
    || /^\.npmrc$/i.test(nom)
    || /^\.databrickscfg$/i.test(nom);
};

export const NON_JUGE = [
  "le CONTENU des fichiers : jamais ouvert. La porte juge un nom, pas une valeur",
  "la famille est une liste FERMÉE de noms, copiée de l'oracle du pilot : un porteur nommé autrement (`ma-cle.txt`) n'est pas vu",
  "seuls les fichiers AJOUTÉS par une révision envoyée sont jugés (ajout ou renommage vers un nom porteur) : un porteur déjà publié avant cet envoi relève d'un run d'`oracle-secrets-hors-perimetre`, pas de ce hameçon",
  "une révision de FUSION n'est pas comparée à ses parents : un porteur introduit par la seule résolution d'une fusion n'est pas vu, celui qu'apporte une branche fusionnée l'est par ses propres révisions",
];

const ORACLE = 'porte-secrets-publies';
const REGLE = 'SP2 (R-14), appliquée aux fichiers que l’envoi ajoute (TF-1221)';

function sortir(verdict, findings, motif) {
  const o = { oracle: ORACLE, regle: REGLE, verdict, findings, non_juge: motif ? [motif, ...NON_JUGE] : NON_JUGE };
  if (motif) o.motif = motif;
  process.stdout.write(JSON.stringify(o));
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2);
}

const git = (depot, ...a) => spawnSync('git', ['-C', depot, '-c', 'core.quotepath=false', ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const lanceEnDirect = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase().replaceAll('\\', '/')
     === path.resolve(process.argv[1]).toLowerCase().replaceAll('\\', '/');

if (lanceEnDirect) {
  const args = process.argv.slice(2);
  const depot = args.find((a) => !a.startsWith('--'));
  if (!depot || git(depot, 'rev-parse', '--git-dir').status !== 0) sortir('SKIP', [], 'dépôt introuvable ou illisible : « ' + String(depot) + ' »');

  // Même validation que la porte des noms (TF-1555) : des jetons de révision, jamais une option git.
  const optRevs = args.find((a) => a.startsWith('--revs='));
  let revs = ['HEAD', '--not', '--remotes'];
  if (optRevs !== undefined) {
    revs = optRevs.slice('--revs='.length).split(',').map((x) => x.trim()).filter(Boolean);
    const fautif = revs.find((j) => !(/^\^?(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(j) || j === '--not'
      || /^--remotes=[A-Za-z0-9._/-]+$/.test(j)));
    if (fautif !== undefined) sortir('SKIP', [], '--revs : jeton refusé « ' + fautif.slice(0, 80) + ' » — attendu : des empreintes complètes, `^<empreinte>`, `--not`, `--remotes=<distant>`');
    // Aucune empreinte positive (envoi qui ne fait que supprimer une branche) : rien n'est ajouté. Sans
    // cette garde, `git log` sans révision lirait HEAD et jugerait toute l'histoire.
    const negatif = (i) => revs[i].startsWith('^') || revs.slice(0, i).includes('--not');
    if (!revs.some((j, i) => /^[0-9a-f]/.test(j) && !negatif(i))) sortir('PASS', []);
  } else if (git(depot, 'rev-parse', '--verify', '-q', 'HEAD').status !== 0) {
    sortir('PASS', []);                                   // dépôt sans aucun enregistrement : rien à envoyer
  }

  // Les fichiers AJOUTÉS par chaque révision envoyée. `--no-renames` : un renommage vers `.env` se lit
  // comme l'ajout qu'il est. Une plage que git ne lit pas fait SKIP : lue vide, elle rendrait PASS.
  const log = git(depot, 'log', '--no-renames', '--diff-filter=A', '--name-only', '--format=@@%H', ...revs, '--');
  if (log.status !== 0) sortir('SKIP', [], 'git ne lit pas cette plage (' + String(log.stderr || '').trim().slice(0, 200) + ') — une histoire lue vide par erreur rendrait PASS sans rien juger');

  const trouves = new Map();                              // chemin → première révision qui l'ajoute
  let sha = '';
  for (const ligne of String(log.stdout).split('\n')) {
    const l = ligne.trim();
    if (!l) continue;
    if (l.startsWith('@@')) { sha = l.slice(2); continue; }
    if (PORTEUR_DE_SECRETS(path.posix.basename(l))) trouves.set(l, sha);
  }

  const findings = [...trouves].map(([chemin, rev]) => {
    const couvert = git(depot, 'check-ignore', '-q', '--no-index', '--', chemin).status === 0;
    return {
      regle: 'SP2', sev: 'bloquant', where: chemin + ' (' + rev.slice(0, 7) + ')',
      msg: 'porteur de secrets AJOUTÉ par cet envoi et suivi par git — '
        + (couvert ? 'le .gitignore le couvre : il a été ajouté de force (git add -f). '
          : 'aucune ligne du .gitignore ne le couvre. ')
        + 'Rien n’est encore publié : le retirer des enregistrements en avance (git rm --cached -- ' + chemin
        + (couvert ? '' : ', son nom ajouté au .gitignore') + ', puis réécrire les seuls enregistrements non publiés, '
        + 'git commit --amend s’il est dans le dernier). Contenu du fichier jamais lu par cette porte.',
    };
  });
  sortir(findings.length ? 'FAIL' : 'PASS', findings);
}
