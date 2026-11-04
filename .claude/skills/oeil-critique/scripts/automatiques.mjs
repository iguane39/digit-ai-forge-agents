#!/usr/bin/env node
/**
 * automatiques.mjs — le journal des modifications automatiques de la liste : empreinte du fichier
 * visé à la liste, refus si le fichier a changé à l'exécution, effet attendu relu à l'exécution suivante.
 *
 * Pourquoi il existe. L'analyse du skill peut durer jusqu'à un million de jetons et les automatiques
 * s'exécutent « ensuite », après la liste : rien ne vérifiait que le fichier visé était resté le même
 * entre les deux, ni ne désignait, après coup, l'automatique qui n'avait rien donné (les indicateurs
 * globaux sont trop grossiers). Deux idées reprises de `/refine` de Prime Agent (licence MIT,
 * `planner.rs` : refus d'une entrée « changed during refinement planning », champ d'effet attendu relu
 * au passage suivant), sans copie de code : note `output/03-etudes/Digit-AI - Note - Refine de Prime
 * Agent compare a oeil-critique - 20261102r.md` du pilot, TF-2070. Le journal est à ajout seul, au
 * pilot, `todo/oeil-critique-automatiques.jsonl`, comme celui des recommandations scellées.
 *
 * Usage (sortie JSON, exit 0 / 1 refus / 2 usage) :
 *   node automatiques.mjs lister --id A1 --fichier <chemin> --quoi "<ce qui sera fait>" --effet "<effet attendu>" [--pilot <chemin>]
 *       → note l'empreinte du fichier (ou « absent » s'il n'existe pas encore). Refuse un effet attendu vide,
 *         un identifiant déjà listé (sauf s'il a été refusé : l'automatique est alors REPOSÉE, empreinte renouvelée).
 *   node automatiques.mjs verifier --id A1
 *       → à jouer juste avant d'écrire : refuse (exit 1) si le fichier a changé depuis la liste, et consigne le refus.
 *   node automatiques.mjs fait --id A1 --commit <sha> [--preuve "<sortie de l'oracle>"]
 *       → refuse si la dernière vérification de l'identifiant n'est pas un succès : pas d'écriture sans vérification.
 *   node automatiques.mjs juger --id A1 --effet-constate obtenu|manquant --constat "<ce qui le montre>"
 *       → à l'exécution suivante : un effet manquant range l'automatique en candidat à retirer.
 *   node automatiques.mjs etat
 *       → { en_attente (non faites, refusées comprises : elles remontent en tête de la liste suivante),
 *           a_juger, candidats_a_retirer, bilan }.
 *   node automatiques.mjs --self-test
 */
import { existsSync, readFileSync, appendFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { pilot, poste, valeur } from "./lib.mjs";

export const fichierAutomatiques = (racine) => join(racine, "todo", "oeil-critique-automatiques.jsonl");

/** Fins de ligne normalisées LF pour un texte, octets bruts pour un binaire (convention de références/EMPREINTES.md du pilot). */
export function empreinte(chemin) {
  if (!existsSync(chemin)) return "absent";
  if (statSync(chemin).isDirectory()) throw new Error(`${chemin} est un dossier : une automatique vise un fichier`);
  let o = readFileSync(chemin);
  if (!o.subarray(0, 8000).includes(0)) o = Buffer.from(o.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  return "sha256:" + createHash("sha256").update(o).digest("hex");
}

const identifiant = (id) => {
  const s = String(id || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(s)) throw new Error(`--id attend un identifiant court (lettres, chiffres, . _ -), reçu « ${id} »`);
  return s;
};
const requis = (v, nom) => { if (!v || !String(v).trim()) throw new Error(`${nom} requis`); return String(v).trim(); };

/** Le chemin visé, absolu : relatif, il se lit depuis le pilot. */
const absolu = (racine, f) => resolve(isAbsolute(f) ? f : join(racine, f));
/** Le chemin consigné : relatif au pilot quand il y est, absolu sinon (une forge sœur), toujours avec « / ». */
const consigne = (racine, f) => { const a = absolu(racine, f), r = relative(racine, a); return (r.startsWith("..") || isAbsolute(r) ? a : r).split(sep).join("/"); };

export function lireJournal(racine) {
  const f = fichierAutomatiques(racine);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}
const ajouter = (racine, e) => { const ligne = { ...e, poste: poste(), ts: new Date().toISOString() }; appendFileSync(fichierAutomatiques(racine), JSON.stringify(ligne) + "\n"); return ligne; };

/** L'état d'une automatique : les événements de son identifiant, du dernier « liste » à aujourd'hui. */
function etatDe(journal, id) {
  const ev = journal.filter((e) => e.id === id);
  const iListe = ev.map((e) => e.type).lastIndexOf("liste");
  if (iListe < 0) return null;
  const courant = ev.slice(iListe);
  const dernier = courant[courant.length - 1];
  const liste = courant[0];
  return { liste, courant, dernier, repose: ev.filter((e) => e.type === "liste").length - 1,
    fait: courant.find((e) => e.type === "fait") || null, jugement: courant.find((e) => e.type === "jugement") || null };
}

export function lister(racine, { id, fichier, quoi, effet }) {
  const i = identifiant(id);
  const f = requis(fichier, "--fichier");
  const q = requis(quoi, "--quoi");
  const e = requis(effet, "--effet");
  const avant = etatDe(lireJournal(racine), i);
  if (avant && avant.dernier.type !== "refus") throw new Error(`${i} est déjà listée (${avant.dernier.type}) : seule une automatique refusée se repose`);
  return ajouter(racine, { type: "liste", id: i, fichier: consigne(racine, f), empreinte: empreinte(absolu(racine, f)), quoi: q, effet_attendu: e, repose: avant ? avant.repose + 1 : 0 });
}

export function verifier(racine, { id }) {
  const i = identifiant(id);
  const s = etatDe(lireJournal(racine), i);
  if (!s) throw new Error(`${i} n'a pas été listée : rien à vérifier`);
  if (s.fait) throw new Error(`${i} est déjà faite`);
  if (s.dernier.type === "refus") throw new Error(`${i} a été refusée : la reposer avec « lister » avant de la vérifier`);
  const courante = empreinte(absolu(racine, s.liste.fichier));
  if (courante !== s.liste.empreinte) {
    ajouter(racine, { type: "refus", id: i, fichier: s.liste.fichier, empreinte_liste: s.liste.empreinte, empreinte_courante: courante });
    throw new Error(`${i} refusée : ${s.liste.fichier} a changé depuis la liste (${s.liste.empreinte.slice(0, 15)}… → ${courante.slice(0, 15)}…). La modification n'est pas écrite ; elle est reposée en tête de la liste suivante, avec le fichier tel qu'il est maintenant`);
  }
  return ajouter(racine, { type: "verifie", id: i, fichier: s.liste.fichier, empreinte: courante });
}

export function fait(racine, { id, commit, preuve }) {
  const i = identifiant(id);
  const s = etatDe(lireJournal(racine), i);
  if (!s) throw new Error(`${i} n'a pas été listée`);
  if (s.fait) throw new Error(`${i} est déjà faite`);
  if (s.dernier.type !== "verifie") throw new Error(`${i} n'a pas passé « verifier » juste avant l'écriture (dernier événement : ${s.dernier.type}) : pas d'écriture sans vérification de l'empreinte`);
  return ajouter(racine, { type: "fait", id: i, fichier: s.liste.fichier, commit: requis(commit, "--commit"), preuve: preuve ? String(preuve).trim() : null });
}

export function juger(racine, { id, effetConstate, constat }) {
  const i = identifiant(id);
  const s = etatDe(lireJournal(racine), i);
  if (!s) throw new Error(`${i} n'a pas été listée`);
  if (!s.fait) throw new Error(`${i} n'est pas faite : son effet ne se juge pas`);
  if (s.jugement) throw new Error(`${i} est déjà jugée`);
  if (!["obtenu", "manquant"].includes(effetConstate)) throw new Error(`--effet-constate attend obtenu ou manquant, reçu « ${effetConstate} »`);
  return ajouter(racine, { type: "jugement", id: i, effet_attendu: s.liste.effet_attendu, effet_constate: effetConstate, constat: requis(constat, "--constat : un effet sans constat ne se juge pas") });
}

export function etat(racine) {
  const journal = lireJournal(racine);
  const ids = [...new Set(journal.map((e) => e.id))];
  const tout = ids.map((id) => etatDe(journal, id)).filter(Boolean);
  const resume = (s) => ({ id: s.liste.id, fichier: s.liste.fichier, quoi: s.liste.quoi, effet_attendu: s.liste.effet_attendu });
  const en_attente = tout.filter((s) => !s.fait).map((s) => ({ ...resume(s), etat: s.dernier.type === "refus" ? "refusee_fichier_change" : "non_faite" }));
  const a_juger = tout.filter((s) => s.fait && !s.jugement).map((s) => ({ ...resume(s), commit: s.fait.commit }));
  const candidats_a_retirer = tout.filter((s) => s.jugement && s.jugement.effet_constate === "manquant").map((s) => ({ ...resume(s), constat: s.jugement.constat }));
  const refusees = journal.filter((e) => e.type === "refus").length;
  const faites = tout.filter((s) => s.fait).length;
  const jugees = tout.filter((s) => s.jugement);
  return { en_attente, a_juger, candidats_a_retirer, bilan: { listees: tout.length, faites, refus_empreinte: refusees, jugees: jugees.length,
    effets_obtenus: jugees.length - candidats_a_retirer.length, effets_manquants: candidats_a_retirer.length, part_faites: tout.length ? Math.round((faites / tout.length) * 100) / 100 : null } };
}

function selfTest() {
  const racine = mkdtempSync(join(tmpdir(), "oeil-critique-auto-"));
  mkdirSync(join(racine, "todo"));
  writeFileSync(join(racine, "todo", "TODO.jsonl"), "");
  const casse = [];
  let cas = 0;
  const refuse = (f, quoi) => { cas++; try { f(); casse.push(`accepté à tort : ${quoi}`); } catch { /* attendu */ } };
  const attend = (ok, msg) => { cas++; if (!ok) casse.push(msg); };
  const ecrire = (n, c) => writeFileSync(join(racine, n), c);
  const dernier = (id) => lireJournal(racine).filter((e) => e.id === id).pop();
  try {
    // Fixture VERTE : fichier inchangé, vérifié, fait, jugé.
    ecrire("regle.md", "ligne 1\nligne 2\n");
    lister(racine, { id: "A1", fichier: "regle.md", quoi: "retirer la ligne 2", effet: "plus aucun refus de la règle X" });
    attend(verifier(racine, { id: "A1" }).type === "verifie", "un fichier inchangé n'est pas vérifié");
    // Les mêmes lignes en CRLF ne sont pas un changement (fins de ligne normalisées avant hachage).
    ecrire("crlf.md", "a\nb\n");
    lister(racine, { id: "A2", fichier: "crlf.md", quoi: "q", effet: "e" });
    ecrire("crlf.md", "a\r\nb\r\n");
    attend(verifier(racine, { id: "A2" }).type === "verifie", "un fichier passé en CRLF est refusé comme changé");
    // Fixture ROUGE : le fichier change entre la liste et l'exécution.
    ecrire("cible.md", "avant\n");
    lister(racine, { id: "B1", fichier: "cible.md", quoi: "ajouter une ligne", effet: "le contrôle K3 repasse vert" });
    ecrire("cible.md", "avant\nmodifié par une autre session\n");
    let message = "";
    cas++;
    try { verifier(racine, { id: "B1" }); casse.push("un fichier changé depuis la liste est accepté"); } catch (e) { message = e.message; }
    attend(/a changé depuis la liste/.test(message), `le refus ne dit pas pourquoi : « ${message} »`);
    attend(dernier("B1").type === "refus", "le refus n'est pas consigné");
    refuse(() => fait(racine, { id: "B1", commit: "abc1234" }), "une automatique refusée déclarée faite");
    refuse(() => verifier(racine, { id: "B1" }), "une vérification d'une automatique refusée sans repose");
    attend(etat(racine).en_attente.some((a) => a.id === "B1" && a.etat === "refusee_fichier_change"), "l'automatique refusée ne remonte pas en attente");
    // Repose : l'empreinte est renouvelée, l'automatique se vérifie puis se fait.
    const r = lister(racine, { id: "B1", fichier: "cible.md", quoi: "ajouter une ligne", effet: "le contrôle K3 repasse vert" });
    attend(r.repose === 1, "la repose n'est pas comptée");
    verifier(racine, { id: "B1" });
    fait(racine, { id: "B1", commit: "abc1234", preuve: "oracle PASS" });
    // Garde : « fait » exige une vérification juste avant ; un fichier retouché après « verifier » ne passe pas non plus.
    lister(racine, { id: "C1", fichier: "regle.md", quoi: "q", effet: "e" });
    refuse(() => fait(racine, { id: "C1", commit: "def5678" }), "une automatique faite sans vérification");
    ecrire("regle.md", "ligne 1\nautre\n");
    refuse(() => verifier(racine, { id: "C1" }), "un fichier retouché entre la liste et la vérification");
    // Refus de forme.
    refuse(() => lister(racine, { id: "D1", fichier: "regle.md", quoi: "q", effet: "  " }), "une automatique sans effet attendu");
    refuse(() => lister(racine, { id: "A1", fichier: "regle.md", quoi: "q", effet: "e" }), "un identifiant déjà listé");
    refuse(() => lister(racine, { id: "D 1", fichier: "regle.md", quoi: "q", effet: "e" }), "un identifiant mal formé");
    refuse(() => verifier(racine, { id: "Z9" }), "la vérification d'une automatique jamais listée");
    // Un fichier qui n'existe pas encore : sa création par une autre session est un changement.
    lister(racine, { id: "E1", fichier: "neuf.md", quoi: "créer neuf.md", effet: "e" });
    ecrire("neuf.md", "créé ailleurs\n");
    refuse(() => verifier(racine, { id: "E1" }), "un fichier apparu depuis la liste");
    // Effet attendu relu à l'exécution suivante.
    refuse(() => juger(racine, { id: "A1", effetConstate: "obtenu", constat: "x" }), "un effet jugé avant que l'automatique soit faite");
    const e0 = etat(racine);
    attend(e0.a_juger.some((a) => a.id === "B1") && !e0.a_juger.some((a) => a.id === "A1"), `à juger mal calculé : ${JSON.stringify(e0.a_juger.map((a) => a.id))}`);
    fait(racine, { id: "A1", commit: "aaa1111" });
    fait(racine, { id: "A2", commit: "bbb2222" });
    refuse(() => juger(racine, { id: "B1", effetConstate: "peut-etre", constat: "x" }), "un effet constaté hors vocabulaire");
    refuse(() => juger(racine, { id: "B1", effetConstate: "manquant", constat: "" }), "un jugement sans constat");
    juger(racine, { id: "B1", effetConstate: "manquant", constat: "le contrôle K3 reste rouge" });
    juger(racine, { id: "A1", effetConstate: "obtenu", constat: "0 refus de la règle X sur la période" });
    refuse(() => juger(racine, { id: "A1", effetConstate: "manquant", constat: "autre avis" }), "un second jugement");
    const e1 = etat(racine);
    attend(e1.candidats_a_retirer.length === 1 && e1.candidats_a_retirer[0].id === "B1", `candidat à retirer mal désigné : ${JSON.stringify(e1.candidats_a_retirer)}`);
    const b = e1.bilan;
    // listées : A1 A2 B1 C1 E1 ; faites : A1 A2 B1 ; refus d'empreinte : B1, C1, E1 ; jugées : B1 A1
    attend(b.listees === 5 && b.faites === 3 && b.refus_empreinte === 3 && b.jugees === 2 && b.effets_obtenus === 1 && b.effets_manquants === 1 && b.part_faites === 0.6, `bilan faux : ${JSON.stringify(b)}`);
  } catch (e) { casse.push(`exception hors scénario : ${e.message}`); } finally { rmSync(racine, { recursive: true, force: true }); }
  console.log(JSON.stringify({ outil: "automatiques", self_test: casse.length ? "FAIL" : "PASS", cas, casse }));
  process.exit(casse.length ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();
else {
  try {
    const racine = pilot(args);
    const sortie = (o) => console.log(JSON.stringify({ outil: "automatiques", ...o }));
    if (args[0] === "lister") sortie({ ecrit: lister(racine, { id: valeur(args, "--id"), fichier: valeur(args, "--fichier"), quoi: valeur(args, "--quoi"), effet: valeur(args, "--effet") }) });
    else if (args[0] === "verifier") sortie({ ecrit: verifier(racine, { id: valeur(args, "--id") }) });
    else if (args[0] === "fait") sortie({ ecrit: fait(racine, { id: valeur(args, "--id"), commit: valeur(args, "--commit"), preuve: valeur(args, "--preuve") }) });
    else if (args[0] === "juger") sortie({ ecrit: juger(racine, { id: valeur(args, "--id"), effetConstate: valeur(args, "--effet-constate"), constat: valeur(args, "--constat") }) });
    else if (args[0] === "etat") sortie(etat(racine));
    else { sortie({ erreur: "usage : lister --id --fichier --quoi --effet | verifier --id | fait --id --commit [--preuve] | juger --id --effet-constate obtenu|manquant --constat | etat | --self-test" }); process.exit(2); }
  } catch (e) { console.log(JSON.stringify({ outil: "automatiques", refus: e.message })); process.exit(1); }
}
