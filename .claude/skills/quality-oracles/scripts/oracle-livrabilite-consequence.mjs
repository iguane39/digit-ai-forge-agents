#!/usr/bin/env node
// oracle-livrabilite-consequence — Domaine « Livrabilité d'une conséquence déclarée » (.md, .html).
//
// DÉFAUT PAYÉ (Produit-05, 31/08/2026) : un livrable qui raisonne sur les conséquences d'une
// question sans réponse écrit des états de repli — et rien ne vérifiait qu'un responsable
// accepterait de les mettre en production. Deux lignes, présentes depuis six versions et
// validées par quatre portes : « Des utilisateurs découvriront la situation en production, et
// le support n'aura pas de réponse à leur donner. » · « Coût : un message client à préparer et
// une vague d'appels au support le lendemain de chaque bascule. » Les deux CHIFFRENT EN CHARGE
// DE SUPPORT une bascule de clients réels SANS PRÉAVIS. En comptabilisant le manque en tickets,
// la colonne le RENDAIT INVISIBLE au lieu de le révéler.
//
// TEST OPPOSABLE (v1.0.0) : une conséquence qu'aucun responsable n'accepterait de mettre en
// production n'est pas un repli, c'est une IMPASSE, et elle s'écrit comme telle.
//
// CHECKLIST CANONIQUE
//   L1 — toute forme décrivant un UTILISATEUR FINAL SUBISSANT LA DÉCOUVERTE, énoncée dans un
//        CONTEXTE DE REPLI (sans réponse, faute de réponse, par défaut, si personne ne tranche),
//        exige soit une reformulation en impasse, soit un élément du MÊME livrable couvrant
//        l'information de cet utilisateur (préavis, notification, communication).
//   L2 — quand aucun élément de couverture n'existe NULLE PART dans le livrable, le finding le
//        dit : le défaut ne cache plus l'écart, il le déclare.
//
// Déclenchement par CONTENU (formes de subissance), jamais sur tout .md du parc.
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const ORACLE = 'oracle-livrabilite-consequence', DOM = 'Livrabilité d\'une conséquence déclarée';
const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--profil');
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
const NJ = [
  'le caractère réellement inacceptable d\'une conséquence (jugement métier) — seules les formes listées sont détectées',
  'les conséquences énoncées sans forme de subissance repérable (paraphrases hors liste)',
  'la qualité du préavis trouvé (son existence est vérifiée, pas son contenu ni son délai)',
  'les conséquences hors contexte de repli (une conséquence assumée d\'une décision prise n\'est pas jugée ici)'
];
const out = (verdict, findings, nj, code) => {
  process.stdout.write(JSON.stringify({ oracle: ORACLE, domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj }));
  process.exit(code);
};
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
const ext = path.extname(file).toLowerCase();
if (!['.md', '.html', '.htm'].includes(ext)) out('SKIP', [], ['extension non gérée : ' + ext], 2);
const raw = fs.readFileSync(file, 'utf8');
const base = path.basename(file);
const lines = raw.split('\n').map(l => (ext === '.md' ? l : l.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')));

// ---- vocabulaire (surchargeable par profil : livrabilite.*) -----------------------------------
let PROFIL = {};
if (pArg && fs.existsSync(pArg)) { try { PROFIL = JSON.parse(fs.readFileSync(pArg, 'utf8')); } catch { /* profil illisible : vocabulaire par défaut */ } }
const c = PROFIL.livrabilite || {};
const rx = (arr, def) => (Array.isArray(arr) && arr.length ? arr : def).map(s => new RegExp(s, 'i'));

// Formes décrivant un utilisateur final qui SUBIT la découverte.
const SUBISSANCE = rx(c.formes_subissance, [
  'd[ée]couvrir(?:a|ont|aient|ait)[^.\\n]{0,80}(?:en production|la situation|le changement|la bascule)',
  'd[ée]couvriront',
  '(?:le\\s+)?support\\s+n[\'’]aura\\s+pas\\s+de\\s+r[ée]ponse',
  'vague\\s+d[\'’]appels',
  's[\'’]en\\s+apercevr(?:a|ont)',
  'sans\\s+(?:avoir\\s+[ée]t[ée]\\s+|[êe]tre\\s+)?pr[ée]venus?\\b',
  'sans\\s+(?:les\\s+)?pr[ée]venir',
  'l[\'’]utilisateur\\s+(?:final\\s+)?(?:d[ée]couvrira|constatera|subira)'
]);
// Contexte de repli : la conséquence est écrite FAUTE de décision, pas comme suite d'une décision.
const REPLI = rx(c.contextes_repli, [
  'sans\\s+r[ée]ponse', 'faute\\s+de\\s+r[ée]ponse', 'par\\s+d[ée]faut', 'si\\s+personne\\s+ne\\s+tranche',
  'repli', '[àa]\\s+d[ée]faut', 'en\\s+l[\'’]absence\\s+de\\s+(?:d[ée]cision|r[ée]ponse|arbitrage)',
  'cons[ée]quence', 'si\\s+rien\\s+n[\'’]est\\s+(?:d[ée]cid[ée]|tranch[ée])', 'non\\s+tranch[ée]',
  'question\\s+(?:ouverte|sans\\s+r[ée]ponse)', 'hypoth[èe]se\\s+H\\d'
]);
// Sortie 1 — la conséquence est nommée pour ce qu'elle est : une impasse.
const IMPASSE = rx(c.marqueurs_impasse, [
  'impasse', 'inacceptable', 'r[ée]dhibitoire', 'non\\s+livrable', 'pas\\s+livrable',
  'ne\\s+peut\\s+pas\\s+[êe]tre\\s+(?:livr|mis\\s+en\\s+production)', '[àa]\\s+ne\\s+pas\\s+livrer',
  'interdit\\s+de\\s+livrer', 'aucun\\s+responsable\\s+n[\'’]accepterait'
]);
// Sortie 2 — le livrable porte, quelque part, de quoi INFORMER l'utilisateur concerné.
const COUVERTURE = rx(c.marqueurs_couverture, [
  'pr[ée]avis', 'pr[ée]venir\\s+les\\s+(?:utilisateurs|clients)', 'notifier', 'notification',
  'informer\\s+les\\s+(?:utilisateurs|clients)', 'information\\s+des\\s+(?:utilisateurs|clients)',
  'communication\\s+(?:client|utilisateur)', 'annonce\\s+(?:aux|de\\s+la)', 'campagne\\s+d[\'’]information'
]);

const couvertureLignes = [];
lines.forEach((l, i) => { if (COUVERTURE.some(r => r.test(l))) couvertureLignes.push(i + 1); });
const couvert = couvertureLignes.length > 0;

// ---- L1/L2 ------------------------------------------------------------------------------------
const findings = []; let detectees = 0, conformes = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const m = SUBISSANCE.map(r => l.match(r)).find(Boolean);
  if (!m) continue;
  const contexte = lines.slice(Math.max(0, i - 5), i + 2).join(' ');   // 5 lignes amont + la suivante
  if (!REPLI.some(r => r.test(contexte))) continue;                    // conséquence assumée, hors périmètre
  detectees++;
  const bloc = lines.slice(Math.max(0, i - 3), i + 4).join(' ');
  if (IMPASSE.some(r => r.test(bloc))) { conformes++; continue; }
  if (couvert) { conformes++; continue; }
  findings.push({
    sev: 'bloquant',
    msg: `L1 — conséquence de repli non livrable : « ${m[0].trim().slice(0, 70)} » décrit un utilisateur final qui SUBIT la découverte, sans reformulation en impasse ; `
      + `L2 — et le livrable ne porte NULLE PART d'élément couvrant l'information de cet utilisateur (préavis, notification, communication)`,
    where: base + ':' + (i + 1)
  });
}

if (!detectees) out('SKIP', [], [...NJ, 'aucune forme de subissance en contexte de repli — hors périmètre'], 2);
if (findings.length) out('FAIL', findings, NJ, 1);
out('PASS', [{
  sev: 'info',
  msg: `${conformes}/${detectees} conséquence(s) de repli livrable(s) : reformulée(s) en impasse ou couverte(s) par un élément d'information de l'utilisateur`
    + (couvert ? ` (couverture trouvée ligne(s) ${couvertureLignes.slice(0, 5).join(', ')})` : ''),
  where: base
}], NJ, 0);
