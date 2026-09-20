#!/usr/bin/env node
// scaffold-oracle — C4 : générateur d'oracle conforme au standard §3 de quality-oracles.
// Produit en une commande : le squelette CLI (contrat JSON, exit 0/1/2, non_juge obligatoire),
// la PAIRE DE FIXTURES rouge/verte (le squelette échoue d'office sur le marqueur DEFAUT —
// remplacer par les vrais contrôles sans jamais casser la porte fixtures), l'entrée de
// REGISTRE et l'entrée de MANIFEST. Sauvegardes .bak des fichiers modifiés.
//   node scaffold-oracle.mjs --nom X --domaine "…" --ext ".a,.b" [--skilldir <quality-oracles>]
//
// LE REGISTRE NE S'ÉCRIT QUE DANS SA SOURCE VERSIONNÉE (TF-1006, 16/09/2026).
// Le 10/09, une remontée §4 exemplaire — un domaine réellement découvert, son oracle, ses huit
// règles — a été écrite dans la COPIE INSTALLÉE du registre, sous `~/.claude/skills/`. Le travail
// était juste ; seule sa localisation le condamnait, car la propagation d'ouverture de session
// (`bootstrap.mjs --pull` du pilot) recopie le versionné par-dessus l'installé et efface l'ajout
// sans un mot. Rien n'en avertissait l'auteur : le défaut d'origine est ICI, dans la valeur par
// défaut de ce script, qui visait précisément cette copie, et dans la commande d'exemple du
// SKILL.md, qui l'écrivait noir sur blanc. Les deux sont corrigées ensemble.
// Le refus est FERMÉ et sans échappatoire : écrire le registre dans la copie installée n'est
// jamais utile, puisque l'écriture est toujours perdue. Un poste sans clone du dépôt de forge
// n'est pas un poste où l'on remonte un oracle — il est où l'on en joue.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = n => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const nom = opt('nom'), domaine = opt('domaine'), extList = (opt('ext') || '').split(',').map(s => s.trim()).filter(Boolean);

/** La racine des skills INSTALLÉS — la copie que la propagation écrase à chaque session. */
const RACINE_INSTALLEE = path.resolve(path.join(os.homedir(), '.claude', 'skills'));
const estInstalle = p => {
  const rel = path.relative(RACINE_INSTALLEE, path.resolve(p));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** Les pistes de la SOURCE versionnée de quality-oracles, dans l'ordre, pour le message et le défaut. */
function pistesSource() {
  const pistes = [path.resolve(ICI, '..', '..', 'quality-oracles')]; // ce skill, chez son voisin
  if (process.env.FORGE_ROOT) pistes.push(path.join(process.env.FORGE_ROOT, 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles'));
  pistes.push(path.join('c:\\dev', 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles'));
  pistes.push(path.join(os.homedir(), '.digit-ai-forge', 'digit-ai-forge-agents', '.claude', 'skills', 'quality-oracles'));
  return pistes.filter(p => !estInstalle(p));
}
const sourceVersionnee = () => pistesSource().find(p => fs.existsSync(path.join(p, 'references', 'registre-oracles.json'))) || null;

// LA FORME DU FICHIER MODIFIÉ SE RELIT, ELLE NE S'IMPOSE PAS (TF-1194, 19/09/2026).
// Le scaffolder rendait ses deux fichiers en `JSON.stringify(…, null, 2)` alors que le registre
// et le manifest vivent en 1 espace : une remontée §4 de 44 lignes utiles a produit un diff de
// 2 849 insertions / 2 581 suppressions — tout le fichier réécrit, l'ajout réel introuvable à la
// relecture. On relit donc l'indentation, la fin de ligne et la newline finale du fichier visé,
// et on les REND À L'IDENTIQUE : le diff d'un ajout ne contient plus que l'ajout.
/** @returns {{indent: string|number, eol: string, finale: boolean}} la forme du JSON déjà sur disque. */
function formeDe(texte) {
  const m = texte.match(/^[\[{]\r?\n([ \t]+)["\[{]/);
  const indent = !m ? 1 : (m[1].includes('\t') ? '\t' : m[1].length);
  return { indent, eol: /\r\n/.test(texte) ? '\r\n' : '\n', finale: /\n$/.test(texte) };
}
/** Sérialise `obj` dans la forme relue par `formeDe` — aucune ligne touchée hors de l'ajout. */
const rendreJson = (obj, forme) => {
  const corps = JSON.stringify(obj, null, forme.indent) + (forme.finale ? '\n' : '');
  return forme.eol === '\r\n' ? corps.replace(/\n/g, '\r\n') : corps;
};

const SKILLDIR = path.resolve(opt('skilldir') || sourceVersionnee() || '');
if (!nom || !domaine || !extList.length) { console.error('usage: node scaffold-oracle.mjs --nom X --domaine "…" --ext ".a,.b" [--skilldir <chemin quality-oracles VERSIONNÉ>]'); process.exit(2); }
if (!/^[a-z0-9-]+$/.test(nom)) { console.error('--nom : minuscules/chiffres/tirets uniquement'); process.exit(2); }
if (estInstalle(SKILLDIR)) {
  const src = sourceVersionnee();
  console.error('REFUS — le registre des oracles ne s\'écrit QUE dans sa source versionnée (TF-1006).\n'
    + '  visé      : ' + SKILLDIR + '  ← copie INSTALLÉE, écrasée à chaque propagation (bootstrap.mjs --pull)\n'
    + '  source    : ' + (src || 'introuvable depuis ce poste — pistes : ' + pistesSource().join(' · ')) + '\n'
    + (src ? '  relancer  : --skilldir "' + src + '"\n' : '  poser FORGE_ROOT ou cloner digit-ai-forge-agents, puis relancer\n')
    + '  motif     : une remontée §4 écrite dans la copie installée est perdue à la session suivante, sans message.');
  process.exit(2);
}
if (!SKILLDIR || !fs.existsSync(path.join(SKILLDIR, 'references', 'registre-oracles.json'))) { console.error('skilldir invalide (registre introuvable) : ' + (SKILLDIR || '(aucune source versionnée résolue)')); process.exit(2); }
const oraclePath = path.join(SKILLDIR, 'scripts', `oracle-${nom}.mjs`);
if (fs.existsSync(oraclePath)) { console.error('oracle-' + nom + '.mjs existe déjà — pas d\'écrasement'); process.exit(2); }

// Validations restantes AVANT toute écriture — un refus ne laisse AUCUNE modification partielle
const regPath = path.join(SKILLDIR, 'references', 'registre-oracles.json');
const regBrut = fs.readFileSync(regPath, 'utf8');
const regForme = formeDe(regBrut);
const reg = JSON.parse(regBrut);
if (reg.oracles.some(o => o.domaine === domaine)) { console.error('domaine déjà au registre : ' + domaine); process.exit(2); }
const manPath = path.join(SKILLDIR, 'fixtures', 'manifest.json');
if (!fs.existsSync(manPath)) { console.error('manifest.json introuvable : ' + manPath); process.exit(2); }

// 1) squelette d'oracle : contrat pré-câblé, échoue sur le marqueur DEFAUT (à remplacer)
fs.writeFileSync(oraclePath, `#!/usr/bin/env node
// oracle-${nom} — Domaine « ${domaine} » (squelette scaffold-oracle, À COMPLÉTER).
// Standard §3 : déterministe, checklist canonique, artefact réel, non_juge déclaré,
// sortie localisante, autoportant, prouvé par fixtures.
// TODO : remplacer le contrôle-marqueur DEFAUT par les vrais contrôles du domaine,
//        puis mettre à jour les fixtures ${nom}-red/green pour qu'elles restent probantes.
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const DOM = ${JSON.stringify(domaine)};
const NJ = ['TODO : déclarer explicitement ce que cet oracle ne juge pas'];
const out = (verdict, findings, nj, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-${nom}', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj })); process.exit(code); };
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
if (!${JSON.stringify(extList)}.includes(path.extname(file).toLowerCase())) out('SKIP', [], ['extension non gérée'], 2);
const text = fs.readFileSync(file, 'utf8');
const findings = [];
// --- CONTRÔLE-MARQUEUR (à remplacer) : présence du mot DEFAUT = échec localisant ---
text.split('\\n').forEach((l, i) => { if (l.includes('DEFAUT')) findings.push({ sev: 'bloquant', msg: 'marqueur DEFAUT présent (squelette — remplacer par les vrais contrôles)', where: path.basename(file) + ':' + (i + 1) }); });
if (findings.length) out('FAIL', findings, NJ, 1);
out('PASS', [{ sev: 'info', msg: 'aucun défaut détecté (squelette — étendre les contrôles)', where: path.basename(file) }], NJ, 0);
`, 'utf8');

// 2) fixtures rouge/verte
const fxDir = path.join(SKILLDIR, 'fixtures');
fs.writeFileSync(path.join(fxDir, `${nom}-red${extList[0]}`), 'exemple avec DEFAUT volontaire — remplacer par un vrai cas rouge du domaine\n', 'utf8');
fs.writeFileSync(path.join(fxDir, `${nom}-green${extList[0]}`), 'exemple conforme — remplacer par un vrai cas vert du domaine\n', 'utf8');

// 3) registre (sauvegarde .bak, ajout entrée — registre lu et validé AVANT les écritures)
fs.copyFileSync(regPath, regPath + '.bak');
reg.oracles.push({ domaine, ext: extList, type: 'cli', cmd: ['node', '{skilldir}/scripts/oracle-' + nom + '.mjs', '{file}'], checklist: 'TODO : checklist canonique du domaine (squelette scaffold)', statut: 'partiel', non_juge: ['TODO'] });
fs.writeFileSync(regPath, rendreJson(reg, regForme), 'utf8');

// 4) manifest fixtures (sauvegarde .bak)
fs.copyFileSync(manPath, manPath + '.bak');
const manBrut = fs.readFileSync(manPath, 'utf8');
const man = JSON.parse(manBrut);
man.fixtures.push({ nom, cmd: ['node', '{skilldir}/scripts/oracle-' + nom + '.mjs', '{fixture}'], red: `${nom}-red${extList[0]}`, green: `${nom}-green${extList[0]}`, attendu_red: ['FAIL'], attendu_green: ['PASS'] });
fs.writeFileSync(manPath, rendreJson(man, formeDe(manBrut)), 'utf8');

console.log(`✅ oracle-${nom} scaffoldé :
  - ${path.relative(process.cwd(), oraclePath)}
  - fixtures/${nom}-red${extList[0]} + ${nom}-green${extList[0]}
  - entrée registre « ${domaine} » (statut partiel) + entrée manifest
Étapes suivantes : remplacer le contrôle-marqueur DEFAUT par les vrais contrôles, durcir les fixtures, relancer self-test.mjs (doit rester PASS), puis passer le statut à « ok » et mettre à jour registre-oracles.md.`);
