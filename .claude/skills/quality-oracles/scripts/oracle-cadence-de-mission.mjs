#!/usr/bin/env node
// oracle-cadence-de-mission — Domaine « Cadence de mission (artefacts périodiques) ».
//
// TF-0324, 18/08/2026. Ce que l'inventaire du 16/08 avait mesuré : sur les skills installés,
// **0 occurrence** de « RAID », « compte rendu », « rapport d'avancement », « lessons learned ».
// La forge couvrait le BUILD (produire, vérifier, juger) et le PILOTAGE (plan, adaptation), pas
// la CADENCE — l'artefact qui revient chaque semaine.
//
// La cartographie du 18/08 (pilot, `output/03-etudes/20260818-cartographie-oracles-cadence-de-
// mission.md`) a montré que trois des cinq artefacts avaient déjà leur juge (W5 d'oracle-plan-de-
// mission pour le R de RAID, S1-S8 d'oracle-synthese pour le REX, oracle-claims pour les chiffres
// sourcés) — et que **le vrai trou était la cadence elle-même** : aucun oracle ne savait répondre
// à « cet artefact est-il à jour au regard de la périodicité déclarée ? », c'est-à-dire à la seule
// question qui distingue un artefact de cadence d'un artefact ordinaire. C'est ce que cet oracle
// fait, et rien d'autre : il ne juge pas le CONTENU des artefacts, il juge leur FRAÎCHEUR.
//
// Format canonique, lu dans l'état de mission (MISSION.md de `pilote-de-mission`) :
//   ## Artefacts de cadence
//   - artefact: revue-raid · cadence: hebdomadaire · derniere: 2026-08-14 · source: forge/RAID-20260814a.md
//   - artefact: rex-de-fin · cadence: fin-de-mission · statut: non-applicable · motif: mission en cours
//
// Contrôles :
//   C1 chaque entrée déclarée porte `cadence`, et `derniere` + `source` sauf si `statut:
//      non-applicable` avec un `motif` non vide (l'attribut manquant est NOMMÉ) ;
//   C2 `cadence` appartient à l'ensemble FERMÉ des périodes — la cadence est une donnée
//      d'instance, jamais une valeur codée en spécification (critère d'acceptation de TF-0324) ;
//   C3 fraîcheur : `derniere` + période ≥ date de référence. Un retard NOMME l'artefact, la date
//      attendue et le retard en jours ;
//   C4 `source` existe sur le disque, relativement au fichier de mission. Une cadence déclarée
//      dont l'artefact est introuvable est le pire des cas : elle a l'air tenue ;
//   C5 les CINQ artefacts attendus sont tous rendus — déclarés, ou déclarés non applicables AVEC
//      motif. C5 itère sur les artefacts ATTENDUS, jamais sur ceux qui sont là : un contrôle qui
//      itère sur une liste ne voit jamais ce qui n'y est pas (patron constaté quatre fois le
//      18/08 — TF-0333, TF-0362, I2 de la recette du pilot, TF-0371).
//
// Ce que cet oracle NE crée PAS, et c'est un critère d'acceptation de TF-0324 : aucun second
// porteur d'état. Il LIT l'état de mission, il n'en tient aucun. La cadence, la dernière
// occurrence et le chemin de l'artefact sont des données de l'instance, écrites là où l'état
// vit déjà.
//
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const iJour = args.indexOf('--aujourdhui');
const DOM = 'Cadence de mission (artefacts périodiques)';
const findings = [];
const non_juge = [
  'le CONTENU des artefacts : cet oracle juge leur FRAÎCHEUR, pas leur qualité. Le R de la revue RAID est jugé par W5 d\'oracle-plan-de-mission, le REX par S1-S8 d\'oracle-synthese, les chiffres du rapport d\'avancement et du suivi des bénéfices par oracle-claims — aucun n\'est dupliqué ici',
  'la SINCÉRITÉ de `derniere` : la date déclarée n\'est pas confrontée à la date de modification du fichier. Un `derniere` avancé à la main passe — et c\'est une limite du déclaratif, pas un oubli',
  'les A, I et D de la revue RAID (actions, issues, décisions) : seul le R est outillé, par W5. Leur schéma reste à écrire (entrée nommée dans la cartographie du 18/08, non ouverte au registre)',
  'la comparaison attendu ↔ constaté du suivi des bénéfices : aucun oracle de l\'écosystème ne juge une SÉRIE TEMPORELLE. C\'est la seconde capacité nommée par la cartographie, et elle n\'est pas ici',
  'la date de référence : `--aujourdhui AAAA-MM-JJ` si fournie, sinon l\'horloge du poste. Sans le drapeau, deux exécutions à des jours différents ne rendent pas le même verdict — c\'est voulu (la fraîcheur est datée par nature), et les fixtures le passent pour être rejouables'
];
const out = (verdict, code) => {
  process.stdout.write(JSON.stringify({
    oracle: 'oracle-cadence-de-mission', domaine: DOM, artefact: file || null,
    verdict, findings, non_juge,
  }));
  process.exit(code);
};
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };

if (!file || !fs.existsSync(file)) skip('fichier absent');
if (path.extname(file).toLowerCase() !== '.md') skip('extension non gérée');

const jour = iJour >= 0 ? args[iJour + 1] : new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(jour || '')) skip(`--aujourdhui « ${jour} » n'est pas une date AAAA-MM-JJ`);

const txt = fs.readFileSync(file, 'utf8');
const base = path.basename(file);
const lines = txt.split(/\r?\n/);

// L'ensemble FERMÉ des périodes, en jours. `a-la-demande` et `fin-de-mission` n'ont pas de
// fraîcheur à juger : elles rendent SANS_OBJET pour C3, déclaré — jamais un PASS de complaisance,
// qui se lirait « à jour » alors que rien n'a été comparé.
const PERIODES = new Map([
  ['quotidienne', 1], ['hebdomadaire', 7], ['bihebdomadaire', 14], ['mensuelle', 30],
  ['trimestrielle', 91], ['a-la-demande', null], ['fin-de-mission', null],
]);

// Les CINQ artefacts de cadence d'une mission (TF-0324). C5 itère sur CETTE liste.
const ATTENDUS = new Map([
  ['revue-raid', 'revue RAID (risques, actions, issues, décisions)'],
  ['rapport-avancement', 'rapport d\'avancement'],
  ['compte-rendu', 'compte rendu de réunion'],
  ['rex-de-fin', 'retour d\'expérience de fin de mission'],
  ['suivi-benefices', 'suivi des bénéfices'],
]);

const attributs = seg => {
  const m = new Map();
  for (const s of seg) {
    const a = s.match(/^([a-z-]+)\s*:\s*([\s\S]*)$/i);
    if (a) m.set(a[1].toLowerCase(), a[2].trim());
  }
  return m;
};

const declares = new Map();
lines.forEach((l, i) => {
  const m = l.match(/^\s*[-*]\s*artefact\s*:\s*([a-z0-9-]+)\s*(?:·\s*(.*))?$/i);
  if (!m) return;
  const seg = (m[2] || '').split('·').map(s => s.trim()).filter(Boolean);
  declares.set(m[1].toLowerCase(), { nom: m[1].toLowerCase(), attrs: attributs(seg), ligne: i + 1 });
});

if (!declares.size) {
  findings.push({
    sev: 'bloquant',
    msg: 'aucune entrée « - artefact: <nom> · cadence: … » — section « ## Artefacts de cadence » absente ou hors format canonique (en tête de cet oracle). Une mission sans cadence déclarée n\'est pas une mission sans cadence : c\'est une cadence que personne ne peut vérifier',
    where: base + ':1',
  });
  out('FAIL', 1);
}

const jours = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const ajoute = (jour_, n) => new Date(Date.parse(jour_) + n * 86400000).toISOString().slice(0, 10);

for (const e of declares.values()) {
  const nom = e.nom;
  const cadence = e.attrs.get('cadence');
  const nonApplicable = (e.attrs.get('statut') || '').toLowerCase() === 'non-applicable';

  // C1 — les attributs dus, chacun NOMMÉ quand il manque.
  if (!cadence) {
    findings.push({ sev: 'bloquant', msg: `C1 — artefact « ${nom} » : attribut « cadence » ${e.attrs.has('cadence') ? 'vide' : 'absent'}`, where: base + ':' + e.ligne });
    continue;
  }
  if (nonApplicable) {
    if (!e.attrs.get('motif')) {
      findings.push({ sev: 'bloquant', msg: `C1 — artefact « ${nom} » déclaré non applicable SANS motif : « non-applicable » est une réponse valide, un blanc n'en est pas une (loi transverse n° 3)`, where: base + ':' + e.ligne });
    }
  } else {
    for (const a of ['derniere', 'source']) {
      if (!e.attrs.get(a)) {
        findings.push({ sev: 'bloquant', msg: `C1 — artefact « ${nom} » : attribut « ${a} » ${e.attrs.has(a) ? 'vide' : 'absent'} — sans lui la cadence est une intention, pas un fait`, where: base + ':' + e.ligne });
      }
    }
  }

  // C2 — l'ensemble fermé des périodes. La cadence est une DONNÉE d'instance : elle se lit ici,
  // elle n'est pas codée dans une spécification (critère d'acceptation de TF-0324).
  if (!PERIODES.has(cadence.toLowerCase())) {
    findings.push({ sev: 'bloquant', msg: `C2 — artefact « ${nom} » : cadence « ${cadence} » hors ensemble fermé — attendu ${[...PERIODES.keys()].join(' | ')}`, where: base + ':' + e.ligne });
    continue;
  }
  const periode = PERIODES.get(cadence.toLowerCase());

  // C3 — fraîcheur. Le retard est NOMMÉ avec sa date attendue : un total anonyme ne se corrige pas.
  const derniere = e.attrs.get('derniere');
  if (nonApplicable || periode === null) {
    findings.push({ sev: 'info', msg: `C3 SANS_OBJET — artefact « ${nom} » : cadence « ${cadence} »${nonApplicable ? ' et statut non applicable' : ''}, aucune fraîcheur à comparer (motif : ${e.attrs.get('motif') || 'périodicité non périodique'})`, where: base + ':' + e.ligne });
  } else if (derniere && !/^\d{4}-\d{2}-\d{2}$/.test(derniere)) {
    findings.push({ sev: 'bloquant', msg: `C3 — artefact « ${nom} » : « derniere: ${derniere} » n'est pas une date AAAA-MM-JJ`, where: base + ':' + e.ligne });
  } else if (derniere) {
    const attendue = ajoute(derniere, periode);
    const retard = jours(attendue, jour);
    if (retard > 0) {
      findings.push({ sev: 'bloquant', msg: `C3 — artefact « ${nom} » EN RETARD de ${retard} jour(s) : cadence ${cadence}, dernière le ${derniere}, attendue au plus tard le ${attendue}, référence ${jour}`, where: base + ':' + e.ligne });
    } else if (Date.parse(derniere) > Date.parse(jour)) {
      findings.push({ sev: 'bloquant', msg: `C3 — artefact « ${nom} » : « derniere: ${derniere} » est POSTÉRIEURE à la date de référence (${jour}) — une occurrence future n'est pas une occurrence`, where: base + ':' + e.ligne });
    }
  }

  // C4 — la source existe. Une cadence tenue sur un fichier absent a l'air tenue.
  const source = e.attrs.get('source');
  if (source && !nonApplicable) {
    const chemin = path.resolve(path.dirname(path.resolve(file)), source);
    if (!fs.existsSync(chemin)) {
      findings.push({ sev: 'bloquant', msg: `C4 — artefact « ${nom} » : source « ${source} » introuvable. Une cadence déclarée dont l'artefact n'existe pas est le pire des cas : elle a l'air tenue`, where: base + ':' + e.ligne });
    }
  }
}

// C5 — les CINQ attendus, rendus. On itère sur ATTENDUS, jamais sur `declares` : un contrôle qui
// itère sur ce qui est là ne voit jamais ce qui manque. C'est le patron constaté quatre fois le
// 18/08, et c'est exactement le trou que TF-0324 décrit — « cinq artefacts sans équivalent ».
for (const [nom, libelle] of ATTENDUS) {
  if (!declares.has(nom)) {
    findings.push({ sev: 'bloquant', msg: `C5 — artefact attendu « ${nom} » (${libelle}) NI déclaré NI déclaré non applicable. L'écarter est légitime, l'omettre ne l'est pas : « - artefact: ${nom} · cadence: <période> · statut: non-applicable · motif: <pourquoi> »`, where: base + ':1' });
  }
}

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
const sansObjet = findings.filter(f => f.sev === 'info').length;
findings.push({
  sev: 'info',
  msg: `conforme au ${jour} : ${declares.size} artefact(s) déclaré(s) sur ${ATTENDUS.size} attendu(s), ${sansObjet} sans fraîcheur à juger — C1-C5 vérifiés`,
  where: base,
});
out('PASS', 0);
