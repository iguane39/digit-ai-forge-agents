#!/usr/bin/env node
/**
 * agents.mjs — la mission 7 de l'œil critique, « agents » : les fiches d'exécution que publie le relevé de la flotte du pilot,
 * regroupées par type, verdict, durée et cause de fin, et au plus 5 pistes par revue, chacune avec le signal mesuré qui la fonde et
 * l'objet de la Factory qu'elle modifierait. Les pistes entrent au registre en candidat par `todo/journaliser.mjs` du pilot, que la
 * session joue d'abord en `--essai` ; au-delà de 5, elles sont consignées sans être versées.
 *
 * Pourquoi il existe. Décision humaine D-219 (e) du 15/11/2026, TF-2563, mandat 20261115b du pilot (lot L3) ; étude
 * `output/03-etudes/Digit-AI - Étude - Amelioration continue des agents par leurs lecons - 20261114d.md` du pilot, sections Q3 et Q5.
 * Depuis le 15/11/2026, le hook de fin d'agent écrit une fiche par agent (lot L1) et `scripts/relever-flotte.mjs` les publie avec leur
 * durée, leur cause de fin et leurs verdicts notés (lot L2, version 1.3.0). Aucune boucle ne tirait de ces mesures une candidature :
 * l'étude comptait 300 sous-agents en un mois (son relevé 1), lus seulement au relevé d'ouverture du pilot.
 *
 * CE QU'IL LIT : la sortie `--json` de `relever-flotte.mjs`, jouée avec `--depuis` et jamais avec `--journal` (la consignation de fin
 * de campagne n'est pas la sienne), ou le relevé que `--releve` désigne ; le registre `todo/TODO.jsonl` et son archive, pour frapper
 * les identifiants à la suite et ne pas reverser une piste que le registre porte déjà ; son journal.
 * CE QU'IL ÉCRIT : dans le dossier de travail de la session (`--sortie`, refusé dans le pilot), `pistes-agents.json`, les créations à
 * verser, et `revue-agents.json`, la revue entière ; au pilot, avec `consigner` seulement, une ligne par revue dans son journal à ajout
 * seul, `todo/oeil-critique-pistes-agents.jsonl`. Le registre ne s'écrit que par `todo/journaliser.mjs`.
 *
 * LES RÈGLES, un jeu fermé. Chaque piste reprend une ligne du tableau Q3 de l'étude (type de piste, objet cible, mécanisme existant :
 * mot pour mot, sans les mesures datées de l'étude) et le signal du relevé qui la fonde. Aucun seuil n'est posé ici, chacun vient du
 * relevé ou du skill :
 *   1. echec-recurrent:<type> : 2 agents au moins du type finis en abandonne, timeout ou erreur, ou dont le livrable est noté FAIL
 *      (un agent compte une fois) ; 2, c'est la « barrière dès la 2e fois » de l'étape 4 du skill ;
 *   2. consigne-derive:<type> : 2 agents au moins du type dont la relecture d'intention est notée « derive » ;
 *   3. coordination-simultaneite : le pic de sous-agents simultanés d'une session atteint la limite par défaut que le relevé cite
 *      (l'étude fait couvrir la coordination par la simultanéité, section 5, « questions du demandeur rejouées ») ;
 *   4. type-sous-utilise : le critère du relevé sur la part des appels vers un agent nommé n'est pas tenu ;
 *   5. opus-sans-effort : le critère du relevé « 0 délégation Opus sans effort déclaré » n'est pas tenu ;
 *   6. duree-longue:<type> : la moitié au moins des agents du type dont la durée est connue, et 2 au moins, durent le seuil du relevé
 *      (`seuil_min`, 17 minutes, à partir duquel le suivi publie un agent) ou plus. Le relevé ne publie pas les jetons d'un agent : la
 *      durée est la seule consommation qu'il mesure agent par agent, et la garde de qualité de l'étude (Q4 : la part des livrables
 *      PASS) se dit avec elle.
 * Un critère du relevé hors du tableau Q3 (la génération des modèles servis) est rendu, jamais dérivé. LE RANG : d'abord les pistes que
 * la revue précédente du poste a consignées ou n'a pas versées, si elles sont encore dérivées ; puis l'ordre des règles, la qualité
 * avant le délai (Q4) ; puis le poids du signal. Au plus 5 versées (`PLAFOND`, étude Q5) ; au-delà, consignées. Une piste dont la clé
 * porte au registre un item candidat, décidé, en cours ou écarté n'est ni versée ni comptée : un refus tranché ne se repaye pas
 * (TF-0157). Corrigé ou archivé, l'item ne retient plus la piste : son signal est revenu.
 *
 * Usage (sortie JSON, exit 0 / 1 refus / 2 usage) :
 *   node agents.mjs pistes --depuis <iso> --sortie <dossier de travail> [--releve <relevé.json>] [--pilot <chemin>]
 *       → regroupements, pistes classées (a_verser, a_consigner, deja_au_registre), les deux fichiers, les commandes qui suivent.
 *   node agents.mjs consigner --revue <revue-agents.json> [--pilot <chemin>]
 *       → après journaliser : une ligne au journal ; une piste « a_verser » n'est dite versée que si son identifiant est au registre
 *         avec sa clé. Refuse une revue déjà consignée.
 *   node agents.mjs etat [--pilot <chemin>]
 *       → la dernière revue du poste, ses pistes en attente, le bilan des revues.
 *   node agents.mjs --self-test [--pilot <chemin>]
 * NON JUGÉ (déclaré) : la justesse d'une piste et de son score d'entrée, revus à la décision humaine ; les fiches que le relevé ne lit
 * pas (autre poste, produit rangé hors du parc) ; un agent sans type, compté aux regroupements et dans aucune piste par type ; la cause
 * d'un échec, qu'aucune transcription n'éclaire ici ; deux revues versées au même instant, que départage `oracle-todo` (R2 : la seconde
 * création d'un même identifiant fait reprendre le registre par `journaliser.mjs`).
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pilot, poste, valeur } from "./lib.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
export const PLAFOND = 5;
export const RECURRENCE = 2;
export const CAUSES_ECHEC = Object.freeze(["abandonne", "timeout", "erreur"]);
const CAUSES = ["fini", ...CAUSES_ECHEC];
/** Les statuts d'un item qui retiennent sa piste : ouvert, ou écarté. */
export const RETIENNENT = new Set(["candidat", "decide", "en_cours", "ecarte"]);
export const TYPE_INCONNU = "(type inconnu)";
export const ETUDE = "output/03-etudes/Digit-AI - Étude - Amelioration continue des agents par leurs lecons - 20261114d.md";
export const fichierPistes = (racine) => join(racine, "todo", "oeil-critique-pistes-agents.jsonl");

/** Les lignes du tableau Q3 de l'étude, mot pour mot ; les mesures datées du 14/11/2026 sont retirées. */
export const Q3 = Object.freeze({
  type: { piste: "Un type d'agent manque ou est sous-utilisé", objet: "Définition d'agent (`gabarits/flotte/*.yaml` → `compiler-flotte.mjs` → `.claude/agents/`)", mecanisme: "`relever-flotte.mjs` mesure déjà la part nommée" },
  echec: { piste: "Un agent échoue de façon récurrente", objet: "Leçon dans `references/LECONS.json` (rappel au geste) ou contrat `gabarits/AGENT-CAMPAGNE.md` (règle du contrat)", mecanisme: "`hook-lecons.mjs` lit la table et rappelle ; `lecons.mjs --recidives` croise rappels et frictions" },
  jetons: { piste: "Un agent consomme trop de jetons", objet: "Règle de lancement dans `hook-flotte.mjs` (seuil, avertissement) ou effort dans la définition", mecanisme: "`relever-flotte.mjs` mesure les jetons en médiane" },
  consigne: { piste: "Une consigne d'agent dérive", objet: "Règle de la relecture d'intention (`references/RELECTURE-INTENTION-REGLES.json`)", mecanisme: "`relecture-intention.mjs` juge déjà les consignes" },
  coordination: { piste: "La coordination entre agents est déficiente", objet: "Contrat de campagne (`gabarits/AGENT-CAMPAGNE.md`) ou oracle de cohérence", mecanisme: "La relecture d'intention a un point « cohérence » (A-3 de la v1.2.0)" },
});

/** Les règles dans l'ordre du rang, la qualité avant le délai (étude, Q4). Le score d'entrée se revoit à la décision. */
export const REGLES = Object.freeze([
  { id: "echec-recurrent", q3: "echec", score: { gain: 3, preuve: 3, effort: 2 } },
  { id: "consigne-derive", q3: "consigne", score: { gain: 3, preuve: 3, effort: 2 } },
  { id: "coordination-simultaneite", q3: "coordination", score: { gain: 2, preuve: 2, effort: 2 } },
  { id: "type-sous-utilise", q3: "type", score: { gain: 3, preuve: 3, effort: 3 } },
  { id: "opus-sans-effort", q3: "jetons", score: { gain: 2, preuve: 3, effort: 2 } },
  { id: "duree-longue", q3: "jetons", score: { gain: 2, preuve: 2, effort: 2 } },
]);

/** La valeur du score d'entrée, par la formule de `todo/ingerer-lot.mjs` du pilot : gain × preuve ÷ effort, au dixième. */
export const valeurDuScore = ({ gain, preuve, effort }) => Math.round(((gain * preuve) / effort) * 10) / 10;

const lignesJson = (f) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : []);
/** La médiane de `relever-flotte.mjs` : l'élément du milieu, le plus haut des deux pour un compte pair. */
const mediane = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const minutes = (s) => (Number.isFinite(s) ? `${Math.round(s / 60)} min` : "durée inconnue");
const pour100 = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)} %` : "part inconnue");
const pad = (n) => String(n).padStart(2, "0");
const jourLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Une liste d'identifiants bornée à 10, son total toujours dit (aucune borne d'affichage silencieuse). */
const BORNE_LISTE = 10;
const borner = (ids) => ({ nombre: ids.length, liste: ids.slice(0, BORNE_LISTE), ...(ids.length > BORNE_LISTE ? { borne: BORNE_LISTE } : {}) });
const dire = (b) => (b.nombre ? `${b.liste.join(", ")}${b.borne ? ` (${b.borne} sur ${b.nombre})` : ""}` : "aucun");
const estEchec = (a) => CAUSES_ECHEC.includes(a.cause_fin) || a.verdict_livrable === "FAIL";

/** La version du skill, lue à son frontmatter : une seule source. */
export function versionDuSkill(skillMd = join(ICI, "..", "SKILL.md")) {
  try { const m = /^\s*version:\s*["']?([\d.]+)/m.exec(readFileSync(skillMd, "utf8").split("---")[1] || ""); return m ? m[1] : null; } catch { return null; }
}

/**
 * Les types publiables : les agents de la flotte du pilot (`gabarits/flotte/*.yaml`), ses agents intégrés fixes (`INTEGRES_FIXES` de
 * `oracles/hook-flotte.mjs`), `generique` et `propre`. Tout autre nom se publie `propre`, la règle de la fiche (`lib-fiches-agents.mjs`) :
 * il pourrait porter celui d'un produit, et le registre est publié. Une flotte illisible refuse la revue plutôt que de tout confondre.
 */
export async function typesConnus(racine) {
  const noms = new Set();
  try { for (const f of readdirSync(join(racine, "gabarits", "flotte"))) if (f.endsWith(".yaml")) noms.add(f.slice(0, -5)); } catch { /* dit ci-dessous */ }
  if (!noms.size) throw new Error("flotte du pilot illisible (gabarits/flotte/*.yaml) : sans elle, aucun type ne se publie, revue refusée");
  const { INTEGRES_FIXES } = await import(pathToFileURL(join(racine, "oracles", "hook-flotte.mjs")).href);
  for (const n of INTEGRES_FIXES) noms.add(n);
  return new Set([...noms, "generique", "propre"]);
}

/** Un relevé lisible par la mission : une sortie `--json` de `relever-flotte.mjs` 1.3.0 ou plus, qui publie les fiches. */
export function controlerReleve(r) {
  if (!r || typeof r !== "object" || r.outil !== "relever-flotte") throw new Error("relevé illisible : ce n'est pas une sortie --json de relever-flotte.mjs");
  if (!Array.isArray(r.fiches_agents) || !Number.isFinite(r.indicateurs?.fiches_agents?.duree?.seuil_min)) {
    throw new Error(`relevé de relever-flotte ${r.version ?? "?"} sans fiches d'exécution : la mission agents exige la 1.3.0 ou plus (lot L2 du mandat 20261115b)`);
  }
}

/** Joue le relevé de la flotte du pilot, en lecture seule : `--depuis` et `--json`, jamais `--journal`. */
export function jouerReleve(racine, depuis) {
  const r = spawnSync(process.execPath, [join(racine, "scripts", "relever-flotte.mjs"), "--depuis", depuis, "--json"], { cwd: racine, encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`relever-flotte.mjs a rendu ${r.status === null ? "sans code (délai de 180 s dépassé)" : `le code ${r.status}`} : ${String(r.stderr || r.stdout || "").trim().slice(0, 200)}`);
  try { const s = String(r.stdout); return JSON.parse(s.slice(s.indexOf("{"))); } catch { throw new Error("sortie de relever-flotte.mjs illisible : aucune piste ne se dérive d'un relevé qu'on ne lit pas"); }
}

/** Les fiches regroupées, pour l'ensemble et par type : cause de fin, verdicts, durée, échecs et dérives (identifiants complets). */
export function regrouper(agents, seuilMin, types) {
  const seuilS = seuilMin * 60;
  const publie = (t) => (t === null || t === undefined || t === "" ? TYPE_INCONNU : types.has(t) ? t : "propre");
  const neuf = () => ({ agents: 0, cause_fin: { fini: 0, abandonne: 0, timeout: 0, erreur: 0, inconnue: 0 }, verdict_livrable: { PASS: 0, FAIL: 0, non_note: 0 },
    verdict_relecture: { sert: 0, derive: 0, non_note: 0 }, duree: { mediane_s: null, au_seuil_ou_plus: 0, sous_le_seuil: 0, inconnue: 0 },
    duree_echecs_s: 0, durees: [], echecs: [], derives: [], longs: [] });
  const tout = neuf(), parType = {};
  for (const a of agents) {
    const type = publie(a.type);
    parType[type] ||= neuf();
    const d = Number.isFinite(a.duree_s) ? a.duree_s : null;
    const id = typeof a.agent_id === "string" && a.agent_id ? a.agent_id : "(sans identifiant)";
    for (const g of [tout, parType[type]]) {
      g.agents++;
      g.cause_fin[CAUSES.includes(a.cause_fin) ? a.cause_fin : "inconnue"]++;
      g.verdict_livrable[a.verdict_livrable === "PASS" || a.verdict_livrable === "FAIL" ? a.verdict_livrable : "non_note"]++;
      g.verdict_relecture[a.verdict_relecture === "sert" || a.verdict_relecture === "derive" ? a.verdict_relecture : "non_note"]++;
      if (d === null) g.duree.inconnue++;
      else { g.durees.push(d); g.duree[d >= seuilS ? "au_seuil_ou_plus" : "sous_le_seuil"]++; }
      if (estEchec(a)) { g.echecs.push(id); g.duree_echecs_s += d ?? 0; }
      if (a.verdict_relecture === "derive") g.derives.push(id);
      if (d !== null && d >= seuilS && a.cause_fin !== "fini") g.longs.push(id);
    }
  }
  return { seuil_min: seuilMin, tout, par_type: parType };
}

const vueGroupe = (g) => {
  const { durees, echecs, derives, longs, ...reste } = g;
  return { ...reste, duree: { ...g.duree, mediane_s: mediane(durees) }, echecs: borner(echecs), derives: borner(derives), longs_non_finis: borner(longs) };
};
/** Les regroupements tels qu'ils se rendent : listes d'identifiants bornées, totaux dits. */
export const vueRegroupements = (G) => ({ seuil_min: G.seuil_min, ensemble: vueGroupe(G.tout), par_type: Object.fromEntries(Object.entries(G.par_type).map(([t, g]) => [t, vueGroupe(g)])) });

/** Les pistes que le relevé fonde, avant le rang : { pistes, signaux_hors_q3, non_jugees }. */
export function deriver(rapport, G) {
  const I = rapport.indicateurs || {}, S = I.simultaneite || {};
  const pistes = [], horsQ3 = [], nonJugees = [];
  const ajouter = (regle, cle, titre, signal, constat, poids) => {
    const r = REGLES.find((x) => x.id === regle);
    pistes.push({ cle, regle, q3: Q3[r.q3], titre, signal, constat, poids, score: { ...r.score, valeur: valeurDuScore(r.score) } });
  };
  for (const [type, g] of Object.entries(G.par_type)) {
    if (type === TYPE_INCONNU) continue;
    const nom = `« ${type} »`;
    if (g.echecs.length >= RECURRENCE) {
      const b = borner(g.echecs);
      ajouter("echec-recurrent", `echec-recurrent:${type}`, `Agents : le type ${nom} échoue de façon récurrente (${g.echecs.length} échecs sur ${g.agents} agents)`,
        { type, agents: g.agents, echecs: g.echecs.length, abandonne: g.cause_fin.abandonne, timeout: g.cause_fin.timeout, erreur: g.cause_fin.erreur, livrable_fail: g.verdict_livrable.FAIL, duree_cumulee_s: g.duree_echecs_s, agents_en_echec: b },
        `type ${nom} : ${g.echecs.length} agents en échec sur ${g.agents} (abandonne ${g.cause_fin.abandonne}, timeout ${g.cause_fin.timeout}, erreur ${g.cause_fin.erreur}, livrable FAIL ${g.verdict_livrable.FAIL} ; un agent compte une fois), ${minutes(g.duree_echecs_s)} cumulées ; agents ${dire(b)}`,
        g.echecs.length);
    }
    if (g.derives.length >= RECURRENCE) {
      const b = borner(g.derives), notees = g.verdict_relecture.sert + g.verdict_relecture.derive;
      ajouter("consigne-derive", `consigne-derive:${type}`, `Agents : les consignes du type ${nom} dérivent (${g.derives.length} relectures « derive » sur ${notees} notées)`,
        { type, relectures_notees: notees, derive: g.derives.length, agents_en_derive: b },
        `type ${nom} : ${g.derives.length} relectures d'intention notées « derive » sur ${notees} notées ; agents ${dire(b)}`, g.derives.length);
    }
    const connues = g.durees.length, longs = g.duree.au_seuil_ou_plus;
    if (longs >= RECURRENCE && longs * 2 >= connues) {
      const notes = g.verdict_livrable.PASS + g.verdict_livrable.FAIL;
      const garde = notes ? `${g.verdict_livrable.PASS} livrable(s) PASS sur ${notes} noté(s), ${pour100(g.verdict_livrable.PASS / notes)}` : "non mesurée, aucun livrable de ce type n'est noté";
      ajouter("duree-longue", `duree-longue:${type}`, `Agents : le type ${nom} dure ${G.seuil_min} min ou plus pour ${longs} agents sur ${connues}`,
        { type, duree_connue: connues, au_seuil_ou_plus: longs, seuil_min: G.seuil_min, mediane_s: mediane(g.durees), garde_qualite: notes ? { livrable_pass: g.verdict_livrable.PASS, livrables_notes: notes } : null },
        `type ${nom} : ${longs} agents sur ${connues} de durée connue à ${G.seuil_min} min ou plus (médiane ${minutes(mediane(g.durees))}) ; le relevé ne publie pas les jetons d'un agent, la durée est sa consommation mesurée ; garde de qualité (étude, Q4) : ${garde}`,
        longs);
    }
  }
  const critere = (re) => (Array.isArray(rapport.criteres) ? rapport.criteres : []).find((c) => re.test(String(c?.critere || "")));
  const cNomme = critere(/agent nommé/i), cOpus = critere(/opus sans effort/i);
  if (!cNomme) nonJugees.push({ regle: "type-sous-utilise", motif: "le relevé ne porte pas le critère de la part des appels vers un agent nommé" });
  else if (cNomme.tenu === null) nonJugees.push({ regle: "type-sous-utilise", motif: `critère « ${cNomme.critere} » non jugé par le relevé (aucun appel sur la période)` });
  else if (cNomme.tenu === false) {
    const generiques = G.par_type.generique?.agents ?? 0, propres = G.par_type.propre?.agents ?? 0;
    ajouter("type-sous-utilise", "type-sous-utilise", `Agents : ${pour100(I.part_nommee)} des appels vont à un agent nommé, critère du relevé non tenu`,
      { critere: cNomme.critere, part_nommee: I.part_nommee, appels: I.appels, vers_agent_nomme: I.appels_vers_agent_nomme, hors_flotte: I.appels_hors_flotte, derogation_dite: I.appels_avec_derogation, fiches_generiques: generiques, fiches_propres: propres },
      `critère « ${cNomme.critere} » non tenu : ${I.appels_vers_agent_nomme} appels sur ${I.appels} vers un agent nommé (${pour100(I.part_nommee)}), ${I.appels_hors_flotte} hors flotte, ${I.appels_avec_derogation} avec dérogation dite ; fiches : ${generiques} d'agent générique, ${propres} d'agent propre`,
      Number(I.appels_hors_flotte) || 0);
  }
  if (!cOpus) nonJugees.push({ regle: "opus-sans-effort", motif: "le relevé ne porte pas le critère des délégations Opus sans effort" });
  else if (cOpus.tenu === false) {
    ajouter("opus-sans-effort", "opus-sans-effort", `Agents : ${I.delegations_opus_sans_effort} délégations Opus sans effort déclaré`,
      { critere: cOpus.critere, delegations_opus_sans_effort: I.delegations_opus_sans_effort, appels: I.appels, mediane_relus_par_sous_agent: I.mediane_relus_par_sous_agent ?? null },
      `critère « ${cOpus.critere} » non tenu : ${I.delegations_opus_sans_effort} délégations Opus sans effort sur ${I.appels} appels ; sans effort déclaré, l'agent hérite de celui de la session (TF-1557) ; médiane de ${I.mediane_relus_par_sous_agent ?? "?"} jetons relus par sous-agent`,
      Number(I.delegations_opus_sans_effort) || 0);
  }
  for (const c of Array.isArray(rapport.criteres) ? rapport.criteres : []) {
    if (c === cNomme || c === cOpus || c?.tenu !== false) continue;
    horsQ3.push({ critere: c.critere, tenu: false, ...(/génération/i.test(String(c.critere)) ? { valeur: I.reponses_hors_generation ?? null } : {}), motif: "hors du tableau Q3 de l'étude : rendu, jamais dérivé" });
  }
  if (!Number.isFinite(S.pic_max) || !Number.isFinite(S.limite_par_defaut)) nonJugees.push({ regle: "coordination-simultaneite", motif: "le relevé ne porte pas le pic de simultanéité et sa limite par défaut" });
  else if (S.pic_max >= S.limite_par_defaut) {
    ajouter("coordination-simultaneite", "coordination-simultaneite", `Agents : une session atteint ${S.pic_max} sous-agents simultanés, la limite par défaut d'une session (${S.limite_par_defaut})`,
      { pic_max: S.pic_max, limite_par_defaut: S.limite_par_defaut, session_pic_max: S.session_pic_max ?? null, sessions_a_10_ou_plus: S.sessions_a_10_ou_plus ?? null, sessions_avec_sous_agents: S.sessions_avec_sous_agents ?? null },
      `pic de ${S.pic_max} sous-agents simultanés (session ${S.session_pic_max ?? "?"}) pour une limite par défaut de ${S.limite_par_defaut} ; ${S.sessions_a_10_ou_plus ?? "?"} session(s) à 10 ou plus sur ${S.sessions_avec_sous_agents ?? "?"} ; un sous-agent en attente compte comme actif, le pic peut être surestimé (relevé)`,
      S.pic_max);
  }
  return { pistes, signaux_hors_q3: horsQ3, non_jugees: nonJugees };
}

/** Le rang des pistes et leur sort : a_verser (PLAFOND au plus), a_consigner, ou deja_au_registre (ni versée ni comptée). */
export function classer(pistes, { enAttente = new Set(), retenues = new Map() } = {}) {
  const ordre = new Map(REGLES.map((r, i) => [r.id, i]));
  const triees = [...pistes].sort((a, b) => (Number(enAttente.has(b.cle)) - Number(enAttente.has(a.cle))) || (ordre.get(a.regle) - ordre.get(b.regle)) || (b.poids - a.poids) || a.cle.localeCompare(b.cle));
  let versables = 0;
  return triees.map((p, i) => {
    const base = { ...p, rang: i + 1, en_attente: enAttente.has(p.cle) };
    const item = retenues.get(p.cle);
    if (item) return { ...base, statut: "deja_au_registre", item: item.id, item_statut: item.statut };
    versables++;
    return { ...base, statut: versables <= PLAFOND ? "a_verser" : "a_consigner" };
  });
}

/** L'état courant de chaque item du registre : ses événements fusionnés dans l'ordre. */
const etatsDuRegistre = (racine) => {
  const etats = new Map();
  for (const e of lignesJson(join(racine, "todo", "TODO.jsonl"))) if (e.id) etats.set(e.id, { ...(etats.get(e.id) || {}), ...e });
  return etats;
};

/** Les items du registre qui portent une piste de la mission et la retiennent : clé → { id, statut } ; le dernier item d'une clé l'emporte. */
export function pistesRetenues(racine) {
  const parCle = new Map();
  for (const e of etatsDuRegistre(racine).values()) {
    const cle = e.piste_agents && typeof e.piste_agents.cle === "string" ? e.piste_agents.cle : null;
    if (cle) parCle.set(cle, { id: e.id, statut: e.statut });
  }
  return new Map([...parCle].filter(([, v]) => RETIENNENT.has(v.statut)));
}

/** Les identifiants suivants, frappés à la suite du plus grand des actifs et de l'archive (la forme de `todo/ingerer-lot.mjs`). */
export function identifiantsSuivants(racine, n) {
  const ids = [];
  for (const f of ["TODO.jsonl", "TODO-ARCHIVE.jsonl"]) for (const e of lignesJson(join(racine, "todo", f))) { const m = /^TF-(\d{4})$/.exec(String(e.id || "")); if (m) ids.push(parseInt(m[1], 10)); }
  const prochain = (ids.length ? Math.max(...ids) : 0) + 1;
  return Array.from({ length: n }, (_, i) => `TF-${String(prochain + i).padStart(4, "0")}`);
}

export const lireJournal = (racine) => lignesJson(fichierPistes(racine));
/** Les clés que la dernière revue du poste a consignées ou n'a pas versées : elles passent en tête de la revue suivante. */
export function clesEnAttente(journal, nomPoste) {
  const revues = journal.filter((e) => e.type === "revue" && e.poste === nomPoste);
  const derniere = revues[revues.length - 1];
  return new Set(derniere ? derniere.pistes.filter((p) => p.statut === "consignee" || p.statut === "non_versee").map((p) => p.cle) : []);
}

/** La création d'une piste au registre : les champs de R4 d'`oracle-todo.mjs`, la nature `opportunite`, aucun `ts` (stampé par journaliser). */
export function evenement(p, id, ctx) {
  const contenu = [
    `Piste de la mission « agents » de l'œil critique, revue du ${ctx.revue_du} sur le poste ${ctx.poste}.`,
    `Signal mesuré : ${p.constat}. Relevé : relever-flotte ${ctx.releve.version} --json depuis le ${String(ctx.depuis).slice(0, 10)}, ${ctx.releve.agents} agent(s) publié(s) d'après ${ctx.releve.fichiers_lus} fichier(s) de fiches.`,
    `Objet de la Factory qu'elle modifierait (étude 20261114d, section Q3, « ${p.q3.piste} ») : ${p.q3.objet}. Mécanisme existant : ${p.q3.mecanisme}.`,
    "La décision reste humaine : la piste ne modifie rien (D-219 (e), TF-2563).",
  ].join(" ");
  return {
    ev: "creation", id, titre: p.titre, contenu, nature: "opportunite",
    demandeur: `pilot, œil critique (mission agents) du ${ctx.revue_du}`,
    source: `oeil-critique ${ctx.skill ?? "?"} (scripts/agents.mjs), relevé relever-flotte ${ctx.releve.version} ; étude ${ETUDE}, section Q3`,
    date_demande: ctx.revue_du, forges_cibles_initiales: ["digit-ai-factory"], score: p.score, statut: "candidat",
    piste_agents: { cle: p.cle, regle: p.regle, revue: ctx.revue, poste: ctx.poste },
  };
}

const publier = (p) => {
  const { rang, cle, regle, statut, id, item, item_statut, en_attente, titre, q3, signal, constat, poids, score } = p;
  return { rang, cle, regle, statut, ...(id ? { id } : {}), ...(item ? { item, item_statut } : {}), en_attente, titre, q3, signal, constat, poids, score };
};

/** La revue : relevé, regroupements, pistes classées, et les deux fichiers du dossier de travail. N'écrit rien au pilot. */
export function pistes(racine, { depuis, sortie, releve = null, types, maintenant = new Date(), nomPoste = poste(), jouer = jouerReleve, skill = versionDuSkill() } = {}) {
  if (!Number.isFinite(Date.parse(depuis))) throw new Error("--depuis attend une date ISO, la date de départ du repère");
  if (!sortie || !String(sortie).trim()) throw new Error("--sortie requis : le dossier de travail de la session, hors du pilot");
  const dossier = resolve(sortie), rel = relative(resolve(racine), dossier);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error(`--sortie désigne un dossier du pilot (${dossier}) : la revue s'écrit dans le dossier de travail de la session, jamais dans un dépôt`);
  if (!(types instanceof Set) || !types.size) throw new Error("types publiables absents : revue refusée plutôt que de publier un nom de type");
  const rapport = releve ? JSON.parse(readFileSync(releve, "utf8")) : jouer(racine, depuis);
  controlerReleve(rapport);
  const F = rapport.indicateurs.fiches_agents;
  const G = regrouper(rapport.fiches_agents, F.duree.seuil_min, types);
  const d = deriver(rapport, G);
  const classees = classer(d.pistes, { enAttente: clesEnAttente(lireJournal(racine), nomPoste), retenues: pistesRetenues(racine) });
  const aVerser = classees.filter((p) => p.statut === "a_verser");
  identifiantsSuivants(racine, aVerser.length).forEach((id, i) => { aVerser[i].id = id; });
  const revue = maintenant.toISOString();
  const ctx = { revue, revue_du: jourLocal(maintenant), poste: nomPoste, depuis: rapport.depuis, skill, releve: { version: rapport.version ?? null, verdict: rapport.verdict ?? null, fichiers_lus: F.fichiers_lus ?? null, agents: F.agents ?? rapport.fiches_agents.length } };
  mkdirSync(dossier, { recursive: true });
  const fEv = join(dossier, "pistes-agents.json"), fRevue = join(dossier, "revue-agents.json");
  // Rien à verser : un tableau vide, que journaliser.mjs refuse (« aucun événement à journaliser ») — jamais un fichier d'une revue antérieure.
  writeFileSync(fEv, JSON.stringify(aVerser.map((p) => evenement(p, p.id, ctx)), null, 1) + "\n", "utf8");
  const journaliser = join(racine, "todo", "journaliser.mjs"), moi = join(ICI, "agents.mjs");
  const consigner = `node "${moi}" consigner --revue "${fRevue}"`;
  const sortieJson = {
    outil: "agents", skill, revue, revue_du: ctx.revue_du, poste: nomPoste, depuis: rapport.depuis, releve: ctx.releve,
    regroupements: vueRegroupements(G), plafond: PLAFOND, pistes: classees.map(publier),
    bilan: { derivees: classees.length, a_verser: aVerser.length, a_consigner: classees.filter((p) => p.statut === "a_consigner").length, deja_au_registre: classees.filter((p) => p.statut === "deja_au_registre").length },
    signaux_hors_q3: d.signaux_hors_q3, non_jugees: d.non_jugees,
    fichiers: { evenements: fEv, revue: fRevue },
    commandes: aVerser.length ? [`node "${journaliser}" --fichier "${fEv}" --essai`, `node "${journaliser}" --fichier "${fEv}"`, consigner] : [consigner],
    non_juge: ["la justesse d'une piste et de son score d'entrée, revus à la décision humaine", "les fiches que le relevé ne lit pas : autre poste, produit rangé hors du parc", "un agent sans type : compté aux regroupements, dans aucune piste par type", "la cause d'un échec, qu'aucune transcription n'éclaire ici"],
  };
  writeFileSync(fRevue, JSON.stringify(sortieJson, null, 1) + "\n", "utf8");
  return sortieJson;
}

/** Consigne une revue au journal, après journaliser : versée (identifiant au registre avec sa clé), non versée, consignée, déjà au registre. */
export function consigner(racine, { revue: chemin, maintenant = new Date() } = {}) {
  if (!chemin) throw new Error("--revue requis : le fichier revue-agents.json que « pistes » a écrit");
  let r; try { r = JSON.parse(readFileSync(chemin, "utf8")); } catch { throw new Error(`revue illisible : ${chemin}`); }
  if (!r || r.outil !== "agents" || !Array.isArray(r.pistes) || !r.revue) throw new Error("ce fichier n'est pas une revue de « agents.mjs pistes »");
  if (lireJournal(racine).some((e) => e.type === "revue" && e.revue === r.revue)) throw new Error(`la revue du ${r.revue} est déjà consignée : une revue ne se consigne qu'une fois`);
  const etats = etatsDuRegistre(racine);
  const lignes = r.pistes.map((p) => {
    const base = { cle: p.cle, regle: p.regle, rang: p.rang, titre: p.titre, objet: p.q3?.objet ?? null, signal: p.signal };
    if (p.statut === "a_verser") {
      const e = etats.get(p.id);
      if (e && e.piste_agents?.cle === p.cle) return { ...base, statut: "versee", id: p.id };
      return { ...base, statut: "non_versee", id: null, motif: e ? `${p.id} porte un autre item au registre` : `${p.id} absent du registre : journaliser.mjs ne l'a pas écrit` };
    }
    if (p.statut === "deja_au_registre") return { ...base, statut: "deja_au_registre", id: p.item ?? null };
    return { ...base, statut: "consignee", id: null };
  });
  const compte = (s) => lignes.filter((p) => p.statut === s).length;
  const ligne = { type: "revue", revue: r.revue, poste: r.poste, depuis: r.depuis, skill: r.skill, releve: r.releve, pistes: lignes,
    bilan: { derivees: lignes.length, versees: compte("versee"), non_versees: compte("non_versee"), consignees: compte("consignee"), deja_au_registre: compte("deja_au_registre") },
    ts: maintenant.toISOString() };
  appendFileSync(fichierPistes(racine), JSON.stringify(ligne) + "\n", "utf8");
  return ligne;
}

/** La dernière revue du poste, ses pistes en attente, le bilan de toutes les revues. */
export function etat(racine, nomPoste = poste()) {
  const revues = lireJournal(racine).filter((e) => e.type === "revue");
  const duPoste = revues.filter((e) => e.poste === nomPoste);
  const d = duPoste[duPoste.length - 1] || null;
  const somme = (k) => revues.reduce((s, e) => s + (Number(e.bilan?.[k]) || 0), 0);
  return {
    poste: nomPoste, derniere_revue: d ? { revue: d.revue, depuis: d.depuis, bilan: d.bilan } : null,
    en_attente: d ? d.pistes.filter((p) => p.statut === "consignee" || p.statut === "non_versee").map(({ cle, titre, statut }) => ({ cle, titre, statut })) : [],
    bilan: { revues: revues.length, revues_du_poste: duPoste.length, versees: somme("versees"), non_versees: somme("non_versees"), consignees: somme("consignees") },
  };
}

// ── Self-test ───────────────────────────────────────────────────────────────────────────────────
async function selfTest(args) {
  const tmp = mkdtempSync(join(tmpdir(), "oeil-critique-agents-"));
  const casse = [];
  let cas = 0, integration = "non jouée";
  const attend = (ok, msg) => { cas++; if (!ok) casse.push(msg); };
  const refuse = (f, quoi, motif) => { cas++; try { f(); casse.push(`accepté à tort : ${quoi}`); } catch (e) { if (motif && !motif.test(e.message)) casse.push(`${quoi} : refusé sans son motif (« ${e.message} »)`); } };
  const ecrire = (f, t) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t); };
  const jsonl = (xs) => xs.map((o) => JSON.stringify(o)).join("\n") + "\n";
  const TYPES = new Set(["campagne", "constructeur", "explorateur", "redacteur", "relecteur", "verificateur", "claude-code-guide", "statusline-setup", "generique", "propre"]);
  const NOM_PRIVE = "Nom-Prive-Banc";
  const M = 60;
  const fiche = (agent_id, type, min, cause_fin, extra = {}) => ({ ts: "2026-11-15T10:00:00.000Z", projet: "digit-ai-factory", type, agent_id, session: "b0000001", modele: "claude-sonnet-5-5", effort: "high",
    duree_s: min === null ? null : min * M, cause_fin, verdict_livrable: null, verdict_relecture: null, partielle: false, ...extra });
  const FICHES = [
    // campagne : 7 agents, 3 en échec (un abandon, une erreur au livrable FAIL comptée une fois, un FAIL fini) ; 3 sur 6 durées connues à 17 min ou plus.
    fiche("c1", "campagne", 2, "fini"), fiche("c2", "campagne", 5, "abandonne"), fiche("c3", "campagne", 18, "erreur", { verdict_livrable: "FAIL" }),
    fiche("c4", "campagne", 25, "fini", { verdict_livrable: "FAIL" }), fiche("c5", "campagne", 35, "fini", { verdict_livrable: "PASS" }),
    fiche("c6", "campagne", null, null, { partielle: true }), fiche("c7", "campagne", 15, "fini"),
    // verificateur : un seul échec (témoin de la récurrence), deux relectures « derive ».
    fiche("v1", "verificateur", 1, "erreur"), fiche("v2", "verificateur", 2, "fini", { verdict_relecture: "derive" }), fiche("v3", "verificateur", 3, "fini", { verdict_relecture: "derive" }),
    // explorateur : 2 agents sur 2 à 17 min ou plus, dont un en timeout (un seul échec).
    fiche("e1", "explorateur", 17, "fini"), fiche("e2", "explorateur", 40, "timeout"),
    // redacteur : 1 long sur 2 (la moitié, mais un seul : témoin de la durée), une seule « derive » (témoin de la dérive).
    fiche("r1", "redacteur", 30, "fini", { verdict_relecture: "derive" }), fiche("r2", "redacteur", 3, "fini", { verdict_relecture: "sert" }),
    // Hors flotte : un type qui porte un nom, un générique, un agent sans type en erreur.
    fiche("x1", NOM_PRIVE, 4, "fini"), fiche("g1", "generique", 4, "fini"), fiche("n1", null, null, "erreur"),
  ];
  const releveBanc = ({ pic = 20, nomme = false, opus = false, sansNomme = false } = {}) => ({
    outil: "relever-flotte", version: "1.3.0", depuis: "2026-11-10T00:00:00.000Z", verdict: "AVERT",
    criteres: [...(sansNomme ? [] : [{ critere: "part des appels vers un agent nommé ≥ 90 %", tenu: nomme }]), { critere: "0 délégation Opus sans effort déclaré", tenu: opus }, { critere: "0 réponse hors génération courante", tenu: false }],
    indicateurs: { appels: 366, appels_vers_agent_nomme: 250, appels_avec_derogation: 35, appels_hors_flotte: 81, part_nommee: 250 / 366, delegations_opus_sans_effort: 34, reponses_hors_generation: 523, mediane_relus_par_sous_agent: 765967,
      simultaneite: { sessions_avec_sous_agents: 30, pic_max: pic, session_pic_max: "0cbc2262", sessions_a_5_ou_plus: 9, sessions_a_10_ou_plus: 2, limite_par_defaut: 20 },
      fiches_agents: { fichiers_lus: 2, agents: FICHES.length, duree: { seuil_min: 17 } } },
    fiches_agents: FICHES,
  });
  let n = 0;
  const racineNeuve = (registre = [], archive = null) => { const r = join(tmp, `pilot-${++n}`); ecrire(join(r, "todo", "TODO.jsonl"), registre.length ? jsonl(registre) : ""); if (archive) ecrire(join(r, "todo", "TODO-ARCHIVE.jsonl"), jsonl(archive)); return r; };
  const revueDe = (racine, opts = {}) => pistes(racine, { depuis: "2026-11-10T00:00:00Z", sortie: join(tmp, `travail-${++n}`), types: TYPES, nomPoste: "poste-banc", jouer: () => releveBanc(opts.releve), maintenant: new Date(Date.parse("2026-11-15T12:00:00.000Z") + n * 1000), skill: "banc" });
  /** Les chaînes d'un objet, à toute profondeur : un octet de contrôle se cherche dans la chaîne, pas dans son JSON, qui l'échappe. */
  const textes = (o) => (typeof o === "string" ? [o] : Array.isArray(o) ? o.flatMap(textes) : o && typeof o === "object" ? Object.values(o).flatMap(textes) : []);
  const cles = (r, statut) => r.pistes.filter((p) => !statut || p.statut === statut).map((p) => p.cle);
  const item = (id, cle, statut = "candidat") => ({ ev: "creation", id, ts: "2026-11-14T09:00:00.000Z", titre: `item ${id}`, contenu: "banc", demandeur: "pilot", source: "banc", date_demande: "2026-11-14", forges_cibles_initiales: ["digit-ai-factory"], score: { gain: 1, preuve: 1, effort: 1, valeur: 1 }, statut, nature: "opportunite", ...(cle ? { piste_agents: { cle } } : {}) });
  try {
    // 1. Regroupements : par type, verdict, durée et cause de fin.
    const r0 = revueDe(racineNeuve());
    const g = r0.regroupements.par_type.campagne, E = r0.regroupements.ensemble;
    attend(g && g.agents === 7 && g.echecs.nombre === 3 && g.cause_fin.abandonne === 1 && g.cause_fin.erreur === 1 && g.cause_fin.inconnue === 1 && g.verdict_livrable.FAIL === 2 && g.verdict_livrable.PASS === 1,
      `regroupement campagne : 7 agents, 3 échecs (l'erreur au livrable FAIL comptée une fois), causes et verdicts attendus, ${JSON.stringify(g)}`);
    attend(g.duree.au_seuil_ou_plus === 3 && g.duree.sous_le_seuil === 3 && g.duree.inconnue === 1 && g.duree.mediane_s === 18 * M, `durées de campagne : 3 à 17 min ou plus, 3 dessous, 1 inconnue, médiane 18 min attendues, ${JSON.stringify(g.duree)}`);
    attend(E.agents === FICHES.length && E.longs_non_finis.nombre === 2 && E.longs_non_finis.liste.join(",") === "c3,e2" && E.verdict_relecture.derive === 3 && r0.regroupements.par_type[TYPE_INCONNU]?.agents === 1,
      `ensemble : 17 agents, 2 longs non finis (c3, e2), 3 « derive », 1 agent sans type attendus, ${JSON.stringify(E)}`);
    // 2. Un type hors de la flotte se publie « propre » : son nom ne sort nulle part (revue, créations).
    const sortis = readFileSync(r0.fichiers.revue, "utf8") + readFileSync(r0.fichiers.evenements, "utf8");
    attend(JSON.stringify(FICHES).includes(NOM_PRIVE) && !sortis.includes(NOM_PRIVE) && r0.regroupements.par_type.propre?.agents === 1, "un type hors flotte sort sous son nom au lieu de « propre »");
    // 3 à 8. Chaque règle : son vert sur la fixture, son témoin rouge à côté.
    const toutes = cles(r0);
    attend(toutes.includes("echec-recurrent:campagne") && !toutes.includes("echec-recurrent:verificateur") && !toutes.includes("echec-recurrent:explorateur"), `échec récurrent : campagne (3) oui, verificateur et explorateur (1 chacun) non, ${toutes}`);
    attend(toutes.includes("consigne-derive:verificateur") && !toutes.includes("consigne-derive:redacteur"), `dérive : verificateur (2) oui, redacteur (1) non, ${toutes}`);
    attend(toutes.includes("duree-longue:explorateur") && toutes.includes("duree-longue:campagne") && !toutes.includes("duree-longue:redacteur"), `durée : explorateur (2 sur 2) et campagne (3 sur 6) oui, redacteur (1 sur 2) non, ${toutes}`);
    const pDuree = r0.pistes.find((p) => p.cle === "duree-longue:explorateur"), pDureeC = r0.pistes.find((p) => p.cle === "duree-longue:campagne");
    attend(/garde de qualité \(étude, Q4\) : non mesurée/.test(pDuree.constat) && /garde de qualité \(étude, Q4\) : 1 livrable\(s\) PASS sur 3 noté\(s\), 33 %/.test(pDureeC.constat), `garde de qualité : « non mesurée » sans livrable noté, « 1 sur 3 » pour campagne, ${pDuree.constat} | ${pDureeC.constat}`);
    attend(toutes.includes("coordination-simultaneite") && !cles(revueDe(racineNeuve(), { releve: { pic: 19 } })).includes("coordination-simultaneite"), "coordination : un pic à la limite (20) fonde la piste, un pic de 19 ne la fonde pas");
    const rTenus = revueDe(racineNeuve(), { releve: { nomme: true, opus: true } }), rSans = revueDe(racineNeuve(), { releve: { sansNomme: true } });
    attend(toutes.includes("type-sous-utilise") && toutes.includes("opus-sans-effort") && !cles(rTenus).includes("type-sous-utilise") && !cles(rTenus).includes("opus-sans-effort"), "critères du relevé : non tenus, ils fondent leur piste ; tenus, aucune");
    attend(!cles(rSans).includes("type-sous-utilise") && rSans.non_jugees.some((x) => x.regle === "type-sous-utilise"), "un critère absent du relevé est dit non jugé, jamais lu comme tenu ni comme non tenu");
    attend(r0.signaux_hors_q3.length === 1 && r0.signaux_hors_q3[0].valeur === 523 && !toutes.some((c) => /generation/.test(c)), "le critère hors du tableau Q3 (génération servie) est rendu avec sa valeur, jamais dérivé");
    // 9. Le plafond et le rang : 7 pistes, 5 à verser dans l'ordre des règles puis du poids, 2 consignées.
    attend(cles(r0, "a_verser").join(",") === "echec-recurrent:campagne,consigne-derive:verificateur,coordination-simultaneite,type-sous-utilise,opus-sans-effort" && cles(r0, "a_consigner").join(",") === "duree-longue:campagne,duree-longue:explorateur",
      `plafond de 5 et rang : ${JSON.stringify(r0.pistes.map((p) => [p.rang, p.cle, p.statut]))}`);
    // 10. Les créations : les champs de R4 d'oracle-todo, la nature, la clé ; ni `ts`, ni classe, ni octet de contrôle, ni ligne de tableau.
    const evs = JSON.parse(readFileSync(r0.fichiers.evenements, "utf8"));
    const formeOk = (e) => e.ev === "creation" && /^TF-\d{4}$/.test(e.id) && e.ts === undefined && e.statut === "candidat" && e.nature === "opportunite" && e.classe === undefined
      && ["titre", "contenu", "demandeur", "source", "date_demande"].every((k) => typeof e[k] === "string" && e[k].trim()) && Array.isArray(e.forges_cibles_initiales) && e.forges_cibles_initiales.length
      && ["gain", "preuve", "effort", "valeur"].every((k) => typeof e.score?.[k] === "number") && e.score.valeur === valeurDuScore(e.score) && typeof e.piste_agents?.cle === "string"
      && !textes(e).some((t) => /[\u0000-\u0009\u000b-\u001f]/.test(t) || t.split("\n").some((l) => l.trim().startsWith("|")));
    attend(evs.length === 5 && evs.every(formeOk), `créations : 5 attendues, aux champs de R4, ${JSON.stringify(evs[0])}`);
    attend(evs.every((e) => e.contenu.includes("Signal mesuré : ") && Object.values(Q3).some((q) => e.contenu.includes(q.objet))), "une création ne porte pas son signal mesuré ou l'objet Q3 qu'elle modifierait");
    // 11. Les identifiants : à la suite du plus grand des actifs ET de l'archive, consécutifs.
    const rIds = revueDe(racineNeuve([item("TF-0040", null)], [item("TF-0042", null, "archive")]));
    attend(rIds.pistes.filter((p) => p.statut === "a_verser").map((p) => p.id).join(",") === "TF-0043,TF-0044,TF-0045,TF-0046,TF-0047", `identifiants à la suite de TF-0042 (archive) attendus, ${rIds.pistes.map((p) => p.id)}`);
    // 12. Le registre retient la piste d'un item ouvert ou écarté (ni versée ni comptée), pas celle d'un item corrigé.
    const rReg = revueDe(racineNeuve([item("TF-0101", "echec-recurrent:campagne"), item("TF-0102", "opus-sans-effort", "ecarte"), item("TF-0103", "type-sous-utilise"), { ev: "maj", id: "TF-0103", ts: "2026-11-14T10:00:00.000Z", statut: "corrige" }]));
    const sort = Object.fromEntries(rReg.pistes.map((p) => [p.cle, p.statut]));
    attend(sort["echec-recurrent:campagne"] === "deja_au_registre" && sort["opus-sans-effort"] === "deja_au_registre" && sort["type-sous-utilise"] === "a_verser" && rReg.bilan.a_verser === 5 && rReg.bilan.a_consigner === 0,
      `registre : candidat et écarté retiennent, corrigé non, et les retenues ne comptent pas au plafond, ${JSON.stringify(sort)}`);
    // 13. Une piste consignée par la revue précédente DU POSTE passe en tête ; celle d'un autre poste non.
    const rAtt = racineNeuve();
    ecrire(fichierPistes(rAtt), jsonl([{ type: "revue", revue: "2026-11-14T08:00:00.000Z", poste: "poste-banc", pistes: [{ cle: "duree-longue:explorateur", statut: "consignee" }] }, { type: "revue", revue: "2026-11-14T09:00:00.000Z", poste: "autre-poste", pistes: [{ cle: "duree-longue:campagne", statut: "consignee" }] }]));
    const rA = revueDe(rAtt);
    attend(rA.pistes[0].cle === "duree-longue:explorateur" && rA.pistes[0].en_attente && rA.pistes[0].statut === "a_verser" && cles(rA, "a_consigner").join(",") === "opus-sans-effort,duree-longue:campagne",
      `en attente : la consignée du poste en tête, celle d'un autre poste à son rang, ${JSON.stringify(rA.pistes.map((p) => [p.rang, p.cle, p.statut]))}`);
    // 14. Refus : relevé sans fiches (avant la 1.3.0), sortie dans le pilot, types absents.
    const rRef = racineNeuve(), travail = join(tmp, "travail-refus");
    refuse(() => pistes(rRef, { depuis: "2026-11-10", sortie: travail, types: TYPES, jouer: () => ({ outil: "relever-flotte", version: "1.2.0", indicateurs: {} }) }), "un relevé sans fiches d'exécution", /1\.3\.0/);
    attend(!existsSync(travail), "un relevé refusé laisse quand même un fichier dans le dossier de travail");
    refuse(() => pistes(rRef, { depuis: "2026-11-10", sortie: join(rRef, "todo", "travail"), types: TYPES, jouer: () => releveBanc() }), "une sortie dans le pilot", /dossier du pilot/);
    refuse(() => pistes(rRef, { depuis: "2026-11-10", sortie: travail, types: new Set(), jouer: () => releveBanc() }), "une revue sans types publiables", /types publiables/);
    // 15. Le versement par le VRAI journaliser.mjs du pilot, sur un registre jetable : essai d'abord, puis écriture et oracle-todo PASS.
    const rInt = racineNeuve([item("TF-8999", null)]);
    const rI = revueDe(rInt);
    const registre = join(rInt, "todo", "TODO.jsonl");
    let reel = null; try { reel = pilot(args); } catch { reel = null; }
    const jour = reel ? join(reel, "todo", "journaliser.mjs") : null;
    if (jour && existsSync(jour)) {
      const joue = (fichierEv, reg, essai) => { const p = spawnSync(process.execPath, [jour, "--fichier", fichierEv, "--registre", reg, ...(essai ? ["--essai"] : [])], { encoding: "utf8", timeout: 120000 }); let o = null; try { o = JSON.parse(p.stdout); } catch { /* illisible : dit par le cas */ } return { code: p.status, o }; };
      const taille = statSync(registre).size;
      const essai = joue(rI.fichiers.evenements, registre, true);
      attend(essai.code === 0 && /essai/.test(essai.o?.message || "") && essai.o?.ecrits?.length === 5 && statSync(registre).size === taille, `journaliser --essai : exit 0, 5 lignes montrées, rien d'écrit attendus, ${JSON.stringify(essai).slice(0, 300)}`);
      const ecrit = joue(rI.fichiers.evenements, registre, false);
      attend(ecrit.code === 0 && ecrit.o?.verdict_avant === "PASS" && ecrit.o?.verdict_apres === "PASS" && lignesJson(registre).length === 6, `journaliser : exit 0 et oracle-todo PASS avant et après l'écriture attendus, ${JSON.stringify(ecrit).slice(0, 400)}`);
      // Témoin rouge : la même création sans sa nature est refusée par la porte des classes, dès l'essai, et rien ne s'écrit.
      const sansNature = join(tmp, "sans-nature.json"), reg2 = racineNeuve([item("TF-8999", null)]);
      const [premiere] = JSON.parse(readFileSync(rI.fichiers.evenements, "utf8"));
      const { nature, ...nue } = premiere;
      ecrire(sansNature, JSON.stringify([nue]));
      const refusee = joue(sansNature, join(reg2, "todo", "TODO.jsonl"), true);
      attend(nature === "opportunite" && refusee.code === 1 && /SANS classe/.test(refusee.o?.message || "") && lignesJson(join(reg2, "todo", "TODO.jsonl")).length === 1, `témoin : une création sans nature doit être refusée par journaliser, ${JSON.stringify(refusee).slice(0, 300)}`);
      integration = "jouée (journaliser.mjs et oracle-todo.mjs du pilot, sur un registre jetable)";
    } else {
      // Sans pilot, l'écriture de journaliser.mjs est simulée (un `ts` stampé par création) : la consignation se juge quand même.
      appendFileSync(registre, jsonl(JSON.parse(readFileSync(rI.fichiers.evenements, "utf8")).map((e) => ({ ...e, ts: new Date().toISOString() }))));
      integration = "SKIP : pilot introuvable (FORGE_ROOT ou --pilot), journaliser.mjs n'est pas joué ; écriture simulée pour la consignation";
    }
    // 16. La consignation : 5 versées (identifiant au registre avec sa clé), 2 consignées ; une seconde fois, refusée.
    const c1 = consigner(rInt, { revue: rI.fichiers.revue });
    attend(c1.bilan.versees === 5 && c1.bilan.consignees === 2 && c1.bilan.non_versees === 0 && c1.pistes.filter((p) => p.statut === "versee").every((p) => /^TF-9\d{3}$/.test(p.id)), `consignation : 5 versées, 2 consignées attendues, ${JSON.stringify(c1.bilan)}`);
    refuse(() => consigner(rInt, { revue: rI.fichiers.revue }), "une revue consignée deux fois", /déjà consignée/);
    const journalBrut = readFileSync(fichierPistes(rInt), "utf8"), [ligneJ] = lireJournal(rInt);
    attend(!journalBrut.includes(NOM_PRIVE) && !journalBrut.includes(basename(tmp)) && ligneJ.fichiers === undefined && ligneJ.commandes === undefined, "le journal porte un nom de type privé, un chemin du poste ou les commandes de la session");
    // 17. La revue suivante : les 5 versées sont au registre (retenues), les 2 consignées passent en tête et se versent.
    const rSuite = revueDe(rInt);
    attend(rSuite.bilan.deja_au_registre === 5 && cles(rSuite, "a_verser").join(",") === "duree-longue:campagne,duree-longue:explorateur" && rSuite.pistes.slice(0, 2).every((p) => p.en_attente),
      `revue suivante : 5 déjà au registre, les 2 consignées en tête et à verser, ${JSON.stringify(rSuite.pistes.map((p) => [p.rang, p.cle, p.statut]))}`);
    // 18. Une piste à verser que journaliser n'a pas écrite, ou dont l'identifiant porte un autre item, se consigne « non versée ».
    const rNv = racineNeuve();
    const rN = revueDe(rNv);
    appendFileSync(join(rNv, "todo", "TODO.jsonl"), jsonl([item(rN.pistes[0].id, null)]));
    const cN = consigner(rNv, { revue: rN.fichiers.revue });
    attend(cN.bilan.versees === 0 && cN.bilan.non_versees === 5 && /autre item/.test(cN.pistes[0].motif) && /absent du registre/.test(cN.pistes[1].motif), `non versées : 5 attendues, avec leur motif, ${JSON.stringify(cN.pistes.slice(0, 2))}`);
    // 19. L'état : la dernière revue du poste, ses pistes en attente (consignées et non versées), le bilan.
    const eN = etat(rNv, "poste-banc");
    attend(eN.derniere_revue?.revue === rN.revue && eN.en_attente.length === 7 && eN.bilan.revues === 1 && eN.bilan.non_versees === 5 && etat(rNv, "autre-poste").derniere_revue === null, `état : 7 en attente (5 non versées, 2 consignées) attendues, ${JSON.stringify(eN).slice(0, 300)}`);
  } catch (e) { casse.push(`exception hors scénario : ${e.stack || e.message}`); } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(JSON.stringify({ outil: "agents", self_test: casse.length ? "FAIL" : "PASS", cas, integration, casse }));
  process.exit(casse.length ? 1 : 0);
}

const lance = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
const args = process.argv.slice(2);
if (!lance) { /* importé : les fonctions exportées seules */ }
else if (args.includes("--self-test")) await selfTest(args);
else {
  const sortie = (o) => console.log(JSON.stringify({ outil: "agents", ...o }, null, 1));
  if (!["pistes", "consigner", "etat"].includes(args[0])) {
    sortie({ erreur: "usage : pistes --depuis <iso> --sortie <dossier> [--releve <relevé.json>] | consigner --revue <revue-agents.json> | etat | --self-test" });
    process.exit(2);
  }
  try {
    const racine = pilot(args);
    if (args[0] === "pistes") {
      const r = pistes(racine, { depuis: valeur(args, "--depuis"), sortie: valeur(args, "--sortie"), releve: valeur(args, "--releve"), types: await typesConnus(racine) });
      const { outil, ...reste } = r;
      sortie(reste);
    } else if (args[0] === "consigner") sortie({ ecrit: consigner(racine, { revue: valeur(args, "--revue") }) });
    else sortie(etat(racine));
  } catch (e) { sortie({ refus: e.message }); process.exit(1); }
}
