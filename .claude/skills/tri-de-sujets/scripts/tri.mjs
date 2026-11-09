#!/usr/bin/env node
// tri.mjs — les verbes outillés du skill tri-de-sujets : normaliser, soustraire, verdict, tableau.
// Aucun verbe ne note à la place du modèle : les notes entrent, le script ne fait que les sommer
// et appliquer la règle. Le jugement du résultat revient à oracle-tri-de-sujets (quality-oracles),
// qui réécrit cette règle de son côté.
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Décision humaine D-125 (a) du 02/11/2026, après le back-test sur 14 études : 15 lançait 2 études
// et en manquait 9 ; 14 en lance 6, dont 5 utiles. Réglage calculé sur ces mêmes 14 sujets.
export const SCORE_MINIMAL = 14;

const decoder = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

// Une adresse ne garde jamais sa requête : c'est là que vivent les signatures de session.
export function adresseCanonique(u) {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host}${x.pathname}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function depuisPageFavoris(html) {
  const entrees = [];
  const morceaux = html.split('data-e2e="favorites-item"').slice(1);
  for (const m of morceaux) {
    const l = /https:\/\/www\.tiktok\.com\/@([^/"'\s]+)\/(video|photo)\/(\d+)/.exec(m);
    if (!l) continue;
    const alt = /<img[^>]*?alt="([^"]*)"/.exec(m);
    const src = /<img[^>]*?src="(\.\/[^"]+)"/.exec(m);
    let couverture = null;
    if (src) {
      couverture = src[1].replace(/&amp;/g, '&');
      try { couverture = decodeURI(couverture); } catch { /* chemin laissé tel quel */ }
    }
    entrees.push({ id: l[3], type: l[2], auteur: l[1], texte: alt ? decoder(alt[1]) : '', lien: `https://www.tiktok.com/@${l[1]}/${l[2]}/${l[3]}`, couverture });
  }
  return entrees;
}

function depuisPageGenerique(html) {
  const entrees = [];
  for (const m of html.matchAll(/<a\b[^>]*?href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const lien = adresseCanonique(m[1].replace(/&amp;/g, '&'));
    const texte = decoder(m[2].replace(/<[^>]+>/g, ' '));
    if (lien) entrees.push({ id: lien, type: 'lien', texte, lien });
  }
  return entrees;
}

function depuisTexte(t) {
  const entrees = [];
  for (const brut of t.split(/\r?\n/)) {
    const l = brut.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    if (!l || l.startsWith('#')) continue;
    const u = /https?:\/\/\S+/.exec(l);
    if (u) {
      const lien = adresseCanonique(u[0]);
      entrees.push({ id: lien || slug(l), type: 'lien', texte: l.replace(u[0], '').trim(), lien });
    } else {
      entrees.push({ id: slug(l), type: 'sujet', texte: l, lien: null });
    }
  }
  return entrees;
}

function depuisJsonl(t) {
  return t.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
    const o = JSON.parse(l);
    const lien = o.lien || o.url ? adresseCanonique(o.lien || o.url) : null;
    const texte = String(o.texte || o.titre || o.sujet || '');
    const id = String(o.id || lien || slug(texte) || `ligne-${i + 1}`);
    return { id, type: o.type || (lien ? 'lien' : 'sujet'), texte, lien };
  });
}

export function normaliser(contenu, format = 'auto') {
  let f = format;
  if (f === 'auto') {
    if (/<html|<!doctype/i.test(contenu.slice(0, 2000))) f = 'page';
    else if (contenu.trimStart().startsWith('{')) f = 'jsonl';
    else f = 'texte';
  }
  let brutes;
  let hors_liste = 0;
  if (f === 'page') {
    brutes = depuisPageFavoris(contenu);
    if (brutes.length) {
      // Les liens hors des blocs de favoris viennent d'un autre panneau de la page, notifications
      // comprises : le tri du 19/10 en a compté 7 comme des favoris.
      const ids = new Set(brutes.map((e) => e.id));
      const autres = new Set([...contenu.matchAll(/\/(?:video|photo)\/(\d+)/g)].map((m) => m[1]).filter((id) => !ids.has(id)));
      hors_liste = autres.size;
    } else {
      brutes = depuisPageGenerique(contenu);
    }
  } else if (f === 'jsonl') brutes = depuisJsonl(contenu);
  else brutes = depuisTexte(contenu);
  const vus = new Map();
  let doublons = 0;
  for (const e of brutes) {
    if (vus.has(e.id)) doublons++;
    else vus.set(e.id, e);
  }
  return { schema: 'tri-de-sujets/entrees@1', format: f, entrees: [...vus.values()], doublons, hors_liste };
}

// Retire ce qu'un rangement ou un tri antérieur désigne comme analysé. Un contenu rangé sans être
// qualifié n'est pas analysé : il revient, sinon il ne le serait jamais.
export function soustraire(entrees, sources, reprendre = ['non qualifié']) {
  const garde = [];
  const retires = [];
  for (const e of entrees) {
    let deja = false;
    for (const { nom, contenu } of sources) {
      if (nom.endsWith('.json')) {
        const r = JSON.parse(contenu);
        const trouve = (r.entrees || []).find((x) => String(x.id) === String(e.id));
        if (trouve && !reprendre.includes(trouve.etat)) deja = true;
      } else {
        const ligne = contenu.split(/\r?\n/).find((l) => l.includes(String(e.id)));
        if (ligne && !reprendre.some((t) => ligne.includes(t))) deja = true;
      }
    }
    (deja ? retires : garde).push(e);
  }
  return { garde, retires };
}

export function decider(l) {
  if (l.ecarte) return { verdict: 'À écarter' };
  if (l.deja_couvert) return { verdict: 'Sans suite' };
  const { G, N, P, C } = l.notes_chiffres || {};
  for (const [k, v] of Object.entries({ G, N, P, C })) {
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error(`note ${k} absente ou hors de 1 à 5 : ${l.element}`);
  }
  const somme = 2 * G + N + P + C;
  const notes = `G${G} N${N} P${P} C${C} = ${somme}`;
  if (somme < SCORE_MINIMAL) return { verdict: 'Sans suite', notes };
  if (l.seuil && l.seuil !== 'non' && l.question) return { verdict: 'Étude poussée', notes };
  if (C >= 4 && l.mesure) return { verdict: 'Essai court', notes };
  return { verdict: 'Décision directe', notes };
}

export function rendreTableau(rangement, { motif = 'entier', colonne = 'Vidéos' } = {}) {
  const lignes = rangement.lignes || [];
  if (!lignes.length) return 'Rien n\'a été retenu : aucun tableau.\n';
  const entrees = new Map((rangement.entrees || []).map((e) => [String(e.id), e]));
  const avecMotif = motif !== 'aucun';
  const tete = `| Élément abordé | ${colonne} | Pertinence d'une étude |${avecMotif ? ' Motif |' : ''}`;
  const sep = `|---|---|---|${avecMotif ? '---|' : ''}`;
  const corps = lignes.map((l) => {
    const liens = (l.ids || []).map((id) => {
      const e = entrees.get(String(id));
      return e && e.lien ? `[${e.auteur ? '@' + e.auteur : 'source'}](${e.lien})` : String(id);
    }).join(', ');
    const m = motif === 'existant' ? (l.existant || 'aucun existant trouvé') : l.motif;
    return `| ${l.element} | ${liens} | ${l.verdict} |${avecMotif ? ` ${m} |` : ''}`;
  });
  return [tete, sep, ...corps].join('\n') + '\n';
}

function option(a, nom) {
  const i = a.indexOf(nom);
  return i >= 0 ? a[i + 1] : undefined;
}

function principal(argv) {
  const [verbe, ...a] = argv;
  const usage = 'usage : tri.mjs normaliser <liste> [--format auto|page|texte|jsonl] | soustraire <entrees.json> --deja <fichier> [--reprendre "a,b"] | verdict <lignes.json> | tableau <rangement.json> [--motif entier|existant|aucun] [--colonne Sources]';
  const fichier = a.find((x, i) => !x.startsWith('--') && !(a[i - 1] || '').startsWith('--'));
  if (!verbe || !fichier || !existsSync(fichier)) {
    process.stderr.write(usage + '\n');
    return 2;
  }
  // Une redirection PowerShell écrit une marque d'ordre d'octets que JSON.parse refuse.
  const lire = (f) => readFileSync(f, 'utf8').replace(/^﻿/, '');
  const contenu = lire(fichier);
  if (verbe === 'normaliser') {
    const r = normaliser(contenu, option(a, '--format') || 'auto');
    if (!r.entrees.length) r.message = 'liste vide : rien à trier, aucun tableau';
    process.stdout.write(JSON.stringify(r, null, 1) + '\n');
    return 0;
  }
  if (verbe === 'soustraire') {
    const sources = [];
    a.forEach((x, i) => {
      if (x === '--deja') sources.push({ nom: a[i + 1], contenu: lire(a[i + 1]) });
    });
    const reprendre = (option(a, '--reprendre') || 'non qualifié').split(',').map((s) => s.trim());
    const r = soustraire(JSON.parse(contenu).entrees, sources, reprendre);
    process.stdout.write(JSON.stringify({ schema: 'tri-de-sujets/entrees@1', entrees: r.garde, retires: r.retires.length }, null, 1) + '\n');
    return 0;
  }
  if (verbe === 'verdict') {
    const lignes = JSON.parse(contenu).map((l) => ({ ...l, ...decider(l) }));
    process.stdout.write(JSON.stringify(lignes, null, 1) + '\n');
    return 0;
  }
  if (verbe === 'tableau') {
    process.stdout.write(rendreTableau(JSON.parse(contenu), { motif: option(a, '--motif') || 'entier', colonne: option(a, '--colonne') || 'Vidéos' }));
    return 0;
  }
  process.stderr.write(usage + '\n');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exit(principal(process.argv.slice(2)));
