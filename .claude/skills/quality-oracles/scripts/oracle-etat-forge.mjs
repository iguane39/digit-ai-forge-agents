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
//      la transition dormant (jamais appliquée par l'oracle — édition explicite du registre) ;
//   F6 maquette validée avant le code d'une vue (TF-0780) — un run dont la PORTÉE est l'interface
//      doit porter au ledger un événement `maquette_validee { fichier, validee_par, date }`
//      AVANT le premier événement de production ;
//   F7 séparation auteur/exécutant du contrat de sortie (TF-0776) — quand le ledger porte un
//      `contrat_de_sortie { auteur }` et une exécution `{ executant }`, auteur == exécutant est
//      un ÉCHEC nommé « l'auteur juge son propre contrat ».
//
// F6 — POURQUOI (Produit-02, 02/09/2026, ledger seq 97-98). Sept vues d'interface (V1-V7) ont été
// définies par un tableau question/dimensions/mesures/action écrit par la session elle-même, et
// RIEN n'a été montré au destinataire avant production ; le compagnon visuel n'a pas été offert,
// au motif de l'autonomie. Verdict humain sur la vue livrée : « on n'y comprend absolument rien ».
// Le ledger de ce run ne porte AUCUNE entrée de maquette — il n'y avait rien à contredire.
//
// F7 — POURQUOI (Produit-02, 02/09/2026, brief v2, contrat de sortie 13:00Z). Les 22 critères du
// contrat de sortie ont été RÉDIGÉS ET VÉRIFIÉS par la même session. Les 22 critères étaient
// vrais ; le livrable était illisible. Un contrat qu'on s'écrit à soi-même mesure ce qu'on a fait,
// jamais ce qu'on devait faire — et il rend vert par construction.
//
// FORMAT ATTENDU AU LEDGER (JSON Lines, une entrée par ligne, cf. forge-agents/scripts/ledger.mjs)
//   {"type":"run_open","portee":"interface"}                        ← déclenche F6
//   {"type":"maquette_validee","fichier":"…","validee_par":"…","date":"AAAA-MM-JJ"}
//   {"type":"contrat_de_sortie","auteur":"<identité>"}              ← déclenche F7
//   {"type":"execution","executant":"<identité>","etape":"development"}
// BORNE DÉCLARÉE : F6 et F7 ne jugent QUE ce que le ledger porte. Un ledger sans portée déclarée,
// sans contrat de sortie ou sans exécutant n'est pas jugé — et c'est DIT au non_juge, jamais tu.
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

// F1-bis — la direction INVERSE (TF-0362, 18/08/2026). F1 itère sur le manifeste : un skill
// MONTÉ mais absent du manifeste ne produit donc aucun constat — il est livré, il s'exécute, et
// aucun contrôle de version ne le regarde. Cas réel : `la-barre`, dans cette situation depuis
// une date inconnue, trouvé le 18/08 non par cet oracle mais par un SECOND outil écrit pour
// solder autre chose. Un contrôle qui itère sur une liste ne voit jamais ce qui n'y est pas —
// même famille que l'écart servi/versionné de forge-tests, dont la boucle n'itérait que sur les
// locales SERVIES (TF-0333).
//
// L'arbre comparé est celui que `skills_root` désigne : l'INSTALLATION quand le manifeste
// voyage avec un lot, le DÉPÔT quand on le joue depuis la forge. Le message dit « l'arbre
// comparé » et non « monté » — nommer le mauvais arbre enverrait chercher au mauvais endroit.
//
// AVERTISSEMENT, jamais bloquant, et le motif est réel : le manifeste décrit ce qui a été
// LIVRÉ. Tout skill monté n'a pas vocation à l'être — un skill tiers, un skill d'une autre
// forge, un essai local. Bloquer ici ferait échouer l'ouverture de session sur la présence
// d'un skill étranger, c'est-à-dire un gate qu'on apprendrait à contourner (R-33 bis). Le
// signaler suffit à ce qu'il cesse d'être invisible.
if (fs.existsSync(root)) {
  const declares = new Set(Object.keys(man.skills));
  const montes = fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(n => ['SKILL.md', 'SKILL.fixture.md'].some(f => fs.existsSync(path.join(root, n, f))))
    .filter(n => !declares.has(n))
    .sort();
  for (const nom of montes) {
    findings.push({
      sev: 'avertissement',
      msg: `F1-bis — skill présent dans l'arbre comparé et ABSENT du manifeste : ${nom} — aucun `
        + `contrôle de version ne `
        + `le regarde. L'ajouter au manifeste s'il est livré par cette forge, ou le déclarer `
        + `étranger ; le silence, lui, n'est pas un état`,
      where: base,
    });
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

// ---- F6 / F7 — le ledger du run (TF-0780, TF-0776) -------------------------------------------
const ledgerPath = opt('ledger');
if (!ledgerPath) non_juge.push('F6/F7 : aucun ledger fourni (--ledger <run.jsonl>) — maquette validée et séparation auteur/exécutant non jugées');
else if (!fs.existsSync(ledgerPath)) findings.push({ sev: 'bloquant', msg: `F6/F7 — ledger introuvable : ${ledgerPath}. Un ledger annoncé et absent n'est pas « rien à juger », c'est une trace manquante`, where: path.basename(ledgerPath) });
else {
  const entrees = [];
  let ligne = 0, illisibles = 0;
  for (const l of fs.readFileSync(ledgerPath, 'utf8').split('\n')) {
    ligne++;
    if (!l.trim()) continue;
    try { entrees.push({ ...JSON.parse(l), _ligne: ligne }); } catch { illisibles++; }
  }
  const lb = path.basename(ledgerPath);
  if (illisibles) findings.push({ sev: 'bloquant', msg: `F6/F7 — ${illisibles} ligne(s) de ledger illisible(s) : un ledger qu'on ne peut pas lire ne prouve rien`, where: lb });
  const typeDe = e => String(e.type || e.evenement || '').toLowerCase();

  // F6 — maquette validée avant la production, sur un run de portée INTERFACE
  const PORTEE_INTERFACE = /\b(interface|ui|vue|ecran|écran|front|ihm)\b/i;
  const estInterface = entrees.some(e => PORTEE_INTERFACE.test(String(e.portee || e.perimetre || e.nature || '')));
  const PRODUCTION = /^(execution|development|build|vue_produite|code_ecrit|implementation|run_step)$/;
  const production = entrees.filter(e => PRODUCTION.test(typeDe(e)) || /^development$/i.test(String(e.etape || '')));
  if (!estInterface) non_juge.push('F6 : aucun événement du ledger ne déclare une portée d\'interface (`portee: "interface"`) — un run d\'interface non déclaré comme tel est invisible à ce contrôle');
  else {
    const maquettes = entrees.filter(e => typeDe(e) === 'maquette_validee');
    if (!maquettes.length) {
      findings.push({ sev: 'bloquant', msg: 'F6 — RUN DE VERSION D\'INTERFACE SANS MAQUETTE VALIDÉE : le ledger déclare une portée d\'interface et ne porte aucun événement '
        + '`maquette_validee { fichier, validee_par, date }`. Rien n\'a été montré au destinataire avant production — c\'est le run du 02/09, dont la vue livrée a reçu « on n\'y comprend absolument rien »', where: lb });
    } else {
      for (const m of maquettes) {
        const manquants = ['fichier', 'validee_par', 'date'].filter(k => !m[k] || !String(m[k]).trim());
        if (manquants.length) findings.push({ sev: 'bloquant', msg: `F6 — maquette validée INCOMPLÈTE : champ(s) manquant(s) ${manquants.join(', ')}. Une validation qui ne dit pas QUI a validé, QUOI et QUAND n'est pas une validation`, where: lb + ':' + m._ligne });
      }
      const premiereProd = production.length ? Math.min(...production.map(e => e._ligne)) : Infinity;
      const premiereMaquette = Math.min(...maquettes.map(m => m._ligne));
      if (premiereMaquette > premiereProd) findings.push({ sev: 'bloquant', msg: `F6 — maquette validée APRÈS le début de la production (ledger ligne ${premiereMaquette} contre ligne ${premiereProd}) : une maquette validée après le code ne valide plus rien, elle enregistre`, where: lb + ':' + premiereMaquette });
    }
  }

  // F7 — l'auteur du contrat de sortie n'est pas son exécutant
  const contrats = entrees.filter(e => typeDe(e) === 'contrat_de_sortie' && e.auteur);
  const executants = [...new Set(entrees.map(e => e.executant).filter(Boolean).map(String))];
  if (!contrats.length || !executants.length) {
    non_juge.push(`F7 : le ledger doit porter LES DEUX — un \`contrat_de_sortie { auteur }\` (${contrats.length} trouvé(s)) et un \`executant\` (${executants.length} trouvé(s)). L'un des deux manque : la séparation n'est pas jugée, elle n'est pas non plus déclarée tenue`);
  } else {
    for (const c of contrats) {
      const auteur = String(c.auteur);
      if (executants.includes(auteur)) {
        findings.push({ sev: 'bloquant', msg: `F7 — L'AUTEUR JUGE SON PROPRE CONTRAT : « ${auteur} » a rédigé le contrat de sortie et figure parmi les exécutants du run. `
          + `Le 02/09, 22 critères rédigés et vérifiés par la même session étaient tous VRAIS et le livrable était illisible : un contrat qu'on s'écrit à soi-même mesure ce qu'on a fait, jamais ce qu'on devait faire. `
          + `Le contrat se dérive du brief par un acteur DISTINCT de l'exécutant, et le juge de lecture ne le reçoit jamais`, where: lb + ':' + c._ligne });
      }
    }
  }
}

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
findings.push({ sev: 'info', msg: `conforme : ${Object.keys(man.skills).length} skill(s) au manifeste, F1-F3${resti ? '/F4' : ''}${ledgerPath ? '/F6-F7' : ''} vérifiés`, where: base });
out('PASS', 0);
