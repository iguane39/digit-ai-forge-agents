// plan-d-amelioration — bibliothèque partagée des trois verbes (joindre, juger, rendre).
//
// Une seule source pour la lecture du plan, des fichiers de l'audit et des règles du contrat :
// `joindre.mjs` et `oracle-plan-d-amelioration.mjs` appellent les MÊMES fonctions, de sorte que
// ce que le verbe joindre refuse, le juge le refuse aussi (TF-1234, 12/10/2026).
//
// Zéro dépendance (règle de la forge) : le fichier d'actions de forge-audit est en YAML ; on n'en
// lit que ce que la jonction consomme (audit_ref, et par action : id, title, control_ref,
// finding_ref, severity, priority), par un extracteur borné documenté plus bas. Une version JSON
// du même fichier est acceptée telle quelle.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILLDIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTRAT = 'plan-d-amelioration@1.0.0';

export const STATUTS_CHIFFRE = ['mesure', 'lu', 'hypothese'];
export const STATUTS_EXISTANT = ['neuve', 'deja_planifiee', 'contraire_decision'];
export const HORIZONS = ['court', 'moyen', 'long'];
export const COMPLEXITES = ['simple', 'moyen', 'complexe', 'tres_complexe'];
export const DUREES = ['court', 'moyen', 'long'];
export const RELATIONS = ['rend_caduque', 'modifie', 'conditionne'];
export const QUESTIONS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];

/** Les dix champs de la fiche (contrat, critère 1). `horizon` et `rang` relèvent du critère 8. */
export const CHAMPS_FICHE = ['id', 'titre', 'constat', 'cible', 'proposition', 'gain', 'effort',
  'dependances', 'statut_existant', 'preuve_cloture'];

/** Un effort exprimé en jours, sous toutes ses graphies relevées (critère 9). */
export const RE_JOURS = /\b\d+(?:[.,]\d+)?\s*(?:j|jh|j\/h|j-h|jours?|jours?-hommes?|hommes?-jours?|days?|man-days?)(?![\p{L}\d])/iu;

/** Une quantité chiffrée portant une unité : c'est elle qui doit porter un statut (critère 3). */
export const RE_QUANTITE = /\d+(?:[  .,]\d+)*\s*(?:%|ms\b|s\b|€|k€|M€|Mo\b|Go\b|Ko\b|To\b|req\/s|rps\b|utilisateurs\b|clients\b|instances\b|minutes?\b|min\b|heures?\b|h\b|secondes?\b)/giu;

const vide = (v) => v == null || (typeof v === 'string' && (!v.trim() || /^(?:à préciser|a preciser|tbd|todo|\?+|-+|n\/a)$/i.test(v.trim())));

export function lireDomaines(fichier = path.join(SKILLDIR, 'references', 'domaines.json')) {
  return JSON.parse(fs.readFileSync(fichier, 'utf8'));
}

/**
 * Extracteur BORNÉ du fichier d'actions de forge-audit (contrat d'interface 1.1.0).
 * Il lit `audit_ref` au premier niveau, puis, sous `actions:`, chaque élément ouvert par
 * « - id: » et ses clés SCALAIRES au niveau de l'élément. Les blocs imbriqués (activation, story,
 * verification) sont ignorés : la jonction ne les consomme pas. Ce n'est pas un analyseur YAML :
 * une ancre, un alias ou un scalaire multiligne sur l'une des six clés lues n'est pas compris, et
 * l'oracle le déclare dans son non-jugé.
 */
export function lireActions(fichier) {
  const brut = fs.readFileSync(fichier, 'utf8');
  if (/\.json$/i.test(fichier)) {
    const j = JSON.parse(brut);
    return { audit_ref: j.audit_ref ?? null, actions: (j.actions || []).map((a) => ({ ...a })) };
  }
  const nettoie = (v) => {
    let s = v.replace(/\s+#.*$/, '').trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
    return s;
  };
  const lignes = brut.split(/\r?\n/);
  let audit_ref = null;
  const actions = [];
  let dansActions = false, courant = null, indentCle = null;
  for (const l of lignes) {
    if (/^\s*(#|$)/.test(l)) continue;
    const haut = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (haut) {
      dansActions = haut[1] === 'actions';
      if (haut[1] === 'audit_ref') audit_ref = nettoie(haut[2]);
      courant = null;
      continue;
    }
    if (!dansActions) continue;
    const item = l.match(/^(\s*)-\s+id:\s*(.+)$/);
    if (item) {
      courant = { id: nettoie(item[2]) };
      actions.push(courant);
      indentCle = item[1].length + 2;
      continue;
    }
    if (!courant) continue;
    const cle = l.match(/^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/);
    if (cle && cle[1].length === indentCle && cle[3] !== '' && !cle[3].startsWith('[')) {
      if (['title', 'control_ref', 'finding_ref', 'severity', 'priority', 'effort'].includes(cle[2])) courant[cle[2]] = nettoie(cle[3]);
    }
  }
  return { audit_ref, actions };
}

export function lireControles(fichier) {
  const j = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  return { audit_ref: j.audit_ref ?? null, contrat: j.contrat ?? null, controles: j.controles || [] };
}

/** Résout les fichiers de l'audit : options CLI d'abord, sinon chemins du plan (relatifs au plan). */
export function chargerAudit(plan, fichierPlan, { actions = null, controles = null } = {}) {
  const base = path.dirname(path.resolve(fichierPlan));
  const res = (p) => (p ? path.resolve(base, p) : null);
  const fa = actions ? path.resolve(actions) : res(plan?.audit?.actions);
  const fc = controles ? path.resolve(controles) : res(plan?.audit?.controles_evalues);
  const out = { fichierActions: fa, fichierControles: fc, actions: null, controles: null, erreurs: [] };
  if (fa) { try { out.actions = lireActions(fa); } catch (e) { out.erreurs.push(`fichier d'actions illisible (${fa}) : ${e.message}`); } }
  if (fc) { try { out.controles = lireControles(fc); } catch (e) { out.erreurs.push(`liste des contrôles évalués illisible (${fc}) : ${e.message}`); } }
  return out;
}

const contient = (texte, id) => new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(texte || '');

/**
 * LE VERBE JOINDRE. Rend les doublons (une fiche rattachée à un contrôle évalué ou à un constat de
 * l'audit), les renvois orphelins, et la table de jonction consolidée : celle que le plan déclare,
 * plus les liens « conditionne » que les dépendances des fiches impliquent.
 */
export function joindre(plan, audit) {
  const fiches = plan.fiches || [];
  const ids = new Set(fiches.map((f) => f.id));
  const actions = audit.actions?.actions || null;
  const rems = actions ? new Set(actions.map((a) => a.id)) : null;
  const evalues = audit.controles
    ? new Set(audit.controles.controles.filter((c) => c.verdict !== 'a_evaluer').map((c) => c.id))
    : null;
  const constatsAudit = actions ? actions.map((a) => a.finding_ref).filter(Boolean) : [];

  const doublons = [];
  for (const f of fiches) {
    const texte = `${f.constat?.texte ?? ''} ${f.constat?.source ?? ''}`;
    if (evalues) {
      if (f.control_ref && evalues.has(f.control_ref)) doublons.push({ fiche: f.id, motif: `control_ref ${f.control_ref} est un contrôle ÉVALUÉ par l'audit : c'est une remédiation, à citer, pas une fiche` });
      for (const c of evalues) if (c !== f.control_ref && contient(texte, c)) doublons.push({ fiche: f.id, motif: `le constat cite le contrôle évalué ${c} : écart à une norme, donc remédiation` });
    }
    for (const cst of constatsAudit) if (contient(texte, cst)) doublons.push({ fiche: f.id, motif: `le constat reprend le constat d'audit ${cst} : il vit déjà dans le rapport` });
  }

  const orphelins = [];
  const verifierRef = (ref, ou) => {
    if (/^AM-/.test(ref)) { if (!ids.has(ref)) orphelins.push({ ref, ou, motif: 'fiche AM inconnue du plan' }); }
    else if (/^REM-/.test(ref)) { if (rems && !rems.has(ref)) orphelins.push({ ref, ou, motif: "action REM absente du fichier d'actions de l'audit" }); }
    else orphelins.push({ ref, ou, motif: 'renvoi ni AM ni REM' });
  };
  for (const f of fiches) for (const d of (Array.isArray(f.dependances) ? f.dependances : [])) verifierRef(d, `${f.id}.dependances`);
  (plan.jonction || []).forEach((j, i) => { verifierRef(j.rem, `jonction[${i}].rem`); verifierRef(j.am, `jonction[${i}].am`); });

  const table = (plan.jonction || []).map((j) => ({ ...j, origine: 'declaree' }));
  const deja = new Set(table.map((j) => `${j.rem}|${j.am}`));
  for (const f of fiches) for (const d of (Array.isArray(f.dependances) ? f.dependances : [])) {
    if (/^REM-/.test(d) && !deja.has(`${d}|${f.id}`)) {
      table.push({ rem: d, am: f.id, relation: 'conditionne', note: `la fiche ${f.id} dépend de cette remédiation`, origine: 'derivee' });
      deja.add(`${d}|${f.id}`);
    }
  }
  const remSansLien = actions ? actions.filter((a) => !table.some((j) => j.rem === a.id)).map((a) => a.id) : null;
  return { doublons, orphelins, table, remSansLien, joue: { doublons: !!evalues || constatsAudit.length > 0, rems: !!rems } };
}

/** Collecte toutes les chaînes d'un objet, avec leur chemin, pour les balayages (critère 9). */
function chaines(o, chemin = '', out = []) {
  if (typeof o === 'string') out.push([chemin, o]);
  else if (Array.isArray(o)) o.forEach((v, i) => chaines(v, `${chemin}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) chaines(v, chemin ? `${chemin}.${k}` : k, out);
  return out;
}

/**
 * LE VERBE JUGER — le contrat de sortie, règle par règle. Rend { findings, nonJuge }.
 * Chaque constat porte sa règle (PA1…PA14), sa localisation (chemin dans le plan) et son message.
 */
export function juger(plan, audit, { domaines = lireDomaines() } = {}) {
  const F = [];
  const ko = (regle, ou, msg) => F.push({ regle, localisation: ou, msg: `${regle} ${ou} — ${msg}` });
  const nonJuge = [];
  const fiches = Array.isArray(plan.fiches) ? plan.fiches : [];
  if (plan.contrat !== CONTRAT) ko('PA0', 'contrat', `attendu « ${CONTRAT} », lu « ${plan.contrat ?? '(absent)'} »`);

  // Base de domaines effective : celle du référentiel, ajustée par le plan (avec motif).
  const codes = new Set(domaines.domaines.map((d) => d.code));
  for (const [i, a] of (plan.ajustements || []).entries()) {
    if (vide(a.motif)) ko('PA5', `ajustements[${i}]`, `domaine ${a.domaine} ${a.action ?? '?'} sans motif`);
    if (a.action === 'ajoute') codes.add(a.domaine);
    else if (a.action === 'retire') codes.delete(a.domaine);
    else ko('PA5', `ajustements[${i}]`, `action « ${a.action} » hors de ajoute | retire`);
  }

  // PA1 — dix champs, identifiant, domaine connu, unicité.
  const vus = new Set();
  fiches.forEach((f, i) => {
    const ou = f.id || `fiches[${i}]`;
    for (const c of CHAMPS_FICHE) {
      const v = f[c];
      const absent = c === 'dependances' ? !Array.isArray(v) : (v == null || (typeof v === 'string' && vide(v)));
      if (absent) ko('PA1', ou, `champ « ${c} » absent ou vide`);
    }
    const m = /^AM-([A-Z]+)-(\d{2,})$/.exec(f.id || '');
    if (!m) ko('PA1', ou, 'identifiant hors du motif AM-<DOMAINE>-NN');
    else {
      if (!codes.has(m[1])) ko('PA1', ou, `domaine ${m[1]} absent de la base (référentiel + ajustements)`);
      if (f.domaine && f.domaine !== m[1]) ko('PA1', ou, `champ domaine « ${f.domaine} » contredit l'identifiant`);
    }
    if (vus.has(f.id)) ko('PA1', ou, 'identifiant en double');
    vus.add(f.id);
    if (f.proposition && typeof f.proposition === 'object') {
      if (vide(f.proposition.texte)) ko('PA1', `${ou}.proposition`, 'proposition sans texte');
      if (vide(f.proposition.alternative_ecartee) || vide(f.proposition.motif_ecart)) ko('PA1', `${ou}.proposition`, "l'alternative écartée et son motif sont exigés");
    }
    if (f.gain && typeof f.gain === 'object' && (vide(f.gain.attendu) || vide(f.gain.constate_par))) ko('PA1', `${ou}.gain`, 'gain attendu ET « à quoi on le constatera » exigés');
    if (f.effort && typeof f.effort === 'object') {
      if (!COMPLEXITES.includes(f.effort.complexite)) ko('PA1', `${ou}.effort`, `complexité « ${f.effort.complexite} » hors de ${COMPLEXITES.join(' | ')}`);
      if (!DUREES.includes(f.effort.duree)) ko('PA1', `${ou}.effort`, `durée « ${f.effort.duree} » hors de ${DUREES.join(' | ')}`);
    }
  });

  // PA2 — constat et cible sourcés : une fiche sans constat sourcé ou sans cible est RETIRÉE.
  fiches.forEach((f, i) => {
    const ou = f.id || `fiches[${i}]`;
    if (f.constat && (typeof f.constat !== 'object' || vide(f.constat.texte) || vide(f.constat.source))) ko('PA2', `${ou}.constat`, 'constat sans texte ou sans source (fichier et ligne, document, ou mesure) — la fiche se retire, elle ne s adoucit pas');
    if (f.cible && (typeof f.cible !== 'object' || vide(f.cible.texte) || vide(f.cible.source))) ko('PA2', `${ou}.cible`, 'cible servie sans citation de sa source (documentation du produit ou réponse Q1-Q5)');
  });

  // PA3 — chaque chiffre a un statut ; « mesuré » exige commande et sortie ; toute quantité
  // chiffrée d'un texte de fiche figure à la liste des chiffres.
  fiches.forEach((f, i) => {
    const ou = f.id || `fiches[${i}]`;
    const chiffres = Array.isArray(f.chiffres) ? f.chiffres : [];
    chiffres.forEach((c, k) => {
      if (!STATUTS_CHIFFRE.includes(c.statut)) ko('PA3', `${ou}.chiffres[${k}]`, `statut « ${c.statut ?? '(absent)'} » hors de mesure | lu | hypothese`);
      else if (c.statut === 'mesure' && (vide(c.commande) || vide(c.sortie))) ko('PA3', `${ou}.chiffres[${k}]`, `« ${c.valeur} » au statut mesuré sans commande ET sortie`);
      else if (c.statut === 'lu' && vide(c.source)) ko('PA3', `${ou}.chiffres[${k}]`, `« ${c.valeur} » au statut lu sans document ni ligne`);
    });
    const norm = (s) => String(s).replace(/[\s  ]/g, '').toLowerCase();
    const declares = chiffres.map((c) => norm(c.valeur ?? ''));
    const textes = [f.constat?.texte, f.cible?.texte, f.proposition?.texte, f.gain?.attendu, f.gain?.constate_par, f.preuve_cloture].filter((t) => typeof t === 'string');
    for (const t of textes) for (const q of t.matchAll(RE_QUANTITE)) {
      if (!declares.some((d) => d.includes(norm(q[0])) || norm(q[0]).includes(d) && d)) ko('PA3', ou, `quantité « ${q[0].trim()} » écrite sans statut (absente de la liste des chiffres)`);
    }
  });

  // PA4 + PA7 — jonction : zéro doublon, renvois résolus, table présente.
  const j = joindre(plan, audit);
  for (const d of j.doublons) ko('PA4', d.fiche, d.motif);
  if (!j.joue.doublons) nonJuge.push("PA4 (zéro doublon) : aucun fichier de l'audit fourni (ni liste des contrôles évalués, ni fichier d'actions) — la frontière norme / ambition n'est PAS vérifiée sur ce plan");
  if (!Array.isArray(plan.jonction)) ko('PA7', 'jonction', 'table de jonction absente — obligatoire, même vide');
  else plan.jonction.forEach((x, i) => { if (!RELATIONS.includes(x.relation)) ko('PA7', `jonction[${i}]`, `relation « ${x.relation} » hors de ${RELATIONS.join(' | ')}`); });
  for (const o of j.orphelins) ko('PA7', o.ou, `renvoi ${o.ref} : ${o.motif}`);
  if (!j.joue.rems) nonJuge.push("PA7 : renvois REM non résolus — fichier d'actions de l'audit non fourni");

  // PA5 — couverture : chaque domaine de la base a une fiche ou une ligne motivée.
  const couverts = new Set(fiches.map((f) => (/^AM-([A-Z]+)-/.exec(f.id || '') || [])[1]).filter(Boolean));
  const sansFiche = new Map((plan.domaines_sans_fiche || []).map((d) => [d.domaine, d]));
  for (const c of codes) {
    if (couverts.has(c)) continue;
    const d = sansFiche.get(c);
    if (!d) ko('PA5', `domaine ${c}`, 'ni fiche, ni ligne motivée dans domaines_sans_fiche');
    else if (vide(d.motif) || vide(d.regarde)) ko('PA5', `domaines_sans_fiche ${c}`, 'la ligne dit le motif ET ce qui a été regardé');
  }

  // PA6 — plans existants du produit rattachés ou déclarés hors sujet.
  if (!Array.isArray(plan.plans_existants)) ko('PA6', 'plans_existants', 'table de correspondance des plans existants absente (vide avec motif si le produit n en porte aucun)');
  else {
    if (!plan.plans_existants.length && vide(plan.plans_existants_motif)) ko('PA6', 'plans_existants', 'table vide sans motif (plans_existants_motif)');
    plan.plans_existants.forEach((p, i) => {
      if (vide(p.entree) || vide(p.source)) ko('PA6', `plans_existants[${i}]`, 'entrée sans libellé ou sans source');
      if (p.fiche) { if (!vus.has(p.fiche)) ko('PA6', `plans_existants[${i}]`, `rattachée à ${p.fiche}, fiche inconnue`); }
      else if (vide(p.hors_sujet_motif)) ko('PA6', `plans_existants[${i}]`, 'ni rattachée à une fiche, ni déclarée hors sujet avec motif');
    });
  }

  // PA8 — horizon, rang unique, dix décisions fermées.
  const rangs = new Map();
  fiches.forEach((f, i) => {
    const ou = f.id || `fiches[${i}]`;
    if (!HORIZONS.includes(f.horizon)) ko('PA8', ou, `horizon « ${f.horizon ?? '(absent)'} » hors de court | moyen | long`);
    if (!Number.isInteger(f.rang) || f.rang < 1) ko('PA8', ou, 'rang absent ou non entier positif');
    else if (rangs.has(f.rang)) ko('PA8', ou, `rang ${f.rang} déjà porté par ${rangs.get(f.rang)}`);
    else rangs.set(f.rang, f.id);
  });
  const attendu = Math.min(10, fiches.length);
  const decisions = Array.isArray(plan.decisions) ? plan.decisions : [];
  if (decisions.length !== attendu) ko('PA8', 'decisions', `${decisions.length} décision(s) en tête, ${attendu} attendue(s) (dix, ou autant que de fiches sous dix)`);
  decisions.forEach((d, i) => {
    const ou = `decisions[${i}]`;
    if (vide(d.question)) ko('PA8', ou, 'décision sans question');
    if (!Array.isArray(d.options) || d.options.length < 2) ko('PA8', ou, 'une décision fermée porte au moins deux options');
    for (const c of ['cout', 'gain', 'si_rien']) if (vide(d[c])) ko('PA8', ou, `champ « ${c} » vide (ce qu elle coûte, rapporte, et ce qui se passe si rien n est décidé)`);
    for (const r of (d.fiches || [])) if (!vus.has(r)) ko('PA8', ou, `renvoie à ${r}, fiche inconnue`);
  });

  // PA9 — aucun effort en jours. Balayé là où un effort s'écrit : l'effort de chaque fiche, le
  // coût de chaque décision, les lots de la trajectoire. Une durée de PROSE (une rétention de
  // « 30 jours » dans un constat) n'est pas un effort et n'est pas jugée — dit au non-jugé.
  const zonesEffort = [
    ...fiches.map((f, i) => [`${f.id || `fiches[${i}]`}.effort`, f.effort]),
    ...decisions.map((d, i) => [`decisions[${i}].cout`, d.cout]),
    ['trajectoire', plan.trajectoire],
  ];
  for (const [racine, v] of zonesEffort) for (const [ou, s] of chaines(v, racine)) {
    const m = RE_JOURS.exec(s);
    if (m) ko('PA9', ou, `effort exprimé en jours (« ${m[0]} ») — complexité × durée seulement`);
  }
  nonJuge.push('PA9 : une durée écrite dans la prose d un constat ou d une cible (rétention, délai observé) n est pas un effort et n est pas balayée');

  // PA10 — empreinte de l'archive étudiée identique à l'ouverture et à la clôture.
  if (plan.empreinte_archive) {
    const e = plan.empreinte_archive;
    if (vide(e.ouverture) || vide(e.cloture)) ko('PA10', 'empreinte_archive', 'empreinte d ouverture ou de clôture absente');
    else if (e.ouverture !== e.cloture) ko('PA10', 'empreinte_archive', `l archive a changé pendant le run (${e.ouverture} ≠ ${e.cloture})`);
  } else nonJuge.push("PA10 : aucune archive étudiée déclarée (empreinte_archive absente) — l'intégrité de la cible n'est pas jugée");

  // PA11 — statut vis-à-vis de l'existant.
  fiches.forEach((f, i) => {
    const ou = f.id || `fiches[${i}]`;
    const s = f.statut_existant;
    if (!s || typeof s !== 'object') return;
    if (!STATUTS_EXISTANT.includes(s.valeur)) ko('PA11', ou, `statut « ${s.valeur} » hors de ${STATUTS_EXISTANT.join(' | ')}`);
    if (s.valeur === 'deja_planifiee' && vide(s.reference)) ko('PA11', ou, 'déjà planifiée : la référence du plan existant est exigée');
    if (s.valeur === 'contraire_decision' && (vide(s.reference) || vide(s.motif))) ko('PA11', ou, 'contraire à une décision enregistrée : référence ET motif exigés');
  });

  // PA12 — intention validée (test rétro : chaque fiche remonte à une intention qui a été validée).
  const it = plan.intention;
  if (!it || vide(it.texte)) ko('PA12', 'intention', "intention absente : aucune fiche ne peut y remonter");
  else if (vide(it.validee_le) && vide(it.defaut_motif)) ko('PA12', 'intention', 'intention ni validée (validee_le) ni posée par défaut déclaré (defaut_motif)');
  fiches.forEach((f, i) => { if (vide(f.test_retro)) ko('PA12', f.id || `fiches[${i}]`, 'test rétro absent : la chaîne fiche → cible → intention n est pas écrite'); });

  // PA13 — sans instance joignable, le domaine des performances livre un plan de mesure.
  const q5 = (plan.questions_ouverture || []).find((q) => q.id === 'Q5');
  const sansInstance = q5 && /^non\b/i.test(String(q5.valeur ?? ''));
  const perfCodes = new Set(domaines.domaines.filter((d) => d.plan_de_mesure_sans_instance).map((d) => d.code));
  if (sansInstance) {
    fiches.filter((f) => perfCodes.has((/^AM-([A-Z]+)-/.exec(f.id || '') || [])[1])).forEach((f) => {
      (f.chiffres || []).forEach((c, k) => { if (c.statut === 'mesure') ko('PA13', `${f.id}.chiffres[${k}]`, `« ${c.valeur} » mesuré alors que Q5 déclare aucune instance joignable`); });
    });
    for (const c of perfCodes) if (codes.has(c) && !(plan.plan_de_mesure || []).some((m) => m.domaine === c && !vide(m.quoi) && !vide(m.comment) && !vide(m.seuil_vise)))
      ko('PA13', 'plan_de_mesure', `domaine ${c} sans instance joignable : un plan de mesure (quoi, comment, seuil visé) est exigé`);
  } else if (!q5) nonJuge.push('PA13 : Q5 non posée — la règle du plan de mesure n est pas jouée');

  // PA14 — les cinq questions d'ouverture, chacune répondue ou à défaut déclaré.
  const qs = new Map((plan.questions_ouverture || []).map((q) => [q.id, q]));
  for (const q of QUESTIONS) {
    const x = qs.get(q);
    if (!x) ko('PA14', 'questions_ouverture', `${q} absente`);
    else if (vide(x.valeur) || (x.defaut_applique !== true && vide(x.reponse_source))) ko('PA14', `questions_ouverture ${q}`, 'valeur absente, ou réponse sans source alors qu aucun défaut n est déclaré appliqué');
  }

  return { findings: F, nonJuge, jonction: j };
}
