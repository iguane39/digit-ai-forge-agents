#!/usr/bin/env node
// self-test — oracle du skill sur LUI-MÊME (et sur les autres skills installés).
// Vérifie : (1) frontmatter de chaque SKILL.md — champ `name` présent, `description`
// ≤ 1024 caractères (règle d'import qui a déjà fait échouer une version) ; (2) le
// registre JSON parse ; (3) chaque oracle CLI (.mjs) du registre existe et compile
// (`node --check`). exit 0 = PASS, 1 = FAIL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePython, skipMotiveParPrerequis, modulesAbsents, commandeInstallation } from './lib/python.mjs';
import { frontmatter } from './lib/frontmatter.mjs';
import { MARQUEUR_PILOT, resolvePilot, motifPilotAbsent } from './lib/pilot.mjs';
import { MARQUEUR_FORGES, resolveForges, motifForgesAbsentes } from './lib/forges.mjs';
import { motifDeSkip, ecrivainDeContrat } from './lib/contrat.mjs';

const SKILLDIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLSROOT = path.resolve(SKILLDIR, '..');
// TF-1064 — le dépôt du PILOT, troisième racine possible d'un oracle indexé ici (le premier
// est `oracle-ecriture.mjs`). `null` quand il est introuvable : les contrôles qui en dépendent
// DÉCLARENT alors un SKIP motivé — un marqueur non résolu ferait échouer le lancement, et un
// lancement en échec se lit comme un FAIL, donc comme la preuve attendue sur une fixture rouge.
const PILOT = resolvePilot(SKILLDIR);
// TF-1334 — la racine des forges sœurs, résolue comme au lanceur (lib/forges.mjs).
const FORGES = resolveForges(SKILLDIR);
const fails = [], oks = [];
const ok = m => oks.push(m);
const ko = m => fails.push(m);

// TF-1861 (19/10/2026) — UNE SUPPRESSION SE VÉRIFIE, ELLE NE SE SUPPOSE PAS. Sous Node v25.2.1 Windows,
// `fs.rmSync` d'un fichier au NOM ACCENTUÉ ne le supprime pas et ne lève aucune erreur
// (`existsSync` reste vrai) : `git add -A` n'enregistre alors aucun retrait, et les bancs TF-1483 et
// TF-1448 (B) échouent pour une cause de poste. Les dépôts jetables de ces bancs RETIRENT des fichiers
// accentués, c'est leur objet : les noms ne s'abrègent donc pas en ASCII. Le retrait passe par une suite
// de voies et s'arrête dès que le fichier a disparu ; si aucune n'y parvient il LÈVE, et le banc dit
// pourquoi au lieu de mesurer un dépôt faux. Mesuré le 19/10/2026 sous Node v24.16.0 : `rmSync` seul suffit
// (voie 1) ; les voies de repli ne sont éprouvées que par injection (voir le banc « TF-1861 » plus bas).
const VOIES_DE_RETRAIT = [
  (p) => fs.rmSync(p, { force: true }),
  (p) => fs.unlinkSync(p),
  (p) => spawnSync('git', ['-C', path.dirname(p), 'rm', '-f', '-q', '--', path.basename(p)], { encoding: 'utf8' }),
];
function retirerVerifie(chemin, voies = VOIES_DE_RETRAIT) {
  for (const voie of voies) {
    try { voie(chemin); } catch { /* la voie suivante reprend la main */ }
    if (!fs.existsSync(chemin)) return;
  }
  throw new Error('suppression non effective après ' + voies.length + ' voie(s) : ' + chemin);
}
// Banc de `retirerVerifie`, à double sens. Vert : un fichier au nom accentué disparaît par la suite réelle,
// puis par la voie de repli quand la première ne fait rien (le comportement de Node v25 simulé par une voie
// muette). Rouge : si AUCUNE voie ne supprime, l'appel lève — c'est ce qui sépare la nouvelle garde de
// l'ancien `rmSync` muet, qui laissait un dépôt jetable faux et un banc rouge sans cause lisible.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1861-'));
  try {
    const muette = () => { /* simule rmSync de Node v25 : ni suppression, ni erreur */ };
    const reel = path.join(tmp, 'synthèse-été.md'), repli = path.join(tmp, 'bilan-Frégate.md'), tenace = path.join(tmp, 'rapport-été.md');
    for (const f of [reel, repli, tenace]) fs.writeFileSync(f, 'x\n', 'utf8');
    let leve = null;
    retirerVerifie(reel);
    retirerVerifie(repli, [muette, (p) => fs.unlinkSync(p)]);
    try { retirerVerifie(tenace, [muette, muette]); } catch (e) { leve = e; }
    if (fs.existsSync(reel)) ko('TF-1861 : la suite réelle de retrait laisse un fichier au nom accentué');
    else if (fs.existsSync(repli)) ko('TF-1861 : la voie de repli ne prend pas la main quand la première ne supprime rien');
    else if (!leve || !fs.existsSync(tenace)) ko('TF-1861 sens rouge : un retrait que AUCUNE voie n\'effectue doit LEVER (le fichier est resté), sinon le banc mesure un dépôt faux en silence');
    else ok('TF-1861 : un fichier au nom accentué est retiré et la suppression est vérifiée ; une voie muette cède à la suivante, et un retrait qu\'aucune voie n\'effectue lève au lieu de passer');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// --- le lecteur de frontmatter vit dans lib/frontmatter.mjs depuis TF-1337 : le contrôle rapide des
// skills de l'index (frontmatter-skills-index.mjs) l'importe aussi — les deux jugent avec le MÊME lecteur.

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

// (1-bis) TF-2493 (13/11/2026, décision R-58 du 13/11/2026) — LA RECETTE QUI LIVRE UN SKILL JUGE LE MANIFESTE DE LIVRAISON. Le 13/11/2026,
// `versions-livrees.json` de forge-agents portait 7 écarts au constat de `maj-versions-livrees.mjs --constat` (experts-forge, forge-agents,
// oeil-critique, plan-d-amelioration, prompt-analyzer-l99, deux registres dont celui de quality-oracles à 2.60.0 pour 2.61.0) : le constat
// existait depuis TF-0336 mais aucune recette ne le lisait, donc personne ne le voyait avant qu'une session ne le mesure en passant. Il est
// désormais un ROUGE de cette recette, celle que les agents jouent avant chaque commit sous `.claude/skills/` : un skill livré dont la version
// (ou celle de son registre) n'est pas portée au manifeste dans le même commit fait échouer la recette, `--livrer` en est le remède. Sens
// rouge/vert joué sur un dépôt jetable (un skill, un manifeste aligné puis un manifeste en retard) ; sur le dépôt réel, le constat est lu.
// Une copie installée ou un dépôt qui n'est pas forge-agents n'a pas ce script : SKIP motivé, jamais un vert inventé.
{
  const RACINE_FORGE = path.resolve(SKILLDIR, '..', '..', '..');
  const MAJ = path.join(RACINE_FORGE, 'maj-versions-livrees.mjs');
  if (!fs.existsSync(MAJ) || !fs.existsSync(path.join(RACINE_FORGE, 'versions-livrees.json'))) {
    ok('TF-2493 : pas de maj-versions-livrees.mjs ni de versions-livrees.json à la racine de ce dépôt (copie installée ou autre dépôt) — le constat de livraison est sans objet ici, et c\'est dit');
  } else {
    const constat = (racine) => spawnSync(process.execPath, [path.join(racine, 'maj-versions-livrees.mjs'), '--constat'], { cwd: racine, encoding: 'utf8' });
    const jetable = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2493-'));
    try {
      fs.copyFileSync(MAJ, path.join(jetable, 'maj-versions-livrees.mjs'));
      fs.mkdirSync(path.join(jetable, '.claude', 'skills', 'jouet'), { recursive: true });
      const skillMd = (v) => `---\nname: jouet\ndescription: skill jetable de la recette\nmetadata:\n  version: "${v}"\n---\n# jouet\n`;
      fs.writeFileSync(path.join(jetable, '.claude', 'skills', 'jouet', 'SKILL.md'), skillMd('1.0.0'));
      const manifeste = (v) => JSON.stringify({ skills: { jouet: { version: v, source: 'frontmatter SKILL.md' } } });
      fs.writeFileSync(path.join(jetable, 'versions-livrees.json'), manifeste('1.0.0'));
      const aligne = constat(jetable);
      fs.writeFileSync(path.join(jetable, '.claude', 'skills', 'jouet', 'SKILL.md'), skillMd('1.1.0'));
      const enRetard = constat(jetable);
      const sensOk = aligne.status === 0 && enRetard.status === 1 && /jouet : livré 1\.0\.0, dépôt 1\.1\.0/.test(enRetard.stdout);
      const reel = constat(RACINE_FORGE);
      if (!sensOk) ko(`TF-2493 sens rouge/vert : le constat de livraison ne se joue pas dans les deux sens (aligné exit ${aligne.status}, en retard exit ${enRetard.status} : ${(enRetard.stdout || enRetard.stderr || '').trim().slice(0, 160)})`);
      else if (reel.status !== 0) ko(`TF-2493 : versions-livrees.json diverge des skills montés — ${(reel.stdout || reel.stderr || '').trim().split(/\r?\n/).filter((l) => l.startsWith('  ·')).join(' ') || 'sortie illisible'} ; node maj-versions-livrees.mjs --livrer, dans le commit qui livre le skill`);
      else ok('TF-2493 : versions-livrees.json aligné sur les skills montés (constat exit 0) ; le constat échoue sur un manifeste en retard (jouet 1.0.0 contre 1.1.0) et passe sur un manifeste aligné');
    } finally { fs.rmSync(jetable, { recursive: true, force: true }); }
  }
}

// (1-ter) TF-1337 (26/09/2026) — LE CONTRÔLE RAPIDE JUGE COMME LA RECETTE. `accueil-factory` est
// entré au dépôt le 22/09 avec une description de 1 244 caractères, faute d'un contrôle joué AVANT
// l'enregistrement. `frontmatter-skills-index.mjs` le joue sur les seuls skills de l'index, avec le
// lecteur ci-dessus. Sur le dépôt qui porte ces skills, `--tous` doit refuser EXACTEMENT les skills
// que (1) vient de refuser — ni plus, ni moins.
{
  const depotSkills = spawnSync('git', ['-C', SKILLSROOT, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (depotSkills.status !== 0) ok('TF-1337 : les skills jugés ne sont pas dans un dépôt git (copie installée) — le contrôle de l index est sans objet ici, et c est dit');
  else {
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'frontmatter-skills-index.mjs'),
      depotSkills.stdout.trim(), '--tous', '--json'], { encoding: 'utf8' });
    let j = null; try { j = JSON.parse(r.stdout); } catch { /* sortie illisible : dite ci-dessous */ }
    const RE_REFUS = /^([^ ]+) : (?:frontmatter illisible|champ '(?:name|description)' absent|description \d+ > 1024)/;
    const parRecette = new Set(fails.map((m) => (m.match(RE_REFUS) || [])[1]).filter(Boolean));
    const parControle = new Set((j?.defauts || []).map((d) => path.posix.basename(d.skill)));
    const memes = !!j && parRecette.size === parControle.size && [...parRecette].every((s) => parControle.has(s));
    memes
      ? ok(`TF-1337 : le contrôle rapide (--tous, ${j.juges.length} skill(s) de l index) refuse exactement les skills que la recette refuse (${parControle.size})`)
      : ko(`TF-1337 : contrôle rapide et recette divergent — recette : ${[...parRecette].join(', ') || 'aucun'} ; contrôle : ${[...parControle].join(', ') || 'aucun'}`
        + (j ? '' : ` (sortie illisible : ${(r.stderr || '').slice(0, 120)})`));
  }
}

// (1b) TF-1022 (11/09) — CHAQUE CHEMIN CITÉ PAR UN SKILL.md SE RÉSOUT. L'archive de digit-ai-pptx
// chargeait « toujours » trois références qu'elle ne contenait pas : un agent produisait un deck sans
// charte, sans que rien ne le signale. Un chemin se résout dans le skill, dans un skill voisin (un
// renvoi entre skills du socle est légitime) ou chez le pilot. Sens rouge : une citation fantôme.
const RE_CHEMIN_CITE = /(?<![\w/.-])((?:references|scripts|assets|fixtures|templates|profils)\/[\w./-]+\.[A-Za-z0-9]+)/g;
const voisins = fs.readdirSync(SKILLSROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(SKILLSROOT, d.name));
const citesAbsents = (dir, txt) => [...new Set([...txt.matchAll(RE_CHEMIN_CITE)].map(m => m[1]))]
  .filter(rel => !fs.existsSync(path.join(dir, rel)) && !voisins.some(v => fs.existsSync(path.join(v, rel)))
    && !(PILOT && fs.existsSync(path.join(PILOT, rel))));
let citesJuges = 0;
for (const v of voisins) {
  const sf = path.join(v, 'SKILL.md');
  if (!fs.existsSync(sf)) continue;
  const absents = citesAbsents(v, fs.readFileSync(sf, 'utf8'));
  citesJuges++;
  if (absents.length) ko(`${path.basename(v)} : SKILL.md cite ${absents.length} chemin(s) introuvable(s) — ${absents.slice(0, 4).join(', ')} (TF-1022)`);
}
const fantome = citesAbsents(SKILLDIR, 'Charger `references/charte-fantome-tf1022.md` — toujours.');
fantome.length === 1 ? ok(`TF-1022 : chemins cités résolus sur ${citesJuges} SKILL.md, et une citation fantôme est bien vue (sens rouge)`)
  : ko('TF-1022 : la citation fantôme n est pas vue — le contrôle des chemins cités est aveugle');

// (1c) TF-1021 (11/09) — un AGENT compilé qui dit charger un skill le trouve. Quatre agents du
// pipeline de propale chargeaient des skills qu'aucune forge ne versionnait. Sens rouge : un agent
// synthétique qui cite un skill inexistant.
const RE_SKILL_CITE = /skills? `([a-z0-9][a-z0-9-]+)`/g;
const skillsCitesAbsents = (txt) => [...new Set([...txt.matchAll(RE_SKILL_CITE)].map(m => m[1]))]
  .filter(n => !fs.existsSync(path.join(SKILLSROOT, n, 'SKILL.md')));
const AGENTS = path.join(SKILLSROOT, '..', 'agents');
if (fs.existsSync(AGENTS)) {
  let n = 0;
  for (const f of fs.readdirSync(AGENTS).filter(x => x.endsWith('.md'))) {
    const abs = skillsCitesAbsents(fs.readFileSync(path.join(AGENTS, f), 'utf8'));
    n++;
    if (abs.length) ko(`agent ${f} : charge ${abs.join(', ')}, absent(s) de ${SKILLSROOT} (TF-1021)`);
  }
  skillsCitesAbsents('mandat opératoire : charger le skill `skill-fantome-tf1021`').length === 1
    ? ok(`TF-1021 : skills cités par ${n} agent(s) présents, et un skill fantôme est bien vu (sens rouge)`)
    : ko('TF-1021 : le skill fantôme n est pas vu — le contrôle agents → skills est aveugle');
} else ok('TF-1021 : aucun dossier agents/ à côté des skills — contrôle agents → skills non applicable ici');

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

// (2c) TF-1006 (16/09/2026) — UN REGISTRE ÉDITÉ HORS DE SA SOURCE EST DÉTECTABLE.
// Le 10/09, une remontée §4 exemplaire a été écrite dans la COPIE INSTALLÉE du registre. Elle
// était juste ; sa localisation la condamnait, la propagation d'ouverture de session recopiant le
// versionné par-dessus l'installé. Aucun contrôle ne l'a dit à son auteur, et le seul qui voyait
// l'écart (K2/K11 du pilot) ne se joue qu'à l'ouverture d'un run, pas là où l'on écrit.
// LA COMPARAISON EST DIRECTIONNELLE, et c'est tout ce qui la rend utilisable : la source EN AVANCE
// sur la copie est l'état NORMAL après une édition, jusqu'à la propagation suivante — l'accuser
// ferait rougir le banc à chaque commit et le contrôle serait désarmé dans la semaine. Un domaine
// présent à l'INSTALLÉ et absent de la SOURCE, lui, n'a qu'une explication : quelqu'un a écrit
// dans la copie, et son travail est à une propagation de sa disparition.
// CE QUE CE CONTRÔLE NE VOIT PAS : une entrée EXISTANTE retouchée dans la copie sans domaine neuf.
// Séparer cette retouche d'une source légitimement en avance demande un journal de propagation,
// qui vit chez le pilot (K11 d'oracle-skills, TF-1012) — ici on tient le geste qui a coûté, la
// remontée §4 d'un domaine NOUVEAU, qui est la forme qu'une remontée prend toujours.
const domainesEnTrop = (source, installe) => installe.filter(d => !source.includes(d));
{
  const RACINE_INSTALLEE = path.resolve(path.join(os.homedir(), '.claude', 'skills'));
  const sousInstalle = p => { const r = path.relative(RACINE_INSTALLEE, path.resolve(p)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
  const lireDomaines = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).oracles.map(o => o.domaine); } catch { return null; } };
  const REG = path.join('references', 'registre-oracles.json');
  const cote = sousInstalle(SKILLDIR) ? 'installé' : 'source';
  // Le côté d'en face : depuis la source, la copie installée ; depuis la copie, la source
  // versionnée, cherchée sur les pistes du parc (mêmes pistes que lib/pilot.mjs, dépôt voisin).
  const pistesSource = [
    process.env.FORGE_ROOT && path.join(process.env.FORGE_ROOT, 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles'),
    path.join('c:\\dev', 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles'),
    path.join(os.homedir(), '.digit-ai-forge', 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles'),
  ].filter(Boolean).filter(p => !sousInstalle(p));
  const cheminInstalle = path.join(RACINE_INSTALLEE, 'quality-oracles', REG);
  const cheminSource = cote === 'source' ? path.join(SKILLDIR, REG)
    : (pistesSource.map(p => path.join(p, REG)).find(f => fs.existsSync(f)) || null);
  const dSource = cheminSource ? lireDomaines(cheminSource) : null;
  const dInstalle = fs.existsSync(cheminInstalle) ? lireDomaines(cheminInstalle) : null;
  if (!dSource) ok(`TF-1006 : source versionnée du registre introuvable depuis ce poste (pistes : ${pistesSource.join(' · ') || '(aucune)'}) — comparaison non jouée, et dite`);
  else if (!dInstalle) ok(`TF-1006 : aucune copie installée du registre sous ${RACINE_INSTALLEE} — comparaison sans objet sur ce poste`);
  else {
    const enTrop = domainesEnTrop(dSource, dInstalle);
    enTrop.length
      ? ko(`TF-1006 : ${enTrop.length} domaine(s) au registre INSTALLÉ et absent(s) de la SOURCE — « ${enTrop.join(' » · « ')} ». `
        + `Le registre a été édité dans la copie (${cheminInstalle}) : la prochaine propagation l'écrasera en silence. Rapatrier vers ${cheminSource}`)
      : ok(`TF-1006 : le registre installé (${dInstalle.length} domaine(s)) n'ajoute rien à sa source (${dSource.length}) — aucune édition hors source`);
  }
  // Sens ROUGE et sens VERT sur la MÊME fonction : sans eux, le vert ci-dessus serait indiscernable
  // d'un contrôle aveugle, et la tolérance à « source en avance » d'une tolérance à tout.
  const rouge = domainesEnTrop(['A', 'B'], ['A', 'B', 'C']);
  const vert = domainesEnTrop(['A', 'B', 'C'], ['A', 'B']);
  (rouge.length === 1 && rouge[0] === 'C' && vert.length === 0)
    ? ok('TF-1006 : un domaine ajouté à la copie est VU (sens rouge), et une source en avance sur sa copie ne fait pas rougir (sens vert)')
    : ko(`TF-1006 : la comparaison directionnelle ne tient pas ses deux sens — rouge ${JSON.stringify(rouge)}, vert ${JSON.stringify(vert)}`);
}

// (2d) TF-1006 — le banc du GÉNÉRATEUR d'oracles est joué ici. `scaffold-oracle` est le chemin
// par lequel passe une remontée §4 : son refus d'écrire dans la copie installée est le juge qui
// empêche la récidive, et un juge dont le banc n'est joué nulle part ne juge rien.
{
  const bancWao = path.join(SKILLSROOT, 'write-an-oracle', 'scripts', 'self-test.mjs');
  if (!fs.existsSync(bancWao)) ok('TF-1006 : write-an-oracle absent de ce parc — banc du générateur non joué, et dit');
  else {
    const r = spawnSync(process.execPath, [bancWao], { encoding: 'utf8', timeout: 120000 });
    const derniere = (r.stdout || '').trim().split('\n').pop() || '';
    r.status === 0 ? ok(`TF-1006 : banc de write-an-oracle vert — ${derniere.replace(/^\s*[✅❌]\s*/, '')}`)
      : ko(`TF-1006 : banc de write-an-oracle en échec (exit ${r.status}) — ${((r.stdout || '') + (r.stderr || '')).split('\n').filter(l => l.includes('❌')).join(' · ').slice(0, 300)}`);
  }
}

// (3) oracles CLI : script présent + compile (.mjs via node --check, .py via py_compile)
const have = c => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }).status === 0;
if (reg) for (const o of reg.oracles) {
  if (o.type !== 'cli' || !o.cmd) continue;
  const script = o.cmd.find(x => /\.(mjs|py)$/.test(x));
  if (!script) continue;
  if (script.includes(MARQUEUR_PILOT) && !PILOT) {
    ok('oracle du pilot : SKIP motivé (' + path.basename(script) + ') — ' + motifPilotAbsent(SKILLDIR));
    continue;
  }
  if (script.includes(MARQUEUR_FORGES) && !FORGES) {
    ok('oracle d une forge sœur : SKIP motivé (' + path.basename(script) + ') — ' + motifForgesAbsentes(SKILLDIR));
    continue;
  }
  const p = script.replace('{skilldir}', SKILLDIR).replace('{skillsroot}', SKILLSROOT)
    .replace(MARQUEUR_PILOT, PILOT || MARQUEUR_PILOT).replace(MARQUEUR_FORGES, FORGES || MARQUEUR_FORGES);
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

// (3c) TF-1334 (26/09/2026) — PLUS AUCUN CHEMIN ABSOLU DANS UNE COMMANDE DU REGISTRE, et la
// racine des forges sœurs se résout par `{forges}`. LE FAIT : 23 commandes sur 71 portaient
// `c:/dev/…` — vraies sur un poste, fausses sur tout autre, et fausses EN SILENCE : un script
// introuvable échouait au lancement, que le lanceur lisait comme un FAIL. Trois preuves, chacune
// dans ses deux sens : le registre lui-même, le résolveur sur des arbres jetables, et le lanceur
// sur un registre jouet (forge présente → elle juge ; forge absente → SKIP motivé).
{
  const RE_ABSOLU = /(?:^|=)(?:[A-Za-z]:[\\/]|\\\\|\/(?!\/))/;
  const absolus = (oracles) => oracles.flatMap((o) => (o.cmd || [])
    .filter((s) => typeof s === 'string' && RE_ABSOLU.test(s)).map((s) => `${o.domaine} → ${s}`));
  if (reg) {
    const trouves = absolus(reg.oracles);
    trouves.length
      ? ko(`TF-1334 : ${trouves.length} commande(s) du registre portent un chemin ABSOLU — ${trouves.slice(0, 3).join(' · ')} ; `
        + 'passer par {forges}, {pilot}, {skillsroot} ou {skilldir}')
      : ok(`TF-1334 : aucune des ${reg.oracles.filter((o) => o.cmd).length} commandes du registre ne porte de chemin absolu`);
  }
  const rouge = absolus([{ domaine: 'jouet', cmd: ['node', 'c:/dev/digit-ai-forge-x/oracles/o.mjs', '{file}'] }]);
  const vert = absolus([{ domaine: 'jouet', cmd: ['node', '{forges}/digit-ai-forge-x/oracles/o.mjs', '{file}'] }]);
  (rouge.length === 1 && vert.length === 0)
    ? ok('TF-1334 : un chemin absolu est VU (sens rouge), un chemin par {forges} ne l est pas (sens vert)')
    : ko(`TF-1334 : le contrôle des chemins absolus ne tient pas ses deux sens — rouge ${rouge.length}, vert ${vert.length}`);

  const tmpF = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-forges-'));
  try {
    // Le résolveur : FORGE_ROOT d'abord, sinon le parent du dépôt digit-ai-forge-agents. Sens
    // rouge : le parent d'un dépôt qui N'EST PAS la forge des outils ne définit pas la racine.
    const racineA = path.join(tmpF, 'racine-a');
    fs.mkdirSync(racineA);
    const skillB = path.join(tmpF, 'racine-b', 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles');
    const skillC = path.join(tmpF, 'racine-c', 'un-autre-depot', '.claude', 'skills', 'quality-oracles');
    fs.mkdirSync(skillB, { recursive: true });
    fs.mkdirSync(skillC, { recursive: true });
    const parEnv = resolveForges(skillB, { FORGE_ROOT: racineA });
    const parParent = resolveForges(skillB, {});
    const horsForge = resolveForges(skillC, {});
    (parEnv === racineA && parParent === path.join(tmpF, 'racine-b') && horsForge !== path.join(tmpF, 'racine-c'))
      ? ok('TF-1334 : {forges} se résout par FORGE_ROOT, à défaut par le parent du dépôt digit-ai-forge-agents — et jamais par le parent d un autre dépôt (sens rouge)')
      : ko(`TF-1334 : résolution de {forges} fausse — FORGE_ROOT → ${parEnv}, parent de la forge → ${parParent}, autre dépôt → ${horsForge}`);

    // Le lanceur, sur un registre jouet : le script d'une forge PRÉSENTE juge ; celui d'une forge
    // ABSENTE rend un SKIP motivé — avant TF-1334, le même lancement se lisait comme un FAIL.
    const racineJ = path.join(tmpF, 'racine-jouet');
    const oraclesJ = path.join(racineJ, 'digit-ai-forge-jouet', 'oracles');
    fs.mkdirSync(oraclesJ, { recursive: true });
    fs.writeFileSync(path.join(oraclesJ, 'oracle-jouet.mjs'),
      "process.stdout.write(JSON.stringify({ oracle: 'oracle-jouet', verdict: 'PASS', findings: [] }));\n");
    const cibleJ = path.join(tmpF, 'cible.md');
    fs.writeFileSync(cibleJ, '# jouet\n');
    const regJ = path.join(tmpF, 'registre-jouet.json');
    fs.writeFileSync(regJ, JSON.stringify({ version: 'jouet', oracles: [
      { domaine: 'forge présente', ext: ['.md'], type: 'cli', statut: 'ok',
        cmd: ['node', '{forges}/digit-ai-forge-jouet/oracles/oracle-jouet.mjs', '{file}'] },
      { domaine: 'forge absente', ext: ['.md'], type: 'cli', statut: 'ok',
        cmd: ['node', '{forges}/digit-ai-forge-absente/oracles/oracle-jouet.mjs', '{file}'] },
    ] }));
    const rj = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), cibleJ, '--json',
      '--registre', regJ, '--no-cache'], { encoding: 'utf8', env: { ...process.env, FORGE_ROOT: racineJ } });
    let jr = null; try { jr = JSON.parse(rj.stdout); } catch { /* sortie illisible : dite ci-dessous */ }
    const resultat = (d) => (jr?.resultats || []).find((x) => x.domaine === d) || {};
    const present = resultat('forge présente'), absent = resultat('forge absente');
    (present.verdict === 'PASS' && absent.verdict === 'SKIP' && /introuvable/.test(absent.detail || ''))
      ? ok('TF-1334 : au lanceur, le script d une forge sœur présente JUGE (PASS), celui d une forge absente rend un SKIP motivé — jamais un FAIL muet')
      : ko(`TF-1334 : lanceur — forge présente ${present.verdict || '?'}, forge absente ${absent.verdict || '?'} (${(absent.detail || rj.stderr || '').slice(0, 160)})`);
  } finally { fs.rmSync(tmpF, { recursive: true, force: true }); }
}

// (3c bis) TF-1406 (constat du 24/09/2026) — oracle-restitution était inscrit à la vue humaine
// depuis le 15/08 et absent de ce registre machine : le lanceur ne le jouait jamais. Il y entre
// par son périmètre déclaratif : une page qui porte data-restitution sur son <body> le déclenche
// (sens rouge), une page qui ne le porte pas ne le déclenche pas (sens vert).
if (reg) {
  const restit = reg.oracles.find((o) => (o.cmd || []).some((s) => /oracle-restitution\.mjs$/.test(s)));
  const declenche = (html) => !!restit && (restit.content_patterns || []).some((p) => new RegExp(p, 'im').test(html));
  const avec = declenche('<!doctype html>\n<html lang="fr">\n<body data-restitution="rapport">\n</body></html>');
  const sans = declenche('<!doctype html>\n<html lang="fr">\n<body class="page">\n<p>data-restitution</p></body></html>');
  (restit && avec && !sans && !(restit.ext || []).length)
    ? ok('TF-1406 : oracle-restitution est au registre machine, déclenché par une page qui déclare data-restitution, jamais par une autre')
    : ko(`TF-1406 : oracle-restitution ${restit ? 'présent' : 'ABSENT du registre machine'} — page déclarée ${avec ? 'routée' : 'NON routée'}, page non déclarée ${sans ? 'ROUTÉE' : 'non routée'}, ext ${JSON.stringify(restit?.ext)}`);
}

// (3c ter) TF-1687 (14/10/2026) — deux oracles livrés le 14/10 par des forges sœurs entrent au
// registre machine, en INVOCATION EXPLICITE : oracle-exploitabilite (forge-design, X0-X5) et la
// règle O18 d'oracle-ops (forge-ops, --revisions-actives). Deux preuves : aucun déclencheur ne
// les route d'office (ext, content_patterns, trigger_files vides), et la COMMANDE du registre,
// placeholders résolus, rend FAIL sur la rouge et PASS sur la verte de la forge. Forge ou
// fixture absente de ce poste : SKIP motivé, jamais un vert inventé.
if (reg) {
  const PAIRES_1687 = [
    { script: /oracle-exploitabilite\.mjs$/, rouge: 'digit-ai-forge-design/oracles/fixtures/exploitabilite-rouge.html',
      verte: 'digit-ai-forge-design/oracles/fixtures/exploitabilite-verte.html' },
    { script: /oracle-ops\.mjs$/, rouge: 'digit-ai-forge-ops/fixtures/o18-revisions-actives/rouge.json',
      verte: 'digit-ai-forge-ops/fixtures/o18-revisions-actives/verte.json' },
    // TF-2405 (10/11/2026, D-203 (a)) : oracle-clip de forge-design, même contrat ; l'entrée est un DOSSIER de clip.
    { script: /oracle-clip\.mjs$/, rouge: 'digit-ai-forge-design/oracles/fixtures/clip/rouge',
      verte: 'digit-ai-forge-design/oracles/fixtures/clip/verte' },
  ];
  for (const p of PAIRES_1687) {
    const e = reg.oracles.find((o) => (o.cmd || []).some((s) => p.script.test(s)));
    const nom = String(p.script).replace(/^\/|\\|\$\/$/g, '');
    if (!e) { ko(`TF-1687 : ${nom} ABSENT du registre machine`); continue; }
    const routeur = [...(e.ext || []), ...(e.content_patterns || []), ...(e.trigger_files || [])];
    if (routeur.length) { ko(`TF-1687 : ${nom} est routé d'office (${JSON.stringify(routeur)}) — l'entrée doit rester en invocation explicite`); continue; }
    const fRouge = FORGES && path.join(FORGES, p.rouge);
    const fVerte = FORGES && path.join(FORGES, p.verte);
    if (!FORGES || !fs.existsSync(fRouge) || !fs.existsSync(fVerte)) {
      ok(`TF-1687 : ${nom} au registre, en invocation explicite — commande non rejouée : ${FORGES ? 'fixtures absentes de ce poste' : motifForgesAbsentes(SKILLDIR)}`);
      continue;
    }
    const jouer = (cible) => {
      const [bin, ...reste] = e.cmd.map((s) => s.replace(MARQUEUR_FORGES, FORGES).replace('{file}', cible));
      const r = spawnSync(bin === 'node' ? process.execPath : bin, reste, { encoding: 'utf8', timeout: 180000 });
      let v = '?'; try { v = JSON.parse(r.stdout).verdict; } catch {}
      return { v, code: r.status };
    };
    const r = jouer(fRouge), v = jouer(fVerte);
    if (r.v === 'SKIP' || v.v === 'SKIP') ok(`TF-1687 : ${nom} au registre, en invocation explicite — l'oracle rend SKIP sur ce poste (outillage de rendu absent), commande non jugée`);
    else (r.v === 'FAIL' && r.code === 1 && v.v === 'PASS' && v.code === 0)
      ? ok(`TF-1687 : ${nom} au registre, en invocation explicite, et sa commande rend FAIL sur la rouge, PASS sur la verte`)
      : ko(`TF-1687 : la commande du registre pour ${nom} ne tient pas ses deux sens — rouge ${r.v} (exit ${r.code}), verte ${v.v} (exit ${v.code})`);
  }
}

// (3c ter bis) TF-2001 et TF-1996 (28/10/2026) — deux oracles livrés le 28/10 par forge-websec entrent
// au registre machine, en INVOCATION EXPLICITE, sur le modèle de TF-1687 : oracle-workflows (WF-1 à
// WF-5) et oracle-exposition-statique (en-têtes d'un fichier _headers). Mêmes deux preuves : aucun
// déclencheur ne les route d'office, et la COMMANDE du registre rend FAIL sur la rouge, PASS sur la
// verte de la forge. Forge ou fixture absente de ce poste : SKIP motivé, jamais un vert inventé.
if (reg) {
  const PAIRES_2001 = [
    { script: /oracle-workflows\.mjs$/, rouge: 'digit-ai-forge-websec/fixtures/workflows/rouge-permissions-absentes.yml',
      verte: 'digit-ai-forge-websec/fixtures/workflows/vert-complet.yml' },
    { script: /oracle-exposition-statique\.mjs$/, rouge: 'digit-ai-forge-websec/fixtures/exposition-statique/rouge-csp-absente/_headers',
      verte: 'digit-ai-forge-websec/fixtures/exposition-statique/vert-complet/_headers' },
  ];
  for (const p of PAIRES_2001) {
    const e = reg.oracles.find((o) => (o.cmd || []).some((s) => p.script.test(s)));
    const nom = String(p.script).replace(/^\/|\\|\$\/$/g, '');
    if (!e) { ko(`TF-2001 : ${nom} ABSENT du registre machine`); continue; }
    const routeur = [...(e.ext || []), ...(e.content_patterns || []), ...(e.trigger_files || [])];
    if (routeur.length) { ko(`TF-2001 : ${nom} est routé d'office (${JSON.stringify(routeur)}) — l'entrée doit rester en invocation explicite`); continue; }
    const fRouge = FORGES && path.join(FORGES, p.rouge);
    const fVerte = FORGES && path.join(FORGES, p.verte);
    if (!FORGES || !fs.existsSync(fRouge) || !fs.existsSync(fVerte)) {
      ok(`TF-2001 : ${nom} au registre, en invocation explicite — commande non rejouée : ${FORGES ? 'fixtures absentes de ce poste' : motifForgesAbsentes(SKILLDIR)}`);
      continue;
    }
    const jouer = (cible) => {
      const [bin, ...reste] = e.cmd.map((s) => s.replace(MARQUEUR_FORGES, FORGES).replace('{file}', cible));
      const r = spawnSync(bin === 'node' ? process.execPath : bin, reste, { encoding: 'utf8', timeout: 180000 });
      let v = '?'; try { v = JSON.parse(r.stdout).verdict; } catch {}
      return { v, code: r.status };
    };
    const r = jouer(fRouge), v = jouer(fVerte);
    (r.v === 'FAIL' && r.code === 1 && v.v === 'PASS' && v.code === 0)
      ? ok(`TF-2001 : ${nom} au registre, en invocation explicite, et sa commande rend FAIL sur la rouge, PASS sur la verte`)
      : ko(`TF-2001 : la commande du registre pour ${nom} ne tient pas ses deux sens — rouge ${r.v} (exit ${r.code}), verte ${v.v} (exit ${v.code})`);
  }
}

// (3c ter ter) TF-2399 (12/11/2026, décision R-58 du 12/11/2026) — trois contrôles livrés le 10/11/2026 se jouaient à
// la demande seulement : `check_impression.py` et `check_completude.py --source-donnees` (digit-ai-page-html 1.45.0,
// TF-2362, TF-2364, TF-2365) et `oracle-document-imprime.mjs` de forge-design (TF-2385, TF-2386). Aucun n'était au
// registre, donc aucun lanceur ne les appelait, et la règle §4 n'était pas tenue. Quatre preuves :
//   (A) la page imprimée est ROUTÉE par run-oracles : la page à bascule de thème et la page à @page fixe sont
//       jugées (FAIL sur les deux rouges, PASS sur la verte), une page sans l'un ni l'autre n'est pas appelée ;
//   (B) la complétude par chaînes est inscrite en INVOCATION EXPLICITE (la source ne se devine pas) et sa commande,
//       placeholders résolus, rend PASS sur la page entière et FAIL sur la page amputée ;
//   (C) le support imprimé est ROUTÉ sur tout .pptx et tout .pdf, par le lanceur, sur les fixtures de la forge ;
//   (D) BARRIÈRE : tout script `oracle-*` ou `check_*` d'un skill du dépôt est au registre. Le défaut était de classe
//       « contrôle écrit non câblé à son étape » : celui-ci aurait nommé check_impression.py le 10/11/2026.
// Outillage absent (Chromium, pymupdf, python-pptx) ou forge absente de ce poste : SKIP motivé, jamais un vert inventé.
if (reg) {
  const entree = (re, aussi = () => true) => reg.oracles.find((o) => (o.cmd || []).some((s) => re.test(s)) && aussi(o));
  const pyR = resolvePython();
  const resoudre = (e, cible, source) => {
    const cmd = e.cmd.map((s) => s.replace('{skillsroot}', SKILLSROOT).replace(MARQUEUR_FORGES, FORGES || MARQUEUR_FORGES)
      .replace('{file}', cible).replace('{source}', source || '{source}'));
    return cmd[0] === 'python' ? [...(pyR || ['python']), ...cmd.slice(1)] : cmd[0] === 'node' ? [process.execPath, ...cmd.slice(1)] : cmd;
  };
  const lanceur = (reJouet, dossier) => {
    const regJ = path.join(dossier, '..', 'registre-' + path.basename(dossier) + '.json');
    fs.writeFileSync(regJ, JSON.stringify({ version: 'jouet', oracles: reJouet }));
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), dossier, '--json', '--registre', regJ, '--no-cache'],
      { encoding: 'utf8', timeout: 600000, env: process.env });
    let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch { /* sortie illisible : dite par l'appelant */ }
    return { j, err: (r.stderr || '').slice(0, 160) };
  };
  const verdicts = (j, domaine) => Object.fromEntries((j?.resultats || []).filter((x) => x.domaine === domaine).map((x) => [path.basename(x.file), x.verdict]));
  const FXH = path.join(SKILLSROOT, 'digit-ai-page-html', 'fixtures');

  // (A) check_impression.py
  {
    const e = entree(/check_impression\.py$/);
    if (!e) ko('TF-2399 (A) : check_impression.py ABSENT du registre machine');
    else if (!(e.ext || []).includes('.html') || !(e.content_patterns || []).length) {
      ko(`TF-2399 (A) : check_impression.py n'est pas routé sur les pages imprimables — ext ${JSON.stringify(e.ext)}, content_patterns ${JSON.stringify(e.content_patterns)}`);
    } else if (!['impression-sombre-rouge.html', 'impression-marge-rouge.html', 'impression-fixe-verte.html'].every((f) => fs.existsSync(path.join(FXH, f)))) {
      ok('TF-2399 (A) : check_impression.py au registre, routé — commande non rejouée : fixtures de digit-ai-page-html absentes de ce poste');
    } else {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2399a-'));
      try {
        const dossier = path.join(tmp, 'pages'); fs.mkdirSync(dossier);
        for (const f of ['impression-sombre-rouge.html', 'impression-marge-rouge.html', 'impression-fixe-verte.html']) fs.copyFileSync(path.join(FXH, f), path.join(dossier, f));
        fs.writeFileSync(path.join(dossier, 'neutre.html'), '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>t</title></head><body><h1>Une page sans bascule de thème ni feuille fixe</h1></body></html>\n');
        const { j, err } = lanceur([e], dossier);
        const v = verdicts(j, e.domaine);
        if (!j) ko('TF-2399 (A) : sortie de run-oracles inexploitable — ' + err);
        else if (Object.values(v).length && Object.values(v).every((x) => x === 'SKIP')) ok('TF-2399 (A) : check_impression.py au registre, routé — rend SKIP sur ce poste (Chromium, pymupdf ou numpy absent), commande non jugée');
        else if ('neutre.html' in v) ko('TF-2399 (A) : une page sans data-theme ni @page de taille fixe est routée sur check_impression.py — le motif de routage est trop large');
        else if (v['impression-sombre-rouge.html'] !== 'FAIL' || v['impression-marge-rouge.html'] !== 'FAIL' || v['impression-fixe-verte.html'] !== 'PASS') {
          ko(`TF-2399 (A) : le lanceur ne tient pas les deux sens de check_impression.py — ${JSON.stringify(v)}`);
        } else ok('TF-2399 (A) : check_impression.py est routé par run-oracles sur la page à bascule de thème et sur la page à @page fixe (FAIL sur les deux rouges, PASS sur la verte) et laisse une page sans l\'un ni l\'autre');
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }
  }

  // (B) check_completude.py --source-donnees, invocation explicite
  {
    const e = entree(/check_completude\.py$/, (o) => o.cmd.includes('--source-donnees'));
    const verte = path.join(FXH, 'completude-donnees-verte.html'), amputee = path.join(FXH, 'completude-donnees-amputee.html'), donnees = path.join(FXH, 'completude-donnees.json');
    if (!e) ko('TF-2399 (B) : check_completude.py --source-donnees ABSENT du registre machine');
    else if ([...(e.ext || []), ...(e.content_patterns || []), ...(e.trigger_files || [])].length) {
      ko(`TF-2399 (B) : la complétude par source de données est routée d'office — la source ne se devine pas, l'entrée doit rester en invocation explicite`);
    } else if (![verte, amputee, donnees].every((f) => fs.existsSync(f)) || !pyR) {
      ok(`TF-2399 (B) : check_completude.py --source-donnees au registre, en invocation explicite — commande non rejouée : ${pyR ? 'fixtures de digit-ai-page-html absentes de ce poste' : 'aucun Python sur ce poste'}`);
    } else {
      const jouer = (cible) => {
        const [bin, ...reste] = resoudre(e, cible, donnees);
        const r = spawnSync(bin, [...reste, '--ignorer-cles', 'id,classe'], { encoding: 'utf8', timeout: 120000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
        let v = '?', texte = ''; try { const s = JSON.parse(r.stdout); v = s.verdict; texte = JSON.stringify(s.fails || []); } catch { /* verdict illisible */ }
        return { v, code: r.status, texte };
      };
      const r = jouer(amputee), v = jouer(verte);
      (r.v === 'FAIL' && r.code === 1 && /CHA.NE MANQUANTE/.test(r.texte) && v.v === 'PASS' && v.code === 0)
        ? ok('TF-2399 (B) : check_completude.py --source-donnees au registre, en invocation explicite, et sa commande rend FAIL (CHAÎNE MANQUANTE) sur la page amputée, PASS sur la page entière')
        : ko(`TF-2399 (B) : la commande du registre ne tient pas ses deux sens — amputée ${r.v} (exit ${r.code}), entière ${v.v} (exit ${v.code})`);
    }
  }

  // (C) oracle-document-imprime.mjs de forge-design
  {
    const e = entree(/oracle-document-imprime\.mjs$/);
    const FXD = FORGES && path.join(FORGES, 'digit-ai-forge-design', 'oracles', 'fixtures', 'document-imprime');
    const noms = ['deck-rouge.pptx', 'deck-verte.pptx', 'livret-rouge.pdf', 'livret-verte.pdf'];
    if (!e) ko('TF-2399 (C) : oracle-document-imprime.mjs ABSENT du registre machine');
    else if (!['.pptx', '.pdf'].every((x) => (e.ext || []).includes(x))) ko(`TF-2399 (C) : oracle-document-imprime.mjs n'est pas routé sur .pptx et .pdf — ext ${JSON.stringify(e.ext)}`);
    else if (!FORGES || !noms.every((f) => fs.existsSync(path.join(FXD, f)))) {
      ok(`TF-2399 (C) : oracle-document-imprime.mjs au registre, routé sur .pptx et .pdf — commande non rejouée : ${FORGES ? 'fixtures de forge-design absentes de ce poste' : motifForgesAbsentes(SKILLDIR)}`);
    } else {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2399c-'));
      try {
        const dossier = path.join(tmp, 'supports'); fs.mkdirSync(dossier);
        for (const f of noms) fs.copyFileSync(path.join(FXD, f), path.join(dossier, f));
        fs.writeFileSync(path.join(dossier, 'note.md'), '# Une note\n\nTexte.\n');
        const { j, err } = lanceur([e], dossier);
        const v = verdicts(j, e.domaine);
        if (!j) ko('TF-2399 (C) : sortie de run-oracles inexploitable — ' + err);
        else if (Object.values(v).length && Object.values(v).every((x) => x === 'SKIP')) ok('TF-2399 (C) : oracle-document-imprime.mjs au registre, routé — rend SKIP sur ce poste (pymupdf ou python-pptx absent), commande non jugée');
        else if ('note.md' in v) ko('TF-2399 (C) : un fichier Markdown est routé sur oracle-document-imprime.mjs');
        else if (v['deck-rouge.pptx'] !== 'FAIL' || v['deck-verte.pptx'] !== 'PASS' || v['livret-rouge.pdf'] !== 'FAIL' || v['livret-verte.pdf'] !== 'PASS') {
          ko(`TF-2399 (C) : le lanceur ne tient pas les deux sens d'oracle-document-imprime.mjs — ${JSON.stringify(v)}`);
        } else ok('TF-2399 (C) : oracle-document-imprime.mjs est routé par run-oracles sur tout .pptx et tout .pdf (FAIL sur le deck et le livret rouges, PASS sur les verts) et laisse un fichier Markdown');
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }
  }

  // (D) barrière : aucun script de contrôle d'un skill du dépôt n'est hors registre
  {
    const depot = spawnSync('git', ['-C', SKILLSROOT, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (depot.status !== 0) ok('TF-2399 (D) : les skills jugés ne sont pas dans un dépôt git (copie installée) — la barrière « tout contrôle de skill est au registre » est sans objet ici, et c\'est dit');
    else {
      // Un script hors registre se déclare ici avec son motif : la liste part VIDE (le 12/11/2026, 62 scripts, tous inscrits).
      const HORS_REGISTRE = {};
      const lire = (oracles) => {
        const paille = oracles.map((o) => JSON.stringify([o.cmd || [], o.commande || '', o.cmd_ref || ''])).join('\n');
        // le nom d'un script est cité entre deux frontières (début, barre, guillemet, espace) et (fin de nom) : un nom plus court contenu dans un plus long ne compte pas
        const nomme = (f) => new RegExp('(?:^|[/\\\\"\\s`])' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w.-])').test(paille);
        const orphelins = [];
        for (const d of fs.readdirSync(SKILLSROOT, { withFileTypes: true })) {
          const sd = path.join(SKILLSROOT, d.name, 'scripts');
          if (!d.isDirectory() || !fs.existsSync(sd)) continue;
          for (const f of fs.readdirSync(sd)) {
            if (!/^(oracle-.*\.(mjs|py)|check_.*\.py)$/.test(f)) continue;
            if (!nomme(f) && !HORS_REGISTRE[`${d.name}/${f}`]) orphelins.push(`${d.name}/${f}`);
          }
        }
        return orphelins;
      };
      const reel = lire(reg.oracles);
      const sansImpression = reg.oracles.filter((o) => !(o.cmd || []).some((s) => /check_impression\.py$/.test(s)));
      const rouge = lire(sansImpression);
      if (reel.length) ko(`TF-2399 (D) : ${reel.length} script(s) de contrôle hors registre — ${reel.join(', ')} (les inscrire, règle §4 ; ou les déclarer dans HORS_REGISTRE avec leur motif)`);
      else if (!rouge.includes('digit-ai-page-html/check_impression.py')) ko('TF-2399 (D) sens rouge : un registre sans check_impression.py ne nomme pas le script orphelin — la barrière est aveugle');
      else ok(`TF-2399 (D) : tout script oracle-* ou check_* des skills du dépôt est au registre (barrière) ; sans l'entrée de check_impression.py, la barrière le nomme, et l'inscription ramène le PASS`);
    }
  }

  // (E) TF-2452 (12/11/2026, décision R-58 du 12/11/2026) — LA BARRIÈRE (D) NE LISAIT QUE LES SKILLS DE forge-agents. Les oracles publiés
  // par le pilot (oracles/, gabarits/, todo/) et par les forges (oracles/, skills/) restaient hors de son regard : oracle-engagements,
  // oracle-document-imprime et oracle-clip se sont publiés sans que rien ne dise s'ils devaient entrer au registre. Elle lit désormais
  // tout `oracle-*.mjs|py` et tout `check_*.py` que git suit dans le pilot et dans chaque forge (hors fixtures, node_modules, vendor, old,
  // output, input, .claude/skills — déjà couvert par (D) — et recettes *.test.mjs) : chacun est au registre machine (repéré par son
  // chemin `{pilot}/…` ou `{forges}/<dépôt>/…`, jamais par son seul nom, deux dépôts portant un oracle-caracteres-controle.mjs), OU déclaré
  // dans references/oracles-hors-registre.json avec un motif. La liste ne garde ni mort (fichier disparu), ni doublon, ni contradiction
  // (déclaré ET inscrit), ni ligne sans motif connu. Sens rouge joué sur le parc réel : sans une déclaration, la barrière nomme le script.
  {
    const FICHIER = path.join(SKILLDIR, 'references', 'oracles-hors-registre.json');
    let liste = null; try { liste = JSON.parse(fs.readFileSync(FICHIER, 'utf8')); } catch (e) { ko('TF-2452 : references/oracles-hors-registre.json illisible — ' + e.message); }
    if (liste && !FORGES) ok('TF-2452 : barrière des oracles du pilot et des forges non rejouée — ' + motifForgesAbsentes(SKILLDIR));
    else if (liste) {
      const DEPOT_JUGE = /^(digit-ai-factory|digit-ai-forge-[a-z-]+)$/;
      const enumerer = () => {
        const out = [], sautes = [], vus = [];
        for (const n of fs.readdirSync(FORGES)) {
          const dir = path.join(FORGES, n);
          if (!DEPOT_JUGE.test(n) || !fs.existsSync(path.join(dir, '.git'))) continue;
          const r = spawnSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8', maxBuffer: 1e8 });
          if (r.status !== 0) { sautes.push(n); continue; }
          vus.push(n);
          for (const f of r.stdout.split(/\r?\n/)) {
            const b = path.posix.basename(f);
            if (!/^(oracle-.*\.(mjs|py)|check_.*\.py)$/.test(b) || /\.test\.mjs$/.test(b)) continue;
            if (/(^|\/)(fixtures|node_modules|vendor|old|output|input)\//.test(f) || f.startsWith('.claude/skills/') || !fs.existsSync(path.join(dir, f))) continue;
            out.push(n + '/' + f);
          }
        }
        return { fichiers: out, sautes, vus };
      };
      const inscrits = (oracles) => {
        const paille = oracles.map((o) => JSON.stringify([o.cmd || [], o.commande || '', o.cmd_ref || ''])).join('\n');
        const s = new Set();
        for (const m of paille.matchAll(/\{(pilot|forges)\}\/((?:\.\.\/)?digit-ai-[\w-]+\/)?([^\s"'`\\,\]]+)/g)) {
          s.add((m[2] ? m[2].replace(/^\.\.\//, '').replace(/\/$/, '') : 'digit-ai-factory') + '/' + m[3]);
        }
        return s;
      };
      // TF-2488 (13/11/2026, décision R-58 du 13/11/2026) — le relevé d'appelants ne voyait ni un self-test, ni la règle EN1
      // d'oracle-enclenchement, ni une étape prescrite par un document : 9 des 12 oracles « sans appelant » de TF-2466 étaient joués en
      // recette ou prescrits par un document. Un appelant a donc une NATURE, lue à son chemin, et chaque déclaration NOMME les natures de
      // ses appelants : `executable` (script, hameçon, lanceur, ou fichier de configuration que ce lanceur lit), `recette` (self-test,
      // *.test.mjs, cliquet ou manifeste de recette), `document` (un .md qui prescrit l'étape). La barrière recalcule les natures des
      // appelants et refuse une déclaration qui n'en nomme pas, en nomme une inconnue, ou en nomme une autre que celle de ses appelants.
      const NATURES_APPEL = ['executable', 'recette', 'document'];
      const natureAppel = (appelant) => {
        const p = String(appelant).split('/').slice(1).join('/');
        if (/\.md$/i.test(p)) return 'document';
        if (/(^|\/)(self-test[^/]*|[^/]*\.test\.mjs|baseline-recettes\.json|manifeste-mutation\.json|lib-recettes-dediees\.mjs)$/.test(p)) return 'recette';
        return 'executable';
      };
      const naturesDe = (appelants) => NATURES_APPEL.filter((n) => (appelants || []).some((a) => natureAppel(a) === n));
      const probleme = (fichiers, au_registre, declares, motifs) => {
        const pb = [], dec = new Map(), present = new Set(fichiers);
        for (const d of declares) {
          const k = d.depot + '/' + d.chemin;
          if (dec.has(k)) pb.push(`${k} : déclaré deux fois`);
          dec.set(k, d);
          if (!d.motif || !motifs[d.motif]) pb.push(`${k} : motif absent ou inconnu (${d.motif})`);
          // TF-2466 (13/11/2026, décision R-58 du 12/11/2026) — un oracle SANS APPELANT n'a pas de motif qui le justifie : il se câble
          // (appelants nommés), ou se déclare « manuel » avec son motif (20 caractères au moins) et la commande qui le joue, laquelle
          // nomme le script. Loi n° 1 : un contrôle qu'aucune étape n'appelle est câblé, déclaré joué à la main, ou proposé au retrait.
          const sansAppelant = !Array.isArray(d.appelants) || d.appelants.length === 0 || d.motif === 'sans-appelant';
          const m = d.manuel || {}, nom = path.posix.basename(d.chemin || '');
          const manuelOk = typeof m.motif === 'string' && m.motif.trim().length >= 20 && typeof m.commande === 'string' && m.commande.includes(nom) && nom !== '';
          if (!Array.isArray(d.natures) || d.natures.some((n) => !NATURES_APPEL.includes(n)) || new Set(d.natures).size !== d.natures.length) {
            pb.push(`${k} : natures d'appel absentes ou inconnues (${JSON.stringify(d.natures)}) — une liste, de ${NATURES_APPEL.join(', ')}, vide pour un oracle sans appelant`);
          } else if (JSON.stringify(d.natures) !== JSON.stringify(naturesDe(d.appelants))) {
            pb.push(`${k} : natures d'appel déclarées ${JSON.stringify(d.natures)} contre ${JSON.stringify(naturesDe(d.appelants))} lues aux appelants`);
          }
          if (d.motif === 'manuel') { if (!manuelOk) pb.push(`${k} : déclaré « manuel » sans motif (20 caractères au moins) ou sans commande qui nomme ${nom}`); }
          else if (sansAppelant) pb.push(`${k} : sans appelant et sans déclaration « manuel » (motif et commande qui le joue) — le câbler à l'étape qui le consomme, ou le déclarer « manuel »`);
        }
        for (const k of fichiers) if (!au_registre.has(k) && !dec.has(k)) pb.push(`${k} : ni au registre ni déclaré hors registre`);
        for (const k of dec.keys()) {
          if (!present.has(k)) pb.push(`${k} : déclaré hors registre mais introuvable (supprimé, renommé, ou hors du périmètre lu)`);
          else if (au_registre.has(k)) pb.push(`${k} : déclaré hors registre alors qu'il est au registre`);
        }
        return pb;
      };
      const { fichiers, sautes, vus } = enumerer();
      const reg_ = inscrits(reg.oracles);
      const declares = Array.isArray(liste.oracles) ? liste.oracles : [], motifs = liste.motifs || {};
      const nommes = ['digit-ai-factory/oracles/oracle-engagements.mjs', 'digit-ai-forge-design/oracles/oracle-document-imprime.mjs', 'digit-ai-forge-design/oracles/oracle-clip.mjs'];
      if (!vus.includes('digit-ai-factory')) ok('TF-2452 : le pilot n\'est pas lisible par git depuis ' + FORGES + ' — barrière des oracles du pilot et des forges non rejouée' + (sautes.length ? ' (dépôts illisibles : ' + sautes.join(', ') + ')' : ''));
      else {
        const reel = probleme(fichiers, reg_, declares, motifs);
        const premier = declares.find((d) => !reg_.has(d.depot + '/' + d.chemin));
        const sansUne = premier ? probleme(fichiers, reg_, declares.filter((d) => d !== premier), motifs) : [];
        const avecMort = probleme(fichiers, reg_, [...declares, { depot: 'digit-ai-factory', chemin: 'oracles/oracle-qui-n-existe-pas.mjs', motif: 'pilot-appele' }], motifs);
        const avecDouble = probleme(fichiers, reg_, [...declares, { depot: 'digit-ai-factory', chemin: 'oracles/oracle-engagements.mjs', motif: 'pilot-appele' }], motifs);
        const sansMotif = premier ? probleme(fichiers, reg_, declares.map((d) => d === premier ? { ...d, motif: '' } : d), motifs) : [];
        const absentsNommes = nommes.filter((k) => !fichiers.includes(k) || !reg_.has(k));
        // TF-2466 — la barrière des sans-appelant, jouée dans les deux sens sur une déclaration témoin du parc réel (indépendamment de
        // l'état des autres lignes) : rouge, une ligne sans appelant sans « manuel », un « manuel » au motif court ou à la commande
        // qui ne nomme pas le script ; vert, la même ligne câblée, ou déclarée « manuel » complète.
        const temoin = declares.find((d) => d.motif !== 'sans-appelant' && d.motif !== 'manuel' && Array.isArray(d.appelants) && d.appelants.length && fichiers.includes(d.depot + '/' + d.chemin));
        if (!temoin) ko('TF-2466 : aucune déclaration câblée témoin dans la liste — la barrière des sans-appelant ne peut pas être jouée');
        else {
          const cle = temoin.depot + '/' + temoin.chemin, nom = path.posix.basename(temoin.chemin);
          const variante = (patch) => probleme(fichiers, reg_, declares.map((d) => d === temoin ? { ...d, ...patch } : d), motifs).filter((p) => p.startsWith(cle + ' :'));
          const complet = { motif: 'Joué à la main avant chaque publication : aucune étape ne le consomme.', commande: `node ${temoin.chemin} <cible>` };
          const rouges = [
            ['une ligne sans appelant et sans « manuel »', variante({ appelants: [] }), /sans appelant et sans déclaration « manuel »/],
            ['un motif « sans-appelant »', variante({ motif: 'sans-appelant' }), /sans appelant et sans déclaration « manuel »/],
            ['un « manuel » au motif trop court', variante({ motif: 'manuel', appelants: [], manuel: { motif: 'x', commande: complet.commande } }), /déclaré « manuel » sans motif/],
            ['un « manuel » dont la commande ne nomme pas le script', variante({ motif: 'manuel', appelants: [], manuel: { motif: complet.motif, commande: 'node autre-script.mjs' } }), /déclaré « manuel » sans motif/],
          ];
          const muets = rouges.filter(([, pb, re]) => !pb.some((p) => re.test(p))).map(([nomCas]) => nomCas);
          const vert = variante({ appelants: [], natures: [], motif: 'manuel', manuel: complet });
          const cable = variante({});
          if (muets.length) ko('TF-2466 sens rouge : la barrière des sans-appelant ne nomme pas — ' + muets.join(' ; '));
          else if (vert.length || cable.length) ko('TF-2466 sens vert : ' + [...vert, ...cable].join(' · '));
          else ok(`TF-2466 : une ligne sans appelant est nommée tant qu'elle ne porte pas de déclaration « manuel » (motif de 20 caractères au moins, commande qui nomme ${nom}) ; câblée ou déclarée « manuel » complète, elle passe`);
        }
        // TF-2488 — la nature de l'appel, jouée dans les deux sens sur une ligne jouet ajoutée à la liste réelle (son fichier est ajouté aux
        // fichiers lus, donc seules ses propres anomalies sont lues). Rouge : natures absentes, nature inconnue, un .md déclaré exécutable,
        // un self-test déclaré exécutable, des appelants mixtes dont une nature est omise. Vert : un document, une recette, les trois natures.
        {
          const JOUET = 'digit-ai-factory/oracles/oracle-jouet-natures.mjs';
          const jouet = (patch) => probleme([...fichiers, JOUET], reg_,
            [...declares, { depot: 'digit-ai-factory', chemin: 'oracles/oracle-jouet-natures.mjs', motif: 'pilot-appele', appelants: [], natures: [], ...patch }], motifs)
            .filter((p) => p.startsWith(JOUET + ' :'));
          const DOC = 'digit-ai-factory/references/ETAPES-RUN.md', REC = 'digit-ai-forge-design/oracles/self-test.mjs', EXE = 'digit-ai-factory/scripts/hook-ouverture.mjs';
          const rougesN = [
            ['natures absentes', jouet({ appelants: [DOC], natures: undefined }), /natures d'appel absentes ou inconnues/],
            ['une nature inconnue', jouet({ appelants: [DOC], natures: ['hameçon'] }), /natures d'appel absentes ou inconnues/],
            ['un document déclaré exécutable', jouet({ appelants: [DOC], natures: ['executable'] }), /natures d'appel déclarées/],
            ['un self-test déclaré exécutable', jouet({ appelants: [REC], natures: ['executable'] }), /natures d'appel déclarées/],
            ['des appelants mixtes dont deux natures sont omises', jouet({ appelants: [EXE, REC, DOC], natures: ['executable'] }), /natures d'appel déclarées/],
          ];
          const muetsN = rougesN.filter(([, pb, re]) => !pb.some((p) => re.test(p))).map(([nomCas]) => nomCas);
          const vertsN = [
            ['un document', jouet({ appelants: [DOC], natures: ['document'] })],
            ['une recette', jouet({ appelants: [REC], natures: ['recette'] })],
            ['les trois natures', jouet({ appelants: [DOC, REC, EXE], natures: ['executable', 'recette', 'document'] })],
          ];
          const rougesVertes = vertsN.filter(([, pb]) => pb.length).map(([nomCas, pb]) => nomCas + ' : ' + pb.join(' ; '));
          // Les deux familles que TF-2488 nomme sont lues dans la liste réelle : une prescription par un document (oracle-recette-rejouable,
          // ETAPES-RUN.md) et un appel de recette (les six oracles de forge-agents-security, leur self-test).
          const reelDoc = declares.find((d) => d.chemin === 'oracles/oracle-recette-rejouable.mjs');
          const reelRec = declares.find((d) => d.chemin === 'oracles/oracle-arret-en-course.mjs');
          if (muetsN.length) ko('TF-2488 sens rouge : la barrière des natures d\'appel ne nomme pas — ' + muetsN.join(' ; '));
          else if (rougesVertes.length) ko('TF-2488 sens vert : ' + rougesVertes.join(' · '));
          else if (!reelDoc || !(reelDoc.natures || []).includes('document')) ko('TF-2488 : oracle-recette-rejouable, prescrit par ETAPES-RUN.md, ne nomme pas la nature « document »');
          else if (!reelRec || !(reelRec.natures || []).includes('recette')) ko('TF-2488 : oracle-arret-en-course, joué par le self-test de sa forge, ne nomme pas la nature « recette »');
          else {
            const compte = Object.fromEntries(NATURES_APPEL.map((n) => [n, declares.filter((d) => (d.natures || []).includes(n)).length]));
            ok(`TF-2488 : chacune des ${declares.length} déclarations nomme la nature de ses appelants (${NATURES_APPEL.map((n) => compte[n] + ' ' + n).join(', ')}, ${declares.filter((d) => !(d.natures || []).length).length} sans appel) ; ${rougesN.length} sens rouges nommés, ${vertsN.length} sens verts muets`);
          }
        }
        if (reel.length) ko(`TF-2452 : ${reel.length} anomalie(s) entre les oracles du pilot et des forges, le registre et references/oracles-hors-registre.json — ${reel.slice(0, 20).join(' · ')}${reel.length > 20 ? ' · … (' + (reel.length - 20) + ' de plus)' : ''}. Les inscrire au registre (règle §4), les câbler à l'étape qui les consomme, ou les déclarer avec un motif (« manuel » : motif et commande).`);
        else if (absentsNommes.length) ko('TF-2452 : les trois oracles qui ont fait naître la barrière doivent être vus ET inscrits au registre par leur chemin — manque : ' + absentsNommes.join(', '));
        else if (!premier || !sansUne.some((p) => p.startsWith(premier.depot + '/' + premier.chemin + ' : ni au registre'))) ko('TF-2452 sens rouge : retirer une déclaration ne fait pas nommer son script — la barrière est aveugle');
        else if (!avecMort.some((p) => /oracle-qui-n-existe-pas\.mjs : déclaré hors registre mais introuvable/.test(p))) ko('TF-2452 sens rouge : une déclaration dont le fichier n\'existe pas n\'est pas nommée — la liste garderait ses morts');
        else if (!avecDouble.some((p) => /oracle-engagements\.mjs : déclaré hors registre alors qu'il est au registre/.test(p))) ko('TF-2452 sens rouge : un script déclaré hors registre ET inscrit n\'est pas nommé — la contradiction passerait');
        else if (!sansMotif.some((p) => /motif absent ou inconnu/.test(p))) ko('TF-2452 sens rouge : une déclaration sans motif n\'est pas nommée');
        else ok(`TF-2452 : les ${fichiers.length} oracle-*/check_* du pilot et des ${vus.length - 1} forges lues sont tous au registre (${fichiers.length - declares.length}) ou déclarés hors registre avec un motif (${declares.length}) ; sans une déclaration, un déclaré mort, un double ou un motif absent, la barrière nomme l'écart${sautes.length ? ' (dépôts illisibles, non lus : ' + sautes.join(', ') + ')' : ''}`);
      }
    }
  }
}

// (3c ter quater) TF-2428 (12/11/2026, décision R-58 du 12/11/2026) — le domaine « engagements d'un document remis »
// était jugé depuis le 10/11/2026 par `oracles/oracle-engagements.mjs` du pilot (D-193 (a), R-67), appelé par ses hooks,
// mais ni le registre ni la règle §4 ne le connaissaient. Il y entre en INVOCATION EXPLICITE : sa cible est la racine
// d'un produit, aucun fichier ne le déclenche. Deux preuves : aucun déclencheur ne le route d'office, et la COMMANDE du
// registre, `{pilot}` résolu, rend FAIL sur un produit dont un engagement n'est pas tenu (EN2) et sur un document qui
// promet sans figurer au registre (EN3), PASS sur leurs pendants tenus, et SANS_OBJET (exit 2) sans registre.
// Produits FICTIFS fabriqués à la volée. Pilot absent de ce poste : SKIP motivé, jamais un vert inventé.
if (reg) {
  const e = reg.oracles.find((o) => (o.cmd || []).some((s) => /oracle-engagements\.mjs$/.test(s)));
  if (!e) ko('TF-2428 : oracle-engagements ABSENT du registre machine');
  else if ([...(e.ext || []), ...(e.content_patterns || []), ...(e.trigger_files || [])].length) {
    ko(`TF-2428 : oracle-engagements est routé d'office (${JSON.stringify([...(e.ext || []), ...(e.content_patterns || [])])}) — sa cible est la racine d'un produit, l'entrée doit rester en invocation explicite`);
  } else if (!PILOT || !fs.existsSync(path.join(PILOT, 'oracles', 'oracle-engagements.mjs'))) {
    ok(`TF-2428 : oracle-engagements au registre, en invocation explicite — commande non rejouée : ${PILOT ? 'oracle absent du pilot de ce poste' : motifPilotAbsent(SKILLDIR)}`);
  } else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2428-'));
    try {
      const entete = ['---', 'date: 2026-11-12', 'source: produit fictif de la recette de quality-oracles', 'verifie_le: 2026-11-12', '---', '',
        '# Engagements des documents remis', '', '## Engagements', '', '| Engagement | Nature | Pris dans | Tenu par |', '|---|---|---|---|'];
      const ligne = '| Questionnaire de satisfaction en ligne | pièce | `output/programme.md` | livrable : `output/questionnaire.md` |';
      const produit = (nom, livrable, registre = true) => {
        const racine = path.join(tmp, nom);
        fs.mkdirSync(path.join(racine, 'output'), { recursive: true });
        if (registre) { fs.mkdirSync(path.join(racine, 'forge')); fs.writeFileSync(path.join(racine, 'forge', 'ENGAGEMENTS.md'), [...entete, ligne, ''].join('\n'), 'utf8'); }
        fs.writeFileSync(path.join(racine, 'output', 'programme.md'), '# Programme\n\nUne journée de formation.\n', 'utf8');
        fs.writeFileSync(path.join(racine, 'output', 'autre.md'), '# Autre programme\n\nUn questionnaire de satisfaction est complété en fin de séance.\n', 'utf8');
        if (livrable) fs.writeFileSync(path.join(racine, 'output', 'questionnaire.md'), '# Questionnaire\n', 'utf8');
        return racine;
      };
      const jouer = (racine, ...extra) => {
        const [bin, ...reste] = e.cmd.map((s) => s.replace(MARQUEUR_PILOT, PILOT).replace('{file}', racine));
        const r = spawnSync(bin === 'node' ? process.execPath : bin, [...reste, '--aujourd-hui', '2026-11-12', ...extra], { encoding: 'utf8', timeout: 120000 });
        let j = null; try { j = JSON.parse(r.stdout); } catch { /* sortie illisible : dite ci-dessous */ }
        const regles = (j?.findings || []).filter((f) => f.statut === 'FAIL').map((f) => f.regle).join(',');
        return { v: j?.verdict || '?', code: r.status, regles };
      };
      const rouge = jouer(produit('rouge', false));
      const verte = jouer(produit('verte', true));
      const doc = produit('doc', true);
      const rougeDoc = jouer(doc, '--documents', 'output/autre.md');
      const verteDoc = jouer(doc, '--documents', 'output/programme.md');
      const vide = jouer(produit('vide', true, false));
      if (rouge.v !== 'FAIL' || rouge.code !== 1 || rouge.regles !== 'EN2') ko(`TF-2428 : un livrable déclaré et absent doit être refusé par EN2 (exit 1) — ${rouge.v} exit ${rouge.code} règles ${rouge.regles || 'aucune'}`);
      else if (verte.v !== 'PASS' || verte.code !== 0) ko(`TF-2428 : le remède (produire le livrable) doit ramener le PASS — ${verte.v} exit ${verte.code}`);
      else if (rougeDoc.v !== 'FAIL' || rougeDoc.code !== 1 || rougeDoc.regles !== 'EN3') ko(`TF-2428 : un document qui promet un questionnaire sans figurer au registre doit être refusé par EN3 — ${rougeDoc.v} exit ${rougeDoc.code} règles ${rougeDoc.regles || 'aucune'}`);
      else if (verteDoc.v !== 'PASS' || verteDoc.code !== 0) ko(`TF-2428 : le document cité au registre ne doit pas être accusé — ${verteDoc.v} exit ${verteDoc.code}`);
      else if (vide.v !== 'SANS_OBJET' || vide.code !== 2) ko(`TF-2428 : un produit sans registre doit rendre SANS_OBJET, exit 2, jamais un PASS — ${vide.v} exit ${vide.code}`);
      else ok('TF-2428 : oracle-engagements au registre, en invocation explicite, et sa commande rend FAIL sur un engagement non tenu (EN2) et sur un document qui promet sans figurer au registre (EN3), PASS sur leurs remèdes, SANS_OBJET (exit 2) sans registre');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
}

// (3c quater) TF-1877 (19/10/2026) — l'oracle de la famille « tableau de bord de pilotage » du pilot
// (TF-1855) entre au registre machine, routé par le CONTENU seul (`ext` vide : une extension .html le
// ferait jouer, et rendre SANS_OBJET, sur toutes les pages). Trois preuves : une page qui se déclare de
// la famille est routée, une page qui ne s'en déclare pas ne l'est pas, et la COMMANDE du registre,
// `{pilot}` résolu, rend PASS sur l'instance de la famille et FAIL sur la même instance privée de sa
// commande de comparaison (TB1). Pilot ou instance absents de ce poste : SKIP motivé, jamais un vert inventé.
if (reg) {
  const e = reg.oracles.find((o) => (o.cmd || []).some((s) => /oracle-tableau-de-bord-pilotage\.mjs$/.test(s)));
  if (!e) ko('TF-1877 : oracle-tableau-de-bord-pilotage ABSENT du registre machine');
  else {
    const route = (html) => (e.content_patterns || []).some((p) => new RegExp(p, 'im').test(html));
    const declaree = '<!doctype html><html lang="fr"><body data-page="donnees" data-tableau-de-bord="pilotage"><h1>t</h1></body></html>';
    const couple = '<html><body><p>Gabarit : gd-tableau-de-bord-pilotage</p></body></html>';
    const horsFamille = '<html><body data-page="donnees"><h1>Un tableau de bord de pilotage</h1></body></html>';
    const instance = PILOT && path.join(PILOT, 'gabarits', 'documents', 'tableau-de-bord-pilotage', 'INSTANCE.html');
    if ((e.ext || []).length || !route(declaree) || !route(couple) || route(horsFamille)) {
      ko(`TF-1877 : le routage de oracle-tableau-de-bord-pilotage ne tient pas — ext ${JSON.stringify(e.ext)}, page déclarée ${route(declaree) ? 'routée' : 'NON routée'}, couple de gabarit ${route(couple) ? 'routé' : 'NON routé'}, page hors famille ${route(horsFamille) ? 'ROUTÉE' : 'non routée'}`);
    } else if (!PILOT || !fs.existsSync(instance)) {
      ok(`TF-1877 : oracle-tableau-de-bord-pilotage au registre, routé par le contenu seul — commande non rejouée : ${PILOT ? 'instance de la famille absente de ce poste' : motifPilotAbsent(SKILLDIR)}`);
    } else {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1877-'));
      try {
        const verte = fs.readFileSync(instance, 'utf8');
        const marque = 'data-commande="comparaison"';
        const rouge = path.join(tmp, 'instance-sans-comparaison.html');
        fs.writeFileSync(rouge, verte.replace(marque, 'data-commande-retiree="comparaison"'), 'utf8');
        const jouer = (cible) => {
          const [bin, ...reste] = e.cmd.map((s) => s.replace(MARQUEUR_PILOT, PILOT).replace('{file}', cible));
          const r = spawnSync(bin === 'node' ? process.execPath : bin, reste, { encoding: 'utf8', timeout: 180000 });
          let j = null; try { j = JSON.parse(r.stdout); } catch {}
          return { v: j ? j.verdict : '?', code: r.status, tb1: j ? (j.findings || []).some((f) => f.regle === 'TB1' && f.statut === 'FAIL') : false };
        };
        if (!verte.includes(marque)) ko('TF-1877 : la mutation du banc ne s\'applique plus — l\'instance de la famille ne porte plus ' + marque);
        else {
          const r = jouer(rouge), v = jouer(instance);
          (r.v === 'FAIL' && r.code === 1 && r.tb1 && v.v === 'PASS' && v.code === 0)
            ? ok('TF-1877 : oracle-tableau-de-bord-pilotage au registre, routé par le contenu seul, et sa commande rend PASS sur l\'instance de la famille, FAIL (TB1) sur la même instance sans sa commande de comparaison')
            : ko(`TF-1877 : la commande du registre pour oracle-tableau-de-bord-pilotage ne tient pas ses deux sens — mutée ${r.v} (exit ${r.code}, TB1 ${r.tb1 ? 'FAIL' : 'non en échec'}), instance ${v.v} (exit ${v.code})`);
        }
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }
  }
}

// (3d) TF-1326 (23/09/2026) — LE LANCEUR RÉSOUT L'INTERPRÉTEUR PYTHON, et un interpréteur
// introuvable rend un SKIP MOTIVÉ. Le registre écrit `python3` ; sous Windows ce nom peut être
// l'alias du Microsoft Store, qui répond « Python est introuvable » : le domaine « Régression
// visuelle » rendait alors un FAIL sans explication. La recette résolvait déjà l'interpréteur
// (lib/python.mjs), le lanceur non. Deux sens, sur un registre jouet dont la commande est
// `python3` LITTÉRAL : un PATH sans aucun Python rend un SKIP qui NOMME l'interpréteur manquant
// (avant : SKIP « oracle non exécutable », sans un mot sur Python) ; un poste qui a Python juge.
{
  const tmpP = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-python-'));
  try {
    const script = path.join(tmpP, 'oracle-jouet.py');
    fs.writeFileSync(script, 'import json\nprint(json.dumps({"oracle": "oracle-jouet", "verdict": "PASS", "findings": []}))\n');
    const cibleP = path.join(tmpP, 'cible.md');
    fs.writeFileSync(cibleP, '# jouet\n');
    const regP = path.join(tmpP, 'registre-jouet.json');
    fs.writeFileSync(regP, JSON.stringify({ version: 'jouet', oracles: [
      { domaine: 'python jouet', ext: ['.md'], type: 'cli', statut: 'ok', cmd: ['python3', script, '{file}'] },
    ] }));
    const lancer = (env) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), cibleP, '--json',
        '--registre', regP, '--no-cache'], { encoding: 'utf8', env });
      try { return (JSON.parse(r.stdout).resultats || [])[0] || {}; } catch { return { verdict: '?', detail: (r.stderr || '').slice(0, 160) }; }
    };
    const clePath = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
    const sansPython = lancer({ ...process.env, [clePath]: path.dirname(process.execPath) });
    (sansPython.verdict === 'SKIP' && /interpréteur Python introuvable/.test(sansPython.detail || ''))
      ? ok('TF-1326 : PATH sans aucun Python — le domaine rend un SKIP qui NOMME l interpréteur manquant (sens rouge ; avant : « oracle non exécutable »)')
      : ko(`TF-1326 : PATH sans Python → ${sansPython.verdict} « ${(sansPython.detail || '').slice(0, 120)} » — attendu un SKIP motivé`);
    if (!resolvePython()) ok('TF-1326 : sens vert NON JOUÉ — aucun interpréteur Python sur ce poste : le jugement par l interpréteur résolu ne peut pas se montrer ici, et c est dit');
    else {
      const avecPython = lancer(process.env);
      avecPython.verdict === 'PASS'
        ? ok('TF-1326 : une commande `python3` LITTÉRALE est jouée par l interpréteur RÉSOLU — le domaine juge (PASS)')
        : ko(`TF-1326 : commande python3 avec Python présent → ${avecPython.verdict} « ${(avecPython.detail || '').slice(0, 120)} »`);
    }
  } finally { fs.rmSync(tmpP, { recursive: true, force: true }); }
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
// TF-1352 (24/09/2026) : oracle-coherence ne s'emballe pas sur une page dont une table tient sur
// UNE ligne. Masquée, elle laisse des centaines de milliers d'espaces sur la ligne, et une
// expression ancrée en fin y devenait quadratique : une page d'audit de 479 Ko a tenu l'oracle plus
// de 9 minutes sans verdict. Cible fichier ET cible dossier, sous 20 secondes chacune.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-coh-perf-'));
  const ligne = '<p>Les mesures suivantes :</p><table>' + '<tr><td>mesure</td><td>12</td></tr>'.repeat(12000) + '</table><p>fin de la page</p>';
  fs.writeFileSync(path.join(tmp, 'page-longue.html'), '<!doctype html><html><body>\n' + ligne + '\n<p>Budget : 10 k€</p></body></html>\n');
  fs.writeFileSync(path.join(tmp, 'note.md'), '# Note\n\nBudget : 10 k€\n');
  for (const [nom, cible] of [['fichier', path.join(tmp, 'page-longue.html')], ['dossier', tmp]]) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-coherence.mjs'), cible], { encoding: 'utf8', timeout: 20000 });
    let j = null; try { j = JSON.parse(r.stdout); } catch {}
    r.error || r.signal ? ko(`TF-1352 : oracle-coherence sans verdict après ${Date.now() - t0} ms sur une ligne de ${ligne.length} caractères (cible ${nom}) — emballement`)
      : !j ? ko(`TF-1352 : oracle-coherence, sortie illisible sur la page longue (cible ${nom})`)
        : ok(`TF-1352 : oracle-coherence rend ${j.verdict} en ${Date.now() - t0} ms sur une ligne de ${ligne.length} caractères (cible ${nom})`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
// TF-2357 (lot du produit marketing du 09/11/2026, seq 215, 285, 302) — UNE PAGE AUTOPORTANTE JUGÉE SOUS
// 30 SECONDES, DANS LES DEUX SENS. Le fait : oracle-claims ne rendait rien en 2 minutes sur une page de
// 270 Ko aux polices et au logo en base64 ; mesuré le 10/11/2026, aucune sortie en 150 s sur une page de
// 272 671 octets, puis environ 1 s après correction. La page est fabriquée ici, octets déterministes : une
// police en `url(data:…)` dans le <style>, un logo en `src="data:…"`, un fond en `style="…url(data:…)"`,
// la tête sur une seule ligne avec un chiffre avant le <style>, comme les pages générées du parc. La verte
// source son montant : PASS ; la rouge ne le source pas : FAIL, et le constat nomme le montant.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-claims-perf-'));
  const b64 = n => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256)).toString('base64');
  const page = sourcee => '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche d\'offre 2026</title>'
    + `<style>@font-face{font-family:"Corps";src:url(data:font/woff2;base64,${b64(150000)}) format("woff2")}body{font-family:"Corps"}</style></head>\n`
    + `<body><header><img alt="Logo" src="data:image/png;base64,${b64(45000)}"><span style="background:url(data:image/png;base64,${b64(3000)})">Fiche 2026</span></header>\n`
    + `<main><h1>Fiche d'offre</h1>\n<p>Le forfait est de 12 400 € HT${sourcee ? ' (source : grille tarifaire du 03/11/2026)' : ''}.</p>\n</main></body></html>\n`;
  for (const [sens, sourcee, attendu] of [['verte', true, 'PASS'], ['rouge', false, 'FAIL']]) {
    const f = path.join(tmp, `autoportante-${sens}.html`);
    fs.writeFileSync(f, page(sourcee), 'utf8');
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-claims.mjs'), f, '--profil', path.join(SKILLDIR, 'profils', 'digit-ai.json')], { encoding: 'utf8', timeout: 30000 });
    let j = null; try { j = JSON.parse(r.stdout); } catch {}
    const ms = Date.now() - t0, taille = fs.statSync(f).size;
    if (r.error || r.signal) ko(`TF-2357 : oracle-claims sans verdict après ${ms} ms sur une page autoportante de ${taille} octets (${sens}) — les données embarquées ne sont pas écartées, ou un motif recule sur une ligne blanchie`);
    else if (!j) ko(`TF-2357 : oracle-claims, sortie illisible sur la page autoportante (${sens})`);
    else if (j.verdict !== attendu) ko(`TF-2357 : page autoportante ${sens} jugée ${j.verdict}, attendu ${attendu}`);
    else if (sens === 'rouge' && !j.findings.some(x => /12 400 €/.test(x.msg))) ko('TF-2357 : la rouge échoue sans nommer le montant non sourcé — le FAIL vient d\'ailleurs');
    else ok(`TF-2357 : page autoportante de ${taille} octets (${sens}) jugée ${j.verdict} en ${ms} ms`);
  }
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
    // c'est le motif que R-33 bis donne pour ne pas armer d'office le verdict websec (« un gate
    // qu'on apprend à contourner ne protège plus rien »). Deux corrections, aucune indulgence :
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
      if (fx.cmd.some(s => s.includes(MARQUEUR_PILOT)) && !PILOT) {
        ok(`fixture ${fx.nom}/${side} : SKIP motivé — ` + motifPilotAbsent(SKILLDIR)
          + " ; la paire rouge/verte de ce domaine n'est PAS rejouée sur ce poste");
        continue;
      }
      let cmd = fx.cmd.map(s => s.replace('{skilldir}', SKILLDIR).replace('{skillsroot}', SKILLSROOT)
        .replace(MARQUEUR_PILOT, PILOT || MARQUEUR_PILOT).replace('{fixture}', fxFile));
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

      // TF-2522 — un SKIP dû à un module Python que la fixture déclare (`prerequis_python`) et que le poste n'a pas
      // (sondé par un import réel) est un SKIP MOTIVÉ qui nomme le paquet et la commande d'installation, jamais un
      // échec : ni le verdict, ni les messages que la paire rouge attendait d'un oracle qui n'a pas pu juger.
      const skipMotive = skipMotiveParPrerequis(v, fx.prerequis_python);
      if (skipMotive) { ok(`fixture ${fx.nom}/${side} : SKIP motivé — ${skipMotive}`); continue; }

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

// TF-2522 (14/11/2026) — UN MODULE PYTHON ABSENT DU POSTE REND UN SKIP MOTIVÉ À LA RECETTE, PAS UN ÉCHEC.
// Le fait : sur DESKTOP-ULTRA7, pypdf, pypdfium2, pdfplumber et reportlab manquent ; oracle-pdf et oracle-formulaire-pdf
// rendent SKIP avec leur motif, et la recette lisait « verdict SKIP, attendu FAIL » comme un oracle cassé (11 rouges).
// Les deux sens se jouent sur la décision elle-même (`skipMotiveParPrerequis`, sonde injectée), puis avec la vraie
// sonde. VERT : un SKIP dont un module déclaré manque se dit, le paquet et la commande d'installation nommés. ROUGE
// (l'ancienne lecture, qui échouait ici, et la nouvelle, qui ne doit pas tout excuser) : un SKIP alors que tout est
// installé, un SKIP sans module déclaré, un verdict FAUX même avec un module absent, restent des échecs.
{
  const echecs = [];
  const absent = () => false, present = () => true;
  const v1 = skipMotiveParPrerequis('SKIP', ['pypdf', 'reportlab'], { sonde: absent, py: ['python'] });
  if (!v1 || !/pypdf, reportlab/.test(v1) || !/python -m pip install pypdf reportlab/.test(v1) || !/PAS rejouée/.test(v1))
    echecs.push('VERT : un SKIP avec modules absents ne rend pas un motif qui nomme les paquets et la commande — ' + v1);
  const v2 = skipMotiveParPrerequis('SKIP', ['fitz'], { sonde: absent, py: ['py', '-3'] });
  if (!v2 || !/py -3 -m pip install pymupdf/.test(v2)) echecs.push('VERT : le module « fitz » ne se traduit pas en paquet pymupdf — ' + v2);
  const v3 = skipMotiveParPrerequis('SKIP', ['pypdf', 'json'], { sonde: (m) => m === 'json', py: ['python'] });
  if (!v3 || /json/.test(v3.split('à installer')[0]) || !/pypdf/.test(v3)) echecs.push('VERT : seul le module réellement absent doit être nommé — ' + v3);
  if (skipMotiveParPrerequis('SKIP', ['pypdf'], { sonde: present })) echecs.push('ROUGE : un SKIP alors que tous les modules déclarés sont installés est excusé');
  if (skipMotiveParPrerequis('SKIP', [], { sonde: absent }) || skipMotiveParPrerequis('SKIP', undefined, { sonde: absent }))
    echecs.push('ROUGE : un SKIP sans module déclaré est excusé');
  if (skipMotiveParPrerequis('FAIL', ['pypdf'], { sonde: absent }) || skipMotiveParPrerequis('PASS', ['pypdf'], { sonde: absent }))
    echecs.push('ROUGE : un verdict FAIL ou PASS est excusé par un module absent (seul un SKIP l\'est)');
  // La vraie sonde, avec le vrai interpréteur : un module qui n'existe pas est absent, `sys` est présent.
  if (!resolvePython()) ok('TF-2522 : vraie sonde NON JOUÉE — aucun interpréteur Python sur ce poste, et c\'est dit');
  else {
    const reel = modulesAbsents(['qo_paquet_2522_absent', 'sys']);
    if (JSON.stringify(reel) !== JSON.stringify(['qo_paquet_2522_absent'])) echecs.push('la vraie sonde ne sépare pas un module absent (qo_paquet_2522_absent) d\'un module présent (sys) : ' + JSON.stringify(reel));
    if (!/-m pip install qo_paquet_2522_absent/.test(commandeInstallation(reel))) echecs.push('la commande d\'installation ne porte pas la commande pip du paquet absent');
  }
  // La déclaration est portée par les trois fixtures dont l'oracle exige une bibliothèque PDF absente d'un poste nu.
  try {
    const fixtures = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'fixtures', 'manifest.json'), 'utf8')).fixtures;
    const declare = (n) => (fixtures.find((f) => f.nom === n) || {}).prerequis_python;
    for (const n of ['pdf', 'formulaire-pdf-champs', 'formulaire-pdf-plat'])
      if (!Array.isArray(declare(n)) || !declare(n).includes('pypdf')) echecs.push(`la fixture « ${n} » ne déclare pas prerequis_python avec pypdf`);
    for (const f of fixtures)
      if ('prerequis_python' in f && !(Array.isArray(f.prerequis_python) && f.prerequis_python.length && f.prerequis_python.every((m) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(m))))
        echecs.push(`la fixture « ${f.nom} » déclare un prerequis_python mal formé`);
  } catch (e) { echecs.push('manifest illisible : ' + e.message); }
  echecs.length
    ? echecs.forEach((e) => ko('TF-2522 : ' + e))
    : ok('TF-2522 : un module Python déclaré et absent rend un SKIP motivé (paquet et commande d\'installation nommés) ; un SKIP alors que tout est installé, sans module déclaré, ou un verdict faux restent des échecs ; la vraie sonde sépare absent et présent');
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

// TF-1480 (28/09/2026) — LA PARITÉ D'ASSETS SUR UNE CIBLE ABSENTE : SKIP MOTIVÉ, JAMAIS UNE PILE ENOENT.
// Double sens : la cible absente rend exit 2, verdict SKIP et un motif qui la nomme ; la cible
// présente (l'arborescence réelle des skills) n'est pas un SKIP — le garde ne court-circuite rien.
{
  const absente = path.join(os.tmpdir(), 'qo-1480-absent', 'rien');
  const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-parite-assets.mjs'), absente], { encoding: 'utf8', timeout: 60000 });
  let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch { /* rendu plus bas */ }
  const p = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-parite-assets.mjs'), SKILLSROOT], { encoding: 'utf8', timeout: 180000 });
  let jp = null; try { jp = JSON.parse((p.stdout || '').trim()); } catch { /* rendu plus bas */ }
  if (!j) ko('TF-1480 : cible absente — sortie non JSON (exit ' + r.status + ') : ' + String(r.stderr || '').split('\n')[0].slice(0, 120));
  else if (j.verdict !== 'SKIP' || r.status !== 2) ko('TF-1480 : cible absente — attendu SKIP exit 2, reçu ' + j.verdict + ' exit ' + r.status);
  else if (!(typeof j.motif === 'string' && j.motif.includes('qo-1480-absent'))) ko('TF-1480 : le motif du SKIP ne nomme pas la cible absente');
  else if (!jp || jp.verdict === 'SKIP') ko('TF-1480 : la cible présente rend SKIP — le garde court-circuite le jugement');
  else ok('TF-1480 : oracle-parite-assets sur une cible absente rend SKIP (exit 2) avec un motif qui la nomme, et juge toujours une cible présente (' + jp.verdict + ')');
}

// TF-2186 (06/11/2026) — DEUX JUGES DE LA MÊME PARITÉ NE SE CONTREDISENT PAS SUR LA FEUILLE DU GABARIT.
// Le fait : `embarquer-composants --constat` refusait deux fixtures V1 (copie de `boilerplate.css` de
// 19 244 octets contre 20 316) pendant qu'`oracle-parite-assets` rendait PASS sur les mêmes copies :
// la feuille du gabarit est une source SYNTHÉTIQUE (extraite de `boilerplate.html`, TF-0926) et
// l'oracle ne lisait que les `.js`/`.css` du dossier. Ce cas pose la feuille par le poseur, puis juge
// la même page par les DEUX juges, dans les trois états — à jour, périmée (une ligne du gabarit
// retirée de la copie, sous l'empreinte d'une version antérieure, comme le 08/09), retouchée sur place sous l'empreinte juste (P3 seul). Sens rouge : sur
// l'ancien oracle, l'état « périmée » rendait PASS ici et le cas rougit.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2186-'));
  try {
    const poseur = path.join(SKILLSROOT, 'digit-ai-page-html', 'scripts', 'embarquer-composants.mjs');
    const oracle = path.join(SKILLDIR, 'scripts', 'oracle-parite-assets.mjs');
    const page = path.join(tmp, 'page-gabarit.html');
    fs.writeFileSync(page, '<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n'
      + '<title>Digit-AI — feuille du gabarit · essai — 20261106a</title>\n</head>\n<body>\n<h1>Essai</h1>\n</body>\n</html>\n', 'utf8');
    const pose = spawnSync(process.execPath, [poseur, '--poser', page, '--composants', 'boilerplate.css'], { encoding: 'utf8', timeout: 60000 });
    const juger = (p) => {
      const c = spawnSync(process.execPath, [poseur, '--constat', p], { encoding: 'utf8', timeout: 60000 });
      const o = spawnSync(process.execPath, [oracle, p], { encoding: 'utf8', timeout: 60000 });
      let j = null; try { j = JSON.parse((o.stdout || '').trim()); } catch { /* rendu plus bas */ }
      return { poseur: c.status, oracle: o.status, verdict: j && j.verdict, regles: j ? (j.findings || []).map((f) => f.regle).sort().join(',') : '?' };
    };
    const fraiche = fs.readFileSync(page, 'utf8');
    const a = juger(page);
    const perimee = path.join(tmp, 'page-perimee.html');
    fs.writeFileSync(perimee, fraiche.replace('--hh: 64px;', '', 1).replace(/data-empreinte="sha256:[0-9a-f]{64}"/, 'data-empreinte="sha256:' + '0'.repeat(64) + '"'), 'utf8');
    const b = juger(perimee);
    const retouchee = path.join(tmp, 'page-retouchee.html');
    fs.writeFileSync(retouchee, fraiche.replace('--hh: 64px;', '--hh: 65px;', 1), 'utf8');
    const c = juger(retouchee);
    if (pose.status !== 0 || !fraiche.includes('data-composant="boilerplate.css"')) ko('TF-2186 : le poseur n a pas posé la feuille du gabarit — le cas ne mesure rien');
    else if (fraiche === fs.readFileSync(perimee, 'utf8') || fraiche === fs.readFileSync(retouchee, 'utf8')) ko('TF-2186 : la ligne `--hh: 64px;` a changé dans le gabarit — la mutation ne mute plus rien, le cas est à réécrire');
    else if (a.poseur !== 0 || a.oracle !== 0 || a.verdict !== 'PASS') ko(`TF-2186 : feuille à jour — poseur exit ${a.poseur}, oracle ${a.verdict} (attendu 0 et PASS)`);
    else if (b.poseur !== 1 || b.oracle !== 1 || b.verdict !== 'FAIL' || b.regles !== 'P2,P3') ko(`TF-2186 : feuille PÉRIMÉE — poseur exit ${b.poseur}, oracle ${b.verdict} ${b.regles} (attendu 1 et FAIL P2,P3) : les deux juges se contredisent`);
    else if (c.poseur !== 1 || c.oracle !== 1 || c.verdict !== 'FAIL' || c.regles !== 'P3') ko(`TF-2186 : feuille RETOUCHÉE — poseur exit ${c.poseur}, oracle ${c.verdict} ${c.regles} (attendu 1 et FAIL P3)`);
    else ok('TF-2186 : sur la feuille du gabarit, le poseur et l oracle de parité s accordent — à jour (0, PASS), périmée (1, FAIL P2,P3), retouchée (1, FAIL P3)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1481 (28/09/2026) — LE JUGE TROUVE SA RUBRIQUE SOUS WINDOWS. Le dossier du skill se dérivait
// de `new URL(import.meta.url).pathname` (« /C:/… »), que `path.resolve` préfixait d'une seconde
// lettre de lecteur (« C:\C:\… ») : la rubrique n'était jamais trouvée, SKIP permanent. Sans appeler
// de modèle : (A) un PATH vide arrête le juge à « CLI claude absent », donc APRÈS le contrôle de la
// rubrique, qui a réussi ; (B) un profil dont la rubrique manque rend un SKIP qui nomme un chemin
// SANS lettre de lecteur répétée (sens rouge : l'ancien motif contenait « C:\C:\ »).
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1481-'));
  try {
    const doc = path.join(tmp, 'doc.md'); fs.writeFileSync(doc, 'Un texte.\n');
    const lire = (extra, env) => { const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-judge.mjs'), doc, ...extra], { encoding: 'utf8', timeout: 60000, env }); try { return JSON.parse((r.stdout || '').trim()); } catch { return null; } };
    const a = lire([], { ...process.env, PATH: '', Path: '' });
    const profil = path.join(tmp, 'profil.json'); fs.writeFileSync(profil, JSON.stringify({ juge: { rubrique: 'references/rubrique-absente.md' } }));
    const b = lire(['--profil', profil], { ...process.env, PATH: '', Path: '' });
    const doublee = (s) => /[A-Za-z]:[\\/]+[A-Za-z]:/.test(s || '');
    if (!a || !b) ko('TF-1481 : sortie du juge illisible');
    else if (/rubrique introuvable/.test(a.motif || '')) ko('TF-1481 : la rubrique du skill n est pas trouvée — ' + a.motif);
    else if (!/CLI claude absent/.test(a.motif || '')) ko('TF-1481 : le juge ne va pas jusqu au contrôle de la CLI — motif « ' + (a.motif || '') + ' »');
    else if (!/rubrique introuvable/.test(b.motif || '') || doublee(b.motif)) ko('TF-1481 : le motif de rubrique absente est faux ou porte une lettre de lecteur répétée — « ' + (b.motif || '') + ' »');
    else ok('TF-1481 : oracle-judge trouve sa rubrique sous Windows (il atteint le contrôle de la CLI), et une rubrique absente est nommée par un chemin à lettre de lecteur unique');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// D-19 (a) du pilot (18/10/2026) — LA CLI DU JUGE EST LA PLUS RÉCENTE DU POSTE. Sans appel de modèle : des
// candidats simulés. Rouge : le poste du 18/10 (cli.js npm 2.1.107 et extension 2.1.300) — l'ancienne règle prenait
// le npm, qui servait claude-opus-4-6 et refuse claude-opus-5-5 ; la nouvelle doit prendre l'extension. Vert :
// QO_JUGE_CLI prime ; une version illisible passe après une version lue ; aucun candidat rend null.
{
  const { candidatsCli, choisirCli } = await import('./lib/cli-claude.mjs');
  const maison = path.join('X:', 'maison'), appdata = path.join('X:', 'appdata');
  const npm = path.join(appdata, 'npm', 'node_modules', '@anthropic-ai', 'claude-code');
  const ext = path.join(maison, '.vscode', 'extensions');
  const fichiers = new Set([path.join(npm, 'cli.js'), path.join(ext, 'anthropic.claude-code-2.1.300-win32-x64', 'resources', 'native-binary', 'claude.exe'),
    path.join(ext, 'anthropic.claude-code-2.1.299-win32-x64', 'resources', 'native-binary', 'claude.exe'), path.join('X:', 'outils', 'claude.exe')]);
  const existe = (p) => fichiers.has(p);
  const lister = () => ['anthropic.claude-code-2.1.299-win32-x64', 'anthropic.claude-code-2.1.300-win32-x64', 'autre.extension-1.0.0'];
  // le package.json du npm n'existe pas en simulation : sa version est illisible, comme un paquet abîmé
  const c = candidatsCli({ env: { APPDATA: appdata }, maison, existe, lister });
  const choisie = choisirCli(c);
  const prime = choisirCli(candidatsCli({ env: { APPDATA: appdata, QO_JUGE_CLI: path.join('X:', 'outils', 'claude.exe') }, maison, existe, lister }));
  if (c.length !== 3) ko(`D-19 (a) : 3 CLI candidates attendues (npm, extensions 2.1.299 et 2.1.300), lues ${c.length}`);
  else if (!choisie || !/2\.1\.300/.test(choisie.cmd)) ko(`D-19 (a) : la CLI retenue n'est pas la plus récente — ${choisie && choisie.cmd}`);
  else if (!prime || prime.origine !== 'QO_JUGE_CLI') ko('D-19 (a) : QO_JUGE_CLI ne prime pas sur la version');
  else if (choisirCli([]) !== null) ko('D-19 (a) : aucun candidat ne rend pas null');
  else ok('D-19 (a) : oracle-judge prend la CLI la plus récente du poste (extension 2.1.300 contre npm illisible et extension 2.1.299), QO_JUGE_CLI prime, aucun candidat rend null');
}

// TF-2033 (02/11/2026) — LE VERDICT DU JUGE SE PROUVE SANS JUGE. La paire du manifest rejoue le câblage avec une
// CLI factice (fixtures/judge-cli-factice.mjs) : FAIL relayé en exit 1, PASS en exit 0. Ici les deux sorties
// qui ne doivent JAMAIS devenir un PASS : une réponse hors contrat, et une CLI qui échoue. Avec le juge réel,
// la rouge `claims-red.md` a rendu PASS 10 fois sur 10 (notes 1,1,1,2,1) : un défaut de chiffres sort de sa rubrique.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2033-'));
  try {
    const doc = path.join(SKILLDIR, 'fixtures', 'judge-green.md');
    const stub = path.join(SKILLDIR, 'fixtures', 'judge-cli-factice.mjs');
    const jouer = (reponse) => {
      const env = { ...process.env, QO_JUGE_CLI: stub };
      delete env.QO_JUGE_REPONSE;
      if (reponse !== null) env.QO_JUGE_REPONSE = reponse;
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-judge.mjs'), doc, '--profil', path.join(SKILLDIR, 'profils', 'digit-ai.json')], { encoding: 'utf8', timeout: 60000, env });
      let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch {}
      return { j, code: r.status };
    };
    const horsContrat = path.join(tmp, 'hors-contrat.txt'); fs.writeFileSync(horsContrat, 'Le livrable est correct, bravo.\n');
    const verdictInconnu = path.join(tmp, 'verdict-inconnu.json'); fs.writeFileSync(verdictInconnu, '{"verdict":"PEUT-ETRE","scores":{},"findings":[]}');
    const a = jouer(horsContrat), b = jouer(verdictInconnu), c = jouer(null);
    const echecs = [];
    for (const [nom, x] of [['réponse sans JSON', a], ['verdict hors PASS|FAIL', b], ['CLI en échec', c]]) {
      if (!x.j) echecs.push(nom + ' : sortie illisible');
      else if (x.j.verdict !== 'SKIP' || x.code !== 2) echecs.push(nom + ' : ' + x.j.verdict + ' exit ' + x.code + ' au lieu de SKIP exit 2');
    }
    if (echecs.length) ko('TF-2033 : ' + echecs.join(' · '));
    else ok('TF-2033 : oracle-judge sur CLI factice — une réponse hors contrat, un verdict inconnu et une CLI en échec rendent SKIP exit 2, jamais PASS');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1392 + TF-1394 (13/10/2026, décisions D-2 (a) et D-3 (a)) — LA RUBRIQUE « LECTEUR VISÉ »
// D'ORACLE-JUDGE, SA PARTIE MÉCANIQUE, SANS AUCUN APPEL DE MODÈLE. Deux relecteurs jouent le
// lecteur ; le script agrège des lectures ENREGISTRÉES. Chaque règle dans ses deux sens :
//   R1 une redite vide est un refus (rouge) ; une redite écrite et COMPRIS n'en est pas un (vert) ;
//   R2 accord des 2 → constat retenu (manifest, rouge) ; un seul refus → AUCUN constat (vert) ;
//   R3 la même question à la lecture suivante remonte à l'humain (rouge) ; une question sans
//      rapport, ou une unité comprise avant, ne remonte pas (vert) ;
//   R4 « changerait un fait » sans fait cité est un constat (rouge) ; avec le fait cité, non (vert) ;
//      un constat retenu absent de REVUE.md est signalé (rouge) ;
//   et TOUT est signalement : aucun cas ne sort en 1, aucun constat n'est `bloquant`.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1392-'));
  try {
    const DOC = path.join(SKILLDIR, 'fixtures', 'judge-lecteur-vise-doc.md');
    const ROUGE = path.join(SKILLDIR, 'fixtures', 'judge-lecteur-vise-red.json');
    const VERT = path.join(SKILLDIR, 'fixtures', 'judge-lecteur-vise-green.json');
    const codes = [];
    const jouer = (extra) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-judge.mjs'), DOC, '--lecteur-vise', ...extra], { encoding: 'utf8', timeout: 60000 });
      codes.push(r.status);
      try { return JSON.parse((r.stdout || '').trim()); } catch { return null; }
    };
    const msgs = (j) => JSON.stringify((j && j.findings) || []);
    const ecrireJ = (nom, o) => { const f = path.join(tmp, nom); fs.writeFileSync(f, JSON.stringify(o)); return f; };
    const echecs = [];
    // R2 vert : le désaccord ne produit AUCUN constat retenu.
    const v = jouer(['--lectures', VERT]);
    if (!v || /CONSTAT RETENU/.test(msgs(v))) echecs.push('R2 vert : un désaccord produit un constat retenu');
    // R1 : deux relecteurs disent COMPRIS sur u2 sans savoir la redire → refus des deux → retenu.
    const paquet = JSON.parse(fs.readFileSync(VERT, 'utf8'));
    for (const l of paquet.lectures) { const u = l.unites.find((x) => x.id === 'u2'); u.redite = ''; }
    const r1 = jouer(['--lectures', ecrireJ('r1.json', paquet)]);
    if (!r1 || !(r1.findings || []).some((f) => f.where === 'u2' && /CONSTAT RETENU/.test(f.msg)))
      echecs.push('R1 rouge : une unité que les 2 relecteurs ne savent pas redire n est pas retenue');
    if (v && (v.findings || []).some((f) => f.where === 'u2' && f.sev === 'warn')) echecs.push('R1 vert : une unité redite et COMPRISE est signalée');
    // R3 : la lecture agrégée du rouge, rejouée comme précédente du rouge → question répétée.
    const prec = path.join(tmp, 'revue-lecteur.json');
    jouer(['--lectures', ROUGE, '--ecrire', prec]);
    const r3 = jouer(['--lectures', ROUGE, '--precedente', prec]);
    if (!fs.existsSync(prec) || !/QUESTION RÉPÉTÉE[^"]*MONTRER À L HUMAIN AVANT LA REMISE/.test(msgs(r3))) echecs.push('R3 rouge : la même question à deux lectures ne remonte pas à l humain');
    const precVide = ecrireJ('prec-vide.json', { retenus: [], desaccords: [] });
    const precAutre = ecrireJ('prec-autre.json', { retenus: [{ id: 'u3', questions: ['Quelle date de mise en production retenir ?'] }], desaccords: [] });
    if (/QUESTION RÉPÉTÉE/.test(msgs(jouer(['--lectures', ROUGE, '--precedente', precVide])))) echecs.push('R3 vert : une unité comprise à la lecture précédente remonte comme répétée');
    if (/QUESTION RÉPÉTÉE/.test(msgs(jouer(['--lectures', ROUGE, '--precedente', precAutre])))) echecs.push('R3 vert : une question sans rapport remonte comme répétée');
    // R4 : les suites dans REVUE.md.
    const revue = (txt) => { const f = path.join(tmp, 'REVUE.md'); fs.writeFileSync(f, '# Revue de lecture\n\n| Unité | Constat | Suite | Preuve |\n|---|---|---|---|\n' + txt + '\n'); return f; };
    const sansFait = jouer(['--lectures', ROUGE, '--revue', revue('| u3 | « il » non désigné | sans suite : changerait un fait | 2026-10-13 |')]);
    if (!/MOTIF SANS FAIT CITÉ/.test(msgs(sansFait))) echecs.push('R4 rouge : « changerait un fait » sans fait cité passe (une date dans la colonne Preuve ne compte pas)');
    const avecFait = jouer(['--lectures', ROUGE, '--revue', revue('| u3 | « il » non désigné | sans suite : changerait un fait : « le compte de recette du client, seul autorisé » | 2026-10-13 |')]);
    if (/MOTIF SANS FAIT CITÉ|SUITE ABSENTE/.test(msgs(avecFait))) echecs.push('R4 vert : un motif qui cite son fait est signalé');
    const absente = jouer(['--lectures', ROUGE, '--revue', revue('| u1 | rien | — | — |')]);
    if (!/SUITE ABSENTE de REVUE.md pour le constat retenu u3/.test(msgs(absente))) echecs.push('R4 rouge : un constat retenu sans suite dans REVUE.md n est pas signalé');
    if (/SUITE ABSENTE/.test(msgs(jouer(['--lectures', ROUGE, '--revue', revue('| u3 | « il » non désigné | réécrit : « la recette exige d être connecté au compte du client » | relu |')])))) echecs.push('R4 vert : une suite écrite est déclarée absente');
    // Un relecteur seul ne se retient pas : SKIP motivé, jamais un PASS d un seul avis.
    const seul = jouer(['--lectures', ecrireJ('seul.json', JSON.parse(fs.readFileSync(ROUGE, 'utf8')).lectures[0])]);
    if (!seul || seul.verdict !== 'SKIP' || !/deux relecteurs exigés/.test(seul.motif || '')) echecs.push('un relecteur seul n est pas refusé (SKIP motivé attendu)');
    // --preparer : la consigne porte la rubrique, le lecteur du front matter et le document.
    const prep = jouer(['--preparer', path.join(tmp, 'prep')]);
    const consigne = path.join(tmp, 'prep', 'consigne-relecteur.md');
    const ct = fs.existsSync(consigne) ? fs.readFileSync(consigne, 'utf8') : '';
    if (!prep || prep.verdict !== 'SKIP' || !/LECTEUR VISÉ ---\nle porteur du produit/.test(ct) || !/il suppose une session ouverte/.test(ct) || !/COMPRIS\|FLOU\|INCOMPRIS/.test(ct)) echecs.push('--preparer : consigne absente ou incomplète');
    // Signalement seulement.
    if (codes.some((c) => c === 1)) echecs.push('un cas sort en 1 : la rubrique bloque, alors qu elle est en signalement (D-2 (a))');
    if ([v, r1, r3, sansFait, absente].some((j) => j && (j.findings || []).some((f) => f.sev === 'bloquant'))) echecs.push('un constat est bloquant');
    if (echecs.length) ko('TF-1392/TF-1394 : ' + echecs.join(' · '));
    else ok('TF-1392/TF-1394 : rubrique lecteur visé — accord des 2 relecteurs retenu, désaccord tracé sans constat, redite vide refusée, question répétée remontée à l humain (et pas une question sans rapport), motif « changerait un fait » sans fait cité signalé (pas avec le fait), suite absente signalée, relecteur seul refusé, consigne préparée ; ' + codes.length + ' appels, aucun en exit 1, aucun appel de modèle');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1482 (28/09/2026) — T3 RECONNAÎT « CETTE PAGE EST EN LECTURE SEULE ». La formule exigeait
// « page en lecture seule » collé : un verbe d'état entre le sujet et la mention faisait refuser une
// page qui se déclare bel et bien. Double sens : les trois formulations avec verbe d'état sont
// acceptées (T3 info), la négation « n'est pas en lecture seule » reste REFUSÉE (T3 bloquant) — la
// formule élargie ne devient pas permissive.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1482-'));
  try {
    const t3 = (phrase) => {
      const f = path.join(tmp, 'p.html');
      fs.writeFileSync(f, '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Tableau</title></head><body>'
        + '<h1>Tableau</h1><table><tr><th>Marché</th><th>Écart</th></tr><tr><td>Nord</td><td>2</td></tr></table>'
        + '<p>Écart : la différence entre la cible et le relevé.</p><p>Marché : la zone suivie.</p><p>' + phrase + '</p></body></html>', 'utf8');
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-lecture-tiers.mjs'), f], { encoding: 'utf8', timeout: 60000 });
      try { const x = (JSON.parse((r.stdout || '').trim()).findings || []).find((g) => g.regle === 'T3'); return x ? x.sev : null; } catch { return null; }
    };
    const acceptees = ['Cette page est en lecture seule.', 'Cette vue reste volontairement en lecture seule.', 'Ce tableau demeure en lecture seule.', 'Page en lecture seule.']
      .filter((p) => t3(p) !== 'info');
    const refusees = ['Cette page n\'est pas en lecture seule.', 'Aucune mention ici.'].filter((p) => t3(p) !== 'bloquant');
    if (acceptees.length) ko('TF-1482 : formulation(s) correcte(s) refusée(s) par T3 — ' + acceptees.join(' · '));
    else if (refusees.length) ko('TF-1482 : T3 accepte à tort — ' + refusees.join(' · '));
    else ok('TF-1482 : T3 accepte « est / reste / demeure (volontairement) en lecture seule » et refuse toujours « n\'est pas en lecture seule » et l\'absence de mention');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1227 (14/09/2026) + TF-1484 (28/09/2026) — CE QUE LE LANCEUR LIT D'UN ORACLE, ET CE QU'IL DIT.
// Deux angles, un seul fil : la raison existe dans la sortie JSON de l'oracle et le lanceur ne
// l'affichait pas. (TF-1227) render_page.py rend `breakpoints.<largeur>.issues.<règle>[]`, ni
// `findings[]` ni `fails[]` : un FAIL valide et explicite se lisait « n'a pas su expliquer
// pourquoi ». (TF-1484) un SKIP sans constat portait son motif à place fixe depuis TF-1447, et la
// ligne restait muette. Oracle JOUET (un script qui lit le contenu du fichier jugé pour choisir sa
// sortie) et registre jouet : aucun navigateur, aucun modèle. Sens rouge : un JSON qui ne porte
// AUCUNE des formes connues garde le message d'échec muet — le lecteur ne devine rien.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1227-'));
  try {
    const stub = path.join(tmp, 'oracle-jouet.mjs');
    fs.writeFileSync(stub, [
      "import fs from 'node:fs';",
      "const m = fs.readFileSync(process.argv[2], 'utf8').trim();",
      "const iss = (o) => ({ '390': { issues: { v1_overflow: [{ what: 'document', detail: 'scrollWidth 2008px' }], v2_contrast: [o], unmeasured: ['zone non mesurée'] } }, '1280': { issues: { v2_contrast: [o] } } });",
      "const o = { what: 'div.a « texte pâle »', detail: 'ratio 1.17:1 < 4.5:1' };",
      "const sorties = {",
      "  rendu: { verdict: 'FAIL', breakpoints: iss(o) },",
      "  muet: { verdict: 'FAIL', breakpoints: { '390': { issues: { v1_overflow: [] } } } },",
      "  skipmotif: { verdict: 'SKIP', findings: [], non_juge: ['limite'], motif: 'dépôt frère absent : raison jouet' },",
      "  skipinfo: { verdict: 'SKIP', findings: [{ sev: 'info', msg: 'SANS OBJET jouet' }], non_juge: [], motif: 'SANS OBJET jouet' },",
      "};",
      "console.log(JSON.stringify(sorties[m]));",
      "process.exit(m.startsWith('skip') ? 2 : 1);",
    ].join('\n') + '\n', 'utf8');
    const regJ = path.join(tmp, 'registre-jouet.json');
    fs.writeFileSync(regJ, JSON.stringify({ version: 'jouet', oracles: [{ domaine: 'Jouet', ext: ['.txt'], type: 'cli', cmd: [process.execPath, stub, '{file}'], statut: 'ok' }] }), 'utf8');
    const ligne = (mode) => {
      const d = path.join(tmp, mode); fs.mkdirSync(d, { recursive: true });
      const f = path.join(d, 'cible.txt'); fs.writeFileSync(f, mode + '\n', 'utf8');
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), f, '--registre', regJ, '--no-cache'], { encoding: 'utf8', timeout: 120000 });
      return (r.stdout || '').split(/\r?\n/).find((l) => /\[Jouet\]/.test(l)) || '';
    };
    const rendu = ligne('rendu'), muet = ligne('muet'), skipmotif = ligne('skipmotif'), skipinfo = ligne('skipinfo');
    if (!/^ {2}❌ /.test(rendu) || /n'a pas su expliquer/.test(rendu) || !/3 constat\(s\) · v1_overflow \(390 px\) : document — scrollWidth 2008px ; v2_contrast \(390 px\) : div\.a « texte pâle » — ratio 1\.17:1/.test(rendu))
      ko('TF-1227 : un FAIL au format render_page (breakpoints.*.issues) n est pas lu — ligne « ' + rendu.slice(0, 220) + ' »');
    else if (/[4-9] constat/.test(rendu) || /1280 px/.test(rendu))
      ko('TF-1227 : les constats ne sont pas dédoublonnés d une largeur à l autre — ligne « ' + rendu.slice(0, 220) + ' »');
    else if (!/^ {2}❌ /.test(muet) || !/n'a pas su expliquer pourquoi/.test(muet))
      ko('TF-1227 : un FAIL dont le JSON ne porte aucune forme connue doit garder le message d échec muet (jamais une raison devinée) — ligne « ' + muet.slice(0, 220) + ' »');
    else if (!/^ {2}➖ /.test(skipmotif) || !/dépôt frère absent : raison jouet/.test(skipmotif))
      ko('TF-1484 : le motif d un SKIP sans constat n est pas affiché sur sa ligne — « ' + skipmotif.slice(0, 220) + ' »');
    else if (!/SANS OBJET jouet/.test(skipinfo) || /constat\(s\) · .*SANS OBJET jouet.*SANS OBJET jouet/.test(skipinfo))
      ko('TF-1484 : un SKIP qui porte déjà son détail est modifié ou doublé — « ' + skipinfo.slice(0, 220) + ' »');
    else ok('TF-1227 : un FAIL au format render_page (breakpoints.*.issues) est lu et dédoublonné d une largeur à l autre, un JSON sans aucune forme connue garde le message d échec muet ; TF-1484 : le motif d un SKIP sans constat s affiche sur sa ligne, un SKIP déjà détaillé reste intact');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1539 (01/10/2026) — `content_patterns` RESTREINT UNE ENTRÉE QUI DÉCLARE AUSSI `ext`.
// Le lanceur fusionnait par UNION : tout fichier de l'extension était routé, motif lu ou non, et les
// sept entrées à `ext` + motif jugeaient des fichiers que leur motif excluait. Registre jouet à trois
// entrées (extension + motif ; motif seul ; extension seule) sur trois pages : une qui porte le
// motif, une qui ne le porte pas, une trop grosse pour être lue (routée quand même, un routage ne
// fait jamais taire un juge sur ce qu'il n'a pas lu). Sens rouge : l'ancienne union routait la page
// SANS le motif vers l'entrée à extension + motif. Garde du plancher : l'entrée « Calculs / chiffres »
// du vrai registre garde son extension et ne porte plus de motif, son routage ne bouge pas.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1539-'));
  try {
    const stub = path.join(tmp, 'oracle-jouet.mjs');
    fs.writeFileSync(stub, "console.log(JSON.stringify({ verdict: 'PASS', findings: [], non_juge: [] }));\n", 'utf8');
    const racine = path.join(tmp, 'racine'); fs.mkdirSync(racine);
    fs.writeFileSync(path.join(racine, 'avec.html'), '<html><body><p>MOTIF-JOUET-1539</p></body></html>\n', 'utf8');
    fs.writeFileSync(path.join(racine, 'sans.html'), '<html><body><p>rien de particulier</p></body></html>\n', 'utf8');
    fs.writeFileSync(path.join(racine, 'gros.html'), '<html><body>' + 'x'.repeat(1100 * 1024) + '</body></html>\n', 'utf8');
    const entree = (domaine, ext, motifs) => ({ domaine, ext, type: 'cli', cmd: [process.execPath, stub, '{file}'], statut: 'ok', ...(motifs ? { content_patterns: motifs } : {}) });
    const regJ = path.join(tmp, 'registre-jouet.json');
    fs.writeFileSync(regJ, JSON.stringify({ version: 'jouet', oracles: [
      entree('JouetExtEtMotif', ['.html'], ['MOTIF-JOUET-1539']),
      entree('JouetMotifSeul', [], ['MOTIF-JOUET-1539']),
      entree('JouetExtSeule', ['.html'], null),
    ] }), 'utf8');
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), racine, '--registre', regJ, '--no-cache', '--json'], { encoding: 'utf8', timeout: 120000 });
    let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch { /* sortie illisible */ }
    const jugees = (dom) => j ? (j.resultats || []).filter((x) => x.domaine === dom).map((x) => path.basename(x.file)).sort().join(',') : '?';
    const reg = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'references', 'registre-oracles.json'), 'utf8'));
    const calculs = reg.oracles.find((o) => o.domaine === 'Calculs / chiffres');
    const cumul = reg.oracles.filter((o) => Array.isArray(o.ext) && o.ext.length && Array.isArray(o.content_patterns) && o.content_patterns.length).length;
    if (!j) ko('TF-1539 : sortie de run-oracles inexploitable sur le registre jouet');
    else if (jugees('JouetExtEtMotif') !== 'avec.html,gros.html') ko('TF-1539 : l entrée extension + motif doit juger la page qui porte le motif et la page illisible (trop grosse), pas la page sans motif — jugées : ' + jugees('JouetExtEtMotif'));
    else if (jugees('JouetMotifSeul') !== 'avec.html') ko('TF-1539 : l entrée à motif seul doit juger la seule page qui porte le motif — jugées : ' + jugees('JouetMotifSeul'));
    else if (jugees('JouetExtSeule') !== 'avec.html,gros.html,sans.html') ko('TF-1539 : l entrée à extension seule doit juger toutes les pages — jugées : ' + jugees('JouetExtSeule'));
    else if (!calculs || !(calculs.ext || []).includes('.md') || !(calculs.ext || []).includes('.html') || calculs.content_patterns) ko('TF-1539 : l entrée « Calculs / chiffres » (plancher) doit garder md/html et ne plus porter de motif, sinon son routage rétrécit');
    else ok('TF-1539 : un motif de contenu restreint l extension (page sans motif non routée, page illisible routée, motif seul et extension seule inchangés), et le plancher « Calculs / chiffres » route toujours tout md/html — ' + cumul + ' entrée(s) du registre déclarent encore les deux clés');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1485 (28/09/2026) — LE CONTRÔLE DE PRÉMISSE D'ACCÈS NE JUGE PAS UNE SYNTHÈSE. Mesuré le
// 02/10/2026 sur les 385 .md du dossier `output` du pilot : 37 FAIL avant, 3 après (tous dans de vraies
// analyses L99), 32 SKIP motivés en plus. Le déclencheur exige désormais qu'une prémisse soit écrite
// dans le document, et écarte les restitutions de fin de tour. Trois documents portent le MÊME bloc
// d'accès refusé sans contrôle positif : (A) une synthèse ouverte par « 0. Synthèse d'ouverture » qui
// porte même le mot « prémisse », (B) un document qui ne parle d'aucune prémisse, (C) le document qui
// pose une prémisse : seul (C) est jugé, et il reste FAIL — le déclencheur resserré ne désarme pas
// le contrôle (les fixtures rouge et verte du manifest le prouvent aussi).
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1485-'));
  try {
    const bloc = "- **Le dépôt du socle** : l'accès à l'espace de travail https://exemple.invalid/groups/a1 a été refusé (403) hier.\n";
    const docs = {
      A: "---\ndestinataire: humain\n---\n\n# Titre\n\n## 0. Synthèse d'ouverture\n\nLe mandat est rendu ; une prémisse d'accès se mesure avant d'être dite invérifiable.\n\n" + bloc,
      B: "# Journal de travail\n\nRien à signaler.\n\n" + bloc,
      C: "# Analyse\n\nPrémisse P1 : l'espace est lisible.\n\n" + bloc,
    };
    const verdict = (k) => {
      const f = path.join(tmp, k + '.md'); fs.writeFileSync(f, docs[k], 'utf8');
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-premisse-acces.mjs'), f], { encoding: 'utf8', timeout: 60000 });
      try { const j = JSON.parse((r.stdout || '').trim()); return { v: j.verdict, motif: j.motif || '' }; } catch { return { v: '?', motif: '' }; }
    };
    const a = verdict('A'), b = verdict('B'), c = verdict('C');
    if (a.v !== 'SKIP' || !/restitution/.test(a.motif)) ko('TF-1485 (A) : une synthèse ouverte par « 0. Synthèse d ouverture » doit rendre SKIP motivé « restitution » — rendu ' + a.v + ' « ' + a.motif.slice(0, 80) + ' »');
    else if (b.v !== 'SKIP' || !/aucune prémisse/.test(b.motif)) ko('TF-1485 (B) : un document sans prémisse doit rendre SKIP motivé — rendu ' + b.v + ' « ' + b.motif.slice(0, 80) + ' »');
    else if (c.v !== 'FAIL') ko('TF-1485 (C) : le document qui pose une prémisse et porte un refus sans contrôle positif doit rester FAIL — rendu ' + c.v);
    else ok('TF-1485 : le même bloc d accès refusé est SKIP motivé dans une synthèse (A) et dans un document sans prémisse (B), et reste FAIL dans le document qui pose une prémisse (C)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1483 (28/09/2026) — LES NOMS DE FICHIERS DE L'HISTOIRE SE LISENT SANS CITATION. Angles C4/C5
// lisaient `git log --name-only` sans `-z` : un chemin qui porte un octet non ASCII revenait cité en
// style C (`"rapport-Fr\303\251gate.md"`) et un terme accentué n'y figurait plus sous sa forme lisible
// (73 chemins non ASCII dans l'histoire du pilot, mesuré le 28/09 ; TF-1448 avait fermé ce trou pour
// les contenus, pas pour les noms). Deux fichiers au terme accentué dans leur NOM, retirés de l'arbre :
// l'un présent avant l'inscription du terme (2020-03-01), l'autre après. Sens rouge : avant le
// correctif, aucun des deux n'est vu. Sens vert : sans borne les deux bloquent, avec la borne le premier
// est une antériorité NOMMÉE (la date de dernière présence se lit bien dans le flux `-z`) et le second
// reste BLOQUANT — la lecture `-z` ne désarme ni ne durcit la borne de D-65. Noms inventés.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1483-'));
  try {
    const TERME = 'Frégate';
    const tables = path.join(tmp, 'tables'); fs.mkdirSync(tables);
    const ecrireTable = (nom, obj) => { const p = path.join(tables, nom); fs.writeFileSync(p, JSON.stringify(obj), 'utf8'); return p; };
    const tProduitsNu = ecrireTable('_produits-nu.json', { produits: {} });
    const g = (r, env, ...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8', env });
    const repo = path.join(tmp, 'depot'); fs.mkdirSync(repo);
    const base = { ...process.env };
    g(repo, base, 'init', '-q'); g(repo, base, 'config', 'user.email', 'banc@local'); g(repo, base, 'config', 'user.name', 'banc');
    for (const c of [
      { date: '2020-01-10T10:00:00+01:00', message: 'premier depot', ecrire: { ['rapport-' + TERME + '.md']: 'sans nom\n', 'garde.md': 'sans nom\n' } },
      { date: '2020-02-01T10:00:00+01:00', message: 'retrait du rapport', retirer: ['rapport-' + TERME + '.md'] },
      { date: '2021-01-10T10:00:00+01:00', message: 'second depot', ecrire: { ['bilan-' + TERME + '.md']: 'sans nom\n' } },
      { date: '2021-02-01T10:00:00+01:00', message: 'retrait du bilan', retirer: ['bilan-' + TERME + '.md'] },
    ]) {
      for (const [f, txt] of Object.entries(c.ecrire || {})) fs.writeFileSync(path.join(repo, f), txt, 'utf8');
      for (const f of c.retirer || []) retirerVerifie(path.join(repo, f));
      g(repo, base, 'add', '-A');
      g(repo, { ...base, GIT_AUTHOR_DATE: c.date }, 'commit', '-q', '-m', c.message);
    }
    const jouer = (tClients) => {
      const env = { ...process.env, FORGE_ROOT: tmp };
      delete env.FORGE_PRODUITS_PSEUDO; delete env.FORGE_NOMS_INTERDITS; delete env.FORGE_PORTE_PAR_REVISION;
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduitsNu], { encoding: 'utf8', timeout: 300000, env });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const nom = (j, fichier) => (j ? (j.findings || []) : []).filter((f) => f.regle === 'C4' && f.where === fichier + ' (historique)');
    const tNu = ecrireTable('_clients-nu.json', { noms: [TERME], identifiants: [], sigles: [] });
    const tBorne = ecrireTable('_clients-borne.json', { noms: [TERME], identifiants: [], sigles: [], depuis: { [TERME]: '2020-03-01' } });
    const jNu = jouer(tNu), jBorne = jouer(tBorne);
    const R = 'rapport-' + TERME + '.md', B = 'bilan-' + TERME + '.md';
    if (!jNu || !jBorne) ko('TF-1483 : sortie de l oracle inexploitable');
    else if (nom(jNu, R).length !== 1 || nom(jNu, R)[0].sev !== 'bloquant' || nom(jNu, B).length !== 1 || nom(jNu, B)[0].sev !== 'bloquant')
      ko('TF-1483 : sans borne, le terme accentué dans le NOM d un fichier retiré de l arbre doit bloquer (2 constats C4 attendus) — obtenu : ' + [R, B].map((f) => f + ' ' + nom(jNu, f).map((x) => x.sev).join('/')).join(' · '));
    else if (nom(jBorne, R).length !== 1 || nom(jBorne, R)[0].sev !== 'anteriorite')
      ko('TF-1483 : le nom présent seulement avant l inscription du terme doit être une antériorité nommée — obtenu : ' + nom(jBorne, R).map((x) => x.sev).join('/'));
    else if (nom(jBorne, B).length !== 1 || nom(jBorne, B)[0].sev !== 'bloquant')
      ko('TF-1483 : le nom présent après l inscription du terme doit rester BLOQUANT — obtenu : ' + nom(jBorne, B).map((x) => x.sev).join('/'));
    else ok('TF-1483 : un terme accentué dans le NOM d un fichier retiré de l histoire est vu (2 bloquants sans borne) ; sous une borne au 2020-03-01 le nom d avant est une antériorité nommée et le nom d après reste bloquant');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1538 (01/10/2026) — LES DEUX VUES DU REGISTRE S'ACCORDENT, ET UN CONTRÔLE LE JUGE.
// `registre-oracles.json` (machine) et `registre-oracles.md` (vue humaine) décrivent le même catalogue :
// le 01/10 un oracle manquait à la vue et cinq lignes de tableau avaient une barre verticale non
// échappée. `scripts/verifier-accord-registre.mjs` juge la version (V1), la présence du script de
// chaque entrée dans la vue (V2) et la forme des tableaux (V3). (A) les deux vraies vues s'accordent ;
// (B) trois fautes fabriquées sur une copie de la vue — version, script, barre non échappée — sont
// refusées chacune par SA règle ; (C) le REMÈDE que chaque message prescrit, joué, ramène le PASS
// (TF-1013) ; (D) un fichier absent rend SKIP motivé, jamais un PASS.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1538-'));
  try {
    const jsonReel = path.join(SKILLDIR, 'references', 'registre-oracles.json');
    const vueReelle = fs.readFileSync(path.join(SKILLDIR, 'references', 'registre-oracles.md'), 'utf8');
    const juger = (texteVue, jsonPath) => {
      const f = path.join(tmp, 'vue-' + Math.random().toString(36).slice(2) + '.md'); fs.writeFileSync(f, texteVue, 'utf8');
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'verifier-accord-registre.mjs'), '--json', jsonPath || jsonReel, '--vue', f], { encoding: 'utf8', timeout: 60000 });
      try { const j = JSON.parse((r.stdout || '').trim()); return { v: j.verdict, regles: [...new Set((j.findings || []).map((x) => x.regle).filter(Boolean))].sort().join(','), motif: j.motif || '', code: r.status }; } catch { return { v: '?', regles: '', motif: '', code: r.status }; }
    };
    const version = JSON.parse(fs.readFileSync(jsonReel, 'utf8')).version;
    const BARRE = String.fromCharCode(124), ANTI = String.fromCharCode(92);
    // fautes
    const fVersion = vueReelle.replace('(v' + version, '(v0.0.1');
    const fScript = vueReelle.split('oracle-cadence-de-mission.mjs').join('oracle-introuvable-ici');
    const echappee = ANTI + BARRE;
    const iBarre = vueReelle.indexOf('<fichier' + echappee + 'dossier>');
    const fBarre = iBarre < 0 ? null : vueReelle.replace('<fichier' + echappee + 'dossier>', '<fichier' + BARRE + 'dossier>');
    const a = juger(vueReelle), bV = juger(fVersion), bS = juger(fScript), bB = fBarre ? juger(fBarre) : null;
    const cV = juger(fVersion.replace('(v0.0.1', '(v' + version)), cS = juger(fScript.split('oracle-introuvable-ici').join('oracle-cadence-de-mission.mjs'));
    const cB = fBarre ? juger(fBarre.replace('<fichier' + BARRE + 'dossier>', '<fichier' + echappee + 'dossier>')) : null;
    const d = (() => { const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'verifier-accord-registre.mjs'), '--vue', path.join(tmp, 'absente.md')], { encoding: 'utf8', timeout: 60000 }); try { return { ...JSON.parse(r.stdout), code: r.status }; } catch { return { verdict: '?', code: r.status }; } })();
    if (a.v !== 'PASS') ko('TF-1538 (A) : les deux vraies vues du registre ne s accordent pas — ' + a.v + ' ' + a.regles);
    else if (!fBarre) ko('TF-1538 (B) : la ligne témoin « <fichier\\|dossier> » (promesses) n existe plus dans la vue — le cas de la barre non échappée ne mesure plus rien');
    else if (bV.v !== 'FAIL' || bV.regles !== 'V1') ko('TF-1538 (B) : une version divergente doit être refusée par V1 seule — ' + bV.v + ' ' + bV.regles);
    else if (bS.v !== 'FAIL' || bS.regles !== 'V2') ko('TF-1538 (B) : un script du JSON absent de la vue doit être refusé par V2 seule — ' + bS.v + ' ' + bS.regles);
    else if (bB.v !== 'FAIL' || bB.regles !== 'V3') ko('TF-1538 (B) : une barre verticale non échappée doit être refusée par V3 seule — ' + bB.v + ' ' + bB.regles);
    else if (cV.v !== 'PASS' || cS.v !== 'PASS' || cB.v !== 'PASS') ko('TF-1538 (C) : le remède prescrit par un message ne ramène pas le PASS — version ' + cV.v + ', script ' + cS.v + ', barre ' + cB.v);
    else if (d.verdict !== 'SKIP' || d.code !== 2 || !/introuvable/.test(d.motif || '')) ko('TF-1538 (D) : une vue absente doit rendre SKIP motivé exit 2 — ' + d.verdict + ' exit ' + d.code);
    else ok('TF-1538 : les deux vues du registre s accordent (version ' + version + '), V1 / V2 / V3 refusent chacune sa faute fabriquée, le remède prescrit ramène le PASS, et une vue absente rend SKIP motivé');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
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

    // TF-0991 (08/09) — LE TOTAL EST UN CHAMP. Le pilot a publié 200 pour un passif de 939 : le vrai
    // total vivait dans une phrase du non_juge. Deux sens, sur le MÊME dépôt rouge (≥ 2 constats) :
    // plafond 1 → la sortie est bornée et le total se lit SANS PROSE ; plafond par défaut →
    // total = rendus, bornee faux.
    const jouerPlafond = (plafond) => {
      const a = [path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), rouge,
        '--referentiel=' + tClients, '--produits=' + tProduits];
      const env = { ...envNu };
      if (plafond === undefined) delete env.FORGE_PORTE_PLAFOND; else env.FORGE_PORTE_PLAFOND = plafond;
      const r = spawnSync(process.execPath, a, { encoding: 'utf8', timeout: 180000, env });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const jb = jouerPlafond('1');
    if (!jb) ko('TF-0991 bornée : sortie de l oracle inexploitable');
    else if (!(jb.bornee === true && jb.rendus === jb.findings.length && jb.total > jb.rendus
               && jb.comptes && jb.comptes.bloquants.rendus === 1))
      ko(`TF-0991 bornée : total/rendus/bornee absents ou faux (total=${jb.total}, rendus=${jb.rendus}, bornee=${jb.bornee}) — le vrai total ne se lirait que dans la prose`);
    else ok(`TF-0991 bornée : plafond 1 → bornee vrai, total ${jb.total} > rendus ${jb.rendus}, lisibles SANS lire le non_juge`);
    const jn = jouerPlafond(undefined);
    if (!jn) ko('TF-0991 non bornée : sortie de l oracle inexploitable');
    else if (!(jn.bornee === false && jn.total === jn.rendus && jn.rendus === jn.findings.length))
      ko(`TF-0991 non bornée : sous le plafond, total (${jn.total}) et rendus (${jn.rendus}) devraient être égaux et bornee faux (${jn.bornee})`);
    else ok(`TF-0991 non bornée : sous le plafond, total = rendus = ${jn.total}, bornee faux`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-2340 (décision du 10/11/2026) — LA PORTE NE JUGE PAS UN DÉPÔT SUR SON PROPRE NOM.
//
// LE FAIT PAYÉ : le 16/09, le nom du dépôt d'un produit est entré à la table des produits, et C5 a
// rendu 200 constats bloquants sur les fichiers de ce produit alors qu'il rendait PASS le matin même ;
// le hameçon pre-push aurait refusé tout envoi. Un dépôt écrit son propre nom partout. La clé de la
// table qui est le nom du dépôt jugé est exemptée pour ses fichiers, noms de fichiers et messages ;
// la même clé reste jugée dans un autre dépôt. Nom INVENTÉ, dépôts jetables (même raison que TF-0820).
//   VERT  : le dépôt dont le dossier porte le nom, qui l'écrit partout → PASS, exemption dite au non_juge ;
//   VERT  : un dépôt à dossier d'un autre nom mais dont le distant porte le nom (arbre lié) → PASS ;
//   ROUGE : le même contenu dans un dépôt d'un autre nom → FAIL C5 (l'exemption ne fuit pas) ;
//   ROUGE : dans le dépôt éponyme, une autre clé de la table, y compris `<nom>-suite` → FAIL C5 sur elle
//           seule (l'exemption est celle de SON nom, comparé entier, pas d'un préfixe).
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-emet-'));
  try {
    const NOM = 'PortailBidule-Machin';
    const AUTRE = 'ElementTiers-Quelconque';
    const SUITE = 'PortailBidule-Machin-Suite';
    const tables = path.join(tmp, 'tables');
    fs.mkdirSync(tables);
    const tProduits = path.join(tables, '_produits-pseudonymes.json');
    const tClients = path.join(tables, '_noms-interdits.json');
    fs.writeFileSync(tProduits, JSON.stringify({ produits: { [NOM]: 'Produit-97', [AUTRE]: 'Produit-96', [SUITE]: 'Produit-95' } }), 'utf8');
    fs.writeFileSync(tClients, JSON.stringify({ noms: ['Zorglub'], identifiants: [], sigles: [] }), 'utf8');
    const depots = path.join(tmp, 'depots');
    fs.mkdirSync(depots);
    const batir = (dossier, lignes, message, distant) => {
      const r = path.join(depots, dossier);
      fs.mkdirSync(r);
      fs.writeFileSync(path.join(r, 'README.md'), lignes.join('\n') + '\n', 'utf8');
      const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
      g('init', '-q');
      g('config', 'user.email', 'banc@local');
      g('config', 'user.name', 'banc');
      if (distant) g('remote', 'add', 'origin', distant);
      g('add', '-A');
      g('commit', '-q', '-m', message);
      return r;
    };
    const SES_LIGNES = [`# ${NOM}`, '', '« portail bidule machin » en toutes lettres, comme un dépôt parle de lui-même.'];
    const MESSAGE = `${NOM} : première version`;
    const eponyme = batir(NOM, SES_LIGNES, MESSAGE);
    const etranger = batir('autre-depot', SES_LIGNES, MESSAGE);
    const lie = batir('copie-de-travail', SES_LIGNES, MESSAGE, `https://exemple.invalid/banc/${NOM.toLowerCase()}.git`);
    // Dépôt éponyme (dossier = NOM) qui cite en plus deux AUTRES clés de la table.
    const melangeEponyme = (() => {
      const r = path.join(depots, 'melange-hote');
      fs.mkdirSync(r);
      const sous = path.join(r, NOM);
      fs.mkdirSync(sous);
      fs.writeFileSync(path.join(sous, 'README.md'), [`# ${NOM}`, `cite ${AUTRE} ici`, `et ${SUITE} là`].join('\n') + '\n', 'utf8');
      const g = (...a) => spawnSync('git', ['-C', sous, ...a], { encoding: 'utf8' });
      g('init', '-q'); g('config', 'user.email', 'banc@local'); g('config', 'user.name', 'banc');
      g('add', '-A'); g('commit', '-q', '-m', MESSAGE);
      return sous;
    })();

    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const jouer = (repo) => {
      const a = [path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduits];
      const r = spawnSync(process.execPath, a, { encoding: 'utf8', timeout: 180000, env: envNu });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const resume = (j) => (j.findings || []).map((f) => f.regle + ' ' + f.where + ' ' + f.msg).join(' | ');

    const je = jouer(eponyme);
    if (!je) ko('TF-2340 éponyme : sortie de l oracle inexploitable');
    else if (je.verdict !== 'PASS') ko(`TF-2340 éponyme : le dépôt accusé de son propre nom (${je.verdict}) — ${resume(je)}`);
    else if (!/C5 : exemption TF-2340/.test((je.non_juge || []).join(' '))) ko('TF-2340 éponyme : PASS sans que l exemption soit DITE au non_juge — un angle réduit en silence se lit comme vert');
    else ok('TF-2340 éponyme : le dépôt dont le dossier porte le nom, qui l écrit en fichier, en variante et en message → PASS, exemption dite au non_juge');

    // Le hameçon commit-msg juge le SEUL message (`--message`) : même exemption, même limite.
    const fichierMessage = path.join(tmp, 'message.txt');
    fs.writeFileSync(fichierMessage, `${NOM} : correctif du connecteur\n`, 'utf8');
    const jouerMessage = (repo) => {
      const a = [path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduits, '--message=' + fichierMessage];
      const r = spawnSync(process.execPath, a, { encoding: 'utf8', timeout: 180000, env: envNu });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const jme = jouerMessage(eponyme), jmx = jouerMessage(etranger);
    if (!jme || !jmx) ko('TF-2340 --message : sortie de l oracle inexploitable');
    else if (jme.verdict !== 'PASS') ko(`TF-2340 --message : le dépôt éponyme est accusé de son nom dans son message de commit (${jme.verdict})`);
    else if (jmx.verdict !== 'FAIL') ko(`TF-2340 --message : le même message dans un dépôt d un autre nom doit échouer (${jmx.verdict})`);
    else ok('TF-2340 --message : le nom du dépôt dans son propre message de commit → PASS, le même message dans un autre dépôt → FAIL');

    const jl = jouer(lie);
    if (!jl) ko('TF-2340 arbre lié : sortie de l oracle inexploitable');
    else if (jl.verdict !== 'PASS') ko(`TF-2340 arbre lié : un dossier d un autre nom, au distant éponyme, est accusé (${jl.verdict}) — ${resume(jl)}`);
    else ok('TF-2340 arbre lié : dossier d un autre nom mais distant au nom du dépôt → PASS (l identité se lit aussi au distant)');

    const jx = jouer(etranger);
    const c5x = jx ? (jx.findings || []).filter((f) => f.regle === 'C5') : [];
    if (!jx) ko('TF-2340 étranger : sortie de l oracle inexploitable');
    else if (jx.verdict !== 'FAIL' || c5x.length < 2) ko(`TF-2340 étranger : le même contenu dans un dépôt d un autre nom doit échouer (verdict ${jx.verdict}, ${c5x.length} constat(s) C5) — l exemption fuit`);
    else ok(`TF-2340 étranger : le même contenu, dépôt d un autre nom → FAIL, ${c5x.length} constat(s) C5 (l exemption est celle du seul dépôt éponyme)`);

    const jm = jouer(melangeEponyme);
    const c5m = jm ? (jm.findings || []).filter((f) => f.regle === 'C5') : [];
    if (!jm) ko('TF-2340 autres clés : sortie de l oracle inexploitable');
    else if (jm.verdict !== 'FAIL') ko(`TF-2340 autres clés : dans le dépôt éponyme, une autre clé de la table ne fait plus échouer la porte (${jm.verdict})`);
    else if (!c5m.some((f) => f.msg.includes(AUTRE)) || !c5m.some((f) => f.msg.includes(SUITE)))
      ko(`TF-2340 autres clés : les clés « ${AUTRE} » et « ${SUITE} » devaient être jugées toutes les deux — ${resume(jm)}`);
    else if (c5m.some((f) => f.msg.includes('« ' + NOM + ' »')))
      ko('TF-2340 autres clés : le NOM du dépôt est encore accusé dans son propre dépôt — ' + resume(jm));
    else ok(`TF-2340 autres clés : dans le dépôt éponyme, « ${AUTRE} » et « ${SUITE} » restent jugées (${c5m.length} constat(s) C5), le nom du dépôt non`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-2539 (14/11/2026) — LES ALERTES DE DÉPENDANCES SE LISENT, ET LES FIXTURES VOLONTAIREMENT VULNÉRABLES SE DÉCLARENT.
//
// LE FAIT : l'hébergeur signale 35 alertes sur la branche par défaut de ce dépôt, à chaque envoi, et aucun contrôle ne les lisait. Relevées
// en lecture (`gh api`, 14/11/2026), les 35 visaient les cinq fixtures rouges de l'oracle SCA, qui portent des versions vulnérables EXPRÈS.
// `references/fixtures-vulnerables.json` les déclare, `scripts/releve-alertes-dependances.mjs` les distingue des dépendances réelles.
// Deux sens, hors ligne (des relevés d'API figés sous fixtures/alertes-dependances/, jamais le réseau) :
//   VERT  : des alertes qui ne visent que des fixtures déclarées → exit 0, la distinction dite ;
//   ROUGE : une alerte sur une dépendance réelle, une alerte sur un dossier VOISIN d'une fixture déclarée (`sca-red-bis`), une déclaration
//           sans motif, une source illisible ou absente → exit 1 (réelles nommées) ou 2 (INCONCLUSIF), jamais un « zéro » qui n'a rien lu.
{
  const racineDepot = path.resolve(SKILLDIR, '..', '..', '..');
  const releve = path.join(SKILLDIR, 'scripts', 'releve-alertes-dependances.mjs');
  const dossierAlertes = path.join(SKILLDIR, 'fixtures', 'alertes-dependances');
  const jouer = (...a) => spawnSync(process.execPath, [releve, ...a], { encoding: 'utf8', timeout: 60000 });
  const declaration = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'references', 'fixtures-vulnerables.json'), 'utf8'));
  const declarees = (declaration.fixtures || []).map((f) => String(f.chemin).replace(/\/+$/, ''));
  const dossiersRouges = fs.readdirSync(path.join(SKILLDIR, 'fixtures')).filter((n) => /^sca(-.*)?-red$/.test(n))
    .map((n) => '.claude/skills/quality-oracles/fixtures/' + n);
  const nonDeclarees = (liste, dossiers) => dossiers.filter((d) => !liste.includes(d));

  const incompletes = (declaration.fixtures || []).filter((f) => !f.chemin || !f.motif || !/^\d{4}-\d{2}-\d{2}$/.test(f.date || ''));
  const absentes = declarees.filter((d) => !fs.existsSync(path.join(racineDepot, d)));
  if (!declarees.length || incompletes.length || absentes.length) ko(`TF-2539 déclaration : liste vide ou incomplète (${incompletes.length} entrée(s) sans chemin, motif ou date) ou chemin inexistant (${absentes.join(', ') || 'aucun'})`);
  else if (nonDeclarees(declarees, dossiersRouges).length) ko('TF-2539 déclaration : fixture(s) rouge(s) de l oracle SCA non déclarée(s) volontairement vulnérable(s) : ' + nonDeclarees(declarees, dossiersRouges).join(', '));
  else if (nonDeclarees(declarees.slice(1), dossiersRouges).length !== 1) ko('TF-2539 déclaration (rouge) : une fixture rouge retirée de la liste doit se voir, une seule fois');
  else ok(`TF-2539 déclaration : les ${dossiersRouges.length} fixtures rouges de l oracle SCA sont déclarées (chemin, date, motif), tous les chemins existent, et le retrait d une seule se voit`);

  const vert = jouer('--alertes', path.join(dossierAlertes, 'alertes-sur-fixtures.json'));
  if (vert.status !== 0 || !/3 alerte\(s\) ouverte\(s\)[^\n]*3 sur des fixtures volontairement vulnérables déclarées, 0 sur des dépendances réelles/.test(vert.stdout) || !vert.stdout.includes('PASS'))
    ko('TF-2539 vert : des alertes qui ne visent que des fixtures déclarées doivent rendre exit 0 et dire la distinction — ' + vert.status + ' ' + (vert.stdout + vert.stderr).slice(0, 300));
  else ok('TF-2539 vert : 3 alertes sur des fixtures déclarées → exit 0, « 3 sur des fixtures volontairement vulnérables déclarées, 0 sur des dépendances réelles »');

  const rouge = jouer('--alertes', path.join(dossierAlertes, 'alertes-avec-reelle.json'));
  if (rouge.status !== 1 || !/RÉELLE n° 4 : pillow[^\n]*critical[^\n]*pyproject\.toml/.test(rouge.stdout) || !/RÉELLE n° 5 : requests[^\n]*sca-red-bis/.test(rouge.stdout))
    ko('TF-2539 rouge : une dépendance réelle et un dossier voisin d une fixture déclarée (`sca-red-bis`) doivent être nommées et rendre exit 1 — ' + rouge.status + ' ' + rouge.stdout.slice(0, 500));
  else if (/RÉELLE n° (1|6) :/.test(rouge.stdout) || !/3 alerte\(s\) ouverte\(s\)[^\n]*1 sur des fixtures volontairement vulnérables déclarées, 2 sur des dépendances réelles/.test(rouge.stdout))
    ko('TF-2539 rouge : l alerte de la fixture déclarée (n° 1) et l alerte rejetée (n° 6) ne doivent pas compter parmi les réelles — ' + rouge.stdout.slice(0, 500));
  else ok('TF-2539 rouge : une dépendance réelle (critique) et un dossier voisin de fixture sont nommés, exit 1 ; la fixture déclarée et l alerte rejetée n y sont pas');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2539-'));
  try {
    const sansMotif = path.join(tmp, 'declaration-sans-motif.json');
    fs.writeFileSync(sansMotif, JSON.stringify({ fixtures: [{ chemin: '.claude/skills/quality-oracles/fixtures/sca-red', date: '2026-11-14' }] }), 'utf8');
    const illisible = path.join(tmp, 'alertes-illisibles.json');
    fs.writeFileSync(illisible, '{ pas du json', 'utf8');
    const refus = [
      ['déclaration sans motif', jouer('--alertes', path.join(dossierAlertes, 'alertes-sur-fixtures.json'), '--declaration', sansMotif), /n'a pas ses trois champs/],
      ['alertes illisibles', jouer('--alertes', illisible), /alertes non lisibles/],
      ['alertes absentes', jouer('--alertes', path.join(tmp, 'absent.json')), /alertes illisibles/],
      ['aucune source', jouer(), /une source d'alertes, et une seule/],
    ];
    const faux = refus.filter(([, r, motif]) => r.status !== 2 || !r.stdout.includes('INCONCLUSIF') || !motif.test(r.stdout));
    if (faux.length) ko('TF-2539 refus : doivent rendre exit 2 INCONCLUSIF avec leur motif, jamais un zéro : ' + faux.map(([n, r]) => `${n} (exit ${r.status} : ${(r.stdout + r.stderr).slice(0, 120)})`).join(' · '));
    else ok('TF-2539 refus : une déclaration sans motif, des alertes illisibles ou absentes, aucune source → exit 2 INCONCLUSIF avec le motif, jamais « aucune alerte réelle » sur ce qu on n a pas lu');
    const js = jouer('--alertes', path.join(dossierAlertes, 'alertes-sur-fixtures.json'), '--json');
    let o = null; try { o = JSON.parse(js.stdout); } catch { /* ko ci-dessous */ }
    if (!o || o.verdict !== 'PASS' || o.alertes_ouvertes !== 3 || o.dependances_reelles !== 0 || js.status !== 0) ko('TF-2539 --json : verdict, alertes_ouvertes et dependances_reelles doivent être des champs — ' + js.stdout.slice(0, 200));
    else ok('TF-2539 --json : verdict PASS, alertes_ouvertes 3 et dependances_reelles 0 se lisent en champs, sans prose');
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

    // TF-1002 (09/09) — LA FRONTIÈRE ET LA LOCALISATION, sur le MÊME fichier. Le constat du 09/09
    // accusait un commentaire qui citait la clé DANS un mot, et le localisait 29 lignes plus bas.
    // Lignes 1 et 2 : la clé collée à une lettre (« …c », comme « escc ») — aucun constat. Ligne 3 :
    // la clé nue — un constat, et son `where` porte LA ligne du terme, pas une autre.
    const ligne = batir('ligne', 'notes.md', [
      '// exemple de faux positif : « ' + CLE.toLowerCase() + 'c » dans un mot ordinaire',
      '// et encore d' + CLE.toLowerCase() + 'client, colle a sa suite',
      'Le connecteur de ' + CLE + ' reste a brancher.',
      '',
    ].join('\n'));
    const jl = jouer(ligne);
    const c5l = c5de(jl);
    if (!jl) ko('TF-1002 localisation : sortie de l oracle inexploitable');
    else if (c5l.length !== 1) ko(`TF-1002 localisation : ${c5l.length} constat(s) C5 au lieu d UN — la cle collee dans un mot est accusee, ou la cle nue ne l est plus`);
    else if (!/^notes\.md:3$/.test(c5l[0].where)) ko(`TF-1002 localisation : le constat pointe « ${c5l[0].where} » au lieu de notes.md:3 — un where est une promesse de localisation`);
    else ok('TF-1002 localisation : la cle collee dans un mot (lignes 1-2) ne fait aucun constat, la cle nue en fait UN, localise a notes.md:3');

    const jc = jouer(colle);
    if (!jc) ko('TF-0880 collee : sortie de l oracle inexploitable');
    else if (c5de(jc).length) ko('TF-0880 collee : la cle COLLEE a des lettres fait encore un constat C5 (' + c5de(jc).length + ') — un identifiant de code n est pas un nom de produit');
    else if (jc.verdict !== 'PASS') ko('TF-0880 collee : le depot au seul identifiant ne rend pas PASS (' + jc.verdict + ')');
    else ok('TF-0880 collee : la cle collee a des lettres (« MDX' + CLE + ' » pour « ' + CLE + ' ») ne fait plus AUCUN constat C5');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1456 (28/09 et 01/10/2026) — LE POINT MÉDIAN SÉPARE, ET LES ACCENTS SE REPLIENT.
// LE FAIT : un nom d'affichage de produit en deux parties séparées par un point médian, publié
// dans 6 fichiers, et la forme ACCENTUÉE d'un nom de produit, publiée dans 13, ont traversé la
// porte : les variantes ne connaissaient que l'espace, le tiret et le souligné, et rien ne
// repliait les accents. Clés INVENTÉES, dépôts jetables. Trois sens rouges, un vert :
//   (1) « Portail · Bidule » pour la clé « Portail Bidule » → FAIL C5 ;
//   (2) « Pôrtail Bîdule » pour la même clé → FAIL C5 ;
//   (3) « Chrônopode » pour la clé d'un seul mot « Chronopode » → FAIL C5 ;
//   (4) VERT — « Portail · Bidulerie » : la frontière tient avec le point médian, aucun constat.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-c5-median-'));
  try {
    const tProduits = path.join(tmp, 'produits.json');
    const tClients = path.join(tmp, 'clients.json');
    fs.writeFileSync(tProduits, JSON.stringify({ produits: { 'Portail Bidule': 'Produit-96', Chronopode: 'Produit-95' } }), 'utf8');
    fs.writeFileSync(tClients, JSON.stringify({ noms: ['Zorglub'], identifiants: [], sigles: [] }), 'utf8');
    const batir = (nom, contenu) => {
      const r = path.join(tmp, nom);
      fs.mkdirSync(r);
      fs.writeFileSync(path.join(r, 'notes.md'), contenu, 'utf8');
      const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
      g('init', '-q'); g('config', 'user.email', 'banc@local'); g('config', 'user.name', 'banc');
      g('add', '-A'); g('commit', '-q', '-m', 'depot jetable du banc');
      return r;
    };
    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const c5 = (repo) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduits], { encoding: 'utf8', timeout: 180000, env: envNu });
      let j = null; try { j = JSON.parse(r.stdout); } catch { /* dit ci-dessous */ }
      return j ? (j.findings || []).filter((f) => f.regle === 'C5' && f.sev === 'bloquant').length : null;
    };
    const cas = [
      ['median', 'Le guide du Portail · Bidule est remis demain.\n', true],
      ['accents', 'Le guide du Pôrtail Bîdule est remis demain.\n', true],
      ['mot-accentue', 'Le module Chrônopode est remis demain.\n', true],
      ['frontiere', 'Le guide du Portail · Bidulerie est remis demain.\n', false],
    ].map(([nom, texte, attendu]) => [nom, c5(batir(nom, texte)), attendu]);
    const faux = cas.filter(([, n, attendu]) => n === null || (n > 0) !== attendu);
    if (faux.length) ko('TF-1456 : ' + faux.map(([nom, n, attendu]) => `${nom} → ${n === null ? 'sortie illisible' : n + ' constat(s) C5'} (attendu ${attendu ? 'au moins 1' : '0'})`).join(' ; '));
    else ok('TF-1456 : point médian et accents repliés — « Portail · Bidule », « Pôrtail Bîdule » et « Chrônopode » font FAIL C5, « Portail · Bidulerie » n en fait aucun');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1839 (17/10/2026, décision D-16 (a)) — LA FORME COLLÉE D'UN NOM À SÉPARATEURS.
// LE FAIT : un nom de projet inscrit à la table avec des séparateurs (point de domaine, apostrophe,
// esperluette) et écrit COLLÉ dans 16 fichiers suivis du pilot : la porte rendait PASS, elle
// comparait la graphie exacte (et des variantes de mots seulement pour une clé sans point).
// Clés INVENTÉES, dépôts jetables. Rouge avant le correctif (1, 2, 3), vert après ; contre-épreuves :
//   (1) « AtelierBoreal » pour la clé « Atelier.Boréal » → FAIL C5 ;
//   (2) « projetdelaube » pour la clé « Projet de l'Aube » → FAIL C5 ;
//   (3) « SolarWind » pour la clé « Solar&Wind » → FAIL C5 ;
//   (4) CONTRE-ÉPREUVE — « atelierborealite » (mot voisin) : aucun constat ;
//   (5) CONTRE-ÉPREUVE — « luneNet » : la forme collée de « Lune.Net » fait 7 caractères, sous le
//       seuil de 8, elle n'existe pas : aucun constat.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-c5-collee-'));
  try {
    const tProduits = path.join(tmp, 'produits.json');
    const tClients = path.join(tmp, 'clients.json');
    fs.writeFileSync(tProduits, JSON.stringify({ produits: { 'Atelier.Boréal': 'Produit-96', "Projet de l'Aube": 'Produit-95', 'Solar&Wind': 'Produit-94', 'Lune.Net': 'Produit-93' } }), 'utf8');
    fs.writeFileSync(tClients, JSON.stringify({ noms: ['Zorglub'], identifiants: [], sigles: [] }), 'utf8');
    const batir = (nom, contenu) => {
      const r = path.join(tmp, nom);
      fs.mkdirSync(r);
      fs.writeFileSync(path.join(r, 'notes.md'), contenu, 'utf8');
      const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
      g('init', '-q'); g('config', 'user.email', 'banc@local'); g('config', 'user.name', 'banc');
      g('add', '-A'); g('commit', '-q', '-m', 'depot jetable du banc');
      return r;
    };
    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const c5 = (repo) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduits], { encoding: 'utf8', timeout: 180000, env: envNu });
      let j = null; try { j = JSON.parse(r.stdout); } catch { /* dit ci-dessous */ }
      return j ? (j.findings || []).filter((f) => f.regle === 'C5' && f.sev === 'bloquant').length : null;
    };
    const cas = [
      ['point', 'Le module AtelierBoreal est remis demain.\n', true],
      ['apostrophe', 'Le module projetdelaube est remis demain.\n', true],
      ['esperluette', 'Le module SolarWind est remis demain.\n', true],
      ['dossier-version', 'Le dossier c:/dev/AtelierBoreal2/src est remis demain.\n', true],
      ['voisin', 'Le module atelierborealite est remis demain.\n', false],
      ['voisin-chiffre-lettre', 'Le module atelierboreal2b est remis demain.\n', false],
      ['sous-seuil', 'Le module luneNet est remis demain.\n', false],
    ].map(([nom, texte, attendu]) => [nom, c5(batir(nom, texte)), attendu]);
    const faux = cas.filter(([, n, attendu]) => n === null || (n > 0) !== attendu);
    if (faux.length) ko('TF-1839 : ' + faux.map(([nom, n, attendu]) => `${nom} → ${n === null ? 'sortie illisible' : n + ' constat(s) C5'} (attendu ${attendu ? 'au moins 1' : '0'})`).join(' ; '));
    else ok('TF-1839 : forme collée d’un nom à séparateurs — « AtelierBoreal », « AtelierBoreal2 » (dossier versionné), « projetdelaube », « SolarWind » font FAIL C5 ; « atelierborealite », « atelierboreal2b » et « luneNet » (7 car., sous le seuil de 8) n’en font aucun');
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

// TF-2130 (04/11/2026) — UN NOM QUI EST AUSSI UN MOT COURANT : QUATRIÈME GENRE, `noms_mot_courant`.
//
// LE FAIT. Le 04/11, la porte a refusé l'envoi du pilot sur 2 lignes d'une étude et sur un message de
// commit qui employaient, au sens courant, le terme abrégé des tests d'intrusion, parce qu'un produit
// inscrit à la table porte ce terme pour nom. Aucun des trois genres ne convenait : le nom (insensible
// à la casse, sous-chaîne) attrape l'usage courant et les mots composés ; le sigle (insensible à la
// casse, mot entier) attrape l'usage courant ; l'identifiant (sensible à la casse, sous-chaîne)
// attrape les mots composés.
//
// CE QUE CE BANC PROUVE, EN DEUX SENS QUI NE SE REMPLACENT PAS, SUR CHAQUE ANGLE (C1 contenu, C2 nom
// de fichier, C3 message, C4 contenu d'histoire, et le mode `--message` du hameçon) :
//   (A) LE SENS ROUGE — la graphie EXACTE, en mot entier, est attrapée : sans lui, un genre qui ne
//       déclenche jamais passerait pour une porte qui sait distinguer ;
//   (B) LE SENS VERT — la même graphie en minuscules, en capitales, ou collée à un autre mot
//       (« FooBarBaz », « XFooBar », « FooBar_suite ») ne l'est PAS.
// Et un contrôle de NON-RÉGRESSION : les trois genres d'avant, dans la MÊME table, mordent comme avant.
// La graphie « FooBar » est INVENTÉE : aucun nom du parc ne s'écrit ici.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-motcourant-'));
  try {
    const MOT = 'FooBar';
    const tables = path.join(tmp, 'tables');
    fs.mkdirSync(tables);
    const tClients = path.join(tables, 'clients.json');
    const tProduits = path.join(tables, 'produits.json');
    fs.writeFileSync(tClients, JSON.stringify({
      noms: ['Zorglubtron'], identifiants: ['wks-12345678901234'], sigles: ['ZQX'], noms_mot_courant: [MOT],
    }), 'utf8');
    fs.writeFileSync(tProduits, JSON.stringify({ produits: { 'Zorgonaute-Machin': 'Produit-95' } }), 'utf8');
    const depots = path.join(tmp, 'depots');
    fs.mkdirSync(depots);
    const envNu = { ...process.env };
    delete envNu.FORGE_PRODUITS_PSEUDO;
    delete envNu.FORGE_NOMS_INTERDITS;
    envNu.FORGE_ROOT = tmp;
    const jouer = (cible, ...plus) => {
      const r = spawnSync(process.execPath, [
        path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), cible,
        '--referentiel=' + tClients, '--produits=' + tProduits, ...plus,
      ], { encoding: 'utf8', timeout: 300000, env: envNu });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    // Un dépôt jetable : `fichiers` entrent au premier commit (message `m1`) ; si `retrait`, ils sortent
    // de l'arbre au second (message neutre) — l'arbre courant est alors propre et seul C4 parle.
    const batir = (nom, fichiers, m1, retrait) => {
      const r = path.join(depots, nom);
      fs.mkdirSync(r, { recursive: true });
      const g = (...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
      g('init', '-q'); g('config', 'user.email', 'banc@local'); g('config', 'user.name', 'banc');
      fs.writeFileSync(path.join(r, 'garde.md'), 'Ce fichier reste, et ne porte rien.\n', 'utf8');
      for (const [f, c] of Object.entries(fichiers)) fs.writeFileSync(path.join(r, f), c, 'utf8');
      g('add', '-A'); g('commit', '-q', '-m', m1);
      if (retrait) {
        for (const f of Object.keys(fichiers)) retirerVerifie(path.join(r, f));
        g('add', '-A'); g('commit', '-q', '-m', 'retrait des pieces');
      }
      return r;
    };
    // Le contenu : DEUX fichiers qui doivent mordre (graphie exacte, mot entier — la ponctuation et le
    // tiret bornent), CINQ qui ne doivent pas. Les noms de fichiers sont neutres : un terme dans un nom
    // lèverait C2 et C4 de nom, et le banc ne saurait plus ce qu'il mesure.
    const contenus = {
      'piece-exacte.md': 'Le produit ' + MOT + ' est livre.\n',
      'piece-ponct.md': 'Voir (' + MOT + '), ' + MOT + '-suite et « ' + MOT + ' ».\n',
      'piece-minuscule.md': 'Le test ' + MOT.toLowerCase() + ' en minuscules, ' + MOT.toUpperCase() + ' en capitales et fooBAR en casse mixte.\n',
      'piece-suffixe.md': 'Le mot ' + MOT + 'Baz est colle a son suffixe.\n',
      'piece-prefixe.md': 'Le mot X' + MOT + ' est colle a son prefixe.\n',
      'piece-souligne.md': 'Le mot ' + MOT + '_suite est lie par un souligne.\n',
      'piece-genres.md': 'Zorglubtron ici.\nLe sigle ZQX seul.\nLe mot azqxue est ordinaire.\nwks-12345678901234 ici.\n',
    };
    const DOIVENT = ['piece-exacte.md', 'piece-ponct.md'];
    const NE_DOIVENT_PAS = ['piece-minuscule.md', 'piece-suffixe.md', 'piece-prefixe.md', 'piece-souligne.md'];
    const fichiersDe = (j, regle, filtre) => (j ? (j.findings || []) : [])
      .filter(f => f.regle === regle && (!filtre || filtre.test(f.msg)) && f.msg.includes('« ' + MOT + ' »'))
      // C4 localise « <révision>:<chemin> », les autres angles « <chemin>:<ligne> » ou le chemin seul.
      .map(f => (regle === 'C4' ? f.where.split(':').slice(1).join(':') : f.where.split(':')[0]));
    const verdictDe = (etiquette, j, trouves) => {
      if (!j) { ko(`TF-2130 ${etiquette} : sortie de l oracle inexploitable`); return; }
      const manque = DOIVENT.filter(f => !trouves.includes(f));
      const trop = NE_DOIVENT_PAS.filter(f => trouves.includes(f));
      if (manque.length) ko(`TF-2130 ${etiquette} (sens rouge) : la graphie exacte « ${MOT} » en mot entier n est PAS attrapée dans ${manque.join(', ')} — le genre \`noms_mot_courant\` ne déclenche pas`);
      else if (trop.length) ko(`TF-2130 ${etiquette} (sens vert) : « ${MOT} » est attrapée à tort dans ${trop.join(', ')} — minuscules, capitales, casse mixte, mots composés : le genre doit être sensible à la casse ET borné au mot entier`);
      else ok(`TF-2130 ${etiquette} : la graphie exacte en mot entier est attrapée (${DOIVENT.length} fichiers), minuscules / capitales / casse mixte / préfixe / suffixe / souligné ne le sont pas (${NE_DOIVENT_PAS.length} fichiers)`);
    };

    // C1 : l'arbre courant.
    const arbre = batir('arbre', { ...contenus, 'FooBar-notes.md': 'Rien ici.\n' }, 'premier depot du banc', false);
    const ja = jouer(arbre);
    verdictDe('C1 contenu', ja, fichiersDe(ja, 'C1'));
    // C2 : les noms de fichiers — le nom exact borné par un tiret mord ; sa version en minuscules et les
    // noms composés non. Les variantes vivent dans un SECOND dépôt : « FooBar-notes.md » et « foobar-notes.md »
    // ne coexistent pas sur un système de fichiers insensible à la casse (Windows), et un cas où l'un écrase
    // l'autre serait vide de sens.
    const c2 = fichiersDe(ja, 'C2');
    const rien = 'Rien ici.\n';
    const noms = batir('arbre-noms', { 'foobar-notes.md': rien, 'FooBarBaz-notes.md': rien, 'XFooBar-notes.md': rien }, 'premier depot du banc', false);
    const jn = jouer(noms);
    const c2v = fichiersDe(jn, 'C2');
    if (!ja || !jn) ko('TF-2130 C2 nom de fichier : sortie de l oracle inexploitable');
    else if (!c2.includes('FooBar-notes.md')) ko('TF-2130 C2 nom de fichier (sens rouge) : « FooBar-notes.md » n est PAS attrapé');
    else if (c2v.length) ko(`TF-2130 C2 nom de fichier (sens vert) : ${c2v.join(', ')} attrapé(s) à tort — minuscules ou nom composé`);
    else ok('TF-2130 C2 nom de fichier : « FooBar-notes.md » mord ; « foobar-notes.md », « FooBarBaz-notes.md » et « XFooBar-notes.md » non');

    // NON-RÉGRESSION : les trois genres d'avant, dans la même table, sur le même passage.
    const lignesGenres = (ja ? ja.findings || [] : []).filter(f => f.regle === 'C1' && f.where.startsWith('piece-genres.md:')).map(f => f.where.split(':')[1]).sort();
    if (!ja) { /* déjà dit */ }
    else if (lignesGenres.join(',') !== '1,2,4') ko(`TF-2130 non-régression : les trois genres d avant mordent sur les lignes [${lignesGenres}] de piece-genres.md, attendu [1,2,4] (nom, sigle en mot entier, identifiant ; le mot azqxue reste muet)`);
    else ok('TF-2130 non-régression : nom, sigle (mot entier) et identifiant mordent comme avant dans la même table que `noms_mot_courant` (lignes 1, 2 et 4 ; « azqxue » muet)');

    // C4 : le contenu de l'histoire, fichiers RETIRÉS de l'arbre — le groupe `git grep -w` sans `-i`.
    const histoire = batir('histoire', contenus, 'premier depot du banc', true);
    const jh = jouer(histoire);
    verdictDe('C4 contenu d histoire', jh, fichiersDe(jh, 'C4', /CONTENU d'un fichier de l'historique/));

    // C3 : les messages de commit.
    const mess = path.join(depots, 'messages');
    fs.mkdirSync(mess, { recursive: true });
    {
      const g = (...a) => spawnSync('git', ['-C', mess, ...a], { encoding: 'utf8' });
      g('init', '-q'); g('config', 'user.email', 'banc@local'); g('config', 'user.name', 'banc');
      const poser = (n, msg) => { fs.writeFileSync(path.join(mess, 'f.txt'), n + '\n', 'utf8'); g('add', '-A'); g('commit', '-q', '-m', msg); return g('rev-parse', 'HEAD').stdout.trim().slice(0, 12); };
      const shaExact = poser('1', 'Ajoute ' + MOT + ' au catalogue');
      const shaMin = poser('2', 'Rappelle ' + MOT.toLowerCase() + ' et ' + MOT.toUpperCase() + ' en usage courant');
      const shaCol = poser('3', 'Corrige ' + MOT + 'Baz et X' + MOT + ' et ' + MOT + '_suite');
      const jm = jouer(mess);
      const shas = fichiersDe(jm, 'C3');
      if (!jm) ko('TF-2130 C3 message : sortie de l oracle inexploitable');
      else if (!shas.includes(shaExact)) ko(`TF-2130 C3 message (sens rouge) : le message portant la graphie exacte « ${MOT} » n est PAS attrapé`);
      else if (shas.includes(shaMin) || shas.includes(shaCol)) ko('TF-2130 C3 message (sens vert) : un message en minuscules, capitales ou mot composé est attrapé à tort');
      else ok('TF-2130 C3 message : le message portant la graphie exacte est attrapé, ceux en minuscules / capitales / mots composés ne le sont pas');
    }

    // Le hameçon commit-msg : `--message=<fichier>`.
    const msgFichier = (nom, texte) => { const p = path.join(tmp, nom); fs.writeFileSync(p, texte, 'utf8'); return p; };
    const jmo = jouer(mess, '--message=' + msgFichier('msg-exact.txt', 'Ajoute ' + MOT + ' au catalogue\n'));
    const jmn = jouer(mess, '--message=' + msgFichier('msg-courant.txt', 'Le test ' + MOT.toLowerCase() + ' est un usage courant\n# ' + MOT + ' en commentaire git\nIl y a ' + MOT + 'Baz aussi\n'));
    if (!jmo || !jmn) ko('TF-2130 --message : sortie de l oracle inexploitable');
    else if (jmo.verdict !== 'FAIL' || fichiersDe(jmo, 'C3').length !== 1) ko(`TF-2130 --message (sens rouge) : le message portant la graphie exacte rend ${jmo.verdict} / ${fichiersDe(jmo, 'C3').length} constat(s), attendu FAIL / 1`);
    else if (jmn.verdict !== 'PASS') ko(`TF-2130 --message (sens vert) : un message en minuscules / mot composé rend ${jmn.verdict}, attendu PASS (la ligne de commentaire git n est jamais jugée)`);
    else ok('TF-2130 --message : la graphie exacte fait échouer le hameçon (1 constat), l usage courant en minuscules et le mot composé passent');
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
        for (const f of c.retirer || []) retirerVerifie(path.join(r, f));
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

    // (A bis) D-65 (a) du 12/10/2026 — un MESSAGE de commit ancien est borne comme un blob ancien :
    //     publie, il ne se corrige pas sans reecrire l'historique. Meme double sens que (A).
    const histoireMsg = batir('histoire-message', [
      { date: VIEUX, message: 'compte rendu remis a ' + CLIENT,
        ecrire: { 'garde.md': 'Ce fichier ne porte aucun nom.\n' } },
    ]);
    const jM1 = jouer(histoireMsg, borneApres, tProduitsNu);
    const aM1 = ante(jM1).filter(f => f.regle === 'C3');
    if (!jM1) ko('D-65 (a) sens 1 : sortie de l oracle inexploitable');
    else if (jM1.verdict !== 'PASS' || aM1.length !== 1 || !/ANTÉRIORITÉ/.test(aM1[0].msg)) ko('D-65 (a) sens 1 : un message de 2020 anterieur a la borne du 2025-01-01 devrait etre UNE anteriorite C3 nommee, verdict PASS — obtenu ' + jM1.verdict + ', ' + aM1.length + ' anteriorite(s)');
    else ok('D-65 (a) sens 1 : message de commit de 2020 sous une borne au 2025-01-01 → PASS, 1 anteriorite C3 nommee');
    const jM2 = jouer(histoireMsg, borneAvant, tProduitsNu);
    const bM2 = bloq(jM2).filter(f => f.regle === 'C3');
    if (!jM2) ko('D-65 (a) sens 2 : sortie de l oracle inexploitable');
    else if (jM2.verdict !== 'FAIL' || bM2.length !== 1) ko('D-65 (a) sens 2 : le MEME message sous une borne au 2019-01-01 devrait rester bloquant — obtenu ' + jM2.verdict + ', ' + bM2.length + ' bloquant(s) C3');
    else ok('D-65 (a) sens 2 : le MEME message sous une borne au 2019-01-01 → FAIL, 1 bloquant C3 : la borne ne devient pas une amnistie');

    // ---------------------------------------------------------------------------------------
    // (E) LA BORNE À L'INSTANT (27/09/2026, décision humaine D-28 (a)) — la MÊME occurrence, datée
    //     du 2020-03-04 à 10:00 (+01:00), sous quatre bornes. Un instant plus tard le même jour :
    //     antériorité. Un instant plus tôt : bloquant. Le JOUR même, sans heure : bloquant — la
    //     borne au jour garde son sens. Un instant plus tard exprimé dans un AUTRE fuseau (09:30Z,
    //     soit 10:30 à +01:00) : antériorité — l'alphabet dirait l'inverse, et la comparaison doit
    //     porter sur des instants. Le fait qui l'a demandé : des enregistrements publiés le matin
    //     d'une inscription faite à 17:23, bloqués pour toujours par une borne au jour.
    // ---------------------------------------------------------------------------------------
    const borneA = (depuis) => ecrireTable('_clients-instant-' + depuis.replace(/[^0-9A-Za-z]/g, '') + '.json',
      { noms: [CLIENT], identifiants: [], sigles: [], depuis: { [CLIENT]: depuis } });
    for (const [depuis, attendu, pourquoi] of [
      ['2020-03-04T12:00:00+01:00', 'PASS', 'un instant PLUS TARD le meme jour : l occurrence de 10:00 lui est anterieure'],
      ['2020-03-04T09:00:00+01:00', 'FAIL', 'un instant PLUS TOT le meme jour : l occurrence de 10:00 lui est posterieure'],
      ['2020-03-04', 'FAIL', 'le JOUR meme, sans heure : la borne au jour garde son sens, le jour d inscription reste bloquant'],
      ['2020-03-04T09:30:00Z', 'PASS', 'un instant plus tard exprime en UTC (09:30Z = 10:30 a +01:00) : l alphabet dirait l inverse'],
    ]) {
      const jE = jouer(histoire, borneA(depuis), tProduitsNu);
      if (!jE) ko('27/09 borne a l instant (' + depuis + ') : sortie de l oracle inexploitable');
      else if (jE.verdict !== attendu) ko('27/09 borne a l instant (' + depuis + ') : attendu ' + attendu + ', obtenu ' + jE.verdict + ' — ' + pourquoi);
      else if (attendu === 'PASS' && ante(jE).length < 2) ko('27/09 borne a l instant (' + depuis + ') : ' + ante(jE).length + ' anteriorite(s) nommee(s), attendu au moins 2 (contenu du blob et nom du fichier disparu)');
      else if (attendu === 'FAIL' && bloq(jE).length < 2) ko('27/09 borne a l instant (' + depuis + ') : ' + bloq(jE).length + ' bloquant(s), attendu au moins 2');
      else ok('27/09 borne a l instant (' + depuis + ') → ' + attendu + ' : ' + pourquoi);
    }

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
    const dansMessage = aB.filter(f => /MESSAGE de commit/.test(f.msg));
    const dansHisto = aB.filter(f => /CONTENU d'un fichier de l'historique/.test(f.msg));
    if (!jB) ko('TF-0982 (B) : sortie de l oracle inexploitable');
    else if (jB.verdict !== 'FAIL') ko('TF-0982 (B) : une borne au 2099-01-01 desarme la porte ENTIERE (' + jB.verdict + ') — l arbre courant et les messages de commit ont ete bornes eux aussi, alors qu ils se corrigent par une edition');
    else if (!dansArbre.length) ko('TF-0982 (B) : le nom present dans un fichier SUIVI ne bloque plus — l arbre courant a ete borne');
    else if (!dansMessage.length) ko('TF-0982 (B) et D-65 (a) : le MESSAGE de commit ancien n est pas declare en anteriorite — depuis le 12/10/2026, un message deja ecrit est borne comme un blob ancien');
    else if (!dansHisto.length) ko('TF-0982 (B) : aucune anteriorite sur le blob ancien du MEME depot — le temoin manque, et le cas ne prouve pas que la borne s applique bien QUELQUE PART');
    else ok('TF-0982 (B) : sous une borne au 2099-01-01, dans UN SEUL depot — le fichier SUIVI bloque (' + dansArbre.length + '), le MESSAGE de commit ancien est une anteriorite (' + dansMessage.length + ', D-65 (a)), et le blob ancien du meme terme aussi (' + dansHisto.length + '). Seul l arbre courant n est pas borne');

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

// TF-1448 (28/09/2026) — LA PORTE JUGE CHAQUE BLOB UNE FOIS, ET TOUJOURS CHAQUE RÉVISION.
//
// LE FAIT. La publication du pilot a pris 27 min 19 s le 28/09 : le contenu de l'histoire se
// jugeait par lots de 150 révisions, et chaque révision relisait chacun de ses fichiers. La porte
// juge désormais chaque blob unique une fois, sur un arbre synthétique, puis rapporte chaque blob
// porteur à chaque révision où il vit. Ce qui pourrait s'y perdre, et que ces cas éprouvent :
//   (A) UNE RÉVISION POSTÉRIEURE À L'INSCRIPTION RESTE JUGÉE — le même blob, présent avant ET
//       après la date d'inscription de son terme, est antériorité dans la première révision et
//       BLOQUANT dans la suivante. Une porte « incrémentale » qui ne jugerait que le commit
//       d'arrivée d'un blob rendrait PASS ici. Les deux voies rendent la même liste, dans le même
//       ordre (FORGE_PORTE_PAR_REVISION=1 impose l'ancienne) ;
//   (B) UN CHEMIN ACCENTUÉ N'ÉCHAPPE PLUS À L'HISTOIRE — `git grep -l` sans `-z` citait le chemin
//       en style C, et le couple se perdait en silence : le terme n'était jamais vu ;
//   (C) UN ATTRIBUT `diff` RAMÈNE LA VOIE PAR RÉVISION — là, le verdict de `git grep -I` dépend
//       du chemin et pas du seul contenu : la porte le constate par git et le dit au non_juge.
// LES NOMS SONT INVENTÉS, comme partout dans ce dépôt.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1448-'));
  try {
    const CLIENT = 'Farfadec';
    const tables = path.join(tmp, 'tables');
    fs.mkdirSync(tables);
    const ecrireTable = (nom, obj) => { const p = path.join(tables, nom); fs.writeFileSync(p, JSON.stringify(obj), 'utf8'); return p; };
    const tProduitsNu = ecrireTable('_produits-nu.json', { produits: {} });
    const depots = path.join(tmp, 'depots');
    fs.mkdirSync(depots);
    const g = (r, env, ...a) => spawnSync('git', ['-C', r, ...a], { encoding: 'utf8', env });
    const batir = (nom, commits) => {
      const r = path.join(depots, nom);
      fs.mkdirSync(r);
      const base = { ...process.env };
      g(r, base, 'init', '-q');
      g(r, base, 'config', 'user.email', 'banc@local');
      g(r, base, 'config', 'user.name', 'banc');
      for (const c of commits) {
        for (const [f, txt] of Object.entries(c.ecrire || {})) fs.writeFileSync(path.join(r, f), txt, 'utf8');
        for (const f of c.retirer || []) retirerVerifie(path.join(r, f));
        g(r, base, 'add', '-A');
        g(r, { ...base, GIT_AUTHOR_DATE: c.date }, 'commit', '-q', '-m', c.message);
      }
      return r;
    };
    const jouer = (repo, tClients, parRevision) => {
      const env = { ...process.env, FORGE_ROOT: tmp };
      delete env.FORGE_PRODUITS_PSEUDO; delete env.FORGE_NOMS_INTERDITS; delete env.FORGE_PORTE_PAR_REVISION;
      if (parRevision) env.FORGE_PORTE_PAR_REVISION = '1';
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-nom-client-publie.mjs'), repo,
        '--referentiel=' + tClients, '--produits=' + tProduitsNu], { encoding: 'utf8', timeout: 300000, env });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const c4 = (j) => (j ? (j.findings || []) : []).filter((f) => f.regle === 'C4');
    const cout = (j) => (j ? (j.non_juge || []) : []).find((x) => /^coût de C4/.test(x)) || '';
    const tete = (r, n) => (g(r, process.env, 'rev-list', '--reverse', 'HEAD').stdout || '').split('\n').filter(Boolean)[n].slice(0, 12);

    // (A) Le même blob avant et après l'inscription du terme (2020-03-01), puis retiré de l'arbre.
    const persistance = batir('persistance', [
      { date: '2020-01-10T10:00:00+01:00', message: 'premier depot', ecrire: { 'note.md': 'Compte rendu remis a ' + CLIENT + '.\n', 'garde.md': 'sans nom\n' } },
      { date: '2020-06-10T10:00:00+02:00', message: 'la note reste', ecrire: { 'garde.md': 'sans nom, retouche\n' } },
      { date: '2021-01-10T10:00:00+01:00', message: 'retrait de la note', retirer: ['note.md'] },
    ]);
    const tBorne = ecrireTable('_clients-borne.json', { noms: [CLIENT], identifiants: [], sigles: [], depuis: { [CLIENT]: '2020-03-01' } });
    const jA = jouer(persistance, tBorne, false), jAr = jouer(persistance, tBorne, true);
    const [r1, r2] = [tete(persistance, 0), tete(persistance, 1)];
    const bloqueA = c4(jA).filter((f) => f.sev === 'bloquant'), anteA = c4(jA).filter((f) => f.sev === 'anteriorite');
    if (!jA || !jAr) ko('TF-1448 (A) : sortie de l oracle inexploitable');
    else if (jA.verdict !== 'FAIL' || !bloqueA.some((f) => f.where === r2 + ':note.md'))
      ko('TF-1448 (A) : la revision POSTERIEURE a l inscription, qui porte encore le blob, n est plus bloquante (' + jA.verdict + ', ' + c4(jA).map((f) => f.sev + ' ' + f.where).join(', ') + ') — une porte qui ne juge que le commit d arrivee d un blob a perdu la suite');
    else if (!anteA.some((f) => f.where === r1 + ':note.md'))
      ko('TF-1448 (A) : la revision ANTERIEURE a l inscription n est pas declaree anteriorite — ' + c4(jA).map((f) => f.sev + ' ' + f.where).join(', '));
    else if (!/voie par blobs uniques/.test(cout(jA)) || !/3 révision\(s\)/.test(cout(jA)))
      ko('TF-1448 (A) : la voie par blobs uniques n a pas joue, ou ne dit pas ce qu elle a juge — ' + cout(jA).slice(0, 200));
    else if (JSON.stringify(jA.findings) !== JSON.stringify(jAr.findings) || !/FORGE_PORTE_PAR_REVISION/.test(cout(jAr)))
      ko('TF-1448 (A) : les deux voies ne rendent PAS la meme liste de constats — par blobs : ' + jA.findings.length + ', par revision : ' + jAr.findings.length);
    else ok('TF-1448 (A) : le blob present avant et apres l inscription est anteriorite en ' + r1.slice(0, 7) + ' et BLOQUANT en ' + r2.slice(0, 7) + ' ; les deux voies rendent la meme liste (' + jA.findings.length + ' constats, meme ordre)');

    // (B) Un terme dans l'histoire d'un fichier au chemin accentué, retiré de l'arbre ensuite.
    const accents = batir('accents', [
      { date: '2024-01-10T10:00:00+01:00', message: 'premier depot', ecrire: { 'synthèse-été.md': 'Remis a ' + CLIENT + '.\n', 'garde.md': 'sans nom\n' } },
      { date: '2024-01-11T10:00:00+01:00', message: 'retrait', retirer: ['synthèse-été.md'] },
    ]);
    const tNu = ecrireTable('_clients-nu.json', { noms: [CLIENT], identifiants: [], sigles: [] });
    const jB = jouer(accents, tNu, false), jBr = jouer(accents, tNu, true);
    const voitB = (j) => c4(j).some((f) => f.sev === 'bloquant' && f.where === tete(accents, 0) + ':synthèse-été.md');
    if (!jB || !jBr) ko('TF-1448 (B) : sortie de l oracle inexploitable');
    else if (jB.verdict !== 'FAIL' || !voitB(jB)) ko('TF-1448 (B) : par blobs uniques, le terme dans l histoire d un fichier au chemin ACCENTUE n est pas vu (' + jB.verdict + ')');
    else if (jBr.verdict !== 'FAIL' || !voitB(jBr)) ko('TF-1448 (B) : par revision, le terme dans l histoire d un fichier au chemin ACCENTUE n est pas vu (' + jBr.verdict + ') — la sortie de git grep cite le chemin, et le couple se perd');
    else ok('TF-1448 (B) : un terme dans l histoire de « synthèse-été.md », retire de l arbre, est BLOQUANT par les deux voies — le chemin n est plus cite en style C');

    // (C) Un attribut `diff` sur un chemin de l'histoire : la voie par révision reprend la main.
    const attributs = batir('attributs', [
      { date: '2024-02-10T10:00:00+01:00', message: 'premier depot', ecrire: { '.gitattributes': '*.dat -diff\n', 'releve.dat': 'Releve remis a ' + CLIENT + '.\n' } },
      { date: '2024-02-11T10:00:00+01:00', message: 'retrait du releve', retirer: ['releve.dat'] },
    ]);
    const jC = jouer(attributs, tNu, false), jCr = jouer(attributs, tNu, true);
    if (!jC || !jCr) ko('TF-1448 (C) : sortie de l oracle inexploitable');
    else if (!/voie par révision/.test(cout(jC)) || !/attribut `diff`/.test(cout(jC)))
      ko('TF-1448 (C) : un attribut `diff` touche un chemin de l histoire et la voie par blobs uniques a joue quand meme — le verdict de git grep -I y depend du chemin. Ligne de cout : ' + cout(jC).slice(0, 200));
    else if (JSON.stringify(jC.findings) !== JSON.stringify(jCr.findings))
      ko('TF-1448 (C) : la voie choisie par l oracle ne rend pas la liste de la voie par revision');
    else ok('TF-1448 (C) : un attribut `diff` sur « *.dat » ramene la voie par revision, et le non_juge le dit (' + jC.verdict + ', ' + jC.findings.length + ' constat(s), comme la voie imposee)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1446 (28/09/2026) — LECTURE-TIERS EST ROUTÉ SUR LES PAGES LIVRÉES, ET SEULEMENT LÀ.
//
// LE FAIT. run-oracles a rendu CONFORME une étude et sa page, chez un produit, sans appeler
// oracle-lecture-tiers : son entrée au registre portait `ext: []`, faute de quoi T4 aurait appelé
// un modèle. Or T1-T3 sont déterministes et gratuits, et T4 ne s'arme que par `--juge`, `--reponse`
// ou `lecture_tiers.actif: true` au profil (faux dans les deux profils livrés). Joué à la main,
// l'oracle trouvait deux défauts réels sur la page. Le routage se borne aux pages SOUS `output` :
// mesuré le 28/09 sur les 74 pages suivies du pilot et des forges, les 10 pages sous `output`
// échouent toutes pour de vrais manques, les 64 autres ne sont pas des livrables.
// LE CAS, dans ses deux sens, sur l'entrée RÉELLE du registre jouée dans un registre jouet (le
// lanceur complet sur une page coûterait trente secondes de rendu sans rien prouver de plus) :
//   · une page sans phrase d'intention SOUS `output` est jugée, FAIL T1 ;
//   · la MÊME page hors `output` n'est pas routée : aucune ligne de lecture-tiers ;
//   · la commande routée, jouée telle quelle avec le profil par défaut, déclare T4 NON JOUÉ :
//     aucun appel de modèle n'est ajouté par ce routage.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1446-'));
  try {
    const entree = reg.oracles.find((o) => (o.cmd || []).some((c) => /oracle-lecture-tiers\.mjs$/.test(c)));
    const page = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Tableau</title></head><body>'
      + '<h1>Tableau</h1><table><tr><th>Marché</th><th>Écart</th></tr><tr><td>Nord</td><td>2</td></tr></table>'
      + '<p>Écart : la différence entre la cible et le relevé.</p><p>Marché : la zone suivie.</p>'
      + '<p>Page en lecture seule.</p></body></html>';
    for (const d of ['output', 'docs']) {
      fs.mkdirSync(path.join(tmp, 'racine', d), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'racine', d, 'page.html'), page, 'utf8');
    }
    const regJ = path.join(tmp, 'registre-jouet.json');
    fs.writeFileSync(regJ, JSON.stringify({ version: 'jouet', oracles: [entree] }), 'utf8');
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), path.join(tmp, 'racine'),
      '--registre', regJ, '--no-cache', '--json'], { encoding: 'utf8', timeout: 180000 });
    let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch { /* sortie illisible */ }
    const lignes = j ? (j.resultats || []).filter((x) => /Lecture d'une page/.test(x.domaine)) : [];
    const sous = lignes.filter((x) => /output[\\/]page\.html$/.test(x.file));
    const hors = lignes.filter((x) => /docs[\\/]page\.html$/.test(x.file));
    // La commande que run-oracles lance, jouée telle quelle avec le profil par défaut du lanceur.
    const cmd = entree ? entree.cmd.map((s) => s.replace('{skilldir}', SKILLDIR)
      .replace('{file}', path.join(tmp, 'racine', 'output', 'page.html'))
      .replace('{profil}', path.join(SKILLDIR, 'profils', 'digit-ai.json'))) : null;
    const direct = cmd ? spawnSync(cmd[0] === 'node' ? process.execPath : cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 60000 }) : null;
    let jd = null; try { jd = JSON.parse(direct.stdout); } catch { /* sortie illisible */ }
    if (!entree) ko('TF-1446 : entrée de lecture-tiers introuvable au registre');
    else if (!(entree.ext || []).includes('.html') || !(entree.chemins || []).includes('output'))
      ko('TF-1446 : l entrée de lecture-tiers ne route pas les pages sous output (ext ' + JSON.stringify(entree.ext) + ', chemins ' + JSON.stringify(entree.chemins) + ')');
    else if (!j) ko('TF-1446 : sortie de run-oracles inexploitable');
    else if (sous.length !== 1 || sous[0].verdict !== 'FAIL' || !/INTENTION ABSENTE/.test(sous[0].detail || ''))
      ko('TF-1446 : la page SOUS output n est pas jugée par lecture-tiers, ou pas pour son intention absente — ' + JSON.stringify(sous).slice(0, 200));
    else if (hors.length) ko('TF-1446 : la page HORS output est routée elle aussi — le critère `chemins` n est pas tenu');
    else if (!jd || !(jd.non_juge || []).some((x) => /^T4 NON JOUÉ/.test(x)))
      ko('TF-1446 : la commande routée ne déclare pas T4 NON JOUÉ avec le profil par défaut — le routage ajouterait un appel de modèle');
    else ok('TF-1446 : lecture-tiers juge la page sous output (FAIL, intention absente), laisse la même page hors output, et la commande routée déclare T4 NON JOUÉ — aucun appel de modèle ajouté');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1501 (01/10/2026) — LES POLICES EMBARQUÉES D'UN PPTX SONT DÉCODÉES, PAR LE DOMAINE QUI LES JUGE.
//
// LE FAIT (lot du 30/09/2026, RA-02). Cinq versions d'un deck sont sorties avec huit polices
// embarquées fausses — texte en éclats sur tout poste qui n'a pas la police —, PASS à toutes les
// portes du registre : aucune ne décodait la copie embarquée, et le poste producteur lit la police
// installée. CE QUE CE BLOC ÉPROUVE :
//   (A) le juge dans ses deux sens, sur les fixtures FICTIVES : la rouge échoue par E1 ET par E2, la
//       verte passe. Le manifest tolère un SKIP (Windows, fontTools ou uv absents) ; ici ce SKIP
//       n'est admis que si son motif NOMME le prérequis manquant : tout autre SKIP est un juge muet ;
//   (B) le critère `parties_paquet` du lanceur, sur un registre jouet : le deck qui porte ppt/fonts/
//       est routé, le deck sans police embarquée ne l'est pas, le paquet ILLISIBLE l'est — un
//       routage ne fait jamais taire un juge ;
//   (C) l'entrée RÉELLE du registre porte ce déclencheur, et oracle-pptx nomme ce juge dans son
//       non_juge : le trou se lit là où il était muet.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1501-'));
  try {
    const FX = path.join(SKILLDIR, 'fixtures');
    const jouer = (script, args) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', script), ...args], { encoding: 'utf8', timeout: 180000 });
      try { return JSON.parse(r.stdout); } catch { return { verdict: '?', motif: (r.stderr || r.stdout || '').slice(0, 160) }; }
    };
    const fixture = (deck) => jouer('oracle-polices-embarquees.mjs', [path.join(FX, deck), '--polices', path.join(FX, 'polices-embarquees-sources')]);
    const regles = (j) => new Set((j.findings || []).filter((f) => f.sev === 'bloquant').map((f) => f.regle));
    const PREREQUIS = /t2embed|fontTools|uv n est pas|interpréteur Python/;
    const rouge = fixture('polices-embarquees-red.pptx');
    const verte = fixture('polices-embarquees-green.pptx');
    if (rouge.verdict === 'SKIP' && verte.verdict === 'SKIP' && PREREQUIS.test(rouge.motif || '') && PREREQUIS.test(verte.motif || ''))
      ok('TF-1501 (A) : NON JOUÉ sur ce poste — ' + rouge.motif + ' (SKIP motivé par un prérequis absent, admis et dit)');
    else if (rouge.verdict !== 'FAIL' || !regles(rouge).has('E1') || !regles(rouge).has('E2'))
      ko(`TF-1501 (A) : la fixture rouge rend ${rouge.verdict} (${[...regles(rouge)].join('+') || rouge.motif || 'sans constat'}) — attendu FAIL par E1 ET par E2`);
    else if (verte.verdict !== 'PASS')
      ko(`TF-1501 (A) : la fixture verte rend ${verte.verdict} (${verte.motif || JSON.stringify(verte.findings || []).slice(0, 160)}) — attendu PASS`);
    else ok('TF-1501 (A) : la police embarquée altérée est refusée par E1 (contours ≠ police de référence désignée) ET par E2 (glyphes hors de la boîte déclarée), la même police saine passe');

    // (B) — le déclencheur sur le contenu du paquet, joué par le lanceur.
    const racine = path.join(tmp, 'racine');
    fs.mkdirSync(racine);
    fs.copyFileSync(path.join(FX, 'polices-embarquees-green.pptx'), path.join(racine, 'avec-polices.pptx'));
    fs.copyFileSync(path.join(FX, 'pptx-format-green.pptx'), path.join(racine, 'sans-police.pptx'));
    fs.writeFileSync(path.join(racine, 'illisible.pptx'), 'pas un paquet zip\n', 'utf8');
    const jouet = path.join(tmp, 'oracle-jouet.mjs');
    fs.writeFileSync(jouet, "process.stdout.write(JSON.stringify({ oracle: 'oracle-jouet', verdict: 'PASS', findings: [] }));\n");
    const regJ = path.join(tmp, 'registre-jouet.json');
    fs.writeFileSync(regJ, JSON.stringify({ version: 'jouet', oracles: [{ domaine: 'paquet jouet', ext: ['.pptx'], parties_paquet: ['ppt/fonts/'],
      type: 'cli', statut: 'ok', cmd: ['node', jouet, '{file}'] }] }), 'utf8');
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), racine, '--registre', regJ, '--no-cache', '--json'],
      { encoding: 'utf8', timeout: 180000 });
    let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch { /* sortie illisible */ }
    const routes = j ? (j.resultats || []).filter((x) => x.domaine === 'paquet jouet').map((x) => path.basename(x.file)).sort() : null;
    if (!routes) ko('TF-1501 (B) : sortie de run-oracles inexploitable — ' + (r.stderr || '').slice(0, 160));
    else if (JSON.stringify(routes) !== JSON.stringify(['avec-polices.pptx', 'illisible.pptx']))
      ko('TF-1501 (B) : parties_paquet route ' + JSON.stringify(routes) + ' — attendu le deck qui porte ppt/fonts/ et le paquet illisible, jamais le deck sans police embarquée');
    else ok('TF-1501 (B) : parties_paquet route le deck qui porte ppt/fonts/, laisse le deck sans police embarquée, et route le paquet illisible (un routage ne fait jamais taire un juge)');

    // (C) — l'entrée réelle, et le non_juge d'oracle-pptx qui nomme ce juge.
    const entree = reg.oracles.find((o) => (o.cmd || []).some((c) => /oracle-polices-embarquees\.mjs$/.test(c)) && (o.ext || []).includes('.pptx'));
    const pptx = jouer('oracle-pptx.mjs', [path.join(FX, 'pptx-green.pptx')]);
    if (!entree || !(entree.parties_paquet || []).includes('ppt/fonts/'))
      ko('TF-1501 (C) : l entrée « Polices embarquées d un PPTX » manque au registre, ou ne se déclenche pas sur ppt/fonts/ — ' + JSON.stringify(entree && entree.parties_paquet));
    else if (!(pptx.non_juge || []).some((x) => /polices embarquées/.test(x) && /oracle-polices-embarquees/.test(x)))
      ko('TF-1501 (C) : oracle-pptx ne déclare pas, dans son non_juge, que les polices embarquées ne sont pas décodées par lui ni qui les juge');
    else ok('TF-1501 (C) : l entrée du registre se déclenche sur ppt/fonts/, et oracle-pptx nomme le juge des polices embarquées dans son non_juge');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-2400 (12/11/2026, décision R-58 du 12/11/2026) — L'ORDRE DES ENTRÉES DU ZIP N'EST PLUS JUGÉ : c'était un faux positif.
// LE FAIT. Sur un deck brut de pptxgenjs 4.0.1 (19 dossiers d'abord, [Content_Types].xml en 20e entrée), oracle-pptx rendait
// FAIL « [Content_Types].xml n'est pas la première entrée — casse certains viewers ». Mesure du 12/11/2026 par PowerPoint 16.0
// (build 20527), ouvert par COM sans fenêtre : le deck brut s'ouvre sans réparation (1 diapositive, 5 formes), comme le même
// contenu réordonné ; deux témoins endommagés (une diapositive tronquée, une mise en page retirée) sont refusés (0x80070570).
// Ce bloc joue les DEUX sens sur le deck brut de pptxgenjs déjà au dépôt (fixtures/charte-pptx-pptxgenjs-brut.pptx) :
//   vert : PASS, aucun constat sur l'ordre, et le non_juge dit que la règle est retirée et ce qui a été mesuré ;
//   rouge : un paquet réellement endommagé reste refusé (le même deck tronqué, un XML mal formé, une transition).
{
  const brut = path.join(SKILLDIR, 'fixtures', 'charte-pptx-pptxgenjs-brut.pptx');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2400-'));
  try {
    const jouerPptx = (f) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-pptx.mjs'), f], { encoding: 'utf8', timeout: 120000 });
      let j = null; try { j = JSON.parse(r.stdout); } catch { /* sortie illisible : dite ci-dessous */ }
      return { j, code: r.status };
    };
    const octets = fs.readFileSync(brut);
    // le deck de jeu est bien ce qu'on dit : [Content_Types].xml n'y est pas la première entrée (le répertoire central est à la fin du zip)
    const noms = []; {
      let fin = -1; for (let i = octets.length - 22; i >= 0; i--) if (octets.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
      let p = fin >= 0 ? octets.readUInt32LE(fin + 16) : 0; const n = fin >= 0 ? octets.readUInt16LE(fin + 10) : 0;
      for (let k = 0; k < n; k++) { const ln = octets.readUInt16LE(p + 28); noms.push(octets.toString('utf8', p + 46, p + 46 + ln)); p += 46 + ln + octets.readUInt16LE(p + 30) + octets.readUInt16LE(p + 32); }
    }
    const vert = jouerPptx(brut);
    const tronque = path.join(tmp, 'tronque.pptx'); fs.writeFileSync(tronque, octets.subarray(0, Math.floor(octets.length / 2)));
    const rougeTronque = jouerPptx(tronque);
    const rougeXml = jouerPptx(path.join(SKILLDIR, 'fixtures', 'pptx-xml-red.pptx'));
    const rougeTransition = jouerPptx(path.join(SKILLDIR, 'fixtures', 'pptx-red.pptx'));
    const parle = (j) => (j?.findings || []).map((f) => f.msg).join(' | ');
    if (noms[0] === '[Content_Types].xml' || !noms.includes('[Content_Types].xml')) ko(`TF-2400 : le deck de jeu n'est plus un deck brut de pptxgenjs — première entrée « ${noms[0]} », [Content_Types].xml ${noms.includes('[Content_Types].xml') ? 'présent' : 'ABSENT'} : le cas ne mesure plus rien`);
    else if (!vert.j || vert.j.verdict !== 'PASS' || vert.code !== 0 || /première entrée/.test(parle(vert.j))) ko(`TF-2400 sens vert : le deck brut de pptxgenjs (première entrée « ${noms[0]} ») doit passer sans constat sur l'ordre — ${vert.j ? vert.j.verdict : '?'} exit ${vert.code} ${parle(vert.j).slice(0, 160)}`);
    else if (!(vert.j.non_juge || []).some((x) => /ordre des entrées du zip/.test(x) && /PowerPoint 16\.0/.test(x) && /sans réparation/.test(x))) ko("TF-2400 : le non_juge ne dit plus que l'ordre des entrées n'est pas jugé, ni ce qui l'a établi (PowerPoint 16.0, ouverture sans réparation)");
    else if (!rougeTronque.j || rougeTronque.j.verdict === 'PASS' || rougeTronque.code === 0) ko(`TF-2400 sens rouge : le même deck tronqué (paquet illisible) doit rester refusé — ${rougeTronque.j ? rougeTronque.j.verdict : '?'} exit ${rougeTronque.code}`);
    else if (!rougeXml.j || rougeXml.j.verdict !== 'FAIL' || !/XML mal formé/.test(parle(rougeXml.j))) ko("TF-2400 sens rouge : un XML mal formé doit rester refusé (X1)");
    else if (!rougeTransition.j || rougeTransition.j.verdict !== 'FAIL' || !/transition/.test(parle(rougeTransition.j))) ko('TF-2400 sens rouge : une transition interdite doit rester refusée');
    else ok(`TF-2400 : le deck brut de pptxgenjs ([Content_Types].xml en ${noms.indexOf('[Content_Types].xml') + 1}e entrée) passe oracle-pptx sans constat sur l'ordre, le non_juge dit la mesure de PowerPoint ; un paquet tronqué, un XML mal formé et une transition restent refusés`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-2064 (03/11/2026) — UN `--profil` QUI NE SE LIT PAS EST UNE ERREUR D'USAGE, PAS UN JUGEMENT PAR DÉFAUT.
// LE FAIT (mesuré le 02/11/2026). Un `--profil` illisible était avalé par un `catch {}` : l'oracle jugeait
// sous ses règles par défaut (JPEG et transitions interdits) et ne le disait pas. Ce bloc joue :
//   (A) les trois refus — valeur absente, fichier introuvable, JSON illisible — chacun en exit 2, verdict SKIP
//       motivé par le profil, et un message d'usage sur stderr ;
//   (B) le REMÈDE que ces messages proposent, joué : le même deck avec un profil lisible, par chemin puis par
//       nom (profils/<nom>.json), rend PASS exit 0 — un refus dont le remède ne passe pas ne vaut rien (TF-1013) ;
//   (C) un profil lisible sans clé `pptx` juge sous les règles par défaut ET le dit dans son non_juge.
// La paire rouge/verte du XML mal formé (règle X1) vit au manifest, entrée « pptx-xml ».
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2064-'));
  try {
    const deck = path.join(SKILLDIR, 'fixtures', 'pptx-xml-green.pptx');
    const jouer = (...profilArgs) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-pptx.mjs'), deck, ...profilArgs], { encoding: 'utf8', timeout: 120000 });
      let j = null; try { j = JSON.parse(r.stdout); } catch { /* sortie illisible */ }
      return { j, code: r.status, err: r.stderr || '' };
    };
    const casse = path.join(tmp, 'casse.json');
    fs.writeFileSync(casse, '{ "pptx": { "jpeg_interdit": ', 'utf8');
    const sansPptx = path.join(tmp, 'sans-pptx.json');
    fs.writeFileSync(sansPptx, JSON.stringify({ nom: 'sans-pptx' }), 'utf8');
    const refus = [
      ['valeur absente', ['--profil'], /aucune valeur/],
      ['fichier introuvable', ['--profil', path.join(tmp, 'absent.json')], /introuvable/],
      ['nom inconnu', ['--profil', 'profil-qui-n-existe-pas'], /introuvable/],
      ['JSON illisible', ['--profil', casse], /illisible/],
    ];
    for (const [nom, args, motif] of refus) {
      const r = jouer(...args);
      r.code !== 2 || !r.j || r.j.verdict !== 'SKIP' || !motif.test(r.j.motif || '') || !/erreur d'usage/.test(r.err)
        ? ko(`TF-2064 (A) : --profil ${nom} — attendu exit 2, SKIP motivé et message d'usage sur stderr, obtenu exit ${r.code}, ${r.j && r.j.verdict}, motif « ${r.j && r.j.motif} », stderr « ${r.err.trim().slice(0, 100)} »`)
        : ok(`TF-2064 (A) : --profil ${nom} → exit 2, SKIP motivé (« ${r.j.motif.slice(0, 70)}… »), message d'usage sur stderr`);
    }
    const parChemin = jouer('--profil', path.join(SKILLDIR, 'profils', 'generique.json'));
    const parNom = jouer('--profil', 'generique');
    parChemin.code !== 0 || !parChemin.j || parChemin.j.verdict !== 'PASS' || parNom.code !== 0 || !parNom.j || parNom.j.verdict !== 'PASS'
      ? ko(`TF-2064 (B) : le remède (profil lisible par chemin ou par nom) doit PASSER — chemin exit ${parChemin.code}, nom exit ${parNom.code}`)
      : ok('TF-2064 (B) : le remède proposé, un profil lisible par chemin ou par nom, rend PASS exit 0 sur le même deck');
    const sp = jouer('--profil', sansPptx);
    sp.code !== 0 || !sp.j || !(sp.j.non_juge || []).some((x) => /sans clé pptx/.test(x))
      ? ko(`TF-2064 (C) : un profil lisible sans clé pptx doit juger ET le dire au non_juge — exit ${sp.code}`)
      : ok('TF-2064 (C) : un profil lisible sans clé pptx juge sous les règles par défaut et le dit au non_juge');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1504 (01/10/2026) — LE MÊME JUGE POUR CHAQUE DOCUMENT GÉNÉRÉ QUI EMBARQUE DES POLICES.
//
// LA DÉCISION HUMAINE du 30/09/2026 (RP-04) : l'erreur des polices embarquées ne doit se reproduire
// dans aucun document généré. Le DOCX (polices obscurcies .odttf, désobscurcies par la clé de
// fontTable.xml), le PDF (programmes de police TrueType) et la page HTML (polices en data: d'une
// règle @font-face) reçoivent le juge des PPTX. CE BLOC :
//   (A) chaque paire FICTIVE dans ses deux sens — rouge FAIL par E1 ET par E2, verte PASS —, un SKIP
//       n'étant admis que si son motif nomme un prérequis absent (fontTools, pypdf, brotli, uv) ;
//   (B) les entrées RÉELLES du registre, jouées par le lanceur sur un dossier jetable : le DOCX qui
//       porte word/fonts/ est jugé, le DOCX sans police embarquée n'est pas routé, le PDF l'est, la
//       page qui porte une police en data: l'est, la page sans police embarquée ne l'est pas.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1504-'));
  try {
    const FX = path.join(SKILLDIR, 'fixtures');
    const jouer = (fx) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-polices-embarquees.mjs'), path.join(FX, fx),
        '--polices', path.join(FX, 'polices-embarquees-sources')], { encoding: 'utf8', timeout: 180000 });
      try { return JSON.parse(r.stdout); } catch { return { verdict: '?', motif: (r.stderr || r.stdout || '').slice(0, 160) }; }
    };
    const regles = (j) => new Set((j.findings || []).filter((f) => f.sev === 'bloquant').map((f) => f.regle));
    const PREREQUIS = /fontTools|pypdf|brotli|uv n est pas|interpréteur Python/;
    for (const [type, rouge, verte] of [['DOCX', 'polices-embarquees-docx-red.docx', 'polices-embarquees-docx-green.docx'],
      ['PDF', 'polices-embarquees-pdf-red.pdf', 'polices-embarquees-pdf-green.pdf'],
      ['HTML', 'polices-embarquees-html-red.html', 'polices-embarquees-html-green.html']]) {
      const jr = jouer(rouge), jv = jouer(verte);
      if (jr.verdict === 'SKIP' && jv.verdict === 'SKIP' && PREREQUIS.test(jr.motif || '') && PREREQUIS.test(jv.motif || ''))
        ok(`TF-1504 (A) ${type} : NON JOUÉ sur ce poste — ${jr.motif} (SKIP motivé par un prérequis absent, admis et dit)`);
      else if (jr.verdict !== 'FAIL' || !regles(jr).has('E1') || !regles(jr).has('E2'))
        ko(`TF-1504 (A) ${type} : la fixture rouge rend ${jr.verdict} (${[...regles(jr)].join('+') || jr.motif || 'sans constat'}) — attendu FAIL par E1 ET par E2`);
      else if (jv.verdict !== 'PASS')
        ko(`TF-1504 (A) ${type} : la fixture verte rend ${jv.verdict} (${jv.motif || JSON.stringify(jv.findings || []).slice(0, 160)}) — attendu PASS`);
      else ok(`TF-1504 (A) ${type} : la police embarquée altérée est refusée par E1 ET par E2, la même police saine passe`);
    }
    // (B) — les entrées réelles, dans un registre jouet qui ne porte qu'elles.
    const entrees = reg.oracles.filter((o) => (o.cmd || []).some((c) => /oracle-polices-embarquees\.mjs$/.test(c)));
    const docx = entrees.find((o) => (o.ext || []).includes('.docx')), pdf = entrees.find((o) => (o.ext || []).includes('.pdf'));
    const html = entrees.find((o) => (o.content_patterns || []).some((p) => /font-face/.test(p)));
    if (!docx || !(docx.parties_paquet || []).includes('word/fonts/') || !pdf || !html || !(html.content_patterns || []).length) {
      ko('TF-1504 (B) : entrées DOCX (déclenchée sur word/fonts/), PDF ou page HTML (déclenchée par contenu) du juge des polices embarquées absentes du registre');
    } else {
      const racine = path.join(tmp, 'racine');
      fs.mkdirSync(racine);
      fs.copyFileSync(path.join(FX, 'polices-embarquees-docx-red.docx'), path.join(racine, 'avec-polices.docx'));
      fs.copyFileSync(path.join(FX, 'dossier-cab-green.docx'), path.join(racine, 'sans-police.docx'));
      fs.copyFileSync(path.join(FX, 'polices-embarquees-pdf-red.pdf'), path.join(racine, 'programme.pdf'));
      fs.copyFileSync(path.join(FX, 'polices-embarquees-html-red.html'), path.join(racine, 'page-avec-police.html'));
      fs.copyFileSync(path.join(FX, 'a11y-green.html'), path.join(racine, 'page-sans-police.html'));
      const regJ = path.join(tmp, 'registre-jouet.json');
      fs.writeFileSync(regJ, JSON.stringify({ version: 'jouet', oracles: [docx, pdf, html] }), 'utf8');
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), racine, '--registre', regJ, '--no-cache', '--json'],
        { encoding: 'utf8', timeout: 300000 });
      let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch { /* sortie illisible */ }
      const lignes = j ? (j.resultats || []).filter((x) => /Polices embarquées/.test(x.domaine)).map((x) => `${path.basename(x.file)}:${x.verdict}`).sort() : null;
      // Rouges toutes deux, sauf poste sans prérequis : le routage se lit au NOM des fichiers jugés, le verdict en plus quand il est rendu.
      const juges = lignes ? lignes.map((l) => l.split(':')[0]) : null;
      if (!lignes) ko('TF-1504 (B) : sortie de run-oracles inexploitable — ' + (r.stderr || '').slice(0, 160));
      else if (JSON.stringify(juges) !== JSON.stringify(['avec-polices.docx', 'page-avec-police.html', 'programme.pdf']))
        ko('TF-1504 (B) : le lanceur juge ' + JSON.stringify(lignes) + ' — attendu le DOCX qui porte word/fonts/, la page à police en data: et le PDF, jamais le DOCX ni la page sans police embarquée');
      else if (lignes.some((l) => !/:(FAIL|SKIP)$/.test(l)))
        ko('TF-1504 (B) : un document à police altérée sort ' + JSON.stringify(lignes) + ' — attendu FAIL (ou SKIP motivé sur un poste sans prérequis)');
      else ok('TF-1504 (B) : par les entrées réelles, le DOCX qui porte word/fonts/, la page à police en data: et le PDF sont jugés (' + lignes.join(', ') + '), le DOCX et la page sans police embarquée ne sont pas routés');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1490 (01/10/2026) — S3 ET S4 DE LA CHARTE PPTX SÉMANTIQUE SUIVENT LE PROFIL, COMME P1 À P3.
//
// LE FAIT (lot Produit-64 - RETOURS - 20260928c, RA-5) : sous `--profil generique`, le support d'un
// client au format de ce client rendait 69 constats S3 et S4 — icônes de contenu, pied de page et
// pagination en zones de texte —, et seule une exemption par fichier ramenait le vert. CE BLOC :
//   (A) le MÊME support fictif au format d'un client : PASS sous son profil, FAIL sous digit-ai par
//       S3 ET par S4 ;
//   (B) le lanceur, par l'entrée RÉELLE du registre : sous `--profil generique` le support passe et
//       S3, S4 sont dites NON jouées ; sous le profil par défaut, digit-ai, il échoue ;
//   (C) sans `--profil`, l'oracle juge comme avant, messages compris, mot pour mot : le hook
//       d'écriture identifie un constat par sa ligne, un message réécrit le ferait passer pour neuf.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1490-'));
  try {
    const FX = path.join(SKILLDIR, 'fixtures');
    const jouer = (args) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-charte-pptx-semantique.mjs'), ...args], { encoding: 'utf8', timeout: 120000 });
      try { return JSON.parse(r.stdout); } catch { return { verdict: '?', findings: [], non_juge: [(r.stderr || '').slice(0, 160)] }; }
    };
    const bloquants = (j) => (j.findings || []).filter((f) => f.sev === 'bloquant').map((f) => f.msg);
    const client = path.join(FX, 'charte-pptx-client-green.pptx');
    const sousClient = jouer([client, '--profil', path.join(FX, 'profil-charte-client.json')]);
    const sousDigit = jouer([client, '--profil', path.join(SKILLDIR, 'profils', 'digit-ai.json')]);
    if (sousClient.verdict !== 'PASS') ko(`TF-1490 (A) : le support au format d un client rend ${sousClient.verdict} sous SON profil — ${bloquants(sousClient).slice(0, 2).join(' · ')}`);
    else if (sousDigit.verdict !== 'FAIL' || !bloquants(sousDigit).some((m) => /^S3 /.test(m)) || !bloquants(sousDigit).some((m) => /^S4 /.test(m)))
      ko(`TF-1490 (A) : le même support rend ${sousDigit.verdict} sous digit-ai (${bloquants(sousDigit).length} constat(s)) — attendu FAIL par S3 ET par S4`);
    else ok(`TF-1490 (A) : le support au format d un client passe sous son profil, et échoue sous digit-ai par S3 et S4 (${bloquants(sousDigit).length} constats)`);

    // (B) — le lanceur, par l'entrée réelle, sous generique puis sous le profil par défaut.
    const entree = reg.oracles.find((o) => o.domaine === 'Charte PPTX sémantique (sommaire, kicker, logos, footer)');
    const racine = path.join(tmp, 'racine');
    fs.mkdirSync(racine);
    fs.copyFileSync(client, path.join(racine, 'support-client.pptx'));
    const regJ = path.join(tmp, 'registre-jouet.json');
    fs.writeFileSync(regJ, JSON.stringify({ version: 'jouet', oracles: [entree] }), 'utf8');
    const lancer = (profil) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), racine, '--registre', regJ, '--no-cache', '--json',
        ...(profil ? ['--profil', profil] : [])], { encoding: 'utf8', timeout: 180000, env: { ...process.env, QO_PROFIL: '' } });
      try { return (JSON.parse(r.stdout).resultats || []).find((x) => /Charte PPTX/.test(x.domaine)) || {}; } catch { return { verdict: '?', detail: (r.stderr || '').slice(0, 160) }; }
    };
    const generique = lancer('generique'), defaut = lancer(null);
    const direct = jouer([client, '--profil', path.join(SKILLDIR, 'profils', 'generique.json')]);
    const dits = (direct.non_juge || []).filter((x) => /^S[34] NON jouée/.test(x)).length;
    if (!entree || !entree.cmd.includes('{profil}')) ko('TF-1490 (B) : l entrée « Charte PPTX sémantique » ne passe pas --profil {profil} à sa commande');
    else if (generique.verdict !== 'PASS' || dits !== 2)
      ko(`TF-1490 (B) : sous --profil generique, le lanceur rend ${generique.verdict} (${(generique.detail || '').slice(0, 120)}) et ${dits} règle(s) dite(s) NON jouée(s) — attendu PASS et S3, S4 dites`);
    else if (defaut.verdict !== 'FAIL') ko(`TF-1490 (B) : sous le profil par défaut (digit-ai), le lanceur rend ${defaut.verdict} sur le format d un client — attendu FAIL`);
    else ok('TF-1490 (B) : par l entrée réelle, le support au format d un client passe sous --profil generique (S3 et S4 dites NON jouées) et échoue sous le profil par défaut, digit-ai');

    // (C) — sans --profil, la charte Digit-AI d'avant, messages compris.
    const avant = ['S3 — image au gabarit logo (≤ 2000000 EMU) hors couverture/interlocuteurs',
      'S4 — footer absent (placeholder ftr au niveau slide)', 'S4 — pagination absente (placeholder sldNum au niveau slide)'];
    const historique = jouer([path.join(FX, 'charte-pptx-semantique-red.pptx')]);
    const manquants = avant.filter((m) => !bloquants(historique).includes(m));
    if (historique.verdict !== 'FAIL' || manquants.length) ko('TF-1490 (C) : sans --profil, la rouge historique ne porte plus les messages d avant — manquent : ' + manquants.join(' · '));
    else ok('TF-1490 (C) : sans --profil, la rouge historique échoue par S3 et S4 avec les messages d avant, mot pour mot');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1381 (retours Produit-68 du 26/09/2026, RG-13) — S2 DIT LES DIAPOSITIVES OÙ IL N'A PAS TROUVÉ DE TITRE.
// Sur la verte historique, les intercalaires 3 et 5 n'ont pas d'espace réservé titre : S2 ne peut rien juger
// sur elles, et le non_juge doit les nommer (avant, il se taisait). Le rouge pptxgenjs, lui, a son titre
// lu malgré `idx` avant `type` : le sur-titre est vu (cf. fixture charte-pptx-pptxgenjs au manifest).
{
  const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-charte-pptx-semantique.mjs'), path.join(SKILLDIR, 'fixtures', 'charte-pptx-semantique-green.pptx')], { encoding: 'utf8', timeout: 120000 });
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* verdict illisible : ko ci-dessous */ }
  const dit = j && (j.non_juge || []).find((x) => /^S2 : aucun titre/.test(x));
  if (!dit || !/slide3\.xml/.test(dit) || !/slide5\.xml/.test(dit) || /slide2\.xml/.test(dit)) ko('TF-1381 : S2 ne nomme pas, au non_juge, exactement les diapositives sans titre (3 et 5) — ' + (dit || 'aucune mention'));
  else ok('TF-1381 : S2 nomme au non_juge les diapositives où il n\'a trouvé aucun titre (slide3.xml, slide5.xml)');
}

// TF-1379 (retours Produit-68 du 26/09/2026, RG-11) — S6 NE JUGE QUE CE QU'ELLE A MESURÉ, SUR CE DECK.
//   (A) des mesures qui décrivent un AUTRE deck (autres titres) : S6 NON jouée, motif dit, aucun constat inventé ;
//   (B) à la limite : un désaxement de 1 pt passe, 1,5 pt échoue — la tolérance est celle de la demande ;
//   (C) un deck sans aucune mesure : S6 NON jouée, et le PASS le dit (« S6 non jouée »).
{
  const FX = path.join(SKILLDIR, 'fixtures');
  const O = path.join(SKILLDIR, 'scripts', 'oracle-charte-pptx-semantique.mjs');
  const jouer = (args) => { const r = spawnSync(process.execPath, [O, ...args], { encoding: 'utf8', timeout: 120000 }); try { return JSON.parse(r.stdout); } catch { return { verdict: '?', findings: [], non_juge: [] }; } };
  const s6 = (j) => (j.findings || []).filter((f) => /^S6 /.test(f.msg));
  const autre = jouer([path.join(FX, 'charte-pptx-pptxgenjs-green.pptx'), '--mesures', path.join(FX, 'charte-pptx-alignement-red.mesures.json')]);
  const dit = (autre.non_juge || []).some((x) => /^S6 NON jouée : les mesures ne décrivent pas ce deck/.test(x));
  if (!dit || s6(autre).length) ko(`TF-1379 (A) : des mesures d'un autre deck doivent rendre S6 NON jouée sans constat — ${s6(autre).length} constat(s), motif ${dit ? 'dit' : 'absent'}`);
  else ok('TF-1379 (A) : des mesures qui décrivent un autre deck rendent S6 NON jouée, motif dit, aucun constat');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1379-'));
  try {
    const deck = path.join(tmp, 'deck.pptx');
    fs.copyFileSync(path.join(FX, 'charte-pptx-alignement-green.pptx'), deck);
    const base = JSON.parse(fs.readFileSync(path.join(FX, 'charte-pptx-alignement-green.mesures.json'), 'utf8'));
    const avecEcart = (e) => { const m = JSON.parse(JSON.stringify(base)); for (const sl of m.slides) for (const f of sl.formes) if (/\//.test(f.texte)) f.haut = Math.round((f.haut + e - 0.2) * 100) / 100; fs.writeFileSync(path.join(tmp, 'm.json'), JSON.stringify(m), 'utf8'); return jouer([deck, '--mesures', path.join(tmp, 'm.json')]); };
    const limite = avecEcart(1.0), dessus = avecEcart(1.5);
    if (limite.verdict !== 'PASS' || dessus.verdict !== 'FAIL' || !s6(dessus).length) ko(`TF-1379 (B) : à 1,0 pt le verdict est ${limite.verdict} (attendu PASS), à 1,5 pt ${dessus.verdict} (attendu FAIL)`);
    else ok('TF-1379 (B) : un désaxement de 1,0 pt passe, un de 1,5 pt échoue — tolérance de 1 pt');
    const sans = jouer([deck]);
    if (sans.verdict !== 'PASS' || !(sans.non_juge || []).some((x) => /^S6 NON jouée : aucune mesure/.test(x))) ko('TF-1379 (C) : sans mesure, S6 doit être dite NON jouée (PASS conservé) — ' + sans.verdict);
    else ok('TF-1379 (C) : sans mesure de rendu, S6 est dite NON jouée au non_juge, jamais déclarée conforme');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1492 (01/10/2026) — UNE CONFIGURATION D'INFRASTRUCTURE A SON ORACLE : LES STANDARDS, PUIS LA DATE.
//
// LE FAIT (lot Produit-03 - RETOURS - 20260929a, RA-48) : une date d'effet écrite en dur pour une
// mise en production d'août a été refusée à l'application du 29/09/2026 — 10 ressources sur 11, le
// budget absent —, et la première écriture du correctif rendait fmt -check à 3. CE BLOC :
//   (A) le banc du lot pour D1, sur des fichiers de variables jetables à date d'application épinglée :
//       août au 29/09 refusée, septembre au 29 et au 30/09 acceptée, septembre au 01/10 refusée, et
//       l'étalonnage sur Azure (juin refusé en juillet, juin et juillet acceptés à leur mois) ;
//   (B) le remède que D1 prescrit, JOUÉ : la date calculée à la création ne fait pas de constat ;
//   (C) T1 et T2 dans leurs deux sens quand Terraform est sur le poste — format rompu refusé, puis
//       accepté une fois `terraform fmt` passé (le remède du message), variable non déclarée refusée,
//       configuration valide acceptée, fournisseur non installé DIT et non imputé à la configuration ;
//   (D) Terraform retiré du PATH : l'étape standard rend SKIP et son motif nomme terraform, D1 juge
//       toujours.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1492-'));
  try {
    const O = path.join(SKILLDIR, 'scripts', 'oracle-terraform.mjs');
    const jouer = (cible, date, env = process.env) => {
      const r = spawnSync(process.execPath, [O, cible, ...(date ? ['--date-application', date] : [])], { encoding: 'utf8', timeout: 180000, env });
      try { return JSON.parse(r.stdout); } catch { return { verdict: '?', findings: [], motif: (r.stderr || '').slice(0, 160) }; }
    };
    const poser = (rel, texte) => { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, texte, 'utf8'); return p; };
    const regles = (j) => new Set((j.findings || []).filter((f) => f.sev === 'bloquant').map((f) => f.regle));
    // (A) — le banc du lot et l'étalonnage.
    const banc = [['2026-08-01T00:00:00Z', '2026-09-29', 'FAIL'], ['2026-09-01T00:00:00Z', '2026-09-29', 'PASS'], ['2026-09-01T00:00:00Z', '2026-09-30', 'PASS'],
      ['2026-09-01T00:00:00Z', '2026-10-01', 'FAIL'], ['2026-06-01T00:00:00Z', '2026-07-15', 'FAIL'], ['2026-06-01T00:00:00Z', '2026-06-20', 'PASS'], ['2026-07-01T00:00:00Z', '2026-07-20', 'PASS']];
    const fautes = banc.filter(([valeur, date, attendu], k) => {
      const j = jouer(poser(`banc-${k}/prd.tfvars`, `budget_start_date = "${valeur}"\n`), date);
      return j.verdict !== attendu || (attendu === 'FAIL' && !regles(j).has('D1'));
    });
    fautes.length ? ko('TF-1492 (A) : le banc du lot n est pas tenu par D1 — ' + fautes.map(([v, d, a]) => `${v.slice(0, 7)} au ${d} attendu ${a}`).join(' · '))
      : ok('TF-1492 (A) : le banc du lot est tenu — août au 29/09 refusée, septembre au 29 et au 30/09 acceptée, septembre au 01/10 refusée — et l étalonnage d Azure aussi (juin refusé en juillet, accepté en juin, juillet accepté en juillet)');
    // (B) — le remède prescrit par le message de D1, joué.
    const remede = jouer(poser('remede/main.tf', 'locals {\n  debut_budget = formatdate("YYYY-MM-01\'T\'00:00:00\'Z\'", timestamp())\n}\n'), '2026-10-01');
    remede.verdict !== 'FAIL' && !regles(remede).has('D1')
      ? ok(`TF-1492 (B) : la date calculée à la création, le remède que D1 prescrit, ne fait aucun constat (${remede.verdict})`)
      : ko(`TF-1492 (B) : le remède prescrit par D1 est refusé (${remede.verdict}, ${[...regles(remede)].join('+')})`);
    // (C) — T1 et T2 dans leurs deux sens, Terraform présent.
    const tfPresent = spawnSync('terraform', ['version'], { encoding: 'utf8', timeout: 30000 }).status === 0;
    if (!tfPresent) ok('TF-1492 (C) : NON JOUÉ — terraform introuvable sur ce poste : T1 et T2 ne peuvent pas se montrer ici, et c est dit');
    else {
      const rompu = poser('t1/main.tf', 'locals {\n  a = 1\n  # commentaire\n  bb = 2\n  ccc   = 3\n}\n');
      const j1 = jouer(rompu, '2026-10-01');
      spawnSync('terraform', ['fmt', rompu], { encoding: 'utf8', timeout: 60000 });
      const j1bis = jouer(rompu, '2026-10-01');
      const j2 = jouer(poser('t2-ko/main.tf', 'variable "x" {\n  type = string\n}\n\noutput "y" {\n  value = var.z\n}\n'), '2026-10-01');
      const j2ok = jouer(poser('t2-ok/main.tf', 'variable "x" {\n  type = string\n}\n\noutput "y" {\n  value = var.x\n}\n'), '2026-10-01');
      const j2init = jouer(poser('t2-init/main.tf', 'terraform {\n  required_providers {\n    azurerm = {\n      source = "hashicorp/azurerm"\n    }\n  }\n}\n'), '2026-10-01');
      const t1Ligne = (j1.findings || []).find((f) => f.regle === 'T1');
      if (j1.verdict !== 'FAIL' || !t1Ligne || !/:4$/.test(t1Ligne.where)) ko(`TF-1492 (C) : le format rompu rend ${j1.verdict} (${t1Ligne ? t1Ligne.where : 'sans T1'}) — attendu FAIL par T1 à la ligne 4`);
      else if (j1bis.verdict !== 'PASS') ko(`TF-1492 (C) : après terraform fmt, le remède que T1 prescrit, la configuration rend ${j1bis.verdict}`);
      else if (j2.verdict !== 'FAIL' || !regles(j2).has('T2')) ko(`TF-1492 (C) : une variable non déclarée rend ${j2.verdict} — attendu FAIL par T2`);
      else if (j2ok.verdict !== 'PASS') ko(`TF-1492 (C) : une configuration valide rend ${j2ok.verdict}`);
      else if (j2init.verdict === 'FAIL' || !(j2init.non_juge || []).some((x) => /^T2 non jouée/.test(x)))
        ko(`TF-1492 (C) : un fournisseur non installé rend ${j2init.verdict} sans dire T2 non jouée — un défaut du POSTE imputé à la configuration`);
      else ok('TF-1492 (C) : T1 refuse le format rompu à sa ligne et accepte la configuration une fois terraform fmt passé ; T2 refuse la variable non déclarée, accepte la configuration valide, et DIT le fournisseur non installé sans l imputer à la configuration');
    }
    // (D) — Terraform absent : l'étape standard rend SKIP motivé, D1 juge toujours.
    const clePath = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
    const sansTf = jouer(poser('d/prd.tfvars', 'budget_start_date = "2026-08-01T00:00:00Z"\n'), '2026-09-29', { ...process.env, [clePath]: path.dirname(process.execPath) });
    const std = sansTf.etapes && sansTf.etapes.standard;
    if (!std || std.verdict !== 'SKIP' || !/terraform introuvable/.test(std.motif || '')) ko(`TF-1492 (D) : sans terraform, l étape standard rend ${std ? std.verdict : '?'} (${std ? std.motif : ''}) — attendu SKIP motivé`);
    else if (sansTf.verdict !== 'FAIL' || !regles(sansTf).has('D1')) ko(`TF-1492 (D) : sans terraform, D1 ne juge plus (${sansTf.verdict})`);
    else ok('TF-1492 (D) : sans terraform sur le PATH, l étape standard rend SKIP et son motif le nomme, et D1 juge toujours (FAIL sur la date d août)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1499 (01/10/2026) — UNE IMAGE DE CONTENEUR SE JUGE CONSTRUITE À NEUF, JAMAIS SUR LE CACHE DU POSTE.
//
// LE FAIT (lot Produit-03 - RETOURS - 20260930b, RA-55) : une image construite sur le poste, sa couche
// « RUN apk upgrade --no-cache » reprise du cache (CACHED), a rendu 1 faille HIGH qu'une construction
// --no-cache ne portait plus ; seule la lecture du journal l'a dit. CE BLOC :
//   (A) C1 sur les deux formes de journal : BuildKit (étape CACHED nommée, l'image de base FROM CACHED
//       comptée et dite sans être accusée) et constructeur classique (« ---> Using cache ») ;
//   (B) C2 lit le rapport de trivy, et un rapport donné SANS journal dit C1 non jouée ;
//   (C) le mode construction sans docker sur le PATH rend SKIP, et son motif nomme docker — la
//       construction elle-même n'est pas jouée par la recette (minutes, réseau), et c'est dit au registre.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1499-'));
  try {
    const O = path.join(SKILLDIR, 'scripts', 'oracle-image-conteneur.mjs');
    const FX = path.join(SKILLDIR, 'fixtures', 'image-conteneur');
    const jouer = (args, env = process.env) => {
      const r = spawnSync(process.execPath, [O, ...args], { encoding: 'utf8', timeout: 120000, env });
      try { return JSON.parse(r.stdout); } catch { return { verdict: '?', findings: [], non_juge: [], motif: (r.stderr || '').slice(0, 160) }; }
    };
    const poser = (nom, texte) => { const p = path.join(tmp, nom); fs.writeFileSync(p, texte, 'utf8'); return p; };
    const c = (j, regle) => (j.findings || []).filter((f) => f.sev === 'bloquant' && f.regle === regle);
    // (A) — les deux formes de journal, et l'image de base qui n'est pas accusée.
    const rouge = jouer([path.join(FX, 'journal-cache.txt')]);
    const vert = jouer([path.join(FX, 'journal-sans-cache.txt')]);
    const classique = jouer([poser('classique.log', 'Step 1/3 : FROM alpine:3.24\n ---> 0123456789ab\nStep 2/3 : RUN apk upgrade --no-cache\n ---> Using cache\n ---> 89abcdef0123\nStep 3/3 : COPY app /srv/app\n ---> 456789abcdef\nSuccessfully built 456789abcdef\n')]);
    const baseSeule = jouer([poser('base.log', '#5 [runtime 1/2] FROM docker.io/library/alpine:3.24\n#5 CACHED\n\n#6 [runtime 2/2] COPY app /srv/app\n#6 DONE 0.1s\n')]);
    if (rouge.verdict !== 'FAIL' || c(rouge, 'C1').length !== 1 || !/RUN apk upgrade/.test(c(rouge, 'C1')[0].msg))
      ko(`TF-1499 (A) : le journal à étape reprise du cache rend ${rouge.verdict} (${c(rouge, 'C1').length} C1) — attendu FAIL par UNE C1, l'étape RUN nommée`);
    else if (vert.verdict !== 'PASS') ko(`TF-1499 (A) : le journal d'une construction --no-cache rend ${vert.verdict}`);
    else if (classique.verdict !== 'FAIL' || !c(classique, 'C1').some((f) => /RUN apk upgrade/.test(f.msg))) ko(`TF-1499 (A) : le journal du constructeur classique (« ---> Using cache ») rend ${classique.verdict}`);
    else if (baseSeule.verdict !== 'PASS' || !(baseSeule.non_juge || []).some((x) => /image de base/.test(x))) ko(`TF-1499 (A) : un journal dont seule l'image de base est CACHED rend ${baseSeule.verdict}, ou ne la dit pas — attendu PASS, dite`);
    else ok('TF-1499 (A) : C1 nomme l étape reprise du cache (BuildKit et constructeur classique), passe la construction --no-cache, et dit l image de base FROM CACHED sans l accuser');
    // (B) — le rapport de trivy, avec et sans journal.
    const sansJournal = jouer([path.join(FX, 'rapport-trivy-rouge.json')]);
    const avecCache = jouer([path.join(FX, 'rapport-trivy-vert.json'), '--journal', path.join(FX, 'journal-cache.txt')]);
    if (sansJournal.verdict !== 'FAIL' || c(sansJournal, 'C2').length !== 1 || !(sansJournal.non_juge || []).some((x) => /^C1 NON jouée/.test(x)))
      ko(`TF-1499 (B) : un rapport à une HIGH, sans journal, rend ${sansJournal.verdict} (${c(sansJournal, 'C2').length} C2) — attendu FAIL par une C2, et C1 dite non jouée`);
    else if (avecCache.verdict !== 'FAIL' || !c(avecCache, 'C1').length) ko(`TF-1499 (B) : un rapport sans HIGH mais d'une image dont le journal porte une étape CACHED rend ${avecCache.verdict} — le scan d'une image issue du cache ne vaut pas`);
    else ok('TF-1499 (B) : C2 compte les HIGH et CRITICAL du rapport (pas les MEDIUM), dit C1 non jouée sans journal, et refuse le rapport d une image dont le journal porte une étape reprise du cache');
    // (C) — le mode construction sans docker sur le PATH.
    const clePath = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
    const dockerfile = poser('Dockerfile', 'FROM alpine:3.24\nRUN apk upgrade --no-cache\n');
    const sansDocker = jouer([dockerfile], { ...process.env, [clePath]: path.dirname(process.execPath) });
    sansDocker.verdict === 'SKIP' && /docker introuvable/.test(sansDocker.motif || '')
      ? ok('TF-1499 (C) : sans docker sur le PATH, le mode construction rend SKIP et son motif nomme docker — la construction n est pas jouée par la recette, et le registre le dit')
      : ko(`TF-1499 (C) : sans docker, le mode construction rend ${sansDocker.verdict} (${sansDocker.motif || ''}) — attendu SKIP motivé`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1447 (28/09/2026) — LE MOTIF D'UN SKIP A UNE PLACE FIXE, ET LA RECETTE LE TIENT POUR TOUS.
//
// LE FAIT. Le contrat JSON commun ne disait pas où vit la raison d'un SKIP : en fin de non_juge chez
// oracle-conception-livrable, en tête chez oracle-post-linkedin, dans un constat `info` chez
// oracle-sast. Sur les 29 SKIP d'un run produit, un relevé qui lisait le premier élément de non_juge
// a rendu des limites déclarées à la place des motifs. Mesuré le 28/09 sur 38 livrables du pilot :
// 895 SKIP réels sur 1 330 exécutions de 35 oracles, AUCUN ne portant de motif à place fixe.
// CE QUE CE BLOC ÉPROUVE :
//   (A) l'écrivain `lib/contrat.mjs` dans ses domiciles (premier, dernier, limites, info), sans
//       réécrire un motif déjà posé, sans toucher un verdict qui n'est pas SKIP ; et son sens ROUGE :
//       une sortie qui ne dit sa raison nulle part rend un motif VIDE — jamais une valeur de
//       remplacement qui cacherait l'absence ;
//   (B) chaque oracle du registre hébergé par ce skill (.mjs et .py), joué sur une cible ABSENTE :
//       tout SKIP porte un motif non vide ;
//   (C) chaque fixture du manifest dont le verdict est SKIP porte un motif non vide.
{
  // (A) — l'écrivain, dans ses domiciles, et son sens rouge.
  const cas = [
    [{ verdict: 'SKIP', findings: [], non_juge: ['m-premier', 'limite'] }, { premier: true }, 'm-premier'],
    [{ verdict: 'SKIP', findings: [], non_juge: ['limite', 'm-dernier'] }, { dernier: true }, 'm-dernier'],
    [{ verdict: 'SKIP', findings: [], non_juge: ['L1', 'm-hors', 'L2'] }, { limites: () => ['L1', 'L2'] }, 'm-hors'],
    [{ verdict: 'SKIP', findings: [{ sev: 'info', msg: 'm-info' }], non_juge: ['L1'] }, { info: true }, 'm-info'],
    [{ verdict: 'SKIP', findings: [{ sev: 'info', msg: 'm-repli' }], non_juge: ['L1'] }, { limites: () => ['L1'] }, 'm-repli'],
    [{ verdict: 'SKIP', findings: [], non_juge: ['L1'] }, { limites: () => ['L1'] }, ''],
  ];
  const fautes = cas.filter(([s, d, attendu]) => motifDeSkip(s, d) !== attendu);
  const ecrire = ecrivainDeContrat({ premier: true });
  const deja = JSON.parse(ecrire({ verdict: 'SKIP', findings: [], non_juge: ['autre'], motif: 'posé par l oracle' }));
  const nonSkip = JSON.parse(ecrire({ verdict: 'PASS', findings: [], non_juge: ['x'] }));
  if (fautes.length) ko('TF-1447 (A) : l écrivain lit mal ' + fautes.length + ' domicile(s) — ' + fautes.map(([, d, a]) => JSON.stringify(d) + ' attendu « ' + a + ' »').join(' · '));
  else if (deja.motif !== 'posé par l oracle') ko('TF-1447 (A) : un motif déjà posé par l oracle a été réécrit');
  else if ('motif' in nonSkip) ko('TF-1447 (A) : un verdict PASS a reçu un champ motif');
  else ok('TF-1447 (A) : l écrivain lit les quatre domiciles, garde un motif déjà posé, ignore les verdicts non SKIP, et rend un motif VIDE quand la raison n est dite nulle part (sens rouge, refusé par B et C)');

  // (B) — chaque oracle hébergé ici, sur une cible absente.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-1447-'));
  try {
    const absent = path.join(tmp, 'absent', 'rien.html');
    const py = resolvePython();
    const skips = [], sansMotif = [];
    for (const o of reg.oracles) {
      if (o.type !== 'cli' || !Array.isArray(o.cmd)) continue;
      const script = o.cmd.find((c) => /\{skilldir\}\/scripts\/oracle-[\w-]+\.(mjs|py)$/.test(c));
      if (!script) continue;
      const nom = script.match(/(oracle-[\w-]+)\.(mjs|py)$/)[1];
      let cmd = o.cmd.map((s) => s.replace('{skilldir}', SKILLDIR).replace('{file}', absent)
        .replace('{profil}', path.join(SKILLDIR, 'profils', 'digit-ai.json')))
        .filter((s) => !/\{[a-z]+\}/.test(s));
      if (/^python3?$/.test(cmd[0])) { if (!py) continue; cmd = [...py, ...cmd.slice(1)]; }
      const r = spawnSync(cmd[0] === 'node' ? process.execPath : cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      let j = null; try { j = JSON.parse((r.stdout || '').trim().match(/\{[\s\S]*\}/)[0]); } catch { /* sortie illisible */ }
      if (!j || j.verdict !== 'SKIP') continue;
      skips.push(nom);
      if (!(typeof j.motif === 'string' && j.motif.trim())) sansMotif.push(nom);
    }
    if (skips.length < 30) ko('TF-1447 (B) : ' + skips.length + ' oracle(s) seulement ont rendu SKIP sur une cible absente — le contrôle ne mesure presque rien');
    else if (sansMotif.length) ko('TF-1447 (B) : ' + sansMotif.length + ' SKIP sans motif sur ' + skips.length + ' — ' + [...new Set(sansMotif)].join(', '));
    else ok('TF-1447 (B) : ' + skips.length + ' SKIP sur cible absente, oracles du registre hébergés ici, et tous portent un motif non vide');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  // (C) — chaque fixture du manifest dont le verdict est SKIP.
  const manC = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'fixtures', 'manifest.json'), 'utf8'));
  const skipsC = [], sansMotifC = [];
  for (const fx of manC.fixtures) for (const side of ['red', 'green']) {
    if (!(fx['attendu_' + side] || []).includes('SKIP')) continue;
    if (fx.cmd.some((s) => s.includes(MARQUEUR_PILOT)) && !PILOT) continue;
    let cmd = fx.cmd.map((s) => s.replace('{skilldir}', SKILLDIR).replace('{skillsroot}', SKILLSROOT)
      .replace(MARQUEUR_PILOT, PILOT || MARQUEUR_PILOT).replace('{fixture}', path.join(SKILLDIR, 'fixtures', fx[side])));
    if (/^python3?$/.test(cmd[0])) { const pyC = resolvePython(); if (!pyC) continue; cmd = [...pyC, ...cmd.slice(1)]; }
    const r = spawnSync(cmd[0] === 'node' ? process.execPath : cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 180000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let j = null; try { j = JSON.parse((r.stdout || '').trim().match(/\{[\s\S]*\}/)[0]); } catch { /* sortie illisible */ }
    if (!j || j.verdict !== 'SKIP') continue;
    skipsC.push(fx.nom + '/' + side);
    if (!(typeof j.motif === 'string' && j.motif.trim())) sansMotifC.push(fx.nom + '/' + side);
  }
  if (sansMotifC.length) ko('TF-1447 (C) : ' + sansMotifC.length + ' fixture(s) SKIP sans motif — ' + sansMotifC.join(', '));
  else ok('TF-1447 (C) : ' + skipsC.length + ' fixture(s) du manifest rendent SKIP, et toutes portent un motif non vide');
}

// ── TF-1023 (décision humaine D-11 (a) du 23/09/2026) — LE SOCLE DES PAGES SUIT LA CHARTE LUE À LA SOURCE ──
//
// LE FAIT. La marque Digit-AI était portée par deux chartes : les pages (socle digit-ai-page-html,
// Roboto / DM Sans) et les présentations (digit-ai-pptx, Montserrat / Inter). La décision humaine
// D-5 (a) du 22/09 a tranché — « la charte des présentations fait foi, les pages s'y alignent » —, et
// D-11 (a) l'a exécutée le 23/09 en alignant le gabarit du socle. Un alignement fait à la main se
// défait en silence à la prochaine retouche d'un des deux côtés : c'est ce qui avait laissé deux
// chartes coexister trois semaines.
//
// LE CONTRÔLE lit la charte là où les présentations la lisent — le dossier de marque de l'émetteur,
// par le lecteur OFFICIEL (`digit-ai-pptx/scripts/lire-marque.mjs`), jamais une seconde lecture — et
// exige que chaque pile de police du gabarit du socle COMMENCE par les familles nommées de la charte
// (les replis génériques du système n'en font pas partie). Dossier de marque absent du poste : la
// parité est déclarée NON JUGÉE, avec le motif du lecteur ; jamais un vert de complaisance.
{
  const GENERIQUES = new Set(['system-ui', '-apple-system', 'segoe ui', 'sans-serif', 'serif', 'monospace', 'ui-monospace', 'consolas']);
  const nommees = (pile) => pile.map((f) => String(f).trim().replace(/^["']|["']$/g, '')).filter((f) => f && !GENERIQUES.has(f.toLowerCase()));
  const pileDuSocle = (html, jeton) => {
    const m = new RegExp(jeton + '\\s*:\\s*([^;]+);').exec(html);
    return m ? m[1].split(',').map((f) => f.trim().replace(/^["']|["']$/g, '')) : null;
  };
  /** Rend la liste des écarts entre la charte lue et le gabarit ; vide = alignés. Pure : le banc l'éprouve. */
  const ecartsDeCharte = (polices, html) => {
    const ecarts = [];
    for (const [cle, jeton] of [['head', '--head'], ['sans', '--sans'], ['mono', '--mono']]) {
      const attendu = nommees((polices[cle] && polices[cle].pile) || []);
      const socle = pileDuSocle(html, jeton);
      if (!attendu.length) continue;
      if (!socle) { ecarts.push(`${jeton} absent du gabarit`); continue; }
      const tete = nommees(socle).slice(0, attendu.length);
      if (tete.join('|').toLowerCase() !== attendu.join('|').toLowerCase()) ecarts.push(`${jeton} : charte « ${attendu.join(', ')} », gabarit « ${nommees(socle).join(', ')} »`);
    }
    return ecarts;
  };
  const gabarit = path.join(SKILLSROOT, 'digit-ai-page-html', 'assets', 'boilerplate.html');
  const lecteur = path.join(SKILLSROOT, 'digit-ai-pptx', 'scripts', 'lire-marque.mjs');
  // Sens rouge d'abord, sur une charte d'essai : un gabarit resté à l'ancienne paire DOIT être refusé.
  const chartEssai = { head: { pile: ['Montserrat', 'Roboto', 'system-ui'] }, sans: { pile: ['Inter', 'DM Sans', 'system-ui'] } };
  const rouge = ecartsDeCharte(chartEssai, ':root{--head: "Roboto", system-ui, sans-serif;--sans: "DM Sans", system-ui, sans-serif;}');
  if (rouge.length === 2) ok('TF-1023 sens rouge : un gabarit resté à Roboto / DM Sans face à la charte Montserrat / Inter est refusé sur --head ET --sans');
  else ko(`TF-1023 sens rouge : ${rouge.length} écart(s) au lieu de 2 — le contrôle de parité ne refuse pas l'ancienne paire`);
  const vert = ecartsDeCharte(chartEssai, ':root{--head: "Montserrat", "Roboto", system-ui, sans-serif;--sans: "Inter", "DM Sans", system-ui, sans-serif;}');
  if (!vert.length) ok('TF-1023 sens vert : un gabarit qui ouvre ses piles par les familles de la charte, puis ajoute les replis système, est accepté');
  else ko('TF-1023 sens vert : ' + vert.join(' · '));
  // Puis le parc réel : la charte du dossier de marque de ce poste, contre le gabarit versionné.
  const r = spawnSync(process.execPath, [lecteur, '--compact'], { encoding: 'utf8' });
  if (r.status === 2) ok('TF-1023 parité socle ↔ charte des présentations NON JUGÉE sur ce poste — ' + String(r.stderr || '').split('\n')[0].slice(0, 160));
  else {
    let lu = null;
    try { lu = JSON.parse(r.stdout); } catch { /* illisible : dit ci-dessous */ }
    if (!lu || !lu.polices) ko('TF-1023 : le lecteur de marque n\'a rendu aucune police lisible — la parité ne se juge pas sur une sortie illisible');
    else {
      const ecarts = ecartsDeCharte(lu.polices, fs.readFileSync(gabarit, 'utf8'));
      if (ecarts.length) ko('TF-1023 : le gabarit du socle s\'écarte de la charte des présentations lue au dossier de marque — ' + ecarts.join(' · '));
      else ok(`TF-1023 : le gabarit du socle suit la charte des présentations lue au dossier de marque (${lu.source && lu.source.dossier_marque}) — ${lu.polices.head.pile[0]} / ${lu.polices.sans.pile[0]} / ${lu.polices.mono.pile[0]}`);
    }
  }
}

// TF-1348 (01/10/2026) — npm SE LANCE SOUS WINDOWS. `npm` y est un script `npm.cmd`, que Node refuse
// de lancer sans shell : `npm audit` rendait status null et aucune sortie, et oracle-sca rendait SKIP
// (« exit null ») sur un poste où npm répond. Le cas ne juge ni le registre npm ni le réseau : il
// exige seulement que le processus ait été LANCÉ. Sans npm sur le poste, il le dit.
{
  const aNpm = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['npm'], { encoding: 'utf8' }).status === 0;
  if (!aNpm) ok('TF-1348 NON JUGÉ sur ce poste : npm absent');
  else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-sca-npm-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'sca-npm', version: '1.0.0', dependencies: {} }));
      fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ name: 'sca-npm', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'sca-npm', version: '1.0.0' } } }));
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-sca.mjs'), dir], { encoding: 'utf8', timeout: 120000 });
      let j = null; try { j = JSON.parse(r.stdout); } catch { /* illisible : dit ci-dessous */ }
      if (!j) ko('TF-1348 : sortie d\'oracle-sca illisible — ' + String(r.stdout || r.stderr).slice(0, 120));
      else if (/exit null/.test(JSON.stringify(j))) ko('TF-1348 : npm audit n\'a pas été lancé (exit null) alors que npm est présent — verdict ' + j.verdict);
      else ok(`TF-1348 : npm audit lancé par oracle-sca sur un projet npm sans dépendance, verdict ${j.verdict}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
}

// TF-2281 (09/11/2026, reste de TF-2272) — oracle-sca LIT uv.lock ET poetry.lock, ET LANCE pip-audit PAR uvx.
// La paire rouge/verte de verrou est au manifest (données OSV figées). Ce cas prouve les VOIES D'OUTIL, sans réseau :
// un outil SIMULÉ (fixtures/sca-outil-simule.mjs) joue `pip-audit` et `uvx pip-audit`, désigné par QO_SCA_PIP_AUDIT /
// QO_SCA_UVX ; un chemin injouable simule l'absence de l'outil. Sens : pip-audit absent et uvx présent → le verrou est
// audité par `uvx pip-audit … --no-deps --disable-pip`, dans un requirements dérivé hors de la cible puis supprimé ;
// le projet lui-même et le paquet hors registre ne sont pas audités et le second est nommé ; deux versions d'un même
// nom → deux couches (pip-audit refuse le doublon) ; l'outil en échec rend un SKIP nommé, jamais un PASS.
{
  const SIM = path.join(SKILLDIR, 'fixtures', 'sca-outil-simule.mjs');
  const ABSENT = path.join(os.tmpdir(), 'qo-sca-outil-absent');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-sca-verrou-'));
  const tmpOracle = path.join(tmp, 'tmp'); fs.mkdirSync(tmpOracle);
  const trace = path.join(tmp, 'appels.jsonl');
  const lireTrace = () => (fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
  const juger = (cible, env) => {
    fs.rmSync(trace, { force: true });
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-sca.mjs'), cible],
      { encoding: 'utf8', timeout: 120000, env: { ...process.env, QO_PERIMETRE: '', QO_SIM_TRACE: trace, TEMP: tmpOracle, TMP: tmpOracle, TMPDIR: tmpOracle, ...env } });
    try { return JSON.parse(r.stdout); } catch { return null; }
  };
  const viaUvx = { QO_SCA_PIP_AUDIT: ABSENT, QO_SCA_UVX: SIM };
  const direct = { QO_SCA_PIP_AUDIT: SIM, QO_SCA_UVX: ABSENT };
  const dossier = (nom, fichier, contenu) => { const d = path.join(tmp, nom); fs.mkdirSync(d); fs.writeFileSync(path.join(d, fichier), contenu); return d; };
  const bloc = (nom, version, source) => `[[package]]\nname = "${nom}"\nversion = "${version}"\nsource = ${source}\n\n`;
  const REG = '{ registry = "https://pypi.org/simple" }';
  const enteteUv = 'version = 1\nrequires-python = ">=3.11"\n\n';
  const projet = bloc('demo-app', '0.1.0', '{ virtual = "." }');
  const gitUv = bloc('paquet-git', '0.0.1', '{ git = "https://example.invalid/paquet-git.git?rev=0000000#0000000000000000000000000000000000000000" }');
  try {
    const uvVuln = dossier('uv-vuln', 'uv.lock', enteteUv + projet + bloc('django', '1.4', REG) + gitUv);
    let j = juger(uvVuln, viaUvx);
    const appels = lireTrace().filter(a => a.argv.includes('-r'));
    const reqUtilise = appels[0] && appels[0].argv[appels[0].argv.indexOf('-r') + 1];
    !j || j.verdict !== 'FAIL' || !j.findings.some(f => f.sev === 'bloquant' && /PyPI django@1\.4/.test(f.msg) && f.where === 'uv.lock')
      ? ko(`TF-2281 uv.lock avec django 1.4, pip-audit absent, uvx présent : attendu FAIL sur PyPI django@1.4 (uv.lock), obtenu ${j && j.verdict}`)
      : ok('TF-2281 uv.lock avec django 1.4, pip-audit absent et uvx présent : FAIL sur PyPI django@1.4, constat localisé sur uv.lock');
    appels.length !== 1 || appels[0].mode !== 'uvx' || !appels[0].argv.includes('--no-deps') || !appels[0].argv.includes('--disable-pip')
      ? ko(`TF-2281 uv.lock : un seul appel « uvx pip-audit … --no-deps --disable-pip » attendu (rien n'est résolu ni installé), obtenu ${JSON.stringify(appels)}`)
      : ok('TF-2281 uv.lock : un seul appel « uvx pip-audit … --no-deps --disable-pip », rien n\'est résolu ni installé');
    typeof reqUtilise !== 'string' || !reqUtilise.startsWith(tmpOracle) || reqUtilise.startsWith(uvVuln) || fs.readdirSync(tmpOracle).length !== 0
      ? ko(`TF-2281 le requirements dérivé du verrou doit être écrit dans le dossier temporaire, jamais dans la cible, et supprimé : ${reqUtilise}, ${fs.readdirSync(tmpOracle).length} reste(s)`)
      : ok('TF-2281 le requirements dérivé du verrou est écrit dans le dossier temporaire, jamais dans la cible, et supprimé après l\'audit');
    !j || !j.non_juge.some(x => /paquet-git/.test(x)) || j.non_juge.some(x => /demo-app/.test(x))
      ? ko(`TF-2281 uv.lock : le paquet hors registre doit être NOMMÉ au non_juge et le projet lui-même absent : ${JSON.stringify(j && j.non_juge.filter(x => /registre/.test(x)))}`)
      : ok('TF-2281 uv.lock : le paquet git est nommé au non_juge (non audité), le projet lui-même n\'y figure pas');

    j = juger(uvVuln, direct);
    const tr = lireTrace();
    !j || j.verdict !== 'FAIL' || !tr.length || !tr.every(a => a.mode === 'direct')
      ? ko(`TF-2281 pip-audit présent, uvx absent : pip-audit doit être lancé directement, sans uvx (verdict ${j && j.verdict}, appels ${JSON.stringify(tr.map(a => a.mode))})`)
      : ok('TF-2281 pip-audit présent et uvx absent : pip-audit est lancé directement, sans uvx (FAIL sur le verrou)');

    const uvMulti = dossier('uv-multi', 'uv.lock', enteteUv + bloc('alpha', '1.0.0', REG) + bloc('alpha', '2.0.0', REG) + bloc('beta', '3.1.0', REG));
    j = juger(uvMulti, viaUvx);
    const couches = lireTrace().filter(a => a.argv.includes('-r'));
    !j || j.verdict !== 'PASS' || couches.length !== 2
      ? ko(`TF-2281 uv.lock avec deux versions du même paquet : attendu PASS en 2 couches (pip-audit refuse le doublon), obtenu ${j && j.verdict} en ${couches.length} appel(s)`)
      : ok('TF-2281 uv.lock avec deux versions du même paquet : PASS en deux couches, pip-audit n\'a pas à refuser un doublon');

    const poetry = dossier('poetry-vuln', 'poetry.lock', '[[package]]\nname = "django"\nversion = "1.4"\n\n[package.dependencies]\nname = "ne-doit-pas-etre-lu"\nversion = "9.9.9"\n\n'
      + '[[package]]\nname = "paquet-git"\nversion = "0.0.1"\n\n[package.source]\ntype = "git"\nurl = "https://example.invalid/paquet-git.git"\n\n[metadata]\nlock-version = "2.0"\n');
    j = juger(poetry, viaUvx);
    const lignes = lireTrace().filter(a => a.argv.includes('-r'));
    !j || j.verdict !== 'FAIL' || !j.non_juge.some(x => /paquet-git/.test(x)) || JSON.stringify(j).includes('ne-doit-pas-etre-lu') || lignes.length !== 1
      ? ko(`TF-2281 poetry.lock : attendu FAIL sur django 1.4, paquet git nommé, table [package.dependencies] non lue comme un paquet, obtenu ${j && j.verdict}`)
      : ok('TF-2281 poetry.lock : FAIL sur django 1.4 ; la table [package.dependencies] n\'est pas lue comme un paquet, le paquet git est nommé au non_juge');

    j = juger(uvVuln, { ...direct, QO_SIM_ECHEC: '1' });
    !j || j.verdict !== 'SKIP' || !/sans sortie exploitable/.test(String(j.motif)) || !/uv\.lock/.test(String(j.motif))
      ? ko(`TF-2281 outil en échec : attendu SKIP dont le motif nomme le verrou et l'absence de sortie, jamais PASS ; obtenu ${j && j.verdict} « ${j && j.motif} »`)
      : ok('TF-2281 outil présent mais audit en échec : SKIP motivé qui nomme le verrou, jamais un PASS');

    const req = dossier('req-uvx', 'requirements.txt', 'django==1.4\n');
    j = juger(req, viaUvx);
    const rq = lireTrace().filter(a => a.argv.includes('-r'));
    !j || j.verdict !== 'FAIL' || rq.length !== 1 || rq[0].mode !== 'uvx' || rq[0].argv.includes('--no-deps')
      ? ko(`TF-2281 requirements.txt, pip-audit absent et uvx présent : attendu FAIL via uvx, sans --no-deps (résolution normale), obtenu ${j && j.verdict} ${JSON.stringify(rq)}`)
      : ok('TF-2281 requirements.txt avec django 1.4, pip-audit absent et uvx présent : FAIL via « uvx pip-audit », résolution normale');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-2450 (12/11/2026, décision R-58 du 12/11/2026, reste de TF-2403) — oracle-sca NOMME CHAQUE AVIS, ET SES MODES FIGÉ ET VIF
// JUGENT LES MÊMES SÉVÉRITÉS SUR LES MÊMES VERSIONS, VERROU NPM COMPRIS. Avant : le message ne disait que des comptes, npm audit
// ne comptait que critical, high et moderate (low ignoré), le mode figé jugeait tout sans sévérité et lisait les intervalles
// de package.json au lieu du verrou. Un même projet npm (package.json « vite ^5.4.0 », verrou réduit à vite 5.4.21, react-router-dom
// 6.30.4, react-router 6.30.4, esbuild 0.21.5 : 12 avis réels dont un high et un low, relevés le 12/11/2026) est jugé par TROIS voies
// sans réseau : les données figées, un npm SIMULÉ qui rejoue une sortie RÉELLE de `npm audit --json`, et un serveur OSV LOCAL
// (npm absent). Les trois doivent rendre FAIL et nommer les MÊMES 12 avis (identifiant, paquet, version, sévérité). Puis :
// low seul est jugé, info seul est écarté et nommé, une sortie npm qui ne nomme rien mais compte des avis n'est jamais un PASS, une
// sévérité absente se dit « inconnue » sans écarter l'avis, un package.json sans verrou le dit, un verrou de format 1 se lit.
{
  const ORA = path.join(SKILLDIR, 'scripts', 'oracle-sca.mjs');
  const FX = path.join(SKILLDIR, 'fixtures');
  const SIM = path.join(FX, 'sca-npm-simule.mjs'), SERVEUR = path.join(FX, 'sca-osv-local.mjs');
  const ABSENT = path.join(os.tmpdir(), 'qo-sca-npm-absent');
  const FIGEES = path.join(FX, 'sca-osv-fige.json');
  const ROUGE = path.join(FX, 'sca-npm-verrou-red');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-sca-2450-'));
  const juger = (cible, args = [], env = {}) => {
    const r = spawnSync(process.execPath, [ORA, cible, ...args], { encoding: 'utf8', timeout: 120000, env: { ...process.env, QO_PERIMETRE: '', ...env } });
    try { return JSON.parse(r.stdout); } catch { return null; }
  };
  const cles = (j) => ((j && j.findings) || []).filter(f => f.avis).map(f => [f.avis.id, f.avis.paquet, f.avis.version, f.avis.severite].join('|')).sort();
  const projet = (nom, lock, deps = { x: '^1.0.0' }) => {
    const d = path.join(tmp, nom); fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: nom, version: '1.0.0', dependencies: deps }));
    if (lock) fs.writeFileSync(path.join(d, 'package-lock.json'), typeof lock === 'string' ? lock : JSON.stringify(lock));
    return d;
  };
  const verrou3 = (paquets) => ({ name: 'p', lockfileVersion: 3, requires: true, packages: { '': { name: 'p', version: '1.0.0' },
    ...Object.fromEntries(paquets.map(([n, v]) => ['node_modules/' + n, { version: v, resolved: `https://registry.npmjs.org/${n}/-/${n}-${v}.tgz` }])) } });
  const figee = (nom, reponses) => { const f = path.join(tmp, nom + '.json'); fs.writeFileSync(f, JSON.stringify({ source: 'banc TF-2450', date: '2026-11-12', reponses })); return '--osv-fige=' + f; };
  const servir = (env = {}) => new Promise((resolve) => {
    const enfant = spawn(process.execPath, [SERVEUR, FIGEES], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'ignore'] });
    let vu = false;
    enfant.stdout.on('data', (d) => { const m = /PORT (\d+)/.exec(String(d)); if (m && !vu) { vu = true; resolve({ url: 'http://127.0.0.1:' + m[1], fin: () => enfant.kill() }); } });
    setTimeout(() => { if (!vu) { enfant.kill(); resolve(null); } }, 15000);
  });
  try {
    // (A) données figées : 12 avis nommés, sévérités lues, low et high compris
    const fige = juger(ROUGE, ['--osv-fige=' + FIGEES]);
    const ref = cles(fige);
    !fige || fige.verdict !== 'FAIL' || ref.length !== 12 || !ref.includes('GHSA-9jrq-w75r-8gcw|vite|5.4.21|low') || !ref.includes('GHSA-587h-7wmj-h5pm|vite|5.4.21|high')
      || !fige.findings.every(f => !f.avis || (f.msg.includes(f.avis.id) && f.msg.includes(f.avis.paquet + '@' + f.avis.version) && f.msg.includes('(sévérité ' + f.avis.severite + ')') && f.where === 'package.json'))
      ? ko(`TF-2450 (A) mode figé sur le verrou npm : attendu FAIL avec 12 avis nommés (identifiant, paquet, version, sévérité) dont un high et un low, obtenu ${fige && fige.verdict} ${ref.length} avis ${JSON.stringify(ref.slice(0, 3))}`)
      : ok('TF-2450 (A) mode figé : le verrou npm est lu (vite 5.4.21 et non l\'intervalle ^5.4.0), 12 avis sont nommés avec identifiant, paquet, version et sévérité, dont un high et un low');
    // (B) mode vif : npm audit (simulé, sortie réelle) nomme les MÊMES avis
    const vif = juger(ROUGE, [], { QO_SCA_NPM: SIM });
    ref.length !== 12 || JSON.stringify(cles(vif)) !== JSON.stringify(ref)
      ? ko(`TF-2450 (B) mode vif (npm audit) : les avis nommés doivent être les 12 du mode figé, obtenu ${vif && vif.verdict} ${JSON.stringify(cles(vif).filter(x => !ref.includes(x)))} en trop, ${JSON.stringify(ref.filter(x => !cles(vif).includes(x)))} en moins`)
      : ok('TF-2450 (B) mode vif (npm audit, sortie réelle rejouée) : les mêmes 12 avis, mêmes versions, mêmes sévérités que le mode figé');
    // (C) OSV vif (npm absent) : serveur local, sévérité lue sur la fiche de chaque avis
    const srv = await servir();
    if (!srv) ko('TF-2450 (C) : le serveur OSV local n\'a pas démarré');
    else {
      try {
        const osv = juger(ROUGE, [], { QO_SCA_NPM: ABSENT, QO_SCA_OSV_URL: srv.url });
        ref.length !== 12 || JSON.stringify(cles(osv)) !== JSON.stringify(ref)
          ? ko(`TF-2450 (C) mode vif par OSV (npm absent) : les avis nommés doivent être les 12 du mode figé, obtenu ${osv && osv.verdict} ${JSON.stringify(cles(osv).filter(x => !ref.includes(x)))} en trop, ${JSON.stringify(ref.filter(x => !cles(osv).includes(x)))} en moins`)
          : ok('TF-2450 (C) mode vif par OSV (npm absent, serveur local) : les mêmes 12 avis, sévérité lue sur la fiche de chaque avis');
      } finally { srv.fin(); }
    }
    const srvSans = await servir({ QO_SIM_OSV_SANS_FICHE: '1' });
    if (!srvSans) ko('TF-2450 (C bis) : le serveur OSV local n\'a pas démarré');
    else {
      try {
        const sans = juger(ROUGE, [], { QO_SCA_NPM: ABSENT, QO_SCA_OSV_URL: srvSans.url });
        !sans || sans.verdict !== 'FAIL' || cles(sans).length !== 12 || !cles(sans).every(x => x.endsWith('|inconnue')) || !sans.non_juge.some(x => /12 avis sans sévérité connue/.test(x))
          ? ko(`TF-2450 (C bis) fiches OSV injoignables : les 12 avis restent jugés, en sévérité « inconnue » et dits au non_juge — obtenu ${sans && sans.verdict} ${cles(sans).length} avis`)
          : ok('TF-2450 (C bis) fiches OSV injoignables : les 12 avis restent jugés (FAIL) en sévérité « inconnue », jamais écartés, et le non_juge le dit');
      } finally { srvSans.fin(); }
    }
    // (D) low seul est jugé (le décompte critical/high/moderate l'ignorait) ; info seul est écarté et nommé
    const dBas = projet('bas', verrou3([['paquet-bas', '1.0.0']]));
    const bas = juger(dBas, [], { QO_SCA_NPM: SIM, QO_SIM_NPM: 'bas' });
    !bas || bas.verdict !== 'FAIL' || JSON.stringify(cles(bas)) !== JSON.stringify(['GHSA-sim0-bas0-0001|paquet-bas|1.0.0|low'])
      ? ko(`TF-2450 (D) un avis low seul : attendu FAIL qui le nomme avec sa version lue au verrou (paquet-bas 1.0.0), obtenu ${bas && bas.verdict} ${JSON.stringify(cles(bas))}`)
      : ok('TF-2450 (D) un avis low seul fait échouer (npm audit comptait critical, high, moderate et l\'ignorait) et se nomme avec sa version lue au verrou');
    const dInfo = projet('info', verrou3([['paquet-info', '1.0.0']]));
    const info = juger(dInfo, [], { QO_SCA_NPM: SIM, QO_SIM_NPM: 'info' });
    !info || info.verdict !== 'PASS' || !info.non_juge.some(x => /1 avis de sévérité info non jugé.*GHSA-sim0-inf0-0001/.test(x))
      ? ko(`TF-2450 (D) un avis info seul : attendu PASS avec l'avis nommé au non_juge, obtenu ${info && info.verdict}`)
      : ok('TF-2450 (D) un avis info seul n\'est pas jugé (PASS) et il est nommé au non_juge');
    // (E) une sortie qui compte des avis sans en nommer un n'est jamais un PASS ; une sortie propre PASS ; un échec SKIP
    const comptes = juger(projet('comptes', verrou3([['x', '1.0.0']])), [], { QO_SCA_NPM: SIM, QO_SIM_NPM: 'comptes' });
    !comptes || comptes.verdict !== 'FAIL' || !comptes.findings.some(f => /ne nomme aucun avis exploitable/.test(f.msg))
      ? ko(`TF-2450 (E) npm audit qui compte un avis sans le nommer : attendu FAIL, jamais PASS, obtenu ${comptes && comptes.verdict}`)
      : ok('TF-2450 (E) npm audit qui compte un avis sans le nommer (format ancien) : FAIL qui le dit, jamais un PASS');
    const propre = juger(projet('propre', verrou3([['x', '1.0.0']])), [], { QO_SCA_NPM: SIM, QO_SIM_NPM: 'propre' });
    const panne = juger(projet('panne', verrou3([['x', '1.0.0']])), [], { QO_SCA_NPM: SIM, QO_SIM_NPM: 'echec' });
    !propre || propre.verdict !== 'PASS' || !panne || panne.verdict !== 'SKIP' || !/sans sortie exploitable/.test(String(panne.motif))
      ? ko(`TF-2450 (E) sens vert : npm audit propre attendu PASS (obtenu ${propre && propre.verdict}), npm audit en panne attendu SKIP motivé (obtenu ${panne && panne.verdict})`)
      : ok('TF-2450 (E) sens vert : npm audit sans avis PASS ; npm audit en panne SKIP motivé, jamais un PASS');
    // (F) le filtre du mode figé : low jugé, info écarté, chaîne = sévérité inconnue jugée
    const fInfo = juger(projet('filtre-info', verrou3([['a', '1.0.0']])), [figee('f-info', { 'npm:a@1.0.0': [{ id: 'GHSA-sim0-inf0-0002', severite: 'INFO' }] })]);
    const fLow = juger(projet('filtre-low', verrou3([['b', '2.0.0']])), [figee('f-low', { 'npm:b@2.0.0': [{ id: 'GHSA-sim0-low0-0002', severite: 'LOW' }] })]);
    const fChaine = juger(projet('filtre-chaine', verrou3([['c', '3.0.0']])), [figee('f-chaine', { 'npm:c@3.0.0': ['GHSA-sim0-ch00-0002'] })]);
    !fInfo || fInfo.verdict !== 'PASS' || !fInfo.non_juge.some(x => /GHSA-sim0-inf0-0002/.test(x)) || !fLow || fLow.verdict !== 'FAIL' || JSON.stringify(cles(fLow)) !== JSON.stringify(['GHSA-sim0-low0-0002|b|2.0.0|low'])
      || !fChaine || fChaine.verdict !== 'FAIL' || JSON.stringify(cles(fChaine)) !== JSON.stringify(['GHSA-sim0-ch00-0002|c|3.0.0|inconnue']) || !fChaine.non_juge.some(x => /1 avis sans sévérité connue/.test(x))
      ? ko(`TF-2450 (F) filtre du mode figé : info attendu PASS nommé (${fInfo && fInfo.verdict}), low attendu FAIL (${fLow && fLow.verdict}), simple chaîne attendue FAIL en sévérité inconnue (${fChaine && fChaine.verdict} ${JSON.stringify(cles(fChaine))})`)
      : ok('TF-2450 (F) mode figé : info écarté et nommé (PASS), low jugé (FAIL), une entrée sans sévérité jugée en « inconnue » (FAIL) et dite au non_juge');
    // (G) sans verrou : l'approximation par l'intervalle reste, et elle est dite ; verrou de format 1 lu ; verrou illisible dit
    const sansV = juger(projet('sans-verrou', null, { vite: '^5.4.21' }), [figee('g-vite', { 'npm:vite@5.4.21': [{ id: 'GHSA-sim0-sv00-0002', severite: 'HIGH' }] })]);
    !sansV || sansV.verdict !== 'FAIL' || !sansV.non_juge.some(x => /sans verrou npm.*intervalle déclaré/.test(x))
      ? ko(`TF-2450 (G) package.json sans verrou : attendu FAIL (version lue de l'intervalle) et la limite dite au non_juge, obtenu ${sansV && sansV.verdict}`)
      : ok('TF-2450 (G) package.json sans verrou : la version est lue de l\'intervalle déclaré, et le non_juge le dit');
    const v1 = JSON.stringify({ name: 'p', lockfileVersion: 1, requires: true, dependencies: { vite: { version: '5.4.21', resolved: 'https://registry.npmjs.org/vite/-/vite-5.4.21.tgz', dependencies: { esbuild: { version: '0.21.5', resolved: 'https://registry.npmjs.org/esbuild/-/esbuild-0.21.5.tgz' } } }, local: { version: 'file:../local' } } });
    const g1 = juger(projet('verrou-v1', v1, { vite: '^5.0.0' }), [figee('g-v1', { 'npm:vite@5.4.21': [{ id: 'GHSA-sim0-v100-0002', severite: 'MODERATE' }], 'npm:esbuild@0.21.5': [] })]);
    !g1 || g1.verdict !== 'FAIL' || JSON.stringify(cles(g1)) !== JSON.stringify(['GHSA-sim0-v100-0002|vite|5.4.21|moderate']) || !g1.non_juge.some(x => /1 paquet\(s\) du verrou hors registre.*local/.test(x))
      ? ko(`TF-2450 (G) verrou de format 1 : attendu FAIL sur vite 5.4.21 (esbuild imbriqué lu, paquet « file: » nommé hors registre), obtenu ${g1 && g1.verdict} ${JSON.stringify(cles(g1))}`)
      : ok('TF-2450 (G) verrou de format 1 : l\'arbre imbriqué est lu (vite et esbuild), le paquet « file: » est nommé au non_juge, non audité');
    const illisible = juger(projet('verrou-casse', '{ pas du json', { vite: '^5.4.21' }), [figee('g-casse', { 'npm:vite@5.4.21': [] })]);
    !illisible || illisible.verdict !== 'PASS' || !illisible.non_juge.some(x => /package-lock\.json illisible/.test(x))
      ? ko(`TF-2450 (G) verrou illisible : attendu la limite dite au non_juge (package.json seul lu), obtenu ${illisible && illisible.verdict}`)
      : ok('TF-2450 (G) verrou illisible : dit au non_juge, package.json seul est lu');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-1701 (lot Produit-82 20261014b, RA-2) — GITLEAKS LISAIT LES EMPREINTES D'UN JOURNAL D'ORACLES
// COMME DES CLÉS. Sa règle `generic-api-key` accusait les empreintes SHA-256 indexées par des chemins
// contenant `make_htpasswd` ou `masquer_secrets`, et oracle-secrets rendait FAIL sur la preuve d'un run.
// Trois dossiers jouent les deux sens : la verte (le journal, ses seules empreintes) passe, ses deux
// constats rétrogradés et nommés ; la rouge « journal » porte en plus une vraie valeur de clé, qui
// reste bloquante ; la rouge « hors journal » porte la même empreinte dans un fichier qui n'est pas un
// journal, qui reste bloquante aussi. Les valeurs sont assemblées ici pour qu'aucun scanner ne lise ce
// fichier comme une fuite. Sans gitleaks sur le poste, le cas le dit.
{
  const aGitleaks = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gitleaks'], { encoding: 'utf8' }).status === 0;
  if (!aGitleaks) ok('TF-1701 NON JUGÉ sur ce poste : gitleaks absent (le scanner intégré ne lit pas ces empreintes)');
  else {
    const H1 = 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb';
    const H2 = '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-gitleaks-journal-'));
    const juger = (dossier) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-secrets.mjs'), dossier], { encoding: 'utf8', timeout: 120000 });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const bloquantsGitleaks = j => (j && j.findings || []).filter(f => f.sev === 'bloquant' && /^gitleaks /.test(f.msg));
    try {
      const preuve = path.join(tmp, 'vert', 'forge', 'etapes', 'p2');
      fs.mkdirSync(preuve, { recursive: true });
      fs.writeFileSync(path.join(preuve, '_oracles-journal.json'), JSON.stringify({ verdict: 'PASS', empreinte: { format: 'forge-ops/empreinte@1', fichiers: { 'scripts/make_htpasswd.py': H1, 'scripts/masquer_secrets.py': H2 } } }, null, 2));
      const rougeJ = path.join(tmp, 'rouge-journal');
      fs.mkdirSync(rougeJ);
      fs.writeFileSync(path.join(rougeJ, '_oracles-journal.json'), JSON.stringify({ empreinte: { fichiers: { 'scripts/make_htpasswd.py': H1 } }, resultats: [{ ['api' + '_key']: 'Zx8vQ2mN' + '7pL4rT9w' + 'K3sB6yH1' + 'aE5uD0cR' }] }, null, 2));
      const rougeF = path.join(tmp, 'rouge-hors-journal');
      fs.mkdirSync(rougeF);
      fs.writeFileSync(path.join(rougeF, 'config.json'), JSON.stringify({ fichiers: { 'scripts/make_htpasswd.py': H1 } }, null, 2));
      const v = juger(path.join(tmp, 'vert')), rj = juger(rougeJ), rf = juger(rougeF);
      const retro = (v && v.findings || []).filter(f => f.sev === 'warn' && /TF-1701/.test(f.msg));
      !v ? ko('TF-1701 sens vert : sortie d\'oracle-secrets illisible')
        : v.verdict !== 'PASS' || retro.length !== 2 ? ko(`TF-1701 sens vert : verdict ${v.verdict}, ${retro.length} empreinte(s) rétrogradée(s) au lieu de 2 — ${JSON.stringify(v.findings).slice(0, 160)}`)
          : ok('TF-1701 sens vert : les 2 empreintes SHA-256 d\'un journal d\'oracles rangé en preuve sont rétrogradées et nommées, verdict PASS');
      const enJournal = bloquantsGitleaks(rj).filter(f => /_oracles-journal\.json:/.test(f.where || ''));
      !rj ? ko('TF-1701 sens rouge (journal) : sortie illisible')
        : rj.verdict !== 'FAIL' || enJournal.length !== 1 ? ko(`TF-1701 sens rouge (journal) : verdict ${rj.verdict}, ${enJournal.length} constat(s) bloquant(s) de gitleaks dans le journal au lieu de 1 — une vraie clé dans un journal doit rester bloquante`)
          : ok('TF-1701 sens rouge (journal) : une valeur de clé qui n\'est pas une empreinte reste bloquante dans un journal, localisée (fichier:ligne)');
      !rf ? ko('TF-1701 sens rouge (hors journal) : sortie illisible')
        : rf.verdict !== 'FAIL' || bloquantsGitleaks(rf).length !== 1 ? ko(`TF-1701 sens rouge (hors journal) : verdict ${rf.verdict} — une empreinte hors d'un journal d'oracles doit rester bloquante`)
          : ok('TF-1701 sens rouge (hors journal) : la même empreinte dans un fichier qui n\'est pas un journal reste bloquante');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
}

// TF-1702 (lot Produit-82 20261014b, RA-3) — LE PÉRIMÈTRE VERSIONNÉ. run-oracles et oracle-secrets
// jugeaient le DISQUE : un `.env` ignoré par git rendait FAIL le verdict du dépôt. `--versionne` borne
// le jugement à `git ls-files -co --exclude-standard`. Le banc monte un dépôt jetable : un `.env`
// ignoré qui porte un mot de passe, un fichier suivi sain. Quatre sens : sans l'option, le disque est
// jugé (FAIL, le comportement d'avant reste le défaut) ; avec, PASS et le `.env` nommé au non_juge ;
// un fichier NEUF non ignoré qui porte un secret reste jugé (FAIL) ; hors d'un dépôt git, l'option ne
// fait taire personne (disque entier jugé, et dit). Puis run-oracles bout à bout : son domaine secrets
// suit l'option, et son journal écrit le périmètre jugé. Valeurs assemblées : aucun scanner ne doit
// lire ce fichier comme une fuite.
{
  const aGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
  if (!aGit) ok('TF-1702 NON JUGÉ sur ce poste : git absent');
  else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-perimetre-'));
    const SECRETS = path.join(SKILLDIR, 'scripts', 'oracle-secrets.mjs');
    const juger = (cible, ...extra) => {
      const r = spawnSync(process.execPath, [SECRETS, cible, ...extra], { encoding: 'utf8', timeout: 120000 });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const mdp = "password = '" + 'k8Fq2' + 'LmZ9xWv' + "'\n";
    try {
      const depot = path.join(tmp, 'depot');
      fs.mkdirSync(depot);
      spawnSync('git', ['init', '-q'], { cwd: depot });
      fs.writeFileSync(path.join(depot, '.gitignore'), '.env\n');
      fs.writeFileSync(path.join(depot, '.env'), mdp);
      fs.writeFileSync(path.join(depot, 'app.py'), 'print("ok")\n');
      spawnSync('git', ['add', '.gitignore', 'app.py'], { cwd: depot });
      const disque = juger(depot), versionne = juger(depot, '--versionne');
      !disque || disque.verdict !== 'FAIL' ? ko(`TF-1702 défaut inchangé : sans --versionne, le disque doit rester jugé (FAIL sur le .env), verdict ${disque && disque.verdict}`)
        : ok('TF-1702 défaut inchangé : sans --versionne, le disque est jugé et le .env ignoré fait échouer (FAIL)');
      const dit = versionne && versionne.non_juge.some(x => /périmètre VERSIONNÉ/.test(x) && /\.env/.test(x));
      !versionne || versionne.verdict !== 'PASS' || !dit ? ko(`TF-1702 sens vert : avec --versionne, verdict ${versionne && versionne.verdict}, .env nommé au non_juge : ${!!dit}`)
        : ok('TF-1702 sens vert : avec --versionne, le .env ignoré par git n\'est pas jugé (PASS) et il est nommé au non_juge');
      fs.writeFileSync(path.join(depot, 'neuf.py'), mdp);
      const neuf = juger(depot, '--versionne');
      fs.rmSync(path.join(depot, 'neuf.py'));
      !neuf || neuf.verdict !== 'FAIL' || !neuf.findings.some(f => f.sev === 'bloquant' && /neuf\.py/.test(f.where || ''))
        ? ko(`TF-1702 sens rouge : un fichier neuf non ignoré qui porte un secret doit rester jugé sous --versionne, verdict ${neuf && neuf.verdict}`)
        : ok('TF-1702 sens rouge : sous --versionne, un fichier neuf non ignoré qui porte un secret est jugé (FAIL)');
      const horsGit = path.join(tmp, 'hors-git');
      fs.mkdirSync(horsGit);
      fs.writeFileSync(path.join(horsGit, '.env'), mdp);
      const hg = juger(horsGit, '--versionne');
      !hg || hg.verdict !== 'FAIL' || !hg.non_juge.some(x => /DISQUE entier est jugé/.test(x))
        ? ko(`TF-1702 hors dépôt git : --versionne doit juger le disque entier et le dire, verdict ${hg && hg.verdict}`)
        : ok('TF-1702 hors dépôt git : --versionne ne fait taire personne — disque entier jugé (FAIL), et dit au non_juge');
      // Bout à bout : le domaine secrets de run-oracles suit l'option, et le journal dit le périmètre.
      const lancer = (...extra) => {
        const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'run-oracles.mjs'), depot, '--json', '--no-cache', ...extra], { encoding: 'utf8', timeout: 300000 });
        try { return JSON.parse(r.stdout); } catch { return null; }
      };
      const secretsDe = j => (j && j.resultats || []).filter(x => x.domaine === 'Sécurité / secrets').map(x => x.verdict).join(',');
      const roDisque = lancer(), roVersionne = lancer('--versionne');
      !roDisque || secretsDe(roDisque) !== 'FAIL' || roDisque.perimetre !== 'disque'
        ? ko(`TF-1702 run-oracles sans option : secrets ${secretsDe(roDisque)}, périmètre ${roDisque && roDisque.perimetre} — attendu FAIL sur le disque`)
        : ok('TF-1702 run-oracles sans option : périmètre « disque » écrit au journal, secrets FAIL sur le .env');
      !roVersionne || secretsDe(roVersionne) !== 'PASS' || roVersionne.perimetre !== 'versionne'
        ? ko(`TF-1702 run-oracles --versionne : secrets ${secretsDe(roVersionne)}, périmètre ${roVersionne && roVersionne.perimetre} — attendu PASS sur le contenu versionné`)
        : ok('TF-1702 run-oracles --versionne : périmètre « versionne » écrit au journal, oracle-secrets borné par QO_PERIMETRE (PASS)');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
}

// TF-1705 (lot Produit-82 20261014c, RA-4) — LE MARQUEUR %s DE PSYCOPG N'EST PAS UNE INJECTION.
// La paire du manifest prouve le verdict ; ce cas prouve la LIGNE : dans la rouge, chacune des trois
// requêtes formatées hors du littéral (`% (ids,)`, `% nom`, `+ nom +`) reste accusée, et dans la
// verte, aucune des quatre requêtes à paramètres liés (`%s`, `%(nom)s`, second argument) ne l'est.
{
  const lignes = (fixture) => {
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-sast.mjs'), path.join(SKILLDIR, 'fixtures', fixture)], { encoding: 'utf8', timeout: 300000 });
    let j = null; try { j = JSON.parse(r.stdout); } catch { return null; }
    return j.findings.filter(f => /concaténée\/formatée/.test(f.msg)).map(f => Number(String(f.where).split(':').pop())).sort((a, b) => a - b).join(',');
  };
  const rouge = lignes('sast-sql-formatee-red.py'), vert = lignes('sast-sql-parametres-green.py');
  rouge !== '7,11,15' ? ko(`TF-1705 sens rouge : lignes accusées « ${rouge} », attendu 7,11,15 — un vrai formatage de chaîne SQL doit rester accusé`)
    : ok('TF-1705 sens rouge : les trois requêtes formatées hors du littéral (lignes 7, 11, 15) restent accusées');
  vert !== '' ? ko(`TF-1705 sens vert : lignes accusées « ${vert} » sur des requêtes à paramètres liés psycopg`)
    : ok('TF-1705 sens vert : aucune requête à paramètres liés (%s, %(nom)s, second argument d\'execute) n\'est accusée');
}

// TF-1729 (15/10/2026, reste de TF-1702) — oracle-sast et oracle-sca suivent le PÉRIMÈTRE VERSIONNÉ.
// Sous run-oracles --versionne, seul oracle-secrets s'y bornait : oracle-sca, lancé sur le DOSSIER dès
// qu'un manifeste y apparaît, lisait aussi un manifeste ignoré par git, et oracle-sast appelé sur un
// dossier jugeait du code ignoré. Banc sur un dépôt jetable : `genere/` ignoré porte un appel
// os.system et un manifeste épinglé sur une version vulnérable ; le contenu suivi est sain. Sens :
// sans l'option, le disque reste jugé (FAIL) ; avec `--versionne` ou QO_PERIMETRE=versionne (la voie
// de run-oracles), PASS et le fichier ignoré nommé au non_juge ; un fichier NEUF non ignoré reste jugé
// (FAIL) ; hors dépôt git, l'option ne fait taire personne. oracle-sca joue sur les données OSV figées.
{
  const aGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
  if (!aGit) ok('TF-1729 NON JUGÉ sur ce poste : git absent');
  else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-perimetre-sast-sca-'));
    const FIGE = '--osv-fige=' + path.join(SKILLDIR, 'fixtures', 'sca-osv-fige.json');
    const juger = (oracle, cible, extra = [], env = {}) => {
      const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', oracle), cible, ...extra],
        { encoding: 'utf8', timeout: 300000, env: { ...process.env, QO_PERIMETRE: '', ...env } });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const nomme = (j, nom) => !!j && j.non_juge.some(x => /périmètre VERSIONNÉ/.test(x) && x.includes(nom));
    const accuse = (j, nom) => !!j && j.findings.some(f => f.sev === 'bloquant' && String(f.where || '').replace(/\\/g, '/').includes(nom));
    const appel = 'import os\n\n\ndef lancer(cmd):\n    os.system(cmd)\n';
    try {
      const depot = path.join(tmp, 'depot');
      fs.mkdirSync(path.join(depot, 'genere'), { recursive: true });
      spawnSync('git', ['init', '-q'], { cwd: depot });
      fs.writeFileSync(path.join(depot, '.gitignore'), 'genere/\n');
      fs.writeFileSync(path.join(depot, 'app.py'), 'print("ok")\n');
      fs.writeFileSync(path.join(depot, 'requirements.txt'), 'packaging==24.1\n');
      fs.writeFileSync(path.join(depot, 'genere', 'outil.py'), appel);
      fs.writeFileSync(path.join(depot, 'genere', 'requirements.txt'), 'requests==2.19.0\n');
      spawnSync('git', ['add', '.gitignore', 'app.py', 'requirements.txt'], { cwd: depot });
      // oracle-sast
      const sDisque = juger('oracle-sast.mjs', depot), sVers = juger('oracle-sast.mjs', depot, ['--versionne']);
      const sEnv = juger('oracle-sast.mjs', depot, [], { QO_PERIMETRE: 'versionne' });
      !sDisque || sDisque.verdict !== 'FAIL' || !accuse(sDisque, 'genere/outil.py') ? ko(`TF-1729 sast, défaut inchangé : sans --versionne, le code ignoré doit rester jugé (FAIL sur genere/outil.py), verdict ${sDisque && sDisque.verdict}`)
        : ok('TF-1729 sast, défaut inchangé : sans --versionne, le disque est jugé et genere/outil.py ignoré fait échouer (FAIL)');
      !sVers || sVers.verdict !== 'PASS' || !nomme(sVers, 'genere/outil.py') ? ko(`TF-1729 sast, sens vert : avec --versionne, verdict ${sVers && sVers.verdict}, genere/outil.py nommé au non_juge : ${nomme(sVers, 'genere/outil.py')}`)
        : ok('TF-1729 sast, sens vert : avec --versionne, le code ignoré par git n\'est pas jugé (PASS) et il est nommé au non_juge');
      !sEnv || sEnv.verdict !== 'PASS' || !nomme(sEnv, 'genere/outil.py') ? ko(`TF-1729 sast, voie de run-oracles : sous QO_PERIMETRE=versionne, verdict ${sEnv && sEnv.verdict}`)
        : ok('TF-1729 sast, voie de run-oracles : QO_PERIMETRE=versionne borne le jugement comme --versionne (PASS, fichier ignoré nommé)');
      // oracle-sca
      const cDisque = juger('oracle-sca.mjs', depot, [FIGE]), cVers = juger('oracle-sca.mjs', depot, [FIGE, '--versionne']);
      const cEnv = juger('oracle-sca.mjs', depot, [FIGE], { QO_PERIMETRE: 'versionne' });
      !cDisque || cDisque.verdict !== 'FAIL' || !accuse(cDisque, 'genere/requirements.txt') ? ko(`TF-1729 sca, défaut inchangé : sans --versionne, le manifeste ignoré doit rester lu (FAIL sur genere/requirements.txt), verdict ${cDisque && cDisque.verdict}`)
        : ok('TF-1729 sca, défaut inchangé : sans --versionne, le manifeste ignoré est lu et requests==2.19.0 fait échouer (FAIL)');
      !cVers || cVers.verdict !== 'PASS' || !nomme(cVers, 'genere/requirements.txt') ? ko(`TF-1729 sca, sens vert : avec --versionne, verdict ${cVers && cVers.verdict}, genere/requirements.txt nommé au non_juge : ${nomme(cVers, 'genere/requirements.txt')}`)
        : ok('TF-1729 sca, sens vert : avec --versionne, le manifeste ignoré par git n\'est pas lu (PASS) et il est nommé au non_juge');
      !cEnv || cEnv.verdict !== 'PASS' || !nomme(cEnv, 'genere/requirements.txt') ? ko(`TF-1729 sca, voie de run-oracles : sous QO_PERIMETRE=versionne, verdict ${cEnv && cEnv.verdict}`)
        : ok('TF-1729 sca, voie de run-oracles : QO_PERIMETRE=versionne borne la lecture des manifestes comme --versionne (PASS)');
      // Sens rouge : un fichier NEUF que le .gitignore ne couvre pas reste jugé.
      fs.mkdirSync(path.join(depot, 'outils'));
      fs.writeFileSync(path.join(depot, 'neuf.py'), appel);
      fs.writeFileSync(path.join(depot, 'outils', 'requirements.txt'), 'requests==2.19.0\n');
      const sNeuf = juger('oracle-sast.mjs', depot, ['--versionne']), cNeuf = juger('oracle-sca.mjs', depot, [FIGE, '--versionne']);
      !sNeuf || sNeuf.verdict !== 'FAIL' || !accuse(sNeuf, 'neuf.py') || accuse(sNeuf, 'genere/') ? ko(`TF-1729 sast, sens rouge : sous --versionne, un fichier neuf non ignoré doit rester jugé et seul lui accusé, verdict ${sNeuf && sNeuf.verdict}`)
        : ok('TF-1729 sast, sens rouge : sous --versionne, un fichier neuf non ignoré est jugé (FAIL sur neuf.py), le code ignoré reste hors du verdict');
      !cNeuf || cNeuf.verdict !== 'FAIL' || !accuse(cNeuf, 'outils/requirements.txt') || accuse(cNeuf, 'genere/') ? ko(`TF-1729 sca, sens rouge : sous --versionne, un manifeste neuf non ignoré doit rester lu et seul lui accusé, verdict ${cNeuf && cNeuf.verdict}`)
        : ok('TF-1729 sca, sens rouge : sous --versionne, un manifeste neuf non ignoré est lu (FAIL sur outils/requirements.txt), le manifeste ignoré reste hors du verdict');
      // Hors dépôt git : l'option ne fait taire personne.
      const horsGit = path.join(tmp, 'hors-git');
      fs.mkdirSync(horsGit);
      fs.writeFileSync(path.join(horsGit, 'outil.py'), appel);
      fs.writeFileSync(path.join(horsGit, 'requirements.txt'), 'requests==2.19.0\n');
      const sHg = juger('oracle-sast.mjs', horsGit, ['--versionne']), cHg = juger('oracle-sca.mjs', horsGit, [FIGE, '--versionne']);
      const repli = j => !!j && j.verdict === 'FAIL' && j.non_juge.some(x => /DISQUE entier est jugé/.test(x));
      !repli(sHg) || !repli(cHg) ? ko(`TF-1729 hors dépôt git : --versionne doit juger le disque entier et le dire, sast ${sHg && sHg.verdict}, sca ${cHg && cHg.verdict}`)
        : ok('TF-1729 hors dépôt git : sous --versionne, oracle-sast et oracle-sca jugent le disque entier (FAIL) et le disent au non_juge');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
}

// TF-1730 (15/10/2026, constat de TF-1705) — UNE REQUÊTE CONSTRUITE PAR .format() EST UNE INJECTION.
// La paire du manifest prouve le verdict ; ce cas prouve la LIGNE et la RÈGLE intégrée, sans bandit
// ni semgrep (leurs constats sont écartés du compte) : dans la rouge, les trois `.format()` (lignes 7,
// 11, 15) et les deux f-strings que la règle d'origine manquait (triples guillemets ligne 19, préfixe
// rf ligne 23) sont accusés ; dans la verte, aucune requête paramétrée ni le `.format()` d'un message
// de journal ne l'est.
{
  const lignes = (fixture) => {
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-sast.mjs'), path.join(SKILLDIR, 'fixtures', fixture)], { encoding: 'utf8', timeout: 300000 });
    let j = null; try { j = JSON.parse(r.stdout); } catch { return null; }
    return j.findings.filter(f => /^injection SQL : (chaîne formatée par \.format\(\)|f-string) dans execute\(\)$/.test(f.msg)).map(f => Number(String(f.where).split(':').pop())).sort((a, b) => a - b).join(',');
  };
  const rouge = lignes('sast-sql-format-red.py'), vert = lignes('sast-sql-format-green.py');
  rouge !== '7,11,15,19,23' ? ko(`TF-1730 sens rouge : lignes accusées « ${rouge} », attendu 7,11,15,19,23 — une requête construite par .format() ou par une f-string doit être accusée par la règle intégrée`)
    : ok('TF-1730 sens rouge : les trois requêtes construites par .format() (lignes 7, 11, 15) et les f-strings à triples guillemets ou préfixe rf (lignes 19, 23) sont accusées par la règle intégrée');
  vert !== '' ? ko(`TF-1730 sens vert : lignes accusées « ${vert} » sur des requêtes paramétrées ou un .format() hors d'execute()`)
    : ok('TF-1730 sens vert : aucune requête paramétrée, ni le .format() d\'un message de journal, n\'est accusée');
}

// TF-1727 (15/10/2026) — LE DOMAINE « SORTIE AUTOMATISÉE DE TRI, DE CLASSEMENT OU DE RÉDACTION » (R-63
// du pilot, PC-1 à PC-6) ET SON PREMIER ORACLE, PC-6 : oracle-compteurs-synthese recalcule les
// compteurs d'une synthèse depuis la table qu'ils résument. La paire du manifest prouve K2 et K3 ; ce
// cas prouve K1 (un compteur qui ne se recalcule pas est un échec, jamais un silence), le dénominateur
// nul, les SKIP motivés (aucune table, aucun compteur), la table JSON, et l'inscription au registre :
// le domaine y est, en invocation explicite (ext vide), sa checklist nomme PC-1 à PC-6.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-compteurs-'));
  const ORACLE = path.join(SKILLDIR, 'scripts', 'oracle-compteurs-synthese.mjs');
  const juger = (decl, table = null, nomTable = 'table.csv') => {
    const d = fs.mkdtempSync(path.join(tmp, 'cas-'));
    if (table !== null) fs.writeFileSync(path.join(d, nomTable), table);
    fs.writeFileSync(path.join(d, 'decl.json'), JSON.stringify(decl));
    const r = spawnSync(process.execPath, [ORACLE, path.join(d, 'decl.json')], { encoding: 'utf8', timeout: 60000 });
    try { return { exit: r.status, ...JSON.parse(r.stdout) }; } catch { return { exit: r.status }; }
  };
  const csv = 'fichier;statut\na.pdf;range\nb.pdf;range\nc.pdf;a_dater\n';
  const regles = j => (j.findings || []).filter(f => f.sev === 'bloquant').map(f => f.regle).join(',');
  try {
    const k1 = juger({ table: 'table.csv', compteurs: [{ id: 'n', valeur: 2, quand: { dossier: 'Baux' } }, { id: 'p', valeur: 50, part: { de: 'n', sur: 'absent' } }, { id: 'v', valeur: '2' }] }, csv);
    k1.verdict !== 'FAIL' || regles(k1) !== 'K1,K1,K1' ? ko(`TF-1727 K1 : colonne absente, part sans compteur, valeur non numérique — attendu FAIL K1×3, obtenu ${k1.verdict} ${regles(k1)}`)
      : ok('TF-1727 K1 : une colonne absente de la table, une part qui nomme un compteur inconnu et une valeur non numérique échouent, nommés (FAIL K1×3)');
    const k3 = juger({ table: 'table.csv', compteurs: [{ id: 'vide', valeur: 0, quand: { statut: 'inconnu' } }, { id: 'n', valeur: 2, quand: { statut: 'range' } }, { id: 'p', valeur: 0, part: { de: 'n', sur: 'vide' } }] }, csv);
    k3.verdict !== 'FAIL' || regles(k3) !== 'K3' || !/dénominateur nul/.test(JSON.stringify(k3.findings)) ? ko(`TF-1727 K3 : une part sur un dénominateur nul doit échouer, obtenu ${k3.verdict} ${regles(k3)}`)
      : ok('TF-1727 K3 : une part affichée sur un dénominateur nul échoue (FAIL), le compte nul lui-même passe');
    const json = juger({ table: 'table.json', compteurs: [{ id: 't', valeur: 3 }, { id: 'r', valeur: 2, quand: { statut: 'range' } }, { id: 'p', valeur: 66.67, part: { de: 'r', sur: 't' }, decimales: 2 }] },
      JSON.stringify([{ statut: 'range' }, { statut: 'range' }, { statut: 'a_dater' }]), 'table.json');
    json.verdict !== 'PASS' ? ko(`TF-1727 table JSON : 3 compteurs justes, part à 2 décimales — attendu PASS, obtenu ${json.verdict} ${JSON.stringify(json.findings)}`)
      : ok('TF-1727 table JSON : un tableau d\'objets se lit comme une table, une part à 2 décimales se recalcule (PASS)');
    const sansTable = juger({ table: 'table.csv', compteurs: [{ id: 't', valeur: 3 }] });
    const sansCompteur = juger({ table: 'table.csv', compteurs: [] }, csv);
    sansTable.verdict !== 'SKIP' || sansTable.exit !== 2 || !sansTable.motif || sansCompteur.verdict !== 'SKIP' || !sansCompteur.motif
      ? ko(`TF-1727 SKIP : table absente → ${sansTable.verdict} (motif ${sansTable.motif}), aucun compteur → ${sansCompteur.verdict} — attendu deux SKIP motivés`)
      : ok('TF-1727 SKIP : une table illisible et une déclaration sans compteur rendent SKIP motivé (exit 2), jamais PASS');
    const reg = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'references', 'registre-oracles.json'), 'utf8'));
    const e = reg.oracles.find(o => o.domaine === 'Sortie automatisée de tri, de classement ou de rédaction');
    !e || (e.ext || []).length || (e.trigger_files || []).length || !['PC-1', 'PC-2', 'PC-3', 'PC-4', 'PC-5', 'PC-6'].every(p => e.checklist.includes(p)) || !e.non_juge.some(x => /PC-1 à PC-5/.test(x))
      ? ko('TF-1727 registre : le domaine doit y être en invocation explicite (ext vide, aucun déclencheur), sa checklist nommer PC-1 à PC-6 et son non_juge dire PC-1 à PC-5')
      : ok('TF-1727 registre : le domaine est inscrit en invocation explicite, PC-1 à PC-6 nommés, PC-1 à PC-5 déclarés non jugés');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-2196 (06/11/2026) — oracle-filtres-tableau JUGE L'UTILITÉ DES VALEURS, pas seulement la présence du composant.
// Le manifest tient la paire (rouge : FAIL + G12 + G13 ; verte : PASS). Ce bloc tient ce que le manifest ne
// peut pas dire : (1) la verte ne porte AUCUN constat (les gestes des messages, joués, suffisent) ; (2) G13
// est un AVERTISSEMENT : la même page avec la seule clé unique non déclarée reste PASS et porte G13, rendu
// `sev: warn` pour que le niveau « production » le promeuve ; (3) la moitié de seuil de G12 : une colonne
// dont une cellule sur quatre seulement est composite n'est pas refusée.
{
  const FILTRES = path.join(SKILLDIR, 'scripts', 'oracle-filtres-tableau.mjs');
  const jouer = (html) => {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2196-'));
    try {
      const f = path.join(t, 'page.html');
      fs.writeFileSync(f, html);   // l'asset relatif de la fixture, introuvable ici, n'est qu'un non_juge de G3/G6 : le marquage seul est jugé
      const r = spawnSync(process.execPath, [FILTRES, f], { encoding: 'utf8', timeout: 60000 });
      try { return JSON.parse(r.stdout); } catch { return null; }
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
  };
  const verte = fs.readFileSync(path.join(SKILLDIR, 'fixtures', 'filtres-composite-verte.html'), 'utf8');
  const v = jouer(verte);
  !v || v.verdict !== 'PASS' || v.findings.length ? ko('TF-2196 verte : verdict ' + (v && v.verdict) + ', ' + (v && v.findings.length) + ' constat(s) — les gestes des messages doivent suffire, sans aucun constat')
    : ok('TF-2196 verte : data-tf-valeur sur les cellules composites et la clé déclarée hors facette → PASS, aucun constat');
  const cleNue = jouer(verte.replace(/<th data-filter-col="off" data-filter-reason="[^"]*">/, '<th>'));
  const g13 = cleNue && cleNue.findings.filter(f => f.regle === 'G13');
  !cleNue || cleNue.verdict !== 'PASS' || g13.length !== 1 || g13[0].sev !== 'warn' || g13[0].severite !== 'avertissement'
    ? ko('TF-2196 G13 : une clé unique de 8 lignes doit rendre PASS avec un seul G13 en avertissement (sev warn), obtenu ' + (cleNue && cleNue.verdict) + ' ' + JSON.stringify(g13))
    : ok('TF-2196 G13 : une clé unique de 8 lignes avertit sans refuser (PASS, sev warn), et la retirer de la verte fait réapparaître l\'avertissement');
  const quart = jouer(verte.replace(/ data-tf-valeur="Agent C"/g, ''));
  const majorite = jouer(verte.replace(/ data-tf-valeur="Agent [AB]"/g, ''));
  const g12q = quart && quart.findings.filter(f => f.regle === 'G12');
  const g12m = majorite && majorite.findings.filter(f => f.regle === 'G12');
  !quart || quart.verdict !== 'PASS' || g12q.length !== 0 || !majorite || majorite.verdict !== 'FAIL' || g12m.length !== 1
    ? ko('TF-2196 G12 : 2 cellules composites sur 8 sans valeur déclarée doivent passer, 6 sur 8 être refusées — obtenu ' + (quart && quart.verdict) + ' / ' + (majorite && majorite.verdict) + ' ' + JSON.stringify(g12m))
    : ok('TF-2196 G12 : la moitié de la colonne est le seuil — 2 cellules composites sur 8 sans valeur déclarée passent, 6 sur 8 sont refusées (FAIL)');
}

// TF-2296 (14/11/2026) — oracle-filtres-tableau lit une liste d'exceptions PAR CHEMIN pour une page SCELLÉE.
// Le fait (09/11) : la maquette remise le 15/08 garde G12 en FAIL sur « Gain /5 » (7 cellules composites sur 10), et sa
// seule sortie, data-filterable="off", modifie la page donc rompt son sceau. Les deux sens, sur la fixture rouge de
// TF-2196 posée sous un chemin propre : (rouge) sans entrée le refus reste, une entrée pour un autre chemin, pour une
// fin de nom, pour une autre règle, ou à qui manque la date, le motif ou les règles, ne retient rien ; (vert) l'entrée
// du chemin, datée et motivée, retient G12 et le DIT au non_juge ; une entrée qui ne retient plus rien se dit périmée ;
// une liste illisible ne conclut pas. Puis la liste livrée, sur la vraie maquette quand le pilot la porte.
{
  const FILTRES = path.join(SKILLDIR, 'scripts', 'oracle-filtres-tableau.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2296-'));
  try {
    fs.mkdirSync(path.join(tmp, 'pages'));
    const page = path.join(tmp, 'pages', 'maquette-scellee.html');
    fs.writeFileSync(page, fs.readFileSync(path.join(SKILLDIR, 'fixtures', 'filtres-composite-rouge.html'), 'utf8'));
    const pageVerte = path.join(tmp, 'pages', 'maquette-verte.html');
    fs.writeFileSync(pageVerte, fs.readFileSync(path.join(SKILLDIR, 'fixtures', 'filtres-composite-verte.html'), 'utf8'));
    let n = 0;
    const jouer = (fichier, liste) => {
      const f = path.join(tmp, 'liste-' + (++n) + '.json');
      fs.writeFileSync(f, typeof liste === 'string' ? liste : JSON.stringify({ exceptions: liste }));
      const r = spawnSync(process.execPath, [FILTRES, fichier, '--exceptions', f], { encoding: 'utf8', timeout: 60000 });
      let j = null; try { j = JSON.parse(r.stdout); } catch { /* sortie illisible : verdict inconnu */ }
      return { j, code: r.status };
    };
    const entree = (s = {}) => ({ chemin: 'pages/maquette-scellee.html', regles: ['G12'], date: '2026-11-14', motif: 'page scellée du 15/08, rangée à old/', ...s });
    const g12 = (r) => (r.j ? r.j.findings.filter(f => f.regle === 'G12').length : -1);
    const sans = jouer(page, []);
    const base = g12(sans);
    !sans.j || sans.j.verdict !== 'FAIL' || sans.code !== 1 || base < 1
      ? ko('TF-2296 rouge : sans entrée pour son chemin, la page composite doit rester en FAIL (exit 1) avec G12 — obtenu ' + (sans.j && sans.j.verdict) + ' exit ' + sans.code + ', G12 ×' + base)
      : ok('TF-2296 rouge : sans entrée pour son chemin la page garde son refus (FAIL, exit 1, G12 ×' + base + ')');
    const avec = jouer(page, [entree()]);
    const dit = avec.j && avec.j.non_juge.find(x => /^Exception du 2026-11-14 sur pages\/maquette-scellee\.html \(G12\) — motif : page scellée du 15\/08, rangée à old\/ — \d+ constat\(s\) non retenu\(s\) : G12 \(/.test(x));
    !avec.j || avec.j.verdict !== 'PASS' || avec.code !== 0 || g12(avec) !== 0 || !dit
      ? ko('TF-2296 vert : l\'entrée du chemin (G12, datée, motivée) doit retenir G12 (PASS, exit 0) et le dire au non_juge — obtenu ' + (avec.j && avec.j.verdict) + ' exit ' + avec.code + ', G12 ×' + g12(avec) + ', ligne dite : ' + Boolean(dit))
      : ok('TF-2296 vert : l\'entrée du chemin retient G12 (PASS, exit 0) et le dit au non_juge, avec sa date et son motif');
    const autres = [
      ['un autre chemin', entree({ chemin: 'pages/autre.html' })],
      ['une fin de nom qui ne tombe pas sur une frontière de dossier', entree({ chemin: 'ette-scellee.html' })],
      ['une autre règle que G12', entree({ regles: ['G11'] })],
    ];
    const retenus = autres.filter(([, e]) => { const r = jouer(page, [e]); return !r.j || r.j.verdict !== 'FAIL' || g12(r) !== base; });
    retenus.length
      ? ko('TF-2296 rouge : une entrée qui ne vise pas ce chemin et cette règle ne doit rien retenir — retenu à tort : ' + retenus.map(([nom]) => nom).join(' ; '))
      : ok('TF-2296 rouge : une entrée pour un autre chemin, pour une fin de nom ou pour une autre règle ne retient rien (G12 reste, FAIL)');
    const incompletes = [
      ['sans motif', entree({ motif: '' })], ['sans date', entree({ date: undefined })],
      ['avec une date mal formée', entree({ date: '14/11/2026' })], ['sans règles', entree({ regles: [] })],
      ['avec une règle qui n\'est pas G<n>', entree({ regles: ['G12', 'tout'] })],
    ];
    const appliquees = incompletes.filter(([, e]) => { const r = jouer(page, [e]); return !r.j || r.j.verdict !== 'FAIL' || g12(r) !== base || !r.j.findings.some(f => f.regle === 'EX' && f.severite === 'bloquant'); });
    appliquees.length
      ? ko('TF-2296 rouge : une entrée incomplète est refusée (constat EX bloquant) et ne retient rien — appliquée ou muette à tort : ' + appliquees.map(([nom]) => nom).join(' ; '))
      : ok('TF-2296 rouge : une entrée sans motif, sans date (ou mal formée), sans règles (ou hors G<n>) est refusée (EX bloquant) et ne retient rien');
    const perimee = jouer(pageVerte, [entree({ chemin: 'pages/maquette-verte.html' })]);
    !perimee.j || perimee.j.verdict !== 'PASS' || !perimee.j.non_juge.some(x => /aucun constat a ne pas retenir — l'entree est perimee/.test(x))
      ? ko('TF-2296 : une entrée qui ne retient plus rien doit se dire périmée au non_juge — obtenu ' + (perimee.j && perimee.j.verdict) + ' ' + JSON.stringify(perimee.j && perimee.j.non_juge.filter(x => /^Exception/.test(x))))
      : ok('TF-2296 : une entrée qui ne retient plus rien (page corrigée) le dit au non_juge — elle se retire, elle ne reste pas muette');
    const cassee = jouer(page, '{"exceptions": [');
    !cassee.j || cassee.j.verdict !== 'INCONCLUSIF' || cassee.code !== 2
      ? ko('TF-2296 : une liste illisible ne doit pas conclure (INCONCLUSIF, exit 2) — obtenu ' + (cassee.j && cassee.j.verdict) + ' exit ' + cassee.code)
      : ok('TF-2296 : une liste d\'exceptions illisible ne conclut pas (INCONCLUSIF, exit 2), elle ne se lit pas comme une liste vide');
    // La liste livrée : chaque entrée complète, et la vraie maquette du cas fondateur quand le pilot la porte.
    const livree = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'references', 'exceptions-filtres-tableau.json'), 'utf8'));
    const mal = (livree.exceptions || []).filter(e => !(e.chemin && Array.isArray(e.regles) && e.regles.length && e.regles.every(r => /^G\d+$/.test(r)) && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && String(e.motif || '').trim()));
    !Array.isArray(livree.exceptions) || mal.length
      ? ko('TF-2296 : la liste livrée references/exceptions-filtres-tableau.json doit porter un tableau « exceptions » d\'entrées complètes — entrées incomplètes : ' + mal.length)
      : ok('TF-2296 : la liste livrée porte ' + livree.exceptions.length + ' entrée(s), chacune avec chemin, règles, date et motif');
    const maquette = PILOT && path.join(PILOT, 'output', '01-revues-et-propositions', 'old', 'Produit-02 - Maquette Vue d\'ensemble - Rapport SEO - 20260815a.html');
    if (!maquette || !fs.existsSync(maquette)) ok('TF-2296 : NON JOUÉ — la maquette scellée du 15/08 n\'est pas lisible depuis ce poste (' + (PILOT ? 'absente du pilot' : motifPilotAbsent(SKILLDIR)) + '), et c\'est dit');
    else {
      const livreeSurMaquette = spawnSync(process.execPath, [FILTRES, maquette], { encoding: 'utf8', timeout: 60000 });
      let lj = null; try { lj = JSON.parse(livreeSurMaquette.stdout); } catch { /* illisible */ }
      const sansListe = jouer(maquette, []);
      !lj || lj.verdict !== 'PASS' || lj.findings.some(f => f.regle === 'G12') || !sansListe.j || sansListe.j.verdict !== 'FAIL' || !sansListe.j.findings.some(f => f.regle === 'G12')
        ? ko('TF-2296 : la maquette scellée du 15/08 doit passer avec la liste livrée (G12 retenu) et rester en FAIL (G12) sans entrée — obtenu ' + (lj && lj.verdict) + ' / ' + (sansListe.j && sansListe.j.verdict))
        : ok('TF-2296 : la maquette scellée du 15/08 (G12 sur « Gain /5 ») passe avec la liste livrée, sans toucher la page, et reste en FAIL sans entrée');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// LOT DU 10/11/2026 (retours du produit marketing des 09/11 b et c, et d'un produit de la chaîne de dev) — OUTILS DE
// DIAPOSITIVES ET DE RENDU DE quality-oracles. Chaque bloc rejoue le défaut dans les deux sens ; les paires de decks vivent
// au manifest (a11y-transition, charte-pptx-pastille-numerotee, charte-pptx-gabarit-b, charte-pptx-entites-xml,
// charte-pptx-kicker-couverture, charte-pptx-marque, pptx-profil-digit-ai), ce qui suit prouve ce que le manifest ne montre pas.

// TF-2313 — l'oracle d'accessibilité juge la page REPOSÉE : il attend les animations et transitions finies (5 s au plus),
// n'attend pas une animation sans fin, et dit une page qui ne se pose pas.
{
  const py = resolvePython();
  const FX = path.join(SKILLDIR, 'fixtures');
  const jouer = (html) => {
    const r = spawnSync(py[0], [...py.slice(1), path.join(SKILLDIR, 'scripts', 'oracle-a11y.py'), html], { encoding: 'utf8', timeout: 180000, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    try { return JSON.parse(r.stdout); } catch { return { verdict: '?', findings: [], non_juge: [(r.stderr || '').slice(0, 160)] }; }
  };
  const v = py ? jouer(path.join(FX, 'a11y-transition-green.html')) : null;
  if (!py) ok('TF-2313 : NON JOUÉ — python indisponible sur ce poste, et c est dit');
  else if (v.verdict === 'SKIP') ok('TF-2313 : NON JOUÉ — Playwright/Chromium indisponible sur ce poste (' + (v.motif || '').slice(0, 60) + ') : la page à transition ne peut pas se juger ici, et c est dit');
  else {
    const info = (v.findings || []).find((f) => /^repos de la page : /.test(f.msg));
    if (v.verdict !== 'PASS') ko('TF-2313 (A) : la page dont le bouton reçoit son libellé à la fin du fondu rend ' + v.verdict + ' — l oracle l a jugée avant la fin de la transition');
    else if (!info || !/ 1 animation\(s\) ou transition\(s\) finie\(s\) attendue\(s\)/.test(info.msg) || !/1 animation\(s\) sans fin ignoree\(s\)/.test(info.msg))
      ko('TF-2313 (A) : le repos de la page ne se dit pas comme attendu (1 transition attendue, 1 animation sans fin ignorée) — ' + (info ? info.msg : 'aucun constat de repos'));
    else ok('TF-2313 (A) : la page à fondu de 1,2 s est jugée REPOSÉE (PASS) ; le fondu est attendu, le spinner sans fin est ignoré, et les deux se disent');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2313-'));
    try {
      const longue = path.join(tmp, 'longue.html');
      fs.writeFileSync(longue, '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Animation longue</title><style>.x{width:10px;height:10px;background:#036;animation:a 9s linear 1}@keyframes a{to{transform:translateX(40px)}}</style></head><body><h1>Titre</h1><div class="x"></div></body></html>', 'utf8');
      const l = jouer(longue);
      const dit = (l.non_juge || []).some((x) => /^repos de la page NON atteint apres 5 s : 1 animation\(s\) finie\(s\) encore en cours/.test(x));
      const ms = Number(((l.findings || []).find((f) => /^repos de la page/.test(f.msg)) || { msg: '' }).msg.replace(/^.*\((\d+) ms\).*$/, '$1'));
      if (l.verdict === 'SKIP') ok('TF-2313 (B) : NON JOUÉ — Playwright/Chromium indisponible');
      else if (l.verdict !== 'PASS' || !dit || !(ms >= 4500 && ms <= 7500)) ko(`TF-2313 (B) : une animation finie de 9 s doit être attendue 5 s au plus (${ms} ms), la page jugée en l état et le dit — verdict ${l.verdict}, mention ${dit ? 'présente' : 'absente'}`);
      else ok(`TF-2313 (B) : une animation finie de 9 s est attendue ${ms} ms (5 s au plus), la page est jugée en l état, et le non_juge le dit`);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
}

// TF-2363 — oracle-visual-diff range références et historique sous le .oracles/ commun aux journaux, au-dessus du segment
// de livraison, comme le veut TF-0501 ; hors livraison rien ne change ; des références d'avant restent lues, et le disent.
{
  const py = resolvePython();
  const FX = path.join(SKILLDIR, 'fixtures');
  const O = path.join(SKILLDIR, 'scripts', 'oracle-visual-diff.py');
  const profil = path.join(SKILLDIR, 'profils', 'digit-ai.json');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2363-'));
  const lancer = (page, ...extra) => {
    const r = spawnSync(py[0], [...py.slice(1), O, page, '--profil', profil, ...extra], { encoding: 'utf8', timeout: 240000, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    try { return JSON.parse(r.stdout); } catch { return { verdict: '?', findings: [], non_juge: [(r.stderr || '').slice(0, 160)] }; }
  };
  const tracesDans = (dossier) => { const trouves = []; const parcourir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (/^\.oracles|\.oracles-/.test(e.name)) trouves.push(path.join(d, e.name)); if (e.isDirectory()) parcourir(path.join(d, e.name)); } }; if (fs.existsSync(dossier)) parcourir(dossier); return trouves; };
  try {
    const livraison = path.join(tmp, 'produit', 'output', 'rapport');
    fs.mkdirSync(livraison, { recursive: true });
    const page = path.join(livraison, 'page.html');
    fs.copyFileSync(path.join(FX, 'visual-green.html'), page);
    const acceptee = py ? lancer(page, '--accepter') : null;
    if (!py) ok('TF-2363 : NON JOUÉ — python indisponible sur ce poste, et c est dit');
    else if (acceptee.verdict === 'SKIP') ok('TF-2363 : NON JOUÉ — Playwright, Chromium ou Pillow indisponible (' + (acceptee.motif || '').slice(0, 60) + ') : la régression visuelle ne se joue pas ici, et c est dit');
    else {
      const sous = path.join(tmp, 'produit', '.oracles', 'output', 'rapport');
      const attendus = [path.join(sous, '.oracles-goldens', 'page.html-w1280.png'), path.join(sous, '.oracles-goldens', 'page.html-w380.png'), path.join(sous, 'page.html.oracles-historique.jsonl')];
      const manque = attendus.filter((f) => !fs.existsSync(f));
      const dansLivraison = tracesDans(path.join(tmp, 'produit', 'output'));
      if (acceptee.verdict !== 'PASS' || manque.length) ko(`TF-2363 (A) : --accepter sous output/ doit ranger références et historique sous .oracles/ — verdict ${acceptee.verdict}, absents : ${manque.map((f) => path.relative(tmp, f)).join(' · ')}`);
      else if (dansLivraison.length) ko('TF-2363 (A) : des traces d audit sont restées dans le dossier livré : ' + dansLivraison.map((f) => path.relative(tmp, f)).join(' · '));
      else ok('TF-2363 (A) : sous output/, --accepter range les références et l historique sous <racine>/.oracles/output/rapport/ et ne laisse aucune trace dans le dossier livré');
      const juge = lancer(page);
      const conforme = (juge.findings || []).filter((f) => /conforme au golden/.test(f.msg)).length;
      if (juge.verdict !== 'PASS' || conforme !== 2) ko(`TF-2363 (B) : la page inchangée doit passer sur les deux largeurs — ${juge.verdict}, ${conforme} largeur(s) conforme(s)`);
      else ok('TF-2363 (B) : la page inchangée est jugée contre les références rangées sous .oracles/ (PASS, 2 largeurs)');
      fs.copyFileSync(path.join(FX, 'visual-red.html'), page);
      const regresse = lancer(page);
      const dossierGoldens = path.join(tmp, 'produit', '.oracles', 'output', 'rapport', '.oracles-goldens');
      const diffs = fs.existsSync(dossierGoldens) ? fs.readdirSync(dossierGoldens).filter((f) => /-diff\.png$/.test(f)).length : 0;
      const encoreDedans = tracesDans(path.join(tmp, 'produit', 'output'));
      if (regresse.verdict !== 'FAIL' || !diffs || encoreDedans.length) ko(`TF-2363 (C) : la page modifiée doit échouer avec son image de différence sous .oracles/ — ${regresse.verdict}, ${diffs} image(s) de différence, ${encoreDedans.length} trace(s) dans le dossier livré`);
      else ok('TF-2363 (C) : la page modifiée échoue (FAIL), son image de différence est rangée sous .oracles/, rien dans le dossier livré');
      // (D) — des références restées dans le dossier livré (avant TF-2363) sont lues, et le disent ; plus rien n'y est écrit.
      const ancien = path.join(tmp, 'ancien', 'output', 'r');
      fs.mkdirSync(path.join(ancien, '.oracles-goldens'), { recursive: true });
      fs.copyFileSync(path.join(FX, 'visual-green.html'), path.join(ancien, 'page.html'));
      for (const w of [1280, 380]) fs.copyFileSync(path.join(FX, '.oracles-goldens', `visual-green.html-w${w}.png`), path.join(ancien, '.oracles-goldens', `page.html-w${w}.png`));
      const avant = tracesDans(path.join(tmp, 'ancien', 'output')).length;
      const lu = lancer(path.join(ancien, 'page.html'));
      const dit = (lu.non_juge || []).some((x) => /références lues à l'ancien emplacement/.test(x));
      const apres = tracesDans(path.join(tmp, 'ancien', 'output')).length;
      if (lu.verdict !== 'PASS' || !dit || apres !== avant) ko(`TF-2363 (D) : des références d avant doivent être lues et dites sans rien écrire dans le dossier livré — ${lu.verdict}, mention ${dit ? 'présente' : 'absente'}, traces ${avant} → ${apres}`);
      else ok('TF-2363 (D) : des références restées dans le dossier livré sont encore lues (PASS), le non_juge le dit, et rien n y est écrit');
      // (E) — hors livraison, l'emplacement d'avant ne change pas.
      const src = path.join(tmp, 'src');
      fs.mkdirSync(src, { recursive: true });
      fs.copyFileSync(path.join(FX, 'visual-green.html'), path.join(src, 'page.html'));
      lancer(path.join(src, 'page.html'), '--accepter');
      if (!fs.existsSync(path.join(src, '.oracles-goldens', 'page.html-w1280.png')) || fs.existsSync(path.join(src, '.oracles')))
        ko('TF-2363 (E) : hors arbre de livraison, les références doivent rester à côté du fichier, sans .oracles/');
      else ok('TF-2363 (E) : hors arbre de livraison, les références restent à côté du fichier, comme avant');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-2327 — run-oracles : l'option --json (le journal en JSON sur la sortie standard, rien d'autre) se découvre à l'usage,
// par --help, et par le rappel qu'une sortie texte redirigée reçoit sur la sortie d'erreur.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2327-'));
  try {
    const R = path.join(SKILLDIR, 'scripts', 'run-oracles.mjs');
    const cible = path.join(tmp, 'note.md');
    fs.writeFileSync(cible, '# Note\n\nUn contenu stable, jugé tel quel.\n', 'utf8');
    const aide = spawnSync(process.execPath, [R, '--help'], { encoding: 'utf8', timeout: 60000 });
    const sans = spawnSync(process.execPath, [R], { encoding: 'utf8', timeout: 60000 });
    if (aide.status !== 0 || !/--json/.test(aide.stdout) || !/sortie standard/.test(aide.stdout))
      ko(`TF-2327 (A) : --help doit afficher l usage, option --json décrite, sur la sortie standard (code 0) — code ${aide.status}, ${(aide.stdout || '').slice(0, 80)}`);
    else if (sans.status !== 2 || !/--json/.test(sans.stderr)) ko('TF-2327 (A) : sans cible, l usage (sortie d erreur, code 2) doit décrire --json — code ' + sans.status);
    else ok('TF-2327 (A) : --help affiche l usage sur la sortie standard (code 0), --json décrit ; sans cible l usage reste sur la sortie d erreur (code 2)');
    const texte = spawnSync(process.execPath, [R, cible, '--no-cache'], { encoding: 'utf8', timeout: 180000 });
    const json = spawnSync(process.execPath, [R, cible, '--no-cache', '--json'], { encoding: 'utf8', timeout: 180000 });
    let journal = null, ecrit = null;
    try { journal = JSON.parse(json.stdout); ecrit = JSON.parse(fs.readFileSync(cible + '.oracles.json', 'utf8')); } catch { /* ko ci-dessous */ }
    if (!/--json/.test(texte.stderr)) ko('TF-2327 (B) : une sortie texte redirigée doit rappeler --json sur la sortie d erreur — stderr « ' + texte.stderr.trim().slice(0, 100) + ' »');
    else if (/--json/.test(json.stderr)) ko('TF-2327 (B) : avec --json le rappel ne doit pas être répété — stderr « ' + json.stderr.trim().slice(0, 100) + ' »');
    else if (/^[─\s]*Oracles qualité/.test(texte.stdout) === false) ko('TF-2327 (B) : la sortie standard texte a changé');
    else ok('TF-2327 (B) : une sortie texte redirigée rappelle --json sur la sortie d erreur (la sortie standard texte est inchangée) ; avec --json le rappel ne paraît pas');
    if (!journal || !ecrit || json.stdout.trim()[0] !== '{' || journal.verdict !== ecrit.verdict || journal.cible !== ecrit.cible || JSON.stringify(journal.resume) !== JSON.stringify(ecrit.resume) || JSON.stringify(journal.resultats) !== JSON.stringify(ecrit.resultats))
      ko('TF-2327 (C) : la sortie standard de --json doit être, seule, le journal écrit dans <cible>.oracles.json');
    else ok('TF-2327 (C) : avec --json la sortie standard est, seule, le journal de <cible>.oracles.json (verdict, cible, résumé et résultats identiques)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// TF-2325 — --profil accepte le NOM d'un profil (profils/<nom>.json) en plus de son chemin, pour oracle-nommage et pour
// oracle-charte-pptx-semantique ; le gabarit B (sommaire sans intercalaire) est jugé et le dit.
{
  const FX = path.join(SKILLDIR, 'fixtures');
  const jouer = (script, args) => {
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', script), ...args], { encoding: 'utf8', timeout: 120000 });
    try { return JSON.parse(r.stdout); } catch { return { verdict: '?', findings: [], non_juge: [(r.stderr || '').slice(0, 160)] }; }
  };
  const bon = 'Digit-AI - Note Client - Cadrage - 20260720a.md', mauvais = 'Digit-AI - Note_Client - 2026.md';
  const parNomOk = jouer('oracle-nommage.mjs', [path.join(FX, bon), '--profil', 'digit-ai']);
  const parNomKo = jouer('oracle-nommage.mjs', [path.join(FX, mauvais), '--profil', 'digit-ai']);
  const parChemin = jouer('oracle-nommage.mjs', [path.join(FX, mauvais), '--profil', path.join(SKILLDIR, 'profils', 'digit-ai.json')]);
  if (parNomOk.verdict !== 'PASS' || parNomKo.verdict !== 'FAIL' || parChemin.verdict !== 'FAIL')
    ko(`TF-2325 (A) : oracle-nommage --profil digit-ai (par le nom) doit juger comme par le chemin — nom conforme ${parNomOk.verdict} (attendu PASS), nom fautif ${parNomKo.verdict} (attendu FAIL), par le chemin ${parChemin.verdict}`);
  else ok('TF-2325 (A) : oracle-nommage --profil digit-ai juge par le nom comme par le chemin (nom conforme PASS, nom fautif FAIL), au lieu du SKIP « profil sans convention »');
  const charte = jouer('oracle-charte-pptx-semantique.mjs', [path.join(FX, 'charte-pptx-client-green.pptx'), '--profil', 'digit-ai']);
  const charteChemin = jouer('oracle-charte-pptx-semantique.mjs', [path.join(FX, 'charte-pptx-client-green.pptx'), '--profil', path.join(SKILLDIR, 'profils', 'digit-ai.json')]);
  if (charte.verdict !== 'FAIL' || JSON.stringify(charte.findings) !== JSON.stringify(charteChemin.findings))
    ko(`TF-2325 (B) : oracle-charte-pptx-semantique --profil digit-ai (par le nom) doit juger comme par le chemin — ${charte.verdict}, ${(charte.non_juge || [])[0] || ''}`);
  else ok('TF-2325 (B) : oracle-charte-pptx-semantique --profil digit-ai juge par le nom comme par le chemin (mêmes constats)');
  const gabarit = jouer('oracle-charte-pptx-semantique.mjs', [path.join(FX, 'charte-pptx-gabarit-b-green.pptx')]);
  const dit = (gabarit.non_juge || []).some((x) => /^S1 : aucun intercalaire dans ce deck — sommaire de la forme du gabarit B/.test(x) && /bijection sommaire ↔ intercalaires ne l'est pas/.test(x));
  const info = (gabarit.findings || []).some((f) => f.sev === 'info' && /S1 — forme du gabarit B, sans intercalaire/.test(f.msg));
  if (gabarit.verdict !== 'PASS' || !dit || !info) ko(`TF-2325 (C) : le sommaire du gabarit B passe et DIT que la bijection n est pas jugée — ${gabarit.verdict}, non_juge ${dit ? 'dit' : 'muet'}, conforme ${info ? 'dit' : 'muet'}`);
  else ok('TF-2325 (C) : le sommaire du gabarit B passe (PASS), et le non_juge comme le constat « conforme » disent que la bijection avec les intercalaires n est pas jugée');
  const kicker = jouer('oracle-charte-pptx-semantique.mjs', [path.join(FX, 'charte-pptx-kicker-green.pptx')]);
  if (kicker.verdict !== 'PASS' || !(kicker.non_juge || []).some((x) => /^S2 : le kicker de la couverture/.test(x)))
    ko('TF-2375 : le kicker de couverture est admis ET dit au non_juge — ' + kicker.verdict);
  else ok('TF-2375 : le kicker de couverture en capitales est admis (PASS) et dit au non_juge ; la rouge du manifest le refuse ailleurs');
}

// TF-2372 — le profil digit-ai.json déclare format, polices et palette des diapositives, et P1 à P3 disent quand elles ne se
// jouent pas faute de profil.
{
  const FX = path.join(SKILLDIR, 'fixtures');
  const prof = JSON.parse(fs.readFileSync(path.join(SKILLDIR, 'profils', 'digit-ai.json'), 'utf8'));
  const p = prof.pptx || {};
  const hex = (p.palette || []).every((c) => /^[0-9A-F]{6}$/.test(c)) && new Set(p.palette || []).size === (p.palette || []).length;
  if (p.format !== '16:9' || !Array.isArray(p.polices) || !['Montserrat', 'Inter'].every((f) => p.polices.includes(f)) || !(p.palette || []).length || !hex || !p.palette.includes('2563EB') || !p.palette.includes('FAFBFF') || !p.palette.includes('0F172A'))
    ko('TF-2372 (A) : le profil digit-ai doit déclarer pptx.format 16:9, pptx.polices (Montserrat, Inter) et pptx.palette (hexadécimaux distincts, dont 2563EB, FAFBFF, 0F172A) — obtenu ' + JSON.stringify({ format: p.format, polices: p.polices, palette: (p.palette || []).length }));
  else ok(`TF-2372 (A) : le profil digit-ai déclare le format ${p.format}, ${p.polices.length} polices et ${p.palette.length} couleurs de diapositives, dérivés des jetons de la marque`);
  const jouer = (args) => {
    const r = spawnSync(process.execPath, [path.join(SKILLDIR, 'scripts', 'oracle-pptx.mjs'), ...args], { encoding: 'utf8', timeout: 120000 });
    try { return JSON.parse(r.stdout); } catch { return { verdict: '?', findings: [], non_juge: [(r.stderr || '').slice(0, 160)] }; }
  };
  const sousDigit = jouer([path.join(FX, 'pptx-format-red.pptx'), '--profil', 'digit-ai']);
  const regles = new Set((sousDigit.findings || []).map((f) => f.regle).filter(Boolean));
  if (sousDigit.verdict !== 'FAIL' || !['P1', 'P2', 'P3'].every((r) => regles.has(r))) ko(`TF-2372 (B) : sous le profil digit-ai, le deck 4:3 à police et couleur étrangères doit échouer par P1, P2 et P3 — ${sousDigit.verdict} ${[...regles].join('+')}`);
  else ok('TF-2372 (B) : sous le profil digit-ai, le deck 4:3 à police et couleur étrangères échoue par P1, P2 et P3 (muettes avant)');
  const sansProfil = jouer([path.join(FX, 'pptx-green.pptx')]);
  const generique = jouer([path.join(FX, 'pptx-green.pptx'), '--profil', 'generique']);
  const dit = (j) => (j.non_juge || []).find((x) => /^P1, P2, P3 NON jouée\(s\) : /.test(x)) || '';
  if (sansProfil.verdict !== 'PASS' || !/aucun profil passé/.test(dit(sansProfil)) || generique.verdict !== 'PASS' || !/le profil « generique » ne déclare pas pptx\.format, pptx\.polices, pptx\.palette/.test(dit(generique)))
    ko(`TF-2372 (C) : P1 à P3 doivent dire qu elles ne sont pas jouées, sans profil (« aucun profil passé ») comme sous un profil qui ne déclare rien — sans ${dit(sansProfil) || 'muet'} ; generique ${dit(generique) || 'muet'}`);
  else ok('TF-2372 (C) : sans profil, comme sous un profil qui ne déclare ni format, ni polices, ni palette, P1 à P3 disent au non_juge qu elles ne sont pas jouées (le PASS ne dit plus « conforme » en silence)');
  const voisin = jouer([path.join(FX, 'pptx-format-green.pptx'), '--profil', path.join(FX, 'profil-pptx-format.json')]);
  if (voisin.verdict !== 'PASS' || (voisin.non_juge || []).some((x) => /NON jouée\(s\)/.test(x))) ko('TF-2372 (D) : un profil qui déclare les trois règles ne doit pas les dire non jouées — ' + voisin.verdict);
  else ok('TF-2372 (D) : un profil qui déclare format, polices et palette ne les dit pas non jouées');
}

// TF-2373 — S5 lit aussi le tableau « On dit / On ne dit pas » de la marque de l'émetteur : cherché en remontant depuis le deck
// (donnees/marque/MARQUE.md) ou donné par --marque ; absent, il est DIT ; un terme réservé n'est qu'un avertissement.
{
  const FX = path.join(SKILLDIR, 'fixtures');
  const O = path.join(SKILLDIR, 'scripts', 'oracle-charte-pptx-semantique.mjs');
  const jouer = (args) => { const r = spawnSync(process.execPath, [O, ...args], { encoding: 'utf8', timeout: 120000 }); try { return JSON.parse(r.stdout); } catch { return { verdict: '?', findings: [], non_juge: [(r.stderr || '').slice(0, 160)] }; } };
  const rouge = path.join(FX, 'charte-pptx-marque-red', 'deck.pptx'), marque = path.join(FX, 'charte-pptx-marque-red', 'donnees', 'marque', 'MARQUE.md');
  const montee = jouer([rouge]);
  const bloquants = (montee.findings || []).filter((f) => f.sev === 'bloquant' && /^S5 /.test(f.msg));
  const avert = (montee.findings || []).filter((f) => f.sev === 'avertissement' && /^S5 /.test(f.msg));
  if (montee.verdict !== 'FAIL' || bloquants.length !== 1 || avert.length !== 1) ko(`TF-2373 (A) : « limite » et « phase » bloquent (un constat), « risque » (réservé à une proposition) avertit (un constat) — ${montee.verdict}, ${bloquants.length} bloquant(s), ${avert.length} avertissement(s)`);
  else ok('TF-2373 (A) : la marque cherchée en remontant depuis le deck proscrit « limite » (3 emplois, notes comprises) et « phase » (bloquant), et n avertit que pour « risque » (réservé à une proposition)');
  const copie = fs.mkdtempSync(path.join(os.tmpdir(), 'qo-2373-'));
  try {
    const deck = path.join(copie, 'deck.pptx');
    fs.copyFileSync(rouge, deck);
    const sans = jouer([deck]);
    const nonJouee = (sans.non_juge || []).some((x) => /^S5 \(marque\) NON jouée : aucun donnees\/marque\/MARQUE\.md en remontant depuis le deck/.test(x));
    const donne = jouer([deck, '--marque', marque]);
    const absent = jouer([deck, '--marque', path.join(copie, 'inexistant.md')]);
    const dit = (absent.non_juge || []).some((x) => /^S5 \(marque\) NON jouée : --marque .*introuvable/.test(x));
    if (sans.verdict !== 'PASS' || !nonJouee) ko(`TF-2373 (B) : sans dossier de marque, S5 (marque) doit se dire NON jouée sans refuser le deck — ${sans.verdict}, mention ${nonJouee ? 'dite' : 'absente'}`);
    else if (donne.verdict !== 'FAIL' || !(donne.findings || []).some((f) => /« limite » \(3\) → « point de vigilance »/.test(f.msg))) ko('TF-2373 (B) : --marque <MARQUE.md> doit désigner la marque quand elle ne se trouve pas au-dessus du deck — ' + donne.verdict);
    else if (absent.verdict !== 'PASS' || !dit) ko(`TF-2373 (B) : --marque vers un fichier absent doit se dire NON jouée — ${absent.verdict}, mention ${dit ? 'dite' : 'absente'}`);
    else ok('TF-2373 (B) : sans dossier de marque S5 (marque) se dit NON jouée (PASS conservé) ; --marque désigne la marque hors arbre ; un --marque absent est dit');
  } finally { fs.rmSync(copie, { recursive: true, force: true }); }
}

console.log('SELF-TEST quality-oracles');
oks.forEach(m => console.log('  ✅ ' + m));
fails.forEach(m => console.log('  ❌ ' + m));
console.log(fails.length ? `\n❌ ${fails.length} échec(s).` : `\n✅ PASS (${oks.length} contrôles).`);
process.exit(fails.length ? 1 : 0);
