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

    // ================================================================ TF-1194 : le DIFF vaut l'AJOUT
    // La règle jugée ici : une remontée §4 ne touche que les lignes qu'elle ajoute. Le 19/09, le
    // scaffolder rendait registre et manifest en 2 espaces alors qu'ils vivent en 1 : 44 lignes
    // utiles, 2 849 insertions et 2 581 suppressions — l'ajout réel introuvable à la relecture.
    // On mesure donc la ZONE TOUCHÉE (préfixe et suffixe communs retirés, fins de ligne comprises)
    // et on la borne à 5 % du fichier. Les deux sens sont joués : la version en place (verte) et
    // une copie MUTÉE reproduisant le défaut d'origine (rouge), qui doit être prise.
    const SEUIL = 0.05;
    /** Zone touchée entre deux textes : lignes retirées / ajoutées hors préfixe et suffixe communs. */
    const zoneTouchee = (avant, apres) => {
      const a = avant.split('\n'), b = apres.split('\n'); // le \r reste sur la ligne : une bascule CRLF↔LF est vue
      let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
      let s = 0; while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
      return { retirees: a.length - p - s, ajoutees: b.length - p - s, total: a.length };
    };
    /** Monte un quality-oracles neuf (registre + manifest réels) et rend ses chemins. */
    const parcNeuf = (nom) => {
      const d = path.join(tmp, nom);
      fs.mkdirSync(path.join(d, 'references'), { recursive: true });
      fs.mkdirSync(path.join(d, 'fixtures'), { recursive: true });
      fs.mkdirSync(path.join(d, 'scripts'), { recursive: true });
      fs.copyFileSync(regSrc, path.join(d, 'references', 'registre-oracles.json'));
      fs.copyFileSync(manSrc, path.join(d, 'fixtures', 'manifest.json'));
      return { dir: d, reg: path.join(d, 'references', 'registre-oracles.json'), man: path.join(d, 'fixtures', 'manifest.json') };
    };
    /** Joue `script` sur un parc neuf et rend la zone touchée des deux fichiers de registre. */
    const mesurerRemontee = (script, suffixe) => {
      const p = parcNeuf('parc-' + suffixe);
      const avantReg = fs.readFileSync(p.reg, 'utf8'), avantMan = fs.readFileSync(p.man, 'utf8');
      const r = spawnSync(process.execPath, [script, '--nom', 'banc-diff-' + suffixe, '--domaine',
        'Banc TF-1194 — diff ' + suffixe, '--ext', '.md', '--skilldir', p.dir], { encoding: 'utf8', env, timeout: 60000 });
      return { r, reg: zoneTouchee(avantReg, fs.readFileSync(p.reg, 'utf8')), man: zoneTouchee(avantMan, fs.readFileSync(p.man, 'utf8')) };
    };
    const dit = z => `${z.ajoutees} ajoutées / ${z.retirees} retirées sur ${z.total} lignes`;

    // ---------------------------------------------------------------- (5) VERT : le diff = l'ajout
    const m5 = mesurerRemontee(scaffold, 'vert');
    if (m5.r.status !== 0) ko(`(5) diff : le scaffolder échoue (exit ${m5.r.status}) — ${(m5.r.stderr || '').slice(0, 200)}`);
    else if (m5.reg.ajoutees === 0 && m5.man.ajoutees === 0) ko('(5) diff : aucune ligne ajoutée — la mesure ne juge rien');
    else {
      const trop = [['registre', m5.reg], ['manifest', m5.man]].filter(([, z]) => z.ajoutees > z.total * SEUIL || z.retirees > z.total * SEUIL);
      if (trop.length) ko(`(5) diff : une remontée réécrit plus de ${SEUIL * 100} % du fichier — `
        + trop.map(([n, z]) => `${n} : ${dit(z)}`).join(' · ') + ' (TF-1194 : forme du fichier non relue)');
      else ok(`(5) une remontée ne touche que ce qu elle ajoute — registre : ${dit(m5.reg)} · manifest : ${dit(m5.man)}`);
    }

    // ------------------------------------------------- (6) ROUGE : le défaut d origine est REPRIS
    const mutant = path.join(tmp, 'scaffold-mute.mjs');
    const source = fs.readFileSync(scaffold, 'utf8');
    const mute = source.replace('rendreJson(reg, regForme)', "JSON.stringify(reg, null, 2) + '\\n'")
      .replace('rendreJson(man, formeDe(manBrut))', "JSON.stringify(man, null, 2) + '\\n'");
    if (mute === source) ko('(6) rouge : la mutation ne s applique plus (le rendu a changé de nom) — la fixture rouge est devenue creuse, à réaccorder');
    else {
      fs.writeFileSync(mutant, mute, 'utf8');
      const m6 = mesurerRemontee(mutant, 'rouge');
      if (m6.r.status !== 0) ko(`(6) rouge : le mutant n a pas scaffoldé (exit ${m6.r.status}) — le cas rouge ne prouve rien`);
      else if (m6.reg.ajoutees <= m6.reg.total * SEUIL && m6.man.ajoutees <= m6.man.total * SEUIL)
        ko(`(6) rouge : le rendu en 2 espaces N EST PAS pris par la mesure — registre : ${dit(m6.reg)} · manifest : ${dit(m6.man)}`);
      else ok(`(6) le défaut d origine (rendu en 2 espaces) est bien pris — registre : ${dit(m6.reg)} · manifest : ${dit(m6.man)}`);
    }
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log('SELF-TEST write-an-oracle');
oks.forEach(m => console.log('  ✅ ' + m));
fails.forEach(m => console.log('  ❌ ' + m));
console.log(fails.length ? `\n❌ ${fails.length} échec(s).` : `\n✅ PASS (${oks.length} contrôles).`);
process.exit(fails.length ? 1 : 0);
