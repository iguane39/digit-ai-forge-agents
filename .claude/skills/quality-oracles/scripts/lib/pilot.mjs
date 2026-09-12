// pilot.mjs — OÙ VIT LE PILOT, VU D'UN SKILL INSTALLÉ (TF-1064, 12/09/2026).
//
// POURQUOI CE MODULE. Le registre indexe désormais des oracles qui ne vivent NI dans ce skill,
// ni dans un skill voisin, mais dans le dépôt du pilot (`digit-ai-factory`) : `oracle-ecriture.mjs`
// est le premier. Les deux marqueurs existants ne savent pas le désigner — `{skilldir}` pointe ce
// skill, `{skillsroot}` la racine des skills — et une commande qui garde son marqueur non résolu
// ne tombe pas en erreur franche : elle échoue au lancement, et un `spawnSync` en échec se lit
// comme un FAIL. Sur une fixture ROUGE, ce FAIL-là ressemble trait pour trait à la preuve
// attendue. Un marqueur non résolu deviendrait donc un VERT silencieux : d'où un résolveur
// unique, et un SKIP MOTIVÉ quand la résolution échoue.
//
// L'ORDRE DE RÉSOLUTION est celui de `hooks-factory.mjs` du pilot, à l'identique :
//   1. `FORGE_ROOT` posé  → `<FORGE_ROOT>/digit-ai-factory` ;
//   2. sinon le dépôt FRÈRE de la forge : `<skill>/../../../../digit-ai-factory`, c'est-à-dire le
//      parent du dépôt qui héberge ce skill (`.claude/skills/<skill>` → dépôt → `c:\dev`) ;
//   3. sinon rien — et l'appelant DÉCLARE un SKIP motivé, jamais un PASS.
// Une piste n'est retenue que si elle porte réellement `oracles/` : un dossier homonyme vide
// rendrait une résolution qui ment.
import fs from 'node:fs';
import path from 'node:path';

export const MARQUEUR_PILOT = '{pilot}';

/** Les pistes examinées, dans l'ordre — utile au message de SKIP, qui doit les NOMMER. */
export function pistesPilot(skilldir) {
  const pistes = [];
  if (process.env.FORGE_ROOT) pistes.push(path.join(process.env.FORGE_ROOT, 'digit-ai-factory'));
  pistes.push(path.resolve(skilldir, '..', '..', '..', '..', 'digit-ai-factory'));
  return pistes;
}

/** Le dépôt du pilot, ou `null` s'il est introuvable depuis ce poste. */
export function resolvePilot(skilldir) {
  for (const p of pistesPilot(skilldir)) {
    try { if (fs.existsSync(path.join(p, 'oracles'))) return p; } catch { /* piste illisible */ }
  }
  return null;
}

/** Le motif à publier quand la résolution échoue — il nomme les pistes, sinon il n'apprend rien. */
export function motifPilotAbsent(skilldir) {
  return `dépôt du pilot introuvable (pistes essayées : ${pistesPilot(skilldir).join(' · ')}) — `
    + 'poser `FORGE_ROOT` ou cloner `digit-ai-factory` à côté du dépôt de la forge';
}
