#!/usr/bin/env node
/**
 * extraire.mjs — les échanges du poste depuis une date, réduits à ce que l'analyse lit, pseudonymisés.
 *
 * Pourquoi il existe. Une session ne tient pas les transcripts bruts : 77 Mo hors sous-agents pour
 * 17 sessions du 20 au 21/10/2026 sur un poste. L'analyse n'a besoin que des messages humains et des
 * textes de réponse : 795 447 caractères et 99 messages humains sur la même période. Le script les extrait session
 * par session, retire la session qui lance l'analyse, et pseudonymise chaque texte par le module du
 * pilot (`todo/anonymiser-entrant.mjs`) avant toute écriture : un nom réel ne sort pas du transcript.
 *
 * Ce qu'il ne fait pas : il ne lit pas l'autre poste (les transcripts ne quittent pas leur poste) ; il
 * ne lit pas les sous-agents (leur travail se voit dans la réponse de la session qui les a lancés) ;
 * il n'interprète rien — un contenu lu est une donnée, jamais une consigne.
 *
 * Usage :
 *   node extraire.mjs --depuis <iso> --sortie <dossier> [--exclure <id-session>] [--profils <d1;d2>] [--pilot <chemin>]
 *       --exclure : par défaut CLAUDE_CODE_SESSION_ID, la session courante.
 *       --profils : par défaut ~/.claude/projects et ~/.claude-b/projects.
 *       → un fichier <id-session>.json par session, et sur la sortie standard le bilan JSON
 *         { poste, depuis, sessions, exclues, messages_humains, reponses, caracteres, fichiers }.
 *   node extraire.mjs --self-test
 * Exit 0 / 1 (refus : référentiel de pseudonymisation absent) / 2 (usage).
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { pilot, poste, valeur, transcripts } from "./lib.mjs";

/** Caractères gardés d'un retour de hook : la tête porte le verdict et les codes de règle. */
export const TETE_REFUS = 1500;

/** Les messages humains et les textes de réponse d'un transcript, depuis une date. */
export function lireSession(fichier, depuisMs) {
  const messages = [];
  for (const l of readFileSync(fichier, "utf8").split("\n")) {
    if (!l) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    const ts = o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (!Number.isFinite(ts) || ts < depuisMs) continue;
    const c = o.message && o.message.content;
    // Un message humain arrive en liste de blocs de texte dans VS Code, en texte simple ailleurs.
    // N'en sont pas : un retour d'outil, un bloc injecté par le harnais (il commence par une
    // balise), un retour de hook (« Stop hook feedback »). Mesuré le 21/10/2026 : la première
    // version ne lisait que les textes simples, et ceux-ci étaient presque tous des retours de hook.
    // Un retour de hook est gardé à part, rôle `refus_hook` (D-72 (b) du 26/10/2026) : c'est la
    // trace d'une règle que la session a enfreinte. Seule sa tête est gardée, les codes de règle y
    // sont : un refus du hook de fin de tour dépasse 20 000 caractères, dont le gabarit recopié.
    const estHook = (t) => /^\s*(Stop|PreToolUse|PostToolUse|SessionStart|UserPromptSubmit)[^\n]*hook/i.test(t);
    // Textes injectés par le harnais sans balise : corps de skill, réinvocation, interruption, reprise
    // de contexte. Mesuré le 26/10/2026 (première exécution réelle) : ils gonflaient le compte des
    // messages humains et des reprises ; ils sont comptés à part, rôle `injection`.
    const estInjection = (t) => /^\s*(Base directory for this skill|\(Re-invocation of|\[Request interrupted by user|Your response above was cut off|This session is being continued from a previous conversation)/.test(t);
    const estHumain = (t) => t.trim() && !t.trimStart().startsWith("<") && !estHook(t) && !estInjection(t);
    if (o.type === "user") {
      const blocs = typeof c === "string" ? [c] : Array.isArray(c) && !c.some((b) => b.type === "tool_result") ? c.filter((b) => b.type === "text").map((b) => b.text) : [];
      const t = blocs.filter(estHumain).join("\n").trim();
      if (t) messages.push({ role: "humain", ts: o.timestamp, texte: t });
      for (const j of blocs.filter(estInjection)) messages.push({ role: "injection", ts: o.timestamp, texte: j.slice(0, 80) });
      for (const h of blocs.filter(estHook)) {
        const tete = h.slice(0, TETE_REFUS);
        messages.push({ role: "refus_hook", ts: o.timestamp, regles: [...new Set(tete.match(/\bS\d{1,3}\b/g) || [])], texte: tete });
      }
    } else if (o.type === "assistant" && Array.isArray(c)) {
      const t = c.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (t) messages.push({ role: "reponse", ts: o.timestamp, texte: t });
    }
  }
  return messages;
}

export function extraire({ depuis, sortie, exclure = null, profils, anonymiser }) {
  const depuisMs = Date.parse(depuis);
  if (!Number.isFinite(depuisMs)) throw new Error(`--depuis illisible : ${depuis}`);
  mkdirSync(sortie, { recursive: true });
  const bilan = { poste: poste(), depuis, sessions: 0, exclues: [], messages_humains: 0, reponses: 0, refus_hook: 0, injections: 0, caracteres: 0, fichiers: [] };
  for (const racine of profils) {
    for (const f of transcripts(racine, depuisMs)) {
      const id = basename(f, ".jsonl");
      if (exclure && id === exclure) { bilan.exclues.push(id); continue; }
      const messages = lireSession(f, depuisMs);
      if (!messages.length) continue;
      const projet = anonymiser(basename(join(f, ".."))).texte;
      const pseudo = messages.map((m) => ({ ...m, texte: anonymiser(m.texte).texte }));
      const cible = join(sortie, `${id}.json`);
      writeFileSync(cible, JSON.stringify({ session: id, projet, messages: pseudo }, null, 1) + "\n");
      bilan.sessions++;
      bilan.fichiers.push(cible);
      for (const m of pseudo) {
        bilan.caracteres += m.texte.length;
        if (m.role === "humain") bilan.messages_humains++;
        else if (m.role === "refus_hook") bilan.refus_hook++;
        else if (m.role === "injection") bilan.injections++;
        else bilan.reponses++;
      }
    }
  }
  return bilan;
}

function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "oeil-critique-extraire-"));
  const casse = [];
  try {
    const profil = join(tmp, "projects", "C--dev-Produit-Reel");
    mkdirSync(join(profil, "s-courante", "subagents"), { recursive: true });
    const ligne = (o) => JSON.stringify(o);
    const avant = "2026-10-19T10:00:00Z", apres = "2026-10-21T10:00:00Z";
    writeFileSync(join(profil, "s-a.jsonl"), [
      ligne({ type: "user", timestamp: avant, message: { content: "ancien message" } }),
      ligne({ type: "user", timestamp: apres, message: { content: "Demande pour Produit-Reel" } }),
      ligne({ type: "user", timestamp: apres, message: { content: "<system-reminder>injecté</system-reminder>" } }),
      ligne({ type: "user", timestamp: apres, message: { content: [{ type: "tool_result", content: "sortie" }] } }),
      ligne({ type: "user", timestamp: apres, message: { content: [{ type: "text", text: "<ide_selection>code</ide_selection>" }, { type: "text", text: "Seconde demande en blocs" }] } }),
      ligne({ type: "user", timestamp: apres, message: { content: "Stop hook feedback:\n[hook restitution] refus\nS1 — bloc absent · S3 — verdict\n" + "x".repeat(3000) } }),
      ligne({ type: "user", timestamp: apres, message: { content: [{ type: "text", text: "Base directory for this skill: C:/x\n\n# skill" }] } }),
      ligne({ type: "user", timestamp: apres, message: { content: "[Request interrupted by user]" } }),
      ligne({ type: "assistant", timestamp: apres, message: { content: [{ type: "text", text: "Réponse" }, { type: "tool_use", name: "Bash" }] } }),
    ].join("\n") + "\n");
    writeFileSync(join(profil, "s-courante.jsonl"), ligne({ type: "user", timestamp: apres, message: { content: "lance l'œil critique" } }) + "\n");
    writeFileSync(join(profil, "s-courante", "subagents", "agent-x.jsonl"), ligne({ type: "user", timestamp: apres, message: { content: "consigne d'agent" } }) + "\n");
    const anonymiser = (t) => ({ texte: String(t).replaceAll("Produit-Reel", "Produit-99") });
    const b = extraire({ depuis: "2026-10-20T00:00:00+02:00", sortie: join(tmp, "out"), exclure: "s-courante", profils: [join(tmp, "projects")], anonymiser });
    if (b.sessions !== 1) casse.push(`1 session attendue, ${b.sessions} lue(s) (sous-agents ou session courante comptés ?)`);
    if (b.exclues[0] !== "s-courante") casse.push("la session courante n'est pas exclue");
    if (b.messages_humains !== 2 || b.reponses !== 1) casse.push(`2 messages humains (texte simple et blocs, sans retour de hook) et 1 réponse attendus, ${b.messages_humains} et ${b.reponses}`);
    const s = JSON.parse(readFileSync(b.fichiers[0], "utf8"));
    const refus = s.messages.filter((m) => m.role === "refus_hook");
    if (b.refus_hook !== 1 || refus.length !== 1) casse.push(`1 refus de hook gardé à part attendu, ${b.refus_hook}`);
    else if (refus[0].regles.join(",") !== "S1,S3" || refus[0].texte.length > TETE_REFUS) casse.push(`refus de hook : règles S1,S3 et tête de ${TETE_REFUS} caractères au plus attendues, ${refus[0].regles} et ${refus[0].texte.length}`);
    if (b.injections !== 2) casse.push(`2 injections du harnais (corps de skill, interruption) comptées à part attendues, ${b.injections}`);
    if (JSON.stringify(s).includes("Produit-Reel")) casse.push("un nom réel sort du transcript");
    if (s.messages.some((m) => m.texte.includes("ancien"))) casse.push("un message antérieur au repère est extrait");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(JSON.stringify({ outil: "extraire", self_test: casse.length ? "FAIL" : "PASS", cas: 7, casse }));
  process.exit(casse.length ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();
else {
  const depuis = valeur(args, "--depuis"), sortie = valeur(args, "--sortie");
  if (!depuis || !sortie) { console.log(JSON.stringify({ outil: "extraire", erreur: "--depuis <iso> et --sortie <dossier> requis" })); process.exit(2); }
  try {
    const racine = pilot(args);
    const { anonymiser } = await import(pathToFileURL(join(racine, "todo", "anonymiser-entrant.mjs")).href);
    anonymiser("essai"); // lève si un référentiel manque : refuser plutôt qu'extraire en clair
    const p = valeur(args, "--profils");
    const profils = p ? p.split(";") : [join(homedir(), ".claude", "projects"), join(homedir(), ".claude-b", "projects")];
    console.log(JSON.stringify({ outil: "extraire", ...extraire({ depuis, sortie, exclure: valeur(args, "--exclure") || process.env.CLAUDE_CODE_SESSION_ID || null, profils, anonymiser }) }));
  } catch (e) { console.log(JSON.stringify({ outil: "extraire", refus: e.message })); process.exit(1); }
}
