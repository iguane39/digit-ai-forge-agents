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
// TF-0437 (lot Client-B 20260820b) : oracle-perf publie le compte DOM en DEUX temps — total et hors
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
// TF-0428 (lot Client-B 20260820a) : sous un arbre de LIVRAISON (output/, old/, dist/), run-oracles
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
      let cmd = fx.cmd.map(s => s.replace('{skilldir}', SKILLDIR).replace('{fixture}', fxFile));
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
        const texte = JSON.stringify(sortie?.findings || []);
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

console.log('SELF-TEST quality-oracles');
oks.forEach(m => console.log('  ✅ ' + m));
fails.forEach(m => console.log('  ❌ ' + m));
console.log(fails.length ? `\n❌ ${fails.length} échec(s).` : `\n✅ PASS (${oks.length} contrôles).`);
process.exit(fails.length ? 1 : 0);
