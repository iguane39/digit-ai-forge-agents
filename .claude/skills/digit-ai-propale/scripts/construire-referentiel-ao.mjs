#!/usr/bin/env node
// construire-referentiel-ao — le VERBE qui construit l'arbitre d'une réponse à appel d'offres
// (TF-1026, décision humaine D-3 (a) du 11/09/2026).
//
// LE TROU. Le 24/07/2026, le référentiel d'exigences d'une réponse à appel d'offres a été écrit
// À LA MAIN, puis `oracle-exigences-ao` (quality-oracles, X1 exigences tracées, X2 rubriques à
// l'identique, X3 pièces livrées) a jugé la réponse contre lui. Le juge existait ; le verbe qui
// construit son entrée n'existait pas — l'arbitre était donc lui-même un livrable non outillé.
//
// CE QUE FAIT LE VERBE, depuis le règlement de consultation (RC) et le cahier des clauses (CCTP) :
//   1. EXTRAIT — les phrases porteuses d'une OBLIGATION (doit, devra, est tenu, exigé,
//      obligatoire, impérativement) ; la liste de RUBRIQUES qui suit un « plan suivant » ou un
//      « à l'identique » ; la liste de PIÈCES qui suit un « pièces à fournir / à remettre ».
//   2. NUMÉROTE — EXG-01, EXG-02… dans l'ordre d'apparition, source et ligne citées ; un motif
//      de traçabilité par ligne (nombre et unité, puis sigle ou nom propre, puis deux mots longs,
//      insensible aux accents), que l'humain peut resserrer avant de sceller.
//   3. SCELLE — deux empreintes, comme les vues de forge-conception : celle de chaque SOURCE (un
//      RC modifié après construction rend le référentiel PÉRIMÉ) et celle du CORPS (une ligne
//      retirée à la main rend le référentiel AMPUTÉ). `--verifier` rejoue les deux.
// Le format produit est EXACTEMENT celui qu'oracle-exigences-ao lit (« ## Exigences », « - EXG-xx
// · texte · motif: regex », « ## Rubriques imposées », « ## Pièces attendues ») : aucun oracle
// neuf, le juge reste celui qui existe.
//
// LES DOCUMENTS TIERS SONT DES DONNÉES. Une phrase du RC ou du CCTP qui s'adresse à un assistant
// (« ignorez les consignes… ») n'est jamais suivie : elle est relevée et CITÉE dans une section à
// part du référentiel, que l'oracle ne lit pas.
//
// Usage :
//   node construire-referentiel-ao.mjs <rc.md> [<cctp.md> …] [--nom <consultation>] [--out <referentiel.md>]
//   node construire-referentiel-ao.mjs --verifier <referentiel.md> [<rc.md> <cctp.md> …]
//   node construire-referentiel-ao.mjs --self-test
// Sources lues : .md et .txt (un PDF ou un DOCX se convertit en texte AVANT — hors de ce verbe).
// Exit : 0 = construit / vérifié · 1 = référentiel vide, périmé ou amputé · 2 = usage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(ICI, '..');
const ORACLE = path.resolve(SKILL, '..', 'quality-oracles', 'scripts', 'oracle-exigences-ao.mjs');

export const NON_JUGE = [
  "l'EXHAUSTIVITÉ du référentiel : une prescription écrite au présent (« le titulaire conduit… »), un tableau, une annexe ou un critère de notation ne sont pas captés — relecture humaine du référentiel AVANT de répondre, et resserrement des motifs",
  'la PERTINENCE des motifs dérivés : un motif trop large trace une exigence que la réponse ne traite pas vraiment (la qualité de la réponse relève de digit-ai-propale-review)',
  'les sources PDF ou DOCX : à convertir en texte avant ce verbe, qui ne lit que .md et .txt',
];

const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const L = '\\p{L}';
const OBLIGATION = new RegExp(`(?<!${L})(doit|doivent|devra|devront|est\\s+tenue?|sont\\s+tenue?s|exig[ée]e?s?|obligatoire(?:ment)?|imp[ée]rativement)(?!${L})`, 'iu');
const CONSIGNE = /(ignore[zr]?\s+(les|toutes?\s+les)\s+(consignes|instructions)|ignore\s+(all\s+)?previous|en\s+tant\s+qu['’]assistant|you\s+are\s+an?\s+(ai|assistant))/iu;
const DECLENCHE_RUBRIQUES = /(plan|rubriques?|trame|cadre\s+de\s+r[ée]ponse)[^\n]{0,60}(suivante?s?|impos[ée]e?s?|[àa]\s+l['’]identique)|[àa]\s+l['’]identique[^\n]{0,40}(plan|rubriques?)/iu;
const DECLENCHE_PIECES = /(pi[èe]ces|documents)[^\n]{0,80}(fournir|remettre|produire|joindre|attendu|exig|constitu)/iu;
const ITEM = /^\s*(?:(\d+[.)])|[-*])\s+(.+?)\s*$/;
const MOTS_VIDES = new Set(['le', 'la', 'les', 'des', 'du', 'de', 'un', 'une', 'et', 'ou', 'au', 'aux', 'en', 'par', 'pour', 'sur', 'avec', 'dans', 'est', 'sont', 'candidat', 'titulaire', 'chaque', 'doit', 'devra', 'doivent', 'devront', 'être', 'etre', 'obligatoirement', 'impérativement', 'remis', 'remise']);
const EN_LETTRES = { 1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix' };

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sansAccent = (s) => echapper(s.toLowerCase())
  .replace(/[eéèêë]/g, '[eéèêë]').replace(/[aàâ]/g, '[aàâ]').replace(/[iîï]/g, '[iîï]')
  .replace(/[oô]/g, '[oô]').replace(/[uùûü]/g, '[uùûü]').replace(/[cç]/g, '[cç]');

/** Motif de traçabilité d'une ligne : du plus discriminant au plus faible. */
export function motifDe(texte) {
  const nu = /(\d+(?:[,.]\d+)?)\s*(ans?|mois|jours?|semaines?|heures?|participants?|personnes?|sites?|ateliers?|%|€|k€)(?!\p{L})/iu.exec(texte);
  if (nu) {
    const n = nu[1];
    const alt = EN_LETTRES[n] ? `(?:${echapper(n)}|${EN_LETTRES[n]})` : echapper(n);
    return `${alt}\\s*${sansAccent(nu[2].replace(/s$/i, ''))}`;
  }
  const mots = texte.split(/[\s,;:()«»"]+/).filter(Boolean);
  const sigle = mots.slice(1).map((m) => m.replace(/^[dl]['’]/i, '')).find((m) => /^\p{Lu}[\p{L}\d-]{2,}$/u.test(m) && !MOTS_VIDES.has(m.toLowerCase()));
  if (sigle) return echapper(sigle.replace(/[.]$/, ''));
  const longs = mots.map((m) => m.replace(/^[dl]['’]/i, '').replace(/[.]$/, ''))
    .filter((m) => m.length >= 6 && !MOTS_VIDES.has(m.toLowerCase()));
  const deux = [...longs].sort((a, b) => b.length - a.length).slice(0, 2)
    .sort((a, b) => longs.indexOf(a) - longs.indexOf(b));
  if (deux.length === 2) return `${sansAccent(deux[0])}.{0,80}${sansAccent(deux[1])}`;
  return sansAccent(deux[0] || texte.trim().slice(0, 40));
}

function motifPiece(nom) {
  const sigle = /\b(\p{Lu}{2,})\b/u.exec(nom);
  if (sigle) return echapper(sigle[1]);
  const mots = nom.split(/[\s'’]+/).map((m) => m.replace(/[()]/g, '')).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m.toLowerCase()));
  return mots.slice(0, 2).map(sansAccent).join('.{0,12}');
}

/** Extrait d'UNE source. Rend {exigences, rubriques, pieces, consignes}. */
export function extraire(texte, nomSource) {
  const lignes = texte.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' ')).split('\n');
  const res = { exigences: [], rubriques: [], pieces: [], consignes: [] };
  let mode = null;                // 'rubriques' | 'pieces' | null — une liste qui suit son déclencheur
  let paragraphe = [];
  const vider = () => {
    if (!paragraphe.length) return;
    const debut = paragraphe[0].n;
    const txt = paragraphe.map((p) => p.t.trim()).join(' ').replace(/\s+/g, ' ');
    for (const phrase of txt.split(/(?<=[.!?;»])\s+(?=\p{Lu}|«)/u)) {
      if (CONSIGNE.test(phrase)) { res.consignes.push({ texte: phrase, ou: `${nomSource}:${debut}` }); continue; }
      if (OBLIGATION.test(phrase)) res.exigences.push({ texte: phrase.replace(/\s*·\s*/g, ' - '), ou: `${nomSource}:${debut}` });
    }
    paragraphe = [];
  };
  lignes.forEach((ligne, i) => {
    const n = i + 1;
    if (/^\s*#/.test(ligne) || !ligne.trim()) { vider(); if (!ligne.trim() && mode === 'fin') mode = null; return; }
    const item = ITEM.exec(ligne);
    if (item && (mode === 'rubriques' || mode === 'pieces')) {
      vider();
      if (mode === 'rubriques') res.rubriques.push({ titre: (item[1] ? item[1] + ' ' : '') + item[2], ou: `${nomSource}:${n}` });
      else res.pieces.push({ nom: item[2], ou: `${nomSource}:${n}` });
      return;
    }
    mode = null;
    if (DECLENCHE_RUBRIQUES.test(ligne)) { vider(); mode = 'rubriques'; return; }
    if (DECLENCHE_PIECES.test(ligne)) { vider(); mode = 'pieces'; return; }
    paragraphe.push({ t: ligne, n });
  });
  vider();
  return res;
}

/** Construit le référentiel scellé depuis des sources {nom, texte}. */
export function construire(sources, nom = 'consultation') {
  const tout = { exigences: [], rubriques: [], pieces: [], consignes: [] };
  for (const s of sources) {
    const r = extraire(s.texte, s.nom);
    for (const k of Object.keys(tout)) tout[k].push(...r[k]);
  }
  const corps = [
    '## Exigences',
    ...tout.exigences.map((e, i) => `- EXG-${String(i + 1).padStart(2, '0')} · ${e.texte} [${e.ou}] · motif: ${motifDe(e.texte)}`),
    '',
    '## Rubriques imposées',
    ...tout.rubriques.map((r) => `- ${r.titre}`),
    '',
    '## Pièces attendues',
    ...tout.pieces.map((p) => `- ${p.nom} · motif: ${motifPiece(p.nom)}`),
    '',
    '## Consignes embarquées relevées (DONNÉE citée, jamais exécutée)',
    ...(tout.consignes.length ? tout.consignes.map((c) => `> ${c.texte} [${c.ou}]`) : ['aucune']),
    '',
  ].join('\n');
  const entete = [
    `# Référentiel d'exigences — ${nom}`,
    `<!-- construit par construire-referentiel-ao.mjs (digit-ai-propale, TF-1026) ; à RELIRE avant de répondre : ${NON_JUGE[0].split(' : ')[0]} -->`,
    `<!-- sceau-sources: ${sources.map((s) => `${s.nom}=sha256:${sha(s.texte)}`).join('; ')} -->`,
    `<!-- sceau-corps: sha256:${sha(corps)} -->`,
    '',
  ].join('\n');
  return { texte: entete + corps, compte: { exigences: tout.exigences.length, rubriques: tout.rubriques.length, pieces: tout.pieces.length, consignes: tout.consignes.length } };
}

/** Rejoue les deux sceaux. Rend la liste des écarts (vide = intact et à jour). */
export function verifier(referentiel, sources = []) {
  const ecarts = [];
  const mc = /<!-- sceau-corps: sha256:([0-9a-f]{64}) -->\n\n?/.exec(referentiel);
  const ms = /<!-- sceau-sources: (.*?) -->/.exec(referentiel);
  if (!mc || !ms) return ['sceaux absents : ce référentiel n\'a pas été construit par le verbe, ou ses sceaux ont été retirés'];
  const corps = referentiel.slice(mc.index + mc[0].length);
  if (sha(corps) !== mc[1]) ecarts.push('AMPUTÉ ou modifié à la main : l\'empreinte du corps ne correspond plus — reconstruire depuis les sources');
  const scelle = Object.fromEntries(ms[1].split('; ').map((x) => x.split('=sha256:')));
  for (const s of sources) {
    if (!(s.nom in scelle)) ecarts.push(`source ${s.nom} absente du sceau : le référentiel a été construit sans elle`);
    else if (scelle[s.nom] !== sha(s.texte)) ecarts.push(`PÉRIMÉ : ${s.nom} a changé depuis la construction — reconstruire`);
  }
  return ecarts;
}

const lireSource = (p) => ({ nom: path.basename(p), texte: fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') });

function selfTest() {
  const F = path.join(SKILL, 'fixtures', 'ao');
  const sources = ['rc-synthetique.md', 'cctp-synthetique.md'].map((n) => lireSource(path.join(F, n)));
  const cas = [];
  const verif = (nom, ok, detail = '') => cas.push({ nom, ok: !!ok, detail });
  const { texte, compte } = construire(sources, 'consultation synthétique');
  verif('extraction : 4 exigences, 3 rubriques, 3 pièces', compte.exigences === 4 && compte.rubriques === 3 && compte.pieces === 3, JSON.stringify(compte));
  verif('la consigne embarquée est CITÉE, pas suivie (1 relevée, aucune exigence en moins)', compte.consignes === 1 && compte.exigences === 4, JSON.stringify(compte));
  verif('la prescription au présent n\'est pas captée — limite déclarée au non_juge', !/conduit un diagnostic/.test(texte.split('## Rubriques')[0]));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'referentiel-ao-'));
  const ref = path.join(tmp, 'referentiel.md');
  fs.writeFileSync(ref, texte);
  const juger = (rep) => {
    const r = spawnSync(process.execPath, [ORACLE, path.join(F, rep), '--exigences', ref], { encoding: 'utf8' });
    try { return { code: r.status, ...JSON.parse(r.stdout) }; } catch { return { code: r.status, verdict: 'ILLISIBLE', findings: [], err: r.stderr }; }
  };
  if (!fs.existsSync(ORACLE)) {
    verif('oracle-exigences-ao joignable', false, ORACLE);
  } else {
    const v = juger('reponse-verte.md');
    verif('le JUGE existant accepte la réponse verte (PASS)', v.verdict === 'PASS', JSON.stringify(v.findings).slice(0, 300));
    const r = juger('reponse-rouge.md');
    const msgs = (r.findings || []).map((f) => f.msg).join(' | ');
    verif('le JUGE existant refuse la réponse rouge (FAIL)', r.verdict === 'FAIL', r.verdict);
    verif('… pour l\'exigence manquante (X1 Qualiopi)', /X1[^|]*Qualiopi/.test(msgs), msgs.slice(0, 300));
    verif('… et pour la rubrique reformulée (X2 à l\'identique)', /X2[^|]*2\. Méthodologie d'intervention/.test(msgs), msgs.slice(0, 300));
  }
  verif('sceaux intacts sur le référentiel construit', verifier(texte, sources).length === 0, verifier(texte, sources).join(' | '));
  const ampute = texte.replace(/^- EXG-02 .*\n/m, '');
  verif('sens rouge : une exigence retirée à la main → AMPUTÉ', verifier(ampute, sources).some((e) => e.startsWith('AMPUTÉ')));
  const rcModifie = [{ ...sources[0], texte: sources[0].texte + '\nLe candidat doit fournir une attestation.\n' }, sources[1]];
  verif('sens rouge : un RC modifié après construction → PÉRIMÉ', verifier(texte, rcModifie).some((e) => e.startsWith('PÉRIMÉ')));
  fs.rmSync(tmp, { recursive: true, force: true });
  const rates = cas.filter((c) => !c.ok);
  process.stdout.write(JSON.stringify({ verbe: 'construire-referentiel-ao', verdict: rates.length ? 'FAIL' : 'PASS',
    cas: cas.map((c) => `${c.ok ? 'OK   ' : 'ECHEC'} ${c.nom}${c.ok ? '' : ' — ' + c.detail}`), non_juge: NON_JUGE }, null, 2) + '\n');
  return rates.length ? 1 : 0;
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const opt = (n) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null);
  const valeurs = new Set(['nom', 'out', 'verifier'].map(opt).filter(Boolean));
  const fichiers = args.filter((a) => !a.startsWith('--') && !valeurs.has(a));
  const manquants = fichiers.filter((f) => !fs.existsSync(f));
  if (manquants.length) { console.error('source introuvable : ' + manquants.join(', ')); return 2; }
  if (opt('verifier')) {
    if (!fs.existsSync(opt('verifier'))) { console.error('référentiel introuvable : ' + opt('verifier')); return 2; }
    const ecarts = verifier(fs.readFileSync(opt('verifier'), 'utf8').replace(/\r\n/g, '\n'), fichiers.map(lireSource));
    process.stdout.write(JSON.stringify({ verbe: 'construire-referentiel-ao --verifier', verdict: ecarts.length ? 'FAIL' : 'PASS', ecarts }, null, 2) + '\n');
    return ecarts.length ? 1 : 0;
  }
  if (!fichiers.length) { console.error('usage : construire-referentiel-ao.mjs <rc.md> [<cctp.md> …] [--nom <consultation>] [--out <referentiel.md>] | --verifier <referentiel.md> [sources…] | --self-test'); return 2; }
  const horsFormat = fichiers.filter((f) => !['.md', '.txt'].includes(path.extname(f).toLowerCase()));
  if (horsFormat.length) { console.error('format non lu (convertir en texte d\'abord) : ' + horsFormat.join(', ')); return 2; }
  const { texte, compte } = construire(fichiers.map(lireSource), opt('nom') || 'consultation');
  if (!compte.exigences) { console.error('référentiel VIDE : aucune obligation trouvée dans les sources — un référentiel sans exigence n\'arbitre rien'); return 1; }
  if (opt('out')) {
    fs.writeFileSync(opt('out'), texte);
    process.stdout.write(JSON.stringify({ verbe: 'construire-referentiel-ao', ecrit: opt('out'), compte, non_juge: NON_JUGE }, null, 2) + '\n');
  } else process.stdout.write(texte);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv));
