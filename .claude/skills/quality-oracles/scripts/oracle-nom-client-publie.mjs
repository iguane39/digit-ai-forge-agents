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
//      retire pas des commits, et l'hébergeur sert encore ce qu'un commit ancien contient ;
//   C5 NOMS DE PRODUITS de la table des pseudonymes, dans les contenus, les noms de fichiers et les
//      messages de commit — l'angle ouvert le 05/09 par une réécriture d'historique qui a trouvé
//      des noms de produits là où C1-C4 rendaient PASS (TF-0820). C1-C4 ne lisent que le
//      référentiel des CLIENTS ; la règle du parc dit « aucun nom de client NI DE PRODUIT ».
//
// ET DEPUIS QUAND — LA BORNE DE DATE (TF-0982, 08/09/2026). Les deux tables portent un bloc
// `depuis` qui dit à quelle date chaque terme a été INSCRIT. Une occurrence de l'HISTOIRE
// antérieure à cette date est une ANTÉRIORITÉ : déclarée, comptée, NON bloquante. L'ARBRE COURANT
// et les MESSAGES DE COMMIT restent jugés SANS borne. Motif mesuré : sans borne, chaque ligne
// ajoutée à une table rendait tout le passé fautif RÉTROACTIVEMENT — trois réécritures
// d'historique en douze jours. Détail et arbitrages : le bloc TF-0982 plus bas.
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
import { fileURLToPath } from 'node:url';

const DOM = 'Nom de client dans un depot publiable';
const args = process.argv.slice(2);
const cible = args.find((a) => !a.startsWith('--'));
const optRef = (args.find((a) => a.startsWith('--referentiel=')) || '').split('=')[1];
const optProduits = (args.find((a) => a.startsWith('--produits=')) || '').split('=')[1];

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
// LE CANAL CONFIDENTIEL — où les DEUX tables vivent depuis le 07/09/2026 (TF-0887).
//
// LE FAIT, ET IL EST DATÉ. Le 07/09, les deux tables ont quitté les fichiers libres
// `<racine>\_noms-interdits.json` et `<racine>\_produits-pseudonymes.json` pour un dépôt privé
// cloné en `<racine>\_confidentiel\`, dans `tables\`. Les pistes par défaut de cette porte ne
// connaissaient que les anciens emplacements : appelée SANS `--referentiel` ni `--produits` —
// c'est-à-dire exactement comme le `pre-push` l'appelle — elle rendait SKIP, et le hameçon traite
// un SKIP en refus. Tout dépôt portant le hameçon refusait donc CHAQUE push, jusqu'à ce que
// quelqu'un pose deux variables d'environnement à la main. Une porte muette PAR DÉFAUT finit
// contournée avec l'option qui saute les hooks — ce qui est pire qu'une porte absente.
//
// LA RACINE DU PARC, DANS L'ORDRE, et l'ordre a une raison :
//   · FORGE_ROOT quand elle est posée — un parc qui DÉCLARE sa racine fait foi, et une racine
//     déclarée est aussi ce qui rend cette marche MESURABLE : un banc pointe FORGE_ROOT sur une
//     racine jetable et la porte cesse de pouvoir atteindre le canal réel du poste. Sans cela,
//     un cas qui veut prouver l'ABSENCE d'une table lirait la table du parc et mesurerait le
//     contraire de ce qu'il croit ;
//   · sinon les deux racines qu'on DEVINE : le parent du dépôt jugé, puis le parent de cette
//     forge. La seconde sert le cas où l'artefact ne vit pas dans le parc (un `.bundle` en zone
//     temporaire), où seule l'implantation de la forge dit encore où est la racine.
//
// LES ANCIENNES PISTES RESTENT, EN DERNIER RECOURS. Un poste qui n'a pas encore cloné le canal
// garde son fichier libre ; une porte qui cesserait brutalement de le voir referait, à l'envers,
// la panne qu'on est en train de réparer.
// ---------------------------------------------------------------------------
const ICI = path.dirname(fileURLToPath(import.meta.url));
// <forge>/.claude/skills/quality-oracles/scripts → <forge>
const RACINE_FORGE = path.resolve(ICI, '..', '..', '..', '..');

function racinesParc(base) {
  const r = process.env.FORGE_ROOT
    ? [process.env.FORGE_ROOT]
    : [path.resolve(base, '..'), path.resolve(RACINE_FORGE, '..')];
  return [...new Set(r.map((x) => path.resolve(x)))];
}
const pistesCanal = (base, fichier) => racinesParc(base).map((r) => path.join(r, '_confidentiel', 'tables', fichier));

// ---------------------------------------------------------------------------
// Le référentiel : résolution ordonnée, du plus explicite au plus implicite.
// L'ordre n'est pas cosmétique — la marche du CANAL sert le parc réel depuis le 07/09, les
// marches des fichiers libres servent les FIXTURES (un référentiel de jeu d'essai, aux noms
// inventés, posé à côté d'elles) et les postes qui n'ont pas encore cloné le canal. Sans ces
// dernières, prouver l'oracle exigerait de publier un vrai nom de client dans le dépôt qui
// porte l'oracle.
// ---------------------------------------------------------------------------
function resoudreReferentiel(artefact) {
  const pistes = [];
  if (optRef) pistes.push(optRef);
  if (process.env.FORGE_NOMS_INTERDITS) pistes.push(process.env.FORGE_NOMS_INTERDITS);
  const base = fs.existsSync(artefact) && fs.statSync(artefact).isDirectory() ? artefact : path.dirname(artefact);
  pistes.push(...pistesCanal(base, 'noms-interdits.json'));
  pistes.push(path.join(base, '_noms-interdits.json'));
  pistes.push(path.join(base, '..', '_noms-interdits.json'));
  if (process.env.FORGE_ROOT) pistes.push(path.join(process.env.FORGE_ROOT, '_noms-interdits.json'));
  for (const p of pistes) if (p && fs.existsSync(p)) return { chemin: p, pistes };
  return { chemin: null, pistes };
}

// ---------------------------------------------------------------------------
// C5 · LA TABLE DES PSEUDONYMES DE PRODUITS — la SECONDE donnée hors dépôt (TF-0820).
//
// LE FAIT, daté du 05/09/2026 : la passe de réécriture d'historique du pilot, dérivée des DEUX
// tables hors dépôt, a modifié deux fichiers de l'arbre courant d'une forge publique — un nom de
// produit réel, en commentaire et en docstring — alors que CET oracle rendait PASS sur la même
// branche. Mesuré en écrivant cette règle, sur un clone de cette forge : DEUX mentions dans l'arbre
// courant et TROIS dans des messages de commit, portant deux noms de produits distincts. C1-C4 ne
// lisent que le référentiel des CLIENTS. Ce qu'une porte ne juge pas passe par construction, et ce
// trou-là s'est découvert par le geste le plus cher du parc : une réécriture d'historique.
//
// LA TABLE NE SE COPIE JAMAIS DANS UN DÉPÔT, pour la raison exacte du référentiel des clients :
// elle EST la liste des produits. Elle se désigne par `--produits=<chemin>` ou par la variable
// FORGE_PRODUITS_PSEUDO, et son ABSENCE SE DÉCLARE — « C5 non jouée : table absente », au non_juge —
// plutôt que de rendre vert un angle qui n'a pas été regardé. Une table absente ne fait PAS SKIP de
// l'oracle entier : C1-C4 gardent leur valeur, et le lecteur sait exactement ce qui a été mesuré.
//
// LES VARIANTES SONT CELLES DE `todo/anonymiser-entrant.mjs`, ET C'EST UNE RÈGLE, pas une
// coïncidence : deux contrôles du même sujet qui ne s'accordent pas sur les graphies donnent le
// pire des deux mondes — le nettoyage se croit fini, et le refus tombe à la publication, là où il
// coûte le plus cher à comprendre (leçon payée le 01/09 sur la casse des sigles). Une clé de la
// table est donc cherchée (a) TELLE QUELLE, littéralement, sensible à la casse — comme la
// substitution de l'anonymiseur et comme la règle littérale de la réécriture ; (b) dans ses
// VARIANTES de graphie dès qu'elle porte au moins deux mots et huit lettres : ses mots séparés par
// rien, une espace, un tiret ou un souligné, en toute casse, bornés par des non-alphanumériques.
// Une clé qui porte un POINT est une graphie de domaine et se prend telle quelle — la dériver
// attraperait des liens légitimes. Une clé qui est un CHEMIN (`C:\…`) n'est pas un nom : ignorée,
// et le nombre d'ignorées est DIT.
// ---------------------------------------------------------------------------
function resoudreProduits(artefact) {
  const pistes = [];
  if (optProduits) pistes.push(optProduits);
  if (process.env.FORGE_PRODUITS_PSEUDO) pistes.push(process.env.FORGE_PRODUITS_PSEUDO);
  const base = fs.existsSync(artefact) && fs.statSync(artefact).isDirectory() ? artefact : path.dirname(artefact);
  pistes.push(...pistesCanal(base, 'produits-pseudonymes.json'));
  pistes.push(path.join(base, '_produits-pseudonymes.json'));
  pistes.push(path.join(base, '..', '_produits-pseudonymes.json'));
  if (process.env.FORGE_ROOT) pistes.push(path.join(process.env.FORGE_ROOT, '_produits-pseudonymes.json'));
  for (const p of pistes) if (p && fs.existsSync(p)) return { chemin: p, pistes };
  return { chemin: null, pistes };
}

/** Les variantes de graphie d'une clé, ou `null` quand il n'y a rien à dériver. Même règle, mot
 *  pour mot, que `variantes()` de `todo/anonymiser-entrant.mjs` (TF-0742) — SANS le drapeau `g`,
 *  qui rendrait `test()` dépendant de l'appel précédent : un contrôle qui répond oui une fois sur
 *  deux est pire qu'un contrôle absent. */
function variantesProduit(nom) {
  if (typeof nom !== 'string' || nom.includes('.')) return null;
  const mots = nom.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s\-_]+/).filter(Boolean);
  if (mots.length < 2 || mots.join('').length < 8) return null;
  const corps = mots.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-_]*');
  return new RegExp(`(?<![A-Za-z0-9])${corps}(?![A-Za-z0-9])`, 'i');
}

// Une clé de table qui est un CHEMIN de disque n'est pas un nom de produit — même écart que
// `scripts/generer-remplacements-historique.mjs` du pilot, qui les saute pour la même raison.
const CLE_CHEMIN = /^[A-Za-z]:[\\/]/;

/** La graphie LITTÉRALE d'une clé, BORNÉE aux deux bouts par un non-alphanumérique (TF-0880).
 *
 *  LE FAIT, ET IL EST DATÉ — 06/09/2026. Cette graphie se cherchait par `hay.includes(cle)`, sans
 *  aucune frontière, alors que les variantes en portaient une DEUX LIGNES PLUS HAUT dans ce même
 *  fichier. Mesuré sur la forge des outils avec les deux tables du canal : TROIS des HUIT constats
 *  C5 tombaient sur la même sous-chaîne d'un blob base64 de police woff2, où la clé vivait entre
 *  deux lettres. 37,5 % de bruit — et un lecteur qui voit trois constats faux décide que les cinq
 *  autres le sont aussi ; le vrai constat se perd dans celui qui ne l'est pas.
 *
 *  POURQUOI LE DÉFAUT NE SE VOYAIT PAS : une clé d'au moins deux mots et huit lettres dérive des
 *  variantes, donc gagnait une frontière PAR LA BANDE. Une clé COURTE d'un seul mot n'en a jamais
 *  eu — et la table venait d'en recevoir une de trois lettres. La règle ne protégeait donc que les
 *  clés qui n'en avaient pas besoin.
 *
 *  L'ARBITRAGE, tranché par le pilot le 07/09 : une clé purement alphanumérique SE BORNE ; une clé
 *  qui porte déjà un séparateur (point, tiret, espace) se cherche TELLE QUELLE — ses séparateurs
 *  restent littéraux, on ne la dérive pas en variantes — mais bornée aux deux bouts de la même
 *  façon. Les deux cas tiennent donc dans UNE seule expression : la clé échappée, encadrée des
 *  deux gardes. Le comportement des VARIANTES ne change pas, et le contrat `findings[]` non plus.
 *
 *  SENSIBLE À LA CASSE, comme l'était `includes` et comme l'est la substitution de
 *  `todo/anonymiser-entrant.mjs` : c'est la graphie littérale, pas une recherche de nom. Et SANS
 *  le drapeau `g`, pour la raison exacte des variantes — `test()` d'un motif global dépend de
 *  l'appel précédent, et un contrôle qui répond oui une fois sur deux est pire qu'un absent. */
function litteralProduit(nom) {
  const corps = String(nom).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9])${corps}(?![A-Za-z0-9])`);
}

/* TF-0825 (05/09, garde-fou n° 2) — LA FORME BORNÉE D'UN TERME COURT.
 *
 *  LE FAIT. Un nom de client est long et distinctif ; un nom de produit est souvent une
 *  abréviation de TROIS LETTRES, et trois majuscules sont un motif fréquent dans du code tiers.
 *  Mesure du 05/09 sur une forge : la même séquence de trois lettres rendait 3 occurrences sur
 *  les fichiers SUIVIS — la mesure exacte — et 212 sur l'arbre de travail, dont 209 dans
 *  `.venv/`, où ces trois lettres sont un acronyme d'informatique sans aucun rapport.
 *
 *  LE GARDE-FOU. Le référentiel peut porter, pour un terme court, la ou les FORMES BORNÉES
 *  attendues plutôt que la sous-chaîne nue — typiquement l'identifiant de lot « <nom>-FR » et
 *  sa variante « <nom>.FR ». La valeur de la clé devient alors un objet :
 *
 *      "KRP": { "pseudo": "Produit-97", "formes": ["KRP-FR", "KRP.FR"] }
 *
 *  Déclarées, ces formes REMPLACENT la clé nue : la porte ne cherche plus que celles-là, chacune
 *  bornée aux deux bouts comme la clé le serait. Sans `formes`, rien ne change — le comportement
 *  par défaut reste la clé bornée plus ses variantes de graphie.
 *
 *  POURQUOI C'EST UN GARDE-FOU ET NON UN ASSOUPLISSEMENT : sans lui, la seule façon de faire
 *  taire un terme court qui bruite est de le retirer de la table — c'est-à-dire d'éteindre
 *  l'angle. Avec lui, on RESSERRE ce qu'on cherche au lieu d'abandonner ce qu'on garde. Et
 *  c'est un choix DÉCLARÉ, terme par terme, lisible dans la table, jamais une heuristique. */
/* TF-0982 (08/09/2026) — LA BORNE DE DATE : DEPUIS QUAND UN TERME EST-IL INTERDIT.
 *
 * LE FAIT, ET IL EST MESURÉ. Le 08/09, cette porte rendait FAIL sur le dépôt du pilot avec 939
 * constats, TOUS de la règle C5, TOUS dans le CONTENU de l'historique — zéro dans l'arbre courant,
 * zéro en message de commit. Ces occurrences n'avaient pas bougé d'un octet : c'est la TABLE qui
 * venait de grandir de 64 à 65 clés. Chaque extension de table rendait donc le passé fautif
 * RÉTROACTIVEMENT, et c'est la cause directe de TROIS réécritures d'historique en douze jours.
 * Une porte qui condamne un passé qu'on ne peut plus corriger sans réécrire l'histoire ne protège
 * plus rien : elle fabrique le geste le plus cher du parc, à chaque ligne ajoutée à une table.
 *
 * LA BORNE. Les deux tables portent depuis le 08/09 un bloc `depuis` — `{ "<clé>": "AAAA-MM-JJ" }`,
 * la date à laquelle le terme a été INSCRIT. Une occurrence trouvée dans l'HISTOIRE, dans une
 * révision STRICTEMENT antérieure à cette date, est déclarée ANTÉRIORITÉ : nommée, comptée à part,
 * NON bloquante. Une occurrence postérieure — ou de la date même de l'inscription — reste
 * bloquante : ce jour-là, le terme était connu.
 *
 * CE QUE LA BORNE NE COUVRE PAS, ET C'EST LE POINT CENTRAL :
 *   · L'ARBRE COURANT (C1, C2, et les angles d'arbre de C5) est jugé SANS BORNE. Un fichier suivi
 *     se corrige par une ÉDITION : rien ne justifie de l'épargner, quelle que soit l'ancienneté du
 *     terme. C'est là que la porte garde toutes ses dents ;
 *   · les MESSAGES DE COMMIT (C3, et l'angle des messages de C5) sont jugés SANS BORNE AUSSI.
 *     Objection possible : un message ancien ne se corrige qu'en réécrivant. Réponse : le message
 *     du commit qu'on est en train de POUSSER en fait partie, et c'est le seul angle où la porte
 *     attrape encore ce qu'on ajoute — l'exempter reviendrait à ne plus juger les messages du tout ;
 *   · un terme ABSENT du bloc `depuis`, ou dont la date est malformée, est jugé SANS BORNE.
 *     L'absence de date ne vaut JAMAIS exemption : une table incomplète doit rendre la porte plus
 *     sévère, jamais plus douce. C'est la seule direction sûre quand la donnée manque.
 *
 * LA DATE D'UNE OCCURRENCE, et le choix est déclaré :
 *   · pour un CONTENU d'historique, la date d'AUTEUR (`%aI`) de la révision où le blob a mordu ;
 *   · pour un NOM de fichier d'historique, la date d'auteur de la DERNIÈRE révision où le chemin
 *     était PRÉSENT (`--diff-filter=ACMRT` : ajouts, modifications, renommages — jamais la
 *     suppression, qui « touche » le chemin sans que le fichier existe après elle).
 * La date d'AUTEUR plutôt que celle de validation, parce qu'une réécriture d'historique remet les
 * seconde à zéro : borner sur elle rendrait tout postérieur au lendemain de chaque réécriture,
 * c'est-à-dire exactement la boucle qu'on est en train de couper. Une date illisible ne donne
 * AUCUNE exemption — même direction sûre que l'absence de borne.
 *
 * LE PASSIF SE COMPTE, ET IL SE DIT. Les antériorités sont listées dans `findings[]` avec la
 * sévérité `anteriorite`, et leur nombre est déclaré au `non_juge`, terme par terme. Une dette
 * qu'on cesse de bloquer et qu'on cesse de compter est une dette qu'on a effacée sans la payer :
 * un passif qui grossit doit rester VISIBLE au verdict, sinon la borne devient une amnistie. */
const DATE_BORNE = /^\d{4}-\d{2}-\d{2}$/;

/** La date d'inscription d'une clé au bloc `depuis`, ou `null` — clé absente, bloc absent, ou date
 *  malformée. `null` signifie « jugé SANS borne », jamais « exempté ». */
function borneDe(depuis, cle) {
  const v = depuis && typeof depuis === 'object' ? depuis[cle] : undefined;
  return typeof v === 'string' && DATE_BORNE.test(v.trim()) ? v.trim() : null;
}

/** L'occurrence est-elle une ANTÉRIORITÉ ? Seulement si le terme porte une borne ET que la date de
 *  l'occurrence est connue ET STRICTEMENT antérieure. Les trois conditions sont nécessaires : sans
 *  borne, sans date, ou le jour même de l'inscription, l'occurrence reste bloquante. */
function estAnteriorite(borne, dateOcc) {
  return Boolean(borne && dateOcc && dateOcc < borne);
}

/** La sévérité d'un constat d'HISTOIRE — et de l'histoire SEULE : l'arbre courant et les messages
 *  de commit n'appellent jamais cette fonction. */
const sevHisto = (borne, dateOcc) => (estAnteriorite(borne, dateOcc) ? 'anteriorite' : 'bloquant');

/** Le suffixe qui NOMME l'antériorité dans le constat : sans lui, un lecteur voit une occurrence
 *  non bloquante sans savoir pourquoi elle ne bloque pas. */
const ditAnteriorite = (borne, dateOcc) => ` — ANTÉRIORITÉ : révision du ${dateOcc}, antérieure à `
  + `l'inscription du terme au référentiel le ${borne} — non bloquante, comptée au passif`;

function formesDeclarees(valeur) {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return null;
  const f = Array.isArray(valeur.formes) ? valeur.formes.filter(x => typeof x === 'string' && x.trim()) : [];
  return f.length ? f : null;
}

function termesProduits(table) {
  const termes = [];
  let ignorees = 0;
  const produits = (table || {}).produits || {};
  // La borne de date vit dans un bloc SÉPARÉ des entrées (TF-0982) : un lecteur qui ne connaît
  // pas `depuis` continue de lire `produits` sans rien voir changer.
  const depuis = (table || {}).depuis;
  for (const cle of Object.keys(produits)) {
    if (CLE_CHEMIN.test(cle)) { ignorees += 1; continue; }
    const formes = formesDeclarees(produits[cle]);
    if (formes) {
      // Les formes déclarées REMPLACENT la clé nue. Chacune est bornée comme la clé l'aurait
      // été : une forme qui vivrait au milieu d'un mot n'est pas une mention, c'est un blob.
      termes.push({ cle, formes, litt: null, re: null,
                    bornees: formes.map(litteralProduit), depuis: borneDe(depuis, cle) });
      continue;
    }
    termes.push({ cle, formes: null, litt: litteralProduit(cle), re: variantesProduit(cle),
                  depuis: borneDe(depuis, cle) });
  }
  return { termes, ignorees };
}

/** Une clé de produit dans un texte : dans sa graphie littérale BORNÉE, ou dans une de ses
 *  variantes de graphie. Seule la frontière a changé le 07/09 — la forme d'un constat, non. */
function porteProduit(hay, p) {
  if (p.bornees) return p.bornees.some(re => re.test(hay));
  return p.litt.test(hay) || (p.re ? p.re.test(hay) : false);
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
// mesuré sur le parc, un sigle de trois lettres pris en SOUS-CHAÎNE attrapait deux identifiants de
// code et rien d'autre, et un nom de marque trop court n'attrapait RIEN D'AUTRE qu'un mot français
// ordinaire qui le contient — zéro vrai positif, un faux à 100 %. Un contrôle qui crie sur de la
// prose ordinaire se fait désactiver dans la semaine, et il aura eu raison une fois pour dix fois
// où il aura menti.
// LES EXEMPLES SONT INVENTÉS, ET VÉRIFIABLES DANS CE DÉPÔT — aucun nom du parc ne s'écrit ici
// (loi transverse n° 4, D-37). Le sigle « ZRG » du jeu d'essai (`fixtures/_noms-interdits.json`)
// pris en sous-chaîne attraperait `azrgue`, `zrgien` et `transzrg` : les trois témoins de la
// fixture VERTE, qui doivent passer. Et un nom aussi court qu'« Erval » n'attraperait rien
// d'autre que le mot `intervalle`.
//   · nom          — insensible à la casse, sous-chaîne. Pour un nom propre assez long pour être
//                    discriminant (« Zorglub », « Chronopode ») ;
//   · identifiant  — SENSIBLE à la casse, sous-chaîne. Une chaîne technique n'est pas un mot ;
//   · sigle        — insensible à la casse, MOT ENTIER. Pour un token court (2 à 5 lettres) qui
//                    vit à l'intérieur de mots ordinaires.
// La frontière de mot est explicite plutôt que confiée à `\b` : les noms du parc portent tirets,
// points et accents, et `\b` place une frontière au milieu de « Client-A ».
function termes(ref) {
  const t = [];
  // La borne de date (TF-0982) vit dans un bloc `depuis` SÉPARÉ des trois listes : les lecteurs
  // qui ne la connaissent pas continuent de lire `noms`/`identifiants`/`sigles` à l'identique.
  const d = ref.depuis;
  for (const n of ref.noms || []) t.push({ mot: n, casse: false, genre: 'nom', motEntier: false, depuis: borneDe(d, n) });
  for (const i of ref.identifiants || []) t.push({ mot: i, casse: true, genre: 'identifiant', motEntier: false, depuis: borneDe(d, i) });
  for (const g of ref.sigles || []) t.push({ mot: g, casse: false, genre: 'sigle', motEntier: true, depuis: borneDe(d, g) });
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
if (!cible) out('SKIP', [], ['aucun artefact — usage : node oracle-nom-client-publie.mjs <depot|fixture.bundle> [--referentiel=<chemin>] [--produits=<chemin>]'], 2);

const { chemin: refPath, pistes } = resoudreReferentiel(cible);
if (!refPath) {
  out('SKIP', [], [
    'RÉFÉRENTIEL DES NOMS INTERDITS ABSENT — cet oracle ne peut rien mesurer, et il refuse de rendre PASS pour autant : un contrôle sans son référentiel produit de la confiance, pas du doute.',
    'REMÈDE : cloner le canal confidentiel du parc, dont la table vit en `<racine>\\_confidentiel\\tables\\noms-interdits.json` — cette piste est explorée par défaut, sans aucun argument. À défaut, créer un fichier `_noms-interdits.json` HORS de tout dépôt publié — `{ "noms": ["…"], "identifiants": ["…"] }` — puis le désigner par `--referentiel=<chemin>` ou la variable d\'environnement FORGE_NOMS_INTERDITS.',
    'Pistes explorées, dans l\'ordre : ' + pistes.join(' · '),
  ], 2);
}

let ref;
try { ref = JSON.parse(fs.readFileSync(refPath, 'utf8')); }
catch (e) { out('SKIP', [], ['référentiel illisible (' + refPath + ') : ' + e.message], 2); }
const T = termes(ref);
if (!T.length) out('SKIP', [], ['référentiel vide (' + refPath + ') : ni `noms`, ni `identifiants`, ni `sigles` — rien à chercher'], 2);

// C5 : la table des produits. SON ABSENCE NE FAIT PAS SKIP DE L'ORACLE ENTIER — elle éteint C5 et
// le DIT. Un oracle qui refuserait de mesurer C1-C4 faute de la seconde table rendrait la porte
// inutilisable là où elle vaut déjà quelque chose ; un oracle qui se tairait rendrait vert un angle
// qu'il n'a pas regardé. Entre les deux, il reste à parler.
const { chemin: prodPath, pistes: pistesProd } = resoudreProduits(cible);
let P = [], prodIgnorees = 0, prodMotif = null;
if (!prodPath) {
  prodMotif = "C5 NON JOUÉE : table absente — les NOMS DE PRODUITS n'ont PAS été cherchés (contenus, "
    + "noms de fichiers, messages de commit). Un PASS ne dirait donc rien des produits. "
    + "REMÈDE : désigner la table des pseudonymes par `--produits=<chemin>` ou par la variable "
    + "d'environnement FORGE_PRODUITS_PSEUDO — elle vit HORS de tout dépôt publié, comme le "
    + "référentiel des clients, et le canal confidentiel du parc la porte en "
    + "`<racine>\\_confidentiel\\tables\\produits-pseudonymes.json`, piste explorée par défaut. "
    + "Pistes explorées, dans l'ordre : " + pistesProd.join(" · ");
} else {
  try {
    const r = termesProduits(JSON.parse(fs.readFileSync(prodPath, 'utf8')));
    P = r.termes; prodIgnorees = r.ignorees;
    if (!P.length) prodMotif = "C5 NON JOUÉE : table sans aucun nom de produit exploitable (" + prodPath
      + ") — " + prodIgnorees + " clé(s) de chemin ignorée(s), et rien d'autre à chercher";
  } catch (e) {
    prodMotif = "C5 NON JOUÉE : table des produits illisible (" + prodPath + ") : " + e.message
      + " — les noms de produits n'ont PAS été cherchés";
  }
}

const { repo, temporaire, erreur } = ouvrir(cible);
if (erreur) out('SKIP', [], [erreur], 2);

const findings = [];
// COMPTEURS DU COÛT DE C4 (TF-0958) — ils ne jugent rien, ils RENDENT COMPTE : le coût de cet
// angle est ce qui décide si la porte est tenable, et un coût non déclaré ne se surveille pas.
let passesC4 = 0, affinagesC4 = 0, lotsC4 = 0;
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
    // C5 · le même contenu, jugé sur les NOMS DE PRODUITS (TF-0820).
    for (const pr of P) {
      lignes.forEach((l, i) => {
        if (porteProduit(l, pr)) findings.push({
          sev: 'bloquant', regle: 'C5',
          msg: `nom de produit interdit « ${pr.cle} » dans le contenu d'un fichier suivi`,
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
  // C5 · les mêmes noms, jugés sur les NOMS DE PRODUITS. Un lot de retours déposé sous son nom de
  // produit se lit dans l'arborescence sans qu'on ouvre un seul fichier.
  for (const rel of suivis) for (const pr of P) {
    if (porteProduit(rel, pr)) findings.push({
      sev: 'bloquant', regle: 'C5',
      msg: `nom de produit interdit « ${pr.cle} » dans le NOM d'un fichier suivi`,
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
    // C5 · le même message, jugé sur les NOMS DE PRODUITS. Un message de commit est publié aussi
    // sûrement qu'un fichier, et il ne se corrige pas sans réécrire l'historique.
    for (const pr of P) if (porteProduit(corps, pr)) findings.push({
      sev: 'bloquant', regle: 'C5',
      msg: `nom de produit interdit « ${pr.cle} » dans un MESSAGE de commit`,
      where: sha.slice(0, 12),
    });
  }

  // --- C4 · contenus ET noms de fichiers dans TOUT l'historique -------------
  // Retirer un fichier de l'arbre ne le retire pas des commits, et l'hébergeur continue de
  // servir par empreinte ce qu'un commit ancien contient.
  const revs = (git(repo, 'rev-list', '--all').stdout || '').split('\n').filter(Boolean);
  const cheminsHisto = new Set((git(repo, 'log', '--all', '--name-only', '--format=').stdout || '')
    .split('\n').map((x) => x.trim()).filter(Boolean));

  // TF-0982 — LA DATE DE CHAQUE RÉVISION, en UNE invocation. Une par révision aurait coûté 909
  // appels sur le dépôt du pilot, sur un angle qui en coûte déjà 21 : la borne aurait payé sa
  // propre lenteur, et une porte lente se contourne.
  // La date d'AUTEUR (`%aI`), jamais celle de validation — voir le bloc TF-0982 plus haut.
  const dateDeRev = new Map();
  for (const l of (git(repo, 'log', '--all', '--format=%H %aI').stdout || '').split('\n')) {
    const m = l.match(/^([0-9a-f]{7,64}) (\d{4}-\d{2}-\d{2})/);
    if (m) dateDeRev.set(m[1], m[2]);
  }
  // LA DERNIÈRE PRÉSENCE D'UN CHEMIN, et le filtre n'est pas cosmétique : `--diff-filter=ACMRT`
  // retient les révisions où le chemin EXISTE APRÈS le changement (ajout, modification,
  // renommage, changement de type). La SUPPRESSION « touche » le chemin sans que le fichier
  // existe ensuite : la compter daterait la dernière présence du nom au jour où on l'a retiré,
  // c'est-à-dire au plus tard — soit l'inverse exact de ce qu'on mesure.
  // Un chemin sans date connue reste jugé SANS borne : la direction sûre.
  const dernierePresence = new Map();
  for (const bloc of (git(repo, 'log', '--all', '--diff-filter=ACMRT', '--name-only', '--format=%x00%aI').stdout || '').split('\0')) {
    const lignes = bloc.split('\n').map((x) => x.trim()).filter(Boolean);
    const d = lignes.length ? (lignes[0].match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] : null;
    if (!d) continue;
    for (const rel of lignes.slice(1)) {
      const prec = dernierePresence.get(rel);
      if (!prec || d > prec) dernierePresence.set(rel, d);
    }
  }

  for (const rel of cheminsHisto) if (!suivis.includes(rel)) for (const t of T) {
    if (!chercheTexte(rel, t)) continue;
    const dOcc = dernierePresence.get(rel) || null;
    const sev = sevHisto(t.depuis, dOcc);
    findings.push({
      sev, regle: 'C4',
      msg: `${t.genre} interdit « ${t.mot} » dans le NOM d'un fichier ayant existé dans l'historique`
        + (sev === 'anteriorite' ? ditAnteriorite(t.depuis, dOcc) : ''),
      where: rel + ' (historique)',
    });
  }
  // TF-0828 (05/09) — C5 REJOUE L'ANGLE C4 : le NOM d'un fichier disparu de l'arbre.
  for (const rel of cheminsHisto) if (!suivis.includes(rel)) for (const pr of P) {
    if (!porteProduit(rel, pr)) continue;
    const dOcc = dernierePresence.get(rel) || null;
    const sev = sevHisto(pr.depuis, dOcc);
    findings.push({
      sev, regle: 'C5',
      msg: `nom de produit interdit « ${pr.cle} » dans le NOM d'un fichier ayant existé dans l'historique`
        + (sev === 'anteriorite' ? ditAnteriorite(pr.depuis, dOcc) : ''),
      where: rel + ' (historique)',
    });
  }
  // Les révisions se passent par LOTS : une ligne de commande portant des milliers d'empreintes
  // se fait tronquer en silence sur ce poste, et un contrôle tronqué rend vert par accident.
  //
  // LE COÛT DE CET ANGLE EST MESURÉ, et c'est lui qui dicte la forme de la boucle (TF-0958,
  // 08/09/2026). Elle lançait un `git grep` par TERME **et** par LOT de révisions : sur le dépôt
  // du pilot (909 révisions, 7 lots) avec le référentiel du parc (10 termes), 70 invocations là
  // où 21 suffisent — et chacune relit LES MÊMES blobs. Un contrôle bloquant qui coûte deux à
  // quatre minutes ne protège plus rien le jour où quelqu'un apprend l'option qui le saute, et
  // cette option est documentée dans le hameçon lui-même : la lenteur d'un gate est un défaut de
  // sécurité, pas d'ergonomie.
  //
  // LES TERMES QUI PARTAGENT LEURS DRAPEAUX TIENNENT DANS UNE SEULE PASSE, avec autant de `-e` —
  // exactement la technique déjà écrite pour C5 quelques lignes plus bas. Le référentiel n'a que
  // TROIS combinaisons possibles (nom : `-i` ; identifiant : aucun ; sigle : `-i -w`), donc au
  // plus trois passes par lot quel que soit le nombre de termes : le coût cesse de croître avec
  // la table, et c'est la table qui grossit.
  //
  // LE PRIX DU GROUPAGE est que `-l` ne dit plus QUEL terme a mordu. La passe groupée sert donc
  // de FILTRE, et le terme n'est identifié que sur les couples (révision, fichier) qui ont
  // mordu — c'est-à-dire presque jamais, le cas nominal d'une porte étant de ne rien trouver.
  // L'IDENTIFICATION FINE EST CONFIÉE AU MÊME OUTIL, avec LES MÊMES DRAPEAUX, terme par terme et
  // sur ce SEUL couple : la frontière de mot et l'exclusion des binaires restent celles de git
  // (règle R3 : l'outil qui fait foi, jamais une copie maison). Réimplémenter `-w` en JavaScript
  // ici aurait rouvert le défaut de cohérence entre angles payé le 27/08 — `\p{L}` place une
  // frontière là où git n'en place pas, et un constat perdu ne se voit pas.
  // Le contrat `findings[]` est inchangé : mêmes constats, même libellé, même localisation.
  const groupes = new Map();
  for (const t of T) {
    const cle = (t.casse ? 'S' : 'i') + (t.motEntier ? 'w' : '-');
    if (!groupes.has(cle)) groupes.set(cle, { drapeaux: [
      ...(t.casse ? [] : ['-i']), ...(t.motEntier ? ['-w'] : []),
    ], termes: [] });
    groupes.get(cle).termes.push(t);
  }
  lotsC4 = lots(revs, 150).length;
  for (const g of groupes.values()) {
    // `-w` N'EST PAS COSMÉTIQUE ICI, et son oubli était un DÉFAUT DE COHÉRENCE entre angles :
    // C1, C2 et C3 appliquaient la règle du mot entier, C4 la déléguait à `git grep` qui l'ignorait.
    // Le même sigle était donc interdit dans l'arbre et toléré dans l'historique — ou l'inverse,
    // selon l'angle. Trouvé par la fixture verte, qui criait sur un témoin de faux positif.
    // La frontière de mot est confiée à git plutôt que réimplémentée (règle R3 : l'outil qui fait
    // foi, jamais une copie maison).
    // `-I` EXCLUT LES BINAIRES, et son oubli était un SECOND défaut de cohérence entre angles,
    // de la même famille que celui de `-w`. C1 saute les fichiers binaires (test d'octet nul) et
    // le `non_juge` de cet oracle DÉCLARE « ne voit que le texte » — mais C4 déléguait à
    // `git grep`, qui fouille les blobs binaires. Mesuré le 27/08 : 200 constats sur le pilot et
    // 14 sur la forge du design, TOUS sur des `.png` de référence visuelle, où trois octets
    // ressemblaient à un sigle. Zéro vrai positif, et une contradiction avec ce que l'oracle
    // déclare ne pas juger — le pire genre de faux positif, celui qui dément la notice.
    const argsGrep = ['grep', '-l', '-I', '-F', ...g.drapeaux];
    const eGroupe = [];
    for (const t of g.termes) eGroupe.push('-e', t.mot);
    for (const lot of lots(revs, 150)) {
      const r = git(repo, ...argsGrep, ...eGroupe, ...lot);
      passesC4 += 1;
      for (const ligne of (r.stdout || '').split('\n').filter(Boolean)) {
        const [rev, ...reste] = ligne.split(':');
        const rel = reste.join(':');
        if (suivis.includes(rel) && findings.some((f) => f.regle === 'C1' && f.where.startsWith(rel + ':'))) continue;
        // QUEL terme ? Le couple est relu UNE fois par terme du groupe, ici seulement — sur un
        // couple qui a déjà mordu. `:(literal)` protège les chemins portant des caractères que
        // git lirait comme un motif de chemin.
        for (const t of g.termes) {
          const rt = git(repo, ...argsGrep, '-e', t.mot, rev, '--', ':(literal)' + rel);
          affinagesC4 += 1;
          if (!(rt.stdout || '').trim()) continue;
          const dOcc = dateDeRev.get(rev) || null;
          const sev = sevHisto(t.depuis, dOcc);
          findings.push({
            sev, regle: 'C4',
            msg: `${t.genre} interdit « ${t.mot} » dans le CONTENU d'un fichier de l'historique`
              + (sev === 'anteriorite' ? ditAnteriorite(t.depuis, dOcc) : ''),
            where: `${rev.slice(0, 12)}:${rel}`,
          });
        }
      }
    }
  }

  // --- C5 · le CONTENU de l'historique, quatrième angle (TF-0828, 05/09) ------------------
  //
  // LE TROU, ET IL EST DE MÊME NATURE QUE CELUI DU 27/08 CÔTÉ CLIENTS. C5 jugeait trois angles
  // sur les quatre que C1-C4 couvrent : contenus et noms des fichiers SUIVIS de l'arbre courant,
  // et messages de commit de tout l'historique. Elle ne rejouait pas C4 — le CONTENU des
  // fichiers de tout l'historique, y compris ceux RETIRÉS de l'arbre. Or retirer un fichier de
  // l'arbre ne le retire pas des commits, et l'hébergeur sert encore par empreinte ce qu'un
  // commit ancien contient. C'est ce même trou qui avait fait découvrir un neuvième dépôt
  // porteur après que huit aient été déclarés propres. L'écart était DÉCLARÉ au non_juge — mais
  // un écart déclaré reste un écart, et une porte verte se lit comme un dépôt propre.
  //
  // MESURE DU 05/09, sur un clone jetable au commit 00097b6 : la porte avec C5 rendait FAIL,
  // 5 constats (2 dans l'arbre courant, 3 dans des messages de commit). Le même balayage étendu
  // au CONTENU de l'historique, joué à la main avec `git grep -l -I -F` sur les 151 révisions,
  // rendait 12 couples (révision, fichier) sur 2 fichiers — douze constats que la porte ne
  // voyait pas.
  //
  // L'ARBITRAGE, ET IL EST BORNÉ. Les clés LITTÉRALES se branchent directement sur le passage
  // par `git grep` déjà écrit pour les clients : `-F` littéral, `-I` pour exclure les binaires,
  // `-w` pour la frontière de mot — confiée à git, jamais réimplémentée (règle R3 : l'outil qui
  // fait foi, jamais une copie maison). Les VARIANTES de graphie, elles, demanderaient un motif
  // que `git grep` sache lire : le lookbehind `(?<![A-Za-z0-9])` de la graphie littérale n'est
  // PAS exprimable en ERE, et le traduire à la main serait exactement la copie maison que R3
  // interdit — c'est le défaut de cohérence entre angles déjà payé le 27/08 sur `-w` et `-I`.
  // Elles restent donc hors de cet angle, et c'est DÉCLARÉ au non_juge, terme à terme.
  //
  // Une clé portant des `formes` déclarées (TF-0825) fait chercher SES FORMES, jamais la clé
  // nue : le garde-fou du terme court vaut dans l'historique comme dans l'arbre.
  //
  // LE COUT, ET IL EST MESURE — c'est ce qui a dicte la forme de cette boucle. Un `git grep` par
  // TERME et par lot de revisions relit les MEMES blobs autant de fois qu'il y a de termes.
  // Mesure du 08/09 sur le depot du pilot (900 revisions, 1 369 fichiers suivis) : la porte y
  // prenait deja 99 s AVANT cet angle, et le coordinateur la mesure a 2-4 min avec les tables
  // reelles. Un gate au-dela de la minute se contourne au premier `--no-verify` : y ajouter une
  // passe par terme aurait ete ajouter au probleme, pas a la couverture.
  //
  // TOUTES LES AIGUILLES DE PRODUIT PARTAGENT LEURS DRAPEAUX (`-l -I -F -w`, sensible a la
  // casse) : elles tiennent donc dans UN SEUL `git grep` par lot, avec autant de `-e`. On paie
  // une passe, pas |P|. Le prix de ce groupage est que `-l` ne dit pas QUELLE aiguille a mordu :
  // la passe groupee sert de FILTRE, et l'aiguille n'est identifiee que sur les couples
  // (revision, fichier) qui ont mordu — c'est-a-dire presque jamais, puisque le cas nominal
  // d'une porte est de ne rien trouver. Le contrat `findings[]` est inchange.
  // TF-0982 — chaque aiguille porte la BORNE de la clé dont elle vient. Deux clés qui partagent une
  // même forme déclarée gardent la borne la PLUS ANCIENNE : l'aiguille est interdite dès la
  // première inscription, et retenir la plus récente exempterait davantage — la mauvaise direction.
  // Une clé SANS borne impose l'absence de borne à ses aiguilles : rien n'exempte par défaut.
  const borneDAiguille = new Map();
  const aiguilles = [];
  for (const pr of P) for (const a of (pr.formes || [pr.cle])) {
    if (!aiguilles.includes(a)) { aiguilles.push(a); borneDAiguille.set(a, pr.depuis); continue; }
    const prec = borneDAiguille.get(a);
    if (!pr.depuis || !prec) borneDAiguille.set(a, null);
    else if (pr.depuis < prec) borneDAiguille.set(a, pr.depuis);
  }
  if (aiguilles.length) {
    const eGroupe = [];
    for (const a of aiguilles) eGroupe.push('-e', a);
    for (const lot of lots(revs, 150)) {
      const r = git(repo, 'grep', '-l', '-I', '-F', '-w', ...eGroupe, ...lot);
      for (const ligne of (r.stdout || '').split('\n').filter(Boolean)) {
        const [rev, ...reste] = ligne.split(':');
        const rel = reste.join(':');
        // Déjà dit par C5 sur l'arbre courant : ne pas compter deux fois le même fichier.
        if (suivis.includes(rel) && findings.some((f) => f.regle === 'C5' && f.where.startsWith(rel + ':'))) continue;
        // QUELLE aiguille ? Le blob est relu UNE fois, ici seulement — sur un couple qui a
        // deja morde. Le constat nomme l'aiguille, comme tous les autres constats C5.
        const blob = git(repo, 'show', `${rev}:${rel}`).stdout || '';
        for (const a of aiguilles) {
          if (!litteralProduit(a).test(blob)) continue;
          const borne = borneDAiguille.get(a) || null;
          const dOcc = dateDeRev.get(rev) || null;
          const sev = sevHisto(borne, dOcc);
          findings.push({
            sev, regle: 'C5',
            msg: `nom de produit interdit « ${a} » dans le CONTENU d'un fichier de l'historique`
              + (sev === 'anteriorite' ? ditAnteriorite(borne, dOcc) : ''),
            where: `${rev.slice(0, 12)}:${rel}`,
          });
        }
      }
    }
  }
} finally { nettoyer(); }

// LA PISTE RETENUE SE NOMME, TOUJOURS (TF-0887). Depuis que la porte sait chercher toute seule
// dans le canal confidentiel, un lecteur ne peut plus déduire du seul verdict QUELLE table a été
// lue — la table du canal, un ancien fichier libre, ou celle d'un banc jetable. Une porte qui
// mesure sans dire sur quoi rend un verdict qu'on ne peut ni reproduire ni contester.
const nj = NON_JUGE.concat(['table lue (référentiel des noms interdits) : ' + refPath + ' (' + T.length + ' terme(s))']);
// C5 parle TOUJOURS : jouée, elle dit sur quoi ; non jouée, elle dit pourquoi. Un angle muet se lit
// comme un angle vert, et c'est précisément l'état dans lequel la porte a laissé passer trois
// mentions d'un nom de produit le 05/09.
// LE COÛT DE C4 SE DÉCLARE, CHIFFRÉ (TF-0958, 08/09/2026). Un gate bloquant qui coûte deux à
// quatre minutes se contourne au premier `--no-verify`, et cette option est documentée dans le
// hameçon lui-même : la lenteur d'une porte est un défaut de sécurité, pas d'ergonomie. Le coût
// se surveille donc au verdict, pas dans la mémoire de qui l'a mesuré une fois.
// MESURE DU 08/09 SUR LE PLUS GROS DÉPÔT DU PARC — le dépôt du pilot, 909 révisions et 1 371
// fichiers suivis, avec les tables RÉELLES du canal (10 termes clients, 65 clés de produits),
// protocole séquentiel, deux passes : 330,9 s puis 295,5 s AVANT le groupage de C4 (70
// invocations `git grep`), à comparer aux 21 que le groupage laisse. Un jeu d'essai de 4 termes
// rendait 81 s et 99 s sur le même dépôt : le temps croît avec la TABLE, et c'est la table qui
// grossit.
nj.push('coût de C4 sur cet artefact : ' + passesC4 + ' passe(s) `git grep` groupée(s) pour '
  + T.length + ' terme(s) du référentiel (' + affinagesC4 + " relecture(s) d'identification fine "
  + 'sur les seuls couples révision/fichier qui ont mordu) — une passe par TERME et par lot en '
  + 'aurait coûté ' + (T.length * lotsC4) + '. Temps mesuré le 08/09 sur le plus gros dépôt '
  + 'du parc (909 révisions, 1 371 fichiers suivis, tables réelles) : 330,9 s et 295,5 s AVANT ce '
  + 'groupage');
nj.push(prodMotif || ('table lue (pseudonymes de produits) : ' + prodPath
  + ' — table des produits employée (' + P.length
  + ' nom(s) de produit jugé(s) par C5, ' + prodIgnorees + ' clé(s) de CHEMIN ignorée(s) — un chemin '
  + "de disque n'est pas un nom)"));
// TF-0825 (05/09, garde-fou n° 1) — LA PORTÉE « FICHIERS SUIVIS PAR GIT » EST UNE PROPRIÉTÉ,
// PAS UNE LIMITE SUBIE, et elle se DÉCLARE comme telle. Elle était déjà tenue et déjà au
// non_juge, mais énoncée comme un manque. Pour les termes COURTS elle devient ce qui rend
// l'angle exploitable : mesure du 05/09 sur une forge — la même séquence de trois lettres rend
// 3 occurrences sur les fichiers suivis (la mesure exacte) et 212 sur l'arbre de travail, dont
// 209 dans `.venv/` où ces lettres sont un acronyme d'informatique. La portée absorbe donc seule
// tout le bruit — MAIS c'est une propriété du DÉPÔT, pas de la règle : un `vendor/` SUIVI
// suffirait à faire rendre des dizaines de constats faux, et c'est là que les FORMES BORNÉES
// (voir `formesDeclarees`) prennent le relais. Le dire est ce qui permet de le vérifier.
if (P.length) nj.push('PORTÉE ASSUMÉE de C5 sur l’arbre courant : les fichiers SUIVIS par git, '
  + 'et eux seuls (`git ls-files`). Ce n’est pas une limite subie : pour un nom de produit COURT '
  + '— souvent trois majuscules, motif fréquent dans du code tiers — c’est la propriété qui rend '
  + 'l’angle exploitable. Mesure du 05/09 : 3 occurrences sur les fichiers suivis contre 212 sur '
  + 'l’arbre de travail, dont 209 dans des paquets installés. ATTENTION : c’est une propriété du '
  + 'DÉPÔT, pas de la règle — un `vendor/` SUIVI ramènerait le bruit. Le remède est alors la '
  + 'FORME BORNÉE déclarée dans la table (`"formes": ["<nom>-FR", "<nom>.FR"]`), qui remplace la '
  + 'sous-chaîne nue, jamais le retrait du terme, qui éteindrait l’angle.');
if (P.length) nj.push('C5 balaie les QUATRE angles depuis le 08/09 (TF-0828) : contenus et noms '
  + 'des fichiers SUIVIS de l’arbre courant, messages de commit de tout l’historique, et — c’est '
  + "l'angle ajouté — CONTENUS et NOMS des fichiers de tout l'historique, y compris ceux RETIRÉS "
  + "de l'arbre. LIMITE QUI SUBSISTE, et elle est bornée : dans l'HISTORIQUE, seules la graphie "
  + 'LITTÉRALE de la clé (ou ses `formes` déclarées) sont cherchées, par `git grep -l -I -F -w` ; '
  + 'les VARIANTES de graphie ne le sont pas. Motif : le lookbehind `(?<![A-Za-z0-9])` de la '
  + "graphie littérale n'est pas exprimable en ERE, et le traduire à la main serait la copie "
  + "maison d'une frontière de mot que la règle R3 interdit (l'outil qui fait foi, jamais une "
  + 'copie maison) — c’est le défaut de cohérence entre angles déjà payé le 27/08 sur `-w` et '
  + '`-I`. Un nom de produit vivant dans un blob ancien SOUS UNE VARIANTE DE GRAPHIE seulement '
  + "n'est donc pas vu : limite mesurée et déclarée, pas un oubli.");
// TF-0982 — LA BORNE DE DATE SE DÉCLARE, ET LE PASSIF SE COMPTE.
//
// Trois choses doivent tenir dans le verdict, sinon la borne devient une amnistie silencieuse :
// COMBIEN de termes portent une date (une table à moitié datée juge à moitié sans borne),
// COMBIEN d'occurrences ont été déclarées antériorités (le passif, qui doit rester visible même
// quand il ne bloque plus), et SUR QUELS termes (un passif anonyme ne se traite pas).
const bloquants = findings.filter((f) => f.sev === 'bloquant');
const anteriorites = findings.filter((f) => f.sev === 'anteriorite');
const bornesT = T.filter((t) => t.depuis).length;
const bornesP = P.filter((p) => p.depuis).length;
nj.push('BORNE DE DATE (TF-0982) : une occurrence de l’HISTOIRE antérieure à la date d’inscription '
  + 'de son terme est déclarée ANTÉRIORITÉ — nommée, comptée, NON bloquante. L’ARBRE COURANT et les '
  + 'MESSAGES DE COMMIT sont jugés SANS borne : ils se corrigent par une édition. Un terme SANS date '
  + 'au bloc `depuis` est jugé SANS borne — l’absence de date ne vaut jamais exemption. Termes datés : '
  + bornesT + '/' + T.length + ' au référentiel des clients'
  + (P.length ? ', ' + bornesP + '/' + P.length + ' à la table des produits' : '')
  + '. La date d’une occurrence est celle d’AUTEUR de sa révision (une réécriture d’historique remet '
  + 'les dates de validation à zéro, et borner sur elles rendrait tout postérieur).');
if (anteriorites.length) {
  const parTerme = new Map();
  for (const f of anteriorites) {
    const m = (f.msg.match(/« (.+?) »/) || [])[1] || '(terme non nommé)';
    parTerme.set(m, (parTerme.get(m) || 0) + 1);
  }
  const detail = [...parTerme.entries()].sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `« ${m} » ×${n}`).join(' · ');
  nj.push('PASSIF D’ANTÉRIORITÉ : ' + anteriorites.length + ' occurrence(s) de l’historique '
    + 'antérieure(s) à l’inscription de leur terme — non bloquantes, et comptées ICI pour qu’un '
    + 'passif qui grossit reste visible au lieu de disparaître. Par terme : ' + detail
    + '. Ce passif ne se solde que par une réécriture d’historique — geste humain, jamais un hameçon.');
} else nj.push('PASSIF D’ANTÉRIORITÉ : aucune occurrence de l’historique n’a été déclarée antérieure '
  + 'à l’inscription de son terme.');

if (bloquants.length) {
  // Une sortie qui déroulerait 648 occurrences ne se lit pas : on borne, ET ON DIT qu'on borne —
  // un plafond silencieux se lit comme « tout est là », ce qui est le contraire d'un contrôle.
  const montres = bloquants.slice(0, 200);
  if (bloquants.length > montres.length) nj.push(`${bloquants.length} constat(s) BLOQUANT(S) au total, ${montres.length} listés ici — sortie bornée, le reste existe`);
  // Les antériorités suivent les bloquants, bornées à leur tour : elles ne doivent ni noyer les
  // constats qui refusent la publication, ni disparaître de la sortie.
  const anterMontrees = anteriorites.slice(0, 50);
  if (anteriorites.length > anterMontrees.length) nj.push(`${anteriorites.length} antériorité(s) au total, ${anterMontrees.length} listée(s) ici — sortie bornée, le reste existe`);
  out('FAIL', montres.concat(anterMontrees), nj, 1, cible);
}
out('PASS', [{ sev: 'info', regle: P.length ? 'C1-C5' : 'C1-C4',
  msg: `aucun des ${T.length} terme(s) du référentiel`
    + (P.length ? `, ni des ${P.length} nom(s) de produit de la table,` : ' (C5 non jouée)')
    + ' dans les contenus, les noms de fichiers ni les messages de commit'
    + (anteriorites.length ? ` — hors ${anteriorites.length} antériorité(s) de l'historique, déclarée(s) et non bloquante(s)` : ''),
  where: path.basename(cible) }].concat(anteriorites.slice(0, 50)), nj, 0, cible);

// NOTE, ET ELLE EST LA MEILLEURE PREUVE QUE CET ORACLE JUGE : sa PREMIÈRE exécution sur le dépôt
// qui le porte a rendu FAIL — sur CE fichier, ligne 94, où un commentaire illustrait la règle de
// casse avec un VRAI nom de client. L'auteur du contrôle avait réintroduit la fuite dans le
// contrôle lui-même, en une phrase, sans y penser. Les exemples de ce fichier sont donc tous
// inventés, et c'est une règle, pas une préférence.
