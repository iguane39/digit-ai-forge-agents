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
// CE QU'ELLE NE JUGE PAS : les quatre gabarits-fragments (topologie, flux temporel, tableau de bord,
// schéma différentiel), qui s'insèrent dans le squelette du gabarit multi-bandes et se jugent dans la page
// hôte ; le canevas du modèle de données ; la lecture humaine du rendu (capture à ouvrir).
//
// Un outil absent du poste (page-html, forge-design, Python, Playwright) rend un SKIP NOMMÉ, jamais un vert.
//
// Usage : node scripts/self-test.mjs [--rapide]   (--rapide : n'ouvre pas l'exemple de référence dans le
//         navigateur, ~4 min ; le SKIP est dit au bilan). Exit 0 = PASS, 1 = FAIL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

for (const m of oks) console.log('  ✅ ' + m);
for (const m of skips) console.log('  ⏭  SKIP — ' + m);
for (const m of kos) console.log('  ❌ ' + m);
console.log('');
if (kos.length) { console.log(`❌ FAIL (${kos.length} échec(s), ${oks.length} vert(s), ${skips.length} non joué(s))`); process.exit(1); }
console.log(`✅ PASS (${oks.length} contrôles${skips.length ? ', ' + skips.length + ' non joué(s), dit(s) ci-dessus' : ''})`);
