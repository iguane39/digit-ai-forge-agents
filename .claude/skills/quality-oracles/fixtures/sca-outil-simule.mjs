#!/usr/bin/env node
// Outil SIMULÉ pour la recette d'oracle-sca (TF-2281) : joue `pip-audit` et `uvx pip-audit` sans réseau, sans
// installation et sans rien résoudre. Désigné par QO_SCA_PIP_AUDIT ou QO_SCA_UVX ; jamais utilisé hors du self-test.
// Comportement, calqué sur la sortie JSON de pip-audit et sur la fixture d'outil de forge-websec 0.2.0 :
//   --version                  → exit 0
//   uvx : le premier argument est « pip-audit », retiré avant l'analyse
//   -r <fichier> -f json       → rapport JSON {dependencies:[{name,version,vulns}]} lu depuis les lignes `nom==version` ;
//                                un paquet « django » en version 1.x est vulnérable (id fictif PYSEC-SIM-0001) ;
//                                exit 1 s'il y a une vulnérabilité, 0 sinon
//   deux versions du même nom  → erreur « duplicate requirements » sans JSON, exit 1 (pip-audit refuse ce fichier)
//   QO_SIM_ECHEC=1             → pas de JSON, message d'erreur réseau, exit 1
//   QO_SIM_TRACE=<fichier>     → ajoute une ligne JSON par appel : {mode, argv}
import fs from 'node:fs';

let argv = process.argv.slice(2);
const mode = argv[0] === 'pip-audit' ? 'uvx' : 'direct';
if (mode === 'uvx') argv = argv.slice(1);
if (process.env.QO_SIM_TRACE) fs.appendFileSync(process.env.QO_SIM_TRACE, JSON.stringify({ mode, argv }) + '\n');
if (argv.includes('--version')) { console.log('outil-simule 0.0'); process.exit(0); }
if (process.env.QO_SIM_ECHEC === '1') { process.stderr.write('ERROR: base d\'avisos injoignable (échec simulé)\n'); process.exit(1); }
const i = argv.indexOf('-r');
if (i < 0 || !fs.existsSync(argv[i + 1])) { process.stderr.write('ERROR: requirements introuvable\n'); process.exit(1); }
const vus = new Set();
const dependencies = [];
for (const l of fs.readFileSync(argv[i + 1], 'utf8').split(/\r?\n/)) {
  const m = /^([A-Za-z0-9._-]+)==(\S+)$/.exec(l.trim());
  if (!m) continue;
  const [, name, version] = m;
  if (vus.has(name.toLowerCase())) { process.stderr.write(`ERROR: package ${name} has duplicate requirements: ${name}==${version}\n`); process.exit(1); }
  vus.add(name.toLowerCase());
  dependencies.push({ name, version, vulns: name.toLowerCase() === 'django' && version.startsWith('1.') ? [{ id: 'PYSEC-SIM-0001' }] : [] });
}
process.stdout.write(JSON.stringify({ dependencies }));
process.exit(dependencies.some((d) => d.vulns.length) ? 1 : 0);
