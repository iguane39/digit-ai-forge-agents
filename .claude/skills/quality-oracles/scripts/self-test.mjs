#!/usr/bin/env node
// self-test — oracle du skill sur LUI-MÊME (et sur les autres skills installés).
// Vérifie : (1) frontmatter de chaque SKILL.md — champ `name` présent, `description`
// ≤ 1024 caractères (règle d'import qui a déjà fait échouer une version) ; (2) le
// registre JSON parse ; (3) chaque oracle CLI (.mjs) du registre existe et compile
// (`node --check`). exit 0 = PASS, 1 = FAIL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePython } from './lib/python.mjs';

const SKILLDIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLSROOT = path.resolve(SKILLDIR, '..');
const fails = [], oks = [];
const ok = m => oks.push(m);
const ko = m => fails.push(m);

// --- extraction du champ description d'un frontmatter YAML (folded > / | / inline / quoted) ---
function frontmatter(txt) {
  // CRLF toléré : un SKILL.md servi en CRLF (poste Windows, core.autocrlf, skill tiers)
  // porte un frontmatter parfaitement valide ; sans normalisation le `\r` résiduel reste
  // collé en fin de ligne et `name`/`description` étaient déclarés absents à tort.
  // On normalise la lecture — aucun contrôle n'est assoupli.
  txt = txt.replace(/\r\n/g, '\n');
  const m = txt.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const lines = m[1].split('\n');
  const fm = { name: null, description: null };
  for (let i = 0; i < lines.length; i++) {
    const mn = lines[i].match(/^name:\s*(.*)$/); if (mn) fm.name = mn[1].trim().replace(/^["']|["']$/g, '');
    const md = lines[i].match(/^description:\s*(.*)$/);
    if (md) {
      let v = md[1].trim();
      if (v === '>' || v === '|' || v === '>-' || v === '|-') {
        const buf = [];
        for (let j = i + 1; j < lines.length; j++) { if (/^\S/.test(lines[j])) break; buf.push(lines[j].trim()); }
        fm.description = buf.filter(Boolean).join(v[0] === '|' ? '\n' : ' ');
      } else fm.description = v.replace(/^["']|["']$/g, '');
    }
  }
  return fm;
}

// (1) frontmatter de tous les skills installés
for (const d of fs.readdirSync(SKILLSROOT, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const sf = path.join(SKILLSROOT, d.name, 'SKILL.md');
  if (!fs.existsSync(sf)) continue;
  const fm = frontmatter(fs.readFileSync(sf, 'utf8'));
  if (!fm) { ko(`${d.name} : frontmatter illisible`); continue; }
  if (!fm.name) ko(`${d.name} : champ 'name' absent`);
  if (fm.description == null) ko(`${d.name} : champ 'description' absent`);
  else if (fm.description.length > 1024) ko(`${d.name} : description ${fm.description.length} > 1024 caractères`);
  else ok(`${d.name} : frontmatter OK (description ${fm.description.length}/1024)`);
}

// (2) registre JSON
let reg = null;
try { reg = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'references', 'registre-oracles.json'), 'utf8')); ok('registre-oracles.json : JSON valide (' + reg.oracles.length + ' oracles)'); }
catch (e) { ko('registre-oracles.json illisible : ' + e.message); }

// (2b) référentiel R1-R10 : source de vérité présente et non vide (règles canoniques d'audit des oracles)
const reglesPath = path.join(SKILLDIR, 'references', 'regles-oracles.md');
if (!fs.existsSync(reglesPath)) ko('regles-oracles.md absent (référentiel R1-R10 — source de vérité des audits d\'oracles)');
else {
  const t = fs.readFileSync(reglesPath, 'utf8');
  const missing = Array.from({ length: 10 }, (_, i) => 'R' + (i + 1) + '.').filter(r => !t.includes(r));
  missing.length ? ko('regles-oracles.md incomplet : règles manquantes ' + missing.join(' ')) : ok('regles-oracles.md : référentiel R1-R10 complet');
}

// (3) oracles CLI : script présent + compile (.mjs via node --check, .py via py_compile)
const have = c => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }).status === 0;
if (reg) for (const o of reg.oracles) {
  if (o.type !== 'cli' || !o.cmd) continue;
  const script = o.cmd.find(x => /\.(mjs|py)$/.test(x));
  if (!script) continue;
  const p = script.replace('{skilldir}', SKILLDIR).replace('{skillsroot}', SKILLSROOT);
  const base = path.basename(p);
  if (!fs.existsSync(p)) { ko('oracle absent : ' + base); continue; }
  if (!p.startsWith(SKILLDIR)) { ok('oracle délégué présent : ' + base); continue; }   // ex. render_page.py (autre skill)
  if (p.endsWith('.mjs')) {
    const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    r.status === 0 ? ok('oracle compile : ' + base) : ko('oracle ne compile pas : ' + base + ' — ' + (r.stderr || '').split('\n')[0]);
  } else {
    const py = resolvePython(); // portable Windows/Unix, esquive l'alias Store (cf. lib/python.mjs)
    if (!py) { ok('oracle .py présent (python absent — compile non vérifié) : ' + base); continue; }
    const r = spawnSync(py[0], [...py.slice(1), '-m', 'py_compile', p], { encoding: 'utf8' });
    r.status === 0 ? ok('oracle compile (py) : ' + base) : ko('oracle .py ne compile pas : ' + base + ' — ' + (r.stderr || '').split('\n')[0]);
  }
}

// (3b) présence effective des délégués : le registre ne doit jamais contredire l'environnement.
// statut ok + skill absent → ko (délégation déclarée opérante mais inopérante) ;
// statut todo + skill PRÉSENT → ko (registre périmé : la délégation existe mais reste ignorée) ;
// type kit → externe par conception : informatif seulement, jamais ko sur absence.
if (reg) for (const o of reg.oracles) {
  if (o.type === 'kit') { ok('kit externe (présence non exigée) : ' + o.domaine); continue; }
  if (o.type !== 'skill' || !o.skill) continue;
  const present = fs.existsSync(path.join(SKILLSROOT, o.skill, 'SKILL.md'));
  if (o.statut === 'ok' && !present) ko(`délégué déclaré ok mais absent de l'environnement : ${o.skill} (${o.domaine})`);
  else if (['todo', 'manuel'].includes(o.statut) && present) ko(`délégué présent mais marqué ${o.statut} — registre périmé : ${o.skill} (${o.domaine})`);
  else ok(`délégué cohérent registre↔environnement : ${o.skill} (${o.statut}${present ? ', présent' : ', absent assumé'})`);
}

// (4) couverture du registre (gouvernance)
if (reg) {
  const by = {}; reg.oracles.forEach(o => by[o.statut] = (by[o.statut] || 0) + 1);
  ok('couverture registre : ' + Object.entries(by).map(([k, v]) => k + '=' + v).join(' · '));
  const gaps = reg.oracles.filter(o => ['todo', 'manuel'].includes(o.statut)).map(o => o.domaine);
  if (gaps.length) ok('domaines sans oracle automatique (règle §4 si rencontrés) : ' + gaps.join(' ; '));
}

// (4b) C1 — profils : JSON valides, generique + digit-ai présents
const profDir = path.join(SKILLDIR, 'profils');
if (!fs.existsSync(profDir)) ko('profils/ absent (C1 — politiques contextuelles)');
else for (const need of ['generique.json', 'digit-ai.json']) {
  const pp = path.join(profDir, need);
  if (!fs.existsSync(pp)) { ko('profil manquant : ' + need); continue; }
  try { const pj = JSON.parse(fs.readFileSync(pp, 'utf8')); ok('profil valide : ' + need + ' (' + (pj.nom || '?') + ')'); }
  catch (e) { ko('profil illisible : ' + need + ' — ' + e.message); }
}
// (4d) §6 — niveaux d'exigence : sections valides, plancher jamais exclu, preuve comportementale
const PLANCHER = ['Format / livraison / versioning', 'Sécurité / secrets', 'Calculs / chiffres', 'Traçabilité des affirmations chiffrées'];
if (fs.existsSync(profDir)) for (const pf of fs.readdirSync(profDir).filter(f => f.endsWith('.json'))) {
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(profDir, pf), 'utf8'));
    if (!pj.niveaux) { ko('profil sans section niveaux (§6) : ' + pf); continue; }
    const bad = [];
    for (const [niv, cfg] of Object.entries(pj.niveaux)) for (const d of (cfg.exclus || [])) if (PLANCHER.includes(d)) bad.push(niv + ':' + d);
    bad.length ? ko('profil ' + pf + ' : plancher non désactivable exclu — ' + bad.join(' ; ')) : ok('profil ' + pf + ' : niveaux valides, plancher respecté (' + Object.keys(pj.niveaux).join('/') + ')');
  } catch {}
}
// TF-0437 (lot Produit-05 20260820b) : oracle-perf publie le compte DOM en DEUX temps — total et hors
// zones repliées/citées. Preuve : une page dont la moitié des nœuds vit dans <pre>/<details>
// rend elements_hors_zones < elements, et le message le dit.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-perf2-'));
  const riche = '<!doctype html><html><head><title>t</title></head><body>' + '<p><b>x</b></p>'.repeat(20)
    + '<details><summary>src</summary><pre data-cite>' + '<span>c</span>'.repeat(60) + '</pre></details></body></html>';
  fs.writeFileSync(path.join(tmp, 'riche.html'), riche);
  const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-perf.mjs'), path.join(tmp, 'riche.html')], { encoding: 'utf8' });
  let j = null; try { j = JSON.parse(r.stdout); } catch {}
  const m = j && j.metriques;
  !m ? ko('TF-0437 : oracle-perf sans métriques lisibles')
    : !(m.elements_hors_zones_repliees_citees < m.elements) ? ko(`TF-0437 : compte hors zones (${m.elements_hors_zones_repliees_citees}) non inférieur au total (${m.elements})`)
      : !/hors zones/.test(JSON.stringify(j.findings)) ? ko('TF-0437 : le message ne publie pas le compte hors zones')
        : ok('TF-0437 : oracle-perf publie le DOM en deux temps (total / hors zones repliées-citées)');
  fs.rmSync(tmp, { recursive: true, force: true });
}
// TF-0428 (lot Produit-05 20260820a) : sous un arbre de LIVRAISON (output/, old/, dist/), run-oracles
// n'écrit AUCUN sidecar à côté du livrable — journaux dans un dossier frère _oracles/.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-liv-'));
  const livraison = path.join(tmp, 'output', 'rapport');
  fs.mkdirSync(livraison, { recursive: true });
  const page = path.join(livraison, 'Client - Rapport - 20260821a.html');
  fs.writeFileSync(page, '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Digit-AI — Rapport · test — 20260821a</title></head><body><h1>x</h1></body></html>');
  spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), page, '--no-cache', '--json', '--profil', path.join(SKILLDIR, 'fixtures', 'profil-test-niveaux.json')], { encoding: 'utf8', timeout: 180000 });
  // TF-0501 (22/08/2026) : ce controle jugeait l'IMPLEMENTATION (« les journaux sont dans
  // _oracles/ ») et non l'intention. Il passait donc au vert alors que `_oracles/` vivait SOUS
  // l'arbre livre — un controle qui decrit le code au lieu de l'exigence confirme le defaut.
  // Il juge maintenant les deux moities de l'exigence : rien sous output/, et la trace existe.
  const sousLivre = [];
  (function scan(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name); e.isDirectory() ? scan(p) : sousLivre.push(path.relative(path.join(tmp, 'output'), p));
  } })(path.join(tmp, 'output'));
  const traces = sousLivre.filter(f => /\.oracles/.test(f));
  const journal = path.join(tmp, '.oracles', 'output', 'rapport', path.basename(page) + '.oracles.json');
  traces.length ? ko(`TF-0428/0501 : ${traces.length} trace(s) d'audit SOUS output/ : ${traces.join(', ')} — c'est ce que le client recoit`)
    : !fs.existsSync(journal) ? ko("TF-0428/0501 : aucun journal hors de l'arbre — les sidecars ont disparu au lieu d'etre deplaces")
      : ok("TF-0428/0501 : sous output/, aucune trace d'audit chez le client, et le journal existe au-dessus du segment de livraison");
  fs.rmSync(tmp, { recursive: true, force: true });
}
// TF-0484 (lot v2-architecture-cible, 22/08) — LE LANCEUR JOUÉ DE BOUT EN BOUT, SANS `--json`.
// La ligne qui ANNONÇAIT le correctif TF-0428 référençait une variable inexistante (`JSON_OUT`
// au lieu de `JSONOUT`) et levait une ReferenceError APRÈS l'écriture du journal, mais AVANT le
// calcul du code de sortie : le journal portait `"verdict": "PASS"` et le processus sortait en 1.
// Le hook d'écriture refusait alors TOUTE écriture surveillée, quel que soit le verdict réel.
//
// Pourquoi aucune recette ne l'attrapait, et c'est l'enseignement : toutes lançaient le lanceur
// avec `--json`, et la ligne fautive était dans la branche `!JSONOUT`. UN CHEMIN DE SORTIE NON
// JOUÉ N'EST PAS UN CHEMIN TESTÉ. Cette recette joue donc la sortie TERMINAL, celle qu'un humain
// et le hook d'écriture empruntent réellement — le code est corrigé depuis 9039944, il n'était
// couvert par rien.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-e2e-'));
  const livraison = path.join(tmp, 'output');
  fs.mkdirSync(livraison, { recursive: true });
  const cible = path.join(livraison, 'note.md');
  fs.writeFileSync(cible, '# Note\n\nUne phrase simple, sans chiffre ni secret.\n', 'utf8');
  const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), cible, '--no-cache'], { encoding: 'utf8', timeout: 180000 });
  const sortie = (r.stdout || '') + (r.stderr || '');
  /ReferenceError|is not defined/.test(sortie) ? ko('TF-0484 : le lanceur lève une ReferenceError sur le chemin terminal — ' + (sortie.split('\n').find(l => /ReferenceError/.test(l)) || ''))
    : r.status !== 0 ? ko(`TF-0484 : exit ${r.status} sur une cible conforme — un PASS qui sort en échec bloque le hook d'écriture`)
      : !/CONFORME/.test(sortie) ? ko('TF-0484 : le bilan CONFORME / NON CONFORME n\'est jamais imprimé sur le chemin terminal')
        : !/Journal\s*:/.test(sortie) ? ko('TF-0484 : le chemin du journal n\'est pas dit à l\'humain')
          : ok('TF-0484 : lanceur joué SANS --json — exit 0, bilan imprimé, chemin du journal dit');
  fs.rmSync(tmp, { recursive: true, force: true });
}
// preuve comportementale : perf-red.html non jugé en niveau note (perf exclu), FAIL en production
{
  // tmpdir du POSTE, jamais fixtures/ : un process tué en plein run y fuyait ses dossiers
  // .tmp-niv-* (24 résidus constatés, TF-0068) — hors dépôt, une fuite est sans victime.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-niv-'));
  try {
    fs.copyFileSync(path.join(SKILLDIR, 'fixtures', 'perf-red.html'), path.join(tmp, 'perf-red.html'));
    // TF-0515 (22/08/2026) — CE CONTRÔLE PILOTE UN NAVIGATEUR SANS TÊTE, ET IL EN PAYAIT LE
    // PRIX EN SILENCE. La preuve des niveaux lance `run-oracles` deux fois sur une fixture de
    // performance ; l'oracle de perf ouvre un navigateur. Sur un poste chargé — 184 processus
    // de navigateur mesurés le 22/08 — le lanceur dépasse ses 180 s, est tué, et sa sortie JSON
    // est tronquée. Le message rendu était alors « run-oracles --json inexploitable » : un
    // message qui ACCUSE LE FORMAT quand la cause est la DURÉE. Le diagnostic a coûté de
    // rejouer la commande avec le code d'origine pour écarter une régression.
    //
    // Un contrôle qui échoue selon la charge du poste est un contrôle qu'on apprend à ignorer —
    // c'est nommément ce que R-33 bis existe pour empêcher. Deux corrections, aucune indulgence :
    //   1. l'indisponibilité se DÉCLARE au lieu d'échouer, sur le modèle des SKIP motivés
    //      d'oracle-sca : un outil externe absent ou trop lent n'est pas un défaut du code ;
    //   2. le message DISTINGUE les deux causes. Un délai dépassé et un JSON illisible ne se
    //      réparent pas de la même façon, et les confondre a coûté la moitié du diagnostic.
    const TIMEOUT_NIVEAUX = 180000;
    const run = niv => spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), tmp, '--niveau', niv, '--no-cache', '--json', '--profil', path.join(SKILLDIR, 'fixtures', 'profil-test-niveaux.json')], { encoding: 'utf8', timeout: TIMEOUT_NIVEAUX });
    const parse = r => { try { return JSON.parse((r.stdout || '').trim()); } catch { return null; } };
    const rNote = run('note'), rProd = run('production');
    // `spawnSync` pose `error.code === 'ETIMEDOUT'` et un signal quand il tue le processus :
    // c'est la seule façon fiable de distinguer « trop lent » de « sortie fautive ».
    const tue = r => (r.error && r.error.code === 'ETIMEDOUT') || r.signal !== null;
    if (tue(rNote) || tue(rProd)) {
      ok(`§6 niveaux : SKIP motivé — le navigateur sans tête dépasse ${TIMEOUT_NIVEAUX / 1000} s sur ce poste ` +
         "(oracle de performance indisponible, pas un défaut du code). Rejouer sur un poste au repos (TF-0515)");
    } else {
      const jNote = parse(rNote), jProd = parse(rProd);
      const perfNote = jNote && jNote.resultats.some(x => x.domaine === 'Performance / poids');
      const perfProd = jProd && jProd.resultats.some(x => x.domaine === 'Performance / poids' && x.verdict === 'FAIL');
      !jNote || !jProd ? ko('§6 : sortie JSON de run-oracles ILLISIBLE — et non un délai dépassé, le processus a rendu la main : ' +
        ((rNote.stdout || rProd.stdout || '').slice(0, 120) || '(sortie vide)'))
        : perfNote ? ko('§6 : domaine exclu au niveau note pourtant jugé (perf)')
          : !perfProd ? ko('§6 : perf-red non FAIL au niveau production')
            : ok('§6 niveaux : perf exclu en note, FAIL en production (preuve comportementale)');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// (4c-lib) modules partagés scripts/lib/ : compilent (source unique num/tables/claims-extract)
const libDir = path.join(SKILLDIR, 'scripts', 'lib');
if (fs.existsSync(libDir)) for (const s of fs.readdirSync(libDir).filter(f => f.endsWith('.mjs'))) {
  const r = spawnSync(process.execPath, ['--check', path.join(libDir, s)], { encoding: 'utf8' });
  r.status === 0 ? ok('lib compile : ' + s) : ko('lib ne compile pas : ' + s + ' — ' + (r.stderr || '').split('\n')[0]);
}

// (4c) scripts utilitaires (bootstrap, report-couverture) : compilent
for (const s of ['bootstrap.mjs', 'report-couverture.mjs']) {
  const sp = path.join(SKILLDIR, 'scripts', s);
  if (!fs.existsSync(sp)) { ko('script utilitaire absent : ' + s); continue; }
  const r = spawnSync(process.execPath, ['--check', sp], { encoding: 'utf8' });
  r.status === 0 ? ok('utilitaire compile : ' + s) : ko('utilitaire ne compile pas : ' + s);
}

// (5) P1 — oracle de l'oracle : rejouer les fixtures rouge/verte du manifest.
// Un oracle n'est recevable que s'il ÉCHOUE sur le cas rouge et RÉUSSIT sur le cas vert
// (SKIP toléré uniquement pour les oracles déclarés dépendants d'un outil externe).
const manifestPath = path.join(SKILLDIR, 'fixtures', 'manifest.json');
if (!fs.existsSync(manifestPath)) ko('fixtures/manifest.json absent (P1 — chaque oracle doit prouver FAIL rouge / PASS verte)');
else {
  let man = null;
  try { man = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { ko('manifest.json illisible : ' + e.message); }
  if (man) for (const fx of man.fixtures) {
    for (const side of ['red', 'green']) {
      const fxFile = path.join(SKILLDIR, 'fixtures', fx[side]);
      if (!fs.existsSync(fxFile)) { ko(`fixture ${side} absente : ${fx[side]} (${fx.nom})`); continue; }
      // `{skillsroot}` accepté ici comme dans `run-oracles` et dans le contrôle de compilation
      // ci-dessus (02/09/2026) : un oracle hébergé par un skill VOISIN — cas d'`oracle-angles-vides`,
      // qui vit dans experts-forge — pouvait être enregistré mais pas prouvé par fixtures.
      let cmd = fx.cmd.map(s => s.replace('{skilldir}', SKILLDIR).replace('{skillsroot}', SKILLSROOT).replace('{fixture}', fxFile));
      // « python3 » du manifest est un nom Unix : sur ce poste on substitue l'interpréteur
      // réellement fonctionnel (esquive l'alias Store Windows) — cf. lib/python.mjs.
      if (cmd[0] === 'python3' || cmd[0] === 'python') {
        const pyFx = resolvePython();
        if (!pyFx) { ok(`fixture ${fx.nom}/${side} : SKIP toléré (python indisponible)`); continue; }
        cmd = [...pyFx, ...cmd.slice(1)];
      }
      const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 180000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      let v = null, sortie = null;
      try { sortie = JSON.parse((r.stdout || '').trim().match(/\{[\s\S]*\}/)[0]); v = sortie.verdict; } catch {}
      if (!v) v = r.status === 0 ? 'PASS' : r.status === 2 ? 'SKIP' : 'FAIL';
      const attendu = fx['attendu_' + side];

      // TF-0362 (18/08/2026) — le VERDICT seul ne verrouille pas une règle non bloquante.
      // Une fixture rouge qui échoue déjà sur une autre règle reste FAIL même si celle qu'on
      // voulait prouver disparaît : le self-test resterait vert sur un contrôle mort. Champ
      // optionnel `attendu_messages_<side>` : des fragments qui doivent APPARAÎTRE dans les
      // messages. Il n'est exigé de personne — mais toute règle en AVERTISSEMENT devrait
      // l'avoir, faute de quoi rien ne la tient.
      const fragments = fx['attendu_messages_' + side] || [];
      if (fragments.length) {
        // TOUS LES PORTEURS DE RAISON, PAS SEULEMENT `findings` (02/09/2026). Les oracles
        // délégués du socle HTML publient leurs constats dans `fails`/`warns` ; ne regarder que
        // `findings` rendait `attendu_messages` INAPPLICABLE à ces oracles-là — on croyait tenir
        // une règle, et le champ ne pouvait structurellement jamais la trouver. Même famille que
        // TF-0659, corrigée un cran plus bas dans la même passe : un contrôle qui cherche au seul
        // endroit qu'il connaît ne voit jamais ce qui vit ailleurs.
        const texte = JSON.stringify([sortie?.findings, sortie?.fails, sortie?.warns].filter(Boolean));
        const absents = fragments.filter(f => !texte.includes(f));
        if (absents.length) {
          ko(`fixture ${fx.nom}/${side} : message(s) attendu(s) ABSENT(S) — ${absents.join(' · ')} `
            + `(le verdict ${v} vient d'une autre règle : celle-ci n'est plus prouvée)`);
        } else {
          ok(`fixture ${fx.nom}/${side} : ${fragments.length} message(s) attendu(s) présent(s)`);
        }
      }
      if (!attendu.includes(v)) ko(`fixture ${fx.nom}/${side} : verdict ${v}, attendu ${attendu.join('|')} — l'oracle ne juge pas comme prouvé`);
      else if (v === 'SKIP') ok(`fixture ${fx.nom}/${side} : SKIP toléré (dépend de : ${fx.dependant_outil || 'outil externe'})`);
      else ok(`fixture ${fx.nom}/${side} : ${v} conforme`);
    }
  }
}

// preuve comportementale : empreinte du contenu jugé et péremption bloquante (TF-0478, verdict O2)
// Le fait fondateur, mesuré le 22/08/2026 : sur 2 journaux d'oracles confrontables à leur cible,
// 2 portaient un PASS rendu AVANT une modification de cette cible. Le hachage existait déjà dans
// le lanceur, mais servait la seule clé de cache — aucun verdict ne disait sur quel contenu il
// avait été rendu, et un CONFORME cité dans une restitution vieillissait en silence.
// Les quatre cas ci-dessous jouent les DEUX SENS sur la même cible : seul le contenu les sépare.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-empreinte-'));
  try {
    const cible = path.join(tmp, 'note.md');
    fs.writeFileSync(cible, '# Note\n\nUn contenu stable, jugé tel quel.\n', 'utf8');
    const lancer = (...extra) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'),
        cible, '--no-cache', '--json', ...extra], { encoding: 'utf8', timeout: 180000 });
      let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch {}
      return { j, code: r.status };
    };

    // (1) l'empreinte est SCELLÉE, au format existant, en sha256 complet, une par fichier du bilan
    const run = lancer();
    const e = run.j && run.j.empreinte;
    const nBilan = run.j ? Object.values(run.j.bilan_fichiers).reduce((a, l) => a + l.length, 0) : -1;
    !run.j ? ko('empreinte : run-oracles --json inexploitable')
      : !e ? ko('empreinte : aucune empreinte scellée sur une cible stable')
        : e.format !== 'forge-ops/empreinte@1' ? ko('empreinte : format « ' + e.format + ' » — le format existant se réutilise, il ne se réinvente pas (D1)')
          : Object.keys(e.fichiers).length !== nBilan ? ko('empreinte : ' + Object.keys(e.fichiers).length + ' fichier(s) empreinté(s) pour ' + nBilan + ' au bilan')
            : Object.values(e.fichiers).some(h => !/^[0-9a-f]{64}$/.test(h)) ? ko('empreinte : sha256 non complet — la troncature reste réservée à la clé de cache (D3)')
              : ok('empreinte scellée : forge-ops/empreinte@1, sha256 complet, une empreinte par fichier du bilan');

    // (2) sens VERT — rien n'a changé : le verdict porte toujours sur ce contenu, exit 0
    const frais = lancer('--verifier-empreinte');
    frais.code !== 0 ? ko('fraîcheur : exit ' + frais.code + ' sur une cible inchangée — un verdict frais doit passer')
      : (frais.j && frais.j.etat) !== 'FRAIS' ? ko('fraîcheur : état « ' + (frais.j && frais.j.etat) + ' » sur une cible inchangée')
        : ok('fraîcheur : cible inchangée → FRAIS, exit 0');

    // (3) sens ROUGE — le contenu a changé APRÈS le verdict : PÉRIMÉ, et il BLOQUE.
    // C'est l'arbitrage humain du 22/08 (option a1) : périmé bloque, il n'avertit pas. Sans lui,
    // le verdict précédent resterait citable alors qu'il ne porte plus sur rien de présent.
    fs.appendFileSync(cible, '\nUne ligne ajoutée après le verdict.\n', 'utf8');
    const perime = lancer('--verifier-empreinte');
    perime.code === 0 ? ko('péremption : exit 0 après modification — un verdict périmé doit BLOQUER (a1), pas avertir')
      : (perime.j && perime.j.etat) !== 'PERIME' ? ko('péremption : état « ' + (perime.j && perime.j.etat) + ' » alors que la cible a changé')
        : !(perime.j.fichiers_modifies || []).length ? ko('péremption : aucun fichier nommé — un refus qui ne dit pas QUOI a bougé ne se diagnostique pas')
          : ok('péremption bloquante : cible modifiée après le verdict → PERIME, exit ' + perime.code + ', fichier(s) nommé(s)');

    // (4) BORNE d'antériorité — un journal écrit AVANT ce mécanisme ne porte pas d'empreinte.
    // Il est DÉCLARÉ non jugeable, jamais mis en échec : un verdict ancien n'est pas un verdict
    // faux, et une règle neuve qui met l'existant en échec se fait désactiver dans la semaine.
    const jp = fs.readdirSync(tmp).find(f => f.endsWith('.oracles.json'));
    if (!jp) ko('antériorité : journal introuvable pour la borne');
    else {
      const p = path.join(tmp, jp);
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      delete j.empreinte; delete j.empreinte_motif;
      fs.writeFileSync(p, JSON.stringify(j), 'utf8');
      const vieux = lancer('--verifier-empreinte');
      vieux.code !== 2 ? ko('antériorité : exit ' + vieux.code + ' sur un verdict antérieur au mécanisme — attendu 2 (déclaré, jamais en échec)')
        : ok('antériorité : verdict sans empreinte → NON JUGEABLE, exit 2, jamais mis en échec');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// preuve comportementale : les journaux sortent REELLEMENT de l'arbre de livraison (TF-0501)
// Le fait fondateur : l'intention « ce que le client reçoit ne contient pas les traces de son
// audit » était écrite depuis TF-0428 et n'était pas tenue — `_oracles/` était un dossier ENFANT
// du dossier livré, et le message de fin annonçait « HORS livraison », ce qui rendait le défaut
// invisible en répondant d'avance à la question qu'on se serait posée. Mesuré chez un produit :
// dossier recréé à chaque écriture surveillée, supprimé à la main deux fois.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-livraison-'));
  try {
    const livre = path.join(tmp, 'output', 'rapport');
    fs.mkdirSync(livre, { recursive: true });
    const cible = path.join(livre, 'livrable.md');
    fs.writeFileSync(cible, '# Livrable\n\nContenu client.\n', 'utf8');
    const lancer = (...extra) => spawnSync(process.execPath,
      [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), cible, '--no-cache', ...extra],
      { encoding: 'utf8', timeout: 180000 });
    lancer();

    // (1) ce que le client reçoit ne contient QUE le livrable — la vraie question posée par l'item
    const sousOutput = [];
    (function scan(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name); e.isDirectory() ? scan(p) : sousOutput.push(path.relative(tmp, p));
    } })(path.join(tmp, 'output'));
    sousOutput.length !== 1 || !sousOutput[0].endsWith('livrable.md')
      ? ko('livraison : ' + sousOutput.length + ' fichier(s) sous output/ — ' + sousOutput.join(' · ') + ' ; le client ne doit recevoir que son livrable')
      : ok('livraison : output/ ne contient que le livrable, aucune trace d\'audit');

    // (2) le journal existe bel et bien, au-dessus du segment de livraison et pas ailleurs
    const attendu = path.join(tmp, '.oracles', 'output', 'rapport', 'livrable.md.oracles.json');
    !fs.existsSync(attendu) ? ko('livraison : journal introuvable à l\'emplacement attendu ' + attendu + ' — sortir de l\'arbre ne doit pas revenir à perdre la trace')
      : ok('livraison : journal écrit hors de l\'arbre, à un chemin déterministe qui rejoue l\'arborescence');

    // (3) et il reste retrouvable par le mode fraîcheur — un journal qu'on ne relit pas est perdu
    const v = lancer('--verifier-empreinte');
    v.status !== 0 ? ko('livraison : --verifier-empreinte ne retrouve pas le journal déplacé (exit ' + v.status + ')')
      : ok('livraison : --verifier-empreinte retrouve le journal à son nouvel emplacement');

    // (4) BORNE d'antériorité — un journal écrit AVANT TF-0501 vit dans l'ancien `_oracles/`.
    // Il est lu en repli plutôt que déclaré disparu : un verdict réel ne devient pas faux parce
    // que le code a change d'avis sur l'endroit où il l'écrit.
    const ancien = path.join(livre, '_oracles');
    fs.mkdirSync(ancien, { recursive: true });
    fs.renameSync(attendu, path.join(ancien, 'livrable.md.oracles.json'));
    fs.rmSync(path.join(tmp, '.oracles'), { recursive: true, force: true });
    const repli = lancer('--verifier-empreinte');
    repli.status !== 0 ? ko('livraison : journal d\'avant TF-0501 non lu en repli (exit ' + repli.status + ') — un verdict réel serait déclaré disparu')
      : ok('livraison : journal d\'avant TF-0501 lu en repli dans l\'ancien _oracles/, jamais réécrit');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// preuve comportementale : la garde des DEUX BORDS attrape une cible qui change PENDANT le run
// (TF-0497). Elle etait cablee depuis TF-0478 et joue par AUCUNE recette : la seule facon
// deterministe de faire bouger une cible en cours de run est d'y faire passer un oracle qui la
// mute, et rien ne permettait d'en injecter un. `--registre` (TF-0497) ouvre ce point d'entree.
// Ce que ce cas verrouille : un oracle rend PASS, et le verdict sort quand meme PERIME — sans la
// garde, le run rendrait un PASS parfaitement credible sur un contenu qui n'existe deja plus.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-toctou-'));
  try {
    const cible = path.join(tmp, 'note.md');
    fs.writeFileSync(cible, '# Note\n\nStable au depart.\n', 'utf8');
    const muteur = path.join(tmp, 'muteur.mjs');
    fs.writeFileSync(muteur, "import fs from 'node:fs';\n"
      + "fs.appendFileSync(process.argv[2], '\\nligne ajoutee PENDANT le run\\n', 'utf8');\n"
      + "console.log(JSON.stringify({ oracle: 'muteur', domaine: 'Recette TOCTOU', verdict: 'PASS', findings: [], non_juge: [] }));\n", 'utf8');
    const registre = path.join(tmp, 'registre.json');
    fs.writeFileSync(registre, JSON.stringify({ version: 'toctou-test', oracles: [
      { domaine: 'Recette TOCTOU', ext: ['.md'], type: 'cli', statut: 'ok',
        cmd: ['node', muteur.split(path.sep).join('/'), '{file}'], timeout_ms: 30000 },
    ] }), 'utf8');
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'),
      cible, '--no-cache', '--json', '--registre', registre], { encoding: 'utf8', timeout: 180000 });
    let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch {}

    !j ? ko('TOCTOU : run-oracles --json inexploitable sur le cas de mutation concurrente')
      : j.verdict !== 'PERIME' ? ko('TOCTOU : verdict ' + j.verdict + ' alors que la cible a change PENDANT le run')
        : r.status === 0 ? ko('TOCTOU : exit 0 — un verdict perime doit BLOQUER (arbitrage a1), pas avertir')
          : j.empreinte !== null ? ko('TOCTOU : une empreinte a ete scellee malgre la divergence (D6 : omise, jamais fausse)')
            : !/PERIME/.test(j.empreinte_motif || '') ? ko('TOCTOU : aucun motif ecrit — un refus muet ne se diagnostique pas')
              : j.verdict_oracles !== 'PASS' ? ko('TOCTOU : le verdict rendu par les oracles n\'est pas conserve — la trace de ce qui a ete juge est perdue')
                : ok('TOCTOU : cible mutee pendant le run → PERIME exit ' + r.status + ', empreinte omise avec motif, PASS des oracles conserve au journal');

    // BORNE — le meme registre sur une cible que rien ne mute doit rester PASS : la garde ne doit
    // pas transformer tout run en peremption, sinon elle serait desactivee dans la semaine.
    const muet = path.join(tmp, 'muet.mjs');
    fs.writeFileSync(muet, "console.log(JSON.stringify({ oracle: 'muet', domaine: 'Recette TOCTOU', verdict: 'PASS', findings: [], non_juge: [] }));\n", 'utf8');
    const reg2 = path.join(tmp, 'registre-muet.json');
    fs.writeFileSync(reg2, JSON.stringify({ version: 'toctou-test', oracles: [
      { domaine: 'Recette TOCTOU', ext: ['.md'], type: 'cli', statut: 'ok',
        cmd: ['node', muet.split(path.sep).join('/'), '{file}'], timeout_ms: 30000 },
    ] }), 'utf8');
    const r2 = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'),
      cible, '--no-cache', '--json', '--registre', reg2], { encoding: 'utf8', timeout: 180000 });
    let j2 = null; try { j2 = JSON.parse((r2.stdout || '').trim()); } catch {}
    !j2 ? ko('TOCTOU (borne) : run-oracles --json inexploitable')
      : j2.verdict === 'PERIME' ? ko('TOCTOU (borne) : PERIME sur une cible que rien ne mute — faux positif, la garde serait desactivee')
        : !j2.empreinte ? ko('TOCTOU (borne) : aucune empreinte scellee alors que rien n\'a bouge')
          : ok('TOCTOU (borne) : meme registre, cible non mutee → ' + j2.verdict + ' et empreinte scellee, aucun faux perime');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---- TF-0659 : UN FAIL NE SORT JAMAIS SANS SA RAISON -----------------------------------------
//
// LE FAIT, vecu de premiere main le 26/08/2026. Le hook a BLOQUE l'ecriture d'un document sur
// « [Lisibilite d'un document (Markdown)] », et le journal a porte {"verdict":"FAIL","detail":""}.
// La raison existait pourtant : l'oracle appele emet `fails: [...]`, une liste de CHAINES, quand
// ce runner n'allait chercher que `findings[].msg`. La raison etait PRODUITE, PUIS JETEE au
// passage du contrat.
//
// COUT : trois tours pour retrouver le registre, y lire la commande, et rejouer l'oracle a la
// main — apres quoi les neuf constats se sont affiches avec leur ligne et leur motif.
//
// Ce cas rejoue exactement ce scenario : un document qui echoue sur un oracle a contrat `fails`.
// Sans le correctif, `detail` revient vide et le cas rougit.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-detail-'));
  try {
    const doc = path.join(tmp, 'doc.md');
    fs.writeFileSync(doc,
      '# Doc\n\nUne phrase d ouverture correcte et assez longue pour dire ce que le lecteur va '
      + 'apprendre ici.\n\n## Chapitre\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', 'utf8');
    const r = spawnSync(process.execPath,
      [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), doc, '--no-cache', '--json'],
      { encoding: 'utf8', timeout: 180000 });
    let j = null;
    try { j = JSON.parse((r.stdout || '').slice((r.stdout || '').indexOf('{'))); } catch { /* rendu plus bas */ }
    const md = j && (j.resultats || []).find(x => /Markdown/i.test(x.domaine || ''));
    if (!j) ko('TF-0659 : run-oracles --json inexploitable');
    else if (!md) ko('TF-0659 : l oracle Markdown n a pas ete planifie — le cas ne mesure rien');
    else if (md.verdict !== 'FAIL') ko('TF-0659 : le document fautif ne fait pas echouer l oracle (' + md.verdict + ')');
    else if (!md.detail) ko('TF-0659 : FAIL rendu avec un detail VIDE — la raison est produite par l oracle puis jetee au passage du contrat');
    else ok('TF-0659 : un FAIL porte sa raison meme quand l oracle emet `fails[]` et non `findings[]` — ' + md.detail.slice(0, 60));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}


// TF-0784 (03/09/2026) — LE DÉPÔT LUI-MÊME EST L'ARTEFACT JUGÉ, et c'est le seul angle qui
// arrête le TROISIÈME skill. Les fixtures rouge/verte prouvent la RÈGLE de parité sur un socle de
// jeu d'essai ; elles ne diraient rien du jour où un skill de plus recopie un composant du socle
// réel. Le fait payé : `digit-ai-schemas` embarquait une copie manuelle de `table-filters.js`,
// corrigée sept fois sans qu'un seul correctif l'atteigne — dans CE dépôt, à deux dossiers des
// correctifs. Ce cas-ci rejoue l'oracle sur l'arborescence réelle des skills : toute copie neuve
// non déclarée, périmée ou retouchée fait rougir le banc, ici, à la passe suivante.
{
  const r = spawnSync(process.execPath,
    [path.join(SKILLDIR, 'scripts', 'oracle-parite-assets.mjs'), SKILLSROOT],
    { encoding: 'utf8', timeout: 180000 });
  let j = null;
  try { j = JSON.parse((r.stdout || '').trim()); } catch { /* rendu plus bas */ }
  if (!j) ko('TF-0784 : oracle-parite-assets inexploitable sur l arborescence des skills');
  else if (j.verdict === 'SKIP') ko('TF-0784 : oracle-parite-assets rend SKIP sur le dépôt — le socle digit-ai-page-html/assets est introuvable, rien n est mesuré');
  else if (j.verdict !== 'PASS') {
    for (const f of j.findings) ko(`TF-0784 parité d une copie du socle · ${f.regle} ${f.where} : ${f.msg.slice(0, 140)}`);
  } else ok('TF-0784 : toutes les copies d assets du socle embarquées dans les skills sont déclarées, scellées et à la parité — ' + j.findings[0].msg.slice(0, 120));
}

// TF-0820 (05/09/2026) — C5 : LA PORTE DE PUBLICATION JUGE AUSSI LES NOMS DE PRODUITS.
//
// LE FAIT PAYÉ : le 05/09, la passe de réécriture d'historique du pilot — dérivée des DEUX tables
// hors dépôt — a modifié deux fichiers de l'arbre courant d'une forge publique, alors que
// `oracle-nom-client-publie` rendait PASS sur la même branche. C1-C4 ne lisent que le référentiel
// des CLIENTS ; ce qu'une porte ne juge pas passe par construction.
//
// POURQUOI UN DÉPÔT JETABLE ET PAS UN BUNDLE COMMITÉ, comme les fixtures C1-C4 : une fixture
// commitée porterait un nom de produit — fût-il inventé — dans le dépôt que cette porte garde, et
// le premier lecteur ne saurait pas qu'il est inventé. Le dépôt se fabrique donc à la volée, la
// table de pseudonymes est jetable, et le nom qu'elle porte est INVENTÉ : aucun nom du parc ne
// s'écrit ici (même règle que le référentiel de jeu d'essai des fixtures C1-C4).
//
// TROIS CAS, ET LE TROISIÈME EST LA REPRODUCTION DU DÉFAUT : sans la table, le même dépôt porteur
// rend PASS — et l'oracle doit alors DIRE que C5 n'a pas été jouée. Un angle muet se lit comme un
// angle vert, et c'est exactement l'état dans lequel la porte a laissé passer les mentions du 05/09.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-c5-'));
  try {
    // NOM DE PRODUIT INVENTÉ, et c'est une règle : deux mots, assez long pour que ses VARIANTES de
    // graphie se dérivent (au moins 2 mots et 8 lettres, comme `todo/anonymiser-entrant.mjs`).
    const NOM = 'PortailBidule-Machin';
    const PSEUDO = 'Produit-99';
    const tables = path.join(tmp, 'tables');
    fs.mkdirSync(tables);
    const tProduits = path.join(tables, '_produits-pseudonymes.json');
    const tClients = path.join(tables, '_noms-interdits.json');
    // La clé de CHEMIN est là exprès : elle doit être ignorée, un chemin de disque n'est pas un nom.
    fs.writeFileSync(tProduits, JSON.stringify({ produits: { [NOM]: PSEUDO, 'C:/dev/un-chemin-de-disque': 'Produit-98' } }), 'utf8');
    fs.writeFileSync(tClients, JSON.stringify({ noms: ['Zorglub'], identifiants: [], sigles: [] }), 'utf8');

    // Les dépôts vivent SOUS UN AUTRE PARENT que les tables : sans cela, la résolution par voisinage
    // (`<dossier>/..`) retrouverait la table même quand le cas veut l'absence, et le cas rouge de
    // l'absence mesurerait le contraire de ce qu'il croit.
    const depots = path.join(tmp, 'depots');
    fs.mkdirSync(depots);
    const batir = (nom, lignes) => {
      const r = path.join(depots, nom);
      fs.mkdirSync(r);
      fs.writeFileSync(path.join(r, 'outil.py'), lignes.join('\n') + '\n', 'utf8');
      const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
      g('init', '-q');
      g('config', 'user.email', 'banc@local');
      g('config', 'user.name', 'banc');
      g('add', '-A');
      g('commit', '-q', '-m', 'outil du connecteur');
      return r;
    };
    // Le rouge porte la clé TELLE QUELLE **et** une variante de graphie (espaces, minuscules) :
    // une table qui n'énumère qu'une graphie ne protège que cette graphie (TF-0742).
    const rouge = batir('rouge', [
      `# TODO : brancher le connecteur de ${NOM}`,
      '# egalement ecrit « portail bidule machin » en toutes lettres dans cette docstring',
    ]);
    const vert = batir('vert', [
      `# TODO : brancher le connecteur de ${PSEUDO}`,
      '# egalement ecrit « le produit » en toutes lettres dans cette docstring',
    ]);

    // L'ENVIRONNEMENT EST NEUTRALISÉ : une variable héritée du poste ferait lire la table RÉELLE, et
    // le banc mesurerait le parc au lieu de mesurer la règle.
    //
    // FORGE_ROOT N'EST PLUS SUPPRIMÉE, ELLE EST POSÉE SUR LA RACINE JETABLE (TF-0887, 08/09/2026).
    // Depuis que la porte cherche le canal confidentiel dans ses pistes par défaut, une racine NON
    // déclarée la fait deviner deux racines — le parent du dépôt jugé, puis le parent de la forge.
    // Sur un poste où le canal est cloné, la seconde atteint la table RÉELLE : le cas « C5 absente »
    // aurait trouvé une table et mesuré exactement le contraire de ce qu'il croit. Déclarer la
    // racine jetable ferme l'échelle sur le banc — c'est précisément à quoi sert la marche
    // FORGE_ROOT, et c'est ce qui rend l'ABSENCE d'une table prouvable ailleurs que sur une machine
    // vierge.
    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const jouer = (repo, avecTable) => {
      const a = [path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo, '--referentiel=' + tClients];
      if (avecTable) a.push('--produits=' + tProduits);
      const r = spawnSync(process.execPath, a, { encoding: 'utf8', timeout: 180000, env: envNu });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };

    const jr = jouer(rouge, true);
    const c5 = jr ? (jr.findings || []).filter(f => f.regle === 'C5') : [];
    if (!jr) ko('TF-0820 C5 rouge : sortie de l oracle inexploitable');
    else if (jr.verdict !== 'FAIL') ko(`TF-0820 C5 rouge : un nom de produit en commentaire ne fait pas échouer la porte (${jr.verdict})`);
    else if (c5.length < 2) ko(`TF-0820 C5 rouge : ${c5.length} constat(s) C5 — la graphie littérale et sa VARIANTE espacée devaient être vues toutes les deux`);
    else if (!c5.every(f => f.sev && f.msg && f.where)) ko('TF-0820 C5 rouge : un constat C5 ne porte pas le contrat findings[] (sev, msg, where)');
    else ok(`TF-0820 C5 rouge : nom de produit en commentaire → FAIL, ${c5.length} constat(s) C5 localisés (graphie littérale + variante espacée)`);

    const jv = jouer(vert, true);
    if (!jv) ko('TF-0820 C5 verte : sortie de l oracle inexploitable');
    else if (jv.verdict !== 'PASS') ko(`TF-0820 C5 verte : le PSEUDONYME seul fait échouer la porte (${jv.verdict}) — ${(jv.findings || []).map(f => f.regle + ' ' + f.where).join(', ')}`);
    else if (!/table des produits employée/.test((jv.non_juge || []).join(' '))) ko('TF-0820 C5 verte : la table employée n est pas déclarée au non_juge');
    else ok('TF-0820 C5 verte : le pseudonyme seul → PASS, et la table employée est nommée au non_juge (C5 jouée, pas devinée)');

    const jsans = jouer(rouge, false);
    if (!jsans) ko('TF-0820 C5 absente : sortie de l oracle inexploitable');
    else if (jsans.verdict !== 'PASS') ko(`TF-0820 C5 absente : l oracle ne rend plus PASS sur C1-C4 faute de la SECONDE table (${jsans.verdict}) — une table de produits absente ne doit pas éteindre la porte entière`);
    else if (!/C5 NON JOUÉE : table absente/.test((jsans.non_juge || []).join(' '))) ko('TF-0820 C5 absente : l angle est ÉTEINT EN SILENCE — un angle muet se lit comme un angle vert, et c est le défaut du 05/09');
    else ok('TF-0820 C5 absente : le même dépôt porteur rend PASS sur C1-C4, et l oracle DÉCLARE « C5 non jouée : table absente » — jamais tue');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-0824 (06/09/2026) — LE CONTRAT DE SORTIE DU LANCEUR EST ÉPROUVÉ, PAS SEULEMENT ÉCRIT.
//
// LE FAIT PAYÉ : le champ `detail` d'une ligne de résultat a changé DEUX FOIS en dix jours — sa
// source de raisons le 26/08 (TF-0659), son en-tête « <n> constat(s) · » le 05/09 (TF-0815) — sans
// qu'aucun document ne dise ce qu'il contient ni ne porte de version qu'un lecteur puisse
// surveiller. Le lanceur est hérité par toutes les forges, et le hook d'écriture identifie un
// constat PAR CETTE LIGNE : une troisième mutation silencieuse se découvrirait en bloquant.
//
// CE QUE CE CAS ÉPROUVE, et pourquoi il ne recopie pas la forme : l'expression opposable est LUE
// dans `references/contrat-sortie-runner.md` (§2.4), jamais dupliquée ici. Une forme changée d'un
// côté seulement fait rougir le banc, quel que soit le côté. Trois contrôles :
//   (1) le document existe, porte une VERSION et les DEUX changements datés ;
//   (2) VERT — la ligne réellement rendue par le lanceur sur une fixture fautive passe la forme ;
//   (3) ROUGE — la MÊME ligne privée de son en-tête de compte, c'est-à-dire la ligne telle qu'elle
//       se rendait avant le 05/09, est REFUSÉE. Sans ce troisième contrôle, la forme pourrait être
//       vraie et sans dents : une expression qui accepte tout ne prouve rien.
{
  const docPath = path.join(SKILLDIR, 'references', 'contrat-sortie-runner.md');
  let formeSrc = null;
  if (!fs.existsSync(docPath)) ko('TF-0824 : references/contrat-sortie-runner.md absent — le contrat de SORTIE du lanceur n a pas de domicile');
  else {
    const doc = fs.readFileSync(docPath, 'utf8');
    const ver = doc.match(/Version du contrat\s*:\s*(\d+\.\d+\.\d+)/);
    const datees = ['2026-08-26', '2026-09-05'].filter(d => doc.includes(d));
    const mf = doc.match(/^ligne-fail = (.+)$/m);
    if (!ver) ko('TF-0824 : le contrat de sortie ne porte AUCUNE version — un lecteur n a rien a surveiller');
    else if (datees.length < 2) ko('TF-0824 : le contrat de sortie ne consigne pas les DEUX changements dates (trouves : ' + (datees.join(' ') || 'aucun') + ')');
    else if (!mf) ko('TF-0824 : le contrat de sortie ne porte pas sa forme opposable (`ligne-fail = <expression>`) — la recette n aurait qu une copie a comparer');
    else { formeSrc = mf[1].trim(); ok('TF-0824 : contrat de sortie v' + ver[1] + ' present, forme opposable declaree, changements du ' + datees.join(' et du ') + ' consignes'); }
  }

  if (formeSrc) {
    let forme = null;
    try { forme = new RegExp(formeSrc); } catch (e) { ko('TF-0824 : la forme documentee n est pas une expression valide : ' + e.message); }
    if (forme) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-contrat-sortie-'));
      try {
        // Même fixture que le cas TF-0659 : un chapitre qui ouvre directement sur un tableau fait
        // échouer l'oracle de lisibilité, donc rendre une ligne ❌ porteuse de raisons.
        const doc = path.join(tmp, 'fixture.md');
        fs.writeFileSync(doc,
          '# Doc\n\nUne phrase d ouverture correcte et assez longue pour dire ce que le lecteur va '
          + 'apprendre ici.\n\n## Chapitre\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', 'utf8');
        const r = spawnSync(process.execPath,
          [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), doc, '--no-cache'],
          { encoding: 'utf8', timeout: 180000 });
        const lignes = (r.stdout || '').split(/\r?\n/);
        const ligne = lignes.find(l => l.startsWith('  ❌ '));
        if (!ligne) ko('TF-0824 vert : le lanceur n a rendu AUCUNE ligne de resultat en echec sur la fixture — le cas ne mesure rien');
        else if (!forme.test(ligne)) ko('TF-0824 vert : la ligne rendue ne suit PAS la forme documentee — contrat et code ont divergé. Rendue : ' + ligne.slice(0, 160));
        else {
          ok('TF-0824 vert : la ligne rendue suit la forme documentee (§2.4) — ' + ligne.slice(0, 90));
          // ROUGE — la ligne d'AVANT le 05/09 : même ligne, en-tête de compte retiré. C'est
          // exactement la forme qui rendait deux versions d'un fichier indiscernables.
          const avant = ligne.replace(/ — \d+ constat\(s\) · /, ' — ');
          if (avant === ligne) ko('TF-0824 rouge : l en-tete de compte n a pas pu etre retire de la ligne — le cas rouge ne reproduit rien');
          else if (forme.test(avant)) ko('TF-0824 rouge : une ligne SANS en-tete de compte passe la forme documentee — l expression est sans dents, elle aurait accepte la sortie d avant le 05/09');
          else ok('TF-0824 rouge : la ligne d avant le 05/09 (sans « <n> constat(s) · ») est REFUSEE par la forme documentee');
        }
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }
  }
}

// TF-0912 (08/09/2026) — UNE RECETTE ÉPINGLE SA DONNÉE D'ENTRÉE, ELLE NE LA DEVINE PAS.
//
// LE FAIT PAYÉ. Élargir la résolution des tables de l'oracle de publication (le canal
// confidentiel avant les anciens fichiers libres) a fait tomber QUATRE fixtures vertes depuis
// des semaines — non parce que la piste est fausse, mais parce qu'elles résolvaient leur donnée
// PAR CONVENTION, jamais par désignation. Les deux bundles `nom-client-publie` appelaient
// l'oracle SANS `--referentiel` ni `--produits`, comptant sur la marche « fichier voisin de
// l'artefact » : dès la résolution élargie, ils étaient jugés contre les tables RÉELLES du poste,
// et la fixture ROUGE a rendu PASS faute d'y trouver le nom inventé qu'elle porte. Une fixture
// rouge qui passe est une fixture MORTE, et rien ne l'aurait dit.
//
// CE CAS EST LE CLIQUET DE LA RÈGLE, pas la correction : celle-ci vit dans le manifest depuis
// bfdb251. Il refuse qu'on retire ces deux drapeaux — le retrait ne casserait AUCUNE fixture sur
// une machine sans le canal, et repasserait vert le jour où la donnée du parc arrive. Un défaut
// qui ne se voit que sur certains postes est exactement celui qu'un banc doit épingler.
{
  const manifest = path.join(SKILLDIR, 'fixtures', 'manifest.json');
  try {
    const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const entrees = Array.isArray(m) ? m : (m.fixtures || m.entrees || []);
    const e = entrees.find((x) => x && x.nom === 'nom-client-publie');
    if (!e) ko('TF-0912 épinglage : entrée « nom-client-publie » introuvable au manifest');
    else {
      const cmd = (e.cmd || []).join(' ');
      const manquants = ['--referentiel=', '--produits='].filter((d) => !cmd.includes(d));
      if (manquants.length) ko('TF-0912 epinglage : la commande de fixture ne DESIGNE pas ' + manquants.join(' ni ')
        + ' — elle resout sa donnee par voisinage, donc contre les tables du POSTE des que la resolution s elargit : la fixture rouge redevient muette sans que rien ne le dise');
      else ok('TF-0912 epinglage : la commande de fixture DESIGNE ses deux tables de jeu d essai (--referentiel, --produits) — son verdict ne depend plus de ce que porte la machine');
    }
  } catch (err) {
    ko('TF-0912 épinglage : manifest illisible — ' + err.message);
  }
}

// TF-0828 (05/09/2026) — C5 REJOUE L'ANGLE C4 : LE CONTENU DE L'HISTORIQUE.
//
// LE TROU. C5 jugeait trois angles sur les quatre que C1-C4 couvrent : contenus et noms des
// fichiers SUIVIS de l'arbre courant, et messages de commit de tout l'historique. Elle ne
// rejouait pas C4 — le CONTENU des fichiers de tout l'historique, y compris ceux RETIRÉS de
// l'arbre. Retirer un fichier de l'arbre ne le retire pas des commits, et l'hébergeur sert
// encore par empreinte ce qu'un commit ancien contient : c'est ce même trou qui avait fait
// découvrir un neuvième dépôt porteur après que huit aient été déclarés propres.
//
// MESURE DU 05/09 sur un clone jetable au commit 00097b6 : la porte rendait FAIL avec 5 constats
// (2 dans l'arbre, 3 dans des messages de commit) ; le même balayage étendu au CONTENU de
// l'historique, joué à la main, rendait 12 couples (révision, fichier) sur 2 fichiers — douze
// constats invisibles à la porte.
//
// TROIS CAS :
//   (1) ROUGE — un nom de produit qui ne vit QUE dans un blob ancien, sur un fichier RETIRÉ de
//               l'arbre : la porte échoue, et le constat porte « CONTENU d'un fichier de
//               l'historique ». C'est le cas que la porte ne voyait pas ;
//   (2) le TÉMOIN du (1) — le MÊME dépôt, dont l'arbre courant et les messages de commit sont
//               propres : sans lui, on ne saurait pas si le FAIL vient de l'angle ajouté ou
//               d'un des trois anciens ;
//   (3) VERT  — un dépôt dont aucune révision ne porte le nom : PASS, et le non_juge DÉCLARE
//               la limite qui subsiste (les VARIANTES de graphie ne sont pas cherchées dans
//               l'historique, et pourquoi). Un angle étendu qui tairait sa limite se lirait
//               comme un angle complet.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-c5-histo-'));
  try {
    const CLE = 'Zorgonaute-Machin';   // clé INVENTÉE, longue : la graphie littérale suffit
    const tables = path.join(tmp, 'tables');
    fs.mkdirSync(tables);
    const tClients = path.join(tables, 'clients.json');
    const tProduits = path.join(tables, 'produits.json');
    fs.writeFileSync(tClients, JSON.stringify({ noms: ['Zorglub'], identifiants: [], sigles: [] }), 'utf8');
    fs.writeFileSync(tProduits, JSON.stringify({ produits: { [CLE]: 'Produit-96' } }), 'utf8');

    const depots = path.join(tmp, 'depots');
    fs.mkdirSync(depots);
    const g = (r) => (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
    // Le dépôt ROUGE : le nom entre au premier commit dans un fichier, puis le fichier est
    // SUPPRIMÉ au second. L'arbre courant est propre, les deux messages de commit aussi — seul
    // le blob du premier commit porte encore le nom.
    const rouge = path.join(depots, 'blob-ancien');
    fs.mkdirSync(rouge);
    const gr = g(rouge);
    gr('init', '-q'); gr('config', 'user.email', 'banc@local'); gr('config', 'user.name', 'banc');
    fs.writeFileSync(path.join(rouge, 'note.md'), 'Compte rendu de la reunion ' + CLE + '.', 'utf8');
    fs.writeFileSync(path.join(rouge, 'garde.md'), 'Ce fichier reste, et ne porte aucun nom.', 'utf8');
    gr('add', '-A'); gr('commit', '-q', '-m', 'premier depot du banc');
    fs.rmSync(path.join(rouge, 'note.md'));
    gr('add', '-A'); gr('commit', '-q', '-m', 'retrait du compte rendu');
    // Le dépôt VERT : la MÊME forme, aucun nom de la table nulle part.
    const vert = path.join(depots, 'propre');
    fs.mkdirSync(vert);
    const gv = g(vert);
    gv('init', '-q'); gv('config', 'user.email', 'banc@local'); gv('config', 'user.name', 'banc');
    fs.writeFileSync(path.join(vert, 'note.md'), 'Compte rendu de la reunion hebdomadaire.', 'utf8');
    fs.writeFileSync(path.join(vert, 'garde.md'), 'Ce fichier reste, et ne porte aucun nom.', 'utf8');
    gv('add', '-A'); gv('commit', '-q', '-m', 'premier depot du banc');
    fs.rmSync(path.join(vert, 'note.md'));
    gv('add', '-A'); gv('commit', '-q', '-m', 'retrait du compte rendu');

    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const jouer = (repo) => {
      const r = spawnSync(process.execPath, [
        path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduits,
      ], { encoding: 'utf8', timeout: 300000, env: envNu });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const c5de = (j) => (j ? (j.findings || []).filter(f => f.regle === 'C5') : []);

    const jr = jouer(rouge);
    const histo = c5de(jr).filter(f => /historique/.test(f.msg));
    const arbre = c5de(jr).filter(f => !/historique/.test(f.msg));
    if (!jr) ko('TF-0828 blob ancien : sortie de l oracle inexploitable');
    else if (jr.verdict !== 'FAIL') ko('TF-0828 blob ancien : un nom de produit vivant SEULEMENT dans un blob ancien ne fait pas echouer la porte (' + jr.verdict + ') — l angle C4 n est pas rejoue par C5');
    else if (!histo.length) ko('TF-0828 blob ancien : aucun constat C5 portant sur le CONTENU de l historique');
    else if (!histo.every(f => f.sev && f.msg && f.where)) ko('TF-0828 blob ancien : un constat C5 d historique ne porte pas le contrat findings[] (sev, msg, where)');
    else ok('TF-0828 blob ancien : le nom retire de l arbre mais present dans un blob -> FAIL, ' + histo.length + ' constat(s) C5 sur le CONTENU de l historique, au contrat findings[]');
    // TÉMOIN : le FAIL vient bien de l'angle AJOUTÉ, pas d'un des trois anciens.
    if (jr && arbre.length) ko('TF-0828 temoin : ' + arbre.length + ' constat(s) C5 hors historique — l arbre courant ou les messages de commit portaient deja le nom, le cas rouge ne prouve donc pas l angle ajoute');
    else if (jr) ok('TF-0828 temoin : ZERO constat C5 sur l arbre courant et les messages de commit — le FAIL vient bien de l angle ajoute, et de lui seul');

    const jv = jouer(vert);
    const njv = (jv ? (jv.non_juge || []) : []).join(' ');
    if (!jv) ko('TF-0828 depot propre : sortie de l oracle inexploitable');
    else if (jv.verdict !== 'PASS') ko('TF-0828 depot propre : la MEME forme sans aucun nom de la table ne rend pas PASS (' + jv.verdict + ') — l angle ajoute crie sur la structure');
    else if (!/C5 balaie les QUATRE angles/.test(njv)) ko('TF-0828 depot propre : le non_juge ne DECLARE pas que C5 couvre desormais les quatre angles');
    else if (!/VARIANTES de graphie ne le sont pas/.test(njv)) ko('TF-0828 depot propre : la LIMITE qui subsiste (variantes non cherchees dans l historique) n est pas declaree — un angle etendu qui tait sa limite se lit comme un angle complet');
    else ok('TF-0828 depot propre : PASS, et le non_juge declare les quatre angles ET la limite qui subsiste (variantes de graphie hors historique, motif R3)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-0825 (05/09/2026) — LA FORME BORNÉE D'UN TERME COURT, ET SA FIXTURE DOUBLE SENS.
//
// LE FAIT. Un nom de client est long et distinctif ; un nom de produit est souvent une
// abréviation de TROIS LETTRES. Mesure du 05/09 sur une forge : la même séquence de trois
// majuscules rend 3 occurrences sur les fichiers SUIVIS — la mesure exacte du lot — et 212 sur
// l'arbre de travail, dont 209 dans des paquets installés où ces lettres sont un acronyme
// d'informatique sans aucun rapport avec le produit.
//
// LE GARDE-FOU ÉPROUVÉ ICI : la table peut porter, pour un terme court, la ou les FORMES
// BORNÉES attendues (« <nom>-FR » et sa variante « <nom>.FR ») plutôt que la sous-chaîne nue.
// Déclarées, elles REMPLACENT la clé.
//
// TROIS CAS, ET LE TROISIÈME EST LE GARDE-FOU DU GARDE-FOU :
//   (1) ROUGE — le nom dans un IDENTIFIANT DE LOT (« KRP-FR ») : la porte échoue ;
//   (2) VERT  — les MÊMES LETTRES employées comme acronyme légitime (« le protocole KRP ») :
//               plus aucun constat. Sans ce cas, rien ne distingue un gate juste d'un gate qui
//               ne bruite pas ENCORE, et un gate qui bruite se contourne avant d'être corrigé ;
//   (3) le CONTRE-CAS de (2) : la MÊME phrase, la MÊME clé, SANS `formes` déclarées → FAIL.
//               C'est lui qui prouve que le vert de (2) vient de la déclaration et non d'une
//               règle devenue aveugle. Un assouplissement non contrôlé se lit exactement comme
//               un garde-fou, et seule cette paire les sépare.
// Dépôt jetable, racine jetable DÉCLARÉE et clé INVENTÉE — mêmes raisons qu'aux cas voisins.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-c5-formes-'));
  try {
    const CLE = 'KRP';
    const tables = path.join(tmp, 'tables');
    fs.mkdirSync(tables);
    const tClients = path.join(tables, 'clients.json');
    fs.writeFileSync(tClients, JSON.stringify({ noms: ['Zorglub'], identifiants: [], sigles: [] }), 'utf8');
    // La table AVEC formes déclarées, et la MÊME table sans — c'est la seule différence entre
    // le cas (2) et le cas (3).
    const tAvec = path.join(tables, 'produits-formes.json');
    const tSans = path.join(tables, 'produits-nu.json');
    fs.writeFileSync(tAvec, JSON.stringify({ produits: {
      [CLE]: { pseudo: 'Produit-97', formes: [CLE + '-FR', CLE + '.FR'] } } }), 'utf8');
    fs.writeFileSync(tSans, JSON.stringify({ produits: { [CLE]: 'Produit-97' } }), 'utf8');

    const depots = path.join(tmp, 'depots');
    fs.mkdirSync(depots);
    const batir = (nom, fichier, contenu) => {
      const r = path.join(depots, nom);
      fs.mkdirSync(r);
      fs.writeFileSync(path.join(r, fichier), contenu, 'utf8');
      const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
      g('init', '-q');
      g('config', 'user.email', 'banc@local');
      g('config', 'user.name', 'banc');
      g('add', '-A');
      g('commit', '-q', '-m', 'depot jetable du banc');
      return r;
    };

    // (1) l'identifiant de lot, tel qu'un lot de retours le porte.
    const lot = batir('lot', 'suivi.md', 'Lot recu : ' + CLE + '-FR - RETOURS - 20260908a.');
    // (2)/(3) l'acronyme legitime, borne d'espaces : la MEME graphie que le cas rouge de TF-0880,
    // qui echouait alors a bon droit. Ici la table dit que seule la forme de lot compte.
    const acro = batir('acronyme', 'notes.md', 'Le protocole ' + CLE + ' reste a brancher cette semaine.');

    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const jouer = (repo, tProduits) => {
      const r = spawnSync(process.execPath, [
        path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduits,
      ], { encoding: 'utf8', timeout: 180000, env: envNu });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const c5de = (j) => (j ? (j.findings || []).filter(f => f.regle === 'C5') : []);

    const j1 = jouer(lot, tAvec);
    const c1 = c5de(j1);
    if (!j1) ko('TF-0825 forme de lot : sortie de l oracle inexploitable');
    else if (j1.verdict !== 'FAIL') ko('TF-0825 forme de lot : « ' + CLE + '-FR » dans un identifiant de lot ne fait pas echouer la porte (' + j1.verdict + ') — la forme declaree n est pas cherchee');
    else if (!c1.length) ko('TF-0825 forme de lot : aucun constat C5 sur la forme DECLAREE');
    else if (!c1.every(f => f.sev && f.msg && f.where)) ko('TF-0825 forme de lot : un constat C5 ne porte pas le contrat findings[] (sev, msg, where)');
    else ok('TF-0825 forme de lot : « ' + CLE + '-FR » dans un identifiant de lot -> FAIL, ' + c1.length + ' constat(s) C5 au contrat findings[]');

    const j2 = jouer(acro, tAvec);
    if (!j2) ko('TF-0825 acronyme legitime : sortie de l oracle inexploitable');
    else if (c5de(j2).length) ko('TF-0825 acronyme legitime : les memes lettres employees comme acronyme font encore ' + c5de(j2).length + ' constat(s) C5 — la forme bornee ne remplace pas la sous-chaine nue');
    else if (j2.verdict !== 'PASS') ko('TF-0825 acronyme legitime : le depot au seul acronyme ne rend pas PASS (' + j2.verdict + ')');
    else if (!/PORTÉE ASSUMÉE de C5/.test((j2.non_juge || []).join(' '))) ko('TF-0825 acronyme legitime : la portee « fichiers SUIVIS » n est pas DECLAREE comme propriete au non_juge — garde-fou n° 1 absent');
    else ok('TF-0825 acronyme legitime : « ' + CLE + ' » comme acronyme -> PASS, aucun constat C5, et la portee « fichiers suivis » est declaree comme PROPRIETE au non_juge');

    const j3 = jouer(acro, tSans);
    if (!j3) ko('TF-0825 contre-cas : sortie de l oracle inexploitable');
    else if (j3.verdict !== 'FAIL' || !c5de(j3).length) ko('TF-0825 contre-cas : SANS `formes` declarees, la MEME phrase ne fait plus echouer la porte (' + (j3 && j3.verdict) + ') — le vert precedent ne vient donc pas de la declaration mais d une regle devenue aveugle');
    else ok('TF-0825 contre-cas : la MEME phrase et la MEME cle, SANS `formes`, font toujours FAIL — le vert du cas 2 vient bien de la DECLARATION, pas d un assouplissement');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-0880 (07/09/2026) — LA GRAPHIE LITTÉRALE D'UNE CLÉ EST BORNÉE, COMME SES VARIANTES.
//
// LE FAIT PAYÉ, ET IL EST MESURÉ : le 06/09, la porte jouée sur la forge des outils avec les deux
// tables du canal a rendu HUIT constats C5. TROIS d'entre eux — 37,5 % — tombaient sur la même
// sous-chaîne d'un blob base64 de police woff2, où une clé de trois lettres vivait ENTRE DEUX
// LETTRES. `porteProduit()` cherchait la graphie littérale par `hay.includes(cle)`, sans frontière,
// alors que les VARIANTES en portaient une deux lignes plus haut dans le même fichier. Le trou ne
// se voyait pas tant que la table n'avait que des noms longs : une clé de deux mots et huit lettres
// dérive des variantes, donc gagnait sa frontière par la bande. Une clé COURTE n'en avait aucune.
//
// POURQUOI CE BRUIT-LÀ COÛTE PLUS QU'IL N'EN A L'AIR : un lecteur qui voit trois constats faux
// décide que les cinq autres le sont aussi, et la porte se fait désactiver dans la semaine. Un
// contrôle qui crie sur un blob binaire n'est pas « prudent », il est en train de se disqualifier.
//
// TROIS CAS, DEUX SENS, ET LE MILIEU EST LE GARDE-FOU : borner ne doit pas rendre la règle aveugle.
//   (1) VERT   — la clé au milieu d'un blob base64, entre deux lettres : plus de constat ;
//   (2) ROUGE  — la même clé en MOT ENTIER dans une phrase : la porte échoue toujours. Sans ce cas,
//                une frontière trop large passerait pour un progrès tout en éteignant l'angle ;
//   (3) VERT   — la clé COLLÉE à des lettres (« MDXKRP » pour la clé « KRP ») : plus de constat.
// Le dépôt est jetable et la clé est INVENTÉE, pour la raison exacte du cas TF-0820 : une fixture
// commitée porterait un nom de produit dans le dépôt même que cette porte garde.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-c5-frontiere-'));
  try {
    // CLÉ COURTE INVENTÉE : trois lettres, un seul mot, purement alphanumérique — donc AUCUNE
    // variante dérivée (il en faut deux mots et huit lettres). C'est exactement le profil qui
    // n'avait jamais de frontière avant le 07/09.
    const CLE = 'KRP';
    const tables = path.join(tmp, 'tables');
    fs.mkdirSync(tables);
    const tProduits = path.join(tables, 'produits.json');
    const tClients = path.join(tables, 'clients.json');
    fs.writeFileSync(tProduits, JSON.stringify({ produits: { [CLE]: 'Produit-97' } }), 'utf8');
    fs.writeFileSync(tClients, JSON.stringify({ noms: ['Zorglub'], identifiants: [], sigles: [] }), 'utf8');

    const depots = path.join(tmp, 'depots');
    fs.mkdirSync(depots);
    const batir = (nom, fichier, contenu) => {
      const r = path.join(depots, nom);
      fs.mkdirSync(r);
      fs.writeFileSync(path.join(r, fichier), contenu, 'utf8');
      const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
      g('init', '-q');
      g('config', 'user.email', 'banc@local');
      g('config', 'user.name', 'banc');
      g('add', '-A');
      g('commit', '-q', '-m', 'depot jetable du banc');
      return r;
    };

    // (1) Le blob : la clé entre un « N » et un « J », comme dans la police woff2 réellement
    // rencontrée le 06/09. Une longue ligne de base64, et rien d'autre de lisible.
    const blob = batir('blob', 'assets.html',
      '<style>@font-face{src:url(data:font/woff2;base64,d09GMgABAAAAAEQ4ABEAAAAAmN'
      + CLE + 'JBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA)}</style>');
    // (2) Le mot entier : la clé bornée d'espaces dans une phrase ordinaire.
    const mot = batir('mot', 'notes.md', 'Le connecteur de ' + CLE + ' reste a brancher cette semaine.');
    // (3) Le collage : la clé en fin d'un identifiant de code, sans aucune frontière.
    const colle = batir('colle', 'outil.py', 'MDX' + CLE + ' = 1  # identifiant interne, pas un produit');

    // Racine jetable DÉCLARÉE, pour la raison exposée au cas TF-0820 : sans elle la porte devine
    // le parent de la forge, et un poste portant le canal ferait lire les tables du parc.
    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const jouer = (repo) => {
      const r = spawnSync(process.execPath, [
        path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduits,
      ], { encoding: 'utf8', timeout: 180000, env: envNu });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const c5de = (j) => (j ? (j.findings || []).filter(f => f.regle === 'C5') : []);

    const jb = jouer(blob);
    if (!jb) ko('TF-0880 blob : sortie de l oracle inexploitable');
    else if (c5de(jb).length) ko('TF-0880 blob : la cle au milieu d un blob base64 fait ENCORE un constat C5 (' + c5de(jb).length + ') — la graphie litterale n est pas bornee');
    else if (jb.verdict !== 'PASS') ko('TF-0880 blob : le depot au seul blob ne rend pas PASS (' + jb.verdict + ')');
    else ok('TF-0880 blob : une cle courte au milieu d un blob base64 (entre deux lettres) ne fait plus AUCUN constat C5 — le bruit du 06/09 est eteint');

    const jm = jouer(mot);
    const c5m = c5de(jm);
    if (!jm) ko('TF-0880 mot entier : sortie de l oracle inexploitable');
    else if (jm.verdict !== 'FAIL') ko('TF-0880 mot entier : la cle en MOT ENTIER ne fait plus echouer la porte (' + jm.verdict + ') — borner a rendu l angle aveugle');
    else if (!c5m.length) ko('TF-0880 mot entier : aucun constat C5 sur une mention franche — la frontiere est trop large');
    else if (!c5m.every(f => f.sev && f.msg && f.where)) ko('TF-0880 mot entier : un constat C5 ne porte pas le contrat findings[] (sev, msg, where) — le contrat de sortie devait etre inchange');
    else ok('TF-0880 mot entier : la cle bornee d espaces fait toujours FAIL, ' + c5m.length + ' constat(s) C5 au contrat findings[] inchange');

    const jc = jouer(colle);
    if (!jc) ko('TF-0880 collee : sortie de l oracle inexploitable');
    else if (c5de(jc).length) ko('TF-0880 collee : la cle COLLEE a des lettres fait encore un constat C5 (' + c5de(jc).length + ') — un identifiant de code n est pas un nom de produit');
    else if (jc.verdict !== 'PASS') ko('TF-0880 collee : le depot au seul identifiant ne rend pas PASS (' + jc.verdict + ')');
    else ok('TF-0880 collee : la cle collee a des lettres (« MDX' + CLE + ' » pour « ' + CLE + ' ») ne fait plus AUCUN constat C5');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-0887 (08/09/2026) — LA PORTE TROUVE LES TABLES DU CANAL TOUTE SEULE, ET DIT LAQUELLE.
//
// LE FAIT PAYÉ. Le 07/09, les deux tables ont quitté les fichiers libres `<racine>\_*.json` pour
// le canal confidentiel `<racine>\_confidentiel\tables\`. Les pistes par défaut de la porte ne
// connaissaient que les anciens emplacements : appelée SANS `--referentiel` ni `--produits` —
// c'est-à-dire exactement comme le `pre-push` l'appelle — elle rendait SKIP, et le hameçon traite
// un SKIP en refus. Tout dépôt portant le hameçon refusait CHAQUE push, sur les deux postes et
// sur tout clone neuf, jusqu'à ce que quelqu'un pose deux variables d'environnement à la main.
// Une béquille qu'on pose à la main est une béquille qu'on oublie, et une porte muette par défaut
// finit contournée avec l'option qui saute les hooks — pire qu'une porte absente.
//
// DEUX SENS, ET LE SECOND EST CE QUI EMPÊCHE LE PREMIER DE MENTIR :
//   (1) VERT  — racine jetable portant `_confidentiel\tables\`, dépôt jugé DANS cette racine,
//               AUCUN argument et AUCUNE variable : la porte joue C1 à C5 et NOMME les deux
//               tables lues. Sans le correctif, ce cas rend SKIP ;
//   (2) ROUGE — aucune table nulle part sous la racine déclarée : la porte rend SKIP et son motif
//               DIT ce qui manque et où elle a cherché, le canal compris. Sans ce sens, on
//               pourrait faire passer (1) en rendant la porte incapable de dire non.
// Les noms de la table jetable sont INVENTÉS, même règle que les cas TF-0820 et TF-0880 : aucun
// nom du parc ne s'écrit dans le dépôt que cette porte garde.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-canal-'));
  try {
    const NOM_CLIENT = 'Zorglub';
    const NOM_PRODUIT = 'PortailBidule-Machin';

    const batir = (racine, nom, lignes) => {
      const r = path.join(racine, nom);
      fs.mkdirSync(r, { recursive: true });
      fs.writeFileSync(path.join(r, 'outil.py'), lignes.join('\n') + '\n', 'utf8');
      const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
      g('init', '-q');
      g('config', 'user.email', 'banc@local');
      g('config', 'user.name', 'banc');
      g('add', '-A');
      g('commit', '-q', '-m', 'depot jetable du banc');
      return r;
    };
    // AUCUNE VARIABLE : c'est tout l'enjeu. Le cas doit prouver que la porte se débrouille sans
    // béquille, donc l'environnement du banc est vidé des trois variables — y compris FORGE_ROOT,
    // dont l'absence force la porte à DEVINER la racine par le parent du dépôt jugé.
    const envSansBequille = { ...process.env };
    delete envSansBequille.FORGE_NOMS_INTERDITS;
    delete envSansBequille.FORGE_PRODUITS_PSEUDO;
    delete envSansBequille.FORGE_ROOT;
    const jouerNu = (repo, env) => {
      const r = spawnSync(process.execPath,
        [path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo],
        { encoding: 'utf8', timeout: 180000, env });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };

    // --- (1) VERT : le canal sous la racine jetable, aucun argument, aucune variable -----------
    const avec = path.join(tmp, 'avec-canal');
    const tables = path.join(avec, '_confidentiel', 'tables');
    fs.mkdirSync(tables, { recursive: true });
    fs.writeFileSync(path.join(tables, 'noms-interdits.json'),
      JSON.stringify({ noms: [NOM_CLIENT], identifiants: [], sigles: [] }), 'utf8');
    fs.writeFileSync(path.join(tables, 'produits-pseudonymes.json'),
      JSON.stringify({ produits: { [NOM_PRODUIT]: 'Produit-99' } }), 'utf8');
    const porteur = batir(avec, 'depot-porteur', [
      `# rapport remis a ${NOM_CLIENT}, a rebrancher`,
      `# TODO : connecteur de ${NOM_PRODUIT}`,
    ]);

    const jc = jouerNu(porteur, envSansBequille);
    const njc = jc ? (jc.non_juge || []).join(' ') : '';
    const regles = jc ? [...new Set((jc.findings || []).map(f => f.regle))] : [];
    if (!jc) ko('TF-0887 canal : sortie de l oracle inexploitable');
    else if (jc.verdict === 'SKIP') ko('TF-0887 canal : la porte appelee SANS argument et SANS variable rend encore SKIP alors que le canal est sous la racine du depot juge — le hamecon refuserait chaque push, exactement la panne du 07/09');
    else if (jc.verdict !== 'FAIL') ko(`TF-0887 canal : le depot porteur ne fait pas echouer la porte (${jc.verdict}) — les tables du canal n ont pas ete lues`);
    else if (!regles.includes('C1') || !regles.includes('C5')) ko(`TF-0887 canal : regles levees ${regles.join('+') || 'aucune'} — les DEUX tables du canal devaient etre lues (C1 pour les clients, C5 pour les produits)`);
    else if (!njc.includes(path.join(tables, 'noms-interdits.json')) || !njc.includes(path.join(tables, 'produits-pseudonymes.json')))
      ko('TF-0887 canal : les tables LUES ne sont pas nommees au non_juge — un lecteur ne peut pas savoir si le verdict vient du canal, d un ancien fichier libre ou d un banc');
    else if (!/table lue/.test(njc)) ko('TF-0887 canal : le non_juge ne dit pas « table lue : … »');
    else ok(`TF-0887 canal VERT : sans aucun argument ni variable, la porte trouve les deux tables dans <racine>/_confidentiel/tables/, joue ${regles.join('+')} et NOMME les deux tables lues`);

    // --- (2) ROUGE : aucune table nulle part, racine jetable DÉCLARÉE ---------------------------
    // La racine est déclarée ici — et seulement ici — parce que le cas veut prouver l'ABSENCE :
    // sans elle la porte devinerait le parent de la forge, qui porte le canal RÉEL sur un poste
    // du parc, et le cas mesurerait le poste au lieu de la règle.
    const sans = path.join(tmp, 'sans-canal');
    fs.mkdirSync(sans, { recursive: true });
    const nu = batir(sans, 'depot-nu', ['# rien a signaler ici']);
    const envRacineNue = { ...envSansBequille, FORGE_ROOT: sans };
    const js = jouerNu(nu, envRacineNue);
    const njs = js ? (js.non_juge || []).join(' ') : '';
    if (!js) ko('TF-0887 absence : sortie de l oracle inexploitable');
    else if (js.verdict !== 'SKIP') ko(`TF-0887 absence : aucune table nulle part et la porte rend ${js.verdict} — un controle sans son referentiel produit de la confiance, pas du doute`);
    else if (!/RÉFÉRENTIEL DES NOMS INTERDITS ABSENT/.test(njs)) ko('TF-0887 absence : le SKIP ne dit pas CE QUI manque');
    else if (!njs.includes(path.join(sans, '_confidentiel', 'tables', 'noms-interdits.json')))
      ko('TF-0887 absence : le motif du SKIP ne liste pas la piste du CANAL — le lecteur ne sait pas ou poser la table pour que la porte la trouve');
    else ok('TF-0887 absence ROUGE : aucune table sous la racine declaree → SKIP motive, la piste du canal est nommee parmi les pistes explorees');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-0958 (08/09/2026) — LE COÛT DE C4 EST GROUPÉ, ET LE GROUPAGE N'A RIEN RENDU AVEUGLE.
//
// LE FAIT PAYÉ, ET IL EST MESURÉ. C4 balaie le CONTENU de tout l'historique en déléguant à
// `git grep`. Elle lançait une invocation par TERME **et** par LOT de révisions : sur le dépôt du
// pilot (909 révisions, 1 371 fichiers suivis, 7 lots) avec les tables RÉELLES du canal (10 termes
// clients, 65 clés de produits), 70 invocations là où 21 suffisent — et chacune relit LES MÊMES
// blobs. Mesure du 08/09, protocole séquentiel, deux passes, mêmes tables : 330,9 s puis 295,5 s.
// Un jeu d'essai de 4 termes rendait 81 s et 99 s sur le même dépôt : le temps croît avec la TABLE.
// Un gate bloquant à ce prix se contourne au premier `--no-verify`, et cette option est documentée
// dans le hameçon lui-même — la lenteur d'une porte est un défaut de sécurité, pas d'ergonomie.
//
// CE QUE CE BANC PROUVE, EN DEUX SENS QUI NE SE REMPLACENT PAS :
//   (A) LE SENS DU COÛT — celui qui était ROUGE avant la correction et vert après. L'oracle
//       DÉCLARE au non_juge le nombre de passes groupées réellement faites. Sur une table de
//       7 termes couvrant les TROIS genres, ce nombre doit être 3 par lot, pas 7 : avant la
//       correction la ligne n'existe pas, et le compte serait celui des termes. Un coût qu'on ne
//       déclare pas ne se surveille pas, et c'est ce qui a laissé la porte dériver jusqu'à 5 min ;
//   (B) LE SENS DE LA COUVERTURE — celui SANS lequel (A) se satisferait d'une porte aveugle.
//       Grouper, c'est perdre l'information de QUELLE aiguille a mordu : `git grep -l` ne le dit
//       pas. Trois pièges s'ouvrent alors, et le banc les ferme un par un :
//         · MISATTRIBUTION — deux noms du MÊME groupe vivant dans DEUX blobs différents doivent
//           rendre UN constat chacun, sur SON fichier. Un groupage sans identification fine en
//           rendrait deux par fichier, ou nommerait le mauvais terme ;
//         · DRAPEAUX FONDUS, sens « trop large » — un SIGLE (mot entier) dont les trois lettres
//           vivent À L'INTÉRIEUR d'un mot ordinaire ne doit RIEN rendre. S'il rend un constat,
//           c'est que le `-w` de son groupe a été perdu en fusionnant les genres ;
//         · DRAPEAUX FONDUS, sens « trop étroit » — un NOM (sous-chaîne) COLLÉ à un suffixe doit
//           rendre son constat. S'il n'en rend pas, c'est que le `-w` du groupe des sigles a
//           débordé sur celui des noms. Ces deux témoins vivent dans LE MÊME fichier : aucune
//           fusion de drapeaux ne peut les satisfaire tous les deux ;
//         · CASSE FONDUE — un IDENTIFIANT est sensible à la casse. Sa variante en MAJUSCULES ne
//           doit RIEN rendre ; si elle rend un constat, le `-i` du groupe des noms a débordé.
//
// LES DÉPÔTS SONT JETABLES, LA RACINE EST JETABLE ET DÉCLARÉE, LES NOMS SONT INVENTÉS — mêmes
// raisons qu'aux cas TF-0820, TF-0825, TF-0880 et TF-0887 : aucun nom du parc ne s'écrit dans le
// dépôt que cette porte garde, et sans `FORGE_ROOT` sur la racine du banc, un poste portant le
// canal confidentiel ferait lire les tables RÉELLES au lieu de celles du banc.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-c4-groupage-'));
  try {
    // 7 TERMES SUR LES TROIS GENRES : 5 noms (`-i`), 1 identifiant (aucun drapeau), 1 sigle
    // (`-i -w`). Trois combinaisons de drapeaux, donc trois passes attendues par lot — et sept
    // si le groupage n'a pas eu lieu. L'écart 3 contre 7 est ce que le sens (A) mesure.
    const NOMS = ['Zorglubtron', 'Chronopodie', 'Vermiculex', 'Bidulophone', 'Machinorama'];
    const IDENT = 'wks-12345678901234';
    const SIGLE = 'ZQX';
    const tables = path.join(tmp, 'tables');
    fs.mkdirSync(tables);
    const tClients = path.join(tables, 'clients.json');
    const tProduits = path.join(tables, 'produits.json');
    fs.writeFileSync(tClients, JSON.stringify({ noms: NOMS, identifiants: [IDENT], sigles: [SIGLE] }), 'utf8');
    // La table des produits est POSÉE ET VIDE DE TOUT NOM PRÉSENT : C5 joue, et ne dit rien —
    // sans elle l'oracle déclarerait « C5 non jouée » et le banc mesurerait un autre objet.
    fs.writeFileSync(tProduits, JSON.stringify({ produits: { 'Zorgonaute-Machin': 'Produit-95' } }), 'utf8');

    const depots = path.join(tmp, 'depots');
    fs.mkdirSync(depots);
    // Le dépôt porteur : les mentions entrent au premier commit puis les fichiers sont RETIRÉS de
    // l'arbre au second. L'arbre courant est propre — donc C1 se tait, et ce qui reste vient de
    // C4 et de C4 SEULE. Sans ce retrait, la déduplication C1/C4 masquerait la moitié du banc.
    const batir = (nom, fichiers, restants) => {
      const r = path.join(depots, nom);
      fs.mkdirSync(r, { recursive: true });
      const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
      g('init', '-q'); g('config', 'user.email', 'banc@local'); g('config', 'user.name', 'banc');
      for (const [f, c] of Object.entries(fichiers)) fs.writeFileSync(path.join(r, f), c, 'utf8');
      fs.writeFileSync(path.join(r, 'garde.md'), 'Ce fichier reste, et ne porte rien.\n', 'utf8');
      g('add', '-A'); g('commit', '-q', '-m', 'premier depot du banc');
      for (const f of Object.keys(fichiers)) if (!restants.includes(f)) fs.rmSync(path.join(r, f));
      g('add', '-A'); g('commit', '-q', '-m', 'retrait des pieces');
      return r;
    };

    // Les noms de FICHIERS sont neutres : un terme dans un nom de fichier lèverait l'autre moitié
    // de C4 (« NOM d'un fichier ayant existé »), et le banc ne saurait plus ce qu'il mesure.
    const porteur = batir('porteur', {
      // MISATTRIBUTION : deux noms du MÊME groupe de drapeaux, dans DEUX blobs distincts.
      'piece-a.md': 'Compte rendu remis a ' + NOMS[0] + ' ce matin.\n',
      'piece-b.md': 'Compte rendu remis a ' + NOMS[1] + ' ce matin.\n',
      // DRAPEAUX : les DEUX témoins dans LE MÊME fichier. `a<sigle>ue` doit rester muet (mot
      // entier), `<nom>ique` doit parler (sous-chaîne). Aucune fusion ne satisfait les deux.
      'piece-c.md': 'Le mot a' + SIGLE.toLowerCase() + 'ue est ordinaire, et '
        + NOMS[2] + 'ique est colle a son suffixe.\n',
      // CASSE : la variante en MAJUSCULES d'un identifiant SENSIBLE à la casse doit rester muette.
      'piece-d.md': 'Espace de travail ' + IDENT.toUpperCase() + ' — variante de casse.\n',
    }, []);

    // Le dépôt propre : la MÊME forme, aucun terme de la table nulle part.
    const propre = batir('propre', {
      'piece-a.md': 'Compte rendu remis au client ce matin.\n',
      'piece-b.md': 'Compte rendu remis au client ce matin.\n',
    }, []);

    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const jouer = (repo) => {
      const r = spawnSync(process.execPath, [
        path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduits,
      ], { encoding: 'utf8', timeout: 300000, env: envNu });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    // Un constat C4 de CONTENU, et le terme qu'il nomme.
    const c4contenu = (j) => (j ? (j.findings || []) : [])
      .filter(f => f.regle === 'C4' && /CONTENU d'un fichier de l'historique/.test(f.msg))
      .map(f => ({ terme: (f.msg.match(/« (.+?) »/) || [])[1], fichier: f.where.split(':').slice(1).join(':') }));

    const jp = jouer(porteur);
    const cp = c4contenu(jp);
    const njp = jp ? (jp.non_juge || []).join(' ') : '';

    // --- (A) LE SENS DU COÛT ------------------------------------------------------------------
    const mCout = njp.match(/coût de C4 sur cet artefact : (\d+) passe\(s\)[^—]*— une passe par TERME et par lot en aurait coûté (\d+)/);
    if (!jp) ko('TF-0958 coût : sortie de l oracle inexploitable');
    else if (!mCout) ko('TF-0958 coût : le non_juge ne DÉCLARE PAS le coût de C4 — un gate dont le prix n est pas dit ne se surveille pas, et c est ainsi qu il a atteint 5 min sur le dépôt du pilot');
    else {
      const faites = Number(mCout[1]), naif = Number(mCout[2]);
      if (naif !== NOMS.length + 2) ko(`TF-0958 coût : le compte NAÏF déclaré est ${naif}, attendu ${NOMS.length + 2} (un terme par passe et par lot) — le témoin de référence est faux, la comparaison ne vaut rien`);
      else if (faites !== 3) ko(`TF-0958 coût : ${faites} passe(s) groupée(s) pour ${NOMS.length + 2} termes sur TROIS genres — attendu 3, une par combinaison de drapeaux. Le groupage n a pas eu lieu (ou il a fusionné des drapeaux, ce que le sens B refuse)`);
      else ok(`TF-0958 coût (sens A) : ${faites} passe(s) \`git grep\` groupée(s) pour ${NOMS.length + 2} termes sur trois genres, là où une passe par terme en aurait coûté ${naif} — le coût cesse de croître avec la table, et il est DÉCLARÉ au non_juge`);
    }
    if (jp && !/330,9 s et 295,5 s/.test(njp)) ko('TF-0958 coût : le TEMPS mesuré sur le plus gros dépôt du parc n est pas déclaré au non_juge — la condition de clôture de l item le demande nommément');
    else if (jp) ok('TF-0958 coût : le temps mesuré sur le plus gros dépôt du parc (909 révisions, tables réelles) est déclaré au non_juge, chiffré et daté');

    // --- (B) LE SENS DE LA COUVERTURE ---------------------------------------------------------
    // Sans ces quatre contrôles, « moins cher » et « aveugle » se lisent exactement pareil.
    const sur = (f) => cp.filter(x => x.fichier === f);
    if (!jp) { /* déjà dit */ }
    else if (jp.verdict !== 'FAIL') ko(`TF-0958 couverture : le dépôt porteur ne fait plus échouer la porte (${jp.verdict}) — le groupage a rendu C4 aveugle`);
    else if (sur('piece-a.md').length !== 1 || sur('piece-a.md')[0].terme !== NOMS[0])
      ko(`TF-0958 misattribution : piece-a.md rend ${JSON.stringify(sur('piece-a.md'))} — attendu UN constat nommant « ${NOMS[0] }». La passe groupée ne dit pas quelle aiguille a mordu : sans identification fine, elle nomme le mauvais terme ou les nomme tous`);
    else if (sur('piece-b.md').length !== 1 || sur('piece-b.md')[0].terme !== NOMS[1])
      ko(`TF-0958 misattribution : piece-b.md rend ${JSON.stringify(sur('piece-b.md'))} — attendu UN constat nommant « ${NOMS[1]} »`);
    else ok(`TF-0958 couverture · misattribution : deux noms du MÊME groupe de drapeaux dans deux blobs distincts rendent UN constat chacun, sur SON fichier et sous SON nom — l identification fine a bien eu lieu`);

    if (jp && jp.verdict === 'FAIL') {
      const cC = sur('piece-c.md');
      if (cC.some(x => x.terme === SIGLE)) ko(`TF-0958 drapeaux (trop large) : le sigle « ${SIGLE} » est trouvé À L INTÉRIEUR du mot « a${SIGLE.toLowerCase()}ue » — le \`-w\` de son groupe a été perdu en fusionnant les genres, et la porte se remet à crier sur de la prose ordinaire`);
      else if (!cC.some(x => x.terme === NOMS[2])) ko(`TF-0958 drapeaux (trop étroit) : le nom « ${NOMS[2]} » COLLÉ à son suffixe n est plus trouvé — le \`-w\` du groupe des sigles a débordé sur celui des noms, et l angle est devenu aveugle aux mentions collées`);
      else ok(`TF-0958 couverture · drapeaux : dans LE MÊME fichier, le sigle enfoui dans un mot reste muet (\`-w\` tenu) et le nom collé à un suffixe parle (sous-chaîne tenue) — aucune fusion de drapeaux ne satisferait les deux`);
      const cD = sur('piece-d.md');
      if (cD.length) ko(`TF-0958 casse : la variante en MAJUSCULES d un identifiant SENSIBLE à la casse rend ${cD.length} constat(s) — le \`-i\` du groupe des noms a débordé sur celui des identifiants`);
      else ok('TF-0958 couverture · casse : la variante en MAJUSCULES d un identifiant sensible à la casse reste muette — le `-i` n a pas débordé d un groupe à l autre');
    }

    // --- LE DÉPÔT PROPRE : la même forme, sans aucun terme --------------------------------------
    const jv = jouer(propre);
    const njv = jv ? (jv.non_juge || []).join(' ') : '';
    if (!jv) ko('TF-0958 dépôt propre : sortie de l oracle inexploitable');
    else if (jv.verdict !== 'PASS') ko(`TF-0958 dépôt propre : la MÊME forme sans aucun terme ne rend pas PASS (${jv.verdict}) — le groupage crie sur la structure`);
    else if (c4contenu(jv).length) ko(`TF-0958 dépôt propre : ${c4contenu(jv).length} constat(s) C4 de contenu sur un dépôt sans aucun terme`);
    else if (!/0 relecture\(s\) d'identification fine/.test(njv)) ko('TF-0958 dépôt propre : le non_juge ne montre pas que le cas NOMINAL d une porte (ne rien trouver) ne paie AUCUNE relecture — c est ce qui rend le groupage gratuit en régime normal');
    else ok('TF-0958 dépôt propre : PASS, aucun constat C4, et ZÉRO relecture d identification fine — le prix du groupage n est payé que sur ce qui a mordu');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-0982 (08/09/2026) — LA BORNE DE DATE DES TABLES, ET CE QU'ELLE N'EXCUSE PAS.
//
// LE FAIT PAYÉ, ET IL EST MESURÉ. Le 08/09, cette porte rendait FAIL sur le dépôt du pilot avec
// 939 constats, TOUS de la règle C5, TOUS dans le CONTENU de l'historique — zéro dans l'arbre
// courant, zéro en message de commit. Aucune de ces occurrences n'avait bougé d'un octet : c'est
// la TABLE qui venait de passer de 64 à 65 clés. Chaque extension rendait donc le passé fautif
// RÉTROACTIVEMENT, et c'est la cause directe de TROIS réécritures d'historique en douze jours.
//
// CE QUE CES CAS ÉPROUVENT, et pourquoi il en faut QUATRE :
//   (A) LE DOUBLE SENS DE LA BORNE dans l'histoire — la MÊME occurrence, au MÊME endroit, ne
//       bloque pas sous une borne postérieure à elle et bloque sous une borne antérieure. Une
//       fixture qui ne montrerait que le premier sens prouverait une porte muette, pas une borne ;
//   (B) L'ARBRE COURANT ET LES MESSAGES DE COMMIT NE SONT PAS BORNÉS — c'est le point à ne pas
//       rater, et il se prouve dans UN SEUL dépôt, avec UN SEUL terme et UNE SEULE borne posée
//       si loin dans l'avenir que TOUT lui est antérieur : la mention de l'arbre bloque, celle du
//       message de commit bloque, celle du blob ancien ne bloque pas. Sans ce cas, une borne
//       appliquée partout passerait le banc en désarmant la porte entière ;
//   (C) UN TERME SANS DATE N'EST PAS EXEMPTÉ — bloc `depuis` présent mais muet sur ce terme-là.
//       L'absence de donnée doit rendre la porte plus sévère, jamais plus douce ;
//   (D) UNE DATE MALFORMÉE N'EST PAS UNE DATE — même direction sûre que l'absence. Sans ce cas,
//       une coquille dans la table amnistierait un terme en silence.
//
// LA DATE D'AUTEUR EST LA SEULE LUE, ET LE BANC LE FORCE : les commits de ces dépôts portent une
// date d'AUTEUR de 2020 et une date de VALIDATION d'aujourd'hui — c'est exactement l'état que
// laisse une réécriture d'historique. Un banc qui laisserait les deux dates égales ne verrait pas
// la différence, et la porte pourrait lire la mauvaise sans que rien ne le dise.
//
// LES NOMS SONT INVENTÉS, comme partout dans ce dépôt : aucun nom du parc ne s'écrit ici.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-borne-'));
  try {
    const CLIENT = 'Farfadec';              // nom de client INVENTÉ
    const PRODUIT = 'MachinTruc-Bidule';    // nom de produit INVENTÉ (2 mots, ≥ 8 lettres)
    const VIEUX = '2020-03-04T10:00:00+01:00';   // date d'AUTEUR des commits anciens

    // Les tables vivent sous un parent SÉPARÉ des dépôts : sans cela la résolution par voisinage
    // retrouverait une table quand le cas veut une table précise (même raison qu'au cas TF-0820).
    const tables = path.join(tmp, 'tables');
    fs.mkdirSync(tables);
    const ecrireTable = (nom, obj) => {
      const p = path.join(tables, nom);
      fs.writeFileSync(p, JSON.stringify(obj), 'utf8');
      return p;
    };
    // Le référentiel « nu » n'est pas VIDE, et c'est une nécessité, pas une décoration : un
    // référentiel sans aucun terme fait rendre SKIP à la porte (elle refuse de rendre PASS quand
    // elle n'a rien à chercher), et le cas mesurerait alors l'absence de table au lieu de la
    // borne. Il porte donc UN nom inventé, absent de tous les dépôts de ce banc.
    const tClientsNu = ecrireTable('_clients-nu.json', { noms: ['Grenouillat'], identifiants: [], sigles: [] });
    const tProduitsNu = ecrireTable('_produits-nu.json', { produits: {} });

    const depots = path.join(tmp, 'depots');
    fs.mkdirSync(depots);
    const g = (r, env, ...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8', env });
    /** Un dépôt jetable dont les commits portent une date d'AUTEUR imposée. */
    const batir = (nom, commits) => {
      const r = path.join(depots, nom);
      fs.mkdirSync(r);
      const base = { ...process.env };
      g(r, base, 'init', '-q');
      g(r, base, 'config', 'user.email', 'banc@local');
      g(r, base, 'config', 'user.name', 'banc');
      for (const c of commits) {
        for (const [f, txt] of Object.entries(c.ecrire || {})) fs.writeFileSync(path.join(r, f), txt, 'utf8');
        for (const f of c.retirer || []) fs.rmSync(path.join(r, f), { force: true });
        g(r, base, 'add', '-A');
        // La date de VALIDATION reste celle d'aujourd'hui : c'est l'état d'après une réécriture.
        g(r, { ...base, GIT_AUTHOR_DATE: c.date }, 'commit', '-q', '-m', c.message);
      }
      return r;
    };

    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const jouer = (repo, tClients, tProduits) => {
      const r = spawnSync(process.execPath, [
        path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduits,
      ], { encoding: 'utf8', timeout: 300000, env: envNu });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const bloq = (j) => (j ? (j.findings || []) : []).filter(f => f.sev === 'bloquant');
    const ante = (j) => (j ? (j.findings || []) : []).filter(f => f.sev === 'anteriorite');

    // ---------------------------------------------------------------------------------------
    // (A) LE DOUBLE SENS DE LA BORNE — un fichier créé en 2020 sous un nom porteur, au contenu
    //     porteur, puis RETIRÉ de l'arbre. Il ne reste que dans l'histoire : contenu de blob et
    //     nom de fichier disparu. Deux angles, une seule occurrence, deux bornes.
    // ---------------------------------------------------------------------------------------
    const histoire = batir('histoire', [
      { date: VIEUX, message: 'premier depot du banc',
        ecrire: { ['note-' + CLIENT + '.md']: 'Compte rendu remis a ' + CLIENT + ' ce matin.\n',
                  'garde.md': 'Ce fichier reste, et ne porte aucun nom.\n' } },
      { date: '2020-03-05T10:00:00+01:00', message: 'retrait du compte rendu',
        retirer: ['note-' + CLIENT + '.md'] },
    ]);
    const borneApres = ecrireTable('_clients-apres.json',
      { noms: [CLIENT], identifiants: [], sigles: [], depuis: { [CLIENT]: '2025-01-01' } });
    const borneAvant = ecrireTable('_clients-avant.json',
      { noms: [CLIENT], identifiants: [], sigles: [], depuis: { [CLIENT]: '2019-01-01' } });

    const jA1 = jouer(histoire, borneApres, tProduitsNu);
    const a1 = ante(jA1), b1 = bloq(jA1);
    const njA1 = jA1 ? (jA1.non_juge || []).join(' ') : '';
    if (!jA1) ko('TF-0982 (A) sens 1 : sortie de l oracle inexploitable');
    else if (jA1.verdict !== 'PASS') ko('TF-0982 (A) sens 1 : une occurrence de 2020, ANTERIEURE a l inscription du terme (2025-01-01), fait encore echouer la porte (' + jA1.verdict + ') — ' + b1.map(f => f.regle + ' ' + f.where).join(', ') + '. C est exactement le mecanisme qui a rendu le passe fautif retroactivement');
    else if (a1.length < 2) ko('TF-0982 (A) sens 1 : ' + a1.length + ' anteriorite(s) declaree(s) — attendu au moins 2 (le CONTENU du blob et le NOM du fichier disparu). Une occurrence qui cesse de bloquer sans etre nommee est effacee, pas bornee');
    else if (!a1.every(f => f.sev && f.msg && f.where && /ANTÉRIORITÉ/.test(f.msg))) ko('TF-0982 (A) sens 1 : une anteriorite ne porte pas le contrat findings[] ou ne DIT pas pourquoi elle ne bloque pas');
    else if (!/PASSIF D’ANTÉRIORITÉ : 2 occurrence/.test(njA1)) ko('TF-0982 (A) sens 1 : le passif n est pas COMPTE au non_juge — un passif qui grossit doit rester visible, sinon la borne est une amnistie. non_juge : ' + njA1.slice(-300));
    else ok('TF-0982 (A) sens 1 : occurrence de 2020 sous une borne au 2025-01-01 → PASS, ' + a1.length + ' anteriorite(s) NOMMEES (contenu du blob + nom du fichier disparu) et COMPTEES au non_juge');

    const jA2 = jouer(histoire, borneAvant, tProduitsNu);
    const a2 = ante(jA2), b2 = bloq(jA2);
    if (!jA2) ko('TF-0982 (A) sens 2 : sortie de l oracle inexploitable');
    else if (jA2.verdict !== 'FAIL') ko('TF-0982 (A) sens 2 : la MEME occurrence de 2020, POSTERIEURE a l inscription du terme (2019-01-01), ne fait plus echouer la porte (' + jA2.verdict + ') — la borne est devenue une amnistie generale');
    else if (b2.length < 2) ko('TF-0982 (A) sens 2 : ' + b2.length + ' constat(s) bloquant(s) — attendu au moins 2, les memes deux angles que le sens 1');
    else if (a2.length) ko('TF-0982 (A) sens 2 : ' + a2.length + ' anteriorite(s) declaree(s) alors que la revision est POSTERIEURE a la borne — la comparaison de dates est inversee');
    else ok('TF-0982 (A) sens 2 : la MEME occurrence sous une borne au 2019-01-01 → FAIL, ' + b2.length + ' bloquant(s), zero anteriorite. La borne mord dans les DEUX sens');

    // ---------------------------------------------------------------------------------------
    // (B) L'ARBRE COURANT ET LES MESSAGES DE COMMIT NE SONT PAS BORNÉS — un seul dépôt, un seul
    //     terme, une borne au 2099-01-01 : TOUTE révision lui est antérieure. Si la borne
    //     s'appliquait partout, ce dépôt rendrait PASS alors qu'il porte le nom dans un fichier
    //     SUIVI et dans un MESSAGE de commit — deux choses qu'une édition corrige.
    // ---------------------------------------------------------------------------------------
    const arbre = batir('arbre', [
      { date: VIEUX, message: 'premier depot du banc',
        ecrire: { 'ancien.md': 'Note interne sur ' + PRODUIT + ', a archiver.\n' } },
      { date: '2020-03-05T10:00:00+01:00', message: 'mise en place du connecteur de ' + PRODUIT,
        retirer: ['ancien.md'], ecrire: { 'outil.py': '# TODO : brancher le connecteur de ' + PRODUIT + '\n' } },
    ]);
    const tProduitsLoin = ecrireTable('_produits-loin.json',
      { produits: { [PRODUIT]: 'Produit-99' }, depuis: { [PRODUIT]: '2099-01-01' } });

    const jB = jouer(arbre, tClientsNu, tProduitsLoin);
    const bB = bloq(jB), aB = ante(jB);
    const dansArbre = bB.filter(f => /contenu d'un fichier suivi/.test(f.msg));
    const dansMessage = bB.filter(f => /MESSAGE de commit/.test(f.msg));
    const dansHisto = aB.filter(f => /CONTENU d'un fichier de l'historique/.test(f.msg));
    if (!jB) ko('TF-0982 (B) : sortie de l oracle inexploitable');
    else if (jB.verdict !== 'FAIL') ko('TF-0982 (B) : une borne au 2099-01-01 desarme la porte ENTIERE (' + jB.verdict + ') — l arbre courant et les messages de commit ont ete bornes eux aussi, alors qu ils se corrigent par une edition');
    else if (!dansArbre.length) ko('TF-0982 (B) : le nom present dans un fichier SUIVI ne bloque plus — l arbre courant a ete borne');
    else if (!dansMessage.length) ko('TF-0982 (B) : le nom present dans un MESSAGE de commit ne bloque plus — les messages ont ete bornes');
    else if (!dansHisto.length) ko('TF-0982 (B) : aucune anteriorite sur le blob ancien du MEME depot — le temoin manque, et le cas ne prouve pas que la borne s applique bien QUELQUE PART');
    else ok('TF-0982 (B) : sous une borne au 2099-01-01, dans UN SEUL depot — le fichier SUIVI bloque (' + dansArbre.length + '), le MESSAGE de commit bloque (' + dansMessage.length + '), et le blob ancien du meme terme est une anteriorite (' + dansHisto.length + '). L arbre et les messages ne sont pas bornes');

    // ---------------------------------------------------------------------------------------
    // (C) UN TERME SANS DATE N'EST PAS EXEMPTÉ — le bloc `depuis` existe, il date un AUTRE terme.
    //     Sans ce cas, une table incomplète amnistierait ses termes non datés en silence, ce qui
    //     est la panne exactement inverse de celle qu'on répare.
    // ---------------------------------------------------------------------------------------
    const sansDate = ecrireTable('_clients-sans-date.json',
      { noms: [CLIENT], identifiants: [], sigles: [], depuis: { 'UnAutreTerme': '2099-01-01' } });
    const jC = jouer(histoire, sansDate, tProduitsNu);
    const njC = jC ? (jC.non_juge || []).join(' ') : '';
    if (!jC) ko('TF-0982 (C) : sortie de l oracle inexploitable');
    else if (jC.verdict !== 'FAIL') ko('TF-0982 (C) : un terme ABSENT du bloc `depuis` est exempte (' + jC.verdict + ') — l absence de date vaut amnistie, et une table incomplete desarme la porte');
    else if (ante(jC).length) ko('TF-0982 (C) : ' + ante(jC).length + ' anteriorite(s) sur un terme non date — la borne d un AUTRE terme a deborde');
    else if (!/Termes datés : 0\/1/.test(njC)) ko('TF-0982 (C) : le non_juge ne DIT pas combien de termes portent une date — une table a moitie datee juge a moitie sans borne, et le lecteur doit le savoir. non_juge : ' + njC.slice(-300));
    else ok('TF-0982 (C) : un terme absent du bloc `depuis` reste BLOQUANT (' + bloq(jC).length + ' constat(s)), et le non_juge declare « Termes dates : 0/1 »');

    // ---------------------------------------------------------------------------------------
    // (D) UNE DATE MALFORMÉE N'EST PAS UNE DATE — même direction sûre que l'absence.
    // ---------------------------------------------------------------------------------------
    const malformee = ecrireTable('_clients-malformee.json',
      { noms: [CLIENT], identifiants: [], sigles: [], depuis: { [CLIENT]: 'depuis toujours' } });
    const jD = jouer(histoire, malformee, tProduitsNu);
    if (!jD) ko('TF-0982 (D) : sortie de l oracle inexploitable');
    else if (jD.verdict !== 'FAIL') ko('TF-0982 (D) : une date MALFORMEE vaut exemption (' + jD.verdict + ') — une coquille dans la table amnistie un terme en silence');
    else if (ante(jD).length) ko('TF-0982 (D) : ' + ante(jD).length + ' anteriorite(s) sur une borne illisible');
    else ok('TF-0982 (D) : une date malformee au bloc `depuis` ne borne rien — le terme reste BLOQUANT (' + bloq(jD).length + ' constat(s))');

    // ---------------------------------------------------------------------------------------
    // (E) LE TÉMOIN DE LA DATE LUE — les commits de ces dépôts portent une date de VALIDATION
    //     d'aujourd'hui et une date d'AUTEUR de 2020. Si la porte lisait la date de validation,
    //     le cas (A) sens 1 aurait rendu FAIL : c'est donc la date d'AUTEUR qui est lue, et
    //     c'est ce qui rend la borne survivable à une réécriture d'historique.
    // ---------------------------------------------------------------------------------------
    const dValid = spawnSync('git', ['-C', histoire, 'log', '-1', '--format=%cI %aI'], { encoding: 'utf8' }).stdout.trim();
    const [dc, da] = dValid.split(' ');
    if (!dc || !da) ko('TF-0982 (E) : les dates du dernier commit du depot jetable sont illisibles — le temoin ne mesure rien');
    else if (dc.slice(0, 4) === da.slice(0, 4)) ko('TF-0982 (E) : la date de VALIDATION (' + dc.slice(0, 10) + ') et la date d AUTEUR (' + da.slice(0, 10) + ') tombent la meme annee — le banc ne distingue plus les deux, et le cas (A) passerait meme si la porte lisait la mauvaise');
    else ok('TF-0982 (E) : les commits du banc portent une date d AUTEUR de ' + da.slice(0, 10) + ' et une date de VALIDATION du ' + dc.slice(0, 10) + ' — l etat d apres une reecriture. Le cas (A) sens 1 ne rend PASS que si la porte lit la date d AUTEUR');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log('SELF-TEST quality-oracles');
oks.forEach(m => console.log('  ✅ ' + m));
fails.forEach(m => console.log('  ❌ ' + m));
console.log(fails.length ? `\n❌ ${fails.length} échec(s).` : `\n✅ PASS (${oks.length} contrôles).`);
process.exit(fails.length ? 1 : 0);
