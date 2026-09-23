#!/usr/bin/env node
/**
 * decouvrir-oracles.mjs — les oracles de forge-agents, LUS SUR LE DISQUE, jamais recopiés d'une
 * liste (TF-1319, 23/09/2026 : temps 2 du verdict O3 de l'étude du pilot du 19/08/2026 sur le
 * méta-oracle d'enclenchement).
 *
 * POURQUOI. Un run consigne au ledger une entrée `oracles_verdict` par oracle qui a tourné (forme
 * canonique TF-0385). Pour dire lesquels MANQUENT, le juge du pilot doit savoir ce que chaque forge
 * mobilisée porte. Cette forge porte le plus gros parc d'oracles de l'écosystème, rangé dans les
 * `scripts/` de ses skills, et son lanceur général (`quality-oracles/scripts/run-oracles.mjs`) ne
 * les découvre pas : il lance ce que son REGISTRE nomme. Mesuré le 23/09/2026 : 41 fichiers
 * `oracle-*` sous `.claude/skills/<skill>/scripts/`, dont 3 que le registre ne nomme pas
 * (`oracle-docx`, `oracle-agent-evals`, `oracle-defs`) — le lanceur ne les jouera jamais, et
 * aucun contrôle ne le disait : la recette de quality-oracles vérifie que chaque oracle du REGISTRE
 * existe sur le disque, jamais l'inverse. Le registre est une liste écrite à la main, tenue avec
 * soin ; ce n'est pas lui qui peut dire ce qui lui manque.
 *
 * LA RÈGLE, EN DEUX PARTIES, ET LA SECONDE NE PEUT QU'AJOUTER :
 *   · par le NOM — tout fichier `oracle-<nom>.mjs|.cjs|.js` ou `oracle[-_]<nom>.py` du dépôt, hors
 *     dépendances, caches, archives, `fixtures` et entrants. C'est la découverte : un oracle
 *     déposé demain est vu sans que personne l'inscrive nulle part ;
 *   · par le REGISTRE — tout script qu'une commande de `registre-oracles.json` désigne DANS ce
 *     dépôt (marqueurs `{skilldir}` et `{skillsroot}`). Le registre ne sert qu'à AJOUTER les
 *     oracles que leur nom ne déclare pas (`render_page.py`, `check_html.py`… du socle HTML) ; il
 *     ne peut rien retirer. C'est la seule forme où une déclaration écrite à la main ajoute de la
 *     précision sans pouvoir se soustraire à la découverte (étude du 19/08, option O4 « en plus »).
 * Chaque oracle dit PAR QUOI il a été trouvé (`par`), pour qu'un lecteur sache lequel des deux
 * mécanismes le tient.
 *
 * LE CONTRAT, COMMUN AU PARC (`digit-ai/decouverte-oracles@1`, CONTRAT-INTERFACE.md §3 du pilot) :
 *   node oracles/decouvrir-oracles.mjs [--racine <dossier>]
 *   stdout : { contrat, forge, racine, regle, oracles: [{ nom, chemin, par }], non_juge: [] }
 *   exit 0 : découverte faite — une liste vide est un résultat, et elle se lit comme telle ;
 *   exit 2 : racine illisible, motif dit. Jamais d'exit 1 : découvrir n'est pas juger.
 * Ce script ne lance aucun oracle, n'écrit rien, et lit le registre sans jamais le modifier.
 *
 * Recette à double sens : `oracles/self-test.mjs`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRAT = "digit-ai/decouverte-oracles@1";
export const FORGE = "digit-ai-forge-agents";
export const REGISTRE = join(".claude", "skills", "quality-oracles", "references", "registre-oracles.json");
export const REGLE = "tout fichier `oracle-<nom>.(mjs|cjs|js)` ou `oracle[-_]<nom>.py` du dépôt hors dépendances, "
  + "caches, `Old`/`old`, `fixtures` et `input`, PLUS tout script que `registre-oracles.json` désigne dans ce "
  + "dépôt (`{skilldir}`, `{skillsroot}`) — le registre ajoute, il ne retire jamais ; lu sur le disque à chaque appel";

//: Les dossiers où un fichier nommé comme un oracle n'est pas un oracle en service. `.claude` n'y
//: est PAS : c'est là que vivent les skills, donc les oracles de cette forge.
export const ECARTES = new Set([".git", "node_modules", ".venv", "venv", "__pycache__",
  ".pytest_cache", ".ruff_cache", ".mypy_cache", ".oracles", "Old", "old", "fixtures", "vendor",
  "input"]);

export const EST_UN_ORACLE = (nom) => /^oracle-[\w-]+\.(?:mjs|cjs|js)$/.test(nom) || /^oracle[-_]\w[\w-]*\.py$/.test(nom);

const PROFONDEUR_MAX = 12;

function parcourir(dossier, trouves, profondeur) {
  if (profondeur > PROFONDEUR_MAX) return;
  let entrees;
  try { entrees = readdirSync(dossier, { withFileTypes: true }); } catch { return; }
  for (const e of entrees) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) { if (!ECARTES.has(e.name)) parcourir(p, trouves, profondeur + 1); }
    else if (e.isFile() && EST_UN_ORACLE(e.name)) trouves.push(p);
  }
}

/**
 * Les scripts que le registre désigne DANS ce dépôt. Un marqueur qui pointe ailleurs (`{pilot}`, un
 * chemin absolu vers une autre forge) n'est pas une déclaration de cette forge : il est ignoré ici,
 * et c'est la découverte de l'autre dépôt qui le dira.
 */
export function scriptsDuRegistre(racine) {
  const skillsroot = join(racine, ".claude", "skills");
  const skilldir = join(skillsroot, "quality-oracles");
  const brut = readFileSync(join(racine, REGISTRE), "utf8");
  const registre = JSON.parse(brut);
  const chemins = new Set();
  for (const o of registre.oracles || []) {
    for (const morceau of Array.isArray(o.cmd) ? o.cmd : []) {
      if (typeof morceau !== "string" || !/\.(?:mjs|cjs|js|py)$/.test(morceau)) continue;
      let p = null;
      if (morceau.startsWith("{skilldir}")) p = join(skilldir, morceau.slice("{skilldir}".length));
      else if (morceau.startsWith("{skillsroot}")) p = join(skillsroot, morceau.slice("{skillsroot}".length));
      if (p && existsSync(p)) chemins.add(resolve(p));
    }
  }
  return [...chemins];
}

/** La découverte au contrat commun. `racine` = la racine du dépôt de la forge. */
export function decouvrirOracles(racine) {
  const base = { contrat: CONTRAT, forge: FORGE, racine, regle: REGLE, oracles: [] };
  let estDossier = false;
  try { estDossier = existsSync(racine) && statSync(racine).isDirectory(); } catch { estDossier = false; }
  if (!estDossier) {
    return { ...base, motif: `racine introuvable ou illisible : ${racine} — rien n'a été découvert`, non_juge: [] };
  }
  const parChemin = new Map();
  const noter = (p, par) => {
    const cle = resolve(p);
    parChemin.set(cle, [...new Set([...(parChemin.get(cle) || []), par])]);
  };
  const parNomDeFichier = [];
  parcourir(racine, parNomDeFichier, 0);
  parNomDeFichier.forEach((p) => noter(p, "nom"));
  let registreLu = true;
  let motifRegistre = "";
  try { scriptsDuRegistre(racine).forEach((p) => noter(p, "registre")); }
  catch (e) { registreLu = false; motifRegistre = e && e.message ? e.message : String(e); }

  const oracles = [...parChemin.entries()]
    .map(([p, par]) => ({ nom: basename(p, extname(p)), chemin: relative(racine, p).split("\\").join("/"), par: par.sort() }))
    .sort((a, b) => (a.chemin < b.chemin ? -1 : a.chemin > b.chemin ? 1 : 0));
  const parNom = new Map();
  for (const o of oracles) parNom.set(o.nom, [...(parNom.get(o.nom) || []), o.chemin]);
  const doublons = [...parNom.entries()].filter(([, c]) => c.length > 1);
  const horsRegistre = oracles.filter((o) => !o.par.includes("registre")).map((o) => o.nom);
  return {
    ...base,
    oracles,
    non_juge: [
      "découvrir n'est pas lancer : cette liste ne dit ni qu'un oracle a tourné, ni sur quel livrable il s'applique (granularité retenue : la forge, étude du 19/08 §5)",
      registreLu
        ? "un script que ni son nom ni le registre ne déclarent oracle n'est pas découvert"
        : `registre illisible (${REGISTRE} : ${motifRegistre}) : seule la règle de NOM a servi, les oracles que leur nom ne déclare pas manquent à cette liste`,
      ...(registreLu && horsRegistre.length
        ? [`${horsRegistre.length} oracle(s) découverts par leur nom et que le registre ne nomme pas (${horsRegistre.join(", ")}) : le lanceur général run-oracles.mjs ne les jouera jamais tant que le registre ne les indexe pas`]
        : []),
      ...doublons.map(([nom, chemins]) => `nom porté par ${chemins.length} fichiers (${chemins.join(", ")}) : un verdict qui le nomme ne dit pas lequel a tourné`),
    ],
  };
}

// ---- CLI -------------------------------------------------------------------------------------
const lanceEnDirect = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase().split("\\").join("/")
     === resolve(process.argv[1]).toLowerCase().split("\\").join("/");
if (lanceEnDirect) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--racine");
  const racine = resolve(i >= 0 && args[i + 1] ? args[i + 1] : join(dirname(fileURLToPath(import.meta.url)), ".."));
  const r = decouvrirOracles(racine);
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.motif ? 2 : 0);
}
