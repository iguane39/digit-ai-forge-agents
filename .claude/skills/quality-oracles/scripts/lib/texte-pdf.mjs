// lib/texte-pdf — LE TEXTE D'UN PDF SE LIT PAR PLUSIEURS LECTEURS (TF-2367, 10/11/2026).
//
// LE FAIT, chez un produit, le 28/09/2026 : sur un CV mis en page, PyMuPDF rendait les pastilles
// espacées lettre à lettre (« D ATA B R I C K S ») et plaçait les intitulés de poste après leurs
// missions ; pypdf et pdftotext lisaient « DATABRICKS », et pdftotext rendait l'ordre visuel. Suites
// de lettres isolées mesurées : PyMuPDF 14, pypdf 0, pdftotext 0. Le constat « outils introuvables par
// une recherche » a failli partir chez la personne sur la foi du seul PyMuPDF : un contrôle de
// lisibilité joué avec un seul lecteur mesure le lecteur, pas le document.
//
// LA RÈGLE, pour tout oracle qui lit le texte d'un PDF : il le lit par TROIS lecteurs (pypdf et PyMuPDF
// par lib/lire_pdf.py, pdftotext en exécutable), et n'écrit un DÉFAUT DE LISIBILITÉ que si TOUS les
// lecteurs disponibles échouent ; un désaccord se dit en information, il n'accuse pas le document. Avec
// un seul lecteur disponible, un échec reste un AVERTISSEMENT « non confirmé ». Mesuré le 10/11/2026
// sur un titre posé avec un espacement de caractères : pypdf et pdftotext lisent « DATABRICKS POWER
// BI », PyMuPDF « D A T A B R I C K S » ; posé lettre par lettre, aucun des trois ne le lit d'un tenant.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePython } from './python.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const LECTEURS = ['pypdf', 'pymupdf', 'pdftotext'];

/** Lit un PDF : structure (pages, polices, producteur) et texte page par page de chaque lecteur. */
export function lirePdf(fichier, { timeout = 180000 } = {}) {
  const py = resolvePython();
  let s = { ok: false, erreur: 'python indisponible : structure et lecteurs pypdf et PyMuPDF non joués', pages: [], polices: [], lecteurs: {} };
  if (py) {
    const r = spawnSync(py[0], [...py.slice(1), path.join(ICI, 'lire_pdf.py'), fichier],
      { encoding: 'utf8', timeout, maxBuffer: 256e6, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    try { s = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); }
    catch { s = { ...s, erreur: 'lecteur Python sans sortie lisible : ' + String(r.stderr || r.error || '').trim().slice(0, 300) }; }
  } else {
    s.lecteurs = { pypdf: { ok: false, erreur: 'python indisponible' }, pymupdf: { ok: false, erreur: 'python indisponible' } };
  }
  const t = spawnSync('pdftotext', ['-enc', 'UTF-8', fichier, '-'], { encoding: 'utf8', timeout, maxBuffer: 256e6 });
  s.lecteurs = s.lecteurs || {};
  s.lecteurs.pdftotext = t.error ? { ok: false, erreur: 'pdftotext introuvable ou en échec : ' + (t.error.code || t.error.message) }
    : t.status !== 0 ? { ok: false, erreur: 'pdftotext en échec : ' + String(t.stderr || '').trim().slice(0, 200) }
      : { ok: true, pages: String(t.stdout || '').split('\f').filter((p, i, a) => i < a.length - 1 || p.trim()) };
  return s;
}

const plier = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Une suite de lettres isolées : quatre lettres au moins, chacune seule entre deux espaces (« D A T A »).
const RX_LETTRES_ESPACEES = /(?:^|\s)(?:\p{L}\s){3,}\p{L}(?=\s|$)/gu;

/** Les mesures de lisibilité d'un lecteur : texte, titres attendus trouvés, suites de lettres espacées. */
export function mesurer(texte, titres = []) {
  const brut = String(texte || '');
  const plie = plier(brut);
  return {
    caracteres: brut.replace(/\s/g, '').length,
    titres: Object.fromEntries(titres.map(t => [t, plie.includes(plier(t))])),
    lettres_espacees: (brut.replace(/\s+/g, ' ').match(RX_LETTRES_ESPACEES) || []).length,
  };
}

/**
 * Le verdict de lisibilité de PLUSIEURS lecteurs (TF-2367). Rend { disponibles, mesures, constats } :
 * un constat `bloquant` n'est écrit que si TOUS les lecteurs disponibles (deux au moins) échouent sur le
 * même critère ; avec un seul lecteur, un échec est un `warn` « non confirmé » ; un désaccord est `info`.
 */
export function lisibilite(lecteurs, titres = [], { base = 'document.pdf', regle = 'P4' } = {}) {
  const disponibles = LECTEURS.filter(n => lecteurs[n] && lecteurs[n].ok);
  const mesures = Object.fromEntries(disponibles.map(n => [n, mesurer((lecteurs[n].pages || []).join('\n'), titres)]));
  const constats = [];
  const seul = disponibles.length < 2;
  const sev = seul ? 'warn' : 'bloquant';
  const suffixe = seul ? ` — un seul lecteur disponible (${disponibles.join(', ') || 'aucun'}) : défaut NON CONFIRMÉ` : '';
  const juger = (critere, echoue, libelle) => {
    const ko = disponibles.filter(n => echoue(mesures[n]));
    if (!disponibles.length) return;
    if (ko.length === disponibles.length) constats.push({ sev, regle, msg: `${regle} — ${libelle} : ${ko.join(', ')} échoue(nt), soit tous les lecteurs disponibles${suffixe}`, where: base });
    else if (ko.length) constats.push({ sev: 'info', regle, msg: `${regle} — ${libelle} : ${ko.join(', ')} échoue(nt), ${disponibles.filter(n => !ko.includes(n)).join(', ')} réussi(ssen)t — désaccord des lecteurs, pas un défaut du document (TF-2367)`, where: base });
  };
  juger('texte', m => m.caracteres < 20, 'texte extractible');
  for (const t of titres) juger('titre', m => !m.titres[t], `titre attendu « ${t} »`);
  // Les lettres espacées accusent la mise en page même quand tous les lecteurs s'accordent : un avertissement,
  // jamais un blocage — un titre en capitales espacées peut être un choix graphique.
  const espaces = disponibles.filter(n => mesures[n].lettres_espacees > 0);
  if (disponibles.length && espaces.length === disponibles.length) constats.push({ sev: 'warn', regle, msg: `${regle} — suites de lettres espacées lues par tous les lecteurs (${espaces.map(n => `${n} ${mesures[n].lettres_espacees}`).join(', ')}) : le texte se lit mal à la recherche`, where: base });
  else if (espaces.length) constats.push({ sev: 'info', regle, msg: `${regle} — suites de lettres espacées chez ${espaces.map(n => `${n} ${mesures[n].lettres_espacees}`).join(', ')} seulement : ${disponibles.filter(n => !espaces.includes(n)).map(n => `${n} 0`).join(', ')} — défaut du lecteur, pas du document (TF-2367)`, where: base });
  return { disponibles, mesures, constats };
}
