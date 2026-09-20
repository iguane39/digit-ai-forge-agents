#!/usr/bin/env node
// oracle-transparence — Domaine « Transparence des contenus publics générés par IA
// (article 50 du règlement européen sur l'IA) ».
//
// Juge un contenu DESTINÉ AU PUBLIC (page, publication, étude de cas, communiqué) passé en
// argument. Trois règles, chacune binaire :
//   TR1  MENTION — le contenu porte, dans son texte LISIBLE PAR UN HUMAIN, une formule admise
//        de mention d'assistance par IA. BLOQUANT sans échéance : l'information du lecteur est
//        due depuis le 2026-08-02. L'oracle est AGNOSTIQUE DE LA MARQUE : les formules admises
//        lui sont FOURNIES par `--mentions <fichier.json>` ; à défaut il applique un jeu
//        générique français et anglais. Aucune formule propre à un émetteur n'est codée ici.
//   TR2  MARQUAGE MACHINE (pages .html seulement) — le fichier porte un marquage lisible par
//        machine. CONVENTION INTERNE, PAS UNE NORME : `<meta name="ai-generated" content="…">`
//        au contenu non vide. Équivalent admis : `<meta name="generator" content="…">` dont le
//        contenu porte un marqueur d'IA — c'est la forme que nomment les règles de marque
//        rencontrées dans le parc, et la refuser ferait échouer un livrable conforme à sa marque.
//        Sévérité pilotée par une ÉCHÉANCE EN DONNÉE (`references/echeances.json`, clé
//        `marquage_machine_absent`) : avant la date, AVERTISSEMENT qui dit les jours restants ;
//        à partir du lendemain de la date, BLOQUANT. La date n'est écrite NULLE PART dans ce
//        code (loi transverse n° 4) ; `--date AAAA-MM-JJ` fige le jour de référence pour un
//        rejeu déterministe, `--echeances <fichier>` désigne la donnée (TF-0912 : une fixture
//        épingle sa donnée d'essai, elle ne la résout pas par voisinage).
//   TR3  NON GÉNÉRÉ — un contenu déclaré non généré (`--non-genere`, ou frontmatter
//        `genere: false`) rend SKIP MOTIVÉ, jamais PASS : l'oracle n'a rien mesuré, il le dit.
//
// Usage :
//   node scripts/oracle-transparence.mjs <fichier.md|.html|.txt> [--mentions <mentions.json>]
//        [--echeances <echeances.json>] [--date AAAA-MM-JJ] [--non-genere]
//
// Provenance : TF-1030 (11/09/2026, décisions humaines D-3 (a) puis D-4) — l'obligation est en
// vigueur depuis le 2026-08-02, la règle de marque est écrite, et le contrôle exécutable qu'elle
// cite était appelé 17 fois dans 9 fichiers d'un produit sans exister nulle part (mesure du
// 14/09/2026). Contrat JSON commun · exit 0 PASS / 1 FAIL / 2 SKIP.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ECHEANCES_DEFAUT = path.join(SCRIPT_DIR, '..', 'references', 'echeances.json');
const CLE_ECHEANCE = 'marquage_machine_absent';
const DOM = "Transparence des contenus publics générés par IA (article 50 du règlement européen sur l'IA)";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const flag = n => args.includes('--' + n);
const opt = n => {
  const i = args.findIndex(a => a === '--' + n || a.startsWith('--' + n + '='));
  if (i < 0) return null;
  return args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : (args[i + 1] || null);
};

const findings = [];
const non_juge = [
  "la SINCÉRITÉ de la déclaration : un contenu déclaré non généré est cru sur parole, l'oracle ne vérifie ni ne peut vérifier qui a écrit quoi",
  "la SUFFISANCE JURIDIQUE de la formule : la présence d'une formule admise est mesurée, sa validité au regard du droit ne l'est pas",
  "la DÉTECTION d'un texte généré mais NON déclaré : aucune analyse de style, de provenance ni de perplexité — un contenu généré qui ne se déclare pas passe TR3 et sort en SKIP",
  "le caractère PUBLIC du contenu : c'est l'invocation qui le décide (entrée de registre à `ext` vide, aucune extension routée d'office) ; un livrable adressé à un destinataire identifié n'entre pas ici",
  "la VISIBILITÉ RÉELLE de la mention à l'écran (taille, contraste, repli responsive, position sous un pli) → render_page.py du socle digit-ai-page-html",
  "les formats BUREAUTIQUES (.docx, .pptx, .pdf) : le marquage par propriété de document n'est pas lu ici",
  "la JUSTESSE de la date d'échéance : elle vit en donnée, datée et sourcée, l'oracle la lit sans la discuter"
];

const out = (verdict, code, extra = {}) => {
  process.stdout.write(JSON.stringify({
    oracle: 'oracle-transparence', domaine: DOM, artefact: file || null,
    verdict, findings, non_juge, ...extra
  }));
  process.exit(code);
};
const skip = (motif, extra = {}) => { non_juge.unshift('NON MESURÉ — ' + motif); out('SKIP', 2, extra); };

// ---- entrée ---------------------------------------------------------------------------------
if (!file || !fs.existsSync(file)) skip('fichier absent : ' + (file || '(aucun argument)'));
const EXT = path.extname(file).toLowerCase();
if (!['.md', '.html', '.htm', '.txt'].includes(EXT)) skip(`extension non gérée (${EXT || 'aucune'}) — ce contrôle juge .md, .html et .txt`);
const base = path.basename(file);
const brut = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// ---- jour de référence ----------------------------------------------------------------------
const dateArg = opt('date');
if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) skip(`--date « ${dateArg} » n'est pas au format AAAA-MM-JJ`);
const AUJ = dateArg || new Date().toISOString().slice(0, 10);

// ---- TR3 : contenu déclaré non généré ---------------------------------------------------------
const frontmatter = (brut.startsWith('---\n') ? brut.slice(4).split(/\n---\s*(\n|$)/)[0] : '');
const declGenere = frontmatter.match(/^\s*genere\s*:\s*(\S+)/mi);
if (flag('non-genere')) {
  findings.push({ sev: 'info', msg: 'TR3 — contenu déclaré NON généré par le paramètre `--non-genere` : aucune mention ni marquage n\'est exigé, et rien n\'est mesuré', where: base });
  skip('TR3 — déclaré non généré (`--non-genere`) : le contrôle ne s\'applique pas, et une absence de mention n\'est donc PAS un verdict de conformité');
}
if (declGenere && /^(false|non|no)$/i.test(declGenere[1])) {
  findings.push({ sev: 'info', msg: `TR3 — contenu déclaré NON généré par son frontmatter (\`genere: ${declGenere[1]}\`) : aucune mention ni marquage n'est exigé, et rien n'est mesuré`, where: base + ':' + (brut.split('\n').findIndex(l => /^\s*genere\s*:/i.test(l)) + 1) });
  skip('TR3 — déclaré non généré (frontmatter `genere: ' + declGenere[1] + '`) : le contrôle ne s\'applique pas, et une absence de mention n\'est donc PAS un verdict de conformité');
}

// ---- formules admises (fournies, jamais codées en dur pour un émetteur) -----------------------
const normaliser = s => s
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[‘’ʼ'`´]/g, ' ')
  .replace(/[   ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Jeu GÉNÉRIQUE par défaut (français et anglais) — aucune formule propre à un émetteur.
// Écrit sans accents ni apostrophes : il s'applique au texte NORMALISÉ.
const EXPRESSIONS_DEFAUT = [
  '(contenu|texte|article|publication|page|document|billet)[^.\\n]{0,60}(genere|generee|redige|redigee|produit|produite|ecrit|ecrite|traduit|resume|assiste|assistee)[^.\\n]{0,60}(avec|par|a l aide d)[^.\\n]{0,30}(une |l )?(ia|intelligence artificielle)',
  '(genere|generee|redige|redigee|produit|produite|ecrit|ecrite|assiste|assistee)[^.\\n]{0,40}(avec l aide d|a l aide d|par)[^.\\n]{0,20}(une |l )?(ia|intelligence artificielle)',
  '(ia|intelligence artificielle)[^.\\n]{0,40}(a ete utilisee|utilisee|a participe)[^.\\n]{0,40}(pour|dans|a la)',
  'ai[ -](generated|assisted|written|produced)',
  '(generated|written|produced|drafted|assisted)[^.\\n]{0,40}(with|by|using)[^.\\n]{0,25}(the help of )?(an? )?(ai|artificial intelligence)'
];

let mentionsSource = 'jeu générique par défaut (français et anglais) — aucune formule d\'émetteur';
let litterales = [], litteralesBrutes = [];
let expressions = EXPRESSIONS_DEFAUT.slice();
const mentionsPath = opt('mentions');
if (mentionsPath) {
  if (!fs.existsSync(mentionsPath)) skip(`--mentions : fichier introuvable (${mentionsPath}) — sans les formules admises, rien n'est mesuré`);
  let donnee;
  try { donnee = JSON.parse(fs.readFileSync(mentionsPath, 'utf8')); }
  catch (e) { skip(`--mentions : fichier illisible (${mentionsPath}) — ${e.message}`); }
  const brutListe = Array.isArray(donnee) ? donnee : [...(donnee.mentions || [])];
  const brutExpr = Array.isArray(donnee) ? [] : [...(donnee.expressions || [])];
  litteralesBrutes = brutListe.filter(s => typeof s === 'string' && !s.startsWith('re:'));
  litterales = litteralesBrutes.map(normaliser).filter(Boolean);
  expressions = [...brutExpr, ...brutListe.filter(s => typeof s === 'string' && s.startsWith('re:')).map(s => s.slice(3))];
  if (!litterales.length && !expressions.length) skip(`--mentions : aucune formule dans ${path.basename(mentionsPath)} (champs \`mentions\` / \`expressions\`, ou tableau de chaînes)`);
  mentionsSource = `${path.basename(mentionsPath)} — ${litterales.length} formule(s) littérale(s), ${expressions.length} expression(s)`;
}
let regs = [];
try { regs = expressions.map(e => new RegExp(e, 'i')); }
catch (e) { skip(`--mentions : expression invalide — ${e.message}`); }

// ---- texte lisible par un humain ---------------------------------------------------------------
const decoder = s => s
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"').replace(/&#3[49];|&apos;|&rsquo;/gi, "'");
let visible;
if (EXT === '.html' || EXT === '.htm') {
  visible = brut
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
} else if (EXT === '.md') {
  visible = brut
    .replace(/^---\n[\s\S]*?\n---\s*(\n|$)/, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
} else {
  visible = brut;
}
const visibleNorm = normaliser(decoder(visible));

// ---- TR1 : mention lisible par un humain --------------------------------------------------------
const trouveeLitterale = litterales.find(m => visibleNorm.includes(m));
const trouveeExpr = trouveeLitterale ? null : regs.find(r => r.test(visibleNorm));
if (trouveeLitterale || trouveeExpr) {
  findings.push({ sev: 'info', msg: `TR1 — mention d'assistance par IA présente dans le texte lisible (formules admises : ${mentionsSource})`, where: base });
} else {
  const exemple = litteralesBrutes.length ? `« ${litteralesBrutes[0]} »` : 'par exemple « Contenu rédigé avec l\'aide d\'une IA et relu par <rôle> »';
  findings.push({
    sev: 'bloquant',
    where: base + ':1',
    msg: `TR1 — AUCUNE MENTION d'assistance par IA dans le texte lisible par un humain. L'information du lecteur est due depuis le 2026-08-02 et ne bénéficie d'aucun report. Correction : écrire dans le CORPS VISIBLE (ni frontmatter, ni commentaire, ni métadonnée) une des formules admises — ${exemple}. Formules admises lues dans : ${mentionsSource}`
  });
}

// ---- TR2 : marquage lisible par machine (pages HTML) ---------------------------------------------
const lireEcheance = (chemin) => {
  try {
    const d = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    const e = (d.echeances || []).find(x => x.cle === CLE_ECHEANCE);
    return e && e.admise_jusqu_au ? { limite: e.admise_jusqu_au, source: path.basename(chemin) } : null;
  } catch { return null; }
};
let echeance = null, echeanceOrigine = null;
if (EXT === '.html' || EXT === '.htm') {
  const chemin = opt('echeances') || ECHEANCES_DEFAUT;
  echeanceOrigine = chemin;
  echeance = lireEcheance(chemin);
  const metas = [...brut.matchAll(/<meta\b[^>]*>/gi)].map(m => ({ tag: m[0], idx: m.index }));
  const attr = (tag, n) => { const m = tag.match(new RegExp(n + '\\s*=\\s*"([^"]*)"|' + n + "\\s*=\\s*'([^']*)'", 'i')); return m ? (m[1] ?? m[2] ?? '') : null; };
  const ligneDe = idx => brut.slice(0, idx).split('\n').length;
  const MARQUEUR_IA = /\b(ia|a\.?i\.?|intelligence artificielle|artificial intelligence|llm|claude|gpt|copilot|gemini|mistral)\b/i;
  let marquage = null;
  for (const m of metas) {
    const nom = (attr(m.tag, 'name') || '').toLowerCase();
    const contenu = (attr(m.tag, 'content') || '').trim();
    if (nom === 'ai-generated' && contenu) { marquage = { forme: 'meta name="ai-generated" (convention interne)', ligne: ligneDe(m.idx), contenu }; break; }
    if (nom === 'generator' && MARQUEUR_IA.test(contenu)) { marquage = { forme: 'meta name="generator" portant un marqueur d\'IA (forme admise, nommée par les règles de marque du parc)', ligne: ligneDe(m.idx), contenu }; break; }
  }
  if (marquage) {
    findings.push({ sev: 'info', msg: `TR2 — marquage lisible par machine présent : ${marquage.forme} → « ${marquage.contenu} »`, where: `${base}:${marquage.ligne}` });
  } else {
    const correction = 'Correction : ajouter dans le <head> `<meta name="ai-generated" content="<système ou mention>">` (convention INTERNE de ce contrôle, pas une norme publiée), ou une balise `<meta name="generator">` dont le contenu porte le marqueur d\'IA.';
    if (!echeance) {
      findings.push({ sev: 'bloquant', where: base + ':1', msg: `TR2 — AUCUN marquage lisible par machine, et AUCUNE ÉCHÉANCE déclarée (${path.basename(echeanceOrigine)} absent, illisible, ou sans la clé « ${CLE_ECHEANCE} ») : le report n'étant pas posé, l'absence est jugée bloquante. ${correction}` });
    } else {
      const jours = Math.round((Date.parse(echeance.limite + 'T00:00:00Z') - Date.parse(AUJ + 'T00:00:00Z')) / 86400000);
      if (jours < 0) {
        findings.push({ sev: 'bloquant', where: base + ':1', msg: `TR2 — AUCUN marquage lisible par machine. ÉCHÉANCE DÉPASSÉE depuis le ${echeance.limite} (donnée ${echeance.source}, clé « ${CLE_ECHEANCE} ») : l'absence n'est plus admise. ${correction}` });
      } else {
        findings.push({ sev: 'warn', where: base + ':1', msg: `TR2 — AUCUN marquage lisible par machine. L'absence reste admise jusqu'au ${echeance.limite}, soit ${jours} jour(s) au ${AUJ} (donnée ${echeance.source}, clé « ${CLE_ECHEANCE} ») ; passé cette date le constat devient BLOQUANT. ${correction}` });
      }
    }
  }
} else {
  findings.push({ sev: 'info', msg: `TR2 — non applicable : le marquage lisible par machine n'est jugé que sur une page HTML (support ${EXT})`, where: base });
}

// ---- verdict --------------------------------------------------------------------------------
const contexte = {
  date_reference: AUJ,
  mentions_lues: mentionsSource,
  echeance_lue: echeance ? `${CLE_ECHEANCE} → ${echeance.limite} (${echeance.source})` : (EXT === '.html' || EXT === '.htm' ? `aucune (${echeanceOrigine})` : 'sans objet (support non HTML)')
};
if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1, contexte);
out('PASS', 0, contexte);
