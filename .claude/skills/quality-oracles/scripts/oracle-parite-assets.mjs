#!/usr/bin/env node
// oracle-parite-assets — Domaine « Parité d'une copie embarquée d'un asset du socle ».
//
// POURQUOI CET ORACLE EXISTE, et le fait est daté du 02/09/2026. Le skill `digit-ai-schemas`
// embarquait dans `assets/exemple-reference.html` une copie MANUELLE du composant
// `digit-ai-page-html/assets/table-filters.js`, collée un jour où elle était juste. Le composant
// a été corrigé SEPT fois depuis (TF-0429/0430/0431 le 21/08, TF-0768/0769/0781/0782 le 02/09) ;
// la copie n'a pas bougé d'un octet. Elle triait encore « 1 000 » comme 1, rangeait les mois par
// ordre alphabétique et privait de facette la colonne clé — dans le MÊME dépôt que les
// correctifs, à deux dossiers de distance, et personne ne pouvait le savoir : rien ne disait
// qu'une copie existait.
//
// C'est la classe exacte de TF-0761/RT-39 — un générateur réécrit hors d'atteinte des
// corrections — transposée ENTRE DEUX SKILLS. Une copie non déclarée n'est pas une copie :
// c'est une FOURCHE silencieuse. Le troisième skill qui embarquera un composant du socle
// recommencera, sauf si un contrôle l'attend.
//
// CE QU'IL JUGE — une ARBORESCENCE (ou un fichier), sur quatre angles :
//   P1 DÉCLARATION : toute copie d'un asset du socle trouvée dans une page se DÉCLARE
//      (`data-composant`), ou porte une exemption écrite. Une copie muette échoue.
//   P2 EMPREINTE : la déclaration porte l'empreinte de la source (`data-empreinte`), et cette
//      empreinte est celle du jour. C'est l'angle qui attrape « la source a bougé, pas la copie ».
//   P3 PARITÉ : le TEXTE embarqué est celui de la source, octet pour octet. C'est l'angle qui
//      attrape « la copie a été retouchée sur place » — une empreinte juste sur un contenu faux.
//   P4 EXEMPTION : une exemption porte une DATE et un motif. Une exemption sans date ne périme
//      jamais, et une exemption sans motif n'est pas une décision, c'est un silence.
//
// LA SEULE TRANSFORMATION ADMISE entre une source et sa copie est l'ÉCHAPPEMENT de la séquence
// `</script` (règle RA-1 du socle : nue dans un `<script>`, fût-elle en commentaire, elle ferme
// le bloc et casse la page). L'oracle la défait avant de comparer — tout le reste est une dérive.
//
// EXEMPTION LÉGITIME, et il en existe : une fixture dont le SUJET est une copie figée (les trois
// fixtures L22 du socle gèlent volontairement une version antérieure de `source-reader.js` —
// les rafraîchir détruirait ce qu'elles prouvent). Elle se déclare, datée et motivée, et reste
// COMPTÉE au verdict : un PASS qui tait ses exemptions ment sur ce qu'il a vu.
//
// Standard §3 : déterministe, checklist canonique, artefact réel, non_juge déclaré,
// sortie localisante, autoportant, prouvé par fixtures rouge/verte.
//
//   node oracle-parite-assets.mjs [<dossier|fichier>] [--socle=<dossier d'assets>]
//
// Exit : 0 = PASS · 1 = FAIL · 2 = SKIP (socle introuvable — jamais un vert par défaut).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DOM = "Parité d'une copie embarquée d'un asset du socle";
const ICI = path.dirname(fileURLToPath(import.meta.url));
const SKILLSROOT = path.resolve(ICI, '..', '..');

const args = process.argv.slice(2);
const cible = path.resolve(args.find((a) => !a.startsWith('--')) || SKILLSROOT);
const socle = path.resolve(
  (args.find((a) => a.startsWith('--socle=')) || '').split('=').slice(1).join('=')
  || path.join(SKILLSROOT, 'digit-ai-page-html', 'assets'));

const IGNORES = new Set(['.oracles', '__pycache__', 'node_modules', '.git', 'fonts']);
const NON_JUGE = [
  "ne juge que les copies TEXTUELLES dans des fichiers .html : un composant recopié dans un .js, un .md ou une archive n'est pas vu",
  "reconnaît une copie à la PREMIÈRE LIGNE de la source (sa bannière) : une copie dont on a retiré l'en-tête de commentaire devient invisible — c'est le prix d'un détecteur à bruit nul, et le contrôle de déclaration (P1) est ce qui rend ce contournement visible à la revue",
  "ne dit PAS si une copie est LÉGITIME : c'est l'exemption écrite qui le dit, et une exemption est une décision humaine, jamais une déduction",
  "ne juge que le socle passé en --socle (par défaut digit-ai-page-html/assets) : un composant copié depuis un AUTRE skill n'est pas suivi tant que son dossier n'est pas déclaré socle",
  "ne juge pas le COMPORTEMENT de la copie : une copie à la parité peut échouer chez son hôte faute des jetons CSS qu'elle consomme (c'est render_page et check_html qui le voient)",
];

const out = (verdict, findings, nj, code) => {
  process.stdout.write(JSON.stringify({
    oracle: 'oracle-parite-assets', domaine: DOM, artefact: cible,
    verdict, findings, non_juge: nj,
  }));
  process.exit(code);
};

if (!fs.existsSync(socle) || !fs.statSync(socle).isDirectory()) {
  out('SKIP', [{ sev: 'info', regle: 'P0', msg: `dossier de socle introuvable : ${socle} — rien n'est comparable, et un vert par défaut serait un mensonge`, where: socle }], NON_JUGE, 2);
}

// --- le socle : nom -> { texte, sha, banniere } -----------------------------
const sources = new Map();
for (const n of fs.readdirSync(socle).sort()) {
  if (!/\.(js|css)$/.test(n)) continue;
  const texte = fs.readFileSync(path.join(socle, n), 'utf8');
  const banniere = texte.split('\n')[0].trim();
  // Une bannière trop courte ne discrimine rien : la refuser plutôt que d'accuser au hasard.
  if (banniere.length < 24) continue;
  sources.set(n, { texte, sha: crypto.createHash('sha256').update(texte, 'utf8').digest('hex'), banniere });
}
if (!sources.size) {
  out('SKIP', [{ sev: 'info', regle: 'P0', msg: `aucun asset .js/.css exploitable dans ${socle}`, where: socle }], NON_JUGE, 2);
}

// --- les pages à balayer ----------------------------------------------------
function pages(p, acc = []) {
  const st = fs.statSync(p);
  if (st.isFile()) { if (p.endsWith('.html')) acc.push(p); return acc; }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (IGNORES.has(e.name)) continue;
    pages(path.join(p, e.name), acc);
  }
  return acc;
}

// L'échappement se compare DANS LE SENS OÙ IL EST DÉFINI, jamais à l'envers. Le défaire serait
// faux : `find-in-page.js` porte DÉJÀ, dans son propre commentaire, un `<\/script>` volontaire à
// côté d'un `</script` en toutes lettres — dés-échapper les deux les rendrait identiques et
// signalerait une dérive de trois octets qui n'existe pas (mesuré le 03/09, sur cette copie-là).
// `echapper` est idempotente : l'appliquer aux deux côtés met la source et sa copie dans la même
// forme, que la copie ait été inlinée ou non.
const echapper = (t) => t.replace(/<\/script/gi, '<\\/script');
const RE_EXEMPTION = /<!--\s*COMPOSANT-EMBARQUE:EXEMPTION\s+([A-Za-z0-9._-]+)\s+(\d{4}-\d{2}-\d{2})?\s*([\s\S]*?)-->/g;

const findings = [];
const exemptions = [];
let copies = 0;
const balayees = pages(cible);

for (const fichier of balayees) {
  const html = fs.readFileSync(fichier, 'utf8');
  const rel = path.relative(path.dirname(cible), fichier).replace(/\\/g, '/');

  // Les exemptions déclarées dans CE fichier, par composant.
  const exempts = new Map();
  RE_EXEMPTION.lastIndex = 0;
  let me;
  while ((me = RE_EXEMPTION.exec(html)) !== null) {
    exempts.set(me[1], { date: me[2] || null, motif: (me[3] || '').replace(/^[\s—–-]+/, '').trim() });
  }

  for (const [nom, src] of sources) {
    const banniereEch = src.banniere.replace(/<\/script/gi, '<\\/script');
    // Toutes les occurrences de la bannière : un fichier peut porter deux copies du même composant.
    const positions = [];
    for (const aiguille of new Set([src.banniere, banniereEch])) {
      let i = html.indexOf(aiguille);
      while (i !== -1) { positions.push(i); i = html.indexOf(aiguille, i + 1); }
    }
    if (!positions.length) continue;
    copies += positions.length;

    const ex = exempts.get(nom);
    if (ex) {
      exemptions.push({ rel, nom, ...ex });
      if (!ex.date) {
        findings.push({ sev: 'bloquant', regle: 'P4', where: `${rel} · ${nom}`,
          msg: `exemption SANS DATE — une exemption sans date ne périme jamais : « COMPOSANT-EMBARQUE:EXEMPTION ${nom} AAAA-MM-JJ — motif »` });
      }
      if (ex.motif.replace(/\s+/g, ' ').trim().length < 20) {
        findings.push({ sev: 'bloquant', regle: 'P4', where: `${rel} · ${nom}`,
          msg: `exemption SANS MOTIF exploitable (${ex.motif.length} caractères) — une exemption est une décision écrite, pas un silence` });
      }
      continue;
    }

    for (const pos of positions) {
      // Remonter à la balise ouvrante qui porte la copie, descendre à sa fermeture.
      const balise = nom.endsWith('.css') ? 'style' : 'script';
      const ouv = html.lastIndexOf(`<${balise}`, pos);
      const finOuv = ouv === -1 ? -1 : html.indexOf('>', ouv);
      const clo = html.indexOf(`</${balise}>`, pos);
      const enTete = ouv === -1 ? '' : html.slice(ouv, finOuv + 1);
      const ou = `${rel} · ${nom}`;

      const mNom = /data-composant\s*=\s*"([^"]+)"/.exec(enTete);
      const mEmp = /data-empreinte\s*=\s*"sha256:([0-9a-f]{64})"/.exec(enTete);

      if (!mNom || mNom[1] !== nom) {
        findings.push({ sev: 'bloquant', regle: 'P1', where: ou,
          msg: `copie NON DÉCLARÉE de ${nom} — une copie muette est une fourche silencieuse : elle ne reçoit aucun correctif et personne ne sait qu'elle existe. `
             + `La déclarer par les marqueurs COMPOSANT-EMBARQUE et la poser avec digit-ai-page-html/scripts/embarquer-composants.mjs --ecrire, ou écrire une exemption datée et motivée.` });
        continue;
      }
      if (!mEmp) {
        findings.push({ sev: 'bloquant', regle: 'P2', where: ou,
          msg: `copie déclarée SANS empreinte — data-empreinte="sha256:<64 hex>" scelle la source dont elle vient` });
      } else if (mEmp[1] !== src.sha) {
        findings.push({ sev: 'bloquant', regle: 'P2', where: ou,
          msg: `empreinte PÉRIMÉE : la copie scelle ${mEmp[1].slice(0, 12)}…, la source vaut ${src.sha.slice(0, 12)}… — le composant a été corrigé depuis, la copie ne l'a pas reçu` });
      }

      if (clo === -1 || ouv === -1) {
        findings.push({ sev: 'bloquant', regle: 'P3', where: ou, msg: `bloc de copie non délimité (balise <${balise}> ouvrante ou fermante absente)` });
        continue;
      }
      const embarque = echapper(html.slice(finOuv + 1, clo)).trim();
      const attendu = echapper(src.texte).trim();
      if (embarque !== attendu) {
        const dl = embarque.length - attendu.length;
        findings.push({ sev: 'bloquant', regle: 'P3', where: ou,
          msg: `contenu DÉRIVÉ de sa source (${dl >= 0 ? '+' : ''}${dl} octets) — l'empreinte peut être juste et le texte faux : une copie retouchée sur place ne se voit qu'ici` });
      }
    }
  }
}

const nj = NON_JUGE.concat([
  `socle employé : ${path.relative(SKILLSROOT, socle).replace(/\\/g, '/') || socle} (${sources.size} asset(s))`,
  `${balayees.length} page(s) .html balayée(s), ${copies} copie(s) détectée(s)`,
]);
for (const e of exemptions) {
  nj.push(`exemption DÉCLARÉE : ${e.rel} · ${e.nom}, le ${e.date} — ${e.motif.replace(/\s+/g, ' ').slice(0, 160)}`);
}

if (findings.length) out('FAIL', findings, nj, 1);
out('PASS', [{
  sev: 'info', regle: 'P1-P4',
  msg: `${copies} copie(s) d'asset du socle trouvée(s) sur ${balayees.length} page(s) : toutes déclarées, à l'empreinte du jour et à la parité de leur source (${exemptions.length} exemption(s) écrite(s))`,
  where: path.basename(cible),
}], nj, 0);
