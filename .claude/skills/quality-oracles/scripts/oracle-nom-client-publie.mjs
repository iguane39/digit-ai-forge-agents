#!/usr/bin/env node
// oracle-nom-client-publie — Domaine « Nom de client dans un depot publiable ».
//
// POURQUOI CET ORACLE EXISTE, et le fait est daté. Le 27/08/2026, un balayage a trouvé le nom
// d'un client, celui de son enseigne et deux identifiants d'espace de travail dans 115 fichiers
// et 648 occurrences de NEUF dépôts publics — plus quatre livrables clients entiers (1,79 Mo),
// une adresse professionnelle nominative et trois noms d'hôtes internes. Le nettoyage a demandé
// une réécriture d'historique et neuf envois forcés. RIEN n'aurait empêché la même fuite de se
// reconstituer au versement suivant : c'est ce trou-là que cet oracle bouche.
//
// CE QU'IL JUGE — un DÉPÔT, pas un fichier, et sur QUATRE angles, parce que le nettoyage du
// 27/08 a montré que trois d'entre eux se ratent l'un l'autre :
//   C1 contenus des fichiers SUIVIS de l'arbre courant ;
//   C2 NOMS des fichiers suivis de l'arbre courant ;
//   C3 MESSAGES de commit de tout l'historique — l'angle qui avait été oublié le 27/08, et qui
//      a fait découvrir un neuvième dépôt porteur APRÈS que huit aient été déclarés propres ;
//   C4 CONTENUS et NOMS de fichiers dans tout l'historique — retirer un fichier de l'arbre ne le
//      retire pas des commits, et l'hébergeur sert encore ce qu'un commit ancien contient.
//
// LE RÉFÉRENTIEL DES NOMS EST UNE DONNÉE, ET IL VIT HORS DES DÉPÔTS PUBLIÉS (loi transverse n° 4).
// Un contrôle qui embarquerait la liste des noms interdits PUBLIERAIT EXACTEMENT CE QU'IL PROTÈGE :
// il suffirait de lire l'oracle pour connaître les clients. Le référentiel est donc résolu à
// l'exécution, et son ABSENCE rend SKIP — jamais PASS. Un oracle sans son référentiel ne mesure
// rien : le déclarer vert serait produire de la confiance au lieu du doute.
//
// Standard §3 : déterministe, checklist canonique, artefact réel, non_juge déclaré,
// sortie localisante, autoportant, prouvé par fixtures rouge/verte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DOM = 'Nom de client dans un depot publiable';
const args = process.argv.slice(2);
const cible = args.find((a) => !a.startsWith('--'));
const optRef = (args.find((a) => a.startsWith('--referentiel=')) || '').split('=')[1];

const out = (verdict, findings, nj, code, artefact) => {
  process.stdout.write(JSON.stringify({
    oracle: 'oracle-nom-client-publie', domaine: DOM, artefact: artefact ?? cible ?? null,
    verdict, findings, non_juge: nj,
  }));
  process.exit(code);
};

const NON_JUGE = [
  "ne voit que le TEXTE : un nom vivant dans une image, une archive, un document compressé ou un binaire n'est pas détecté — c'est la limite du 27/08, où quatre livrables HTML ont été trouvés parce qu'ils étaient du texte, et où rien ne dit qu'un PDF ne portait pas la même chose",
  "ne connaît QUE les noms du référentiel : un client qui n'y figure pas est invisible, et le canal d'alimentation du référentiel est humain, pas devinable. Un PASS dit « aucun nom CONNU », jamais « aucun nom »",
  "ne dit PAS si le dépôt est réellement public : la visibilité s'interroge chez l'hébergeur, cet oracle travaille hors ligne. Il juge un dépôt PUBLIABLE, et c'est à l'appelant de ne le brancher que sur ce qui se publie",
  "ne juge PAS les fichiers non suivis ni ignorés : ils ne partent pas à la publication. Un nom dans un fichier ignoré reste donc sur le disque sans être signalé ici",
  "ne voit PAS les copies déjà faites : duplications publiques, miroirs et caches d'un moteur de recherche conservent l'ancien contenu, et aucune commande locale ne les atteint",
];

// ---------------------------------------------------------------------------
// Le référentiel : résolution ordonnée, du plus explicite au plus implicite.
// L'ordre n'est pas cosmétique — la marche 3 sert les FIXTURES (un référentiel de jeu d'essai,
// aux noms inventés, posé à côté d'elles) et la marche 4 sert le parc réel (un référentiel de
// vrais noms, à la racine, hors de tout dépôt). Sans elle, prouver l'oracle exigerait de publier
// un vrai nom de client dans le dépôt qui porte l'oracle.
// ---------------------------------------------------------------------------
function resoudreReferentiel(artefact) {
  const pistes = [];
  if (optRef) pistes.push(optRef);
  if (process.env.FORGE_NOMS_INTERDITS) pistes.push(process.env.FORGE_NOMS_INTERDITS);
  const base = fs.existsSync(artefact) && fs.statSync(artefact).isDirectory() ? artefact : path.dirname(artefact);
  pistes.push(path.join(base, '_noms-interdits.json'));
  pistes.push(path.join(base, '..', '_noms-interdits.json'));
  if (process.env.FORGE_ROOT) pistes.push(path.join(process.env.FORGE_ROOT, '_noms-interdits.json'));
  for (const p of pistes) if (p && fs.existsSync(p)) return { chemin: p, pistes };
  return { chemin: null, pistes };
}

// ---------------------------------------------------------------------------
// L'artefact : un RÉPERTOIRE (dépôt git) ou un BUNDLE (.bundle), cloné en zone temporaire.
// Le bundle n'est pas une coquetterie : c'est le seul format qui tienne dans UN fichier
// commitable tout en portant contenus, noms de fichiers ET messages de commit — donc le seul
// qui permette à une fixture de prouver les quatre contrôles, C3 et C4 compris.
// ---------------------------------------------------------------------------
const git = (repo, ...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

function ouvrir(artefact) {
  if (!fs.existsSync(artefact)) return { erreur: 'artefact introuvable' };
  if (fs.statSync(artefact).isDirectory()) {
    if (!fs.existsSync(path.join(artefact, '.git'))) return { erreur: 'répertoire sans .git — ce n\'est pas un dépôt' };
    return { repo: artefact, temporaire: null };
  }
  if (path.extname(artefact).toLowerCase() !== '.bundle') return { erreur: 'extension non gérée — attendu : un répertoire de dépôt, ou un fichier .bundle' };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-ncp-'));
  const r = spawnSync('git', ['clone', '--quiet', artefact, path.join(tmp, 'depot')], { encoding: 'utf8' });
  if (r.status !== 0) return { erreur: 'bundle illisible par git clone : ' + String(r.stderr || '').trim().slice(0, 200) };
  return { repo: path.join(tmp, 'depot'), temporaire: tmp };
}

// Un terme se cherche INSENSIBLE à la casse quand c'est un NOM (« Zorglub », « zorglub »,
// « ZORGLUB » désignent la même entreprise) et SENSIBLE quand c'est un IDENTIFIANT technique (un identifiant
// d'espace de travail est une chaîne, pas un mot). Mélanger les deux dans une seule expression
// est le piège payé en écrivant `oracle-synthese` : le motif technique s'était mis à matcher un
// mot français ordinaire, et la règle rendait vert sans rien juger.
// TROIS GENRES, ET LE TROISIÈME EST NÉ D'UNE MESURE, pas d'une intuition (27/08, second tour).
// Verser un SIGLE court au référentiel comme un nom ordinaire produit des faux positifs immédiats :
// mesuré sur le parc, le sigle « Fournisseur-A » attrapait `candidatsFreres` (4 occurrences) et `resFront`
// (3), et le nom « Auchan » n'attrapait RIEN D'AUTRE que le mot `chevauchant` — zéro vrai positif,
// un faux à 100 %. Un contrôle qui crie sur de la prose ordinaire se fait désactiver dans la
// semaine, et il aura eu raison une fois pour dix fois où il aura menti.
//   · nom          — insensible à la casse, sous-chaîne. Pour un nom propre assez long pour être
//                    discriminant (« Zorglub », « Chronopode ») ;
//   · identifiant  — SENSIBLE à la casse, sous-chaîne. Une chaîne technique n'est pas un mot ;
//   · sigle        — insensible à la casse, MOT ENTIER. Pour un token court (2 à 5 lettres) qui
//                    vit à l'intérieur de mots ordinaires.
// La frontière de mot est explicite plutôt que confiée à `` : les noms du parc portent tirets,
// points et accents, et `` place une frontière au milieu de « Client-A ».
function termes(ref) {
  const t = [];
  for (const n of ref.noms || []) t.push({ mot: n, casse: false, genre: 'nom', motEntier: false });
  for (const i of ref.identifiants || []) t.push({ mot: i, casse: true, genre: 'identifiant', motEntier: false });
  for (const g of ref.sigles || []) t.push({ mot: g, casse: false, genre: 'sigle', motEntier: true });
  return t;
}

// Ce qui NE sépare PAS deux mots : lettres, chiffres, et les liants internes d'un nom composé.
const LIANT = /[\p{L}\p{N}_]/u;

function chercheTexte(hay, terme) {
  const h = terme.casse ? hay : hay.toLowerCase();
  const m = terme.casse ? terme.mot : terme.mot.toLowerCase();
  if (!terme.motEntier) return h.includes(m);
  let i = h.indexOf(m);
  while (i !== -1) {
    const avant = i === 0 ? '' : h[i - 1];
    const apres = i + m.length >= h.length ? '' : h[i + m.length];
    if (!LIANT.test(avant || ' ') && !LIANT.test(apres || ' ')) return true;
    i = h.indexOf(m, i + 1);
  }
  return false;
}

function lots(tab, n) {
  const r = [];
  for (let i = 0; i < tab.length; i += n) r.push(tab.slice(i, i + n));
  return r;
}

// --- exécution --------------------------------------------------------------
if (!cible) out('SKIP', [], ['aucun artefact — usage : node oracle-nom-client-publie.mjs <depot|fixture.bundle> [--referentiel=<chemin>]'], 2);

const { chemin: refPath, pistes } = resoudreReferentiel(cible);
if (!refPath) {
  out('SKIP', [], [
    'RÉFÉRENTIEL DES NOMS INTERDITS ABSENT — cet oracle ne peut rien mesurer, et il refuse de rendre PASS pour autant : un contrôle sans son référentiel produit de la confiance, pas du doute.',
    'REMÈDE : créer un fichier `_noms-interdits.json` HORS de tout dépôt publié — `{ "noms": ["…"], "identifiants": ["…"] }` — puis le désigner par `--referentiel=<chemin>` ou la variable d\'environnement FORGE_NOMS_INTERDITS.',
    'Pistes explorées, dans l\'ordre : ' + pistes.join(' · '),
  ], 2);
}

let ref;
try { ref = JSON.parse(fs.readFileSync(refPath, 'utf8')); }
catch (e) { out('SKIP', [], ['référentiel illisible (' + refPath + ') : ' + e.message], 2); }
const T = termes(ref);
if (!T.length) out('SKIP', [], ['référentiel vide (' + refPath + ') : ni `noms`, ni `identifiants`, ni `sigles` — rien à chercher'], 2);

const { repo, temporaire, erreur } = ouvrir(cible);
if (erreur) out('SKIP', [], [erreur], 2);

const findings = [];
const nettoyer = () => { if (temporaire) try { fs.rmSync(temporaire, { recursive: true, force: true }); } catch { /* zone temporaire : un reste ne fausse rien */ } };

try {
  // --- C1 · contenus des fichiers SUIVIS de l'arbre courant -----------------
  const suivis = (git(repo, 'ls-files', '-z').stdout || '').split('\0').filter(Boolean);
  for (const rel of suivis) {
    const abs = path.join(repo, rel);
    let txt;
    try { txt = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (txt.includes('\0')) continue;                 // binaire : hors de portée, déclaré en non_juge
    const lignes = txt.split('\n');
    for (const t of T) {
      lignes.forEach((l, i) => {
        if (chercheTexte(l, t)) findings.push({
          sev: 'bloquant', regle: 'C1',
          msg: `${t.genre} interdit « ${t.mot} » dans le contenu d'un fichier suivi`,
          where: `${rel}:${i + 1}`,
        });
      });
    }
  }

  // --- C2 · NOMS des fichiers suivis de l'arbre courant ---------------------
  for (const rel of suivis) for (const t of T) {
    if (chercheTexte(rel, t)) findings.push({
      sev: 'bloquant', regle: 'C2',
      msg: `${t.genre} interdit « ${t.mot} » dans le NOM d'un fichier suivi`,
      where: rel,
    });
  }

  // --- C3 · MESSAGES de commit de tout l'historique -------------------------
  // L'angle oublié du 27/08 : huit dépôts déclarés propres, un neuvième trouvé ensuite par ce
  // seul contrôle. Un message de commit est publié aussi sûrement qu'un fichier.
  const sep = '<<<COMMIT>>>';
  const journal = (git(repo, 'log', '--all', `--format=${sep}%H%n%B`).stdout || '').split(sep).filter((x) => x.trim());
  for (const bloc of journal) {
    const nl = bloc.indexOf('\n');
    const sha = bloc.slice(0, nl < 0 ? bloc.length : nl).trim();
    const corps = nl < 0 ? '' : bloc.slice(nl + 1);
    for (const t of T) if (chercheTexte(corps, t)) findings.push({
      sev: 'bloquant', regle: 'C3',
      msg: `${t.genre} interdit « ${t.mot} » dans un MESSAGE de commit`,
      where: sha.slice(0, 12),
    });
  }

  // --- C4 · contenus ET noms de fichiers dans TOUT l'historique -------------
  // Retirer un fichier de l'arbre ne le retire pas des commits, et l'hébergeur continue de
  // servir par empreinte ce qu'un commit ancien contient.
  const revs = (git(repo, 'rev-list', '--all').stdout || '').split('\n').filter(Boolean);
  const cheminsHisto = new Set((git(repo, 'log', '--all', '--name-only', '--format=').stdout || '')
    .split('\n').map((x) => x.trim()).filter(Boolean));
  for (const rel of cheminsHisto) if (!suivis.includes(rel)) for (const t of T) {
    if (chercheTexte(rel, t)) findings.push({
      sev: 'bloquant', regle: 'C4',
      msg: `${t.genre} interdit « ${t.mot} » dans le NOM d'un fichier ayant existé dans l'historique`,
      where: rel + ' (historique)',
    });
  }
  // Les révisions se passent par LOTS : une ligne de commande portant des milliers d'empreintes
  // se fait tronquer en silence sur ce poste, et un contrôle tronqué rend vert par accident.
  for (const t of T) {
    // `-w` N'EST PAS COSMÉTIQUE ICI, et son oubli était un DÉFAUT DE COHÉRENCE entre angles :
    // C1, C2 et C3 appliquaient la règle du mot entier, C4 la déléguait à `git grep` qui l'ignorait.
    // Le même sigle était donc interdit dans l'arbre et toléré dans l'historique — ou l'inverse,
    // selon l'angle. Trouvé par la fixture verte, qui criait sur un témoin de faux positif.
    // La frontière de mot est confiée à git plutôt que réimplémentée (règle R3 : l'outil qui fait
    // foi, jamais une copie maison).
    const argsGrep = ['grep', '-l', '-F'];
    if (!t.casse) argsGrep.push('-i');
    if (t.motEntier) argsGrep.push('-w');
    argsGrep.push('-e', t.mot);
    for (const lot of lots(revs, 150)) {
      const r = git(repo, ...argsGrep, ...lot);
      for (const ligne of (r.stdout || '').split('\n').filter(Boolean)) {
        const [rev, ...reste] = ligne.split(':');
        const rel = reste.join(':');
        if (suivis.includes(rel) && findings.some((f) => f.regle === 'C1' && f.where.startsWith(rel + ':'))) continue;
        findings.push({
          sev: 'bloquant', regle: 'C4',
          msg: `${t.genre} interdit « ${t.mot} » dans le CONTENU d'un fichier de l'historique`,
          where: `${rev.slice(0, 12)}:${rel}`,
        });
      }
    }
  }
} finally { nettoyer(); }

const nj = NON_JUGE.concat(['référentiel employé : ' + refPath + ' (' + T.length + ' terme(s))']);
if (findings.length) {
  // Une sortie qui déroulerait 648 occurrences ne se lit pas : on borne, ET ON DIT qu'on borne —
  // un plafond silencieux se lit comme « tout est là », ce qui est le contraire d'un contrôle.
  const total = findings.length;
  const montres = findings.slice(0, 200);
  if (total > montres.length) nj.push(`${total} constat(s) au total, ${montres.length} listés ici — sortie bornée, le reste existe`);
  out('FAIL', montres, nj, 1, cible);
}
out('PASS', [{ sev: 'info', regle: 'C1-C4', msg: `aucun des ${T.length} terme(s) du référentiel dans les contenus, les noms de fichiers ni les messages de commit`, where: path.basename(cible) }], nj, 0, cible);

// NOTE, ET ELLE EST LA MEILLEURE PREUVE QUE CET ORACLE JUGE : sa PREMIÈRE exécution sur le dépôt
// qui le porte a rendu FAIL — sur CE fichier, ligne 94, où un commentaire illustrait la règle de
// casse avec un VRAI nom de client. L'auteur du contrôle avait réintroduit la fuite dans le
// contrôle lui-même, en une phrase, sans y penser. Les exemples de ce fichier sont donc tous
// inventés, et c'est une règle, pas une préférence.
