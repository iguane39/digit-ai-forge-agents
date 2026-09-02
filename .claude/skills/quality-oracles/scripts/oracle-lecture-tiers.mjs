#!/usr/bin/env node
// oracle-lecture-tiers — Domaine « Lecture d'une page par un tiers sans contexte ».
//
// DÉFAUT PAYÉ (Produit-02, 02/09/2026, ledger seq 102, analyse de causes ch. 1). La vue V6 —
// huit comptes par marché, aucun mot-clé visible, aucun geste offert — a passé le contrat de
// sortie, les filtres, le rendu et les interactions. QUATRE PORTES VERTES. Puis l'humain a lu la
// page : « on n'y comprend absolument rien ». Tous les contrôles regardaient la page depuis
// l'intérieur du projet, c'est-à-dire depuis quelqu'un qui savait déjà ce qu'elle voulait dire.
//
// CE QUE JUGE CET ORACLE, et il ne juge que ça : ce qu'une page dit à quelqu'un QUI N'A PAS LU LE
// BRIEF ET NE VERRA JAMAIS LE CODE. L'instantané soumis au jugement est construit pour ça — les
// scripts, les styles et les commentaires en sont retirés : un mot qui ne vit que dans du
// JavaScript n'est pas un mot que le lecteur voit.
//
// CHECKLIST CANONIQUE — trois contrôles DÉTERMINISTES, un jugement DÉCLARÉ non déterministe.
//   T1 INTENTION      la page dit ce qu'elle permet de DÉCIDER (phrase d'intention, chapeau,
//                     ou <meta name="description"> substantielle). Une page qui n'annonce pas
//                     sa décision laisse son lecteur la deviner, et il devine mal.
//   T2 VOCABULAIRE    tout en-tête de colonne et tout sigle employé en en-tête est GLOSÉ quelque
//                     part que le lecteur peut atteindre : `data-definition`, `<abbr title>`,
//                     `title=`, un glossaire, ou une définition en prose.
//   T3 GESTE          la page offre au moins un geste (filtre, recherche, tri déclaré, repli,
//                     lien) — ou DÉCLARE être en lecture seule. Une page de chiffres sans geste
//                     et sans déclaration est un mur.
//   T4 LECTURE PAR UN TIERS (invocation explicite, coût modèle) — le juge reçoit l'INSTANTANÉ
//                     seul, SANS brief ni code, et répond à trois questions : de quoi parle
//                     cette page · que permet-elle de décider · que signifie chaque en-tête.
//                     UN « JE NE SAIS PAS » = FAIL. C'est la règle entière.
//
// POURQUOI T4 N'EST PAS DANS LE ROUTAGE PAR DÉFAUT : il appelle un modèle, donc il coûte. Il est
// à invocation EXPLICITE (`ext: []`, aucun `content_patterns` au registre). Sans `--juge` ni
// `--reponse`, T4 est SKIP MOTIVÉ — jamais un PASS de complaisance : un contrôle qui ne mesure
// pas ne déclare pas conforme.
//
// LE VERDICT DE T4 EST PROUVABLE SANS DÉPENSE, et c'est voulu. `--reponse <fichier.json>` prend
// une lecture DÉJÀ RENDUE (enregistrée, ou produite par un juge humain) et lui applique la même
// règle. La partie non déterministe est la LECTURE ; la RÈGLE, elle, est déterministe et se
// rejoue. Les fixtures prouvent les deux : deux pages pour T1-T3, deux réponses pour T4.
//
// FRONTIÈRE avec `check_html.py` G7 (socle digit-ai-page-html) : G7 exige l'ATTRIBUT
// `data-definition` sur les `th` — c'est une règle de balisage. T2 demande qu'une glose soit
// ATTEIGNABLE PAR LE LECTEUR, par quelque moyen que ce soit. Les deux se renforcent, aucun ne
// remplace l'autre, et c'est écrit des deux côtés.
//
// Standard §3 : déterministe (T1-T3), checklist canonique, artefact réel, non_juge déclaré,
// sortie localisante, autoportant, prouvé par fixtures rouge/verte. Contrat JSON · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ORACLE = 'oracle-lecture-tiers';
const DOM = 'Lecture d\'une page par un tiers sans contexte';
const args = process.argv.slice(2);
const opt = (n) => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const OPTS = new Set(['juge', 'reponse', 'captures', 'instantane', 'profil']);
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && OPTS.has(args[i - 1].slice(2))));

const NJ = [
  'la JUSTESSE de ce que la page affiche : cet oracle juge ce qu\'elle DIT à un lecteur, jamais si c\'est vrai (→ oracle-calculs, oracle-claims)',
  'la charte, l\'accessibilité et le rendu (→ check_html.py, render_page.py, oracle-a11y)',
  'T2 : la QUALITÉ d\'une glose trouvée — son existence et son atteignabilité sont vérifiées, pas son exactitude',
  'T2 : l\'attribut `data-definition` en tant que règle de BALISAGE — c\'est G7 du socle digit-ai-page-html ; T2 accepte toute glose atteignable, G7 exige l\'attribut',
  'T3 : l\'ERGONOMIE du geste offert — son existence est vérifiée, pas son utilisabilité',
  'T4 : le déterminisme — la LECTURE d\'un tiers n\'est pas reproductible et n\'est jamais promue en verdict silencieux ; c\'est la RÈGLE qui l\'exploite (« je ne sais pas » = FAIL) qui est déterministe et rejouée par fixture',
  'ce que la page ferait sous les yeux d\'un lecteur RÉEL du métier : l\'épreuve de l\'étonnement reste humaine',
];
const findings = [];
const out = (verdict, nj, code) => {
  process.stdout.write(JSON.stringify({ oracle: ORACLE, domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj }));
  process.exit(code);
};
if (!file || !fs.existsSync(file)) out('SKIP', ['artefact absent — usage : node oracle-lecture-tiers.mjs <page.html> [--juge claude] [--reponse <lecture.json>] [--captures <dossier>]', ...NJ], 2);
const ext = path.extname(file).toLowerCase();
if (!['.html', '.htm'].includes(ext)) out('SKIP', ['extension non gérée : ' + ext + ' — cet oracle juge une PAGE', ...NJ], 2);

const base = path.basename(file);
const raw = fs.readFileSync(file, 'utf8');

// UN GABARIT N'EST PAS UNE PAGE, et l'exempter n'est pas une faveur : il n'a pas de lecteur.
// Mesuré le 02/09/2026 en jouant cet oracle sur les 7 pages .html suivies du dépôt — 6 sont des
// gabarits ou un boilerplate, et les accuser de ne rien dire à un tiers accuserait un outil de
// ne pas être un livrable. Même doctrine que l'exemption de fragment du gate d'écriture C7 :
// l'exemption est DÉCLARÉE au verdict, jamais muette, et sa limite est dite avec elle.
const MARQUEURS_GABARIT = [
  [/\{\{[^{}]{1,120}\}\}|\{%[-+]?\s*\w+/, 'marqueurs d\'un moteur de templates'],
  [/\[[ÀA]\s*(?:COMPL[ÉE]TER|REMPLACER)\]|<!--\s*(?:TODO|REMPLACER)/i, 'placeholders à compléter'],
  [/^(?:template|gabarit|squelette|boilerplate)[-_.]/i, null],
];
{
  const parNom = /^(?:template|gabarit|squelette|boilerplate)[-_.]/i.test(base);
  const parContenu = MARQUEURS_GABARIT.slice(0, 2).find(([r]) => r.test(raw));
  if (parNom || parContenu) {
    out('SKIP', [
      `GABARIT, pas une page : ${parNom ? 'le nom du fichier le déclare' : parContenu[1]}. Un gabarit n'a pas de lecteur — il en aura un quand il sera rempli, et c'est la page RENDUE qui se juge ici.`,
      'LIMITE DE CETTE EXEMPTION : un gabarit à marqueurs exotiques (ERB, Blade, Handlebars) et une vraie page qui CITE de la syntaxe de gabarit ne sont pas distingués — l\'exemption se déclare, elle ne se devine pas.',
      ...NJ,
    ], 2);
  }
}

// ---------------------------------------------------------------------------
// L'INSTANTANÉ — ce que le lecteur voit, et RIEN d'autre. Le brief n'y est pas, le code non plus.
// C'est la pièce maîtresse : un juge qui verrait le code jugerait l'intention, pas la page.
// ---------------------------------------------------------------------------
function instantane(html) {
  const sansCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const titre = (sansCode.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
  const desc = (sansCode.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [, ''])[1].trim();
  const titres = [...sansCode.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => '  '.repeat(+m[1] - 1) + m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const entetes = [...sansCode.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi)].map(m => ({ attrs: m[1], texte: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }));
  const corps = sansCode.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  return { titre, desc, titres, entetes, corps, sansCode };
}
const snap = instantane(raw);
const bloquant = (regle, msg) => findings.push({ sev: 'bloquant', regle, msg, where: base });
const info = (regle, msg) => findings.push({ sev: 'info', regle, msg, where: base });

// ---- T1 — la page dit ce qu'elle permet de décider -------------------------------------------
const INTENTION = /\b(permet(?:tent)?\s+de\s+(?:d[ée]cider|choisir|arbitrer|trancher|comparer|rep[ée]rer|prioriser)|sert\s+[àa]\s+(?:d[ée]cider|choisir|arbitrer|comparer)|[àa]\s+quoi\s+sert|cette\s+page\s+(?:sert|montre|permet)|ce\s+tableau\s+(?:sert|permet)|pour\s+d[ée]cider\s+(?:de|si|quoi))/i;
{
  const aIntention = INTENTION.test(snap.corps) || (snap.desc.length >= 60 && INTENTION.test(snap.desc));
  if (aIntention) info('T1', 'intention déclarée : la page dit ce qu\'elle permet de décider');
  else bloquant('T1', 'INTENTION ABSENTE — la page ne dit nulle part ce qu\'elle permet de DÉCIDER. '
    + 'Ni phrase d\'intention (« cette page permet de… », « à quoi sert… »), ni <meta name="description"> substantielle. '
    + 'Un lecteur sans contexte doit deviner l\'usage de la page, et c\'est exactement ce qui a produit « on n\'y comprend absolument rien » le 02/09.');
}

// ---- T2 — tout en-tête et tout sigle d'en-tête est glosé, quelque part d'atteignable ----------
{
  const glossaire = snap.corps;
  const gloseAtteignable = (e) => {
    if (/data-definition\s*=\s*["'][^"']{3,}/i.test(e.attrs)) return 'data-definition';
    if (/title\s*=\s*["'][^"']{3,}/i.test(e.attrs)) return 'title';
    if (/aria-description\s*=\s*["'][^"']{3,}/i.test(e.attrs)) return 'aria-description';
    const t = e.texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!t) return null;
    if (new RegExp('<abbr[^>]+title=["\'][^"\']{3,}["\'][^>]*>\\s*' + t, 'i').test(snap.sansCode)) return 'abbr';
    if (new RegExp('\\b' + t + '\\s*(?::|—|–|=)\\s*\\S', 'i').test(glossaire)) return 'glossaire';
    if (new RegExp('\\b(?:on\\s+appelle|d[ée]finition)\\b[^.\\n]{0,60}\\b' + t + '\\b', 'i').test(glossaire)) return 'prose';
    return null;
  };
  const nommes = snap.entetes.filter(e => e.texte);
  if (!nommes.length) {
    findings.push({ sev: 'avertissement', regle: 'T2', msg: 'aucun en-tête de colonne trouvé — le vocabulaire de cette page n\'est pas jugé (elle ne publie pas de table)', where: base });
  } else {
    const nus = nommes.filter(e => !gloseAtteignable(e));
    // Un SIGLE en en-tête (2 à 6 majuscules) est un mot que personne ne devine.
    const sigles = [...new Set(nommes.flatMap(e => (e.texte.match(/\b[A-ZÀ-Þ]{2,6}\b/g) || [])))]
      .filter(s => !new RegExp('\\b' + s + '\\b\\s*(?::|—|–|=|\\()', 'i').test(glossaire));
    if (nus.length) bloquant('T2', `VOCABULAIRE NON GLOSÉ — ${nus.length} en-tête(s) de colonne sur ${nommes.length} ne portent AUCUNE glose atteignable par le lecteur `
      + `(ni data-definition, ni <abbr title>, ni title=, ni glossaire, ni définition en prose) : « ${nus.slice(0, 6).map(e => e.texte).join(' », « ')} ». `
      + `Un en-tête qu'on ne peut pas définir sans ouvrir le code n'est pas un en-tête, c'est une étiquette.`);
    if (sigles.length) bloquant('T2', `SIGLE NON GLOSÉ EN EN-TÊTE — « ${sigles.join(' », « ')} » : un sigle ne se devine pas, il se glose à sa première occurrence.`);
    if (!nus.length && !sigles.length) info('T2', `${nommes.length} en-tête(s) de colonne, tous glosés de façon atteignable`);
  }
}

// ---- T3 — la page offre un geste, ou déclare être en lecture seule ----------------------------
{
  const GESTES = [
    [/<input\b[^>]*type\s*=\s*["'](?:search|text|checkbox|radio|date|number)["']/i, 'champ de saisie'],
    [/<select\b/i, 'liste déroulante'],
    [/<button\b/i, 'bouton'],
    [/<details\b/i, 'repli'],
    [/<a\b[^>]+href\s*=\s*["'][^"'#][^"']*["']/i, 'lien'],
    [/data-(?:filter|facette|sort|tri)\b/i, 'filtre ou tri déclaré'],
    [/aria-sort\s*=/i, 'tri de colonne annoncé'],
  ];
  const offerts = GESTES.filter(([r]) => r.test(snap.sansCode)).map(([, n]) => n);
  const lectureSeule = /\b(?:page|vue|tableau)\s+(?:de\s+|en\s+)?lecture\s+seule\b|\baucun\s+geste\s+n[\'’]est\s+offert\b/i.test(snap.corps);
  if (offerts.length) info('T3', 'geste(s) offert(s) : ' + offerts.join(', '));
  else if (lectureSeule) info('T3', 'aucun geste, et la page le DÉCLARE (lecture seule assumée)');
  else bloquant('T3', 'AUCUN GESTE OFFERT ET AUCUNE DÉCLARATION — la page n\'offre ni filtre, ni recherche, ni tri annoncé, ni repli, ni lien, et ne déclare pas être en lecture seule. '
    + 'Une page de chiffres sans geste et sans déclaration est un mur : le lecteur ne peut ni chercher, ni comparer, ni écarter. C\'est la V6 du 02/09, mot pour mot.');
}

// ---- T4 — la lecture par un tiers -------------------------------------------------------------
// Le PROFIL décide si T4 s'arme et avec quel juge. Par défaut `lecture_tiers.actif` est FAUX
// dans les deux profils livrés : T4 appelle un modèle, donc il coûte, donc il se demande.
// `--juge` sur la ligne de commande prime toujours sur le profil.
let PROFIL = {};
{
  const p = opt('profil');
  if (p && fs.existsSync(p)) { try { PROFIL = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* profil illisible : réglages par défaut */ } }
}
const CFG = PROFIL.lecture_tiers || {};
const QUESTIONS = (Array.isArray(CFG.questions) && CFG.questions.length ? CFG.questions : [
  'De quoi parle cette page ?',
  'Que permet-elle de décider ?',
  'Que signifie chaque en-tête de colonne ?',
]);
const IGNORANCE = /\b(je\s+ne\s+sais\s+pas|impossible\s+(?:de\s+)?(?:le\s+)?(?:savoir|dire|d[ée]terminer)|on\s+ne\s+(?:sait|peut)\s+pas|pas\s+assez\s+d[\'’]?(?:information|[ée]l[ée]ments?)|aucune\s+(?:id[ée]e|indication)|ind[ée]terminable|indéchiffrable|incompr[ée]hensible|n[\'’]est\s+pas\s+dit)\b/i;
const reponsePath = opt('reponse');
const juge = opt('juge') || (CFG.actif === true && CFG.juge ? CFG.juge : null);
let njT4 = null;

/** La RÈGLE de T4, déterministe : un « je ne sais pas » sur une seule question = FAIL. */
function jugerLecture(lecture, provenance) {
  const rep = Array.isArray(lecture.reponses) ? lecture.reponses : null;
  if (!rep || rep.length < QUESTIONS.length) {
    bloquant('T4', `LECTURE INCOMPLÈTE (${provenance}) — le juge devait répondre aux ${QUESTIONS.length} questions, ${rep ? rep.length : 0} réponse(s) reçue(s). Une lecture partielle ne vaut pas lecture.`);
    return;
  }
  const muettes = rep.map((r, i) => ({ i, texte: String(r && r.reponse !== undefined ? r.reponse : r) }))
    .filter(r => !r.texte.trim() || IGNORANCE.test(r.texte));
  if (muettes.length) {
    for (const m of muettes) {
      bloquant('T4', `LE TIERS NE SAIT PAS (${provenance}) — question « ${QUESTIONS[m.i] || 'question ' + (m.i + 1)} » : « ${m.texte.trim().slice(0, 140) || '(réponse vide)'} ». `
        + `Un « je ne sais pas » est un ÉCHEC, pas une nuance : la page a été lue par quelqu'un qui n'avait pas le brief, et elle ne lui a rien dit.`);
    }
  } else {
    info('T4', `lecture par un tiers (${provenance}) : les ${QUESTIONS.length} questions ont reçu une réponse, aucune ignorance déclarée`);
  }
}

if (reponsePath) {
  if (!fs.existsSync(reponsePath)) bloquant('T4', `lecture annoncée et introuvable : ${reponsePath}. Un jugement promis et absent n'est pas « rien à juger »`);
  else {
    let lecture = null;
    try { lecture = JSON.parse(fs.readFileSync(reponsePath, 'utf8')); }
    catch (e) { bloquant('T4', 'lecture illisible (' + path.basename(reponsePath) + ') : ' + e.message); }
    if (lecture) jugerLecture(lecture, 'lecture enregistrée ' + path.basename(reponsePath));
  }
} else if (juge) {
  // Le CLI du juge reçoit l'INSTANTANÉ seul. Aucun chemin de fichier, aucun code, aucun brief.
  const prompt = [
    'Tu lis une page que tu n\'as jamais vue, dont tu ne connais ni le projet, ni le brief, ni le code.',
    'Réponds UNIQUEMENT par un objet JSON de la forme {"reponses":[{"question":"…","reponse":"…"}]} ,',
    'une entrée par question, dans l\'ordre. Si tu ne sais pas, écris exactement « je ne sais pas ».',
    '', 'QUESTIONS :', ...QUESTIONS.map((q, i) => (i + 1) + '. ' + q),
    '', '--- INSTANTANÉ DE LA PAGE ---',
    'Titre : ' + (snap.titre || '(aucun)'),
    'Description : ' + (snap.desc || '(aucune)'),
    'Titres : ' + (snap.titres.join(' | ') || '(aucun)'),
    'En-têtes de colonnes : ' + (snap.entetes.map(e => e.texte).filter(Boolean).join(' | ') || '(aucun)'),
    '', snap.corps.slice(0, 20000),
  ].join('\n');
  const captures = opt('captures');
  if (captures && fs.existsSync(captures)) njT4 = 'T4 : les captures de ' + captures + ' ne sont PAS transmises au juge par ce CLI (texte seulement) — la lecture porte sur l\'instantané textuel';
  const r = spawnSync(juge, ['-p', prompt], { encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) njT4 = `T4 NON JOUÉ : le juge « ${juge} » est indisponible ou a échoué (${(r.error && r.error.code) || 'exit ' + r.status}) — un contrôle qui ne mesure pas ne déclare pas conforme`;
  else {
    let lecture = null;
    try { lecture = JSON.parse((r.stdout || '').match(/\{[\s\S]*\}/)[0]); } catch { /* sortie non structurée */ }
    if (!lecture) njT4 = 'T4 NON JOUÉ : la sortie du juge n\'est pas le JSON attendu — non déterminisme assumé, jamais promu en verdict';
    else jugerLecture(lecture, 'juge ' + juge);
  }
} else {
  njT4 = 'T4 NON JOUÉ (invocation explicite, coût modèle) : ni --juge <cli>, ni --reponse <lecture.json>, ni `lecture_tiers.actif: true` au profil. '
    + 'Le SKIP est motivé et T1-T3 restent jugés — un contrôle qui ne mesure pas ne déclare jamais conforme.';
}

// ---- verdict ----------------------------------------------------------------------------------
const nj = njT4 ? [...NJ, njT4] : NJ;
if (findings.some(f => f.sev === 'bloquant')) out('FAIL', nj, 1);
out('PASS', nj, 0);
