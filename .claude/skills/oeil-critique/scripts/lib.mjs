// lib.mjs — résolution du pilot et du poste, communes aux scripts du skill oeil-critique.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { hostname } from "node:os";

/** Première exécution d'un poste sans repère : décision D-62 (a) du 21/10/2026. */
export const BORNE_INITIALE = "2026-10-20T00:00:00+02:00";

/** Le poste, tel que le relevé d'ouverture le nomme. */
export const poste = () => hostname();

/**
 * Le dépôt du pilot : --pilot, sinon FORGE_ROOT/digit-ai-factory, sinon le dossier courant s'il porte
 * le registre. Le skill s'installe hors de tout dépôt (~/.claude/skills) : il ne peut pas se situer
 * par son propre chemin.
 */
export function pilot(args = []) {
  const i = args.indexOf("--pilot");
  const candidats = [
    i >= 0 ? args[i + 1] : null,
    process.env.FORGE_ROOT ? join(process.env.FORGE_ROOT, "digit-ai-factory") : null,
    process.cwd(),
  ].filter(Boolean).map((p) => resolve(p));
  const trouve = candidats.find((p) => existsSync(join(p, "todo", "TODO.jsonl")));
  if (!trouve) throw new Error(`pilot introuvable (essayés : ${candidats.join(" ; ")}) — passer --pilot <chemin> ou FORGE_ROOT`);
  return trouve;
}

export const valeur = (args, nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };

/** Les transcripts d'un profil modifiés depuis une date, sous-agents exclus : leur travail se voit
 *  dans la session qui les a lancés. Partagé par extraire.mjs et sources.mjs (1.2.0). */
export function transcripts(racine, depuisMs) {
  const out = [];
  if (!existsSync(racine)) return out;
  for (const n of readdirSync(racine, { withFileTypes: true })) {
    const p = join(racine, n.name);
    if (n.isDirectory()) { if (n.name !== "subagents") out.push(...transcripts(p, depuisMs)); }
    else if (n.name.endsWith(".jsonl") && statSync(p).mtimeMs >= depuisMs) out.push(p);
  }
  return out;
}
