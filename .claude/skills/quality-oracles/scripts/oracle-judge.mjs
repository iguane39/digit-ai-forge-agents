#!/usr/bin/env node
// oracle-judge — Domaine « Jugement rédactionnel (LLM-juge externe) ». AVIS OUTILLÉ, pas verdict
// déterministe : statut registre « partiel » à demeure. Extériorité R1 : seconde instance LLM
// (CLI `claude -p`) avec rubrique FIGÉE versionnée (profil juge.rubrique) — jamais l'auteur qui
// se note. CLI absent → SKIP motivé, jamais un PASS par défaut. Invocation explicite uniquement
// (pas d'auto-déclenchement au registre). Contrat JSON commun · exit 0/1/2.
// Rubrique « lecteur visé » (--lecteur-vise, TF-1392/TF-1394, 13/10/2026) : 2 relecteurs jouent le
// lecteur visé, ce script prépare leur consigne et agrège leurs lectures ; SIGNALEMENT, exit 0.
// Mode d'emploi : references/lecteur-vise.md.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ecrivainDeContrat } from './lib/contrat.mjs';
import { candidatsCli, choisirCli } from './lib/cli-claude.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ dernier: true });

const args = process.argv.slice(2);
// Options à valeur de la rubrique « lecteur visé » (TF-1392, TF-1394) : voir plus bas.
const AVEC_VALEUR = ['--profil', '--model', '--lecteur', '--fiche', '--lectures', '--precedente', '--revue', '--ecrire', '--preparer', '--juge'];
const file = args.find((a, i) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[i - 1]));
const pArg = args.includes('--profil') ? args[args.indexOf('--profil') + 1] : null;
const opt = (n) => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const opts = (n) => args.flatMap((a, i) => a === '--' + n && args[i + 1] ? String(args[i + 1]).split(',') : []).filter(Boolean);
// --model / QO_JUGE_MODELE (02/09/2026) : le modèle par défaut hérité de l'environnement peut
// être refusé par une CLI `claude` plus ancienne que lui (« does not support this model »), et le
// juge rendait alors un SKIP permanent — un oracle qui ne mesure JAMAIS n'est pas un repli, c'est
// une porte morte.
// D-19 (a) du pilot (18/10/2026) : sans drapeau ni variable, le juge demande la FAMILLE `opus`, qui suit la dernière
// version, au lieu du défaut de la CLI : la CLI npm 2.1.107 du poste servait claude-opus-4-6 par défaut (12 sessions
// de juge depuis le 13/10). La CLI elle-même est choisie par lib/cli-claude.mjs, la plus récente du poste.
const MODELE = args.includes('--model') ? args[args.indexOf('--model') + 1] : (process.env.QO_JUGE_MODELE || 'opus');
const DOM = 'Jugement rédactionnel (LLM-juge externe)';
const NJ = ['véracité factuelle (oracles déterministes)', 'AVIS OUTILLÉ non déterministe : deux runs peuvent diverger — ne jamais promouvoir en verdict', 'qualité visuelle (render/pptx)'];
const out = (verdict, findings, nj, code) => { process.stdout.write(contratJSON({ oracle: 'oracle-judge', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj })); process.exit(code); };
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);

const SKILLDIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let rub = path.join(SKILLDIR, 'references', 'rubrique-juge.md');
let modeProfil = null;
if (pArg) { try { const jg = JSON.parse(fs.readFileSync(pArg, 'utf8')).juge || {}; const r = jg.rubrique; modeProfil = jg.mode || null; if (r) rub = path.isAbsolute(r) ? r : path.join(SKILLDIR, r); } catch {} }
const LECTEUR_VISE = args.includes('--lecteur-vise') || modeProfil === 'lecteur-vise';
if (LECTEUR_VISE && (args.includes('--lecteur-vise') || !pArg || rub === path.join(SKILLDIR, 'references', 'rubrique-juge.md'))) rub = path.join(SKILLDIR, 'references', 'rubrique-lecteur-vise.md');
if (!fs.existsSync(rub)) out('SKIP', [], [...NJ, 'rubrique introuvable : ' + rub], 2);

// Résolution de la CLI du juge (inchangée ; mise en fonction pour servir aussi les 2 relecteurs).
const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
const cliJuge = () => {
// Compat win32 (correctif 24/07/2026, aucun changement de logique de jugement) : le shim npm
// `claude` est un .cmd, non exécutable par spawnSync sans shell (ENOENT) — résoudre le cli.js
// réel et le lancer via node ; à défaut, comportement POSIX inchangé.
// D-19 (a) du pilot (18/10/2026) : parmi les CLI du poste (paquet npm, binaire de chaque extension VS Code,
// QO_JUGE_CLI), la plus récente — la première trouvée était le cli.js npm 2.1.107, qui refuse les modèles 5.x.
let jugeCmd = 'claude', jugePre = [];
if (process.platform === 'win32') {
  // la sortie de `where` peut être mal décodée (codepage console ≠ utf8) : %APPDATA% reste le premier candidat npm
  const shim = (which.stdout || '').split(/\r?\n/).find(Boolean) || null;
  const choisie = choisirCli(candidatsCli({ shim }));
  if (choisie) { jugeCmd = choisie.cmd; jugePre = choisie.pre; }
}
return { jugeCmd, jugePre };
};

// ── RUBRIQUE « LECTEUR VISÉ » (TF-1392, TF-1394 ; décisions D-2 (a) et D-3 (a) du 13/10/2026) ──
// Deux relecteurs indépendants jouent le lecteur visé ; ce script PRÉPARE leur consigne et AGRÈGE
// leurs lectures (lib/lecteur-vise.mjs). Le jugement de sens est celui des modèles ; l'agrégation
// est mécanique et se rejoue SANS appel de modèle par --lectures. SIGNALEMENT SEULEMENT : verdict
// PASS, exit 0, constats en `warn` — aucune remise n'est bloquée (revue le 2026-11-10).
if (LECTEUR_VISE) {
  const lv = await import('./lib/lecteur-vise.mjs');
  const NJ_LV = [...NJ, 'SIGNALEMENT seulement (décision D-2 (a) du 13/10/2026) : un constat retenu ne bloque jamais la remise ; promotion au blocage sur décision humaine après une mesure sur 100 unités au moins (revue le 2026-11-10)',
    'la périphrase que le relecteur redit sans la voir (« un nom de dépôt ») : règle du sujet nommé, côté pilot'];
  const doc = fs.readFileSync(file, 'utf8');
  const fiche = opt('fiche');
  const lecteur = lv.lecteurVise({ explicite: opt('lecteur'), ficheTexte: fiche && fs.existsSync(fiche) ? fs.readFileSync(fiche, 'utf8') : '', documentTexte: doc });
  if (!lecteur) out('SKIP', [], [...NJ_LV, 'LECTEUR VISÉ NON JOUÉ : aucun lecteur déclaré (--lecteur "<qui, pour décider quoi>", --fiche <fiche de conception>, ou clé lecteur: / destinataire: du front matter) — on ne joue pas un lecteur qu on ne connaît pas'], 2);
  const consigne = fs.readFileSync(rub, 'utf8') + '\n\n--- LECTEUR VISÉ ---\n' + lecteur + '\n\n--- LIVRABLE À LIRE ---\n' + doc.slice(0, 60000);
  const prep = opt('preparer');
  if (prep) {
    fs.mkdirSync(prep, { recursive: true });
    const c = path.join(prep, 'consigne-relecteur.md');
    fs.writeFileSync(c, consigne, 'utf8');
    out('SKIP', [{ sev: 'info', msg: 'consigne des relecteurs écrite : ' + c, where: path.basename(file) }], [...NJ_LV, 'consigne préparée, lectures à faire : donner ' + c + ' à 2 relecteurs indépendants (2 sous-agents isolés), enregistrer chaque réponse JSON, puis rejouer avec --lectures <a.json>,<b.json>'], 2);
  }
  const brutes = [];
  for (const f of opts('lectures')) {
    try { brutes.push(JSON.parse(fs.readFileSync(f, 'utf8'))); }
    catch (e) { out('SKIP', [], [...NJ_LV, 'lecture illisible ou introuvable : ' + f + ' (' + e.message.slice(0, 80) + ')'], 2); }
  }
  const ecrire = opt('ecrire');
  if (!brutes.length && opt('juge')) {
    if (which.status !== 0) out('SKIP', [], [...NJ_LV, 'CLI claude absent — relecteurs non exécutables (jamais simulés)'], 2);
    const { jugeCmd, jugePre } = cliJuge();
    for (const nom of ['A', 'B']) {
      const rr = spawnSync(jugeCmd, [...jugePre, '-p', consigne, '--output-format', 'text', ...(MODELE ? ['--model', MODELE] : [])], { encoding: 'utf8', timeout: 600000 });
      let lu = null; try { lu = JSON.parse(((rr.stdout || '').match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch {}
      if (rr.error || rr.status !== 0 || !lu || !Array.isArray(lu.unites)) out('SKIP', [], [...NJ_LV, 'relecteur ' + nom + ' en échec ou hors contrat (' + (rr.error?.code || rr.status) + ') — non retenu'], 2);
      lu.relecteur = lu.relecteur || nom;
      if (ecrire) fs.writeFileSync(ecrire.replace(/\.json$/i, '') + '.lecture-' + nom + '.json', JSON.stringify(lu, null, 1), 'utf8');
      brutes.push(lu);
    }
  }
  const ls = lv.lectures(brutes);
  if (!ls.length) out('SKIP', [], [...NJ_LV, 'LECTEUR VISÉ NON JOUÉ : ni --lectures <a.json>,<b.json> (lectures enregistrées, aucun coût), ni --juge claude (2 appels de modèle), ni --preparer <dossier> (consigne pour 2 sous-agents)'], 2);
  if (ls.length < 2 || ls.slice(0, 2).some((l) => !Array.isArray(l.unites))) out('SKIP', [], [...NJ_LV, 'deux relecteurs exigés, chacun avec unites[] : ' + ls.length + ' lecture(s) fournie(s) — un relecteur seul refuse 17 % à 44 % des textes acceptés (mesure du 13/10/2026), il ne se retient pas'], 2);
  const [A, B] = ls;
  A.relecteur = A.relecteur || 'A'; B.relecteur = B.relecteur || 'B';
  if (A.relecteur === B.relecteur) B.relecteur += ' (2)';
  const agg = lv.agreger(A, B);
  let precedent = null;
  const pp = opt('precedente');
  if (pp) { try { precedent = JSON.parse(fs.readFileSync(pp, 'utf8')); } catch { precedent = null; } }
  const repetees = lv.questionsRepetees(agg, precedent);
  const F = [];
  const w = (msg, where) => F.push({ sev: 'warn', msg, where: where || path.basename(file) });
  const inf = (msg, where) => F.push({ sev: 'info', msg, where: where || path.basename(file) });
  inf(`lecteur visé : ${agg.unites} unité(s) lues par 2 relecteurs (${A.relecteur}, ${B.relecteur}) ; ${agg.retenus.length} constat(s) retenu(s) par accord, ${agg.desaccords.length} désaccord(s) tracé(s), ${agg.absentes.length} unité(s) absente(s) d une lecture — SIGNALEMENT, jamais bloquant (D-2 (a) du 13/10/2026, revue le 2026-11-10)`);
  for (const r of agg.retenus) w(`LECTEUR VISÉ — CONSTAT RETENU (2 relecteurs sur 2 : ${r.verdicts.join(' / ')}) : « ${r.extrait} » — question du lecteur : ${r.questions[0] || '(aucune question écrite)'} — suite à écrire dans REVUE.md : réécrit, ou maintenu avec le fait qu une réécriture changerait, cité`, r.id);
  for (const d of agg.desaccords) inf(`DÉSACCORD TRACÉ, non retenu : refusée par ${d.refuse_par} seulement — « ${d.extrait} »${d.question ? ' — question : ' + d.question : ''}`, d.id);
  for (const a of agg.absentes) inf(`UNITÉ ABSENTE de la lecture de ${a.absente_de} : non jugée par accord`, a.id);
  for (const q of repetees) w(`QUESTION RÉPÉTÉE d une lecture à l autre — à MONTRER À L HUMAIN AVANT LA REMISE (D-3 (a) du 13/10/2026) : « ${q.question_maintenant} » (lecture précédente : « ${q.question_avant} »)`, q.id);
  if (pp && !precedent) w('lecture précédente annoncée et illisible : ' + pp + ' — les questions répétées ne sont pas cherchées');
  const revue = opt('revue');
  if (revue) {
    if (!fs.existsSync(revue)) w('REVUE.md annoncée et introuvable : ' + revue + ' — les suites des constats retenus ne sont pas vérifiées');
    else {
      const s = lv.suitesDansRevue(agg.retenus, fs.readFileSync(revue, 'utf8'));
      for (const id of s.sansSuite) w(`SUITE ABSENTE de REVUE.md pour le constat retenu ${id} : réécrit, ou maintenu avec le fait cité`, id);
      for (const m of s.motifSansFait) w(`MOTIF SANS FAIT CITÉ (D-3 (a) du 13/10/2026) : « changerait un fait » doit citer le fait protégé, entre guillemets, entre accents graves ou par son nombre — ${m.ligne}`, m.id);
    }
  } else if (agg.retenus.length) inf('suites des constats retenus non vérifiées : --revue <REVUE.md> absent');
  const BORNE = 60;
  const findings = F.length > BORNE ? [...F.slice(0, BORNE), { sev: 'info', msg: `sortie bornée : ${BORNE} constats rendus sur ${F.length} — la lecture agrégée complète est écrite par --ecrire`, where: path.basename(file) }] : F;
  if (ecrire) fs.writeFileSync(ecrire, JSON.stringify({ rubrique: 'lecteur-vise', date: new Date().toISOString(), document: path.basename(file), lecteur, relecteurs: [A.relecteur, B.relecteur], unites: agg.unites, retenus: agg.retenus, desaccords: agg.desaccords, absentes: agg.absentes, questions_a_remonter: repetees }, null, 1), 'utf8');
  out('PASS', findings, NJ_LV, 0);
}

if (which.status !== 0) out('SKIP', [], [...NJ, 'CLI claude absent — juge externe non exécutable (jamais simulé)'], 2);
const { jugeCmd, jugePre } = cliJuge();
const prompt = fs.readFileSync(rub, 'utf8') + '\n\n--- LIVRABLE À ÉVALUER ---\n' + fs.readFileSync(file, 'utf8').slice(0, 60000);
const r = spawnSync(jugeCmd, [...jugePre, '-p', prompt, '--output-format', 'text', ...(MODELE ? ['--model', MODELE] : [])], { encoding: 'utf8', timeout: 180000 });
if (r.error || r.status !== 0) out('SKIP', [], [...NJ, 'appel du juge en échec (' + (r.error?.code || r.status) + ')' + (MODELE ? ' — modèle demandé : ' + MODELE : ' — aucun modèle explicite : réessayer avec --model <alias>')], 2);
let j = null; try { j = JSON.parse((r.stdout.match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch {}
if (!j || !['PASS', 'FAIL'].includes(j.verdict)) out('SKIP', [], [...NJ, 'sortie du juge hors contrat — non retenue (P5/R1)'], 2);
const findings = (Array.isArray(j.findings) ? j.findings.slice(0, 5) : []).map(f => ({ sev: f.sev === 'bloquant' ? 'bloquant' : 'warn', msg: String(f.msg || '').slice(0, 200), where: String(f.where || path.basename(file)) }));
findings.unshift({ sev: 'info', msg: 'scores juge : ' + JSON.stringify(j.scores || {}), where: path.basename(file) });
out(j.verdict, findings, NJ, j.verdict === 'FAIL' ? 1 : 0);
