#!/usr/bin/env node
// self-test du skill digit-ai-schemas — LE GABARIT ET L'EXEMPLE PASSENT LES TROIS ORACLES (TF-1890).
//
// LE FAIT (lot Produit-84 20261019a, RT-9, 19/10/2026). Une page instanciée fidèlement depuis
// `assets/template-multi-bandes.html` échouait aux trois jeux d'oracles qui la jugent, et la mise en
// conformité a demandé six passes : `check_html.py` (A1, G1, L2, L4, L13), les oracles de forge-design
// (`oracle-tokens` 147 écarts durs, `oracle-bascule` 19) et `render_page.py` (V4 sur les cadres et les
// pastilles). TF-1660 (14/10) n'avait traité que `render_page`. Aucune recette du skill ne jouait ces
// oracles sur ses propres assets : un gabarit qui ne tient pas les règles du socle enseigne le défaut.
//
// CE QUE JOUE CETTE RECETTE, au poste et sans réseau :
//   1. les faces de police des pages sont à jour (`embarquer-polices.mjs --constat`) ;
//   2. UNE INSTANCE du gabarit (chaque {{PLACEHOLDER}} reçoit une valeur) passe `check_html.py`, le
//      lanceur de forge-design (`run-oracles-design.mjs`, dont `oracle-bascule` JUGE, sans l'avertissement
//      « rendu figé ») et `render_page.py` aux six largeurs, en thème clair puis sombre ;
//   3. SENS ROUGE de la même instance, un défaut à la fois : un `<link>` Google Fonts (A1), une couleur
//      en dur (oracle-tokens T1), la projection sombre retirée (oracle-bascule B-T4), la pastille de la
//      bande 2 remise sur le couloir de la flèche (mesure de géométrie de la recette : `render_page`
//      ne la voit pas sur un groupe titré) — chacun doit ÉCHOUER pour sa raison ;
//   4. `exemple-reference.html` passe `check_html.py`, le lanceur de forge-design et `render_page.py`.
//
//   6. (TF-2350, 10/11/2026) LA SIGNATURE DE L'ÉMETTEUR SE LIT : `lire-signature.mjs` rend le pied de page et l'année de
//      l'émetteur (fictif en fixture, réel quand il est joignable), refuse avec exit 2 un dossier ou une ligne absents ;
//      aucune adresse, aucun domaine, aucune signature de l'émetteur n'est écrite en dur dans SKILL.md, references/*.md et
//      assets/template-*.html (`exemple-reference.html`, une instance datée, n'est pas jugée). Contrôle léger, joué sous --rapide.
//
//   5. (TF-2263, 06/11/2026) LES CINQ AUTRES GABARITS, instanciés tels quels, passent `run-oracles-design.mjs
//      --rendu` : les quatre fragments (topologie, flux temporel, tableau de bord, schéma différentiel), insérés
//      dans le squelette multi-bandes, et la page du modèle de données. Le fait : une page de schéma bâtie sur le
//      gabarit échouait à la critique d'implémentation (RT-54, Produit-84 du 06/11) ; mesuré sur ce dépôt, le flux
//      temporel rendait 105 bloquants V4 (cadres de swimlane qui contiennent leurs nœuds), la topologie 58, le
//      tableau de bord 2 (V18), le modèle de données 3 (S6, B-T1, B-T3). Sens rouge : le flux temporel sans ses
//      `data-overlap-ok` échoue pour V4. Trois rendus à la fois ; ces contrôles jouent aussi sous --rapide.
//
// CE QU'ELLE NE JUGE PAS : la lecture humaine du rendu (capture à ouvrir).
//
// Un outil absent du poste (page-html, forge-design, Python, Playwright) rend un SKIP NOMMÉ, jamais un vert.
//
// Usage : node scripts/self-test.mjs [--rapide]   (--rapide : n'ouvre pas l'exemple de référence dans le
//         navigateur, ~4 min ; le SKIP est dit au bilan). Exit 0 = PASS, 1 = FAIL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(ICI, '..');
const SKILLS = path.resolve(SKILL, '..');
const PAGE = path.join(SKILLS, 'digit-ai-page-html', 'scripts');
const GABARIT = path.join(SKILL, 'assets', 'template-multi-bandes.html');
const EXEMPLE = path.join(SKILL, 'assets', 'exemple-reference.html');
const rapide = process.argv.includes('--rapide');

const oks = [], kos = [], skips = [];
const ok = (m) => oks.push(m);
const ko = (m) => kos.push(m);
const skip = (m) => skips.push(m);

// forge-design : FORGE_ROOT d'abord, sinon la forge sœur du dépôt (digit-ai-forge-agents/.claude/skills/<skill>/scripts).
const racineForges = process.env.FORGE_ROOT || path.resolve(SKILL, '..', '..', '..', '..');
const DESIGN = path.join(racineForges, 'digit-ai-forge-design', 'oracles', 'run-oracles-design.mjs');
const designPresent = fs.existsSync(DESIGN);
const checkHtml = path.join(PAGE, 'check_html.py');
const renderPage = path.join(PAGE, 'render_page.py');
const pageHtmlPresent = fs.existsSync(checkHtml) && fs.existsSync(renderPage);

const env = { ...process.env, PYTHONUTF8: '1' };
const pythonProbe = (bin) => { const r = spawnSync(bin, ['--version'], { encoding: 'utf8' }); return r.status === 0; };
const PYTHON = process.env.PYTHON || ['python', 'python3', 'py'].find(pythonProbe) || null;
const playwrightPresent = !!PYTHON && spawnSync(PYTHON, ['-c', 'import playwright.sync_api'], { encoding: 'utf8', env }).status === 0;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'schemas-'));

// --- les valeurs d'une INSTANCE plausible du gabarit : un trou laissé vide serait jugé par L11 ---
const VALEURS = {
  TITRE_PAGE: 'Digit-AI - Brief Produit-A - Architecture detaillee - 20261019a',
  EYEBROW: "Brief d'architecture · Produit-A",
  H1_DEBUT: 'La chaîne de', H1_ACCENT: 'livraison', H1_FIN: 'du produit',
  LEDE: 'Cette page permet de décider où placer le contrôle humain dans la chaîne de livraison du produit.',
  VERSION: 'V1a · 19 octobre 2026', TYPE: "Brief d'architecture", PERIMETRE: 'Chaîne de livraison',
  TITRE_SECTION: "Vue d'ensemble de la chaîne",
  INTRO_SECTION: "Le schéma se lit de haut en bas. Chaque bande regroupe les éléments d'une même couche, et les flèches suivent des couloirs dédiés.",
  TITRE_SCHEMA: 'Chaîne de livraison par couches', DESC_SCHEMA: "Cinq bandes, des entrées jusqu'aux intégrations externes.",
  NOM_BANDE_1: 'Entrées et acteurs', NOM_BANDE_2: 'Pipelines', NOM_BANDE_3: 'Environnements',
  NOM_BANDE_4: 'Observabilité', NOM_BANDE_5: 'Intégrations numérotées', NOM_SOURCE_1: 'Dépôt de code',
  TRIGGER: 'push sur main', EFFET: 'lance le pipeline M1', OWNER: 'équipe produit',
  TITRE_SOURCE_1: 'Dépôt de code', SOUSTITRE_1: 'Branche principale', LIGNE_1: 'git · revue obligatoire', LIGNE_2: '2 relecteurs',
  NOM_ACTEUR: 'Responsable de mise en production', PROFIL: 'lead technique', ACTION: 'approuve la promotion', GROUPE: 'grp-mep',
  TITRE_ACTEUR: 'Approbateur MEP', SOUSTITRE_ACTEUR: 'Lead technique', LIGNE_1_ACTEUR: 'approuve la promotion', LIGNE_2_ACTEUR: 'groupe grp-mep',
  TOOLTIP_FLECHE_1: 'Déclenchement | Un push sur main lance M1 | Aucune action humaine',
  NOM_PIPELINE: 'M1 · Construction', POOL: 'pool-linux', SP: 'sc-dev', VG: 'vg-commun', ETAPES: 'build, tests, analyse', ARTEFACT: 'image.tar',
  TITRE_PIPELINE: 'M1 · Construction', CHEMIN_YAML: 'ci/build.yml', TRIGGER_PIPELINE: 'push sur main', POOL_PIPELINE: 'pool-linux',
  SC_PIPELINE: 'sc-dev', ETAPE_1: 'build et tests', ETAPE_2: 'analyse statique', ARTEFACT_PIPELINE: 'image conteneur',
  REF_INTEGRATIONS: 'Réf. intégrations 1', N: '1', NOM_INTEGRATION: "Registre d'images", DESCRIPTION_INTEG: 'Stocke les images construites',
  PIPELINES_REFERENTS: 'M1', NOM_INTEG: "Registre d'images", SOUSTITRE_INTEG: 'Images signées', PIPELINES_REF: 'M1',
  LEGENDE_FIGURE: 'Chaîne de livraison par couches, des entrées aux intégrations.', TYPE_FOOTER: "Brief d'architecture", AUDIENCE: 'Équipe produit',
  MARQUE_FOOTER: 'ÉMETTEUR FICTIF · SERVICES', ANNEE_REF: '2030',
};

const ecrire = (nom, contenu) => { const p = path.join(tmp, nom); fs.writeFileSync(p, contenu, 'utf8'); return p; };
const lancer = (bin, args, timeout = 300000) => spawnSync(bin, args, { encoding: 'utf8', env, timeout, maxBuffer: 64 * 1024 * 1024 });

// --- la pastille de bande hors des couloirs : une mesure de GEOMETRIE, que render_page ne fait pas ---
// Mesure du 19/10/2026 : la pastille de la bande 2 calee a gauche (x = 20, largeur 290) recouvrait la fleche du
// couloir x = 127 sur 22 px, et render_page.py rendait PASS aux six largeurs : une pastille groupee sous un
// <title> est UN objet (TF-0424), V4 ne la juge plus contre la fleche qui la traverse. Cette recette compte donc
// elle-meme : aucune fleche verticale ne traverse le rectangle d'une pastille `bande-N-pastille`.
function pastillesSurCouloir(html) {
  const fleches = [...html.matchAll(/<line[^>]*?\bx1="([\d.]+)"[^>]*?\by1="([\d.]+)"[^>]*?\bx2="([\d.]+)"[^>]*?\by2="([\d.]+)"/g)]
    .map((m) => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] })).filter((l) => l.x1 === l.x2);
  const pastilles = [...html.matchAll(/<g id="(bande-\d+-pastille)">[\s\S]*?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
    .map((m) => ({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }));
  const fautes = [];
  for (const p of pastilles) {
    for (const f of fleches) {
      const croise = Math.min(f.y1, f.y2) <= p.y + p.h && Math.max(f.y1, f.y2) >= p.y;
      if (croise && f.x1 >= p.x && f.x1 <= p.x + p.w) fautes.push(p.id + ' (x ' + p.x + ' à ' + (p.x + p.w) + ') traversée par la flèche x = ' + f.x1);
    }
  }
  return { pastilles: pastilles.length, fleches: fleches.length, fautes };
}

// --- TF-2533 : un refus d'oracle jugé faux se RAPPORTE, et se DÉCLARE ici avec son motif (TF-1912) ---
// Le 14/11/2026, le gabarit « schema-differentiel » rendait FAIL à oracle-slop S6 (forge-design) : la légende du gabarit
// et ses colonnes corrigées portent « ✎ » (U+270E, LOWER RIGHT PENCIL). S6 lit `\p{Extended_Pictographic}`, une classe de
// SEGMENTATION de texte qui couvre des pictogrammes sans présentation emoji ; U+270E n'a ni variante emoji ni rendu en
// couleur, et le gabarit le dit (« Les glyphes de COLONNE (＋ ✎ ●) restent des caractères », assets/template-schema-
// differentiel.html). Mesuré : la règle est inchangée depuis août, et run-oracles-design refuse le gabarit brut de la même façon
// sur forge-design au 06/11 (1f43109), au 13/11 (dc39050) et à HEAD (8bd5d1a) : ce n'est pas une régression de cette forge,
// et pourquoi le même gabarit rendait vert le 13/11 n'est PAS établi (cause inconnue, déclarée). Le gabarit n'est pas altéré pour faire taire l'oracle : remplacer le
// glyphe changerait le contrat de lecture sans couleur du canevas (page-html : self_test.py, glyphes des colonnes) et cacher
// le refus. L'écart est ÉTROIT : seul oracle-slop S6, seul le glyphe nommé ; tout autre échec, tout autre emoji reste un
// échec. Le refus est remonté à forge-design (rapport du lot fa, restes) ; cette déclaration se retire quand S6 ne le
// refuse plus : le gabarit rend alors PASS, et la recette DIT que l'écart déclaré est périmé.
const ECARTS_DECLARES = {
  'schema-differentiel': {
    oracle: 'oracle-slop', regle: 'S6', glyphes: ['✎'],
    motif: "oracle-slop S6 lit « ✎ » (U+270E, caractère de légende sans présentation emoji) comme un emoji : classe Extended_Pictographic, "
      + 'plus large que les emoji (TF-2533, refus remonté à forge-design)',
  },
};
const SEVERITES_BLOQUANTES = ['majeur', 'bloquant', 'critique'];
/** Le motif de l'écart déclaré qui couvre ce verdict, ou null : seul l'oracle, la règle et les glyphes déclarés sont excusés. */
function ecartDeclare(canevas, verdict, oracles) {
  const decl = ECARTS_DECLARES[canevas];
  if (!decl || verdict !== 'FAIL') return null;
  const echoues = (oracles || []).filter((o) => o.verdict === 'FAIL');
  if (echoues.length !== 1 || echoues[0].oracle !== decl.oracle) return null;
  const bloquants = (echoues[0].findings || []).filter((f) => SEVERITES_BLOQUANTES.includes(f.sev || f.severite));
  if (!bloquants.length) return null;
  const couvert = bloquants.every((f) => f.regle === decl.regle && decl.glyphes.includes((/« (.+?) »/.exec(f.msg || f.message || '') || [])[1]));
  return couvert ? decl.motif : null;
}

// --- les trois oracles, chacun rendu sous une forme que la recette sait lire ---
function jouerCheckHtml(fichier) {
  const r = lancer(PYTHON, [checkHtml, fichier]);
  const sortie = (r.stdout || '') + (r.stderr || '');
  const verdict = (/Verdict\s*:\s*(\w+)/.exec(sortie) || [])[1] || '?';
  const echecs = sortie.split('\n').filter((l) => /^\s+x /.test(l)).map((l) => l.trim());
  return { verdict, echecs, sortie };
}
function jouerDesign(fichier) {
  const r = lancer('node', [DESIGN, fichier, '--json-only']);
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* illisible : verdict inconnu */ }
  const oracles = (j && j.oracles) || [];
  const de = (nom) => oracles.find((o) => o.oracle === nom) || null;
  return { verdict: j ? j.verdict : '?', de, oracles };
}
function jouerRendu(fichier, theme) {
  const dossier = fs.mkdtempSync(path.join(tmp, 'rendu-'));
  const r = lancer(PYTHON, ['-X', 'utf8', renderPage, fichier, '--theme', theme, '--output', 'json', '--out', dossier], 900000);
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* illisible */ }
  const bps = (j && j.breakpoints) || {};
  const parLargeur = Object.fromEntries(Object.entries(bps).map(([w, b]) => [w, Number(b.blocking || 0)]));
  return { verdict: j ? j.verdict : '?', parLargeur, total: Object.values(parLargeur).reduce((a, b) => a + b, 0), largeurs: Object.keys(bps).length, stderr: (r.stderr || '').slice(0, 200) };
}

try {
// =====================================================================================================
// TF-2350 — la signature de l'émetteur (pied de page d'un schéma) se LIT, elle ne s'écrit pas ; aucune donnée
// d'instance textuelle en dur dans le skill. Contrôle léger, sans navigateur : il joue aussi sous --rapide.
// Le fait (relevé du 11/09/2026) : « DIGIT-AI · CONSEIL ET STRATÉGIE IA » et l'année 2026 écrits dans SKILL.md,
// dans conventions-communes.md § 13 et dans les gabarits HTML. L'extension, à ce skill, du contrôle « aucune
// valeur de marque en dur » de digit-ai-pptx : adresse électronique, nom de domaine, et la signature de l'émetteur
// lue chez lui au moment du test et retrouvée mot pour mot dans SKILL.md, references/*.md et assets/template-*.html.
// =====================================================================================================
{
  const LECTEUR_SIG = path.join(ICI, 'lire-signature.mjs');
  const FIX_SIG = path.join(SKILL, 'fixtures', 'signature');
  const jouerSig = (marque) => {
    const r = spawnSync(process.execPath, [LECTEUR_SIG, `--marque=${marque}`, '--compact'], { encoding: 'utf8', timeout: 30000 });
    let j = null; try { j = JSON.parse(r.stdout); } catch { /* le code le dit */ }
    return { code: r.status, j, out: r.stdout || '', err: r.stderr || '' };
  };
  const skillMd = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');
  if (!fs.existsSync(LECTEUR_SIG) || !fs.existsSync(path.join(FIX_SIG, 'MARQUE.md'))) ko('signature : scripts/lire-signature.mjs ou fixtures/signature absent');
  else {
    skillMd.includes('scripts/lire-signature.mjs') ? ok('signature : SKILL.md prescrit scripts/lire-signature.mjs') : ko('signature : SKILL.md ne prescrit plus scripts/lire-signature.mjs');
    // sens vert : l'émetteur fictif
    const v = jouerSig(FIX_SIG);
    (v.code === 0 && v.j && v.j.footer.marque === 'ÉMETTEUR FICTIF · SERVICES' && /Audience/.test(v.j.footer.droite_gabarit) && v.j.annee_reference === '2030')
      ? ok('sens vert · lire-signature lit le pied de page et l\'année de l\'émetteur fictif')
      : ko('sens vert · lire-signature ne lit pas la signature de l\'émetteur fictif (code ' + v.code + ')');
    // sens rouge : dossier absent, ligne retirée
    const a = jouerSig(path.join(FIX_SIG, 'dossier-qui-n-existe-pas'));
    (a.code === 2 && !a.out.trim() && /introuvable/.test(a.err)) ? ok('sens rouge · un dossier de marque absent rend exit 2, un message, rien sur stdout') : ko('sens rouge · un dossier de marque absent ne rend pas la main (code ' + a.code + ')');
    const sansLigne = path.join(tmp, 'signature-sans-footer'); fs.mkdirSync(sansLigne, { recursive: true });
    fs.writeFileSync(path.join(sansLigne, 'MARQUE.md'), fs.readFileSync(path.join(FIX_SIG, 'MARQUE.md'), 'utf8').split('\n').filter((l) => !/^\| Footer de page/.test(l)).join('\n'));
    const b = jouerSig(sansLigne);
    (b.code === 2 && !b.out.trim() && /footer-de-page-de-schema/.test(b.err)) ? ok('sens rouge · un tableau sans la ligne « Footer de page de schéma » rend exit 2 en la nommant') : ko('sens rouge · une signature sans la ligne du footer ne rend pas la main (code ' + b.code + ')');

    // données d'instance en dur
    // domaines TECHNIQUES admis (espaces de noms, services d'outils) : ils ne décrivent aucun émetteur ; liste figée, dite au bilan
    const TECHNIQUES = ['w3.org', 'googleapis.com', 'gstatic.com', 'google.com', 'claude.ai', 'anthropic.com', 'github.com', 'npmjs.com', 'nodejs.org', 'unsplash.com'];
    const MOTIFS = [
      [(l) => (l.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/) || [])[0], 'adresse électronique'],
      [(l) => (l.match(/\b(?:[A-Za-z0-9-]+\.)+(?:fr|com|io|ai|eu|net|org|dev)\b/g) || []).find((d) => !TECHNIQUES.some((t) => d.toLowerCase() === t || d.toLowerCase().endsWith('.' + t))), 'nom de domaine'],
    ];
    const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const enDur = (texte, valeurs, etiquette) => {
      const f = [];
      texte.split(/\r?\n/).forEach((l, i) => { for (const [m, nom] of MOTIFS) { const x = m(l); if (x) f.push(`${etiquette}:${i + 1} — ${nom} en dur : ${x}`); } });
      const plat = norm(texte);
      for (const val of valeurs) if (plat.includes(norm(val))) f.push(`${etiquette} — signature de l'émetteur écrite en dur : « ${val.slice(0, 50)} »`);
      return f;
    };
    const valFict = v.j ? [v.j.footer.marque] : [];
    (enDur('Pied : ÉMETTEUR FICTIF · SERVICES\n', valFict, 'fixture-rouge').length === 1)
      ? ok('sens rouge · la signature de l\'émetteur fictif recopiée dans un gabarit est vue')
      : ko('sens rouge · la signature de l\'émetteur fictif recopiée dans un gabarit n\'est PAS vue (C4 de ce skill est aveugle)');
    (enDur('Contact bonjour@exemple.fr · exemple.fr\n', [], 'fixture-rouge').length === 2)
      ? ok('sens rouge · une adresse électronique et un nom de domaine plantés sont vus')
      : ko('sens rouge · une adresse et un domaine plantés ne rendent pas 2 constats');
    enDur('Pied : {{MARQUE_FOOTER}} · {{ANNEE_REF}}\n', valFict, 'fixture-verte').length === 0 ? ok('sens vert · un pied écrit avec les emplacements passe') : ko('sens vert · un pied écrit avec les emplacements est refusé à tort');
    // le skill réel
    const reel = jouerSig(path.join(process.env.FORGE_ROOT || path.resolve(SKILL, '..', '..', '..', '..'), 'digit-ai-marketing', 'donnees', 'marque'));
    const valReelles = reel.j ? [reel.j.footer.marque] : [];
    if (!reel.j) skip('signature : l\'émetteur réel (digit-ai-marketing, donnees/marque) n\'est pas joignable : seuls les motifs (adresse, domaine) et l\'émetteur fictif sont joués ; la signature réelle n\'est pas comparée au texte du skill');
    const fichiers = [path.join(SKILL, 'SKILL.md'), ...fs.readdirSync(path.join(SKILL, 'references')).filter((f) => f.endsWith('.md')).map((f) => path.join(SKILL, 'references', f)),
      ...fs.readdirSync(path.join(SKILL, 'assets')).filter((f) => /^template-.*\.html$/.test(f)).map((f) => path.join(SKILL, 'assets', f))];
    const fautes = fichiers.flatMap((f) => enDur(fs.readFileSync(f, 'utf8'), valReelles, path.relative(SKILL, f).replace(/\\/g, '/')));
    fautes.length === 0
      ? ok(`données d'instance : aucune adresse, aucun domaine${valReelles.length ? ', aucune signature de l\'émetteur' : ''} écrits en dur dans SKILL.md, references/*.md et assets/template-*.html (${fichiers.length} fichiers)`)
      : fautes.slice(0, 6).forEach((x) => ko('données d\'instance en dur · ' + x));
    // les emplacements existent dans les gabarits, et la recette leur donne une valeur
    const mb = fs.readFileSync(GABARIT, 'utf8');
    (mb.includes('{{MARQUE_FOOTER}}') && mb.includes('{{ANNEE_REF}}')) ? ok('gabarit multi-bandes : le pied porte {{MARQUE_FOOTER}} et {{ANNEE_REF}}') : ko('gabarit multi-bandes : le pied ne porte plus {{MARQUE_FOOTER}} et {{ANNEE_REF}}');
  }
}

  // (1) les faces de police
  const polices = lancer('node', [path.join(ICI, 'embarquer-polices.mjs'), '--constat'], 120000);
  polices.status === 0
    ? ok('polices : les faces embarquées des pages sont à jour (embarquer-polices.mjs --constat, exit 0)')
    : ko('polices : embarquer-polices.mjs --constat rend ' + polices.status + ' — ' + ((polices.stdout || polices.stderr || '').trim().split('\n').pop() || '').slice(0, 160));

  if (!fs.existsSync(GABARIT)) ko('gabarit multi-bandes ABSENT : ' + GABARIT);
  else if (!pageHtmlPresent) skip('digit-ai-page-html absent à côté de ce skill (' + PAGE + ') : check_html.py et render_page.py non joués');
  else if (!PYTHON) skip('aucun interpréteur Python sur ce poste : check_html.py et render_page.py non joués');
  else {
    const brut = fs.readFileSync(GABARIT, 'utf8');
    const instance = brut.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, k) => (k in VALEURS ? VALEURS[k] : m));
    const trous = [...new Set(instance.match(/\{\{[A-Z_0-9]+\}\}/g) || [])];
    trous.length === 0
      ? ok('gabarit multi-bandes : instance complète, aucun trou {{…}} sans valeur')
      : ko('gabarit multi-bandes : trous sans valeur dans la recette — ' + trous.join(' ') + ' (ajouter la valeur à VALEURS)');

    // (2 ter) la pastille de bande hors des couloirs : sens vert, puis sens rouge (pastille remise a gauche sur 290 px)
    const g = pastillesSurCouloir(instance);
    (g.pastilles >= 5 && g.fleches >= 1 && g.fautes.length === 0)
      ? ok(`instance · ${g.pastilles} pastilles de bande, aucune sur l'un des ${g.fleches} couloir(s) de flèche`)
      : ko(`instance · pastille de bande : ${g.pastilles} pastille(s), ${g.fleches} flèche(s) verticale(s), ${g.fautes.join(' ; ') || 'aucune faute'}`);
    const pastilleHaute = '<rect x="140" y="195" width="185" height="22"';
    if (!instance.includes(pastilleHaute)) ko("sens rouge · la pastille de la bande 2 n'est plus en x = 140, largeur 185 : mettre la mutation à jour");
    else {
      const gR = pastillesSurCouloir(instance.replace(pastilleHaute, '<rect x="20" y="195" width="290" height="22"'));
      (gR.fautes.length === 1 && /bande-2-pastille.*x = 127/.test(gR.fautes[0]))
        ? ok('sens rouge · la pastille de la bande 2 remise à gauche sur 290 px est vue sur le couloir x = 127')
        : ko("sens rouge · la pastille sur le couloir n'est pas vue : " + (gR.fautes.join(' ; ') || 'aucune faute'));
    }

    // (2) l'instance, sens vert
    const vert = ecrire('instance.html', instance);
    const ch = jouerCheckHtml(vert);
    ch.verdict === 'PASS'
      ? ok('instance · check_html.py : PASS, 0 échec bloquant')
      : ko('instance · check_html.py : ' + ch.verdict + ' — ' + ch.echecs.slice(0, 3).map((e) => e.slice(0, 120)).join(' | '));

    if (!designPresent) skip('digit-ai-forge-design absent (' + DESIGN + ') : oracle-tokens, oracle-bascule et le lanceur de forge-design non joués');
    else {
      const d = jouerDesign(vert);
      const bascule = d.de('oracle-bascule');
      d.verdict === 'PASS'
        ? ok('instance · forge-design (run-oracles-design.mjs) : PASS sur ' + d.oracles.length + ' oracle(s), dont oracle-tokens et oracle-bascule')
        : ko('instance · forge-design : ' + d.verdict + ' — ' + d.oracles.filter((o) => o.verdict === 'FAIL').map((o) => o.oracle + ' ' + (o.findings || []).filter((f) => ['majeur', 'bloquant', 'critique'].includes(f.sev)).slice(0, 2).map((f) => f.regle).join('/')).join(' · '));
      // oracle-bascule doit JUGER : sans bouton ni palette sombre il rend l'avertissement « rendu figé » (B-T1) et ne juge rien.
      (bascule && bascule.verdict === 'PASS' && !(bascule.findings || []).some((f) => f.regle === 'B-T1'))
        ? ok('instance · oracle-bascule JUGE : bouton en en-tête, câblage, persistance et palette sombre présents (B-T1 à B-T4 sans écart)')
        : ko('instance · oracle-bascule ne juge pas la bascule (rendu figé ou verdict ' + (bascule ? bascule.verdict : 'absent') + ')');

      // (3) sens rouge, un défaut à la fois
      const lien = instance.replace('</head>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap">\n</head>');
      const rA1 = jouerCheckHtml(ecrire('rouge-google-fonts.html', lien));
      (rA1.verdict === 'FAIL' && rA1.sortie.includes('A1'))
        ? ok('sens rouge · un <link> Google Fonts fait échouer check_html.py (A1)')
        : ko('sens rouge · un <link> Google Fonts n\'échoue pas à check_html.py pour A1 (verdict ' + rA1.verdict + ')');

      const ancreHex = 'style="fill:var(--bg);stroke:var(--c-slate-fg)"';
      const enDur = instance.replace(ancreHex, 'style="fill:#ffffff;stroke:var(--c-slate-fg)"');
      if (enDur === instance) ko('sens rouge · la mutation « couleur en dur » ne s\'applique plus : l\'ancre ' + ancreHex + ' a disparu du gabarit');
      else {
        const dT = jouerDesign(ecrire('rouge-couleur-en-dur.html', enDur));
        const t = dT.de('oracle-tokens');
        (t && t.verdict === 'FAIL' && (t.findings || []).some((f) => f.regle === 'T1'))
          ? ok('sens rouge · une couleur hexadécimale dans un nœud fait échouer oracle-tokens (T1)')
          : ko('sens rouge · une couleur en dur n\'échoue pas à oracle-tokens pour T1 (verdict ' + (t ? t.verdict : 'absent') + ')');
      }

      const debutSombre = instance.indexOf('@media screen {\n  :root[data-theme="dark"] {');
      const finSombre = debutSombre < 0 ? -1 : instance.indexOf('\n  }\n}\n', debutSombre);
      if (debutSombre < 0 || finSombre < 0) ko('sens rouge · le bloc de projection sombre est introuvable dans le gabarit (@media screen { :root[data-theme="dark"] { … } })');
      else {
        const sansSombre = instance.slice(0, debutSombre) + instance.slice(finSombre + '\n  }\n}\n'.length);
        const dB = jouerDesign(ecrire('rouge-sans-projection-sombre.html', sansSombre));
        const b = dB.de('oracle-bascule');
        (b && b.verdict === 'FAIL' && (b.findings || []).some((f) => f.regle === 'B-T4'))
          ? ok('sens rouge · la projection sombre retirée, le bouton restant, fait échouer oracle-bascule (B-T4)')
          : ko('sens rouge · retirer la projection sombre n\'échoue pas à oracle-bascule pour B-T4 (verdict ' + (b ? b.verdict : 'absent') + ')');
      }
    }

    // (2 bis) le rendu, aux deux thèmes
    if (!playwrightPresent) skip('Playwright absent de ' + PYTHON + ' : render_page.py non joué (instance, exemple)');
    else {
      for (const theme of ['clair', 'sombre']) {
        const r = jouerRendu(vert, theme);
        (r.verdict === 'PASS' && r.total === 0 && r.largeurs >= 6)
          ? ok(`instance · render_page.py thème ${theme} : PASS, 0 bloquant sur ${r.largeurs} largeurs`)
          : ko(`instance · render_page.py thème ${theme} : ${r.verdict}, ${r.total} bloquant(s) sur ${r.largeurs} largeur(s) ${JSON.stringify(r.parLargeur)} ${r.stderr}`);
      }
    }

    // (4) l'exemple de référence
    if (!fs.existsSync(EXEMPLE)) ko('exemple de référence ABSENT : ' + EXEMPLE);
    else {
      const gE = pastillesSurCouloir(fs.readFileSync(EXEMPLE, 'utf8'));
      (gE.pastilles >= 1 && gE.fleches >= 1 && gE.fautes.length === 0)
        ? ok(`exemple de référence · ${gE.pastilles} pastille(s) de bande groupée(s), aucune sur l'un des ${gE.fleches} couloir(s) de flèche`)
        : ko(`exemple de référence · pastille de bande : ${gE.pastilles} pastille(s), ${gE.fleches} flèche(s) verticale(s), ${gE.fautes.join(' ; ') || 'aucune faute'}`);
      const e = jouerCheckHtml(EXEMPLE);
      e.verdict === 'PASS'
        ? ok('exemple de référence · check_html.py : PASS, 0 échec bloquant')
        : ko('exemple de référence · check_html.py : ' + e.verdict + ' — ' + e.echecs.slice(0, 3).map((x) => x.slice(0, 120)).join(' | '));
      if (designPresent) {
        const d = jouerDesign(EXEMPLE);
        d.verdict === 'PASS'
          ? ok('exemple de référence · forge-design (run-oracles-design.mjs) : PASS sur ' + d.oracles.length + ' oracle(s)')
          : ko('exemple de référence · forge-design : ' + d.verdict + ' — ' + d.oracles.filter((o) => o.verdict === 'FAIL').map((o) => o.oracle + ' ' + (o.findings || []).filter((f) => ['majeur', 'bloquant', 'critique'].includes(f.sev)).slice(0, 2).map((f) => f.regle).join('/')).join(' · '));
      }
      if (!playwrightPresent) { /* déjà dit plus haut */ }
      else if (rapide) skip('exemple de référence · render_page.py non joué (--rapide) : à jouer sans l\'option avant toute livraison');
      else {
        const r = jouerRendu(EXEMPLE, 'clair');
        (r.verdict === 'PASS' && r.total === 0 && r.largeurs >= 6)
          ? ok(`exemple de référence · render_page.py : PASS, 0 bloquant sur ${r.largeurs} largeurs`)
          : ko(`exemple de référence · render_page.py : ${r.verdict}, ${r.total} bloquant(s) sur ${r.largeurs} largeur(s) ${JSON.stringify(r.parLargeur)} ${r.stderr}`);
      }
    }
  }

  // (5) TF-2263 — les cinq autres gabarits, instanciés tels quels, passent run-oracles-design --rendu
  if (fs.existsSync(GABARIT)) {
    if (!designPresent) skip('digit-ai-forge-design absent (' + DESIGN + ') : les cinq autres gabarits ne sont pas jugés par run-oracles-design --rendu');
    else if (!playwrightPresent) skip('Playwright absent : les cinq autres gabarits ne sont pas jugés par run-oracles-design --rendu');
    else {
      const remplir = (html) => html.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, k) => (k in VALEURS ? VALEURS[k] : 'Texte ' + k.toLowerCase().replace(/_/g, ' ').slice(0, 14)));
      const squelette = fs.readFileSync(GABARIT, 'utf8');
      const instancier = (canevas) => {
        const gabaritCanevas = fs.readFileSync(path.join(SKILL, 'assets', 'template-' + canevas + '.html'), 'utf8');
        if (/<head>/i.test(gabaritCanevas)) return remplir(gabaritCanevas);   // page complète (modèle de données)
        const debut = squelette.indexOf('<div class="diagram-wrap">');
        const finLegende = squelette.indexOf('</p>', squelette.indexOf('<p class="caption">')) + 4;
        if (debut < 0 || finLegende < 4) throw new Error('ancres du schéma introuvables dans le squelette multi-bandes');
        return remplir(squelette.slice(0, debut) + gabaritCanevas + squelette.slice(finLegende));
      };
      const lancerAsync = (bin, args, delai) => new Promise((resolve) => {
        const c = spawn(bin, args, { env });
        let out = '', err = '';
        const t = setTimeout(() => c.kill(), delai);
        c.stdout.on('data', (d) => { out += d; });
        c.stderr.on('data', (d) => { err += d; });
        c.on('close', (code) => { clearTimeout(t); resolve({ status: code, stdout: out, stderr: err }); });
      });
      // l'écart déclaré (TF-2533), jugé sur des verdicts écrits à la main : un sens vert, six sens rouges, sans rendu
      {
        const slop = (...glyphes) => ({ oracle: 'oracle-slop', verdict: 'FAIL', findings: glyphes.map((g) => ({ sev: 'majeur', regle: 'S6', msg: `emoji « ${g} » dans l'interface : utiliser une icône SVG dessinée` })) });
        const D = 'schema-differentiel', crayon = '✎', visage = '\u{1F642}';
        const cas = [
          ['« ✎ » seul est couvert', ecartDeclare(D, 'FAIL', [slop(crayon)]) !== null],
          ['un autre emoji n\'est pas couvert', ecartDeclare(D, 'FAIL', [slop(visage)]) === null],
          ['« ✎ » plus un autre emoji n\'est pas couvert', ecartDeclare(D, 'FAIL', [slop(crayon, visage)]) === null],
          ['un second oracle en échec n\'est pas couvert', ecartDeclare(D, 'FAIL', [slop(crayon), { oracle: 'oracle-tokens', verdict: 'FAIL', findings: [] }]) === null],
          ['une autre règle d\'oracle-slop n\'est pas couverte', ecartDeclare(D, 'FAIL', [{ oracle: 'oracle-slop', verdict: 'FAIL', findings: [{ sev: 'majeur', regle: 'S3', msg: `police « ${crayon} »` }] }]) === null],
          ['un autre canevas n\'est pas couvert', ecartDeclare('flux-temporel', 'FAIL', [slop(crayon)]) === null],
          ['un PASS n\'est pas un écart', ecartDeclare(D, 'PASS', []) === null],
        ];
        const fautes = cas.filter(([, vrai]) => !vrai).map(([nom]) => nom);
        fautes.length
          ? ko('écart déclaré (TF-2533) : ' + fautes.join(' | '))
          : ok('écart déclaré (TF-2533) · sens vert : « ✎ » seul sous oracle-slop S6 est couvert ; sens rouges : un autre emoji, « ✎ » avec un autre emoji, un second oracle en échec, une autre règle, un autre canevas et un PASS ne le sont pas');
      }
      const canevas = ['flux-temporel', 'topologie', 'tableau-de-bord', 'schema-differentiel', 'modele-donnees'];
      const travaux = canevas.map((c) => ({ nom: c, attendu: 'PASS', fichier: ecrire('rendu-' + c + '.html', instancier(c)) }));
      // sens rouge : le flux temporel sans ses déclarations par paire (data-overlap-ok) échoue pour V4
      const flux = instancier('flux-temporel');
      const sansPaires = flux.replace(/ data-overlap-ok="[^"]*"/g, '');
      if (sansPaires === flux) ko('sens rouge · le flux temporel ne porte plus de data-overlap-ok : la mutation ne s\'applique plus');
      else travaux.push({ nom: 'flux-temporel sans data-overlap-ok', attendu: 'FAIL', regle: 'V4', fichier: ecrire('rouge-flux-sans-paires.html', sansPaires) });
      // sens rouge (TF-2533) : l'écart déclaré ne couvre QUE « ✎ » — le même gabarit avec un vrai emoji en plus reste refusé
      const differentiel = instancier('schema-differentiel');
      const avecEmoji = differentiel.replace('colonne corrigée</span>', 'colonne corrigée \u{1F642}</span>');
      if (avecEmoji === differentiel) ko('sens rouge · le gabarit différentiel ne porte plus « colonne corrigée</span> » : la mutation ne s\'applique plus');
      else travaux.push({ nom: 'schema-differentiel avec un emoji non déclaré', attendu: 'EMOJI', fichier: ecrire('rouge-differentiel-emoji.html', avecEmoji) });
      const resultats = new Array(travaux.length);
      let suivant = 0;
      await Promise.all([0, 1, 2].map(async () => {
        while (suivant < travaux.length) {
          const i = suivant++;
          const r = await lancerAsync('node', [DESIGN, travaux[i].fichier, '--rendu', '--json-only'], 900000);
          let j = null; try { j = JSON.parse(r.stdout); } catch { /* illisible : verdict inconnu */ }
          resultats[i] = j;
        }
      }));
      travaux.forEach((t, i) => {
        const j = resultats[i];
        const verdict = j ? j.verdict : '?';
        const echoues = j ? j.oracles.filter((o) => o.verdict === 'FAIL') : [];
        const resume = echoues.map((o) => o.oracle + ' ' + [...new Set((o.findings || []).filter((f) => ['majeur', 'bloquant', 'critique'].includes(f.sev || f.severite)).map((f) => f.regle))].join('/')).join(' · ');
        if (t.attendu === 'PASS') {
          const ecart = ecartDeclare(t.nom, verdict, j && j.oracles);
          if (verdict === 'PASS') {
            ok('gabarit ' + t.nom + ' · instance tel quel : run-oracles-design --rendu PASS sur ' + j.oracles.length + ' oracle(s), dont render_page aux deux thèmes'
              + (ECARTS_DECLARES[t.nom] ? ' — ÉCART DÉCLARÉ PÉRIMÉ : l\'oracle ne refuse plus ce gabarit, retirer ECARTS_DECLARES[\'' + t.nom + '\']' : ''));
          } else if (ecart) {
            ok('gabarit ' + t.nom + ' · instance tel quel : run-oracles-design --rendu ' + verdict + ' — ÉCART DÉCLARÉ (TF-2533) : ' + resume + ' ; ' + ecart + ' ; tout autre échec resterait refusé');
          } else ko('gabarit ' + t.nom + ' · instance tel quel : run-oracles-design --rendu ' + verdict + ' — ' + resume);
        } else if (t.attendu === 'EMOJI') {
          const slop = j ? j.oracles.find((o) => o.oracle === 'oracle-slop') : null;
          const vu = !!slop && (slop.findings || []).some((f) => f.regle === 'S6' && /\u{1F642}/u.test(f.msg || f.message || ''));
          const couvert = !!j && !!ecartDeclare('schema-differentiel', verdict, j.oracles);
          (verdict === 'FAIL' && vu && !couvert)
            ? ok('sens rouge · ' + t.nom + ' : oracle-slop S6 refuse l\'emoji ajouté et l\'écart déclaré de « ✎ » ne le couvre pas')
            : ko('sens rouge · ' + t.nom + ' : l\'emoji ajouté n\'est pas refusé comme attendu (verdict ' + verdict + ', S6 vu ' + vu + ', couvert par l\'écart déclaré ' + couvert + ')');
        } else {
          const rp = j ? j.oracles.find((o) => o.oracle.startsWith('render_page')) : null;
          (verdict === 'FAIL' && rp && (rp.findings || []).some((f) => f.regle === t.regle))
            ? ok('sens rouge · ' + t.nom + ' : run-oracles-design --rendu échoue pour ' + t.regle + ' (cadres qui contiennent leurs nœuds sans déclaration par paire)')
            : ko('sens rouge · ' + t.nom + ' n\'échoue pas pour ' + t.regle + ' (verdict ' + verdict + ' ' + resume + ')');
        }
      });
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

for (const m of oks) console.log('  ✅ ' + m);
for (const m of skips) console.log('  ⏭  SKIP — ' + m);
for (const m of kos) console.log('  ❌ ' + m);
console.log('');
if (kos.length) { console.log(`❌ FAIL (${kos.length} échec(s), ${oks.length} vert(s), ${skips.length} non joué(s))`); process.exit(1); }
console.log(`✅ PASS (${oks.length} contrôles${skips.length ? ', ' + skips.length + ' non joué(s), dit(s) ci-dessus' : ''})`);
