#!/usr/bin/env node
// self-test-scaffold.mjs — rejoue les fixtures verte et rouge du scaffolder. Exit 0 = PASS, 1 = FAIL.
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(dirname(fileURLToPath(import.meta.url)));
const scaffold = join(here, 'scripts', 'scaffold-expert.mjs');
const src = process.argv[2]; // chemin d'un experts-forge de référence
if (!src) { console.error('usage: self-test-scaffold.mjs <chemin-experts-forge>'); process.exit(1); }
const empreinte = (d) => execSync(`cd "${d}" && find . -type f | sort | xargs md5sum | md5sum`, { encoding: 'utf-8' }).trim();
let fails = 0;

// VERTE : création complète sur copie de test
{
  const tmp = mkdtempSync(join(tmpdir(), 'wae-verte-'));
  cpSync(src, tmp, { recursive: true });
  let ok = false;
  try {
    execFileSync('node', [scaffold, '--skill-dir', tmp, '--domaine', 'demo-verte',
      '--patterns', 'demoverte|casverte', '--corpus', join(tmp, 'SKILL.md'),
      '--merite', 'récurrent en test;corpus = SKILL.md du skill de test;aucun skill ne couvre demo-verte'], { encoding: 'utf-8' });
    ok = existsSync(join(tmp, 'fiches', 'expert-demo-verte.md'))
      && /\|\s*demo-verte\s*\|\s*todo\s*\|/.test(readFileSync(join(tmp, 'references', 'registre-experts.md'), 'utf-8'));
  } catch { ok = false; }
  console.log(`${ok ? 'PASS' : 'FAIL'} VERTE — fiche créée + entrée registre todo`);
  if (!ok) fails++;
}

// ROUGE : chemin de corpus mort → exit 2 ET zéro modification (empreinte identique)
{
  const tmp = mkdtempSync(join(tmpdir(), 'wae-rouge-'));
  cpSync(src, tmp, { recursive: true });
  const avant = empreinte(tmp);
  let exit = 0, raison = '';
  try {
    execFileSync('node', [scaffold, '--skill-dir', tmp, '--domaine', 'demo-rouge',
      '--patterns', 'demorouge', '--corpus', '/chemin/qui/nexiste/pas.md',
      '--merite', 'a;b;c'], { encoding: 'utf-8' });
  } catch (e) { exit = e.status; raison = e.stderr?.toString() ?? ''; }
  const apres = empreinte(tmp);
  const ok = exit === 2 && raison.includes('non résolu') && avant === apres;
  console.log(`${ok ? 'PASS' : 'FAIL'} ROUGE — exit=${exit}, raison corpus non résolu=${raison.includes('non résolu')}, empreinte identique=${avant === apres}`);
  if (!ok) fails++;
}

console.log(fails === 0 ? 'SELF-TEST SCAFFOLD : 2/2 PASS' : `SELF-TEST SCAFFOLD : ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
