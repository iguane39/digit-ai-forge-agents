#!/usr/bin/env node
// self-test — banc de `scaffold-oracle`, et d'abord de son REFUS (TF-1006, 16/09/2026).
//
// CE QU'IL PROUVE, dans les deux sens :
//   1. par DÉFAUT, sans `--skilldir`, le scaffolder écrit dans la source VERSIONNÉE voisine —
//      jamais dans la copie installée. C'est l'inverse exact du défaut d'origine : la valeur par
//      défaut du script visait `~/.claude/skills/quality-oracles`, et la commande d'exemple du
//      SKILL.md l'écrivait noir sur blanc ;
//   2. visée EXPLICITEMENT, la copie installée est REFUSÉE (exit 2), sans écriture partielle, et
//      le refus NOMME la source à viser ;
//   3. le remède que ce refus propose est JOUÉ ici et il PASSE (TF-1013) — un message qui dicte
//      une correction porte au banc le cas qui l'exécute, sinon la correction n'est qu'une phrase.
//
// La racine « installée » est simulée en déplaçant le dossier utilisateur du processus fils
// (USERPROFILE/HOME) : aucune échappatoire n'est ouverte dans le code jugé, et rien n'est écrit
// sous le vrai `~/.claude`. Tous les arbres de ce banc vivent dans un répertoire temporaire.
//
// Sortie : lignes ✅ / ❌ · exit 0 (PASS) / 1 (FAIL).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SKILLDIR = path.resolve(ICI, '..');
const SKILLSROOT = path.resolve(SKILLDIR, '..');
const fails = [], oks = [];
const ok = m => oks.push(m);
const ko = m => fails.push(m);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'write-an-oracle-'));
try {
  // --- un parc de skills JETABLE : le scaffolder, et un quality-oracles réduit à ce qu'il écrit.
  const parc = path.join(tmp, 'skills');
  const wao = path.join(parc, 'write-an-oracle');
  const qo = path.join(parc, 'quality-oracles');
  fs.mkdirSync(path.join(wao, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(qo, 'references'), { recursive: true });
  fs.mkdirSync(path.join(qo, 'fixtures'), { recursive: true });
  fs.mkdirSync(path.join(qo, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(ICI, 'scaffold-oracle.mjs'), path.join(wao, 'scripts', 'scaffold-oracle.mjs'));
  // Registre et manifest réels, copiés : le banc juge le script sur la forme qu'il rencontrera.
  const regSrc = path.join(SKILLSROOT, 'quality-oracles', 'references', 'registre-oracles.json');
  const manSrc = path.join(SKILLSROOT, 'quality-oracles', 'fixtures', 'manifest.json');
  if (!fs.existsSync(regSrc) || !fs.existsSync(manSrc)) {
    ko(`quality-oracles introuvable à côté de ce skill (${SKILLSROOT}) — le banc ne peut pas se monter`);
  } else {
    fs.copyFileSync(regSrc, path.join(qo, 'references', 'registre-oracles.json'));
    fs.copyFileSync(manSrc, path.join(qo, 'fixtures', 'manifest.json'));
    const scaffold = path.join(wao, 'scripts', 'scaffold-oracle.mjs');

    // --- une racine INSTALLÉE simulée : un dossier utilisateur déplacé, avec son ~/.claude/skills.
    const faux = path.join(tmp, 'poste');
    const installe = path.join(faux, '.claude', 'skills', 'quality-oracles');
    fs.mkdirSync(path.join(installe, 'references'), { recursive: true });
    fs.mkdirSync(path.join(installe, 'fixtures'), { recursive: true });
    fs.mkdirSync(path.join(installe, 'scripts'), { recursive: true });
    fs.copyFileSync(regSrc, path.join(installe, 'references', 'registre-oracles.json'));
    fs.copyFileSync(manSrc, path.join(installe, 'fixtures', 'manifest.json'));
    const env = { ...process.env, USERPROFILE: faux, HOME: faux, HOMEDRIVE: '', HOMEPATH: '' };
    const jouer = (args) => spawnSync(process.execPath, [scaffold, ...args], { encoding: 'utf8', env, timeout: 60000 });
    const domaines = (d) => JSON.parse(fs.readFileSync(path.join(d, 'references', 'registre-oracles.json'), 'utf8')).oracles.map(o => o.domaine);
    const avantInstalle = domaines(installe).length;

    // ---------------------------------------------------------------- (1) le DÉFAUT vise la source
    const r1 = jouer(['--nom', 'banc-defaut', '--domaine', 'Banc TF-1006 — défaut', '--ext', '.md']);
    if (r1.status !== 0) ko(`(1) défaut : exit ${r1.status}, attendu 0 — ${(r1.stderr || r1.stdout || '').slice(0, 200)}`);
    else if (!domaines(qo).includes('Banc TF-1006 — défaut')) ko('(1) défaut : l entrée n est PAS entrée dans la source versionnée voisine');
    else if (domaines(installe).length !== avantInstalle) ko('(1) défaut : la COPIE INSTALLÉE a été touchée — c est le défaut d origine, à l identique');
    else ok('(1) sans --skilldir, le scaffolder écrit dans la source versionnée voisine, et la copie installée reste intacte');

    // ---------------------------------------------------------------- (2) la copie installée REFUSÉE
    const r2 = jouer(['--nom', 'banc-refus', '--domaine', 'Banc TF-1006 — refus', '--ext', '.md', '--skilldir', installe]);
    const msg2 = (r2.stderr || '') + (r2.stdout || '');
    if (r2.status !== 2) ko(`(2) refus : exit ${r2.status}, attendu 2 — la copie installée est acceptée en écriture`);
    else if (!/REFUS/.test(msg2) || !/INSTALL/i.test(msg2)) ko(`(2) refus : le message ne dit pas ce qui est refusé — ${msg2.slice(0, 200)}`);
    else if (!msg2.includes(qo)) ko(`(2) refus : le message ne NOMME pas la source à viser (${qo}) — un refus sans issue se contourne`);
    else if (domaines(installe).length !== avantInstalle) ko('(2) refus : une écriture PARTIELLE a eu lieu malgré le refus');
    else ok('(2) --skilldir sur la copie installée → exit 2, aucune écriture, et le refus nomme la source versionnée');

    // ---------------------------------------------------------------- (3) le remède proposé PASSE
    const cite = (msg2.match(/--skilldir "([^"]+)"/) || [])[1];
    if (!cite) ko('(3) remède : le refus ne propose aucune commande de rattrapage à jouer');
    else {
      const r3 = jouer(['--nom', 'banc-remede', '--domaine', 'Banc TF-1006 — remède', '--ext', '.md', '--skilldir', cite]);
      if (r3.status !== 0) ko(`(3) remède : la commande que le refus propose échoue (exit ${r3.status}) — ${(r3.stderr || '').slice(0, 200)}`);
      else if (!domaines(qo).includes('Banc TF-1006 — remède')) ko('(3) remède : la commande proposée n écrit pas le domaine dans la source');
      else ok('(3) la commande que le refus propose est jouée ici et elle PASSE — le remède recommandé est éprouvé, pas seulement écrit');
    }

    // ---------------------------------------------------------------- (4) refus sûrs préexistants
    const r4 = jouer(['--nom', 'banc-remede', '--domaine', 'Banc TF-1006 — doublon', '--ext', '.md', '--skilldir', qo]);
    r4.status === 2 ? ok('(4) un oracle déjà présent reste refusé (exit 2) — les refus sûrs d avant ne sont pas tombés')
      : ko(`(4) un oracle déjà présent n est plus refusé (exit ${r4.status})`);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log('SELF-TEST write-an-oracle');
oks.forEach(m => console.log('  ✅ ' + m));
fails.forEach(m => console.log('  ❌ ' + m));
console.log(fails.length ? `\n❌ ${fails.length} échec(s).` : `\n✅ PASS (${oks.length} contrôles).`);
process.exit(fails.length ? 1 : 0);
