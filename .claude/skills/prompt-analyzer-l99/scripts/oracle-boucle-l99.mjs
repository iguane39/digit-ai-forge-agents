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
const RAISONS = new Set(['zero_majeur', 'gain_insuffisant', 'borne']);

const propre = (x) => typeof x === 'string' && x.trim() !== '';
const nb = (x) => typeof x === 'number' && Number.isFinite(x);
const retenus = (p) => (p.defauts || []).filter((d) => GRAVES.has(d.severite) && d.statut === 'retenu');

export function juger(j) {
  const f = [];
  const ko = (regle, lieu, message) => f.push({ regle, statut: 'FAIL', lieu, message });
  const a = j && j.arbitre;
  const passes = Array.isArray(j && j.passes) ? j.passes : [];

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
  if (!ar || !nb(ar.passe) || !RAISONS.has(ar.raison)) ko('B5', 'arret', 'arrêt absent, ou raison hors de zero_majeur, gain_insuffisant, borne');
  else {
    const idx = passes.findIndex((p) => p.n === ar.passe);
    const pa = passes[idx];
    if (!pa) ko('B5', 'arret.passe', `la passe ${ar.passe} n existe pas`);
    else {
      if (idx !== passes.length - 1) ko('B5', 'arret.passe', 'des passes suivent la passe d arrêt');
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
      if (ar.raison === 'borne' && nb(borneEff) && passes.length < borneEff)
        ko('B5', 'arret.raison', `borne déclarée atteinte à ${passes.length} passe(s) sur ${borneEff}`);
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
    if (passes.length > borneEff) ko('B6', 'passes', `${passes.length} passes pour une borne de ${borneEff}`);
  }

  // B7 — score affiché
  const s = j && j.score_affiche;
  const pa = ar && passes.find((p) => p.n === ar.passe);
  if (!s || s.nature !== 'mesure') ko('B7', 'score_affiche', 'le score affiché doit être de nature « mesure », jamais projeté');
  else if (pa && s.valeur !== pa.score_mesure) ko('B7', 'score_affiche.valeur', `score affiché ${s.valeur}, mesuré ${pa.score_mesure} à la passe d arrêt`);

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
