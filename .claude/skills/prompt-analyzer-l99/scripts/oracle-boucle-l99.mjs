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
];
const GRAVES = new Set(['bloquant', 'majeur']);
// TF-2024 (29/10/2026) : la borne de base reste 3 ; une extension décidée en cours de boucle va jusqu'à 5.
const BORNE_BASE_MAX = 3;
const BORNE_EXTENSION_MAX = 5;
const RAISONS = new Set(['zero_majeur', 'gain_insuffisant', 'borne', 'regression']);
const estRejetee = (p) => p.rejetee === true || p.decision === 'rejeter';

const propre = (x) => typeof x === 'string' && x.trim() !== '';
const nb = (x) => typeof x === 'number' && Number.isFinite(x);
const retenus = (p) => (p.defauts || []).filter((d) => GRAVES.has(d.severite) && d.statut === 'retenu');

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
        if (!r || !estRejetee(r) || !(nb(r.score_mesure) && r.score_mesure < pa.score_mesure))
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
  if (a && a.rejet_regression === true) {
    const bruit = nb(a.bruit_tolere) ? Math.min(Math.max(a.bruit_tolere, 0), 2) : 0;
    let precGardee = null;
    passes.forEach((p, i) => {
      if (precGardee && nb(p.score_mesure) && nb(precGardee.score_mesure) && (precGardee.score_mesure - p.score_mesure) > bruit && !estRejetee(p))
        ko('B8', `passes[${i}]`, `le score baisse de ${precGardee.score_mesure} à ${p.score_mesure}${bruit ? ` (au-delà du bruit toléré de ${bruit})` : ''} : passe à rejeter, on garde la précédente`);
      if (!estRejetee(p)) precGardee = p;
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
