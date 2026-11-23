#!/usr/bin/env node
// oracle-boucle-l99 — Domaine « Mode boucle de prompt-analyzer-l99 : journal de passes jugé ».
// Standard §3 de quality-oracles : déterministe, checklist canonique, artefact réel, non_juge
// déclaré, sortie localisante, autoportant, prouvé par fixtures (--self-test).
//
// TF-1831 (16/10/2026). Le score « projeté » du Ch8 valait 86 à 94 sur 28 analyses, quel que soit
// le départ ; renotés à l'aveugle, 5 prompts réécrits ont perdu de 6 à 12 points. Le mode boucle
// (references/boucle.md) ne vaut que si le juge n'est pas l'auteur, si les défauts du juge sont
// recomptés, et si l'arrêt suit la règle figée. Cet oracle lit le journal que la boucle écrit et
// vérifie qu'elle a tenu ces règles. Il ne relit pas le prompt.
//
// CHECKLIST CANONIQUE (unité jugée : la passe, ou le journal pour B1, B6, B7) :
//   B1  arbitre figé présent : rubrique, arrêt « 0 bloquant et 0 majeur », gain_min, borne, garde.
//   B2  chaque passe est relue par un agent nommé, aveugle, avec ses interdits écrits.
//   B3  chaque défaut bloquant ou majeur, retenu ou écarté, porte son recompte (commande + résultat).
//   B4  garde de longueur : une passe qui grossit de plus de la garde sans clore un majeur est rejetée.
//   B5  arrêt conforme : la raison déclarée est vraie sur la passe d'arrêt, aucune passe ne la suit,
//       et aucune passe antérieure n'atteignait déjà « 0 bloquant et 0 majeur ».
//   B6  borne tenue : au plus `borne` passes, et une borne d'au plus 3 ; une extension déclarée
//       (`arbitre.extension`) la porte jusqu'à 5, avec son motif, décidée après une passe qui gagne
//       encore au moins `gain_min` points (TF-2024).
//   B7  le score affiché est le score MESURÉ de la passe d'arrêt, jamais un score projeté.
// Règles de l'essai D-111 (a) du 29/10/2026 (TF-2026), jouées seulement si l'arbitre les déclare,
// pour que les journaux d'avant restent jugés par leurs propres règles :
//   B8  `rejet_regression` : une passe dont le score mesuré baisse sous la passe gardée précédente,
//       au-delà du bruit de relecteur `bruit_tolere` (entier 0-2, défaut 0 = baisse stricte), est
//       rejetée ; l'arrêt « regression » se pose alors sur la dernière passe gardée (TF-2063).
//   B9  `retenue: "union_recomptee"` : un défaut grave vu par un seul relecteur est retenu ; il n'est
//       écarté que si le recompte le dément (`dementi: true`).
//   B10 `verification_cloture` : chaque passe à partir de la 2e porte la vérification de clôture
//       de la correction qui l'a produite, par un agent qui ne note pas.
// Règles du retour Produit-86 du 05/11/2026 (TF-2202), jouées seulement si l'arbitre les déclare :
//   B11 `recompte_notes` : chaque passe à partir de la 2e déclare `notes_reprises` (liste, vide si
//       aucune), et chaque note de relecteur reprise dans la correction porte son recompte à la
//       source (commande + résultat). Une note reprise sans recompte a créé un bloquant, passe à 40.
//   B12 `reprise_unique` : une passe rejetée pour régression dont la cause est un défaut CRÉÉ par la
//       correction (`cause_regression.nature = "defaut_cree"`, recomptée) ouvre UNE passe de reprise
//       (`reprise: true`, `reprise_de: <n>`) qui ne corrige que ce défaut ; pas de seconde reprise,
//       pas de reprise sans cause ; la reprise ne compte pas dans la borne.
// Règles de la revue du 16/11/2026 (étude 20261106b, TF-2236 à TF-2242), jouées seulement si l'arbitre
// les déclare :
//   B13 `score_de_passe: "moyenne"` (TF-2237) : chaque passe porte `scores_relecteurs` (un nombre par relecteur) et son
//       `score_mesure` est la moyenne de ces notes (0,5 près) ; avec `bruit_tolere: "mesure"`, B8 tolère une
//       baisse jusqu'à l'écart des relecteurs de la passe gardée, sans plafond fixe à 2 ; une baisse avec un
//       bloquant retenu (plafond de 40) reste une régression.
//   B14 `arret_atteignable: true` (TF-2238) : l'arrêt `zero_majeur_texte_corrige` (passe 2 au moins) est
//       valable quand aucun défaut grave retenu ne cite le texte écrit par la dernière correction
//       (`origine: "correction"`) ; les majeurs restants (`origine: "anterieur"`) sont recomptés
//       (`arret.majeurs_restants`) et listés au Ch8 (`arret.liste_au_ch8`) ; chaque défaut grave retenu d'une
//       passe 2 ou suivante porte son origine ; une passe qui remplissait déjà cet arrêt devait l'arrêter.
//       L'arrêt strict « 0 bloquant et 0 majeur » reste valable : c'est le cas idéal.
//   B15 `garde_cumulee` (TF-2239, ex. 0.30) : une passe gardée dont le prompt dépasse la garde cumulée depuis
//       la passe 1 porte un `motif_depassement` (4 mots au moins) : alerte motivée, la passe n'est pas rejetée.
//   B16 `jugement_apparie: true` (TF-2240) : dès la passe 2, `jugement_apparie` porte, pour chaque relecteur neuf,
//       sa préférence (`gardee` ou `corrigee`), ses deux notes et l'ordre de lecture (alterné) ; le verdict suit la
//       majorité des voix (à égalité, l'écart moyen des notes) et une passe dont le verdict est `gardee` est
//       rejetée. B8 ne joue plus : la décision de garder suit ce jugement, la note absolue reste affichée.
//   B17 `fiche_premisses: true` (TF-2236) : le journal porte `fiche_premisses`, liste des prémisses
//       d'environnement vérifiées une fois par boucle (`commande`, `sortie`, `heure`), et chaque relecteur la
//       reçoit (`relecteur.fiche_remise: true`) avec le droit de vérifier tout ce qu'elle ne couvre pas.
//   B18 `type_relecteur: "relecteur"` (TF-2241) : chaque passe lance son relecteur avec le type d'agent dédié
//       (`relecteur.type: "relecteur"`), ou se replie sur `general-purpose` avec son motif (`relecteur.repli`).
//   B19 `verification_diff: true` (TF-2242) : dès la passe 2, `verification_cloture.ajouts` classe chaque phrase
//       ajoutée ou modifiée : `verifiee` (prémisse, commande, résultat), `sans_premisse` (motif : la phrase
//       prescrit ou définit) ou `non_verifiable` (retirée ou reformulée, jamais gardée comme un fait).
// Règle du retour du 16/11/2026 (TF-2673), jouée seulement si un recompte du journal déclare `champ` :
//   B20 un recompte qui lit un champ de données lit aussi sa règle d'écriture (`regle_ecriture`, commande +
//       résultat) et, quand le champ porte un fait, le croise avec une seconde source (`seconde_source`,
//       commande + résultat) ; `porte_un_fait: false` dispense de la seconde source. Un champ proche du fait
//       n'est pas le fait : le 16/11/2026, `sans_parole` à faux sur 14 clips a fondé une décision sur une
//       prémisse fausse, la règle d'écriture du champ n'ayant pas été lue.
//       (TF-2633, règle du score de passe = moyenne des relecteurs : couverte par B13 ci-dessus, TF-2237.)
//
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[],motif?} · exit 0/1/2.
// Usage : node oracle-boucle-l99.mjs <journal.json> | --self-test
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOM = 'Mode boucle de prompt-analyzer-l99 : journal de passes jugé';
const NJ = [
  "la VÉRACITÉ du journal : l'oracle ne relance ni le relecteur ni les commandes de recompte",
  "l'aveuglement réel du relecteur : l'oracle lit la déclaration, il ne lit pas le transcript de l'agent",
  "la justesse des sévérités et des scores attribués par le relecteur",
  "la qualité du prompt réécrit lui-même (→ relecteur, puis humain)",
  "l'origine d'un défaut grave (correction ou antérieur) : l'oracle lit la déclaration, il ne rejoue pas le test de citation contre le texte de la passe précédente",
  "la présentation réelle sans étiquette et l'alternance de l'ordre de lecture du jugement apparié : l'oracle lit la déclaration",
  "l'exhaustivité de la fiche des prémisses : l'oracle ne sait pas quelles prémisses d'environnement le prompt pose",
  "le type réel de l'agent lancé et son contexte de départ : l'oracle lit la déclaration, il ne lit pas le transcript",
  "l'exhaustivité de la liste des phrases ajoutées ou modifiées et la justesse de leur classement par le vérificateur : l'oracle ne calcule pas le diff entre les deux versions",
  "un recompte qui lit un champ de données sans le déclarer (`champ`) : B20 ne voit que les recomptes qui le déclarent",
];
const GRAVES = new Set(['bloquant', 'majeur']);
// TF-2024 (29/10/2026) : la borne de base reste 3 ; une extension décidée en cours de boucle va jusqu'à 5.
const BORNE_BASE_MAX = 3;
const BORNE_EXTENSION_MAX = 5;
// TF-2238 (16/11/2026) : `zero_majeur_texte_corrige`, l'arrêt atteignable (0 bloquant, 0 majeur dans le texte
// écrit par la dernière correction), valable seulement si l'arbitre déclare `arret_atteignable`.
const RAISON_ATTEIGNABLE = 'zero_majeur_texte_corrige';
const RAISONS = new Set(['zero_majeur', 'gain_insuffisant', 'borne', 'regression', RAISON_ATTEIGNABLE]);
const ORIGINES = new Set(['correction', 'anterieur']);
const estRejetee = (p) => p.rejetee === true || p.decision === 'rejeter';

const propre = (x) => typeof x === 'string' && x.trim() !== '';
const nb = (x) => typeof x === 'number' && Number.isFinite(x);
const retenus = (p) => (p.defauts || []).filter((d) => GRAVES.has(d.severite) && d.statut === 'retenu');
// TF-2237 : les notes des relecteurs d'une passe (`scores_relecteurs`, ou `scores` : tableau ou objet {A:76,B:69}) et leur écart.
const notesRelecteurs = (p) => { const s = p && (p.scores_relecteurs ?? p.scores); return (Array.isArray(s) ? s : s && typeof s === 'object' ? Object.values(s) : []).filter(nb); };
const ecartRelecteurs = (p) => { const v = notesRelecteurs(p); return v.length >= 2 ? Math.max(...v) - Math.min(...v) : 0; };

export function juger(j) {
  const f = [];
  const ko = (regle, lieu, message) => f.push({ regle, statut: 'FAIL', lieu, message });
  const a = j && j.arbitre;
  const passes = Array.isArray(j && j.passes) ? j.passes : [];
  // TF-2202 : la passe de reprise unique ne compte pas dans la borne ; sans la clé `reprise_unique`, rien ne change.
  const passesBorne = passes.filter((p) => !(a && a.reprise_unique === true && p.reprise === true)).length;

  // B1 — arbitre figé
  if (!a) ko('B1', 'arbitre', 'arbitre absent : la règle d arrêt doit être écrite avant la passe 1');
  else {
    if (!propre(a.rubrique)) ko('B1', 'arbitre.rubrique', 'rubrique non nommée');
    if (!propre(a.arret) || !/0 bloquant/.test(a.arret) || !/0 majeur/.test(a.arret))
      ko('B1', 'arbitre.arret', 'l arrêt doit exiger « 0 bloquant et 0 majeur » ; un seuil de score seul ne suffit pas');
    if (!nb(a.gain_min)) ko('B1', 'arbitre.gain_min', 'gain minimal absent');
    if (!nb(a.borne)) ko('B1', 'arbitre.borne', 'borne absente');
    if (!nb(a.garde_longueur)) ko('B1', 'arbitre.garde_longueur', 'garde de longueur absente');
  }
  if (passes.length === 0) ko('B1', 'passes', 'aucune passe au journal');

  // B2, B3 — par passe
  passes.forEach((p, i) => {
    const lieu = `passes[${i}]`;
    const r = p.relecteur || {};
    if (!propre(r.agent) || r.aveugle !== true || !Array.isArray(r.interdits) || r.interdits.length === 0)
      ko('B2', `${lieu}.relecteur`, 'relecteur non nommé, non aveugle, ou sans interdits écrits');
    (p.defauts || []).forEach((d, k) => {
      if (!GRAVES.has(d.severite)) return;
      const rc = d.recompte || {};
      if (!propre(rc.commande) || !propre(rc.resultat))
        ko('B3', `${lieu}.defauts[${k}]`, `défaut ${d.severite} sans recompte exécuté (commande et résultat)`);
    });
  });

  // B4 — garde de longueur, contre la dernière passe retenue
  const garde = a && nb(a.garde_longueur) ? a.garde_longueur : 0.15;
  let prec = null;
  passes.forEach((p, i) => {
    const rejetee = p.rejetee === true || p.decision === 'rejeter';
    if (prec && nb(p.mots) && nb(prec.mots) && p.mots > prec.mots * (1 + garde) && !(p.majeurs_clos > 0) && !rejetee)
      ko('B4', `passes[${i}]`, `le prompt passe de ${prec.mots} à ${p.mots} mots sans clore de majeur : passe à rejeter`);
    if (!rejetee) prec = p;
  });

  // B5 — arrêt
  const ar = j && j.arret;
  const gardees = passes.map((p, i) => ({ p, i })).filter(({ p }) => !(p.rejetee === true || p.decision === 'rejeter'));
  if (!ar || !nb(ar.passe) || !RAISONS.has(ar.raison)) ko('B5', 'arret', 'arrêt absent, ou raison hors de zero_majeur, gain_insuffisant, borne, regression');
  else {
    const idx = passes.findIndex((p) => p.n === ar.passe);
    const pa = passes[idx];
    if (!pa) ko('B5', 'arret.passe', `la passe ${ar.passe} n existe pas`);
    else {
      // Seules des passes rejetées peuvent suivre la passe d'arrêt (une régression rejetée, D-111 (a)).
      const apres = passes.slice(idx + 1);
      if (apres.some((p) => !estRejetee(p))) ko('B5', 'arret.passe', 'des passes gardées suivent la passe d arrêt');
      if (ar.raison === 'regression') {
        const r = apres[apres.length - 1];
        // TF-2240 : sous le jugement apparié, la décision de rejeter suit les voix, non la note absolue d'un autre jury.
        if (a && a.jugement_apparie === true) {
          if (!r || !estRejetee(r) || !(r.jugement_apparie && r.jugement_apparie.verdict === 'gardee'))
            ko('B5', 'arret.raison', 'arrêt « regression » sans passe rejetée dont le jugement apparié préfère la version gardée');
        } else if (!r || !estRejetee(r) || !(nb(r.score_mesure) && r.score_mesure < pa.score_mesure))
          ko('B5', 'arret.raison', 'arrêt « regression » sans passe rejetée dont le score baisse sous la passe d arrêt');
      }
      if (pa.rejetee === true || pa.decision === 'rejeter') ko('B5', 'arret.passe', 'la passe d arrêt est une passe rejetée');
      const seuil = a && nb(a.seuil_score) ? a.seuil_score : null;
      const pos = gardees.findIndex((g) => g.i === idx);
      const avant = pos > 0 ? gardees[pos - 1].p : null;
      if (ar.raison === 'zero_majeur') {
        if (retenus(pa).length > 0) ko('B5', 'arret.raison', `arrêt « zéro majeur » déclaré, ${retenus(pa).length} défaut(s) grave(s) retenu(s) à cette passe`);
        if (seuil !== null && !(pa.score_mesure >= seuil)) ko('B5', 'arret.raison', `seuil ${seuil} non tenu (${pa.score_mesure})`);
      }
      if (ar.raison === 'gain_insuffisant') {
        if (!avant) ko('B5', 'arret.raison', 'gain insuffisant déclaré sans passe retenue précédente');
        else if (!(pa.score_mesure - avant.score_mesure < (a && nb(a.gain_min) ? a.gain_min : 3)))
          ko('B5', 'arret.raison', `gain de ${pa.score_mesure - avant.score_mesure} points, pas inférieur au gain minimal`);
      }
      const borneEff = a && a.extension && nb(a.extension.borne) ? a.extension.borne : a && a.borne;
      if (ar.raison === 'borne' && nb(borneEff) && passesBorne < borneEff)
        ko('B5', 'arret.raison', `borne déclarée atteinte à ${passesBorne} passe(s) sur ${borneEff}`);
      gardees.slice(0, Math.max(pos, 0)).forEach(({ p, i }) => {
        if (retenus(p).length === 0) ko('B5', `passes[${i}]`, 'cette passe atteignait déjà « 0 bloquant et 0 majeur » : la boucle devait s arrêter');
      });
      // B14 — l'arrêt atteignable (TF-2238) : 0 bloquant et 0 majeur DANS LE TEXTE ÉCRIT PAR LA DERNIÈRE CORRECTION, les
      // majeurs restants (des défauts antérieurs que de nouveaux relecteurs ont vus) recomptés et listés au Ch8.
      if (ar.raison === RAISON_ATTEIGNABLE) {
        const reste = retenus(pa);
        if (!(a && a.arret_atteignable === true)) ko('B14', 'arbitre.arret_atteignable', `arrêt « ${RAISON_ATTEIGNABLE} » sans que l arbitre l ait déclaré avant la passe 1 (arret_atteignable)`);
        if (!(nb(pa.n) && pa.n >= 2)) ko('B14', 'arret.passe', 'l arrêt sur le texte de la dernière correction suppose une correction : passe 2 au moins');
        const crees = reste.filter((d) => d.origine === 'correction').length;
        if (crees > 0) ko('B14', 'arret.raison', `arrêt « ${RAISON_ATTEIGNABLE} » déclaré, ${crees} défaut(s) grave(s) retenu(s) dans le texte écrit par la dernière correction`);
        if (ar.majeurs_restants !== reste.length) ko('B14', 'arret.majeurs_restants', `majeurs restants déclarés ${ar.majeurs_restants === undefined ? 'absents' : ar.majeurs_restants}, recomptés ${reste.length} aux défauts retenus de la passe d arrêt`);
        if (ar.liste_au_ch8 !== true) ko('B14', 'arret.liste_au_ch8', 'les majeurs restants doivent être listés au Ch8 (liste_au_ch8: true) : le prompt est livré avec eux, jamais présenté comme fini');
        if (seuil !== null && !(pa.score_mesure >= seuil)) ko('B14', 'arret.raison', `seuil ${seuil} non tenu (${pa.score_mesure})`);
      }
      if (a && a.arret_atteignable === true) {
        // Une passe gardée avant l'arrêt qui n'avait plus de défaut grave dans le texte de sa correction devait déjà l'arrêter.
        gardees.slice(0, Math.max(pos, 0)).forEach(({ p, i }) => {
          const r = retenus(p);
          if (nb(p.n) && p.n >= 2 && r.length > 0 && r.every((d) => d.origine === 'anterieur'))
            ko('B14', `passes[${i}]`, 'cette passe n avait plus de défaut grave dans le texte de sa correction : la boucle devait s arrêter');
        });
      }
    }
  }

  // B6 — borne
  if (a && nb(a.borne)) {
    if (a.borne > BORNE_BASE_MAX) ko('B6', 'arbitre.borne', `borne ${a.borne} au-delà de ${BORNE_BASE_MAX} ; au-delà, déclarer une extension`);
    const x = a.extension;
    let borneEff = a.borne;
    if (x !== undefined && x !== null) {
      if (!nb(x.borne) || x.borne <= a.borne || x.borne > BORNE_EXTENSION_MAX)
        ko('B6', 'arbitre.extension.borne', `extension à ${x.borne} : attendue au-dessus de ${a.borne} et au plus ${BORNE_EXTENSION_MAX}`);
      else borneEff = x.borne;
      if (!propre(x.motif)) ko('B6', 'arbitre.extension.motif', 'extension sans motif : dire pourquoi la boucle continue');
      const iD = passes.findIndex((p) => p.n === x.decidee_apres_passe);
      if (!nb(x.decidee_apres_passe) || iD < 0 || x.decidee_apres_passe > a.borne)
        ko('B6', 'arbitre.extension.decidee_apres_passe', `extension décidée après une passe absente ou au-delà de la borne de base ${a.borne}`);
      else {
        const garde = passes.slice(0, iD).filter((p) => !(p.rejetee === true || p.decision === 'rejeter'));
        const prec = garde[garde.length - 1];
        const gainMin = nb(a.gain_min) ? a.gain_min : 3;
        if (prec && passes[iD].score_mesure - prec.score_mesure < gainMin)
          ko('B6', 'arbitre.extension', `la passe ${x.decidee_apres_passe} gagne ${passes[iD].score_mesure - prec.score_mesure} point(s), moins que ${gainMin} : la boucle ne converge plus, pas d extension`);
        if (retenus(passes[iD]).length === 0) ko('B6', 'arbitre.extension', `la passe ${x.decidee_apres_passe} n a plus de défaut grave retenu : rien à prolonger`);
      }
    }
    if (passesBorne > borneEff) ko('B6', 'passes', `${passesBorne} passes pour une borne de ${borneEff}`);
  }

  // B7 — score affiché
  const s = j && j.score_affiche;
  const pa = ar && passes.find((p) => p.n === ar.passe);
  if (!s || s.nature !== 'mesure') ko('B7', 'score_affiche', 'le score affiché doit être de nature « mesure », jamais projeté');
  else if (pa && s.valeur !== pa.score_mesure) ko('B7', 'score_affiche.valeur', `score affiché ${s.valeur}, mesuré ${pa.score_mesure} à la passe d arrêt`);

  // B8 — une passe qui régresse est rejetée (D-111 (a)), au-delà du bruit de relecteur (TF-2063, 02/11/2026).
  // Deux relecteurs rotatifs par passe font varier le score conservateur de ±1 à ±2 ; une baisse DANS ce
  // bruit n'est pas une régression de fond. `bruit_tolere` (entier, borné à [0,2], défaut 0) l'absorbe :
  // à 0, la règle est la baisse stricte d'origine, et tout journal qui ne déclare rien est jugé à l'identique.
  // TF-2237 (16/11/2026) : `bruit_tolere: "mesure"` remplace le plafond fixe de 2 par l'écart des relecteurs de la
  // passe gardée (étude 20261106b : écart médian de 3 points entre 2 relecteurs d'une même passe, jusqu'à 24) ; une
  // baisse avec un bloquant retenu, donc au plafond de 40, reste une régression quel que soit ce bruit.
  // TF-2240 : sous `jugement_apparie`, la décision de garder suit le jugement apparié (B16), non l'écart des notes
  // absolues de deux jurys différents ; B8 ne joue alors pas.
  if (a && a.rejet_regression === true && a.jugement_apparie !== true) {
    const mesure = a.bruit_tolere === 'mesure';
    const bruitFixe = nb(a.bruit_tolere) ? Math.min(Math.max(a.bruit_tolere, 0), 2) : 0;
    let precGardee = null;
    passes.forEach((p, i) => {
      if (precGardee && nb(p.score_mesure) && nb(precGardee.score_mesure) && !estRejetee(p)) {
        const baisse = precGardee.score_mesure - p.score_mesure;
        const bruit = mesure ? ecartRelecteurs(precGardee) : bruitFixe;
        const bloquant = mesure && (p.defauts || []).some((d) => d.severite === 'bloquant' && d.statut === 'retenu');
        if (baisse > bruit || (bloquant && baisse > 0))
          ko('B8', `passes[${i}]`, `le score baisse de ${precGardee.score_mesure} à ${p.score_mesure}${bloquant ? ' avec un bloquant retenu (plafond de 40)' : bruit ? ` (au-delà du bruit ${mesure ? 'mesuré' : 'toléré'} de ${bruit})` : ''} : passe à rejeter, on garde la précédente`);
      }
      if (!estRejetee(p)) precGardee = p;
    });
  }

  // B14 (suite) — sous `arret_atteignable`, chaque défaut grave retenu d'une passe 2 ou suivante dit d'où il vient :
  // `correction` (sa citation figure dans le texte que la dernière correction a écrit) ou `anterieur`.
  if (a && a.arret_atteignable === true) {
    passes.forEach((p, i) => {
      if (!(nb(p.n) && p.n >= 2)) return;
      retenus(p).forEach((d) => {
        if (!ORIGINES.has(d.origine)) ko('B14', `passes[${i}]`, `défaut ${d.severite} retenu sans origine (« correction » ou « anterieur ») : l arrêt sur le texte de la dernière correction ne se juge pas sans elle`);
      });
    });
  }

  // B15 — garde de longueur cumulée depuis la passe 1 : une alerte motivée, jamais un refus (TF-2239). Une passe gardée
  // qui dépasse la garde cumulée dit pourquoi elle ajoute au lieu de remplacer ; elle n'est pas rejetée pour autant
  // (le test du 15/11/2026 a vu une garde de 30 % imposée sans motif perdre 9 points, 66 et 70 contre 79 et 77).
  if (a && nb(a.garde_cumulee)) {
    const p1 = passes.find((p) => p.n === 1);
    if (p1 && nb(p1.mots)) passes.forEach((p, i) => {
      if (p === p1 || estRejetee(p) || !nb(p.mots) || !(p.mots > p1.mots * (1 + a.garde_cumulee))) return;
      if (!propre(p.motif_depassement) || p.motif_depassement.trim().split(/\s+/).length < 4)
        ko('B15', `passes[${i}]`, `le prompt passe de ${p1.mots} mots (passe 1) à ${p.mots}, au-delà de +${Math.round(a.garde_cumulee * 100)} % : la correction remplace du texte ou dit pourquoi elle ajoute (motif_depassement, 4 mots au moins)`);
    });
  }

  // B16 — jugement apparié (TF-2240) : dès la passe 2, chaque relecteur neuf note les deux versions, gardée et corrigée,
  // présentées sans étiquette, et dit laquelle est meilleure ; la décision de garder suit ce jugement, la note absolue
  // reste affichée. Voix à la majorité ; à égalité, la différence moyenne des notes (corrigée moins gardée) tranche.
  if (a && a.jugement_apparie === true) {
    passes.forEach((p, i) => {
      if (!(nb(p.n) && p.n >= 2)) return;
      const lieu = `passes[${i}].jugement_apparie`;
      const jg = p.jugement_apparie;
      const rel = jg && Array.isArray(jg.relecteurs) ? jg.relecteurs : [];
      if (!jg || rel.length === 0) { ko('B16', lieu, 'jugement apparié absent : dès la passe 2, chaque relecteur neuf note les versions gardée et corrigée et dit laquelle est meilleure'); return; }
      if (jg.presentation !== 'sans_etiquette') ko('B16', lieu, 'les deux versions doivent être présentées sans étiquette (presentation: "sans_etiquette")');
      const valide = (r) => propre(r.agent) && (r.prefere === 'gardee' || r.prefere === 'corrigee') && nb(r.note_gardee) && nb(r.note_corrigee)
        && (r.ordre === 'gardee_en_premier' || r.ordre === 'corrigee_en_premier');
      if (!rel.every(valide)) { ko('B16', lieu, 'relecteur sans agent, préférence (gardee ou corrigee), ordre de présentation ou notes des deux versions'); return; }
      if (rel.length >= 2 && new Set(rel.map((r) => r.ordre)).size < 2) ko('B16', lieu, 'tous les relecteurs ont lu les versions dans le même ordre : l ordre doit alterner');
      const pourCorrigee = rel.filter((r) => r.prefere === 'corrigee').length;
      const pourGardee = rel.length - pourCorrigee;
      const ecart = rel.reduce((s, r) => s + (r.note_corrigee - r.note_gardee), 0) / rel.length;
      const verdict = pourCorrigee > pourGardee ? 'corrigee' : pourGardee > pourCorrigee ? 'gardee' : ecart > 0 ? 'corrigee' : 'gardee';
      if (jg.verdict !== verdict) ko('B16', lieu, `verdict « ${jg.verdict} », les voix (${pourCorrigee} pour la corrigée, ${pourGardee} pour la gardée, écart moyen ${ecart}) donnent « ${verdict} »`);
      if (verdict === 'gardee' && !estRejetee(p)) ko('B16', `passes[${i}]`, 'le jugement apparié préfère la version gardée : la passe est à rejeter');
    });
  }

  // B17 — fiche des prémisses d'environnement (TF-2236) : l'orchestrateur vérifie une fois par boucle, par commande,
  // les prémisses que les relecteurs revérifiaient chacun (112 de leurs 165 appels d'outil le 06/11/2026), et remet la
  // fiche à chaque relecteur, qui garde le droit de vérifier tout ce qu'elle ne couvre pas. Une prémisse sans commande,
  // sortie et heure n'y entre pas : une prémisse fausse de la fiche aveuglerait tous les relecteurs à la fois.
  if (a && a.fiche_premisses === true) {
    const fiche = j.fiche_premisses;
    if (!Array.isArray(fiche)) ko('B17', 'fiche_premisses', 'fiche des prémisses absente : l orchestrateur l écrit une fois par boucle, avant la passe 1 (liste vide si le prompt ne pose aucune prémisse d environnement)');
    else fiche.forEach((e, k) => {
      if (!e || !propre(e.commande) || !propre(e.sortie) || !propre(e.heure) || Number.isNaN(Date.parse(e.heure)))
        ko('B17', `fiche_premisses[${k}]`, 'prémisse sans commande, sortie ou heure (ISO 8601) : une prémisse non mesurée n entre pas dans la fiche');
    });
    passes.forEach((p, i) => {
      if (!(p.relecteur && p.relecteur.fiche_remise === true)) ko('B17', `passes[${i}].relecteur`, 'fiche des prémisses non remise au relecteur (fiche_remise: true, même si la fiche est vide)');
    });
  }

  // B18 — type d'agent du relecteur (TF-2241) : les relecteurs aveugles partaient d'un agent général à 46 000 jetons de
  // contexte, contre 17 000 pour le vérificateur dédié. Le type `relecteur` (lecture seule, contexte réduit, même modèle)
  // est lancé d'office ; le repli sur l'agent général, hors du pilot ou si le type est absent, se motive au journal.
  if (a && a.type_relecteur === 'relecteur') {
    passes.forEach((p, i) => {
      const r = p.relecteur || {};
      // D-240 (b) et réponse du porteur à D-231 (23/11/2026) : un relecteur d'un AUTRE modèle, Codex ou Gemini lancé par
      // le skill delegue-a-codex-et-gemini, est aveugle par construction ; son type se déclare avec le modèle servi.
      if (r.type === 'relecteur' || (r.type === 'general-purpose' && propre(r.repli))) return;
      if ((r.type === 'codex' || r.type === 'antigravity') && propre(r.modele)) return;
      ko('B18', `passes[${i}].relecteur`, `relecteur lancé avec le type « ${r.type === undefined ? 'non déclaré' : r.type} » : le type « relecteur », un relecteur tiers « codex » ou « antigravity » avec son modèle (relecteur.modele), ou un repli sur « general-purpose » avec son motif (relecteur.repli)`);
    });
  }

  // B19 — le vérificateur de clôture juge chaque phrase ajoutée ou modifiée par la correction (TF-2242) : les relecteurs
  // aveugles trouvaient leurs défauts graves dans le texte écrit par la correction précédente (11 sur 22 le 06/11/2026,
  // que le vérificateur venait de lire). Il reçoit le diff et classe chaque phrase ; l'orchestrateur ne garde pas
  // comme un fait une phrase qu'aucune commande n'établit.
  if (a && a.verification_diff === true) {
    const motif = (m) => propre(m) && m.trim().split(/\s+/).length >= 4;
    passes.forEach((p, i) => {
      if (!(nb(p.n) && p.n >= 2)) return;
      const aj = p.verification_cloture && p.verification_cloture.ajouts;
      if (!Array.isArray(aj)) { ko('B19', `passes[${i}].verification_cloture.ajouts`, 'liste des phrases ajoutées ou modifiées absente : le vérificateur reçoit le diff de la correction et juge chaque phrase (liste vide si la correction n ajoute rien)'); return; }
      aj.forEach((x, k) => {
        const lieu = `passes[${i}].verification_cloture.ajouts[${k}]`;
        if (!x || !propre(x.phrase)) ko('B19', lieu, 'phrase ajoutée ou modifiée non citée');
        else if (x.etat === 'verifiee') {
          if (!propre(x.premisse) || !propre(x.commande) || !propre(x.resultat)) ko('B19', lieu, 'phrase « verifiee » sans sa prémisse, la commande qui l établit et son résultat');
        } else if (x.etat === 'sans_premisse') {
          if (!motif(x.motif)) ko('B19', lieu, 'phrase « sans_premisse » sans motif (4 mots au moins) : dire pourquoi elle prescrit ou définit sans affirmer de fait');
        } else if (x.etat === 'non_verifiable') {
          if (x.sort !== 'retire' && x.sort !== 'reformule') ko('B19', lieu, 'phrase « non_verifiable » gardée : elle se retire, ou se reformule en instruction de mesurer à l exécution (sort: retire | reformule)');
        } else ko('B19', lieu, 'état hors de verifiee, sans_premisse, non_verifiable');
      });
    });
  }

  // B13 — la passe est notée par la moyenne de ses relecteurs (TF-2237)
  if (a && a.score_de_passe === 'moyenne') {
    passes.forEach((p, i) => {
      const v = notesRelecteurs(p);
      if (v.length === 0) ko('B13', `passes[${i}].scores_relecteurs`, 'notes des relecteurs absentes : la moyenne ne se vérifie pas sans une note par relecteur');
      else {
        const moy = v.reduce((x, y) => x + y, 0) / v.length;
        if (!nb(p.score_mesure) || Math.abs(p.score_mesure - moy) > 0.5)
          ko('B13', `passes[${i}].score_mesure`, `score de passe ${p.score_mesure}, moyenne des relecteurs ${moy} : sous « moyenne », le score de passe est la moyenne, jamais le minimum`);
      }
    });
  }

  // B9 — retenue à l'union recomptée (D-111 (a))
  if (a && a.retenue === 'union_recomptee') {
    passes.forEach((p, i) => (p.defauts || []).forEach((d, k) => {
      if (GRAVES.has(d.severite) && d.statut === 'ecarte' && d.dementi !== true)
        ko('B9', `passes[${i}].defauts[${k}]`, 'défaut grave écarté sans démenti au recompte : en union recomptée, il est retenu');
    }));
  }

  // B10 — vérification de clôture de chaque correction (D-111 (a))
  if (a && a.verification_cloture === true) {
    passes.forEach((p, i) => {
      if (!(nb(p.n) && p.n >= 2)) return;
      const v = p.verification_cloture || {};
      if (!propre(v.agent) || v.note !== false || !nb(v.clotures) || !nb(v.defauts_crees))
        ko('B10', `passes[${i}].verification_cloture`, 'vérification de clôture absente, ou faite par un agent qui note : agent, note false, clotures et defauts_crees attendus');
    });
  }

  // B11 — une note de relecteur reprise dans une correction est recomptée à la source (TF-2202)
  if (a && a.recompte_notes === true) {
    passes.forEach((p, i) => {
      if (!(nb(p.n) && p.n >= 2)) return;
      if (!Array.isArray(p.notes_reprises)) {
        ko('B11', `passes[${i}].notes_reprises`, 'liste des notes reprises absente : la déclarer, vide si aucune note du relecteur n est reprise');
        return;
      }
      p.notes_reprises.forEach((n, k) => {
        const rc = n.recompte || {};
        if (!propre(n.note) || !propre(rc.commande) || !propre(rc.resultat))
          ko('B11', `passes[${i}].notes_reprises[${k}]`, 'note reprise sans recompte à la source (note, commande et résultat attendus) : une note non recomptée n entre pas dans une correction');
      });
    });
  }

  // B12 — une régression due à un défaut créé ouvre une passe de reprise unique (TF-2202)
  if (a && a.reprise_unique === true) {
    const causeCree = (p) => estRejetee(p) && p.cause_regression && p.cause_regression.nature === 'defaut_cree';
    passes.forEach((p, i) => {
      if (causeCree(p)) {
        const rc = p.cause_regression.recompte || {};
        if (!propre(p.cause_regression.citation) || !propre(rc.commande) || !propre(rc.resultat))
          ko('B12', `passes[${i}].cause_regression`, 'cause « défaut créé » sans citation ni recompte à la source (commande et résultat)');
        const suite = passes[i + 1];
        if (p.reprise !== true && !(suite && suite.reprise === true && suite.reprise_de === p.n))
          ko('B12', `passes[${i}]`, 'régression due à un défaut créé par la correction : la passe de reprise unique (reprise: true, reprise_de) est attendue juste après');
      }
      if (p.reprise === true) {
        const src = passes[i - 1];
        if (!(src && p.reprise_de === src.n && causeCree(src)))
          ko('B12', `passes[${i}]`, 'passe de reprise sans la passe rejetée qui la précède pour cause de défaut créé : pas de reprise sans cause');
        if (passes.findIndex((x) => x.reprise === true) !== i)
          ko('B12', `passes[${i}]`, 'seconde passe de reprise : une seule par boucle');
      }
    });
  }

  // B20 — un recompte qui lit un champ de données lit aussi sa règle d'écriture, et croise le fait (TF-2673)
  const preuve = (x) => !!x && propre(x.commande) && propre(x.resultat);
  passes.forEach((p, i) => {
    const recomptes = [
      ...(p.defauts || []).map((d, k) => [`passes[${i}].defauts[${k}].recompte`, d.recompte]),
      ...(p.notes_reprises || []).map((n, k) => [`passes[${i}].notes_reprises[${k}].recompte`, n.recompte]),
    ];
    recomptes.forEach(([lieu, rc]) => {
      if (!rc || !propre(rc.champ)) return;
      if (!preuve(rc.regle_ecriture))
        ko('B20', `${lieu}.regle_ecriture`, `recompte du champ « ${rc.champ} » sans la règle qui l'écrit (commande et résultat) : un champ proche du fait n'est pas le fait`);
      if (rc.porte_un_fait !== false && !preuve(rc.seconde_source))
        ko('B20', `${lieu}.seconde_source`, `recompte du champ « ${rc.champ} », qui porte un fait, sans seconde source (commande et résultat) ; \`porte_un_fait: false\` dispense`);
    });
  });

  return f;
}

function sortir(artefact, verdict, findings, motif, code) {
  const o = { oracle: 'oracle-boucle-l99', domaine: DOM, artefact, verdict, findings, non_juge: NJ };
  if (motif) o.motif = motif;
  process.stdout.write(JSON.stringify(o, null, 1) + '\n');
  process.exit(code);
}

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(ICI, '..', 'fixtures');

function selfTest() {
  const lire = (n) => JSON.parse(fs.readFileSync(path.join(FIX, n), 'utf8'));
  const cas = [];
  const verts = ['boucle-vert-une-passe.json', 'boucle-vert-deux-passes.json'];
  for (const v of verts) cas.push({ nom: v, j: lire(v), attendu: [] });
  // TF-2024 : le vert à deux passes, borne de base 1, prolongé à 2 après la passe 1 (qui garde 2 majeurs).
  const etendu = () => { const j = lire('boucle-vert-deux-passes.json'); j.arbitre.borne = 1; j.arbitre.extension = { borne: 2, motif: 'majeurs ouverts, la passe gagne encore', decidee_apres_passe: 1 }; return j; };
  cas.push({ nom: 'TF-2024 extension déclarée et motivée', j: etendu(), attendu: [] });
  // Chaque rouge ne change qu'un élément du vert à deux passes.
  const base = () => lire('boucle-vert-deux-passes.json');
  const rouge = (nom, regle, muter) => { const j = base(); muter(j); cas.push({ nom, j, attendu: [regle] }); };
  rouge('B1 arrêt sur score seul', 'B1', (j) => { j.arbitre.arret = 'score >= 90'; });
  rouge('B2 relecteur non aveugle', 'B2', (j) => { j.passes[1].relecteur.aveugle = false; });
  rouge('B3 majeur sans recompte', 'B3', (j) => { delete j.passes[0].defauts[0].recompte; });
  rouge('B4 passe gonflée non rejetée', 'B4', (j) => { j.passes[1].mots = 1500; j.passes[1].majeurs_clos = 0; });
  rouge('B5 zéro majeur déclaré à tort', 'B5', (j) => { j.passes[1].defauts.push({ severite: 'majeur', citation: 'x', recompte: { commande: 'git grep x', resultat: '1' }, statut: 'retenu' }); });
  rouge('B5 boucle continuée après zéro majeur', 'B5', (j) => { j.passes[0].defauts.forEach((d) => { if (d.severite === 'majeur') d.statut = 'ecarte'; }); });
  rouge('B6 borne au-delà de 3', 'B6', (j) => { j.arbitre.borne = 4; });
  const rougeEtendu = (nom, muter) => { const j = etendu(); muter(j); cas.push({ nom, j, attendu: ['B6'] }); };
  rougeEtendu('B6 extension au-delà de 5', (j) => { j.arbitre.extension.borne = 6; });
  rougeEtendu('B6 extension sans motif', (j) => { j.arbitre.extension.motif = ''; });
  rougeEtendu('B6 passes au-delà de la borne sans extension', (j) => { delete j.arbitre.extension; });
  rouge('B6 extension sur une passe qui ne gagne plus', 'B6', (j) => {
    j.passes[1].score_mesure = 85; j.score_affiche.valeur = 85;
    j.arbitre.extension = { borne: 4, motif: 'essai', decidee_apres_passe: 2 };
    j.passes[1].defauts.push({ severite: 'majeur', citation: 'x', recompte: { commande: 'git grep x', resultat: '1' }, statut: 'retenu' });
    j.arret = { passe: 2, raison: 'gain_insuffisant' };
  });
  rouge('B7 score projeté affiché', 'B7', (j) => { j.score_affiche.nature = 'projete'; });
  // D-111 (a), TF-2026 : le vert à deux passes sous les règles de l'essai, puis une régression rejetée.
  const essai = () => {
    const j = lire('boucle-vert-deux-passes.json');
    Object.assign(j.arbitre, { retenue: 'union_recomptee', verification_cloture: true, rejet_regression: true });
    j.passes[0].defauts.forEach((d) => { if (d.statut === 'ecarte') d.dementi = true; });
    j.passes[1].verification_cloture = { agent: 'verificateur-1', note: false, clotures: 2, defauts_crees: 0 };
    return j;
  };
  cas.push({ nom: 'D-111 essai vert', j: essai(), attendu: [] });
  const regression = () => {
    const j = essai();
    j.passes[1].score_mesure = 80; j.passes[1].rejetee = true; j.passes[1].decision = 'rejeter';
    j.arret = { passe: 1, raison: 'regression' }; j.score_affiche = { valeur: 84, nature: 'mesure' };
    return j;
  };
  cas.push({ nom: 'D-111 régression rejetée, arrêt sur la passe gardée', j: regression(), attendu: [] });
  const rougeEssai = (nom, regle, base, muter) => { const j = base(); muter(j); cas.push({ nom, j, attendu: [regle] }); };
  rougeEssai('B8 régression gardée', 'B8', essai, (j) => { j.passes[1].score_mesure = 80; j.score_affiche.valeur = 80; });
  rougeEssai('B9 écarté sans démenti en union', 'B9', essai, (j) => { j.passes[0].defauts.forEach((d) => { if (d.statut === 'ecarte') delete d.dementi; }); });
  rougeEssai('B10 passe 2 sans vérification de clôture', 'B10', essai, (j) => { delete j.passes[1].verification_cloture; });
  rougeEssai('B10 vérificateur qui note', 'B10', essai, (j) => { j.passes[1].verification_cloture.note = true; });
  rougeEssai('B5 arrêt « regression » sans passe qui baisse', 'B5', regression, (j) => { j.passes[1].score_mesure = 86; });
  // TF-2202 : les règles B11 et B12, jouées seulement si l'arbitre les déclare.
  const notes = () => {
    const j = essai();
    Object.assign(j.arbitre, { recompte_notes: true, reprise_unique: true });
    j.passes[1].notes_reprises = [{ note: 'relecteur-1 : « 29 fichiers citent azure »', source: 'relecteur-1', recompte: { commande: 'git -C forge-development grep -il azure', resultat: '29 fichiers' } }];
    return j;
  };
  cas.push({ nom: 'TF-2202 notes recomptées, vert', j: notes(), attendu: [] });
  // La passe 2 régresse à 40 sur un bloquant que sa correction a créé (le défaut du 05/11/2026).
  const faute = (j) => {
    const p = j.passes[1];
    const cause = { commande: 'git grep -n "section 7" prompt-p2.md', resultat: '0 occurrence : la section 7 n existe pas' };
    Object.assign(p, { score_mesure: 40, rejetee: true, decision: 'rejeter', majeurs_clos: 2,
      cause_regression: { nature: 'defaut_cree', citation: 'renvoi à une section absente', recompte: cause } });
    p.defauts.push({ severite: 'bloquant', citation: 'renvoi à une section absente', recompte: cause, statut: 'retenu' });
    p.verification_cloture.defauts_crees = 1;
    return j;
  };
  // Vert : la reprise corrige le défaut créé et clôt la boucle ; borne 2, la reprise n'y compte pas.
  const repriseGardee = () => {
    const j = faute(notes());
    j.arbitre.borne = 2;
    j.passes.push({ n: 3, reprise: true, reprise_de: 2, fichier: 'prompt-p3.md', mots: 1295,
      relecteur: { agent: 'relecteur-3', aveugle: true, interdits: ['analyse', 'passes précédentes'] },
      score_mesure: 91, defauts: [{ severite: 'mineur', citation: 'l. 118', statut: 'retenu' }], majeurs_clos: 2, rejetee: false, decision: 'arreter',
      verification_cloture: { agent: 'verificateur-1', note: false, clotures: 1, defauts_crees: 0 }, notes_reprises: [] });
    j.arret = { passe: 3, raison: 'zero_majeur' }; j.score_affiche = { valeur: 91, nature: 'mesure' };
    return j;
  };
  cas.push({ nom: 'TF-2202 reprise unique gardée, borne 2 et 3 passes dont la reprise, vert', j: repriseGardee(), attendu: [] });
  // Vert : la reprise régresse à son tour, la boucle livre la passe 1 gardée.
  const repriseRejetee = () => {
    const j = repriseGardee();
    Object.assign(j.passes[2], { score_mesure: 70, rejetee: true, decision: 'rejeter' });
    j.arret = { passe: 1, raison: 'regression' }; j.score_affiche = { valeur: 84, nature: 'mesure' };
    return j;
  };
  cas.push({ nom: 'TF-2202 reprise rejetée à son tour, arrêt sur la passe 1, vert', j: repriseRejetee(), attendu: [] });
  const rougeB = (nom, regle, base, muter) => { const j = base(); muter(j); cas.push({ nom, j, attendu: [regle] }); };
  rougeB('B11 note reprise sans recompte', 'B11', notes, (j) => { delete j.passes[1].notes_reprises[0].recompte; });
  rougeB('B11 liste des notes reprises absente', 'B11', notes, (j) => { delete j.passes[1].notes_reprises; });
  rougeB('B12 régression par défaut créé arrêtée sans reprise (le défaut du 05/11)', 'B12', () => faute(notes()), (j) => {
    j.arret = { passe: 1, raison: 'regression' }; j.score_affiche = { valeur: 84, nature: 'mesure' };
  });
  rougeB('B12 reprise sans cause de défaut créé', 'B12', repriseGardee, (j) => { delete j.passes[1].cause_regression; });
  rougeB('B12 cause « défaut créé » sans recompte', 'B12', repriseGardee, (j) => { delete j.passes[1].cause_regression.recompte; });
  rougeB('B12 seconde reprise', 'B12', repriseRejetee, (j) => {
    j.passes[2].cause_regression = { nature: 'defaut_cree', citation: 'x', recompte: { commande: 'git grep x', resultat: '0' } };
    j.passes.push({ ...j.passes[2], n: 4, reprise_de: 3, cause_regression: undefined });
  });
  // TF-2237 (16/11/2026) : la passe est notée par la moyenne de ses relecteurs, et le bruit toléré est l'écart
  // des relecteurs de la passe gardée. Cas d'origine (06/11/2026, indice a) : la passe rejetée à 80 contre 82 par le
  // minimum, alors que ses relecteurs se tenaient à 4 points d'écart et qu'elle fermait des majeurs.
  const moyenne = () => {
    const j = essai();
    Object.assign(j.arbitre, { score_de_passe: 'moyenne', bruit_tolere: 'mesure' });
    j.passes[0].scores_relecteurs = [84, 82]; j.passes[0].score_mesure = 83;
    j.passes[1].scores_relecteurs = [86, 80]; j.passes[1].score_mesure = 83;
    j.score_affiche = { valeur: 83, nature: 'mesure' };
    return j;
  };
  // La même boucle notée par le minimum (82 puis 80), bruit toléré à 0 : la règle d'avant rejetait la passe 2.
  const parLeMinimum = () => {
    const j = moyenne();
    delete j.arbitre.score_de_passe; j.arbitre.bruit_tolere = 0;
    j.passes[0].score_mesure = 82; j.passes[1].score_mesure = 80; j.score_affiche = { valeur: 80, nature: 'mesure' };
    return j;
  };
  // Passe 2 qui baisse de 3 points, passe 1 gardée à 4 points d'écart entre ses relecteurs ; arrêt sur le gain.
  const baisse = (scores2, moy2) => () => {
    const j = moyenne();
    j.passes[0].scores_relecteurs = [84, 80]; j.passes[0].score_mesure = 82;
    j.passes[1].scores_relecteurs = scores2; j.passes[1].score_mesure = moy2; j.score_affiche = { valeur: moy2, nature: 'mesure' };
    return j;
  };
  cas.push({ nom: 'TF-2237 vert — la moyenne garde la passe que le minimum rejetait (83 contre 83, au lieu de 82 contre 80)', j: moyenne(), attendu: [] });
  cas.push({ nom: 'TF-2237 vert — la clé « scores » (un objet par relecteur) est lue comme « scores_relecteurs »', j: (() => { const j = moyenne(); j.passes[0].scores = { A: 84, B: 82 }; delete j.passes[0].scores_relecteurs; j.passes[1].scores = { A: 86, B: 80 }; delete j.passes[1].scores_relecteurs; return j; })(), attendu: [] });
  cas.push({ nom: 'TF-2237 rouge — la même boucle notée par le minimum, bruit à 0 : la règle d avant rejette la passe (B8)', j: parLeMinimum(), attendu: ['B8'] });
  cas.push({ nom: 'TF-2237 vert — une baisse de 3 points dans l écart de 4 des relecteurs de la passe gardée reste gardée', j: baisse([80, 78], 79)(), attendu: [] });
  rougeB('B8 baisse de 6 points, au-delà de l écart de 4 des relecteurs de la passe gardée', 'B8', baisse([77, 75], 76), () => {});
  rougeB('B8 baisse dans le bruit, mais avec un bloquant retenu (plafond de 40)', 'B8', baisse([80, 78], 79), (j) => {
    j.passes[1].defauts.push({ severite: 'bloquant', citation: 'renvoi à une section absente', recompte: { commande: 'git grep -n "section 7" prompt-p2.md', resultat: '0 occurrence' }, statut: 'retenu' });
    j.arret = { passe: 2, raison: 'gain_insuffisant' };
  });
  rougeB('B13 score de passe qui n est pas la moyenne (86 pour 86 et 80)', 'B13', moyenne, (j) => { j.passes[1].score_mesure = 86; j.score_affiche.valeur = 86; });
  rougeB('B13 notes des relecteurs absentes', 'B13', moyenne, (j) => { delete j.passes[1].scores_relecteurs; });
  // TF-2238 (16/11/2026) : l'arrêt atteignable. Sur 59 passes relevées au 06/11/2026, aucune n'atteignait « 0 bloquant
  // et 0 majeur » (médiane 6 par passe) : les boucles s'arrêtaient sur le gain, la régression ou la borne. Ici la
  // passe 2 n'a plus de défaut grave dans le texte de sa correction ; il lui en reste un, antérieur, recompté et listé.
  const atteignable = () => {
    const j = essai();
    j.arbitre.arret_atteignable = true;
    j.arbitre.arret = '0 bloquant et 0 majeur dans le texte écrit par la dernière correction ; majeurs restants recomptés et listés au Ch8 (cible : 0 bloquant et 0 majeur)';
    j.passes[1].defauts = [
      { severite: 'majeur', origine: 'anterieur', citation: 'l. 41 : « 14 dépôts »', recompte: { commande: 'git grep -c "14 dépôts" prompt-p1.md', resultat: '1 occurrence, déjà présente en passe 1' }, statut: 'retenu' },
      { severite: 'mineur', citation: 'l. 118', statut: 'retenu' },
    ];
    j.arret = { passe: 2, raison: 'zero_majeur_texte_corrige', majeurs_restants: 1, liste_au_ch8: true };
    return j;
  };
  cas.push({ nom: 'TF-2238 vert — arrêt atteignable : 0 majeur dans le texte de la dernière correction, 1 majeur antérieur listé', j: atteignable(), attendu: [] });
  cas.push({ nom: 'TF-2238 vert — l arrêt strict « zéro majeur » reste valable sous la même déclaration (le cas idéal)', j: (() => { const j = essai(); j.arbitre.arret_atteignable = true; return j; })(), attendu: [] });
  rougeB('B14 majeur retenu dans le texte de la dernière correction', 'B14', atteignable, (j) => { j.passes[1].defauts[0].origine = 'correction'; });
  rougeB('B14 majeurs restants mal recomptés', 'B14', atteignable, (j) => { j.arret.majeurs_restants = 0; });
  rougeB('B14 majeurs restants non listés au Ch8', 'B14', atteignable, (j) => { j.arret.liste_au_ch8 = false; });
  rougeB('B14 arrêt atteignable non déclaré à l arbitre', 'B14', atteignable, (j) => { delete j.arbitre.arret_atteignable; });
  rougeB('B14 défaut grave retenu sans origine', 'B14', atteignable, (j) => { delete j.passes[1].defauts[0].origine; });
  rougeB('B14 arrêt atteignable posé sur la passe 1, sans correction', 'B14', atteignable, (j) => {
    j.passes.length = 1; j.passes[0].decision = 'arreter';
    j.arret = { passe: 1, raison: 'zero_majeur_texte_corrige', majeurs_restants: 2, liste_au_ch8: true }; j.score_affiche = { valeur: 84, nature: 'mesure' };
  });
  rougeB('B14 la passe 2 remplissait déjà l arrêt : la boucle devait s arrêter', 'B14', atteignable, (j) => {
    j.passes[1].decision = 'continuer';
    j.passes.push({ n: 3, fichier: 'prompt-p3.md', mots: 1300, relecteur: { agent: 'relecteur-3', aveugle: true, interdits: ['analyse', 'passes précédentes'] },
      score_mesure: 93, defauts: [{ severite: 'mineur', citation: 'l. 120', statut: 'retenu' }], majeurs_clos: 1, rejetee: false, decision: 'arreter',
      verification_cloture: { agent: 'verificateur-1', note: false, clotures: 1, defauts_crees: 0 } });
    j.arret = { passe: 3, raison: 'zero_majeur' }; j.score_affiche = { valeur: 93, nature: 'mesure' };
  });
  // TF-2239 (16/11/2026) : la garde de longueur se juge aussi depuis la passe 1, en alerte motivée. Sur 20 journaux,
  // 16 boucles dépassent +15 % entre la passe 1 et l'arrêt (médiane +47 %), et la garde passe à passe ne joue jamais.
  const cumulee = () => { const j = essai(); j.arbitre.garde_cumulee = 0.3; return j; };
  const gonflee = (motif) => () => {
    const j = cumulee();
    j.passes[1].mots = 1700; // +40 % depuis la passe 1, la passe ferme 2 majeurs : B4 ne la rejette pas
    if (motif !== undefined) j.passes[1].motif_depassement = motif;
    return j;
  };
  cas.push({ nom: 'TF-2239 vert — +6 % depuis la passe 1, sous la garde cumulée de 30 %', j: cumulee(), attendu: [] });
  cas.push({ nom: 'TF-2239 vert — +40 % avec un motif : alerte motivée, la passe reste gardée', j: gonflee('ferme 2 majeurs de spécification sans texte à remplacer')(), attendu: [] });
  cas.push({ nom: 'TF-2239 vert — la passe rejetée au-delà de la garde n est pas jugée : son texte est écarté', j: (() => { const j = gonflee()(); Object.assign(j.passes[1], { rejetee: true, decision: 'rejeter', score_mesure: 80 }); j.arret = { passe: 1, raison: 'regression' }; j.score_affiche = { valeur: 84, nature: 'mesure' }; return j; })(), attendu: [] });
  rougeB('B15 +40 % depuis la passe 1 sans motif', 'B15', gonflee(), () => {});
  rougeB('B15 motif de trois mots, qui ne dit rien', 'B15', gonflee('pour être complet'), () => {});
  // TF-2240 (16/11/2026) : le jugement apparié. Garder ou rejeter une passe comparait deux notes de jurys différents
  // (biais de configuration de 4 à 7 points, étude du 29/10/2026) ; chaque relecteur de la passe 2 note maintenant
  // les deux versions, présentées sans étiquette, et dit laquelle est meilleure.
  const voix = (agent, ordre, prefere, gardee, corrigee) => ({ agent, ordre, prefere, note_gardee: gardee, note_corrigee: corrigee });
  const apparie = () => {
    const j = essai();
    j.arbitre.jugement_apparie = true;
    j.passes[1].jugement_apparie = { presentation: 'sans_etiquette', verdict: 'corrigee',
      relecteurs: [voix('relecteur-2a', 'gardee_en_premier', 'corrigee', 83, 91), voix('relecteur-2b', 'corrigee_en_premier', 'corrigee', 84, 90)] };
    return j;
  };
  // La passe 2 est rejetée parce que ses deux relecteurs préfèrent la version gardée ; la boucle s'arrête sur la passe 1.
  const apparieGardee = () => {
    const j = apparie();
    Object.assign(j.passes[1], { rejetee: true, decision: 'rejeter' });
    j.passes[1].jugement_apparie = { presentation: 'sans_etiquette', verdict: 'gardee',
      relecteurs: [voix('relecteur-2a', 'gardee_en_premier', 'gardee', 86, 80), voix('relecteur-2b', 'corrigee_en_premier', 'gardee', 85, 82)] };
    j.arret = { passe: 1, raison: 'regression' }; j.score_affiche = { valeur: 84, nature: 'mesure' };
    return j;
  };
  cas.push({ nom: 'TF-2240 vert — jugement apparié accepté : 2 relecteurs préfèrent la version corrigée, ordres alternés', j: apparie(), attendu: [] });
  cas.push({ nom: 'TF-2240 vert — la note absolue plus basse d un autre jury ne rejette plus une passe que le jugement apparié préfère', j: (() => { const j = apparie(); j.passes[1].score_mesure = 80; j.score_affiche.valeur = 80; return j; })(), attendu: [] });
  cas.push({ nom: 'TF-2240 vert — le jugement apparié préfère la version gardée : passe rejetée, arrêt sur la passe 1', j: apparieGardee(), attendu: [] });
  rougeB('B16 passe 2 sans jugement apparié (le champ manque)', 'B16', apparie, (j) => { delete j.passes[1].jugement_apparie; });
  rougeB('B16 versions présentées avec étiquette', 'B16', apparie, (j) => { j.passes[1].jugement_apparie.presentation = 'etiquetee'; });
  rougeB('B16 tous les relecteurs lisent dans le même ordre', 'B16', apparie, (j) => { j.passes[1].jugement_apparie.relecteurs[1].ordre = 'gardee_en_premier'; });
  rougeB('B16 verdict qui contredit les voix', 'B16', apparie, (j) => { j.passes[1].jugement_apparie.verdict = 'gardee'; j.passes[1].rejetee = true; j.passes[1].decision = 'rejeter'; j.arret = { passe: 1, raison: 'regression' }; j.score_affiche = { valeur: 84, nature: 'mesure' }; });
  rougeB('B16 préférence des relecteurs pour la gardée, passe gardée quand même', 'B16', apparieGardee, (j) => { j.passes[1].rejetee = false; j.passes[1].decision = 'arreter'; j.arret = { passe: 2, raison: 'zero_majeur' }; j.score_affiche = { valeur: 91, nature: 'mesure' }; });
  rougeB('B5 arrêt « regression » sans jugement apparié qui préfère la gardée', 'B5', apparieGardee, (j) => { j.passes[1].jugement_apparie.verdict = 'corrigee'; j.passes[1].jugement_apparie.relecteurs.forEach((r) => { r.prefere = 'corrigee'; }); });
  // TF-2236 (16/11/2026) : la fiche des prémisses d'environnement. Le 06/11/2026, les 10 relecteurs ont revérifié chacun
  // `bootstrap.mjs --pull` et `allouer-indice.mjs` (10 sur 10) et les règles R-4 et R-25 : 112 de leurs 165 appels d'outil.
  const fiche = () => {
    const j = essai();
    j.arbitre.fiche_premisses = true;
    j.fiche_premisses = [
      { commande: 'node bootstrap.mjs --pull', sortie: 'exit 0, 14 dépôts à jour', heure: '2026-11-16T10:02:11+01:00' },
      { commande: 'node scripts/allouer-indice.mjs --dossier output/03-etudes --jour 20261116', sortie: 'b', heure: '2026-11-16T10:02:40+01:00' },
    ];
    j.passes.forEach((p) => { p.relecteur.fiche_remise = true; });
    return j;
  };
  cas.push({ nom: 'TF-2236 vert — fiche de 2 prémisses mesurées, remise aux relecteurs des 2 passes', j: fiche(), attendu: [] });
  cas.push({ nom: 'TF-2236 vert — fiche vide mais déclarée et remise : le prompt ne pose aucune prémisse d environnement', j: (() => { const j = fiche(); j.fiche_premisses = []; return j; })(), attendu: [] });
  rougeB('B17 fiche absente du journal', 'B17', fiche, (j) => { delete j.fiche_premisses; });
  rougeB('B17 prémisse sans sortie', 'B17', fiche, (j) => { delete j.fiche_premisses[0].sortie; });
  rougeB('B17 prémisse sans heure lisible', 'B17', fiche, (j) => { j.fiche_premisses[1].heure = 'ce matin'; });
  rougeB('B17 fiche non remise au relecteur de la passe 2', 'B17', fiche, (j) => { delete j.passes[1].relecteur.fiche_remise; });
  // TF-2241 (16/11/2026) : le type d'agent du relecteur. Le 06/11/2026, les 10 relecteurs, agents généraux sur Opus,
  // ouvraient avec 46 190 à 46 279 jetons de contexte ; les 5 vérificateurs, agent dédié, avec 17 362 à 17 435.
  const typee = () => {
    const j = essai();
    j.arbitre.type_relecteur = 'relecteur';
    j.passes.forEach((p) => { p.relecteur.type = 'relecteur'; p.relecteur.contexte_depart = 16800; });
    return j;
  };
  cas.push({ nom: 'TF-2241 vert — les relecteurs des 2 passes sont lancés avec le type dédié « relecteur »', j: typee(), attendu: [] });
  cas.push({ nom: 'TF-2241 vert — repli motivé sur « general-purpose » (type absent hors du pilot)', j: (() => { const j = typee(); Object.assign(j.passes[1].relecteur, { type: 'general-purpose', repli: 'type relecteur absent de ce projet : dossier .claude/agents sans relecteur.md' }); return j; })(), attendu: [] });
  rougeB('B18 relecteur général sans motif de repli', 'B18', typee, (j) => { j.passes[1].relecteur.type = 'general-purpose'; });
  rougeB('B18 type du relecteur non déclaré', 'B18', typee, (j) => { delete j.passes[0].relecteur.type; });
  // D-240 (b), 23/11/2026 : le relecteur tiers (Codex ou Gemini) se déclare avec son modèle servi.
  cas.push({ nom: 'D-240 vert — relecteur tiers Codex déclaré avec son modèle', j: (() => { const j = typee(); Object.assign(j.passes[1].relecteur, { type: 'codex', modele: 'gpt-6.2-sol' }); return j; })(), attendu: [] });
  rougeB('B18 relecteur tiers sans modèle déclaré', 'B18', typee, (j) => { j.passes[1].relecteur.type = 'antigravity'; });
  // TF-2242 (16/11/2026) : le vérificateur de clôture sur le diff. Les 11 défauts créés qui ont échappé aux
  // vérificateurs du 14/11/2026 étaient des affirmations sans preuve : « la commande tourne sous Bash », « la seule
  // durée disponible », « repris du tableau de Q1 ». Chaque phrase ajoutée reçoit ici son état.
  const diff = () => {
    const j = essai();
    j.arbitre.verification_diff = true;
    j.passes[1].verification_cloture.ajouts = [
      { phrase: '« (sous Bash) : node scripts\\allouer-indice.mjs »', etat: 'verifiee', premisse: 'la commande tourne sous Bash', commande: 'bash -c "node scripts/allouer-indice.mjs --aide"', resultat: 'exit 0, usage affiché' },
      { phrase: '« le taux se définit par le nombre de relecteurs »', etat: 'sans_premisse', motif: 'la phrase définit un choix de conception, elle n affirme aucun fait' },
      { phrase: '« la seule durée disponible »', etat: 'non_verifiable', sort: 'retire' },
    ];
    return j;
  };
  cas.push({ nom: 'TF-2242 vert — 3 phrases ajoutées classées : 1 vérifiée par commande, 1 qui définit, 1 non vérifiable retirée', j: diff(), attendu: [] });
  cas.push({ nom: 'TF-2242 vert — la correction n ajoute aucune phrase : liste vide mais déclarée', j: (() => { const j = diff(); j.passes[1].verification_cloture.ajouts = []; return j; })(), attendu: [] });
  rougeB('B19 liste des phrases ajoutées absente', 'B19', diff, (j) => { delete j.passes[1].verification_cloture.ajouts; });
  rougeB('B19 phrase « verifiee » sans commande', 'B19', diff, (j) => { delete j.passes[1].verification_cloture.ajouts[0].commande; });
  rougeB('B19 phrase non vérifiable gardée', 'B19', diff, (j) => { j.passes[1].verification_cloture.ajouts[2].sort = 'garde'; });
  rougeB('B19 phrase « sans_premisse » sans motif', 'B19', diff, (j) => { delete j.passes[1].verification_cloture.ajouts[1].motif; });
  rougeB('B19 état hors des trois états', 'B19', diff, (j) => { j.passes[1].verification_cloture.ajouts[1].etat = 'probable'; });
  // Les sept règles du 16/11/2026 ensemble : une boucle neuve qui les déclare toutes se juge sans que l'une contredise l'autre.
  const toutes = () => {
    const j = essai();
    Object.assign(j.arbitre, { score_de_passe: 'moyenne', bruit_tolere: 'mesure', arret_atteignable: true, garde_cumulee: 0.3,
      jugement_apparie: true, fiche_premisses: true, type_relecteur: 'relecteur', verification_diff: true });
    j.fiche_premisses = [{ commande: 'node bootstrap.mjs --pull', sortie: 'exit 0, 14 dépôts à jour', heure: '2026-11-16T10:02:11+01:00' }];
    j.passes.forEach((p) => Object.assign(p.relecteur, { type: 'relecteur', fiche_remise: true }));
    j.passes[0].scores_relecteurs = [86, 82]; j.passes[0].score_mesure = 84;
    j.passes[1].scores_relecteurs = [92, 90]; j.passes[1].score_mesure = 91;
    j.passes[1].jugement_apparie = { presentation: 'sans_etiquette', verdict: 'corrigee',
      relecteurs: [voix('relecteur-2a', 'gardee_en_premier', 'corrigee', 83, 92), voix('relecteur-2b', 'corrigee_en_premier', 'corrigee', 84, 90)] };
    j.passes[1].verification_cloture.ajouts = [{ phrase: '« 14 dépôts »', etat: 'verifiee', premisse: 'le parc compte 14 dépôts', commande: 'node bootstrap.mjs --pull', resultat: '14 dépôts à jour' }];
    return j;
  };
  cas.push({ nom: 'TF-2236 à TF-2242 vert — une boucle neuve qui déclare les sept règles du 16/11/2026 à la fois', j: toutes(), attendu: [] });
  // TF-2673 (16/11/2026) : un recompte qui lit un champ de données lit aussi sa règle d'écriture et croise le fait avec
  // une seconde source. Cas d'origine : `sans_parole` à faux sur 14 clips, lu sans sa règle (vraie pour une description
  // validée seulement), alors que DESCRIPTIONS-CLIPS.md relevait « musique seule » sur les 15.
  const champ = () => {
    const j = base();
    const d = j.passes[0].defauts[0];
    d.recompte = { ...d.recompte, champ: 'data/v2/clips.json : sans_parole',
      regle_ecriture: { commande: 'git grep -n "sans_parole" scripts/', resultat: 'écrit à vrai seulement pour une description validée (scripts/valider.mjs:41)' },
      seconde_source: { commande: 'git grep -c "musique seule" DESCRIPTIONS-CLIPS.md', resultat: '15 clips relevés sans parole' } };
    return j;
  };
  cas.push({ nom: 'TF-2673 recompte d un champ avec sa règle d écriture et une seconde source, vert', j: champ(), attendu: [] });
  cas.push({ nom: 'TF-2673 champ sans fait (porte_un_fait false) : la règle d écriture suffit, vert', j: (() => { const j = champ(); delete j.passes[0].defauts[0].recompte.seconde_source; j.passes[0].defauts[0].recompte.porte_un_fait = false; return j; })(), attendu: [] });
  rougeB('B20 champ lu sans sa règle d écriture (le recompte du 16/11)', 'B20', champ, (j) => { delete j.passes[0].defauts[0].recompte.regle_ecriture; });
  rougeB('B20 champ porteur d un fait sans seconde source', 'B20', champ, (j) => { delete j.passes[0].defauts[0].recompte.seconde_source; });
  rougeB('B20 champ d une note reprise lu sans sa règle d écriture', 'B20', notes, (j) => {
    j.passes[1].notes_reprises[0].recompte = { ...j.passes[1].notes_reprises[0].recompte, champ: 'data/v2/clips.json : sans_parole', porte_un_fait: false };
  });
  let ok = 0;
  const lignes = [];
  for (const c of cas) {
    const regles = [...new Set(juger(c.j).map((x) => x.regle))].sort();
    const bon = JSON.stringify(regles) === JSON.stringify(c.attendu);
    if (bon) ok++;
    lignes.push(`${bon ? 'ok  ' : 'KO  '} ${c.nom} → ${regles.join(',') || 'PASS'} (attendu ${c.attendu.join(',') || 'PASS'})`);
  }
  process.stdout.write(lignes.join('\n') + `\n${ok}/${cas.length}\n`);
  process.exit(ok === cas.length ? 0 : 1);
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();
const file = args.find((x) => !x.startsWith('--'));
if (!file || !fs.existsSync(file)) sortir(file || null, 'SKIP', [], 'journal absent', 2);
let j;
try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { sortir(file, 'SKIP', [], `journal illisible : ${e.message}`, 2); }
if (!j || j.schema !== 'l99-boucle@1') sortir(file, 'SKIP', [], 'schéma attendu : l99-boucle@1', 2);
const findings = juger(j);
sortir(file, findings.length ? 'FAIL' : 'PASS', findings, null, findings.length ? 1 : 0);
