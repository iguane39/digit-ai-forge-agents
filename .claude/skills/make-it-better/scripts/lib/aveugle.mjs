// lib/aveugle.mjs — la revue à l'aveugle : quelles versions, quelles lettres, quel classement.
// Ce module ouvre classement.json : seuls serveur-versions.mjs et bilan.mjs l'importent, jamais lancer.mjs.
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import { dateIso, ecrireJson, lireJson } from './commun.mjs';
import { estVersionGardee } from './espace.mjs';

export const TOURS_CIBLES = [1, 5, 10, 20, 35, 50];
export const NUMERO_CIBLE_MINIMAL = 10;

export const numerosGardes = (tours) => tours.filter(estVersionGardee).map((t) => t.numero);

/** La dernière version gardée de numéro inférieur ou égal au tour cible ; l'origine existe toujours. */
export function derniereGardee(numeros, cible) {
  let trouve = 0;
  for (const n of numeros) if (n <= cible && n > trouve) trouve = n;
  return trouve;
}

/** L'origine et la version de chaque tour cible ; une version retenue pour 2 cibles ne paraît qu'une fois. */
export function versionsRetenues(numeros) {
  return [...new Set([0, ...TOURS_CIBLES.map((c) => derniereGardee(numeros, c))])].sort((a, b) => a - b);
}

/**
 * La version cible du verdict : celle du tour cible 20, de numéro 10 ou plus. Si elle est plus ancienne
 * mais qu'une version retenue plus tard atteint 10 (une longue suite de rejets et de « rien » autour du
 * tour 20), c'est la première de celles-là : elle seule a été classée. null s'il n'y en a aucune.
 */
export function versionCible(numeros) {
  const v20 = derniereGardee(numeros, 20);
  if (v20 >= NUMERO_CIBLE_MINIMAL) return v20;
  return versionsRetenues(numeros).find((n) => n >= NUMERO_CIBLE_MINIMAL) ?? null;
}

function suiteDepuisGraine(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** { A: numero, ... } : les lettres sont tirées au hasard, et la graine suffit à retrouver le tirage. */
export function lettresDepuisGraine(graine, versions) {
  const hasard = suiteDepuisGraine(graine);
  const melange = [...versions];
  for (let i = melange.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [melange[i], melange[j]] = [melange[j], melange[i]];
  }
  return Object.fromEntries(melange.map((n, i) => [String.fromCharCode(65 + i), n]));
}

export const fichierAveugle = (dossierEssai) => join(dossierEssai, 'aveugle.json');
export const fichierClassement = (dossierEssai) => join(dossierEssai, 'classement.json');

export const lireClassement = (dossierEssai) => lireJson(fichierClassement(dossierEssai));
export const lireAveugle = (dossierEssai) => lireJson(fichierAveugle(dossierEssai));

/** L'aveugle de l'essai, écrit à sa première ouverture : les lettres ne changent plus ensuite. */
export function ouvrirAveugle(dossierEssai, tours) {
  const existant = lireAveugle(dossierEssai);
  if (existant) return existant;
  const a = { graine: randomInt(1, 2 ** 31 - 1), versions: versionsRetenues(numerosGardes(tours)), leve: false, ouvert_le: dateIso() };
  ecrireJson(fichierAveugle(dossierEssai), a);
  return a;
}

/** Valide et écrit le classement : toutes les lettres, une fois chacune ; il ne se récrit pas. */
export function enregistrerClassement(dossierEssai, ordre, pertinentes = []) {
  const a = lireAveugle(dossierEssai);
  if (!a) return { erreur: 'aveugle non ouvert' };
  if (lireClassement(dossierEssai)) return { erreur: 'classement déjà enregistré : il ne se récrit pas', code: 409 };
  const lettres = Object.keys(lettresDepuisGraine(a.graine, a.versions));
  if (!Array.isArray(ordre) || ordre.length !== lettres.length || new Set(ordre).size !== lettres.length || !ordre.every((l) => lettres.includes(l))) {
    return { erreur: `classe toutes les lettres, une fois chacune : ${lettres.join(', ')}` };
  }
  const marquees = (Array.isArray(pertinentes) ? pertinentes : []).filter((l) => lettres.includes(l));
  const c = { ordre, pertinentes: marquees, date: dateIso() };
  ecrireJson(fichierClassement(dossierEssai), c);
  return { classement: c };
}

/** Lève l'aveugle : le marquage rejoint jugements.json, par version. */
export function leverAveugle(dossierEssai, ecrireJugement) {
  const a = lireAveugle(dossierEssai);
  const c = lireClassement(dossierEssai);
  if (!a || !c) return { erreur: 'classe d\'abord toutes les lettres : l\'aveugle ne se lève qu\'après le classement' };
  const lettres = lettresDepuisGraine(a.graine, a.versions);
  if (!a.leve) {
    for (const l of c.pertinentes || []) ecrireJugement(lettres[l], true, 'aveugle');
    ecrireJson(fichierAveugle(dossierEssai), { ...a, leve: true, leve_le: dateIso() });
  }
  return { lettres, classement: c };
}

/** Rangs par numéro de version : 1 = la meilleure. */
export function rangsDeVersions(dossierEssai) {
  const a = lireAveugle(dossierEssai);
  const c = lireClassement(dossierEssai);
  if (!a || !c) return null;
  const lettres = lettresDepuisGraine(a.graine, a.versions);
  const rangs = new Map();
  c.ordre.forEach((l, i) => rangs.set(lettres[l], i + 1));
  return { rangs, premiere: lettres[c.ordre[0]] };
}
