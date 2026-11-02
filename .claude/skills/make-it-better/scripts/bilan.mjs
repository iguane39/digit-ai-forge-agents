#!/usr/bin/env node
// bilan.mjs — applique la conclusion fixée d'avance et écrit bilan.md dans l'espace, sans contenu ni nom
// de document : une seule comparaison par document, pour ne pas multiplier les chances de réussir par
// hasard. Le verdict lit le seul essai opus-1 ; un essai Sonnet ou un 2e essai restent descriptifs.
//   node bilan.mjs --espace <d>                 écrit <d>/bilan.md
//   node bilan.mjs --espace <d> --restants <n>  dit, sans rien écrire, si les documents suivants attendent resetsAt
// Exit : 0 fait · 2 usage ou espace sans document.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { derniereGardee, numerosGardes, rangsDeVersions, versionCible } from './lib/aveugle.mjs';
import { dateIso, LIBELLE_FORMAT } from './lib/commun.mjs';
import { ARRETS_TERMINAUX, cheminVersion, LIBELLE_ARRET, listerDocuments, lireTours } from './lib/espace.mjs';
import { jugerFichier } from './oracle-faits-sources.mjs';

const fr = (x, d = 1) => x.toFixed(d).replace('.', ',');

function queueBinomiale(n, k) {
  const c = (a, b) => {
    let r = 1;
    for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i;
    return r;
  };
  let s = 0;
  for (let i = k; i <= n; i++) s += c(n, i);
  return s / 2 ** n;
}
export const RISQUE_5_SUR_6 = queueBinomiale(6, 5);
export const RISQUE_5_SUR_5 = queueBinomiale(5, 5);

function mesureEssai(tours) {
  const joues = tours.filter((t) => t.numero > 0);
  let consomme = 0;
  let precedent = null;
  let dernier = null;
  for (const t of joues) {
    if (!t.quota) continue;
    if (precedent !== null) consomme += Math.max(0, t.quota.utilization - precedent);
    precedent = t.quota.utilization;
    dernier = t.quota;
  }
  return { joues: joues.length, duree_ms: joues.reduce((s, t) => s + (t.duree_ms || 0), 0), quota: consomme, dernier };
}

/** Juge un essai : statut favorable ou défavorable, ou raison de ne pas le compter. */
export function jugerEssai(doc, essai) {
  const tours = lireTours(essai.dossier);
  const arret = essai.etat.arret?.type || null;
  const numeros = numerosGardes(tours);
  const v1 = derniereGardee(numeros, 1);
  const cible = versionCible(numeros);
  const mesure = mesureEssai(tours);
  const mots = (n) => tours.find((t) => t.numero === n)?.mots?.total ?? null;
  const r = {
    essai: essai.id, termine: false, statut: null, motif: null, v1, cible, mesure,
    mots: { origine: mots(0), tour1: mots(v1), cible: cible === null ? null : mots(cible) }, premiere: null,
  };
  if (!ARRETS_TERMINAUX.includes(arret)) {
    if (essai.etat.pause) r.blocage = `en pause : ${essai.etat.pause.type === 'sans-mesure' ? 'le quota n\'est plus mesuré' : 'quota à 0,80 ou statut non autorisé'}`;
    else if (arret) r.blocage = `arrêté par ${LIBELLE_ARRET[arret] || arret}`;
    else r.blocage = 'essai en cours ou interrompu';
    return r;
  }
  const classe = rangsDeVersions(essai.dossier);
  if (!classe) {
    r.blocage = 'classement non enregistré';
    return r;
  }
  r.termine = true;
  r.premiere = classe.premiere;
  if (cible === null) {
    r.statut = 'défavorable';
    r.motif = arret === 'borne' ? 'borne atteinte avant le tour 10' : LIBELLE_ARRET[arret];
    return r;
  }
  const { rangs } = classe;
  const devantOrigine = rangs.get(cible) < rangs.get(0);
  const devantTour1 = v1 === 0 || rangs.get(cible) < rangs.get(v1);
  const f = cheminVersion(essai.dossier, cible, doc.ext);
  const oracle = f ? jugerFichier(f, doc.origine, join(doc.dossier, 'document', 'sources')) : { verdict: 'SKIP', motif: 'fichier de la version cible absent' };
  if (oracle.verdict === 'FAIL') {
    r.statut = 'défavorable';
    r.motif = 'version cible en échec à oracle-faits-sources';
    return r;
  }
  if (oracle.verdict !== 'PASS') {
    r.termine = false;
    r.blocage = 'oracle-faits-sources non joué sur la version cible : outil ou source à rétablir'; // jamais le motif : il peut nommer une source
    return r;
  }
  if (devantOrigine && devantTour1) {
    r.statut = 'favorable';
    r.motif = v1 === 0 ? 'version cible classée devant l\'origine, le tour cible 1 étant l\'origine' : 'version cible classée devant le tour cible 1 et devant l\'origine';
  } else {
    r.statut = 'défavorable';
    r.motif = !devantOrigine ? 'version cible classée derrière l\'origine' : 'version cible classée derrière le tour cible 1';
  }
  return r;
}

/** La conclusion fixée d'avance, à partir du nombre de documents terminés et de favorables. */
export function conclure(termines, favorables) {
  if (termines < 5) return 'non concluant';
  if ((termines === 6 && favorables >= 5) || (termines === 5 && favorables === 5)) return 'intérêt';
  if ((termines === 5 || termines === 6) && favorables <= 1) return 'pas d\'intérêt démontré';
  return 'non concluant';
}

/** Tout le calcul du bilan, sans écriture : le self-test le lit directement. */
export function calculerBilan(espace) {
  const docs = listerDocuments(espace);
  const lignes = docs.map((doc, i) => {
    const opus1 = doc.essais.find((e) => e.id === 'opus-1');
    const jugement = opus1 ? jugerEssai(doc, opus1) : { essai: 'opus-1', termine: false, blocage: 'essai opus-1 absent', mesure: { joues: 0, duree_ms: 0, quota: 0 }, mots: {} };
    const autres = doc.essais.filter((e) => e.id !== 'opus-1').map((e) => jugerEssai(doc, e));
    return { rang: i + 1, ext: doc.ext, jugement, autres };
  });
  const termines = lignes.filter((l) => l.jugement.termine);
  const favorables = termines.filter((l) => l.jugement.statut === 'favorable');
  const initial = conclure(termines.length, favorables.length);
  let verdict = initial;
  let ecart = 'Écart entre 2 essais : non mesuré, le premier document n\'a pas de 2e essai classé.';
  let desaccord = false;
  const premier = lignes[0];
  const opus2 = premier?.autres.find((a) => a.essai === 'opus-2');
  if (opus2?.termine && premier.jugement.termine) {
    if (opus2.statut !== premier.jugement.statut) {
      desaccord = true;
      ecart = `Écart entre 2 essais : les essais opus-1 et opus-2 du document 1 n'ont pas le même statut (${premier.jugement.statut}, ${opus2.statut}).`;
      if (verdict === 'intérêt') {
        verdict = 'non concluant';
        ecart += ' Le verdict « intérêt » devient « non concluant ».';
      }
    } else {
      ecart = `Écart entre 2 essais : les essais opus-1 et opus-2 du document 1 ont le même statut (${opus2.statut}).`;
    }
  }
  return { lignes, termines: termines.length, favorables: favorables.length, verdict, initial, ecart, desaccord };
}

const min = (ms) => (ms ? `${Math.round(ms / 60000)} min` : 'non mesurée');
const titreVerdict = { intérêt: 'Intérêt', 'pas d\'intérêt démontré': 'Pas d\'intérêt démontré', 'non concluant': 'Non concluant' };

export function ecrireBilanMd(b) {
  const l = [];
  l.push('# Bilan du test make-it-better', '');
  l.push(`Écrit le ${dateIso().slice(0, 10)}. Le porteur classe seul ; aucun modèle n'a jugé ses versions.`, '');
  l.push('## Verdict', '');
  l.push(`**${titreVerdict[b.verdict]}** : ${b.favorables} documents favorables sur ${b.termines} terminés.`, '');
  if (b.termines < 5) l.push('Moins de 5 documents terminés : le test reste non concluant, quel que soit le compte des favorables.', '');
  if (b.termines > 6) l.push('Plus de 6 documents terminés : le protocole n\'a pas fixé de seuil au-delà, le test reste non concluant.', '');
  l.push(`${b.ecart}`, '');
  l.push('C\'est une indication, pas une preuve.', '');
  l.push('## Par document', '');
  l.push('| Document | Format | Statut | Motif | Tour classé premier | Mots de l\'origine | Mots du tour cible 1 | Mots de la version cible | Durée | Quota consommé |');
  l.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const d of b.lignes) {
    const j = d.jugement;
    const format = `${LIBELLE_FORMAT[d.ext] || 'inconnu'}${d.ext === 'pdf' ? ' (changements de ligne seulement)' : ''}`;
    const tete = j.termine ? j.statut : 'non compté';
    const motif = j.termine ? j.motif : j.blocage;
    const premiere = j.premiere === null || j.premiere === undefined ? '—' : j.premiere === 0 ? 'origine' : String(j.premiere);
    l.push(`| ${d.rang} | ${format} | ${tete} | ${motif} | ${premiere} | ${j.mots.origine ?? '—'} | ${j.mots.tour1 ?? '—'} | ${j.mots.cible ?? '—'} | ${min(j.mesure.duree_ms)} | ${fr(j.mesure.quota, 3)} |`);
  }
  l.push('');
  const bloques = b.lignes.filter((d) => !d.jugement.termine);
  if (bloques.length) {
    l.push('## Documents non comptés', '');
    for (const d of bloques) l.push(`- Document ${d.rang} : ${d.jugement.blocage}. Il ne compte pas tant que \`--reprendre\` et le classement ne l'ont pas mené à son arrêt. Le porteur en reçoit l'annonce.`);
    l.push('');
  }
  const descriptifs = b.lignes.flatMap((d) => d.autres.map((a) => ({ rang: d.rang, ...a })));
  if (descriptifs.length) {
    l.push('## Essais descriptifs, hors verdict', '');
    for (const a of descriptifs) l.push(`- Document ${a.rang}, essai ${a.essai} : ${a.termine ? a.statut : `non compté, ${a.blocage}`}.`);
    l.push('');
  }
  l.push('## Risque et limites', '');
  l.push(`Sous l'hypothèse d'une chance sur 2 par document, soit le cas prudent où l'origine est toujours battue et où seul le tour 1 reste à départager, 5 sur 6 ou plus arrive ${fr(RISQUE_5_SUR_6 * 100)} % du temps, et 5 sur 5 arrive ${fr(RISQUE_5_SUR_5 * 100)} % du temps.`, '');
  const pdf = b.lignes.filter((d) => d.ext === 'pdf').map((d) => d.rang);
  for (const lim of [
    'Un seul juge.',
    'Un seul essai compté par document.',
    'L\'origine reste reconnaissable, et l\'aveugle reste partiel : le juge peut reconnaître l\'origine ou une longueur inhabituelle.',
    'Une préférence possible pour le texte plus long.',
    `Des documents PDF limités à des changements de ligne${pdf.length ? ` : document${pdf.length > 1 ? 's' : ''} ${pdf.join(', ')}` : ' : aucun dans ce test'}.`,
    'Des faits sans chiffre ni nom propre que l\'oracle ne contrôle pas.',
    'Un arrêt seul du modèle avant le tour 10 compté défavorable, ce qui tire le verdict vers « pas d\'intérêt démontré ».',
  ]) l.push(`- ${lim}`);
  l.push('');
  return l.join('\n');
}

/** Le besoin de quota du test : quota par tour × --tours × documents restants, contre 0,80 moins utilization. */
export function planDeQuota(espace, restants) {
  const doc = listerDocuments(espace)[0];
  const essai = doc?.essais.find((e) => e.id === 'opus-1');
  if (!essai) return { erreur: 'aucun essai opus-1 : lance d\'abord le premier document, seul' };
  const m = mesureEssai(lireTours(essai.dossier));
  if (!m.joues || !m.dernier) return { erreur: 'quota non mesuré sur le premier document' };
  const quotaParTour = m.quota / m.joues;
  const tours = essai.etat.tours_max;
  const besoin = quotaParTour * tours * restants;
  const marge = 0.8 - m.dernier.utilization;
  return {
    duree_par_tour_s: Math.round(m.duree_ms / m.joues / 1000), quota_par_tour: quotaParTour, tours, restants, besoin, marge, utilization: m.dernier.utilization, resetsAt: m.dernier.resetsAt,
    attendre_resets: besoin > marge, besoin_un_document: quotaParTour * tours, deuxieme_essai_possible: m.dernier.utilization < 0.8 - quotaParTour * tours,
  };
}

function principal(argv) {
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const espace = opt('--espace');
  if (!espace) {
    console.error('usage : bilan.mjs --espace <d> [--restants <n>]');
    return 2;
  }
  const dossier = resolve(espace);
  if (!listerDocuments(dossier).length) {
    console.error(`aucun document dans ${dossier} : un espace porte document/, ou des sous-dossiers qui en portent un`);
    return 2;
  }
  if (argv.includes('--restants')) {
    const n = Number(opt('--restants'));
    if (!Number.isInteger(n) || n < 0) {
      console.error('--restants attend un entier');
      return 2;
    }
    const p = planDeQuota(dossier, n);
    if (p.erreur) {
      console.error(p.erreur);
      return 2;
    }
    console.log(`Durée par tour : ${p.duree_par_tour_s} s. Quota par tour : ${fr(p.quota_par_tour, 4)}.`);
    // La CLI rend utilization à 0,01 près : sur peu de tours, l'écart peut valoir 0 sans que rien ne soit gratuit.
    if (p.quota_par_tour === 0) console.log('Écart de utilization nul sur ces tours : la mesure, au centième, ne le voit pas encore. Le besoin prévu vaut 0 par défaut de mesure, pas par absence de coût.');
    console.log(`Besoin prévu : ${fr(p.quota_par_tour, 4)} × ${p.tours} tours × ${p.restants} documents = ${fr(p.besoin, 3)}. Marge : 0,80 − ${fr(p.utilization, 2)} = ${fr(p.marge, 2)}.`);
    console.log(p.attendre_resets ? `Les documents suivants attendent resetsAt entre eux (${new Date(p.resetsAt * 1000).toISOString()}) : le porteur reçoit l'annonce, rien d'autre ne change.` : 'Les documents suivants s\'enchaînent sans attendre.');
    console.log(`2e essai du premier document, après les autres : ${p.deuxieme_essai_possible ? 'possible si utilization reste alors' : 'pas maintenant : il faut utilization'} sous 0,80 moins le besoin d'un document (${fr(p.besoin_un_document, 3)}).`);
    return 0;
  }
  const b = calculerBilan(dossier);
  const sortie = join(dossier, 'bilan.md');
  writeFileSync(sortie, ecrireBilanMd(b), 'utf8');
  console.log(`${titreVerdict[b.verdict]} : ${b.favorables} favorables sur ${b.termines} terminés. Écrit : ${sortie}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(principal(process.argv.slice(2)));
