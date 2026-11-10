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
 *   node extraire.mjs --depuis <iso> [--jusqu <iso>] --sortie <dossier> [--exclure <id-session>] [--profils <d1;d2>] [--pilot <chemin>]
 *       --jusqu : borne de fin exclue (1.4.1), pour découper une période de plus de 7 jours.
 *       --exclure : par défaut CLAUDE_CODE_SESSION_ID, la session courante.
 *       --profils : par défaut ~/.claude/projects et ~/.claude-b/projects.
 *       → un fichier <id-session>.json par session, et sur la sortie standard le bilan JSON
 *         { poste, depuis, sessions, exclues, messages_humains, reponses, caracteres, fichiers }.
 *   node extraire.mjs --self-test
 *       Depuis la 1.5.1 (D-198 (b) du 10/11/2026), le nom de répertoire de tout produit du parc absent de la table
 *       des pseudonymes est rendu « (produit hors table) », dans le champ projet comme dans les textes : l'exécution
 *       du 10/11 avait écrit 13 extraits sur 39 avec ce nom en clair. La liste vient de `sources.mjs`
 *       (`nomsDuParc`, `pseudonymiserParc`), la même que celle du relevé silencieux ; les dépôts de l'écosystème
 *       restent nommés. Sans cette liste, l'extraction refuse.
 * Exit 0 / 1 (refus : référentiel de pseudonymisation ou liste des produits du parc absent) / 2 (usage).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { pilot, poste, valeur, transcripts } from "./lib.mjs";
import { nomsDuParc, pseudonymiserParc } from "./sources.mjs";

/**
 * Le masque des noms de répertoire du parc (1.5.1) : `texte(t)` pour un texte extrait, `projet(p)` pour le nom
 * du dossier de transcripts, où le chemin du produit est écrit avec un tiret à la place de chaque signe non
 * alphanumérique. `pseudoProduit` est `pseudonymeProduit` du pilot (« Produit-NN » ou « (produit hors table) »),
 * `estPublic` est `estDepotEcosysteme`. Refuse plutôt que laisser passer un nom : sans l'une des deux fonctions,
 * ou sans aucun répertoire lisible au parc, la liste manque.
 */
export function masqueurParc(racine, pseudoProduit, estPublic) {
  if (typeof pseudoProduit !== "function" || typeof estPublic !== "function") throw new Error("extraire : pseudonymeur de produit manquant, extraction refusée");
  const noms = nomsDuParc(racine, estPublic);
  if (!noms.length) throw new Error("extraire : liste des produits du parc introuvable, extraction refusée");
  const memo = new Map();
  const pseudo = (n) => { if (!memo.has(n)) memo.set(n, pseudoProduit(n)); return memo.get(n); };
  const codes = new Map(noms.map((n) => [n.replace(/[^\p{L}\p{N}]/gu, "-").toLowerCase(), n]));
  const alternance = [...codes.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const dansProjet = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternance})(?![\\p{L}\\p{N}])`, "giu");
  return {
    texte: (t) => pseudonymiserParc(t, noms, pseudo),
    projet: (p) => String(p).replace(dansProjet, (m) => pseudo(codes.get(m.toLowerCase()))),
  };
}

/** Caractères gardés d'un retour de hook : la tête porte le verdict et les codes de règle. */
export const TETE_REFUS = 1500;

/** Les messages humains et les textes de réponse d'un transcript, depuis une date. */
/** `tours`, s il est fourni, reçoit la durée de chaque tour en minutes : d un message humain à la dernière
 *  entrée de l assistant avant le message humain suivant (1.3.0, D-97 (a) du pilot, demande de vitesse du 21/10). */
export function lireSession(fichier, depuisMs, tours = null, jusquMs = Infinity) {
  const messages = [];
  let debut = null, fin = null;
  for (const l of readFileSync(fichier, "utf8").split("\n")) {
    if (!l) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    const ts = o.timestamp ? Date.parse(o.timestamp) : NaN;
    // 1.4.1 : `jusquMs` borne la fin, pour découper une période de plus de 7 jours (exécution du 10/11/2026 :
    // 11,6 jours, 4,2 millions de caractères, découpés à la main faute de borne).
    if (!Number.isFinite(ts) || ts < depuisMs || ts >= jusquMs) continue;
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
      // 1.3.1 : un message que le harnais marque `turnOrigin: "sdk"` vient d'un appel automatique
      // (`claude -p` d'un juge LLM, essai de réglage), pas du porteur. Mesuré à l'exécution du
      // 29/10/2026 : 42 sessions sur 74, toutes comptées comme demandes humaines par la version 1.3.0.
      if (t && o.turnOrigin === "sdk") messages.push({ role: "automatique", ts: o.timestamp, texte: t.slice(0, 80) });
      else if (t) { messages.push({ role: "humain", ts: o.timestamp, texte: t }); if (tours && debut !== null && fin !== null) tours.push((fin - debut) / 60000); debut = ts; fin = null; }
      for (const j of blocs.filter(estInjection)) messages.push({ role: "injection", ts: o.timestamp, texte: j.slice(0, 80) });
      for (const h of blocs.filter(estHook)) {
        const tete = h.slice(0, TETE_REFUS);
        messages.push({ role: "refus_hook", ts: o.timestamp, regles: [...new Set(tete.match(/\bS\d{1,3}\b/g) || [])], texte: tete });
      }
    } else if (o.type === "assistant" && Array.isArray(c)) {
      if (debut !== null) fin = ts;
      const t = c.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (t) messages.push({ role: "reponse", ts: o.timestamp, texte: t });
    }
  }
  if (tours && debut !== null && fin !== null) tours.push((fin - debut) / 60000);
  return messages;
}

/** Médiane et 90e centile d une liste de durées, en minutes arrondies au dixième. */
export function repartition(durees) {
  const s = [...durees].sort((a, b) => a - b);
  const q = (p) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : null);
  return { nombre: s.length, mediane_min: q(0.5), p90_min: q(0.9) };
}

export function extraire({ depuis, jusqu = null, sortie, exclure = null, profils, anonymiser, masque }) {
  // 1.5.1 : refuser plutôt qu'extraire un nom de produit hors table en clair.
  if (!masque || typeof masque.texte !== "function" || typeof masque.projet !== "function") throw new Error("extraire : masque des noms du parc manquant, extraction refusée");
  const depuisMs = Date.parse(depuis);
  if (!Number.isFinite(depuisMs)) throw new Error(`--depuis illisible : ${depuis}`);
  const jusquMs = jusqu ? Date.parse(jusqu) : Infinity;
  if (jusqu && (!Number.isFinite(jusquMs) || jusquMs <= depuisMs)) throw new Error(`--jusqu illisible ou antérieure à --depuis : ${jusqu}`);
  mkdirSync(sortie, { recursive: true });
  const bilan = { poste: poste(), depuis, jusqu, sessions: 0, sessions_automatiques: 0, exclues: [], messages_humains: 0, reponses: 0, refus_hook: 0, injections: 0, caracteres: 0, tours: null, fichiers: [] };
  const durees = [];
  for (const racine of profils) {
    for (const f of transcripts(racine, depuisMs)) {
      const id = basename(f, ".jsonl");
      if (exclure && id === exclure) { bilan.exclues.push(id); continue; }
      const messages = lireSession(f, depuisMs, durees, jusquMs);
      if (!messages.length) continue;
      // Une session sans aucun message humain, mais avec des appels automatiques, ne s'analyse pas : elle se compte à part.
      if (!messages.some((m) => m.role === "humain") && messages.some((m) => m.role === "automatique")) { bilan.sessions_automatiques++; continue; }
      // Les noms du parc d'abord : l'anonymiseur peut déformer un nom de répertoire sans l'effacer (même ordre que sources.mjs).
      const projet = anonymiser(masque.projet(basename(join(f, "..")))).texte;
      const pseudo = messages.map((m) => ({ ...m, texte: anonymiser(masque.texte(m.texte)).texte }));
      const cible = join(sortie, `${id}.json`);
      writeFileSync(cible, JSON.stringify({ session: id, projet, messages: pseudo }, null, 1) + "\n");
      bilan.sessions++;
      bilan.fichiers.push(cible);
      for (const m of pseudo) {
        bilan.caracteres += m.texte.length;
        if (m.role === "humain") bilan.messages_humains++;
        else if (m.role === "refus_hook") bilan.refus_hook++;
        else if (m.role === "injection") bilan.injections++;
        else if (m.role === "automatique") bilan.sessions_automatiques += 0; // compté par session plus haut ; jamais une réponse
        else bilan.reponses++;
      }
    }
  }
  bilan.tours = repartition(durees);
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
    writeFileSync(join(profil, "s-b.jsonl"), [
      ligne({ type: "user", timestamp: "2026-10-21T10:00:00Z", message: { content: "Première demande" } }),
      ligne({ type: "assistant", timestamp: "2026-10-21T10:01:00Z", message: { content: [{ type: "tool_use", name: "Bash" }] } }),
      ligne({ type: "user", timestamp: "2026-10-21T10:03:00Z", message: { content: "Stop hook feedback:\n[hook restitution] refus" } }),
      ligne({ type: "assistant", timestamp: "2026-10-21T10:05:00Z", message: { content: [{ type: "text", text: "Fait" }] } }),
      ligne({ type: "user", timestamp: "2026-10-21T10:10:00Z", message: { content: "Seconde demande" } }),
      ligne({ type: "assistant", timestamp: "2026-10-21T10:12:00Z", message: { content: [{ type: "text", text: "Fait" }] } }),
    ].join("\n") + "\n");
    writeFileSync(join(profil, "s-juge.jsonl"), [
      ligne({ type: "user", timestamp: apres, turnOrigin: "sdk", message: { content: "# Rubrique figée — juge\nRépondre UNIQUEMENT en JSON" } }),
      ligne({ type: "assistant", timestamp: apres, message: { content: [{ type: "text", text: "{\"verdict\":\"PASS\"}" }] } }),
    ].join("\n") + "\n");
    writeFileSync(join(profil, "s-courante.jsonl"), ligne({ type: "user", timestamp: apres, message: { content: "lance l'œil critique" } }) + "\n");
    writeFileSync(join(profil, "s-courante", "subagents", "agent-x.jsonl"), ligne({ type: "user", timestamp: apres, message: { content: "consigne d'agent" } }) + "\n");
    const anonymiser = (t) => ({ texte: String(t).replaceAll("Produit-Reel", "Produit-99") });
    // 1.5.1 : un parc fictif voisin du pilot : un produit de la table, un produit hors table, un dépôt de l'écosystème.
    // Noms inventés ; le pilot de l'essai est `digit-ai-factory`, public comme tout dépôt `digit-ai-*`.
    const parc = join(tmp, "parc"), racinePilot = join(parc, "digit-ai-factory");
    for (const d of ["digit-ai-factory", "digit-ai-forge-fictive", "Produit-Reel", "Projet-Fictif-Zeta"]) mkdirSync(join(parc, d), { recursive: true });
    const estPublic = (n) => n.startsWith("digit-ai");
    const pseudoParc = (n) => (n === "Produit-Reel" ? "Produit-99" : "(produit hors table)");
    const masque = masqueurParc(racinePilot, pseudoParc, estPublic);
    const b = extraire({ depuis: "2026-10-20T00:00:00+02:00", sortie: join(tmp, "out"), exclure: "s-courante", profils: [join(tmp, "projects")], anonymiser, masque });
    if (b.sessions !== 2) casse.push(`2 sessions attendues, ${b.sessions} lue(s) (sous-agents, session courante ou appel automatique comptés ?)`);
    // 1.3.1 : une session d'appel automatique (turnOrigin « sdk ») se compte à part et ne s'analyse pas.
    if (b.sessions_automatiques !== 1 || b.fichiers.some((f) => f.endsWith("s-juge.json"))) casse.push(`1 session automatique comptée à part, sans extrait, attendue : ${b.sessions_automatiques}`);
    if (b.exclues[0] !== "s-courante") casse.push("la session courante n'est pas exclue");
    if (b.messages_humains !== 4 || b.reponses !== 3) casse.push(`4 messages humains (texte simple et blocs, sans retour de hook) et 3 réponses attendus, ${b.messages_humains} et ${b.reponses}`);
    // 1.3.0 : 3 tours, 0, 5 et 2 minutes ; un retour de hook n'ouvre pas de tour, et le tour court jusqu'à la dernière entrée de l'assistant.
    if (!b.tours || b.tours.nombre !== 3 || b.tours.mediane_min !== 2 || b.tours.p90_min !== 5) casse.push(`tours : 3, médiane 2 min, 90e centile 5 min attendus, ${JSON.stringify(b.tours)}`);
    const s = JSON.parse(readFileSync(b.fichiers.find((f) => f.endsWith("s-a.json")), "utf8"));
    const refus = s.messages.filter((m) => m.role === "refus_hook");
    if (b.refus_hook !== 2 || refus.length !== 1) casse.push(`2 refus de hook gardés à part attendus, dont 1 dans s-a, ${b.refus_hook}`);
    else if (refus[0].regles.join(",") !== "S1,S3" || refus[0].texte.length > TETE_REFUS) casse.push(`refus de hook : règles S1,S3 et tête de ${TETE_REFUS} caractères au plus attendues, ${refus[0].regles} et ${refus[0].texte.length}`);
    if (b.injections !== 2) casse.push(`2 injections du harnais (corps de skill, interruption) comptées à part attendues, ${b.injections}`);
    if (JSON.stringify(s).includes("Produit-Reel")) casse.push("un nom réel sort du transcript");
    if (s.messages.some((m) => m.texte.includes("ancien"))) casse.push("un message antérieur au repère est extrait");
    // 1.4.1 : la borne de fin coupe s-b après sa première demande (10:00) ; la seconde (10:10) n'est pas extraite.
    const bj = extraire({ depuis: "2026-10-20T00:00:00+02:00", jusqu: "2026-10-21T10:08:00Z", sortie: join(tmp, "out-borne"), exclure: "s-courante", profils: [join(tmp, "projects")], anonymiser, masque });
    const sb = JSON.parse(readFileSync(bj.fichiers.find((f) => f.endsWith("s-b.json")), "utf8"));
    if (sb.messages.some((m) => m.texte === "Seconde demande") || !sb.messages.some((m) => m.texte === "Première demande")) casse.push("--jusqu : un message postérieur à la borne est extrait, ou l'antérieur manque");
    let refusBorne = false;
    try { extraire({ depuis: "2026-10-21T00:00:00Z", jusqu: "2026-10-20T00:00:00Z", sortie: join(tmp, "out-x"), profils: [join(tmp, "projects")], anonymiser, masque }); } catch { refusBorne = true; }
    if (!refusBorne) casse.push("--jusqu antérieure à --depuis acceptée");
    // 1.5.1 (D-198 (b)) : un produit hors table, qui sortait en clair dans le champ projet et dans les textes avant le masque.
    const texteZ = "Corrige Projet-Fictif-Zeta, puis projet-fictif-zeta sous digit-ai-forge-fictive et Produit-Reel";
    const dirZ = join(tmp, "projects-parc", "C--dev-Projet-Fictif-Zeta");
    mkdirSync(dirZ, { recursive: true });
    writeFileSync(join(dirZ, "s-z.jsonl"), [
      ligne({ type: "user", timestamp: apres, message: { content: texteZ } }),
      ligne({ type: "assistant", timestamp: apres, message: { content: [{ type: "text", text: "Projet-Fictif-Zeta est corrigé" }] } }),
    ].join("\n") + "\n");
    const dirE = join(tmp, "projects-parc", "C--dev-digit-ai-forge-fictive");
    mkdirSync(dirE, { recursive: true });
    writeFileSync(join(dirE, "s-e.jsonl"), ligne({ type: "user", timestamp: apres, message: { content: "Voir digit-ai-forge-fictive" } }) + "\n");
    const lire = (r, id) => JSON.parse(readFileSync(r.fichiers.find((f) => f.endsWith(`${id}.json`)), "utf8"));
    const entree = (sortieParc, m) => extraire({ depuis: "2026-10-20T00:00:00+02:00", sortie: join(tmp, sortieParc), profils: [join(tmp, "projects-parc")], anonymiser, masque: m });
    // Témoin de fixture : sans le masque, le nom sort bien (champ projet et textes) ; la fixture porte le défaut.
    const sansMasque = lire(entree("out-sans", { texte: (t) => t, projet: (p) => p }), "s-z");
    if (!JSON.stringify(sansMasque).includes("Projet-Fictif-Zeta")) casse.push("témoin : sans masque, le nom hors table devrait sortir (fixture sans défaut)");
    // Rouge : avec le masque, le nom hors table ne sort ni dans le champ projet ni dans les textes, quelle que soit la casse.
    const rp = entree("out-parc", masque), z = lire(rp, "s-z");
    if (/zeta/i.test(JSON.stringify(z)) || z.projet !== "C--dev-(produit hors table)" || !z.messages[0].texte.startsWith("Corrige (produit hors table), puis (produit hors table) sous")) casse.push(`un nom de produit hors table sort de l'extrait, ${JSON.stringify(z)}`);
    // Témoin : le produit de la table est rendu par son pseudonyme, le dépôt de l'écosystème reste nommé (texte et projet).
    const e = lire(rp, "s-e");
    if (!z.messages[0].texte.endsWith("sous digit-ai-forge-fictive et Produit-99") || e.projet !== "C--dev-digit-ai-forge-fictive" || e.messages[0].texte !== "Voir digit-ai-forge-fictive") casse.push(`produit de la table au pseudonyme et dépôt de l'écosystème nommé attendus, ${JSON.stringify([z.messages[0].texte, e.projet, e.messages[0].texte])}`);
    // Source absente refusée : sans pseudonymeur, sans parc lisible, ou sans masque, l'extraction n'écrit rien.
    const refuse = (f) => { try { f(); return false; } catch { return true; } };
    if (!refuse(() => masqueurParc(racinePilot, undefined, estPublic)) || !refuse(() => masqueurParc(join(tmp, "absent", "digit-ai-factory"), pseudoParc, estPublic)) || !refuse(() => entree("out-refus", undefined)) || existsSync(join(tmp, "out-refus"))) casse.push("source absente : pseudonymeur manquant, parc illisible et masque manquant doivent refuser sans rien écrire");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(JSON.stringify({ outil: "extraire", self_test: casse.length ? "FAIL" : "PASS", cas: 14, casse }));
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
    const { pseudonymeProduit } = await import(pathToFileURL(join(racine, "scripts", "lib-pseudonyme-produit.mjs")).href);
    const { estDepotEcosysteme } = await import(pathToFileURL(join(racine, "scripts", "lib-parc.mjs")).href);
    const masque = masqueurParc(racine, pseudonymeProduit, estDepotEcosysteme);
    const p = valeur(args, "--profils");
    const profils = p ? p.split(";") : [join(homedir(), ".claude", "projects"), join(homedir(), ".claude-b", "projects")];
    console.log(JSON.stringify({ outil: "extraire", ...extraire({ depuis, jusqu: valeur(args, "--jusqu") || null, sortie, exclure: valeur(args, "--exclure") || process.env.CLAUDE_CODE_SESSION_ID || null, profils, anonymiser, masque }) }));
  } catch (e) { console.log(JSON.stringify({ outil: "extraire", refus: e.message })); process.exit(1); }
}
