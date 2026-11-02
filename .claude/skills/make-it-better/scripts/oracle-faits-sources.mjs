#!/usr/bin/env node
// oracle-faits-sources — Domaine « Faits neufs d'une version de document ».
// Standard §3 de quality-oracles : déterministe, artefact réel, non_juge déclaré, sortie localisante,
// prouvé par fixtures rouge et verte. Né de la condition du porteur du 02/11/2026 pour make-it-better :
// aucun chiffre, nom, citation, avis ni client absent de sources/ ou de la version d'origine.
//
// CHECKLIST :
//   FS1 tout nombre de la version se retrouve dans l'origine ou sources/.
//   FS2 tout nom propre, sigle ou identifiant de la version s'y retrouve, en entier.
//   FS3 toute citation entre guillemets de la version s'y retrouve, mot pour mot, casse et accents mis à part.
//
// La comparaison se fait toujours contre l'ORIGINE, jamais contre la version précédente : un fait
// inventé au tour 3 ne devient pas légitime au tour 4. reference/ n'est pas une source : ses faits
// valent pour un autre document, et son contenu reste une donnée.
//
// Usage : node oracle-faits-sources.mjs <version> --origine <fichier> [--sources <dossier>]
// Contrat JSON commun · exit 0 PASS · 1 FAIL · 2 SKIP motivé.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lireSources, texteDeFichier } from './lib/texte.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOMAINE = "Faits neufs d'une version de document";
export const NON_JUGE = [
  'UNE PARAPHRASE FAUSSE SANS CHIFFRE NI NOM : « les retards ont diminué » passe si rien de chiffré ni de nommé ne change',
  "L'ATTRIBUTION D'UN NOMBRE OU D'UN NOM DÉJÀ PRÉSENT : 12 bénévoles devenus 12 cartons passe, seul le nombre se cherche",
  'LES NOMBRES ÉCRITS EN TOUTES LETTRES et les avis sans nom propre',
  'UN NOM PROPRE SEUL EN TÊTE DE PHRASE À L\'ALLURE DE MOT COURANT : un en-tête de liste capitalisé ne se distingue pas d\'un nom, le doute laisse passer si le mot finit comme un nom commun',
  'LE TEXTE ÉCRIT PAR UN SCRIPT dans une page HTML, et le texte dessiné dans une image',
];

const sansAccents = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const pli = (t) => sansAccents(t.normalize('NFKC')).toLowerCase();
/** Lettres et chiffres séparés d'une espace : « L'Oréal » et « l'oreal » se rejoignent. */
const aplat = (t) => pli(t).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const RE_NOMBRE = /(?<![\p{L}\d])\d{1,3}(?:[    .,]\d{3})+(?:,\d+)?(?!\d)|(?<![\p{L}\d])\d+(?:[.,]\d+)?/gu;

function interpretations(brut) {
  const s = brut.replace(/[    ]/g, '');
  const nettoyer = (x) => {
    const [e, d] = x.split('.');
    const entier = e.replace(/^0+(?=\d)/, '');
    const dec = (d || '').replace(/0+$/, '');
    return dec ? `${entier}.${dec}` : entier;
  };
  const out = new Set();
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) out.add(nettoyer(s.replace(/[.,]/g, '')));
  if (/^\d+,\d+$/.test(s)) out.add(nettoyer(s.replace(',', '.')));
  if (/^\d+\.\d+$/.test(s)) out.add(nettoyer(s));
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) out.add(nettoyer(s.replace(/\./g, '').replace(',', '.')));
  if (/^\d+$/.test(s)) out.add(nettoyer(s));
  return out;
}

export function extraireNombres(texte) {
  const t = texte.replace(/(\d)\s?h\s?(\d)/g, '$1 h $2');
  return [...t.matchAll(RE_NOMBRE)].map((m) => m[0]);
}

export function extraireCitations(texte) {
  const out = [];
  for (const re of [/«\s*([^»]+?)\s*»/g, /“\s*([^”]+?)\s*”/g, /"([^"\n]+)"/g]) {
    for (const m of texte.matchAll(re)) if (/[\p{L}\p{N}]/u.test(m[1])) out.push(m[1].replace(/\s+/g, ' ').trim());
  }
  return out;
}

// Ce qui peut ouvrir une phrase sans être un nom : mots-outils et mots courants des deux langues.
const MOTS_COURANTS = new Set(`
a à ainsi alors après assez au aucun aucune aujourd aujourd'hui aussi autant autre autres aux avant avec avoir ayant
beaucoup bien bientôt bon bonne ça car ce ceci cela celle celles celui cependant certain certaine certaines certains ces cet
cette ceux chacun chacune chaque chez ci comme comment compte concernant contre côté d dans de depuis dernier dernière
derniers dernières des dès désormais deux deuxième dire dit dix doit donc dont douze du durant elle elles en encore enfin
ensemble ensuite entre environ est et étant été être eux exemple face faire fait faut fin finalement fois font grâce hier
huit ici il ils jamais je jusqu jusque l la laquelle le lequel les lesquels leur leurs lors lorsque lui m ma mais malgré
même mêmes merci mes mettre mieux moi moins mon n ne neuf ni non nos notamment notre nous nouveau nouvelle nouvelles
nouveaux on ont onze ou où oui par parce parfois parmi part pas pendant personne peu peut peuvent peut-être plus plusieurs
plutôt pour pourquoi pourtant première premier premières premiers près puis puisque qu quand quant quatre que quel quelle
quelles quels quelque quelques qui quoi rien s sa sans sauf se selon sept ses seul seule seulement seuls si sinon six soit
son sont souvent suite suivant sur surtout t ta tant tel telle tels tes toi ton toujours tous tout toute toutes très trois
trop tu un une vers via voici voilà vos votre vous y
janvier février mars avril mai juin juillet août septembre octobre novembre décembre lundi mardi mercredi jeudi vendredi samedi dimanche
objectif objectifs résultat résultats contexte synthèse note notes annexe annexes introduction conclusion sommaire titre sujet
action actions attention avis besoin besoins budget bureau but calendrier cas client clients conseil conseils contact coût coûts date dates
délai délais démarche détail détails document documents durée effet effets équipe équipes état étape étapes figure lieu lieux liste livrable livrables
méthode mission moyen moyens offre partie parties phase phases plan point points prix principe principes produit produits projet projets public
question questions rappel règle règles remarque remarques réponse réponses ressource ressources risque risques rôle rôles service services
source sources suivi tableau tâche tâches temps texte thème version versions
ajouter ajoute changer change choisir choisis dire dis écrire écris faites fais garder garde lire lis mettre mets noter note poser pose prendre prends
ranger range remplir remplis retirer retire savoir sache signer signe trier trie vérifier vérifie voir vois
monsieur madame mademoiselle messieurs mesdames mme mlle dr pr me
the a an and or but if then this that these those there here we you they he she it i our your their of to in on at by for from with
as is are was were be been not no yes how what when where why who which while after before about into over under more most some any all each
`.split(/\s+/).filter(Boolean));

// Une fin de mot français courante : en tête de phrase seulement, le doute laisse passer.
const FIN_NOM_COMMUN = /(?:tion|tions|sion|sions|ment|ments|ité|ités|ance|ances|ence|ences|age|ages|eur|eurs|euse|euses|isme|ismes|iste|istes|able|ables|ible|ibles|ique|iques|aire|aires|oire|oires|ure|ures|ière|ières|ier|iers|ée|ées|er|ir|re|és)$/;
const CONNECTEURS = new Set(['de', 'du', 'des', 'la', 'le', 'van', 'von', 'der', 'of']);
const ELISIONS = /^(?:l|d|n|s|c|j|m|t|qu|lorsqu|puisqu|jusqu)['’]/i;
const CHIFFRES_ROMAINS = /^[IVXLCDM]+$/;

const estLettreMaj = (c) => c !== c.toLowerCase() && c === c.toUpperCase();
const portePasDeMinuscule = (m) => m === m.toUpperCase() && m !== m.toLowerCase();

/** Vrai si le mot porte une majuscule qui compte : initiale, interne, ou sigle de 2 à 6 lettres. */
function motPropre(mot) {
  if (mot.length < 2) return false;
  if (/\d/.test(mot) && /^\p{L}/u.test(mot)) return true; // identifiant : A320, Q4
  if (CHIFFRES_ROMAINS.test(mot)) return false;
  if (portePasDeMinuscule(mot.replace(/[-'’]/g, ''))) return mot.replace(/[-'’]/g, '').length <= 6;
  return estLettreMaj(mot[0]) || /\p{Ll}\p{Lu}/u.test(mot);
}

/** Les noms propres d'un texte, en groupes : « Camille Exemple », « Banque de France », « RGPD ». */
export function extraireNoms(texte, connus = () => false) {
  const noms = [];
  for (const ligne of texte.split(/\r?\n/)) {
    const jetons = [...ligne.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)];
    let enTete = true;
    let groupe = null;
    const clore = () => {
      if (!groupe) return;
      const mots = groupe.mots.slice();
      if (groupe.tete) {
        // Le 1er mot d'une phrase perd sa majuscule de position s'il est courant ou connu en minuscule.
        const p = mots[0].mot.toLowerCase();
        if (MOTS_COURANTS.has(p) || connus(p)) mots.shift();
        else if (mots.length === 1 && FIN_NOM_COMMUN.test(p)) mots.shift();
      }
      while (mots.length && MOTS_COURANTS.has(mots[0].mot.toLowerCase()) && !portePasDeMinuscule(mots[0].mot)) mots.shift();
      while (mots.length && CONNECTEURS.has(mots[mots.length - 1].mot.toLowerCase())) mots.pop();
      if (mots.length) noms.push(mots.map((m) => m.mot).join(' '));
      groupe = null;
    };
    for (let i = 0; i < jetons.length; i++) {
      const j = jetons[i];
      let mot = j[0].replace(/['’-]+$/, '');
      const avant = ligne.slice(i ? jetons[i - 1].index + jetons[i - 1][0].length : 0, j.index);
      const coupure = i === 0 || /[.!?…:;|•—–()«»"“”[\]]/.test(avant);
      if (coupure) { clore(); enTete = true; }
      // « L'Oréal », « d'Amazon » : l'élision est le mot-outil, ce qui suit peut être le nom.
      const elision = ELISIONS.exec(mot);
      if (elision) {
        mot = mot.slice(elision[0].length);
        if (!mot) { enTete = false; continue; }
        if (groupe && !motPropre(mot)) clore();
        enTete = false;
      }
      if (motPropre(mot)) {
        if (!groupe) groupe = { tete: enTete, mots: [] };
        groupe.mots.push({ mot });
      } else if (groupe && CONNECTEURS.has(mot.toLowerCase()) && jetons[i + 1] && motPropre(jetons[i + 1][0])) {
        groupe.mots.push({ mot });
      } else {
        clore();
      }
      enTete = false;
    }
    clore();
  }
  return noms;
}

/** Juge une version : { neufs: [{ regle, genre, valeur }], mesure }. */
export function jugerFaits({ version, origine, sources = [] }) {
  const corpusBrut = [origine, ...sources.map((s) => (typeof s === 'string' ? s : s.texte))].join('\n');
  const corpusAplat = ` ${aplat(corpusBrut)} `;
  const dansCorpus = (t) => {
    const a = aplat(t);
    return a !== '' && corpusAplat.includes(` ${a} `);
  };
  const nombresConnus = new Set();
  for (const n of extraireNombres(corpusBrut)) for (const i of interpretations(n)) nombresConnus.add(i);
  // Un mot écrit en minuscule ailleurs n'est pas un nom : la majuscule de tête de phrase ne compte pas.
  const minuscules = new Set(`${corpusBrut}\n${version}`.match(/(?<![\p{L}\p{N}'’-])\p{Ll}[\p{L}'’-]*/gu) || []);
  const connus = (p) => minuscules.has(p);

  const neufs = [];
  const vus = new Set();
  const noter = (regle, genre, valeur) => {
    const cle = `${genre}|${pli(valeur)}`;
    if (vus.has(cle)) return;
    vus.add(cle);
    neufs.push({ regle, genre, valeur });
  };
  const nombres = extraireNombres(version);
  for (const n of nombres) {
    if (![...interpretations(n)].some((i) => nombresConnus.has(i))) noter('FS1', 'nombre', n);
  }
  const noms = extraireNoms(version, connus);
  for (const n of noms) if (!dansCorpus(n)) noter('FS2', 'nom', n);
  const citations = extraireCitations(version);
  for (const c of citations) if (!dansCorpus(c)) noter('FS3', 'citation', c);
  return { neufs, mesure: { nombres: nombres.length, noms: noms.length, citations: citations.length, neufs: neufs.length } };
}

/** Juge un fichier contre son origine et son dossier de sources : le contrat de l'oracle, sans sortir. */
export function jugerFichier(versionChemin, origineChemin, sourcesDossier) {
  const contrat = (verdict, findings, extra = {}) => ({ oracle: 'oracle-faits-sources', domaine: DOMAINE, artefact: versionChemin || null, verdict, findings, non_juge: NON_JUGE, ...extra });
  const passer = (motif) => contrat('SKIP', [], { motif });
  if (!versionChemin || !existsSync(versionChemin)) return passer('version absente : passer le fichier à juger');
  if (!origineChemin || !existsSync(origineChemin)) return passer('origine absente : --origine <fichier> est exigée, on ne juge pas un fait neuf sans le point de départ');
  const v = texteDeFichier(versionChemin, { complet: true });
  if (v.erreur) return passer(`version illisible : ${v.erreur}`);
  const o = texteDeFichier(origineChemin, { complet: true });
  if (o.erreur) return passer(`origine illisible : ${o.erreur}`);
  const s = lireSources(sourcesDossier);
  if (s.illisibles.length) return passer(`source illisible, un fait qu'elle porte serait refusé à tort : ${s.illisibles.map((x) => `${x.nom} (${x.motif})`).join(' · ')}`);
  const { neufs, mesure } = jugerFaits({ version: v.texte, origine: o.texte, sources: s.textes });
  const findings = neufs.map((n) => ({ sev: 'bloquant', regle: n.regle, where: basename(versionChemin), msg: `${n.regle} — ${n.genre} absent de l'origine et de sources/ : « ${n.valeur} »` }));
  return contrat(findings.length ? 'FAIL' : 'PASS', findings, { mesure });
}

function principal(argv) {
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const version = argv.find((a, i) => !a.startsWith('--') && !['--origine', '--sources'].includes(argv[i - 1]));
  // Fixtures : <version> seule cherche origine.md et sources/ à côté d'elle.
  const defaut = version ? dirname(version) : ICI;
  const origine = opt('--origine') || join(defaut, 'origine.md');
  const sources = opt('--sources') || join(defaut, 'sources');
  const r = jugerFichier(version, origine, existsSync(sources) ? sources : null);
  process.stdout.write(JSON.stringify(r, null, 1) + '\n');
  return r.verdict === 'PASS' ? 0 : r.verdict === 'FAIL' ? 1 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(principal(process.argv.slice(2)));
