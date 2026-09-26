// forges.mjs — OÙ VIVENT LES FORGES SŒURS, VU D'UN SKILL (TF-1334, 26/09/2026).
//
// POURQUOI CE MODULE. Le registre désignait les oracles des forges sœurs (forge-design,
// forge-conception, forge-data) par un chemin ABSOLU `c:/dev/…` : vrai sur un poste, faux sur
// tout autre, et faux EN SILENCE — une commande dont le script n'existe pas échoue au lancement,
// et un lancement en échec se lisait comme un FAIL. Mesuré le 26/09 : 23 commandes du registre
// sur 71 portaient `c:/dev/`. Le marqueur `{forges}` désigne la RACINE commune des forges,
// résolue à chaque appel, jamais gravée :
//   1. `FORGE_ROOT` posé ;
//   2. sinon le parent du dépôt qui héberge ce skill — `.claude/skills/<skill>` → dépôt → racine —
//      quand ce dépôt est bien la forge des outils : c'est le cas de la SOURCE ;
//   3. sinon, depuis la copie INSTALLÉE (`~/.claude/skills/<skill>`, où la piste 2 tombe dans le
//      dossier utilisateur), le parent du pilot que résout `lib/pilot.mjs` : le pilot et les
//      forges vivent sous la même racine ;
//   4. sinon rien — et l'appelant DÉCLARE un SKIP motivé, jamais un PASS ni un FAIL muet.
import fs from 'node:fs';
import path from 'node:path';
import { resolvePilot } from './pilot.mjs';

export const MARQUEUR_FORGES = '{forges}';

/** Les pistes examinées, dans l'ordre, chacune avec son motif — le message de SKIP les NOMME. */
export function pistesForges(skilldir, env = process.env) {
  const pistes = [];
  if (env.FORGE_ROOT) pistes.push({ racine: path.resolve(env.FORGE_ROOT), par: 'FORGE_ROOT' });
  const depot = path.resolve(skilldir, '..', '..', '..');
  if (path.basename(depot) === 'digit-ai-forge-agents') {
    pistes.push({ racine: path.dirname(depot), par: 'parent du dépôt digit-ai-forge-agents' });
  }
  const pilot = resolvePilot(skilldir);
  if (pilot) pistes.push({ racine: path.dirname(pilot), par: 'parent du pilot résolu' });
  return pistes;
}

/** La racine des forges, ou `null` si aucune piste ne mène à un dossier existant. */
export function resolveForges(skilldir, env = process.env) {
  for (const p of pistesForges(skilldir, env)) {
    try { if (fs.statSync(p.racine).isDirectory()) return p.racine; } catch { /* piste absente */ }
  }
  return null;
}

/** Le motif à publier quand la résolution échoue — il nomme les pistes, sinon il n'apprend rien. */
export function motifForgesAbsentes(skilldir, env = process.env) {
  const pistes = pistesForges(skilldir, env).map((p) => `${p.par} : ${p.racine}`);
  return `racine des forges sœurs introuvable (pistes essayées : ${pistes.join(' · ') || 'aucune — ni FORGE_ROOT, ni dépôt de la forge des outils, ni pilot résolu'}) — `
    + 'poser `FORGE_ROOT` sur la racine qui porte les dépôts `digit-ai-forge-*`';
}
