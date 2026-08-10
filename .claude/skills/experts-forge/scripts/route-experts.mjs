#!/usr/bin/env node
// route-experts.mjs — oracle de routage d'experts-forge (E3).
// Entrée : texte de demande (argument unique ou stdin). Option : --dir <skill-dir> (défaut : dossier parent du script).
// Sortie : JSON { fiches_matchees:[{domaine, statut, motifs[]}], routees:[domaine…] } — routees ⊆ statut "ok".
// Source unique : content_patterns lus dans les fiches (champ 2), statuts lus dans references/registre-experts.md.
// Exit : 0 si exécution OK (même sans match), 2 si erreur de structure (fiche sans pattern, registre illisible).
import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
let dir = dirname(dirname(fileURLToPath(import.meta.url)));
const di = argv.indexOf('--dir');
if (di >= 0) { dir = argv[di + 1]; argv.splice(di, 2); }
const demande = (argv[0] ?? readFileSync(0, 'utf-8')).toString();
if (!demande.trim()) { console.error('demande vide'); process.exit(2); }

function fail(msg) { console.error(msg); process.exit(2); }

// 1. Statuts depuis le registre (lignes de table "| domaine | statut | ...")
let statuts = {};
try {
  const reg = readFileSync(join(dir, 'references', 'registre-experts.md'), 'utf-8');
  for (const l of reg.split('\n')) {
    const m = l.match(/^\|\s*([a-z0-9-]+)\s*\|\s*(ok|todo|refuse|dormant|broken)\s*\|/);
    if (m) statuts[m[1]] = m[2];
  }
} catch (e) { fail('registre illisible : ' + e.message); }
if (!Object.keys(statuts).length) fail('registre sans entrée exploitable');

// 2. Patterns depuis les fiches (source unique — jamais copiés ici)
const fiches = [];
for (const f of readdirSync(join(dir, 'fiches')).filter(f => f.startsWith('expert-') && f.endsWith('.md'))) {
  const t = readFileSync(join(dir, 'fiches', f), 'utf-8');
  const dm = t.match(/^# Fiche expert — `([a-z0-9-]+)`/m);
  const pm = t.match(/`content_patterns`\s*:\s*`([^`]+)`/);
  if (!dm || !pm) fail(`fiche ${f} : domaine ou content_patterns introuvable`);
  fiches.push({ domaine: dm[1], pattern: pm[1], statut: statuts[dm[1]] ?? 'absent-du-registre' });
}

// 3. Matching (insensible à la casse) + routage restreint aux fiches ok
const fiches_matchees = [];
for (const fi of fiches) {
  const rx = new RegExp(fi.pattern, 'gi');
  const motifs = [...new Set([...demande.matchAll(rx)].map(m => m[0].toLowerCase()))];
  if (motifs.length) fiches_matchees.push({ domaine: fi.domaine, statut: fi.statut, motifs });
}
const routees = fiches_matchees.filter(f => f.statut === 'ok').map(f => f.domaine).sort();
// M4 (23/07/2026, note P1 §4/D4) : journalisation des routages — source du champ `dernier_usage`
// des fiches, dérivé par la passe d'hygiène etat-forge. Append-only ; ne casse jamais le routage.
try {
  appendFileSync(join(dir, '_routages-journal.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), routees, matchees: fiches_matchees.map(f => f.domaine), demande_extrait: demande.trim().slice(0, 80) }) + '\n');
} catch { /* journal indisponible : le routage reste rendu */ }
console.log(JSON.stringify({ fiches_matchees, routees }, null, 2));
