#!/usr/bin/env node
// exporter-page.mjs — la page de versions d'un essai, rendue AUTOPORTANTE : un seul fichier HTML,
// images embarquées en data:, aucun serveur requis. Le porteur la rouvre et la transmet telle quelle.
//   node exporter-page.mjs --espace <e> [--essai opus-1] [--document <nom>] [--sortie <dossier>] [--jour AAAAMMJJ] [--prefixe <p>]
// Elle reprend la page servie (assets/page-versions.html) : aperçu, comparaison dans le format ou en
// texte marqué, revue à l'aveugle. Ce qui était rendu par le serveur se refait dans la page :
//   - l'écart de texte par le MÊME code que le skill (scripts/lib/diff.mjs inséré tel quel) ;
//   - l'écart de pages à l'œil, au canevas, aux seuils de formats.py (SEUIL_PIXEL, ZONES_MAX) ;
//   - la revue à l'aveugle tirée par crypto.getRandomValues, SANS enregistrement : elle vit tant que
//     la page reste ouverte et se perd au rechargement (l'export ne persiste ni jugement ni classement).
// Les aperçus de pages (Word, PowerPoint, PDF) sont lus dans apercus/, rendus au préalable par le
// serveur ; un PDF sans aperçu se rend ici par formats.py. Sans aperçu, la version passe au texte extrait.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { numerosGardes, versionsRetenues } from './lib/aveugle.mjs';
import { appelerFormats, DOSSIER_SCRIPTS, extensionDe, LIBELLE_FORMAT, lireJson, pad, RACINE_SKILL } from './lib/commun.mjs';
import { ARRETS_TERMINAUX, cheminVersion, LIBELLE_ARRET, listerDocuments } from './lib/espace.mjs';
import { echapper, markdownEnHtml, pageApercu } from './lib/markdown.mjs';
import { htmlEnTexte, markdownEnTexte, texteDeFichier } from './lib/texte.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const GABARIT = join(RACINE_SKILL, 'assets', 'page-export.html');
const DIFF = join(ICI, 'lib', 'diff.mjs');
const LETTRES = 'abcdefghijklmnopqrstuvwxyz';

/** La forme canonique : chaque `<jour><lettre>` perd sa lettre, pour comparer deux contenus à l'indice près. */
export const canonique = (texte, jour) => String(texte).replaceAll(new RegExp(`${jour}[a-z]`, 'g'), jour);

/**
 * L'indice à employer pour `${prefixe}${jour}<indice>${extension}` dans `dossier` : `a` si rien du jour,
 * l'indice d'un fichier du jour au MÊME contenu (une re-génération inchangée n'est pas une version neuve),
 * sinon la première lettre libre du jour, tous radicaux confondus (règle 5 de la Factory, R-4).
 * Reprend le contrat de scripts/allouer-indice.mjs du pilot, sans en dépendre : le skill reste portable.
 */
export function allouerIndice({ dossier, prefixe, jour, contenu, extension = '.html' }) {
  if (!/^\d{8}$/.test(String(jour))) throw new Error(`jour attendu AAAAMMJJ, reçu « ${jour} »`);
  const motifDossier = new RegExp(` - ${jour}([a-z])\\.[\\w.]+$`);
  const motifPrefixe = new RegExp(`^${String(prefixe).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${jour}([a-z])${String(extension).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const fichiers = existsSync(dossier) ? readdirSync(dossier) : [];
  const pris = fichiers.map((f) => ({ f, m: f.match(motifPrefixe) })).filter((x) => x.m).map(({ f, m }) => ({ lettre: m[1], nom: f })).sort((a, b) => a.lettre.localeCompare(b.lettre));
  if (contenu !== undefined && pris.length) {
    const mienne = canonique(contenu, jour);
    for (const { lettre, nom } of pris) {
      try { if (canonique(readFileSync(join(dossier, nom), 'utf8'), jour) === mienne) return lettre; } catch { /* illisible : on continue */ }
    }
  }
  if (pris.length) {
    const suivant = LETTRES.indexOf(pris[pris.length - 1].lettre) + 1;
    if (suivant < LETTRES.length) return LETTRES[suivant];
  } else if (!fichiers.some((f) => motifDossier.test(f))) {
    return 'a';
  }
  const prisDuJour = new Set(fichiers.map((f) => f.match(motifDossier)).filter(Boolean).map((m) => m[1]));
  const libre = [...LETTRES].find((l) => !prisDuJour.has(l));
  if (!libre) throw new Error(`aucune lettre libre pour le jour ${jour} dans ${dossier} : les 26 lettres sont prises`);
  return libre;
}

/** Un dédoubleur d'images : deux PNG identiques partagent un seul data: et un seul identifiant. */
function dedoubleur() {
  const images = {};
  const parContenu = new Map();
  let n = 0;
  return {
    images,
    ajouter(octets) {
      const b64 = octets.toString('base64');
      if (parContenu.has(b64)) return parContenu.get(b64);
      const id = `img${n++}`;
      images[id] = `data:image/png;base64,${b64}`;
      parContenu.set(b64, id);
      return id;
    },
  };
}

/** Les page-*.png d'un dossier d'aperçu, dans l'ordre des rangs. */
function imagesDApercu(dossier) {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).filter((f) => /^page-\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])).map((f) => join(dossier, f));
}

/** L'aperçu et le texte d'une version : { apercu, doc?|pages?|texteApercu?|raison?, texte }. */
function apercuEtTexte(docDossier, dossierEssai, essaiId, numero, ext, embarquer) {
  const fichier = cheminVersion(dossierEssai, numero, ext);
  if (!fichier) return { apercu: 'absent', texte: '', raison: 'cette version n\'a pas de fichier' };
  if (ext === 'md') {
    const md = readFileSync(fichier, 'utf8');
    return { apercu: 'html', doc: pageApercu(markdownEnHtml(md)), texte: markdownEnTexte(md) };
  }
  if (ext === 'html') {
    const html = readFileSync(fichier, 'utf8');
    return { apercu: 'html', doc: html, texte: htmlEnTexte(html) };
  }
  // docx, pptx, pdf : les images de pages déjà rendues par le serveur, à défaut un PDF rendu ici.
  const texte = texteDeFichier(fichier).texte || '';
  let chemins = imagesDApercu(join(docDossier, 'apercus', essaiId, pad(numero)));
  let temporaire = null;
  if (!chemins.length && ext === 'pdf') {
    temporaire = mkdtempSync(join(tmpdir(), 'mib-export-pdf-'));
    const r = appelerFormats(['pdf-images', fichier, temporaire]);
    if (r.code === 0) chemins = imagesDApercu(temporaire);
  }
  let resultat;
  if (chemins.length) resultat = { apercu: 'images', pages: chemins.map((c) => embarquer(readFileSync(c))), texte };
  else resultat = { apercu: 'texte', texteApercu: texte, raison: `aperçu de pages non disponible (rends-le par le serveur une fois, ou ${LIBELLE_FORMAT[ext]} indisponible)`, texte };
  if (temporaire) rmSync(temporaire, { recursive: true, force: true });
  return resultat;
}

/** Rassemble l'essai en { donnees, images } : tout ce que la page autoportante embarque. */
export function rassembler(espace, { essai, document } = {}) {
  const documents = listerDocuments(espace);
  if (!documents.length) throw new Error(`aucun document dans l'espace : ${espace}`);
  const doc = (document ? documents.find((d) => d.nom === document) : null) || documents[0];
  if (!doc.ext) throw new Error(`le document ${doc.nom} n'a pas d'origine lisible`);
  const essaiChoisi = (essai ? doc.essais.find((e) => e.id === essai) : null) || doc.essais.find((e) => e.id === 'opus-1') || doc.essais[0];
  if (!essaiChoisi) throw new Error(`aucun essai dans ${doc.nom}`);
  const etat = essaiChoisi.etat || {};
  const racineTours = join(essaiChoisi.dossier, 'tours');
  const tours = existsSync(racineTours)
    ? readdirSync(racineTours).filter((x) => /^\d{3,}$/.test(x)).sort((a, b) => Number(a) - Number(b)).map((n) => lireJson(join(racineTours, n, 'controle.json'))).filter(Boolean)
    : [];
  if (!tours.length) throw new Error(`l'essai ${essaiChoisi.id} de ${doc.nom} n'a aucun tour contrôlé`);

  const dd = dedoubleur();
  const versions = tours.map((t) => {
    const at = apercuEtTexte(doc.dossier, essaiChoisi.dossier, essaiChoisi.id, t.numero, doc.ext, dd.ajouter);
    return {
      numero: t.numero, numero_texte: pad(t.numero),
      statut: t.numero === 0 ? 'origine' : (t.statut || 'sans statut'),
      type: t.type || 'sans note', commentaire: t.note?.apporte || '', retire: t.note?.retire || '', motif: t.motif || '',
      ajoutes: t.mots?.ajoutes ?? 0, retires: t.mots?.retires ?? 0, total: t.mots?.total ?? null,
      fichier: Boolean(cheminVersion(essaiChoisi.dossier, t.numero, doc.ext)),
      ...at,
    };
  });
  const terminal = ARRETS_TERMINAUX.includes(etat.arret?.type);
  const donnees = {
    titre: doc.nom.replace(/^\d{8}-/, ''), essai: essaiChoisi.id,
    format: LIBELLE_FORMAT[doc.ext], ext: doc.ext,
    modele: etat.modele || null, effort: etat.effort || null, borne: etat.tours_max ?? null,
    arret: etat.arret ? LIBELLE_ARRET[etat.arret.type] || etat.arret.type : null,
    aveugle_terminal: terminal, plafond: etat.plafond?.limite ?? null,
    debut: etat.debut || null, fin: etat.arret?.date || null,
    versions, aveugle: versionsRetenues(numerosGardes(tours)),
  };
  return { donnees, images: dd.images };
}

/** Insère style, code de diff, données et images dans le gabarit ; rend le HTML autoportant. */
export function construirePage(donnees, images) {
  let page = readFileSync(GABARIT, 'utf8');
  const diff = readFileSync(DIFF, 'utf8').replace(/^export /gm, '');
  page = page
    .replace('/*__DIFF__*/', () => `\n${diff}\n`)
    .replace('/*__DONNEES__*/null', () => JSON.stringify(donnees).replace(/</g, '\\u003c'))
    .replace('/*__IMAGES__*/null', () => JSON.stringify(images).replace(/</g, '\\u003c'));
  return page;
}

function principal(argv) {
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const espace = opt('--espace');
  if (!espace) { console.error('usage : exporter-page.mjs --espace <e> [--essai opus-1] [--document <nom>] [--sortie <dossier>] [--jour AAAAMMJJ] [--prefixe <p>]'); return 2; }
  const dossierEspace = resolve(espace);
  if (!existsSync(dossierEspace)) { console.error(`espace introuvable : ${dossierEspace}`); return 2; }
  const d = new Date();
  const jour = (opt('--jour') || `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`).replaceAll('-', '');
  if (!/^\d{8}$/.test(jour)) { console.error(`--jour attendu AAAAMMJJ, reçu « ${jour} »`); return 2; }
  let donnees;
  let images;
  try {
    ({ donnees, images } = rassembler(dossierEspace, { essai: opt('--essai'), document: opt('--document') }));
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  const page = construirePage(donnees, images);
  const sortie = resolve(opt('--sortie') || join(process.cwd(), 'output', '06-comparaisons'));
  const prefixe = opt('--prefixe') || `${donnees.titre} - Comparateur make-it-better - `;
  mkdirSync(sortie, { recursive: true });
  let indice;
  try {
    indice = allouerIndice({ dossier: sortie, prefixe, jour, contenu: page, extension: '.html' });
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  const chemin = join(sortie, `${prefixe}${jour}${indice}.html`);
  writeFileSync(chemin, page, 'utf8');
  const sansImage = donnees.versions.filter((v) => v.apercu === 'texte' || v.apercu === 'absent').map((v) => v.numero_texte);
  console.log(JSON.stringify({
    chemin, octets: Buffer.byteLength(page), versions: donnees.versions.length,
    images: Object.keys(images).length, aveugle: donnees.aveugle,
    sans_apercu: sansImage, aveugle_terminal: donnees.aveugle_terminal,
  }));
  return 0;
}

const pad2 = (n) => String(n).padStart(2, '0');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(principal(process.argv.slice(2)));
