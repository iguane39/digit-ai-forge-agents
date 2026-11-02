// lib/espace.mjs — lire un espace : ses documents, ses essais, ses tours. Aucune écriture ici, et
// aucun accès à classement.json : lancer.mjs importe ce module (voir lib/aveugle.mjs pour le reste).
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { formatDe, lireJson, pad } from './commun.mjs';

/** Un espace est un document, ou le dossier parent de plusieurs : les deux se servent et se bilantent. */
export function listerDocuments(espace) {
  if (!existsSync(espace)) return [];
  if (existsSync(join(espace, 'document'))) return [documentDe(espace)];
  const out = [];
  for (const e of readdirSync(espace, { withFileTypes: true })) {
    if (e.isDirectory() && existsSync(join(espace, e.name, 'document'))) out.push(documentDe(join(espace, e.name)));
  }
  return out.sort((a, b) => (a.debut || '9999').localeCompare(b.debut || '9999') || a.nom.localeCompare(b.nom));
}

function documentDe(dossier) {
  const origine = trouverOrigine(dossier);
  const essais = listerEssais(dossier);
  const premier = essais.find((e) => e.id === 'opus-1') || essais[0];
  return { nom: basename(dossier), dossier, ext: origine ? formatDe(origine) : null, origine, essais, debut: premier?.etat?.debut || null };
}

export function trouverOrigine(dossier) {
  const d = join(dossier, 'document');
  if (!existsSync(d)) return null;
  const f = readdirSync(d).find((n) => /^origine\./i.test(n) && formatDe(n));
  return f ? join(d, f) : null;
}

export function listerEssais(dossier) {
  const racine = join(dossier, 'essais');
  if (!existsSync(racine)) return [];
  return readdirSync(racine, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[a-z]+-\d+$/.test(e.name))
    .map((e) => ({ id: e.name, dossier: join(racine, e.name), etat: lireJson(join(racine, e.name, 'etat.json'), {}) }))
    .sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true }));
}

/** Les tours contrôlés, origine comprise, du plus ancien au plus récent. */
export function lireTours(dossierEssai) {
  const racine = join(dossierEssai, 'tours');
  if (!existsSync(racine)) return [];
  const out = [];
  for (const n of readdirSync(racine).filter((x) => /^\d{3,}$/.test(x)).sort((a, b) => Number(a) - Number(b))) {
    const c = lireJson(join(racine, n, 'controle.json'));
    if (c) out.push(c);
  }
  return out;
}

export const dossierTour = (dossierEssai, numero) => join(dossierEssai, 'tours', pad(numero));

export function cheminVersion(dossierEssai, numero, ext) {
  const f = join(dossierTour(dossierEssai, numero), `document.${ext}`);
  return existsSync(f) ? f : null;
}

/** Une version : l'origine, ou un tour gardé qui a changé le document. Une réponse « rien » n'en est pas une. */
export const estVersionGardee = (t) => t.numero === 0 || (t.statut === 'gardee' && t.type !== 'rien');

/** La précédente version gardée : ce que « Comparer » met en face de la version choisie. */
export function precedenteGardee(tours, numero) {
  let trouvee = null;
  for (const t of tours) {
    if (t.numero >= numero) break;
    if (estVersionGardee(t)) trouvee = t;
  }
  return trouvee;
}

export const ARRETS_TERMINAUX = ['2-rien', 'borne', '3-rejets'];
export const LIBELLE_ARRET = {
  '2-rien': '2 rien de suite',
  borne: 'la borne de tours',
  '3-rejets': '3 rejets de suite',
  identite: 'contrôle d\'identité',
  overage: 'dépassement de l\'abonnement',
  modele: 'contrôle du modèle',
  dependance: 'dépendance absente',
};
