#!/usr/bin/env node
// oracle-etat-forge — Domaine « État de la forge (versions, couverture, fixtures, dormance) ».
// Outillage des décisions D1/D3/D4 de la note P1 (20260723b) : le retard d'installation devient
// un verdict affiché, plus un angle mort. Artefact jugé : le manifeste versions-livrees.json.
// Checklist canonique :
//   F1 versions montées = versions du manifeste — pour chaque skill à version déclarée, le
//      frontmatter du SKILL.md monté doit porter la même version ; skill absent = FAIL localisant ;
//   F2 fixtures du manifest de quality-oracles présentes sur disque (red + green) ;
//   F3 corpus des fiches experts résolus — chaque chemin `…` du §3 des fiches doit exister
//      (relatif à la racine du montage) ;
//   F4 ligne de couverture présente dans la restitution d'audit fournie via --restitution
//      (format D1 : « domaines jugés : N · hors registre : M → M candidats écrits ») ;
//   F5 dormance : entrées de registre portant un dernier_usage plus vieux que 6 mois → proposer
//      la transition dormant (jamais appliquée par l'oracle — édition explicite du registre).
// Champ optionnel du manifeste : skills_root (relatif au manifeste ; défaut .claude/skills).
// Provenance : experts-forge v1.3.0 livrée le 21/07/2026 non installée (registre monté v0.3.0,
// fixture accessibilite absente) — cas réel constaté note P1 §3, invisible sans comparaison.
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = n => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const DOM = 'État de la forge (versions, couverture, fixtures, dormance)';
const findings = [];
const non_juge = [
  'qualité du contenu des skills montés (→ ameliore-un-skill)',
  'F5 dormance : seulement si dernier_usage est renseigné au registre (dérivation des journaux = passe d hygiène, pas cet oracle)'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-etat-forge', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skipOut = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skipOut('fichier absent');
if (path.extname(file).toLowerCase() !== '.json') skipOut('extension non gérée');
let man; try { man = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { findings.push({ sev: 'bloquant', msg: 'manifeste illisible : ' + e.message, where: path.basename(file) }); out('FAIL', 1); }
if (!man.skills || typeof man.skills !== 'object') { findings.push({ sev: 'bloquant', msg: 'manifeste sans section skills', where: path.basename(file) }); out('FAIL', 1); }

const manDir = path.dirname(path.resolve(file));
const root = path.resolve(manDir, man.skills_root || '.claude/skills');
const base = path.basename(file);
const fmVersion = sf => {
  const txt = fs.readFileSync(sf, 'utf8');
  const fm = txt.startsWith('---') ? txt.split('---')[1] : '';
  const m = fm.match(/version:\s*["']?([\d.]+)/);
  return m ? m[1] : null;
};

// F1 — versions montées vs manifeste
// (SKILL.fixture.md : nom alternatif utilisé par les arbres de fixtures — l'import claude.ai
// exige exactement un SKILL.md par archive de skill, 24/07/2026)
for (const [name, info] of Object.entries(man.skills)) {
  const sf = ['SKILL.md', 'SKILL.fixture.md'].map(n => path.join(root, name, n)).find(p => fs.existsSync(p));
  if (!sf) { findings.push({ sev: 'bloquant', msg: `F1 — skill du manifeste absent du montage : ${name}`, where: base }); continue; }
  if (info && info.version) {
    const v = fmVersion(sf);
    if (v !== info.version) findings.push({ sev: 'bloquant', msg: `F1 — retard d'installation : ${name} livré ${info.version}, monté ${v ?? 'sans version'}`, where: name + '/SKILL.md' });
  }
}

// F2 — fixtures du manifest quality-oracles présentes
const qoFix = path.join(root, 'quality-oracles', 'fixtures');
const qoMan = path.join(qoFix, 'manifest.json');
if (fs.existsSync(qoMan)) {
  try {
    for (const f of JSON.parse(fs.readFileSync(qoMan, 'utf8')).fixtures || []) {
      for (const side of ['red', 'green']) {
        if (f[side] && !fs.existsSync(path.join(qoFix, f[side]))) findings.push({ sev: 'bloquant', msg: `F2 — fixture référencée au manifest absente : ${f[side]} (oracle ${f.nom})`, where: 'quality-oracles/fixtures/manifest.json' });
      }
    }
  } catch (e) { findings.push({ sev: 'bloquant', msg: 'F2 — manifest des fixtures illisible : ' + e.message, where: 'quality-oracles/fixtures/manifest.json' }); }
} else non_juge.push('F2 : quality-oracles absent du montage — fixtures non jugées');

// F3 — corpus des fiches experts résolus
const fichesDir = path.join(root, 'experts-forge', 'fiches');
if (fs.existsSync(fichesDir)) {
  for (const fiche of fs.readdirSync(fichesDir).filter(n => n.endsWith('.md'))) {
    const txt = fs.readFileSync(path.join(fichesDir, fiche), 'utf8');
    const sec = txt.split(/^## /m).find(s => s.startsWith('3. corpus'));
    if (!sec) continue;
    for (const m of sec.matchAll(/`([^`\n]+)`/g)) {
      const p = m[1];
      if (!/[\/\\]/.test(p)) continue;
      const candidates = [path.resolve(manDir, p), path.resolve(root, '..', '..', p), path.join(root, p.replace(/^\/mnt\/skills\/user\//, ''))];
      if (!candidates.some(c => fs.existsSync(c))) findings.push({ sev: 'bloquant', msg: `F3 — chemin de corpus non résolu : ${p}`, where: 'experts-forge/fiches/' + fiche });
    }
  }
} else non_juge.push('F3 : experts-forge absent du montage — corpus non jugés');

// F4 — ligne de couverture dans la restitution fournie
const resti = opt('restitution');
if (resti && fs.existsSync(resti)) {
  const txt = fs.readFileSync(resti, 'utf8');
  if (!/domaines jugés\s*:\s*\d+\s*·\s*hors registre\s*:\s*\d+\s*→\s*\d+\s+candidats? écrits?/i.test(txt))
    findings.push({ sev: 'bloquant', msg: 'F4 — ligne de couverture absente ou non conforme (« domaines jugés : N · hors registre : M → M candidats écrits »)', where: path.basename(resti) });
} else non_juge.push('F4 : aucune restitution fournie (--restitution <fichier>)');

// F5 — dormance (uniquement si dernier_usage renseigné)
const regPath = path.join(root, 'quality-oracles', 'references', 'registre-oracles.json');
if (fs.existsSync(regPath)) {
  try {
    const now = man.date_reference ? new Date(man.date_reference) : new Date();
    for (const o of JSON.parse(fs.readFileSync(regPath, 'utf8')).oracles || []) {
      if (o.dernier_usage && (now - new Date(o.dernier_usage)) > 183 * 24 * 3600 * 1000 && o.statut === 'ok')
        findings.push({ sev: 'warn', msg: `F5 — dormance : « ${o.domaine} » sans usage depuis ${o.dernier_usage} (> 6 mois) — transition dormant à acter au registre`, where: 'registre-oracles.json' });
    }
  } catch { /* registre illisible déjà couvert par self-test */ }
}

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
findings.push({ sev: 'info', msg: `conforme : ${Object.keys(man.skills).length} skill(s) au manifeste, F1-F3${resti ? '/F4' : ''} vérifiés`, where: base });
out('PASS', 0);
