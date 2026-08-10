#!/usr/bin/env node
// oracle-cdc-cadrage — Domaine « CDC de cadrage (contrat de sortie) ».
// Vérifie un CDC de cadrage (.md) contre son contrat de sortie en 10 points :
//   C1  les 7 sections « ## SECTION 0..6 » présentes ET non vides ;
//   C2  section 1 : commandes exécutées + sorties, OU mention « inventaire impossible » ;
//   C3  section 2 : toute table à colonne « Verdict » a chaque ligne portant
//       RÉUTILISÉ / ÉTENDU / CRÉÉ ;
//   C4  section 3 : ≥ 6 seuils chiffrés (identifiants S-nn), et aucun objectif de volume brut ;
//   C5  section 3 : les deux contre-oracles (surface ET mutation) + règle d'interdiction de
//       publier le score de mutation seul ;
//   C6  section 4 : noyau et adaptateurs distingués + limite de couverture déclarée ;
//   C7  aucun terme subjectif employé comme critère (bloquant en section 3 ou sur une ligne
//       « critère » ; signalé ailleurs) ;
//   C8  convention de marquage fait / hypothèse présente ([FAIT] et [HYP]) ;
//   C9  zéro bloc de code (un CDC de cadrage ne produit pas de code) ;
//   C10 questions ouvertes en FIN de document, indicées a) b) c), une par ligne, chacune
//       portant une option recommandée et un défaut appliqué (ou marquée close).
// Provenance : chantier Forge Tests, 2026-08-02 — fixture rouge dérivée d'un CDC réel
// pré-corrections (sections manquantes, blocs de code, questions non indicées).
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOM = 'CDC de cadrage (contrat de sortie)';
const findings = [];
const non_juge = [
  "l'authenticité des sorties de commandes (C2 juge la forme du relevé, jamais sa véracité)",
  'la pertinence des valeurs de seuils (C4 les compte, ne juge pas si elles sont bien choisies)',
  "la justesse d'application du marquage FAIT/HYP (C8 vérifie la présence de la convention)",
  "les objectifs de volume formulés autrement qu'en toutes lettres (C4 ne détecte que les "
    + 'formulations explicites du type « objectif de N tests »)',
  'la qualité rédactionnelle, la pertinence du plan, la faisabilité du chiffrage'
];

const out = (verdict, code) => {
  process.stdout.write(JSON.stringify({
    oracle: 'oracle-cdc-cadrage', domaine: DOM, artefact: file || null, verdict, findings, non_juge
  }));
  process.exit(code);
};
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };

if (!file || !fs.existsSync(file)) skip('fichier absent');
if (path.extname(file).toLowerCase() !== '.md') skip('extension non gérée');

const text = fs.readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);
const base = path.basename(file);
const at = i => `${base}:${i + 1}`;
const ko = (msg, i) => findings.push({ sev: 'bloquant', msg, where: i === undefined ? base : at(i) });
const nb = (msg, i) => findings.push({ sev: 'signale', msg, where: i === undefined ? base : at(i) });

// --- Découpage en sections (## …) -------------------------------------------------------------
const heads = [];
lines.forEach((l, i) => { const m = l.match(/^##\s+(.*\S)\s*$/); if (m) heads.push({ titre: m[1], i }); });
const bloc = pred => {
  const k = heads.findIndex(h => pred(h.titre));
  if (k < 0) return null;
  const fin = k + 1 < heads.length ? heads[k + 1].i : lines.length;
  return { debut: heads[k].i, fin, txt: lines.slice(heads[k].i + 1, fin).join('\n') };
};
const sec = n => bloc(t => new RegExp(`^SECTION\\s+${n}\\b`, 'i').test(t));

// --- C1 : 7 sections présentes et non vides ----------------------------------------------------
for (let n = 0; n <= 6; n++) {
  const s = sec(n);
  if (!s) ko(`C1 — section ${n} absente (attendu « ## SECTION ${n} — … »)`);
  else if (s.txt.split(/\r?\n/).filter(l => l.trim()).length < 3)
    ko(`C1 — section ${n} vide ou quasi vide`, s.debut);
}

// --- C2 : inventaire exécuté ou arrêt déclaré --------------------------------------------------
const s1 = sec(1);
if (s1) {
  const impossible = /inventaire\s+impossible/i.test(s1.txt);
  const cmds = (s1.txt.match(/^Commande\s*:/gim) || []).length;
  const sorties = (s1.txt.match(/^>\s+\S/gm) || []).length;
  if (!impossible && !(cmds >= 1 && sorties >= 1))
    ko('C2 — section 1 sans commande relevée (« Commande : … » + sortie en citation) '
      + "ni mention explicite d'inventaire impossible", s1.debut);
}

// --- C3 : verdicts de frontière ----------------------------------------------------------------
const VERDICTS = /(RÉUTILISÉ|REUTILISE|ÉTENDU|ETENDU|CRÉÉ|CREE)/;
const s2 = sec(2);
if (s2) {
  let dansTableVerdict = false;
  lines.slice(s2.debut, s2.fin).forEach((l, k) => {
    const i = s2.debut + k;
    if (/^\s*\|/.test(l)) {
      if (/verdict/i.test(l) && /^\s*\|.*\|/.test(l)) { dansTableVerdict = true; return; }
      if (/^\s*\|[\s:|-]+\|?\s*$/.test(l)) return;           // ligne de séparation
      if (dansTableVerdict && !VERDICTS.test(l))
        ko('C3 — ligne de table « Verdict » sans RÉUTILISÉ / ÉTENDU / CRÉÉ', i);
    } else if (l.trim() === '') {
      dansTableVerdict = false;                              // fin de table
    }
  });
  if (!VERDICTS.test(s2.txt)) ko('C3 — section 2 sans aucun verdict de frontière', s2.debut);
}

// --- C4 : seuils chiffrés, et aucun objectif de volume brut ------------------------------------
const s3 = sec(3);
if (s3) {
  const ids = new Set((s3.txt.match(/\bS-\d{2}\b/g) || []));
  if (ids.size === 0) {
    const approx = s3.txt.split(/\r?\n/)
      .filter(l => /^\s*\|/.test(l) && /\d/.test(l) && /(%|≥|≤|<|>|\bmin\b|\bjours?\b)/.test(l)).length;
    nb(`C4 — convention d'identifiants S-nn absente : comptage approximatif (${approx} lignes chiffrées)`,
      s3.debut);
    if (approx < 6) ko(`C4 — moins de 6 seuils chiffrés en section 3 (${approx} détectés)`, s3.debut);
  } else if (ids.size < 6) {
    ko(`C4 — moins de 6 seuils chiffrés en section 3 (${ids.size} identifiants S-nn)`, s3.debut);
  }
  lines.slice(s3.debut, s3.fin).forEach((l, k) => {
    // La phrase qui INTERDIT les objectifs de volume contient les mêmes mots que celle qui en
    // pose un. Sans ce garde-fou, l'oracle sanctionne le CDC qui applique correctement la règle.
    if (/objectif[^.\n]{0,40}(volume|nombre\s+de\s+(tests|cas))/i.test(l)
      && !/(aucun|jamais|interdit|proscrit|exclu|ne\s+(?:doit|peut|sera)|pas\s+d[eu'’ai]|serait)/i.test(l))
      ko('C4 — objectif de volume brut formulé en section 3', s3.debut + k);
  });
}

// --- C5 : doublet de contre-oracles ------------------------------------------------------------
if (s3) {
  const surface = /couverture\s+de\s+surface/i.test(s3.txt);
  const mutation = /score\s+de\s+mutation/i.test(s3.txt);
  if (!surface) ko('C5 — contre-oracle « couverture de surface » absent de la section 3', s3.debut);
  if (!mutation) ko('C5 — contre-oracle « score de mutation » absent de la section 3', s3.debut);
  const regle = /mutation[\s\S]{0,200}?(jamais|ne peut)[\s\S]{0,80}?seul/i.test(s3.txt)
    || /seul[\s\S]{0,80}?score\s+de\s+mutation/i.test(s3.txt);
  if (surface && mutation && !regle)
    ko("C5 — règle d'interdiction de publier le score de mutation seul non reprise", s3.debut);
}

// --- C6 : noyau / adaptateurs et limite de couverture ------------------------------------------
const s4 = sec(4);
if (s4) {
  if (!/noyau/i.test(s4.txt)) ko('C6 — section 4 ne nomme pas le noyau', s4.debut);
  if (!/adaptateur/i.test(s4.txt)) ko('C6 — section 4 ne nomme pas les adaptateurs', s4.debut);
  const limite = /(partiel|non couvert|limite de couverture)/i.test(s4.txt) && /déclar/i.test(s4.txt);
  if (!limite)
    ko("C6 — limite de couverture en l'absence d'adaptateur non déclarée en section 4", s4.debut);
}

// --- C7 : termes subjectifs comme critère ------------------------------------------------------
const SUBJ = /\b(optimal(?:e|es|aux)?|exhaustifs?|exhaustives?|exhaustivité|robustes?|robustesse|complets?|complètes?)\b|\bde\s+qualité\b/gi;
lines.forEach((l, i) => {
  const m = l.match(SUBJ);
  if (!m) return;
  const dansCriteres = s3 && i >= s3.debut && i < s3.fin;
  const ligneCritere = /crit[èe]re/i.test(l);
  const nie = /(aucun|jamais|impossible|pas d[eu']|ne peut|interdit)/i.test(l);
  const msg = `C7 — terme subjectif « ${m[0]} »`;
  if ((dansCriteres || ligneCritere) && !nie) ko(`${msg} employé comme critère`, i);
  else nb(`${msg} (hors critère de succès — à relire)`, i);
});

// --- C8 : convention fait / hypothèse ----------------------------------------------------------
if (!/\[FAIT\]/.test(text) || !/\[HYP\]/.test(text))
  ko('C8 — convention de marquage absente : [FAIT] et [HYP] doivent être tous deux employés');

// --- C9 : zéro bloc de code --------------------------------------------------------------------
lines.forEach((l, i) => { if (/^\s*```/.test(l)) ko('C9 — bloc de code présent dans un CDC de cadrage', i); });

// --- C10 : questions ouvertes en fin, indicées --------------------------------------------------
const q = bloc(t => /questions?\s+ouvertes/i.test(t));
if (!q) {
  ko('C10 — section « Questions ouvertes » absente');
} else {
  const derniereSection = heads.filter(h => /^SECTION\s+\d/i.test(h.titre)).pop();
  if (derniereSection && q.debut < derniereSection.i)
    ko('C10 — les questions ouvertes ne sont pas en fin de document', q.debut);
  const items = [];
  lines.slice(q.debut, q.fin).forEach((l, k) => { if (/^\*{0,2}[a-z]\)\s|^\*\*[a-z]\)/.test(l.trim())) items.push({ l, i: q.debut + k }); });
  if (items.length < 3) ko(`C10 — moins de 3 questions indicées a) b) c) (${items.length})`, q.debut);
  items.forEach(({ l, i }) => {
    const close = /close/i.test(l);
    if (!close && !/recommand/i.test(l)) ko("C10 — question sans option recommandée", i);
    if (!close && !/défaut\s+appliqué/i.test(l)) ko('C10 — question sans défaut appliqué', i);
  });
}

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
if (!findings.length) findings.push({ sev: 'info', msg: 'contrat de sortie tenu sur les 10 points', where: base });
out('PASS', 0);
