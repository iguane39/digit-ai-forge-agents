#!/usr/bin/env node
// scaffold-oracle — C4 : générateur d'oracle conforme au standard §3 de quality-oracles.
// Produit en une commande : le squelette CLI (contrat JSON, exit 0/1/2, non_juge obligatoire),
// la PAIRE DE FIXTURES rouge/verte (le squelette échoue d'office sur le marqueur DEFAUT —
// remplacer par les vrais contrôles sans jamais casser la porte fixtures), l'entrée de
// REGISTRE et l'entrée de MANIFEST. Sauvegardes .bak des fichiers modifiés.
//   node scaffold-oracle.mjs --nom X --domaine "…" --ext ".a,.b" [--skilldir <quality-oracles>]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = n => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null;
const nom = opt('nom'), domaine = opt('domaine'), extList = (opt('ext') || '').split(',').map(s => s.trim()).filter(Boolean);
const SKILLDIR = path.resolve(opt('skilldir') || path.join(process.env.HOME || '', '.claude', 'skills', 'quality-oracles'));
if (!nom || !domaine || !extList.length) { console.error('usage: node scaffold-oracle.mjs --nom X --domaine "…" --ext ".a,.b" [--skilldir <chemin quality-oracles>]'); process.exit(2); }
if (!/^[a-z0-9-]+$/.test(nom)) { console.error('--nom : minuscules/chiffres/tirets uniquement'); process.exit(2); }
if (!fs.existsSync(path.join(SKILLDIR, 'references', 'registre-oracles.json'))) { console.error('skilldir invalide (registre introuvable) : ' + SKILLDIR); process.exit(2); }
const oraclePath = path.join(SKILLDIR, 'scripts', `oracle-${nom}.mjs`);
if (fs.existsSync(oraclePath)) { console.error('oracle-' + nom + '.mjs existe déjà — pas d\'écrasement'); process.exit(2); }

// Validations restantes AVANT toute écriture — un refus ne laisse AUCUNE modification partielle
const regPath = path.join(SKILLDIR, 'references', 'registre-oracles.json');
const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
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
fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n', 'utf8');

// 4) manifest fixtures (sauvegarde .bak)
fs.copyFileSync(manPath, manPath + '.bak');
const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
man.fixtures.push({ nom, cmd: ['node', '{skilldir}/scripts/oracle-' + nom + '.mjs', '{fixture}'], red: `${nom}-red${extList[0]}`, green: `${nom}-green${extList[0]}`, attendu_red: ['FAIL'], attendu_green: ['PASS'] });
fs.writeFileSync(manPath, JSON.stringify(man, null, 2) + '\n', 'utf8');

console.log(`✅ oracle-${nom} scaffoldé :
  - ${path.relative(process.cwd(), oraclePath)}
  - fixtures/${nom}-red${extList[0]} + ${nom}-green${extList[0]}
  - entrée registre « ${domaine} » (statut partiel) + entrée manifest
Étapes suivantes : remplacer le contrôle-marqueur DEFAUT par les vrais contrôles, durcir les fixtures, relancer self-test.mjs (doit rester PASS), puis passer le statut à « ok » et mettre à jour registre-oracles.md.`);
