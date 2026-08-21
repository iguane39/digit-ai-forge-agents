#!/usr/bin/env node
// run-oracles v2 — Orchestrateur de la loi qualité (noyau générique).
// Détecte les domaines d'un livrable (extension + trigger_files + content_patterns),
// lance les oracles CLI du registre EN PARALLÈLE (pool borné, cache par hash), agrège
// un verdict PASS / FAIL / INCONCLUSIF, tient le BILAN 4 ÉTATS de chaque fichier
// (jugé / exempté / délégué / signalé — somme = nb de fichiers, aucun silence),
// applique les exemptions tracées (.oracles-exemptions.json, expirées = FAIL),
// détecte les types réels (magic bytes ≠ extension = FAIL), et écrit un JOURNAL
// (<cible>.oracles.json) + un HISTORIQUE (*-historique.jsonl, anti-recopie §5).
//   node run-oracles.mjs <fichier|dossier> [--json] [--profil <nom|chemin>] [--no-cache]
//   exit 0 = PASS · 1 = FAIL · 2 = INCONCLUSIF (0 PASS, 0 FAIL : personne n'a jugé).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILLDIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLSROOT = path.resolve(SKILLDIR, '..');
const args = process.argv.slice(2);
const JSONOUT = args.includes('--json');
const NOCACHE = args.includes('--no-cache');
const target = args.find(a => !a.startsWith('--'));
if (!target || !fs.existsSync(target)) { console.error('usage: node run-oracles.mjs <fichier|dossier> [--json] [--profil <nom|chemin>] [--no-cache]'); process.exit(2); }

// ---- profil (C1) : politiques contextuelles — nom (→ profils/<nom>.json) ou chemin ------------
const profArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : (process.env.QO_PROFIL || 'digit-ai');
const profilPath = fs.existsSync(profArg) ? path.resolve(profArg) : path.join(SKILLDIR, 'profils', profArg + '.json');
if (!fs.existsSync(profilPath)) { console.error('profil introuvable : ' + profArg); process.exit(2); }
const profilHash = crypto.createHash('sha256').update(fs.readFileSync(profilPath)).digest('hex').slice(0, 12);
let PROFIL = {}; try { PROFIL = JSON.parse(fs.readFileSync(profilPath, 'utf8')); } catch {}
const IGNORE_RX = (PROFIL.ignore_patterns || []).map(p => { try { return new RegExp(p); } catch { return null; } }).filter(Boolean);

// ---- C1/§6 : niveau d'exigence (note | diffuse | production) — proportionnalité tracée --------
const NIVEAUX_VALIDES = ['note', 'diffuse', 'production'];
const NIVEAU = args.includes('--niveau') ? args[args.indexOf('--niveau') + 1] : (process.env.QO_NIVEAU || 'diffuse');
if (!NIVEAUX_VALIDES.includes(NIVEAU)) { console.error('niveau inconnu : ' + NIVEAU + ' (attendu : ' + NIVEAUX_VALIDES.join('|') + ')'); process.exit(2); }
// PLANCHER codé en dur (jamais lisible depuis un profil) : un profil ne peut pas abaisser §2/§5.
const PLANCHER = ['Format / livraison / versioning', 'Sécurité / secrets', 'Calculs / chiffres', 'Traçabilité des affirmations chiffrées'];
const NIVCONF = (PROFIL.niveaux || {})[NIVEAU] || { exclus: [], warn_toleres: NIVEAU !== 'production' };
const EXCLUS = new Set(NIVCONF.exclus || []);
const plancherViole = [...EXCLUS].filter(d => PLANCHER.includes(d));
if (plancherViole.length) { console.error('profil invalide : domaine(s) du plancher non désactivable exclus au niveau ' + NIVEAU + ' : ' + plancherViole.join(' ; ')); process.exit(2); }
const WARN_TOLERES = NIVCONF.warn_toleres !== false;

const registry = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'references', 'registre-oracles.json'), 'utf8'));
const IGNORE = new Set(['node_modules', '.git', '.venv', 'dist', 'build', 'old', 'Old', '__pycache__', 'fixtures']);
function walk(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (IGNORE.has(e.name) || e.name.startsWith('.oracles') || e.name.startsWith('_oracles') || IGNORE_RX.some(rx => rx.test(e.name))) continue;
    const fp = path.join(p, e.name);
    if (e.isDirectory()) out.push(...walk(fp)); else if (!/\.oracles[.-]/.test(e.name)) out.push(fp);
  }
  return out;
}
const files = walk(target);
const targetIsFile = fs.statSync(target).isFile();   // une cible fichier est un fichier comme les autres (exemptions + bilan) ; seul un dossier-target injecté via trigger_files est hors bilan
const extOf = f => path.extname(f).toLowerCase();
const rel = f => path.relative(process.cwd(), f) || f;
const resolveCmd = (arr, file) => arr.map(s => s.replace('{skilldir}', SKILLDIR).replace('{skillsroot}', SKILLSROOT).replace('{profil}', profilPath).replace('{file}', file));

// ---- C2 : magic bytes — le type réel ne doit pas contredire l'extension déclarée ---------------
const MAGIC = [[Buffer.from('504b0304', 'hex'), 'zip', ['.zip', '.pptx', '.potx', '.docx', '.xlsx', '.jar', '.epub', '.odt', '.ods', '.odp']],
  [Buffer.from('25504446', 'hex'), 'pdf', ['.pdf']], [Buffer.from('89504e47', 'hex'), 'png', ['.png']],
  [Buffer.from('ffd8ff', 'hex'), 'jpeg', ['.jpg', '.jpeg']], [Buffer.from('47494638', 'hex'), 'gif', ['.gif']]];
function magicMismatch(f) {
  let head; try { head = Buffer.alloc(8); const fd = fs.openSync(f, 'r'); fs.readSync(fd, head, 0, 8, 0); fs.closeSync(fd); } catch { return null; }
  for (const [sig, type, exts] of MAGIC) if (head.subarray(0, sig.length).equals(sig)) return exts.includes(extOf(f)) ? null : { type, ext: extOf(f) || '(sans extension)' };
  return null;
}

// ---- C2 : exemptions tracées (données d'entrée, lecture seule — jamais modifiées par la boucle)
const exemptPath = fs.statSync(target).isFile() ? path.join(path.dirname(target), '.oracles-exemptions.json') : path.join(target, '.oracles-exemptions.json');
let exemptions = [];
if (fs.existsSync(exemptPath)) { try { exemptions = JSON.parse(fs.readFileSync(exemptPath, 'utf8')); } catch { console.error('⚠ .oracles-exemptions.json illisible — ignoré'); } }
const today = new Date().toISOString().slice(0, 10);
const findExempt = (f, domaine) => exemptions.find(e => (path.basename(f) === e.fichier || rel(f).endsWith(e.fichier)) && e.domaine === domaine);

// ---- C5 : cache par hash (contenu + script + profil) — jamais de cache sur FAIL ni SKIP --------
// TF-0428 (lot Client-B 20260820a, 21/08) — même doctrine que render_page.py (TF-0230) : sous un
// arbre de LIVRAISON (output/, old/, dist/, build/), aucun journal à côté du livrable — ce que le
// client reçoit ne contient pas les traces de son audit. Les sidecars vont dans un dossier
// frère `_oracles/` (déjà ignoré par walk()), et l'emplacement est annoncé en fin d'exécution.
const SEGMENTS_LIVRAISON = new Set(['output', 'old', 'Old', 'dist', 'build']);
const sousLivraison = p => path.resolve(p).split(/[\\/]/).some(s => SEGMENTS_LIVRAISON.has(s));
const dossierSidecars = fs.statSync(target).isFile() ? path.dirname(target) : target;
const horsLivraison = sousLivraison(target) ? path.join(dossierSidecars, '_oracles') : null;
if (horsLivraison) { try { fs.mkdirSync(horsLivraison, { recursive: true }); } catch {} }
const cheminSidecar = (suffixe, nomDossier) => {
  if (fs.statSync(target).isFile()) return horsLivraison ? path.join(horsLivraison, path.basename(target) + suffixe) : target + suffixe;
  return horsLivraison ? path.join(horsLivraison, nomDossier) : path.join(target, nomDossier);
};
const cachePath = cheminSidecar('.oracles-cache.json', '.oracles-cache.json');
let cache = {}; if (!NOCACHE && fs.existsSync(cachePath)) { try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch {} }
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const fileHash = new Map();
const hashOf = f => { if (!fileHash.has(f)) { try { fileHash.set(f, sha(fs.readFileSync(f))); } catch { fileHash.set(f, 'ERR'); } } return fileHash.get(f); };
function cacheKey(o, file) {
  const script = (o.cmd || []).find(x => /\.(mjs|py)$/.test(x)) || '';
  const sp = script.replace('{skilldir}', SKILLDIR).replace('{skillsroot}', SKILLSROOT);
  const scriptH = fs.existsSync(sp) ? sha(fs.readFileSync(sp)) : 'noscript';
  return [o.domaine, hashOf(file), scriptH, profilHash, NIVEAU].join('|');   // §6 — un PASS de niveau inférieur n'est jamais recyclé à un niveau supérieur
}

// ---- exécution d'un oracle CLI (async, timeout du registre, contrat JSON strict) ---------------
function runCli(o, file) {
  return new Promise(res => {
    const parts = resolveCmd(o.cmd, file);
    execFile(parts[0], parts.slice(1), { encoding: 'utf8', timeout: o.timeout_ms || 120000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      let obj = null; const out = (stdout || '').trim();
      try { obj = JSON.parse(out); } catch { const i = out.indexOf('{'); if (i >= 0) { try { obj = JSON.parse(out.slice(i)); } catch {} } }
      const status = error ? (typeof error.code === 'number' ? error.code : null) : 0;
      let verdict = obj && typeof obj.verdict === 'string' ? obj.verdict.toUpperCase() : null;
      if (!['PASS', 'FAIL', 'SKIP'].includes(verdict)) verdict = status === 0 ? (obj ? 'PASS' : 'SKIP') : status === 2 ? 'SKIP' : (error && error.killed ? 'FAIL' : status === null ? 'SKIP' : 'FAIL');
      const nWarn = obj && Array.isArray(obj.findings) ? obj.findings.filter(f => f && f.sev === 'warn').length : 0;
      const detail = obj && Array.isArray(obj.findings) && obj.findings.length ? obj.findings.map(f => f.msg).slice(0, 2).join(' ; ')
        : (!obj && status === 0 ? 'contrat JSON non émis — verdict non retenu (P5/R1)' : (error && error.killed ? 'timeout oracle (' + (o.timeout_ms || 120000) + ' ms)' : (status === null ? 'oracle non exécutable' : '')));
      res({ verdict, detail, nWarn });
    });
  });
}

// ---- planification : matching ext / trigger_files / content_patterns (P3) ---------------------
const TEXT_EXT = new Set(['.md', '.html', '.htm', '.txt', '.csv', '.json', '.yml', '.yaml', '.svg', '.css']);
const contents = new Map();
for (const f of files) { try { if (TEXT_EXT.has(extOf(f)) && fs.statSync(f).size <= 1024 * 1024) contents.set(f, fs.readFileSync(f, 'utf8')); } catch {} }
const contentMatches = o => (Array.isArray(o.content_patterns) && o.content_patterns.length)
  ? files.filter(f => contents.has(f) && o.content_patterns.some(p => { try { return new RegExp(p, 'im').test(contents.get(f)); } catch { return false; } })) : [];

const results = [], actions = [], tasks = [];
const etat = new Map(); // C2 — bilan : fichier → jugé | exempté | délégué | signalé
const setEtat = (f, e) => { const rank = { 'jugé': 4, 'exempté': 3, 'délégué': 2, 'signalé': 1 }; if ((rank[e] || 0) > (rank[etat.get(f)] || 0)) etat.set(f, e); };
const exemptes = [];

for (const f of files) {                                    // C2 — types réels
  const mm = magicMismatch(f);
  if (mm) { results.push({ domaine: 'Format / livraison / versioning', file: rel(f), verdict: 'FAIL', detail: `type réel ${mm.type} ≠ extension déclarée ${mm.ext} (magic bytes)` }); setEtat(f, 'jugé'); }
}

for (const o of registry.oracles) {
  let matches = o.ext === 'any' ? [target] : (Array.isArray(o.ext) && o.ext.length ? files.filter(f => o.ext.includes(extOf(f))) : []);
  if (Array.isArray(o.trigger_files) && o.trigger_files.length && files.some(f => o.trigger_files.includes(path.basename(f)))) matches = [...new Set([...matches, target])];
  // Un oracle qui déclare des extensions ne juge QUE celles-là : content_patterns affine le
  // périmètre, il ne l'élargit pas hors du type de fichier visé (08/08/2026). Sans ce filtre,
  // un oracle de page HTML jugeait un .md contenant le motif — le registre se déclenchait sur
  // lui-même, puisqu'il documente les motifs de déclenchement. Les oracles sans `ext` (5 au
  // registre : programme-formation, interop, plan-de-mission, fiche-ice, cdc-cadrage) gardent
  // un comportement inchangé : pour eux, content_patterns reste le seul critère.
  const parContenu = (Array.isArray(o.ext) && o.ext.length)
    ? contentMatches(o).filter(f => o.ext.includes(extOf(f)))
    : contentMatches(o);
  matches = [...new Set([...matches, ...parContenu])];
  if (!matches.length) continue;
  if (o.type === 'cli' && o.cmd && EXCLUS.has(o.domaine)) continue;   // §6 — domaine exclu à ce niveau (CLI seulement ; délégations toujours signalées, R6)
  if (o.type === 'cli' && o.cmd) {
    for (const f of matches) {
      if (targetIsFile || f !== target) {
        const ex = findExempt(f, o.domaine);
        if (ex) {
          if (ex.expire && ex.expire < today) { results.push({ domaine: o.domaine, file: rel(f), verdict: 'FAIL', detail: `exemption EXPIRÉE le ${ex.expire} (${ex.justification || 'sans justification'}) — re-vérifier ou renouveler` }); setEtat(f, 'jugé'); }
          else { exemptes.push({ domaine: o.domaine, file: rel(f), justification: ex.justification || '(sans justification)', expire: ex.expire || 'sans échéance' }); setEtat(f, 'exempté'); }
          continue;
        }
      }
      tasks.push({ o, f });
    }
  } else {
    actions.push({ domaine: o.domaine, type: o.type, skill: o.skill || null, statut: o.statut, hint: o.type === 'skill' ? ('invoquer le skill « ' + o.skill + ' »') : (o.cmd_ref || 'vérification manuelle (' + o.checklist + ')') });
    for (const f of matches) if (targetIsFile || f !== target) setEtat(f, 'délégué');
  }
}

// ---- C5 : exécution — cache d'abord, puis pool parallèle borné (ordre de restitution préservé) -
const POOL = 4;
const slots = new Array(tasks.length);
let cacheHits = 0;
const pending = [];
tasks.forEach((t, i) => {
  const key = t.f === target ? null : cacheKey(t.o, t.f);
  if (key && cache[key] && cache[key].verdict === 'PASS') { slots[i] = { domaine: t.o.domaine, file: rel(t.f), verdict: 'PASS', detail: (cache[key].detail ? cache[key].detail + ' ' : '') + '(cache)' }; cacheHits++; }
  else pending.push({ ...t, i, key });
});
async function pool() {
  let idx = 0;
  const worker = async () => {
    while (idx < pending.length) {
      const t = pending[idx++];
      let { verdict, detail, nWarn } = await runCli(t.o, t.f);
      if (!WARN_TOLERES && verdict === 'PASS' && nWarn > 0) { verdict = 'FAIL'; detail = nWarn + ' avertissement(s) promu(s) en échec (niveau ' + NIVEAU + ') — ' + (detail || ''); }
      slots[t.i] = { domaine: t.o.domaine, file: rel(t.f), verdict, detail };
      if (t.key && verdict === 'PASS') cache[t.key] = { verdict, detail: detail || '', date: new Date().toISOString() };
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, pending.length) }, worker));
}
await pool();
for (const s of slots) if (s) results.push(s);
for (const t of tasks) if (targetIsFile || t.f !== target) setEtat(t.f, 'jugé');   // tout fichier réellement passé à un oracle est « jugé » — y compris la cible fichier unique ; seul le dossier-target (trigger_files) reste hors bilan
if (!NOCACHE) { try { fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1), 'utf8'); } catch {} }

// ---- P1 (R4) + C2 — couverture : extensions orphelines, fichiers SANS extension, bilan --------
const known = new Set(registry.oracles.flatMap(o => Array.isArray(o.ext) ? o.ext : []));
const uncovered = [...new Set(files.map(extOf).filter(e => e && !known.has(e)))];
if (uncovered.length) actions.push({ domaine: 'Couverture registre', type: 'manual', skill: null, statut: 'todo', hint: 'extension(s) sans oracle au registre : ' + uncovered.join(' ') + ' — règle §4 (définir + remonter un oracle)' });
const noExt = files.filter(f => !extOf(f));
if (noExt.length) actions.push({ domaine: 'Couverture registre', type: 'manual', skill: null, statut: 'todo', hint: 'fichier(s) SANS extension : ' + noExt.map(f => path.basename(f)).join(' · ') + ' — type à identifier, règle §4' });
const bilan = { 'jugé': [], 'exempté': [], 'délégué': [], 'signalé': [] };
for (const f of files) bilan[etat.get(f) || 'signalé'].push(rel(f));
const bilanOk = Object.values(bilan).reduce((a, l) => a + l.length, 0) === files.length;

const nFail = results.filter(r => r.verdict === 'FAIL').length;
const nPass = results.filter(r => r.verdict === 'PASS').length;
const nSkip = results.filter(r => r.verdict === 'SKIP').length;
const verdict = nFail ? 'FAIL' : (nPass ? 'PASS' : 'INCONCLUSIF');
const journal = { cible: target, date_iso: new Date().toISOString(), registre_version: registry.version, profil: path.basename(profilPath, '.json'), niveau: NIVEAU, verdict, resume: { pass: nPass, fail: nFail, skip: nSkip, cache: cacheHits }, bilan_fichiers: bilan, bilan_complet: bilanOk, exemptions_actives: exemptes, resultats: results, actions_couverture: actions };
const journalPath = cheminSidecar('.oracles.json', '_oracles-journal.json');
fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2), 'utf8');
if (horsLivraison && !JSON_OUT) console.error('journaux d\'oracles écrits HORS livraison (TF-0428) : ' + horsLivraison);
const histoPath = journalPath.replace(/\.json$/, '-historique.jsonl');
fs.appendFileSync(histoPath, JSON.stringify({ date_iso: journal.date_iso, verdict, profil: journal.profil, niveau: NIVEAU, resume: journal.resume, fails: results.filter(r => r.verdict === 'FAIL').map(r => r.domaine + ':' + r.file) }) + '\n', 'utf8');
const exitCode = verdict === 'FAIL' ? 1 : verdict === 'INCONCLUSIF' ? 2 : 0;

if (JSONOUT) { process.stdout.write(JSON.stringify(journal)); process.exit(exitCode); }
const L = '─'.repeat(70);
console.log(L); console.log('Oracles qualité — ' + target + '  [profil : ' + journal.profil + ' · niveau : ' + NIVEAU + ']'); console.log(L);
for (const r of results) console.log(`  ${r.verdict === 'PASS' ? '✅' : r.verdict === 'FAIL' ? '❌' : '➖'} [${r.domaine}] ${r.file}${r.detail ? ' — ' + r.detail : ''}`);
for (const e of exemptes) console.log(`  🔶 [${e.domaine}] ${e.file} — EXEMPTÉ : ${e.justification} (échéance ${e.expire})`);
if (actions.length) { console.log('\n  Couverture — domaines à vérifier hors oracle CLI (action) :'); for (const a of actions) console.log(`   • [${a.domaine}] ${a.hint}${a.statut === 'todo' ? ' (oracle à outiller)' : ''}`); }
console.log(`\n  Bilan fichiers (${files.length}) : jugé=${bilan['jugé'].length} · exempté=${bilan['exempté'].length} · délégué=${bilan['délégué'].length} · signalé=${bilan['signalé'].length}${bilanOk ? '' : '  ⚠ BILAN INCOMPLET — silence détecté'}${cacheHits ? ' · cache=' + cacheHits : ''}`);
console.log('\n' + (verdict === 'FAIL'
  ? `❌ NON CONFORME — ${nFail} oracle(s) en échec (${nPass} PASS, ${nSkip} SKIP). Corriger la source puis relancer.`
  : verdict === 'INCONCLUSIF'
    ? `⚠️ INCONCLUSIF — aucun oracle n'a réellement jugé (0 PASS, 0 FAIL, ${nSkip} SKIP). Un run sans jugement n'est pas un ✓ (§5) : installer les outils manquants ou traiter les actions de couverture.`
    : `✅ CONFORME${actions.length ? ' (couverture partielle)' : ''} — ${nPass} PASS, ${nSkip} SKIP, 0 échec.${actions.length ? ' (voir actions de couverture ci-dessus)' : ''}`));
console.log('Journal : ' + journalPath);
process.exit(exitCode);
