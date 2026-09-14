#!/usr/bin/env node
// oracle-transparence-ia — Domaine « Transparence d'un contenu généré destiné au public
// (AI Act, article 50) » (TF-1030, décision humaine du 11/09/2026).
//
// LE TROU. Les obligations de l'article 50 s'appliquent depuis le 2026-08-02 — marquage lisible
// par machine des sorties génératives, information des personnes — avec une portée explicite sur
// les contenus publiés, sites et publicités. Aucun skill de rendu ne marquait ses sorties, aucun
// oracle ne le vérifiait : une page ou une publication pouvait partir sans mention, et rien ne le
// disait.
//
// CE QUE L'ORACLE JUGE, sur un livrable dont la DIFFUSION est déclarée publique :
//   TR-1 une MENTION lisible par un humain, dans le texte visible (hors <head>, <script>,
//        <style>, commentaires ; hors blocs de code en Markdown) — « contenu rédigé avec l'aide
//        d'une IA », « généré par une intelligence artificielle », « AI-generated »… ;
//   TR-2 un MARQUAGE lisible par machine — HTML : une méta déclarée au référentiel ; Markdown : une
//        clé de frontmatter déclarée. Un texte brut (.txt, publication réseau) ne peut porter aucun
//        marquage : TR-2 y est NON JUGÉ et le dit, TR-1 reste exigé.
// La diffusion se lit dans le livrable (`<meta name="diffusion" content="public">`, ou
// `diffusion: public` en frontmatter) ou par `--diffusion public|prive`, qui prime.
//   · livrable PRIVÉ (propale, mémoire technique, support client) → SKIP motivé : hors portée de
//     l'article 50 tel que la décision du 11/09 le délimite ; la règle le dit, elle ne se tait pas ;
//   · diffusion NON DÉCLARÉE → SKIP motivé, jamais un PASS : l'oracle ne devine pas l'audience.
//
// Les formulations et les marqueurs sont une DONNÉE datée et sourcée (references/transparence-ia.json,
// loi transverse n° 4) : le droit et le code de bonnes pratiques bougent, pas l'oracle.
//
// Usage : node oracle-transparence-ia.mjs <livrable.html|.md|.txt> [--diffusion public|prive]
//                                         [--donnee <transparence-ia.json>]
// Contrat JSON commun {oracle, domaine, artefact, verdict, findings[], non_juge[]} · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null);
const valeursOpt = new Set(['--diffusion', '--donnee'].map((o) => opt(o.slice(2))).filter(Boolean));
const file = args.find((a) => !a.startsWith('--') && !valeursOpt.has(a));
const DOM = "Transparence d'un contenu généré destiné au public (AI Act, article 50)";
const findings = [];
const non_juge = [
  "l'ORIGINE réelle du contenu : l'oracle vérifie que la mention et le marquage sont présents, il ne sait pas si le texte a été généré — un contenu entièrement humain n'a pas à porter la mention, et l'oracle ne peut pas le prouver",
  "la VISIBILITÉ rendue de la mention (masquée par CSS, hors écran) : la mesure de rendu appartient à render_page.py",
  "les exceptions de l'article 50 (contenu relu sous responsabilité éditoriale humaine, usage autorisé par la loi) : question juridique, arbitrée par l'humain au GO de publication, jamais par l'oracle",
  "le marquage des MÉDIAS embarqués (images, vidéo, son — C2PA, IPTC dans les métadonnées du fichier) : hors de ce contrôle de texte",
];
const out = (verdict, code) => {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-transparence-ia', domaine: DOM,
    artefact: file || null, verdict, findings, non_juge }, null, 2) + '\n');
  process.exit(code);
};
const skip = (m) => { non_juge.unshift(m); out('SKIP', 2); };

if (!file || !fs.existsSync(file)) skip('fichier absent');
const ext = path.extname(file).toLowerCase();
if (!['.html', '.htm', '.md', '.txt'].includes(ext)) skip(`extension non gérée (${ext || 'aucune'}) — .html, .md, .txt`);

const cheminDonnee = opt('donnee') || path.resolve(ICI, '..', 'references', 'transparence-ia.json');
let D;
try { D = JSON.parse(fs.readFileSync(cheminDonnee, 'utf8')); }
catch (e) { skip(`référentiel illisible (${cheminDonnee}) : ${e.message} — sans lui, rien n'est jugé`); }
non_juge.push(`référentiel lu : ${path.basename(cheminDonnee)} v${D.version} du ${D.date}, à revoir le ${D.revoir_le}`);

const brut = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const base = path.basename(file);
const norm = (s) => String(s || '').trim().toLowerCase();

// --- La diffusion déclarée ---------------------------------------------------------------
const metaDe = (html, nom) => {
  const re = /<meta\b[^>]*>/gi;
  for (const m of html.match(re) || []) {
    const n = /\bname\s*=\s*["']([^"']+)["']/i.exec(m);
    const c = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(m);
    if (n && norm(n[1]) === norm(nom)) return c ? c[1] : '';
  }
  return null;
};
let frontmatter = {};
let corps = brut;
if (ext === '.md') {
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(brut);
  if (fm) {
    corps = brut.slice(fm[0].length);
    for (const l of fm[1].split('\n')) {
      const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(l);
      if (kv) frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
  }
}
const html = ext === '.html' || ext === '.htm';
let diffusion = opt('diffusion');
let origine = '--diffusion';
if (!diffusion) {
  diffusion = html ? metaDe(brut, D.diffusion.meta_html) : (ext === '.md' ? frontmatter[D.diffusion.cle_frontmatter] : null);
  origine = html ? `<meta name="${D.diffusion.meta_html}">` : `frontmatter \`${D.diffusion.cle_frontmatter}\``;
}
if (diffusion == null || diffusion === '') {
  skip(`diffusion NON DÉCLARÉE — l'oracle ne devine pas l'audience : déclarer ${html ? `<meta name="${D.diffusion.meta_html}" content="public">` : (ext === '.md' ? `\`${D.diffusion.cle_frontmatter}: public\` en frontmatter` : 'la diffusion')} ou passer --diffusion public|prive`);
}
if (D.diffusion.prive.map(norm).includes(norm(diffusion))) {
  skip(`livrable PRIVÉ (diffusion « ${diffusion} », lue par ${origine}) — hors portée : l'article 50 vise les contenus destinés au public ; une propale, un mémoire technique, un support client n'y sont pas soumis selon la décision du 11/09/2026 (TF-1030)`);
}
if (!D.diffusion.public.map(norm).includes(norm(diffusion))) {
  skip(`diffusion « ${diffusion} » inconnue du référentiel (public : ${D.diffusion.public.join(', ')} ; privé : ${D.diffusion.prive.join(', ')})`);
}

// --- TR-1 : la mention, dans le texte visible ---------------------------------------------
let visible;
if (html) {
  visible = brut
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&rsquo;|&#8217;/g, '’').replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
} else if (ext === '.md') {
  // Citer n'est pas commettre : une mention dans un bloc de code ou un commentaire HTML n'informe
  // pas le lecteur.
  visible = corps.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
} else {
  visible = corps;
}
visible = visible.replace(/\s+/g, ' ');
const motifs = D.mentions.map((m) => new RegExp(m, 'iu'));
const trouve = motifs.map((re) => re.exec(visible)).find(Boolean);
if (!trouve) {
  findings.push({ sev: 'bloquant', where: base,
    msg: `TR-1 — aucune MENTION de contenu généré dans le texte visible d'un livrable public (diffusion lue par ${origine}). Article 50 : la personne qui lit doit savoir que le contenu a été généré. Exemple : « Contenu rédigé avec l'aide d'une IA, relu par <auteur>. » Formulations reconnues : references/transparence-ia.json` });
} else {
  findings.push({ sev: 'info', where: base, msg: `TR-1 — mention trouvée : « ${trouve[0].slice(0, 80)} »` });
}

// --- TR-2 : le marquage lisible par machine -----------------------------------------------
if (html) {
  const ok = D.marqueurs_html.find((mq) => {
    const v = metaDe(brut, mq.meta_name);
    return v != null && (!mq.valeurs || mq.valeurs.map(norm).some((x) => norm(v).includes(x)));
  });
  if (!ok) {
    findings.push({ sev: 'bloquant', where: base,
      msg: `TR-2 — aucun MARQUAGE lisible par machine : attendu une méta ${D.marqueurs_html.map((m) => `name="${m.meta_name}" (${m.valeurs.join(' | ')})`).join(' ou ')}. Une mention sans marquage informe le lecteur, pas les outils qui indexent ou republient la page` });
  } else {
    findings.push({ sev: 'info', where: base, msg: `TR-2 — marquage trouvé : <meta name="${ok.meta_name}">` });
  }
} else if (ext === '.md') {
  const cle = D.marqueurs_frontmatter.find((k) => frontmatter[k] != null && !['false', 'non', 'no', ''].includes(norm(frontmatter[k])));
  if (!cle) {
    findings.push({ sev: 'bloquant', where: base,
      msg: `TR-2 — aucun MARQUAGE lisible par machine : attendu une clé de frontmatter ${D.marqueurs_frontmatter.map((k) => '`' + k + '`').join(' ou ')} (valeur non fausse)` });
  } else {
    findings.push({ sev: 'info', where: base, msg: `TR-2 — marquage trouvé : frontmatter \`${cle}\`` });
  }
} else {
  non_juge.unshift("TR-2 NON JUGÉ : un texte brut (.txt, publication réseau) ne peut porter aucun marquage lisible par machine — le marquage revient à la plateforme de publication ; TR-1 (la mention) reste exigé");
}

out(findings.some((f) => f.sev === 'bloquant') ? 'FAIL' : 'PASS', findings.some((f) => f.sev === 'bloquant') ? 1 : 0);
